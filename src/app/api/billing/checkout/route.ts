// Start a Stripe Checkout session.
//
//   POST /api/billing/checkout  { plan, period, kind? }
//   -> { url }   the hosted page to send the browser to
//
// The rules live in src/lib/billing/checkout.ts and are tested there. This route
// does the three things that need the outside world: who is asking, what Stripe
// currently holds, and creating the session.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE ONE LINE THAT MUST NOT BE DROPPED
//
// `subscription_data.metadata.owner_id`. It is the only link between a Stripe
// customer and an account, and the webhook refuses any subscription without it.
// Lose it and checkout still succeeds, the customer is still charged, and
// nothing grants them access — a paying customer locked out, with the money
// taken. It is set here and asserted by the webhook rather than assumed.
//
// `org_id` rides alongside it and matters for the same reason, one step on.
// Access is granted per ORGANISATION and the subscription used to name none, so
// derive_apply_access entitled every organisation the owner held. Measured on
// Paul's account before it was fixed: one Apply subscription, whose plan allows
// one organisation, entitled all nine. Migration 076 made the subscription name
// its organisation; this is where the name comes from.

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { ACTIVE_ORG_COOKIE } from '@/lib/builder/access'
import { getAdminDb } from '@/lib/admin/admin-db'
import { getStripe } from '@/lib/billing/stripe-client'
import { decideCheckout } from '@/lib/billing/checkout'
import { isPlanId, type BillingPeriod, type PriceKind, lookupKeyFor } from '@/config/plans'

export const dynamic = 'force-dynamic'

const PERIODS: BillingPeriod[] = ['monthly', 'annual']
const KINDS:   PriceKind[]     = ['standard', 'founding']

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  let body: { plan?: unknown; period?: unknown; kind?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }

  const plan = body.plan
  const period = body.period
  const kind = body.kind ?? 'standard'

  if (!isPlanId(plan)) {
    return NextResponse.json({ error: 'Unknown plan' }, { status: 400 })
  }
  if (typeof period !== 'string' || !PERIODS.includes(period as BillingPeriod)) {
    return NextResponse.json({ error: 'period must be monthly or annual' }, { status: 400 })
  }
  if (typeof kind !== 'string' || !KINDS.includes(kind as PriceKind)) {
    return NextResponse.json({ error: 'kind must be standard or founding' }, { status: 400 })
  }

  // WHICH organisation is being paid for. One is unambiguous; several needs an
  // answer rather than a guess, and the guess is the bug this replaces.
  const { data: owned } = await supabase
    .from('organisations')
    .select('id')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })

  const ownedIds = (owned ?? []).map(o => o.id as string)
  if (ownedIds.length === 0) {
    return NextResponse.json(
      { error: 'Set up your organisation before subscribing.', code: 'no_organisation' },
      { status: 409 },
    )
  }

  let orgId: string
  if (ownedIds.length === 1) {
    orgId = ownedIds[0]
  } else {
    // Deliberately the switcher's choice, NOT the oldest. Taking the oldest is
    // the bug already found on Deadlines and on the data export, and it would
    // be worse here: it would charge for one organisation and entitle a
    // different one, with nothing on the row to show which was meant.
    const active = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value
    if (!active || !ownedIds.includes(active)) {
      return NextResponse.json(
        {
          error: 'You hold several organisations. Choose the one to subscribe for, then try again.',
          code: 'ambiguous_organisation',
        },
        { status: 409 },
      )
    }
    orgId = active
  }

  const stripe = getStripe()
  const wantedKey = lookupKeyFor(plan, kind as PriceKind, period as BillingPeriod)

  // Ask Stripe what it holds rather than trusting a stored price id. The repo
  // owns the lookup key; Stripe owns the id, and this is the one place they meet.
  const found = await stripe.prices.list({ lookup_keys: [wantedKey], active: true, limit: 1 })
  const price = found.data[0] ?? null

  const { data: existingRow } = await getAdminDb()
    .from('subscriptions')
    .select('plan, status')
    .eq('owner_id', user.id)
    .maybeSingle()

  // self_serve is correct here and MUST NOT be widened: this is the public
  // pricing page, and the date bound on the founding offer is the whole point.
  //
  // But it means the founding rate is currently UNREACHABLE for the cohort, who
  // convert in March 2027, months after the window shuts, having been promised
  // it permanently. `foundingPriceAvailable('granted', …)` is right and has a
  // test for that exact case; nothing in the app can invoke it. A conversion
  // link or an admin action needs to, gated on entitlement rather than on a
  // date. See docs/cohort-cliff-2027-03-10.md.
  const decision = decideCheckout(
    { plan, period: period as BillingPeriod, kind: kind as PriceKind, channel: 'self_serve' },
    {
      availableLookupKeys: new Set(price ? [wantedKey] : []),
      existing: existingRow as { plan: typeof plan; status: string } | null,
    },
  )

  if (!decision.ok) {
    // 409 rather than 400: the request is well formed, the state says no.
    return NextResponse.json({ error: decision.message, code: decision.code }, { status: 409 })
  }

  const origin = req.nextUrl.origin
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: price!.id, quantity: 1 }],
      customer_email: user.email ?? undefined,
      // Stripe's own idempotency for the human: returning to a half-finished
      // checkout resumes rather than starting a second one.
      client_reference_id: user.id,
      subscription_data: {
        // See the note at the top. Everything downstream depends on both.
        metadata: { owner_id: user.id, org_id: orgId },
        ...(decision.trialDays
          ? {
              trial_period_days: decision.trialDays,
              // No card for the trial, and when it ends without one the
              // subscription CANCELS rather than pausing. Paul's decision:
              // access ends, there is no read-only tier, and the data stays.
              trial_settings: { end_behavior: { missing_payment_method: 'cancel' as const } },
            }
          : {}),
      },
      // With a trial this makes the card optional; without one Stripe collects
      // it as normal, so the same setting is correct for both.
      payment_method_collection: decision.trialDays ? 'if_required' : 'always',
      success_url: `${origin}/dashboard?checkout=done`,
      cancel_url: `${origin}/dashboard?checkout=cancelled`,
    })

    if (!session.url) {
      return NextResponse.json({ error: 'Stripe returned no checkout URL' }, { status: 502 })
    }
    return NextResponse.json({ url: session.url })
  } catch (e) {
    console.error('[billing-checkout] session create failed:', e)
    return NextResponse.json({ error: 'Could not start checkout' }, { status: 502 })
  }
}

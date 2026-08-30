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

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
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
        // See the note at the top. Everything downstream depends on this.
        metadata: { owner_id: user.id },
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

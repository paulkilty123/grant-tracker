// Stripe's webhook. The hinge of the money path: this is the only thing that
// turns a payment into access.
//
//   POST /api/stripe/webhook
//
// Register this URL in Stripe and put the signing secret in
// STRIPE_WEBHOOK_SECRET. For the sandbox rehearsal, `stripe listen --forward-to
// localhost:3000/api/stripe/webhook` issues its own secret and needs no
// registration.
//
// ─────────────────────────────────────────────────────────────────────────────
// IT RE-FETCHES THE SUBSCRIPTION RATHER THAN TRUSTING THE EVENT
//
// Stripe does not guarantee event order. A cancellation can arrive before the
// creation it supersedes, and applying payloads as they land leaves the row
// saying "active" for a subscription that has ended — with entitlement to
// match, because the database trigger believes the row.
//
// So every event is treated as a NUDGE, not as data: it tells us which
// subscription changed, and we ask Stripe what that subscription is now. Every
// event then converges on the same answer whatever order they arrive in, a
// replay is a no-op, and a missed event is repaired by the next one.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT EACH STATUS CODE MEANS TO STRIPE, WHICH IS WHY THEY ARE CHOSEN CAREFULLY
//
// Stripe retries a non-2xx for days and disables an endpoint that keeps
// failing. So the code has to distinguish "try again" from "trying again will
// never help":
//
//   400  the signature did not verify. Not us, and not retryable.
//   200  understood, and either done or permanently un-actionable. An
//        unrecognised price and a missing owner_id are both permanent: no
//        number of retries will make them mappable, and a human has to look.
//   500  a transient failure on our side — the database was unreachable. Stripe
//        SHOULD retry this one, and it will.
//
// The cost of getting this backwards is an endpoint Stripe switches off, which
// is silent and stops every future subscription from granting access.

import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/billing/stripe-client'
import { getAdminDb } from '@/lib/admin/admin-db'
import { mapSubscription, type StripeSubscriptionLike } from '@/lib/billing/webhook-map'
import { recordBillingIncident } from '@/lib/billing/incidents'

export const dynamic = 'force-dynamic'

/**
 * Subscription lifecycle only.
 *
 * `checkout.session.completed` is deliberately absent: a completed checkout
 * always produces `customer.subscription.created`, so handling both would write
 * the same row twice from two sources and give two places to keep in step.
 * Payment failures arrive as `customer.subscription.updated` with the status
 * already moved to past_due, so they need no separate case either.
 */
const HANDLED = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
])

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set; refusing to trust anything')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  // Raw body, unparsed. Verification is over the exact bytes Stripe signed, so
  // anything that re-serialises JSON first breaks it in a way that looks like a
  // wrong secret.
  const raw = await req.text()

  const stripe = getStripe()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret)
  } catch (e) {
    console.error('[stripe-webhook] signature verification failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Bad signature' }, { status: 400 })
  }

  if (!HANDLED.has(event.type)) {
    return NextResponse.json({ ok: true, ignored: event.type })
  }

  const subscriptionId = (event.data.object as { id?: string }).id
  if (!subscriptionId) {
    console.error(`[stripe-webhook] ${event.type} carried no subscription id`)
    await recordBillingIncident({
      kind: 'no_subscription_id',
      detail: `${event.type} (${event.id}) carried no subscription id`,
    })
    return NextResponse.json({ ok: true, refused: 'no_subscription_id' })
  }

  let fresh: Stripe.Subscription
  try {
    fresh = await stripe.subscriptions.retrieve(subscriptionId)
  } catch (e) {
    // Could be transient. Let Stripe retry rather than losing the change.
    console.error(`[stripe-webhook] could not retrieve ${subscriptionId}:`, e)
    return NextResponse.json({ error: 'Retrieve failed' }, { status: 500 })
  }

  const mapped = mapSubscription(fresh as unknown as StripeSubscriptionLike)
  if (!mapped.ok) {
    // Permanent: an unrecognised price or a missing owner_id will not become
    // mappable on a retry. 200 to Stripe so the endpoint survives, and an
    // incident row so it is not merely a log line nobody reads — this is the
    // case that otherwise looks identical to success right up until a customer
    // emails to say they have paid and cannot get in.
    console.error(`[stripe-webhook] REFUSED ${mapped.reason}: ${mapped.detail}`)
    await recordBillingIncident({
      kind: mapped.reason,
      detail: mapped.detail,
      stripe_subscription_id: fresh.id,
      stripe_customer_id: typeof fresh.customer === 'string' ? fresh.customer : null,
    })
    return NextResponse.json({ ok: true, refused: mapped.reason, detail: mapped.detail })
  }

  // Keyed on owner_id: one row per paying account, updated in place across
  // upgrade, cancel and resubscribe. Entitlement follows automatically —
  // trg_subscription_syncs_entitlement re-derives organisations.apply_access,
  // so nothing here writes an entitlement itself.
  const { error } = await getAdminDb()
    .from('subscriptions')
    .upsert(mapped.row, { onConflict: 'owner_id' })

  if (error) {
    // 22P02 is an invalid enum value — Stripe has sent a status our type does
    // not know. Retrying cannot fix that, and a permanently failing endpoint
    // gets switched off, which would silently stop every future subscription
    // from granting access. Anything else is treated as transient.
    const permanent = error.code === '22P02'
    console.error(`[stripe-webhook] write failed (${error.code}) for ${mapped.row.owner_id}:`, error.message)
    if (permanent) {
      await recordBillingIncident({
        kind: 'unwritable',
        detail: `${error.code}: ${error.message}`,
        stripe_subscription_id: mapped.row.stripe_subscription_id,
        stripe_customer_id: mapped.row.stripe_customer_id,
        owner_id: mapped.row.owner_id,
      })
    }
    return permanent
      ? NextResponse.json({ ok: true, refused: 'unwritable', detail: error.message })
      : NextResponse.json({ error: 'Write failed' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    owner_id: mapped.row.owner_id,
    plan: mapped.row.plan,
    status: mapped.row.status,
  })
}

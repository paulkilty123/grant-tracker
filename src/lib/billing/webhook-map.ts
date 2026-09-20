// Turning a Stripe subscription into the row we store.
//
// Split from the route so the mapping is testable without a signature, a
// network or a database — and because this is where an error grants somebody
// the wrong thing, which is the expensive kind.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE ROUTE MUST RE-FETCH, NOT TRUST THE PAYLOAD
//
// Stripe does not guarantee event ORDER. A `customer.subscription.updated` for
// a cancellation can arrive before the `created` it supersedes, and applying
// them in the order they arrive leaves the row saying "active" for a
// subscription that has ended — with entitlement to match, because the trigger
// believes what the row says.
//
// So the route retrieves the subscription fresh from Stripe on every event and
// maps THAT, rather than mapping `event.data.object`. Every event then converges
// on the same answer regardless of arrival order, and a replayed event is a
// no-op rather than a regression. This module takes the subscription, never the
// event, so that discipline is structural rather than remembered.
//
// ─────────────────────────────────────────────────────────────────────────────
// AN UNRECOGNISED PRICE IS NEVER GUESSED
//
// The plan comes from the price's `lookup_key`, which this repo owns. If a
// subscription arrives on a price we do not recognise — created by hand in the
// dashboard, or left over from an experiment — the answer is to refuse and say
// so, not to fall back to a default. A guess here grants a paid tier for
// something nobody bought, and it would look exactly like a working system.

import { planForLookupKey, type PlanId, type BillingPeriod, type PriceKind } from '@/config/plans'

/**
 * The shape this needs from a Stripe subscription. Kept narrow deliberately.
 *
 * `current_period_end` appears in BOTH places on purpose. In the API version
 * this SDK targets (v2349, stripe 22.5.0) it lives on the subscription ITEM —
 * `SubscriptionItems.d.ts` declares it and `Subscriptions.d.ts` does not, except
 * in doc comments. Older API versions had it on the subscription.
 *
 * Reading only the top level, which is what every tutorial still shows, yields
 * `undefined` here and stores null for every renewal date. Nothing would fail:
 * the webhook succeeds, entitlement is granted, and the billing screen quietly
 * says "renews —" for every customer. Both are optional and the item wins.
 */
export interface StripeSubscriptionLike {
  id: string
  status: string
  customer: string
  cancel_at_period_end: boolean
  /** Legacy position, kept as a fallback for older API versions. */
  current_period_end?: number | null
  trial_end: number | null
  metadata?: Record<string, string> | null
  items: {
    data: Array<{
      /** Current position, API v2349 and later. */
      current_period_end?: number | null
      price: { id: string; lookup_key?: string | null }
    }>
  }
}

export interface SubscriptionRow {
  owner_id: string
  /**
   * Which organisation this pays for. Null when checkout did not say, which is
   * every subscription created before migration 076. Null is SAFE rather than
   * permissive: the SQL rule entitles the owner's only organisation if they
   * have exactly one, and entitles nothing if they have several, so an unnamed
   * subscription for a multi-org owner surfaces as a reconciliation alarm
   * instead of granting access to all of them.
   */
  org_id: string | null
  plan: PlanId
  status: string
  stripe_customer_id: string
  stripe_subscription_id: string
  stripe_price_id: string
  current_period_end: string | null
  cancel_at_period_end: boolean
  trial_end: string | null
}

export type MapResult =
  | { ok: true; row: SubscriptionRow; period: BillingPeriod; kind: PriceKind }
  | { ok: false; reason: MapRefusal; detail: string }

export type MapRefusal =
  | 'no_owner_metadata'
  | 'no_items'
  | 'no_lookup_key'
  | 'unknown_price'
  | 'multiple_items'

const secondsToIso = (s: number | null): string | null =>
  s === null || s === undefined ? null : new Date(s * 1000).toISOString()

export function mapSubscription(sub: StripeSubscriptionLike): MapResult {
  // Set at checkout. Without it there is no way to know whose subscription this
  // is, and the only safe response is to refuse: writing it against a guessed
  // owner grants a stranger's organisation the paid tier.
  const ownerId = sub.metadata?.owner_id?.trim()
  if (!ownerId) {
    return { ok: false, reason: 'no_owner_metadata', detail: `subscription ${sub.id} carries no owner_id metadata` }
  }

  const items = sub.items?.data ?? []
  if (items.length === 0) {
    return { ok: false, reason: 'no_items', detail: `subscription ${sub.id} has no line items` }
  }
  // We only ever create single-item subscriptions. More than one means somebody
  // built it by hand, and picking the first would silently choose a plan.
  if (items.length > 1) {
    return { ok: false, reason: 'multiple_items', detail: `subscription ${sub.id} has ${items.length} items; expected one` }
  }

  const item  = items[0]
  const price = item.price
  const lookupKey = price.lookup_key?.trim()
  if (!lookupKey) {
    return { ok: false, reason: 'no_lookup_key', detail: `price ${price.id} has no lookup_key` }
  }

  const resolved = planForLookupKey(lookupKey)
  if (!resolved) {
    return { ok: false, reason: 'unknown_price', detail: `lookup_key ${lookupKey} matches no plan in this repo` }
  }

  return {
    ok: true,
    period: resolved.period,
    kind: resolved.kind,
    row: {
      owner_id: ownerId,
      org_id: sub.metadata?.org_id?.trim() || null,
      plan: resolved.plan,
      // Stored verbatim. The database enum mirrors Stripe's vocabulary, so an
      // unfamiliar status fails loudly on write rather than being mapped onto
      // a neighbour that happens to be entitling.
      status: sub.status,
      stripe_customer_id: sub.customer,
      stripe_subscription_id: sub.id,
      stripe_price_id: price.id,
      // Item first: that is where the current API puts it.
      current_period_end: secondsToIso(item.current_period_end ?? sub.current_period_end ?? null),
      cancel_at_period_end: !!sub.cancel_at_period_end,
      trial_end: secondsToIso(sub.trial_end),
    },
  }
}

// Whether a checkout may be started, and on what terms.
//
// Separated from the Stripe call so every rule here is testable without a
// network, and so the route reads as "decide, then act" rather than as a
// sequence of early returns around an API client.
//
// The refusals are deliberately specific. "Cannot start checkout" is useless in
// a support conversation; "Team is not available to buy directly" is something
// a person can act on, and the difference costs nothing to carry.

import {
  PLANS, type PlanId, type BillingPeriod, type PriceKind,
  lookupKeyFor, amountFor,
} from '@/config/plans'
import { foundingPriceAvailable, type PurchaseChannel } from './founding'

export interface CheckoutRequest {
  plan: PlanId
  period: BillingPeriod
  kind: PriceKind
  channel: PurchaseChannel
}

export interface ExistingSubscription {
  plan: PlanId
  /** Stripe's status, verbatim. */
  status: string
}

export type CheckoutDecision =
  | { ok: true; lookupKey: string; amount: number; trialDays: number | null }
  | { ok: false; code: CheckoutRefusal; message: string }

export type CheckoutRefusal =
  | 'plan_not_self_serve'
  | 'price_not_in_stripe'
  | 'founding_offer_closed'
  | 'already_subscribed'

/**
 * A subscription in one of these states is a live commercial relationship, and
 * starting a second checkout would create a second one alongside it. Stripe
 * will happily do that, and the customer is then billed twice for the same
 * product with no error anywhere.
 *
 * `canceled`, `incomplete_expired` and `unpaid` are NOT here: those are people
 * who have left or never completed, and they must be able to buy again.
 */
const BLOCKING_STATUSES = new Set(['trialing', 'active', 'past_due', 'paused', 'incomplete'])

export function decideCheckout(
  req: CheckoutRequest,
  opts: {
    availableLookupKeys: ReadonlySet<string>
    existing: ExistingSubscription | null
    now?: Date
  },
): CheckoutDecision {
  const plan = PLANS[req.plan]

  // Self-serve first: Team must read as "not for sale here" rather than as a
  // missing price, which is a fault and would send someone to fix Stripe.
  if (req.channel === 'self_serve' && !plan.selfServe) {
    return {
      ok: false, code: 'plan_not_self_serve',
      message: `${plan.name} is arranged with us rather than bought directly.`,
    }
  }

  if (req.kind === 'founding') {
    const founding = foundingPriceAvailable(req.channel, opts.now)
    if (!founding.allowed) {
      return { ok: false, code: 'founding_offer_closed', message: founding.reason }
    }
  }

  if (opts.existing && BLOCKING_STATUSES.has(opts.existing.status)) {
    return {
      ok: false, code: 'already_subscribed',
      message: `This account is already on ${PLANS[opts.existing.plan].name}. Change the plan from the billing page rather than starting again.`,
    }
  }

  const lookupKey = lookupKeyFor(req.plan, req.kind, req.period)
  if (!opts.availableLookupKeys.has(lookupKey)) {
    return {
      ok: false, code: 'price_not_in_stripe',
      message: `No price is configured for ${plan.name}, ${req.period}. This is a fault on our side, not on yours.`,
    }
  }

  return {
    ok: true,
    lookupKey,
    amount: amountFor(req.plan, req.kind, req.period),
    // A trial is a property of the plan, not of the checkout, and it is only
    // ever offered on a first subscription — somebody resubscribing after
    // cancelling has already had it.
    trialDays: opts.existing ? null : plan.trialDays,
  }
}

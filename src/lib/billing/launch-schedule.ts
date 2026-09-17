// The twelve-month end to the launch price.
//
// A launch subscription is created on the launch price, and Stripe would bill
// it at that price for ever. Paul's decision (5 September 2026), and the
// promise the launch email made: the launch price is held for twelve months
// from the day somebody subscribes, then they move to the standard price.
//
// Done with a subscription schedule. After the subscription exists, a schedule
// is created FROM it (which adopts its current phase) and then given two
// phases: the launch price for LAUNCH_PRICE_MONTHS worth of billing, and the
// standard price from then on, open-ended. Stripe then makes the switch
// itself; nothing of ours has to wake up in a year's time.
//
// Pure planning here, so the phases can be tested; the Stripe calls are in
// the webhook.

import {
  LAUNCH_PRICE_MONTHS, planForLookupKey, lookupKeyFor,
  type BillingPeriod,
} from '@/config/plans'

export interface LaunchPhasePlan {
  /** Billing cycles the launch price runs for: 12 monthly, or 1 annual. */
  launchIterations: number
  /** Lookup key of the price to move to. */
  standardLookupKey: string
  period: BillingPeriod
}

/**
 * Should this subscription get a schedule, and what shape?
 *
 * Null for anything not on a launch price: a standard subscription needs no
 * schedule, and a founding one is permanent by promise.
 */
export function launchPhasePlanFor(priceLookupKey: string | null | undefined): LaunchPhasePlan | null {
  if (!priceLookupKey) return null
  const resolved = planForLookupKey(priceLookupKey)
  if (!resolved || resolved.kind !== 'launch') return null
  return {
    launchIterations: resolved.period === 'monthly' ? LAUNCH_PRICE_MONTHS : 1,
    standardLookupKey: lookupKeyFor(resolved.plan, 'standard', resolved.period),
    period: resolved.period,
  }
}

/**
 * The phases to send to Stripe, given the schedule Stripe created from the
 * subscription. The first phase keeps everything Stripe already put there
 * (start date, trial, the launch price) and gains an iteration count; the
 * second is the standard price with no end.
 */
export function schedulePhases(
  existingFirstPhase: { start_date: number; items: { price: string; quantity?: number | null }[]; trial_end?: number | null },
  plan: LaunchPhasePlan,
  standardPriceId: string,
): Array<Record<string, unknown>> {
  const first: Record<string, unknown> = {
    start_date: existingFirstPhase.start_date,
    items: existingFirstPhase.items.map(i => ({ price: i.price, quantity: i.quantity ?? 1 })),
    iterations: plan.launchIterations,
  }
  if (existingFirstPhase.trial_end) first.trial_end = existingFirstPhase.trial_end
  return [
    first,
    { items: [{ price: standardPriceId, quantity: 1 }] },
  ]
}

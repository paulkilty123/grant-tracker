// The Stripe side of the launch-price schedule. See launch-schedule.ts for
// the plan; this file only talks to Stripe.

import type Stripe from 'stripe'
import { launchPhasePlanFor, schedulePhases } from './launch-schedule'

/**
 * Give a launch-price subscription its twelve-month schedule, once.
 *
 * Returns the schedule id, or null when nothing was needed: not a launch
 * price, or a schedule already attached. Throws on a Stripe failure so the
 * caller can record it.
 */
export async function ensureLaunchSchedule(stripe: Stripe, sub: Stripe.Subscription): Promise<string | null> {
  const item = sub.items.data[0]
  const plan = launchPhasePlanFor(item?.price?.lookup_key)
  if (!plan) return null
  if (sub.schedule) return typeof sub.schedule === 'string' ? sub.schedule : sub.schedule.id

  const standard = await stripe.prices.list({ lookup_keys: [plan.standardLookupKey], active: true, limit: 1 })
  const standardPrice = standard.data[0]
  if (!standardPrice) throw new Error(`no active price for ${plan.standardLookupKey}; the launch price cannot end`)

  const created = await stripe.subscriptionSchedules.create({ from_subscription: sub.id })
  const first = created.phases[0]
  const phases = schedulePhases(
    {
      start_date: first.start_date,
      items: first.items.map(i => ({ price: typeof i.price === 'string' ? i.price : i.price.id, quantity: i.quantity })),
      trial_end: first.trial_end,
    },
    plan,
    standardPrice.id,
  )
  await stripe.subscriptionSchedules.update(created.id, {
    end_behavior: 'release',
    phases: phases as unknown as Stripe.SubscriptionScheduleUpdateParams.Phase[],
  })
  return created.id
}

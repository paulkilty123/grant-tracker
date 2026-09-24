// What the Billing card on the account page says, decided in one place.
//
// Four states, in the order they are checked:
//
//   paying   a subscription row in a live status: the plan, when it renews or
//            ends, and a button into Stripe's portal to change card or cancel.
//   cohort   account created before public signup: free to 10 March 2027, no
//            button yet because the cohort rate is not decided (Paul).
//   trial    a future granted_access_until on the organisation (migration 078).
//   ended    nothing above: the trial has run out, or there never was one.
//
// Pure, so the four states can be pinned by a fixture rather than by reading
// the page. The page only renders what this returns.

import { PLANS, isPlanId } from '@/config/plans'

export interface SubscriptionRowLike {
  plan: string
  status: string
  current_period_end: string | null
  cancel_at_period_end: boolean | null
  stripe_customer_id: string | null
}

/** Stripe statuses that mean a live commercial relationship. */
const LIVE = new Set(['active', 'trialing', 'past_due'])

export type BillingCard =
  | { state: 'paying'; planName: string; renewsOn: string | null; endsOn: string | null; pastDue: boolean; canManage: boolean }
  | { state: 'cohort' }
  | { state: 'trial'; endsOn: string }
  | { state: 'ended' }

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export function billingCard(input: {
  subscription: SubscriptionRowLike | null
  isCohort: boolean
  grantedAccessUntil: string | null | undefined
  now?: Date
}): BillingCard {
  const now = input.now ?? new Date()
  const sub = input.subscription
  if (sub && LIVE.has(sub.status) && isPlanId(sub.plan)) {
    const end = sub.current_period_end && !Number.isNaN(Date.parse(sub.current_period_end)) ? fmt(sub.current_period_end) : null
    return {
      state: 'paying',
      planName: PLANS[sub.plan].name,
      renewsOn: sub.cancel_at_period_end ? null : end,
      endsOn: sub.cancel_at_period_end ? end : null,
      pastDue: sub.status === 'past_due',
      canManage: !!sub.stripe_customer_id,
    }
  }
  if (input.isCohort) return { state: 'cohort' }
  const until = input.grantedAccessUntil ? new Date(String(input.grantedAccessUntil)) : null
  const untilOk = !!until && !Number.isNaN(until.getTime()) && until.getTime() < 8.64e15
  if (untilOk && until!.getTime() > now.getTime()) return { state: 'trial', endsOn: fmt(until!.toISOString()) }
  return { state: 'ended' }
}

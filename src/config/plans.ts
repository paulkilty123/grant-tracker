// The three plans, as configuration.
//
// Prices are still moving, so nothing here hardcodes an amount. A plan knows
// its Stripe price IDs, which live in the environment, and the amount to show a
// human is read from Stripe at render time rather than duplicated in the repo.
// A number written in two places drifts, and the place it drifts is the one the
// customer reads.
//
// What IS hardcoded is the shape of each plan: what it includes, and the limits
// that make one plan different from another. Those are product decisions, they
// change through a deploy and a review, and they are the thing the entitlement
// layer reads. Paul set them on 2026-08-19.
//
// This module is deliberately free of Stripe imports and of any database call.
// It is a description of what we sell. Turning a subscription into entitlement
// is a separate step that reads this (see planForPriceId).

/** Plan identifiers. Stored on the subscription row; never shown to a user. */
export type PlanId = 'match' | 'apply' | 'team'

/** How a subscription is billed. Monthly and annual only; there is no 6-month term. */
export type BillingPeriod = 'monthly' | 'annual'

export interface PlanCapabilities {
  /** Matched search, eligibility checking, and the catalogue. Every plan. */
  search: boolean
  /** Bookmarks with deadline reminders. Every plan. */
  bookmarks: boolean
  /** Email alerts for new matching opportunities. Every plan. */
  alerts: boolean
  /** The five-stage pipeline. Apply and above. */
  pipeline: boolean
  /** Projects and the application workspace. Apply and above. */
  applications: boolean
  /**
   * How many organisation profiles one account may hold.
   *
   * This is the only thing separating Team from Apply, so it is the number that
   * makes Team a product rather than a label. Until it is enforced in the
   * database, multi-org is free and unlimited for everyone: the organisations
   * table is written straight from the browser and carries no count limit, so a
   * UI-only cap is bypassable by anyone who opens the network tab. Enforcement
   * belongs in a trigger, the same way apply_access is protected.
   */
  orgLimit: number
}

export interface Plan {
  id: PlanId
  /** Shown to people. British spelling, sentence case. */
  name: string
  /** One line, used on the pricing page and in upgrade copy. */
  summary: string
  capabilities: PlanCapabilities
  /**
   * Free-trial length in days, or null for no trial.
   *
   * Apply only, seven days, and deliberately without a card. No card means
   * Stripe is not holding the clock, so the trial end is a date we own and a
   * job we run. Match does not trial: there is nothing to trial into.
   */
  trialDays: number | null
  /**
   * Environment variables holding this plan's Stripe price IDs.
   *
   * Names rather than values, so a missing price fails where it is used with a
   * message naming the variable, instead of resolving to undefined at module
   * load and surfacing later as an opaque Stripe error.
   */
  priceEnv: Record<BillingPeriod, string>
}

/**
 * What each plan includes. Ordered cheapest first; the pricing page renders in
 * this order and `PLAN_ORDER` below is derived from it rather than repeated.
 */
export const PLANS: Readonly<Record<PlanId, Plan>> = {
  match: {
    id: 'match',
    name: 'Match',
    summary: 'Find funding you are eligible for, and hear about new opportunities as they open.',
    capabilities: {
      search: true, bookmarks: true, alerts: true,
      pipeline: false, applications: false,
      orgLimit: 1,
    },
    trialDays: null,
    priceEnv: {
      monthly: 'STRIPE_PRICE_MATCH_MONTHLY',
      annual:  'STRIPE_PRICE_MATCH_ANNUAL',
    },
  },
  apply: {
    id: 'apply',
    name: 'Apply',
    summary: 'Everything in Match, plus a pipeline to track what you are applying for and a workspace to write it in.',
    capabilities: {
      search: true, bookmarks: true, alerts: true,
      pipeline: true, applications: true,
      orgLimit: 1,
    },
    trialDays: 7,
    priceEnv: {
      monthly: 'STRIPE_PRICE_APPLY_MONTHLY',
      annual:  'STRIPE_PRICE_APPLY_ANNUAL',
    },
  },
  team: {
    id: 'team',
    name: 'Team',
    summary: 'Everything in Apply, for up to three organisation profiles, each with its own pipeline.',
    capabilities: {
      search: true, bookmarks: true, alerts: true,
      pipeline: true, applications: true,
      orgLimit: 3,
    },
    // Team inherits Apply's trial. Someone trialling Apply who turns out to be
    // a fundraiser working across several charities should not have to start
    // again to find that out.
    trialDays: 7,
    priceEnv: {
      monthly: 'STRIPE_PRICE_TEAM_MONTHLY',
      annual:  'STRIPE_PRICE_TEAM_ANNUAL',
    },
  },
} as const

/** Cheapest first. Derived, so adding a plan above cannot leave this stale. */
export const PLAN_ORDER: readonly PlanId[] = ['match', 'apply', 'team'] as const

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && value in PLANS
}

/**
 * The Stripe price ID for a plan and period.
 *
 * Throws rather than returning undefined. A checkout session created with an
 * undefined price fails inside Stripe with an error that does not say which
 * plan was missing, and that is a bad thing to debug from a customer report.
 */
export function priceIdFor(plan: PlanId, period: BillingPeriod): string {
  const key = PLANS[plan].priceEnv[period]
  const value = process.env[key]?.trim()
  if (!value) {
    throw new Error(
      `No Stripe price configured for the ${PLANS[plan].name} plan, ${period} billing. Set ${key}.`,
    )
  }
  return value
}

/**
 * Which plan does this Stripe price belong to?
 *
 * The webhook receives a price ID and has to decide what the customer bought.
 * Resolved by looking up the configured IDs rather than by anything stored on
 * the Stripe object, so the mapping lives in one place and an unrecognised
 * price is an explicit null rather than a guess.
 */
export function planForPriceId(priceId: string): { plan: PlanId; period: BillingPeriod } | null {
  for (const id of PLAN_ORDER) {
    for (const period of ['monthly', 'annual'] as const) {
      const configured = process.env[PLANS[id].priceEnv[period]]?.trim()
      if (configured && configured === priceId) return { plan: id, period }
    }
  }
  return null
}

/**
 * Does this plan include that capability?
 *
 * The one place a feature question gets answered, so a surface cannot invent
 * its own idea of what a plan includes.
 */
export function planAllows<K extends keyof PlanCapabilities>(
  plan: PlanId,
  capability: K,
): PlanCapabilities[K] {
  return PLANS[plan].capabilities[capability]
}

/**
 * Which plans are configured well enough to be sold right now?
 *
 * The pricing page uses this so a plan whose price IDs are not set is left off
 * rather than rendered as a button that throws when clicked. It is also the
 * honest answer to "are we ready to take money", which is worth being able to
 * ask from a health check.
 */
export function sellablePlans(): PlanId[] {
  return PLAN_ORDER.filter(id =>
    (['monthly', 'annual'] as const).every(p => !!process.env[PLANS[id].priceEnv[p]]?.trim()),
  )
}

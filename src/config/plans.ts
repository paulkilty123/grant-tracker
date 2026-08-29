// The three plans, as configuration — amounts included.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE NOW HOLDS THE NUMBERS, HAVING BEEN WRITTEN NOT TO
//
// The first version of this module deliberately held no amount anywhere, and
// had a test asserting it: prices were expected to keep moving, so a plan knew
// only the environment variable holding its Stripe price ID and the amount was
// read back from Stripe at render time. That is a sound design in general and
// it is the wrong one here.
//
// Paul settled the prices on 2026-08-29 and settled the direction with them:
// products and prices are created FROM this config and the Stripe dashboard
// stays empty. He skipped Stripe's setup guide on purpose so that would be
// true. The two halves have to meet somewhere — if nothing in the repo knows
// that Match is £15, then somebody types £15 into a dashboard by hand, and the
// repo is no longer the source of truth for the one thing that takes money.
//
// So the amounts live here, `scripts/stripe-sync-catalogue.ts` pushes them to
// Stripe, and the old module's concern is answered a different way: nothing
// reads an amount back from Stripe, so there is no second copy to drift.
//
// ─────────────────────────────────────────────────────────────────────────────
// LOOKUP KEYS RATHER THAN SIX ENVIRONMENT VARIABLES
//
// The first version resolved a price through `STRIPE_PRICE_APPLY_MONTHLY` and
// friends: six variables to create, paste into three environments, and keep in
// step with whatever the dashboard happened to contain. Stripe's own answer to
// this is `lookup_key`, a stable name YOU choose that is unique per account.
// The repo owns the name, Stripe owns the ID, and the mapping needs no
// configuration at all.
//
// It also makes the webhook simpler. Deciding what somebody bought was a
// reverse scan of the configured environment variables; now the price object
// carries its own `lookup_key` and `planForLookupKey` is a pure function with
// no environment in it, which is why it can be tested honestly.
//
// This module stays free of Stripe imports and database calls. It is a
// description of what we sell.

import { TRIAL_DAYS } from '@/lib/trial'

/** Plan identifiers. Stored on the subscription row; never shown to a user. */
export type PlanId = 'match' | 'apply' | 'team'

/** How a subscription is billed. Monthly and annual only; there is no 6-month term. */
export type BillingPeriod = 'monthly' | 'annual'

/**
 * Which price somebody is on.
 *
 * `founding` is a SEPARATE PRICE and deliberately not a coupon. A coupon is a
 * percentage off the public price, so it moves whenever the public price moves;
 * these people are promised a fixed figure permanently. A separate price is
 * also what makes "permanent for those who take it" true without any further
 * machinery: they simply stay on the price they subscribed to.
 */
export type PriceKind = 'standard' | 'founding'

export const CURRENCY = 'gbp'

/**
 * When the founding offer stops being purchasable.
 *
 * End of October 2026, set by Paul on 29 August. It bounds NEW subscriptions
 * only — anybody already on a founding price keeps it for good. Nothing
 * enforces this yet; whatever builds the checkout must refuse a founding price
 * after this instant, and that is the single place it should be enforced.
 */
export const FOUNDING_OFFER_CLOSES = '2026-10-31T23:59:59Z'

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

/**
 * Amounts in PENCE, because that is the unit Stripe takes and every conversion
 * is a chance to be out by a factor of a hundred.
 *
 * Founding exists in BOTH intervals. Paul's first message gave three founding
 * figures and they were monthly; the annual ones were left unset rather than
 * inferred, because a Stripe price cannot be edited after creation and somebody
 * may hold a founding price permanently. He confirmed £120/£200/£360 on
 * 2026-08-29 — ten times monthly, the same shape as the public prices — and the
 * reasoning with them: annual is the retention lever, and the founding cohort
 * is exactly who is worth having on it.
 */
export interface PlanPrices {
  standard: Record<BillingPeriod, number>
  founding: Record<BillingPeriod, number>
}

export interface Plan {
  id: PlanId
  /** Shown to people. British spelling, sentence case. */
  name: string
  /** One line, used on the pricing page and in upgrade copy. */
  summary: string
  capabilities: PlanCapabilities
  prices: PlanPrices
  /**
   * Free-trial length in days, or null for no trial.
   *
   * Read from `src/lib/trial.ts` rather than written here. That file is the one
   * place the number lives, and this module carried a stale 7 while the app
   * carried 14 — two trial lengths in one codebase, which is a commercial
   * promise made twice and differently.
   *
   * Apply only, and no card. Match does not trial: there is nothing to trial
   * into. Team does not either, which reverses an earlier call in this file
   * that Team should inherit it — the argument was that a fundraiser working
   * across several charities should not have to start again to discover that.
   * That is a real concern and it is answered by letting an Apply trialist
   * upgrade to Team mid-trial, not by opening a second trial.
   */
  trialDays: number | null
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
    prices: {
      standard: { monthly: 1500, annual: 15000 },
      founding: { monthly: 1200, annual: 12000 },
    },
    trialDays: null,
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
    prices: {
      standard: { monthly: 2500, annual: 25000 },
      founding: { monthly: 2000, annual: 20000 },
    },
    trialDays: TRIAL_DAYS,
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
    prices: {
      standard: { monthly: 4500, annual: 45000 },
      founding: { monthly: 3600, annual: 36000 },
    },
    trialDays: null,
  },
} as const

/** Cheapest first. Derived, so adding a plan above cannot leave this stale. */
export const PLAN_ORDER: readonly PlanId[] = ['match', 'apply', 'team'] as const

export const BILLING_PERIODS: readonly BillingPeriod[] = ['monthly', 'annual'] as const
export const PRICE_KINDS: readonly PriceKind[] = ['standard', 'founding'] as const

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && value in PLANS
}

/**
 * The stable name for one price, owned by this repo and set on the Stripe
 * object as its `lookup_key`.
 *
 * Prefixed, because a lookup key is unique across the whole Stripe account and
 * this account will not only ever hold subscriptions.
 */
export function lookupKeyFor(plan: PlanId, kind: PriceKind, period: BillingPeriod): string {
  return `shoots_${plan}_${kind}_${period}`
}

/**
 * Which plan does this lookup key belong to?
 *
 * What the webhook uses to decide what somebody bought. Pure: no environment,
 * no Stripe call, so an unrecognised key is an explicit null rather than a
 * guess. Guessing here would grant entitlement for something nobody bought.
 */
export function planForLookupKey(
  key: string,
): { plan: PlanId; kind: PriceKind; period: BillingPeriod } | null {
  if (!key) return null
  for (const plan of PLAN_ORDER) {
    for (const kind of PRICE_KINDS) {
      for (const period of BILLING_PERIODS) {
        if (lookupKeyFor(plan, kind, period) === key) return { plan, kind, period }
      }
    }
  }
  return null
}

/** The amount in pence. Every plan carries all four prices. */
export function amountFor(plan: PlanId, kind: PriceKind, period: BillingPeriod): number {
  return PLANS[plan].prices[kind][period]
}

/** Every price this repo intends to exist in Stripe. The sync script's input. */
export function definedPrices(): {
  plan: PlanId; kind: PriceKind; period: BillingPeriod; amount: number; lookupKey: string
}[] {
  const out: { plan: PlanId; kind: PriceKind; period: BillingPeriod; amount: number; lookupKey: string }[] = []
  for (const plan of PLAN_ORDER) {
    for (const kind of PRICE_KINDS) {
      for (const period of BILLING_PERIODS) {
        out.push({
          plan, kind, period,
          amount: amountFor(plan, kind, period),
          lookupKey: lookupKeyFor(plan, kind, period),
        })
      }
    }
  }
  return out
}

/**
 * An amount in pence as a person reads it.
 *
 * Whole pounds lose the ".00" — "£15", not "£15.00" — because every price we
 * currently sell is whole pounds and the decimals are noise on a pricing page.
 * A price with pence still renders them rather than rounding, which would
 * understate what somebody is about to be charged.
 */
export function formatAmount(pence: number): string {
  return pence % 100 === 0 ? `£${pence / 100}` : `£${(pence / 100).toFixed(2)}`
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
 * Which plans can actually be sold right now?
 *
 * Takes the set of lookup keys Stripe is known to hold, rather than reading the
 * environment, so the caller decides how fresh that knowledge is and this stays
 * a pure function. A plan needs BOTH standard periods: half-configured is worse
 * than absent, because the page renders a button for a period that fails when
 * clicked. The founding prices are not required — they are an offer, not the
 * product, and they disappear at the end of October.
 */
export function sellablePlans(availableLookupKeys: ReadonlySet<string>): PlanId[] {
  return PLAN_ORDER.filter(plan =>
    BILLING_PERIODS.every(period => availableLookupKeys.has(lookupKeyFor(plan, 'standard', period))),
  )
}

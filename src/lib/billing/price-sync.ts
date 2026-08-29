// The decision the catalogue sync makes about one price, separated from the
// Stripe calls so it can be tested.
//
// WHY THE MISMATCH CASE IS AN ERROR AND NOT AN UPDATE
//
// A Stripe price is immutable: its amount cannot be edited after creation.
// So "the config says £15 and Stripe says £12" has no automatic answer. The
// only way to change a price is to create a new one and archive the old, and
// that decides something about people already subscribed to the old one —
// whether they move, when, and whether they were told. A script must not make
// that call at three in the morning because a number changed in a config file.
//
// The dangerous failure is not stopping. It is creating a SECOND price for the
// same plan and leaving both live, so which one a customer gets depends on
// which the checkout happened to resolve. That is why the lookup key is the
// identity and a conflict on it halts rather than adds.

export type PriceVerdict =
  /** Nothing in Stripe carries this lookup key. Create it. */
  | { action: 'create' }
  /** Already there and identical. Do nothing. */
  | { action: 'ok'; priceId: string }
  /** Already there and different. Stop and tell a human. */
  | { action: 'mismatch'; priceId: string; differences: string[] }

export interface DesiredPrice {
  lookupKey: string
  amount: number
  currency: string
  interval: 'month' | 'year'
}

export interface ExistingPrice {
  id: string
  unit_amount: number | null
  currency: string
  recurring: { interval: string } | null
  active: boolean
}

/**
 * An archived price does NOT count as present.
 *
 * Stripe keeps a deactivated price for ever so historical invoices still
 * resolve, and it keeps its lookup key free for reuse. Treating one as
 * satisfying the config would leave the plan unsellable while the sync
 * reported everything in order.
 */
export function verdictFor(want: DesiredPrice, found: ExistingPrice | null): PriceVerdict {
  if (!found || !found.active) return { action: 'create' }

  const differences: string[] = []
  if (found.unit_amount !== want.amount) {
    differences.push(`amount: Stripe has ${found.unit_amount ?? 'none'}, config wants ${want.amount}`)
  }
  if (found.currency !== want.currency) {
    differences.push(`currency: Stripe has ${found.currency}, config wants ${want.currency}`)
  }
  if ((found.recurring?.interval ?? null) !== want.interval) {
    differences.push(`interval: Stripe has ${found.recurring?.interval ?? 'one-off'}, config wants ${want.interval}`)
  }

  return differences.length === 0
    ? { action: 'ok', priceId: found.id }
    : { action: 'mismatch', priceId: found.id, differences }
}

/** monthly/annual as this repo says it, to month/year as Stripe says it. */
export function stripeInterval(period: 'monthly' | 'annual'): 'month' | 'year' {
  return period === 'monthly' ? 'month' : 'year'
}

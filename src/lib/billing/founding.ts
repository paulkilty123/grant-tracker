// When a founding price may be used.
//
// The founding rate is TWO promises with different lifetimes, and collapsing
// them into one date breaks the second:
//
//   1. The public offer. Anybody may choose the founding rate for themselves
//      until the end of October 2026. After that it is off the pricing page.
//   2. The standing promise to the cohort. They are on six free months to
//      10 March 2027, and when they convert they convert onto the founding
//      rate. That is FOUR MONTHS after the public window shuts.
//
// A single "founding closes on 31 October" check satisfies the first and
// silently breaks the second: every cohort member converting in March would be
// quoted the public price, having been promised otherwise, and the first person
// to notice would be a customer. Paul flagged this on 29 August and asked for
// the capability now rather than a scramble in February.
//
// So availability is a question about the CHANNEL, not only the clock. The date
// bounds self-serve. A granted checkout — the conversion link a cohort member
// is sent, or an admin acting for someone — is not bounded at all, because the
// promise it honours was made before the window closed.
//
// Nothing here decides WHO gets a granted checkout. That is an entitlement
// question and it belongs with the grant, not with the price.

import { FOUNDING_OFFER_CLOSES } from '@/config/plans'

export type PurchaseChannel =
  /** Somebody choosing a price for themselves on the pricing page. */
  | 'self_serve'
  /** A conversion link or an admin acting on a promise already made. */
  | 'granted'

export interface FoundingDecision {
  allowed: boolean
  /** Why not, in words a person could be shown or a log could carry. */
  reason: string
}

export function foundingPriceAvailable(
  channel: PurchaseChannel,
  now: Date = new Date(),
): FoundingDecision {
  if (channel === 'granted') {
    return {
      allowed: true,
      reason: 'granted checkout: the founding rate was promised before the public offer closed',
    }
  }

  const closes = new Date(FOUNDING_OFFER_CLOSES)
  if (now.getTime() <= closes.getTime()) {
    return { allowed: true, reason: 'the public founding offer is open' }
  }
  return {
    allowed: false,
    reason: `the public founding offer closed on ${closes.toISOString().slice(0, 10)}`,
  }
}

/**
 * Is the public offer still open?
 *
 * For the pricing page, which should stop SHOWING the founding rate when it
 * stops being self-serve. Separate from the decision above so a surface cannot
 * accidentally ask the display question and get the granted answer.
 */
export function foundingOfferIsOpen(now: Date = new Date()): boolean {
  return foundingPriceAvailable('self_serve', now).allowed
}

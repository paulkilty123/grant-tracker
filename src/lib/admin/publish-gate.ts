// Should this row publish itself, or does it need a human?
//
// ─────────────────────────────────────────────────────────────────────────────
// This is the auto-publish gate that `review-reasons.ts` was written to feed.
// It deliberately derives NOTHING of its own: every signal comes from
// deriveReviewReasons(), so the queue and the gate can never disagree about why
// a row is waiting. If they derived separately they would drift, and the row
// would show one reason to a human and be judged on another by the machine.
//
// THE POLICY: block on wrong, not on missing.
//
// A row with no amount is incomplete but honest — the app renders an absent
// amount as absent, and a user is not misled. A row with an amount that appears
// nowhere on the funder's page is wrong, and a user acting on it wastes an
// application. The old queue treated those two identically, which is why the
// auto-publish rate was 0%: not low, zero. Measured against the live queue on
// 2026-07-26, the four "honest gap" codes (link_unverified 60,
// beneficiaries_generic_only 42, no_amount 32, no_deadline 29) fired on nearly
// every row, so blocking on them blocked everything.
//
// Two findings from that measurement shaped the split, and both are load-bearing:
//
//   1. `eligibility_missing` BLOCKS even though it looks like a gap. Empty
//      eligible_structures does not hide a row — matching.ts:1497 only applies
//      the hard structure gate when the array is non-empty, so an untagged row
//      falls through to soft text matching and is shown to organisations that
//      cannot apply. Missing eligibility over-matches. That is a wrong answer,
//      not an absent one.
//
//   2. `link_unverified` DOES NOT BLOCK, because 57 of its 60 rows are
//      url_status='unchecked' — never validated, rather than validated and
//      found bad. Absence of evidence is not evidence of a dead link. (It was
//      also unresolvable: neither validate-urls pass could reach a withheld
//      row. Fixed separately; the gate should not block on a signal that no
//      job was able to produce.)
// ─────────────────────────────────────────────────────────────────────────────

import {
  deriveReviewReasons,
  publishReadiness,
  type ReviewReason,
  type ReviewReasonCode,
  type ReviewRow,
} from './review-reasons'

/**
 * Bump when the blocking set changes, so `publish_gate_decisions` rows stay
 * comparable across policy revisions and calibration is measured against a
 * known rule rather than "whatever the gate did that week".
 */
export const GATE_POLICY_VERSION = 'c1'

/**
 * Every reason code, classified. `block` = the row asserts something wrong or
 * invented. `info` = the row is incomplete but honest.
 *
 * The test for `block`: would a user acting on this row be misled? Not "is this
 * row as good as we would like" — that question has no floor, and answering it
 * is what produced a queue nobody could drain.
 *
 * THIS RECORD IS EXHAUSTIVE BY TYPE, ON PURPOSE. Adding a code to
 * ReviewReasonCode without classifying it here fails `npx tsc --noEmit`, which
 * this project runs before every push. The alternative — a BLOCKING_CODES array
 * with an implicit "everything else publishes" default — would let a newly
 * written detector for a new class of wrongness be computed, persisted, and
 * silently ignored by the gate. That is the exact failure this layer exists to
 * stop, so it must not be possible to reintroduce by omission.
 */
const POLICY: Record<ReviewReasonCode, 'block' | 'info'> = {
  // ── Wrong or invented: a user acting on this is misled ──
  no_brief:             'block',  // nothing was ever read; every field is unsourced
  page_unreadable:      'block',  // brief written from the model's memory, not the page
  quarantined:          'block',  // the chain gave up; the row's state is unknown
  link_dead:            'block',  // the apply link does not resolve
  deadline_passed:      'block',  // sends someone at a round that has closed
  amount_inverted:      'block',  // minimum above maximum — self-evidently wrong
  amount_pot_suspected: 'block',  // whole-fund figure presented as per-applicant
  amount_ungrounded:    'block',  // £ figure with no matching wording on the page
  eligibility_missing:  'block',  // see note 1 in the header — over-matches, does not hide
  tags_changed:         'block',  // ONLY at critical severity — see isBlocking()
  // A fundraiser checked this row against the funder's actual policy and
  // rejected it. Blocking for two reasons: a human reporting a problem is
  // stronger evidence than anything derived from the row, and the feedback
  // router moves a published grant into the queue, so an 'info' verdict here
  // would let auto-publish immediately republish it and silently discard the
  // report. Cleared by triaging the flag, not by re-running the chain.
  user_flagged:         'block',
  // The funder says the applicant must be a business, producer, employer or
  // academic researcher. Not a gap and not a tagging fault: the fund is real,
  // correctly described, and cannot be won by anyone this catalogue serves.
  // Publishing it spends a user's attention on something they cannot apply for.
  applicant_not_social_sector: 'block',
  // The structured twin of the code above. `eligible_structures = ['individual']`
  // is the funder's own answer that no organisation can apply, so publishing it
  // spends a user's attention on something they are structurally barred from.
  applicant_individual_only: 'block',
  // A deadline years out is a programme lifetime shown in the "apply by" slot.
  // Wrong, not missing: it tells a user they have time they may not have.
  deadline_implausible: 'block',

  // ── Incomplete but honest: absence renders as absence ──
  no_amount:                  'info',
  no_deadline:                'info',
  sectors_missing:            'info',
  beneficiaries_generic_only: 'info',
  amount_zero:                'info',
  amount_under_stated:        'info',
  multi_round_uncaptured:     'info',
  link_unverified:            'info',  // see note 2 in the header — 57/60 never checked
  stale_dates:                'info',
  stale_enrichment:           'info',
}

/** The blocking set, derived so it can never disagree with POLICY. */
export const BLOCKING_CODES: readonly ReviewReasonCode[] =
  (Object.keys(POLICY) as ReviewReasonCode[]).filter(c => POLICY[c] === 'block')

/** The informational set, derived so it can never disagree with POLICY. */
export const INFORMATIONAL_CODES: readonly ReviewReasonCode[] =
  (Object.keys(POLICY) as ReviewReasonCode[]).filter(c => POLICY[c] === 'info')

/**
 * Does this reason block publication?
 *
 * `tags_changed` is the one code whose severity carries the meaning, so the
 * code alone is not enough to judge it. deriveReviewReasons emits it at
 * 'critical' only when a re-read NARROWED eligibility — the failure class that
 * removed 152 structure values across the catalogue and silently hid funds from
 * the CICs and co-ops that could apply. Otherwise it is 'changed': the machine
 * improved something and wants a nod, which is the single most common state in
 * the queue and the least alarming. Matching on the code alone conflates them
 * and holds 60 benign rows for no reason.
 */
export function isBlocking(reason: ReviewReason): boolean {
  if (reason.code === 'tags_changed') return reason.severity === 'critical'
  return POLICY[reason.code] === 'block'
}

export type GateOutcome =
  /** Nothing blocking. Safe to be in front of users. */
  | 'publish'
  /** Blocking reason, and not currently visible. Stays withheld. */
  | 'hold'
  /** Blocking reason, but ALREADY VISIBLE. Needs a human first, not a retraction. */
  | 'attention'

export type GateDecision = {
  outcome:       GateOutcome
  /** Was the row already visible to users when the gate ran? */
  wasLive:       boolean
  blocking:      ReviewReason[]
  informational: ReviewReason[]
  /** Queue position hint for rows that still need a human. Lower = closer to done. */
  readiness:     number
}

/**
 * Decide what to do with one row.
 *
 * The live/not-live split is the part that took the longest to see and matters
 * most. A gate has two different jobs and one threshold cannot serve both:
 *
 *   NOT live      — publishing EXPOSES the row. The question is
 *                   "is this good enough to show?"
 *   ALREADY live  — the row is in front of users right now, carrying every
 *                   defect it has. Holding it in a queue protects nobody; it
 *                   only means the admin state lags reality. The question is
 *                   "is this bad enough to pull?"
 *
 * On the live queue that split was 96 already-live against 31 genuinely
 * withheld, so for three quarters of the queue "hold" was never protecting
 * anyone — it was just bookkeeping that had fallen behind.
 *
 * `attention` is deliberately NOT a retraction. 32 of the 42 live-and-blocking
 * rows are blocking because a re-read narrowed their eligibility. Narrowing
 * hides a fund from SOME organisations; deactivating hides it from ALL. Pulling
 * those rows would amplify the exact bug being fixed, so the gate surfaces them
 * and leaves them live.
 */
export function gateDecision(row: ReviewRow, precomputed?: ReviewReason[]): GateDecision {
  const reasons       = precomputed ?? deriveReviewReasons(row)
  const blocking      = reasons.filter(isBlocking)
  const informational = reasons.filter(r => !isBlocking(r))
  const wasLive       = row.is_active === true

  const outcome: GateOutcome =
    blocking.length === 0 ? 'publish' : wasLive ? 'attention' : 'hold'

  return { outcome, wasLive, blocking, informational, readiness: publishReadiness(reasons) }
}

/**
 * Queue order for the rows that still need a human.
 *
 * `attention` first: those are live and wrong, so every hour they sit there is
 * an hour a user can act on bad data. Everything else falls back to readiness
 * (closest-to-publishable first), which exists because sorting by severity put
 * the most broken rows — the ones a human can do least about — at the top.
 */
export function compareByGate(a: GateDecision, b: GateDecision): number {
  const rank = (d: GateDecision) => (d.outcome === 'attention' ? 0 : 1)
  const byOutcome = rank(a) - rank(b)
  if (byOutcome !== 0) return byOutcome
  const byReadiness = a.readiness - b.readiness
  if (byReadiness !== 0) return byReadiness
  return (a.blocking.length + a.informational.length) - (b.blocking.length + b.informational.length)
}

/** Human-readable label for a decision, used in the Inbox and the run summary. */
export function describeOutcome(outcome: GateOutcome): string {
  switch (outcome) {
    case 'publish':   return 'Publishes itself'
    case 'attention': return 'Live and wrong'
    case 'hold':      return 'Held back'
  }
}

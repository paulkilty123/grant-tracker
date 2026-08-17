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
//   1. `eligibility_missing` USED TO BLOCK even though it looks like a gap, and
//      the reason was never really about the row. Empty eligible_structures does
//      not hide a row: matching.ts only applies the hard structure gate when the
//      array is non-empty (see the `.length > 0` at the eligible_structures hard
//      gate), so an untagged row fell through to soft text matching, scored no
//      cap, and was reported to a registered charity as affirmatively `eligible`
//      with a green tick on the search card. Empty and permissive were
//      indistinguishable in five independent places: both matchers, all three
//      list filters and the MCP scorer.
//
//      That was a wrong answer, so it blocked. But the wrongness lived in the
//      SURFACE, not in the row — the row honestly held nothing, and the app
//      turned nothing into "yes". Fixed 2026-08-11: every eligibility surface now
//      renders "eligibility not fully stated on the funder's site" when the array
//      is empty, and the unearned tick is gone. With the surface telling the
//      truth, an empty array is an honest gap like any other, so this code is now
//      `info`. If you are ever tempted to make the surface assert eligibility
//      from an empty array again, this code has to go back to `block` in the same
//      change.
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
export const GATE_POLICY_VERSION = 'c2'

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
  // The engine read the funder's own page and found the fund gone, not funding,
  // or its round shut. These are the strongest evidence the catalogue holds and
  // the gate could not see any of them: the verdicts were written to
  // field_evidence from 13 August and consumed by nothing that guards
  // publishing. Blocking, because publishing a fund the funder says is closed
  // spends a user's attention on something they cannot apply for, and because
  // arming auto-publish without this would automate exactly that.
  //
  // `page_says_round_closed` is raised ONLY where the page stated the year in
  // full (see YEAR_STATED_RE in review-reasons). A round_closed verdict resting
  // on an inferred year never becomes a reason at all, so it cannot block.
  // The write-up quotes a round that has closed and there is no current deadline
  // to correct it, so the deadline slot renders empty or "Rolling, apply any
  // time" beside prose saying applications have shut. Nothing on the card is
  // true about when to apply, which is wrong rather than merely incomplete.
  no_current_timing:      'block',
  page_says_delisted:     'block',
  page_says_not_funding:  'block',
  page_says_round_closed: 'block',

  // ── Incomplete but honest: absence renders as absence ──
  no_amount:                  'info',
  no_deadline:                'info',
  sectors_missing:            'info',
  beneficiaries_generic_only: 'info',
  amount_zero:                'info',
  amount_under_stated:        'info',
  multi_round_uncaptured:     'info',
  link_unverified:            'info',  // see note 2 in the header — 57/60 never checked
  stale_dates:                'info',   // prose untidy, but the deadline on the card is right
  stale_enrichment:           'info',
  eligibility_missing:        'info',  // see note 1 — honest only because the surface now says so
  // A re-read changed this row's tags. It blocked at 'critical' severity, i.e.
  // when eligibility was NARROWED, because the classifier used to shorten the
  // structure list whenever a page was silent on legal form: 152 values removed
  // against 117 added in a single pass, concentrated on cooperative,
  // unincorporated and the ltd forms. That was a real question and it earned a
  // human.
  //
  // It is not a real question any more. classify.ts now requires positive
  // evidence to REMOVE a structure (additions still land immediately), and the
  // 24 rows narrowed by the old behaviour had their values restored. A narrowing
  // that survives the new classifier is one the page actually supports.
  //
  // It is also the wrong side of the policy. Narrowing hides a fund from SOME
  // organisations; it never shows a fund to someone barred from it. That is an
  // under-match, the recoverable direction. Blocking on it held 37 rows whose
  // only complaint was that the machine had improved them.
  tags_changed:               'info',
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
 * POLICY is the whole answer. Severity is a presentation concern: it colours the
 * card in the review queue and orders it, and it deliberately has no vote here.
 *
 * It used to have a vote. `tags_changed` carried a severity special case in this
 * function, blocking at 'critical' and publishing otherwise. When that case was
 * removed, note that flipping POLICY alone would NOT have changed behaviour:
 * this function short-circuited on the code before it ever read POLICY, so the
 * table and the gate would have disagreed silently, with BLOCKING_CODES and
 * INFORMATIONAL_CODES reporting the table's answer and the gate acting on the
 * other one. tsc cannot catch that, because both halves type-check. If a code
 * ever needs per-row nuance again, put it in deriveReviewReasons as a distinct
 * CODE, not as a severity branch here.
 */
export function isBlocking(reason: ReviewReason): boolean {
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
 * `attention` is deliberately NOT a retraction. The row stays live and is
 * surfaced for a human. When this was written, 32 of the 42 live-and-blocking
 * rows were blocking on a narrowed re-read; that class is now `info` (see
 * `tags_changed` in POLICY) and publishes itself, so the `attention` bucket is
 * both smaller and better targeted. The principle stands for what remains:
 * pulling a live row hides it from ALL organisations, which is nearly always a
 * bigger harm than the defect that flagged it.
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

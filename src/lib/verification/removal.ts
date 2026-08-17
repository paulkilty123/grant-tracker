/**
 * The engine's actuator: the only place a page read is allowed to change a row.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * The verification engine has read 637 of 670 live rows and found 182 where the
 * funder's page contradicts us. It has corrected none of them, because it was
 * built to write evidence and never values. That is a measuring instrument with
 * no actuator, and its cost is not zero: the same unactioned pile is re-read and
 * re-reported every session while the wrong values stay on the site.
 *
 * §12 of `docs/tranche-2-design.md` sets the asymmetry that makes acting safe:
 *
 *   > The engine may take things down on evidence, and may never put things up.
 *
 * So this module decides removals and de-assertions only. Amounts, eligibility,
 * income caps — anything that adds or widens a claim — are untouched here and
 * stay proposals for a human. Nothing in this file can put a row, a fund or a
 * sentence in front of a user that was not there before.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FOUR CLASSES, AND WHERE EACH ROW LANDS
 *
 *   no_longer_listed → between_rounds_scheduled, unless the quote says the fund
 *                      is GONE, in which case archived
 *   not_a_grant      → archived                     (is_active false)
 *   round_closed     → between_rounds_scheduled     (is_active false, watched)
 *   rolling unset    → is_rolling true → false      (row stays visible)
 *
 * ARCHIVING IS THE EXCEPTION, NOT THE DEFAULT. Revised 17 August after the first
 * armed pass. A row is out of view either way, but `between_rounds_scheduled`
 * fires the migration-057 trigger that enrols the funder on the watchlist, so a
 * reopened round can bring the row back. Archiving takes it out of every admin
 * queue for good and loses the pre-archive state, which nothing on the row
 * records — so an archived fund that reopens in October never returns.
 *
 * The first pass archived eight rows and not one of their quotes said the fund
 * was gone; all eight said a round had closed or a funder had paused. So the
 * quote now has to earn the archive (`statesPermanentClosure`). `not_a_grant` is
 * the one class that always archives: the page is not funding at all, so there
 * is no round to wait for and nothing to watch.
 *
 * The rolling flip removes nothing. It moves a card from "Rolling, apply any
 * time" to "Check website", which after the 17 August renderer fix is what the
 * search card shows for a row with no deadline. It is in this module because it
 * is a de-assertion — strictly less claim than before — and it obeys the same
 * abstain rule.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT REFUSES TO DO, AND WHY THAT IS THE POINT
 *
 * See `abstain.ts`. Every removal must rest on a sentence the funder wrote, and
 * a sentence that says the fund is open or opening can never close it. Measured
 * against production on 2026-08-17, the rule withholds action from 2 of 10
 * `round_closed` rows and 2 of 10 `no_longer_listed` rows, and all four are
 * cases where acting would have been wrong:
 *
 *   Greggs Community Action Fund   "currently open for applications until 28th
 *                                   August" — no year, and says open
 *   Tech for Good Programme        "will re-open in May 2026" — a reopening read
 *                                   as a deadline
 *   Skills for Impact Fund         "** Coming autumn 2026 **" — a fund arriving
 *   Addressing Mental Health…      a sentence about past grantmaking that
 *                                   asserts no closure at all
 *
 * An abstaining row is not lost. It keeps its evidence stamp and stays in the
 * review queue as a proposal, which is exactly where a judgement belongs.
 */

import { abstainReason, statesClosure, affirmsRolling, statesPermanentClosure } from './abstain'
import type { FieldEvidence } from '../field-evidence'

/** What the engine may do to a row without a human in the loop. */
export type RemovalClass =
  | 'no_longer_listed'
  | 'not_a_grant'
  | 'round_closed'
  | 'rolling_unset'

/** The row shape the decision needs. A column missing from the caller's SELECT
 *  that a filter later reads has produced a false "match" in this codebase
 *  before, so this type is the SELECT list's contract. */
export type RemovalRow = {
  id:              string
  title:           string | null
  is_active:       boolean | null
  pipeline_state:  string | null
  is_rolling:      boolean | null
  apply_url:       string | null
  field_evidence:  FieldEvidence | null
}

export type RemovalAction = {
  act:       true
  klass:     RemovalClass
  /** What to pass to `mergeGrantUpdate`. `is_active`, `pipeline_state` and
   *  `rejection_reason` are untracked and cannot be refused; `is_rolling` is
   *  tracked and can be, which the caller must check. */
  fields:    Record<string, unknown>
  /** The funder's own sentence. Recorded on the row and in the digest — an
   *  unattended action with no quote is not reportable and must not happen. */
  quote:     string
  sourceUrl: string | null
}

export type RemovalHold = {
  act:    false
  klass:  RemovalClass | null
  /** Plain English, surfaced in the run summary. Never a bare code: the whole
   *  point of an abstain is that a human can see why it held. */
  reason: string
}

export type RemovalDecision = RemovalAction | RemovalHold

/** Longest quote we will write into `rejection_reason`. The column is free
 *  text; this keeps an admin list readable. The full quote stays in
 *  `field_evidence`, which is never truncated. */
const REASON_QUOTE_CHARS = 300

function stampOf(fe: FieldEvidence | null, field: string) {
  if (!fe || typeof fe !== 'object') return null
  const s = (fe as Record<string, unknown>)[field]
  return s && typeof s === 'object' ? (s as Record<string, unknown>) : null
}

function quoteOf(fe: FieldEvidence | null, field: string): string | null {
  const q = stampOf(fe, field)?.quote
  return typeof q === 'string' && q.trim().length > 0 ? q : null
}

function sourceUrlOf(fe: FieldEvidence | null, field: string): string | null {
  const u = stampOf(fe, field)?.source_url
  return typeof u === 'string' && u.length > 0 ? u : null
}

/** The row-level verdict, as the route stored it: a bare outcome, or the
 *  composite `"fixable_link: wrong_fund"`. */
export function verdictOf(fe: FieldEvidence | null): string | null {
  const n = stampOf(fe, '_page_read')?.note
  return typeof n === 'string' ? n : null
}

/**
 * Decide what, if anything, may happen to this row unattended.
 *
 * Returns exactly one decision. A verdict-driven removal outranks the rolling
 * flip: a row going out of view has no use for a corrected timing flag, and
 * writing both would put a tracked-field write behind an untracked one for no
 * user-visible gain.
 */
export function decideRemoval(row: RemovalRow): RemovalDecision {
  const fe = row.field_evidence ?? null

  // Already out of view. Not an error and not worth reporting as a hold —
  // the engine re-reads archived rows and would otherwise re-decide them
  // every run.
  if (row.is_active !== true) {
    return { act: false, klass: null, reason: 'row is already out of view' }
  }

  const verdict = verdictOf(fe)

  // ── Archive classes ───────────────────────────────────────────────────────
  //
  // Both require the quote to ASSERT closure rather than merely accompany the
  // verdict. An archive is the least reversible thing here: the row leaves
  // every admin queue and its pre-archive `pipeline_state` is recorded nowhere
  // on the row, so the run summary is the only way back.
  if (verdict === 'no_longer_listed' || verdict === 'not_a_grant') {
    const field = verdict === 'no_longer_listed' ? 'still_listed' : 'is_grant'
    const quote = quoteOf(fe, field)
    const held  = abstainReason({ quote, requireYear: false })
    if (held) return { act: false, klass: verdict, reason: held }

    // `not_a_grant` is a scope verdict, not a timing one — "this page is about
    // volunteering, not funding" states no closure and should not have to.
    // `no_longer_listed` is a timing claim and must.
    if (verdict === 'no_longer_listed' && !statesClosure(quote)) {
      return {
        act: false, klass: verdict,
        reason: 'the quote does not state the fund is closed, paused or gone',
      }
    }

    // ARCHIVE IS THE EXCEPTION AND THE QUOTE HAS TO EARN IT.
    //
    // Paul, 17 August, after reading the first pass: "quotes say the round
    // closed, not the fund is gone, and watching them is worth more than
    // burying them." Not one of the eight rows archived that morning said the
    // fund was gone — every quote was a round closing or a funder pausing.
    //
    // `not_a_grant` always archives: the page is not a funding opportunity at
    // all, so there is no round to wait for and nothing to watch.
    const permanent = verdict === 'not_a_grant' || statesPermanentClosure(quote)

    return {
      act: true,
      klass: verdict,
      fields: permanent
        ? {
            is_active:        false,
            // Passed explicitly so `transitionPipelineState` is skipped.
            // Without it, `is_active: false` on a published row lands on
            // `captured`, which is withdraw-for-review, not archive.
            pipeline_state:   'archived',
            rejection_reason: `${verdict}: ${quote!.slice(0, REASON_QUOTE_CHARS)}`,
          }
        : {
            is_active:        false,
            // Out of view, but the migration-057 trigger enrols the funder, so
            // a reopened round brings the row back.
            pipeline_state:   'between_rounds_scheduled',
          },
      quote:     quote!,
      sourceUrl: sourceUrlOf(fe, field),
    }
  }

  // ── Round closed ──────────────────────────────────────────────────────────
  //
  // The verdict is a deterministic function of the proposed deadline falling in
  // the past — 23 rows of 23, no exceptions — so it inherits whatever error the
  // date resolution made. This is the class Paul's condition was written for.
  if (verdict === 'round_closed') {
    const quote = quoteOf(fe, 'deadline')
    const held  = abstainReason({ quote, requireYear: true })
    if (held) return { act: false, klass: 'round_closed', reason: held }

    return {
      act: true,
      klass: 'round_closed',
      fields: {
        is_active:      false,
        // Not `archived`. Entering this state fires the migration-057 trigger
        // that enrols the funder on the watchlist, so a reopening can bring the
        // row back. No `next_open_date` is written: that is a user-visible
        // claim about the future and this module may not add one.
        pipeline_state: 'between_rounds_scheduled',
      },
      quote:     quote!,
      sourceUrl: sourceUrlOf(fe, 'deadline'),
    }
  }

  // ── Rolling, asserted with nothing behind it ──────────────────────────────
  //
  // Only the takedown direction. The engine also proposes `false → true` on 12
  // live rows; that WIDENS a claim — it tells a fundraiser to apply any time —
  // and is precisely what "may never put things up" forbids.
  const rolling = stampOf(fe, 'is_rolling')
  const contradicted = rolling?.agrees === false
  const proposesFalse = rolling?.proposed === false
  if (contradicted && proposesFalse && row.is_rolling === true) {
    const quote = quoteOf(fe, 'is_rolling')
    // Paul, 17 August: the abstain rule applies to this class too. The flip
    // rests on the page naming dated rounds, and the same year-less reading
    // that closed an open fund could name rounds that are not this year's.
    const held = abstainReason({ quote, requireYear: true })
    if (held) return { act: false, klass: 'rolling_unset', reason: held }

    // The dates may be the trustees' diary rather than the applicant's. Where
    // the same sentence says applications are taken any time, the page has not
    // contradicted the flag — see AFFIRMS_ROLLING_RE.
    if (affirmsRolling(quote)) {
      return {
        act: false, klass: 'rolling_unset',
        reason: 'the same quote says applications are accepted at any time; the dates listed are decision dates',
      }
    }

    return {
      act: true,
      klass: 'rolling_unset',
      // Tracked field: this goes through the trust ladder and CAN be refused.
      // The caller must check `applied`, not just the absence of an error.
      fields: { is_rolling: false },
      quote:  quote!,
      sourceUrl: sourceUrlOf(fe, 'is_rolling'),
    }
  }

  return { act: false, klass: null, reason: 'no removal class applies' }
}

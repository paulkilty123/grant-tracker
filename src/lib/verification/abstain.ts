/**
 * The conditions under which the engine may NOT act on its own verdict.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A MODULE AND NOT THREE REGEXES AT THE CALL SITE
 *
 * The engine is allowed to take a claim down and never to put one up (§12 of
 * `docs/tranche-2-design.md`). That asymmetry is only safe if the takedown rests
 * on something the funder actually wrote. Every observed false positive in the
 * class has the same shape: the page said the fund was OPEN, or said when it
 * would open, and the verdict read a date out of that sentence and closed the
 * fund with it.
 *
 * Paul's condition, 2026-08-16, restated 17 August as non-negotiable:
 *
 *   > A removal may not act on a deadline the page did not state in full. An
 *   > inferred or year-less date may never drive an automatic removal.
 *
 * The evidence behind it is the Greggs Community Action Fund. Its page says
 * "currently open for applications until 28th August at 12 noon", with no year.
 * The verifier resolved that to 2025-08-28, which is in the past, and returned
 * `round_closed`. The fund is open. Had the class been armed without this
 * module, an open fund would have gone out of view automatically, on a date the
 * funder never wrote.
 *
 * Note what that sentence does twice over: it omits the year AND it says the
 * fund is open. §12 records that two of the six year-less rows "say the fund is
 * open in the same sentence the verdict used to close it". So the rule has two
 * limbs from its own evidence, not one, and both are implemented here.
 *
 * The regexes live in one module because a second copy that drifts is a failure
 * mode this codebase has hit repeatedly. `src/lib/admin/review-reasons.ts` held
 * the only copy of `YEAR_STATED_RE` and now imports it from here.
 */

/**
 * A year the funder actually wrote: four digits, or two inside a numeric date
 * like 12/08/26.
 *
 * Moved here from `review-reasons.ts` on 2026-08-17 when the removal actuator
 * became the second caller. The publish gate and the actuator must abstain on
 * exactly the same rows or the gate blocks what the actuator has already acted
 * on, and the two would drift apart the first time either was edited.
 */
export const YEAR_STATED_RE = /\d{4}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2}\b/

/**
 * Language that describes a fund arriving, not leaving.
 *
 * Every one of these turns a removal into the opposite of the truth, so the
 * matching is deliberately broad — a false abstain costs one row staying in a
 * review queue, a false action takes a live fund off the site.
 *
 * Drawn from the live rows this gate was built against, 2026-08-17:
 *   "currently open for applications until 28th August"   (Greggs, round_closed)
 *   "Applications for our next programme will re-open in May 2026."
 *                                                  (Tech for Good, round_closed)
 *   "** Coming autumn 2026 **"           (Skills for Impact, no_longer_listed)
 *
 * `open` is matched only where it is about applications rather than, say, "open
 * to charities working in Wales", which is an eligibility sentence and says
 * nothing about timing. The `now closed ... will reopen` shape is handled by
 * order of evaluation in `readsAsForthcoming`, not here.
 */
const FORTHCOMING_RE =
  /\b(re-?open(?:s|ed|ing)?|will\s+open|opens?\s+(?:on|in|from|again)|coming\s+(?:soon|in|this|next|autumn|spring|summer|winter)|launch(?:es|ing)\s+(?:on|in|soon)|next\s+round\s+(?:opens?|will)|applications?\s+(?:are\s+)?(?:now\s+)?open\b|currently\s+open|now\s+open|is\s+open\s+for\s+applications)\b/i

/**
 * Language that states a fund is shut, paused, or gone.
 *
 * This is a POSITIVE evidence test, not a denylist, and that is the point. An
 * archive is the least reversible thing the engine can do: the row leaves every
 * admin queue and the pre-archive `pipeline_state` is not recorded anywhere on
 * the row. Requiring the quote to actually assert closure means a verdict
 * resting on a quote that asserts nothing — "Almost £85,000 has been invested in
 * 10 Community Organisations", which is a live `no_longer_listed` row — abstains
 * instead of archiving on the strength of a sentence about past grantmaking.
 */
const CLOSURE_RE =
  /\b(closed?|closing|closes|no\s+longer|has\s+ended|now\s+ended|withdrawn|discontinued|on\s+pause|paused|suspended|not\s+(?:currently\s+)?accepting|no\s+longer\s+(?:available|accepting|open)|fully\s+committed|oversubscribed)\b/i

/**
 * Language in which the funder affirms that applications ARE taken any time.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS LIMB EXISTS, FOUND IN THE ARMING DRY RUN, 2026-08-17
 *
 * The rolling takedown fires when a page "names dated rounds". Two of the first
 * eleven rows it would have acted on were funds that plainly are rolling, whose
 * pages list the dates their TRUSTEES MEET:
 *
 *   Drapers' Charitable Fund   "You can apply at any time of the year. Our
 *                               Charities Committee meets five times a year …
 *                               The next meeting dates are: 29 September 2026 …"
 *   William A Cadbury          "Applications for small grants … are considered
 *                               on a monthly basis. Trustees meet in May and
 *                               November …"
 *
 * A decision date is not a deadline, and "apply any time, decided at the next
 * meeting" is not a contradiction — it is how a great many trusts work. This is
 * the same defect `isPostDecisionEntry` fixed one level down in
 * `deadline-cycle.ts`: the cycle filter in `verify-row.ts` removes OPENING
 * entries before concluding the page runs in rounds, but not post-decision ones.
 *
 * Fixing it there would change what the engine extracts and is a bigger change
 * than arming warrants today. Guarding it here is exact and cheap: where the
 * same sentence the takedown rests on ALSO says applications are accepted any
 * time, the page has not contradicted the rolling flag and the row abstains.
 */
const AFFIRMS_ROLLING_RE =
  /\b(at any time|any time of the year|all year round|year[-\s]round|on a rolling basis|rolling basis|considered on a (?:monthly|weekly|quarterly|rolling) basis|no (?:closing|application) deadlines?|there is no deadline|accepted (?:throughout|continuously)|open all year)\b/i

/** Did the funder write the year, rather than the model resolving one? */
export function statesYearInFull(quote: string | null | undefined): boolean {
  return typeof quote === 'string' && YEAR_STATED_RE.test(quote)
}

/**
 * Does this sentence describe a fund that is open or about to open?
 *
 * Evaluated AFTER closure, by callers, so that "this round has now closed and
 * will reopen in the spring" is treated as the closure it is. A sentence that
 * says both is still a closure; a sentence that says only the opening is not.
 */
export function readsAsForthcoming(quote: string | null | undefined): boolean {
  return typeof quote === 'string' && FORTHCOMING_RE.test(quote)
}

/** Does this sentence actually assert that the fund is shut, paused or gone? */
export function statesClosure(quote: string | null | undefined): boolean {
  return typeof quote === 'string' && CLOSURE_RE.test(quote)
}

/** Does the sentence the takedown rests on itself say applications are taken
 *  at any time? If so the page has not contradicted the rolling flag, whatever
 *  dates it also lists. */
export function affirmsRolling(quote: string | null | undefined): boolean {
  return typeof quote === 'string' && AFFIRMS_ROLLING_RE.test(quote)
}

/**
 * The whole rule, in the order the evidence requires.
 *
 * `requireYear` is set by the caller because it is not universal: a
 * `round_closed` verdict is a deterministic function of a resolved absolute
 * date and must have one, whereas a `no_longer_listed` quote like "Current
 * status Closed" carries no date at all and does not need to.
 */
export function abstainReason(opts: {
  quote:       string | null | undefined
  requireYear: boolean
}): string | null {
  const { quote, requireYear } = opts
  if (!quote || quote.trim().length === 0) return 'the page was not quoted'
  // Closure first: a sentence that announces a closure AND a reopening is a
  // closure. Only a sentence that is purely forward-looking abstains.
  if (!statesClosure(quote) && readsAsForthcoming(quote)) {
    return 'the quote describes the fund opening, not closing'
  }
  if (requireYear && !statesYearInFull(quote)) {
    return 'the funder did not write the year, so the date was inferred'
  }
  return null
}

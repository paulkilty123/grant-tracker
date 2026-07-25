// Grant amount extraction — shared, pure, no React and no DB access.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS
//
// This logic was written and hardened inside src/app/dashboard/admin/urls/page.tsx
// (computeBriefUpdates), which means it only ever ran when an admin clicked
// "Detect all" in the browser. The AUTOMATED path used a much cruder regex in
// api/admin/fill-amounts that:
//   - read only funder_brief.typical_award, ignoring what_they_fund, the grant's
//     own description and the title (briefs frequently generalise typical_award
//     to "small grants, no fixed amount" while the description says "Up to £X");
//   - had NO pool-vs-per-grant cues at all, so "total funding available is
//     approximately £100,000" became amount_max — i.e. the size of the whole
//     fund presented to users as what one applicant can ask for;
//   - filled amount_min and amount_max from independent matches with no
//     cross-field check, so it could write a minimum ABOVE the maximum.
//
// "The grant amount is the total pot rather than what an applicant can apply
// for" is one of the three error classes Paul reports hitting most often in
// Needs Review. The fix was not new logic — it was moving the good logic out of
// the browser and into the shared path. Promoted 2026-07-25.
//
// Ported verbatim from the admin UI implementation, which encodes a long tail of
// named real-world bug cases (Havering Community Chest, Sterry Family
// Foundation, Adint, Stronger Futures, Trusthouse). Do not "simplify" the
// regexes without a case that proves the simplification is safe.
// ─────────────────────────────────────────────────────────────────────────────

export type DetectedAmounts = {
  amount_min: number | null
  amount_max: number | null
}

/** A candidate figure plus what its surrounding text implied about it. */
type Candidate = {
  value:   number
  /** Carried an explicit per-grant cue ("up to", "grants of", "between …"). */
  cued:    boolean
  /** That cue was specifically a CEILING (up to / maximum / no more than). */
  ceiling: boolean
}

const AMOUNT_RE = /[£$][\d,]+(?:\.?\d+)?(?:\s*[km](?:illion)?)?/gi

// Pool-total cues (LEFT): the £X is the funder's annual or historical pool, not
// a per-grant size. Also catches eligibility caps ("charities with annual income
// of £250,000 or less") — a filter on the applicant, not a grant amount — and
// the "launch the £4m … Programme" pattern, where the figure is the size of a
// named fund. That last one is the Stronger Futures case: "£4m Stronger Futures
// Programme 3.0" was becoming amount_max even though typical_award correctly
// said £80k–£200k per grant.
const POOL_CUES_LEFT = /\b(?:awarded?\s+(?:a\s+)?total|totalling|totalled|total\s+(?:of|awarded|distributed|grants?|funding|funds|fund)\b|total\s*$|in\s+(?:the\s+)?(?:past|previous|last)\s+(?:year|years|few\s+years)|annual(?:ly\s+(?:awards?|distribut(?:es?|ed|ing)|gives?|gave|given|spen(?:ds?|t|ding))|\s+(?:budget|fund|spending|expenditure))|per\s+(?:year|annum)|each\s+year|distribut(?:es?|ed|ing)|donat(?:es?|ed|ing)|spen(?:ds?|t|ding)|gives?\s+(?:away|out)|gave\s+(?:away|out)|given\s+(?:away|out)|endowment|combined\s+(?:total|funding|budget)|invest(?:ing|ed|ment)?\s+(?:of\s+)?(?:a\s+)?(?:total|minimum|at\s+least)\b|a\s+share\s+of\b|(?:launch(?:ing|ed)?|announc(?:ing|ed))\s+(?:our\s+|the\s+|a\s+|new\s+|with\s+)|annual\s+(?:income|turnover|expenditure|spending|spend|revenue|budget)\s*(?:[<>≤≥]|of\b)|(?:income|turnover|expenditure|spending|spend|revenue|reserves|budget)\s*(?:[<>≤≥]|\b(?:of|cap|limit|under|below|over|above|up\s+to|less\s+than|more\s+than|exceeding)\b))/i
// Three additions on 2026-07-25, each from a real catalogue row found when this
// logic was first run over live data (see the git history of this file):
//
//   `total\s*$`  — "from a total £50 million programme" (Change Makers). The
//     existing `total\s+(?:of|awarded|…)` alternatives all require a word after
//     "total", so a bare "a total £50m" slipped through. Anchored to end-of-left-
//     context so "total grant of £X" (left context ends "grant of ") is unaffected.
//
//   `invest… (of) (a) total|minimum|at least`  — "the funder will invest a minimum
//     of £15 million across all projects", and "investment of at least £15m over
//     three years in projects" (Heritage in Need). Both are fund-level commitments.
//
//   `a share of`  — "organisations can apply for a share of up to £25 million"
//     (Consumer Led Flexibility). This one matters because the "up to" would
//     otherwise mark it per-grant: POOL_CUES_LEFT is tested BEFORE the per-grant
//     short-circuit, so a share-of phrase correctly wins.

// Pool-total cues (RIGHT). Includes the "[name] Programme/Fund/Scheme" pattern,
// which requires at least one intermediate word so a bare "£10,000 fund" (where
// 'fund' is just the funder noun) survives, while "£2m Climate Action Fund" does
// not. "a year" and "annual pot/pool" are pool totals; the per-grant LEFT cue
// still overrides them, so "up to £5,000 a year" survives as per-grant.
const POOL_CUES_RIGHT = /^[\s,()]*(?:distribut(?:es|ed|ing)\b|donat(?:es|ed|ing)\b|spen(?:ds|t|ding)\b|spread\s+across|split\s+(?:across|between|among)|shared\s+(?:across|between|among)|across\s+(?:multiple|several|all|charities|recipients|organisations|projects|grants?|funds?|programmes?)|to\s+multiple|in\s+20\d{2}(?:[\/\-]\d{2,4})?\b|in\s+total\b|annually\b|each\s+year\b|a\s+year\b|annual\s+(?:pot|pool|fund|budget|allocation)\b|per\s+(?:year|annum)\b|altogether\b|or\s+(?:less|below|under|fewer)\b|[a-z]+(?:\s+[a-z]+){0,3}\s+(?:programmes?|schemes?|initiatives?|pools?|pots?|total\s+budget|prize\s+pools?)\b|\s+[a-z]+(?:\s+[a-z]+){1,3}\s+(?:programme|scheme|initiative|pool|pot|total\s+budget|prize\s+pool)\b)/i
// The `[a-z]+(?:\s+[a-z]+){0,3}\s+(?:programmes?|…)` alternative was added
// 2026-07-25 for the PARENTHESISED form: "to £40 million (major sector
// programmes)" (Nesta Prize Competitions) and "£25 million total prize pools".
// The pre-existing alternative requires a leading \s+, but `^[\s,()]*` has
// already consumed the " (" by then, so it could never match inside brackets.
// `fund` is deliberately excluded from the new alternative (it stays only in the
// older one, which requires an intermediate word) so a bare "£10,000 fund" —
// where 'fund' is just the funder noun — still survives as a per-grant figure.

// Per-grant qualifiers in LEFT context override the pool-cues-RIGHT check.
// Without this, "Up to £10,000 per year" is dropped because 'per year' looks
// pool-shaped, when the left 'up to' makes clear £10,000 is the per-grant rate.
// POOL_CUES_LEFT still wins when a stronger pool verb is present
// ("distributes up to £100,000 per year" → pool).
const PER_GRANT_LEFT_CUES = /(?:^|[\s.,;:(])(?:up\s+to|of\s+up\s+to|maximum(?:\s+of)?|max(?:\s+of)?|no\s+more\s+than|limit(?:\s+of)?|typically|typical(?:\s+(?:up\s+to|grant|award))?|grants?\s+of(?:\s+up\s+to)?|awards?\s+of(?:\s+up\s+to)?|ranges?\s+from|from)\s*$/i

// Ceiling-specific subset: these assert a cap, never a floor.
const CEILING_LEFT_CUES = /(?:^|[\s.,;:(])(?:up\s+to|of\s+up\s+to|maximum(?:\s+of)?|max(?:\s+of)?|no\s+more\s+than|limit(?:\s+of)?)\s*$/i

// A figure following a pool total via one of these (within ~90 chars) is
// itemising the pool, not a grant size — "total funding … £100,000 (£80,000 from
// NHS … and circa £20,000 …)".
const BREAKDOWN_CONNECTOR = /[(]|\bfrom\b|\bcomprising\b|\bmade\s+up\b|\bconsisting\b|\bincluding\b|\bplus\b|\bof\s+which\b/i

// STRICT frame: only a strong per-grant qualifier protects a pool-cued RANGE
// from being dropped. Bare "between"/"from" do NOT — "the Trust awards between
// £90,000 and £97,000 annually" is a pool. BROAD frame is used only for *cueing*
// a range that already survived, where "between"/"from" are fine.
const PER_GRANT_RANGE_FRAME_STRICT = /(?:up\s+to|grants?\s+of|awards?\s+of|ranges?\s+(?:from|of))\s*$/i
const PER_GRANT_RANGE_FRAME        = /(?:up\s+to|grants?\s+of|awards?\s+of|between|ranges?\s+(?:from|of|between|are)|from|of)\s*$/i

const RANGE_RE = /(£[\d,]+(?:\.?\d+)?(?:\s*[km](?:illion)?)?)\s*(?:and|to|–|—|-)\s*(£[\d,]+(?:\.?\d+)?(?:\s*[km](?:illion)?)?)/gi

// "£X/year for Y years" → also consider the multi-year total. Without this the
// headline amount_max reflects only the per-year cap and hides the real ceiling.
// Trusthouse: "up to £50,000/year for up to 3 years" — per-year £50k is right,
// but a 3-year grant is worth £150k. Always a ceiling, never a floor.
const MULTI_YEAR_RE = /(£[\d,]+(?:\.?\d+)?(?:\s*[km](?:illion)?)?)\s*(?:\/|\s+per\s+|\s+a\s+)\s*(?:year|annum)\s+(?:for\s+|over\s+|across\s+)?(?:up\s+to\s+)?(\d+)\s+years?\b/gi

/** Hard sanity ceiling — nothing above this is a credible single grant figure. */
const MAX_CREDIBLE = 50_000_000

function parseAmt(s: string): number | null {
  const clean = s.replace(/[£$,]/g, '').trim()
  const m = clean.match(/([\d.]+)\s*([km])?/)
  if (!m) return null
  let val = parseFloat(m[1])
  if (m[2] === 'k') val *= 1_000
  if (m[2] === 'm') val *= 1_000_000
  if (isNaN(val) || val > MAX_CREDIBLE) return null
  return Math.round(val)
}

/**
 * Assemble the text to scan, in priority order.
 *
 * typical_award first, then what_they_fund, then the grant's own description and
 * title. The fallbacks matter: briefs frequently generalise typical_award to
 * "small grants, no fixed amount" while the original scraped description carries
 * a clear "Up to £X". The old automated path read typical_award only, which is a
 * large part of why amounts arrived missing or wrong.
 *
 * Lowercased because every cue regex is case-insensitive on a lowercase corpus.
 */
export function buildAwardText(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(' ').toLowerCase()
}

/**
 * Derive { amount_min, amount_max } from award text.
 *
 * amount_max is the largest surviving figure once pool totals, eligibility caps
 * and breakdown components are filtered out. amount_min is taken ONLY from a
 * cued, non-ceiling floor, and only when it is genuinely below the max — so a
 * lone "up to £X" cap or a bare pool figure can never become a false floor.
 *
 * Havering Community Chest is the canonical case: "Up to £5,000 per project.
 * Total funding available is approximately £100,000 (£80,000 from NHS … and
 * circa £20,000 …)" previously produced min £5,000 (the per-project cap, wrongly
 * used as the floor) and max £100,000 (the whole pot). Correct answer, which
 * this returns: max £5,000, min unset.
 *
 * Returns nulls rather than throwing on unparseable input.
 */
export function extractGrantAmounts(awardText: string): DetectedAmounts {
  if (!awardText || awardText.length < 3) {
    return { amount_min: null, amount_max: null }
  }

  // ── Pool-range detection ───────────────────────────────────────────────────
  // "£X (to|and|–) £Y" where the PAIR is a pool total, signalled by a pool cue
  // right after £Y or within ~60 chars before £X, unless the range is
  // per-grant-framed. Both endpoints are then dropped: the per-amount checks on
  // £X would miss a cue sitting past its partner £Y, so the pair must be judged
  // as a unit. Catches Sterry ("awards between £80,000 and £100,000 annually in
  // total") and Adint ("total awarded each year is around £450,000–£470,000"),
  // while leaving "grants range from £2,000 to £10,000 per year" intact.
  const dropFromRange = new Set<number>()
  for (const m of Array.from(awardText.matchAll(RANGE_RE))) {
    const start = m.index ?? 0
    const xIdx  = start + m[0].indexOf(m[1])
    const yIdx  = start + m[0].lastIndexOf(m[2])
    const afterY  = awardText.slice(yIdx + m[2].length, yIdx + m[2].length + 50)
    const beforeX = awardText.slice(Math.max(0, xIdx - 60), xIdx)
    const perGrantFramed = PER_GRANT_RANGE_FRAME_STRICT.test(
      awardText.slice(Math.max(0, xIdx - 40), xIdx)
    )
    if (!perGrantFramed && (POOL_CUES_RIGHT.test(afterY) || POOL_CUES_LEFT.test(beforeX))) {
      dropFromRange.add(xIdx)
      dropFromRange.add(yIdx)
    }
  }

  // ── Per-amount pass ────────────────────────────────────────────────────────
  const detected: Candidate[] = []
  let chainEnd = -Infinity   // end index of the last pool-total / breakdown amount

  for (const m of Array.from(awardText.matchAll(AMOUNT_RE))) {
    const idx = m.index ?? 0
    if (dropFromRange.has(idx)) continue
    const leftCtx  = awardText.slice(Math.max(0, idx - 50), idx)
    const rightCtx = awardText.slice(idx + m[0].length, idx + m[0].length + 50)
    const perGrantLeft = PER_GRANT_LEFT_CUES.test(leftCtx)

    // Pool total → anchor a breakdown chain and skip the figure itself.
    if (POOL_CUES_LEFT.test(leftCtx)) { chainEnd = idx + m[0].length; continue }
    if (!perGrantLeft && POOL_CUES_RIGHT.test(rightCtx)) continue
    if (
      !perGrantLeft &&
      idx - chainEnd < 90 &&
      BREAKDOWN_CONNECTOR.test(awardText.slice(Math.max(0, chainEnd), idx))
    ) {
      chainEnd = idx + m[0].length   // extend the chain over the breakdown component
      continue
    }

    const v = parseAmt(m[0])
    if (v !== null) {
      detected.push({ value: v, cued: perGrantLeft, ceiling: CEILING_LEFT_CUES.test(leftCtx) })
    }
  }

  // ── Cue surviving per-grant ranges ─────────────────────────────────────────
  // So BOTH endpoints become floors and a genuine min–max range is preserved,
  // including a partner the per-amount pass dropped: the "£10,000" in "£2,000 to
  // £10,000 per year" is dropped by the 'per year' right-cue and recovered here.
  const markRangeCued = (raw: string) => {
    const val = parseAmt(raw)
    if (val === null) return
    const hit = detected.find(d => d.value === val)
    if (hit) hit.cued = true
    else detected.push({ value: val, cued: true, ceiling: false })
  }
  for (const m of Array.from(awardText.matchAll(RANGE_RE))) {
    const xIdx = (m.index ?? 0) + m[0].indexOf(m[1])
    if (dropFromRange.has(xIdx)) continue
    if (!PER_GRANT_RANGE_FRAME.test(awardText.slice(Math.max(0, xIdx - 40), xIdx))) continue
    markRangeCued(m[1]); markRangeCued(m[2])
  }

  // ── Multi-year amplification ───────────────────────────────────────────────
  for (const m of Array.from(awardText.matchAll(MULTI_YEAR_RE))) {
    const perYear = parseAmt(m[1])
    const years   = parseInt(m[2], 10)
    if (perYear !== null && years >= 2 && years <= 10) {
      detected.push({ value: perYear * years, cued: true, ceiling: true })
    }
  }

  if (detected.length === 0) return { amount_min: null, amount_max: null }

  // Dedupe by value, OR-ing the flags.
  const byVal = new Map<number, Candidate>()
  for (const d of detected) {
    const ex = byVal.get(d.value)
    if (ex) { ex.cued = ex.cued || d.cued; ex.ceiling = ex.ceiling || d.ceiling }
    else byVal.set(d.value, { ...d })
  }
  const deduped = Array.from(byVal.values())

  const maxVal = Math.max(...deduped.map(d => d.value))
  const floors = deduped.filter(d => d.cued && !d.ceiling).map(d => d.value)
  const minCandidate = floors.length > 0 ? Math.min(...floors) : null

  // Cross-field guard: a min is only meaningful strictly below the max. This is
  // what the old crude path lacked — it filled min and max from independent
  // matches and could write min > max.
  const amount_min = minCandidate !== null && minCandidate < maxVal ? minCandidate : null

  return { amount_min, amount_max: maxVal }
}

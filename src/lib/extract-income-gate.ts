// Deterministic org-income / turnover gate extractor.
//
// Parses min_org_income / max_org_income out of text we already store, so the
// branched eligibility engine's income check (eligibility.ts) actually fires.
// It is NOT an LLM call — plain regex over stored text, tuned against 67 live
// catalogue rows (2026-05-31). Shared by:
//   - the enrich-grant write path (parse-on-ingest, durable)
//   - the income backfill route (re-derive over existing rows)
//
// Design notes:
//   - A figure only counts when an income/turnover word sits next to it, AND
//     there is a directional comparator (under / at least / between / …).
//     Bare figures with no comparator are reported as "gate present" but
//     deliberately left unresolved (Group D — human eyeball).
//   - Grant sizes, "earned income", match-funding ("pound for pound") and
//     revenue-share ("40% of £1") are rejected.
//   - "income over £X" in an exclusions context means a CAP of £X, not a floor.
//   - Any conflict (two different caps, contradictory band, unexplained bare
//     figure) resolves to "gate present, no value" rather than guessing.

export type IncomeGateConfidence = 'high' | 'med' | 'low'

export interface IncomeGateInput {
  description?: string | null
  eligibilityCriteria?: string[] | null
  whoCanApply?: string | null
  exclusions?: string | null
  // Read ONLY as a negative signal: figures here are grant sizes, never an
  // org-income gate. Currently unused for positive matching by design.
  typicalAward?: string | null
}

export interface IncomeGateCitation {
  snippet: string
  confidence: IncomeGateConfidence
  reason?: string
}

export interface IncomeGateResult {
  minOrgIncome?: number
  maxOrgIncome?: number
  citation?: IncomeGateCitation
  // True when a numeric org-income / turnover gate is present in the text,
  // even if we could not resolve it to a confident value. Drives the matcher's
  // evidence-based check_required downgrade for unresolved (Group D) rows.
  gateLanguagePresent: boolean
}

type Direction = 'max' | 'min'

interface Candidate {
  value: number
  direction: Direction
  exclStyle: boolean // came from over/above/exceeding — may be an exclusion cap
  confidence: IncomeGateConfidence
  snippet: string
}

// £250,000 | £1m | £5 million | £2.5m | £300k. The trailing (?![a-z0-9]) stops
// the suffix from eating the first letter of a following word ("£100,000 minimum").
const FIGURE_RE = /£\s?([0-9][0-9,.]*)(?:\s?(thousand|million|billion|bn|k|m))?(?![a-z0-9])/gi

// "income between £X and £Y" — captures both bounds even when far apart.
const RANGE_RE = /\b(?:income|turnover|annual budget)\b[^.£\n]{0,28}?between\s+£\s?([0-9][0-9,.]*)(?:\s?(thousand|million|billion|bn|k|m))?(?![a-z0-9])[^£\n]{0,14}?(?:and|to|–|—|-|&)\s*£\s?([0-9][0-9,.]*)(?:\s?(thousand|million|billion|bn|k|m))?(?![a-z0-9])/gi

const MAX_RE = /\b(under|below|less than|up to|no more than|not exceeding|not more than|no greater than|not greater than|maximum(?: of)?|max|beneath|lower than|smaller than|within)\s*$/
const MIN_RE = /\b(at least|minimum(?: of)?|min|no less than|no lower than|no fewer than)\s*$/
const EXCL_RE = /\b(over|above|exceeding|exceeds|more than|greater than|in excess of|higher than|larger than)\s*$/

const NEG_MARKER_RE = /(not eligible|ineligible|are not eligible|does not fund|do not fund|don't fund|will not fund|won't fund|cannot apply|can't apply|not be eligible|exclud|too large|larger organisations|we do not)/i

const NO_UPPER_RE = /(no upper (?:income )?(?:limit|cap)|no maximum income|no income limit|no upper limit on income)/i

function parseFigure(numStr: string, suffix?: string): number {
  const n = parseFloat(numStr.replace(/,/g, '').replace(/\.$/, ''))
  if (!isFinite(n)) return NaN
  const s = (suffix || '').toLowerCase()
  const mult =
    s === 'thousand' || s === 'k' ? 1_000 :
    s === 'million' || s === 'm' ? 1_000_000 :
    s === 'billion' || s === 'bn' ? 1_000_000_000 :
    1
  return Math.round(n * mult)
}

function cleanSnippet(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, 220)
}

interface ScanAcc {
  candidates: Candidate[]
  bareValues: Set<number>
  gatePresent: boolean
  noUpper: boolean
}

function scanField(text: string, isExclusions: boolean, acc: ScanAcc): void {
  if (!text) return
  if (NO_UPPER_RE.test(text)) acc.noUpper = true

  // ── Range pass: "income between £X and £Y" ────────────────────────────────
  for (const m of Array.from(text.matchAll(RANGE_RE))) {
    const lo = parseFigure(m[1], m[2])
    const hi = parseFigure(m[3], m[4])
    const snip = cleanSnippet(m[0])
    if (isFinite(lo)) { acc.candidates.push({ value: lo, direction: 'min', exclStyle: false, confidence: 'high', snippet: snip }); acc.gatePresent = true }
    if (isFinite(hi)) { acc.candidates.push({ value: hi, direction: 'max', exclStyle: false, confidence: 'high', snippet: snip }); acc.gatePresent = true }
  }

  // ── Figure pass ───────────────────────────────────────────────────────────
  for (const m of Array.from(text.matchAll(FIGURE_RE))) {
    const value = parseFigure(m[1], m[2])
    if (!isFinite(value) || value <= 0) continue

    const idx = m.index ?? 0
    const end = idx + m[0].length
    const beforeRaw = text.slice(Math.max(0, idx - 55), idx)
    const afterRaw = text.slice(end, end + 45)
    const before = beforeRaw.toLowerCase()
    const after = afterRaw.toLowerCase()
    const win = (beforeRaw + ' ' + afterRaw).toLowerCase()

    // income / turnover must be adjacent
    const incomeNear =
      /\b(income|turnover|annual budget)\b/.test(before.slice(-48)) ||
      /\b(income|turnover|annual budget)\b/.test(after.slice(0, 38))
    if (!incomeNear) continue

    // noise: earned/household income, income generation, match-funding, % share
    if (/(earned|household|disposable|in-?kind|investment)\s+income/.test(win)) continue
    if (/income\s+generat/.test(win)) continue
    if (/(increase|increasing|grow|growing|generate|generating|boost|raise|raising|additional|more|extra|matched?)\s+(?:its\s+|their\s+|your\s+|the\s+)?(?:annual\s+|earned\s+)?income/.test(win)) continue
    if (/pound for pound|match(?:ed|\s+trading|\s+funding)|%\s*of/.test(win)) continue

    // grant size: a grant/award/loan token immediately before, or "in funding" after
    if (/(grant|grants|award|awards|loan|loans|prize|bursary|donation|funding of|investment of)\b[^£]{0,18}$/.test(before)) continue
    if (/^[^£]{0,18}\b(in funding|in grant|in grants|grant funding|of funding)\b/.test(after)) continue

    const b = before.slice(-34)
    let direction: Direction | null = null
    let exclStyle = false
    let confidence: IncomeGateConfidence = 'high'

    if (MAX_RE.test(b)) {
      direction = 'max'
    } else if (EXCL_RE.test(b)) {
      const exclusionCtx = isExclusions || NEG_MARKER_RE.test(win)
      direction = exclusionCtx ? 'max' : 'min'
      exclStyle = true
      confidence = exclusionCtx ? 'med' : 'low'
    } else if (MIN_RE.test(b)) {
      direction = 'min'
    } else if (/\bbetween\s*$/.test(b)) {
      // lower bound of a band; range pass captures the upper bound separately
      direction = 'min'
      confidence = 'med'
    } else {
      // figure sits next to an income word but has no comparator — unresolved
      acc.bareValues.add(value)
      acc.gatePresent = true
      continue
    }

    acc.gatePresent = true
    acc.candidates.push({
      value,
      direction,
      exclStyle,
      confidence,
      snippet: cleanSnippet(beforeRaw + m[0] + afterRaw),
    })
  }
}

export function extractIncomeGate(input: IncomeGateInput): IncomeGateResult {
  const acc: ScanAcc = { candidates: [], bareValues: new Set(), gatePresent: false, noUpper: false }

  scanField(input.description ?? '', false, acc)
  scanField((input.eligibilityCriteria ?? []).join('  '), false, acc)
  scanField(input.whoCanApply ?? '', false, acc)
  scanField(input.exclusions ?? '', true, acc)

  const gate = acc.gatePresent
  const unresolved: IncomeGateResult = { gateLanguagePresent: gate }

  const maxCands = acc.candidates.filter(c => c.direction === 'max')
  const minCands = acc.candidates.filter(c => c.direction === 'min')
  const maxValues = new Set(maxCands.map(c => c.value))
  const minValues = new Set(minCands.map(c => c.value))

  // "income under £V" + "income over £V" describe one threshold — drop the
  // exclusion-style floor that mirrors a cap of the same value.
  for (const c of minCands) {
    if (c.exclStyle && maxValues.has(c.value)) minValues.delete(c.value)
  }
  if (acc.noUpper) maxValues.clear()

  // Conflicting caps or floors → don't guess.
  if (maxValues.size > 1 || minValues.size > 1) return unresolved

  const maxVal = maxValues.size === 1 ? Array.from(maxValues)[0] : undefined
  const minVal = minValues.size === 1 ? Array.from(minValues)[0] : undefined

  // An unexplained bare figure (distinct from any resolved value) means there
  // are multiple thresholds we can't disambiguate.
  for (const bv of Array.from(acc.bareValues)) {
    if (bv !== maxVal && bv !== minVal) return unresolved
  }

  if (maxVal === undefined && minVal === undefined) return unresolved
  if (maxVal !== undefined && minVal !== undefined && minVal >= maxVal) return unresolved

  const primary =
    (maxVal !== undefined ? maxCands.find(c => c.value === maxVal) : undefined) ??
    (minVal !== undefined ? minCands.find(c => c.value === minVal) : undefined)

  const result: IncomeGateResult = { gateLanguagePresent: gate }
  if (maxVal !== undefined) result.maxOrgIncome = maxVal
  if (minVal !== undefined) result.minOrgIncome = minVal
  if (primary) result.citation = { snippet: primary.snippet, confidence: primary.confidence }
  return result
}

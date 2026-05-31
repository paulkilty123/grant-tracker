// Deterministic social-investment terms extractor.
//
// Lights up the inert `investmentChecks` branch of eligibility.ts for the ~39
// active investment grants (every si_* column is currently null). Like
// extract-income-gate.ts it is NOT an LLM call — plain regex over text we
// already store, tuned against the live investment catalogue (2026-05-31).
//
// Scope is deliberately narrow — only the two fields that are clean enough to
// write without guessing:
//   - si_security_required   → drives the asset-lock conflict check
//   - si_interest_rate_percent → drives charity_repayable_finance
//
// Everything else is left null on purpose (see notes per field):
//   - si_min / si_max investment: the scraper already puts the ticket into
//     amount_min/amount_max, and eligibility.ts now falls back to amount_min,
//     so re-deriving the ticket from prose only adds noise. Reported as a
//     conflict list when text and amount disagree, never written.
//   - si_repayment_term_months: every catalogue value is a RANGE ("2–10 years",
//     "up to 15 years"); a single scalar would be a guess → leave null.
//   - si_instrument_type: informational, not verdict-driving.
//
// Conditional / compound / ambiguous → leave null and surface for human review,
// per the income-gate Group D principle.

export type InvestmentConfidence = 'high' | 'med' | 'low'

export interface InvestmentTermsInput {
  description?: string | null
  eligibilityCriteria?: string[] | null
  whoCanApply?: string | null
  exclusions?: string | null
  typicalAward?: string | null
  // Existing ticket fields, used only to flag prose/amount conflicts.
  amountMin?: number | null
  amountMax?: number | null
}

export interface InvestmentCitation {
  snippet: string
  confidence: InvestmentConfidence
}

export interface InvestmentTicketConflict {
  textMin?: number
  textMax?: number
  snippet: string
}

export interface InvestmentTermsResult {
  // Only ever 'required' or undefined. We never write a negative ("unsecured")
  // because the engine keyword-matches the string and "unsecured" must NOT fire.
  securityRequired?: 'required'
  securityCitation?: InvestmentCitation

  // Single clean interest rate as a percent (e.g. 8 for "8% APR").
  interestRatePercent?: number
  interestCitation?: InvestmentCitation

  // Reporting only — never written. A prose ticket range that disagrees with
  // amount_min/amount_max (Group-D-style human-review signal).
  ticketConflict?: InvestmentTicketConflict

  // Reporting only — true when a repayment-term range is present (always null).
  termRangePresent?: boolean

  // Human-facing reasons (what fired, what was rejected and why).
  notes: string[]
}

// ── Security ──────────────────────────────────────────────────────────────────
// Genuine demands for collateral / a charge / a guarantee. "asset-lock" is an
// org property (eligibility), NOT a fund security demand, so it is excluded.
const SECURITY_POS_RE = /\b(?:secured\s+(?:loan|lending|finance|facilit|term\s+loan)|loan[-\s]to[-\s]value|\bltv\b|security\s+(?:is\s+|will\s+be\s+|may\s+be\s+)?required|requires?\s+(?:a\s+)?security|takes?\s+(?:a\s+)?(?:legal\s+)?charge|charge\s+over\s+(?:assets|property|the\s)|secured\s+(?:against|on)|mortgage(?:d|s)?\b|personal\s+guarantees?\s+(?:are\s+|is\s+|may\s+be\s+|will\s+be\s+)?required|collateral\s+(?:is\s+)?required)/gi

// A negation anywhere earlier in the same sentence flips a security phrase to
// the "not required" case — e.g. "No personal guarantees required".
const SECURITY_NEG_BEFORE_RE = /\b(?:no|not|without|never|cannot|unable\s+to|aren['’]?t|isn['’]?t|don['’]?t|won['’]?t)\b[^.]{0,45}$/i

// Explicit no-security language → keeps the field null (the "not required" case).
const UNSECURED_RE = /\b(unsecured|no\s+security|without\s+security|no\s+personal\s+guarantees?|no\s+collateral|no\s+charge\s+over)\b/i

// ── Interest ─────────────────────────────────────────────────────────────────
// A percent that is explicitly described as an interest / APR rate. Anything
// labelled as a return, a grant proportion, a share of customers, a match, a
// dividend or an equity stake is rejected by construction (those words are not
// in these patterns, and a guard below drops a % sitting next to them).
// The interest cue must be ADJACENT to the % (immediately before or after).
// Blended-finance products always mention "grant" near the rate, so a broad
// noise window wrongly vetoes good rates — adjacency is the reliable signal.
const INTEREST_RE_LIST: RegExp[] = [
  // cue AFTER the %: "8% APR", "3% interest", "6.5% flat interest", "8.5% fixed", "7.5% per annum"
  /(\d+(?:\.\d+)?)\s?%\s*(?:flat\s+|fixed\s+)?(?:apr\b|interest\b|per\s+annum\b|p\.?a\.?\b|fixed\b|flat\s+rate\b)/gi,
  // cue BEFORE the %: "interest rate of 7.5%", "interest of 3%", "APR of 8%", "fixed interest rate of 6.5%"
  /(?:interest(?:\s+rate)?(?:\s+of)?|apr(?:\s+of)?|fixed\s+interest\s+rate(?:\s+of)?)\s*(?:is\s+|at\s+|currently\s+)?(\d+(?:\.\d+)?)\s?%/gi,
]
// A % that is the upper bound of a range ("5–7% interest") is a rate range, not
// a single rate → leave null per the conditional/compound principle.
const RATE_RANGE_BEFORE_RE = /\d+(?:\.\d+)?\s*(?:-|–|—|to)\s*$/

// ── Ticket (reporting only) ──────────────────────────────────────────────────
const FIGURE_RE = /£\s?([0-9][0-9,.]*)(?:\s?(thousand|million|billion|bn|k|m))?(?![a-z0-9])/gi
// A £-range introduced by an investment / loan cue: "loans from £X to £Y",
// "invest between £X and £Y", "£X–£Y".
const TICKET_RANGE_RE = /\b(?:loan|loans|invest(?:ment|ments)?|finance|facilit(?:y|ies)|borrow|lend(?:ing)?|ticket|deals?|from)\b[^.£\n]{0,40}?£\s?([0-9][0-9,.]*)(?:\s?(thousand|million|billion|bn|k|m))?(?![a-z0-9])[^£\n]{0,16}?(?:to|and|up\s+to|–|—|-|&)\s*£\s?([0-9][0-9,.]*)(?:\s?(thousand|million|billion|bn|k|m))?(?![a-z0-9])/gi

const TERM_RANGE_RE = /\b(?:repaid|repayment|repay|term|over|up\s+to|loan)\b[^.\n]{0,30}?\b(\d+)\s*(?:to|–|—|-|and)\s*(\d+)\s*(?:year|yr|month|mo)/i
const TERM_UPTO_RE = /\bup\s+to\s+(\d+)\s*(?:year|yr)s?\b/i

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

function windowAround(text: string, idx: number, span = 55): string {
  return text.slice(Math.max(0, idx - span), idx + span).toLowerCase()
}

interface Acc {
  security?: { snippet: string }
  unsecuredSeen: boolean
  interestRates: Map<number, string> // rate → snippet
  rateRangeSeen: boolean
  ticketRanges: { lo: number; hi: number; snippet: string }[]
  termRangeSeen: boolean
}

function scan(text: string, acc: Acc): void {
  if (!text) return

  // ── Security ──
  if (!acc.security) {
    SECURITY_POS_RE.lastIndex = 0
    for (const m of Array.from(text.matchAll(SECURITY_POS_RE))) {
      const idx = m.index ?? 0
      // Negation earlier in the sentence flips it to "not required".
      const sentenceStart = text.lastIndexOf('.', idx)
      const before = text.slice(sentenceStart + 1, idx)
      if (SECURITY_NEG_BEFORE_RE.test(before)) continue
      // Reject domain nouns ("energy security", "financial security").
      const win = windowAround(text, idx, 40)
      if (/\b(energy|food|financial|job|housing|data|national)\s+security\b/.test(win)) continue
      acc.security = { snippet: cleanSnippet(text.slice(Math.max(0, idx - 60), idx + 90)) }
      break
    }
  }
  if (UNSECURED_RE.test(text)) acc.unsecuredSeen = true

  // ── Interest ──
  for (const re of INTEREST_RE_LIST) {
    re.lastIndex = 0
    for (const m of Array.from(text.matchAll(re))) {
      const rate = parseFloat(m[1])
      if (!isFinite(rate) || rate <= 0 || rate > 60) continue
      const idx = m.index ?? 0
      // Index of the captured number within the full match, to test what sits
      // immediately before it (range upper-bound guard).
      const numOffset = m[0].indexOf(m[1])
      const beforeNum = text.slice(Math.max(0, idx + numOffset - 8), idx + numOffset)
      if (RATE_RANGE_BEFORE_RE.test(beforeNum)) { acc.rateRangeSeen = true; continue }
      if (!acc.interestRates.has(rate)) {
        acc.interestRates.set(rate, cleanSnippet(text.slice(Math.max(0, idx - 50), idx + 50)))
      }
    }
  }

  // ── Ticket range (reporting only) ──
  for (const m of Array.from(text.matchAll(TICKET_RANGE_RE))) {
    const lo = parseFigure(m[1], m[2])
    const hi = parseFigure(m[3], m[4])
    if (isFinite(lo) && isFinite(hi) && lo > 0 && hi > 0 && lo < hi) {
      // Skip turnover/income ranges — those are an org gate, not the ticket.
      const idx = m.index ?? 0
      const win = windowAround(text, idx, 30)
      if (/\b(income|turnover|annual\s+budget)\b/.test(win)) continue
      acc.ticketRanges.push({ lo, hi, snippet: cleanSnippet(m[0]) })
    }
  }

  // ── Term (reporting only) ──
  if (TERM_RANGE_RE.test(text) || TERM_UPTO_RE.test(text)) acc.termRangeSeen = true
}

export function extractInvestmentTerms(input: InvestmentTermsInput): InvestmentTermsResult {
  const acc: Acc = {
    unsecuredSeen: false,
    interestRates: new Map(),
    rateRangeSeen: false,
    ticketRanges: [],
    termRangeSeen: false,
  }

  scan(input.description ?? '', acc)
  scan((input.eligibilityCriteria ?? []).join('  '), acc)
  scan(input.whoCanApply ?? '', acc)
  scan(input.exclusions ?? '', acc)
  scan(input.typicalAward ?? '', acc)

  const notes: string[] = []
  const result: InvestmentTermsResult = { notes }

  // ── Security ──
  if (acc.security) {
    result.securityRequired = 'required'
    result.securityCitation = { snippet: acc.security.snippet, confidence: 'high' }
    notes.push('security: required (collateral/charge/guarantee language)')
  } else if (acc.unsecuredSeen) {
    notes.push('security: explicitly unsecured → left null')
  }

  // ── Interest ──
  if (acc.interestRates.size === 1) {
    const [rate, snip] = Array.from(acc.interestRates.entries())[0]
    result.interestRatePercent = rate
    result.interestCitation = { snippet: snip, confidence: 'high' }
    notes.push(`interest: ${rate}% (single clean rate)`)
  } else if (acc.interestRates.size > 1) {
    notes.push(`interest: ${acc.interestRates.size} conflicting rates → left null`)
  } else if (acc.rateRangeSeen) {
    notes.push('interest: rate is a range → left null')
  }

  // ── Ticket conflict (reporting only) ──
  if (acc.ticketRanges.length > 0) {
    // Take the widest prose range; compare to the stored amount window.
    const lo = Math.min(...acc.ticketRanges.map(r => r.lo))
    const hi = Math.max(...acc.ticketRanges.map(r => r.hi))
    const aMin = input.amountMin ?? null
    const aMax = input.amountMax ?? null
    const disagrees =
      (aMin != null && aMin > 0 && Math.abs(lo - aMin) / Math.max(lo, aMin) > 0.1) ||
      (aMax != null && aMax > 0 && Math.abs(hi - aMax) / Math.max(hi, aMax) > 0.1)
    if (disagrees) {
      result.ticketConflict = {
        textMin: lo,
        textMax: hi,
        snippet: acc.ticketRanges[0].snippet,
      }
      notes.push(`ticket: prose £${lo.toLocaleString()}–£${hi.toLocaleString()} disagrees with amount £${(aMin ?? 0).toLocaleString()}–£${(aMax ?? 0).toLocaleString()} → si_min/max left null`)
    }
  }

  if (acc.termRangeSeen) {
    result.termRangePresent = true
    notes.push('term: range present → si_repayment_term_months left null')
  }

  return result
}

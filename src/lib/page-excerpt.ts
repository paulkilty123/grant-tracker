// Keeping the part of a long funder page that answers the question.
//
// Lifted out of verification/verify-row.ts on 2026-08-28, unchanged, because
// enrich-grant needed the same thing and had been taking a naive prefix
// instead. Two callers, one behaviour: a page read for a brief and a page read
// for a verdict should not disagree about which 12,000 characters they saw.
//
// WHY A PREFIX IS THE WRONG 12,000
//
// Measured on Bentley's fund page: 53,919 characters, and the sentence "annual
// income of under £500,000" sits at character 30,596. Every one of the nine
// relevant keyword hits fell beyond a naive prefix cap, so the model was shown
// marketing copy and truthfully reported that the page stated no eligibility
// detail. The engine was not wrong; it was starved.
//
// Measured again on AF3: Supporting Partners (2026-08-28), which is what
// brought the enrich route here. That page is 72,220 characters. Its first
// 12,000 are WordPress inline CSS; "£10,000" sits at 15,468, "Closing date" at
// 15,897 and "Who can apply" at 20,077. The brief that came back described
// organisations the funder had already given money to, put the typical award at
// £29,000 to £75,000 off the awards table, and recorded "no source found" for
// how to apply — of a page carrying an Apply now button. Nothing in it was
// invented. It was all true of the slice that was sent.
//
// A cap that says nothing is what makes this plausible rather than obvious, so
// excerptWithMeta reports the cut and callers put it in front of the model.

export const PAGE_CAP = 12000

/** Words that mark the part of a funder page we actually need. */
export const RELEVANCE = /income|turnover|deadline|closing date|closes|apply by|eligib|unsolicited|invitation|invited|rolling|year round|not accept|criteria|who can apply|£\s?[\d,]+/gi

export type Excerpted = {
  /** The text to send. Dropped stretches are marked ' […] '. */
  text: string
  /** True when anything was dropped, so a caller can say so rather than imply completeness. */
  capped: boolean
  /** Length before excerpting, so "we read 12k of 72k" can be recorded. */
  originalLength: number
}

/**
 * Keep the parts of a long page that matter, not merely the first 12,000
 * characters.
 *
 * The opening is always kept, because the gate needs it to tell which fund the
 * page is about. The rest of the budget goes to the highest-scoring windows, in
 * document order, with a marker where text was dropped so a quote is never
 * silently stitched across a gap.
 */
export function excerptWithMeta(text: string, cap = PAGE_CAP): Excerpted {
  const originalLength = text.length
  if (text.length <= cap) return { text, capped: false, originalLength }

  const HEAD = 3000                       // enough to identify the fund
  const WINDOW = 1500
  const head = text.slice(0, HEAD)
  const rest = text.slice(HEAD)

  const windows: { start: number; score: number }[] = []
  for (let i = 0; i < rest.length; i += WINDOW) {
    const chunk = rest.slice(i, i + WINDOW)
    windows.push({ start: i, score: (chunk.match(RELEVANCE) ?? []).length })
  }

  const budget = cap - HEAD
  const chosen = windows
    .filter(w => w.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.floor(budget / WINDOW)))
    .sort((a, b) => a.start - b.start)

  // Nothing on the page scores. A prefix is no worse than any other slice here,
  // and it is still a cut, so it is still reported as one.
  if (chosen.length === 0) return { text: text.slice(0, cap), capped: true, originalLength }

  let out = head
  let prevEnd = 0
  for (const w of chosen) {
    if (w.start > prevEnd) out += ' […] '
    out += rest.slice(w.start, w.start + WINDOW)
    prevEnd = w.start + WINDOW
  }
  return { text: out.slice(0, cap), capped: true, originalLength }
}

/** Text-only form, for callers that have nowhere to put the flag. */
export function excerpt(text: string, cap = PAGE_CAP): string {
  return excerptWithMeta(text, cap).text
}

/**
 * What to tell the model when it is holding an excerpt rather than a page.
 *
 * Without this the model reports absence as fact: AF3 came back with four
 * fields at "no_source_found", each of which the page does state, outside the
 * slice. Absence of evidence in an excerpt is not evidence of absence on the
 * page, and the prompt is where that distinction has to live.
 */
export function excerptNotice(meta: Excerpted): string {
  if (!meta.capped) return ''
  return `NOTE: the page below is an EXCERPT of ${meta.originalLength.toLocaleString('en-GB')} characters, `
    + 'chosen around funding, eligibility and date wording. Dropped stretches are marked […]. '
    + 'If a detail is not present, say it was not found IN THIS EXCERPT — do not state that the funder does not publish it.\n\n'
}

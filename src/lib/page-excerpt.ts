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
// AF3: Supporting Partners (2026-08-28) is what brought the enrich route here.
// The brief that came back described organisations the funder had already given
// money to, put the typical award at £29,000 to £75,000 off the awards table,
// and recorded "no source found" for how to apply — of a page carrying an Apply
// now button. Nothing in it was invented. It was all true of the slice sent.
//
// CORRECTED 2026-08-28, after the fix shipped: an earlier version of this note
// said AF3's first 12,000 characters were WordPress inline CSS. That was true of
// a crude `sed 's/<[^>]*>//'` used while measuring, and NOT of this route, which
// strips <style> before excerpting. Stripped properly the page is 33,682
// characters with "£10,000" at 362 — a prefix would have been fine.
//
// AF3's actual failure was one layer up: covenantfund.org.uk 401s the production
// egress, so the route fell back to the reader proxy, which returned a 23,947
// character rendering that did not contain the fund's terms AT ALL — no amount,
// no closing date, no "Who can apply", but the whole awards table. Excerpting
// cannot recover text that was never fetched, and the third attempt only
// succeeded because the page was supplied directly.
//
// Kept here because the correction is the point: this module fixes a real bug
// that Bentley demonstrates, and it did not fix the row it was written for.
//
// A cap that says nothing is what makes this plausible rather than obvious, so
// excerptWithMeta reports the cut and callers put it in front of the model.

export const PAGE_CAP = 12000

/** Words that mark the part of a funder page we actually need. */
// Round wording added 2026-09-02, from JJ Charitable Trust: its page runs 834
// characters over the cap, and its "Timeline" says "grants three times per
// year", "cut-off points" and "applications by 4th March 2026". None of that
// scored, so the only window with the dates was the one dropped, and the brief
// reported that the source states no application windows. "applications by"
// is not "apply by"; a round is not a deadline; a cut-off is not a closing
// date. The scorer now knows all three, plus the date shape itself.
export const RELEVANCE = /income|turnover|deadline|closing date|closes|apply by|applications? by|cut-?off|grant round|funding round|application window|times (?:a|per) year|decision within|eligib|unsolicited|invitation|invited|rolling|year round|not accept|criteria|who can apply|£\s?[\d,]+|\b\d{1,2}(?:st|nd|rd|th)? (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{4}\b/gi

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

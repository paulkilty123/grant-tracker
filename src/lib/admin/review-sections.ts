/**
 * Grouping the review queue by the ACTION a row needs, not by the code that
 * flagged it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS REPLACES 18 CHIPS
 *
 * "Why held" listed every reason code as its own filter. That is a faithful
 * rendering of the data and a poor rendering of the work: a reviewer does not
 * think "show me amount_ungrounded", they think "which of these can I publish,
 * and which need me to go and read something". Eighteen chips is a list of
 * causes where five sections is a plan.
 *
 * Paul, 2026-08-17, specifying the groups: ready to publish · needs reading ·
 * needs my judgement · link is dead or points at the wrong fund · nothing
 * truthful to show.
 *
 * THE LINK SECTION IS NARROWER THAN THE CHIPS IT REPLACES, and deliberately:
 *
 *   > A link landing on a funder's homepage is fine and shouldn't appear as a
 *   > problem; only dead links and pages that aren't about the fund belong there.
 *
 * So `link_unverified` is NOT here. It means "we have not checked", not "it is
 * broken" — 57 of its 60 rows were `url_status = 'unchecked'` — and the publish
 * gate already declines to block on it for that reason.
 *
 * Three placements that are judgements rather than lookups, all confirmed by
 * Paul on 2026-08-17:
 *
 *   page_unreadable  → READING, not links. A page we cannot fetch is usually a
 *                      bot wall, and the reader proxy clears about sixteen such
 *                      hosts. Filing it as a dead link is the false-dead problem
 *                      this catalogue has already had once.
 *   quarantined      → READING. The automated chain stopped; the fix is to clear
 *                      the reason and re-run it, not to make a decision.
 *   deadline_passed  → JUDGEMENT. A past date with a live round behind it is a
 *                      correction; without one it is a removal. The abstain rule
 *                      exists because that difference needs a person.
 */

import type { ReviewReasonCode } from './review-reasons'
import type { EvidenceSummary } from './evidence-summary'

export type SectionId = 'ready' | 'link' | 'reading' | 'judgement' | 'untruthful'

export const SECTIONS: { id: SectionId; label: string; detail: string }[] = [
  { id: 'ready',      label: 'Ready to publish',
    detail: 'Nothing on these is blocking. Accepting one changes what users can find today.' },
  { id: 'link',       label: 'The link is dead, or the page is not about this fund',
    detail: 'A link that goes nowhere, or loads a page describing something else. A homepage is not a problem and is not here.' },
  { id: 'reading',    label: 'Needs reading',
    detail: 'Nobody, human or machine, has read the funder’s page for these. No judgement is possible until something has.' },
  { id: 'judgement',  label: 'Needs your judgement',
    detail: 'The page was read and what it says is genuinely arguable. These are the ones only you can settle.' },
  { id: 'untruthful', label: 'Nothing truthful to show',
    detail: 'The row cannot be made honest as it stands — no funder, or the page says the fund is gone.' },
]

/**
 * Which section a blocking code belongs to.
 *
 * Order of the lookup does not matter; `sectionOf` resolves a row carrying
 * several codes by SECTION PRIORITY, not by which code came first.
 */
const CODE_SECTION: Partial<Record<ReviewReasonCode, SectionId>> = {
  // ── The link is dead or wrong ──
  link_dead:                     'link',
  page_describes_different_fund: 'link',

  // ── Nothing has read the page ──
  never_verified:  'reading',
  no_brief:        'reading',
  page_unreadable: 'reading',
  quarantined:     'reading',
  stale_enrichment:'reading',

  // ── Nothing truthful to show ──
  no_funder:              'untruthful',
  page_says_delisted:     'untruthful',
  page_says_not_funding:  'untruthful',
  page_says_round_closed: 'untruthful',
  no_current_timing:      'untruthful',

  // ── Everything else that blocks is a judgement ──
  deadline_passed:        'judgement',
  deadline_implausible:   'judgement',
  amount_ungrounded:      'judgement',
  amount_pot_suspected:   'judgement',
  amount_under_stated:    'judgement',
  amount_inverted:        'judgement',
  amount_zero:            'judgement',
  multi_round_uncaptured: 'judgement',
  applicant_not_social_sector: 'judgement',
  applicant_individual_only:   'judgement',
  user_flagged:           'judgement',
  tags_changed:           'judgement',
}

/**
 * Most-blocking-first. A row with a dead link AND a shaky amount is a link
 * problem: fixing the amount cannot help while the link goes nowhere, so
 * putting it under judgement would ask for a decision that changes nothing.
 */
const SECTION_PRIORITY: SectionId[] = ['untruthful', 'link', 'reading', 'judgement']

/**
 * Which section this row belongs in.
 *
 * Takes the BLOCKING codes only, as plain strings. They are resolved on the
 * server (`gate.blocking`) because the blocking set lives in `publish-gate.ts`,
 * which pulls server modules that must not reach a client component.
 */
export function sectionOf(blockingCodes: readonly string[]): SectionId {
  if (blockingCodes.length === 0) return 'ready'
  const hit = new Set<SectionId>()
  for (const code of blockingCodes) {
    const s = CODE_SECTION[code as ReviewReasonCode]
    if (s) hit.add(s)
  }
  for (const s of SECTION_PRIORITY) if (hit.has(s)) return s
  // A blocking code with no mapping is a judgement rather than a silent drop:
  // an unmapped code must never make a row vanish from the screen.
  return 'judgement'
}

/**
 * How strong the evidence behind a row is, safest first.
 *
 * Paul, 2026-08-17: "sort by evidence strength — page confirms us, page silent,
 * page contradicts us, page is about a different fund. Safest at the top, so I
 * can accept down to a line and stop where I get uneasy."
 *
 * The axis is only meaningful because 647 of 649 live rows have now been read.
 * A year ago every row would have scored `silent` and the sort would have been
 * decoration.
 *
 * A row that both confirms and contradicts ranks as CONTRADICTS. The riskier
 * signal decides, because the purpose of the order is to let someone stop
 * reading when they get uneasy — and a row with a contradiction in it should
 * appear below the point where that happens, not above it.
 */
export function evidenceRank(ev: EvidenceSummary | null): 0 | 1 | 2 | 3 {
  if (!ev) return 1
  if (ev.outcome === 'fixable_link: wrong_fund') return 3
  if ((ev.counts?.contradicted ?? 0) > 0) return 2
  if ((ev.counts?.confirmed ?? 0) > 0) return 0
  return 1
}

export const EVIDENCE_RANK_LABEL: Record<0 | 1 | 2 | 3, string> = {
  0: 'page confirms us',
  1: 'page silent',
  2: 'page contradicts us',
  3: 'page is about a different fund',
}



/**
 * Where a row came from, collapsed to the three origins that mean something to
 * a person watching intake.
 *
 * `source` carries 30-odd values, most of them the name of the scraper that
 * found the row — `gov_uk`, `tyne_wear_cf`, `arts_council_wales`. Those are
 * useful for debugging a crawler and useless for the question Paul is actually
 * asking, which is "where are new funds coming from": something we went looking
 * for, something a scheduled crawl brought back, or something a person typed.
 *
 * Anything unrecognised is CRAWL rather than manual. A new scraper added next
 * month should read as machine intake without anyone remembering to update this
 * list; only the handful of sources a human can actually be responsible for are
 * named, and misfiling one of those as manual would overstate how much of the
 * catalogue a person curated.
 */
export type ArrivalOrigin = 'discovery' | 'crawl' | 'manual'

const DISCOVERY = /^(discovery_queue|deep_search|research_batch|discovery|gemini)/i
const MANUAL    = /^(manual|catalogue-seed|seed|admin)/i

export function arrivalOrigin(source: string | null): ArrivalOrigin {
  if (!source) return 'crawl'
  if (DISCOVERY.test(source)) return 'discovery'
  if (MANUAL.test(source)) return 'manual'
  return 'crawl'
}

export const ORIGIN_LABEL: Record<ArrivalOrigin, string> = {
  discovery: 'Discovery',
  crawl:     'Crawl',
  manual:    'Added by hand',
}

/** Rows first seen within this many days count as new arrivals. */
export const NEW_ARRIVAL_DAYS = 7

export function isNewArrival(firstSeenAt: string | null, now: Date = new Date()): boolean {
  if (!firstSeenAt) return false
  const t = Date.parse(firstSeenAt)
  if (Number.isNaN(t)) return false
  return now.getTime() - t <= NEW_ARRIVAL_DAYS * 24 * 60 * 60 * 1000
}


/**
 * One cause, not six consequences.
 *
 * Charity Bank showed seven chips: never read · never enriched · link unverified
 * · no amount · no deadline · no eligibility · no sectors. That is ONE fact —
 * nobody has read the page — and six things that are true only because of it.
 * Six chips of noise around one actionable sentence, and the reviewer has to
 * work out which is which.
 *
 * Paul, 2026-08-17: "Where a root cause explains the rest, state it in one
 * sentence and offer the single button that resolves it."
 *
 * ROOT causes, most-explanatory first. A dead link outranks an unread page
 * because re-reading a dead link cannot help.
 */
export const ROOT_CAUSES: readonly string[] = [
  'link_dead',
  'page_describes_different_fund',
  'page_unreadable',
  'quarantined',
  'never_verified',
  'no_brief',
]

/**
 * Codes that are CONSEQUENCES of not having a usable page read.
 *
 * Every one of these is an absence, and an absence cannot be judged until
 * something has been read. Deliberately excludes anything that asserts a
 * positive wrong value — a suspect amount or a passed deadline is a real finding
 * about data we hold, not a symptom of a missing read, and hiding it behind a
 * root cause would bury the row's actual defect.
 */
const CONSEQUENCE: ReadonlySet<string> = new Set([
  'link_unverified', 'no_amount', 'no_deadline', 'eligibility_missing',
  'sectors_missing', 'beneficiaries_generic_only', 'no_brief', 'never_verified',
  'stale_enrichment', 'amount_ungrounded',
])

/** The one cause worth stating, or null when the row has no single explanation. */
export function rootCauseOf(codes: readonly string[]): string | null {
  for (const c of ROOT_CAUSES) if (codes.includes(c)) return c
  return null
}

/**
 * Which of a row's reasons the root cause already explains, and can therefore
 * be collapsed behind Details.
 *
 * Returns an empty list when there is no root cause, so a row with genuinely
 * independent problems keeps showing all of them.
 */
export function explainedBy(root: string | null, codes: readonly string[]): string[] {
  if (!root) return []
  return codes.filter(c => c !== root && CONSEQUENCE.has(c))
}

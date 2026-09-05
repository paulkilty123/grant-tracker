import Anthropic from '@anthropic-ai/sdk'
import type { EvidenceInput } from '../field-evidence'
import { AMOUNT_UNSUPPORTED_NOTE, DEADLINE_UNSUPPORTED_NOTE } from '../field-evidence'
import { isOpeningEntry, type CycleEntry } from '../deadline-cycle'
import { asStructures, asExclusions, compareStructures, newExclusions, namesJurisdiction, quoteNamesAForm } from './eligibility'
// PAGE_CAP, RELEVANCE and excerpt moved to ../page-excerpt on 2026-08-28 so
// enrich-grant reads a page the same way this engine does — it had been taking
// a naive 12,000-character prefix. `excerpt` stays exported from here because
// it was already part of this module's surface.
import { PAGE_CAP, excerpt } from '../page-excerpt'
import { htmlToText } from '../page-text'
import { classifyPage, type UnreadableReason } from './page-readable'
export { excerpt } from '../page-excerpt'

/**
 * One visit per row: fetch the funder's page, decide whether it is usable, and
 * extract facts from that same fetch.
 *
 * The gate and the extraction are one model call, not two passes, so a page is
 * never fetched twice. A page that fails the gate produces no facts at all —
 * it becomes a fixable link instead, because the commonest failure in the
 * sample was not a bad answer but a good answer about the wrong thing.
 *
 * Three rules the sample of ten forced:
 *
 *  1. NAME THE FUND. Forever Manchester's funding page lists several funds and
 *     the extraction came back about "Voicescape Community Fund", whose deadline
 *     would have been written onto our row. The model must say which fund the
 *     page describes, and a mismatch fails the gate.
 *  2. NO DATE REASONING. Asked whether a fund was open, the model called 17 June
 *     "a future date" on 10 August. It now extracts dates only; open/closed is
 *     computed in code, where it is a comparison.
 *  3. NO QUOTE, NO FACT. Every value must carry a verbatim sentence from the
 *     page. A value the model cannot point at is not evidence.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUOTE-VERIFIED IS NOT MEANING-VERIFIED. Learned 2026-08-11, expensively.
 *
 * A check confirming the proposed value appears in the quoted sentence scored
 * max_org_income at 32/32. A random sample of five then found three wrong:
 *
 *   - Wax Chandlers': proposed a £200,000 income cap from "less than £200k in
 *     CASH AT BANK". Cash is not income. Worse, the same page carried the real
 *     limit — "Organisations with an annual income over £100,000" — so the
 *     right answer was present and the wrong one was taken, out by 2x.
 *   - Colwinston: proposed invite-only from "Eligible applicants will then be
 *     invited to submit a formal application". That is a two-stage process, not
 *     an invitation-only fund.
 *   - Ufi VocTech: proposed invite-only for the whole trust from "VocTech
 *     Ignite ... By invitation only" — a rule belonging to one of its four
 *     programmes, the only one users cannot apply to.
 *
 * Every quote was real and accurate ABOUT ITS OWN SUBJECT. The check catches
 * fabrication and is blind to misinterpretation, so it can only ever be a
 * floor. Two consequences, both structural:
 *
 *   a) A field is only proposable when the quote is about THAT field's concept.
 *      Income means organisational income or turnover — not cash at bank, not
 *      balance sheet, not headcount.
 *   b) A page describing several funds cannot answer questions about one row.
 *      Ufi's page covers four programmes with different rules; our catalogue
 *      holds one generic "Ufi VocTech Trust" row and three archived ones, two
 *      of which no longer exist. There is no correct value to extract, because
 *      the row does not correspond to a thing the funder offers. That is a
 *      catalogue-structure finding, not a field correction — see the
 *      `multiple_funds` outcome.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type VerifyRow = {
  id:              string
  title:           string
  funder:          string | null
  /** grant | programme | investment | in_kind. Scope is decided by this, not by the model. */
  funding_type?:   string | null
  apply_url:       string | null
  deadline:        string | null
  deadline_cycle:  unknown
  is_rolling:      boolean | null
  max_org_income:  number | null
  min_org_income?: number | null
  /** What the CARD tells a user they can ask for. Read so the page can be asked
   *  to support it, not merely to fail to contradict it. */
  amount_min?:     number | null
  amount_max?:     number | null
  is_invite_only:  boolean | null
  /** The matcher's hard gate. See eligibility.ts for why this is read here. */
  eligible_structures?: string[] | null
  /** Read-only context for the comparison: geography for the charity-form
   *  derivation, and the brief's own eligibility prose so an exclusion the page
   *  states is not reported as new when we already carry it. */
  location_tag?:   string | null
  funder_brief?:   Record<string, unknown> | null
  /** Pages a reviewer or a script has banked as the ones that state this
   *  fund's terms. Read before any guessed link when a figure we show is
   *  missing from apply_url: that is where the figure usually is. */
  grant_sources?:  { url?: string | null; label?: string | null }[] | null
}

export type GateFailure =
  | 'fetch_failed'      // network, timeout, non-200, bot wall
  | 'no_content'        // fetched but nothing usable came back
  | 'wrong_fund'        // page describes a different fund
  | 'no_funding_detail' // right place, but no eligibility/timing detail at all

export type Gate =
  | { pass: true;  fund_on_page: string | null }
  | { pass: false; failure: GateFailure; detail: string; fund_on_page?: string | null }

export type Fact<T> = { value: T | null; quote: string | null }

export type Extraction = {
  deadline:       Fact<string>   // ISO yyyy-mm-dd
  /** Per-applicant award size, NOT the size of the fund. */
  amount_min:     Fact<number>
  amount_max:     Fact<number>
  deadline_cycle: Fact<CycleEntry[]>
  is_rolling:     Fact<boolean>
  max_org_income: Fact<number>
  min_org_income: Fact<number>
  is_invite_only: Fact<boolean>
  still_listed:   Fact<boolean>
  is_grant:       Fact<boolean>
  /** Legal forms the page says MAY apply. */
  eligible_structures: Fact<string[]>
  /** Legal forms the page says may NOT. The only route to a removal. */
  excluded_structures: Fact<string[]>
  /** Who or what the page says it will not fund, in the funder's own words. */
  exclusions:     Fact<string[]>
}

export type Proposal = {
  field:   string
  from:    unknown
  to:      unknown
  quote:   string
  verdict: 'confirmed'
}

export type Outcome =
  | 'verified'          // gate passed, facts extracted
  | 'multiple_funds'    // page covers several funds; our row maps to none of them cleanly
  | 'round_closed'      // page states a deadline that has already passed
  | 'fixable_link'      // gate failed — surface to the admin as a link to fix
  | 'no_longer_listed'  // page says the fund is gone
  | 'not_a_grant'       // the thing described is not funding

export type VerifyResult = {
  id:        string
  title:     string
  funder:    string | null
  url:       string | null
  outcome:   Outcome
  gate:      Gate
  proposals: Proposal[]      // fields to change, each with its quote
  confirmed: string[]        // page agrees with what we hold — stamp as checked
  notFound:  string[]        // page does not address it — leave null
  /**
   * The same three findings in the shape `field_evidence` stores, one entry per
   * field the page was asked about: agrees true (confirmed), false (a proposal
   * is owed) or null (the page said nothing). This is the record that used to be
   * discarded — `confirmed` named the fields but dropped their quotes, so a run
   * that agreed with every stored value left no trace at all and the gate could
   * never tell "verified" from "never looked at".
   */
  evidence:  EvidenceInput[]
  notes:     string[]
  /** Set on round_closed: the passed date the page states, and its quote. */
  closedRound?: { deadline: string; quote: string }
  /** Set when the answer came from a page one level down from apply_url. */
  followedUrl?: string
  /** Every page this run actually read, apply_url first. One URL per row was
   *  the old limit and the reason evidence could not say where a fact came
   *  from; this is the row-level companion to per-field source_url. */
  pagesRead?: string[]
  /** Set on multiple_funds: what the page actually covers, for a split decision. */
  fundsOnPage?: string[]
  /** Set when a HOP landed on a multi-fund page. The row itself verified fine;
   *  the detail it is missing lives on a page that serves several funds, so no
   *  amount of re-reading will fill the gap. The fix is a catalogue split. */
  splitCandidate?: { url: string; funds: string[] }
  usage?:    { input: number; output: number }
}

// ── Fetch (mirrors enrich-grant, including the reader-proxy fallback) ────────

/** Link text or href that suggests the funding detail lives one level down. */
const FUNDING_LINK = /\b(grants?|funding|apply|applying|application|eligib|criteria|programmes?|how-we-fund|how-to-apply|open-funds?|our-funds?|what-we-fund|guidelines)\b/i

/**
 * Link text or href that suggests WHEN, rather than what or who.
 *
 * A row that already has funding detail and lacks dates is looking for a
 * different page from one that has nothing at all. Movement for Good's
 * /draw-dates scores zero on the funding vocabulary above and is the whole
 * answer to the question that row gets wrong.
 */
const TIMING_LINK = /\b(dates?|deadlines?|draws?|draw-dates|rounds?|closing|when-to-apply|key-dates|timetable|timeline|schedule|important-dates|application-process|apply-by)\b/i

/**
 * Link text or href that suggests WHO, rather than what or when.
 *
 * MEASUREMENT ONLY until the hop scope widens. `who can apply` and `guidelines`
 * are where the structure gate and the exclusions live on most funder sites,
 * and neither scores on TIMING_LINK. Greggs Foundation is the worked case:
 * greggsfoundation.org.uk links to /grants/, which FUNDING_LINK already finds —
 * but Berkshire's exclusions sit on /eligibility-criteria/ and Joseph Rank's on
 * /how-to-apply/guidelines/, which score 1 and 2 here against 0 for timing.
 */
const ELIGIBILITY_LINK = /\b(eligib|who-can-apply|who-we-fund|criteria|guidelines?|guidance|what-we-fund|what-we-don-?t-fund|exclusions?|restrictions?|requirements?|application-guidelines?)\b/i

/**
 * Obvious non-destinations, so we never wander into news or admin pages.
 *
 * `newsletters?` is spelled out because `\bnews\b` does not match it — the word
 * boundary needs a non-word character after "news", and "l" is a word
 * character. The measurement run on 16 August followed
 * norfolkfoundation.com/our-impact/newsletter-sign-up and
 * goodthingsfoundation.org/corporate-home/discover/newsletter.html, both of
 * which this was written to stop.
 */
const LINK_NOISE = /\b(news|newsletters?|blog|privacy|cookie|terms|contact|about-us|careers|jobs|login|account|donate|shop|press|media|policy|accessibility|sitemap)\b/i

/**
 * Candidate pages one level down, best first.
 *
 * A funder's landing page often describes the organisation and links to the
 * eligibility detail. The Julia Rausing Trust is the worked case: our apply_url
 * is the homepage, which truthfully states no eligibility, while
 * "The Trust does not accept unsolicited applications" sits on /grants/.
 * Without this the engine correctly reports "no funding detail" and the row
 * becomes a chore for a human, when the answer was one click away.
 *
 * Same host only, and never the page we just read.
 */
/**
 * Do two fund names refer to the same thing?
 *
 * Used to override the model when it contradicts itself. Measured on the
 * re-run: it returned describes_our_fund=false while naming the page's fund as
 * "Camden Climate Fund" against our "Camden Climate Fund", and did the same for
 * Stronger Communities Fund, Gatsby Charitable Foundation and Impact Hub
 * Programmes. A boolean that disagrees with the model's own answer in the next
 * field is not a judgement worth honouring, so the comparison is done here
 * where it is deterministic.
 *
 * Generic words are stripped because they carry no distinguishing information:
 * nearly every record contains "fund", "grants" or "trust".
 */
function namesMatch(ours: string, theirs: string): boolean {
  const norm = (v: string) => v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|a|an|of|for|and|fund|funds|grant|grants|programme|programmes|program|trust|foundation|charity|charitable|limited|ltd)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const a = norm(ours), b = norm(theirs)
  if (a.length < 3 || b.length < 3) return false
  return a === b || a.includes(b) || b.includes(a)
}

function sameSite(a: string, b: string): boolean {
  const norm = (h: string) => h.replace(/^www\./i, '').toLowerCase()
  return norm(a) === norm(b)
}

/**
 * Path segments that name a category rather than a fund. A URL made only of
 * these is an index page: it tells you the funder gives grants, not what the
 * rules of any particular one are.
 */
const GENERIC_SEGMENT = new RegExp(
  '^(' + [
    'home', 'index', 'en', 'en-gb', 'en-us', 'uk',
    'grant', 'grants', 'grant-funding', 'funding', 'fund', 'funds',
    'our-funds', 'our-fund', 'our-funding', 'our-grants', 'our-work',
    'what-we-fund', 'who-we-fund', 'what-we-do',
    'apply', 'apply-now', 'applying', 'application', 'applications',
    'apply-for-funding', 'applying-for-funding', 'apply-for-a-grant',
    'funding-programmes', 'grant-programmes', 'open-funds', 'live-funds',
    'how-to-apply', 'how-we-fund', 'get-funding', 'get-involved',
    'programme', 'programmes', 'program', 'programs',
    'support', 'charities', 'for-charities', 'community',
  ].join('|') + ')$', 'i',
)

/**
 * Is this the funder's front door rather than a page about one fund?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS. Learned 2026-08-15, on the engine's first live stamping run.
 *
 * Movement for Good's homepage produced `is_rolling: true` with the quote
 * "Nominations open all year". The quote is real, it is on the page, and it is
 * grounded. It is also wrong about the thing the surface renders: nominations
 * are collected all year, awards are made in six dated draws, and our own
 * catalogue holds a sibling row with a dated deadline that proves it. The draw
 * dates live on a subpage the engine never reads, because the hop only fires
 * when the first page has NO funding detail at all, and that homepage is rich
 * in funding detail.
 *
 * So a front door does not merely fail to answer the timing question. It
 * produces a confident, citable, WRONG answer to it, which is worse than
 * silence: a gate that requires evidence would have found some.
 *
 * The rule this supports is narrow and one-directional — see the `is_rolling`
 * handling in runModel. A front door may still take a claim DOWN. It may never
 * put one up.
 *
 * Judged on the twelve rows §3.1 of the tranche 2 design lists: bare domains
 * (movementforgood.com/, asdafoundation.org/, sibgroup.org.uk/) and single
 * generic segments (/our-funds/, /our-funding/, /en-gb) are front doors;
 * /local-community-fund, /live-funds/london-fund/ and /our-work/growth-fund/
 * are not. Two segments where the first is generic still count as specific,
 * because the second segment is doing the naming.
 */
/** A day-and-month date token, with or without a range and an ordinal. */
const DATE_TOKEN = /\b\d{1,2}(?:st|nd|rd|th)?\s*(?:[-–—/]\s*\d{1,2}(?:st|nd|rd|th)?\s*)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi

/** Language that means "this happens in rounds", as opposed to continuously. */
const ROUND_WORD = /\b(draws?|rounds?|windows?|cohorts?|closes?|closing|deadlines?|opens? (?:on|for)|application window|panel meets?)\b/i

/**
 * Does the page state dated application or award windows?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY. Learned 2026-08-15, on the acceptance test for multi-page sourcing.
 *
 * The hop worked: from movementforgood.com the engine found /draws/1000, the
 * right page, and quoted "Draw 2 7-11 September 100 x £1,000 awards". And it
 * STILL certified is_rolling as true, from the sentence "Nominations open all
 * year" sitting on that same page. Both sentences are true. Nominations are
 * collected continuously; awards are decided in dated draws. Only one of them
 * describes what the surface renders, which is a claim that you can apply and
 * be considered today.
 *
 * So reaching the right page is necessary and not sufficient. This is the third
 * instance in this file of the same defect — a real sentence, accurate about its
 * own subject, wrong about the field it was offered for — after cash-at-bank
 * for income and staged applications for invitation-only. The pattern holds:
 * extract in the model, decide in code.
 *
 * Two signals, both required, because either alone over-fires: a page needs at
 * least two day-and-month dates AND the vocabulary of rounds. "Founded in 1948"
 * and a single "closes 14 April" are not enough on their own.
 */
export function statesDatedWindows(pageText: string): boolean {
  if (!pageText) return false
  const dates = new Set((pageText.match(DATE_TOKEN) ?? []).map(d => d.toLowerCase().replace(/\s+/g, ' ')))
  return dates.size >= 2 && ROUND_WORD.test(pageText)
}

export function isFrontDoorUrl(url: string | null | undefined): boolean {
  if (!url) return false
  let u: URL
  try { u = new URL(url) } catch { return false }
  const segments = u.pathname
    .split('/')
    .filter(Boolean)
    .map(s => s.replace(/\.(html?|php|aspx?|jsp)$/i, ''))
  if (segments.length === 0) return true          // a bare domain is always a front door
  if (segments.length > 2)   return false         // deep enough that something is being named
  return segments.every(s => GENERIC_SEGMENT.test(s))
}

/**
 * What the hop is looking for. `funding` is the original behaviour: the first
 * page had nothing at all, so find the page that does. `timing` is for a page
 * that was right about everything except when, which is the commonest and most
 * damaging gap, because the surface fills it in with the word "Rolling".
 */
export type LinkWant = 'funding' | 'timing' | 'detail'

export function candidateLinks(
  pageSource: string, baseUrl: string, isMarkdown: boolean,
  want: LinkWant = 'funding',
  alreadySeen: readonly string[] = [],
): string[] {
  let base: URL
  try { base = new URL(baseUrl) } catch { return [] }

  const found: { url: string; score: number }[] = []
  // The seen set spans hops, not just this page, so a two-hop walk cannot
  // circle back to a page it has already spent a model call on.
  const seen = new Set<string>([base.href.replace(/\/$/, ''), ...alreadySeen])

  const pattern = isMarkdown
    ? /\[([^\]]{0,120})\]\(([^)\s]+)\)/g            // [text](href) from the reader proxy
    : /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,160}?)<\/a>/gi

  for (const m of Array.from(pageSource.matchAll(pattern))) {
    const rawHref = isMarkdown ? m[2] : m[1]
    const rawText = (isMarkdown ? m[1] : m[2]).replace(/<[^>]+>/g, ' ').trim()
    if (!rawHref || rawHref.startsWith('#') || /^(mailto|tel|javascript):/i.test(rawHref)) continue

    let abs: URL
    try { abs = new URL(rawHref, base) } catch { continue }
    // Compare hosts with "www." stripped. Sites commonly redirect apex to www,
    // so an apply_url of juliarausingtrust.org sits alongside links to
    // www.juliarausingtrust.org — a strict comparison rejected all twelve of
    // them, including the /grants page that holds the answer.
    if (sameSite(abs.host, base.host)) { /* keep */ } else continue
    if (/\.(pdf|jpe?g|png|gif|svg|zip|docx?|xlsx?)$/i.test(abs.pathname)) continue

    const key = abs.href.replace(/\/$/, '').split('#')[0]
    if (seen.has(key)) continue

    const haystack = `${abs.pathname} ${rawText}`
    const primary = want === 'timing' ? TIMING_LINK : want === 'detail' ? ELIGIBILITY_LINK : FUNDING_LINK

    // Noise in the PATH is disqualifying and nothing overrides it. Noise in the
    // link TEXT can be overridden by a path that names funding, because link
    // text is often a sentence that happens to mention the newsletter.
    //
    // The override used to apply to both, and /apply/privacy-policy passed it:
    // the path is noisy AND matches FUNDING_LINK on "apply", so the funding
    // clause cancelled the noise clause. On 16 August a hop read Wise Music
    // Foundation's privacy policy and returned a structure gate and an
    // exclusions list from it. Production has never done this — the timing hop
    // scores privacy pages at zero on TIMING_LINK — so the bug only becomes
    // reachable when the trigger widens, which is what the measurement was for.
    if (LINK_NOISE.test(abs.pathname)) continue
    if (LINK_NOISE.test(rawText) && !primary.test(abs.pathname) && !FUNDING_LINK.test(abs.pathname)) continue

    const primaryHits = (haystack.match(primary) ?? []).length
    // A timing hop still accepts a funding page, at a discount: on many sites
    // the dates live on /grants rather than on a page that says "dates". It
    // must not accept ONLY funding pages, or the bias does nothing.
    const fallbackHits = want === 'funding' ? 0 : (haystack.match(FUNDING_LINK) ?? []).length
    if (primaryHits === 0 && fallbackHits === 0) continue

    // Prefer a match in the path over one in link text, and shallower paths.
    const depth = abs.pathname.split('/').filter(Boolean).length
    const score = primaryHits * 4 + fallbackHits
      + (primary.test(abs.pathname) ? 5 : 0)
      + (want !== 'funding' && FUNDING_LINK.test(abs.pathname) ? 1 : 0)
      - depth
    seen.add(key)
    found.push({ url: abs.href, score })
  }

  return found.sort((a, b) => b.score - a.score).map(f => f.url).slice(0, 3)
}

async function fetchDirect(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
        // Brotli deliberately excluded — see enrich-grant for why.
        'Accept-Encoding': 'gzip, deflate',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()   // raw: links are extracted before stripping
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchViaReaderProxy(url: string): Promise<string> {
  const base = process.env.READER_PROXY_URL
  if (!base) throw new Error('reader proxy not configured')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/${url}`, {
      signal: controller.signal,
      headers: {
        Accept: 'text/plain',
        ...(process.env.READER_PROXY_KEY ? { Authorization: `Bearer ${process.env.READER_PROXY_KEY}` } : {}),
      },
    })
    if (!res.ok) throw new Error(`reader proxy HTTP ${res.status}`)
    return await res.text()   // raw markdown: links are extracted before excerpting
  } finally {
    clearTimeout(timeout)
  }
}

function stripHtml(html: string): string {
  // htmlToText, not a bare tag strip: a page that hydrates from a JSON blob on
  // the element reads as its own footer otherwise, and the gate then certifies
  // a row against 496 characters of postal address while every signal it has
  // says the fetch succeeded. See src/lib/page-text.ts.
  return excerpt(htmlToText(html))
}

export type Fetched =
  /** `source` is the raw page, kept so a later hop can re-score its links for a
   *  different question. `links` is the funding-biased default. */
  | { text: string; via: 'direct' | 'proxy'; links: string[]; source: string; url: string }
  | { error: string }

export async function fetchPage(url: string, forceProxy = false): Promise<Fetched> {
  const shape = (raw: string, via: 'direct' | 'proxy'): Fetched => {
    const isMarkdown = via === 'proxy'
    const links = candidateLinks(raw, url, isMarkdown)
    const text = isMarkdown
      ? excerpt(raw.replace(/\s{2,}/g, ' ').trim())
      : stripHtml(raw)
    return { text, via, links, source: raw, url }
  }

  if (!forceProxy) {
    try {
      return shape(await fetchDirect(url), 'direct')
    } catch (e) {
      const direct = e instanceof Error ? e.message : String(e)
      if (!process.env.READER_PROXY_URL) return { error: direct }
      try {
        return shape(await fetchViaReaderProxy(url), 'proxy')
      } catch (e2) {
        return { error: `${direct}; proxy: ${e2 instanceof Error ? e2.message : String(e2)}` }
      }
    }
  }
  // Escalation path. A direct fetch can return HTTP 200 and still be useless,
  // because the funding detail is rendered client-side — Bentley states an
  // income limit and two round deadlines that the stripped HTML does not
  // contain. Falling back only on a FAILED fetch misses exactly those pages, so
  // a gate failure re-reads through the proxy before giving up on the link.
  try {
    return shape(await fetchViaReaderProxy(url), 'proxy')
  } catch (e) {
    return { error: `proxy: ${e instanceof Error ? e.message : String(e)}` }
  }
}

// ── The single model call: gate + extraction together ────────────────────────

const MODEL = 'claude-haiku-4-5-20251001'

/**
 * `todayISO` is passed in, not read from the clock inside the template, so one
 * batch is judged against one day and the prompt is reproducible.
 *
 * The model was never told the date until 2026-08-20, which is why a page
 * reading "closes on Monday 21 September" came back as 2025-09-21: with no
 * reference point it fell back on its training prior. That put a past date on an
 * OPEN fund and kept Wiltshire & Swindon's Older People's Programme hidden from
 * users for four days.
 */
function buildPrompt(row: VerifyRow, pageText: string, todayISO: string): string {
  return `You are checking one catalogue record against the funder's own web page.

TODAY IS ${todayISO}. Use it whenever the page gives a date without a year.

OUR RECORD
  Fund title : ${row.title}
  Funder     : ${row.funder ?? 'unknown'}
  Page read  : ${row.apply_url}

THE PAGE TEXT
"""
${pageText}
"""

Answer in JSON only, no prose, no markdown fence.

STEP 1 — GATE. Decide whether this page can be used to verify OUR fund.
  "funds_on_page" : an array naming EVERY distinct funding programme this page
                    describes. One page often covers several. Use the funder's
                    own names. Empty array if none.
  "our_fund_is_one_of_them" : true if exactly one entry in funds_on_page is the
                    fund our record refers to. False if our record is generic
                    and the page offers several distinct programmes with
                    different rules — we cannot then tell which applies.
  "fund_on_page"  : the name of the fund this page actually describes, or null.
                    If the page lists several funds, name the one matching ours,
                    or null if ours is not among them.
  "describes_our_fund" : true if this page could reasonably be describing the
                    funding our record refers to.

                    Our fund title is often OUR OWN label rather than a name the
                    funder uses. "John Ellerman Foundation Grants" is simply our
                    way of saying "the grants that funder makes", and for a
                    record like that the funder's own grants, funding or
                    how-to-apply page IS the right page — answer true, even
                    though no fund of that exact name appears anywhere.

                    Allow naming variants freely: "Community Catalyst Fund
                    (2025-27)" and "The Community Catalyst Fund 2025 to 2027"
                    are the same fund, as are "Hyde Foundation" and "Hyde
                    Foundation Community Investment".

                    Answer false ONLY when BOTH of these hold: our record names
                    a SPECIFIC programme, AND this page is about a DIFFERENT
                    specific programme from the same funder. Also answer false
                    if the page has nothing to do with this funder's grant
                    making at all.
  "has_funding_detail" : true if the page states any eligibility, deadline,
                    amount or application detail. A general "about us" or news
                    page is false.

STEP 2 — FACTS. Only if the gate passed. For each, give the value AND a verbatim
quote of the sentence it came from. If the page does not state it, use
{"value": null, "quote": null}. NEVER infer, never use outside knowledge.

  "deadline"       : the closing date FOR THIS FUND as yyyy-mm-dd, or null. Do NOT
                     judge whether it has passed; just report the date the page
                     states. If the page lists several rounds or several
                     different funds, do NOT pick one of their dates for this
                     field — put the rounds in deadline_cycle and leave this
                     null.

                     IF THE PAGE GIVES NO YEAR, use the NEXT occurrence from
                     today. "closes on Monday 21 September", read today, means
                     the 21 September that is still ahead — never the one that
                     has gone. Funders write the year far less often than you
                     would expect, and a date put in the wrong year reads as a
                     closed fund and hides an open one.
  "deadline_cycle" : the page's whole schedule, when it names more than one round
                     or draw, as a list. Otherwise null. Each entry:
                       {"day":7,"month":9,"label":"Draw 2 closes"}
                     Use the day and month only, never the year: this describes a
                     repeating cycle. Label each entry with the page's own words,
                     and say whether it opens or closes, because an opening date
                     is not a deadline. A range like "7-11 September" closes on
                     the LAST day, so day 11.
  "is_rolling"     : true ONLY if the page explicitly says applications are
                     accepted year round / on a rolling basis, AND names no dated
                     rounds. A page that says nominations run all year and then
                     lists dated draws is NOT rolling: the draws are the rounds.
                     Absence of a deadline is NOT evidence of rolling — use null.
  "amount_min"     : the SMALLEST award a single applicant can receive, as a
                     plain number of pounds, or null. From wording like "grants
                     of between £5,000 and £50,000" or "we award from £1,000".
  "amount_max"     : the LARGEST award a single applicant can receive, as a
                     plain number of pounds, or null. From "up to £10,000",
                     "grants of up to £3,000", "maximum award £1,500".

                     These are about ONE APPLICANT, never the fund. "£2 million
                     is available this year", "a £500,000 programme" and "we
                     distributed £1.4m last year" are the size of the POT and
                     must be null. If the page gives only a pot, both are null.

                     A percentage or match is not an amount: "we match up to 50%
                     of your budget", "we fund up to 75% of project costs" — null
                     for both, because the cash figure depends on the applicant.

                     If the page names amounts for SEVERAL different funds and
                     none of them is clearly ours, use null rather than picking
                     one. Report only what THIS fund awards, and only if the page
                     says it. Never infer from the funder's size, the sector, or
                     what similar funders give.
  "max_org_income" : maximum applicant organisation annual income/turnover as a
                     plain number of pounds (e.g. 500000), or null.
  "min_org_income" : MINIMUM applicant organisation annual income/turnover, as a
                     plain number of pounds, or null. A band like "£250,000 to
                     £5 million" has a minimum of 250000 and a maximum of
                     5000000. Only when the page states a floor — most funds have
                     none, and inventing one hides the fund from every small
                     organisation that could win it.
  "eligible_structures" : the legal forms the page says MAY apply, as a list
                     drawn ONLY from this vocabulary:
                       registered_charity, cio, scio,
                       cic_guarantee, cic_shares, cic (if not specified),
                       ltd_guarantee, ltd_shares, llp,
                       cooperative, unincorporated, sole_trader,
                       not_registered, individual
                     "unincorporated" covers constituted community groups with no
                     legal registration — a residents' association, a committee
                     with a constitution and a bank account. This is the right
                     tag for "voluntary and community groups", which is how most
                     funders describe them.

                     "not_registered" is NARROWER and is the one to leave alone
                     when unsure. Use it ONLY where the page positively says an
                     organisation with NO constitution and NO registration at all
                     may apply — "you don't need to be constituted", "informal
                     groups welcome". It is NOT a synonym for "community group",
                     it does NOT follow from a page failing to demand charity
                     registration, and it must never be inferred from a list that
                     simply omits charities.

                     "individual" means a private person applying in their own
                     name, for themselves. A professional or a charity applying
                     ON BEHALF OF someone is NOT this: there the applicant is the
                     organisation and the individual is the beneficiary.

                     Null if the page does not say. Do NOT list a form merely
                     because the page fails to exclude it: only forms the page
                     positively names, in words a reader would recognise as that
                     form.
  "excluded_structures" : legal forms the page positively RULES OUT, same
                     vocabulary, or null. This is different from a form simply
                     not being mentioned — use it only for an explicit "we do not
                     fund X" / "X are not eligible".
  "structures_are_exhaustive" : true ONLY if the page presents its list as the
                     COMPLETE set of who may apply — "we can only consider
                     applications from...", "applicants must be...", "eligible
                     organisations are:" followed by a closed list. False or null
                     when the page merely gives examples, says "such as", or
                     describes some applicants without ruling others out. If you
                     are unsure, answer false: treating a partial list as complete
                     removes organisations that can genuinely apply.
  "exclusions"     : what the funder says it will NOT fund, as a list of short
                     phrases in the funder's own words — activities, costs,
                     purposes or applicant types. Null if the page states none.
                     Do not invent standard ones; only what this page says.
  "is_invite_only" : true if the page says applications are by invitation, or
                     that unsolicited applications are not accepted.
  "still_listed"   : false if the page indicates this fund has closed permanently,
                     been withdrawn, or is no longer offered. Note: a closed
                     application ROUND is not the same as a withdrawn fund.
  "is_grant"       : false ONLY if this is not a funding opportunity our
                     catalogue covers at all. We DELIBERATELY carry four kinds:
                       - grants
                       - programmes (accelerators, fellowships, support schemes)
                       - investment (loans, patient capital, social investment,
                         blended finance, community shares — repayable finance
                         IS in scope, answer true)
                       - in-kind (software credits, ad grants, free workspace,
                         pro bono services, discounted goods — also in scope)
                     So answer false only for things like a paid consultancy
                     service sold commercially, a job advert, a conference
                     ticket, or a page that offers the reader nothing at all.

Shape:
{"gate":{"funds_on_page":string[],"our_fund_is_one_of_them":bool,"fund_on_page":string|null,"describes_our_fund":bool,"has_funding_detail":bool},
 "facts":{"deadline":{"value":null,"quote":null},"deadline_cycle":{"value":null,"quote":null},
 "is_rolling":{"value":null,"quote":null},
 "amount_min":{"value":null,"quote":null},"amount_max":{"value":null,"quote":null},
 "max_org_income":{"value":null,"quote":null},"min_org_income":{"value":null,"quote":null},
 "eligible_structures":{"value":null,"quote":null},"excluded_structures":{"value":null,"quote":null},
 "structures_are_exhaustive":{"value":null,"quote":null},
 "exclusions":{"value":null,"quote":null},"is_invite_only":{"value":null,"quote":null},
 "still_listed":{"value":true,"quote":null},"is_grant":{"value":true,"quote":null}}}`
}

function parseJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try { return JSON.parse(cleaned) } catch { /* fall through */ }
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) return null
  try { return JSON.parse(match[0]) } catch { return null }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** A quote must actually appear in the page, or it is not evidence. */
function quoteIsGrounded(quote: string | null, pageText: string): boolean {
  if (!quote) return false
  const norm = (s: string) => s.toLowerCase().replace(/[\s ]+/g, ' ').replace(/[“”‘’]/g, "'").trim()
  const q = norm(quote)
  if (q.length < 12) return false
  return norm(pageText).includes(q.slice(0, Math.min(q.length, 120)))
}

// ── Multi-page sourcing ──────────────────────────────────────────────────────
//
// Not a crawler. A bounded second and third read, fired by a MISSING ANSWER
// rather than by a failed page.
//
// The original hop fired under exactly one condition: the page we read was the
// right fund's page and contained no funding detail at all. That is a narrow
// door and it was the wrong door for the case in front of us. Movement for
// Good's homepage is not detail-free — it describes the awards, the nomination
// process, the causes — so it passes the gate, the hop never fires, and the draw
// dates on /draw-dates are never read. The engine then returns a confident
// "verified" on a page that does not contain the answer to the question that
// matters. Same shape for Asda Foundation, Power to Change and Social
// Investment Business: rich front doors, detail one level down.
//
// Every limit below is hard, and the reason is that "fetch more, generally" is
// exactly the failure mode a second hop invites.

/** Pages read per row, including apply_url. Two hops reaches
 *  "homepage → funding → this fund". Three would be a crawl. */
const MAX_PAGES = 3

/** Circuit breaker, not a target. Counts proxy retries too. */
const MAX_MODEL_CALLS = 5

/** We are reading three pages now, not one. */
const HOST_GAP_MS = 500

/**
 * Is the timing question answered?
 *
 * Deadline and rolling are alternatives, not both required: a row with a
 * confirmed closing date does not also need a confirmed rolling flag. Amount is
 * deliberately not here — an absent amount renders as absent and misleads
 * nobody, so it does not earn a fetch. Keeping the trigger tied to what the
 * SURFACE ASSERTS is what stops this becoming a general appetite for more pages.
 */
export function timingAnswered(r: Pick<VerifyResult, 'evidence'>): boolean {
  return r.evidence.some(e => (e.field === 'deadline' || e.field === 'is_rolling') && e.agrees !== null)
}

/**
 * Fields whose absence is worth a second page under the wider scope.
 *
 * `eligible_structures` is here for the same reason `deadline` is: the surface
 * ASSERTS it. A row tagged for four legal forms is telling a CIC it may apply,
 * or telling it nothing, and the matcher treats the tag as a hard gate either
 * way. Exclusions and the income thresholds are the two other fields that can
 * send somebody to apply where they are barred.
 *
 * Grant AMOUNTS are deliberately absent, and not for the usual reason: the
 * verifier does not extract them at all, so there is no silence to detect.
 */
export const DETAIL_FIELDS = ['eligible_structures', 'exclusions', 'max_org_income', 'min_org_income'] as const

export function detailAnswered(r: Pick<VerifyResult, 'evidence'>): boolean {
  return r.evidence.some(e => (DETAIL_FIELDS as readonly string[]).includes(e.field) && e.agrees !== null)
}

/**
 * How wide the hop's trigger is. `timing` is what production does today: a
 * second page is earned only by an unanswered deadline. `any` is the widening
 * under measurement — an unanswered eligibility question earns one too.
 */
export type HopScope = 'timing' | 'any'

/**
 * Should this result send us one level down, and looking for what?
 *
 * Pulled out of the loop so it can be tested and so the widening is one
 * argument rather than an edit. The order matters: a page with no funding
 * detail at all is a worse starting point than a page missing one answer, and
 * a multi-fund page is a catalogue finding rather than a data gap.
 */
/**
 * Fields we show a figure for that the page read so far did not state.
 *
 * THE VERIFIER JUDGED A ROW AGAINST ONE PAGE. Found 2026-09-04: eleven live rows
 * flagged "we state a figure this page does not", and in every one checked the
 * figure was real and on another page of the same site. Yapp's £3,000 is on its
 * homepage while apply_url is how-to-apply; The Fore's £45,000 is on
 * what-we-offer while apply_url is who-we-fund. The 2 September amount sweep
 * nulled both on the strength of that one-page read. This is the signal that
 * turns an unsupported figure into a reason to read further, not a verdict.
 */
export function unsupportedFigures(current: Pick<VerifyResult, 'evidence'>): ('amount' | 'deadline')[] {
  const out = new Set<'amount' | 'deadline'>()
  for (const e of current.evidence) {
    if (e.agrees !== null) continue
    if ((e.field === 'amount_min' || e.field === 'amount_max') && e.note === AMOUNT_UNSUPPORTED_NOTE) out.add('amount')
    if (e.field === 'deadline' && e.note === DEADLINE_UNSUPPORTED_NOTE) out.add('deadline')
  }
  return Array.from(out)
}

/**
 * The banked sources worth reading next, on this funder's site, not yet read.
 *
 * Same site only: a source on a directory or a news site is context for a
 * reviewer, not a page this fund's terms can be verified against. Order is the
 * order they were banked, which is the order somebody thought they mattered.
 */
export function bankedSourceTargets(row: Pick<VerifyRow, 'apply_url' | 'grant_sources'>, visited: string[]): string[] {
  if (!row.apply_url || !Array.isArray(row.grant_sources)) return []
  const norm = (u: string) => u.replace(/\/$/, '').split('#')[0]
  const seen = new Set(visited.map(norm))
  const host = (u: string): string | null => { try { return new URL(u).hostname } catch { return null } }
  const applyHost = host(row.apply_url)
  if (!applyHost) return []
  const out: string[] = []
  for (const s of row.grant_sources) {
    const url = typeof s?.url === 'string' ? s.url.trim() : ''
    if (!/^https?:\/\//i.test(url)) continue
    const h = host(url)
    if (!h || !sameSite(applyHost, h)) continue
    const n = norm(url)
    if (seen.has(n)) continue
    seen.add(n)
    out.push(url)
  }
  return out
}

export function decideHop(
  current: Pick<VerifyResult, 'gate' | 'outcome' | 'evidence' | 'fundsOnPage'>,
  rowTitle: string,
  scope: HopScope = 'timing',
): { want: LinkWant; why: string } | null {
  const failure = (current.gate as { failure?: GateFailure }).failure
  if (!current.gate.pass && failure === 'no_funding_detail') {
    return { want: 'funding', why: 'the page carried no funding detail' }
  }
  if (current.outcome === 'multiple_funds'
      && (current.fundsOnPage ?? []).some(f => namesMatch(rowTitle, f))) {
    return { want: 'funding', why: 'the page covers several funds and one of them is ours' }
  }
  if (!(current.gate.pass && current.outcome === 'verified')) return null

  // A figure we show that this page did not state is the first reason to read
  // on. It outranks the timing and detail questions because it is the one that
  // ends in a wrong null if nobody looks further.
  const missing = unsupportedFigures(current)
  if (missing.length > 0) {
    return { want: missing.includes('amount') ? 'funding' : 'timing',
             why: `the page did not state the ${missing.join(' and ')} we show` }
  }

  // Stop early when the question is answered. The common case costs nothing
  // extra, which is what makes this affordable at catalogue scale.
  if (!timingAnswered(current)) {
    return { want: 'timing', why: 'the page named this fund but said nothing about when to apply' }
  }
  if (scope === 'any' && !detailAnswered(current)) {
    return { want: 'detail', why: 'the page named this fund but said nothing about who may apply' }
  }
  return null
}

/**
 * Fold a hop's findings into what we already have.
 *
 * A definite finding beats silence, and a later definite finding beats an
 * earlier one. The ordering is not arbitrary: the hop only happened BECAUSE the
 * earlier page did not answer, and the later page was chosen for being more
 * specific about the thing that was missing. Where both pages are silent the
 * result stays silent, which is the honest answer.
 */
export function foldEvidence(into: EvidenceInput[], from: EvidenceInput[]): EvidenceInput[] {
  const byField = new Map(into.map(e => [e.field, e]))
  for (const e of from) {
    const existing = byField.get(e.field)
    if (!existing || (existing.agrees === null && e.agrees !== null) || e.agrees !== null) {
      byField.set(e.field, e)
    }
  }
  return Array.from(byField.values())
}

function foldResult(base: VerifyResult, hop: VerifyResult): VerifyResult {
  const evidence = foldEvidence(base.evidence, hop.evidence)

  // Proposals follow the evidence: a field the hop settled is the hop's
  // proposal, and a field it stayed silent on keeps whatever we had.
  const hopFields  = new Set(hop.evidence.filter(e => e.agrees !== null).map(e => e.field))
  const proposals  = [
    ...base.proposals.filter(p => !hopFields.has(p.field)),
    ...hop.proposals,
  ]
  const confirmed = Array.from(new Set(
    evidence.filter(e => e.agrees === true).map(e => e.field),
  ))
  const notFound = evidence.filter(e => e.agrees === null).map(e => e.field)

  return {
    ...base,
    // A hop that reads a closed round settles the outcome; otherwise the first
    // page's verdict stands, because the hop was a supplement to it.
    outcome:     hop.outcome === 'round_closed' ? 'round_closed' : base.outcome,
    closedRound: hop.closedRound ?? base.closedRound,
    evidence, proposals, confirmed, notFound,
    // Drop the first page's "amounts unsupported" line when the hop settled an
    // amount, for the same reason the proposals above are filtered: the hop is
    // the later and better-informed read. Ferguson's apply_url is a login wall
    // that states nothing, and its guidance page one hop on says "Requests up to
    // £50,000 are reviewed monthly" — leaving both lines in the cron report would
    // say the figure was invented and confirmed in the same breath.
    notes: [
      ...base.notes.filter(n => !(n.startsWith('amounts unsupported')
        && (hopFields.has('amount_min') || hopFields.has('amount_max')))),
      ...hop.notes,
    ],
    usage: hop.usage ?? base.usage,
  }
}

// ── Public entry point ───────────────────────────────────────────────────────

export async function verifyRow(
  row: VerifyRow,
  anthropic: Anthropic,
  /** `hopOn` defaults to production behaviour. The wider scope is under
   *  measurement and is passed only by scripts/measure-hop.ts.
   *
   *  `hostGuard` is how a caller stops eleven Arts Council rows each discovering
   *  the same Cloudflare wall in the same run. It is consulted BEFORE the fetch
   *  and told the outcome after, so the caller can hold whatever state it likes
   *  — this module stays stateless. */
  opts: {
    hopOn?: HopScope
    hostGuard?: {
      /** Non-null means skip: the host is inside its backoff window. */
      skip: (url: string) => { reason: string; hoursLeft: number } | null
      /** Told after every read, so the caller can grow or clear the streak. */
      record: (url: string, reason: UnreadableReason | null) => void
    }
  } = {},
): Promise<VerifyResult> {
  const base = {
    id: row.id, title: row.title, funder: row.funder, url: row.apply_url,
    proposals: [] as Proposal[], confirmed: [] as string[], notFound: [] as string[],
    evidence: [] as EvidenceInput[], notes: [] as string[],
  }

  if (!row.apply_url) {
    return { ...base, outcome: 'fixable_link', gate: { pass: false, failure: 'fetch_failed', detail: 'no apply_url on the row' } }
  }

  // A HOST INSIDE ITS BACKOFF IS NOT READ AT ALL.
  //
  // Without this, classifying a wall as `no_content` — which is retryable, so
  // the proxy gets its turn — turns a walled host into a loop: the row never
  // resolves, stays due, and spends two fetches on every visit for ever. 16 of
  // the 33 walled rows measured on 2026-09-01 read fine hours later, so the
  // wall is intermittent and the row genuinely never settles.
  //
  // The skip is reported as its own gate detail rather than as a generic
  // failure, because a skip nobody can see is indistinguishable from a host
  // being read and always passing.
  const guarded = opts.hostGuard?.skip(row.apply_url)
  if (guarded) {
    return { ...base, outcome: 'fixable_link',
             gate: { pass: false, failure: 'fetch_failed',
                     detail: `host backed off after ${guarded.reason}, ${guarded.hoursLeft}h left` },
             notes: [`skipped: this host is inside its read backoff`] }
  }

  let usage = { input: 0, output: 0 }
  let best: VerifyResult | null = null
  let followedFrom: string[] = []
  let modelCalls = 0
  let lastFetched: { source: string; url: string; isMarkdown: boolean; links: string[] } | null = null

  // How far an attempt got. A retry that fails at the fetch must never replace a
  // first attempt that actually read the page — otherwise a dead reader proxy
  // turns a usable verdict into "fetch_failed", which is exactly what happened
  // the first time this ran.
  const rank = (r: VerifyResult): number => {
    if (r.gate.pass) return 3
    return r.gate.failure === 'fetch_failed' || r.gate.failure === 'no_content' ? 1 : 2
  }
  const keep = (r: VerifyResult) => { if (!best || rank(r) >= rank(best)) best = r }

  // Attempt 1 direct; attempt 2 through the reader proxy, but ONLY when the
  // gate failed for a reason a better render could plausibly fix. A page that
  // genuinely describes a different fund is not going to change its mind.
  for (const forceProxy of [false, true]) {
    const fetched = await fetchPage(row.apply_url, forceProxy)
    if ('error' in fetched) {
      keep({ ...base, usage, outcome: 'fixable_link', gate: { pass: false, failure: 'fetch_failed', detail: fetched.error } })
      if (forceProxy) break
      continue
    }
    // NOTHING BUT A PAGE WE ACTUALLY READ MAY REACH THE MODEL.
    //
    // This used to be `fetched.text.length < 200`, and a length test cannot do
    // this job. Cloudflare's interstitial is 268 characters through the proxy
    // and 491 direct, Imperva's is 678, a soft 404 is 323, a bare directory
    // index is 133. All of them cleared the floor, went to the model as though
    // they were the funder's page, and came back — quite correctly — as "this
    // page does not describe that fund". That was stamped onto the row as
    // `fixable_link: wrong_fund`, which is a claim about the FUNDER made from a
    // page nobody read. 21 of the 87 rows carrying it were exactly this.
    //
    // `classifyPage` returns a DISCRIMINATED UNION, and that is the safeguard
    // rather than this comment: `read.text` does not exist on the failure
    // branch, so the compiler will not let a future edit hand an interception
    // notice to `runModel`. The old shape was a boolean beside a string, and a
    // boolean is something you can forget to check.
    // `fetched.source` is the RAW response — HTML on a direct read, markdown
    // through the proxy. Passed because the parked-domain stub is invisible
    // after text extraction: strip the script and nothing is left, so the
    // classifier would see `empty` and a dead domain would keep being retried.
    const read = classifyPage(fetched.text, fetched.via === 'direct' ? fetched.source : null)
    opts.hostGuard?.record(row.apply_url, read.ok ? null : read.reason)
    if (!read.ok) {
      // `no_content` rather than `wrong_fund` is what makes this
      // self-correcting: it is in the retryable set below, so the proxy gets
      // its turn, and when that is blocked too the row ends as a read failure
      // instead of as an accusation. It also skips the model call, so a walled
      // host now costs nothing.
      keep({ ...base, usage, outcome: 'fixable_link',
             gate: { pass: false, failure: 'no_content', detail: `${read.reason}: ${read.detail}` } })
      if (forceProxy) break
      continue
    }

    if (followedFrom.length === 0) followedFrom = fetched.links
    lastFetched = { source: fetched.source, url: fetched.url, isMarkdown: fetched.via === 'proxy', links: fetched.links }
    // The reader proxy is a transport, not a source: the fact still came from
    // the funder's own page, so that is the URL the evidence cites.
    modelCalls++
    const result = await runModel(row, read.text, anthropic, base, row.apply_url)
    usage = { input: usage.input + (result.usage?.input ?? 0), output: usage.output + (result.usage?.output ?? 0) }
    result.usage = usage
    if (fetched.via === 'proxy') result.notes = [...result.notes, 'read through the reader proxy']
    keep(result)

    if (result.gate.pass || forceProxy) break
    const retryable = result.gate.failure === 'no_funding_detail' || result.gate.failure === 'no_content'
    if (!retryable) break
    if (!process.env.READER_PROXY_URL) break
  }

  // ── The hops ───────────────────────────────────────────────────────────────
  //
  // Three conditions, any of which fires. The first is the original behaviour.
  // The second is the one Movement for Good needed: the page was RIGHT and the
  // answer was elsewhere, which the single old condition could never detect,
  // because it only asked whether the gate had failed.
  const norm     = (u: string) => u.replace(/\/$/, '').split('#')[0]
  const visited  = [norm(row.apply_url)]
  let   current  = best as VerifyResult | null

  while (current && visited.length < MAX_PAGES && modelCalls < MAX_MODEL_CALLS) {
    const decision = decideHop(current, row.title, opts.hopOn)
    if (!decision) break
    const { want, why } = decision

    // Banked sources before guessed links: a page somebody banked as the one
    // that states the terms beats a link scored by its wording.
    const banked = bankedSourceTargets(row, visited)
    const scored = lastFetched
      ? candidateLinks(lastFetched.source, lastFetched.url, lastFetched.isMarkdown, want, visited)
      : []
    const target = banked[0] ?? scored[0] ?? followedFrom.find(l => !visited.includes(norm(l)))
    if (!target) {
      current.notes = [...current.notes, `nothing to follow, though ${why}`]
      break
    }

    // Politeness: this is three requests to one host now, not one.
    await new Promise(r => setTimeout(r, HOST_GAP_MS))
    visited.push(norm(target))

    const fetched = await fetchPage(target)
    if ('error' in fetched || fetched.text.length < 200) {
      current.notes = [...current.notes, `followed ${target} and could not read it`]
      break
    }
    lastFetched = { source: fetched.source, url: fetched.url, isMarkdown: fetched.via === 'proxy', links: fetched.links }

    modelCalls++
    const deeper = await runModel(row, fetched.text, anthropic, base, target, banked.includes(target))
    usage = { input: usage.input + (deeper.usage?.input ?? 0), output: usage.output + (deeper.usage?.output ?? 0) }

    if (!deeper.gate.pass) {
      // A hop that lands on the wrong fund is not a finding about our row. Keep
      // what we had and record where we went, rather than downgrading a sound
      // verdict because one link was mis-scored.
      current.notes = [...current.notes, `followed ${target} because ${why}, and it did not describe this fund`]
      current.usage = usage
      break
    }

    // A hop that lands on a page covering several funds must not extract from
    // it, even though the gate passes. Greggs Foundation is the case: our row
    // points at the homepage, /grants/ is one click away and is the right
    // destination, and it then describes two separate funds with different
    // rules. Blending them onto one row is worse than the gap we started with,
    // so the finding is a SPLIT, and the row keeps the silence it had.
    if (deeper.outcome === 'multiple_funds') {
      current.splitCandidate = { url: target, funds: deeper.fundsOnPage ?? [] }
      current.notes = [...current.notes,
        `followed ${target} because ${why}, and it covers ${(deeper.fundsOnPage ?? []).length} funds: extracted nothing, this row needs splitting`]
      current.usage = usage
      break
    }

    current = foldResult(current, deeper)
    current.usage       = usage
    current.followedUrl = target
    current.notes = [...current.notes, `read one level down: ${target} (${why})`]
  }

  if (current) {
    current.pagesRead = visited
    return current
  }
  return { ...base, outcome: 'fixable_link', gate: { pass: false, failure: 'fetch_failed', detail: 'no attempt completed' } }
}

async function runModel(
  row: VerifyRow,
  pageText: string,
  anthropic: Anthropic,
  base: Omit<VerifyResult, 'outcome' | 'gate'>,
  /** The page these facts came from — stamped onto every piece of evidence. */
  sourceUrl: string | null,
  /**
   * A page somebody banked on the funder's own site as the one that states
   * this fund's terms. The "is our fund on this page" gate is skipped for it:
   * The Fore's what-we-offer page states "Up to £45,000 over one to three
   * years" without naming the programme the way our row does, and the gate
   * threw the hop away before any figure was read (2026-09-05). The banking
   * IS the identification; the model is asked only what the page states.
   */
  trusted = false,
): Promise<VerifyResult> {
  // One clock read for the whole call: the prompt and the comparison below must
  // agree on what day it is, or a date could be "future" to one and "past" to
  // the other across midnight.
  const todayISO = new Date().toISOString().slice(0, 10)

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1200,
    messages: [{ role: 'user', content: buildPrompt(row, pageText, todayISO) }],
  })
  const usage = { input: res.usage.input_tokens, output: res.usage.output_tokens }
  const text = res.content.map(c => (c.type === 'text' ? c.text : '')).join('')
  const parsed = parseJson(text)

  if (!parsed) {
    return { ...base, usage, outcome: 'fixable_link', gate: { pass: false, failure: 'no_content', detail: 'model returned unparseable JSON' } }
  }

  const g = (parsed.gate ?? {}) as {
    fund_on_page?: string | null; describes_our_fund?: boolean; has_funding_detail?: boolean
    funds_on_page?: unknown; our_fund_is_one_of_them?: boolean
  }
  const fundOnPage = typeof g.fund_on_page === 'string' ? g.fund_on_page : null

  // Resolve the model contradicting itself: a "no" that names our own fund in
  // the very next field is not a rejection, it is a mistake.
  const selfContradicted = g.describes_our_fund !== true
    && fundOnPage !== null
    && (namesMatch(row.title, fundOnPage) || (row.funder ? namesMatch(row.funder, fundOnPage) : false))

  const gateNotes: string[] = []
  if (g.describes_our_fund !== true && !selfContradicted) {
    if (!trusted) {
      return {
        ...base, usage, outcome: 'fixable_link',
        gate: { pass: false, failure: 'wrong_fund', fund_on_page: fundOnPage,
                detail: fundOnPage ? `page describes "${fundOnPage}"` : 'our fund is not on this page' },
      }
    }
    gateNotes.push(`banked page read without the fund-name gate${fundOnPage ? ` (model saw "${fundOnPage}")` : ''}`)
  }
  if (g.has_funding_detail !== true && !trusted) {
    return {
      ...base, usage, outcome: 'fixable_link',
      gate: { pass: false, failure: 'no_funding_detail', fund_on_page: fundOnPage,
              detail: 'no eligibility, deadline or application detail on the page' },
    }
  }

  // One row, one fund. A page covering several distinct programmes cannot
  // answer a question about our row: Ufi's page carries four, one of which is
  // invitation-only, and proposing that rule for the generic row would have
  // shut the three anyone can apply to. This is a catalogue-structure finding —
  // the row needs splitting or re-pointing — not a field correction, so no
  // facts are proposed.
  const fundsOnPage = Array.isArray(g.funds_on_page)
    ? (g.funds_on_page as unknown[]).filter((x): x is string => typeof x === 'string')
    : []
  if (fundsOnPage.length > 1 && g.our_fund_is_one_of_them !== true) {
    return {
      ...base, usage, outcome: 'multiple_funds',
      gate: { pass: true, fund_on_page: fundOnPage },
      fundsOnPage,
      notes: [`page covers ${fundsOnPage.length} programmes (${fundsOnPage.slice(0, 5).join('; ')}) and our row matches none of them cleanly`],
    }
  }

  const gate: Gate = { pass: true, fund_on_page: fundOnPage }
  const facts = (parsed.facts ?? {}) as Record<string, { value?: unknown; quote?: unknown }>
  const fact = (k: string) => {
    const f = facts[k] ?? {}
    const quote = typeof f.quote === 'string' ? f.quote : null
    return { value: f.value ?? null, quote: quoteIsGrounded(quote, pageText) ? quote : null }
  }

  const proposals: Proposal[] = []
  const confirmed: string[] = []
  const notFound: string[] = []
  const notes: string[] = [...gateNotes]
  const evidence: EvidenceInput[] = []

  /**
   * Record what the page said about a field, whatever it said.
   *
   * Every path that pushes to `confirmed`, `proposals` or `notFound` also lands
   * here, so a field the model was asked about always ends with exactly one
   * stamp. `agrees: null` is the honest reading of every notFound path,
   * including the withheld ones — a quote about cash at bank is not evidence
   * about organisational income, so the row is left saying we do not know.
   */
  const stamp = (field: string, agrees: boolean | null, quote: string | null, proposed?: unknown, note?: string) => {
    evidence.push({ field, agrees, quote: agrees === null ? null : quote, source_url: sourceUrl, proposed, note })
  }

  const consider = (field: string, extracted: { value: unknown; quote: string | null }, current: unknown, coerce: (v: unknown) => unknown) => {
    if (extracted.value === null || extracted.value === undefined) { notFound.push(field); stamp(field, null, null); return }
    if (!extracted.quote) { notFound.push(field); stamp(field, null, null); notes.push(`${field}: a value was offered without a quote we could find on the page, so it was dropped`); return }
    const next = coerce(extracted.value)
    if (next === null) { notFound.push(field); stamp(field, null, null); return }
    if (next === current) { confirmed.push(field); stamp(field, true, extracted.quote); return }
    proposals.push({ field, from: current, to: next, quote: extracted.quote, verdict: 'confirmed' })
    stamp(field, false, extracted.quote, next)
  }

  const asDate = (v: unknown) => (typeof v === 'string' && ISO_DATE.test(v) ? v : null)
  const asBool = (v: unknown) => (typeof v === 'boolean' ? v : null)
  /**
   * Coerce the page's schedule into `deadline_cycle`'s shape.
   *
   * Day and month only, never a year: the column describes a repeating cycle,
   * and `nextCycleDeadline` supplies the year by rolling forward. An entry with
   * an out-of-range day or month is dropped rather than clamped — 31 February is
   * how a plausible-looking wrong date gets written onto a live row, and the
   * roll-forward maths already carries a guard against exactly that.
   */
  const asCycle = (v: unknown): CycleEntry[] | null => {
    if (!Array.isArray(v) || v.length === 0) return null
    const out: CycleEntry[] = []
    for (const raw of v) {
      if (!raw || typeof raw !== 'object') continue
      const e = raw as { day?: unknown; month?: unknown; label?: unknown }
      const day   = Number(e.day)
      const month = Number(e.month)
      if (!Number.isInteger(day) || !Number.isInteger(month)) continue
      if (day < 1 || day > 31 || month < 1 || month > 12) continue
      out.push({ day, month, ...(typeof e.label === 'string' && e.label.trim() ? { label: e.label.trim() } : {}) })
    }
    // One entry is not a cycle. A single date belongs in `deadline`, and
    // promoting it here would turn a one-off round into a claim that the fund
    // repeats every year, which is a claim the page did not make.
    return out.length >= 2 ? out : null
  }

  const asMoney = (v: unknown) => {
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[£,\s]/g, ''))
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null
  }

  const stillListed = fact('still_listed')
  const isGrant     = fact('is_grant')
  const earlyNotes: string[] = notes

  // NO QUOTE, NO VERDICT. The rule already governed field proposals but not
  // these two outcomes, which fell back to placeholder prose when the model
  // offered no sentence — so "no longer listed" could be pure inference and
  // still recommend hiding a row. Two of the thirteen withdrawn findings on
  // 2026-08-11 reached Paul that way. An outcome that removes a fund from view
  // needs at least as much evidence as one that edits a field.
  // Scope is a question our own data already answers, so stop asking the model.
  //
  // The catalogue deliberately carries four funding types, and 25 of the 38
  // rows first flagged "not a grant" were `investment` — repayable finance,
  // which is a stated differentiator, not a mistake. Rewording the prompt cut
  // it to 14 and thirteen of those were still investment or in_kind rows: told
  // plainly that loans are in scope, the model kept re-adjudicating anyway,
  // because "is_grant" is the wrong question to put to it at all.
  //
  // A row whose classifier already assigned a known funding_type is in scope by
  // definition. The verdict now only survives for rows with no type at all.
  const KNOWN_TYPES = new Set(['grant', 'programme', 'investment', 'in_kind'])
  if (isGrant.value === false) {
    if (row.funding_type && KNOWN_TYPES.has(row.funding_type)) {
      notes.push(`scope verdict ignored: this row is classified "${row.funding_type}", which the catalogue carries deliberately`)
      stamp('is_grant', null, null)
    } else if (!isGrant.quote) {
      notes.push('the model judged this not to be funding but quoted nothing; verdict withheld')
      stamp('is_grant', null, null)
    } else {
      stamp('is_grant', false, isGrant.quote)
      return { ...base, usage, gate, outcome: 'not_a_grant', evidence, notes: [isGrant.quote] }
    }
  } else {
    stamp('is_grant', isGrant.value === true && isGrant.quote ? true : null, isGrant.quote)
  }
  if (stillListed.value === false) {
    if (!stillListed.quote) {
      notes.push('the model judged this fund no longer listed but quoted nothing; verdict withheld')
      stamp('still_listed', null, null)
    } else {
      stamp('still_listed', false, stillListed.quote)
      return { ...base, usage, gate, outcome: 'no_longer_listed', evidence, notes: [stillListed.quote] }
    }
  } else {
    stamp('still_listed', stillListed.value === true && stillListed.quote ? true : null, stillListed.quote)
  }

  // A deadline the page states in the PAST is not a deadline to write, it is
  // evidence that the round has closed. Card Factory quotes an application
  // window ending 3 July while separately saying applications are closed;
  // proposing that as a deadline would put a stale date on a live row, which is
  // the defect this engine exists to remove. Surfaced for a human decision
  // instead of written.
  const deadlineFact = fact('deadline')
  const extractedDeadline = asDate(deadlineFact.value)
  let closedRound: { deadline: string; quote: string } | undefined
  // The schedule is read BEFORE the single deadline, because whether a lone date
  // can be trusted depends on whether the page turned out to run in rounds.
  const cycleFact = fact('deadline_cycle')
  const pageCycle = asCycle(cycleFact.value)

  // A SINGLE DATE OFF A MULTI-ROUND PAGE IS ONE OF SEVERAL, AND WE CANNOT TELL
  // WHICH. Movement for Good's homepage lists every draw; asked for "the"
  // closing date it returned 18 October, from the £5,000 Animals & Wildlife
  // draw, for our £1,000 draws row. Worse, that answer made the timing question
  // look answered, so the hop to the fund's own page stopped firing — a wrong
  // date is not merely wrong, it suppresses the machinery that would have found
  // the right one.
  //
  // So when the page plainly runs in rounds and the model could not structure
  // them, the lone date is withheld and timing stays unanswered, which is what
  // sends the reader one level down.
  if (extractedDeadline && deadlineFact.quote && !pageCycle && statesDatedWindows(pageText)) {
    notFound.push('deadline')
    stamp('deadline', null, null, undefined, 'a single date off a page that runs in rounds')
    notes.push(`deadline withheld: "${deadlineFact.quote.slice(0, 80)}" is one of several rounds this page lists, and which one belongs to this row is not stated`)
  } else if (extractedDeadline && deadlineFact.quote && extractedDeadline < todayISO) {
    closedRound = { deadline: extractedDeadline, quote: deadlineFact.quote }
    notFound.push('deadline')
    // The page DID address timing, and what it said contradicts a row that
    // presents itself as open. That is evidence, not silence — stamping it null
    // here would let a closed round sit unverified-but-unremarkable forever.
    stamp('deadline', false, deadlineFact.quote, extractedDeadline)
  } else {
    // THE PAGE SAID NOTHING ABOUT TIMING, AND WE ARE SHOWING A DATE.
    //
    // Recorded the same way an unsupported amount is, and for the same reason: a
    // closing date on a card is acted on, and one the funder's own page does not
    // state came from somewhere else. `consider` would file this as a plain
    // unanswered field, which is the right reading for a row showing NO date and
    // the wrong one for a row showing a date nobody published.
    //
    // Measured 2026-08-20: 71 live rows are in this shape, and it survived the
    // extractor fixes — 57 of the 62 readable ones still had a silent page, so it
    // was never a year-guessing problem. Those pages genuinely do not publish a
    // deadline.
    if (deadlineFact.value === null && row.deadline) {
      notFound.push('deadline')
      stamp('deadline', null, null, undefined, DEADLINE_UNSUPPORTED_NOTE)
    } else {
      consider('deadline', deadlineFact, row.deadline, asDate)
    }
  }
  // A FRONT DOOR MAY TAKE A CLAIM DOWN. IT MAY NEVER PUT ONE UP.
  //
  // `is_rolling = true` is the one field where the surface turns our data into a
  // positive claim about today: it renders the word "Rolling", which says you
  // can apply and be considered now. A funder's index page is systematically
  // the wrong place to establish that — it says the funder gives money all year
  // without saying that any particular round is open, and the engine will quote
  // it happily. Movement for Good is the worked case; see isFrontDoorUrl.
  //
  // So from a front door a `true` is withheld, whether it would have CONFIRMED
  // the stored value or PROPOSED setting it. A `false` is untouched, because
  // that only ever removes an assertion, which is strictly safer than the status
  // quo. Withheld means agrees:null — we looked and cannot say — not agrees:false.
  //
  // Remove this once multi-page sourcing lands and the timing page is actually
  // read. Until then it is the difference between an unverified row and a
  // wrongly certified one.
  // ── The page's whole schedule ──────────────────────────────────────────────
  //
  // A page that names several rounds was previously unreadable: the extraction
  // asked for one closing date, Movement for Good's draws page states three, and
  // it abstained. So the engine could reach the right page, quote the draw dates
  // under another field, and still return nothing about timing.
  //
  // The cycle is proposed, never written here. `expire-grants` and the admin
  // sweep already roll a deadline forward from `deadline_cycle` — including the
  // opening-date fix — so landing the cycle is enough; duplicating that maths
  // here would be a second copy to keep in step, which is how those two came to
  // share a bug in the first place.
  const sameCycle  = (a: CycleEntry[] | null, b: unknown) => {
    const norm = (c: unknown) => Array.isArray(c)
      ? JSON.stringify((c as CycleEntry[]).map(e => [e.day, e.month]).sort())
      : null
    return norm(a) !== null && norm(a) === norm(b)
  }
  if (pageCycle && cycleFact.quote) {
    if (sameCycle(pageCycle, row.deadline_cycle)) {
      confirmed.push('deadline_cycle')
      stamp('deadline_cycle', true, cycleFact.quote)
    } else {
      proposals.push({ field: 'deadline_cycle', from: row.deadline_cycle, to: pageCycle, quote: cycleFact.quote, verdict: 'confirmed' })
      stamp('deadline_cycle', false, cycleFact.quote, pageCycle)
    }
  } else if (cycleFact.value) {
    // Offered, but not a usable cycle: fewer than two valid entries, or no quote.
    notFound.push('deadline_cycle')
    stamp('deadline_cycle', null, null)
  }

  const rollingFact = fact('is_rolling')

  // A DATED SCHEDULE IS A TAKEDOWN, AND TAKEDOWNS ARE ALLOWED.
  //
  // The guards below withhold a rolling claim they cannot stand behind, which
  // leaves the row unverified. That is safe but it is not a correction, and on
  // its own it means Movement for Good stays wrong for ever. Once the page has
  // actually named its rounds, we are no longer guessing: dated rounds and
  // "applications accepted at any time" cannot both be true, and the rounds
  // carry the quote. So this contradicts rather than withholds — it only ever
  // moves a row from "claims open today" to "we do not say", which is strictly
  // safer than the status quo and is the asymmetry §12 of the design sets out.
  if (pageCycle && cycleFact.quote && row.is_rolling === true) {
    const closing = pageCycle.filter(e => !isOpeningEntry(e))
    const shown   = (closing.length > 0 ? closing : pageCycle)
      .map(e => `${e.day}/${e.month}`).join(', ')
    proposals.push({ field: 'is_rolling', from: true, to: false, quote: cycleFact.quote, verdict: 'confirmed' })
    stamp('is_rolling', false, cycleFact.quote, false)
    notes.push(`is_rolling contradicted: the page names dated rounds (${shown}), so applications are not accepted at any time`)
  } else {
  const rollingBlock =
      rollingFact.value !== true                 ? null
    : isFrontDoorUrl(sourceUrl)                  ? `it comes from ${sourceUrl}, which names no single fund, so it cannot establish that a round is open today`
    : statesDatedWindows(pageText)               ? 'the same page states dated windows, so "open all year" describes when nominations are taken, not when a round is open'
    : null
  if (rollingBlock) {
    notFound.push('is_rolling')
    stamp('is_rolling', null, null, undefined, 'rolling not confirmable from this page')
    notes.push(`is_rolling withheld: "${(rollingFact.quote ?? '').slice(0, 90)}" — ${rollingBlock}`)
  } else {
    consider('is_rolling', rollingFact, row.is_rolling, asBool)
  }
  }
  // Only propose an income cap when the sentence is about organisational income
  // or turnover. Wax Chandlers' "less than £200k in cash at bank" is a real
  // sentence with a real number that means something else entirely.
  // ── Amounts: the page must SAY the figure, not merely fail to deny it ──
  //
  // Every other field here treats silence as "we do not know", and that is the
  // right reading: a deadline we do not hold renders as absent and misleads
  // nobody. An amount is the exception. The card prints the stored figure
  // whichever way the page falls, so a page that says nothing about money is not
  // neutral — it leaves a number on screen that came from somewhere other than
  // the funder.
  //
  // Until 2026-08-19 the verifier did not ask about amounts at all, so there was
  // no silence to detect and no proposal to make. A sample of twelve live rows
  // that day found four material errors, three of them amounts, and in all three
  // the funder's page stated no figure whatever. Every one had been read within
  // three days and reported clean.
  //
  // Nothing here writes. `consider` only ever files a proposal, and verify-rows
  // reports proposals rather than applying them, which is the standing rule for
  // amounts — the extractor is wrong often enough on large awards that a human
  // has to see the change.
  const minAmountFact = fact('amount_min')
  const maxAmountFact = fact('amount_max')
  const pageAmountSilent = asMoney(minAmountFact.value) === null && asMoney(maxAmountFact.value) === null
  const weAssertAnAmount = (row.amount_min ?? null) !== null || (row.amount_max ?? null) !== null

  if (pageAmountSilent && weAssertAnAmount) {
    // The note goes ONLY on a field we actually assert. Stamping both was the
    // first version and it was wrong on its face: a row with no `amount_min`
    // would carry "we state a figure this page does not" against a figure we do
    // not state. Caught by the probe on Ferguson, whose row has no minimum.
    for (const f of ['amount_min', 'amount_max'] as const) {
      if ((row[f] ?? null) === null) { notFound.push(f); stamp(f, null, null); continue }
      notFound.push(f)
      stamp(f, null, null, undefined, AMOUNT_UNSUPPORTED_NOTE)
    }
    const shown = [row.amount_min ?? null, row.amount_max ?? null]
      .filter((n): n is number => n !== null)
      .map(n => `£${n.toLocaleString('en-GB')}`)
      .join(' to ')
    notes.push(`amounts unsupported: the card shows ${shown} and this page states no per-applicant figure`)
  } else {
    consider('amount_min', minAmountFact, row.amount_min ?? null, asMoney)
    consider('amount_max', maxAmountFact, row.amount_max ?? null, asMoney)
  }

  const incomeFact = fact('max_org_income')
  const INCOME_CONCEPT = /\b(income|turnover|revenue|annual (operating )?budget|operating budget)\b/i
  const CASH_CONCEPT   = /\b(cash at bank|cash and investments|balance sheet|reserves|in the bank)\b/i
  if (incomeFact.quote && (!INCOME_CONCEPT.test(incomeFact.quote) || CASH_CONCEPT.test(incomeFact.quote))) {
    notFound.push('max_org_income')
    stamp('max_org_income', null, null)
    notes.push(`max_org_income withheld: the quote is not about organisational income — "${incomeFact.quote.slice(0, 120)}"`)
  } else {
    consider('max_org_income', incomeFact, row.max_org_income, asMoney)
  }
  // "Invited to submit a full application" describes a two-stage process open to
  // anyone, which is the opposite of invitation-only. Require language of
  // refusal or nomination, and reject staged-application phrasing.
  const inviteFact = fact('is_invite_only')
  const TRUE_INVITE = /\b(unsolicited|do not accept applications|does not accept applications|by invitation only|invitation only|not open to applications|nominat)/i
  const TWO_STAGE   = /\b(then be invited|will be invited to submit|invited to submit a (full|formal|second)|shortlist)/i
  if (inviteFact.value === true && inviteFact.quote
      && (!TRUE_INVITE.test(inviteFact.quote) || TWO_STAGE.test(inviteFact.quote))) {
    notFound.push('is_invite_only')
    stamp('is_invite_only', null, null)
    notes.push(`is_invite_only withheld: the quote describes a staged or selective process, not an invitation-only fund — "${inviteFact.quote.slice(0, 120)}"`)
  } else {
    consider('is_invite_only', inviteFact, row.is_invite_only, asBool)
  }

  // A FLOOR HIDES A FUND FROM EVERYONE BELOW IT, so the bar is the same as the
  // ceiling's: the sentence must be about organisational income, not cash at
  // bank. Only 16 live rows carry a floor today, and most funds genuinely have
  // none — inventing one would make a fund invisible to exactly the small
  // organisations the catalogue exists for.
  const minIncomeFact = fact('min_org_income')
  if (minIncomeFact.quote && (!INCOME_CONCEPT.test(minIncomeFact.quote) || CASH_CONCEPT.test(minIncomeFact.quote))) {
    notFound.push('min_org_income')
    stamp('min_org_income', null, null)
    notes.push(`min_org_income withheld: the quote is not about organisational income — "${minIncomeFact.quote.slice(0, 120)}"`)
  } else {
    consider('min_org_income', minIncomeFact, row.min_org_income ?? null, asMoney)
  }

  // ── Who can apply ──────────────────────────────────────────────────────────
  //
  // `eligible_structures` is the matcher's HARD GATE — a structure mismatch caps
  // the score at 44 — and on 370 live rows it was set by `ai_classifier`, which
  // reads our own stored description rather than the funder's page. So the
  // filter deciding whether a fund is ever shown to a CIC is, for most of the
  // catalogue, a model's reading of a model's summary. This is the first time
  // any of it gets checked against the funder.
  //
  // The comparison rules, and why, are in eligibility.ts. The one that matters:
  // a form the page did not mention is SILENCE, never exclusion. Wee Grants lost
  // its `scio` tag to the opposite assumption and vanished from its own audience.
  const structFact  = fact('eligible_structures')
  const excludeFact = fact('excluded_structures')
  const pageStructures = asStructures(structFact.value)
  const excludedForms  = asStructures(excludeFact.value) ?? []

  // UNDEFINED IS NOT EMPTY. `null` and `[]` mean the row genuinely holds no
  // structures; `undefined` means the caller did not SELECT the column. Reading
  // the second as the first would make every form the page names look like a
  // widening, on every row, with the caller none the wiser — the same shape as
  // the filter-on-an-unselected-column bug this codebase has paid for twice.
  const structuresFetched = row.eligible_structures !== undefined

  if (pageStructures && structFact.quote && !structuresFetched) {
    notFound.push('eligible_structures')
    stamp('eligible_structures', null, null, undefined, 'row fetched without eligible_structures')
    notes.push('eligible_structures not compared: the caller did not select the column')
  // The quote must be about organisational form, the same bar `max_org_income`
  // applies to its own. See `quoteNamesAForm` for the live row that made it
  // necessary.
  } else if (pageStructures && structFact.quote && !quoteNamesAForm(structFact.quote)) {
    notFound.push('eligible_structures')
    stamp('eligible_structures', null, null)
    notes.push(`eligible_structures withheld: the quote names no organisational form — "${structFact.quote.slice(0, 120)}"`)
  } else if (pageStructures && structFact.quote) {
    const brief    = row.funder_brief ?? null
    const eligText = [brief?.who_can_apply, brief?.exclusions].filter(v => typeof v === 'string').join(' ') || null
    // THE PAGE'S GEOGRAPHY BEATS OURS, when the page states one. The charity-form
    // derivation decides whether "registered charities" also covers CIOs and
    // SCIOs by reading a geography string, and the only one it had was our own
    // `location_tag`. That is how a page naming the Charity Commission of England
    // and Wales came to CONFIRM a row tagged `scio`. Where the page says nothing
    // about jurisdiction our tag is the only signal there is, and the fallback
    // is right: reading a silent quote as "not Scotland" would strip `scio` off
    // every UK-wide fund in the catalogue.
    const geoText = namesJurisdiction(structFact.quote) ? structFact.quote : (row.location_tag ?? null)
    const exhaustive = fact('structures_are_exhaustive').value === true
    const verdict  = compareStructures({
      pageStructures,
      rowStructures: row.eligible_structures,
      excludedForms,
      geoText,
      eligText,
      exhaustive,
    })

    if (verdict.kind === 'confirmed') {
      confirmed.push('eligible_structures')
      stamp('eligible_structures', true, structFact.quote)
    } else {
      // WIDENING AND NARROWING ARE BOTH PROPOSALS AND NEITHER IS WRITTEN. A
      // narrowing is a takedown and would be allowed under the asymmetry; a
      // widening puts a fund in front of more organisations and is Paul's to
      // approve. Naming which it is on the proposal is what makes that decision
      // possible later without re-deriving it.
      const direction = verdict.kind === 'widens' ? 'widens' : verdict.kind === 'narrows' ? 'narrows' : 'widens and narrows'
      proposals.push({
        field: 'eligible_structures', from: row.eligible_structures ?? null,
        to: verdict.proposed, quote: structFact.quote, verdict: 'confirmed',
      })
      stamp('eligible_structures', false, structFact.quote, verdict.proposed,
        `the page ${direction} what we hold`)
    }
  } else if (structFact.value) {
    // Offered, but nothing in our vocabulary survived, or no quote.
    notFound.push('eligible_structures')
    stamp('eligible_structures', null, null)
  } else {
    notFound.push('eligible_structures')
    stamp('eligible_structures', null, null)
  }

  // Exclusions are recorded, never proposed away. Rule 6: they stay complete on
  // every tier and every surface, because sending somebody to apply where they
  // are explicitly barred is a worse outcome than anything else this system can
  // get wrong. So a page that is SILENT on exclusions never removes one we hold.
  const exclFact  = fact('exclusions')
  const pageExcl  = asExclusions(exclFact.value)
  if (pageExcl && exclFact.quote) {
    const knownText = typeof row.funder_brief?.exclusions === 'string' ? row.funder_brief.exclusions : null
    const fresh = newExclusions(pageExcl, knownText)
    if (fresh.length === 0) {
      confirmed.push('exclusions')
      stamp('exclusions', true, exclFact.quote)
    } else {
      stamp('exclusions', false, exclFact.quote, fresh,
        `${fresh.length} exclusion${fresh.length === 1 ? '' : 's'} on the page we do not carry`)
      notes.push(`exclusions the page states and we do not hold: ${fresh.map(e => `"${e}"`).join('; ')}`)
    }
  } else {
    notFound.push('exclusions')
    stamp('exclusions', null, null)
  }

  return {
    ...base, usage, gate,
    outcome: closedRound ? 'round_closed' : 'verified',
    proposals, confirmed, notFound, evidence, notes, closedRound,
  }
}

import Anthropic from '@anthropic-ai/sdk'
import type { EvidenceInput } from '../field-evidence'

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
  is_rolling:      boolean | null
  max_org_income:  number | null
  is_invite_only:  boolean | null
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
  is_rolling:     Fact<boolean>
  max_org_income: Fact<number>
  is_invite_only: Fact<boolean>
  still_listed:   Fact<boolean>
  is_grant:       Fact<boolean>
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
  /** Set on multiple_funds: what the page actually covers, for a split decision. */
  fundsOnPage?: string[]
  usage?:    { input: number; output: number }
}

// ── Fetch (mirrors enrich-grant, including the reader-proxy fallback) ────────

const PAGE_CAP = 12000

/** Link text or href that suggests the funding detail lives one level down. */
const FUNDING_LINK = /\b(grants?|funding|apply|applying|application|eligib|criteria|programmes?|how-we-fund|how-to-apply|open-funds?|our-funds?|what-we-fund|guidelines)\b/i

/** Obvious non-destinations, so we never wander into news or admin pages. */
const LINK_NOISE = /\b(news|blog|privacy|cookie|terms|contact|about-us|careers|jobs|login|account|donate|shop|press|media|policy|accessibility|sitemap)\b/i

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

export function candidateLinks(pageSource: string, baseUrl: string, isMarkdown: boolean): string[] {
  let base: URL
  try { base = new URL(baseUrl) } catch { return [] }

  const found: { url: string; score: number }[] = []
  const seen = new Set<string>([base.href.replace(/\/$/, '')])

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
    if (LINK_NOISE.test(haystack) && !FUNDING_LINK.test(abs.pathname)) continue
    const hits = (haystack.match(FUNDING_LINK) ?? []).length
    if (hits === 0) continue

    // Prefer a match in the path over one in link text, and shallower paths.
    const depth = abs.pathname.split('/').filter(Boolean).length
    const score = hits * 2 + (FUNDING_LINK.test(abs.pathname) ? 3 : 0) - depth
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
  return excerpt(html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim())
}

/** Words that mark the part of a funder page we actually need. */
const RELEVANCE = /income|turnover|deadline|closing date|closes|apply by|eligib|unsolicited|invitation|invited|rolling|year round|not accept|criteria|who can apply|£\s?[\d,]+/gi

/**
 * Keep the parts of a long page that matter, not merely the first 12,000
 * characters.
 *
 * Measured on Bentley's fund page: 53,919 characters, and the sentence
 * "annual income of under £500,000" sits at character 30,596. Every one of the
 * nine relevant keyword hits fell beyond a naive prefix cap, so the model was
 * shown marketing copy and truthfully reported that the page stated no
 * eligibility detail. The engine was not wrong; it was starved.
 *
 * The opening is always kept, because the gate needs it to tell which fund the
 * page is about. The rest of the budget goes to the highest-scoring windows, in
 * document order, with a marker where text was dropped so a quote is never
 * silently stitched across a gap.
 */
export function excerpt(text: string, cap = PAGE_CAP): string {
  if (text.length <= cap) return text

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

  if (chosen.length === 0) return text.slice(0, cap)

  let out = head
  let prevEnd = 0
  for (const w of chosen) {
    if (w.start > prevEnd) out += ' […] '
    out += rest.slice(w.start, w.start + WINDOW)
    prevEnd = w.start + WINDOW
  }
  return out.slice(0, cap)
}

export type Fetched =
  | { text: string; via: 'direct' | 'proxy'; links: string[] }
  | { error: string }

export async function fetchPage(url: string, forceProxy = false): Promise<Fetched> {
  const shape = (raw: string, via: 'direct' | 'proxy'): Fetched => {
    const isMarkdown = via === 'proxy'
    const links = candidateLinks(raw, url, isMarkdown)
    const text = isMarkdown
      ? excerpt(raw.replace(/\s{2,}/g, ' ').trim())
      : stripHtml(raw)
    return { text, via, links }
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

function buildPrompt(row: VerifyRow, pageText: string): string {
  return `You are checking one catalogue record against the funder's own web page.

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

  "deadline"       : closing date as yyyy-mm-dd, or null. Do NOT judge whether it
                     has passed; just report the date the page states.
  "is_rolling"     : true ONLY if the page explicitly says applications are
                     accepted year round / on a rolling basis. Absence of a
                     deadline is NOT evidence of rolling — use null.
  "max_org_income" : maximum applicant organisation annual income/turnover as a
                     plain number of pounds (e.g. 500000), or null.
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
 "facts":{"deadline":{"value":null,"quote":null},"is_rolling":{"value":null,"quote":null},
 "max_org_income":{"value":null,"quote":null},"is_invite_only":{"value":null,"quote":null},
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

// ── Public entry point ───────────────────────────────────────────────────────

export async function verifyRow(
  row: VerifyRow,
  anthropic: Anthropic,
): Promise<VerifyResult> {
  const base = {
    id: row.id, title: row.title, funder: row.funder, url: row.apply_url,
    proposals: [] as Proposal[], confirmed: [] as string[], notFound: [] as string[],
    evidence: [] as EvidenceInput[], notes: [] as string[],
  }

  if (!row.apply_url) {
    return { ...base, outcome: 'fixable_link', gate: { pass: false, failure: 'fetch_failed', detail: 'no apply_url on the row' } }
  }

  let usage = { input: 0, output: 0 }
  let best: VerifyResult | null = null
  let followedFrom: string[] = []

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
    if (fetched.text.length < 200) {
      keep({ ...base, usage, outcome: 'fixable_link', gate: { pass: false, failure: 'no_content', detail: `only ${fetched.text.length} chars of text` } })
      if (forceProxy) break
      continue
    }

    if (followedFrom.length === 0) followedFrom = fetched.links
    // The reader proxy is a transport, not a source: the fact still came from
    // the funder's own page, so that is the URL the evidence cites.
    const result = await runModel(row, fetched.text, anthropic, base, row.apply_url)
    usage = { input: usage.input + (result.usage?.input ?? 0), output: usage.output + (result.usage?.output ?? 0) }
    result.usage = usage
    if (fetched.via === 'proxy') result.notes = [...result.notes, 'read through the reader proxy']
    keep(result)

    if (result.gate.pass || forceProxy) break
    const retryable = result.gate.failure === 'no_funding_detail' || result.gate.failure === 'no_content'
    if (!retryable) break
    if (!process.env.READER_PROXY_URL) break
  }

  // Still nothing usable, but the landing page pointed somewhere. Follow the
  // single best candidate one level down and try again. One extra hop only:
  // the aim is /grants from a homepage, not a crawl.
  if (best && !(best as VerifyResult).gate.pass) {
    const failure = ((best as VerifyResult).gate as { failure?: GateFailure }).failure
    if (failure === 'no_funding_detail' && followedFrom.length > 0) {
      const target = followedFrom[0]
      const fetched = await fetchPage(target)
      if (!('error' in fetched) && fetched.text.length >= 200) {
        const deeper = await runModel(row, fetched.text, anthropic, base, target)
        usage = { input: usage.input + (deeper.usage?.input ?? 0), output: usage.output + (deeper.usage?.output ?? 0) }
        deeper.usage = usage
        deeper.notes = [...deeper.notes, `read one level down: ${target}`]
        deeper.followedUrl = target
        keep(deeper)
      }
    }
  }

  return best ?? { ...base, outcome: 'fixable_link', gate: { pass: false, failure: 'fetch_failed', detail: 'no attempt completed' } }
}

async function runModel(
  row: VerifyRow,
  pageText: string,
  anthropic: Anthropic,
  base: Omit<VerifyResult, 'outcome' | 'gate'>,
  /** The page these facts came from — stamped onto every piece of evidence. */
  sourceUrl: string | null,
): Promise<VerifyResult> {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1200,
    messages: [{ role: 'user', content: buildPrompt(row, pageText) }],
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

  if (g.describes_our_fund !== true && !selfContradicted) {
    return {
      ...base, usage, outcome: 'fixable_link',
      gate: { pass: false, failure: 'wrong_fund', fund_on_page: fundOnPage,
              detail: fundOnPage ? `page describes "${fundOnPage}"` : 'our fund is not on this page' },
    }
  }
  if (g.has_funding_detail !== true) {
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
  const notes: string[] = []
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
  const stamp = (field: string, agrees: boolean | null, quote: string | null, proposed?: unknown) => {
    evidence.push({ field, agrees, quote: agrees === null ? null : quote, source_url: sourceUrl, proposed })
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
  const todayISO = new Date().toISOString().slice(0, 10)
  let closedRound: { deadline: string; quote: string } | undefined
  if (extractedDeadline && deadlineFact.quote && extractedDeadline < todayISO) {
    closedRound = { deadline: extractedDeadline, quote: deadlineFact.quote }
    notFound.push('deadline')
    // The page DID address timing, and what it said contradicts a row that
    // presents itself as open. That is evidence, not silence — stamping it null
    // here would let a closed round sit unverified-but-unremarkable forever.
    stamp('deadline', false, deadlineFact.quote, extractedDeadline)
  } else {
    consider('deadline', deadlineFact, row.deadline, asDate)
  }
  consider('is_rolling',     fact('is_rolling'),     row.is_rolling,     asBool)
  // Only propose an income cap when the sentence is about organisational income
  // or turnover. Wax Chandlers' "less than £200k in cash at bank" is a real
  // sentence with a real number that means something else entirely.
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

  return {
    ...base, usage, gate,
    outcome: closedRound ? 'round_closed' : 'verified',
    proposals, confirmed, notFound, evidence, notes, closedRound,
  }
}

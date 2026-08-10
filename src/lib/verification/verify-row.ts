import Anthropic from '@anthropic-ai/sdk'

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
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type VerifyRow = {
  id:              string
  title:           string
  funder:          string | null
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
  notes:     string[]
  /** Set on round_closed: the passed date the page states, and its quote. */
  closedRound?: { deadline: string; quote: string }
  usage?:    { input: number; output: number }
}

// ── Fetch (mirrors enrich-grant, including the reader-proxy fallback) ────────

const PAGE_CAP = 12000

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
    return stripHtml(await res.text())
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
    return (await res.text()).replace(/\s{2,}/g, ' ').trim().slice(0, PAGE_CAP)
  } finally {
    clearTimeout(timeout)
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, PAGE_CAP)
}

export type Fetched = { text: string; via: 'direct' | 'proxy' } | { error: string }

export async function fetchPage(url: string, forceProxy = false): Promise<Fetched> {
  if (!forceProxy) {
    try {
      return { text: await fetchDirect(url), via: 'direct' }
    } catch (e) {
      const direct = e instanceof Error ? e.message : String(e)
      if (!process.env.READER_PROXY_URL) return { error: direct }
      try {
        return { text: await fetchViaReaderProxy(url), via: 'proxy' }
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
    return { text: await fetchViaReaderProxy(url), via: 'proxy' }
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
  "fund_on_page"  : the name of the fund this page actually describes, or null.
                    If the page lists several funds, name the one matching ours,
                    or null if ours is not among them.
  "describes_our_fund" : true if this page describes OUR fund, ALLOWING for the
                    funder using a shorter, longer or slightly different name for
                    it ("Hyde Foundation" and "Hyde Foundation Community
                    Investment" are the same thing; so are "The Community Fund"
                    and "The Local Community Fund"). Set false ONLY when the page
                    is clearly about a DIFFERENT, separately named fund, or when
                    our fund is genuinely absent from the page.
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
  "is_grant"       : false if what is described is not funding at all (for example
                     a paid membership, a discounted service, or a loan product).

Shape:
{"gate":{"fund_on_page":string|null,"describes_our_fund":bool,"has_funding_detail":bool},
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
    notes: [] as string[],
  }

  if (!row.apply_url) {
    return { ...base, outcome: 'fixable_link', gate: { pass: false, failure: 'fetch_failed', detail: 'no apply_url on the row' } }
  }

  let usage = { input: 0, output: 0 }
  let best: VerifyResult | null = null

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

    const result = await runModel(row, fetched.text, anthropic, base)
    usage = { input: usage.input + (result.usage?.input ?? 0), output: usage.output + (result.usage?.output ?? 0) }
    result.usage = usage
    if (fetched.via === 'proxy') result.notes = [...result.notes, 'read through the reader proxy']
    keep(result)

    if (result.gate.pass || forceProxy) break
    const retryable = result.gate.failure === 'no_funding_detail' || result.gate.failure === 'no_content'
    if (!retryable) break
    if (!process.env.READER_PROXY_URL) break
  }

  return best ?? { ...base, outcome: 'fixable_link', gate: { pass: false, failure: 'fetch_failed', detail: 'no attempt completed' } }
}

async function runModel(
  row: VerifyRow,
  pageText: string,
  anthropic: Anthropic,
  base: Omit<VerifyResult, 'outcome' | 'gate'>,
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

  const g = (parsed.gate ?? {}) as { fund_on_page?: string | null; describes_our_fund?: boolean; has_funding_detail?: boolean }
  const fundOnPage = typeof g.fund_on_page === 'string' ? g.fund_on_page : null

  if (g.describes_our_fund !== true) {
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

  const consider = (field: string, extracted: { value: unknown; quote: string | null }, current: unknown, coerce: (v: unknown) => unknown) => {
    if (extracted.value === null || extracted.value === undefined) { notFound.push(field); return }
    if (!extracted.quote) { notFound.push(field); notes.push(`${field}: a value was offered without a quote we could find on the page, so it was dropped`); return }
    const next = coerce(extracted.value)
    if (next === null) { notFound.push(field); return }
    if (next === current) { confirmed.push(field); return }
    proposals.push({ field, from: current, to: next, quote: extracted.quote, verdict: 'confirmed' })
  }

  const asDate = (v: unknown) => (typeof v === 'string' && ISO_DATE.test(v) ? v : null)
  const asBool = (v: unknown) => (typeof v === 'boolean' ? v : null)
  const asMoney = (v: unknown) => {
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[£,\s]/g, ''))
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null
  }

  const stillListed = fact('still_listed')
  const isGrant     = fact('is_grant')

  if (isGrant.value === false) {
    return { ...base, usage, gate, outcome: 'not_a_grant',
             notes: [isGrant.quote ?? 'the page describes something other than funding'] }
  }
  if (stillListed.value === false) {
    return { ...base, usage, gate, outcome: 'no_longer_listed',
             notes: [stillListed.quote ?? 'the page indicates this fund is no longer offered'] }
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
  } else {
    consider('deadline', deadlineFact, row.deadline, asDate)
  }
  consider('is_rolling',     fact('is_rolling'),     row.is_rolling,     asBool)
  consider('max_org_income', fact('max_org_income'), row.max_org_income, asMoney)
  consider('is_invite_only', fact('is_invite_only'), row.is_invite_only, asBool)

  return {
    ...base, usage, gate,
    outcome: closedRound ? 'round_closed' : 'verified',
    proposals, confirmed, notFound, notes, closedRound,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Grant crawler — fetches live, open grant opportunities from UK sources
// and stores them in the scraped_grants Supabase table.
//
// THE SOURCE LIST IS NOT DUPLICATED HERE ON PURPOSE.
//
// This header used to enumerate 34 named sources. By 2026-07-26 the file held
// 96, fourteen of the listed ones had been deleted, and it still advertised
// funders that had not run in months. A hand-maintained list next to the code
// it describes will always drift, and a stale list is worse than none: it is
// read as coverage.
//
//     npx tsx scripts/audit-sources.ts
//
// prints what actually exists — which sources fetch, what they yield, and how
// many of their rows are live today — from crawl_logs and the catalogue rather
// than from a comment.
//
// ── Adding or removing a source ──────────────────────────────────────────────
// A source is wired through FIVE places, and two of them are POSITIONAL: the
// destructured variable list and the run() array are matched by index through
// Promise.allSettled. Remove a run() without its variable and every later
// result silently lands on the wrong source, with no error anywhere.
//
//   1. async function crawlX()      the scraper itself
//   2. the destructured variable    ── positionally matched to (3)
//   3. run('source', crawlX)        ── positionally matched to (2)
//   4. the results-assembly line    x.status === 'fulfilled' ? x.value : fallback('source')
//   5. BATCH_N_SOURCES              which cron batch runs it
//
// ── What a source is worth ───────────────────────────────────────────────────
// 50 sources were retired on 2026-07-26: every one a hardcoded literal with
// ZERO live rows, re-asserted twice a week. Because a re-assert refreshes
// last_seen_at, each looked maintained forever while covering a gap it did not
// fill. If a new source cannot put live rows in the catalogue, it is not a
// source — it is a comment with a cron slot.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient }  from '@supabase/supabase-js'
import { parse as parseHTML } from 'node-html-parser'
import { mergeGrantUpdate, stampNewGrant } from '@/lib/grant-merge'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export interface ScrapedGrant {
  external_id:          string
  source:               string
  title:                string
  funder:               string | null
  funder_type:          string | null
  description:          string | null
  amount_min:           number | null
  amount_max:           number | null
  deadline:             string | null   // ISO date string or null
  is_rolling:           boolean
  is_local:             boolean
  sectors:              string[]
  eligibility_criteria: string[]
  apply_url:            string | null
  funding_type?:        string | null   // FundingType — omit to default to 'grant'
  location_tag?:        string | null   // Structured geo tag — omit to trigger auto-derivation in sanitiseGrant()
  raw_data:             Record<string, unknown>
}

// ── Location tag derivation ───────────────────────────────────────────────────
// Normalises a raw location string (from scraper card text, Open to: criteria,
// or an imported 360Giving row) to the canonical form expected by the matching
// engine's classifyLocationTag(): 'UK' | 'England' | 'Scotland' | 'Wales' |
// 'Northern Ireland' | <regional label preserved verbatim> | null.
//
// Returning null means "caller could not determine geography" — the matching
// engine treats this as unknown and falls back to legacy is_local heuristics.
export function deriveLocationTag(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw.trim()
  if (s.length === 0) return null

  // UK-wide variants first — check substrings so "UK-wide", "United Kingdom",
  // "UK wide", "All of the UK", "nationwide" all collapse to 'UK'.
  if (/\b(uk[\s-]?wide|all of (the )?uk|united kingdom|nationwide|\bnational\b)\b/i.test(s)) return 'UK'
  if (/^uk$/i.test(s)) return 'UK'

  // Nations — match as whole words so "Scotland" wins but "New England" doesn't
  // accidentally match "England". Order matters: check NI before "Ireland".
  if (/\bnorthern ireland\b|^ni$/i.test(s)) return 'Northern Ireland'
  if (/\bscotland\b|\bscottish\b/i.test(s))  return 'Scotland'
  if (/\bwales\b|\bwelsh\b|\bcymru\b/i.test(s)) return 'Wales'
  if (/\bengland\b|\benglish\b/i.test(s))    return 'England'

  // Not a recognised nation → treat as a regional label. Preserve the original
  // verbatim (e.g. "Tyne & Wear", "Greater Manchester") so the regional-match
  // helpers in matching.ts can do their substring checks.
  return s
}

export interface CrawlResult {
  source:    string
  fetched:   number
  upserted:  number
  error?:    string
  // Pipeline v1 Phase 3: scrape-time historical-deadline rejections (visible
  // in crawl logs so we can monitor scraper hygiene without surfacing them
  // in the NR queue).
  rejectedHistorical?: number
}

// ── Shared HTTP helper ────────────────────────────────────────────────────────
// Full browser-like headers to clear soft Cloudflare / WAF blocks (Arts Council,
// GLA, Aviva all 403 a bare UA). If a target still 403s after this, convert it
// to a static seed rather than escalating to Playwright.
async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-GB,en;q=0.9',
      'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`${url} returned ${res.status}`)
  return res.text()
}

// ── Description fetcher ───────────────────────────────────────────────────────
// Visits an individual grant/fund detail page and extracts the first meaningful
// paragraph(s) using common WordPress / Elementor content selectors.
// Returns '' on any error so callers can safely fall back.
async function fetchDetailDescription(url: string): Promise<string> {
  try {
    const html = await fetchHtml(url)
    const root = parseHTML(html)
    const SELECTORS = [
      '.entry-content',
      '.post-content',
      '.elementor-widget-text-editor',
      'article .content',
      '.grant-description',
      'main',
    ]
    for (const sel of SELECTORS) {
      const el = root.querySelector(sel)
      if (!el) continue
      const paras = el.querySelectorAll('p')
        .map(p => p.text.trim())
        .filter(t => t.length > 40)
      if (paras.length > 0) return paras.slice(0, 2).join(' ').slice(0, 600)
      const text = el.text.replace(/\s+/g, ' ').trim()
      if (text.length > 40) return text.slice(0, 600)
    }
    return ''
  } catch {
    return ''
  }
}

// Enriches a list of ScrapedGrants by fetching descriptions from their apply_url.
// Runs in batches of `concurrency` to avoid hammering sites.
// Grants that already have a non-empty description are left untouched.
async function withDescriptions(grants: ScrapedGrant[], concurrency = 3): Promise<ScrapedGrant[]> {
  const out: ScrapedGrant[] = []
  for (let i = 0; i < grants.length; i += concurrency) {
    const batch = grants.slice(i, i + concurrency)
    const settled = await Promise.allSettled(
      batch.map(async (g) => {
        if (g.description) return g                    // already has one
        if (!g.apply_url)  return g                    // nowhere to fetch from
        const desc = await fetchDetailDescription(g.apply_url)
        return { ...g, description: desc }
      })
    )
    for (let j = 0; j < settled.length; j++) {
      const r = settled[j]
      out.push(r.status === 'fulfilled' ? r.value : batch[j])
    }
  }
  return out
}

// ── Closed-grant detection ────────────────────────────────────────────────────
// Used by scrapers that pull from sitemaps/listings that mix open+closed grants
// (notably London CF's sitemap, where closed funds share the same URL namespace
// as live ones). Mirrors the patterns in src/lib/url-validator.ts.
const GRANT_CLOSED_PATTERNS: RegExp[] = [
  /this\s+(grant|fund|programme|scheme|award)\s+(is\s+)?(now\s+)?closed/i,
  /applications?\s+(are|is)?\s*(now\s+)?(closed|no longer)/i,
  /no\s+longer\s+(accepting|taking|open\s+to|available)/i,
  /this\s+(grant|fund|opportunity|programme)\s+has\s+(closed|ended)/i,
  /funding\s+round\s*(has\s+)?(expired|closed|ended)/i,
  /programme\s+has\s+(ended|closed|been\s+discontinued)/i,
  /this\s+funding\s+(is|has)\s+(no\s+longer|been\s+closed|closed)/i,
  /deadline\s+has\s+passed/i,
  /grant\s+(has\s+been|was)\s+(closed|withdrawn|discontinued)/i,
]

function isClosedGrantPage(html: string): boolean {
  // Only check the first 30KB — closed markers are usually near the top.
  const snippet = html.slice(0, 30_000)
  return GRANT_CLOSED_PATTERNS.some(p => p.test(snippet))
}

// Fetches a grant page and returns both a description and an open/closed flag.
// Used by scrapers that want to filter closed grants without double-fetching.
// Returns null on any network/parse error (caller should skip the grant).
async function fetchGrantPageInfo(url: string): Promise<{ description: string; isClosed: boolean } | null> {
  try {
    const html = await fetchHtml(url)
    const isClosed = isClosedGrantPage(html)
    const root = parseHTML(html)
    const SELECTORS = [
      '.entry-content',
      '.post-content',
      '.elementor-widget-text-editor',
      'article .content',
      '.grant-description',
      'main',
    ]
    let description = ''
    for (const sel of SELECTORS) {
      const el = root.querySelector(sel)
      if (!el) continue
      const paras = el.querySelectorAll('p')
        .map(p => p.text.trim())
        .filter(t => t.length > 40)
      if (paras.length > 0) { description = paras.slice(0, 2).join(' ').slice(0, 600); break }
      const text = el.text.replace(/\s+/g, ' ').trim()
      if (text.length > 40) { description = text.slice(0, 600); break }
    }
    return { description, isClosed }
  } catch {
    return null
  }
}

// ── Source toggle ─────────────────────────────────────────────────────────────
// Set DISABLED_SOURCES env var to a comma-separated list of source IDs to skip.
// e.g. DISABLED_SOURCES=lincolnshire_cf,kent_cf
//
// `gov_uk` is disabled IN CODE rather than by env var, because the reason is a
// property of the source and not of one deployment. Find a Grant lists everything
// government funds, and the great majority of that is not for our audience:
// Innovate UK R&D consortia that must be led by a registered business, UKRI calls
// led by a university, Defra grants for farmers and land managers, BFI money for
// film sales agents, DWP employer subsidies, and police-commissioner service
// contracts. The Critical Minerals Accelerator states it plainly — "open only to
// UK registered businesses… charities, not-for-profits" are excluded.
//
// Measured 2026-08-18: 40 live-or-queued rows from this source, of which roughly
// 13 could not be applied for by a UK charity, CIC or social enterprise, and 6 of
// those were LIVE. The ledger already scored the source at 6% yield (243 rows ever,
// 15 live). Each irrelevant row costs a review, so the source was spending Paul's
// attention faster than it was adding funds.
//
// Re-enable by removing it here, not by unsetting an env var. The good rows it did
// find — HS2's community fund, the MoJ rehabilitative services scheme, the
// Democratic Engagement Fund — stay in the catalogue and are unaffected.
const CODE_DISABLED_SOURCES = ['gov_uk']

const DISABLED_SOURCES = new Set([
  ...CODE_DISABLED_SOURCES,
  ...(process.env.DISABLED_SOURCES ?? '').split(',').map(s => s.trim()).filter(Boolean),
])
function guarded(source: string, fn: () => Promise<CrawlResult>): Promise<CrawlResult> {
  if (DISABLED_SOURCES.has(source)) {
    return Promise.resolve({ source, fetched: 0, upserted: 0, error: 'disabled' })
  }
  return fn()
}

// ── Source 1: GOV.UK Find a Grant ─────────────────────────────────────────────
// Scrapes all pages of find-government-grants.service.gov.uk, extracting the
// embedded Next.js __NEXT_DATA__ JSON from each page.
async function crawlGovUK(): Promise<CrawlResult> {
  const SOURCE = 'gov_uk'
  const BASE   = 'https://www.find-government-grants.service.gov.uk/grants'

  try {
    const html1     = await fetchHtml(`${BASE}?page=1`)
    const data1     = extractNextData(html1)
    const pp1       = data1.props.pageProps as Record<string, unknown>
    const page1Grants = (pp1.searchResult as Record<string, unknown>[]) ?? []
    const total     = Number(pp1.totalGrants ?? 0)
    const perPage   = page1Grants.length || 10
    const pages     = Math.ceil(total / perPage)

    const rest = await Promise.allSettled(
      Array.from({ length: pages - 1 }, (_, i) =>
        fetchHtml(`${BASE}?page=${i + 2}`)
          .then(html => {
            const d = extractNextData(html)
            return (d.props.pageProps as Record<string, unknown>).searchResult as Record<string, unknown>[]
          })
      )
    )

    const all: Record<string, unknown>[] = [
      ...page1Grants,
      ...rest.flatMap(r => r.status === 'fulfilled' ? r.value : []),
    ]

    const normalised = all.map(normaliseFindAGrant).filter((g): g is ScrapedGrant => g !== null)
    return await upsertGrants(SOURCE, normalised)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

function extractNextData(html: string): { props: { pageProps: Record<string, unknown> } } {
  const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    ?? html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/)
  if (!match?.[1]) throw new Error('No Next.js page data found')
  return JSON.parse(match[1])
}

// Applicant types from find-government-grants that are relevant to our audience
const RELEVANT_APPLICANT_TYPES = [
  'Charity or social enterprise',
  'Non profit',
  'Voluntary',
  'Community',
  'Social enterprise',
  'Third sector',
  'Charitable',
  'Civil society',
  'Individual',       // keep — some personal grants are useful
  'Other',            // keep — catch-all bucket that often includes charities
]
// Applicant types that indicate the grant is NOT for our audience if they are
// the ONLY types listed
const EXCLUDED_ONLY_TYPES = [
  'Local authority',
  'Local and national business',
  'Business',
  'Research institute',
  'University',
  'NHS',
  'Public sector',
  'Government',
]

function isRelevantForAudience(applicants: string[]): boolean {
  if (applicants.length === 0) return true  // no restriction info — include
  const lower = applicants.map(a => a.toLowerCase())
  // Include if any relevant type is present
  const hasRelevant = RELEVANT_APPLICANT_TYPES.some(t => lower.some(a => a.includes(t.toLowerCase())))
  if (hasRelevant) return true
  // Exclude if ONLY public-sector/business types are present
  const allExcluded = lower.every(a => EXCLUDED_ONLY_TYPES.some(t => a.includes(t.toLowerCase())))
  return !allExcluded
}

// GOV.UK Find a Grant uses a fixed location vocabulary on grantLocation:
//   'National' (UK-wide), 'International', the four nations, and English
//   macro-regions ('Midlands', 'North West England', ...). Derive a structured
//   location_tag from it — the matching engine needs the tag, not is_local.
const GOVUK_NATIONS = new Set(['England', 'Scotland', 'Wales', 'Northern Ireland'])

function deriveGovUkLocation(locations: string[]): { tag: string; isLocal: boolean } {
  const locs = locations.map(l => l.trim()).filter(Boolean)
  if (locs.length === 0) return { tag: 'UK', isLocal: false }
  // Any UK-wide / international signal → treat as open UK-wide.
  if (locs.some(l => l === 'National' || l === 'International')) return { tag: 'UK', isLocal: false }
  const nations = locs.filter(l => GOVUK_NATIONS.has(l))
  const regions = locs.filter(l => !GOVUK_NATIONS.has(l))
  // All four nations and nothing else → UK-wide.
  if (nations.length === 4 && regions.length === 0) return { tag: 'UK', isLocal: false }
  // Exactly one nation, nothing else → that nation.
  if (nations.length === 1 && regions.length === 0) return { tag: nations[0], isLocal: false }
  // A single specific region → regional.
  if (locs.length === 1) return { tag: locs[0], isLocal: true }
  // Multiple regions / a mix → no single clean tag.
  return { tag: 'Selected areas', isLocal: false }
}

// gov.uk's Find a Grant schema requires SOME numeric grantMinimumAward, so a
// funder that states no real floor gets a bare "1" from their system, not
// null — their own grantMinimumAwardDisplay renders it as "£1" too, so
// nothing on their end flags it as a placeholder. Copying it verbatim reads
// as "starts from just £1", which is never actually true (found live,
// 2026-07-14, on BFI's UK Global Screen Fund rows: fixed one-off with an
// admin: pinned override on 23 June, then AGAIN on 14 July when the daily
// crawl re-ran and re-imported the same artefact — a live example of the
// "one-time SQL fix reverts on the next crawl" trap). Treat exactly 1 as
// "no stated minimum", the same as gov.uk truly omitting the field.
//
// grantMaximumAward is required too, and a funder running a programme that
// awards no money at all has nowhere to say so, so it enters the smallest
// legal pair instead: 1 and 2. Found live 2026-08-18 on DBIST's AI Growth Lab,
// whose own page says twice that "Participants will not receive funding" while
// the row advertised a maximum of £2. A ceiling of £2 is never a real award,
// so treat it as "no stated maximum" the same way.
//
// The floors stay this tight on purpose. Across 249 gov.uk rows, 82 carry the
// £1 minimum placeholder and exactly one carried the £2 maximum, with nothing
// at all between £3 and £99 — so a wider net would buy no coverage today and
// would start nulling genuine micro-grants, which do go below £100.
function normaliseGovUkAward(value: unknown, placeholderCeiling: number): number | null {
  return typeof value === 'number' && value > placeholderCeiling ? value : null
}

function normaliseFindAGrant(g: Record<string, unknown>): ScrapedGrant | null {
  const label       = String(g.label ?? g.id ?? Math.random())
  const locations   = Array.isArray(g.grantLocation)    ? g.grantLocation    as string[] : []
  const applicants  = Array.isArray(g.grantApplicantType) ? g.grantApplicantType as string[] : []

  // Skip grants that are only for local authorities, businesses, research institutes etc.
  if (!isRelevantForAudience(applicants)) return null

  const loc = deriveGovUkLocation(locations)

  return {
    external_id:          `gov_uk_${label}`,
    source:               'gov_uk',
    title:                String(g.grantName ?? 'Untitled Grant'),
    funder:               String(g.grantFunder ?? 'UK Government'),
    funder_type:          'government',
    description:          String(g.grantShortDescription ?? g.grantDescription ?? ''),
    amount_min:           normaliseGovUkAward(g.grantMinimumAward, 1),
    amount_max:           normaliseGovUkAward(g.grantMaximumAward, 2),
    deadline:             parseDeadline(g.grantApplicationCloseDate),
    is_rolling:           false,
    is_local:             loc.isLocal,
    location_tag:         loc.tag,
    sectors:              [],
    eligibility_criteria: applicants,
    apply_url:            `https://www.find-government-grants.service.gov.uk/grants/${label}`,
    raw_data:             g,
  }
}

// ── Source 2: National Lottery Community Fund ─────────────────────────────────
// Scrapes the TNLCF funding programmes listing page.
// Each card has a programme title, description, location, amount range, and status.
// Only "Open" programmes are included.
async function crawlTNLCF(): Promise<CrawlResult> {
  const SOURCE = 'tnlcf'
  const URL    = 'https://www.tnlcommunityfund.org.uk/funding/funding-programmes'

  try {
    const html  = await fetchHtml(URL)
    const root  = parseHTML(html)
    const cards = root.querySelectorAll('.card.mb-4')
    const grants: ScrapedGrant[] = []

    for (const card of cards) {
      const title   = card.querySelector('h2, h3, h4, .card-title')?.text?.trim()
      const desc    = card.querySelector('.card-body p, p')?.text?.trim() ?? ''
      const href    = card.querySelector('a')?.getAttribute('href') ?? ''
      if (!title || !href) continue

      const fullUrl = href.startsWith('http') ? href : `https://www.tnlcommunityfund.org.uk${href}`
      const cardText = card.text ?? ''

      // Extract metadata from inline text labels
      const location  = cardText.match(/Project location:\s*([^\n]+)/)?.[1]?.trim() ?? null
      const amountStr = cardText.match(/Amount:\s*([^\n]+)/)?.[1]?.trim() ?? ''
      const status    = cardText.match(/Programme status:\s*([^\n]+)/)?.[1]?.trim() ?? ''

      // Skip programmes that aren't currently open
      if (status && !/open|accepting/i.test(status)) continue

      const { min, max } = parseAmountRange(amountStr)

      grants.push({
        external_id:          `tnlcf_${href.split('/').pop() ?? Math.random()}`,
        source:               SOURCE,
        title,
        funder:               'National Lottery Community Fund',
        funder_type:          'lottery',
        description:          desc,
        amount_min:           min,
        amount_max:           max,
        deadline:             null,   // TNLCF programmes are rolling
        is_rolling:           true,
        is_local:             !!location && !/uk.wide|uk wide|all/i.test(location),
        sectors:              [],
        eligibility_criteria: location ? [`Open to: ${location}`] : [],
        apply_url:            fullUrl,
        location_tag:         deriveLocationTag(location),
        raw_data:             { title, location, amountStr, status } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 8: Forever Manchester (Greater Manchester) ─────────────────────────
// Scrapes forevermanchester.com/funding/
// Open funds are in .text-side wrappers under the "Funds open for applications"
// section. Closed/not-open funds use different container classes and are excluded.
async function crawlForeverManchester(): Promise<CrawlResult> {
  const SOURCE = 'forever_manchester'
  const BASE   = 'https://forevermanchester.com'
  const URL    = `${BASE}/funding/`

  try {
    const html  = await fetchHtml(URL)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const block of root.querySelectorAll('.text-side')) {
      const title = block.querySelector('h3')?.text?.trim()
      if (!title) continue

      const descRaw = block.querySelector('p')?.text?.trim() ?? ''
      const href    = block.querySelector('a')?.getAttribute('href') ?? ''
      const url     = href.startsWith('http') ? href : `${BASE}${href}`
      const slug    = href.split('/').filter(Boolean).pop() ?? slugify(title)

      // Deadline is embedded in description: "Closes: March 5, 2026 12 Noon"
      const deadlineMatch = descRaw.match(/closes?:?\s*([A-Za-z]+\s+\d+,?\s+\d{4})/i)
      const deadline = deadlineMatch ? parseDeadline(deadlineMatch[1]) : null

      grants.push({
        external_id:          `forever_manchester_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Forever Manchester',
        funder_type:          'community_foundation',
        description:          descRaw,
        amount_min:           null,
        amount_max:           null,
        deadline,
        is_rolling:           !deadline,
        is_local:             true,
        sectors:              ['community', 'social welfare'],
        eligibility_criteria: ['Greater Manchester based organisations'],
        location_tag:         'Manchester',
        apply_url:            url || null,
        raw_data:             { title, descRaw, href } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 9: Two Ridings Community Foundation (Yorkshire) ────────────────────
// Scrapes tworidingscf.org.uk/apply-for-funding/
// Open funds are inside div.funds-open, each in a .box.fund-box card.
// Title: h3.no-margin, description: .padding div, link: a.read-more
async function crawlTwoRidingsCF(): Promise<CrawlResult> {
  const SOURCE = 'two_ridings_cf'
  const BASE   = 'https://tworidingscf.org.uk'
  const URL    = `${BASE}/apply-for-funding/`

  try {
    const html       = await fetchHtml(URL)
    const root       = parseHTML(html)
    const openSection = root.querySelector('.funds-open')
    if (!openSection) return { source: SOURCE, fetched: 0, upserted: 0, error: 'No .funds-open section found' }

    const grants: ScrapedGrant[] = []

    for (const box of openSection.querySelectorAll('.box.fund-box')) {
      const title = box.querySelector('h3')?.text?.trim()
      if (!title) continue

      const desc = box.querySelector('.padding')?.text?.trim() ?? ''
      const href = box.querySelector('a.read-more')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const slug = href.split('/').filter(Boolean).pop() ?? slugify(title)

      grants.push({
        external_id:          `two_ridings_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Two Ridings Community Foundation',
        funder_type:          'community_foundation',
        description:          desc,
        amount_min:           null,
        amount_max:           null,
        deadline:             null,
        is_rolling:           true,
        is_local:             true,
        sectors:              ['community', 'social welfare', 'environment'],
        eligibility_criteria: ['North & East Yorkshire based organisations'],
        location_tag:         'Yorkshire',
        apply_url:            url || null,
        raw_data:             { title, desc, href } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 10: Community Foundation Wales ─────────────────────────────────────
// Uses the WordPress grant sitemap (grant-sitemap.xml) as the data source —
// the HTML grants page is JS-rendered so the sitemap is more reliable.
// Derives grant title from the URL slug (slug-to-title-case conversion).
async function crawlCFWales(): Promise<CrawlResult> {
  const SOURCE  = 'cf_wales'
  const BASE    = 'https://communityfoundationwales.org.uk'
  const SITEMAP = `${BASE}/grant-sitemap.xml`

  try {
    const xml    = await fetchHtml(SITEMAP)
    const grants: ScrapedGrant[] = []

    // Extract all <loc> URLs from the sitemap XML using exec loop (matchAll compat)
    const locRe = /<loc>([^<]+)<\/loc>/g
    let match: RegExpExecArray | null
    while ((match = locRe.exec(xml)) !== null) {
      const url = match[1].trim()
      // Skip the archive index page itself
      if (!url.includes('/grants/') || url.endsWith('/grants/')) continue

      const slug  = url.split('/').filter(Boolean).pop() ?? ''
      // Convert slug to title case: "ashley-family-foundation" → "Ashley Family Foundation"
      const title = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

      grants.push({
        external_id:          `cf_wales_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Community Foundation Wales',
        funder_type:          'community_foundation',
        description:          '',
        amount_min:           null,
        amount_max:           null,
        deadline:             null,
        is_rolling:           true,
        is_local:             true,
        sectors:              ['community', 'social welfare'],
        eligibility_criteria: ['Wales based organisations'],
        apply_url:            url,
        raw_data:             { slug, url } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 6: Sport England ───────────────────────────────────────────────────
// Scrapes sportengland.org/funding-and-campaigns/our-funding
// Active funds are in .txt-img-cont sections with an h2 title and p description.
// Historic/closed sections are excluded by title matching.
async function crawlSportEngland(): Promise<CrawlResult> {
  const SOURCE = 'sport_england'
  const BASE   = 'https://www.sportengland.org'
  const URL    = `${BASE}/funding-and-campaigns/our-funding`

  // Sections to skip — not active grant programmes
  const SKIP = /historic|impact|priorities|charter|work in places|latest news/i

  try {
    const html  = await fetchHtml(URL)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const section of root.querySelectorAll('.txt-img-cont')) {
      const title = section.querySelector('h2')?.text?.trim()
      if (!title || SKIP.test(title)) continue

      const desc = section.querySelector('p')?.text?.trim() ?? ''
      const href = section.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const slug = href.split('/').filter(Boolean).pop() ?? slugify(title)

      const { min, max } = parseAmountRange(desc)

      grants.push({
        external_id:          `sport_england_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Sport England',
        funder_type:          'lottery',
        description:          desc,
        amount_min:           min,
        amount_max:           max,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['sport', 'physical activity', 'health'],
        eligibility_criteria: [],
        location_tag:         'England',
        apply_url:            url || null,
        raw_data:             { title, desc, href } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 7: National Lottery Heritage Fund ──────────────────────────────────
// Scrapes heritagefund.org.uk/funding
// Programme cards use .search-result__title (title + link) and
// .search-result__content (description). Amount range is embedded in the title.
async function crawlHeritageFund(): Promise<CrawlResult> {
  const SOURCE = 'heritage_fund'
  const BASE   = 'https://www.heritagefund.org.uk'
  const URL    = `${BASE}/funding`

  try {
    const html  = await fetchHtml(URL)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const titleEl of root.querySelectorAll('.search-result__title')) {
      const linkEl = titleEl.querySelector('a')
      const title  = linkEl?.text?.trim()
      if (!title) continue

      const href = linkEl?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const slug = href.split('/').filter(Boolean).pop() ?? slugify(title)

      // Description is in the sibling .search-result__content
      const parent = titleEl.parentNode
      const desc   = parent?.querySelector('.search-result__content')?.text?.trim() ?? ''

      // Parse amount range from title — e.g. "£10,000 to £250,000"
      const { min, max } = parseAmountRange(title)

      grants.push({
        external_id:          `heritage_fund_${slug}`,
        source:               SOURCE,
        title,
        funder:               'National Lottery Heritage Fund',
        funder_type:          'lottery',
        description:          desc,
        amount_min:           min,
        amount_max:           max,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['heritage', 'culture', 'community', 'environment'],
        eligibility_criteria: [],
        apply_url:            url || null,
        raw_data:             { title, href, desc } as Record<string, unknown>,
      })
    }

    const enriched = await withDescriptions(grants)
    return await upsertGrants(SOURCE, enriched)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 11: Quartet Community Foundation (Bristol & South West) ────────────
// The grants listing page is JS-rendered (FacetWP/AJAX), so uses the Yoast SEO
// custom_grant-sitemap.xml as the data source — same pattern as CF Wales / London CF.
// Derives grant title from the URL slug.
// ── Source 12: Community Foundation for Northern Ireland ──────────────────────
// Scrapes communityfoundationni.org/achieving-impact/available-grants/
// Each grant row uses Bootstrap class "row d-md-flex justify-content-md-end".
// Left col has closing date and grant size; right col has title, description, link.
async function crawlCFNI(): Promise<CrawlResult> {
  const SOURCE = 'cf_ni'
  const BASE   = 'https://communityfoundationni.org'
  const URL    = `${BASE}/achieving-impact/available-grants/`

  try {
    const html  = await fetchHtml(URL)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const row of root.querySelectorAll('.row.d-md-flex')) {
      const title = row.querySelector('h2')?.text?.trim()
      if (!title) continue

      const rowText = row.text ?? ''

      // Right col: description and link
      const rightCol = row.querySelector('.col-lg-7')
      const desc     = rightCol?.querySelector('p')?.text?.trim() ?? ''
      const href     = rightCol?.querySelector('a')?.getAttribute('href') ?? ''
      const url      = href.startsWith('http') ? href : `${BASE}${href}`
      const slug     = href.split('/').filter(Boolean).pop() ?? slugify(title)

      // Parse closing date from left-column text: "Closing Date: Mar 5, 2026 13:00"
      const closingMatch = rowText.match(/Closing Date:\s*([A-Za-z]+ \d+,?\s*\d{4})/)
      const deadline     = closingMatch ? parseDeadline(closingMatch[1]) : null

      // Parse grant size: "Grants up to £1,750" / "up to £10,000"
      const sizeMatch = rowText.match(/£([\d,]+)/)
      const amount    = sizeMatch ? parsePoundAmount(`£${sizeMatch[1]}`) : null

      grants.push({
        external_id:          `cf_ni_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Community Foundation for Northern Ireland',
        funder_type:          'community_foundation',
        description:          desc,
        amount_min:           null,
        amount_max:           amount,
        deadline,
        is_rolling:           !deadline,
        is_local:             true,
        sectors:              ['community', 'social welfare'],
        eligibility_criteria: ['Northern Ireland based organisations'],
        location_tag:         'Northern Ireland',
        apply_url:            url || null,
        raw_data:             { title, desc, href, deadline } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 14: Foundation Scotland ────────────────────────────────────────────
// Scrapes foundationscotland.org.uk/apply-for-funding/funding-available/
// Grant cards use class ".card-inner"; title and link are in the h3 > a element.
// Grant size and area are extracted by regex from the card text.
async function crawlFoundationScotland(): Promise<CrawlResult> {
  const SOURCE = 'foundation_scotland'
  const BASE   = 'https://foundationscotland.org.uk'
  const URL    = `${BASE}/apply-for-funding/funding-available/`

  try {
    const html  = await fetchHtml(URL)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const card of root.querySelectorAll('.card-inner')) {
      const linkEl = card.querySelector('h3 a') ?? card.querySelector('a')
      const title  = linkEl?.text?.trim()
      if (!title) continue

      const href = linkEl?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const slug = href.split('/').filter(Boolean).pop() ?? slugify(title)

      const cardText = card.text ?? ''

      // "Grant size: Up to £10,000"
      const sizeRaw  = cardText.match(/Grant size:\s*([^\n]+)/)?.[1]?.trim() ?? ''
      const { min, max } = parseAmountRange(sizeRaw)

      // "Area: Highland" / "Area: All of Scotland"
      const area      = cardText.match(/Area:\s*([^\n]+)/)?.[1]?.trim() ?? ''
      const isNational = /all of scotland|scotland.wide|national/i.test(area)

      // Description: try multiple selectors. Foundation Scotland's card markup
      // changed at some point and the original `p` selector stopped matching —
      // 13 of 14 active rows ended up with empty description. Fall back through
      // common card-description class names then the first <p>. Worst case
      // (none match) is identical to the previous behaviour.
      const desc = (
        card.querySelector('.card-description')?.text?.trim() ||
        card.querySelector('.excerpt')?.text?.trim() ||
        card.querySelector('.summary')?.text?.trim() ||
        card.querySelector('.description')?.text?.trim() ||
        card.querySelector('p')?.text?.trim() ||
        ''
      )

      grants.push({
        external_id:          `foundation_scotland_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Foundation Scotland',
        funder_type:          'community_foundation',
        description:          desc,
        amount_min:           min,
        amount_max:           max,
        deadline:             null,
        is_rolling:           true,
        is_local:             !isNational,
        sectors:              ['community', 'social welfare', 'environment'],
        eligibility_criteria: area ? [`Area: ${area}`] : ['Scotland based organisations'],
        location_tag:         'Scotland',
        apply_url:            url || null,
        raw_data:             { title, sizeRaw, area, desc } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 15: London Community Foundation ────────────────────────────────────
// The available-grants page is JS-rendered, so uses the grants section sitemap
// (sitemaps-1-section-grants-1-sitemap.xml) as the data source. The sitemap
// contains BOTH open and closed grants, so we fetch each page and skip any
// that match closed-grant markers (uses fetchGrantPageInfo).
// Title is derived from the URL slug (same pattern as CF Wales).
async function crawlLondonCF(): Promise<CrawlResult> {
  const SOURCE  = 'london_cf'
  const BASE    = 'https://londoncf.org.uk'
  const SITEMAP = `${BASE}/sitemaps-1-section-grants-1-sitemap.xml`
  const CONCURRENCY = 3

  try {
    const xml = await fetchHtml(SITEMAP)

    // Extract candidate grant URLs from <loc> tags
    const urls: string[] = []
    const locRe = /<loc>([^<]+)<\/loc>/g
    let match: RegExpExecArray | null
    while ((match = locRe.exec(xml)) !== null) {
      const url = match[1].trim()
      if (!url.includes('/grants/') || url.endsWith('/grants/') || url.endsWith('/grants')) continue
      urls.push(url)
    }

    // Fetch each page in small batches; keep only open grants
    const grants: ScrapedGrant[] = []
    for (let i = 0; i < urls.length; i += CONCURRENCY) {
      const batch = urls.slice(i, i + CONCURRENCY)
      const infos = await Promise.all(batch.map(u => fetchGrantPageInfo(u)))
      for (let j = 0; j < batch.length; j++) {
        const info = infos[j]
        if (!info) continue                      // fetch/parse failed
        if (info.isClosed) continue              // skip closed grants

        const url   = batch[j]
        const slug  = url.split('/').filter(Boolean).pop() ?? ''
        const title = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

        grants.push({
          external_id:          `london_cf_${slug}`,
          source:               SOURCE,
          title,
          funder:               'London Community Foundation',
          funder_type:          'community_foundation',
          description:          info.description,
          amount_min:           null,
          amount_max:           null,
          deadline:             null,
          is_rolling:           true,
          is_local:             true,
          sectors:              ['community', 'social welfare'],
          eligibility_criteria: ['London based organisations'],
          apply_url:            url,
          raw_data:             { slug, url } as Record<string, unknown>,
        })
      }
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 16: Sussex Community Foundation ────────────────────────────────────
// Scrapes two listing pages (funds don't have individual URLs):
//   - /grants/how-to-apply/main-grants/       → one entry for the Main Grants
//     programme (~£1k–£10k, ~100 named funds rolled into one application;
//     apply via a single EOI + main application form).
//   - /grants/how-to-apply/additional-grants/ → named fund sections (h2/h3
//     headings). Separate funds applied to individually.
// Both apply_urls point to the listing page (no detail URLs exist).
async function crawlSussexCF(): Promise<CrawlResult> {
  const SOURCE = 'sussex_cf'
  const BASE   = 'https://sussexcommunityfoundation.org'
  const MAIN   = `${BASE}/grants/how-to-apply/main-grants/`
  const ADD    = `${BASE}/grants/how-to-apply/additional-grants/`

  try {
    // Confirm the listing pages are reachable before emitting entries
    const [mainHtml, addHtml] = await Promise.all([
      fetchHtml(MAIN),
      fetchHtml(ADD).catch(() => ''),       // additional-grants is best-effort
    ])

    const grants: ScrapedGrant[] = []

    // ── Main Grants (umbrella programme) ──
    grants.push({
      external_id:          'sussex_cf_main_grants',
      source:               SOURCE,
      title:                'Sussex Community Foundation — Main Grants',
      funder:               'Sussex Community Foundation',
      funder_type:          'community_foundation',
      description:          isClosedGrantPage(mainHtml)
        ? 'Sussex Community Foundation\u2019s Main Grants programme funds voluntary and community organisations across East and West Sussex and Brighton & Hove. Awards of £1,000–£10,000 via an annual application cycle. Check the site for the current round deadline.'
        : 'Sussex Community Foundation\u2019s Main Grants programme funds voluntary and community organisations across East and West Sussex and Brighton & Hove. Awards of £1,000–£10,000. Applicants complete a short Expression of Interest, then Sussex CF matches them to the most suitable underlying funds (100+ in total) and invites a full application.',
      amount_min:           1000,
      amount_max:           10000,
      deadline:             null,
      is_rolling:           false,
      is_local:             true,
      location_tag:         'Sussex',
      sectors:              ['community', 'social welfare'],
      eligibility_criteria: [
        'Voluntary or community organisation based/working in East Sussex, West Sussex or Brighton & Hove',
        'Annual income of £2 million or less',
        'At least three unrelated trustees/directors',
      ],
      apply_url:            MAIN,
      raw_data:             { page: 'main-grants' } as Record<string, unknown>,
    })

    // ── Additional Grants — follow per-fund deep links ──
    // Each named fund now has its own page at
    //   /grants/how-to-apply/additional-grants/<slug>/
    // Extract by matching anchor hrefs (more reliable than h2/h3 heading
    // heuristics, and gives each grant its own apply_url).
    if (addHtml) {
      try {
        const root = parseHTML(addHtml)
        const seen = new Set<string>()
        const FUND_PATH = /\/grants\/how-to-apply\/additional-grants\/([a-z0-9][a-z0-9-]+)\/?$/i
        for (const a of root.querySelectorAll('a[href]')) {
          const href = a.getAttribute('href') ?? ''
          const m = href.match(FUND_PATH)
          if (!m) continue
          const slug = m[1].toLowerCase()
          if (seen.has(slug)) continue
          seen.add(slug)
          const linkText = a.text.replace(/\s+/g, ' ').trim()
          // Title fallback: humanise slug if anchor text is empty/generic
          const title = linkText && linkText.length > 4 && !/^read more|find out more|apply now$/i.test(linkText)
            ? linkText
            : slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
          const url = href.startsWith('http') ? href : `${BASE}${href.startsWith('/') ? '' : '/'}${href}`
          grants.push({
            external_id:          `sussex_cf_${slug}`,
            source:               SOURCE,
            title:                `Sussex Community Foundation — ${title}`,
            funder:               'Sussex Community Foundation',
            funder_type:          'community_foundation',
            description:          `${title} is one of the additional grant programmes distributed by Sussex Community Foundation alongside the main grants cycle. Administered for East Sussex, West Sussex and Brighton & Hove applicants. See the fund page for current opening windows, amounts and guidelines.`,
            amount_min:           null,
            amount_max:           null,
            deadline:             null,
            is_rolling:           false,
            is_local:             true,
            location_tag:         'Sussex',
            sectors:              ['community', 'social welfare'],
            eligibility_criteria: [
              'Voluntary or community organisation based/working in East Sussex, West Sussex or Brighton & Hove',
            ],
            apply_url:            url,
            raw_data:             { page: 'additional-grants', slug } as Record<string, unknown>,
          })
        }
      } catch {
        // swallow — we still have the Main Grants entry
      }
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 17: Community Foundation for Surrey ────────────────────────────────
// Scrapes cfsurrey.org.uk/apply — programme names are in h2 headings on the page.
// Filters to actual grant programme headings (Main Grants Programme, Other Grant
// Programmes) and adds an entry for the Crisis Funding programme (currently open).
// ── Source 18: Hampshire & Isle of Wight Community Foundation ─────────────────
// Scrapes hiwcf.org.uk/grants-for-groups/ — Elementor SSR page.
// Each grant is an h3 heading: "MONTH\nTitle – OPEN|CLOSED".
// Only OPEN grants are included. Walks up the DOM tree to find the parent
// container holding "Grant size:" text and the "Find out more" link.
// ── Source 19: Oxfordshire Community Foundation ───────────────────────────────
// Scrapes oxfordshire.org/ocfgrants/ — WordPress SSR page.
// Individual grant pages live at /ocf_grants/<slug>/ and are linked with
// "Find out more" anchors. Title is taken from the nearest preceding h2/h3.
// ── Source 20: Asda Foundation ────────────────────────────────────────────────
// Community grant programmes from asdafoundation.org.
// Both the listing page and individual grant pages are JS-rendered, so
// grant entries are hardcoded from browser inspection. Only community-facing
// programmes are included (colleague-only programmes are excluded).
async function crawlAsdaFoundation(): Promise<CrawlResult> {
  const SOURCE  = 'asda_foundation'
  const BASE    = 'https://asdafoundation.org'
  const LISTURL = `${BASE}/our-grants/`

  const GRANTS = [
    {
      id:    'local-community-spaces-fund',
      title: 'Local Community Spaces Fund',
      desc:  'Supports grassroots community groups throughout the UK to repair, renovate and develop community spaces — providing a safe place for people to meet and be together. Grants of £10,000–£20,000.',
      min:   10000,
      max:   20000,
    },
    {
      id:    'foodbank-fundamentals-fund',
      title: 'Foodbank Fundamentals Fund',
      desc:  'Supports foodbanks and similar food-poverty organisations with grants for essential equipment and operational infrastructure. Grants up to £750.',
      min:   null,
      max:   750,
    },
    {
      id:    'young-futures-fund',
      title: 'Young Futures Fund',
      desc:  'Supports grassroots groups focused on improving mental health and wellbeing for teenagers aged 13–18 in local communities. Grants of £500–£1,000.',
      min:   500,
      max:   1000,
    },
  ]

  try {
    // Confirm the grants listing page is live before returning hardcoded entries
    await fetchHtml(LISTURL)

    const grants: ScrapedGrant[] = GRANTS.map(g => ({
      external_id:          `asda_foundation_${g.id}`,
      source:               SOURCE,
      title:                g.title,
      funder:               'Asda Foundation',
      funder_type:          'corporate_foundation',
      description:          g.desc,
      amount_min:           g.min,
      amount_max:           g.max,
      deadline:             null,
      is_rolling:           true,
      is_local:             false,
      sectors:              ['community', 'social welfare'],
      eligibility_criteria: ['UK registered charities and community groups'],
      apply_url:            `${BASE}/our-grants/${g.id}/`,
      raw_data:             { id: g.id } as Record<string, unknown>,
    }))

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 21: Aviva Foundation ───────────────────────────────────────────────
// Two grant funds from avivafoundation.org.uk — Financial Futures Fund and
// Communities Fund. The homepage is SSR but fund details are JS-rendered;
// entries are hardcoded from browser inspection.
async function crawlAvivaFoundation(): Promise<CrawlResult> {
  const SOURCE      = 'aviva_foundation'
  const BASE        = 'https://www.avivafoundation.org.uk'
  const HOMEPAGEURL = `${BASE}/`

  const FUNDS = [
    {
      id:      'financial-futures-fund',
      title:   'Financial Futures Fund',
      desc:    'Funds long-term solutions that improve financial resilience across the UK — building financial confidence and capability, improving access to fair and inclusive financial services, and tackling systemic barriers. Distributes £3 million in grants annually.',
      sectors: ['financial inclusion', 'social welfare'],
    },
    {
      id:      'communities-fund',
      title:   'Communities Fund',
      desc:    'Supports communities when it matters most — focused on building community resilience, providing emergency support, and strengthening local support networks across the UK.',
      sectors: ['community', 'social welfare'],
    },
  ]

  try {
    // Confirm homepage is live before returning hardcoded entries
    await fetchHtml(HOMEPAGEURL)

    const grants: ScrapedGrant[] = FUNDS.map(f => ({
      external_id:          `aviva_foundation_${f.id}`,
      source:               SOURCE,
      title:                f.title,
      funder:               'Aviva Foundation',
      funder_type:          'corporate_foundation',
      description:          f.desc,
      amount_min:           null,
      amount_max:           null,
      deadline:             null,
      is_rolling:           true,
      is_local:             false,
      sectors:              f.sectors,
      eligibility_criteria: ['UK registered charities and community organisations'],
      apply_url:            `${BASE}/${f.id}/`,
      raw_data:             { id: f.id } as Record<string, unknown>,
    }))

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 22: Nationwide Foundation ─────────────────────────────────────────
// Three housing-focused grant programmes from nationwidefoundation.org.uk.
// The /our-programmes/ listing page is JS-rendered; programme URLs and titles
// are hardcoded from browser inspection of the live page.
async function crawlNationwideFoundation(): Promise<CrawlResult> {
  const SOURCE  = 'nationwide_foundation'
  const BASE    = 'https://nationwidefoundation.org.uk'
  const LISTURL = `${BASE}/our-programmes/`

  const PROGRAMMES = [
    {
      id:    'nurturing-ideas-for-change-to-the-housing-system',
      title: 'Nurturing Ideas to Change the Housing System',
      desc:  'Funds innovative ideas and approaches that could transform the housing system for people in housing need in the UK, including research, pilot projects, and advocacy for systemic change.',
      sectors: ['housing', 'social welfare'],
    },
    {
      id:    'backing-community-led-housing',
      title: 'Backing Community-Led Housing',
      desc:  'Supports community-led housing projects that provide genuinely affordable homes and empower communities to shape their own local housing and neighbourhoods.',
      sectors: ['housing', 'community'],
    },
    {
      id:    'transforming-the-private-rented-sector',
      title: 'Transforming the Private Rented Sector',
      desc:  'Funds work to improve conditions, security and rights for tenants in the private rented sector, including policy advocacy, tenant support and sector-wide reform efforts.',
      sectors: ['housing', 'social welfare'],
    },
  ]

  try {
    // Confirm programmes page is reachable before returning hardcoded entries
    await fetchHtml(LISTURL)

    const grants: ScrapedGrant[] = PROGRAMMES.map(p => ({
      external_id:          `nationwide_foundation_${p.id}`,
      source:               SOURCE,
      title:                p.title,
      funder:               'Nationwide Foundation',
      funder_type:          'corporate_foundation',
      description:          p.desc,
      amount_min:           null,
      amount_max:           null,
      deadline:             null,
      is_rolling:           true,
      is_local:             false,
      sectors:              p.sectors,
      eligibility_criteria: ['UK registered charities and organisations working on housing issues'],
      apply_url:            `${BASE}/our-programmes/${p.id}/`,
      raw_data:             { id: p.id } as Record<string, unknown>,
    }))

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 23: Community Foundation Tyne & Wear and Northumberland ────────────
// Scrapes communityfoundation.org.uk/apply/ — SSR listing of open grant funds.
// Each card has a /grants/slug/ link. We fetch individual pages for full details
// (max amount, locations, description). Runs 17 parallel page fetches.
async function crawlTyneWearCF(): Promise<CrawlResult> {
  const SOURCE  = 'tyne_wear_cf'
  const BASE    = 'https://www.communityfoundation.org.uk'
  const LISTURL = `${BASE}/apply/`

  try {
    // Step 1: Get all open grant URLs from the listing page
    const listHtml = await fetchHtml(LISTURL)
    const listRoot = parseHTML(listHtml)

    const entries = listRoot
      .querySelectorAll('a[href*="/grants/"]')
      .map(a => {
        const href = a.getAttribute('href') ?? ''
        const url  = href.startsWith('http') ? href : `${BASE}${href}`
        const slug = href.split('/').filter(Boolean).pop() ?? ''
        return { url, slug }
      })
      .filter(e => e.slug)

    if (entries.length === 0) return { source: SOURCE, fetched: 0, upserted: 0 }

    // Step 2: Fetch all individual grant pages in parallel
    const pages = await Promise.allSettled(
      entries.map(async ({ url, slug }) => {
        const html = await fetchHtml(url)
        const root = parseHTML(html)
        const main = root.querySelector('main') ?? root

        const title = main.querySelector('h1')?.text?.trim() ?? slug

        // "Max Grant Size: £3000" — present on most pages
        const mainText  = main.text
        const maxMatch  = mainText.match(/Max Grant Size:\s*(£[\d,]+)/i)
        const amountMax = maxMatch ? parsePoundAmount(maxMatch[1]) : parseAmountRange(mainText.slice(0, 600)).max

        // "Location(s): Gateshead, Newcastle, ..."
        const locMatch = mainText.match(/Location\(s\):\s*([^\n]+)/i)
        const location = locMatch ? locMatch[1].replace(/\s+/g, ' ').trim() : null

        // Rolling vs deadline
        const isRolling = /rolling/i.test(mainText.slice(0, 400))
        let deadline: string | null = null
        if (!isRolling) {
          const dlMatch = mainText.match(/deadline[^:]*:\s*(\d{1,2}\s+\w+\s+\d{4})/i)
          if (dlMatch) deadline = parseDeadline(dlMatch[1])
        }

        // Description — first paragraph after "About ..." heading, or first substantive paragraph
        const aboutH  = [...main.querySelectorAll('h2, h3')].find(h => /about/i.test(h.text))
        const descEl  = aboutH?.nextElementSibling ?? main.querySelectorAll('p')[3]
        const desc    = descEl?.text?.trim() ?? ''

        // Rough sector inference from title + description
        const combined = (title + ' ' + desc).toLowerCase()
        const sectors: string[] = ['community']
        if (/health|wellbeing|mental health/.test(combined)) sectors.push('health')
        if (/young people|children|youth/.test(combined))    sectors.push('young people')
        if (/arts|culture|creative/.test(combined))          sectors.push('arts')
        if (/environment|green|sustainab/.test(combined))    sectors.push('environment')
        if (/sport|physical|active/.test(combined))          sectors.push('sport')
        if (/education|learn|school/.test(combined))         sectors.push('education')
        if (/hardship|poverty|disadvantage/.test(combined))  sectors.push('social welfare')
        if (/housing|home/.test(combined))                   sectors.push('housing')
        if (/enterprise|business|start.?up/.test(combined))  sectors.push('enterprise')

        return {
          external_id:          `tyne_wear_cf_${slug}`,
          source:               SOURCE,
          title,
          funder:               'Community Foundation Tyne & Wear and Northumberland',
          funder_type:          'community_foundation',
          description:          desc,
          amount_min:           null,
          amount_max:           amountMax,
          deadline,
          is_rolling:           isRolling,
          is_local:             true,
          sectors,
          eligibility_criteria: location ? [`Located in: ${location}`] : [],
          location_tag:         'Tyne & Wear, Northumberland',
          apply_url:            url,
          raw_data:             { slug, location } as Record<string, unknown>,
        } as ScrapedGrant
      })
    )

    const grants = pages
      .filter(p => p.status === 'fulfilled')
      .map(p => (p as PromiseFulfilledResult<ScrapedGrant>).value)
      .filter(g => g.title)

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 28: Gloucestershire Community Foundation ───────────────────────────
// ── Source 29: Heart of Bucks Community Foundation ────────────────────────────
// ── Source 30: LLR Community Foundation ───────────────────────────────────────
// ── Source 31: MK Community Foundation ────────────────────────────────────────
// ── Source 34: Hertfordshire Community Foundation ─────────────────────────────
// ── Source 32: Community Foundation for Lancashire ────────────────────────────
// ── Source 33: Cambridgeshire Community Foundation ────────────────────────────
// ── Source 35: Wiltshire & Swindon Community Foundation ───────────────────────
// ── Source 36: Community Foundation for Calderdale ────────────────────────────
// ── Source 37: Somerset Community Foundation ─────────────────────────────────
// ── Source 38: Community Foundation for Nottinghamshire (ForeverNotts) ────────
// ── Source 39: Cheshire Community Foundation (hardcoded tiers) ────────────────
// ── Source 40: Shropshire Community Foundation ────────────────────────────────
// ── Source 41: Kent Community Foundation (hardcoded tiers) ────────────────────
// ── Source 42: Lincolnshire Community Foundation ──────────────────────────────
// ── Source 43 — Paul Hamlyn Foundation ────────────────────────────────────────
// Scrapes the "Open for applications" section of phf.org.uk/funding/
// Fund items: h3 title + sibling divs with "Amount:" meta block
async function crawlPaulHamlynFoundation(): Promise<CrawlResult> {
  const SOURCE  = 'paul_hamlyn_foundation'
  const BASE    = 'https://www.phf.org.uk'
  const LISTURL = `${BASE}/funding/`
  try {
    const html = await fetchHtml(LISTURL)

    // Slice HTML to only the "Open for applications" section
    const openIdx   = html.indexOf('Open for applications')
    const closedIdx = html.indexOf('Not currently accepting applications')
    const openHtml  = (openIdx >= 0 && closedIdx > openIdx)
      ? html.slice(openIdx, closedIdx)
      : html

    const root   = parseHTML(openHtml)
    const grants: ScrapedGrant[] = []

    for (const h3 of root.querySelectorAll('h3')) {
      const title = h3.textContent.trim()
      if (!title) continue
      if (/india/i.test(title)) continue    // India Fund — not UK

      const fundDiv = h3.parentNode
      if (!fundDiv) continue

      // Meta div is the sibling div containing "Amount:"
      const allDivs  = [...fundDiv.querySelectorAll('div')]
      const metaDiv  = allDivs.find(d => /Amount:/i.test(d.textContent))
      const metaText = metaDiv?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
      const descDiv  = allDivs.find(d => d !== metaDiv && d.textContent.trim().length > 30)
      const desc     = descDiv?.textContent?.replace(/\s+/g, ' ').trim()
                    ?? `Paul Hamlyn Foundation — ${title}`

      // "Amount: Up to £60,000 per year (3 to 4 years); up to £50,000 per year (5 years)Duration:..."
      const amountMatch = metaText.match(/Amount:\s*([^D]+?)(?:Duration|$)/i)
      const amountRaw   = amountMatch?.[1]?.trim() ?? ''
      const { min: amount_min, max: amount_max } = parseAmountRange(amountRaw)
      const is_rolling  = /rolling/i.test(metaText)

      grants.push({
        external_id:          `phf_${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        source:               SOURCE,
        title,
        funder:               'Paul Hamlyn Foundation',
        funder_type:          'foundation',
        description:          desc,
        amount_min,
        amount_max,
        deadline:             null,
        is_rolling,
        is_local:             false,
        sectors:              [],
        eligibility_criteria: [],
        apply_url:            LISTURL,
        raw_data:             { metaRaw: metaText },
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 44 — Esmée Fairbairn Foundation ────────────────────────────────────
// Continuous rolling programme across three strategic priorities.
// No individual programme listing with deadlines; hardcoded as single entry.
async function crawlEsmeeFairbairn(): Promise<CrawlResult> {
  const SOURCE = 'esmee_fairbairn'
  const APPLY  = 'https://esmeefairbairn.org.uk/apply-for-a-grant/'
  const grants: ScrapedGrant[] = [
    {
      external_id:          'esmee_fairbairn_main',
      source:               SOURCE,
      title:                'Esmée Fairbairn Foundation Grant Programme',
      funder:               'Esmée Fairbairn Foundation',
      funder_type:          'foundation',
      description:          'Grants for charitable organisations working in natural world recovery, social justice (A Fairer Future), and creative/confident communities. Supports core costs, project costs, and unrestricted funding. Rolling applications — no deadlines.',
      amount_min:           30000,
      amount_max:           null,
      deadline:             null,
      is_rolling:           true,
      is_local:             false,
      sectors:              ['environment', 'social justice', 'arts', 'communities'],
      eligibility_criteria: ['Constituted charitable organisations with annual turnover over £100,000', 'Minimum grant £30,000', 'Majority of grants are for 3–5 years'],
      apply_url:            APPLY,
      raw_data:             { note: 'Rolling applications, no deadline. Min £30k, no maximum. ~200 grants/year across 13 priorities.' },
    },
  ]
  return await upsertGrants(SOURCE, grants)
}

// ── Source 45 — Henry Smith Foundation ────────────────────────────────────────
// Scrapes the grants listing page then fetches each detail page in parallel.
// Skips any grant whose detail page indicates applications are closed.
async function crawlHenrySmithFoundation(): Promise<CrawlResult> {
  const SOURCE  = 'henry_smith'
  const BASE    = 'https://henrysmith.foundation'
  const LISTURL = `${BASE}/grants/`
  try {
    const html = await fetchHtml(LISTURL)
    const root = parseHTML(html)

    // Collect unique grant detail URLs (a.card href matching /grants/<slug>/)
    const seen  = new Set<string>()
    const cards = root.querySelectorAll('a').filter(a => {
      const href = a.getAttribute('href') ?? ''
      if (!/\/grants\/[^/]+\/$/.test(href)) return false
      if (seen.has(href)) return false
      seen.add(href)
      return true
    })

    if (cards.length === 0) return { source: SOURCE, fetched: 0, upserted: 0 }

    // Fetch all detail pages in parallel
    const details = await Promise.allSettled(
      cards.map(async a => {
        const relHref    = a.getAttribute('href')!
        const href       = relHref.startsWith('http') ? relHref : `${BASE}${relHref}`
        const slug       = relHref.replace(/.*\/grants\//, '').replace(/\/$/, '')
        const listTitle  = a.querySelector('h5')?.textContent?.trim() ?? slug
        const detailHtml = await fetchHtml(href)
        return { slug, href, listTitle, detailHtml }
      })
    )

    const grants: ScrapedGrant[] = []
    for (const r of details) {
      if (r.status !== 'fulfilled') continue
      const { slug, href, listTitle, detailHtml } = r.value

      // Skip closed grants — detail page contains "no longer apply" or similar
      if (/no longer apply|applications are now closed|deadline.*has.*closed/i.test(detailHtml)) continue

      const dRoot = parseHTML(detailHtml)

      // Amount from "Grant amount: ..." in Funding guidelines block
      const bodyText   = dRoot.querySelector('article')?.textContent ?? detailHtml
      const amountM    = bodyText.match(/Grant amount[:\s]+([^\n]+)/i)
      const amountRaw  = amountM?.[1]?.trim() ?? ''
      const { min: amount_min, max: amount_max } = parseAmountRange(amountRaw)

      // Deadline
      const dlM       = bodyText.match(/Application deadline[:\s]+([^\n]+)/i)
      const dlRaw     = dlM?.[1]?.trim() ?? ''
      const deadline  = parseUKRIDate(dlRaw) ?? parseDeadline(dlRaw)
      const is_rolling = !deadline

      // Description from first real <p> in article
      const desc = dRoot.querySelector('article p')?.textContent?.trim()
                ?? `Henry Smith Foundation — ${listTitle}`

      grants.push({
        external_id:          `henry_smith_${slug}`,
        source:               SOURCE,
        title:                listTitle || slug,
        funder:               'Henry Smith Foundation',
        funder_type:          'foundation',
        description:          desc,
        amount_min,
        amount_max,
        deadline,
        is_rolling,
        is_local:             false,
        sectors:              [],
        eligibility_criteria: [],
        apply_url:            href,
        raw_data:             { amountRaw, deadlineRaw: dlRaw },
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Amount parsers ────────────────────────────────────────────────────────────
function parsePoundAmount(str: string): number | null {
  if (!str) return null
  const cleaned = str.replace(/[£,\s]/g, '').match(/[\d.]+/)
  if (!cleaned) return null
  const n = parseFloat(cleaned[0])
  return isNaN(n) ? null : n
}

function parseAmountRange(str: string): { min: number | null; max: number | null } {
  if (!str) return { min: null, max: null }
  // Capture the £ figure AND any magnitude suffix (million / m / k / thousand)
  // directly after it. The suffix must abut the number and not run into another
  // word — `(?![a-z])` stops "£10 members" matching "m". Without this, the bare
  // /£[\d,]+/ regex parsed "£10million" as 10 (dropping the multiplier), which
  // mis-stored NLHF "Heritage Grants £250,000 to £10million" as min 10 / max 250000.
  const nums = Array.from(
    str.matchAll(/£\s?([\d,.]+)(?:\s*(million|mn|m|thousand|k)(?![a-z]))?/gi),
  ).map(m => {
    const base = parseFloat(m[1].replace(/,/g, ''))
    if (isNaN(base)) return null
    const suffix = (m[2] ?? '').toLowerCase()
    const mult = suffix === 'million' || suffix === 'mn' || suffix === 'm' ? 1_000_000
      : suffix === 'thousand' || suffix === 'k' ? 1_000
      : 1
    return Math.round(base * mult)
  }).filter((n): n is number => n != null)
  if (nums.length === 0) return { min: null, max: null }
  // Order-robust: a range can be written high-to-low in source text.
  if (nums.length >= 2)  return { min: Math.min(nums[0], nums[1]), max: Math.max(nums[0], nums[1]) }
  // Single figure: a directional cue IMMEDIATELY before the £ amount decides
  // whether it's a ceiling, a floor, or a genuine fixed amount.
  //   "Up to £X" / "under £X"   → £X is the MAX, min unknown  → { null, X }
  //   "from £X"  / "at least £X" → £X is the MIN, max unknown  → { X, null }
  //   bare figure ("Grants of £X") → fixed amount             → { X, X }
  // The cue must be adjacent to the £ so unrelated words ("over 6 months",
  // "under 18s") don't trigger it. Previously a lone "Up to £X" was stored as
  // min = max = X, inventing a false floor that broke grant-size matching.
  const n = nums[0]
  const ceiling = /(?:up to|under|less than|no more than|maximum(?: of)?|max\.? of)\s+£/i.test(str)
  const floor   = /(?:from|at least|minimum(?: of)?|min\.? of|in excess of|more than|over)\s+£/i.test(str)
  if (ceiling && !floor) return { min: null, max: n }
  if (floor && !ceiling) return { min: n,    max: null }
  return { min: n, max: n }
}

// ── Date parsers ──────────────────────────────────────────────────────────────
// Compare date strings (YYYY-MM-DD) not datetimes — avoids incorrectly
// discarding today's deadline when the cron runs early in the morning.
function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

/** Shift an ISO date by whole days without letting a timezone near it. */
function shiftISODate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().split('T')[0]
}

/**
 * A closing date, as the day an applicant can still apply.
 *
 * MIDNIGHT IS THE BOUNDARY, NOT A DAY YOU CAN APPLY ON.
 *
 * gov.uk publishes `grantApplicationCloseDate: "2026-09-23T00:00"` for a grant
 * whose own page reads "Closing date: 22 September 2026, 11:59pm (Midnight)".
 * The instant is the end of the 22nd expressed as the start of the 23rd. Taking
 * the date part verbatim handed the applicant a day that does not exist, and it
 * did so on 65 rows.
 *
 * The direction matters more than the count. Every other date error in this
 * catalogue makes us look wrong; this one makes a fundraiser submit late and be
 * refused, on our word. So an exact midnight resolves to the day before.
 *
 * READ AS WALL CLOCK, NOT THROUGH `new Date()`. The old implementation went via
 * `toISOString()`, which is a UTC conversion, so the answer depended on the
 * server's timezone: identical input yielded the 23rd on Vercel (UTC) and the
 * 22nd on a BST laptop. The ISO branch below never constructs a Date from the
 * input at all, so the same string gives the same day everywhere. Non-ISO
 * inputs (the four text-scraping callers, e.g. "May 14, 2026") keep the old
 * path, which is correct for a bare date under UTC.
 */
function parseDeadline(raw: unknown): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  if (!s) return null

  let iso: string
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/)
  if (m) {
    const [, y, mo, d, hh, mi] = m
    iso = `${y}-${mo}-${d}`
    if (hh === '00' && mi === '00') iso = shiftISODate(iso, -1)
  } else {
    // Text dates from the four scraping callers, e.g. "May 14, 2030". `new
    // Date` reads these as LOCAL midnight, so the old `toISOString()` (a UTC
    // conversion) moved them a day EARLIER on any positive-offset server: the
    // test for this line failed with 2030-05-13 on a BST laptop. Production
    // runs UTC so it was right by accident. Read the local components back
    // instead and the wall-clock date the string named survives intact.
    const dt = new Date(s)
    if (isNaN(dt.getTime())) return null
    const p = (n: number) => String(n).padStart(2, '0')
    iso = `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
  }

  // Discard only dates strictly before today (yesterday or earlier)
  if (iso < todayISO()) return null
  return iso
}

/** Exported for tests only. The crawl calls the module-local binding. */
export const __parseDeadlineForTests = parseDeadline

/** Exported for tests only. The crawl calls the module-local binding. */
export const __normaliseGovUkAwardForTests = normaliseGovUkAward

/** Exported for tests only. The crawl calls the module-local binding. */
export const __normaliseFindAGrantForTests = normaliseFindAGrant

/**
 * Heading text that is a closing-date label rather than a programme name.
 *
 * covenantfund.org.uk renders "CLOSING DATE: 23 Sep 2026" as an <h2> directly
 * above the programme's own <h2>, so any scraper taking the first heading gets
 * the date. Matched at the START of the string so a real title merely
 * containing the word "deadline" is unaffected.
 */
const CLOSING_LABEL_RE = /^\s*(closing\s+date|closes|deadline|apply\s+by)\b/i

// Parses "14 May 2026 4:00pm UK time" → "2026-05-14"
function parseUKRIDate(str: string): string | null {
  if (!str) return null
  const match = str.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/)
  if (!match) return null

  // Built in UTC on purpose. `new Date("Sep 23 2026")` produces LOCAL midnight,
  // and toISOString() then converts to UTC — so under BST (UTC+1) every deadline
  // came back a day early: "23 Sep 2026" parsed as 2026-09-22. Vercel runs UTC
  // so production was unaffected, which is exactly why it survived: it is
  // invisible in prod and wrong on every developer machine in summer.
  const month = MONTHS.indexOf(match[2].slice(0, 3).toLowerCase())
  if (month < 0) return null
  const day  = Number(match[1])
  const year = Number(match[3])
  const d = new Date(Date.UTC(year, month, day))
  if (isNaN(d.getTime()) || d.getUTCDate() !== day) return null

  const iso = d.toISOString().split('T')[0]
  if (iso < todayISO()) return null
  return iso
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// ── Misc helpers ──────────────────────────────────────────────────────────────
function slugify(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, '').replace(/[^a-z0-9]/gi, '_').substring(0, 80)
}

function toMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error'
}

// Keep exported in case other code uses them
export function normaliseSectors(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(s => String(s).toLowerCase().trim()).filter(Boolean)
  if (typeof raw === 'string') return raw.split(',').map(s => s.toLowerCase().trim()).filter(Boolean)
  return []
}
export function normaliseList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(s => String(s).trim()).filter(Boolean)
  if (typeof raw === 'string') return raw.split('\n').map(s => s.trim()).filter(Boolean)
  return []
}

// ── Data validation ───────────────────────────────────────────────────────────
/**
 * Sanitise a single scraped grant before it goes to the DB.
 * Returns null to drop the row entirely if it fails quality checks.
 *
 * Checks:
 *   - title must be present and ≥ 5 chars
 *   - apply_url must not be truncated/malformed (if present)
 *   - description must be ≥ 20 chars (if present — null is fine for hardcoded entries)
 *   - null out negative amounts, swap inverted, cap implausible (> £50m)
 */
function sanitiseGrant(g: ScrapedGrant): ScrapedGrant | null {
  // ── Title ───────────────────────────────────────────────────────────────────
  if (!g.title || g.title.trim().length < 5) return null

  // ── URL quality ─────────────────────────────────────────────────────────────
  if (g.apply_url) {
    const url = g.apply_url.trim()

    // Must look like a valid URL
    try { new URL(url) } catch { return null }

    // Reject obviously truncated URLs — ends with common word-break chars
    // Note: trailing slash is intentionally excluded — many valid grant URLs end with /
    if (/[-=?&_]$/.test(url)) return null

    // Reject impossibly short URLs (e.g. "https://x.co" without a path is fine,
    // but "https://gov.uk/guidance/community-" is truncated)
    // A real grant URL needs at least origin + 5 meaningful path chars
    const { origin, pathname } = new URL(url)
    if (origin.length > 0 && pathname.replace(/\/$/, '').length > 0 && pathname.length < 3) return null

    // Reject placeholder / localhost / obviously wrong
    if (/localhost|127\.0\.0\.1|example\.com|placeholder/i.test(url)) return null
  }

  // ── Description ─────────────────────────────────────────────────────────────
  // Descriptions that are present but trivially short are useless
  if (g.description && g.description.trim().length > 0 && g.description.trim().length < 20) {
    return { ...g, description: null }  // blank it rather than dropping the row
  }

  // ── Amounts ─────────────────────────────────────────────────────────────────
  let minAmt = g.amount_min
  let maxAmt = g.amount_max

  if (minAmt !== null && minAmt < 0) minAmt = null
  if (maxAmt !== null && maxAmt < 0) maxAmt = null

  if (minAmt !== null && maxAmt !== null && minAmt > maxAmt) {
    [minAmt, maxAmt] = [maxAmt, minAmt]
  }

  const MAX_PLAUSIBLE = 50_000_000
  if (minAmt !== null && minAmt > MAX_PLAUSIBLE) minAmt = null
  if (maxAmt !== null && maxAmt > MAX_PLAUSIBLE) maxAmt = null

  // ── location_tag derivation (fallback) ──────────────────────────────────────
  // If the scraper didn't set location_tag explicitly, try to infer it from the
  // eligibility_criteria "Open to: <place>" entries. Historically several NLCF
  // grants (and probably others) left location_tag as null/'UK' even when the
  // eligibility clearly named a single nation — this caused Welsh/Scottish/NI
  // grants to be surfaced to English orgs as if they were UK-wide.
  //
  // Rule: if eligibility names exactly ONE nation (or UK), use it. If it lists
  // multiple nations we assume UK-wide. If there's no signal at all, leave the
  // tag as-is so the matching engine's fallback heuristics can take over.
  let locationTag: string | null | undefined = g.location_tag
  if (locationTag == null) {
    const openToEntries = g.eligibility_criteria
      .map(e => e.match(/^\s*open to:\s*(.+?)\s*$/i)?.[1])
      .filter((v): v is string => !!v)

    if (openToEntries.length > 0) {
      // Each "Open to:" line may itself list multiple nations separated by comma/&/and
      const pieces = openToEntries
        .flatMap(line => line.split(/,|&|\band\b/i))
        .map(p => deriveLocationTag(p))
        .filter((t): t is string => t !== null)

      const unique = Array.from(new Set(pieces))
      const nations = unique.filter(t => t === 'England' || t === 'Scotland' || t === 'Wales' || t === 'Northern Ireland')

      if (unique.length === 1) {
        locationTag = unique[0]
      } else if (nations.length >= 2) {
        locationTag = 'UK'
      } else if (unique.length > 0) {
        // Mixed regional + nation — keep the first non-UK value (best-effort)
        locationTag = unique.find(t => t !== 'UK') ?? 'UK'
      }
    }
  }

  return {
    ...g,
    apply_url:    g.apply_url?.trim() ?? null,
    amount_min:   minAmt,
    amount_max:   maxAmt,
    location_tag: locationTag ?? null,
  }
}

// ── DB upsert ─────────────────────────────────────────────────────────────────
// New grants (never seen before) land with is_active: false so an admin can
// review them in the "Needs Review" tab before they go live.
// Re-scraped existing grants flow through mergeGrantUpdate so admin-pinned
// fields, trust-laddered AI classifier output, etc. are preserved.
async function upsertGrants(source: string, grants: ScrapedGrant[]): Promise<CrawlResult> {
  if (grants.length === 0) return { source, fetched: 0, upserted: 0 }
  const supabase = adminClient()

  const valid = grants.map(sanitiseGrant).filter((g): g is ScrapedGrant => g !== null)
  if (valid.length === 0) return { source, fetched: grants.length, upserted: 0, error: 'All rows failed validation' }

  // Check which external_ids are already in the DB
  const ids = valid.map(g => g.external_id)
  const { data: existing } = await supabase
    .from('scraped_grants')
    .select('id, external_id')
    .in('external_id', ids)
  const existingByExtId = new Map(
    (existing ?? []).map((r: { id: string; external_id: string }) => [r.external_id, r])
  )

  const now = new Date().toISOString()
  const provenanceSource = `scraper:${source}`

  // Fields that ScrapedGrant carries which are tracked-by-provenance. Other
  // ScrapedGrant fields (sectors, eligibility_criteria, raw_data, external_id,
  // source) are untracked and flow through the merger as-is.
  const TRACKED_SCRAPER_FIELDS = [
    'title','funder','funder_type','description','amount_min','amount_max',
    'deadline','is_rolling','is_local','apply_url','funding_type','location_tag',
  ] as const

  // ── 1. Update existing grants — merger handles per-field decisions ──────────
  // Admin-pinned values are preserved by the merger via the `pinned` flag.
  // Trust ladder respects admin > AI > scraper. Same-source writes can clear
  // (fixes detect-only-adds anti-pattern).
  const toUpdate = valid.filter(g => existingByExtId.has(g.external_id))
  for (const g of toUpdate) {
    const current = existingByExtId.get(g.external_id)!
    const fields: Record<string, unknown> = { last_seen_at: now }

    for (const field of TRACKED_SCRAPER_FIELDS) {
      const value = (g as unknown as Record<string, unknown>)[field]
      if (value === undefined) continue
      fields[field] = value
    }

    // raw_data passes through untracked
    if (g.raw_data !== undefined) fields.raw_data = g.raw_data
    // Don't touch is_active on re-scrape

    await mergeGrantUpdate({ id: current.id, fields, source: provenanceSource, pinned: false, db: supabase })
  }

  // ── 2. Insert new grants with is_active: false (pending admin review) ──────
  // Stamp initial provenance for every populated tracked field with the
  // scraper as the source.
  //
  // Pipeline v1 Phase 3: scrape-time temporal validity check.
  // If the captured deadline is already 7+ days past, the round has clearly
  // closed — insert with pipeline_state='rejected' + rejection_reason so the
  // row doesn't enter the founder's NR queue. 7-day grace handles scraper-lag
  // where pages get crawled within a week of the deadline. Rows without a
  // deadline (rolling or undated) pass through unfiltered — those are handled
  // by the sweep step downstream.
  let rejectedHistorical = 0
  const toInsert = valid
    .filter(g => !existingByExtId.has(g.external_id))
    .map(g => {
      const stamped = stampNewGrant({ ...g, last_seen_at: now, is_active: false }, provenanceSource)
      const verdict = classifyDeadlineAtScrape(g.deadline)
      if (verdict.state === 'rejected') {
        rejectedHistorical++
        return {
          ...stamped,
          pipeline_state:   'rejected',
          rejection_reason: verdict.reason,
        }
      }
      return stamped
    })
  if (toInsert.length > 0) {
    for (let i = 0; i < toInsert.length; i += 50) {
      await supabase
        .from('scraped_grants')
        .insert(toInsert.slice(i, i + 50))
    }
  }

  return { source, fetched: grants.length, upserted: valid.length, rejectedHistorical }
}

// ── Scrape-time temporal validity ─────────────────────────────────────────────
// Pipeline v1 Phase 3. See docs/pipeline-v1-spec.md §5.
const SCRAPE_GRACE_DAYS = 7

function classifyDeadlineAtScrape(deadline: string | null | undefined): {
  state:   'captured' | 'rejected'
  reason?: 'historical_deadline'
} {
  if (!deadline) return { state: 'captured' }  // rolling / undated handled downstream

  const todayMs    = Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')
  const deadlineMs = Date.parse(deadline.length === 10 ? deadline + 'T00:00:00Z' : deadline)
  if (isNaN(deadlineMs)) return { state: 'captured' }  // unparseable → let through, manual review

  const graceMs = SCRAPE_GRACE_DAYS * 24 * 60 * 60 * 1000
  if (deadlineMs >= todayMs - graceMs) return { state: 'captured' }
  return { state: 'rejected', reason: 'historical_deadline' }
}

// ── Source 46 — Garfield Weston Foundation ────────────────────────────────────
// Rolling UK-wide grant maker (~£100m/year). No structured listing page —
// hardcoded as a single rolling entry covering all programme areas.
async function crawlGarfieldWeston(): Promise<CrawlResult> {
  const SOURCE = 'garfield_weston'
  try {
    const grants: ScrapedGrant[] = [{
      external_id:          `${SOURCE}_main`,
      source:               SOURCE,
      title:                'Garfield Weston Foundation — General Grants',
      funder:               'Garfield Weston Foundation',
      funder_type:          'trust_foundation',
      description:          'Family-founded grant-maker giving around £100 million a year to UK charities. ' +
                            'Funds a wide range of sectors including welfare, youth, community, environment, ' +
                            'education, health, arts, heritage and faith. Applications accepted year-round with ' +
                            'decisions at quarterly trustee meetings.',
      amount_min:           1000,
      amount_max:           100000,
      deadline:             null,
      is_rolling:           true,
      is_local:             false,
      sectors:              ['welfare', 'youth', 'community', 'environment', 'education', 'health', 'arts', 'heritage'],
      eligibility_criteria: [
        'Registered UK charity or exempt/excepted body',
        'Working in one of the foundation\'s core sectors',
        'Previous grantees must wait at least one year before reapplying',
        'Applications accepted from charities of any size',
      ],
      apply_url:            'https://garfieldweston.org/for-grant-applicants/how-to-apply/',
      raw_data:             { note: 'Hardcoded rolling entry — no structured listing page' },
    }]
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 47 — Clothworkers Foundation ───────────────────────────────────────
// Open Grants Programme: capital costs for small/medium charities supporting
// marginalised communities. Two tiers: small grants up to £15k, large £15k+.
// Rolling applications accepted year-round, reviewed at quarterly board meetings.
async function crawlClothworkersFoundation(): Promise<CrawlResult> {
  const SOURCE = 'clothworkers_foundation'
  try {
    const grants: ScrapedGrant[] = [
      {
        external_id:          `${SOURCE}_small_grants`,
        source:               SOURCE,
        title:                'Clothworkers Foundation — Small Capital Grants (up to £15,000)',
        funder:               'The Clothworkers Foundation',
        funder_type:          'trust_foundation',
        description:          'Capital grants up to £15,000 for small- and medium-sized charities and social ' +
                              'enterprises supporting disadvantaged and marginalised communities. Funds ' +
                              'equipment, vehicles, digital infrastructure and small building works. ' +
                              'Rolling programme — applications reviewed quarterly.',
        amount_min:           1000,
        amount_max:           15000,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['community', 'welfare', 'disadvantaged communities'],
        eligibility_criteria: [
          'Registered charity or social enterprise',
          'Annual income generally under £5 million',
          'Capital costs only (equipment, vehicles, buildings, digital)',
          'Must work with disadvantaged or marginalised communities',
          'Must embed lived experience across organisational work',
        ],
        apply_url:            'https://www.clothworkersfoundation.org.uk/open-funding',
        raw_data:             { tier: 'small', note: 'Hardcoded rolling entry' },
      },
      {
        external_id:          `${SOURCE}_large_grants`,
        source:               SOURCE,
        title:                'Clothworkers Foundation — Large Capital Grants (over £15,000)',
        funder:               'The Clothworkers Foundation',
        funder_type:          'trust_foundation',
        description:          'Capital grants over £15,000 — typically for building purchase, construction or ' +
                              'major refurbishment projects for charities serving marginalised communities. ' +
                              'In 2024, 186 building projects were funded. Rolling programme reviewed quarterly.',
        amount_min:           15001,
        amount_max:           250000,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['community', 'welfare', 'disadvantaged communities'],
        eligibility_criteria: [
          'Registered charity or social enterprise',
          'Capital costs only — buildings, major refurbishment, large equipment',
          'Must work with disadvantaged or marginalised communities',
          'Demonstrates lived experience embedded in governance and delivery',
          'Can evidence significant organisational impact from the capital project',
        ],
        apply_url:            'https://www.clothworkersfoundation.org.uk/open-funding',
        raw_data:             { tier: 'large', note: 'Hardcoded rolling entry' },
      },
    ]
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 48 — Joseph Rowntree Charitable Trust ──────────────────────────────
// Quaker-led trust with 5 programmes: peace & security, power & accountability,
// rights & justice, sustainable future, and Northern Ireland. Very focused —
// best for organisations working on structural change and advocacy.
async function crawlJRCT(): Promise<CrawlResult> {
  const SOURCE = 'jrct'
  try {
    const grants: ScrapedGrant[] = [
      {
        external_id:          `${SOURCE}_power_accountability`,
        source:               SOURCE,
        title:                'JRCT — Power & Accountability Programme',
        funder:               'Joseph Rowntree Charitable Trust',
        funder_type:          'trust_foundation',
        description:          'Supports work that shifts power in UK democracy — including accountable business, ' +
                              'fair elections, and combating corruption and undue political influence. ' +
                              'Open to organisations working on systemic democratic change.',
        amount_min:           10000,
        amount_max:           200000,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['democracy', 'accountability', 'governance', 'civic society'],
        eligibility_criteria: [
          'Registered UK charity or equivalent legal structure',
          'Systemic or structural change focus (not direct service delivery)',
          'Work must fit within JRCT\'s Power & Accountability programme themes',
        ],
        apply_url:            'https://www.jrct.org.uk/funding-priorities',
        raw_data:             { programme: 'power_accountability', note: 'Hardcoded rolling entry' },
      },
      {
        external_id:          `${SOURCE}_rights_justice`,
        source:               SOURCE,
        title:                'JRCT — Rights & Justice Programme',
        funder:               'Joseph Rowntree Charitable Trust',
        funder_type:          'trust_foundation',
        description:          'Funds organisations challenging injustice and advancing human rights in the UK, ' +
                              'including refugee rights, racial justice, protest rights, and access to justice. ' +
                              'Prioritises grassroots and BAME-led organisations.',
        amount_min:           10000,
        amount_max:           200000,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['human rights', 'racial justice', 'refugee support', 'legal rights'],
        eligibility_criteria: [
          'Registered UK charity or community interest company',
          'Rights-based or justice-focused work',
          'BAME-led organisations particularly encouraged',
          'Focus on structural change, not one-off casework',
        ],
        apply_url:            'https://www.jrct.org.uk/funding-priorities',
        raw_data:             { programme: 'rights_justice', note: 'Hardcoded rolling entry' },
      },
      {
        external_id:          `${SOURCE}_sustainable_future`,
        source:               SOURCE,
        title:                'JRCT — Sustainable Future Programme',
        funder:               'Joseph Rowntree Charitable Trust',
        funder_type:          'trust_foundation',
        description:          'Supports work on a just transition to a sustainable economy, including climate ' +
                              'justice, energy democracy, and systemic alternatives to extractive capitalism. ' +
                              'Quaker values underpin all funding decisions.',
        amount_min:           10000,
        amount_max:           200000,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['environment', 'climate justice', 'sustainability', 'energy'],
        eligibility_criteria: [
          'Registered UK charity or equivalent',
          'Systemic change focus aligned with just transition',
          'Intersectional approach linking climate and social justice',
        ],
        apply_url:            'https://www.jrct.org.uk/funding-priorities',
        raw_data:             { programme: 'sustainable_future', note: 'Hardcoded rolling entry' },
      },
    ]
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 50 — People's Health Trust ─────────────────────────────────────────
// Funded by health lottery proceeds. Focuses on health inequalities caused by
// social and economic conditions. Now operates via the Health Justice Fund —
// six thematic priority areas covering housing, discrimination, mental health,
// employment and more. Individual themes open for applications periodically.
async function crawlPeoplesHealthTrust(): Promise<CrawlResult> {
  const SOURCE = 'peoples_health_trust'
  try {
    const grants: ScrapedGrant[] = [
      {
        external_id:          `${SOURCE}_health_justice_fund`,
        source:               SOURCE,
        title:                "People's Health Trust — Health Justice Fund",
        funder:               "People's Health Trust",
        funder_type:          'lottery',
        description:          'The Health Justice Fund supports communities experiencing health inequalities to ' +
                              'improve health for the long term. Six thematic priority areas: Advice for Health, ' +
                              'Discrimination & Health, Good Work & Young People, Homes for Health, Nature for Health, ' +
                              'and Partnerships for Health. Each theme opens for applications periodically — ' +
                              'check the website for currently live rounds.',
        amount_min:           10000,
        amount_max:           150000,
        deadline:             null,
        is_rolling:           false,
        is_local:             false,
        sectors:              ['health', 'housing', 'employment', 'discrimination', 'mental health', 'poverty'],
        eligibility_criteria: [
          'UK charity, community interest company or similar',
          'Community-led or co-produced approach required',
          'Must address root causes of health inequalities (not just symptoms)',
          'Evidence of working with communities experiencing disadvantage',
          'Check website for currently open priority themes',
        ],
        apply_url:            'https://www.peopleshealthtrust.org.uk/funding/health-justice-fund',
        raw_data:             { programme: 'health_justice_fund', note: 'Hardcoded entry — site rebuilt 2024/25, check open themes' },
      },
    ]
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 51 — National Churches Trust ───────────────────────────────────────
// UK charity helping to maintain, repair and support church buildings so they
// can serve their communities. Grants for urgent structural repairs, community
// use improvements, and heritage projects.
async function crawlNationalChurchesTrust(): Promise<CrawlResult> {
  const SOURCE = 'national_churches_trust'
  try {
    const grants: ScrapedGrant[] = [
      {
        external_id:          `${SOURCE}_cornerstone`,
        source:               SOURCE,
        title:                'National Churches Trust — Cornerstone Grants',
        funder:               'National Churches Trust',
        funder_type:          'trust_foundation',
        description:          'Grants of £10,000–£50,000 for urgent structural repair of church buildings across ' +
                              'the UK. Focused on preventing further deterioration of the building fabric — ' +
                              'roofs, walls, towers and drainage.',
        amount_min:           10000,
        amount_max:           50000,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['heritage', 'community', 'faith'],
        eligibility_criteria: [
          'Church building open to the public for worship',
          'UK-wide (all denominations)',
          'Repair or maintenance work only (not new build)',
          'Evidence of regular use by the local community',
          'Listed building or significant heritage status preferred',
        ],
        apply_url:            'https://www.nationalchurchestrust.org/get-support/grants',
        raw_data:             { programme: 'cornerstone', note: 'Hardcoded rolling entry' },
      },
      {
        external_id:          `${SOURCE}_community_mission`,
        source:               SOURCE,
        title:                'National Churches Trust — Community Mission Grants',
        funder:               'National Churches Trust',
        funder_type:          'trust_foundation',
        description:          'Grants of up to £20,000 to help church buildings become better community assets — ' +
                              'toilet facilities, accessibility improvements, kitchens and flexible community ' +
                              'spaces that increase use by the local community.',
        amount_min:           1000,
        amount_max:           20000,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['heritage', 'community', 'faith', 'accessibility'],
        eligibility_criteria: [
          'Active church building open for community use',
          'UK-wide, all Christian denominations',
          'Project must increase or improve community use of the building',
          'Evidence of local need and community support',
        ],
        apply_url:            'https://www.nationalchurchestrust.org/get-support/grants',
        raw_data:             { programme: 'community_mission', note: 'Hardcoded rolling entry' },
      },
    ]
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 53 — Ufi VocTech Trust — REMOVED 2026-07-25 ────────────────────────
// crawlUfiVocTech was named like a scraper but fetched nothing: it returned one
// hardcoded object whose own raw_data said "Hardcoded entry — check website for
// open funding rounds".
//
// It invented a fund. "Ufi VocTech Trust — VocTech Impact Fund" is not a name Ufi
// has ever used, and its £50,000–£500,000 range matched none of Ufi's four real
// programmes (Together up to £10k, Activate £30k–£60k, Challenge £200k–£250k,
// Ignite by invitation). Ufi's own page states "Grant funding for vocational
// technology from £30k to £150k".
//
// Because it upserted daily, it also made the row uncorrectable: any fix to the
// title or amounts was overwritten by the next crawl. The catalogue already holds
// a better Ufi row under the funder's real name, so this seed was a duplicate
// generator, not a source. The row it created has been archived.
//
// If Ufi is re-added, catalogue the four named programmes from the live page —
// do not re-add an umbrella row with invented figures.

// ── Source 54 — Devon Community Foundation ────────────────────────────────────
// devoncf.com — supports charities and community groups across Devon.
// Tries grants listing HTML; falls back to a hardcoded rolling entry.
// ── Source 55 — Leeds Community Foundation ────────────────────────────────────
// leedscf.org.uk — funds charities and community groups in Leeds & West Yorkshire.
async function crawlLeedsCF(): Promise<CrawlResult> {
  const SOURCE = 'leeds_cf'
  const BASE   = 'https://www.leedscf.org.uk'
  try {
    const html  = await fetchHtml(`${BASE}/open-grants/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const card of root.querySelectorAll('article, .grant, .fund, .funding-card, section.fund')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue

      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const slug = slugify(href || title)
      const desc = card.querySelector('p, .excerpt')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)

      grants.push({
        external_id:          `leeds_cf_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Leeds Community Foundation',
        funder_type:          'community_foundation',
        description:          desc || 'Grant from Leeds Community Foundation.',
        amount_min:           min,
        amount_max:           max,
        deadline:             null,
        is_rolling:           true,
        is_local:             true,
        sectors:              ['community', 'social welfare', 'health'],
        eligibility_criteria: ['Charities and community groups in Leeds / West Yorkshire'],
        apply_url:            url || null,
        raw_data:             { title, href } as Record<string, unknown>,
      })
    }

    if (grants.length > 0) return await upsertGrants(SOURCE, grants)

    return await upsertGrants(SOURCE, [{
      external_id:          `${SOURCE}_open_grants`,
      source:               SOURCE,
      title:                'Leeds Community Foundation — Open Grants',
      funder:               'Leeds Community Foundation',
      funder_type:          'community_foundation',
      description:          'Leeds Community Foundation makes grants to charities and community organisations across Leeds and West Yorkshire. Programmes cover community, health, arts, sport and economic development.',
      amount_min:           500,
      amount_max:           25000,
      deadline:             null,
      is_rolling:           true,
      is_local:             true,
      sectors:              ['community', 'social welfare', 'health', 'arts', 'sport'],
      eligibility_criteria: ['Registered charity or community group in Leeds / West Yorkshire'],
      apply_url:            `${BASE}/open-grants/`,
      raw_data:             { note: 'Hardcoded fallback' } as Record<string, unknown>,
    }])
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 71 — Creative Scotland ─────────────────────────────────────────────
// creativescotland.com — Scotland's main arts and creative industries funder.
//
// The page selectors (article, .fund, .funding-option, .card) are broad and
// match nav/info elements as well as actual grant cards. We guard with an
// explicit junk-title blocklist below — 7 known nav-page titles that
// previously landed in the catalogue (deactivated 2026-05-18). If new junk
// titles emerge, add them here. Selectors could be tightened post-launch.
const CREATIVE_SCOTLAND_JUNK_TITLES: RegExp[] = [
  /^funding programmes$/i,
  /^about our funding$/i,
  /^archived funds$/i,
  /^other sources of support$/i,
  /^help with your application$/i,
  /^awards listings$/i,
  /^funding and development programme deadlines$/i,
]

async function crawlCreativeScotland(): Promise<CrawlResult> {
  const SOURCE = 'creative_scotland'
  const BASE   = 'https://www.creativescotland.com'
  try {
    const html  = await fetchHtml(`${BASE}/funding/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []

    for (const card of root.querySelectorAll('article, .fund, .funding-option, .card')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue
      if (CREATIVE_SCOTLAND_JUNK_TITLES.some(p => p.test(title))) continue

      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const slug = slugify(href || title)
      const desc = card.querySelector('p, .excerpt, .summary')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)

      grants.push({
        external_id:          `creative_scotland_${slug}`,
        source:               SOURCE,
        title,
        funder:               'Creative Scotland',
        funder_type:          'government',
        description:          desc || 'Funding opportunity from Creative Scotland.',
        amount_min:           min,
        amount_max:           max,
        deadline:             null,
        is_rolling:           true,
        is_local:             true,
        sectors:              ['arts', 'culture', 'creative industries', 'heritage'],
        eligibility_criteria: ['Individuals, organisations and businesses based in Scotland'],
        apply_url:            url || null,
        raw_data:             { title, href } as Record<string, unknown>,
      })
    }

    // Removed fallback emit-two-hardcoded-Open-Fund-rows behaviour (2026-05-19).
    // Reasons:
    //   1. The hardcoded apply_url (/funding/apply-for-funding/) now 404s —
    //      Creative Scotland restructured their site.
    //   2. The fallback rows are duplicates of a richer manual row already in
    //      the catalogue ("Creative Scotland — Open Fund", source='manual',
    //      apply_url=https://www.creativescotland.com/funding, url_status='ok').
    //   3. The fallback was re-creating dead-URL rows in Needs Review on every
    //      nightly crawl, regardless of admin deactivation (scraper-revert
    //      pattern per feedback_scraped_field_fixes_revert.md).
    // If the main scrape returns 0 grants, return 0 — the manual canonical
    // row covers Creative Scotland minimum coverage. Fix the main scrape's
    // card-selector drift separately (same pattern as Foundation Scotland).
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// BATCH 5 SOURCES (06:20) — more CFs + regional arts/sport bodies
// ══════════════════════════════════════════════════════════════════════════════

// ── Source 72 — South Yorkshire Community Foundation ──────────────────────────
async function crawlSouthYorkshireCF(): Promise<CrawlResult> {
  const SOURCE = 'south_yorkshire_cf'
  const BASE   = 'https://www.sycf.org.uk'
  try {
    const html  = await fetchHtml(`${BASE}/apply/search-our-grants`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []
    for (const card of root.querySelectorAll('article, .grant, .fund, .grant-item')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue
      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const desc = card.querySelector('p')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)
      grants.push({ external_id: `south_yorkshire_cf_${slugify(href || title)}`, source: SOURCE, title, funder: 'South Yorkshire Community Foundation', funder_type: 'community_foundation', description: desc || 'Grant from South Yorkshire Community Foundation.', amount_min: min, amount_max: max, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'social welfare'], eligibility_criteria: ['Organisations in South Yorkshire'], location_tag: 'South Yorkshire', apply_url: url || null, raw_data: { title, href } as Record<string, unknown> })
    }
    if (grants.length > 0) return await upsertGrants(SOURCE, grants)
    return await upsertGrants(SOURCE, [{ external_id: `${SOURCE}_open`, source: SOURCE, title: 'South Yorkshire Community Foundation — Open Grants', funder: 'South Yorkshire Community Foundation', funder_type: 'community_foundation', description: 'South Yorkshire Community Foundation supports voluntary and community organisations across Sheffield, Rotherham, Barnsley and Doncaster with a range of grant programmes.', amount_min: 500, amount_max: 20000, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'social welfare', 'arts', 'health'], eligibility_criteria: ['Voluntary or community group in South Yorkshire'], location_tag: 'South Yorkshire', apply_url: `${BASE}/apply/search-our-grants`, raw_data: { note: 'Hardcoded fallback' } as Record<string, unknown> }])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 74 — East End Community Foundation ─────────────────────────────────
// Serves East London (Hackney, Newham, Tower Hamlets, Waltham Forest, etc.)
async function crawlEastEndCF(): Promise<CrawlResult> {
  const SOURCE = 'east_end_cf'
  const BASE   = 'https://www.eastendcf.org'
  try {
    const html  = await fetchHtml(`${BASE}/grants/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []
    for (const card of root.querySelectorAll('article, .grant, .fund, .grant-item')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue
      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const desc = card.querySelector('p')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)
      grants.push({ external_id: `east_end_cf_${slugify(href || title)}`, source: SOURCE, title, funder: 'East End Community Foundation', funder_type: 'community_foundation', description: desc || 'Grant from East End Community Foundation.', amount_min: min, amount_max: max, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'social welfare', 'diversity'], eligibility_criteria: ['Organisations in East London'], apply_url: url || null, raw_data: { title, href } as Record<string, unknown> })
    }
    if (grants.length > 0) return await upsertGrants(SOURCE, grants)
    return await upsertGrants(SOURCE, [{ external_id: `${SOURCE}_open`, source: SOURCE, title: 'East End Community Foundation — Open Grants', funder: 'East End Community Foundation', funder_type: 'community_foundation', description: 'East End Community Foundation funds charities and voluntary organisations in Hackney, Newham, Tower Hamlets, Waltham Forest and surrounding East London boroughs.', amount_min: 500, amount_max: 20000, deadline: null, is_rolling: true, is_local: true, sectors: ['community', 'social welfare', 'diversity', 'youth', 'health'], eligibility_criteria: ['Registered charity or voluntary group in East London'], apply_url: `${BASE}/apply-for-a-grant/`, raw_data: { note: 'Hardcoded fallback' } as Record<string, unknown> }])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 78 — Sport Wales ────────────────────────────────────────────────────
// sport.wales — national body funding sport and physical activity in Wales.
async function crawlSportWales(): Promise<CrawlResult> {
  const SOURCE = 'sport_wales'
  const BASE   = 'https://www.sport.wales'
  try {
    const html  = await fetchHtml(`${BASE}/funding/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []
    for (const card of root.querySelectorAll('article, .fund, .grant, .card')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue
      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const desc = card.querySelector('p')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)
      grants.push({ external_id: `sport_wales_${slugify(href || title)}`, source: SOURCE, title, funder: 'Sport Wales', funder_type: 'government', description: desc || 'Funding from Sport Wales.', amount_min: min, amount_max: max, deadline: null, is_rolling: true, is_local: true, sectors: ['sport', 'physical activity', 'health'], eligibility_criteria: ['Sports clubs and organisations based in Wales'], location_tag: 'Wales', apply_url: url || null, raw_data: { title, href } as Record<string, unknown> })
    }
    if (grants.length > 0) return await upsertGrants(SOURCE, grants)
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_small_grants`, source: SOURCE, title: 'Sport Wales — Small Grants', funder: 'Sport Wales', funder_type: 'government', description: 'Sport Wales funds sports clubs and organisations in Wales to increase participation, develop talent and improve infrastructure. Small grants support grassroots activity.', amount_min: 300, amount_max: 5000, deadline: null, is_rolling: true, is_local: true, sectors: ['sport', 'physical activity', 'health', 'youth'], eligibility_criteria: ['Sports clubs and community organisations in Wales', 'Must increase participation or improve facilities'], location_tag: 'Wales', apply_url: `${BASE}/funding/`, raw_data: { note: 'Hardcoded fallback' } as Record<string, unknown> },
      { external_id: `${SOURCE}_facilities`, source: SOURCE, title: 'Sport Wales — Facilities Investment Programme', funder: 'Sport Wales', funder_type: 'government', description: 'Capital investment programme supporting the development of community sports facilities across Wales. Grants for new builds, refurbishment and equipment.', amount_min: 10000, amount_max: 150000, deadline: null, is_rolling: false, is_local: true, sectors: ['sport', 'physical activity', 'facilities', 'community'], eligibility_criteria: ['Sports clubs, local authorities, education bodies in Wales', 'Facility must be for community use'], location_tag: 'Wales', apply_url: `${BASE}/funding/facilities/`, raw_data: { note: 'Hardcoded fallback' } as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 79 — Arts Council of Wales ─────────────────────────────────────────
// arts.wales — principal arts development agency for Wales.
async function crawlArtsCouncilWales(): Promise<CrawlResult> {
  const SOURCE = 'arts_council_wales'
  const BASE   = 'https://arts.wales'
  try {
    // NOTE THE MISSING TRAILING SLASH. `${BASE}/funding/` 301s to
    // /funding-archived, which returns 403 — so every run since the site was
    // reorganised failed with "returned 403" and logged fetched: 0. 38 identical
    // errors accumulated in crawl_errors, which nothing reads. The scraper was
    // never broken in the way it appeared; it was asking for a page that had
    // moved, and the redirect target refuses robots.
    const html = await fetchHtml(`${BASE}/funding`)
    const root = parseHTML(html)

    // Arts Wales lists its funds in the site NAVIGATION, not in content cards,
    // so there is nothing for an `article`/`.card` selector to find — which is
    // why the old selector list would have yielded zero even on a 200.
    // A fund is a two-level path: /funding/<section>/<fund>. One level
    // (/funding/individuals, /funding/help-and-support) is a section index.
    const seen = new Map<string, { title: string; section: string }>()
    for (const a of root.querySelectorAll('a[href]')) {
      const href = (a.getAttribute('href') ?? '').split(/[?#]/)[0].replace(/\/$/, '')
      const m = href.match(/^\/funding\/([^/]+)\/([^/]+)$/)
      if (!m) continue
      const title = a.text?.trim() ?? ''
      if (title.length < 3) continue
      if (!seen.has(href)) seen.set(href, { title, section: m[1] })
    }

    // What the section says about who may apply. Stated as eligibility TEXT, not
    // as structures: ScrapedGrant carries no eligible_structures and should not,
    // because deriving legal forms is the classifier's job reading the page.
    // Saying "individual artists" here is what lets it reach `individual` rather
    // than tagging a personal bursary as open to charities.
    const ELIGIBILITY: Record<string, string> = {
      individuals:        'Individual artists and creative practitioners based in Wales',
      organisations:      'Arts organisations based in Wales',
      'creative-learning': 'Schools, arts organisations and practitioners delivering creative learning in Wales',
      international:      'Artists and arts organisations in Wales working internationally',
    }

    const grants: ScrapedGrant[] = Array.from(seen.entries()).map(([href, { title, section }]) => ({
      external_id: `arts_council_wales_${slugify(href)}`,
      source: SOURCE,
      title: `Arts Council of Wales — ${title}`,
      funder: 'Arts Council of Wales',
      funder_type: 'government',
      description: `${title}: funding from Arts Council of Wales. ${ELIGIBILITY[section] ?? 'Applicants based in Wales'}.`,
      amount_min: null,
      amount_max: null,
      deadline: null,
      is_rolling: false,
      is_local: true,
      sectors: ['arts', 'culture', 'creative industries'],
      eligibility_criteria: [ELIGIBILITY[section] ?? 'Applicants based in Wales'],
      apply_url: `${BASE}${href}`,
      location_tag: 'Wales',
      raw_data: { title, href, section } as Record<string, unknown>,
    }))

    // No hardcoded fallback. The previous one upserted two invented rows whose
    // apply_urls (/funding/organisations/) do not exist, and reported
    // `upserted: 2` — a healthy-looking result that masked a total failure for
    // 38 consecutive runs. An empty result now reports as empty, which is the
    // only way a future breakage becomes visible.
    return await upsertGrants(SOURCE, grants)
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 80 — Wolfson Foundation ────────────────────────────────────────────
// wolfson.org.uk — independent UK funder of excellence in the arts, humanities, health and science.
async function crawlWolfsonFoundation(): Promise<CrawlResult> {
  const SOURCE = 'wolfson_foundation'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_capital`, source: SOURCE, title: 'Wolfson Foundation — Capital Grants', funder: 'Wolfson Foundation', funder_type: 'trust_foundation', description: 'The Wolfson Foundation funds capital projects in science and medicine, humanities, arts and heritage, and education, health and welfare. Particularly interested in museums, galleries, libraries, universities and schools. Grants typically £20,000–£500,000.', amount_min: 20000, amount_max: 500000, deadline: null, is_rolling: true, is_local: false, sectors: ['arts', 'heritage', 'education', 'health', 'science', 'museums', 'libraries'], eligibility_criteria: ['Registered UK charity or exempt charity (universities, schools, NHS trusts)', 'Capital projects only (buildings, equipment, renovations)', 'Must demonstrate excellence and broad public benefit', 'Cannot fund running costs or individuals'], apply_url: 'https://www.wolfson.org.uk/funding/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 81 — The Pilgrim Trust ─────────────────────────────────────────────
// thepilgrimtrust.org.uk — arts & heritage conservation + social welfare.
async function crawlPilgrimTrust(): Promise<CrawlResult> {
  const SOURCE = 'pilgrim_trust'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_preservation`, source: SOURCE, title: 'Pilgrim Trust — Preservation & Scholarship', funder: 'The Pilgrim Trust', funder_type: 'trust_foundation', description: 'Funds the preservation of the UK\'s cultural heritage including archives, manuscripts, historic buildings, and conservation of art objects. Also supports scholarly research and academic conferences.', amount_min: 5000, amount_max: 100000, deadline: null, is_rolling: true, is_local: false, sectors: ['heritage', 'arts', 'archives', 'conservation', 'education'], eligibility_criteria: ['UK registered charity or heritage body', 'Project must preserve UK cultural heritage', 'Academic/research projects via UK institutions'], apply_url: 'https://thepilgrimtrust.org.uk/grants/', raw_data: {} as Record<string, unknown> },
      { external_id: `${SOURCE}_social_welfare`, source: SOURCE, title: 'Pilgrim Trust — Social Welfare', funder: 'The Pilgrim Trust', funder_type: 'trust_foundation', description: 'Social welfare grants for registered charities working with older people, people with disabilities, ex-offenders, homelessness, substance misuse, and mental health in the UK.', amount_min: 5000, amount_max: 50000, deadline: null, is_rolling: true, is_local: false, sectors: ['social welfare', 'mental health', 'homelessness', 'disability', 'older people', 'criminal justice'], eligibility_criteria: ['Registered UK charity', 'Working with socially excluded or vulnerable people', 'Grants for defined projects, not general running costs'], apply_url: 'https://thepilgrimtrust.org.uk/grants/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ══════════════════════════════════════════════════════════════════════════════
// BATCH 6 SOURCES (06:25) — major national funders + corporate/landfill
// ══════════════════════════════════════════════════════════════════════════════

// ── Homeless Link — sector funding aggregator ─────────────────────────────────
// homeless.org.uk/what-we-do/grants-and-investment/current-funding-opportunities
//
// AN AGGREGATOR, NOT A FUNDER. Every other source here is a funder publishing
// its own programmes; this one is the homelessness sector's membership body
// listing funds it has been told about. That difference drives the whole design:
//
//   - `funder` must be the ACTUAL funder (Henry Smith, LNER, Lloyds), never
//     "Homeless Link". Getting that wrong would create a phantom funder with a
//     dozen unrelated programmes hanging off it.
//   - `apply_url` is resolved from the detail page's first external link, so
//     the row points at the funder's own page rather than a news post about it.
//   - amounts and deadlines are deliberately NOT parsed from the listing text.
//     Its headlines quote programme totals ("£8 million in homelessness
//     prevention"), which is the pot, not the grant. Reading those as
//     amount_max is precisely the pool-vs-per-grant error the amount extractor
//     already guards against. Enrichment reads the funder's real page instead.
//
// The page carries its own disclaimer: "Whilst we try our hardest to ensure the
// information is up to date we cannot guarantee this, and anyone interested in
// applying for grants should always check directly with the funder." Recorded
// in raw_data so a reviewer knows the provenance is second-hand.
//
// Found 2026-07-29 while researching homelessness coverage: it listed four funds
// the catalogue did not hold, and it is maintained — the newest item was five
// days old.
async function crawlHomelessLink(): Promise<CrawlResult> {
  const SOURCE = 'homeless_link'
  const ORIGIN = 'https://homeless.org.uk'
  // NOT named URL: this function calls `new URL(...)` to read a host, and a
  // local const URL shadows the global constructor. Every other scraper here
  // uses `const URL` safely because none of them construct one.
  const LISTING_URL = `${ORIGIN}/what-we-do/grants-and-investment/current-funding-opportunities/`
  const MAX_DETAIL_FETCHES = 20

  /** Social, analytics and document-viewer links are never the funder's page. */
  const NOT_A_FUNDER_LINK = /twitter\.com|x\.com|linkedin\.com|facebook\.com|youtube\.com|instagram\.com|google\.com|googletagmanager|officeapps\.live\.com|in-form\.org\.uk|dsc\.org\.uk|mailto:/i

  /**
   * Name the funder from the headline, or return null and let review do it.
   *
   * PRECISE OR NOTHING, on purpose. Only two patterns are trustworthy here:
   * "... via X" / "... by X", and a trailing "(X)". A leading-capitals
   * heuristic and a URL-host fallback were both tried against the live page on
   * 2026-07-29 and produced "Practical", "Women", "Funding" and "LNER Customer"
   * as funder names. A wrong funder name is worse than none: it invents a
   * phantom funder in the catalogue and unrelated programmes then collect under
   * it. Null is honest, and these rows land in Needs Review anyway, where the
   * enricher reads the funder's own page and can fill it in properly.
   */
  function deriveFunder(title: string): string | null {
    const viaBy = title.match(/\b(?:via|by|from)\s+((?:The\s+)?[A-Z][\w'&.-]*(?:\s+[A-Z][\w'&.-]*){0,4})/)
    if (viaBy) {
      const name = viaBy[1].replace(/[-–—:,.]+$/, '').trim()
      // "by Lloyds Bank Foundation- £8 million" — strip a trailing amount clause.
      return name.replace(/\s+£.*$/, '').trim() || null
    }
    const paren = title.match(/\(([^)]{3,60})\)/)
    if (paren) return paren[1].trim()
    return null
  }

  /** Aggregator links carry campaign tracking; it is noise and it breaks dedup. */
  function stripTracking(u: string): string {
    try {
      const parsed = new URL(u)
      for (const k of Array.from(parsed.searchParams.keys())) {
        if (/^(utm_|mc_|fbclid|gclid|ref$)/i.test(k)) parsed.searchParams.delete(k)
      }
      return parsed.toString().replace(/\?$/, '')
    } catch { return u }
  }

  try {
    // Every fund here also exists on the funder's own site, and several are
    // already in the catalogue from other sources or desk research. Without
    // this check the aggregator silently duplicates them under a second
    // external_id — Henry Smith's Welcome for Newcomers was staged by hand the
    // same day this scraper was written. Matched on apply_url host+path, which
    // survives the tracking parameters stripped below.
    const existingUrls = new Set<string>()
    {
      const db = adminClient()
      for (let from = 0; ; from += 1000) {
        const { data } = await db.from('scraped_grants').select('apply_url').range(from, from + 999)
        for (const r of data ?? []) {
          if (!r.apply_url) continue
          try {
            const u = new URL(String(r.apply_url))
            existingUrls.add((u.host.replace(/^www\./, '') + u.pathname).replace(/\/$/, '').toLowerCase())
          } catch { /* unparseable stored url — nothing to match on */ }
        }
        if (!data || data.length < 1000) break
      }
    }
    const urlKey = (u: string) => {
      try {
        const p = new URL(u)
        return (p.host.replace(/^www\./, '') + p.pathname).replace(/\/$/, '').toLowerCase()
      } catch { return u.toLowerCase() }
    }

    const root  = parseHTML(await fetchHtml(LISTING_URL))
    const cards = root.querySelectorAll('li.news-item.card')
    const grants: ScrapedGrant[] = []
    let detailFetches = 0
    let skippedExisting = 0

    for (const card of cards) {
      const link = card.querySelector('a.card__link')
      const href = link?.getAttribute('href') ?? ''
      const title = (card.querySelector('.news-item__title')?.text ?? link?.getAttribute('aria-label') ?? '')
        .replace(/&amp;/g, '&').trim()
      if (!href || !title) continue

      const blurb    = (card.querySelector('.news-item__blurb')?.text ?? '').replace(/&amp;/g, '&').trim()
      const postedOn = (card.querySelector('time.news-item__date')?.text ?? '').trim()
      const newsUrl  = href.startsWith('http') ? href : `${ORIGIN}${href}`
      const slug     = href.replace(/\/$/, '').split('/').pop() ?? ''

      // Resolve the funder's own page from the detail post. Sequential and
      // capped — this is somebody else's site and we visit it twice a week.
      let applyUrl: string | null = null
      if (detailFetches < MAX_DETAIL_FETCHES) {
        detailFetches++
        try {
          const detail = parseHTML(await fetchHtml(newsUrl))
          const body = detail.querySelector('main') ?? detail
          for (const a of body.querySelectorAll('a[href]')) {
            const u = a.getAttribute('href') ?? ''
            if (!u.startsWith('http') || u.includes('homeless.org.uk')) continue
            if (NOT_A_FUNDER_LINK.test(u)) continue
            applyUrl = stripTracking(u)
            break
          }
        } catch { /* detail unavailable — fall back to the news post below */ }
      }

      if (applyUrl && existingUrls.has(urlKey(applyUrl))) { skippedExisting++; continue }

      const funder = deriveFunder(title)

      grants.push({
        external_id:          `homeless_link_${slug}`,
        source:               SOURCE,
        title:                title.slice(0, 300),
        funder,
        funder_type:          null,
        description:          [blurb, `Listed by Homeless Link on ${postedOn || 'an unstated date'}.`]
                                .filter(Boolean).join(' ').slice(0, 800),
        // Left null on purpose — see the amounts note in the header comment.
        amount_min:           null,
        amount_max:           null,
        deadline:             null,
        is_rolling:           false,
        is_local:             false,
        sectors:              ['housing'],
        eligibility_criteria: [],
        apply_url:            applyUrl ?? newsUrl,
        raw_data: {
          aggregator:            'homeless_link',
          homeless_link_url:     newsUrl,
          listed_on:             postedOn || null,
          funder_url_resolved:   applyUrl !== null,
          aggregator_disclaimer: 'Homeless Link states it cannot guarantee this information is up to date and that applicants should always check directly with the funder.',
        },
      })
    }

    const result = await upsertGrants(SOURCE, grants)
    if (skippedExisting > 0) {
      console.log(`[${SOURCE}] skipped ${skippedExisting} already in the catalogue by apply_url`)
    }
    return result
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: String(err) }
  }
}

// ── Source 89 — Cadent Foundation ────────────────────────────────────────────
// cadentgas.com/foundation — funds community energy, warm homes and social welfare.
async function crawlCadentFoundation(): Promise<CrawlResult> {
  const SOURCE = 'cadent_foundation'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_main`, source: SOURCE, title: 'Cadent Foundation — Community Grants', funder: 'Cadent Foundation', funder_type: 'corporate_foundation', description: "Cadent Foundation funds projects that tackle fuel poverty, keep communities warm and safe, and improve the lives of vulnerable people across Cadent's network areas (North West, West Midlands, East of England, North London). Grants of £1,000–£25,000.", amount_min: 1000, amount_max: 25000, deadline: null, is_rolling: true, is_local: true, sectors: ['fuel poverty', 'social welfare', 'community', 'energy', 'health'], eligibility_criteria: ['Registered charity or community group', 'Projects in Cadent\'s network area: NW England, West Midlands, East of England, North London', 'Focus on fuel poverty, vulnerable people or community resilience'], apply_url: 'https://cadentgas.com/foundation', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 90 — Severn Trent Community Fund ───────────────────────────────────
// Old stcf.org.uk domain is dead — fund now lives at stwater.co.uk. Static
// seed of the two named programmes (New Project Funding, Core Funding) plus
// the time-limited grassroots-football round.
async function crawlSevernTrentFund(): Promise<CrawlResult> {
  const SOURCE = 'severn_trent_fund'
  const BASE   = 'https://www.stwater.co.uk/about-us/severn-trent-community-fund'
  try {
    return await upsertGrants(SOURCE, [
      {
        external_id:          `${SOURCE}_new_project`,
        source:               SOURCE,
        title:                'Severn Trent Community Fund — New Project Funding',
        funder:               'Severn Trent Community Fund',
        funder_type:          'corporate_foundation',
        location_tag:         'Severn Trent region',
        description:          'Grants between £2,000 and £50,000 for projects that support community wellbeing across the Severn Trent region. Three pillars: People, Place and Environment — examples include improving access to rivers, grey-water recycling, sustainable drainage and water-efficient green spaces. Around 30 projects funded per year. Applications accepted at any time.',
        amount_min:           2000,
        amount_max:           50000,
        deadline:             null,
        is_rolling:           true,
        is_local:             true,
        sectors:              ['community', 'environment', 'water', 'biodiversity', 'sustainability'],
        eligibility_criteria: ['Charity, community group, parish council or constituted organisation', 'Located in the Severn Trent supply area (Midlands, parts of Wales and South Yorkshire)', 'Project must align with People, Place or Environment themes'],
        apply_url:            `${BASE}/new-project-funding/`,
        raw_data:             { note: 'Static seed — current programme.' } as Record<string, unknown>,
      },
      {
        external_id:          `${SOURCE}_core_funding`,
        source:               SOURCE,
        title:                'Severn Trent Community Fund — Core Funding',
        funder:               'Severn Trent Community Fund',
        funder_type:          'corporate_foundation',
        location_tag:         'Severn Trent region',
        description:          'Core funding grants of £5,000–£20,000 for one year, supporting eligible charities and community organisations with running costs and operational capacity. Two application windows per year (June and November), each open for one month.',
        amount_min:           5000,
        amount_max:           20000,
        deadline:             null,
        is_rolling:           false,
        is_local:             true,
        sectors:              ['community', 'social welfare', 'environment'],
        eligibility_criteria: ['Charity or community group operating in the Severn Trent supply area', 'Apply during June or November windows'],
        apply_url:            `${BASE}/core-funding/`,
        raw_data:             { note: 'Static seed — June and November windows.' } as Record<string, unknown>,
      },
      {
        external_id:          `${SOURCE}_kids_football_2026`,
        source:               SOURCE,
        title:                "Severn Trent Community Fund — Children's Football Clubs",
        funder:               'Severn Trent Community Fund',
        funder_type:          'corporate_foundation',
        location_tag:         'Severn Trent region',
        description:          "Time-limited 2026 round to support 80 children's football clubs across the Severn Trent region with grants of £1,000 for kit and other essential costs. Opens May 2026.",
        amount_min:           1000,
        amount_max:           1000,
        deadline:             null,
        is_rolling:           false,
        is_local:             true,
        sectors:              ['sport', 'youth', 'community'],
        eligibility_criteria: ["Children's football club in the Severn Trent supply area"],
        apply_url:            BASE + '/',
        raw_data:             { note: 'Static seed — 2026 one-off programme.' } as Record<string, unknown>,
      },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ══════════════════════════════════════════════════════════════════════════════
// BATCH 7 SOURCES (06:30) — innovation, remaining CFs, specialist foundations
// ══════════════════════════════════════════════════════════════════════════════

// ── Source 99 — sportscotland ─────────────────────────────────────────────────
// sportscotland.org.uk — national agency for sport in Scotland.
async function crawlSportScotland(): Promise<CrawlResult> {
  const SOURCE = 'sport_scotland'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_facilities`, source: SOURCE, title: 'sportscotland — Facilities Investment', funder: 'sportscotland', funder_type: 'government', location_tag: 'Scotland', description: 'sportscotland funds development of sport facilities across Scotland, from grassroots clubs to national performance venues. Capital grants for sports halls, pitches, changing facilities and equipment.', amount_min: 10000, amount_max: 500000, deadline: null, is_rolling: true, is_local: true, sectors: ['sport', 'physical activity', 'facilities', 'community'], eligibility_criteria: ['Sports clubs, local authorities and education bodies in Scotland', 'Facility must be for community or club use', 'Must demonstrate impact on participation or performance'], apply_url: 'https://sportscotland.org.uk/funding/', raw_data: {} as Record<string, unknown> },
      { external_id: `${SOURCE}_clubs`, source: SOURCE, title: 'sportscotland — Club and Community Sport Fund', funder: 'sportscotland', funder_type: 'government', location_tag: 'Scotland', description: 'Supports grassroots sports clubs and community organisations in Scotland to grow participation, improve governance and develop coaches and volunteers.', amount_min: 1000, amount_max: 50000, deadline: null, is_rolling: true, is_local: true, sectors: ['sport', 'physical activity', 'community', 'youth', 'volunteers'], eligibility_criteria: ['Sports clubs and community organisations in Scotland', 'Must be affiliated to a governing body or sport organisation'], apply_url: 'https://sportscotland.org.uk/funding/club-funding/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 101 — Ernest Cook Trust ───────────────────────────────────────────
// ernestcooktrust.org.uk — outdoor learning, conservation, and rural skills.
async function crawlErnestCookTrust(): Promise<CrawlResult> {
  const SOURCE = 'ernest_cook_trust'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_outdoor_learning`, source: SOURCE, title: 'Ernest Cook Trust — Outdoor Learning', funder: 'Ernest Cook Trust', funder_type: 'trust_foundation', description: "Ernest Cook Trust funds outdoor and environmental education projects that connect young people with nature. Supports residential outdoor learning, forest schools, farm visits and conservation skills for children and young people.", amount_min: 5000, amount_max: 50000, deadline: null, is_rolling: true, is_local: false, sectors: ['education', 'environment', 'youth', 'outdoor learning', 'conservation'], eligibility_criteria: ['UK registered charity or school', 'Programme must involve direct outdoor or environmental learning for young people', 'Residential or multi-day programmes preferred', 'Cannot fund building works or equipment only'], apply_url: 'https://www.ernestcooktrust.org.uk/grants/', raw_data: {} as Record<string, unknown> },
      { external_id: `${SOURCE}_rural_skills`, source: SOURCE, title: 'Ernest Cook Trust — Rural Skills & Conservation', funder: 'Ernest Cook Trust', funder_type: 'trust_foundation', description: 'Funds projects that teach traditional rural crafts, land management skills and conservation work. Includes dry stone walling, hedgelaying, woodland management and farm heritage skills.', amount_min: 2000, amount_max: 20000, deadline: null, is_rolling: true, is_local: false, sectors: ['conservation', 'rural', 'heritage', 'skills', 'environment', 'agriculture'], eligibility_criteria: ['UK registered charity or social enterprise', 'Focus on traditional rural or conservation skills', 'Must demonstrate training or educational component'], apply_url: 'https://www.ernestcooktrust.org.uk/grants/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 104 — Armed Forces Covenant Fund Trust ────────────────────────────
// covenantfund.org.uk — grants for the Armed Forces community.
async function crawlArmedForcesCovenant(): Promise<CrawlResult> {
  const SOURCE = 'armed_forces_covenant'
  const BASE   = 'https://www.covenantfund.org.uk'
  try {
    const html  = await fetchHtml(`${BASE}/programmes/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []
    for (const card of root.querySelectorAll('article, .programme, .grant, .card')) {
      // The page renders each programme as a PAIR of headings, closing date
      // first:
      //     <h2>CLOSING DATE: 23 Sep 2026</h2>
      //     <h2>AF3: Supporting Partners programme</h2>
      //
      // querySelector returns the first match in document order, so the old
      // code took the date label as the title. Four rows reached the catalogue
      // literally titled "CLOSING DATE: 15 Jul 2026", with deadline NULL — the
      // one field the heading actually gave us was the one thrown away.
      const headings = card.querySelectorAll('h2, h3')
      let title:    string | undefined
      let deadline: string | null = null
      for (const h of headings) {
        const t = h.text?.trim()
        if (!t) continue
        if (CLOSING_LABEL_RE.test(t)) {
          // "CLOSING DATE: 23 Sep 2026" — a date, never a title.
          deadline ??= parseUKRIDate(t)
          continue
        }
        if (!title && t.length >= 5) title = t
      }
      if (!title) continue

      // Prefer the link on the title heading; the first anchor in the card can
      // belong to the closing-date block.
      const titleHeading = headings.find(h => h.text?.trim() === title)
      const href = titleHeading?.querySelector('a')?.getAttribute('href')
                ?? card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const desc = card.querySelector('p')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)
      grants.push({ external_id: `armed_forces_covenant_${slugify(href || title)}`, source: SOURCE, title, funder: 'Armed Forces Covenant Fund Trust', funder_type: 'government', description: desc || 'Grant from Armed Forces Covenant Fund Trust.', amount_min: min, amount_max: max, deadline, is_rolling: false, is_local: false, sectors: ['armed forces', 'veterans', 'social welfare', 'community'], eligibility_criteria: ['Organisations supporting the Armed Forces community'], apply_url: url || null, raw_data: { title, href } as Record<string, unknown> })
    }
    if (grants.length > 0) return await upsertGrants(SOURCE, grants)
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_local_grants`, source: SOURCE, title: 'Armed Forces Covenant Fund Trust — Local Grants', funder: 'Armed Forces Covenant Fund Trust', funder_type: 'government', description: 'Funds projects that make a positive difference to Armed Forces personnel, veterans and their families across the UK. Local grants of up to £20,000 for community projects supporting the Armed Forces community.', amount_min: 500, amount_max: 20000, deadline: null, is_rolling: false, is_local: false, sectors: ['armed forces', 'veterans', 'social welfare', 'mental health', 'community'], eligibility_criteria: ['UK registered charity or voluntary organisation', 'Project must benefit serving personnel, veterans or their families', 'Cannot fund statutory services'], apply_url: `${BASE}/programmes/`, raw_data: { note: 'Hardcoded fallback' } as Record<string, unknown> },
      { external_id: `${SOURCE}_large_grants`, source: SOURCE, title: 'Armed Forces Covenant Fund Trust — Large Grants', funder: 'Armed Forces Covenant Fund Trust', funder_type: 'government', description: 'Larger grants of up to £500,000 for organisations developing significant new services or scaling existing provision for the Armed Forces community across the UK.', amount_min: 20000, amount_max: 500000, deadline: null, is_rolling: false, is_local: false, sectors: ['armed forces', 'veterans', 'mental health', 'housing', 'employment', 'community'], eligibility_criteria: ['Established UK charity or voluntary organisation', 'Proven track record of supporting the Armed Forces community', 'Must demonstrate reach and sustainable impact'], apply_url: `${BASE}/programmes/`, raw_data: { note: 'Hardcoded fallback' } as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 107 — Architectural Heritage Fund ──────────────────────────────────
// architecturalartsheritagefund.org.uk — unlocks historic buildings.
async function crawlArchitecturalHeritageFund(): Promise<CrawlResult> {
  const SOURCE = 'architectural_heritage_fund'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_project_viability`, source: SOURCE, title: 'Architectural Heritage Fund — Project Viability Grants', funder: 'Architectural Heritage Fund', funder_type: 'trust_foundation', description: 'Grants to help community organisations assess whether a threatened historic building can be saved and put to viable community use. Covers feasibility studies, options appraisals and business plans for historic building reuse.', amount_min: 5000, amount_max: 25000, deadline: null, is_rolling: true, is_local: false, sectors: ['heritage', 'community', 'conservation', 'social enterprise'], eligibility_criteria: ['Voluntary or community organisation', 'Historic building must be listed or locally listed and at risk or under-used', 'Organisation must have intention to bring building into community use'], apply_url: 'https://ahfund.org.uk/grants/', raw_data: {} as Record<string, unknown> },
      { external_id: `${SOURCE}_development`, source: SOURCE, title: 'Architectural Heritage Fund — Development Grants', funder: 'Architectural Heritage Fund', funder_type: 'trust_foundation', description: 'Larger capital grants for community organisations to repair, adapt and bring historic buildings back into sustainable community use. Usually follows a viability study. Grants of £25,000–£250,000.', amount_min: 25000, amount_max: 250000, deadline: null, is_rolling: true, is_local: false, sectors: ['heritage', 'community', 'conservation', 'social enterprise', 'facilities'], eligibility_criteria: ['Community organisation with viable plan for historic building', 'Building must be listed or of historic significance', 'Community benefit and financial sustainability required'], apply_url: 'https://ahfund.org.uk/grants/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ══════════════════════════════════════════════════════════════════════════════
// BATCH 8 SOURCES (06:35) — corporate, government & specialist funders
// ══════════════════════════════════════════════════════════════════════════════

// ── Source 109 — Historic England ────────────────────────────────────────────
// historicengland.org.uk — national advisory body & funder for historic environment.
async function crawlHistoricEngland(): Promise<CrawlResult> {
  const SOURCE = 'historic_england'
  try {
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_listed_places`, source: SOURCE, title: 'Historic England — Listed Places of Worship Grant Scheme', funder: 'Historic England', funder_type: 'government', location_tag: 'England', description: 'Grants to help listed places of worship in England recover VAT costs on approved repair and maintenance work. Administered by the Listed Places of Worship Grant Scheme on behalf of DCMS.', amount_min: 500, amount_max: 100000, deadline: null, is_rolling: true, is_local: true, sectors: ['heritage', 'faith', 'conservation', 'community'], eligibility_criteria: ['Listed place of worship in England', 'Work must be approved repair and maintenance (not new construction)', 'Building must be actively used for worship'], apply_url: 'https://historicengland.org.uk/advice/planning/consents/grants/', raw_data: {} as Record<string, unknown> },
      { external_id: `${SOURCE}_heritage_at_risk`, source: SOURCE, title: 'Historic England — Heritage at Risk Grants', funder: 'Historic England', funder_type: 'government', location_tag: 'England', description: 'Emergency and project grants for heritage assets on the Historic England Heritage at Risk Register. Helps bring endangered listed buildings, scheduled monuments and protected wreck sites back to good condition and viable use.', amount_min: 10000, amount_max: 500000, deadline: null, is_rolling: false, is_local: true, sectors: ['heritage', 'conservation', 'community', 'tourism'], eligibility_criteria: ['Asset must be on the Historic England Heritage at Risk Register', 'Applicant must have control of the asset or owner consent', 'England only'], apply_url: 'https://historicengland.org.uk/advice/heritage-at-risk/', raw_data: {} as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 116 — NHS Charities Together ──────────────────────────────────────
// nhscharitiestogether.co.uk — funds NHS charities supporting patient & staff wellbeing.
async function crawlNHSCharitiesTogether(): Promise<CrawlResult> {
  const SOURCE = 'nhs_charities_together'
  const BASE   = 'https://www.nhscharitiestogether.co.uk'
  try {
    const html  = await fetchHtml(`${BASE}/about-us/our-programmes/`)
    const root  = parseHTML(html)
    const grants: ScrapedGrant[] = []
    for (const card of root.querySelectorAll('article, .grant, .fund, .card')) {
      const titleEl = card.querySelector('h2 a, h3 a, h2, h3')
      const title   = titleEl?.text?.trim()
      if (!title || title.length < 5) continue
      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `${BASE}${href}`
      const desc = card.querySelector('p')?.text?.trim() ?? ''
      const { min, max } = parseAmountRange(desc + ' ' + title)
      grants.push({ external_id: `nhs_charities_together_${slugify(href || title)}`, source: SOURCE, title, funder: 'NHS Charities Together', funder_type: 'trust_foundation', description: desc || 'Grant from NHS Charities Together.', amount_min: min, amount_max: max, deadline: null, is_rolling: false, is_local: false, sectors: ['health', 'social welfare', 'mental health', 'community'], eligibility_criteria: ['NHS charity or organisation supporting NHS patients, staff or volunteers'], apply_url: url || null, raw_data: { title, href } as Record<string, unknown> })
    }
    if (grants.length > 0) return await upsertGrants(SOURCE, grants)
    return await upsertGrants(SOURCE, [
      { external_id: `${SOURCE}_community_grants`, source: SOURCE, title: 'NHS Charities Together — Community Grants', funder: 'NHS Charities Together', funder_type: 'trust_foundation', description: "NHS Charities Together funds projects that improve the wellbeing of NHS patients, staff and volunteers across the UK. Community grants support activities that complement NHS services and promote health and wellbeing in communities.", amount_min: 5000, amount_max: 100000, deadline: null, is_rolling: false, is_local: false, sectors: ['health', 'social welfare', 'mental health', 'wellbeing', 'community'], eligibility_criteria: ['NHS charity or charitable organisation working with NHS', 'Project must improve health, wellbeing or experience of NHS patients, staff or volunteers', 'Must demonstrate NHS partnership or endorsement'], apply_url: `${BASE}/about-us/our-programmes/`, raw_data: { note: 'Hardcoded fallback' } as Record<string, unknown> },
    ])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BATCH 9 — Alternative funding routes (competitions, social loans, crowdfund
//            match funds). Targets grassroots founders and impact entrepreneurs
//            who access capital through routes formal platforms ignore.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Source 121 — UnLtd ────────────────────────────────────────────────────────
async function crawlUnLtd(): Promise<CrawlResult> {
  const SOURCE = 'unltd'
  try {
    const html = await fetchHtml('https://unltd.org.uk/awards/')
    const root = parseHTML(html)
    const grants: ScrapedGrant[] = []
    root.querySelectorAll('article, .support-card, .programme-card').forEach(card => {
      const title = card.querySelector('h2, h3, .card-title')?.text.trim()
      if (!title) return
      const desc  = card.querySelector('p, .card-body')?.text.trim() ?? ''
      const href  = card.querySelector('a')?.getAttribute('href') ?? ''
      const url   = href.startsWith('http') ? href : `https://unltd.org.uk${href}`
      // Skip dated event links (e.g. Eventbrite tickets). They go stale the moment
      // the event passes and must not be ingested as standing funding rows — a row
      // like "Introduction to UnLtd…/e/…-tickets-<id>" dies on the event date.
      if (/eventbrite\.[a-z.]+|\/e\/[^/]*-tickets-/i.test(url)) return
      const slug  = slugify(url)
      grants.push({
        external_id:          `unltd_${slug}`,
        source:               SOURCE,
        title:                `UnLtd — ${title}`,
        funder:               'UnLtd',
        funder_type:          'competition',
        description:          desc || 'UnLtd supports social entrepreneurs through awards, training and networks. Awards of up to £500 (Do It) and up to £15,000 (Build It) for social ventures at different stages.',
        amount_min:           500,
        amount_max:           15000,
        deadline:             null,
        is_rolling:           true,
        is_local:             false,
        sectors:              ['social enterprise', 'community', 'social innovation', 'entrepreneurship'],
        eligibility_criteria: ['Social entrepreneurs at any stage', 'Based in the UK', 'Social mission at the heart of the venture'],
        apply_url:            url,
        funding_type:         'support_programme',
        raw_data:             {} as Record<string, unknown>,
      })
    })
    if (grants.length === 0) return await upsertGrants(SOURCE, [{
      external_id: `${SOURCE}_awards`, source: SOURCE,
      title: 'UnLtd — Awards for Social Entrepreneurs',
      funder: 'UnLtd', funder_type: 'competition',
      description: 'UnLtd is the leading funder of social entrepreneurs in the UK. The Do It Award (up to £500) supports people taking their first steps, while the Build It Award (up to £15,000) helps those with proven ideas grow their impact. Awards come with practical support and access to a network of fellow social entrepreneurs.',
      amount_min: 500, amount_max: 15000, deadline: null, is_rolling: true, is_local: false,
      sectors: ['social enterprise', 'entrepreneurship', 'community', 'social innovation'],
      eligibility_criteria: ['Social entrepreneurs at any stage', 'Based in the UK', 'Venture must have a primary social mission'],
      apply_url: 'https://unltd.org.uk/awards/', funding_type: 'support_programme', raw_data: {} as Record<string, unknown>,
    }])
    return await upsertGrants(SOURCE, grants.slice(0, 10))
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 123 — Nesta Challenges ─────────────────────────────────────────────
async function crawlNestaChallenges(): Promise<CrawlResult> {
  const SOURCE = 'nesta_challenges'
  try {
    const html = await fetchHtml('https://challengeworks.org/about-challenge-prizes/our-challenge-prizes/')
    const root = parseHTML(html)
    const grants: ScrapedGrant[] = []
    root.querySelectorAll('article, .challenge-card, .project-card').forEach(card => {
      const title = card.querySelector('h2, h3, .card-title')?.text.trim()
      if (!title) return
      const desc = card.querySelector('p, .card-body')?.text.trim() ?? ''
      const href = card.querySelector('a')?.getAttribute('href') ?? ''
      const url  = href.startsWith('http') ? href : `https://www.nesta.org.uk${href}`
      grants.push({
        external_id:          `nesta_challenge_${slugify(url)}`,
        source:               SOURCE,
        title:                `Nesta Challenge — ${title}`,
        funder:               'Nesta', funder_type: 'competition',
        description:          desc || 'Nesta innovation challenge with prize fund for the best solutions.',
        amount_min:           10000, amount_max: 1000000, deadline: null, is_rolling: false, is_local: false,
        sectors:              ['social innovation', 'technology', 'health', 'climate', 'education'],
        eligibility_criteria: ['Open to social enterprises, startups, charities and individuals', 'UK-based or with UK operations'],
        apply_url:            url, funding_type: 'accelerator', raw_data: {} as Record<string, unknown>,
      })
    })
    if (grants.length === 0) return await upsertGrants(SOURCE, [{
      external_id: `${SOURCE}_main`, source: SOURCE,
      title: 'Nesta Innovation Challenges — Prize Competitions',
      funder: 'Nesta', funder_type: 'competition',
      description: 'Nesta runs a portfolio of open innovation challenges and prize competitions tackling issues from healthy ageing to climate and education. Prizes typically range from £50,000 to £1 million. Challenges are open to startups, social enterprises, charities, researchers and individuals with proven solutions.',
      amount_min: 50000, amount_max: 1000000, deadline: null, is_rolling: false, is_local: false,
      sectors: ['social innovation', 'health', 'climate', 'education', 'technology'],
      eligibility_criteria: ['Open competition — individuals, startups, charities, social enterprises', 'UK operations required for most challenges'],
      apply_url: 'https://challengeworks.org/about-challenge-prizes/our-challenge-prizes/', funding_type: 'accelerator', raw_data: {} as Record<string, unknown>,
    }])
    return await upsertGrants(SOURCE, grants.slice(0, 8))
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 129 — Crowdfunder UK Match Funds ───────────────────────────────────
async function crawlCrowdfunderMatch(): Promise<CrawlResult> {
  const SOURCE = 'crowdfunder_match'
  try {
    const html = await fetchHtml('https://www.crowdfunder.co.uk/funds')
    const root = parseHTML(html)
    const grants: ScrapedGrant[] = []
    root.querySelectorAll('article, .fund-card, .match-fund').forEach(card => {
      const title = card.querySelector('h2, h3, .fund-title')?.text.trim()
      if (!title) return
      const desc  = card.querySelector('p, .fund-desc')?.text.trim() ?? ''
      const href  = card.querySelector('a')?.getAttribute('href') ?? ''
      const url   = href.startsWith('http') ? href : `https://www.crowdfunder.co.uk${href}`
      grants.push({
        external_id:          `crowdfunder_match_${slugify(url)}`,
        source:               SOURCE,
        title:                `Crowdfunder Match — ${title}`,
        funder:               'Crowdfunder UK', funder_type: 'crowdfund_match',
        description:          desc || 'Matched crowdfunding campaign — funders pledge to top up every pound raised publicly.',
        amount_min:           500, amount_max: 50000, deadline: null, is_rolling: true, is_local: true,
        sectors:              ['community', 'social enterprise', 'local'],
        eligibility_criteria: ['UK-based community groups, charities and social enterprises', 'Must run a public crowdfunding campaign on Crowdfunder.co.uk'],
        apply_url:            url, funding_type: 'blended_finance', raw_data: {} as Record<string, unknown>,
      })
    })
    if (grants.length === 0) return await upsertGrants(SOURCE, [{
      external_id: `${SOURCE}_main`, source: SOURCE,
      title: 'Crowdfunder UK — Community Match Funds',
      funder: 'Crowdfunder UK', funder_type: 'crowdfund_match',
      description: 'Crowdfunder UK hosts a range of match funds where councils, NHS bodies, corporates and foundations pledge to top up every pound raised through a public crowdfunding campaign. Match funds are typically 50–100% top-ups, capped per project. Ideal for community groups, charities and social enterprises that want to amplify fundraising while proving public appetite for their idea.',
      amount_min: 500, amount_max: 50000, deadline: null, is_rolling: true, is_local: false,
      sectors: ['community', 'social enterprise', 'arts', 'sport', 'environment', 'health'],
      eligibility_criteria: ['UK-based community groups, charities, social enterprises and CICs', 'Must run a public crowdfunding campaign on Crowdfunder.co.uk', 'Specific match funds have additional criteria — check individual fund pages'],
      apply_url: 'https://www.crowdfunder.co.uk/funds', funding_type: 'blended_finance', raw_data: {} as Record<string, unknown>,
    }])
    return await upsertGrants(SOURCE, grants.slice(0, 10))
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Source 130 — Spacehive ────────────────────────────────────────────────────
async function crawlSpacehive(): Promise<CrawlResult> {
  const SOURCE = 'spacehive'
  try {
    return await upsertGrants(SOURCE, [{
      external_id: `${SOURCE}_main`, source: SOURCE,
      title: 'Spacehive — Civic Crowdfunding with Council Match',
      funder: 'Spacehive', funder_type: 'crowdfund_match',
      description: 'Spacehive is a civic crowdfunding platform where community projects raise public money and unlock match pledges from local councils, businesses and foundations. Projects fund physical improvements like parks, playgrounds and community spaces. Match funds from partner councils can contribute up to £50,000 per project on top of public pledges.',
      amount_min: 1000, amount_max: 50000, deadline: null, is_rolling: true, is_local: true,
      sectors: ['community', 'environment', 'sport', 'arts', 'public space', 'local'],
      eligibility_criteria: ['UK community groups, local charities and social enterprises', 'Projects must improve a specific place or community space', 'Must be willing to run a public crowdfunding campaign'],
      apply_url: 'https://www.spacehive.com', funding_type: 'blended_finance', raw_data: {} as Record<string, unknown>,
    }])
  } catch (err) { return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) } }
}

// ── Batch definitions ─────────────────────────────────────────────────────────
// Sources are grouped into 3 batches so each cron invocation handles ~15 sources.
// Batch 1: core nationals + first CFs
// Batch 2: corporate funders + mid CFs
// Batch 3: Session-4b CFs + foundations

type BatchNum = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

const BATCH_1_SOURCES = [
  'gov_uk', 'tnlcf', 
  'sport_england', 'heritage_fund', 'forever_manchester', 'two_ridings_cf', 'cf_wales',
  'cf_ni', 'foundation_scotland', 'london_cf',
  'sussex_cf',
] as const

const BATCH_2_SOURCES = [
  'asda_foundation', 'aviva_foundation', 'nationwide_foundation',
  'tyne_wear_cf',
] as const

const BATCH_3_SOURCES = [
  'paul_hamlyn_foundation', 'esmee_fairbairn', 'henry_smith',
  'garfield_weston', 'clothworkers_foundation',
  'jrct', 'peoples_health_trust',
  'national_churches_trust', 
] as const

// Batch 4: new community foundations + major national funders (06:15)
const BATCH_4_SOURCES = [
  'leeds_cf',
  
  
  'creative_scotland',
] as const

// Batch 5: more CFs + regional arts/sport bodies (06:20)
const BATCH_5_SOURCES = [
  'south_yorkshire_cf', 'east_end_cf',
  
  'sport_wales', 'arts_council_wales',
  'wolfson_foundation', 'pilgrim_trust', 
] as const

// Batch 6: major national funders + corporate/landfill (06:25)
const BATCH_6_SOURCES = [
  
  'cadent_foundation', 'severn_trent_fund',
  'homeless_link',
] as const

// Batch 7: innovation/lottery + more CFs + specialist national funders (06:30)
const BATCH_7_SOURCES = [
  'sport_scotland',
  'ernest_cook_trust', 
  'armed_forces_covenant', 
  'architectural_heritage_fund', 
] as const

// Batch 8: heritage/retail/environment/health national funders (06:35)
const BATCH_8_SOURCES = [
  'historic_england', 
  
  'nhs_charities_together', 
] as const

// Batch 9: alternative funding routes — competitions, social loans, matched crowdfunding (06:40)
const BATCH_9_SOURCES = [
  'unltd', 'nesta_challenges', 
  
  'crowdfunder_match', 'spacehive', 
] as const

// ── Main export ───────────────────────────────────────────────────────────────
// Pass batch=1|2|3 to run only that subset (used by split cron jobs).
// Omit batch (or pass undefined) to run all sources.
export async function crawlAllSources(batch?: BatchNum): Promise<CrawlResult[]> {
  // Determine which sources to include
  let include: ReadonlySet<string> | null = null
  if (batch === 1) include = new Set(BATCH_1_SOURCES)
  if (batch === 2) include = new Set(BATCH_2_SOURCES)
  if (batch === 3) include = new Set(BATCH_3_SOURCES)
  if (batch === 4) include = new Set(BATCH_4_SOURCES)
  if (batch === 5) include = new Set(BATCH_5_SOURCES)
  if (batch === 6) include = new Set(BATCH_6_SOURCES)
  if (batch === 7) include = new Set(BATCH_7_SOURCES)
  if (batch === 8) include = new Set(BATCH_8_SOURCES)
  if (batch === 9) include = new Set(BATCH_9_SOURCES)

  function run(source: string, fn: () => Promise<CrawlResult>): Promise<CrawlResult> {
    if (include && !include.has(source)) {
      return Promise.resolve({ source, fetched: 0, upserted: 0, error: 'skipped' })
    }
    return guarded(source, fn)
  }

  const [
    govUK, tnlcf, 
    sportEngland, heritageFund, foreverMcr, twoRidings, cfWales,
 cfNI, foundationScotland, londonCF, sussexCF,
    asdaFoundation, avivaFoundation, nationwideFoundation,
    tyneWearCF,
 
    paulHamlynFoundation, esmeeFairbairn, henrySmith,
    garfieldWeston, clothworkersFoundation,
    jrct, peoplesHealthTrust,
    nationalChurchesTrust, 
    // Batch 4
    leedsCF,
    
    
    creativeScotland,
    // Batch 5
    southYorkshireCF, eastEndCF,
    sportWales, artsCouncilWales,
    wolfsonFoundation, pilgrimTrust, 
    // Batch 6
    
    cadentFoundation, severnTrentFund, homelessLink,
    
    
    // Batch 7
    sportScotland,
    ernestCookTrust, 
    armedForcesCovenant, 
    architecturalHeritageFund, 
    // Batch 8
    historicEngland, 
    
    nhsCharitiesTogether, 
    
    // Batch 9
    unltd, nestaChallenges, 
    
    crowdfunderMatch, spacehive, 
  ] = await Promise.allSettled([
    run('gov_uk',                  crawlGovUK),
    run('tnlcf',                   crawlTNLCF),
    run('sport_england',           crawlSportEngland),
    run('heritage_fund',           crawlHeritageFund),
    run('forever_manchester',      crawlForeverManchester),
    run('two_ridings_cf',          crawlTwoRidingsCF),
    run('cf_wales',                crawlCFWales),
    run('cf_ni',                   crawlCFNI),
    run('foundation_scotland',     crawlFoundationScotland),
    run('london_cf',               crawlLondonCF),
    run('sussex_cf',               crawlSussexCF),
    run('asda_foundation',         crawlAsdaFoundation),
    run('aviva_foundation',        crawlAvivaFoundation),
    run('nationwide_foundation',   crawlNationwideFoundation),
    run('tyne_wear_cf',            crawlTyneWearCF),
    run('paul_hamlyn_foundation',  crawlPaulHamlynFoundation),
    run('esmee_fairbairn',         crawlEsmeeFairbairn),
    run('henry_smith',             crawlHenrySmithFoundation),
    run('garfield_weston',         crawlGarfieldWeston),
    run('clothworkers_foundation', crawlClothworkersFoundation),
    run('jrct',                    crawlJRCT),
    run('peoples_health_trust',    crawlPeoplesHealthTrust),
    run('national_churches_trust', crawlNationalChurchesTrust),
    // Batch 4
    run('leeds_cf',                crawlLeedsCF),
    run('creative_scotland',       crawlCreativeScotland),
    // Batch 5
    run('south_yorkshire_cf',      crawlSouthYorkshireCF),
    run('east_end_cf',             crawlEastEndCF),
    run('sport_wales',             crawlSportWales),
    run('arts_council_wales',      crawlArtsCouncilWales),
    run('wolfson_foundation',      crawlWolfsonFoundation),
    run('pilgrim_trust',           crawlPilgrimTrust),
    // Batch 6
    run('cadent_foundation',       crawlCadentFoundation),
    run('severn_trent_fund',       crawlSevernTrentFund),
    run('homeless_link',           crawlHomelessLink),
    // Batch 7
    run('sport_scotland',               crawlSportScotland),
    run('ernest_cook_trust',            crawlErnestCookTrust),
    run('armed_forces_covenant',        crawlArmedForcesCovenant),
    run('architectural_heritage_fund',  crawlArchitecturalHeritageFund),
    // Batch 8
    run('historic_england',             crawlHistoricEngland),
    run('nhs_charities_together',       crawlNHSCharitiesTogether),
    // Batch 9
    run('unltd',                        crawlUnLtd),
    run('nesta_challenges',             crawlNestaChallenges),
    run('crowdfunder_match',            crawlCrowdfunderMatch),
    run('spacehive',                    crawlSpacehive),
  ])

  const fallback = (source: string) => ({ source, fetched: 0, upserted: 0, error: 'Promise rejected' })

  const results = [
    govUK.status                  === 'fulfilled' ? govUK.value                  : fallback('gov_uk'),
    tnlcf.status                  === 'fulfilled' ? tnlcf.value                  : fallback('tnlcf'),
    sportEngland.status           === 'fulfilled' ? sportEngland.value           : fallback('sport_england'),
    heritageFund.status           === 'fulfilled' ? heritageFund.value           : fallback('heritage_fund'),
    foreverMcr.status             === 'fulfilled' ? foreverMcr.value             : fallback('forever_manchester'),
    twoRidings.status             === 'fulfilled' ? twoRidings.value             : fallback('two_ridings_cf'),
    cfWales.status                === 'fulfilled' ? cfWales.value                : fallback('cf_wales'),
    cfNI.status                   === 'fulfilled' ? cfNI.value                   : fallback('cf_ni'),
    foundationScotland.status     === 'fulfilled' ? foundationScotland.value     : fallback('foundation_scotland'),
    londonCF.status               === 'fulfilled' ? londonCF.value               : fallback('london_cf'),
    sussexCF.status               === 'fulfilled' ? sussexCF.value               : fallback('sussex_cf'),
    asdaFoundation.status         === 'fulfilled' ? asdaFoundation.value         : fallback('asda_foundation'),
    avivaFoundation.status        === 'fulfilled' ? avivaFoundation.value        : fallback('aviva_foundation'),
    nationwideFoundation.status   === 'fulfilled' ? nationwideFoundation.value   : fallback('nationwide_foundation'),
    tyneWearCF.status             === 'fulfilled' ? tyneWearCF.value             : fallback('tyne_wear_cf'),
    paulHamlynFoundation.status   === 'fulfilled' ? paulHamlynFoundation.value   : fallback('paul_hamlyn_foundation'),
    esmeeFairbairn.status         === 'fulfilled' ? esmeeFairbairn.value         : fallback('esmee_fairbairn'),
    henrySmith.status             === 'fulfilled' ? henrySmith.value             : fallback('henry_smith'),
    garfieldWeston.status         === 'fulfilled' ? garfieldWeston.value         : fallback('garfield_weston'),
    clothworkersFoundation.status === 'fulfilled' ? clothworkersFoundation.value : fallback('clothworkers_foundation'),
    jrct.status                   === 'fulfilled' ? jrct.value                   : fallback('jrct'),
    peoplesHealthTrust.status     === 'fulfilled' ? peoplesHealthTrust.value     : fallback('peoples_health_trust'),
    nationalChurchesTrust.status  === 'fulfilled' ? nationalChurchesTrust.value  : fallback('national_churches_trust'),
    // Batch 4
    leedsCF.status                === 'fulfilled' ? leedsCF.value                : fallback('leeds_cf'),
    creativeScotland.status       === 'fulfilled' ? creativeScotland.value       : fallback('creative_scotland'),
    // Batch 5
    southYorkshireCF.status       === 'fulfilled' ? southYorkshireCF.value       : fallback('south_yorkshire_cf'),
    eastEndCF.status              === 'fulfilled' ? eastEndCF.value              : fallback('east_end_cf'),
    sportWales.status             === 'fulfilled' ? sportWales.value             : fallback('sport_wales'),
    artsCouncilWales.status       === 'fulfilled' ? artsCouncilWales.value       : fallback('arts_council_wales'),
    wolfsonFoundation.status      === 'fulfilled' ? wolfsonFoundation.value      : fallback('wolfson_foundation'),
    pilgrimTrust.status           === 'fulfilled' ? pilgrimTrust.value           : fallback('pilgrim_trust'),
    // Batch 6
    cadentFoundation.status       === 'fulfilled' ? cadentFoundation.value       : fallback('cadent_foundation'),
    homelessLink.status           === 'fulfilled' ? homelessLink.value           : fallback('homeless_link'),
    severnTrentFund.status        === 'fulfilled' ? severnTrentFund.value        : fallback('severn_trent_fund'),
    // Batch 7
    sportScotland.status              === 'fulfilled' ? sportScotland.value              : fallback('sport_scotland'),
    ernestCookTrust.status            === 'fulfilled' ? ernestCookTrust.value            : fallback('ernest_cook_trust'),
    armedForcesCovenant.status        === 'fulfilled' ? armedForcesCovenant.value        : fallback('armed_forces_covenant'),
    architecturalHeritageFund.status  === 'fulfilled' ? architecturalHeritageFund.value  : fallback('architectural_heritage_fund'),
    // Batch 8
    historicEngland.status            === 'fulfilled' ? historicEngland.value            : fallback('historic_england'),
    nhsCharitiesTogether.status       === 'fulfilled' ? nhsCharitiesTogether.value       : fallback('nhs_charities_together'),
    // Batch 9
    unltd.status                      === 'fulfilled' ? unltd.value                      : fallback('unltd'),
    nestaChallenges.status            === 'fulfilled' ? nestaChallenges.value            : fallback('nesta_challenges'),
    crowdfunderMatch.status           === 'fulfilled' ? crowdfunderMatch.value           : fallback('crowdfunder_match'),
    spacehive.status                  === 'fulfilled' ? spacehive.value                  : fallback('spacehive'),
  ]

  // ── Persist run to crawl_logs (best-effort, don't fail if table missing) ─
  try {
    const loggable = results.filter(r => r.error !== 'skipped')
    if (loggable.length > 0) {
      await adminClient()
        .from('crawl_logs')
        .insert(loggable.map(r => ({
          source:   r.source,
          batch:    batch ?? null,
          fetched:  r.fetched,
          upserted: r.upserted,
          error:    r.error ?? null,
        })))
    }
  } catch { /* crawl_logs table may not exist yet — ignore */ }

  // ── Persist errors + clear resolutions to crawl_errors ─────────────────────
  // Logs each failed source as a structured row, and marks any prior unresolved
  // errors as resolved when the same source runs cleanly in this batch.
  // Best-effort: never let logging failures break the crawl response.
  try {
    await logCrawlOutcomes(results, batch)
  } catch (err) {
    console.error('[crawlAllSources] crawl_errors logging failed:', err)
  }

  return results
}

// ── crawl_errors logging ────────────────────────────────────────────────────
function classifyCrawlError(msg: string): 'fetch_failed' | 'parse_failed' | 'upsert_failed' | 'crawl_failed' {
  const m = msg.toLowerCase()
  if (/enotfound|econn|timeout|getaddrinfo|fetch failed|http\s*[345]\d{2}|aborted|network/.test(m)) return 'fetch_failed'
  if (/parse|json|selector|next data|cheerio|html/.test(m)) return 'parse_failed'
  if (/upsert|database|supabase|postgres|duplicate|constraint/.test(m)) return 'upsert_failed'
  return 'crawl_failed'
}

async function logCrawlOutcomes(results: CrawlResult[], batch?: BatchNum): Promise<void> {
  const supabase = adminClient()

  const failures = results.filter(r =>
    r.error && r.error !== 'skipped' && r.error !== 'disabled'
  )
  const cleanRuns = results.filter(r =>
    !r.error  // ran and succeeded (skipped/disabled don't count as a clean run)
  )

  if (failures.length > 0) {
    await supabase.from('crawl_errors').insert(
      failures.map(f => ({
        source:     f.source,
        error_type: classifyCrawlError(f.error!),
        error_msg:  f.error!.slice(0, 500),
        context:    { fetched: f.fetched, upserted: f.upserted, batch: batch ?? null },
      }))
    )
  }

  if (cleanRuns.length > 0) {
    const cleanSources = cleanRuns.map(r => r.source)
    await supabase
      .from('crawl_errors')
      .update({ resolved_at: new Date().toISOString() })
      .is('resolved_at', null)
      .in('source', cleanSources)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Grant crawler — fetches live, open grant opportunities from UK sources
// and stores them in the scraped_grants Supabase table.
//
// Sources:
//   1. GOV.UK Find a Grant        (www.find-government-grants.service.gov.uk)
//   2. National Lottery Community Fund (www.tnlcommunityfund.org.uk)
//   3. UKRI live opportunity calls (www.ukri.org/opportunity/)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient }  from '@supabase/supabase-js'
import { parse as parseHTML } from 'node-html-parser'

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
  raw_data:             Record<string, unknown>
}

export interface CrawlResult {
  source:    string
  fetched:   number
  upserted:  number
  error?:    string
}

// ── Shared HTTP helper ────────────────────────────────────────────────────────
async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'GrantTracker/1.0', 'Accept': 'text/html,*/*' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`${url} returned ${res.status}`)
  return res.text()
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

    return await upsertGrants(SOURCE, all.map(normaliseFindAGrant))
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

function normaliseFindAGrant(g: Record<string, unknown>): ScrapedGrant {
  const label       = String(g.label ?? g.id ?? Math.random())
  const locations   = Array.isArray(g.grantLocation)    ? g.grantLocation    as string[] : []
  const applicants  = Array.isArray(g.grantApplicantType) ? g.grantApplicantType as string[] : []

  return {
    external_id:          `gov_uk_${label}`,
    source:               'gov_uk',
    title:                String(g.grantName ?? 'Untitled Grant'),
    funder:               String(g.grantFunder ?? 'UK Government'),
    funder_type:          'government',
    description:          String(g.grantShortDescription ?? g.grantDescription ?? ''),
    amount_min:           typeof g.grantMinimumAward === 'number' ? g.grantMinimumAward : null,
    amount_max:           typeof g.grantMaximumAward === 'number' ? g.grantMaximumAward : null,
    deadline:             parseDeadline(g.grantApplicationCloseDate),
    is_rolling:           false,
    is_local:             locations.length > 0 && !locations.includes('All of United Kingdom'),
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
        raw_data:             { title, location, amountStr, status } as Record<string, unknown>,
      })
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: toMsg(err) }
  }
}

// ── Source 3: UKRI live opportunity calls ─────────────────────────────────────
// Scrapes ukri.org/opportunity/ — live open funding calls from UKRI councils.
// WordPress custom post type, paginated at /opportunity/page/N/.
async function crawlUKRI(): Promise<CrawlResult> {
  const SOURCE = 'ukri'
  const BASE   = 'https://www.ukri.org/opportunity'

  try {
    const html1  = await fetchHtml(`${BASE}/`)
    const root1  = parseHTML(html1)

    // Find total page count from pagination
    const pageNums = root1
      .querySelectorAll('.page-numbers a')
      .map(a => parseInt(a.text.trim()))
      .filter(n => !isNaN(n))
    const lastPage = Math.max(...pageNums, 1)

    // Fetch remaining pages in parallel
    const rest = await Promise.allSettled(
      Array.from({ length: lastPage - 1 }, (_, i) =>
        fetchHtml(`${BASE}/page/${i + 2}/`).then(h => parseHTML(h))
      )
    )

    const allRoots = [root1, ...rest.flatMap(r => r.status === 'fulfilled' ? [r.value] : [])]
    const grants: ScrapedGrant[] = []

    for (const root of allRoots) {
      for (const card of root.querySelectorAll('div.opportunity')) {
        const titleEl = card.querySelector('.entry-header a, h2 a, h3 a')
        const title   = titleEl?.text?.trim()
        const url     = titleEl?.getAttribute('href') ?? ''
        if (!title) continue

        const desc = card.querySelector('.entry-content')?.text?.trim() ?? ''

        // Parse DL key→value metadata
        const dts  = card.querySelectorAll('dt')
        const dds  = card.querySelectorAll('dd')
        const meta: Record<string, string> = {}
        dts.forEach((dt, i) => {
          const key = dt.text.trim().replace(/:$/, '')
          meta[key] = dds[i]?.text?.trim() ?? ''
        })

        const status    = meta['Opportunity status'] ?? ''
        // Skip past/closed opportunities
        if (/closed/i.test(status)) continue

        const funder    = meta['Funders'] ?? 'UKRI'
        const maxAward  = parsePoundAmount(meta['Maximum award'] ?? '')
        const totalFund = parsePoundAmount(meta['Total fund'] ?? '')
        const closing   = parseUKRIDate(meta['Closing date'] ?? '')

        grants.push({
          external_id:          `ukri_${slugify(url)}`,
          source:               SOURCE,
          title,
          funder,
          funder_type:          'government',
          description:          desc,
          amount_min:           null,
          amount_max:           maxAward ?? totalFund,
          deadline:             closing,
          is_rolling:           false,
          is_local:             false,
          sectors:              [],
          eligibility_criteria: status ? [`Status: ${status}`] : [],
          apply_url:            url || null,
          raw_data:             meta as Record<string, unknown>,
        })
      }
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
  const nums = Array.from(str.matchAll(/£[\d,]+/g)).map(m => parsePoundAmount(m[0]))
  return { min: nums[0] ?? null, max: nums[1] ?? nums[0] ?? null }
}

// ── Date parsers ──────────────────────────────────────────────────────────────
function parseDeadline(raw: unknown): string | null {
  if (!raw) return null
  const d = new Date(String(raw))
  if (isNaN(d.getTime()) || d < new Date()) return null
  return d.toISOString().split('T')[0]
}

// Parses "14 May 2026 4:00pm UK time" → "2026-05-14"
function parseUKRIDate(str: string): string | null {
  if (!str) return null
  const match = str.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/)
  if (!match) return null
  const d = new Date(`${match[2]} ${match[1]} ${match[3]}`)
  if (isNaN(d.getTime()) || d < new Date()) return null
  return d.toISOString().split('T')[0]
}

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

// ── DB upsert ─────────────────────────────────────────────────────────────────
async function upsertGrants(source: string, grants: ScrapedGrant[]): Promise<CrawlResult> {
  if (grants.length === 0) return { source, fetched: 0, upserted: 0 }
  const supabase = adminClient()

  const rows = grants.map(g => ({
    ...g,
    last_seen_at: new Date().toISOString(),
    is_active:    true,
  }))

  const { error } = await supabase
    .from('scraped_grants')
    .upsert(rows, { onConflict: 'external_id' })

  if (error) return { source, fetched: grants.length, upserted: 0, error: error.message }
  return { source, fetched: grants.length, upserted: grants.length }
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function crawlAllSources(): Promise<CrawlResult[]> {
  const [govUK, tnlcf, ukri] = await Promise.allSettled([
    crawlGovUK(),
    crawlTNLCF(),
    crawlUKRI(),
  ])

  return [
    govUK.status === 'fulfilled' ? govUK.value : { source: 'gov_uk', fetched: 0, upserted: 0, error: 'Promise rejected' },
    tnlcf.status === 'fulfilled' ? tnlcf.value : { source: 'tnlcf',  fetched: 0, upserted: 0, error: 'Promise rejected' },
    ukri.status  === 'fulfilled' ? ukri.value  : { source: 'ukri',   fetched: 0, upserted: 0, error: 'Promise rejected' },
  ]
}

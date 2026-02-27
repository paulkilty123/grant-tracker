// ─────────────────────────────────────────────────────────────────────────────
// Grant crawler — fetches live grants from public UK sources and stores them
// in the scraped_grants Supabase table.
//
// Sources:
//   1. GOV.UK Find a Grant  (https://www.find-government-grants.service.gov.uk)
//   2. 360Giving REST API   (https://api.threesixtygiving.org)
//   3. UKRI Gateway to Research (https://gtr.ukri.org)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'

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
  deadline:             string | null   // ISO date or null
  is_rolling:           boolean
  is_local:             boolean
  sectors:              string[]
  eligibility_criteria: string[]
  apply_url:            string | null
  raw_data:             Record<string, unknown>
}

export interface CrawlResult {
  source: string
  fetched: number
  upserted: number
  error?: string
}

// ── Source 1: GOV.UK Find a Grant ─────────────────────────────────────────────
// Scrapes all pages of find-government-grants.service.gov.uk using the
// embedded Next.js __NEXT_DATA__ JSON on each page.
async function crawlGovUK(): Promise<CrawlResult> {
  const SOURCE = 'gov_uk'
  const BASE   = 'https://www.find-government-grants.service.gov.uk/grants'

  try {
    // Page 1 — also tells us total count and grants-per-page
    const html1   = await fetchHtml(`${BASE}?page=1`)
    const data1   = extractNextData(html1)
    const pp1     = data1.props.pageProps as Record<string, unknown>
    const page1Grants = (pp1.searchResult as Record<string, unknown>[]) ?? []
    const total   = Number(pp1.totalGrants ?? 0)
    const perPage = page1Grants.length || 10
    const pages   = Math.ceil(total / perPage)

    // Remaining pages — fetched in parallel
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
    return { source: SOURCE, fetched: 0, upserted: 0, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'GrantTracker/1.0', 'Accept': 'text/html,*/*' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`${url} returned ${res.status}`)
  return res.text()
}

function extractNextData(html: string): { props: { pageProps: Record<string, unknown> } } {
  // Next.js embeds page data in <script id="__NEXT_DATA__" type="application/json">
  const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    ?? html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/)
  if (!match?.[1]) throw new Error('No Next.js page data found in HTML')
  return JSON.parse(match[1])
}

function normaliseFindAGrant(g: Record<string, unknown>): ScrapedGrant {
  const label = String(g.label ?? g.id ?? Math.random())
  const locations = Array.isArray(g.grantLocation) ? g.grantLocation as string[] : []
  const applicantTypes = Array.isArray(g.grantApplicantType) ? g.grantApplicantType as string[] : []

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
    eligibility_criteria: applicantTypes,
    apply_url:            `https://www.find-government-grants.service.gov.uk/grants/${label}`,
    raw_data:             g,
  }
}

// ── Source 2: 360Giving REST API ──────────────────────────────────────────────
// Fetches recent grants from a curated set of major UK grant-making bodies.
// Rate limit: 2 req/sec — we fetch all in parallel but add a small stagger.

const GIVING_FUNDERS = [
  { id: 'GB-GOR-PC390',  label: 'National Lottery Heritage Fund' },
  { id: 'GB-CHC-326568', label: 'Comic Relief'                   },
  { id: 'GB-CHC-268369', label: 'Charities Aid Foundation'       },
]

async function crawl360Giving(): Promise<CrawlResult> {
  const SOURCE   = '360giving'
  const API_BASE = 'https://api.threesixtygiving.org/api/v1'

  try {
    const grants: ScrapedGrant[] = []

    // Fetch up to 50 recent grants per funder — staggered 600ms to respect rate limit
    for (let i = 0; i < GIVING_FUNDERS.length; i++) {
      const { id, label } = GIVING_FUNDERS[i]
      try {
        if (i > 0) await sleep(600)
        const res = await fetch(
          `${API_BASE}/org/${id}/grants_made/?limit=50`,
          { headers: { 'Accept': 'application/json', 'User-Agent': 'GrantTracker/1.0' }, signal: AbortSignal.timeout(15_000) }
        )
        if (!res.ok) continue
        const json = await res.json()
        const results: Record<string, unknown>[] = json.results ?? []
        grants.push(...results.map(r => normalise360Giving(r, label)))
      } catch { continue }
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

function normalise360Giving(r: Record<string, unknown>, fallbackFunder: string): ScrapedGrant {
  const g = (r.data ?? r) as Record<string, unknown>
  const id     = String(g.id ?? r.grant_id ?? Math.random())
  const funderArr = g.fundingOrganization as Array<{name?: string}> | undefined
  const funder = String(funderArr?.[0]?.name ?? fallbackFunder)
  const progArr = g.grantProgramme as Array<{url?: string}> | undefined
  const url    = String(progArr?.[0]?.url ?? g.url ?? g.dataSource ?? '')
  const dates  = g.plannedDates as Array<{endDate?: string}> | undefined
  const amount = typeof g.amountAwarded === 'number' ? g.amountAwarded : null

  return {
    external_id:          `360giving_${id}`,
    source:               '360giving',
    title:                String(g.title ?? g['Activity:Title'] ?? 'Untitled Grant'),
    funder:               funder || null,
    funder_type:          'trust_foundation',
    description:          String(g.description ?? g['Activity:Description'] ?? ''),
    amount_min:           null,
    amount_max:           amount,
    deadline:             parseDeadline(dates?.[0]?.endDate ?? g.dateModified),
    is_rolling:           false,
    is_local:             false,
    sectors:              [],
    eligibility_criteria: [],
    apply_url:            url || null,
    raw_data:             g,
  }
}

// ── Source 3: UKRI Gateway to Research ───────────────────────────────────────
async function crawlUKRI(): Promise<CrawlResult> {
  const SOURCE = 'ukri'
  try {
    const res = await fetch(
      'https://gtr.ukri.org/gtr/api/projects?p=1&s=100',
      {
        headers: { 'User-Agent': 'GrantTracker/1.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(20_000),
      }
    )
    if (!res.ok) throw new Error(`UKRI API returned ${res.status}`)

    const contentType = res.headers.get('content-type') ?? ''
    let projects: Record<string, unknown>[] = []

    if (contentType.includes('json')) {
      const json = await res.json()
      projects = json.project ?? json.projectOverview?.project ?? json.projects ?? []
    } else {
      const xml = await res.text()
      const projectBlocks = xml.match(/<project[^>]*>[\s\S]*?<\/project>/g) ?? []
      projects = projectBlocks.slice(0, 100).map(block => {
        const get = (tag: string) => block.match(new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 's'))?.[1]?.trim() ?? ''
        return {
          id:           get('id') || get('grantReference'),
          title:        get('title'),
          abstractText: get('abstractText') || get('abstract'),
          status:       get('status'),
          leadFunder:   get('leadFunder') || 'UKRI',
          fund: { valuePounds: parseInt(get('valuePounds') || '0', 10) || null },
        }
      })
    }

    const grants = projects
      .filter(p => !p.status || String(p.status).toLowerCase().includes('active'))
      .map(p => normaliseUKRI(p))

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

function unwrapUKRIArray<T>(val: unknown, innerKey: string): T[] {
  if (Array.isArray(val)) return val as T[]
  if (val && typeof val === 'object') {
    const inner = (val as Record<string, unknown>)[innerKey]
    if (Array.isArray(inner)) return inner as T[]
    if (inner) return [inner as T]
  }
  return []
}

function normaliseUKRI(p: Record<string, unknown>): ScrapedGrant {
  const fund     = (p.fund as Record<string, unknown>) ?? {}
  const id       = String(p.id ?? p.grantReference ?? Math.random())
  const amount   = typeof fund.valuePounds === 'number' ? fund.valuePounds : null
  const leadOrgs = unwrapUKRIArray<{ name?: string }>(p.leadOrganisations, 'leadOrganisation')
  const leadOrg  = leadOrgs[0]?.name ?? null
  const funder   = String(p.leadFunder ?? 'UKRI')
  const topics   = unwrapUKRIArray<{ text?: string }>(p.researchTopics, 'researchTopic')
  const sectors  = topics.map(t => (t.text ?? '').toLowerCase().trim()).filter(Boolean)

  return {
    external_id:          `ukri_${id}`,
    source:               'ukri',
    title:                String(p.title ?? 'Untitled Project'),
    funder,
    funder_type:          'government',
    description:          String(p.abstractText ?? p.techAbstractText ?? p.description ?? ''),
    amount_min:           null,
    amount_max:           amount,
    deadline:             parseDeadline(fund.end),
    is_rolling:           false,
    is_local:             false,
    sectors,
    eligibility_criteria: leadOrg ? [`Lead organisation: ${leadOrg}`] : [],
    apply_url:            p.url ? String(p.url) : null,
    raw_data:             p,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function parseDeadline(raw: unknown): string | null {
  if (!raw) return null
  const d = new Date(String(raw))
  if (isNaN(d.getTime())) return null
  if (d < new Date()) return null // already past
  return d.toISOString().split('T')[0]
}

function normaliseSectors(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(s => String(s).toLowerCase().trim()).filter(Boolean)
  if (typeof raw === 'string') return raw.split(',').map(s => s.toLowerCase().trim()).filter(Boolean)
  return []
}

function normaliseList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(s => String(s).trim()).filter(Boolean)
  if (typeof raw === 'string') return raw.split('\n').map(s => s.trim()).filter(Boolean)
  return []
}

// Keep these exported in case other code uses them
export { normaliseSectors, normaliseList }

async function upsertGrants(source: string, grants: ScrapedGrant[]): Promise<CrawlResult> {
  if (grants.length === 0) return { source, fetched: 0, upserted: 0 }
  const supabase = adminClient()

  const rows = grants.map(g => ({ ...g, last_seen_at: new Date().toISOString(), is_active: true }))

  const { error } = await supabase
    .from('scraped_grants')
    .upsert(rows, { onConflict: 'external_id' })

  if (error) return { source, fetched: grants.length, upserted: 0, error: error.message }
  return { source, fetched: grants.length, upserted: grants.length }
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function crawlAllSources(): Promise<CrawlResult[]> {
  const [govUK, giving, ukri] = await Promise.allSettled([
    crawlGovUK(),
    crawl360Giving(),
    crawlUKRI(),
  ])

  return [
    govUK.status  === 'fulfilled' ? govUK.value  : { source: 'gov_uk',    fetched: 0, upserted: 0, error: 'Promise rejected' },
    giving.status === 'fulfilled' ? giving.value : { source: '360giving', fetched: 0, upserted: 0, error: 'Promise rejected' },
    ukri.status   === 'fulfilled' ? ukri.value   : { source: 'ukri',      fetched: 0, upserted: 0, error: 'Promise rejected' },
  ]
}

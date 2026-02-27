// ─────────────────────────────────────────────────────────────────────────────
// Grant crawler — fetches live grants from public UK sources and stores them
// in the scraped_grants Supabase table.
//
// Sources:
//   1. GOV.UK Find a Grant  (https://www.find-government-grants.service.gov.uk)
//   2. 360Giving data registry (https://data.threesixtygiving.org)
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

// ── GOV.UK Find a Grant ───────────────────────────────────────────────────────
// The service exposes grants via its search page; we fetch the JSON data feed.
async function crawlGovUK(): Promise<CrawlResult> {
  const SOURCE = 'gov_uk'
  try {
    // GOV.UK Find a Grant provides a public grants listing
    const res = await fetch(
      'https://www.find-government-grants.service.gov.uk/grants.json',
      { headers: { 'User-Agent': 'GrantTracker/1.0 (grant research tool)' }, signal: AbortSignal.timeout(15_000) }
    )

    if (!res.ok) {
      // Fallback: try the HTML API endpoint format
      const res2 = await fetch(
        'https://www.find-government-grants.service.gov.uk/api/v1/grants?limit=100',
        { headers: { 'User-Agent': 'GrantTracker/1.0' }, signal: AbortSignal.timeout(15_000) }
      )
      if (!res2.ok) throw new Error(`GOV.UK API returned ${res2.status}`)

      const json = await res2.json()
      const grants: ScrapedGrant[] = (json.grants ?? json.data ?? []).map((g: Record<string, unknown>) => normaliseGovUK(g))
      return await upsertGrants(SOURCE, grants)
    }

    const json = await res.json()
    const grants: ScrapedGrant[] = (json.grants ?? json.data ?? []).map((g: Record<string, unknown>) => normaliseGovUK(g))
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

function normaliseGovUK(g: Record<string, unknown>): ScrapedGrant {
  const id   = String(g.id ?? g.grantId ?? g.reference ?? Math.random())
  const name = String(g.name ?? g.title ?? g.grantName ?? 'Untitled Grant')
  const dept = String(g.department ?? g.funder ?? g.fundingOrganisation ?? '')
  const desc = String(g.description ?? g.summary ?? g.overview ?? '')
  const url  = String(g.link ?? g.url ?? g.applyUrl ?? g.applicationUrl ?? '')
  const maxAmt = typeof g.maximumValue === 'number' ? g.maximumValue
    : typeof g.maxAmount === 'number' ? g.maxAmount : null
  const minAmt = typeof g.minimumValue === 'number' ? g.minimumValue
    : typeof g.minAmount === 'number' ? g.minAmount : null

  return {
    external_id:          `gov_uk_${id}`,
    source:               'gov_uk',
    title:                name,
    funder:               dept || 'UK Government',
    funder_type:          'government',
    description:          desc,
    amount_min:           minAmt,
    amount_max:           maxAmt,
    deadline:             parseDeadline(g.closingDate ?? g.deadline ?? g.closesAt),
    is_rolling:           Boolean(g.openForApplications ?? g.rolling ?? false),
    is_local:             false,
    sectors:              normaliseSectors(g.sectors ?? g.categories ?? g.themes ?? []),
    eligibility_criteria: normaliseList(g.eligibility ?? g.whoCanApply ?? []),
    apply_url:            url || null,
    raw_data:             g,
  }
}

// ── 360Giving ─────────────────────────────────────────────────────────────────
// 360Giving publishes open data from hundreds of UK funders.
// We use their data registry API to find recently published grant datasets.
async function crawl360Giving(): Promise<CrawlResult> {
  const SOURCE = '360giving'
  try {
    // Fetch the registry of published datasets
    const registryRes = await fetch(
      'https://data.threesixtygiving.org/api/publishers.json',
      { headers: { 'User-Agent': 'GrantTracker/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) }
    )
    if (!registryRes.ok) throw new Error(`360Giving registry returned ${registryRes.status}`)

    const registry = await registryRes.json()
    const publishers: Array<{ datasets?: Array<{ distribution?: Array<{ downloadURL: string }> }> }> =
      Array.isArray(registry) ? registry : (registry.publishers ?? registry.data ?? [])

    // Pick up to 5 publishers' latest datasets (rate-limit friendly)
    const grants: ScrapedGrant[] = []
    let processed = 0

    for (const publisher of publishers.slice(0, 20)) {
      const datasets = publisher.datasets ?? []
      const latest = datasets[0]
      const dist = latest?.distribution?.[0]
      if (!dist?.downloadURL) continue

      const url = dist.downloadURL
      if (!url.endsWith('.json')) continue // skip Excel/CSV for now

      try {
        const dataRes = await fetch(url, { signal: AbortSignal.timeout(20_000) })
        if (!dataRes.ok) continue
        const data = await dataRes.json()
        const rawGrants: unknown[] = data.grants ?? data.data ?? []
        const parsed = rawGrants.slice(0, 50).map(g => normalise360Giving(g as Record<string, unknown>))
        grants.push(...parsed)
        processed++
        if (processed >= 10) break
      } catch { continue }
    }

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

function normalise360Giving(g: Record<string, unknown>): ScrapedGrant {
  const id       = String(g.id ?? g.identifier ?? Math.random())
  const title    = String(g.title ?? g['Activity:Title'] ?? 'Untitled')
  const funder   = String((g.fundingOrganization as Array<{name?: string}>)?.[0]?.name ?? g.funder ?? '')
  const desc     = String(g.description ?? g['Activity:Description'] ?? '')
  const amount   = typeof g.amountAwarded === 'number' ? g.amountAwarded : null
  const url      = String((g.grantProgramme as Array<{url?: string}>)?.[0]?.url ?? g.url ?? '')
  const deadline = String((g.plannedDates as Array<{endDate?: string}>)?.[0]?.endDate ?? g.dateModified ?? '')

  return {
    external_id:          `360giving_${id}`,
    source:               '360giving',
    title,
    funder:               funder || null,
    funder_type:          'trust_foundation',
    description:          desc,
    amount_min:           null,
    amount_max:           amount,
    deadline:             parseDeadline(deadline),
    is_rolling:           false,
    is_local:             false,
    sectors:              [],
    eligibility_criteria: [],
    apply_url:            url || null,
    raw_data:             g,
  }
}

// ── UKRI Gateway to Research ──────────────────────────────────────────────────
// UK Research and Innovation publishes all funded projects via a public REST API.
// Covers Innovate UK, EPSRC, ESRC, MRC, AHRC, BBSRC and more.
async function crawlUKRI(): Promise<CrawlResult> {
  const SOURCE = 'ukri'
  try {
    const res = await fetch(
      'https://gtr.ukri.org/api/projects?page=1&pageSize=100',
      {
        headers: {
          'User-Agent': 'GrantTracker/1.0',
          'Accept': 'application/vnd.rcuk.gtr.json-v7',
        },
        signal: AbortSignal.timeout(20_000),
      }
    )
    if (!res.ok) throw new Error(`UKRI API returned ${res.status}`)
    const json = await res.json()
    // Response shape: { project: [...] } or { projectOverview: { project: [...] } }
    const projects: Record<string, unknown>[] =
      json.project ?? json.projectOverview?.project ?? []

    const grants = projects
      .filter(p => !p.status || p.status === 'Active')
      .map(p => normaliseUKRI(p))

    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

function normaliseUKRI(p: Record<string, unknown>): ScrapedGrant {
  const fund   = (p.fund as Record<string, unknown>) ?? {}
  const id     = String(p.id ?? Math.random())
  const amount = typeof fund.valuePounds === 'number' ? fund.valuePounds : null
  const leadOrg = (p.leadOrganisations as Array<{ name?: string }>)?.[0]?.name ?? null
  const funder  = String(p.leadFunder ?? 'UKRI')

  // Collect research topics / subjects as sectors
  const topicsRaw = (p.researchTopics as Array<{ text?: string }> | undefined) ?? []
  const sectors   = topicsRaw.map(t => (t.text ?? '').toLowerCase().trim()).filter(Boolean)

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

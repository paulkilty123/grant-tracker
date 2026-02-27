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

// ── National Lottery Community Fund ──────────────────────────────────────────
// TNLCF is the UK's largest community funder. They publish open grant data via
// the 360Giving standard. We fetch their latest published dataset directly.
async function crawlGovUK(): Promise<CrawlResult> {
  const SOURCE = 'gov_uk'
  try {
    // TNLCF publishes open grants data in 360Giving JSON format
    // Dataset registry: https://data.threesixtygiving.org
    const res = await fetch(
      'https://beopen.tnlcf.org.uk/data/grantnav-tnlcf-grants.json',
      { headers: { 'User-Agent': 'GrantTracker/1.0' }, signal: AbortSignal.timeout(25_000) }
    )

    if (!res.ok) {
      // Fallback: try the TNLCF open data portal
      const res2 = await fetch(
        'https://beopen.tnlcf.org.uk/api/grants?limit=100',
        { headers: { 'User-Agent': 'GrantTracker/1.0', 'Accept': 'application/json' }, signal: AbortSignal.timeout(15_000) }
      )
      if (!res2.ok) return { source: SOURCE, fetched: 0, upserted: 0 }
      const json = await res2.json()
      const grants: ScrapedGrant[] = (json.grants ?? json.data ?? json.results ?? []).map((g: Record<string, unknown>) => normaliseGovUK(g))
      return await upsertGrants(SOURCE, grants)
    }

    const json = await res.json()
    const rawGrants: Record<string, unknown>[] = json.grants ?? json.data ?? (Array.isArray(json) ? json : [])
    const grants: ScrapedGrant[] = rawGrants.slice(0, 200).map(g => normaliseGovUK(g))
    return await upsertGrants(SOURCE, grants)
  } catch (err) {
    return { source: SOURCE, fetched: 0, upserted: 0, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

function normaliseGovUK(g: Record<string, unknown>): ScrapedGrant {
  // Handles both GOV.UK grant format and 360Giving standard format (used by TNLCF)
  const id   = String(g.id ?? g.identifier ?? g.grantId ?? g.reference ?? Math.random())
  const name = String(g.title ?? g['Activity:Title'] ?? g.name ?? g.grantName ?? 'Untitled Grant')
  const funderArr = g.fundingOrganization as Array<{name?: string}> | undefined
  const dept = String(funderArr?.[0]?.name ?? g.department ?? g.funder ?? g.fundingOrganisation ?? '')
  const desc = String(g.description ?? g['Activity:Description'] ?? g.summary ?? g.overview ?? '')
  const progArr = g.grantProgramme as Array<{url?: string}> | undefined
  const url  = String(progArr?.[0]?.url ?? g.link ?? g.url ?? g.applyUrl ?? g.applicationUrl ?? '')
  const amount = typeof g.amountAwarded === 'number' ? g.amountAwarded : null
  const maxAmt = amount ?? (typeof g.maximumValue === 'number' ? g.maximumValue : typeof g.maxAmount === 'number' ? g.maxAmount : null)
  const minAmt = typeof g.minimumValue === 'number' ? g.minimumValue : typeof g.minAmount === 'number' ? g.minAmount : null
  const datesArr = g.plannedDates as Array<{endDate?: string}> | undefined
  const deadline = g.closingDate ?? g.deadline ?? g.closesAt ?? datesArr?.[0]?.endDate ?? null

  return {
    external_id:          `gov_uk_${id}`,
    source:               'gov_uk',
    title:                name,
    funder:               dept || 'National Lottery Community Fund',
    funder_type:          'lottery',
    description:          desc,
    amount_min:           minAmt,
    amount_max:           maxAmt,
    deadline:             parseDeadline(deadline),
    is_rolling:           Boolean(g.openForApplications ?? g.rolling ?? false),
    is_local:             false,
    sectors:              normaliseSectors(g.sectors ?? g.categories ?? g.themes ?? []),
    eligibility_criteria: normaliseList(g.eligibility ?? g.whoCanApply ?? []),
    apply_url:            url || null,
    raw_data:             g,
  }
}

// ── 360Giving ─────────────────────────────────────────────────────────────────
// 360Giving publishes open data from hundreds of UK funders via their REST API.
// API docs: https://www.360giving.org/api-docs/
async function crawl360Giving(): Promise<CrawlResult> {
  const SOURCE = '360giving'
  try {
    // Use the 360Giving REST API directly — returns grants in standard format
    const res = await fetch(
      'https://api.threesixtygiving.org/api/v1/grants/?limit=200',
      {
        headers: { 'User-Agent': 'GrantTracker/1.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(25_000),
      }
    )
    if (!res.ok) throw new Error(`360Giving API returned ${res.status}`)

    const data = await res.json()
    const rawGrants: unknown[] = data.results ?? data.grants ?? (Array.isArray(data) ? data : [])
    const grants = rawGrants.map(g => normalise360Giving(g as Record<string, unknown>))

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
// GtR v2 API is XML-based; we request JSON via Accept header and fall back to XML parsing.
async function crawlUKRI(): Promise<CrawlResult> {
  const SOURCE = 'ukri'
  try {
    // Try JSON first (some versions support it), fall back to XML
    const res = await fetch(
      'https://gtr.ukri.org/gtr/api/projects?p=1&s=100',
      {
        headers: {
          'User-Agent': 'GrantTracker/1.0',
          'Accept': 'application/json',
        },
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
      // XML response — parse with regex (no XML lib needed for simple extraction)
      const xml = await res.text()
      // Extract <project> blocks and pull out key fields
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

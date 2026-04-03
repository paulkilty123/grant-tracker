// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/ingest-360giving
//
// Fetches open grants data from the 360Giving registry and uses it to:
//   1. Enrich funder_brief on existing grants with real award history
//   2. Create new catalogue entries for funders not yet covered
//
// 360Giving publishes awarded-grant datasets from 200+ UK funders.
// This is retrospective data (past awards), so we use it for:
//   - Funder intelligence (typical award size, timing, sectors funded)
//   - Discovering funders not yet in our catalogue
//   - Validating and enriching existing grant descriptions
//
// Auth: ADMIN_SECRET bearer token or authenticated admin session
//
// Body (JSON, all optional):
//   {
//     mode: 'enrich' | 'discover' | 'both'   // default 'both'
//     funder_ids?: string[]                    // limit to specific 360G publisher IDs
//     max_datasets?: number                    // cap datasets fetched (default 50)
//     dry_run?: boolean                        // if true, return plan without writing
//   }
//
// Returns:
//   {
//     datasets_fetched: number
//     grants_analysed: number
//     funders_enriched: number
//     new_entries_created: number
//     skipped: number
//     errors: string[]
//   }
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

// ── Auth ──────────────────────────────────────────────────────────────────────
async function isAuthorised(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.replace('Bearer ', '').trim()
  if (token && token === process.env.ADMIN_SECRET) return true
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.email === ADMIN_EMAIL
  } catch { return false }
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── 360Giving types ───────────────────────────────────────────────────────────
interface ThreeSixtyDataset {
  title: string
  identifier: string
  publisher: { name: string; website?: string }
  distribution: Array<{ downloadURL: string; mediaType: string }>
  modified?: string
}

interface ThreeSixtyGrant {
  id: string
  title?: string
  description?: string
  currency?: string
  amountAwarded?: number
  awardDate?: string
  plannedDates?: Array<{ startDate?: string; endDate?: string; duration?: string }>
  recipientOrganization?: Array<{ id?: string; name?: string; charityNumber?: string }>
  fundingOrganization?: Array<{ id?: string; name?: string }>
  grantProgramme?: Array<{ title?: string; code?: string }>
  beneficiaryLocation?: Array<{ name?: string; geoCode?: string; countryCode?: string }>
}

interface ProgrammeStats {
  name: string
  funder: string
  grantCount: number
  totalAwarded: number
  minAward: number
  maxAward: number
  avgAward: number
  medianAward: number
  years: number[]
  locations: string[]
  sectors: string[]
}

// ── High-value funders to prioritise (360Giving publisher IDs) ────────────────
// These are the UK funders most relevant to charities, CICs and social enterprises
const PRIORITY_PUBLISHERS = new Set([
  'GB-CHC-1084839',   // The National Lottery Community Fund (TNLCF)
  'GB-CHC-1163162',   // Arts Council England
  'GB-CHC-1123126',   // The National Lottery Heritage Fund
  'GB-CHC-1097370',   // Sport England
  'GB-CHC-802052',    // BBC Children in Need
  'GB-CHC-326568',    // Comic Relief
  'GB-CHC-1117323',   // Paul Hamlyn Foundation
  'GB-CHC-1099884',   // Esmée Fairbairn Foundation
  'GB-CHC-1105580',   // Tudor Trust
  'GB-CHC-1035726',   // Barrow Cadbury Trust
  'GB-CHC-210551',    // Joseph Rowntree Charitable Trust
  'GB-CHC-210436',    // Garfield Weston Foundation
  'GB-CHC-1087139',   // Wellcome Trust
  'GB-CHC-1108663',   // The Wolfson Foundation
  'GB-CHC-306077',    // Lloyds Bank Foundation
  'GB-CHC-1110113',   // Trust for London
  'GB-CHC-268369',    // Clothworkers Foundation
  'GB-CHC-1102927',   // Power to Change
  'GB-CHC-213020',    // Rank Foundation
  'GB-CHC-272100',    // Dulverton Trust
  'GB-CHC-1060849',   // Lankelly Chase Foundation
  'GB-CHC-299811',    // Tudor Trust (alt)
  'GB-CHC-1155255',   // Foyle Foundation
  'GB-CHC-1108048',   // Blagrave Trust
])

// ── Sector keyword → impact_sector mapping ────────────────────────────────────
const KEYWORD_SECTOR_MAP: Array<[RegExp, string]> = [
  [/youth|young people|children|schools|early years/i, 'young_people'],
  [/mental health|wellbeing|counsell|therapy|suicide/i, 'mental_health'],
  [/homelessness|homeless|rough sleep|housing|affordable home/i, 'housing'],
  [/environment|climate|biodiversity|nature|sustainability|conservation/i, 'environment'],
  [/arts|culture|creative|museum|theatre|dance|music|film/i, 'creative'],
  [/heritage|historic|preservation|conservation/i, 'heritage'],
  [/sport|physical activity|recreation|fitness/i, 'sport'],
  [/education|school|learning|skills|training|literacy/i, 'education'],
  [/employment|jobs|enterprise|employability|work/i, 'employment'],
  [/health|medical|hospital|care|disability/i, 'health'],
  [/disability|disabled|deaf|neurodiversity/i, 'disability'],
  [/older people|elderly|dementia|ageing/i, 'older_people'],
  [/women|gender|girls/i, 'women'],
  [/justice|legal|rights|asylum|refugee/i, 'justice'],
  [/technology|digital|tech|innovation/i, 'tech'],
  [/financial|debt|poverty|money/i, 'financial'],
  [/food|nutrition|hunger|food bank/i, 'food'],
  [/international|global|overseas|africa|develop/i, 'international'],
  [/community|neighbourhood|local|civic/i, 'community'],
]

function inferSectors(text: string): string[] {
  const sectors = new Set<string>()
  for (const [pattern, sector] of KEYWORD_SECTOR_MAP) {
    if (pattern.test(text)) sectors.add(sector)
  }
  return Array.from(sectors).slice(0, 4)
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// ── Fetch 360Giving registry (paginated) ──────────────────────────────────────
async function fetchRegistry(maxDatasets: number): Promise<ThreeSixtyDataset[]> {
  const datasets: ThreeSixtyDataset[] = []
  let url = 'https://registry.threesixtygiving.org/api/datasets/?format=json&limit=100'

  while (url && datasets.length < maxDatasets) {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'GrantTracker/1.0' },
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new Error(`Registry returned ${res.status}`)
    const body = await res.json() as { results: ThreeSixtyDataset[]; next?: string }
    datasets.push(...body.results)
    url = body.next ?? ''
  }
  return datasets.slice(0, maxDatasets)
}

// ── Download and parse a 360Giving dataset ────────────────────────────────────
async function fetchDatasetGrants(dataset: ThreeSixtyDataset): Promise<ThreeSixtyGrant[]> {
  // Prefer JSON format
  const jsonDist = dataset.distribution.find(d =>
    d.mediaType === 'application/json' || d.downloadURL.endsWith('.json')
  ) ?? dataset.distribution[0]

  if (!jsonDist) return []

  const res = await fetch(jsonDist.downloadURL, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'GrantTracker/1.0' },
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`Dataset ${dataset.identifier} returned ${res.status}`)

  const body = await res.json()
  // 360Giving JSON can be either { grants: [...] } or a flat array
  return Array.isArray(body) ? body : (body.grants ?? [])
}

// ── Aggregate grants into programme-level stats ────────────────────────────────
function aggregateProgrammes(grants: ThreeSixtyGrant[], publisherName: string): ProgrammeStats[] {
  const map = new Map<string, { amounts: number[]; years: Set<number>; locations: Set<string>; text: string }>()

  for (const g of grants) {
    const funder = g.fundingOrganization?.[0]?.name ?? publisherName
    const programme = g.grantProgramme?.[0]?.title ?? 'General Grants'
    const key = `${funder}__${programme}`

    if (!map.has(key)) {
      map.set(key, { amounts: [], years: new Set(), locations: new Set(), text: '' })
    }
    const entry = map.get(key)!

    if (typeof g.amountAwarded === 'number' && g.amountAwarded > 0) {
      entry.amounts.push(g.amountAwarded)
    }
    if (g.awardDate) {
      const year = new Date(g.awardDate).getFullYear()
      if (year > 2000) entry.years.add(year)
    }
    const loc = g.beneficiaryLocation?.[0]?.name
    if (loc) entry.locations.add(loc)

    // Accumulate text for sector inference
    entry.text += ` ${g.title ?? ''} ${g.description ?? ''} ${programme}`
  }

  const results: ProgrammeStats[] = []
  for (const [key, entry] of Array.from(map.entries())) {
    const [funder, name] = key.split('__')
    const amounts = entry.amounts
    if (amounts.length === 0) continue

    results.push({
      name,
      funder,
      grantCount: amounts.length,
      totalAwarded: amounts.reduce((a: number, b: number) => a + b, 0),
      minAward: Math.min(...amounts),
      maxAward: Math.max(...amounts),
      avgAward: Math.round(amounts.reduce((a: number, b: number) => a + b, 0) / amounts.length),
      medianAward: Math.round(median(amounts)),
      years: Array.from(entry.years).sort() as number[],
      locations: Array.from(entry.locations).slice(0, 5) as string[],
      sectors: inferSectors(entry.text),
    })
  }

  return results.sort((a, b) => b.grantCount - a.grantCount)
}

// ── Build funder_brief enrichment from programme stats ─────────────────────────
function buildFunderBrief(stats: ProgrammeStats): Record<string, unknown> {
  const yearRange = stats.years.length > 0
    ? `${Math.min(...stats.years)}–${Math.max(...stats.years)}`
    : 'recent years'
  const avgK = (stats.avgAward / 1000).toFixed(0)
  const medianK = (stats.medianAward / 1000).toFixed(0)
  const maxK = (stats.maxAward / 1000).toFixed(0)
  const minK = (stats.minAward / 1000).toFixed(0)

  return {
    source: '360giving',
    last_enriched: new Date().toISOString().split('T')[0],
    award_history: {
      grant_count: stats.grantCount,
      year_range: yearRange,
      typical_award: `£${medianK}k (median), £${avgK}k (average)`,
      award_range: `£${minK}k–£${maxK}k`,
      total_awarded: stats.totalAwarded,
      common_locations: stats.locations,
    },
    typical_award: `£${medianK}k–£${maxK}k (based on ${stats.grantCount} recent awards)`,
    decision_timeline: stats.years.length > 0
      ? `Active funder: ${stats.grantCount} grants awarded in ${yearRange}`
      : null,
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: {
    mode?: 'enrich' | 'discover' | 'both'
    funder_ids?: string[]
    max_datasets?: number
    dry_run?: boolean
  } = {}
  try { body = await req.json() } catch { /* no body */ }

  const mode = body.mode ?? 'both'
  const maxDatasets = Math.min(body.max_datasets ?? 50, 200)
  const dryRun = body.dry_run ?? false
  const priorityOnly = !body.funder_ids  // if no specific IDs, use priority list

  const supabase = adminClient()
  const errors: string[] = []
  let datasetsProcessed = 0
  let grantsAnalysed = 0
  let fundersEnriched = 0
  let newEntriesCreated = 0
  let skipped = 0

  try {
    // 1. Fetch registry
    const allDatasets = await fetchRegistry(maxDatasets)

    // 2. Filter to relevant publishers
    const datasets = allDatasets.filter(d => {
      if (body.funder_ids?.length) return body.funder_ids.includes(d.identifier)
      if (priorityOnly) return PRIORITY_PUBLISHERS.has(d.identifier)
      return true
    })

    // 3. Process each dataset
    for (const dataset of datasets) {
      try {
        const grants = await fetchDatasetGrants(dataset)
        if (grants.length === 0) { skipped++; continue }

        grantsAnalysed += grants.length
        datasetsProcessed++

        const programmes = aggregateProgrammes(grants, dataset.publisher.name)

        for (const prog of programmes) {
          if (prog.grantCount < 3) continue // Skip programmes with too few data points

          // ── Mode: enrich existing grants ──────────────────────────────────
          if (mode === 'enrich' || mode === 'both') {
            const { data: existingGrants } = await supabase
              .from('scraped_grants')
              .select('id, funder_brief')
              .ilike('funder', `%${prog.funder.split(' ')[0]}%`)
              .eq('is_active', true)
              .limit(10)

            if (existingGrants && existingGrants.length > 0) {
              const brief = buildFunderBrief(prog)
              for (const grant of existingGrants) {
                // Merge with existing brief (don't overwrite manually enriched fields)
                const existing = (grant.funder_brief as Record<string, unknown>) ?? {}
                const merged = {
                  ...brief,
                  ...existing,  // existing fields take precedence
                  award_history: (brief as Record<string, unknown>).award_history,  // always update history
                  last_enriched: brief.last_enriched,
                }

                if (!dryRun) {
                  await supabase
                    .from('scraped_grants')
                    .update({ funder_brief: merged })
                    .eq('id', grant.id)
                }
                fundersEnriched++
              }
            }
          }

          // ── Mode: discover new funders ─────────────────────────────────────
          if (mode === 'discover' || mode === 'both') {
            // Check if we already have a grant entry for this funder + programme
            const { count } = await supabase
              .from('scraped_grants')
              .select('id', { count: 'exact', head: true })
              .ilike('funder', `%${prog.funder.split(' ')[0]}%`)
              .ilike('title', `%${prog.name.substring(0, 20)}%`)

            if ((count ?? 0) === 0) {
              // Create a new placeholder entry
              const maxK = (prog.maxAward / 1000).toFixed(0)
              const minK = (prog.minAward / 1000).toFixed(0)
              const yearRange = prog.years.length > 0
                ? `${Math.min(...prog.years)}–${Math.max(...prog.years)}`
                : 'recent years'

              const newGrant = {
                external_id: `360giving-${dataset.identifier}-${prog.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 40)}`,
                source: '360giving',
                title: prog.name,
                funder: prog.funder,
                funder_type: 'foundation' as string,
                description: `${prog.funder} has awarded ${prog.grantCount} grants through "${prog.name}" in ${yearRange}, ranging from £${minK}k to £${maxK}k. This data is based on open 360Giving awards data. Visit the funder's website to check for currently open rounds.`,
                amount_min: prog.minAward,
                amount_max: prog.maxAward,
                is_rolling: false,
                is_local: false,
                sectors: prog.sectors,
                eligibility_criteria: [] as string[],
                apply_url: dataset.publisher.website ?? null,
                raw_data: { source_360giving: dataset.identifier, programme: prog.name } as Record<string, unknown>,
                is_active: false,  // Start inactive — admin reviews before activating
                url_status: 'ok',
                is_invite_only: false,
                funding_type: 'grant',
                eligible_structures: [] as string[],
                applicant_type: 'organisation',
                impact_sectors: prog.sectors.length > 0 ? prog.sectors : ['community'],
                location_tag: prog.locations[0] ?? 'UK',
                funder_brief: buildFunderBrief(prog),
              }

              if (!dryRun) {
                const { error } = await supabase
                  .from('scraped_grants')
                  .upsert(newGrant, { onConflict: 'external_id' })
                if (!error) newEntriesCreated++
              } else {
                newEntriesCreated++ // Count for dry run preview
              }
            } else {
              skipped++
            }
          }
        }
      } catch (err) {
        errors.push(`Dataset ${dataset.identifier} (${dataset.publisher.name}): ${err instanceof Error ? err.message : String(err)}`)
        skipped++
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Registry fetch failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }

  return NextResponse.json({
    dry_run: dryRun,
    mode,
    datasets_fetched: datasetsProcessed,
    grants_analysed: grantsAnalysed,
    funders_enriched: fundersEnriched,
    new_entries_created: newEntriesCreated,
    skipped,
    errors,
  })
}

// ── GET: return status / usage instructions ───────────────────────────────────
export async function GET(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = adminClient()
  const { count } = await supabase
    .from('scraped_grants')
    .select('id', { count: 'exact', head: true })
    .eq('source', '360giving')

  return NextResponse.json({
    status: 'ready',
    description: 'Ingests 360Giving open awards data to enrich funder intelligence and discover new funders.',
    existing_360giving_entries: count ?? 0,
    usage: {
      enrich: 'POST { mode: "enrich" } — updates funder_brief on existing grants with real award history',
      discover: 'POST { mode: "discover" } — creates new inactive entries for funders not yet in catalogue',
      both: 'POST { mode: "both" } — runs both (default)',
      dry_run: 'POST { dry_run: true } — returns plan without writing to DB',
      priority_funders: PRIORITY_PUBLISHERS.size,
      note: 'Requires outbound network access to registry.threesixtygiving.org — works on Vercel, not in local sandbox.',
    },
  })
}

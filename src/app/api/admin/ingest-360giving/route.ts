// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/ingest-360giving
//
// Reads the 360Giving daily status feed (store.data.threesixtygiving.org/reports/daily_status.json)
// which contains aggregate award stats (count, min/max/total amounts, years) for every
// publisher dataset — no per-file downloading required.
//
// Uses this to:
//   1. Enrich funder_brief on existing grants with real award history
//   2. Create new inactive catalogue entries for funders not yet covered
//
// Auth: ADMIN_SECRET bearer token or authenticated admin session
//
// Body (JSON, all optional):
//   {
//     mode: 'enrich' | 'discover' | 'both'   // default 'both'
//     dry_run?: boolean                        // if true, return plan without writing
//   }
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

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

// ── 360Giving daily_status.json types ────────────────────────────────────────
interface StatusEntry {
  identifier: string
  title: string
  description?: string
  issued?: string
  modified?: string
  publisher: {
    name: string
    prefix: string     // e.g. "360G-tnlcomfund" — this is our filter key
    org_id?: string
    website?: string
    logo?: string
  }
  distribution: Array<{
    downloadURL: string
    accessURL?: string
    title?: string
  }>
  datagetter_aggregates?: {
    count: number
    award_years?: Record<string, number>
    currencies?: {
      GBP?: {
        count: number
        min_amount: number
        max_amount: number
        total_amount: number
      }
    }
  }
  datagetter_metadata?: {
    valid: boolean
    file_type: string
    acceptable_license: boolean
  }
}

// Per-publisher rolled-up stats
interface PublisherStats {
  name: string
  prefix: string
  website?: string
  totalGrants: number
  totalAwarded: number
  minAward: number
  maxAward: number
  years: number[]
  datasetCount: number
}

// ── Priority publishers — 360G prefix format ──────────────────────────────────
// Derived from store.data.threesixtygiving.org/reports/daily_status.json
const PRIORITY_PREFIXES = new Set([
  '360G-tnlcomfund',       // The National Lottery Community Fund
  '360G-ACE',              // Arts Council England
  '360G-NLHF',             // The National Lottery Heritage Fund
  '360G-SE',               // Sport England
  '360g-cin',              // BBC Children in Need (lowercase in feed)
  '360G-CR',               // Comic Relief
  '360G-phf',              // Paul Hamlyn Foundation
  '360G-esmeefairbairn',   // Esmée Fairbairn Foundation
  '360G-tudortrust',       // The Tudor Trust
  '360G-barrowcadbury',    // Barrow Cadbury Trust
  '360G-JRCT',             // Joseph Rowntree Charitable Trust
  '360G-GWF',              // Garfield Weston Foundation
  '360G-wellcome',         // The Wellcome Trust
  '360G-wolfson',          // Wolfson Foundation
  '360G-LBFEW',            // Lloyds Bank Foundation for England and Wales
  '360G-trustforlondon',   // Trust for London
  '360G-clothworkersfdn',  // The Clothworkers Foundation
  '360G-ptc-gr',           // Power to Change Trust
  '360G-RankFdn',          // Rank Foundation
  '360G-dulverton',        // The Dulverton Trust
  '360G-LankellyChase',    // Lankelly Chase Foundation
  '360G-FoyleFdn',         // The Foyle Foundation
  '360G-blagrave',         // The Blagrave Trust
])

// ── Fetch and aggregate the daily status feed ─────────────────────────────────
async function fetchPublisherStats(): Promise<PublisherStats[]> {
  const STATUS_URL = 'https://store.data.threesixtygiving.org/reports/daily_status.json'

  const res = await fetch(STATUS_URL, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'GrantTracker/1.0' },
    signal: AbortSignal.timeout(45_000),
  })
  if (!res.ok) throw new Error(`Status feed returned HTTP ${res.status}`)

  const entries = await res.json() as StatusEntry[]

  // Roll up all datasets per publisher
  const map = new Map<string, PublisherStats>()

  for (const entry of entries) {
    const prefix = entry.publisher?.prefix?.toLowerCase()
    if (!prefix) continue
    // Only process priority publishers
    if (![...PRIORITY_PREFIXES].map(p => p.toLowerCase()).includes(prefix)) continue

    const agg = entry.datagetter_aggregates
    const gbp = agg?.currencies?.GBP
    if (!agg || !gbp || gbp.count === 0) continue
    if (entry.datagetter_metadata && !entry.datagetter_metadata.valid) continue

    if (!map.has(prefix)) {
      map.set(prefix, {
        name: entry.publisher.name,
        prefix: entry.publisher.prefix,
        website: entry.publisher.website,
        totalGrants: 0,
        totalAwarded: 0,
        minAward: Infinity,
        maxAward: 0,
        years: [],
        datasetCount: 0,
      })
    }

    const stats = map.get(prefix)!
    stats.totalGrants += gbp.count
    stats.totalAwarded += gbp.total_amount
    stats.minAward = Math.min(stats.minAward, gbp.min_amount)
    stats.maxAward = Math.max(stats.maxAward, gbp.max_amount)
    stats.datasetCount++

    if (agg.award_years) {
      for (const y of Object.keys(agg.award_years)) {
        const yr = parseInt(y)
        if (yr > 2000 && !stats.years.includes(yr)) stats.years.push(yr)
      }
    }
  }

  // Finalise
  const result: PublisherStats[] = []
  for (const [, stats] of Array.from(map.entries())) {
    if (stats.minAward === Infinity) stats.minAward = 0
    stats.years.sort((a, b) => a - b)
    result.push(stats)
  }
  return result.sort((a, b) => b.totalGrants - a.totalGrants)
}

// ── Build funder_brief from stats ─────────────────────────────────────────────
function buildFunderBrief(stats: PublisherStats): Record<string, unknown> {
  const avgAward = stats.totalGrants > 0 ? Math.round(stats.totalAwarded / stats.totalGrants) : 0
  const minK = (stats.minAward / 1000).toFixed(0)
  const maxK = (stats.maxAward / 1000).toFixed(0)
  const avgK = (avgAward / 1000).toFixed(0)
  const yearRange = stats.years.length > 0
    ? `${stats.years[0]}–${stats.years[stats.years.length - 1]}`
    : 'recent years'

  return {
    source: '360giving',
    last_enriched: new Date().toISOString().split('T')[0],
    award_history: {
      grant_count: stats.totalGrants,
      year_range: yearRange,
      typical_award: `£${avgK}k (average)`,
      award_range: `£${minK}k–£${maxK}k`,
      total_awarded: stats.totalAwarded,
      dataset_count: stats.datasetCount,
    },
    typical_award: `£${avgK}k average (£${minK}k–£${maxK}k range, based on ${stats.totalGrants.toLocaleString()} grants in ${yearRange})`,
    decision_timeline: `Active funder: ${stats.totalGrants.toLocaleString()} grants recorded in ${yearRange}`,
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: { mode?: 'enrich' | 'discover' | 'both'; dry_run?: boolean } = {}
  try { body = await req.json() } catch { /* no body */ }

  const mode = body.mode ?? 'both'
  const dryRun = body.dry_run ?? false

  const supabase = adminClient()
  const errors: string[] = []
  let grantsAnalysed = 0
  let fundersEnriched = 0
  let newEntriesCreated = 0
  let skipped = 0

  try {
    const publishers = await fetchPublisherStats()
    grantsAnalysed = publishers.reduce((sum, p) => sum + p.totalGrants, 0)

    for (const pub of publishers) {
      const brief = buildFunderBrief(pub)
      const firstWord = pub.name.split(' ')[0]

      // ── Enrich existing grants ─────────────────────────────────────────────
      if (mode === 'enrich' || mode === 'both') {
        try {
          const { data: existing } = await supabase
            .from('scraped_grants')
            .select('id, funder_brief')
            .ilike('funder', `%${firstWord}%`)
            .eq('is_active', true)
            .limit(20)

          if (existing && existing.length > 0) {
            for (const grant of existing) {
              const merged = {
                ...brief,
                ...(grant.funder_brief as Record<string, unknown> ?? {}),
                award_history: brief.award_history,
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
        } catch (err) {
          errors.push(`Enrich ${pub.name}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      // ── Discover new funders ───────────────────────────────────────────────
      if (mode === 'discover' || mode === 'both') {
        try {
          const { count } = await supabase
            .from('scraped_grants')
            .select('id', { count: 'exact', head: true })
            .ilike('funder', `%${firstWord}%`)

          if ((count ?? 0) === 0) {
            const avgAward = pub.totalGrants > 0 ? Math.round(pub.totalAwarded / pub.totalGrants) : 0
            const minK = (pub.minAward / 1000).toFixed(0)
            const maxK = (pub.maxAward / 1000).toFixed(0)
            const yearRange = pub.years.length > 0
              ? `${pub.years[0]}–${pub.years[pub.years.length - 1]}`
              : 'recent years'

            const newGrant = {
              external_id: `360giving-${pub.prefix.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
              source: '360giving',
              title: `${pub.name} — Grants Programme`,
              funder: pub.name,
              funder_type: 'foundation' as string,
              description: `${pub.name} has awarded ${pub.totalGrants.toLocaleString()} grants in ${yearRange}, ranging from £${minK}k to £${maxK}k (average £${(avgAward / 1000).toFixed(0)}k). This data is sourced from 360Giving open awards data. Visit the funder's website to check for currently open rounds.`,
              amount_min: pub.minAward,
              amount_max: pub.maxAward,
              is_rolling: false,
              is_local: false,
              sectors: [] as string[],
              eligibility_criteria: [] as string[],
              apply_url: pub.website ?? null,
              is_active: false,
              url_status: 'ok',
              is_invite_only: false,
              funding_type: 'grant',
              eligible_structures: [] as string[],
              applicant_type: 'organisation',
              impact_sectors: ['community'] as string[],
              location_tag: 'UK',
              funder_brief: brief,
            }

            if (!dryRun) {
              const { error } = await supabase
                .from('scraped_grants')
                .upsert(newGrant, { onConflict: 'external_id' })
              if (!error) newEntriesCreated++
              else errors.push(`Insert ${pub.name}: ${error.message}`)
            } else {
              newEntriesCreated++
            }
          } else {
            skipped++
          }
        } catch (err) {
          errors.push(`Discover ${pub.name}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Feed fetch failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }

  return NextResponse.json({
    dry_run: dryRun,
    mode,
    datasets_fetched: PRIORITY_PREFIXES.size,
    grants_analysed: grantsAnalysed,
    funders_enriched: fundersEnriched,
    new_entries_created: newEntriesCreated,
    skipped,
    errors,
  })
}

// ── GET: status ───────────────────────────────────────────────────────────────
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
    description: 'Reads 360Giving daily status feed to enrich funder intelligence and discover new funders. No per-file downloading required.',
    existing_360giving_entries: count ?? 0,
    priority_publishers: PRIORITY_PREFIXES.size,
    feed_url: 'https://store.data.threesixtygiving.org/reports/daily_status.json',
  })
}

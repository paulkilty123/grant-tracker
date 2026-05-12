// search_funding_and_support — query construction, scoring, 0-result diagnostic.
// Spec §4.1, §5.3. Spec §4.4 region/sector/structure expansions live in
// opportunity-adapter.ts; this module composes them into a search flow.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  toMCPOpportunitySummary,
  expandStructureTokens,
  mapLocationTagToRegions,
  REGION_DB_PATTERNS,
  BENEFICIARY_REVERSE_MAP,
  FUNDING_TYPE_DB_EXPANSIONS,
  type ScrapedGrantRow,
  type AdapterContext,
  type MCPOpportunity,
  type MCPOpportunitySummary,
  type MCPMatchQuality,
  type MCPSignal,
  type MCPFundingType,
  type MCPRegion,
} from './opportunity-adapter'

// Per the explicit F4 + step-6 guidance: single fixed boost, applied once
// if any keyword from the query matches title OR funder name. Does NOT
// accumulate per-matching-keyword. State here in code so the constant is
// reviewable and easy to tune via data later.
export const KEYWORD_BOOST_POINTS = 7

// ──────────────────────────────────────────────────────────────────────────
// Input shape — mirrors the tool's parameter schema in spec §4.1
// ──────────────────────────────────────────────────────────────────────────

export interface MCPSearchParams {
  query?: string
  funding_type?: MCPFundingType[]
  region?: MCPRegion[]
  sector?: string[]
  structure?: string[]
  amount_min?: number
  amount_max?: number
  deadline_within_days?: number
  include_rolling?: boolean
  beneficiary_group?: string[]
  funder_type?: string[]
  exclude_unverified_urls?: boolean
  limit?: number
  offset?: number
}

export interface MCPSearchResults {
  results: MCPOpportunity[]
  total_matching: number
  returned: number
  result_quality: 'high' | 'mixed' | 'low'
}

export interface MCPZeroResultDiagnostic {
  likely_cause: 'data_gap' | 'filter_combination_too_narrow' | 'empty_catalogue_for_type'
  explanation: string
  adjacent_suggestions: Array<MCPOpportunitySummary & { loosened_filter: string }>
}

// ──────────────────────────────────────────────────────────────────────────
// Service client (RLS bypass — MCP runs without a user session)
// ──────────────────────────────────────────────────────────────────────────

function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// ──────────────────────────────────────────────────────────────────────────
// SQL query construction
// ──────────────────────────────────────────────────────────────────────────

const TODAY = (): string => new Date().toISOString().slice(0, 10)

// Build the filtered query (no .limit() / .range() applied yet — caller does).
// Returns the query builder + the total_matching count via .count='exact'.
function buildBaseQuery(sb: SupabaseClient, params: MCPSearchParams) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = sb.from('scraped_grants')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .neq('url_status', 'dead')

  // Default: exclude unchecked URLs (spec §4.1 tier-2 default true)
  if (params.exclude_unverified_urls !== false) {
    q = q.eq('url_status', 'ok')
  }

  // Funding type — expand programme→[programme,accelerator] etc.
  if (params.funding_type?.length) {
    const dbTypes = Array.from(new Set(
      params.funding_type.flatMap(t => FUNDING_TYPE_DB_EXPANSIONS[t] ?? [t])
    ))
    q = q.in('funding_type', dbTypes)
  }

  // Sector — array overlap against impact_sectors
  if (params.sector?.length) {
    q = q.overlaps('impact_sectors', params.sector)
  }

  // Structure — expand cic→[cic_guarantee,cic_shares] etc.; array overlap
  // against eligible_structures. Empty eligible_structures means "no
  // structure restriction" → still passes the filter.
  if (params.structure?.length) {
    const dbStructures = expandStructureTokens(params.structure)
    // Match rows where either eligible_structures is empty/null, or contains
    // one of the requested structures. PostgREST: combine via .or
    const orClauses = [
      'eligible_structures.is.null',
      'eligible_structures.eq.{}',
      `eligible_structures.ov.{${dbStructures.join(',')}}`,
    ].join(',')
    q = q.or(orClauses)
  }

  // Beneficiary — expand via reverse map; check against BOTH columns
  if (params.beneficiary_group?.length) {
    const dbBens = Array.from(new Set(
      params.beneficiary_group.flatMap(b => BENEFICIARY_REVERSE_MAP[b] ?? [b])
    ))
    const orClauses = [
      `target_beneficiaries.ov.{${dbBens.join(',')}}`,
      `beneficiary_tags.ov.{${dbBens.join(',')}}`,
    ].join(',')
    q = q.or(orClauses)
  }

  // Region — location_tag substring match across all listed regions' patterns.
  // UK-wide rows (location_tag = 'UK') always surface for any region query
  // unless the user explicitly listed only specific sub-regions and didn't
  // include uk_wide. Spec: UK-wide should surface for region-specific queries
  // (matches dashboard behaviour). We include uk_wide patterns automatically.
  if (params.region?.length) {
    const regions = params.region.includes('uk_wide')
      ? params.region
      : [...params.region, 'uk_wide']
    const patterns = Array.from(new Set(
      regions.flatMap(r => REGION_DB_PATTERNS[r as MCPRegion] ?? [])
    ))
    const orClauses = patterns
      .map((p: string) => `location_tag.ilike.%${p.replace(/[%_]/g, (m: string) => '\\' + m)}%`)
      .concat(['location_tag.is.null'])
      .join(',')
    q = q.or(orClauses)
  }

  // Amount overlap: result range [row.amount_min, row.amount_max] overlaps
  // user range [params.amount_min, params.amount_max] if
  //   row.amount_max >= params.amount_min  AND  row.amount_min <= params.amount_max
  // Rows with null amounts are inclusive (no amount info → don't exclude).
  if (params.amount_min !== undefined) {
    q = q.or(`amount_max.gte.${params.amount_min},amount_max.is.null`)
  }
  if (params.amount_max !== undefined) {
    q = q.or(`amount_min.lte.${params.amount_max},amount_min.is.null`)
  }

  // Deadline window
  if (params.deadline_within_days !== undefined) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + params.deadline_within_days)
    const cutoffISO = cutoff.toISOString().slice(0, 10)
    if (params.include_rolling === false) {
      q = q.gte('deadline', TODAY()).lte('deadline', cutoffISO)
    } else {
      // Rolling counted as "always within window"
      q = q.or(`is_rolling.eq.true,and(deadline.gte.${TODAY()},deadline.lte.${cutoffISO})`)
    }
  } else if (params.include_rolling === false) {
    q = q.gte('deadline', TODAY())
  } else {
    // Default: future-or-rolling-or-null
    q = q.or(`is_rolling.eq.true,deadline.is.null,deadline.gte.${TODAY()}`)
  }

  // Funder type — exact match against the scraper-emitted column
  if (params.funder_type?.length) {
    q = q.in('funder_type', params.funder_type)
  }

  // Free-text query — keyword match across title, funder, description.
  // Escape % and _ to avoid wildcard injection.
  if (params.query && params.query.trim().length > 0) {
    const kw = params.query.trim().toLowerCase().replace(/[%_]/g, m => '\\' + m)
    q = q.or(`title.ilike.%${kw}%,funder.ilike.%${kw}%,description.ilike.%${kw}%`)
  }

  return q
}

// ──────────────────────────────────────────────────────────────────────────
// Match-quality scoring
// ──────────────────────────────────────────────────────────────────────────

// Per F4 + step-6 guidance:
//   - Six signals, equal weight
//   - Signal "applicable" = query specified that dimension as a filter
//   - score = (matched_signals / applicable_signals) × 90 + keyword_boost
//   - keyword_boost = 7 if any keyword from query matches title OR funder,
//     applied once, non-accumulating
//   - When applicable = 0 (thin query), score = keyword_boost only
//   - Capped at 100
//
// This produces:
//   - Strong queries with all filters matched: ~97 (3 of 3 signals + boost)
//   - Strong queries with partial match: ~67
//   - Thin queries (0 filters): 0 or 7 (boost only)
// which is what makes result_quality discriminate sensibly.
export function computeMatchQuality(row: ScrapedGrantRow, params: MCPSearchParams): MCPMatchQuality {
  const signals: MCPSignal[] = []
  let applicable = 0

  if (params.sector?.length) {
    applicable++
    if ((row.impact_sectors ?? []).some(s => params.sector!.includes(s))) {
      signals.push('sector_match')
    }
  }

  if (params.region?.length) {
    applicable++
    // Null location_tag is treated as uk_wide for scoring — consistent with
    // search behaviour (null-location rows surface for any region query)
    // and with the catalogue convention (a row with no specific region tag
    // is implicitly UK-applicable). Without this, results legitimately
    // surfaced from null-location queries score zero on geographic_match
    // and result_quality looks worse than it should.
    const rowRegions = row.location_tag ? mapLocationTagToRegions(row.location_tag) : ['uk_wide']
    const rowIsUkWide = rowRegions.includes('uk_wide' as MCPRegion)
    if (rowIsUkWide || params.region.some(r => rowRegions.includes(r))) {
      signals.push('geographic_match')
    }
  }

  if (params.amount_min !== undefined || params.amount_max !== undefined) {
    applicable++
    const rowMin = row.amount_min ?? 0
    const rowMax = row.amount_max ?? Number.MAX_SAFE_INTEGER
    const reqMin = params.amount_min ?? 0
    const reqMax = params.amount_max ?? Number.MAX_SAFE_INTEGER
    if (rowMax >= reqMin && rowMin <= reqMax) {
      signals.push('amount_in_range')
    }
  }

  if (params.structure?.length) {
    applicable++
    const dbStructures = expandStructureTokens(params.structure)
    const es = row.eligible_structures ?? []
    // Empty eligible_structures = no restriction; treat as matching
    if (es.length === 0 || es.some(s => dbStructures.includes(s))) {
      signals.push('structure_eligible')
    }
  }

  if (params.funder_type?.length) {
    applicable++
    if (row.funder_type && params.funder_type.includes(row.funder_type)) {
      signals.push('funder_alignment')
    }
  }

  if (params.beneficiary_group?.length) {
    applicable++
    const dbBens = Array.from(new Set(
      params.beneficiary_group.flatMap(b => BENEFICIARY_REVERSE_MAP[b] ?? [b])
    ))
    const rowBens = [...(row.target_beneficiaries ?? []), ...(row.beneficiary_tags ?? [])]
    if (rowBens.some(b => dbBens.includes(b))) {
      signals.push('beneficiary_match')
    }
  }

  // Keyword boost — single fixed bonus if any query keyword appears in title/funder
  let keyword_boost = 0
  if (params.query && params.query.trim().length > 0) {
    const kw = params.query.trim().toLowerCase()
    if (
      (row.title?.toLowerCase().includes(kw)) ||
      (row.funder?.toLowerCase().includes(kw))
    ) {
      keyword_boost = KEYWORD_BOOST_POINTS
    }
  }

  let score: number
  if (applicable > 0) {
    score = Math.round((signals.length / applicable) * 90) + keyword_boost
  } else {
    score = keyword_boost
  }
  score = Math.min(100, score)

  return { score, signals }
}

// ──────────────────────────────────────────────────────────────────────────
// Result-quality wrapper signal (spec §4.1)
// ──────────────────────────────────────────────────────────────────────────

// Per F5 starting numbers (working hypothesis — refine post-launch with usage).
//   "high":  ≥75% of results score ≥ 80
//   "mixed": ≥40% of results score ≥ 60
//   "low":   otherwise
// For thin queries every score will be 0 or 7 → "low", matching the spec's
// intent of telling the agent "Grant Tracker is returning broad matches
// because no precise matches exist."
export function computeResultQuality(results: MCPOpportunity[]): 'high' | 'mixed' | 'low' {
  if (results.length === 0) return 'low'
  const highCount = results.filter(r => r.match_quality.score >= 80).length
  const midCount  = results.filter(r => r.match_quality.score >= 60).length
  if (highCount / results.length >= 0.75) return 'high'
  if (midCount  / results.length >= 0.40) return 'mixed'
  return 'low'
}

// ──────────────────────────────────────────────────────────────────────────
// Main search
// ──────────────────────────────────────────────────────────────────────────

export async function executeMCPSearch(
  params: MCPSearchParams,
  ctx: AdapterContext,
): Promise<MCPSearchResults> {
  const sb = serviceClient()
  let q = buildBaseQuery(sb, params)
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 50)
  const offset = Math.max(params.offset ?? 0, 0)
  q = q.range(offset, offset + limit - 1)

  const { data, count, error } = await q
  if (error) throw new Error(`search query failed: ${error.message}`)

  const rows = (data ?? []) as ScrapedGrantRow[]
  const results: MCPOpportunity[] = rows.map(row => ({
    ...toMCPOpportunitySummary(row, ctx),
    match_quality: computeMatchQuality(row, params),
  }))

  return {
    results,
    total_matching: count ?? 0,
    returned: results.length,
    result_quality: computeResultQuality(results),
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 0-result diagnostic (spec §4.1) — F6 uniform path
// ──────────────────────────────────────────────────────────────────────────

// Priority for filter relaxation: F6 specified amount → region → sector →
// funding_type; extended here to cover all six dimensions (beneficiary,
// funder_type, structure interpolated between F6's sector and funding_type
// slots) so queries with those filters can also surface adjacents. Try each
// in turn; first relaxation that yields ≥3 results becomes the
// adjacent_suggestions set. If no single-filter relaxation produces ≥3
// results, return data_gap with empty suggestions and an honest explanation.
//
// Per F6: uniform across all funding types in v1. Refinement (relax sector
// before region for in-kind/programme) deferred to post-launch.

type Relaxation = { filter: keyof MCPSearchParams; label: string }
const RELAX_ORDER: Relaxation[] = [
  { filter: 'amount_min',         label: 'amount' },
  { filter: 'amount_max',         label: 'amount' },
  { filter: 'region',             label: 'region' },
  { filter: 'sector',             label: 'sector' },
  { filter: 'beneficiary_group',  label: 'beneficiary_group' },
  { filter: 'funder_type',        label: 'funder_type' },
  { filter: 'structure',          label: 'structure' },
  { filter: 'funding_type',       label: 'funding_type' },
]

export async function computeZeroResultDiagnostic(
  params: MCPSearchParams,
  ctx: AdapterContext,
): Promise<MCPZeroResultDiagnostic> {
  // Filter the relax order to only filters that are actually specified
  const specified = RELAX_ORDER.filter(r => {
    const v = params[r.filter]
    return v !== undefined && v !== null && (Array.isArray(v) ? v.length > 0 : true)
  })

  // De-dupe by label so amount_min + amount_max relax together as "amount"
  const seen = new Set<string>()
  const tries: Relaxation[] = []
  for (const r of specified) {
    if (!seen.has(r.label)) {
      seen.add(r.label)
      tries.push(r)
    }
  }

  for (const relax of tries) {
    const relaxedParams: MCPSearchParams = { ...params }
    // Clear the relaxed filter(s) — for 'amount' we clear both min and max
    if (relax.label === 'amount') {
      delete relaxedParams.amount_min
      delete relaxedParams.amount_max
    } else {
      delete relaxedParams[relax.filter]
    }
    // Suppress further pagination noise; take top 5
    relaxedParams.limit = 5
    relaxedParams.offset = 0
    const relaxedResults = await executeMCPSearch(relaxedParams, ctx)
    if (relaxedResults.results.length >= 3) {
      // strip match_quality from adjacents (they're scored against the relaxed
      // query, not the original; surfacing them would mislead agents)
      const suggestions = relaxedResults.results.map(r => {
        const { match_quality: _mq, ...rest } = r
        return { ...rest, loosened_filter: relax.label }
      })
      return {
        likely_cause: 'filter_combination_too_narrow',
        explanation: `No opportunities matched all filters. Relaxing ${relax.label} surfaces ${relaxedResults.results.length} candidates.`,
        adjacent_suggestions: suggestions,
      }
    }
  }

  // No single-filter relaxation worked. Honest data_gap. Build a useful
  // explanation noting which dimensions the user filtered on.
  const filterDims = tries.map(t => t.label).join(' × ') || '(no filters specified)'
  return {
    likely_cause: 'data_gap',
    explanation: `No opportunities in the current catalogue match this combination (${filterDims}), and no single-filter relaxation surfaces useful alternatives. The catalogue may genuinely lack coverage for this query.`,
    adjacent_suggestions: [],
  }
}

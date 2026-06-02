// search_funding_and_support — query construction, scoring, 0-result diagnostic.
// Spec §4.1, §5.3. Spec §4.4 region/sector/structure expansions live in
// opportunity-adapter.ts; this module composes them into a search flow.
//
// Search flow (v2 — score-driven ranking, 2026-06-02):
//   1. buildBaseQuery applies all hard filters (WHERE clauses)
//   2. executeMCPSearch fetches all passing rows up to FETCH_CAP
//   3. computeMatchQuality scores every fetched row
//   4. Rows are sorted by score DESC (deterministic id tiebreaker)
//   5. offset + limit slice is applied in JS over the sorted set
//
// History: v1 applied .range() (LIMIT/OFFSET) at the DB layer with NO ORDER BY,
// then scored the heap-order sample post-fetch. computeMatchQuality was
// decorative — score never determined what surfaced. Diagnosed 2026-06-02 when
// the live "Brighton arts festival" capture missed ACE Project Grants (heap
// position 62, default limit 20). Third filter-vs-rank silent exclusion bug
// in two days; see feedback_filter_vs_rank_silent_exclusion memory.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  toMCPOpportunitySummary,
  expandStructureTokens,
  mapLocationTagToRegions,
  REGION_DB_PATTERNS,
  REGION_LABEL_PATTERNS,
  PARENT_REGION_OF_SUB,
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

// LEGACY — superseded by the graduated keyword token model (see KEYWORD_*
// constants below and computeMatchQuality). Retained as exported for
// backward compatibility with any caller that imports it.
export const KEYWORD_BOOST_POINTS = 7

// Keyword token scoring (v3 — graduated, replaces the legacy +7 binary boost).
// Each matched token contributes KEYWORD_TOKEN_BOOST to a per-row fractional
// boost, capped at KEYWORD_BOOST_MAX. Tokens are filtered by length and a
// short stopword list so noise words don't dominate ranking. Haystack is
// title + funder + funder_brief.what_they_fund (depth lifts rows whose brief
// is rich without penalising rows whose brief is sparse).
const KEYWORD_TOKEN_BOOST = 0.05
const KEYWORD_BOOST_MAX   = 0.20
const KEYWORD_MIN_LENGTH  = 3
const STOPWORDS = new Set([
  'the','and','for','with','from','our','your','that','this','have','will',
  'what','where','who','when','about','please','help','find','need','want',
  'looking','seeking',
])

// Maximum rows to fetch into JS for scoring + ranking. Sized to cover the
// entire active+ok catalogue (599 rows as of 2026-06-02 audit). Bump when
// the catalogue approaches this number — currently CLAUDE.md targets 1,500.
// While total <= FETCH_CAP, the score-then-slice path guarantees that the
// returned top-N is the genuine top-N by score across every passing row.
// Above this cap, rows beyond FETCH_CAP by Postgres heap order are silently
// invisible — same class as the bug v2 fixes but at the cap boundary. Worth
// monitoring; current safety margin is comfortable.
export const FETCH_CAP = 600

// Column projection used by buildBaseQuery. Replaces `select('*')` to drop
// admin-only large jsonb columns (field_provenance, raw_data, grant_sources,
// deadline_cycle, pipeline_v1 fields) that the MCP scoring/summary paths
// don't read. Trims per-row payload roughly in half.
const SEARCH_SELECT_COLS =
  'id, external_id, source, title, funder, funder_type, funding_type, ' +
  'description, amount_min, amount_max, deadline, is_rolling, is_active, ' +
  'url_status, apply_url, last_seen_at, location_tag, eligible_structures, ' +
  'impact_sectors, target_beneficiaries, beneficiary_tags, ' +
  'eligibility_criteria, funder_brief, next_open_date, next_open_date_parsed'

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
    .select(SEARCH_SELECT_COLS, { count: 'exact' })
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
    // Default: future-or-rolling-or-null, or between-rounds with a known
    // future next open date. The between-rounds branch (v1.1 adapter) surfaces
    // annual-cycle funds in their closed periods so users see "Next opens X"
    // instead of either silent exclusion or false "open now" framing.
    q = q.or(`is_rolling.eq.true,deadline.is.null,deadline.gte.${TODAY()},next_open_date_parsed.gte.${TODAY()}`)
  }

  // Funder type — exact match against the scraper-emitted column
  if (params.funder_type?.length) {
    q = q.in('funder_type', params.funder_type)
  }

  // Free-text query is intentionally NOT a filter. It applies as a scoring
  // boost in computeMatchQuality only (see KEYWORD_BOOST_POINTS). Applying
  // it as a hard ILIKE filter silently excluded rows whose marketing copy
  // didn't contain the exact keyword Claude inferred from the user's
  // question — e.g. ACE Project Grants ("open access programme for arts,
  // libraries and museums projects") excluded from a "Brighton arts festival"
  // query because its description doesn't say "festival" or "participatory".
  // Same architectural class as the region inheritance bug fixed in
  // commit 26e5cca6 — a soft signal must not be implemented as a hard
  // exclusion. Tool description updated correspondingly so Claude passes
  // intent-words as ranking hints, not filter values.

  return q
}

// ──────────────────────────────────────────────────────────────────────────
// Match-quality scoring
// ──────────────────────────────────────────────────────────────────────────

// Scoring formula v3 (graduated — 2026-06-02 redesign):
//
// Each applicable signal contributes a fractional value 0.0–1.0 (not binary).
//   S1 sector_match     — coverage × specificity blend on impact_sectors overlap
//   S2 geographic_match — 1.0 exact-label / 0.9 within-region / 0.8 parent-country / 0.5 uk_wide
//   S3 amount_in_range  — 1.0 fits / 0.8 contains user range / 0.6 partial / 0.5 null info / 0.0 no overlap
//   S4 structure_eligible — 1.0 explicit / 0.7 unrestricted (empty array) / 0.0 excluded
//   S5 funder_alignment — binary 1.0 / 0.0 (closed taxonomy, no gradation needed)
//   S6 beneficiary_match — same blend as S1 on combined target_beneficiaries + beneficiary_tags
//
// Aggregate: signal_avg = sum(applicable Sn) / applicable_count
// Score: round(signal_avg × 90 + K × 100), capped at 100, where K is the
// per-token keyword boost (0.0–0.2).
//
// Thin queries (applicable = 0): score = round(K × 100), 0–20 range.
//
// Replaces the v2 formula (matched/applicable × 90 + binary boost) which
// produced flat 90s across 30–90 rows for two-filter queries because every
// passing row received the same binary signal count. See the
// filter_vs_rank_silent_exclusion memory's third instance for diagnosis.

// ── Per-signal helpers (graduated) ──────────────────────────────────────────

// Coverage × specificity blend used by S1 (sectors) and S6 (beneficiaries).
// Rewards rows where the user's request covers most/all of the row's tags
// (specificity) AND most/all of the user's tags are in the row (coverage).
function tagOverlapScore(userTags: string[], rowTags: string[]): number {
  if (userTags.length === 0 || rowTags.length === 0) return 0
  const userSet = new Set(userTags)
  const intersection = rowTags.filter(t => userSet.has(t)).length
  if (intersection === 0) return 0
  const coverage    = intersection / userTags.length
  const specificity = intersection / rowTags.length
  return 0.5 * coverage + 0.5 * specificity
}

// Geographic tier score for a single (rowTag, userRegion) pair. Aggregated
// across multiple user regions by taking the maximum.
function geoSignalValue(rowTag: string | null, userRegion: MCPRegion): number {
  if (!rowTag) return 0.5  // null treated as uk_wide
  const rowTagLower = rowTag.toLowerCase()
  // 1.0 — row tag is the user region's canonical label (e.g. 'south east')
  const labelPatterns = REGION_LABEL_PATTERNS[userRegion] ?? []
  if (labelPatterns.some(p => rowTagLower.includes(p))) return 1.0
  // 0.9 — row tag classifies into the user's region but isn't the label
  // (e.g. 'Sussex' / 'Brighton' for a south_east query)
  const rowRegions = mapLocationTagToRegions(rowTag)
  if (rowRegions.includes(userRegion)) return 0.9
  // 0.8 — parent-country inheritance (e.g. 'England' for a south_east query)
  const parent = PARENT_REGION_OF_SUB[userRegion]
  if (parent && rowRegions.includes(parent)) return 0.8
  // 0.5 — uk_wide / nationwide / great britain
  if (rowRegions.includes('uk_wide' as MCPRegion)) return 0.5
  return 0.0
}

// Amount fit. Returns 1.0 when the row range nests inside the user range
// (perfect fit), 0.8 when the row range envelops the user range (covers it
// and more), 0.6 for partial overlap, 0.5 when both row bounds are null
// (no info), 0.0 otherwise.
function amountFitScore(
  rowMinRaw: number | null, rowMaxRaw: number | null,
  reqMinRaw: number | undefined, reqMaxRaw: number | undefined,
): number {
  if (rowMinRaw === null && rowMaxRaw === null) return 0.5
  const rowMin = rowMinRaw ?? 0
  const rowMax = rowMaxRaw ?? Number.MAX_SAFE_INTEGER
  const reqMin = reqMinRaw ?? 0
  const reqMax = reqMaxRaw ?? Number.MAX_SAFE_INTEGER
  const overlaps = rowMax >= reqMin && rowMin <= reqMax
  if (!overlaps) return 0.0
  const rowNested = rowMin >= reqMin && rowMax <= reqMax
  if (rowNested) return 1.0
  const rowEnvelops = rowMin <= reqMin && rowMax >= reqMax
  if (rowEnvelops) return 0.8
  return 0.6
}

// Keyword token boost. Tokenises the query on whitespace, filters stopwords
// and very-short tokens, counts hits against (title + funder + brief.what_they_fund).
// Cap at KEYWORD_BOOST_MAX so a single noise word can't dominate.
function keywordTokenBoost(query: string | undefined, row: ScrapedGrantRow): number {
  if (!query || query.trim().length === 0) return 0
  const tokens = query.trim().toLowerCase()
    .split(/\s+/)
    .filter(t => t.length >= KEYWORD_MIN_LENGTH && !STOPWORDS.has(t))
  if (tokens.length === 0) return 0
  const whatTheyFund = typeof row.funder_brief?.what_they_fund === 'string'
    ? row.funder_brief.what_they_fund
    : ''
  const haystack = [row.title ?? '', row.funder ?? '', whatTheyFund]
    .join(' ').toLowerCase()
  const matched = tokens.filter(t => haystack.includes(t)).length
  return Math.min(KEYWORD_BOOST_MAX, matched * KEYWORD_TOKEN_BOOST)
}

// ── Match quality (graduated) ──────────────────────────────────────────────

export function computeMatchQuality(row: ScrapedGrantRow, params: MCPSearchParams): MCPMatchQuality {
  const signals: MCPSignal[] = []
  let applicable = 0
  let signalSum  = 0

  if (params.sector?.length) {
    applicable++
    const s = tagOverlapScore(params.sector, row.impact_sectors ?? [])
    signalSum += s
    if (s > 0) signals.push('sector_match')
  }

  if (params.region?.length) {
    applicable++
    // Score across all user-requested regions; take the strongest tier.
    const s = Math.max(...params.region.map(r => geoSignalValue(row.location_tag, r as MCPRegion)))
    signalSum += s
    if (s > 0) signals.push('geographic_match')
  }

  if (params.amount_min !== undefined || params.amount_max !== undefined) {
    applicable++
    const s = amountFitScore(row.amount_min ?? null, row.amount_max ?? null, params.amount_min, params.amount_max)
    signalSum += s
    if (s > 0) signals.push('amount_in_range')
  }

  if (params.structure?.length) {
    applicable++
    const dbStructures = expandStructureTokens(params.structure)
    const es = row.eligible_structures ?? []
    let s: number
    if (es.some(x => dbStructures.includes(x))) {
      s = 1.0   // explicit match
    } else if (es.length === 0) {
      s = 0.7   // no restriction (catch-all)
    } else {
      s = 0.0   // excluded — filter would have removed
    }
    signalSum += s
    if (s > 0) signals.push('structure_eligible')
  }

  if (params.funder_type?.length) {
    applicable++
    const s = row.funder_type && params.funder_type.includes(row.funder_type) ? 1.0 : 0.0
    signalSum += s
    if (s > 0) signals.push('funder_alignment')
  }

  if (params.beneficiary_group?.length) {
    applicable++
    const dbBens = Array.from(new Set(
      params.beneficiary_group.flatMap(b => BENEFICIARY_REVERSE_MAP[b] ?? [b])
    ))
    const rowBens = [...(row.target_beneficiaries ?? []), ...(row.beneficiary_tags ?? [])]
    const s = tagOverlapScore(dbBens, rowBens)
    signalSum += s
    if (s > 0) signals.push('beneficiary_match')
  }

  const k = keywordTokenBoost(params.query, row)
  const score = applicable === 0
    ? Math.min(100, Math.round(k * 100))
    : Math.min(100, Math.round((signalSum / applicable) * 90 + k * 100))

  return { score, signals }
}

// ──────────────────────────────────────────────────────────────────────────
// Result-quality wrapper signal (spec §4.1)
// ──────────────────────────────────────────────────────────────────────────

// Re-calibrated 2026-06-02 alongside the graduated scoring rewrite. Under v2
// flat-90 scoring, every result scored 90 for two-filter queries → always "high"
// → wrapper was decorative. Under v3 graduated scoring, scores spread genuinely,
// so the thresholds shift down:
//   "high":  ≥ 50% of returned score ≥ 75   (most results are strong fits)
//   "mixed": ≥ 50% of returned score ≥ 50   (typical default for sound queries)
//   "low":   otherwise                       (broad/thin matches)
// Thin queries (no structured filters) score 0–20 → consistently "low",
// matching the spec's intent.
export function computeResultQuality(results: MCPOpportunity[]): 'high' | 'mixed' | 'low' {
  if (results.length === 0) return 'low'
  const highCount = results.filter(r => r.match_quality.score >= 75).length
  const midCount  = results.filter(r => r.match_quality.score >= 50).length
  if (highCount / results.length >= 0.5) return 'high'
  if (midCount  / results.length >= 0.5) return 'mixed'
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
  // Build the base WHERE-clause query, then fetch ALL passing rows up to
  // FETCH_CAP. No .range() at the DB layer — ordering is computed in JS
  // post-scoring so that the returned top-N is the genuine top-N by score
  // rather than the heap-order top-N. See v2 history note at module top.
  const q = buildBaseQuery(sb, params).limit(FETCH_CAP)

  const { data, count, error } = await q
  if (error) throw new Error(`search query failed: ${error.message}`)

  const rows = (data ?? []) as ScrapedGrantRow[]
  // Score every fetched row, build the summary alongside (cheap — both share
  // the same row data and adapter context). The MCPOpportunity shape pairs
  // them together for downstream sort + slice.
  const scored: MCPOpportunity[] = rows.map(row => ({
    ...toMCPOpportunitySummary(row, ctx),
    match_quality: computeMatchQuality(row, params),
  }))

  // Sort by score descending. Deterministic tiebreaker on opportunity_id so
  // identical-score rows return in the same order across runs (matters for
  // pagination consistency and for debugging).
  scored.sort((a, b) => {
    if (b.match_quality.score !== a.match_quality.score) {
      return b.match_quality.score - a.match_quality.score
    }
    return a.opportunity_id.localeCompare(b.opportunity_id)
  })

  // Apply pagination over the sorted set.
  const limit  = Math.min(Math.max(params.limit ?? 20, 1), 50)
  const offset = Math.max(params.offset ?? 0, 0)
  const results = scored.slice(offset, offset + limit)

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

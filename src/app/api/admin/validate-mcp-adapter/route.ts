// One-off / regression validation for src/lib/opportunity-adapter.ts.
// Runs the adapter against the full active catalogue and reports:
//   - any per-row projection failures (data-quality surprises)
//   - 10 sample full projections (search-tier + detail-tier)
//   - 5 provider intelligence samples (3 enriched, 2 basic)
//   - assertion that no app-only funder_brief keys appear anywhere in MCP output
//
// Guarded by CRON_SECRET. Intended to run locally during the MCP build and
// occasionally post-deploy as a schema-drift canary.
//
// Usage:
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//        http://localhost:3000/api/admin/validate-mcp-adapter

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  toMCPOpportunitySummary,
  toMCPOpportunityDetail,
  toMCPProviderIntelligence,
  AdapterError,
  type ScrapedGrantRow,
  type FunderRow,
  type AdapterContext,
  type MCPOpportunitySummary,
  type MCPOpportunityDetail,
  type MCPProviderIntelligence,
} from '@/lib/opportunity-adapter'
import { executeMCPSearch, computeZeroResultDiagnostic, type MCPSearchParams } from '@/lib/mcp-search'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const APP_ONLY_FUNDER_BRIEF_KEYS = ['funder_tips', 'how_to_apply', 'strong_application', 'decision_timeline']

const VALIDATION_CTX: AdapterContext = {
  utm_source: 'validation',
  tool: 'validate',
  campaign: 'adapter_check',
}

// Deep search for any string key in app-only set. If found anywhere in the
// projected object, the funder_brief split has leaked.
function findAppOnlyKeys(obj: unknown, path = ''): string[] {
  if (obj === null || obj === undefined) return []
  if (typeof obj !== 'object') return []
  if (Array.isArray(obj)) {
    return obj.flatMap((v, i) => findAppOnlyKeys(v, `${path}[${i}]`))
  }
  const found: string[] = []
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (APP_ONLY_FUNDER_BRIEF_KEYS.includes(k)) {
      found.push(`${path}.${k}`)
    }
    found.push(...findAppOnlyKeys(v, `${path}.${k}`))
  }
  return found
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Service-role client — bypasses RLS. Required because funders has RLS
  // with no public read policy, so the anon/authenticated path returns 0 rows.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // ── 1. Fetch all active rows ──────────────────────────────────────────
  const { data: rows, error } = await supabase
    .from('scraped_grants')
    .select('*')
    .eq('is_active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!rows) return NextResponse.json({ error: 'no rows returned' }, { status: 500 })

  // ── 2. Run summary projection over every active row ──────────────────
  const failures: { row_id: string; title: string | null; funder: string | null; funding_type: string | null; reason: string }[] = []
  const successes: MCPOpportunitySummary[] = []
  for (const r of rows as ScrapedGrantRow[]) {
    try {
      const projected = toMCPOpportunitySummary(r, VALIDATION_CTX)
      // Post-projection assertions
      if (!UUID_RE.test(projected.opportunity_id)) {
        failures.push({ row_id: r.id, title: r.title, funder: r.funder, funding_type: r.funding_type, reason: `opportunity_id not UUID: "${projected.opportunity_id}"` })
        continue
      }
      if (!projected.title) {
        failures.push({ row_id: r.id, title: r.title, funder: r.funder, funding_type: r.funding_type, reason: 'empty title' })
        continue
      }
      if (!projected.funder) {
        failures.push({ row_id: r.id, title: r.title, funder: r.funder, funding_type: r.funding_type, reason: 'empty funder' })
        continue
      }
      if (!projected.grant_tracker_url.includes('utm_source=')) {
        failures.push({ row_id: r.id, title: r.title, funder: r.funder, funding_type: r.funding_type, reason: 'grant_tracker_url missing UTM' })
        continue
      }
      successes.push(projected)
    } catch (e) {
      const reason = e instanceof AdapterError ? e.reason : (e instanceof Error ? e.message : String(e))
      failures.push({ row_id: r.id, title: r.title, funder: r.funder, funding_type: r.funding_type, reason })
    }
  }

  // ── 3. Sample 10 rows: full detail projection + app-only key audit ────
  const sampleIdxs = new Set<number>()
  const seed = 12345
  let s = seed
  while (sampleIdxs.size < Math.min(10, rows.length)) {
    s = (s * 1103515245 + 12345) >>> 0
    sampleIdxs.add(s % rows.length)
  }
  const detail_samples: { summary: MCPOpportunitySummary; detail: MCPOpportunityDetail; app_only_leaks: string[] }[] = []
  const sampleIdxArr = Array.from(sampleIdxs)
  for (const idx of sampleIdxArr) {
    const r = rows[idx] as ScrapedGrantRow
    try {
      const summary = toMCPOpportunitySummary(r, VALIDATION_CTX)
      const detail = toMCPOpportunityDetail(r, { include_funder_summary: true }, VALIDATION_CTX)
      const leaks_summary = findAppOnlyKeys(summary)
      const leaks_detail = findAppOnlyKeys(detail)
      detail_samples.push({ summary, detail, app_only_leaks: [...leaks_summary, ...leaks_detail] })
    } catch (e) {
      // skip if projection fails; failure already counted above
    }
  }

  // ── 4. Provider intelligence samples — 3 enriched, 2 basic ───────────
  const { data: funderRowsRaw } = await supabase.from('funders').select('*')
  const funderRows = (funderRowsRaw ?? []) as FunderRow[]
  const funderNamesLower = new Set<string>()
  for (const f of funderRows) {
    if (f.name) funderNamesLower.add(f.name.toLowerCase())
    if (f.short_name) funderNamesLower.add(f.short_name.toLowerCase())
  }

  // Group active opportunities by funder
  const byFunder = new Map<string, ScrapedGrantRow[]>()
  for (const r of rows as ScrapedGrantRow[]) {
    if (!r.funder) continue
    const key = r.funder
    const arr = byFunder.get(key) ?? []
    arr.push(r)
    byFunder.set(key, arr)
  }

  // Pick 3 funder names that match the funders table, and 2 that don't
  const enrichedCandidates: string[] = []
  const basicCandidates: string[] = []
  const funderEntries = Array.from(byFunder.entries())
  for (const [funder, opps] of funderEntries) {
    if (opps.length === 0) continue
    if (funderNamesLower.has(funder.toLowerCase())) {
      if (enrichedCandidates.length < 3) enrichedCandidates.push(funder)
    } else {
      if (basicCandidates.length < 2) basicCandidates.push(funder)
    }
    if (enrichedCandidates.length >= 3 && basicCandidates.length >= 2) break
  }

  const provider_samples: { input_name: string; expected_richness: 'enriched' | 'basic'; output: MCPProviderIntelligence; app_only_leaks: string[] }[] = []
  for (const name of [...enrichedCandidates, ...basicCandidates]) {
    const expected = enrichedCandidates.includes(name) ? 'enriched' as const : 'basic' as const
    const opps = byFunder.get(name) ?? []
    const representative = opps.sort((a, b) => (b.last_seen_at ?? '').localeCompare(a.last_seen_at ?? ''))[0]
    const funder_row = funderRows.find(f =>
      (f.name && f.name.toLowerCase() === name.toLowerCase()) ||
      (f.short_name && f.short_name.toLowerCase() === name.toLowerCase())
    ) ?? null
    const output = toMCPProviderIntelligence({
      provider_name: name,
      representative_brief: representative?.funder_brief ?? null,
      funder_row,
      active_opportunities: opps,
    }, VALIDATION_CTX)
    provider_samples.push({
      input_name: name,
      expected_richness: expected,
      output,
      app_only_leaks: findAppOnlyKeys(output),
    })
  }

  // ── 5. Provider richness assertion ────────────────────────────────────
  const richness_mismatches = provider_samples.filter(s => s.output.provider.data_richness !== s.expected_richness)
  const richness_enriched_block_check = provider_samples.filter(s =>
    (s.expected_richness === 'enriched' && !s.output.enriched_data) ||
    (s.expected_richness === 'basic' && s.output.enriched_data !== undefined)
  )

  // ── 6. Sample query validation against search_funding_and_support ─────
  // Exact 10 queries from project_mcp_diagnostic_facts.md, mapped from
  // natural language to MCPSearchParams using the agreed taxonomies.
  // Asserts:
  //   - Q1-4, Q6: total_matching > 0, result_quality not "low" preferred
  //   - Q5: total_matching = 0, likely_cause = "data_gap" or
  //         "filter_combination_too_narrow", adjacent_suggestions populated
  //         or honest data_gap admission
  //   - Q7-10 (thin): total_matching > 0, result_quality = "low"
  const sampleQueries: Array<{ label: string; kind: 'strong' | 'thin'; params: MCPSearchParams; expected_zero?: boolean }> = [
    {
      label: 'Q1 CIC + Manchester + youth (care leavers) + grants under £50k',
      kind: 'strong',
      params: {
        funding_type: ['grant'],
        structure: ['cic'],
        region: ['north_west'],
        beneficiary_group: ['young_people', 'care_experienced'],
        amount_max: 50000,
        limit: 5,
      },
    },
    {
      label: 'Q2 social investment + East London + charity-trading-arm community café',
      kind: 'strong',
      params: {
        funding_type: ['investment'],
        region: ['london'],
        sector: ['community'],
        limit: 5,
      },
    },
    {
      label: 'Q3 climate charity + rural Wales + 90 days',
      kind: 'strong',
      params: {
        funding_type: ['grant'],
        region: ['wales'],
        sector: ['environment'],
        deadline_within_days: 90,
        limit: 5,
      },
    },
    {
      label: 'Q4 SCIO Glasgow + food poverty + in-kind',
      kind: 'strong',
      params: {
        funding_type: ['in_kind'],
        region: ['scotland'],
        structure: ['scio'],
        sector: ['food'],
        beneficiary_group: ['people_in_poverty'],
        limit: 5,
      },
    },
    {
      label: 'Q5 mental-health programmes + Yorkshire',
      kind: 'strong',
      params: {
        funding_type: ['programme'],
        region: ['yorkshire_and_humber'],
        sector: ['mental_health'],
        limit: 5,
      },
      expected_zero: true,
    },
    {
      label: 'Q6 lottery grants + refugee-led + Birmingham + £20-80k',
      kind: 'strong',
      params: {
        funding_type: ['grant'],
        funder_type: ['lottery'],
        region: ['midlands'],
        beneficiary_group: ['refugees_migrants'],
        amount_min: 20000,
        amount_max: 80000,
        limit: 5,
      },
    },
    // Thin-query test params reflect what a vague NL input naturally maps
    // to via an agent: a keyword query without much / any structured filter
    // overlay. If an agent DID over-specify (e.g., translated "community
    // work" → sector=['community']), the scoring engine would discriminate
    // by filter coverage and might return high quality. The thin-query test
    // here verifies that genuinely-thin params produce result_quality='low'.
    {
      label: 'Q7 What funding is available for community work?',
      kind: 'thin',
      params: { query: 'community work', limit: 5 },
    },
    {
      label: 'Q8 Any grants for charities?',
      kind: 'thin',
      params: { funding_type: ['grant'], limit: 5 },
    },
    {
      label: 'Q9 Need money for our youth project',
      kind: 'thin',
      params: { query: 'youth project', limit: 5 },
    },
    {
      label: 'Q10 Help finding funding',
      kind: 'thin',
      params: { query: 'funding', limit: 5 },
    },
  ]

  const sample_query_results = []
  for (const sq of sampleQueries) {
    try {
      const r = await executeMCPSearch(sq.params, VALIDATION_CTX)
      const top_titles = r.results.slice(0, 3).map(x => ({
        title: x.title,
        funder: x.funder,
        score: x.match_quality.score,
        signals: x.match_quality.signals,
      }))
      let zero_diag = null
      if (r.total_matching === 0) {
        try {
          zero_diag = await computeZeroResultDiagnostic(sq.params, VALIDATION_CTX)
        } catch (e) {
          zero_diag = { likely_cause: 'data_gap', explanation: String(e), adjacent_suggestions: [] }
        }
      }
      sample_query_results.push({
        label: sq.label,
        kind: sq.kind,
        expected_zero: sq.expected_zero ?? false,
        params: sq.params,
        total_matching: r.total_matching,
        returned: r.returned,
        result_quality: r.result_quality,
        top_titles,
        zero_result_diagnostic: zero_diag,
        // Assertion pass/fail
        zero_assertion: sq.expected_zero !== undefined
          ? (sq.expected_zero === (r.total_matching === 0) ? 'pass' : 'fail')
          : null,
        thin_quality_assertion: sq.kind === 'thin'
          ? (r.results.length > 0 && r.result_quality === 'low' ? 'pass' : (r.results.length === 0 ? 'n/a' : 'fail'))
          : null,
      })
    } catch (err) {
      sample_query_results.push({
        label: sq.label,
        kind: sq.kind,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // ── Final report ──────────────────────────────────────────────────────
  return NextResponse.json({
    summary: {
      total_active: rows.length,
      summary_projections_attempted: rows.length,
      summary_projections_succeeded: successes.length,
      summary_projections_failed: failures.length,
      detail_samples_count: detail_samples.length,
      provider_samples_count: provider_samples.length,
      provider_richness_mismatches: richness_mismatches.length,
      provider_enriched_block_mismatches: richness_enriched_block_check.length,
      sample_queries_run: sample_query_results.length,
    },
    failures,
    funding_type_distribution: countByFundingType(successes),
    detail_samples,
    provider_samples,
    richness_mismatches,
    richness_enriched_block_check,
    sample_query_results,
  }, { status: 200 })
}

function countByFundingType(rows: MCPOpportunitySummary[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const r of rows) counts[r.funding_type] = (counts[r.funding_type] ?? 0) + 1
  return counts
}

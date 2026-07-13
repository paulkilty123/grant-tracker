// Research agent v1 (design spec §4.1 lever 2): research-once-keep-forever.
//
// Two tools, both companion-tier and app-surface-only (research is in-app in
// v1 — spec §5 — and the MCP route never imports these, so ctx.surface==='mcp'
// is a defence-in-depth check, not the only gate). They are also `researchOnly`
// in TOOL_REGISTRY (index.ts), so dispatch.ts's toolDefsForTier only offers
// them on a research-thread turn — never the briefing generation path or the
// standard drawer (spec §4).
//
// The cache is GLOBAL (not org-scoped, no orgId column) — reused across every
// thread and every org, keyed by a normalised funder identity. It is a cost
// lever, not the permanent record: the enrichment staging flow (step 5,
// unbuilt) is where a researched fact becomes verified catalogue data.

import { serviceClient } from './db'
import { defineTool } from './envelope'
import { emitEvent } from '../../events/emit'
import { EntitlementError, prov, type Provenance } from './types'
import type { ToolContext } from './types'

/** How long a cached profile is treated as fresh before check_researched_funder
 *  flags it stale (the model then decides whether to re-research). Provisional
 *  — tune once real research-thread usage shows how fast funder pages churn. */
const STALE_AFTER_DAYS = 90

function normaliseFunderKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function assertAppSurface(ctx: ToolContext, toolName: string): void {
  if (ctx.surface !== 'app') {
    throw new EntitlementError(`'${toolName}' is not available on this surface — research agent v1 is in-app only (design spec §5).`)
  }
}

// ── check_researched_funder ──────────────────────────────────────────────────

export interface CheckResearchedFunderParams extends Record<string, unknown> {
  funder_name: string
}
export interface CheckResearchedFunderResult {
  found: boolean
  stale: boolean
  funder_name: string | null
  summary: string | null
  focus_notes: string[]
  source_urls: string[]
  fetched_at: string | null
}

export const checkResearchedFunder = defineTool<CheckResearchedFunderParams, CheckResearchedFunderResult>({
  name: 'check_researched_funder',
  handler: async (ctx, p) => {
    assertAppSurface(ctx, 'check_researched_funder')
    if (!p.funder_name || typeof p.funder_name !== 'string') {
      throw new Error('check_researched_funder: funder_name is required')
    }
    const key = normaliseFunderKey(p.funder_name)
    const { data, error } = await serviceClient()
      .from('researched_funder_cache')
      .select('funder_name, summary, focus_notes, source_urls, fetched_at')
      .eq('funder_key', key)
      .maybeSingle()
    if (error || !data) {
      return { found: false, stale: false, funder_name: null, summary: null, focus_notes: [], source_urls: [], fetched_at: null }
    }
    const row = data as Record<string, unknown>
    const fetchedAt = String(row.fetched_at)
    const ageDays = (Date.now() - new Date(fetchedAt).getTime()) / 86_400_000
    return {
      found: true,
      stale: ageDays > STALE_AFTER_DAYS,
      funder_name: row.funder_name as string,
      summary: (row.summary as string | null) ?? null,
      focus_notes: (row.focus_notes as string[] | null) ?? [],
      source_urls: (row.source_urls as string[] | null) ?? [],
      fetched_at: fetchedAt,
    }
  },
  logEvent: async (ctx, _p, r) => {
    await emitEvent({ surface: ctx.surface, orgId: ctx.orgId, userId: ctx.userId },
      'agent_tool_called', { tool_name: 'check_researched_funder', result_count: r.found ? 1 : 0, degraded: !r.found || r.stale })
  },
  provenance: (_ctx, r): Record<string, Provenance<unknown>> => r.found
    ? { summary: prov(r.summary, 'researched', r.fetched_at) }
    : {},
})

// ── cache_researched_funder ──────────────────────────────────────────────────

export interface CacheResearchedFunderParams extends Record<string, unknown> {
  funder_name: string
  summary: string
  focus_notes?: string[]
  source_urls: string[]
}
export interface CacheResearchedFunderResult {
  funder_key: string
  cached: true
}

export const cacheResearchedFunder = defineTool<CacheResearchedFunderParams, CacheResearchedFunderResult>({
  name: 'cache_researched_funder',
  handler: async (ctx, p) => {
    assertAppSurface(ctx, 'cache_researched_funder')
    if (!p.funder_name || typeof p.funder_name !== 'string') {
      throw new Error('cache_researched_funder: funder_name is required')
    }
    if (!p.summary || typeof p.summary !== 'string') {
      throw new Error('cache_researched_funder: summary is required')
    }
    if (!Array.isArray(p.source_urls) || p.source_urls.length === 0) {
      throw new Error('cache_researched_funder: at least one source_url is required')
    }
    const key = normaliseFunderKey(p.funder_name)
    const { error } = await serviceClient()
      .from('researched_funder_cache')
      .upsert({
        funder_key: key,
        funder_name: p.funder_name,
        summary: p.summary,
        focus_notes: p.focus_notes ?? [],
        source_urls: p.source_urls,
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'funder_key' })
    if (error) throw new Error(`cache_researched_funder failed: ${error.message}`)
    return { funder_key: key, cached: true }
  },
  logEvent: async (ctx, _p, r) => {
    await emitEvent({ surface: ctx.surface, orgId: ctx.orgId, userId: ctx.userId },
      'agent_tool_called', { tool_name: 'cache_researched_funder', result_count: 1, degraded: false })
  },
})

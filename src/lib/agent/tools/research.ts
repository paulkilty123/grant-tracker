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
import { stampNewGrant } from '../../grant-merge'
import { getActiveCatalogue } from './repository'

/** How long a cached profile is treated as fresh before check_researched_funder
 *  flags it stale (the model then decides whether to re-research). Provisional
 *  — tune once real research-thread usage shows how fast funder pages churn. */
const STALE_AFTER_DAYS = 90

// Exported for loop.ts's compose_research_note ref hydration (v1.1 §7 fix 1b):
// a model-supplied ref is run through the SAME normalisation before matching
// against the card pool, so a near-miss (wrong case, collapsed whitespace)
// still resolves — only a ref that doesn't identify the same funder at all
// (e.g. a slugified rewrite that drops "the" or swaps spaces for hyphens)
// stays unresolved. See fix 1a on the tool description for the other half:
// telling the model not to reformat the ref in the first place.
export function normaliseFunderKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

// Canonical funder-identity form (v1.1 §7 provenance fix): one more pass on
// top of normaliseFunderKey bridging the reformatting a model ref sometimes
// invents — hyphens standing in for the real spaces, a dropped leading "the".
// Shared by loop.ts's compose_research_note ref hydration AND
// findCatalogueMatchByFunder below, so a funder's identity resolves the same
// way everywhere it's compared.
export function canonicaliseFunderIdentity(name: string): string {
  return normaliseFunderKey(name).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^the /, '')
}

function assertAppSurface(ctx: ToolContext, toolName: string): void {
  if (ctx.surface !== 'app') {
    throw new EntitlementError(`'${toolName}' is not available on this surface — research agent v1 is in-app only (design spec §5).`)
  }
}

export interface CatalogueMatch {
  opportunity_id: string
  title: string
  funder: string
}

// v1.1 §7 fix A (defect 2, the root cause): check_researched_funder used to
// be structurally blind to the catalogue — it could only ever report a
// research-cache hit, never "this funder is already catalogued". That is
// exactly why the catalogueFirstResearch steering (contract.ts) could never
// actually catch a catalogued fund: it told the model to check first, but
// the check itself couldn't see what it was steering the model away from.
// Confirmed live: Paul Hamlyn Foundation's Arts-based Learning Fund — score
// 73, ranked #3 of 674 in get_briefing's own match path, a real candidate —
// got live-researched anyway, because nothing in the pre-research check
// could tell the model it was already there.
//
// Matches on canonicaliseFunderIdentity with symmetric containment, not
// exact equality — a user's or model's shorthand ("Hugo Burge") still finds
// the catalogue's full name ("Hugo Burge Foundation"), and vice versa.
export async function findCatalogueMatchByFunder(funderName: string): Promise<CatalogueMatch | null> {
  const target = canonicaliseFunderIdentity(funderName)
  if (!target) return null
  const catalogue = await getActiveCatalogue()
  const hit = catalogue.find(g => {
    const candidate = canonicaliseFunderIdentity(g.funder)
    return candidate === target || candidate.includes(target) || target.includes(candidate)
  })
  return hit ? { opportunity_id: hit.id, title: hit.title, funder: hit.funder } : null
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
  /** v1.1 §7 fix A — non-null when this funder is already an active
   *  catalogue opportunity. Steers the model to get_briefing / assess_
   *  opportunity_against_plan instead of live-researching a fund that's
   *  already there. Independent of the cache found/stale result above —
   *  a funder can be catalogued with nothing in the research cache, or vice
   *  versa. */
  catalogue_match: CatalogueMatch | null
}

export const checkResearchedFunder = defineTool<CheckResearchedFunderParams, CheckResearchedFunderResult>({
  name: 'check_researched_funder',
  handler: async (ctx, p) => {
    assertAppSurface(ctx, 'check_researched_funder')
    if (!p.funder_name || typeof p.funder_name !== 'string') {
      throw new Error('check_researched_funder: funder_name is required')
    }
    const key = normaliseFunderKey(p.funder_name)
    const [{ data, error }, catalogueMatch] = await Promise.all([
      serviceClient()
        .from('researched_funder_cache')
        .select('funder_name, summary, focus_notes, source_urls, fetched_at')
        .eq('funder_key', key)
        .maybeSingle(),
      findCatalogueMatchByFunder(p.funder_name),
    ])
    if (error || !data) {
      return { found: false, stale: false, funder_name: null, summary: null, focus_notes: [], source_urls: [], fetched_at: null, catalogue_match: catalogueMatch }
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
      catalogue_match: catalogueMatch,
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
  funder_name: string
  summary: string
  focus_notes: string[]
  source_urls: string[]
  fetched_at: string
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
    const fetchedAt = new Date().toISOString()
    const focusNotes = p.focus_notes ?? []
    const { error } = await serviceClient()
      .from('researched_funder_cache')
      .upsert({
        funder_key: key,
        funder_name: p.funder_name,
        summary: p.summary,
        focus_notes: focusNotes,
        source_urls: p.source_urls,
        fetched_at: fetchedAt,
      }, { onConflict: 'funder_key' })
    if (error) throw new Error(`cache_researched_funder failed: ${error.message}`)
    // Echoes back what was written (not just an id) — this is also the UI's
    // researched-live card render signal (loop.ts PANEL_RESULT_SLIMMERS), so
    // the card needs the content here, not a second round-trip to fetch it.
    return { funder_key: key, funder_name: p.funder_name, summary: p.summary, focus_notes: focusNotes, source_urls: p.source_urls, fetched_at: fetchedAt, cached: true }
  },
  logEvent: async (ctx, _p, r) => {
    await emitEvent({ surface: ctx.surface, orgId: ctx.orgId, userId: ctx.userId },
      'agent_tool_called', { tool_name: 'cache_researched_funder', result_count: 1, degraded: false })
  },
})

// ── flag_for_verification ────────────────────────────────────────────────────
// The enrichment staging flow (design spec §3/§4, build step 5). Stages the
// SAME table and Needs Review workflow every other catalogue addition goes
// through — is_active=false, source below admin/ai_enrich trust (a real
// enrichment pass can still improve it later) — via the SAME stampNewGrant()
// every scraper/audit insert uses, so this never becomes a parallel,
// differently-behaved staging path (CLAUDE.md's field_provenance trust
// ladder gotcha: never stamp `admin:` on something no human has reviewed).
// A dedicated small table (agent_flagged_findings, migration 041) records the
// thread + source URLs + claimed fields — the audit trail spec §4 asks for
// ("tagged to the originating thread"); the staged content itself lives on
// the scraped_grants row, exactly like every other addition.

export interface FlagForVerificationParams extends Record<string, unknown> {
  funder_name: string
  summary: string
  focus_notes?: string[]
  source_urls: string[]
}
export interface FlagForVerificationResult {
  scraped_grant_id: string
  flagged: true
}

export const flagForVerification = defineTool<FlagForVerificationParams, FlagForVerificationResult>({
  name: 'flag_for_verification',
  handler: async (ctx, p) => {
    assertAppSurface(ctx, 'flag_for_verification')
    if (!p.funder_name || typeof p.funder_name !== 'string') {
      throw new Error('flag_for_verification: funder_name is required')
    }
    if (!p.summary || typeof p.summary !== 'string') {
      throw new Error('flag_for_verification: summary is required')
    }
    if (!Array.isArray(p.source_urls) || p.source_urls.length === 0) {
      throw new Error('flag_for_verification: at least one source_url is required')
    }
    if (!ctx.threadId) {
      throw new Error('flag_for_verification: no thread context — this is a research-thread-only action')
    }

    const sb = serviceClient()
    const source = `system:research-flag-${new Date().toISOString().slice(0, 10)}`
    const stamped = stampNewGrant(
      {
        title: p.funder_name,
        funder: p.funder_name,
        description: p.summary,
        apply_url: p.source_urls[0] ?? null,
        source: 'research_agent', // scraped_grants.source (how it entered the catalogue) — distinct from field_provenance's per-field source strings above
        is_active: false,
        raw_data: { flagged_from_research: true, source_urls: p.source_urls, focus_notes: p.focus_notes ?? [] },
      },
      source,
    )
    const { data, error } = await sb.from('scraped_grants').insert(stamped).select('id').single()
    if (error || !data) throw new Error(`flag_for_verification: scraped_grants insert failed: ${error?.message}`)
    const scrapedGrantId = String((data as Record<string, unknown>).id)

    const { error: linkErr } = await sb.from('agent_flagged_findings').insert({
      thread_id: ctx.threadId,
      org_id: ctx.orgId,
      scraped_grant_id: scrapedGrantId,
      source_urls: p.source_urls,
      claimed_fields: { funder_name: p.funder_name, summary: p.summary, focus_notes: p.focus_notes ?? [] },
    })
    if (linkErr) console.error('[flag_for_verification] agent_flagged_findings insert failed (catalogue row still staged):', linkErr.message)

    return { scraped_grant_id: scrapedGrantId, flagged: true }
  },
  logEvent: async (ctx, _p, r) => {
    await emitEvent({ surface: ctx.surface, orgId: ctx.orgId, userId: ctx.userId },
      'agent_tool_called', { tool_name: 'flag_for_verification', result_count: 1, degraded: false })
  },
  provenance: (_ctx, r): Record<string, Provenance<unknown>> => ({
    scraped_grant_id: prov(r.scraped_grant_id, 'agent', new Date().toISOString()),
  }),
})

// ── compose_research_note ────────────────────────────────────────────────────
// v1.1 §2 (compose-then-render). A structured-final-answer tool, not a data
// mutation: its only job is to force a research turn's reply through
// validated JSON instead of free text, so nothing renders from raw tool
// results directly. The orchestrator loop (loop.ts) does the real work —
// resolving shortlist/weaker refs against this turn's card pool, deciding
// when the turn terminates — this handler is a thin structural passthrough.
//
// skipAuthorshipGuard: these params are never submitted to a funder, they
// render back to the same user as the adviser's own note — assertScaffoldOnly
// exists to stop ghostwritten application prose reaching a funder, a category
// mismatch here, and its blanket 600-char cap would hard-reject the WHOLE
// note over one long field (losing every card, burning a retry iteration).

export interface ComposeResearchNoteParams extends Record<string, unknown> {
  read: string
  /** v1.1 §3.3: caveat is authored, not extracted — present only when the
   *  verdict genuinely carries a check-before-committing point, phrased as a
   *  plain question (doubles as the chip label and the message sent when
   *  tapped). Omit rather than force a generic label. */
  shortlist?: Array<{ ref: string; verdict: string; caveat?: string }>
  weaker?: Array<{ ref: string; reason: string }>
}

export const composeResearchNote = defineTool<ComposeResearchNoteParams, ComposeResearchNoteParams>({
  name: 'compose_research_note',
  skipAuthorshipGuard: true,
  handler: async (ctx, params) => {
    assertAppSurface(ctx, 'compose_research_note')
    if (!params.read?.trim()) throw new Error('compose_research_note: read is required')
    return params
  },
  logEvent: async () => {}, // turn choreography, not a domain event
})

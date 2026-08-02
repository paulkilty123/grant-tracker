// MCP server — Streamable HTTP transport, JSON-RPC.
// Endpoint: /api/mcp/v1
// Brand name, origins, and contact address come from lib/mcp-brand.ts.
//
// SDK stack (chosen 2026-05-12 per spec §3):
//   Primary protocol: @modelcontextprotocol/sdk@1.26.0 (Anthropic's official
//     reference SDK; provides McpServer, JSON-RPC handling, tool schemas,
//     capability negotiation).
//   Integration layer: mcp-handler@1.1.0 (Vercel-maintained Next.js Route
//     Handler wrapper, formerly @vercel/mcp-adapter; peer-deps SDK at exact
//     1.26.0; pulls redis as a side-effect dep that step 3 will use).
// SDK upgrades: bump both together when mcp-handler bumps its peer-dep.
//
// All five v1 tools share this single endpoint. Spec §3.4 mandates
// Streamable HTTP; the createMcpHandler wraps that automatically.
//
// Auth: validateMCPRequest runs OUTSIDE the SDK, so we control the
// anonymous-fallback path (spec §6.2 — anon allowed up to 10/hr).
// Auth context is threaded into tool handlers via AsyncLocalStorage since
// the SDK doesn't pass the original Request through to handlers.
//
// Rate limiting: step 3 will plug Redis enforcement in just below the
// validateMCPRequest call. For now, rate_limit_status returns the static
// maxima from spec §6.3 — the response shape stays stable.

import { createMcpHandler } from 'mcp-handler'
import { NextRequest, NextResponse } from 'next/server'
import { AsyncLocalStorage } from 'async_hooks'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { validateMCPRequest, type MCPAuthContext } from '@/lib/mcp-middleware'
import { enforceRateLimits, consumeFreeSearchQuota, isPaidTier, type SearchQuotaResult } from '@/lib/mcp-rate-limit'
import {
  getMCPTaxonomy,
  getAllMCPTaxonomies,
  toMCPOpportunityDetail,
  toMCPProviderIntelligence,
  type MCPTaxonomyName,
  type MCPFundingType,
  type MCPRegion,
  type AdapterContext,
  type ScrapedGrantRow,
  type FunderRow,
} from '@/lib/opportunity-adapter'
import { executeMCPSearch, computeZeroResultDiagnostic, type MCPSearchParams } from '@/lib/mcp-search'
import { logMcpQuery } from '@/lib/mcp-query-log'
import { emitEvent } from '@/lib/events/emit'
import { getUpgradeNote, getErrorVariantNote } from '@/lib/mcp-upgrade-notes'
import { resolveOrgAndTier } from '@/lib/mcp-entitlement'
import {
  addToPipeline, updatePipelineItem, getPipeline, getPlanState, getBriefing,
  assessOpportunityAgainstPlan, getFundingGoal, setFundingGoal,
  recommendMix, updateGoalPurposes, PURPOSE_CATEGORIES,
  TOOL_REGISTRY, EntitlementError, AuthorshipError, SetupSurfaceError, type ToolContext,
} from '@/lib/agent/tools'
import {
  MCP_ATTRIBUTION, MCP_BRAND_NAME, MCP_SERVER_SLUG, MCP_CONTACT_EMAIL,
  MCP_PUBLIC_ORIGIN, MCP_APP_HOST,
} from '@/lib/mcp-brand'
import { classifyProtocolEra } from '@/lib/mcp-protocol-era'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Async-local store for the per-request auth context. Tool handlers don't
// receive the original Request, so we thread auth through this instead.
const authStore = new AsyncLocalStorage<MCPAuthContext>()

const ATTRIBUTION = MCP_ATTRIBUTION

// Reads live rate-limit status from the auth context if step 3 populated
// it, otherwise falls back to the static maxima from spec §6.3. The fallback
// is used in two cases: (a) Upstash env vars missing locally (dev), or
// (b) defensive — should never happen in production since handle() always
// runs enforceRateLimits.
function rateLimitStatusForContext(ctx: MCPAuthContext | undefined) {
  if (ctx?.rate_limit_status) return ctx.rate_limit_status
  const state = ctx?.state ?? 'anonymous'
  const reset_at_hour = Date.now() + 3_600_000
  if (state === 'authenticated') {
    return { remaining_hour: 100, remaining_day: 1000, reset_at_hour }
  }
  return { remaining_hour: 10, remaining_day: null, reset_at_hour }
}

/**
 * What the free search allowance is counted against.
 *
 * Organisation first, because the quota is a commercial line: minting a fresh
 * token or re-registering a client must not hand out a new allowance. API-key
 * callers have no resolved org (tier resolution is OAuth-only), so they fall
 * back to their key hash — still bounded, just per-key rather than per-org.
 */
function freeQuotaSubject(auth: MCPAuthContext | undefined): string {
  if (auth?.orgId) return `org:${auth.orgId}`
  if (auth?.key) return `key:${auth.key.key_hash}`
  if (auth?.oauth) return `user:${auth.oauth.user_id}`
  return 'unknown'
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

async function getCatalogueFreshness(): Promise<{ last_updated: string | null; active_opportunities: number }> {
  const sb = serviceClient()
  const [{ data: latest }, { count }] = await Promise.all([
    sb.from('scraped_grants')
      .select('last_seen_at')
      .eq('is_active', true)
      .order('last_seen_at', { ascending: false })
      .limit(1),
    sb.from('scraped_grants')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
  ])
  return {
    last_updated: (latest as { last_seen_at: string | null }[] | null)?.[0]?.last_seen_at ?? null,
    active_opportunities: count ?? 0,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// MCP server setup
// ──────────────────────────────────────────────────────────────────────────

// Server identity advertised in the MCP initialize result. icons + websiteUrl
// let compatible clients (e.g. the Connectors Directory) render the Grant
// Tracker (Pulse Track) mark from metadata instead of guessing at the favicon.
// mcp-handler forwards this object whole to McpServer, and the SDK's
// Implementation schema carries icons/websiteUrl (passed as a pre-typed const so
// the extra fields clear mcp-handler's narrower {name,version} serverInfo type).
const MCP_SERVER_INFO = {
  name: MCP_SERVER_SLUG,
  version: '1.4.0',
  websiteUrl: MCP_PUBLIC_ORIGIN,
  icons: [
    { src: `${MCP_PUBLIC_ORIGIN}/favicon.svg`, mimeType: 'image/svg+xml', sizes: ['any'] },
    { src: `${MCP_PUBLIC_ORIGIN}/android-chrome-512x512.png`, mimeType: 'image/png', sizes: ['512x512'] },
  ],
}

// ── Capture layer ───────────────────────────────────────────────────────────
// Wraps a tool handler so every call emits mcp_tool_called (tool name, full
// arguments, result count where derivable, duration). The MCP is the richest
// intent surface — argument capture must be complete. Guarded internally;
// never blocks or breaks a tool response.
function withCapture(
  toolName: string,
  handler: (...args: unknown[]) => Promise<unknown>,
): (...args: unknown[]) => Promise<unknown> {
  return async (...args: unknown[]) => {
    const started = Date.now()
    const result = await handler(...args)
    try {
      const auth = authStore.getStore()
      // Derive a result count from the JSON body where one exists.
      let resultCount: number | null = null
      try {
        const text = (result as { content?: { text?: unknown }[] })?.content?.[0]?.text
        if (typeof text === 'string') {
          const parsed = JSON.parse(text) as { total_matching?: unknown; results?: unknown }
          if (typeof parsed.total_matching === 'number') resultCount = parsed.total_matching
          else if (Array.isArray(parsed.results)) resultCount = parsed.results.length
        }
      } catch { /* count stays null */ }
      const rawArgs =
        args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])
          ? (args[0] as Record<string, unknown>)
          : {}
      await emitEvent({ surface: 'mcp', orgId: null, userId: null }, 'mcp_tool_called', {
        tool_name:    toolName,
        arguments:    rawArgs,
        result_count: resultCount,
        duration_ms:  Date.now() - started,
        channel:      auth?.utm_source ?? 'mcp_anonymous',
        auth_state:   auth?.state ?? 'anonymous',
      })
    } catch (err) {
      console.error('[events] mcp_tool_called capture failed:', err)
    }
    return result
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Companion tools (goal agent) — registered ONLY on the companion handler.
//
// Org identity is IMPLICIT: resolved from the OAuth token at the boundary
// (resolveOrgAndTier) and read from the auth store here — it is never a tool
// parameter, so an external model cannot spoof it. Each tool runs through the
// same envelope (entitlement · authorship · capture · provenance) as the in-app
// surface; this route is an EXPOSURE of that one layer, not a second build. The
// descriptions come verbatim from TOOL_REGISTRY (the canonical MCP steering).
// ──────────────────────────────────────────────────────────────────────────

const COMPANION_DESC: Record<string, string> =
  Object.fromEntries(TOOL_REGISTRY.map(t => [t.name, t.description]))

function companionError(code: string, message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({
      error: { code, message },
      attribution: ATTRIBUTION,
      rate_limit_status: rateLimitStatusForContext(authStore.getStore()),
    }) }],
    isError: true,
  }
}

// Build ToolContext from the request's auth store, run the tool, and serialise
// its ToolResult (data + provenance) to MCP content. Envelope errors map to
// generic, client-safe messages — nothing about org internals leaks.
async function runAgentTool(
  run: (ctx: ToolContext) => Promise<{ tool: string; surface: string; data: unknown; provenance: unknown }>,
) {
  const auth = authStore.getStore()
  // Establishes only that we have a resolved org and tier. PER-TOOL entitlement
  // is not decided here — it belongs to TIER_TOOLS in tools/entitlement.ts, and
  // the defineTool envelope enforces it on every call. Duplicating the policy
  // here is how the two copies would drift; a tool reachable on one tier and
  // not another is expressed by which handler registers it, plus that check.
  if (!auth?.orgId || !auth.tier) {
    return companionError('forbidden', `This tool requires a ${MCP_BRAND_NAME} account linked to this connection.`)
  }
  const ctx: ToolContext = { orgId: auth.orgId, surface: 'mcp', tier: auth.tier, userId: auth.oauth?.user_id ?? null }
  try {
    const result = await run(ctx)
    return { content: [{ type: 'text' as const, text: JSON.stringify({
      ...result,
      attribution: ATTRIBUTION,
      rate_limit_status: rateLimitStatusForContext(auth),
      // §13 item 8 ("connected as [org]") + MCP date-grounding: an external
      // client controls its own system prompt, so unlike the in-app
      // orchestrator there is no cache-safe way to inject org identity or
      // today's date there. Every companion tool result instead carries both
      // in its envelope — see CONTRACT.dateGrounding for the steering that
      // tells the model to use as_of rather than its own sense of the date.
      connected_org: auth.orgName ?? null,
      as_of: new Date().toISOString().slice(0, 10),
    }) }] }
  } catch (e) {
    if (e instanceof EntitlementError) return companionError('forbidden', 'This tool is not available on your plan.')
    if (e instanceof AuthorshipError) return companionError('invalid_parameter', 'This tool helps with structure only; it does not accept application content.')
    if (e instanceof SetupSurfaceError) return companionError('setup_requires_app', e.message)
    console.error('[mcp] companion tool failed:', e)
    return companionError('internal_error', `Something went wrong. Please retry; if it persists, contact ${MCP_CONTACT_EMAIL}.`)
  }
}

const STAGE = z.enum(['identified', 'applying', 'submitted', 'won', 'declined'])

// Purpose split (design spec §4 Q2) — mirrors PURPOSE_ITEM_SCHEMA in the
// canonical TOOL_REGISTRY. category is the shared PURPOSE_CATEGORIES enum so the
// MCP schema and the tool layer can never drift on the vocabulary. Cast keeps
// the literal union (not bare string) so params stay assignable to PurposeInput.
type PurposeCategory = typeof PURPOSE_CATEGORIES[number]
const PURPOSE_CATEGORY = z.enum([...PURPOSE_CATEGORIES] as [PurposeCategory, ...PurposeCategory[]])
const PURPOSE_ITEM = z.object({
  category:      PURPOSE_CATEGORY.describe('Purpose category. Use "other" only when nothing fits — it routes to your own labelled judgment via recommend_mix.'),
  label:         z.string().describe('Short free-text label, e.g. "Youth worker post", "Minibus appeal".'),
  approx_amount: z.number().optional().describe('Approximate whole pounds. Roughness is fine — omit if the user genuinely does not know.'),
  refinement:    z.string().optional().describe("The user's answer to a recommend_mix clarifying question (e.g. staffing 'delivery post' / 'organisational post'). Omit until asked and answered."),
})

type McpServerArg = Parameters<Parameters<typeof createMcpHandler>[0]>[0]

// Pipeline tools — Apply tier and above. These are the three the TIER_TOOLS
// map has always granted Apply; until now nothing registered them on a handler
// Apply could reach, so the entitlement existed on paper only.
function registerPipelineTools(server: McpServerArg) {
  server.tool(
    'get_pipeline',
    COMPANION_DESC['get_pipeline'],
    {},
    { title: 'Pipeline', readOnlyHint: true },
    async () => runAgentTool(ctx => getPipeline(ctx, {})),
  )

  server.tool(
    'add_to_pipeline',
    COMPANION_DESC['add_to_pipeline'],
    {
      grant_name:       z.string().describe('Name of the opportunity to track.'),
      funder_name:      z.string().optional().describe('Funder / provider name.'),
      opportunity_id:   z.string().optional().describe('Catalogue id, if this came from a search result.'),
      stage:            STAGE.optional().describe('Pipeline stage; defaults to "identified".'),
      amount_requested: z.number().optional().describe('Amount to request, in GBP.'),
      deadline:         z.string().optional().describe('Application deadline, ISO date.'),
      grant_url:        z.string().optional().describe('Funder application URL.'),
    },
    { title: 'Add to pipeline' },
    async (p) => runAgentTool(ctx => addToPipeline(ctx, p)),
  )

  server.tool(
    'update_pipeline_item',
    COMPANION_DESC['update_pipeline_item'],
    {
      pipeline_item_id: z.string().describe('Id of the pipeline item to update.'),
      stage:            STAGE.optional().describe('New stage. Moving to won/declined records the outcome.'),
      amount_requested: z.number().optional().describe('Updated amount, in GBP.'),
      deadline:         z.string().optional().describe('Updated deadline, ISO date.'),
      outcome_date:     z.string().optional().describe('Date the outcome was decided, ISO date.'),
      outcome_notes:    z.string().optional().describe('Short outcome note (a note, not application prose).'),
    },
    { title: 'Update pipeline item' },
    async (p) => runAgentTool(ctx => updatePipelineItem(ctx, p)),
  )
}

// Goal-agent tools — Adviser (companion) tier only.
function registerGoalAgentTools(server: McpServerArg) {
  server.tool(
    'get_funding_goal',
    COMPANION_DESC['get_funding_goal'],
    {},
    { title: 'Funding goal', readOnlyHint: true },
    async () => runAgentTool(ctx => getFundingGoal(ctx, {})),
  )

  server.tool(
    'set_funding_goal',
    COMPANION_DESC['set_funding_goal'],
    {
      title:          z.string().describe('Short label for the goal, e.g. "2026 income target". A label, not application prose.'),
      target_amount:  z.number().describe('Total funding target for the period, in GBP.'),
      start_date:     z.string().describe('Period start, ISO date (YYYY-MM-DD).'),
      end_date:       z.string().describe('Period end / deadline, ISO date (YYYY-MM-DD). Must be after start_date.'),
      purposes:       z.array(PURPOSE_ITEM).optional().describe("What the money is for — the purpose split (design spec Q2). Structure the user's rough answer; approximate amounts are fine. Drives recommend_mix and sharpens matching (many funders fund only projects, never core)."),
      mix_targets:    z.record(z.string(), z.number()).optional().describe('Funding-character mix as percentages, e.g. { "unrestricted": 55, "project": 35, "capital": 10 } — the CONFIRMED output of recommend_mix, or the mix the user themselves stated. Never a mix you invented.'),
      constraints:    z.array(z.object({ kind: z.string(), text: z.string() })).optional().describe('What the org will not take money for, e.g. [{ "kind": "sector", "text": "no gambling or tobacco funding" }].'),
      secured_amount: z.number().optional().describe('Override secured-to-date; omit to derive from pipeline items already won.'),
    },
    { title: 'Set funding goal' },
    async (p) => runAgentTool(ctx => setFundingGoal(ctx, p)),
  )

  server.tool(
    'recommend_mix',
    COMPANION_DESC['recommend_mix'],
    { purposes: z.array(PURPOSE_ITEM).optional().describe("The purpose split to derive from (during setup, before the goal exists). Omit to use the active goal's stored purposes.") },
    { title: 'Recommend funding mix', readOnlyHint: true },
    async (p) => runAgentTool(ctx => recommendMix(ctx, p)),
  )

  server.tool(
    'update_goal_purposes',
    COMPANION_DESC['update_goal_purposes'],
    {
      add:    z.array(PURPOSE_ITEM).optional().describe('New purpose lines to add to the active goal (e.g. a side funding project).'),
      update: z.array(z.object({
        purpose_id:    z.string().describe('From get_plan_state or a prior write.'),
        label:         z.string().optional(),
        approx_amount: z.number().optional(),
        category:      PURPOSE_CATEGORY.optional(),
        refinement:    z.string().optional(),
      })).optional().describe('Edits to existing purposes, keyed by purpose_id.'),
      retire: z.array(z.string()).optional().describe('purpose_ids to retire (kept as history; nothing is deleted).'),
    },
    { title: 'Update goal purposes' },
    async (p) => runAgentTool(ctx => updateGoalPurposes(ctx, p)),
  )

  server.tool(
    'get_plan_state',
    COMPANION_DESC['get_plan_state'],
    {},
    { title: 'Plan state', readOnlyHint: true },
    async () => runAgentTool(ctx => getPlanState(ctx, {})),
  )

  server.tool(
    'get_briefing',
    COMPANION_DESC['get_briefing'],
    { since: z.string().optional().describe('Optional ISO timestamp; returns what changed in the pipeline since then.') },
    { title: 'Funding briefing', readOnlyHint: true },
    async (p) => runAgentTool(ctx => getBriefing(ctx, p)),
  )

  server.tool(
    'assess_opportunity_against_plan',
    COMPANION_DESC['assess_opportunity_against_plan'],
    { opportunity_id: z.string().describe('Catalogue opportunity id (UUID or external id), e.g. from a search result.') },
    { title: 'Assess opportunity', readOnlyHint: true },
    async (p) => runAgentTool(ctx => assessOpportunityAgainstPlan(ctx, p)),
  )
}

/** Which bundle of tools a handler exposes. Mirrors the tier ladder. */
type HandlerSurface = 'free' | 'apply' | 'companion'

function buildHandler(surface: HandlerSurface) {
  return createMcpHandler(
  (server) => {
    // Capture layer: intercept tool registration so every handler — current
    // and future — is wrapped with mcp_tool_called instrumentation. Done at
    // runtime so the typed registrations below stay untouched.
    const originalTool = (server.tool as (...a: unknown[]) => unknown).bind(server)
    ;(server as unknown as { tool: (...a: unknown[]) => unknown }).tool = (...toolArgs: unknown[]) => {
      const name = toolArgs[0] as string
      const last = toolArgs.length - 1
      if (typeof toolArgs[last] === 'function') {
        toolArgs[last] = withCapture(name, toolArgs[last] as (...a: unknown[]) => Promise<unknown>)
      }
      return originalTool(...toolArgs)
    }

    // health_check — spec §4.5 + §8.5
    server.tool(
      'health_check',
      // Description verbatim from spec §8.5
      `Check ${MCP_BRAND_NAME} MCP server availability and version. Returns server\nstatus and the timestamp of the most recent catalogue update.\n\nUse this for diagnostic purposes only. Not relevant for user-facing\nfunding queries.`,
      {},  // no parameters
      { title: 'Health check', readOnlyHint: true },
      async () => {
        const auth = authStore.getStore()
        let catalogue: { last_updated: string | null; active_opportunities: number }
        let status: 'ok' | 'degraded' | 'down' = 'ok'
        try {
          catalogue = await getCatalogueFreshness()
        } catch {
          catalogue = { last_updated: null, active_opportunities: 0 }
          status = 'degraded'
        }
        const body = {
          status,
          version: '1.4.0',
          catalogue,
          timestamp: new Date().toISOString(),
          attribution: ATTRIBUTION,
          rate_limit_status: rateLimitStatusForContext(auth),
          // upgrade_note: deliberately omitted per spec §5.1 (health_check is the only tool that doesn't include it)
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(body) }],
        }
      },
    )

    // get_taxonomy — spec §4.4 + §8.4
    server.tool(
      'get_taxonomy',
      // Description verbatim from spec §8.4
      `Look up the controlled vocabularies for sectors, regions,\norganisational structures, funding types, and beneficiary groups. Useful\nwhen the user describes their work or organisation in free text and you\nneed to translate to the right filter values for search_funding_and_support.\n\nWHEN TO USE:\n- Before calling search_funding_and_support, when the user's description\n  doesn't map obviously to a structured filter value\n- To present the user with available options ("which of these sectors\n  matches your work?")\n- To verify a filter value you're about to use is supported\n\nWHEN NOT TO USE:\n- For substantive funding questions, use search_funding_and_support\n- This is a reference tool, not a discovery tool — it returns vocabulary,\n  not opportunities\n\nCOMPOSABLE PATTERNS:\n- get_taxonomy → search_funding_and_support is the standard pattern when\n  translating free text to structured filters\n- Pass a specific taxonomy parameter (e.g., taxonomy="sectors") to get one\n  list, or omit to get all taxonomies in one call\n\nDATA QUALITY NOTES:\n- Returned values are the canonical taxonomy. Matching is case-insensitive\n  and tolerant of common variants in search_funding_and_support, but using\n  canonical values gives the cleanest results.\n\nSOURCE:\nTaxonomies are maintained by ${MCP_BRAND_NAME}.`,
      {
        taxonomy: z
          .enum(['sectors', 'regions', 'structures', 'funding_types', 'beneficiary_groups', 'funder_types'])
          .optional()
          .describe('Single taxonomy to fetch. Omit to return all six.'),
      },
      { title: 'Browse taxonomies', readOnlyHint: true },
      async ({ taxonomy }) => {
        const auth = authStore.getStore()
        const taxonomies = taxonomy
          ? { [taxonomy]: getMCPTaxonomy(taxonomy as MCPTaxonomyName) }
          : getAllMCPTaxonomies()
        const body = {
          taxonomies,
          attribution: ATTRIBUTION,
          rate_limit_status: rateLimitStatusForContext(auth),
          upgrade_note: getUpgradeNote('get_taxonomy', 'standard'),
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(body) }],
        }
      },
    )

    // search_funding_and_support — spec §4.1 + §8.1
    server.tool(
      'search_funding_and_support',
      // Description verbatim from spec §8.1
      `Search a curated, URL-validated UK funding catalogue for grants, programmes,\nsocial investment, and in-kind support relevant to a UK charity, CIC, social\nenterprise, or community group. Every opportunity in the catalogue has been\nscraped from the funder's own site, classified, and deadline-tracked; URL\nvalidity is checked weekly.\n\nWHEN TO USE THIS TOOL:\n- The user is asking what funding is available for their work\n- The user wants to explore opportunities by sector, region, structure, or amount\n- The user mentions a specific UK region, beneficiary group, or organisational structure\n- The user wants to know what's open or closing soon\n\nWHEN NOT TO USE:\n- If the user wants details on a specific opportunity they've already identified,\n  use get_opportunity_detail with its ID instead\n- If the user wants to understand a specific funder's full priorities and\n  approach, use get_provider_intelligence\n- If you need to translate the user's free-text description into the catalogue's\n  taxonomy (sectors, regions, structures, funding types), call get_taxonomy first\n\nDEADLINE TYPES — HOW TO PRESENT:\n- **type='fixed'** — fund is open; surface "Closes [date], [days_until] days remaining"\n- **type='rolling'** — fund accepts applications any time; surface "Rolling deadline"\n- **type='between_rounds'** — fund is currently CLOSED but the next round is known. Surface honestly as "Currently between rounds — next opens [next_open_text or date], in [days_until] days". DO NOT present as open. The next_open_text field carries the source's free-form description (e.g. "Spring 2027") and is the user-facing source of truth when present.\n- **type='closed'** — fund's most-recent cycle is past and no next round known. Surface "Currently closed, no announced next round" if you choose to mention it at all.\n\nPRESENTING RESULTS TO THE USER — REQUIRED:\n- The **direct funder URL (apply_url) is the primary citation per result**.\n  It's what the user clicks to read the funder's own page, verify the\n  details, and apply. Lead with it. Cite it visibly.\n- Each result also carries grant_tracker_url, the catalogue's own detail\n  view for that opportunity (full eligibility criteria,\n  organisation-structure fit, deadline tracking). It is available if the\n  user wants the enriched view; apply_url remains the primary citation for\n  any factual claim.\n- The user must be able to reach the funder directly. A result presented\n  without its apply_url fails that bar.\n- When you state a deadline, eligibility constraint, amount range, or any\n  other factual claim about a funder, cite the funder URL so the user can\n  verify it on the funder's own page. The catalogue is the source of\n  truth; treat it that way.\n- When a result you would otherwise have included has a region/sector/eligibility\n  mismatch with the user's query, surface that explicitly (\"X is North-only, so\n  not relevant for your Brighton query\"). Naming negatives builds user trust\n  and is part of the audit-grade quality bar.\n\nCOMPOSABLE PATTERNS:\n- Start broad with one filter (funding_type or sector), drill down with more\n  filters as the user clarifies\n- search → pick a promising result → get_opportunity_detail for the deep dive\n  → get_provider_intelligence if the user wants funder context\n- For "what's closing soon" queries, use deadline_within_days=30 or 60\n- When a 0-result response includes adjacent_suggestions with a loosened_filter,\n  the loosened dimension is one of several possible relaxations. If the user\n  prefers a different relaxation (e.g., we returned "different sectors" but\n  the user really cares about the sector and is flexible on funding type),\n  you can do a follow-up search with the user's preferred dimensions to find\n  alternatives. For example: user asks for "mental health programmes in\n  Yorkshire" → we return "Yorkshire programmes in different sectors" → you\n  can offer to search for "mental health grants in Yorkshire" as an alternative.\n\nDATA QUALITY NOTES:\n- Match quality is based on query-to-opportunity matching, not on the user's\n  specific organisational profile. The match_quality.signals field tells you\n  which dimensions matched (sector, amount, region, etc.) so you can explain\n  to the user why a result was returned.\n- The result_quality wrapper field signals overall match strength: "high"\n  means most results are strong fits, "mixed" means a spread, "low" means\n  the search is returning broad matches because no precise matches exist.\n- Some opportunities have unverified URLs and are excluded by default. Set\n  exclude_unverified_urls=false to include them, but warn the user that some\n  links may not work.\n- When 0 results are returned, the zero_result_diagnostic field explains why\n  (data gap vs filter combination) and offers adjacent_suggestions with\n  loosened filters. Use these to give the user useful alternatives rather\n  than just reporting "no results."\n- The catalogue is UK-focused and curated, not exhaustive. Coverage is\n  strongest for national trusts and foundations and for the sectors and\n  regions surfaced by get_taxonomy. If a query returns thin results, say so\n  honestly rather than padding.\n\nSOURCE:\nResults come from ${MCP_BRAND_NAME}, a curated UK funding catalogue for\ncharities, CICs, and social enterprises.`,
      {
        query:                    z.string().optional().describe('Free-text relevance hint. Influences ranking but does NOT filter — rows are never excluded for missing the keyword. Pass intent-words from the user\'s question even when uncertain; a small scoring boost applies when the text appears in the funder name or opportunity title, otherwise the row still surfaces and is scored on the structured filters. To narrow results precisely, use the structured fields (sector, region, beneficiary_group, funder_type, structure, amount range, deadline_within_days) — those are the hard filters. Leave query empty when the user\'s intent is fully captured by structured filters.'),
        funding_type:             z.array(z.enum(['grant', 'programme', 'investment', 'in_kind'])).optional().describe('One or more funding types; omit for all four.'),
        region:                   z.array(z.string()).optional().describe('UK regional taxonomy values (see get_taxonomy). UK-wide opportunities surface for any region-specific query.'),
        sector:                   z.array(z.string()).optional().describe('Sector taxonomy values (see get_taxonomy).'),
        structure:                z.array(z.string()).optional().describe('Agent-facing structure tokens (see get_taxonomy). cic / social_enterprise / community_group fan out to DB-canonical values automatically.'),
        amount_min:               z.number().optional().describe('GBP minimum.'),
        amount_max:               z.number().optional().describe('GBP maximum.'),
        deadline_within_days:     z.number().optional().describe('Only return opportunities closing within N days.'),
        include_rolling:          z.boolean().optional().describe('Include opportunities with no fixed deadline. Default true.'),
        beneficiary_group:        z.array(z.string()).optional().describe('Beneficiary group taxonomy values (see get_taxonomy).'),
        funder_type:              z.array(z.string()).optional().describe('Funder type taxonomy values (see get_taxonomy).'),
        exclude_unverified_urls:  z.boolean().optional().describe('Default true; hides the 67 unchecked-URL rows.'),
        limit:                    z.number().int().min(1).max(50).optional().describe('Max 50, default 20.'),
        offset:                   z.number().int().min(0).optional().describe('For pagination, default 0.'),
      },
      { title: 'Search UK funding', readOnlyHint: true },
      async (raw) => {
        const auth = authStore.getStore()
        const ctx: AdapterContext = {
          utm_source: auth?.utm_source ?? 'mcp_anonymous',
          tool: 'search',
        }
        const params: MCPSearchParams = {
          query:                   raw.query,
          funding_type:            raw.funding_type as MCPFundingType[] | undefined,
          region:                  raw.region as MCPRegion[] | undefined,
          sector:                  raw.sector,
          structure:               raw.structure,
          amount_min:              raw.amount_min,
          amount_max:              raw.amount_max,
          deadline_within_days:    raw.deadline_within_days,
          include_rolling:         raw.include_rolling,
          beneficiary_group:       raw.beneficiary_group,
          funder_type:             raw.funder_type,
          exclude_unverified_urls: raw.exclude_unverified_urls,
          limit:                   raw.limit,
          offset:                  raw.offset,
        }

        // Free-tier monthly allowance. Consumed BEFORE the search runs, so an
        // exhausted caller costs a Redis INCR rather than a catalogue query.
        // Exhaustion is a normal tool response, not an error: the model should
        // relay it to the user as information, and an isError result would
        // instead read as a fault and invite a retry loop.
        let freeQuota: SearchQuotaResult | null = null
        if (!isPaidTier(auth?.tier)) {
          const quota = await consumeFreeSearchQuota(freeQuotaSubject(auth))
          freeQuota = quota
          if (!quota.allowed) {
            return {
              content: [{ type: 'text', text: JSON.stringify({
                quota_reached: {
                  // In this branch the allowance is spent by definition, so
                  // report the limit rather than the raw counter — the counter
                  // keeps climbing on refused calls and would otherwise say
                  // something like "76 of 75 used".
                  searches_used: quota.limit,
                  monthly_limit: quota.limit,
                  resets_on: quota.resets_on,
                },
                message: `This connection has used its ${quota.limit} free searches for this calendar month. The allowance resets on ${quota.resets_on}.`,
                upgrade_note: getErrorVariantNote('search_quota_reached'),
                attribution: ATTRIBUTION,
                rate_limit_status: rateLimitStatusForContext(auth),
              }) }],
            }
          }
        }

        let searchResults
        try {
          searchResults = await executeMCPSearch(params, ctx)
        } catch (err) {
          console.error('[mcp] search failed:', err)
          return {
            content: [{ type: 'text', text: JSON.stringify({
              error: { code: 'internal_error', message: `Search failed. Please retry; if this persists, contact ${MCP_CONTACT_EMAIL}.` },
              attribution: ATTRIBUTION,
              rate_limit_status: rateLimitStatusForContext(auth),
            }) }],
            isError: true,
          }
        }

        const isZero = searchResults.total_matching === 0
        let zero_result_diagnostic
        if (isZero) {
          try {
            zero_result_diagnostic = await computeZeroResultDiagnostic(params, ctx)
          } catch {
            zero_result_diagnostic = {
              likely_cause: 'data_gap' as const,
              explanation: 'No opportunities matched and adjacent-suggestion computation failed.',
              adjacent_suggestions: [],
            }
          }
        }

        // Build query_summary block — record which filters were applied
        const filters_applied: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(params)) {
          if (v !== undefined && v !== null && (Array.isArray(v) ? v.length > 0 : true)) {
            filters_applied[k] = v
          }
        }

        const body: Record<string, unknown> = {
          results: searchResults.results,
          total_matching: searchResults.total_matching,
          returned: searchResults.returned,
          query_summary: {
            filters_applied,
            result_quality: searchResults.result_quality,
          },
          upgrade_note: isZero
            ? getUpgradeNote('search_funding_and_support', 'zero_result')
            : getUpgradeNote('search_funding_and_support', 'standard'),
          attribution: ATTRIBUTION,
          rate_limit_status: rateLimitStatusForContext(auth),
          // Hard constraint 4: a restriction is declared, never silent. A free
          // caller learning about the allowance only at the moment it runs out
          // IS silent, so the remaining count rides on every free search.
          // Omitted entirely when unenforced (no Upstash), because reporting
          // "0 used" during a fail-open outage would be a lie.
          ...(freeQuota?.enforced
            ? {
                search_quota: {
                  searches_used: freeQuota.used,
                  monthly_limit: freeQuota.limit,
                  searches_remaining: Math.max(0, freeQuota.limit - freeQuota.used),
                  resets_on: freeQuota.resets_on,
                },
              }
            : {}),
        }
        if (isZero && zero_result_diagnostic) {
          body.zero_result_diagnostic = zero_result_diagnostic
        }

        // Best-effort query log (params + result counts) for usage analytics
        // and zero-result diagnosis. Guarded internally; never blocks/breaks
        // the response.
        await logMcpQuery(auth, {
          tool:           'search',
          filters:        filters_applied,
          query_text:     params.query ?? null,
          total_matching: searchResults.total_matching,
          returned:       searchResults.returned,
          result_quality: searchResults.result_quality,
          is_zero:        isZero,
        })

        return {
          content: [{ type: 'text', text: JSON.stringify(body) }],
        }
      },
    )

    // get_opportunity_detail — spec §4.2 + §8.2
    server.tool(
      'get_opportunity_detail',
      // Description verbatim from spec §8.2
      `Get the full picture on a specific funding opportunity, including eligibility,\nscope, application process, and funder context. Returns URL-validated,\ndeadline-tracked detail from the ${MCP_BRAND_NAME} catalogue.\n\nWHEN TO USE:\n- The user has identified an opportunity (from search_funding_and_support or\n  by name) and wants more detail\n- You need richer information than search results provide to help the user\n  decide whether to apply\n- The user asks "tell me more about [opportunity title]"\n\nWHEN NOT TO USE:\n- For listing or filtering opportunities, use search_funding_and_support\n- For understanding a funder's broader work beyond a single opportunity, use\n  get_provider_intelligence\n\nPRESENTING THE DETAIL TO THE USER — REQUIRED:\n- The **direct funder URL (application.apply_url) is the primary link**.\n  That's what the user clicks to apply, verify the deadline on the\n  funder's own page, and read source eligibility text. Lead with it.\n- grant_tracker_url is the catalogue's own detail view for this\n  opportunity, where full eligibility criteria can be checked. It is\n  available if the user wants it; apply_url stays the primary citation.\n- When you state the deadline, eligibility, amount range, or application\n  route, cite the funder's apply_url so the user can verify on the source.\n  Don't paraphrase loosely. The catalogue is the source of truth; the\n  funder's site is the authority.\n\nCOMPOSABLE PATTERNS:\n- search → get_opportunity_detail is the standard discovery path\n- The funder_summary block in the response gives you brief funder context\n  inline. If the user wants the funder's full priorities and approach, call\n  get_provider_intelligence separately\n- The eligibility.eligible_structures field tells you which organisational\n  structures qualify. Cross-reference with what the user has told you about\n  their org\n\nDATA QUALITY NOTES:\n- The metadata.data_freshness field signals whether the opportunity's URL\n  has been verified ("verified") or not ("unverified"). Caveat to the user\n  if unverified.\n- The application.process_summary describes the basic application process.\n  Curated guidance on what makes a strong application is available in the\n  ${MCP_BRAND_NAME} app, not via this tool.\n\nSOURCE:\nThis opportunity is in the ${MCP_BRAND_NAME} catalogue. The primary citation\nis the funder's apply_url.`,
      {
        opportunity_id:         z.string().uuid().describe('UUID of the opportunity (from a search result).'),
        include_funder_summary: z.boolean().optional().describe('Include the inline brief funder section. Default true.'),
      },
      { title: 'Funding opportunity detail', readOnlyHint: true },
      async ({ opportunity_id, include_funder_summary }) => {
        const auth = authStore.getStore()
        const ctx: AdapterContext = {
          utm_source: auth?.utm_source ?? 'mcp_anonymous',
          tool: 'opportunity_detail',
        }

        const sb = serviceClient()
        const { data, error } = await sb
          .from('scraped_grants')
          .select('*')
          .eq('id', opportunity_id)
          .eq('is_active', true)
          .maybeSingle()

        if (error) {
          console.error('[mcp] opportunity detail lookup failed:', error.message)
          return {
            content: [{ type: 'text', text: JSON.stringify({
              error: { code: 'internal_error', message: `Could not load this opportunity. Please retry; if this persists, contact ${MCP_CONTACT_EMAIL}.` },
              attribution: ATTRIBUTION,
              rate_limit_status: rateLimitStatusForContext(auth),
            }) }],
            isError: true,
          }
        }
        if (!data) {
          return {
            content: [{ type: 'text', text: JSON.stringify({
              error: { code: 'not_found', message: `No active opportunity with id ${opportunity_id}.` },
              attribution: ATTRIBUTION,
              rate_limit_status: rateLimitStatusForContext(auth),
            }) }],
            isError: true,
          }
        }

        const detail = toMCPOpportunityDetail(
          data as ScrapedGrantRow,
          { include_funder_summary: include_funder_summary ?? true },
          ctx,
        )

        const body = {
          ...detail,
          attribution: ATTRIBUTION,
          rate_limit_status: rateLimitStatusForContext(auth),
          upgrade_note: getUpgradeNote('get_opportunity_detail', 'standard'),
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(body) }],
        }
      },
    )

    // get_provider_intelligence — spec §4.3 + §8.3
    server.tool(
      'get_provider_intelligence',
      // Description verbatim from spec §8.3
      `Get intelligence on a UK funder, investor, programme operator, or in-kind\nsupport provider — their priorities, what they fund, who can apply, and\ntheir currently active opportunities. Curated by ${MCP_BRAND_NAME}; depth\nvaries per provider.\n\nWHEN TO USE:\n- The user wants to understand whether a specific funder is right for them\n- The user is researching a funder's priorities before applying\n- After search_funding_and_support, when the user is interested in a specific\n  funder behind an opportunity\n- The user asks "what does [funder name] fund?" or "is [funder] a good fit?"\n\nWHEN NOT TO USE:\n- To search for funding opportunities, use search_funding_and_support\n- For details on a specific opportunity, use get_opportunity_detail\n\nPRESENTING TO THE USER — REQUIRED:\n- The **funder's own website (funder_url) is the primary link** when the\n  user wants to research the funder directly. Lead with it.\n- When listing the provider's active opportunities, lead with the apply_url\n  for each opportunity so the user can verify and apply directly at the\n  source.\n- If provider.data_richness is "basic" rather than "enriched", say so to\n  the user — it tells them how confident the profile is.\n\nCOMPOSABLE PATTERNS:\n- Pass either provider_name (case-insensitive) OR opportunity_id (cleaner —\n  gets the provider behind a specific opportunity)\n- The active_opportunities.opportunity_ids field returns IDs for all currently\n  open opportunities from this provider. Use get_opportunity_detail to drill\n  into any of them\n- search → get_provider_intelligence → review their other active opportunities\n  is a common workflow\n\nDATA QUALITY NOTES:\n- The provider.data_richness field signals whether this provider has been\n  enriched with curated data ("enriched") or only has basic information\n  ("basic"). Enrichment depth varies by provider type. For "basic" providers,\n  the funder_brief content (what_they_fund, who_can_apply, priorities, etc.)\n  is still substantial — it's the curated insider guidance that's restricted\n  to the app.\n- Provider names are matched case-insensitively. If exact-name matching\n  fails, the opportunity_id entry point is more reliable.\n\nSOURCE:\nFunder intelligence is curated and maintained by ${MCP_BRAND_NAME}. The link\nto surface is the funder's own site (funder_url).`,
      {
        provider_name:  z.string().optional().describe('Case-insensitive match against the provider name. Provide either this or opportunity_id.'),
        opportunity_id: z.string().uuid().optional().describe('UUID of an opportunity from this provider. Cleaner than name-matching when available.'),
      },
      { title: 'Funder intelligence', readOnlyHint: true },
      async ({ provider_name, opportunity_id }) => {
        const auth = authStore.getStore()

        // Validate: exactly one entry point
        if ((!provider_name && !opportunity_id) || (provider_name && opportunity_id)) {
          return {
            content: [{ type: 'text', text: JSON.stringify({
              error: { code: 'invalid_parameter', message: 'Provide exactly one of provider_name or opportunity_id.' },
              attribution: ATTRIBUTION,
              rate_limit_status: rateLimitStatusForContext(auth),
            }) }],
            isError: true,
          }
        }

        const sb = serviceClient()

        // Resolve to a provider name
        let resolved_name: string | null = provider_name?.trim() || null
        if (opportunity_id) {
          const { data: opp } = await sb
            .from('scraped_grants')
            .select('funder')
            .eq('id', opportunity_id)
            .eq('is_active', true)
            .maybeSingle()
          if (!opp || !opp.funder) {
            return {
              content: [{ type: 'text', text: JSON.stringify({
                error: { code: 'not_found', message: `No active opportunity with id ${opportunity_id}.` },
                attribution: ATTRIBUTION,
                rate_limit_status: rateLimitStatusForContext(auth),
              }) }],
              isError: true,
            }
          }
          resolved_name = (opp as { funder: string }).funder
        }
        if (!resolved_name) {
          return {
            content: [{ type: 'text', text: JSON.stringify({
              error: { code: 'invalid_parameter', message: 'Provider name resolved to empty.' },
              attribution: ATTRIBUTION,
              rate_limit_status: rateLimitStatusForContext(auth),
            }) }],
            isError: true,
          }
        }

        // Pull all active opportunities matching this funder name (case-insensitive)
        const { data: oppsRaw, error: oppsErr } = await sb
          .from('scraped_grants')
          .select('*')
          .eq('is_active', true)
          .ilike('funder', resolved_name)
          .order('last_seen_at', { ascending: false })
        if (oppsErr) {
          return {
            content: [{ type: 'text', text: JSON.stringify({
              error: { code: 'internal_error', message: oppsErr.message },
              attribution: ATTRIBUTION,
              rate_limit_status: rateLimitStatusForContext(auth),
            }) }],
            isError: true,
          }
        }
        const active_opps = (oppsRaw ?? []) as ScrapedGrantRow[]
        if (active_opps.length === 0) {
          return {
            content: [{ type: 'text', text: JSON.stringify({
              error: { code: 'not_found', message: `No active opportunities found for provider "${resolved_name}".` },
              attribution: ATTRIBUTION,
              rate_limit_status: rateLimitStatusForContext(auth),
            }) }],
            isError: true,
          }
        }

        // Representative brief = latest opportunity's funder_brief (post-sort above)
        const representative_brief = active_opps[0].funder_brief ?? null

        // Try to match into curated funders table (case-insensitive name OR short_name)
        const lower = resolved_name.toLowerCase()
        const { data: fundersRaw } = await sb
          .from('funders')
          .select('*')
          .or(`name.ilike.${resolved_name},short_name.ilike.${resolved_name}`)
        const funder_row = ((fundersRaw ?? []) as FunderRow[]).find(f =>
          (f.name && f.name.toLowerCase() === lower) ||
          (f.short_name && f.short_name.toLowerCase() === lower)
        ) ?? null

        const intelligence = toMCPProviderIntelligence({
          provider_name: resolved_name,
          representative_brief,
          funder_row,
          active_opportunities: active_opps,
        })

        const upgrade_variant = intelligence.provider.data_richness === 'enriched' ? 'enriched' : 'basic'
        const body = {
          ...intelligence,
          attribution: ATTRIBUTION,
          rate_limit_status: rateLimitStatusForContext(auth),
          upgrade_note: getUpgradeNote('get_provider_intelligence', upgrade_variant),
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(body) }],
        }
      },
    )

    // Tier ladder. Free keeps exactly the five catalogue tools; Apply adds the
    // three pipeline tools; Adviser adds the goal-agent tools on top. Because
    // tools/list is built from what each handler registers, the advertised tool
    // list is the entitlement — a caller is never shown a tool it would be
    // refused for calling.
    if (surface === 'apply' || surface === 'companion') registerPipelineTools(server)
    if (surface === 'companion') registerGoalAgentTools(server)
  },
  // Server options — mcp-handler extends the SDK's ServerOptions with serverInfo
  { serverInfo: MCP_SERVER_INFO },
  // Handler config — basePath drives endpoint URL derivation inside the SDK
  { basePath: '/api/mcp/v1', maxDuration: 60 },
  )
}

// Three handlers built once at module load, one per rung of the tier ladder.
// Free is unchanged: the same five catalogue tools and serverInfo it has always
// had. Apply now adds the three pipeline tools TIER_TOOLS always granted it but
// which no reachable handler registered. Adviser adds the goal-agent tools.
// handle() picks one from the resolved tier.
const freeHandler = buildHandler('free')
const applyHandler = buildHandler('apply')
const companionHandler = buildHandler('companion')

// API-key callers have no resolved tier (tier resolution is OAuth-only), so
// they fall through to free — unchanged behaviour, and the reason an API key
// cannot reach a paid tool no matter who issued it.
function handlerForTier(tier: MCPAuthContext['tier']) {
  if (tier === 'companion') return companionHandler
  if (tier === 'apply') return applyHandler
  return freeHandler
}

// ──────────────────────────────────────────────────────────────────────────
// Route handlers
// ──────────────────────────────────────────────────────────────────────────
// Streamable HTTP uses POST for client→server messages and GET for the
// server-sent-events channel back. Both methods route through the same
// handler; the SDK chooses the right behaviour by method.

// RS metadata pointer for the WWW-Authenticate challenge. RFC 9728 + MCP
// spec: a 401 response advertises the protected-resource metadata URL so
// an OAuth-aware client can discover the authorization server and start
// the flow.
const WWW_AUTHENTICATE_VALUE =
  `Bearer realm="${MCP_SERVER_SLUG}", ` +
  `resource_metadata="${MCP_PUBLIC_ORIGIN}/.well-known/oauth-protected-resource"`

function unauthorisedResponse(reason: 'invalid_token' | 'revoked_token' | 'no_credentials'): NextResponse {
  const message = (() => {
    if (reason === 'revoked_token')   return 'Token has been revoked. Re-authorise via OAuth or use a new API key.'
    if (reason === 'invalid_token')   return 'Token is invalid or expired. Re-authorise via OAuth or use a new API key.'
    // No article before the brand name — it varies, and "a/an" can't be
    // hardcoded correctly across every value.
    return `Authorization required. MCP clients should follow the OAuth flow advertised in WWW-Authenticate; developers can use an MCP key from ${MCP_APP_HOST}/mcp.`
  })()
  return NextResponse.json({
    error: {
      code:    'auth_required',
      message,
      details: { reason },
    },
    attribution: ATTRIBUTION,
  }, {
    status: 401,
    headers: { 'WWW-Authenticate': WWW_AUTHENTICATE_VALUE },
  })
}

async function handle(req: NextRequest): Promise<Response> {
  const authCtx = await validateMCPRequest(req)

  // OAuth-aware 401: every unauthenticated request gets a challenge
  // pointing at the RS metadata. The anonymous free-tier was removed
  // 2026-05-21 because Claude Desktop's connector probe needs a 401 +
  // WWW-Authenticate to discover OAuth — a 200 response with anonymous
  // rate-limit headers caused Desktop to silently skip OAuth and stay
  // anonymous. Trade-off: callers must either OAuth or use a gt_mcp_ key.
  if (authCtx.state === 'anonymous') return unauthorisedResponse('no_credentials')
  if (authCtx.state === 'invalid')   return unauthorisedResponse('invalid_token')
  if (authCtx.state === 'revoked')   return unauthorisedResponse('revoked_token')

  // Resolve org + tier BEFORE the rate limiter. This ordering is the whole
  // prerequisite for tier-aware limits: the hourly ceiling and the free search
  // quota both key off ctx.tier, and until this moved above enforcement, tier
  // was always undefined at limit time and every caller was metered the same.
  // API-key callers have no OAuth identity and stay untiered, hence free.
  if (authCtx.oauth) {
    const resolved = await resolveOrgAndTier(authCtx.oauth.user_id)
    authCtx.orgId = resolved.orgId
    authCtx.orgName = resolved.orgName
    authCtx.tier = resolved.tier
  }

  // Rate-limit enforcement (spec §6.3 + §6.4). Returns live remaining
  // counts that tool handlers surface in rate_limit_status. When blocked,
  // returns spec §5.4 rate_limit_exceeded error with Retry-After header.
  const rl = await enforceRateLimits(authCtx)
  authCtx.rate_limit_status = rl.status

  if (!rl.allowed) {
    const retrySeconds = rl.retry_after ?? 60
    const which: string = rl.which_limit ?? 'unknown'
    const message = (() => {
      if (which === 'key_hourly') {
        return `Hourly rate limit reached on this connection. Retry after ${retrySeconds} seconds.`
      }
      if (which === 'key_daily') {
        return `Daily rate limit reached on this API key. Retry after ${retrySeconds} seconds.`
      }
      if (which === 'ip_hourly') {
        return `Per-IP rate limit reached (5,000/hr). Retry after ${retrySeconds} seconds.`
      }
      return `Rate limit reached. Retry after ${retrySeconds} seconds.`
    })()
    const upgrade_note = getErrorVariantNote('rate_limit_exceeded')
    return NextResponse.json({
      error: {
        code: 'rate_limit_exceeded',
        message,
        details: { which_limit: which },
      },
      attribution: ATTRIBUTION,
      rate_limit_status: rl.status,
      ...(upgrade_note ? { upgrade_note } : {}),
    }, {
      status: 429,
      headers: { 'Retry-After': String(retrySeconds) },
    })
  }

  // Protocol-era capture. Placed after the rate limiter so it inherits both the
  // auth gate and the throttle — an unauthenticated flood 401s above and never
  // reaches here, so this cannot become a write-amplification path. Awaited but
  // internally guarded: emitEvent never throws into the request path. Now sits
  // after tier resolution too, so the event carries a real org rather than null.
  const protocolVersion = req.headers.get('mcp-protocol-version')
  await emitEvent(
    { surface: 'mcp', orgId: authCtx.orgId ?? null, userId: authCtx.oauth?.user_id ?? null },
    'mcp_request_received',
    {
      protocol_version: protocolVersion,
      protocol_era: classifyProtocolEra(protocolVersion),
      auth_state: authCtx.state,
    },
  )

  const handler = handlerForTier(authCtx.tier)
  return authStore.run(authCtx, () => handler(req))
}

export const POST = handle
export const GET = handle
export const DELETE = handle  // SDK uses DELETE for session termination in some flows

// Grant Tracker MCP server — Streamable HTTP transport, JSON-RPC.
// Endpoint: /api/mcp/v1
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
import { NextRequest } from 'next/server'
import { AsyncLocalStorage } from 'async_hooks'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { validateMCPRequest, type MCPAuthContext } from '@/lib/mcp-middleware'
import { getMCPTaxonomy, getAllMCPTaxonomies, type MCPTaxonomyName } from '@/lib/opportunity-adapter'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Async-local store for the per-request auth context. Tool handlers don't
// receive the original Request, so we thread auth through this instead.
const authStore = new AsyncLocalStorage<MCPAuthContext>()

const ATTRIBUTION = {
  source: 'Grant Tracker',
  source_url: 'https://granttracker.co.uk',
  data_provenance: 'UK funding catalogue maintained by Grant Tracker',
  license: 'Free to surface to end users with attribution',
} as const

// Per-tier rate limits from spec §6.3. Step 3 will return live remaining
// counts instead of these static maxima — response shape unchanged.
function rateLimitStatusForContext(ctx: MCPAuthContext | undefined) {
  const state = ctx?.state ?? 'anonymous'
  if (state === 'authenticated') {
    return { remaining_hour: 100, remaining_day: 1000 }
  }
  return { remaining_hour: 10, remaining_day: null }
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

const mcpHandler = createMcpHandler(
  (server) => {
    // health_check — spec §4.5 + §8.5
    server.tool(
      'health_check',
      // Description verbatim from spec §8.5
      `Check Grant Tracker MCP server availability and version. Returns server\nstatus and the timestamp of the most recent catalogue update.\n\nUse this for diagnostic purposes only. Not relevant for user-facing\nfunding queries.`,
      {},  // no parameters
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
          version: '1.0.0',
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
      `Look up Grant Tracker's controlled vocabularies for sectors, regions,\norganisational structures, funding types, and beneficiary groups. Useful\nwhen the user describes their work or organisation in free text and you\nneed to translate to the right filter values for search_funding_and_support.\n\nWHEN TO USE:\n- Before calling search_funding_and_support, when the user's description\n  doesn't map obviously to a structured filter value\n- To present the user with available options ("which of these sectors\n  matches your work?")\n- To verify a filter value you're about to use is supported\n\nWHEN NOT TO USE:\n- For substantive funding questions, use search_funding_and_support\n- This is a reference tool, not a discovery tool — it returns vocabulary,\n  not opportunities\n\nCOMPOSABLE PATTERNS:\n- get_taxonomy → search_funding_and_support is the standard pattern when\n  translating free text to structured filters\n- Pass a specific taxonomy parameter (e.g., taxonomy="sectors") to get one\n  list, or omit to get all taxonomies in one call\n\nDATA QUALITY NOTES:\n- Returned values are the canonical taxonomy. Matching is case-insensitive\n  and tolerant of common variants in search_funding_and_support, but using\n  canonical values gives the cleanest results.\n\nATTRIBUTION:\nTaxonomies maintained by Grant Tracker (granttracker.co.uk).`,
      {
        taxonomy: z
          .enum(['sectors', 'regions', 'structures', 'funding_types', 'beneficiary_groups', 'funder_types'])
          .optional()
          .describe('Single taxonomy to fetch. Omit to return all six.'),
      },
      async ({ taxonomy }) => {
        const auth = authStore.getStore()
        const taxonomies = taxonomy
          ? { [taxonomy]: getMCPTaxonomy(taxonomy as MCPTaxonomyName) }
          : getAllMCPTaxonomies()
        const body = {
          taxonomies,
          attribution: ATTRIBUTION,
          rate_limit_status: rateLimitStatusForContext(auth),
          // upgrade_note: minimal per spec §5.3 (this is a reference tool).
          // Final wording owned by Paul during build week; placeholder shape
          // for now so the spec contract is intact end-to-end.
          upgrade_note: 'Personalised matching against your organisation’s profile, save-to-pipeline, and deadline alerts are available in the Grant Tracker web app at granttracker.co.uk.',
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(body) }],
        }
      },
    )
  },
  // Server options — mcp-handler extends the SDK's ServerOptions with serverInfo
  { serverInfo: { name: 'grant-tracker-mcp', version: '1.0.0' } },
  // Handler config — basePath drives endpoint URL derivation inside the SDK
  { basePath: '/api/mcp/v1', maxDuration: 60 },
)

// ──────────────────────────────────────────────────────────────────────────
// Route handlers
// ──────────────────────────────────────────────────────────────────────────
// Streamable HTTP uses POST for client→server messages and GET for the
// server-sent-events channel back. Both methods route through the same
// handler; the SDK chooses the right behaviour by method.

async function handle(req: NextRequest): Promise<Response> {
  const authCtx = await validateMCPRequest(req)
  // STEP 3 HOOK: rate-limit enforcement goes here (Redis-backed). If over
  // limit, return spec §5.4 rate_limit_exceeded error before invoking the
  // MCP handler.
  return authStore.run(authCtx, () => mcpHandler(req))
}

export const POST = handle
export const GET = handle
export const DELETE = handle  // SDK uses DELETE for session termination in some flows

// Per-call MCP query log. Writes one row per search to public.mcp_query_log
// (params snapshot + result counts + caller identity) for usage analytics and
// zero-result diagnosis. Service-role write — never throws into the request
// path; a logging failure must not break a search response.
//
// Schema: supabase/migrations/023_mcp_query_log.sql

import { createClient } from '@supabase/supabase-js'
import type { MCPAuthContext } from './mcp-middleware'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export interface McpQueryLogEntry {
  tool: string
  /** filters_applied snapshot — the structured params actually in effect. */
  filters: Record<string, unknown>
  /** Free-text params.query, or null when the caller passed none. */
  query_text?: string | null
  total_matching: number
  returned: number
  result_quality?: string | null
  is_zero: boolean
}

/**
 * Fire-and-await insert of one query-log row. Awaited (not detached) so the
 * write actually flushes in the serverless function before it returns, but
 * fully guarded — any failure is swallowed so logging can never turn a good
 * search into an error.
 */
export async function logMcpQuery(
  auth: MCPAuthContext | undefined,
  entry: McpQueryLogEntry,
): Promise<void> {
  try {
    const sb = getServiceClient()
    await sb.from('mcp_query_log').insert({
      tool:            entry.tool,
      channel:         auth?.utm_source ?? 'mcp_anonymous',
      auth_state:      auth?.state ?? 'anonymous',
      api_key_id:      auth?.key?.id ?? null,
      oauth_client_id: auth?.oauth?.client_id ?? null,
      oauth_user_id:   auth?.oauth?.user_id ?? null,
      ip:              auth?.ip ?? null,
      query_text:      entry.query_text ?? null,
      params:          entry.filters,
      result_count:    entry.total_matching,
      returned:        entry.returned,
      result_quality:  entry.result_quality ?? null,
      is_zero:         entry.is_zero,
    })
  } catch {
    // Logging is best-effort. Never propagate into the request path.
  }
}

// Grant Tracker MCP — request validation middleware.
// Used by every MCP route handler (search, opportunity_detail, etc.) to
// extract auth context. Spec: docs/mcp-spec-v1.md §6.
//
// V1 scope: extract + validate API key, classify as authenticated /
// anonymous / invalid, return auth context with utm_source for downstream
// URL building. Rate-limit enforcement is wired in at step 3 (Redis); this
// module provides the auth context that step 3 will gate on.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hashApiKey, type ApiKeyRecord } from './mcp-auth'
import {
  OAUTH_ACCESS_TOKEN_PREFIX,
  resolveAccessToken,
  type ResolvedAccessToken,
} from './mcp-oauth'
import type { Tier } from './agent/tools/types'

export type MCPAuthState = 'authenticated' | 'anonymous' | 'invalid' | 'revoked'

export interface MCPAuthContext {
  state: MCPAuthState
  /** Set only on the bearer-key path (gt_mcp_…). Null for OAuth and anonymous. */
  key: ApiKeyRecord | null
  /**
   * Set only on the OAuth path (gt_oat_…). Null for bearer-key and anonymous.
   * Carries the resolved user / client / scope so tool handlers can do
   * per-user behaviour without re-querying the tokens table.
   */
  oauth: ResolvedAccessToken | null
  ip: string
  /**
   * Per-API-key utm_source from the key record, or 'mcp_anonymous' for
   * unauthenticated requests, or 'mcp_oauth' for OAuth-authenticated
   * requests. Used by the adapter when building grant_tracker_url. Spec
   * §7.2/§7.3.
   */
  utm_source: string
  /**
   * Live rate-limit status populated by the step 3 enforcement layer
   * (src/lib/mcp-rate-limit.ts). When undefined, callers fall back to
   * static maxima from spec §6.3. Tools should always prefer this when
   * present so the response reflects live counters.
   */
  rate_limit_status?: { remaining_hour: number; remaining_day: number | null }
  /**
   * Resolved org + tier for the companion (goal-agent) surface. Populated in
   * the MCP route AFTER validation, only on the OAuth path (resolveOrgAndTier).
   * `tier` decides which tool handler serves the request; `orgId` becomes
   * ToolContext.orgId. Undefined for API-key callers, who keep the free surface.
   */
  orgId?: string | null
  orgName?: string | null
  tier?: Tier
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// Vercel-style X-Forwarded-For parsing. First entry is the real client IP.
function extractClientIP(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}

/**
 * Validates the inbound request's auth state. Does NOT enforce rate limits —
 * that's step 3 (Redis), built on top of this context.
 *
 * Returns:
 *   - state='authenticated' with key set → request has a valid active API key
 *   - state='revoked' with key set → key exists but was revoked
 *   - state='invalid' → Authorization header present but key doesn't match
 *   - state='anonymous' → no Authorization header
 */
export async function validateMCPRequest(req: NextRequest): Promise<MCPAuthContext> {
  const ip = extractClientIP(req)
  const authHeader = req.headers.get('authorization')

  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return { state: 'anonymous', key: null, oauth: null, ip, utm_source: 'mcp_anonymous' }
  }

  const rawToken = authHeader.slice(7).trim()

  // ── OAuth path: gt_oat_… access tokens ──────────────────────────────────
  if (rawToken.startsWith(OAUTH_ACCESS_TOKEN_PREFIX)) {
    let resolved: ResolvedAccessToken | null
    try {
      resolved = await resolveAccessToken(rawToken)
    } catch {
      return { state: 'invalid', key: null, oauth: null, ip, utm_source: 'mcp_anonymous' }
    }
    if (!resolved) {
      // Could be revoked, expired, or never-existed — we don't distinguish.
      // The tool handler returns 401 + WWW-Authenticate either way.
      return { state: 'invalid', key: null, oauth: null, ip, utm_source: 'mcp_anonymous' }
    }
    return { state: 'authenticated', key: null, oauth: resolved, ip, utm_source: 'mcp_oauth' }
  }

  // ── Bearer-key path: gt_mcp_… developer keys ────────────────────────────
  if (!rawToken.startsWith('gt_mcp_')) {
    return { state: 'invalid', key: null, oauth: null, ip, utm_source: 'mcp_anonymous' }
  }

  const hash = hashApiKey(rawToken)
  const supabase = getServiceClient()
  const { data } = await supabase
    .from('api_keys')
    .select('*')
    .eq('key_hash', hash)
    .maybeSingle()

  if (!data) {
    return { state: 'invalid', key: null, oauth: null, ip, utm_source: 'mcp_anonymous' }
  }
  const key = data as ApiKeyRecord
  if (key.status === 'revoked') {
    return { state: 'revoked', key, oauth: null, ip, utm_source: 'mcp_anonymous' }
  }

  // Fire-and-forget last_used_at update — failure doesn't block the request
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', key.id)
    .then(() => undefined, () => undefined)

  return { state: 'authenticated', key, oauth: null, ip, utm_source: key.utm_source }
}

/**
 * Standard error response for auth failures. Spec §5.4 + §6.2.
 */
export function authRequiredResponse(state: MCPAuthState): NextResponse {
  const messages: Record<MCPAuthState, string> = {
    authenticated: 'No error',
    anonymous:     'Anonymous request limit reached. Get a free API key at granttracker.co.uk/mcp to continue.',
    invalid:       'API key not recognised. Check the value or request a new key at granttracker.co.uk/mcp.',
    revoked:       'API key has been revoked. Contact hello@granttracker.co.uk if you believe this is in error.',
  }
  return NextResponse.json({
    error: {
      code: 'auth_required',
      message: messages[state],
    },
    attribution: {
      source: 'Grant Tracker',
      source_url: 'https://granttracker.co.uk',
      data_provenance: 'UK funding catalogue maintained by Grant Tracker',
      license: 'Free to surface to end users with attribution',
    },
  }, { status: 401 })
}

// Grant Tracker MCP — OAuth 2.0 + Dynamic Client Registration support.
// Spec §6 (revised 2026-05-21 for Anthropic Connectors Directory submission).
//
// Coexists with bearer-key auth via prefix-based routing in mcp-middleware:
//   gt_mcp_…  → existing api_keys table (developer path)
//   gt_oat_…  → oauth_tokens table (OAuth client path, e.g. Claude Desktop)
//
// Session 1 (this file): DCR client store, redirect_uri validation, register
// rate-limit, hashing helpers. Authorize / token / refresh / revoke land in
// session 2 alongside the consent UI.

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────

export const OAUTH_ISSUER = 'https://www.granttracker.co.uk'
export const OAUTH_RESOURCE = 'https://www.granttracker.co.uk/api/mcp/v1/mcp'
export const OAUTH_SCOPES_SUPPORTED = ['read'] as const
export const OAUTH_ACCESS_TOKEN_PREFIX = 'gt_oat_'
export const OAUTH_REFRESH_TOKEN_PREFIX = 'gt_ort_'

// Hardening parameters — per the 2026-05-21 build decision
export const REGISTER_MAX_CLIENTS_PER_IP = 20
export const CLIENT_UNUSED_EXPIRY_DAYS = 60

// ──────────────────────────────────────────────────────────────────────────
// Rate limit — per-IP on /oauth/register (separate from MCP rate limit).
// 5/hour, sliding window. Falls back to "always allow" if Upstash env vars
// missing (dev), same pattern as mcp-rate-limit.ts.
// ──────────────────────────────────────────────────────────────────────────

let cachedRegisterLimiter: Ratelimit | null = null
let envWarned = false

function getRegisterLimiter(): Ratelimit | null {
  if (cachedRegisterLimiter) return cachedRegisterLimiter
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    if (!envWarned) {
      // eslint-disable-next-line no-console
      console.warn('[mcp-oauth] UPSTASH_REDIS_REST_URL/_TOKEN not set — /oauth/register rate limit disabled. OK in dev.')
      envWarned = true
    }
    return null
  }
  const redis = new Redis({ url, token })
  cachedRegisterLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1 h'),
    prefix:  'mcp:oauth:register',
    analytics: false,
  })
  return cachedRegisterLimiter
}

export interface RegisterRateLimitResult {
  allowed:     boolean
  retry_after: number | null
}

export async function enforceRegisterRateLimit(ip: string): Promise<RegisterRateLimitResult> {
  const limiter = getRegisterLimiter()
  if (!limiter) return { allowed: true, retry_after: null }
  const r = await limiter.limit(ip || 'unknown')
  if (r.success) return { allowed: true, retry_after: null }
  const retry_after = Math.max(1, Math.ceil((r.reset - Date.now()) / 1000))
  return { allowed: false, retry_after }
}

// ──────────────────────────────────────────────────────────────────────────
// redirect_uri validation
//
// Per RFC 6749 §3.1.2 plus Anthropic Connectors Directory expectations and
// our own hardening. In production:
//   - Must be a parseable absolute URL with https scheme
//   - Localhost / loopback / private IP ranges rejected
//   - No fragment component (per RFC)
//
// Localhost IS allowed in non-production for local Claude Desktop testing.
// ──────────────────────────────────────────────────────────────────────────

const PRIVATE_IPV4_PATTERNS = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^169\.254\./,                // link-local
  /^127\./,                     // loopback
  /^0\./,                       // 'this network'
]

function isPrivateOrLoopback(hostname: string): boolean {
  if (hostname === 'localhost') return true
  if (hostname === '::1' || hostname === '[::1]') return true
  if (hostname.startsWith('fc') || hostname.startsWith('fd')) return true   // IPv6 unique-local
  if (hostname.startsWith('fe80')) return true                              // IPv6 link-local
  if (PRIVATE_IPV4_PATTERNS.some(re => re.test(hostname))) return true
  return false
}

export interface RedirectUriValidation {
  ok:     boolean
  reason?: string
}

export function validateRedirectUri(uri: string, opts: { allowLocalhost?: boolean } = {}): RedirectUriValidation {
  let u: URL
  try {
    u = new URL(uri)
  } catch {
    return { ok: false, reason: 'redirect_uri must be a parseable absolute URL' }
  }
  if (u.hash) {
    return { ok: false, reason: 'redirect_uri must not contain a fragment' }
  }
  if (u.protocol !== 'https:' && !(opts.allowLocalhost && u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'))) {
    return { ok: false, reason: 'redirect_uri must use https (http allowed only for localhost in development)' }
  }
  if (!opts.allowLocalhost && isPrivateOrLoopback(u.hostname)) {
    return { ok: false, reason: 'redirect_uri host must be public (no localhost, loopback, or private IPs in production)' }
  }
  return { ok: true }
}

// ──────────────────────────────────────────────────────────────────────────
// Hashing helpers — never store raw tokens / codes
// ──────────────────────────────────────────────────────────────────────────

export function hashSecret(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

export function generateClientId(): string {
  return randomUUID()
}

export function generateClientSecret(): string {
  return randomBytes(32).toString('hex')
}

// ──────────────────────────────────────────────────────────────────────────
// Supabase client (service role) — used for OAuth table reads/writes
// ──────────────────────────────────────────────────────────────────────────

export function oauthServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Clients store
//
// Implements the shape of the SDK's OAuthRegisteredClientsStore (getClient,
// registerClient) but typed locally so we don't pin to internal SDK paths.
// ──────────────────────────────────────────────────────────────────────────

export interface RegisteredClient {
  client_id:                  string
  client_secret?:             string         // only returned on initial registration; never persisted
  client_secret_expires_at?:  number         // unix seconds; 0 = never
  client_id_issued_at:        number         // unix seconds
  client_name?:               string
  redirect_uris:              string[]
  grant_types:                string[]
  response_types:             string[]
  scope?:                     string
  token_endpoint_auth_method: string
  software_id?:               string
  software_version?:          string
}

export interface RegisterClientInput {
  client_name?:               string
  redirect_uris:              string[]
  grant_types?:               string[]
  response_types?:            string[]
  scope?:                     string
  token_endpoint_auth_method?: string
  software_id?:               string
  software_version?:          string
}

export async function countActiveClientsByIp(ip: string): Promise<number> {
  const sb = oauthServiceClient()
  const { count, error } = await sb
    .from('oauth_clients')
    .select('*', { count: 'exact', head: true })
    .eq('registered_by_ip', ip)
    .eq('status', 'active')
  if (error) throw new Error(`countActiveClientsByIp: ${error.message}`)
  return count ?? 0
}

export async function registerClient(input: RegisterClientInput, ip: string): Promise<RegisteredClient> {
  const sb = oauthServiceClient()

  const isPublic = (input.token_endpoint_auth_method ?? 'none') === 'none'
  const client_id        = generateClientId()
  const client_secret    = isPublic ? undefined : generateClientSecret()
  const client_secret_hash = client_secret ? hashSecret(client_secret) : null
  const nowSec           = Math.floor(Date.now() / 1000)
  const secretExpirySec  = isPublic ? null : nowSec + 30 * 24 * 60 * 60                       // 30 days
  const unusedExpiryISO  = new Date(Date.now() + CLIENT_UNUSED_EXPIRY_DAYS * 86_400_000).toISOString()

  const { error } = await sb.from('oauth_clients').insert({
    client_id,
    client_secret_hash,
    client_name:                input.client_name ?? null,
    redirect_uris:              input.redirect_uris,
    grant_types:                input.grant_types ?? ['authorization_code', 'refresh_token'],
    response_types:             input.response_types ?? ['code'],
    scope:                      input.scope ?? 'read',
    token_endpoint_auth_method: input.token_endpoint_auth_method ?? 'none',
    software_id:                input.software_id ?? null,
    software_version:           input.software_version ?? null,
    registered_by_ip:           ip,
    client_secret_expires_at:   secretExpirySec ? new Date(secretExpirySec * 1000).toISOString() : null,
    expires_at:                 unusedExpiryISO,
  })
  if (error) throw new Error(`registerClient: ${error.message}`)

  return {
    client_id,
    client_secret,
    client_secret_expires_at: secretExpirySec ?? (isPublic ? undefined : 0),
    client_id_issued_at:      nowSec,
    client_name:              input.client_name,
    redirect_uris:            input.redirect_uris,
    grant_types:              input.grant_types ?? ['authorization_code', 'refresh_token'],
    response_types:           input.response_types ?? ['code'],
    scope:                    input.scope ?? 'read',
    token_endpoint_auth_method: input.token_endpoint_auth_method ?? 'none',
    software_id:              input.software_id,
    software_version:         input.software_version,
  }
}

export async function getClient(clientId: string): Promise<RegisteredClient | null> {
  const sb = oauthServiceClient()
  const { data, error } = await sb
    .from('oauth_clients')
    .select('client_id, client_name, redirect_uris, grant_types, response_types, scope, token_endpoint_auth_method, software_id, software_version, client_id_issued_at, client_secret_expires_at, status')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw new Error(`getClient: ${error.message}`)
  if (!data || data.status !== 'active') return null
  return {
    client_id:                  data.client_id,
    client_id_issued_at:        Math.floor(new Date(data.client_id_issued_at).getTime() / 1000),
    client_secret_expires_at:   data.client_secret_expires_at ? Math.floor(new Date(data.client_secret_expires_at).getTime() / 1000) : 0,
    client_name:                data.client_name ?? undefined,
    redirect_uris:              data.redirect_uris,
    grant_types:                data.grant_types,
    response_types:             data.response_types,
    scope:                      data.scope ?? 'read',
    token_endpoint_auth_method: data.token_endpoint_auth_method,
    software_id:                data.software_id ?? undefined,
    software_version:           data.software_version ?? undefined,
  }
}

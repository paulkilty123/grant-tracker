// MCP — OAuth 2.0 + Dynamic Client Registration support.
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
import { brand } from '@/config/brand'

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────

export const OAUTH_ISSUER = brand.siteUrl
export const OAUTH_RESOURCE = `${brand.siteUrl}/api/mcp/v1/mcp`
export const OAUTH_SCOPES_SUPPORTED = ['read'] as const

// NOT brand-derived — do not rename on a rebrand. These prefixes are baked
// into the format of every OAuth access/refresh token already issued and
// stored in the oauth_tokens table; changing them would invalidate every
// credential a real MCP client currently holds.
export const OAUTH_ACCESS_TOKEN_PREFIX = 'gt_oat_'
export const OAUTH_REFRESH_TOKEN_PREFIX = 'gt_ort_'

// Hardening parameters — per the 2026-05-21 build decision
export const REGISTER_MAX_CLIENTS_PER_IP = 20
export const CLIENT_UNUSED_EXPIRY_DAYS = 60

// Lifetimes for the authorize / token flow
export const AUTH_CODE_LIFETIME_SEC      = 10 * 60       // 10 minutes (RFC 6749 §4.1.2 "short")
export const ACCESS_TOKEN_LIFETIME_SEC   = 60 * 60       // 1 hour
export const REFRESH_TOKEN_LIFETIME_SEC  = 30 * 24 * 60 * 60   // 30 days

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

// ──────────────────────────────────────────────────────────────────────────
// Authorize-time validation + code issuance
//
// validateAuthorizeRequest centralises the param checks for /oauth/authorize.
// It returns a discriminated union so the route can:
//   - render an in-app error when the redirect_uri can't be trusted
//     (unknown client_id, redirect_uri mismatch) — we never bounce in that
//     case because it would amount to an open redirect
//   - bounce back to redirect_uri with error= when the redirect_uri is OK
//     but other params are wrong (per RFC 6749 §4.1.2.1)
//   - on success, return the validated, narrowed params
// ──────────────────────────────────────────────────────────────────────────

export interface ValidatedAuthorizeParams {
  client:                RegisteredClient
  redirect_uri:          string
  scope:                 'read'
  state:                 string | null
  code_challenge:        string
  code_challenge_method: 'S256'
  resource:              string | null
}

export type AuthorizeValidation =
  | { ok: true;  params: ValidatedAuthorizeParams }
  | { ok: false; kind: 'fatal';    error: string; description: string }
  | { ok: false; kind: 'redirect'; redirect_uri: string; state: string | null; error: string; description: string }

interface AuthorizeRequestInput {
  client_id?:             string | null
  redirect_uri?:          string | null
  response_type?:         string | null
  scope?:                 string | null
  state?:                 string | null
  code_challenge?:        string | null
  code_challenge_method?: string | null
  resource?:              string | null
}

export async function validateAuthorizeRequest(input: AuthorizeRequestInput): Promise<AuthorizeValidation> {
  // 1. client_id present + active. Fatal on failure — never trust an
  //    attacker-supplied redirect_uri when the client lookup hasn't
  //    succeeded.
  if (!input.client_id) {
    return { ok: false, kind: 'fatal', error: 'invalid_client', description: 'Missing client_id.' }
  }
  let client: RegisteredClient | null
  try {
    client = await getClient(input.client_id)
  } catch (e) {
    return { ok: false, kind: 'fatal', error: 'server_error', description: e instanceof Error ? e.message : 'Client lookup failed.' }
  }
  if (!client) {
    return { ok: false, kind: 'fatal', error: 'invalid_client', description: 'Unknown or inactive client_id.' }
  }

  // 2. redirect_uri must exactly match one registered for the client.
  if (!input.redirect_uri) {
    return { ok: false, kind: 'fatal', error: 'invalid_redirect_uri', description: 'Missing redirect_uri.' }
  }
  if (!client.redirect_uris.includes(input.redirect_uri)) {
    return { ok: false, kind: 'fatal', error: 'invalid_redirect_uri', description: 'redirect_uri does not match any registered URI for this client.' }
  }
  const redirect_uri = input.redirect_uri
  const state = input.state ?? null

  // 3. From here, all errors can be bounced via redirect_uri.
  if (input.response_type !== 'code') {
    return { ok: false, kind: 'redirect', redirect_uri, state, error: 'unsupported_response_type', description: 'response_type must be "code".' }
  }
  const scope = (input.scope ?? 'read').trim() || 'read'
  if (scope.split(/\s+/).some(s => s !== 'read')) {
    return { ok: false, kind: 'redirect', redirect_uri, state, error: 'invalid_scope', description: "Only the 'read' scope is supported." }
  }
  if (!input.code_challenge) {
    return { ok: false, kind: 'redirect', redirect_uri, state, error: 'invalid_request', description: 'code_challenge is required (PKCE).' }
  }
  // We accept missing code_challenge_method ONLY if the caller is explicit
  // that they want S256 — we don't allow 'plain' silently.
  const method = input.code_challenge_method ?? 'S256'
  if (method !== 'S256') {
    return { ok: false, kind: 'redirect', redirect_uri, state, error: 'invalid_request', description: 'code_challenge_method must be S256.' }
  }
  // resource is optional in v1; if present, must match our canonical resource
  if (input.resource && input.resource !== OAUTH_RESOURCE) {
    return { ok: false, kind: 'redirect', redirect_uri, state, error: 'invalid_target', description: `resource must be ${OAUTH_RESOURCE}.` }
  }

  return {
    ok: true,
    params: {
      client,
      redirect_uri,
      scope: 'read',
      state,
      code_challenge:        input.code_challenge,
      code_challenge_method: 'S256',
      resource:              input.resource ?? null,
    },
  }
}

/**
 * Build an absolute redirect URL that carries OAuth params on the query
 * string. Preserves any pre-existing query the client put on its redirect_uri.
 */
export function buildRedirect(redirect_uri: string, params: Record<string, string | null | undefined>): string {
  const u = new URL(redirect_uri)
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') u.searchParams.set(k, v)
  }
  return u.toString()
}

/**
 * Issue an authorization code. Hashes the raw code with sha256 and inserts
 * the row bound to user / client / PKCE / redirect_uri / scope / resource
 * with a 10-minute TTL. Returns the raw code (caller passes it to the
 * client via redirect_uri).
 */
export async function issueAuthorizationCode(args: {
  user_id:               string
  client_id:             string
  redirect_uri:          string
  scope:                 'read'
  code_challenge:        string
  code_challenge_method: 'S256'
  resource:              string | null
}): Promise<string> {
  const raw_code  = randomBytes(32).toString('hex')
  const code_hash = hashSecret(raw_code)
  const sb        = oauthServiceClient()
  const expires_at = new Date(Date.now() + AUTH_CODE_LIFETIME_SEC * 1000).toISOString()
  const { error } = await sb.from('oauth_codes').insert({
    code_hash,
    client_id:             args.client_id,
    user_id:               args.user_id,
    redirect_uri:          args.redirect_uri,
    scope:                 args.scope,
    code_challenge:        args.code_challenge,
    code_challenge_method: args.code_challenge_method,
    resource:              args.resource,
    expires_at,
  })
  if (error) throw new Error(`issueAuthorizationCode: ${error.message}`)
  return raw_code
}

// ──────────────────────────────────────────────────────────────────────────
// Token issuance & validation
// ──────────────────────────────────────────────────────────────────────────

/**
 * base64url-encode a buffer (RFC 4648 §5) — no padding, +/ replaced with -_.
 */
function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/**
 * PKCE S256 verifier check: BASE64URL(SHA256(code_verifier)) == code_challenge.
 * Constant-time comparison so we don't leak the challenge via timing.
 */
export function verifyPkceS256(code_verifier: string, code_challenge: string): boolean {
  const expected = base64url(createHash('sha256').update(code_verifier, 'utf8').digest())
  if (expected.length !== code_challenge.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ code_challenge.charCodeAt(i)
  }
  return diff === 0
}

export type TokenIssueError =
  | { error: 'invalid_grant'; description: string }
  | { error: 'invalid_request'; description: string }
  | { error: 'invalid_client'; description: string }
  | { error: 'server_error'; description: string }

export interface ConsumedCode {
  user_id:  string
  scope:    string
  resource: string | null
}

/**
 * Atomically validate + mark-used the authorization code. Enforces:
 *  - the code exists and is unused (used_at is null)
 *  - not expired (expires_at > now)
 *  - bound to the same client_id and redirect_uri as the request
 *  - PKCE: BASE64URL(SHA256(code_verifier)) == stored code_challenge
 *
 * Single-use is enforced via an UPDATE … WHERE used_at IS NULL guard so two
 * concurrent /token calls can't both succeed with the same code.
 */
export async function consumeAuthorizationCode(args: {
  raw_code:      string
  client_id:     string
  redirect_uri:  string
  code_verifier: string
}): Promise<{ ok: true; data: ConsumedCode } | { ok: false; err: TokenIssueError }> {
  const code_hash = hashSecret(args.raw_code)
  const sb        = oauthServiceClient()

  // Mark the code used in a single statement and return the row. If used_at
  // is already non-null the UPDATE matches zero rows and we treat it as
  // invalid_grant (already used).
  const { data: updated, error: updateErr } = await sb
    .from('oauth_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('code_hash', code_hash)
    .is('used_at', null)
    .select('client_id, user_id, redirect_uri, scope, code_challenge, code_challenge_method, resource, expires_at')
    .maybeSingle()

  if (updateErr) {
    return { ok: false, err: { error: 'server_error', description: updateErr.message } }
  }
  if (!updated) {
    return { ok: false, err: { error: 'invalid_grant', description: 'Authorization code is invalid or has already been used.' } }
  }

  // Expiry check (read after update; if expired we still treat the code
  // as consumed — no recourse).
  if (new Date(updated.expires_at).getTime() < Date.now()) {
    return { ok: false, err: { error: 'invalid_grant', description: 'Authorization code has expired.' } }
  }

  if (updated.client_id !== args.client_id) {
    return { ok: false, err: { error: 'invalid_grant', description: 'Authorization code was issued to a different client.' } }
  }
  if (updated.redirect_uri !== args.redirect_uri) {
    return { ok: false, err: { error: 'invalid_grant', description: 'redirect_uri does not match the value used at /authorize.' } }
  }

  if (updated.code_challenge_method !== 'S256') {
    return { ok: false, err: { error: 'invalid_grant', description: 'Unsupported PKCE method on stored code.' } }
  }
  if (!verifyPkceS256(args.code_verifier, updated.code_challenge)) {
    return { ok: false, err: { error: 'invalid_grant', description: 'PKCE code_verifier does not match the stored challenge.' } }
  }

  return {
    ok: true,
    data: {
      user_id:  updated.user_id,
      scope:    updated.scope,
      resource: updated.resource,
    },
  }
}

export interface IssuedTokens {
  access_token:  string
  refresh_token: string
  expires_in:    number
  scope:         string
}

/**
 * Issue a fresh access + refresh token pair. Hashes both before storing.
 * Returns the raw values for the client.
 */
export async function issueTokens(args: {
  user_id:   string
  client_id: string
  scope:     string
  resource:  string | null
}): Promise<IssuedTokens> {
  const sb = oauthServiceClient()
  const raw_access  = OAUTH_ACCESS_TOKEN_PREFIX  + randomBytes(32).toString('hex')
  const raw_refresh = OAUTH_REFRESH_TOKEN_PREFIX + randomBytes(32).toString('hex')
  const access_expires_at  = new Date(Date.now() + ACCESS_TOKEN_LIFETIME_SEC  * 1000).toISOString()
  const refresh_expires_at = new Date(Date.now() + REFRESH_TOKEN_LIFETIME_SEC * 1000).toISOString()

  const { error } = await sb.from('oauth_tokens').insert({
    access_token_hash:  hashSecret(raw_access),
    refresh_token_hash: hashSecret(raw_refresh),
    token_prefix:       OAUTH_ACCESS_TOKEN_PREFIX,
    client_id:          args.client_id,
    user_id:            args.user_id,
    scope:              args.scope,
    resource:           args.resource,
    access_expires_at,
    refresh_expires_at,
  })
  if (error) throw new Error(`issueTokens: ${error.message}`)
  return { access_token: raw_access, refresh_token: raw_refresh, expires_in: ACCESS_TOKEN_LIFETIME_SEC, scope: args.scope }
}

/**
 * Consume a refresh token, atomically rotating it. The old token is revoked
 * (revoked_at set) and a fresh access+refresh pair is issued. Returns the
 * new tokens or an error if the refresh is invalid / revoked / expired /
 * client-mismatched.
 */
export async function consumeRefreshToken(args: {
  raw_refresh: string
  client_id:   string
}): Promise<{ ok: true; data: IssuedTokens } | { ok: false; err: TokenIssueError }> {
  if (!args.raw_refresh.startsWith(OAUTH_REFRESH_TOKEN_PREFIX)) {
    return { ok: false, err: { error: 'invalid_grant', description: 'Refresh token format is unrecognised.' } }
  }
  const refresh_hash = hashSecret(args.raw_refresh)
  const sb           = oauthServiceClient()

  // Single-statement rotation: revoke the old row only if not already revoked.
  const { data: rotated, error: rotErr } = await sb
    .from('oauth_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('refresh_token_hash', refresh_hash)
    .is('revoked_at', null)
    .select('client_id, user_id, scope, resource, refresh_expires_at')
    .maybeSingle()

  if (rotErr) {
    return { ok: false, err: { error: 'server_error', description: rotErr.message } }
  }
  if (!rotated) {
    return { ok: false, err: { error: 'invalid_grant', description: 'Refresh token is invalid or has been revoked.' } }
  }
  if (rotated.refresh_expires_at && new Date(rotated.refresh_expires_at).getTime() < Date.now()) {
    return { ok: false, err: { error: 'invalid_grant', description: 'Refresh token has expired.' } }
  }
  if (rotated.client_id !== args.client_id) {
    return { ok: false, err: { error: 'invalid_grant', description: 'Refresh token was issued to a different client.' } }
  }

  const tokens = await issueTokens({
    user_id:   rotated.user_id,
    client_id: rotated.client_id,
    scope:     rotated.scope,
    resource:  rotated.resource,
  })
  return { ok: true, data: tokens }
}

/**
 * Revoke a token (RFC 7009). Accepts either an access or refresh token —
 * sets revoked_at on the matching row. Idempotent; missing-row is not an
 * error (RFC requires we not leak token validity).
 */
export async function revokeToken(raw: string): Promise<void> {
  const sb   = oauthServiceClient()
  const hash = hashSecret(raw)
  const now  = new Date().toISOString()
  // Match either the access or refresh hash; either kind revokes the whole row.
  await sb
    .from('oauth_tokens')
    .update({ revoked_at: now })
    .or(`access_token_hash.eq.${hash},refresh_token_hash.eq.${hash}`)
    .is('revoked_at', null)
}

export interface ResolvedAccessToken {
  user_id:  string
  scope:    string
  resource: string | null
  client_id: string
}

/**
 * Look up an access token by its raw value. Returns the bound user/scope
 * if active (not revoked, not expired). Used by the MCP middleware to
 * authenticate gt_oat_* requests.
 */
export async function resolveAccessToken(raw: string): Promise<ResolvedAccessToken | null> {
  if (!raw.startsWith(OAUTH_ACCESS_TOKEN_PREFIX)) return null
  const sb   = oauthServiceClient()
  const hash = hashSecret(raw)
  const { data } = await sb
    .from('oauth_tokens')
    .select('user_id, scope, resource, client_id, access_expires_at, revoked_at')
    .eq('access_token_hash', hash)
    .maybeSingle()
  if (!data) return null
  if (data.revoked_at) return null
  if (new Date(data.access_expires_at).getTime() < Date.now()) return null
  // Fire-and-forget last_used_at
  sb.from('oauth_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('access_token_hash', hash)
    .then(() => undefined, () => undefined)
  return {
    user_id:   data.user_id,
    scope:     data.scope,
    resource:  data.resource,
    client_id: data.client_id,
  }
}

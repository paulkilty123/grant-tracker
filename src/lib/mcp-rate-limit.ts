// Grant Tracker MCP — rate limit enforcement.
// Spec §6.3 + §6.4. Sliding-window counters via Upstash Redis REST.
//
// Three independent limiters:
//   - keyHourly (100 / 1h, identified by key_hash or oauth:client:user)
//   - keyDaily  (1000 / 1d, same identifier as keyHourly)
//   - ipHourly  (5000 / 1h, identified by IP, applies to ALL authenticated traffic)
//
// Per-request enforcement (see enforceRateLimits):
//   - keyHourly + keyDaily + ipHourly (in parallel)
//
// Anonymous / invalid / revoked requests are 401'd by the route handler
// before this module is reached, so no anonymous limiter is configured.
// If the route is ever refactored to let non-authenticated traffic through,
// enforceRateLimits throws — fail loud rather than silently bypass.
//
// Dev fallback: if UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN are
// missing at module init, the module logs once and degrades to "always
// allow" with static-maxima rate_limit_status. Production must have both.

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import type { MCPAuthContext } from './mcp-middleware'

// ──────────────────────────────────────────────────────────────────────────
// Setup — lazy, with dev fallback
// ──────────────────────────────────────────────────────────────────────────

interface Limiters {
  keyHourly: Ratelimit
  keyDaily:  Ratelimit
  ipHourly:  Ratelimit
}

let cachedLimiters: Limiters | null = null
let envWarned = false

// Shared Upstash credentials reader. Used by BOTH the MCP limiters (which fail
// OPEN when unset — see initLimiters/enforceRateLimits) and the ai-search
// limiter (which fails CLOSED — see enforceAiSearchRateLimit). Same env vars,
// one place to read them. Returns null when either var is missing.
function readUpstashEnv(): { url: string; token: string } | null {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    if (!envWarned) {
      // eslint-disable-next-line no-console
      console.warn('[rate-limit] UPSTASH_REDIS_REST_URL/_TOKEN not set — MCP rate limiting disabled (OK in dev). NB: ai-search fails CLOSED without these; production must have both.')
      envWarned = true
    }
    return null
  }
  return { url, token }
}

function initLimiters(): Limiters | null {
  if (cachedLimiters) return cachedLimiters
  const creds = readUpstashEnv()
  if (!creds) return null
  const redis = new Redis(creds)
  cachedLimiters = {
    keyHourly: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, '1 h'),
      prefix:  'mcp:key:hr',
      analytics: false,
    }),
    keyDaily: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(1000, '1 d'),
      prefix:  'mcp:key:d',
      analytics: false,
    }),
    ipHourly: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5000, '1 h'),
      prefix:  'mcp:ip:hr',
      analytics: false,
    }),
  }
  return cachedLimiters
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

export type RateLimitName = 'key_hourly' | 'key_daily' | 'ip_hourly'

export interface RateLimitStatus {
  remaining_hour: number
  remaining_day:  number | null
  // Unix ms timestamp when the hourly window's previous-bucket contribution
  // fully ages out — i.e. when remaining_hour is guaranteed monotonic again.
  // Agents that need precise pacing should key off this rather than diffing
  // remaining_hour across calls (sliding-window estimator can vary ±1).
  reset_at_hour:  number
}

export interface RateLimitResult {
  allowed:      boolean
  status:       RateLimitStatus
  retry_after:  number | null  // seconds; null when allowed
  which_limit:  RateLimitName | null
  enforced:     boolean        // false when running in dev fallback (no Upstash)
}

// Static maxima from spec §6.3 — used in the dev-fallback path so the
// response shape stays stable when Upstash isn't configured.
function staticStatus(): RateLimitStatus {
  return { remaining_hour: 100, remaining_day: 1000, reset_at_hour: Date.now() + 3_600_000 }
}

function retryAfterSeconds(reset: number): number {
  return Math.max(1, Math.ceil((reset - Date.now()) / 1000))
}

export async function enforceRateLimits(ctx: MCPAuthContext): Promise<RateLimitResult> {
  if (ctx.state !== 'authenticated' || (!ctx.key && !ctx.oauth)) {
    // Route handler is contractually obliged to 401 non-authenticated traffic
    // before calling this. If we got here, something upstream changed; fail
    // loud rather than silently allow.
    throw new Error('enforceRateLimits called with non-authenticated context — route must 401 anonymous/invalid/revoked first')
  }

  const limiters = initLimiters()
  if (!limiters) {
    return {
      allowed: true,
      status: staticStatus(),
      retry_after: null,
      which_limit: null,
      enforced: false,
    }
  }

  const ip = ctx.ip || 'unknown'

  // Identifier: key_hash for bearer-key requests, stable oauth:<client>:<user>
  // string for OAuth. Picking the OAuth token hash would reset the bucket on
  // every refresh, letting clients escape limits.
  const id = ctx.key
    ? ctx.key.key_hash
    : `oauth:${ctx.oauth!.client_id}:${ctx.oauth!.user_id}`

  const [kh, kd, ih] = await Promise.all([
    limiters.keyHourly.limit(id),
    limiters.keyDaily.limit(id),
    limiters.ipHourly.limit(ip),
  ])
  const remaining_hour = Math.max(0, Math.min(kh.remaining, ih.remaining))
  const remaining_day  = Math.max(0, kd.remaining)
  const status: RateLimitStatus = { remaining_hour, remaining_day, reset_at_hour: kh.reset }

  if (!kh.success) return { allowed: false, status, retry_after: retryAfterSeconds(kh.reset), which_limit: 'key_hourly', enforced: true }
  if (!kd.success) return { allowed: false, status, retry_after: retryAfterSeconds(kd.reset), which_limit: 'key_daily',  enforced: true }
  if (!ih.success) return { allowed: false, status, retry_after: retryAfterSeconds(ih.reset), which_limit: 'ip_hourly',  enforced: true }
  return { allowed: true, status, retry_after: null, which_limit: null, enforced: true }
}

// ──────────────────────────────────────────────────────────────────────────
// ai-search limiter — free-tier AI ranking (a paid Anthropic Haiku call).
//
// Same Upstash sliding-window mechanism as the MCP limiters above, keyed per
// authenticated user. NOT a second rate-limiting system — same library, same
// Redis, same env vars.
//
// FAIL DIRECTION — DELIBERATELY CLOSED. The MCP limiters fail OPEN (degrade to
// allow-all when Upstash is unreachable) because MCP traffic is already bounded
// by bearer-key auth and the surface is low-cost. ai-search is an *unbounded
// inference-cost* surface once free-tier signup opens, so allow-all-on-failure
// is the wrong default: if the limiter can't be reached we BLOCK (the route
// returns 503 and the client falls back to keyword results — no AI spend).
// Tradeoff: an Upstash outage (or missing prod env vars) disables AI ranking
// entirely. Keyword/catalogue search is unaffected. This is the safe direction
// for a cost surface; the cost is availability of one feature, not correctness.
// ──────────────────────────────────────────────────────────────────────────

const AI_SEARCH_PER_HOUR = 30   // per authenticated user
const AI_SEARCH_PER_DAY  = 150  // per authenticated user

interface AiSearchLimiters { hourly: Ratelimit; daily: Ratelimit }
let cachedAiSearch: AiSearchLimiters | null = null

function initAiSearchLimiters(): AiSearchLimiters | null {
  if (cachedAiSearch) return cachedAiSearch
  const creds = readUpstashEnv()
  if (!creds) return null
  const redis = new Redis(creds)
  cachedAiSearch = {
    hourly: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(AI_SEARCH_PER_HOUR, '1 h'),
      prefix:  'aisearch:user:hr',
      analytics: false,
    }),
    daily: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(AI_SEARCH_PER_DAY, '1 d'),
      prefix:  'aisearch:user:d',
      analytics: false,
    }),
  }
  return cachedAiSearch
}

export interface AiSearchRateLimitResult {
  allowed:        boolean
  reason:         'ok' | 'rate_limited' | 'limiter_unavailable'
  which_limit:    'hourly' | 'daily' | null
  retry_after:    number | null   // seconds; null unless rate_limited
  remaining_hour: number | null
  remaining_day:  number | null
  limits:         { per_hour: number; per_day: number }
}

/**
 * Enforce the per-user ai-search rate limit. Fails CLOSED (allowed=false,
 * reason='limiter_unavailable') if Upstash is unset or unreachable — see the
 * section header for the rationale.
 */
export async function enforceAiSearchRateLimit(userId: string): Promise<AiSearchRateLimitResult> {
  const limits = { per_hour: AI_SEARCH_PER_HOUR, per_day: AI_SEARCH_PER_DAY }
  const limiters = initAiSearchLimiters()
  if (!limiters) {
    return { allowed: false, reason: 'limiter_unavailable', which_limit: null, retry_after: null, remaining_hour: null, remaining_day: null, limits }
  }
  try {
    const id = `user:${userId}`
    const [h, d] = await Promise.all([limiters.hourly.limit(id), limiters.daily.limit(id)])
    const remaining_hour = Math.max(0, h.remaining)
    const remaining_day  = Math.max(0, d.remaining)
    if (!h.success) return { allowed: false, reason: 'rate_limited', which_limit: 'hourly', retry_after: retryAfterSeconds(h.reset), remaining_hour, remaining_day, limits }
    if (!d.success) return { allowed: false, reason: 'rate_limited', which_limit: 'daily',  retry_after: retryAfterSeconds(d.reset), remaining_hour, remaining_day, limits }
    return { allowed: true, reason: 'ok', which_limit: null, retry_after: null, remaining_hour, remaining_day, limits }
  } catch (err) {
    // Redis unreachable mid-request → fail CLOSED (same direction as missing env).
    // eslint-disable-next-line no-console
    console.error('[ai-search-rate-limit] limiter error — failing closed:', err instanceof Error ? err.message : err)
    return { allowed: false, reason: 'limiter_unavailable', which_limit: null, retry_after: null, remaining_hour: null, remaining_day: null, limits }
  }
}

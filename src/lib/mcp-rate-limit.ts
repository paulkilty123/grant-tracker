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

function initLimiters(): Limiters | null {
  if (cachedLimiters) return cachedLimiters
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    if (!envWarned) {
      // eslint-disable-next-line no-console
      console.warn('[mcp-rate-limit] UPSTASH_REDIS_REST_URL/_TOKEN not set — rate limiting disabled. OK in dev; production must have both.')
      envWarned = true
    }
    return null
  }
  const redis = new Redis({ url, token })
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

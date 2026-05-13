// Grant Tracker MCP — rate limit enforcement.
// Spec §6.3 + §6.4. Sliding-window counters via Upstash Redis REST.
//
// Four independent limiters per spec §6.3:
//   - keyHourly (100 / 1h, identified by key_hash)
//   - keyDaily  (1000 / 1d, identified by key_hash)
//   - anonHourly (10 / 1h, identified by IP, anon-only)
//   - ipHourly  (1000 / 1h, identified by IP, applies to ALL traffic)
//
// Per-request enforcement (see enforceRateLimits):
//   - Authenticated: keyHourly + keyDaily + ipHourly (in parallel)
//   - Anonymous:     anonHourly + ipHourly (in parallel)
//   - Invalid Bearer: treated as anonymous for enforcement (avoids using
//     malformed-key requests to bypass per-IP anon limits)
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
  keyHourly:  Ratelimit
  keyDaily:   Ratelimit
  anonHourly: Ratelimit
  ipHourly:   Ratelimit
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
    anonHourly: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '1 h'),
      prefix:  'mcp:anon:hr',
      analytics: false,
    }),
    ipHourly: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(1000, '1 h'),
      prefix:  'mcp:ip:hr',
      analytics: false,
    }),
  }
  return cachedLimiters
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

export type RateLimitName = 'key_hourly' | 'key_daily' | 'anon_hourly' | 'ip_hourly'

export interface RateLimitStatus {
  remaining_hour: number
  remaining_day:  number | null
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
function staticStatus(ctx: MCPAuthContext): RateLimitStatus {
  if (ctx.state === 'authenticated') {
    return { remaining_hour: 100, remaining_day: 1000 }
  }
  return { remaining_hour: 10, remaining_day: null }
}

function retryAfterSeconds(reset: number): number {
  return Math.max(1, Math.ceil((reset - Date.now()) / 1000))
}

export async function enforceRateLimits(ctx: MCPAuthContext): Promise<RateLimitResult> {
  const limiters = initLimiters()
  if (!limiters) {
    return {
      allowed: true,
      status: staticStatus(ctx),
      retry_after: null,
      which_limit: null,
      enforced: false,
    }
  }

  const ip = ctx.ip || 'unknown'

  if (ctx.state === 'authenticated' && ctx.key) {
    const id = ctx.key.key_hash
    const [kh, kd, ih] = await Promise.all([
      limiters.keyHourly.limit(id),
      limiters.keyDaily.limit(id),
      limiters.ipHourly.limit(ip),
    ])
    const remaining_hour = Math.max(0, Math.min(kh.remaining, ih.remaining))
    const remaining_day  = Math.max(0, kd.remaining)
    const status: RateLimitStatus = { remaining_hour, remaining_day }

    if (!kh.success) return { allowed: false, status, retry_after: retryAfterSeconds(kh.reset), which_limit: 'key_hourly', enforced: true }
    if (!kd.success) return { allowed: false, status, retry_after: retryAfterSeconds(kd.reset), which_limit: 'key_daily',  enforced: true }
    if (!ih.success) return { allowed: false, status, retry_after: retryAfterSeconds(ih.reset), which_limit: 'ip_hourly',  enforced: true }
    return { allowed: true, status, retry_after: null, which_limit: null, enforced: true }
  }

  // Anonymous (or invalid/revoked → treated as anon for enforcement)
  const [ah, ih] = await Promise.all([
    limiters.anonHourly.limit(ip),
    limiters.ipHourly.limit(ip),
  ])
  const remaining_hour = Math.max(0, Math.min(ah.remaining, ih.remaining))
  const status: RateLimitStatus = { remaining_hour, remaining_day: null }

  if (!ah.success) return { allowed: false, status, retry_after: retryAfterSeconds(ah.reset), which_limit: 'anon_hourly', enforced: true }
  if (!ih.success) return { allowed: false, status, retry_after: retryAfterSeconds(ih.reset), which_limit: 'ip_hourly',   enforced: true }
  return { allowed: true, status, retry_after: null, which_limit: null, enforced: true }
}

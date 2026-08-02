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
  keyHourly:     Ratelimit
  keyHourlyFree: Ratelimit
  keyDaily:      Ratelimit
  ipHourly:      Ratelimit
  /** Raw client, for the calendar-month search quota (not a sliding window). */
  redis:         Redis
}

// ── Limits ─────────────────────────────────────────────────────────────────
// Abuse ceilings, per credential. The paid ceiling and the daily/IP ceilings
// are unchanged from before the tier split; only free is new.
const HOURLY_LIMIT_PAID = 100
const HOURLY_LIMIT_FREE = 50
const DAILY_LIMIT       = 1000
const IP_HOURLY_LIMIT   = 5000

/**
 * Free-tier search allowance per calendar month. Distinct in kind from the
 * ceilings above: those exist to stop abuse, this one is the commercial line.
 * Exhausting it is a normal, declared outcome rather than an error.
 *
 * Overridable via FREE_SEARCH_QUOTA so a preview deployment can drive the
 * boundary at a small number with byte-identical code. The 50/hour ceiling puts
 * 75 out of reach inside a single hour, so the production value cannot be
 * exhausted in one sitting. Production leaves this unset.
 *
 * Validated rather than coerced. A non-numeric override would become NaN, and
 * every NaN comparison is false, so `used <= limit` would never hold and the
 * quota would refuse everything; a zero would refuse everything too. Both look
 * "configured" from the outside, so fail loudly at load instead.
 */
function readFreeSearchQuota(): number {
  const raw = process.env.FREE_SEARCH_QUOTA?.trim()
  if (!raw) return 75
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`FREE_SEARCH_QUOTA must be a positive integer, got ${JSON.stringify(raw)}`)
  }
  return n
}

export const FREE_SEARCH_QUOTA_PER_MONTH = readFreeSearchQuota()

/** Paid rungs of the ladder. `internal` is never assigned externally. */
export function isPaidTier(tier: MCPAuthContext['tier']): boolean {
  return tier === 'apply' || tier === 'companion' || tier === 'internal'
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
      limiter: Ratelimit.slidingWindow(HOURLY_LIMIT_PAID, '1 h'),
      prefix:  'mcp:key:hr',
      analytics: false,
    }),
    // Separate prefix, not just a different limit on the same one: sharing a
    // prefix would reinterpret one set of stored counts under two different
    // ceilings. Keeping the paid prefix untouched also means existing paid
    // callers' buckets survive this deploy unchanged.
    keyHourlyFree: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(HOURLY_LIMIT_FREE, '1 h'),
      prefix:  'mcp:key:hr:free',
      analytics: false,
    }),
    keyDaily: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(DAILY_LIMIT, '1 d'),
      prefix:  'mcp:key:d',
      analytics: false,
    }),
    ipHourly: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(IP_HOURLY_LIMIT, '1 h'),
      prefix:  'mcp:ip:hr',
      analytics: false,
    }),
    redis,
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

// Static maxima used in the dev-fallback path so the response shape stays
// stable when Upstash isn't configured. Reports the ceiling the caller's own
// tier would have had, so a dev-mode response is not misleading about which
// rung it is on.
function staticStatus(tier: MCPAuthContext['tier']): RateLimitStatus {
  return {
    remaining_hour: isPaidTier(tier) ? HOURLY_LIMIT_PAID : HOURLY_LIMIT_FREE,
    remaining_day: DAILY_LIMIT,
    reset_at_hour: Date.now() + 3_600_000,
  }
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
      status: staticStatus(ctx.tier),
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

  // Tier decides the hourly ceiling. This is why enforcement now runs AFTER
  // tier resolution in the route: before the move, ctx.tier was always
  // undefined here and every caller would have been metered as free.
  const hourly = isPaidTier(ctx.tier) ? limiters.keyHourly : limiters.keyHourlyFree

  const [kh, kd, ih] = await Promise.all([
    hourly.limit(id),
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
// Free-tier search quota — calendar month, not a rolling window
//
// Deliberately NOT an @upstash/ratelimit limiter. Those are sliding windows;
// this is a plain counter keyed by calendar month, because "75 searches this
// month, resets on the 1st" is a promise a user can hold in their head, and a
// sliding window is not. It is also why the reset date can be stated exactly
// in the response rather than approximated.
//
// Keyed by ORGANISATION, not by credential: the quota is a commercial line, so
// re-registering a client or minting a fresh token must not reset it. API-key
// callers have no resolved org (tier resolution is OAuth-only), so they fall
// back to their credential id — still bounded, just per-key.
//
// Fails OPEN, consistent with the MCP ceilings: an Upstash outage lets free
// searches through rather than blocking them. Worth noting that this one has
// commercial rather than purely abuse consequences — see the deploy notes.
// ──────────────────────────────────────────────────────────────────────────

export interface SearchQuotaResult {
  allowed:   boolean
  used:      number
  limit:     number
  /** ISO date the allowance resets — the 1st of next month, UTC. */
  resets_on: string
  enforced:  boolean
}

/** UTC year-month, e.g. "2026-08". Month boundaries are UTC, not local. */
function currentQuotaPeriod(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

function nextMonthStart(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10)
}

/**
 * Count one free-tier search against the current calendar month.
 *
 * Increments first and compares after, so the check and the count are a single
 * atomic Redis operation — a check-then-increment pair would let concurrent
 * calls both observe 74 and both proceed.
 */
export async function consumeFreeSearchQuota(subject: string): Promise<SearchQuotaResult> {
  const now = new Date()
  const resets_on = nextMonthStart(now)
  const limiters = initLimiters()

  if (!limiters) {
    return { allowed: true, used: 0, limit: FREE_SEARCH_QUOTA_PER_MONTH, resets_on, enforced: false }
  }

  const key = `mcp:quota:search:${currentQuotaPeriod(now)}:${subject}`
  try {
    const used = await limiters.redis.incr(key)
    if (used === 1) {
      // First call of the month: expire a little past the month's length so the
      // key cannot outlive its period, and cannot vanish inside it either.
      await limiters.redis.expire(key, 40 * 24 * 60 * 60)
    }
    return {
      allowed: used <= FREE_SEARCH_QUOTA_PER_MONTH,
      used,
      limit: FREE_SEARCH_QUOTA_PER_MONTH,
      resets_on,
      enforced: true,
    }
  } catch (err) {
    // Fail open, same posture as the ceilings above.
    console.error('[rate-limit] search quota check failed, allowing:', err)
    return { allowed: true, used: 0, limit: FREE_SEARCH_QUOTA_PER_MONTH, resets_on, enforced: false }
  }
}

/** Read the month's usage without consuming any. */
export async function peekFreeSearchQuota(subject: string): Promise<SearchQuotaResult> {
  const now = new Date()
  const resets_on = nextMonthStart(now)
  const limiters = initLimiters()
  if (!limiters) {
    return { allowed: true, used: 0, limit: FREE_SEARCH_QUOTA_PER_MONTH, resets_on, enforced: false }
  }
  try {
    const raw = await limiters.redis.get<number | string | null>(`mcp:quota:search:${currentQuotaPeriod(now)}:${subject}`)
    const used = raw == null ? 0 : Number(raw)
    return { allowed: used < FREE_SEARCH_QUOTA_PER_MONTH, used, limit: FREE_SEARCH_QUOTA_PER_MONTH, resets_on, enforced: true }
  } catch {
    return { allowed: true, used: 0, limit: FREE_SEARCH_QUOTA_PER_MONTH, resets_on, enforced: false }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Inference-surface limiter — per-user limits for the paid Anthropic (Haiku)
// routes (ai-search ranking, autofill-grant, org-autocomplete profile scan).
//
// Same Upstash sliding-window mechanism as the MCP limiters above, keyed per
// authenticated user, one bucket per surface (`scope`). NOT a second rate-
// limiting system — same library, same Redis, same env vars; this just
// generalises the one helper across surfaces.
//
// FAIL DIRECTION — DELIBERATELY CLOSED. The MCP limiters fail OPEN (degrade to
// allow-all when Upstash is unreachable) because MCP traffic is already bounded
// by bearer-key auth and the surface is low-cost. These are *unbounded
// inference-cost* surfaces once free-tier signup opens, so allow-all-on-failure
// is the wrong default: if the limiter can't be reached we BLOCK (the route
// returns 503 and the client falls back to its non-AI path — no AI spend).
// Tradeoff: an Upstash outage (or missing prod env vars) disables AI ranking /
// auto-fill. Keyword/catalogue search and manual entry are unaffected. Safe
// direction for a cost surface; the cost is availability of one feature.
// ──────────────────────────────────────────────────────────────────────────

export interface InferenceRateLimitResult {
  allowed:        boolean
  reason:         'ok' | 'rate_limited' | 'limiter_unavailable'
  which_limit:    'hourly' | 'daily' | null
  retry_after:    number | null   // seconds; null unless rate_limited
  remaining_hour: number | null
  remaining_day:  number | null
  limits:         { per_hour: number; per_day: number }
}

interface InferenceLimiterPair { hourly: Ratelimit; daily: Ratelimit }
const inferenceLimiterCache = new Map<string, InferenceLimiterPair>()

function getInferenceLimiters(scope: string, perHour: number, perDay: number): InferenceLimiterPair | null {
  const cached = inferenceLimiterCache.get(scope)
  if (cached) return cached
  const creds = readUpstashEnv()
  if (!creds) return null
  const redis = new Redis(creds)
  const pair: InferenceLimiterPair = {
    hourly: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(perHour, '1 h'), prefix: `infer:${scope}:hr`, analytics: false }),
    daily:  new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(perDay,  '1 d'), prefix: `infer:${scope}:d`,  analytics: false }),
  }
  inferenceLimiterCache.set(scope, pair)
  return pair
}

/**
 * Enforce a per-identifier inference rate limit for `scope`. Fails CLOSED
 * (allowed=false, reason='limiter_unavailable') if Upstash is unset or
 * unreachable — see the section header for the rationale.
 */
export async function enforceInferenceRateLimit(opts: {
  scope: string         // bucket name, e.g. 'aisearch' | 'autofill' | 'orgprofile'
  identifier: string    // e.g. `user:<uuid>`
  perHour: number
  perDay: number
}): Promise<InferenceRateLimitResult> {
  const { scope, identifier, perHour, perDay } = opts
  const limits = { per_hour: perHour, per_day: perDay }
  const limiters = getInferenceLimiters(scope, perHour, perDay)
  if (!limiters) {
    return { allowed: false, reason: 'limiter_unavailable', which_limit: null, retry_after: null, remaining_hour: null, remaining_day: null, limits }
  }
  try {
    const [h, d] = await Promise.all([limiters.hourly.limit(identifier), limiters.daily.limit(identifier)])
    const remaining_hour = Math.max(0, h.remaining)
    const remaining_day  = Math.max(0, d.remaining)
    if (!h.success) return { allowed: false, reason: 'rate_limited', which_limit: 'hourly', retry_after: retryAfterSeconds(h.reset), remaining_hour, remaining_day, limits }
    if (!d.success) return { allowed: false, reason: 'rate_limited', which_limit: 'daily',  retry_after: retryAfterSeconds(d.reset), remaining_hour, remaining_day, limits }
    return { allowed: true, reason: 'ok', which_limit: null, retry_after: null, remaining_hour, remaining_day, limits }
  } catch (err) {
    // Redis unreachable mid-request → fail CLOSED (same direction as missing env).
    // eslint-disable-next-line no-console
    console.error(`[inference-rate-limit:${scope}] limiter error — failing closed:`, err instanceof Error ? err.message : err)
    return { allowed: false, reason: 'limiter_unavailable', which_limit: null, retry_after: null, remaining_hour: null, remaining_day: null, limits }
  }
}

// Back-compat wrapper — the ai-search route calls this. 30/h, 150/day per user.
export type AiSearchRateLimitResult = InferenceRateLimitResult
export function enforceAiSearchRateLimit(userId: string): Promise<InferenceRateLimitResult> {
  return enforceInferenceRateLimit({ scope: 'aisearch', identifier: `user:${userId}`, perHour: 30, perDay: 150 })
}

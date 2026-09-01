// How long to leave a host alone after it has refused to be read.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY PER HOST, AND NOT PER ROW
//
// A wall belongs to a domain, not to a grant. artscouncil.org.uk serves the same
// Cloudflare interstitial to all eleven Arts Council rows in the queue, and
// london.gov.uk to all four GLA rows. Backing off per row means the fifteenth
// futile read of the same wall is scheduled as carefully as the first.
//
// The immediate need is sharper than tidiness. Once `verify-row` classifies a
// wall as `no_content`, that failure is RETRYABLE — the proxy gets its turn, and
// when the proxy is walled too the row stays unresolved and due again. 16 of the
// 33 walled rows measured on 2026-09-01 read fine hours later, so the wall is
// intermittent and the row never settles: it churns round the queue for ever,
// spending two fetches a visit and resolving nothing. Retryable plus no memory
// is a loop.
//
// SHAPE C, REUSED DELIBERATELY. verify-cadence.ts already answers "this thing
// will not tell us anything today, so ask less often" with a doubling backoff
// and a streak that any success resets. That is the same question, so this is
// the same answer with the same numbers, and a reader who knows one knows both.
// The difference is only the key: a row there, a host here.
//
// A COUNT THAT ONLY GROWS IS THE TRAP THIS AVOIDS. Every success clears the
// host's entry outright rather than decrementing it, so a funder who removes
// their WAF is read normally on the next pass instead of serving out a 30-day
// sentence. Same rule as `probe-read-exhausted`, which deletes its marker the
// moment either path succeeds, and for the same reason.

import type { UnreadableReason } from './page-readable'

/**
 * Consecutive failures to hours of silence.
 *
 * Deliberately hours rather than shape C's days: a bot wall is a transient
 * property of a network path and a WAF's mood, not a funder's publishing
 * calendar. The doubling is what stops a genuinely hard host being hammered, and
 * the cap keeps a wall from becoming permanent, because a permanent skip is a
 * silent removal from verification.
 *
 * WHAT IS ACTUALLY MEASURED, AND WHAT THE FIRST RUNG RESTS ON. 16 of 33 walled
 * rows read fine on a re-probe roughly two hours later. That bounds the window
 * from above and says nothing about where inside it a wall typically lifts, so
 * it does not justify one hour specifically — and the watchlist session's
 * Wolfson case, one host lifting in about an hour and staying lifted, is a
 * single transition rather than a measurement.
 *
 * One hour is kept because of what the first rung actually costs. A persistently
 * walled host reaches 24 hours after four failures whatever the first rung is,
 * so the rung only governs TRANSIENT walls, where retrying soon is the correct
 * behaviour rather than the wasteful one. The cost of being too eager is one
 * fetch pair; the cost of being too patient is a row sitting unverified for a
 * day because a WAF blinked. Revisit with timings, not with intuition.
 */
export const HOST_BACKOFF_HOURS = [1, 2, 6, 24, 72, 168] as const

/** Nothing is ever skipped for longer than this, whatever its streak says. */
export const MAX_BACKOFF_HOURS = 168

/**
 * Reasons that are a property of the HOST and worth remembering across rows.
 *
 * `soft_404` and `directory_listing` are deliberately absent. Those are facts
 * about one URL, and a soft 404 on one page says nothing about the next page on
 * the same domain — backing off the host would hide every other row on a funder
 * whose site is fine. They stay per-row findings for a reviewer.
 *
 * NOT THE SAME AXIS AS `selfResolving` in page-readable.ts, and the two are kept
 * apart on purpose. This asks "is this worth remembering per host"; that asks
 * "can this stop being true on its own". They disagree on `directory_listing` —
 * not worth a host backoff, but permanent for the URL — and both are right for
 * their own question. A caller deciding whether to STOP watching wants
 * `selfResolving`; a caller deciding whether to skip a fetch wants this.
 */
const HOST_LEVEL: ReadonlySet<UnreadableReason> = new Set<UnreadableReason>([
  'bot_wall', 'js_shell', 'empty', 'too_short',
  // A sold domain is dead for every path on it, so eleven rows should discover
  // that once rather than eleven times. The backoff is the wrong END state — the
  // rows want retiring, not delaying — but it is the right thing to do until a
  // human rules, and the cap means it can never become a silent permanent skip.
  'parked_domain',
])

export function isHostLevel(reason: UnreadableReason): boolean {
  return HOST_LEVEL.has(reason)
}

export type HostState = {
  /** Consecutive failed reads of this host. Any success clears the entry. */
  failures: number
  /** ISO timestamp of the last failure. */
  lastFailedAt: string
  /** The reason most recently seen, for the admin line. */
  reason: UnreadableReason
}

export const hostOf = (url: string | null | undefined): string =>
  (url ?? '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0]?.split(':')[0] ?? ''

/** Hours to wait after `failures` consecutive failures. */
export function backoffHours(failures: number): number {
  if (failures <= 0) return 0
  const idx = Math.min(failures - 1, HOST_BACKOFF_HOURS.length - 1)
  return Math.min(HOST_BACKOFF_HOURS[idx], MAX_BACKOFF_HOURS)
}

/**
 * Should this host be left alone right now?
 *
 * Returns null when it is fine to read, or the reason and the remaining wait
 * when it is not. The wait is REPORTED rather than merely enforced, because a
 * skip nobody can see is indistinguishable from a host that is being read and
 * always passing — the failure mode CLAUDE.md calls an alarm that has never
 * fired.
 */
export function shouldSkipHost(
  state: HostState | null | undefined,
  now: Date = new Date(),
): { skip: true; reason: UnreadableReason; hoursLeft: number; failures: number } | null {
  if (!state || state.failures <= 0) return null
  const last = Date.parse(state.lastFailedAt)
  if (Number.isNaN(last)) return null
  const waitMs = backoffHours(state.failures) * 3_600_000
  const elapsed = now.getTime() - last
  if (elapsed >= waitMs) return null
  return {
    skip: true,
    reason: state.reason,
    hoursLeft: Math.max(0, Math.ceil((waitMs - elapsed) / 3_600_000)),
    failures: state.failures,
  }
}

/** Record a failed read. Returns the new state. */
export function recordFailure(
  state: HostState | null | undefined,
  reason: UnreadableReason,
  now: Date = new Date(),
): HostState {
  return {
    failures: (state?.failures ?? 0) + 1,
    lastFailedAt: now.toISOString(),
    reason,
  }
}

/**
 * Record a successful read.
 *
 * Returns null, and the caller must DELETE the entry rather than store the null.
 * A host that starts working again has no history worth keeping, and a
 * decrementing counter would leave a funder who fixed their WAF serving out the
 * rest of a sentence.
 */
export function recordSuccess(): null {
  return null
}

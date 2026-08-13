// How many rows one auto-publish run may apply.
//
// Extracted from the route so it can be tested. It was three chained ternaries
// inline, and the subtlety in it is exactly the kind that reads as correct and
// is not: under the original `> 0` guards, setting the cap to **zero** fell
// through every branch and resolved to Infinity. A person halting the job by
// setting the limit to nothing would have published everything, and the run
// summary would have looked entirely normal.
//
// That is not hypothetical. AUTO_PUBLISH_LIMIT was set to 0 on 2026-08-13 to
// pause the gate. It did nothing — for an unrelated reason, because this code
// was on an unmerged branch and production read no variable at all — but had it
// been deployed, it would have removed the cap instead of applying it.

/** The three ways a cap can be stated, in precedence order. */
export type CapInputs = {
  /** `?limit=` on the request. Manual callers only: vercel.json registers the cron path bare. */
  limitParam?: string | null
  /** AUTO_PUBLISH_LIMIT. Applies to the scheduled run, which cannot carry a query string. */
  envLimit?: string | null
}

/**
 * Resolve the cap. `Infinity` means uncapped.
 *
 * Rules, in order:
 *   1. `?limit=` wins outright when it parses to a non-negative number.
 *   2. Otherwise AUTO_PUBLISH_LIMIT, same test.
 *   3. Otherwise uncapped.
 *
 * ZERO IS A VALID CAP AND MEANS STOP. Absent is different from zero: nobody set
 * a limit, versus somebody set it to none-at-all. Only the second halts the job.
 *
 * An empty or whitespace-only env var counts as ABSENT, not as zero. `Number('')`
 * is 0, and Vercel renders an empty variable indistinguishably from an unset one,
 * so treating it as a stop would let a blank field silently freeze publishing.
 *
 * Negative values are rejected rather than clamped. A negative cap is a typo, and
 * guessing which of "stop" or "uncapped" was meant is worse than ignoring it.
 */
export function resolvePublishCap({ limitParam, envLimit }: CapInputs): number {
  for (const raw of [limitParam, envLimit]) {
    const trimmed = raw?.trim()
    if (!trimmed) continue          // absent, or empty — fall through
    const n = Number(trimmed)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return Infinity
}

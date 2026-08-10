/**
 * Resolves a `match_feedback.grant_id` to exactly one catalogue row.
 *
 * `match_feedback.grant_id` is `text` and holds a mix of `scraped_grants.id`
 * (uuid) and `scraped_grants.external_id`, so any lookup has to try both forms.
 * Joining on `id` alone silently drops the external_id-keyed flags, which is what
 * `api/admin/feedback/route.ts` does today: those rows fall back to rendering the
 * raw id instead of a grant title.
 *
 * Titles are NEVER used. Two live rows share the title "Stronger Communities
 * Fund" (We Love MCR / Manchester, and Somerset Community Foundation), and a
 * correction accepted against the wrong one would write a Manchester income cap
 * onto a Somerset fund. The signature deliberately makes `title` optional and
 * unused so a title-based fallback cannot be added by accident.
 *
 * Ambiguity is returned rather than resolved. Guessing between two candidates is
 * exactly the failure this module exists to prevent.
 */

export type GrantKey = {
  id: string
  external_id: string | null
  /** Present for display only. Never used for matching. */
  title?: string | null
}

export type FlagResolution<T extends GrantKey> =
  | { ok: true; grant: T; via: 'id' | 'external_id' }
  | { ok: false; reason: 'not_found' | 'ambiguous' }

export function resolveFlagGrant<T extends GrantKey>(
  grantId: string,
  candidates: readonly T[],
): FlagResolution<T> {
  const key = grantId.trim()
  if (!key) return { ok: false, reason: 'not_found' }

  // 1. UUID primary key.
  const byId = candidates.filter(c => c.id === key)
  if (byId.length === 1) return { ok: true, grant: byId[0], via: 'id' }
  if (byId.length > 1) return { ok: false, reason: 'ambiguous' }

  // 2. Legacy / scraper external id. Null external_ids can never match.
  const byExternal = candidates.filter(c => c.external_id != null && c.external_id === key)
  if (byExternal.length === 1) return { ok: true, grant: byExternal[0], via: 'external_id' }
  if (byExternal.length > 1) return { ok: false, reason: 'ambiguous' }

  return { ok: false, reason: 'not_found' }
}

/**
 * The `or` filter for a Supabase query that fetches candidates for a set of
 * flags. Both key forms, so nothing is silently dropped.
 *
 * Values are validated before interpolation: PostgREST's `or` filter is a string
 * grammar, and an unescaped comma or parenthesis in an external_id would change
 * the parsed filter rather than error.
 */
export function candidateFilterForFlagIds(grantIds: readonly string[]): string {
  const safe = grantIds
    .map(g => g.trim())
    .filter(g => g.length > 0 && !/[(),"]/.test(g))
  const uuids = safe.filter(isUuid)
  const others = safe.filter(g => !isUuid(g))
  const clauses: string[] = []
  if (uuids.length) clauses.push(`id.in.(${uuids.join(',')})`)
  if (others.length) clauses.push(`external_id.in.(${others.join(',')})`)
  return clauses.join(',')
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

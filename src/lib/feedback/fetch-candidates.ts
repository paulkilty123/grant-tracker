import type { SupabaseClient } from '@supabase/supabase-js'
import { candidateFiltersForFlagIds } from './resolve-grant'

/**
 * Loads the catalogue rows a set of flags might point at, in chunks, checking
 * every error.
 *
 * Exists because the obvious one-shot version fails silently at scale. 403 flag
 * ids build a ~15KB `or` filter, which supabase-js rejects with a bare
 * `TypeError: fetch failed` — no status, no PostgREST message. Destructuring
 * only `{ data }` then yields an empty array, every flag resolves to
 * "not_found", and the screen truthfully reports that it found nothing wrong.
 *
 * So: throw on error rather than return a short list. A caller cannot tell an
 * empty result from a failed one, and quietly under-reporting is the worse
 * failure for a review queue.
 */
export async function fetchFlagCandidates<T>(
  db: SupabaseClient,
  grantIds: readonly string[],
  columns: string,
): Promise<T[]> {
  const filters = candidateFiltersForFlagIds(grantIds)
  if (filters.length === 0) return []

  const rows: T[] = []
  for (const filter of filters) {
    const { data, error } = await db.from('scraped_grants').select(columns).or(filter)
    if (error) {
      throw new Error(`Loading grants for feedback flags failed: ${error.message}`)
    }
    rows.push(...((data ?? []) as unknown as T[]))
  }
  return rows
}

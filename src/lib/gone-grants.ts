// Which grant pages are GONE, as opposed to merely not here.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY 410 AND NOT 404
//
// Both take the page out of the index. 410 does it faster, because 404 means
// "not found right now" — a crawler is entitled to keep asking — while 410 is a
// statement that the resource is deliberately and permanently gone.
//
// That distinction is real here and not a technicality. `rejected` and
// `archived` are decisions somebody made: this is a duplicate, this is not a
// fund, this is out of scope for our audience. Those pages are never coming
// back. A row withheld in review might; a published row between rounds
// definitely will. So the 410 set is exactly the two terminal states, and
// everything else keeps its 404.
//
// Nine days from a launch push aimed at search and AI crawlers, the difference
// is worth having.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS IS CACHED, AND WHY IT FAILS OPEN
//
// The check runs in middleware, which sees every request. A database read per
// request on the highest-value public pages in the product would be a bad trade
// for a status code, so the id set is fetched once per instance and held for
// TTL_MS. 994 uuids is about 36KB; the lookup is O(1).
//
// It FAILS OPEN, deliberately. If the fetch errors, `isGone` returns false and
// the request falls through to the page, which 404s on its own — the same
// answer, one step less good. The alternative is a Supabase blip taking out
// every grant page in the catalogue, which is not a trade worth making for a
// de-indexing hint.

import { getAdminDb } from '@/lib/admin/admin-db'

/** The two states that mean a human decided this page should not exist. */
export const GONE_STATES = ['rejected', 'archived'] as const

/** Long enough that the read is rare, short enough that an un-rejection is not
 *  stuck behind it for a working day. */
const TTL_MS = 5 * 60 * 1000

let cache: { at: number; ids: Set<string> } | null = null
let inflight: Promise<Set<string>> | null = null

async function load(): Promise<Set<string>> {
  const db = getAdminDb()
  const ids = new Set<string>()
  // Paged: PostgREST caps a response at 1,000 rows and there are already 994.
  // A `.limit()` here would silently start missing rows the week it is passed.
  for (let from = 0; from < 20_000; from += 500) {
    const { data, error } = await db
      .from('scraped_grants')
      .select('id, external_id')
      .in('pipeline_state', GONE_STATES as unknown as string[])
      .order('id')
      .range(from, from + 499)
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as { id: string; external_id: string | null }[]) {
      // BOTH keys, because loadGrant resolves either — a row with an
      // external_id is reachable at two URLs and only one of them would 410 if
      // we stored the uuid alone.
      if (r.id) ids.add(r.id.toLowerCase())
      if (r.external_id) ids.add(String(r.external_id).toLowerCase())
    }
    if ((data ?? []).length < 500) break
  }
  return ids
}

/**
 * Is this grant key one we have deliberately removed?
 *
 * Never throws. A failure returns false and the caller falls through to the
 * page's own 404.
 */
export async function isGone(key: string): Promise<boolean> {
  const k = decodeURIComponent(key ?? '').trim().toLowerCase()
  if (!k) return false
  try {
    if (!cache || Date.now() - cache.at > TTL_MS) {
      // Coalesced, so a burst of requests after expiry triggers one read rather
      // than one per request.
      inflight ??= load().then(ids => { cache = { at: Date.now(), ids }; inflight = null; return ids })
      await inflight
    }
    return cache?.ids.has(k) ?? false
  } catch (e) {
    inflight = null
    // Named, because failing open is silent by design and a permanently broken
    // lookup would otherwise be indistinguishable from a catalogue with nothing
    // removed in it. One line per instance per five minutes, not per request.
    console.warn('[gone] lookup failed, falling through to 404:', e instanceof Error ? e.message : String(e))
    return false
  }
}

/** The path segment for a grant page, or null. Kept here so middleware and the
 *  tests agree on what a grant URL looks like. */
export function grantKeyFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/grants\/([^/]+)\/?$/)
  return m ? m[1] : null
}

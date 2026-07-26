import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client for admin surfaces, with fetch caching OFF.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * The `cache: 'no-store'` is the entire reason this helper exists.
 *
 * supabase-js issues its queries through global fetch, which Next.js patches and
 * caches. Observed 2026-07-26: the auto-publish gate published 73 rows and
 * drained the review queue from 125 to 52, and the very next invocation still
 * read 125 — re-publishing 3 rows it had already published minutes before. The
 * response looked completely healthy: right shape, plausible counts, no error.
 * Only comparing it against the database revealed it.
 *
 * `export const dynamic = 'force-dynamic'` does NOT prevent this. That governs
 * route rendering; it does not reach the fetch cache inside a client library.
 *
 * For an admin surface the consequence is that you review a queue that no longer
 * exists — approving rows already approved, and never seeing rows added since.
 * For the gate it is worse: it would publish rows a human had just rejected.
 *
 * `persistSession: false` because none of these callers are a browser session,
 * and a service-role client must never write auth state to shared storage.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function getAdminDb(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: 'no-store' }),
      },
    },
  )
}

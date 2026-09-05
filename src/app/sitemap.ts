import type { MetadataRoute } from 'next'
import { getAdminDb } from '@/lib/admin/admin-db'
import { MCP_APP_ORIGIN } from '@/lib/mcp-brand'

// Built per request, not at build time.
//
// This was `export const revalidate = 3600` first, and the build log showed why
// that was wrong: Next tried to prerender the route, getAdminDb's `no-store`
// fetch refused to run under static generation, and the catch below quietly
// served the six static pages instead. The build still passed. A deploy would
// have shipped a six-URL sitemap that looked fine and omitted all 582 grants.
//
// A sitemap is fetched by crawlers a handful of times a day, so recomputing one
// indexed query per request costs nothing and is always current — which matters
// for a catalogue that gains rows on the daily auto-publish cron.
export const dynamic = 'force-dynamic'

/** Pages that exist regardless of the catalogue. */
function staticEntries(now: Date): MetadataRoute.Sitemap {
  // Deliberately NOT listed:
  //   /signup             — reachable by URL but unlinked until launch
  //   /apply              — closed-cohort recruitment copy; stays live for direct
  //                         links only and carries noindex (Paul, 2026-09-05)
  //   /cohort-signup-7k9m2x — unlisted path, must not be published anywhere
  //   /dashboard/*, /auth/*, /oauth/*, /onboarding/* — behind the auth gate
  return [
    { url: `${MCP_APP_ORIGIN}/`,          lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${MCP_APP_ORIGIN}/mcp`,       lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${MCP_APP_ORIGIN}/mcp/terms`, lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
    { url: `${MCP_APP_ORIGIN}/privacy`,   lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
    { url: `${MCP_APP_ORIGIN}/terms`,     lastModified: now, changeFrequency: 'yearly',  priority: 0.2 },
  ]
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const statics = staticEntries(now)

  try {
    // is_active AND published, both required. is_active alone is not enough:
    // rows exist that are published but expired, and rows that are active but
    // still in review. Only the intersection is a page a stranger should be
    // invited to from a search result.
    //
    // getAdminDb rather than the cookie client — supabase-js queries go through
    // Next's patched fetch, and a cached read here would freeze the sitemap at
    // whatever the catalogue looked like on the first request after a deploy.
    const db = getAdminDb()
    const { data, error } = await db
      .from('scraped_grants')
      .select('id, external_id, last_seen_at, first_seen_at')
      .eq('is_active', true)
      .eq('pipeline_state', 'published')

    if (error) throw new Error(error.message)

    const grants: MetadataRoute.Sitemap = (data ?? []).map(row => {
      // One URL per grant, never two. loadGrant() resolves BOTH the external_id
      // and the uuid, and canonicalFor() echoes back whichever was requested —
      // so a row with an external_id has two self-canonicalising URLs. Listing
      // only the preferred one keeps the duplicate out of the index; the page's
      // own canonical tag is the thing that should eventually be pinned too.
      const slug = row.external_id ?? row.id
      const stamp = row.last_seen_at ?? row.first_seen_at
      return {
        url: `${MCP_APP_ORIGIN}/grants/${encodeURIComponent(String(slug))}`,
        lastModified: stamp ? new Date(String(stamp)) : now,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }
    })

    return [...statics, ...grants]
  } catch (err) {
    // Serve the static pages rather than an empty document. An empty sitemap is
    // worse than a partial one: it is a positive assertion that there is
    // nothing to index, and it would be served for a full revalidate window.
    console.error('[sitemap] catalogue query failed, serving static pages only:', err)
    return statics
  }
}

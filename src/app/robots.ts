import type { MetadataRoute } from 'next'
import { MCP_APP_ORIGIN } from '@/lib/mcp-brand'

// Crawl instructions for the public surface.
//
// Two things worth knowing before editing this file.
//
// 1. Until 2026-08-30 there was no robots.txt at all — /robots.txt returned a
//    404. The middleware has whitelisted the path as a metadata route since the
//    OG-image work, so the route was anticipated and simply never built.
//
// 2. This file is served by shootsfunding ONLY, and that is recent.
//
//    Until 2026-08-31 granttracker.co.uk did not redirect — it served this same
//    deployment byte-for-byte, so one robots.txt answered for two live domains
//    and could not be varied per host from a static metadata route. Both
//    granttracker hosts now 308 to www.shootsfunding.co.uk with the path
//    preserved, /robots.txt and /sitemap.xml included, verified end to end
//    including the http->https hop.
//
//    No `Disallow: /` was ever added for the old domain, and none should be if
//    a duplicate host reappears. Blocking a duplicate stops the crawler reading
//    the canonical tag that consolidates it, so the URL can sit in the index
//    with no snippet instead of folding into the canonical. A redirect is the
//    fix; robots.txt is not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Authenticated app, auth flows and machine endpoints. Nothing here
        // renders anything a search result should ever land on.
        //
        // /cohort-signup-7k9m2x is deliberately ABSENT. It is unlisted rather
        // than secret, but naming it here would publish it to anyone who reads
        // robots.txt, which is the opposite of what an unguessable path is for.
        // It stays out of the sitemap instead.
        disallow: [
          '/dashboard/',
          '/api/',
          '/auth/',
          '/oauth/',
          '/onboarding/',
        ],
      },
    ],
    sitemap: `${MCP_APP_ORIGIN}/sitemap.xml`,
    host: MCP_APP_ORIGIN,
  }
}

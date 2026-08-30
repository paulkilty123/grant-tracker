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
// 2. ONE robots.txt serves BOTH live domains. granttracker.co.uk does not
//    redirect: it serves this same deployment byte-for-byte, so anything here
//    is served under both hosts and cannot be varied per host from a static
//    metadata route.
//
//    That rules out the tempting fix of `Disallow: /` for the old domain, and
//    it would be the wrong fix anyway: blocking a duplicate stops the crawler
//    reading the canonical tag that consolidates it, so the URL can stay in the
//    index with no snippet instead of folding into the canonical. The correct
//    fix is the 308 at the domain level. Until that lands, the sitemap and host
//    lines below both name the canonical origin, which is the strongest signal
//    a shared file can carry.
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

// Shared URL validation utility — used by both the admin validate-urls route
// and the weekly cron job. Keeping it here avoids importing across API routes.

const GENERIC_GRANT_WORDS = new Set([
  'trust', 'funds', 'grant', 'grants', 'charity', 'health', 'foundation',
  'community', 'national', 'lottery', 'local', 'england', 'council',
])

function extractDistinctiveWords(funderName: string): string[] {
  return funderName
    .toLowerCase()
    .split(/[\s\-']+/)
    .map(w => w.replace(/[^a-z]/g, ''))
    .filter(w => w.length > 4 && !GENERIC_GRANT_WORDS.has(w))
}

// Returns 'ok' | 'dead'.
// Catches hard 404s, soft 404s (homepage redirects), content 404s,
// DNS failures (domain no longer exists), and wrong-page redirects
// (content sniffing: funder name absent from page HTML).
export async function checkUrl(url: string, funderName?: string): Promise<'ok' | 'dead'> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GrantTracker/1.0; +https://grant-tracker-kappa.vercel.app)',
      },
    })

    // ── Hard failures ──────────────────────────────────────────────────────────
    if (res.status === 404 || res.status === 410 || res.status === 400) return 'dead'

    // ── Soft 404 detection ─────────────────────────────────────────────────────
    const finalUrl = res.url
    if (finalUrl && finalUrl !== url) {
      try {
        const orig  = new URL(url)
        const final = new URL(finalUrl)

        const origHost  = orig.hostname.replace(/^www\./, '')
        const finalHost = final.hostname.replace(/^www\./, '')
        const sameDomain = origHost === finalHost

        const origDepth  = orig.pathname.replace(/\/$/, '').split('/').filter(Boolean).length
        const finalDepth = final.pathname.replace(/\/$/, '').split('/').filter(Boolean).length

        if (sameDomain) {
          const origPath  = orig.pathname.replace(/\/$/, '') || '/'
          const finalPath = final.pathname.replace(/\/$/, '') || '/'

          if (origDepth >= 2 && finalDepth <= 1) return 'dead'

          if (
            finalPath !== origPath &&
            origPath.startsWith(finalPath + '/') &&
            origDepth >= finalDepth + 1
          ) return 'dead'
        } else {
          return 'dead'
        }
      } catch {
        // URL parse failed — ignore soft-404 check
      }
    }

    // ── Content checks ─────────────────────────────────────────────────────────
    try {
      const contentType = res.headers.get('content-type') ?? ''
      if (contentType.includes('text/html')) {
        const buf = await res.arrayBuffer()
        const html = new TextDecoder().decode(new Uint8Array(buf).slice(0, 30720))

        // 1. <title> tag check
        const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
        if (titleMatch) {
          const title = titleMatch[1].toLowerCase()
          if (
            title.includes('404') ||
            title.includes('not found') ||
            title.includes('page not found') ||
            title.includes('error 404')
          ) return 'dead'
        }

        // 2. <h1> / <h2> heading check
        const headingMatches = Array.from(html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi))
        for (const m of headingMatches) {
          const heading = m[1].replace(/<[^>]+>/g, '').toLowerCase().trim()
          if (
            heading === '404' ||
            heading === 'not found' ||
            heading === 'page not found' ||
            heading === 'no results found' ||
            heading === 'content not found' ||
            heading === 'sorry, page not found' ||
            heading.includes('page could not be found') ||
            heading.includes("page doesn't exist") ||
            heading.includes('page does not exist') ||
            heading.includes('page you requested') ||
            heading.includes('page you are looking for')
          ) return 'dead'
        }

        // 3. Content sniffing — funder name verification
        if (funderName) {
          const distinctiveWords = extractDistinctiveWords(funderName)
          if (distinctiveWords.length > 0) {
            const htmlLower = html.toLowerCase()
            const anyMatch = distinctiveWords.some(w => htmlLower.includes(w))
            if (!anyMatch) return 'dead'
          }
        }
      }
    } catch {
      // Body read failed — rely on status/redirect checks only
    }

    return 'ok'
  } catch (err: unknown) {
    const msg   = err instanceof Error ? err.message : String(err)
    const cause = (err instanceof Error && err.cause instanceof Error) ? err.cause.message : ''
    const combined = `${msg} ${cause}`.toLowerCase()

    if (combined.includes('enotfound')) return 'dead'

    return 'ok'
  }
}

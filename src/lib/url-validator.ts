// Shared URL validation utility — used by both the admin validate-urls route
// and the weekly cron job. Keeping it here avoids importing across API routes.

// Browser-like headers: bare 'GrantTracker/1.0' UA was 403ing on Cloudflare /
// WAF-protected funders (Aldi, Tesco, Arts Council etc.), causing the
// validator to mass-flag legitimate live URLs as dead. Match the same Chrome
// header set used by crawl.ts/fetchHtml so both code paths agree.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"macOS"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
} as const

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

// ── Title keyword extraction ──────────────────────────────────────────────────
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'your',
  'their', 'which', 'about', 'been', 'have', 'will', 'more', 'than',
  'also', 'only', 'other', 'such', 'very', 'just', 'over', 'under',
  'through', 'between', 'being', 'those', 'each', 'were', 'they',
  // Grant-generic words that appear on almost every funder page
  'fund', 'funds', 'grant', 'grants', 'funding', 'programme', 'program',
  'apply', 'application', 'applications', 'scheme', 'award', 'awards',
  'support', 'organisation', 'organizations', 'organisations', 'charity',
  'charities', 'project', 'projects', 'community', 'communities',
])

function extractTitleKeywords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w))
}

// ── Grant-closed detection ────────────────────────────────────────────────────
const GRANT_CLOSED_PATTERNS = [
  /this\s+(grant|fund|programme|scheme|award)\s+(is\s+)?(now\s+)?closed/i,
  /applications?\s+(are|is)?\s*(now\s+)?(closed|no longer)/i,
  /no\s+longer\s+(accepting|taking|open\s+to|available)/i,
  /this\s+(grant|fund|opportunity|programme)\s+has\s+(closed|ended)/i,
  /funding\s+round\s*(has\s+)?(expired|closed|ended)/i,
  /programme\s+has\s+(ended|closed|been\s+discontinued)/i,
  /this\s+funding\s+(is|has)\s+(no\s+longer|been\s+closed|closed)/i,
  /deadline\s+has\s+passed/i,
  /grant\s+(has\s+been|was)\s+(closed|withdrawn|discontinued)/i,
]

function containsGrantClosedIndicators(html: string): boolean {
  // Only check the first 30KB — closed indicators are usually near the top
  const snippet = html.slice(0, 30000)
  return GRANT_CLOSED_PATTERNS.some(p => p.test(snippet))
}

// ── Generic page path detection ───────────────────────────────────────────────
const GENERIC_PATH_SEGMENTS = [
  'about', 'contact', 'news', 'press', 'blog', 'privacy', 'cookie',
  'careers', 'jobs', 'team', 'login', 'register', 'sustainability',
  'corporate-responsibility', 'csr', 'who-we-are', 'our-story',
]

function isGenericPagePath(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase()
    // If the path also has grant keywords, it's not generic
    const grantKw = ['grant', 'fund', 'apply', 'application', 'award', 'programme', 'scheme', 'bursary']
    if (grantKw.some(k => path.includes(k))) return false
    return GENERIC_PATH_SEGMENTS.some(s => path.includes(s))
  } catch { return false }
}

// ── Deep URL quality check ────────────────────────────────────────────────────

export type DeepCheckResult = {
  status: 'ok' | 'dead' | 'wrong_page' | 'grant_closed'
  qualityScore: number   // 0–100
  issues: string[]       // e.g. ['no_title_match', 'generic_page']
}

export async function deepCheckUrl(
  url: string,
  funderName: string,
  grantTitle: string,
): Promise<DeepCheckResult> {
  const issues: string[] = []
  let qualityScore = 50

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow',
      headers: BROWSER_HEADERS,
    })

    // ── Hard 404 ────────────────────────────────────────────────────────────────
    if (res.status === 404 || res.status === 410 || res.status === 400) {
      return { status: 'dead', qualityScore: 0, issues: ['http_404'] }
    }

    // ── Redirect-to-homepage ────────────────────────────────────────────────────
    const finalUrl = res.url
    if (finalUrl && finalUrl !== url) {
      try {
        const orig  = new URL(url)
        const final = new URL(finalUrl)
        const origHost  = orig.hostname.replace(/^www\./, '')
        const finalHost = final.hostname.replace(/^www\./, '')

        if (origHost !== finalHost) {
          return { status: 'dead', qualityScore: 5, issues: ['redirect_different_domain'] }
        }

        const origDepth  = orig.pathname.replace(/\/$/, '').split('/').filter(Boolean).length
        const finalDepth = final.pathname.replace(/\/$/, '').split('/').filter(Boolean).length

        if (origDepth >= 2 && finalDepth <= 1) {
          return { status: 'dead', qualityScore: 10, issues: ['redirect_to_homepage'] }
        }
      } catch { /* ignore */ }
    }

    // ── Content checks ──────────────────────────────────────────────────────────
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) {
      // PDFs, images, etc. — can't inspect but not dead
      return { status: 'ok', qualityScore: 40, issues: ['not_html'] }
    }

    let html: string
    try {
      const buf = await res.arrayBuffer()
      html = new TextDecoder().decode(new Uint8Array(buf).slice(0, 50000))
    } catch {
      return { status: 'ok', qualityScore: 30, issues: ['body_read_failed'] }
    }

    const htmlLower = html.toLowerCase()

    // ── Title-tag 404 check ─────────────────────────────────────────────────────
    const pageTitleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
    if (pageTitleMatch) {
      const t = pageTitleMatch[1].toLowerCase()
      if (t.includes('404') || t.includes('not found') || t.includes('page not found') || t.includes('error 404')) {
        return { status: 'dead', qualityScore: 0, issues: ['soft_404_title'] }
      }
    }

    // ── Heading 404 check ───────────────────────────────────────────────────────
    const headings = Array.from(html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi))
    for (const m of headings) {
      const h = m[1].replace(/<[^>]+>/g, '').toLowerCase().trim()
      if (
        h === '404' || h === 'not found' || h === 'page not found' ||
        h === 'no results found' || h === 'content not found' ||
        h.includes('page could not be found') || h.includes("page doesn't exist") ||
        h.includes('page does not exist')
      ) {
        return { status: 'dead', qualityScore: 0, issues: ['soft_404_heading'] }
      }
    }

    // ── Grant-closed detection ──────────────────────────────────────────────────
    if (containsGrantClosedIndicators(html)) {
      issues.push('grant_closed')
      qualityScore -= 20
      // Don't return yet — still score title/funder for the report
    }

    // ── Funder name check ───────────────────────────────────────────────────────
    const distinctiveWords = extractDistinctiveWords(funderName)
    if (distinctiveWords.length > 0) {
      const funderMatch = distinctiveWords.some(w => htmlLower.includes(w))
      if (!funderMatch) {
        issues.push('funder_missing')
        qualityScore -= 40
      } else {
        qualityScore += 15
      }
    }

    // ── Grant title keyword matching (the big new check) ────────────────────────
    const titleKeywords = extractTitleKeywords(grantTitle)
    if (titleKeywords.length > 0) {
      const matched = titleKeywords.filter(kw => htmlLower.includes(kw))
      const ratio = matched.length / titleKeywords.length

      if (ratio < 0.2) {
        issues.push('no_title_match')
        qualityScore -= 45
      } else if (ratio < 0.5) {
        issues.push('weak_title_match')
        qualityScore -= 25
      } else {
        qualityScore += 25
      }
    }

    // ── Generic page path check ─────────────────────────────────────────────────
    if (isGenericPagePath(url)) {
      issues.push('generic_page')
      qualityScore -= 30
    }

    // ── Very short page ─────────────────────────────────────────────────────────
    if (html.length < 2000) {
      issues.push('very_short_page')
      qualityScore -= 15
    }

    // ── Clamp and classify ──────────────────────────────────────────────────────
    qualityScore = Math.max(0, Math.min(100, qualityScore))

    let status: DeepCheckResult['status'] = 'ok'
    if (issues.includes('grant_closed') && qualityScore < 40) {
      status = 'grant_closed'
    } else if (qualityScore < 30) {
      status = 'wrong_page'
    }

    return { status, qualityScore, issues }

  } catch (err: unknown) {
    const msg   = err instanceof Error ? err.message : String(err)
    const cause = (err instanceof Error && err.cause instanceof Error) ? err.cause.message : ''
    const combined = `${msg} ${cause}`.toLowerCase()

    if (combined.includes('enotfound')) {
      return { status: 'dead', qualityScore: 0, issues: ['dns_failed'] }
    }

    return { status: 'ok', qualityScore: 25, issues: ['network_error'] }
  }
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
      headers: BROWSER_HEADERS,
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

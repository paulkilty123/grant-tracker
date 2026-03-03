import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { SEED_GRANTS } from '@/lib/grants'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min — enough for 800+ URLs at 20 concurrent

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

// ── Auth ──────────────────────────────────────────────────────────────────────
// Accepts either:
//   1. Bearer token matching ADMIN_SECRET  (used by cron / scheduled task)
//   2. Authenticated Supabase session for the admin email  (used by the UI)
async function isAuthorised(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.replace('Bearer ', '').trim()
  if (token && token === process.env.ADMIN_SECRET) return true

  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.email === ADMIN_EMAIL
  } catch {
    return false
  }
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── Content sniffing helper ───────────────────────────────────────────────────
// Extracts "distinctive" words from a funder name — words that are long enough
// and specific enough that their absence from the page HTML strongly suggests
// the URL has landed on a completely unrelated page (e.g. domain moves).
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

// ── URL checker ───────────────────────────────────────────────────────────────
// Returns 'ok' | 'dead'.
// Catches hard 404s, soft 404s (homepage redirects), content 404s,
// DNS failures (domain no longer exists), and wrong-page redirects
// (content sniffing: funder name absent from page HTML).
export async function checkUrl(url: string, funderName?: string): Promise<'ok' | 'dead'> {
  try {
    // follow redirects so res.url gives us the final destination
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
      // Use a realistic browser UA — some grant sites block obvious bot agents
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GrantTracker/1.0; +https://grant-tracker-kappa.vercel.app)',
      },
    })

    // ── Hard failures ─────────────────────────────────────────────────────────
    if (res.status === 404 || res.status === 410 || res.status === 400) return 'dead'

    // ── Soft 404 detection ────────────────────────────────────────────────────
    // Many charity sites silently redirect dead grant pages to their homepage
    // or a top-level section rather than returning a proper 404.
    // We flag a URL as dead if after following redirects it lands on a page
    // that is clearly not the specific grant page we asked for.
    const finalUrl = res.url  // populated by fetch after following all redirects
    if (finalUrl && finalUrl !== url) {
      try {
        const orig  = new URL(url)
        const final = new URL(finalUrl)

        // Only inspect same-domain or www-variant redirects — cross-domain
        // redirects to unrelated sites are also treated as dead below.
        const origHost  = orig.hostname.replace(/^www\./, '')
        const finalHost = final.hostname.replace(/^www\./, '')
        const sameDomain = origHost === finalHost

        const origDepth  = orig.pathname.replace(/\/$/, '').split('/').filter(Boolean).length
        const finalDepth = final.pathname.replace(/\/$/, '').split('/').filter(Boolean).length

        if (sameDomain) {
          const origPath  = orig.pathname.replace(/\/$/, '') || '/'
          const finalPath = final.pathname.replace(/\/$/, '') || '/'

          // 1. Redirected to homepage or root-level page
          if (origDepth >= 2 && finalDepth <= 1) return 'dead'

          // 2. Redirected to a parent path — the specific page no longer exists
          //    e.g. /programmes/fellowship-2022  →  /programmes  (parent section)
          //    Detected by: final path is a strict prefix of original path
          if (
            finalPath !== origPath &&
            origPath.startsWith(finalPath + '/') &&
            origDepth >= finalDepth + 1
          ) return 'dead'
        } else {
          // Redirected to a completely different domain — almost always dead
          return 'dead'
        }
      } catch {
        // URL parse failed — ignore soft-404 check, rely on status code only
      }
    }

    // ── Content checks (title + headings + funder name sniffing) ─────────────
    // Read only the first 30 KB — enough to cover <head> and opening content.
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

        // 2. <h1> / <h2> heading check — catches patterns like "No Results Found"
        //    that use a 200 status but clearly indicate a missing page.
        const headingMatches = Array.from(html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi))
        for (const m of headingMatches) {
          // Strip any inner HTML tags (e.g. <span>, <a>) to get plain text
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

        // 3. Content sniffing — check the page mentions the funder
        //    If we have a funder name, extract distinctive words and verify at
        //    least one appears in the HTML. A page with NONE of the distinctive
        //    funder words is almost certainly the wrong page (e.g. domain moved).
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
    // ── Distinguish DNS failures from transient timeouts ───────────────────────
    // ENOTFOUND = the domain doesn't exist in DNS — almost certainly permanently
    // dead (e.g. jackpetchey.org.uk which moved to jackpetcheyfoundation.org.uk).
    // Timeouts and other transient errors get the benefit of the doubt.
    const msg   = err instanceof Error ? err.message : String(err)
    const cause = (err instanceof Error && err.cause instanceof Error) ? err.cause.message : ''
    const combined = `${msg} ${cause}`.toLowerCase()

    if (combined.includes('enotfound')) return 'dead'

    // Timeout or other transient network error — check again tomorrow
    return 'ok'
  }
}

// ── Batch helper ──────────────────────────────────────────────────────────────
// Runs fn over items in chunks of `size` concurrently.
async function inBatches<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
  }
  return results
}

// ── GET — return current stats ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!await isAuthorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('scraped_grants')
    .select('url_status, apply_url')
    .eq('is_active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const total     = data.length
  const withUrl   = data.filter(g => g.apply_url).length
  const ok        = data.filter(g => g.url_status === 'ok').length
  const dead      = data.filter(g => g.url_status === 'dead').length
  const unchecked = data.filter(g => g.url_status === 'unchecked').length

  // Also count SEED_GRANTS with a URL
  const seedTotal = SEED_GRANTS.filter(g => g.applyUrl).length

  return NextResponse.json({ total, withUrl, ok, dead, unchecked, seedTotal })
}

// ── POST — run validation ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getAdminClient()

  // Fetch all active grants that have a URL (include funder for content sniffing)
  const { data: grants, error } = await supabase
    .from('scraped_grants')
    .select('id, apply_url, funder')
    .eq('is_active', true)
    .not('apply_url', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!grants || grants.length === 0) return NextResponse.json({ checked: 0, dead: 0, ok: 0, deadSeedGrants: [] })

  let checkedCount = 0
  let deadCount    = 0
  let okCount      = 0

  // Check in batches of 20 concurrent requests
  await inBatches(grants, 20, async (grant) => {
    const status = await checkUrl(grant.apply_url as string, grant.funder ?? undefined)
    checkedCount++
    if (status === 'dead') deadCount++
    else okCount++

    await supabase
      .from('scraped_grants')
      .update({ url_status: status, url_last_checked: new Date().toISOString() })
      .eq('id', grant.id)
  })

  // ── Also check SEED_GRANTS ────────────────────────────────────────────────
  const seedGrantsWithUrl = SEED_GRANTS.filter(g => g.applyUrl)
  const deadSeedGrants: { id: string; title: string; funder: string; url: string }[] = []

  await inBatches(seedGrantsWithUrl, 10, async (grant) => {
    const status = await checkUrl(grant.applyUrl as string, grant.funder)
    if (status === 'dead') {
      deadSeedGrants.push({
        id:     grant.id,
        title:  grant.title,
        funder: grant.funder,
        url:    grant.applyUrl as string,
      })
    }
  })

  return NextResponse.json({
    checked: checkedCount,
    ok: okCount,
    dead: deadCount,
    deadSeedGrants,
    ranAt: new Date().toISOString(),
  })
}

// ── PATCH — update a single grant's URL ──────────────────────────────────────
export async function PATCH(req: NextRequest) {
  if (!await isAuthorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, apply_url, funder } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = getAdminClient()

  // Re-check the new URL immediately if one was provided
  let url_status: 'ok' | 'dead' | 'unchecked' = 'unchecked'
  if (apply_url) {
    url_status = await checkUrl(apply_url, funder ?? undefined)
  }

  const { error } = await supabase
    .from('scraped_grants')
    .update({ apply_url, url_status, url_last_checked: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id, apply_url, url_status })
}

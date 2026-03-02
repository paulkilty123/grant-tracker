import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

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

// ── URL checker ───────────────────────────────────────────────────────────────
// Returns 'ok' | 'dead'.
// Catches both hard 404s AND soft 404s (pages that redirect to homepage).
async function checkUrl(url: string): Promise<'ok' | 'dead'> {
  try {
    // follow redirects so res.url gives us the final destination
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
      headers: { 'User-Agent': 'GrantTracker-URLChecker/1.0' },
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

    return 'ok'
  } catch {
    // Timeout or network error — benefit of the doubt, check again tomorrow
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

  return NextResponse.json({ total, withUrl, ok, dead, unchecked })
}

// ── POST — run validation ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getAdminClient()

  // Fetch all active grants that have a URL
  const { data: grants, error } = await supabase
    .from('scraped_grants')
    .select('id, apply_url')
    .eq('is_active', true)
    .not('apply_url', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!grants || grants.length === 0) return NextResponse.json({ checked: 0, dead: 0, ok: 0 })

  let checkedCount = 0
  let deadCount    = 0
  let okCount      = 0

  // Check in batches of 20 concurrent requests
  await inBatches(grants, 20, async (grant) => {
    const status = await checkUrl(grant.apply_url as string)
    checkedCount++
    if (status === 'dead') deadCount++
    else okCount++

    await supabase
      .from('scraped_grants')
      .update({ url_status: status, url_last_checked: new Date().toISOString() })
      .eq('id', grant.id)
  })

  return NextResponse.json({
    checked: checkedCount,
    ok: okCount,
    dead: deadCount,
    ranAt: new Date().toISOString(),
  })
}

// ── PATCH — update a single grant's URL ──────────────────────────────────────
export async function PATCH(req: NextRequest) {
  if (!await isAuthorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, apply_url } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = getAdminClient()

  // Re-check the new URL immediately if one was provided
  let url_status: 'ok' | 'dead' | 'unchecked' = 'unchecked'
  if (apply_url) {
    url_status = await checkUrl(apply_url)
  }

  const { error } = await supabase
    .from('scraped_grants')
    .update({ apply_url, url_status, url_last_checked: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id, apply_url, url_status })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { SEED_GRANTS } from '@/lib/grants'
import { checkUrl } from '@/lib/url-validator'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

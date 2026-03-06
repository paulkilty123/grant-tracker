import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { checkUrl } from '@/lib/url-validator'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

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

async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += size) {
    const batchResults = await Promise.all(items.slice(i, i + size).map(fn))
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

  return NextResponse.json({
    total:     data.length,
    withUrl:   data.filter(g => g.apply_url).length,
    ok:        data.filter(g => g.url_status === 'ok').length,
    dead:      data.filter(g => g.url_status === 'dead').length,
    unchecked: data.filter(g => g.url_status === 'unchecked').length,
    seedTotal: 0,  // seeds now live in DB
  })
}

// ── POST — validate a chunk of grants ────────────────────────────────────────
// Body: { offset?: number; limit?: number }
// Returns: { checked, ok, dead, total, done }
// The client calls this repeatedly, advancing offset each time, until done=true.
export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { offset?: number; limit?: number }
  const offset = body.offset ?? 0
  const limit  = body.limit  ?? 50   // 50 per call — safe within 60s

  const supabase = getAdminClient()

  // Fetch the total count of checkable grants (once, at offset 0)
  let total = 0
  if (offset === 0) {
    const { count } = await supabase
      .from('scraped_grants')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .not('apply_url', 'is', null)
    total = count ?? 0
  }

  // Fetch this chunk
  const { data: grants, error } = await supabase
    .from('scraped_grants')
    .select('id, apply_url, funder')
    .eq('is_active', true)
    .not('apply_url', 'is', null)
    .order('id')            // stable order across calls
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!grants || grants.length === 0) {
    return NextResponse.json({ checked: 0, ok: 0, dead: 0, total, done: true })
  }

  let okCount   = 0
  let deadCount = 0

  await inBatches(grants, 10, async (grant) => {
    const status = await checkUrl(grant.apply_url as string, grant.funder ?? undefined)
    if (status === 'dead') deadCount++
    else okCount++
    await supabase
      .from('scraped_grants')
      .update({ url_status: status, url_last_checked: new Date().toISOString() })
      .eq('id', grant.id)
  })

  const done = grants.length < limit  // last page when fewer rows returned than requested

  return NextResponse.json({
    checked: grants.length,
    ok:      okCount,
    dead:    deadCount,
    total,
    done,
    nextOffset: offset + grants.length,
    deadSeedGrants: [],  // seeds now in DB — no separate seed check needed
  })
}

// ── PATCH — update a single grant's URL ──────────────────────────────────────
export async function PATCH(req: NextRequest) {
  if (!await isAuthorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, apply_url, funder } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = getAdminClient()
  let url_status: 'ok' | 'dead' | 'unchecked' = 'unchecked'
  if (apply_url) url_status = await checkUrl(apply_url, funder ?? undefined)

  const { error } = await supabase
    .from('scraped_grants')
    .update({ apply_url, url_status, url_last_checked: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id, apply_url, url_status })
}

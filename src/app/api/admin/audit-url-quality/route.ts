// Bulk deep audit of URL quality — scans grants and writes quality scores + issues.
// Called from the admin UI in batches (same polling pattern as validate-urls).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { deepCheckUrl } from '@/lib/url-validator'

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
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

// ── POST — audit a chunk of grants ────────────────────────────────────────────
// Body: { offset?: number; limit?: number }
// Returns: { checked, byIssue, avgScore, total, done, nextOffset }
export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { offset?: number; limit?: number }
  const offset = body.offset ?? 0
  const limit  = Math.min(body.limit ?? 30, 30) // 30 max — deepCheckUrl is slower than checkUrl

  const supabase = getAdminClient()

  // Total count (sent on first call)
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
    .select('id, apply_url, funder, title')
    .eq('is_active', true)
    .not('apply_url', 'is', null)
    .order('id')
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!grants || grants.length === 0) {
    return NextResponse.json({ checked: 0, total, done: true, byIssue: {}, avgScore: 0 })
  }

  // Counters for this batch
  const issueCounts: Record<string, number> = {}
  let scoreSum = 0
  let deadCount = 0
  let closedCount = 0
  let wrongPageCount = 0

  // Process in parallel batches of 8 (each takes ~10s worst case → ~40s total)
  await inBatches(grants, 8, async (grant) => {
    const result = await deepCheckUrl(
      grant.apply_url as string,
      (grant.funder as string) ?? '',
      (grant.title as string) ?? '',
    )

    scoreSum += result.qualityScore
    if (result.status === 'dead') deadCount++
    if (result.status === 'grant_closed') closedCount++
    if (result.status === 'wrong_page') wrongPageCount++

    for (const issue of result.issues) {
      issueCounts[issue] = (issueCounts[issue] ?? 0) + 1
    }

    // Write quality data back to DB
    const updates: Record<string, unknown> = {
      url_quality_score:  result.qualityScore,
      url_quality_issues: result.issues,
    }

    // Also update url_status if deepCheck found something the basic check missed
    if (result.status === 'dead') {
      updates.url_status       = 'dead'
      updates.url_last_checked = new Date().toISOString()
      updates.is_active        = false
    } else if (result.status === 'grant_closed') {
      updates.url_status       = 'dead'
      updates.url_last_checked = new Date().toISOString()
      updates.is_active        = false
    }

    await supabase.from('scraped_grants').update(updates).eq('id', grant.id)
  })

  const done = grants.length < limit

  return NextResponse.json({
    checked:  grants.length,
    dead:     deadCount,
    closed:   closedCount,
    wrongPage: wrongPageCount,
    avgScore: Math.round(scoreSum / grants.length),
    byIssue:  issueCounts,
    total,
    done,
    nextOffset: offset + grants.length,
  })
}

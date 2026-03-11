// Weekly cron — runs every Monday at 03:00 UTC
// 1. Checks all active scraped_grants with an apply_url
// 2. Marks dead ones as url_status='dead' AND is_active=false (auto-deactivate)
// 3. Checks all SEED_GRANTS URLs and logs dead ones
// 4. Returns a JSON summary (visible in Vercel cron logs)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkUrl, deepCheckUrl } from '@/lib/url-validator'
import { SEED_GRANTS } from '@/lib/grants'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

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

export async function GET(req: NextRequest) {
  // Auth: Vercel passes Authorization: Bearer <CRON_SECRET> on cron invocations.
  // In development (no CRON_SECRET set), skip the check.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = getAdminClient()
  const ranAt    = new Date().toISOString()

  // ── 1. Fetch all active scraped grants with a URL ─────────────────────────
  const { data: grants, error } = await supabase
    .from('scraped_grants')
    .select('id, title, apply_url, funder')
    .eq('is_active', true)
    .not('apply_url', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let checkedScraped   = 0
  let okScraped        = 0
  let deactivatedCount = 0
  let closedCount      = 0
  const deactivated: { id: string; title: string }[] = []

  // ── 2. Deep-check each grant URL (quality + liveness) ─────────────────────
  await inBatches(grants ?? [], 15, async (grant) => {
    const result = await deepCheckUrl(
      grant.apply_url as string,
      (grant.funder as string) ?? '',
      (grant.title as string) ?? '',
    )
    checkedScraped++

    if (result.status === 'dead' || result.status === 'grant_closed') {
      // Mark as dead/closed AND deactivate
      await supabase
        .from('scraped_grants')
        .update({
          url_status:         'dead',
          url_last_checked:   ranAt,
          is_active:          false,
          url_quality_score:  result.qualityScore,
          url_quality_issues: result.issues,
        })
        .eq('id', grant.id)

      deactivatedCount++
      if (result.status === 'grant_closed') closedCount++
      deactivated.push({ id: grant.id, title: grant.title as string })
    } else {
      // Keep active — write quality metrics alongside status
      const urlStatus = result.status === 'wrong_page' ? 'unchecked' as const : 'ok' as const
      await supabase
        .from('scraped_grants')
        .update({
          url_status:         urlStatus,
          url_last_checked:   ranAt,
          url_quality_score:  result.qualityScore,
          url_quality_issues: result.issues,
        })
        .eq('id', grant.id)
      okScraped++
    }
  })

  // ── 3. Check SEED_GRANTS URLs ─────────────────────────────────────────────
  const seedWithUrl = SEED_GRANTS.filter(g => g.applyUrl)
  const deadSeedGrants: { id: string; title: string; funder: string; url: string }[] = []

  await inBatches(seedWithUrl, 10, async (grant) => {
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

  // ── 4. Return summary ─────────────────────────────────────────────────────
  return NextResponse.json({
    ranAt,
    scraped: {
      checked:     checkedScraped,
      ok:          okScraped,
      deactivated: deactivatedCount,
      closed:      closedCount,
      grants:      deactivated,
    },
    seed: {
      checked: seedWithUrl.length,
      dead:    deadSeedGrants.length,
      grants:  deadSeedGrants,
    },
  })
}

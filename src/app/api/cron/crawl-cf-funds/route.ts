// Vercel Cron handler — weekly, Monday 05:00 UTC, batched.
//
// Runs the AI-extraction pipeline (src/lib/cf-fund-extract.ts) across all
// configured Community Foundations, surfacing only funds at or above
// AMOUNT_THRESHOLD as new/updated Needs Review rows. See cf-fund-extract.ts
// for the full rationale and the dedup fix this pipeline depends on.
//
// Batching: 31 CFs at ~20-40s each (fetch + Sonnet call; larger listing pages
// like Kent's 40+ funds or Cumbria's 200+ take longer) won't fit in one
// invocation under the 270s cap — mirrors crawl-grants' exact `?batch=N`
// pattern (src/app/api/cron/crawl-grants/route.ts), just sized differently.
// BATCH_SIZE=6 → 6 batches; vercel.json schedules each a few minutes apart.
//
// Gate interaction: mirrors reenrich-stale/route.ts exactly. Scheduled cron
// calls are a no-op until CF_FUND_PIPELINE_CRON_ENABLED=true is set — this
// is the pilot gate Paul controls to verify results before trusting the
// weekly schedule. Manual admin triggers (bearer ADMIN_SECRET or an admin
// session) always run regardless of the gate, which is how pilot
// verification happens with no UI required:
//   GET /api/cron/crawl-cf-funds                  — every configured CF (admin use only — too slow for a real cron invocation at full scale)
//   GET /api/cron/crawl-cf-funds?slug=cornwall_cf  — a single CF
//   GET /api/cron/crawl-cf-funds?batch=1           — CFs 1-6 (0-indexed batch of BATCH_SIZE)

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { CF_FUND_SOURCES, extractFundsFromCF, CFFundResult, CFFundConfig } from '@/lib/cf-fund-extract'

export const dynamic     = 'force-dynamic'
export const maxDuration = 270
const BATCH_SIZE = 6

export async function GET(req: NextRequest) {
  const auth       = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  const isCronCaller  = !!(cronSecret && auth === `Bearer ${cronSecret}`)
  const isAdminCaller = !isCronCaller && (
    isAdminBearerToken(auth) || (await requireAdmin()).ok
  )
  if (!isCronCaller && !isAdminCaller) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (isCronCaller && process.env.CF_FUND_PIPELINE_CRON_ENABLED !== 'true') {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason:  'CF fund pipeline cron disabled — set CF_FUND_PIPELINE_CRON_ENABLED=true to enable automated runs. Admin manual triggers still execute.',
    })
  }

  const url        = new URL(req.url)
  const slug       = url.searchParams.get('slug')
  const batchParam = url.searchParams.get('batch')

  let targets: CFFundConfig[]
  if (slug) {
    targets = CF_FUND_SOURCES.filter(c => c.slug === slug)
    if (targets.length === 0) return NextResponse.json({ error: `unknown slug "${slug}"` }, { status: 400 })
  } else if (batchParam !== null) {
    const batchNum = parseInt(batchParam, 10)
    if (!Number.isInteger(batchNum) || batchNum < 1) {
      return NextResponse.json({ error: `invalid batch "${batchParam}"` }, { status: 400 })
    }
    const start = (batchNum - 1) * BATCH_SIZE
    targets = CF_FUND_SOURCES.slice(start, start + BATCH_SIZE)
  } else {
    targets = CF_FUND_SOURCES
  }

  const settled = await Promise.allSettled(targets.map(config => extractFundsFromCF(config)))

  const results: CFFundResult[] = settled.map((s, i) =>
    s.status === 'fulfilled'
      ? s.value
      : {
          slug: targets[i].slug,
          funderName: targets[i].funderName,
          extracted: 0, atOrAboveThreshold: 0, discardedBelowThreshold: 0, discardedUnstated: 0,
          inserted: 0, updated: 0, discardedDetail: [],
          errors: [s.reason instanceof Error ? s.reason.message : String(s.reason)],
        }
  )

  const totals = results.reduce((acc, r) => ({
    extracted:               acc.extracted + r.extracted,
    atOrAboveThreshold:      acc.atOrAboveThreshold + r.atOrAboveThreshold,
    discardedBelowThreshold: acc.discardedBelowThreshold + r.discardedBelowThreshold,
    discardedUnstated:       acc.discardedUnstated + r.discardedUnstated,
    inserted:                acc.inserted + r.inserted,
    updated:                 acc.updated + r.updated,
  }), { extracted: 0, atOrAboveThreshold: 0, discardedBelowThreshold: 0, discardedUnstated: 0, inserted: 0, updated: 0 })

  return NextResponse.json({ success: true, totals, results })
}

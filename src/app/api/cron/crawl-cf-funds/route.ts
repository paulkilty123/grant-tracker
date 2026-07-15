// Vercel Cron handler — weekly, Monday 05:00 UTC.
//
// Runs the AI-extraction pipeline (src/lib/cf-fund-extract.ts) across the
// pilot set of Community Foundations, surfacing only funds at or above
// AMOUNT_THRESHOLD as new/updated Needs Review rows. See cf-fund-extract.ts
// for the full rationale and the dedup fix this pipeline depends on.
//
// Gate interaction: mirrors reenrich-stale/route.ts exactly. Scheduled cron
// calls are a no-op until CF_FUND_PIPELINE_CRON_ENABLED=true is set — this
// is the pilot gate Paul controls to verify results before trusting the
// weekly schedule. Manual admin triggers (bearer ADMIN_SECRET or an admin
// session) always run regardless of the gate, which is how pilot
// verification happens with no UI required:
//   GET /api/cron/crawl-cf-funds                  — all pilot CFs
//   GET /api/cron/crawl-cf-funds?slug=cornwall_cf  — a single CF

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { CF_FUND_SOURCES, extractFundsFromCF, CFFundResult } from '@/lib/cf-fund-extract'

export const dynamic     = 'force-dynamic'
export const maxDuration = 270 // 5 CFs × ~20-40s (fetch + Sonnet call) comfortably fits; batch via ?slug= if this grows

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

  const url  = new URL(req.url)
  const slug = url.searchParams.get('slug')
  const targets = slug
    ? CF_FUND_SOURCES.filter(c => c.slug === slug)
    : CF_FUND_SOURCES

  if (slug && targets.length === 0) {
    return NextResponse.json({ error: `unknown slug "${slug}"` }, { status: 400 })
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

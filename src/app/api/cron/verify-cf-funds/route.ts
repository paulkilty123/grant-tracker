// Vercel Cron handler — runs after crawl-grants (which runs the eligibility/
// sector classifier as part of its own pass) so newly-inserted CF fund rows
// have had a chance to reach pipeline_state='tagged' before this checks them.
// See src/lib/cf-fund-verify.ts for what's actually being checked and why.
//
// Gate interaction: mirrors crawl-cf-funds/route.ts and reenrich-stale/route.ts
// exactly. Scheduled cron calls are a no-op until CF_FUND_VERIFY_CRON_ENABLED=
// true is set — kept off until a manual admin-triggered run has been
// eyeballed at least once. Manual admin triggers (bearer ADMIN_SECRET or an
// admin session) always run regardless of the gate:
//   GET /api/cron/verify-cf-funds
//   GET /api/cron/verify-cf-funds?dryRun=true   — admin/testing only, no writes

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { verifyPendingCFFunds } from '@/lib/cf-fund-verify'

export const dynamic     = 'force-dynamic'
export const maxDuration = 270

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

  if (isCronCaller && process.env.CF_FUND_VERIFY_CRON_ENABLED !== 'true') {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason:  'CF fund verify cron disabled — set CF_FUND_VERIFY_CRON_ENABLED=true to enable automated runs. Admin manual triggers still execute.',
    })
  }

  // dryRun is ignored for the scheduled cron caller — only an admin caller
  // (bearer ADMIN_SECRET or session) can request a preview with no writes.
  const dryRun = isAdminCaller && new URL(req.url).searchParams.get('dryRun') === 'true'

  const result = await verifyPendingCFFunds(undefined, { dryRun })
  return NextResponse.json({ success: true, dryRun, ...result })
}

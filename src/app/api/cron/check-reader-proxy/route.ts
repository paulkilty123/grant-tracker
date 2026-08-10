import { NextRequest, NextResponse } from 'next/server'
import { recordRun } from '@/lib/admin/cron-runs'
import { checkReaderProxy } from '@/lib/verification/proxy-health'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Daily canary for the reader proxy.
 *
 * Records into `cron_runs` like every other job, so a dead proxy shows as a red
 * row on the admin Pipeline page within a day instead of going unnoticed for
 * sixteen. It deliberately THROWS when the proxy is unhealthy rather than
 * returning a tidy 200 with ok:false in the body — `recordRun` only marks a run
 * `ok = false` when the handler throws, and a green row saying "everything is
 * broken" in its summary is precisely the kind of quiet failure this is here to
 * prevent.
 *
 * Costs nothing: one fetch a day, no model call.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  try {
    const health = await recordRun('check-reader-proxy', async () => {
      const result = await checkReaderProxy()
      if (!result.ok) {
        // Thrown so the run is recorded as failed. The message is the summary
        // an admin will read on the Pipeline page, so it names the fix.
        const err = new Error(`reader proxy unhealthy (${result.status}): ${result.detail}`)
        ;(err as Error & { health?: unknown }).health = result
        throw err
      }
      return result
    })
    return NextResponse.json(health)
  } catch (e) {
    // 200 with ok:false: the cron itself ran correctly and the failure is
    // already recorded. A non-200 here would make Vercel retry a check whose
    // answer will not change until a human sets a key.
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 200 },
    )
  }
}

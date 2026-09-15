// Daily: end granted access that has run out.
//
//   GET /api/cron/expire-access-grants
//
// Migration 069 gave granted access an end date and a sweeper to enforce it,
// and the sweeper has had no caller since. Nothing fires because a clock passed
// a number, so without this every granted period runs for ever and the system
// never mentions it. The cohort's 21 grants expire on 10 March 2027; a silent
// failure here is 21 organisations on free access indefinitely, discovered by
// nobody.
//
// SEPARATE FROM reconcile-billing ON PURPOSE. That job detects and must never
// repair — a reconciliation that fixed what it found would hide the fault it
// exists to surface. This one only repairs, and it repairs the one thing that
// is unambiguous: a date has passed. Keeping them apart means the daily
// mismatch count stays meaningful.
//
// It calls the SQL function rather than reimplementing the rule. The expiry
// test lives in `derive_apply_access`, which is also what the triggers use, so
// there is no second definition to drift.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/admin/admin-db'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { recordRun } from '@/lib/admin/cron-runs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isCron = !!(cronSecret && auth === `Bearer ${cronSecret}`)
  if (!isCron && !(isAdminBearerToken(auth) || (await requireAdmin()).ok)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getAdminDb()

  const payload = await recordRun('expire-access-grants', async () => {
    // Who is about to lose access, captured BEFORE the sweep. The function
    // returns a count, and a count with no names is not much use at 6am when
    // somebody asks why their pipeline vanished.
    const { data: due } = await db
      .from('organisations')
      .select('id, name, owner_id, granted_access_until')
      .eq('apply_access', true)
      .not('granted_access_until', 'is', null)
      .lte('granted_access_until', new Date().toISOString())

    const { data, error } = await db.rpc('expire_lapsed_access_grants')
    if (error) throw new Error(`expire_lapsed_access_grants: ${error.message}`)

    return {
      expired: typeof data === 'number' ? data : 0,
      // Named, and capped: a run that expires forty accounts wants a person,
      // not a longer list.
      accounts: (due ?? []).slice(0, 25).map(o => ({
        id: o.id, name: o.name, until: o.granted_access_until,
      })),
    }
  })

  return NextResponse.json({ ok: true, ...payload })
}

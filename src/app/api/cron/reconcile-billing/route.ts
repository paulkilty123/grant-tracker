// Daily: does what we billed match what we granted?
//
//   GET /api/cron/reconcile-billing            scheduled
//   GET /api/cron/reconcile-billing?peek=true  same thing; it only ever reads
//
// In a healthy system this finds nothing, every day, for ever. That is what it
// is for. The webhook and migration 069's trigger are supposed to keep billing
// and entitlement in step, and the day they do not, the alternative to hearing
// it from this job is hearing it from a customer who has paid and cannot get in.
//
// It writes an incident row per mismatch rather than only reporting a count, so
// a problem that appears on Tuesday and is still there on Friday is one row with
// seen_count 4 rather than four things to notice separately.
//
// Read-only with respect to entitlement: it never grants or revokes. A
// reconciliation that repaired what it found would hide the fault it exists to
// surface, and the repair is a judgement — whether somebody was wrongly charged
// or wrongly granted is not a decision to make at 4am with no one watching.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/admin/admin-db'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { recordRun } from '@/lib/admin/cron-runs'
import { findMismatches, type SubRow, type OrgRow } from '@/lib/billing/reconcile'
import { recordBillingIncident } from '@/lib/billing/incidents'

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

  const payload = await recordRun('reconcile-billing', async () => {
    const [{ data: subs, error: subErr }, { data: orgs, error: orgErr }] = await Promise.all([
      db.from('subscriptions').select('owner_id, plan, status, stripe_subscription_id'),
      db.from('organisations').select('id, owner_id, name, apply_access, granted_access_until'),
    ])
    if (subErr) throw new Error(`subscriptions: ${subErr.message}`)
    if (orgErr) throw new Error(`organisations: ${orgErr.message}`)

    const mismatches = findMismatches((subs ?? []) as SubRow[], (orgs ?? []) as OrgRow[])

    for (const m of mismatches) {
      await recordBillingIncident({
        kind: m.kind,
        detail: m.detail,
        owner_id: m.owner_id,
        // Keyed per owner rather than per subscription: a mismatch is about an
        // account, and using the subscription id would open a second row for
        // the same account the moment they resubscribe.
        stripe_subscription_id: `owner:${m.owner_id}`,
      })
    }

    const { count: openIncidents } = await db
      .from('billing_incidents')
      .select('id', { count: 'exact', head: true })
      .is('resolved_at', null)

    return {
      subscriptions: subs?.length ?? 0,
      organisations: orgs?.length ?? 0,
      mismatches: mismatches.length,
      byKind: mismatches.reduce<Record<string, number>>((acc, m) => {
        acc[m.kind] = (acc[m.kind] ?? 0) + 1
        return acc
      }, {}),
      openIncidents: openIncidents ?? 0,
      // Capped: the point is to notice, and a run that found forty problems
      // needs a person rather than a longer list.
      sample: mismatches.slice(0, 20),
    }
  })

  return NextResponse.json({ ok: true, ...payload })
}

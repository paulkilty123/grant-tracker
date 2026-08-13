// Admin-only endpoint: sweep-time temporal validity check.
// Runs the second-layer check from docs/pipeline-v1-spec.md §5.
//
// Called from the auto-chain cron (Phase 4) after enrichment + classification
// have populated funder_brief.open_status and deadline_cycle. Can also be
// invoked manually from the admin UI to re-sweep a row.
//
// POST /api/admin/sweep
//   Body: { id: string } or { ids: string[] }
//   Returns: { results: Array<{ id, action, reason?, newDeadline? }> }
//
// Actions:
//   - 'pass'            — deadline is future, or rolling claim holds
//   - 'promoted'        — past deadline + future cycle date → deadline advanced
//   - 'rejected'        — past deadline, no cycle, no rolling → soft-rejected
//   - 'archived'        — open_status=closed and no future cycle → archived
//
// Auth: ADMIN_SECRET bearer token or authenticated admin session

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { mergeGrantUpdate } from '@/lib/grant-merge'
import { nextCycleDeadline, type CycleEntry } from '@/lib/deadline-cycle'

export const dynamic = 'force-dynamic'

const SWEEP_VERSION    = 'v1'
const PROVENANCE_SOURCE = `system:sweep:${SWEEP_VERSION}`

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function isAuthorised(req: NextRequest): Promise<boolean> {
  if (isAdminBearerToken(req.headers.get('authorization'))) return true
  const auth = await requireAdmin()
  return auth.ok
}

// ── Cycle math ────────────────────────────────────────────────────────────────
// Shared with expire-grants via src/lib/deadline-cycle.ts. The two used to hold
// byte-identical private copies, which is exactly how they came to share a bug:
// an entry labelled "Applications open" counted as a deadline candidate, so a
// cycle describing a window rolled forward to the day it OPENS.


// ── Sweep single row ──────────────────────────────────────────────────────────
type SweepAction = 'pass' | 'promoted' | 'rejected' | 'archived'
type SweepResult = { id: string; action: SweepAction; reason?: string; newDeadline?: string; error?: string }

async function sweepOne(
  id: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  todayISO: string,
): Promise<SweepResult> {
  const { data: row, error } = await db
    .from('scraped_grants')
    .select('id, deadline, deadline_cycle, is_rolling, funder_brief, pipeline_state')
    .eq('id', id)
    .maybeSingle()
  if (error) return { id, action: 'rejected', error: error.message }
  if (!row)  return { id, action: 'rejected', error: 'row not found' }

  const deadline  = row.deadline as string | null
  const cycle     = row.deadline_cycle as CycleEntry[] | null
  const isRolling = row.is_rolling === true
  const brief     = row.funder_brief as Record<string, unknown> | null
  const openStatus = typeof brief?.open_status === 'string' ? brief.open_status : null

  // Rule 1 — future deadline passes immediately
  if (deadline && deadline >= todayISO) {
    return { id, action: 'pass' }
  }

  // Rule 2 — past deadline + future cycle date → promote
  if (deadline && deadline < todayISO && cycle && cycle.length > 0) {
    const next = nextCycleDeadline(cycle, todayISO)
    if (next && next > todayISO) {
      try {
        await mergeGrantUpdate({
          id, fields: { deadline: next },
          source: PROVENANCE_SOURCE, pinned: false, db,
        })
        return { id, action: 'promoted', newDeadline: next }
      } catch (err) {
        return { id, action: 'rejected', error: err instanceof Error ? err.message : String(err) }
      }
    }
  }

  // Rule 3 — rolling claim holds
  if (deadline === null && isRolling) {
    return { id, action: 'pass' }
  }

  // Rule 4 — explicit closed status + no future cycle → archive (preserve row)
  //
  // 2026-07-25: this used to pass url_status:'dead' to reach the 'archived'
  // state, because transitionPipelineState only returns 'archived' for
  // is_active=false + url_status='dead'. But the URL is fine here — it's the
  // funding round that closed. Asserting 'dead' was a factual lie that also
  // poisoned reenrich-stale's dead-URL intervention path. Pass pipeline_state
  // explicitly instead (the merger honours an explicit override) and leave
  // url_status alone.
  if (openStatus === 'closed') {
    const next = cycle ? nextCycleDeadline(cycle, todayISO) : null
    if (!next) {
      try {
        await mergeGrantUpdate({
          id, fields: { is_active: false, pipeline_state: 'archived' },
          source: PROVENANCE_SOURCE, pinned: false, db,
        })
        return { id, action: 'archived' }
      } catch (err) {
        return { id, action: 'rejected', error: err instanceof Error ? err.message : String(err) }
      }
    }
  }

  // Rule 5 — past deadline, no cycle, no rolling → reject with reason
  //
  // 2026-07-25: this used a raw .update() that set pipeline_state='rejected'
  // WITHOUT is_active=false, so a row with a long-past deadline was flagged
  // rejected while remaining fully visible to users. Now goes through the
  // merger and deactivates.
  if (deadline && deadline < todayISO) {
    try {
      await mergeGrantUpdate({
        id,
        fields: {
          is_active:        false,
          pipeline_state:   'rejected',
          rejection_reason: 'historical_deadline',
        },
        source: PROVENANCE_SOURCE, pinned: false, db,
      })
      return { id, action: 'rejected', reason: 'historical_deadline' }
    } catch (err) {
      return { id, action: 'rejected', error: err instanceof Error ? err.message : String(err) }
    }
  }

  // No deadline, not rolling, no closed signal — pass for now (will quarantine
  // via auto-chain if classification still can't disambiguate).
  return { id, action: 'pass' }
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = await req.json() as { id?: string; ids?: string[] }
  const ids = Array.isArray(body.ids) ? body.ids : (body.id ? [body.id] : [])
  if (ids.length === 0) return NextResponse.json({ error: 'id or ids required' }, { status: 400 })

  const db       = adminClient()
  const todayISO = new Date().toISOString().slice(0, 10)
  const results: SweepResult[] = []
  for (const id of ids) {
    results.push(await sweepOne(id, db, todayISO))
  }

  return NextResponse.json({ results })
}

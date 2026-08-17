// The verification engine's actuator.
//
//   GET /api/cron/apply-removals             scheduled: honours REMOVALS_ENABLED
//   GET /api/cron/apply-removals?peek=true   ALWAYS report-only, whatever the flag
//   GET /api/cron/apply-removals?apply=true  manual: writes regardless of the flag
//   GET /api/cron/apply-removals?class=round_closed   one class only
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS ROUTE EXISTS
//
// `verify-rows` has read 637 of 670 live rows and found 182 where the funder's
// page contradicts us. It corrected none of them, because it writes evidence and
// never values. Its own header said so, and named the condition:
//
//   > §12 proposes letting the engine act unattended on the removal classes …
//   > That argument is sound and the decision is Paul's.
//
// The decision was taken on 2026-08-17. This is the actuator it authorises, and
// it is deliberately a SEPARATE ROUTE from the reader. Three reasons:
//
//   1. The reader spends money and the actuator does not. Folding them together
//      would make "act on what we already know" cost a model call, and API spend
//      is constrained until 1 September.
//   2. They arm independently. `VERIFY_ENABLED` and `REMOVALS_ENABLED` can be
//      set at different times, and the reader can keep running with the
//      actuator off — which is the state to fall back to if anything here is
//      wrong.
//   3. A dry run of the actuator is genuinely free. It reads stored evidence
//      only, so `?peek=true` is an honest status check rather than a probe that
//      becomes a trigger. That failure has already cost £4.50 in this codebase.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE ASYMMETRY IS THE WHOLE SAFEGUARD
//
// Removals and de-assertions only. `decideRemoval` cannot return a field outside
// {is_active, pipeline_state, rejection_reason, is_rolling:false}, and there is
// a test asserting exactly that. Nothing here can put a fund, a figure or a
// sentence in front of a user that was not there before. Everything that ADDS or
// WIDENS a claim — amounts, eligibility, income caps, rolling:true — stays a
// proposal for a human, per Paul's instruction of 17 August.
//
// ─────────────────────────────────────────────────────────────────────────────
// REVERSIBILITY IS THE RUN SUMMARY, BECAUSE THE ROW DOES NOT RECORD IT
//
// `is_active` and `pipeline_state` are UNTRACKED by `mergeGrantUpdate`, so no
// provenance is stamped and `field_provenance.previous` is not populated. An
// archived row therefore carries no record of what it was before. Every acted
// row here writes `before: { is_active, pipeline_state }` into
// `cron_runs.summary`, and that is the only way back. Do not remove it.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { recordRun } from '@/lib/admin/cron-runs'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { mergeGrantUpdate } from '@/lib/grant-merge'
import { decideRemoval, type RemovalRow, type RemovalClass } from '@/lib/verification/removal'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Trust 50, never auto-pins. NOT `admin:` — that would carry full human trust
 *  for a value no human reviewed and freeze the field against re-enrichment for
 *  good, which is a documented trap in this repo. */
const SOURCE = 'system:removal_actuator:v1'

/**
 * Runaway guard. The measured populations on 2026-08-17 are 10 + 10 + 0 + 32,
 * so a run proposing more than this has found something the design did not
 * anticipate and should stop rather than act. It reports the overflow instead of
 * silently truncating — a silent cap reads as "covered everything".
 */
const MAX_ACTIONS = 100

// One line, not a concatenation: supabase-js parses this at TYPE level and a `+`
// defeats that parser.
const SELECT_COLS = 'id, title, is_active, pipeline_state, is_rolling, apply_url, field_evidence'

function adminClient(): SupabaseClient {
  // MUST be service-role. A cron request carries no session cookie, so the
  // cookie-based helper runs as `anon`, RLS matches zero rows, PostgREST returns
  // no error, and every write silently does nothing while the handler reports
  // non-zero counts. That has happened to three crons in this codebase.
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(req: NextRequest) {
  const auth       = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isCronCaller  = !!(cronSecret && auth === `Bearer ${cronSecret}`)
  const isAdminCaller = !isCronCaller && (isAdminBearerToken(auth) || (await requireAdmin()).ok)
  if (!isCronCaller && !isAdminCaller) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = req.nextUrl.searchParams
  const armed  = process.env.REMOVALS_ENABLED === 'true'
  // The query string is the manual/scheduled discriminator, not the secret:
  // vercel.json invokes a fixed, parameterless path, so a scheduled run can
  // never carry ?apply=true. (ADMIN_SECRET and CRON_SECRET hold the same value,
  // so caller identity cannot be used for this.)
  const forced = params.get('apply') === 'true'
  // Overrides everything, including ?apply=true.
  const peek   = params.get('peek') === 'true'
  const only   = params.get('class') as RemovalClass | null
  const write  = !peek && (armed || forced)

  const payload = await recordRun('apply-removals', async () => {
    const db = adminClient()

    // Every live row the engine has ever read. No `.limit()` with a later JS
    // filter: that pattern has produced confident wrong answers here before.
    // The explicit range defeats PostgREST's silent 1000-row default so a
    // catalogue that outgrows it fails loudly rather than under-reporting.
    const { data, error } = await db
      .from('scraped_grants')
      .select(SELECT_COLS)
      .eq('is_active', true)
      .not('field_evidence', 'is', null)
      .range(0, 4999)
    if (error) throw new Error(`fetch rows: ${error.message}`)
    const rows = (data ?? []) as RemovalRow[]
    if (rows.length >= 5000) throw new Error('row window full at 5000 — raise the range before trusting this run')

    const actions: { row: RemovalRow; d: Extract<ReturnType<typeof decideRemoval>, { act: true }> }[] = []
    /** Why each withheld row was withheld, counted. The abstains are the
     *  safeguard doing its job and are reported as prominently as the actions —
     *  a run that acted on everything would mean the rule was not applied. */
    const held: Record<string, number> = {}
    const heldRows: unknown[] = []

    for (const row of rows) {
      const d = decideRemoval(row)
      if (d.act) {
        if (only && d.klass !== only) continue
        actions.push({ row, d })
      } else if (d.klass) {
        // Only report holds that were CANDIDATES for a class. "no removal class
        // applies" is the other 600 rows and is noise.
        const key = `${d.klass}: ${d.reason}`
        held[key] = (held[key] ?? 0) + 1
        heldRows.push({ id: row.id, title: row.title, klass: d.klass, reason: d.reason })
      }
    }

    const byClass: Record<string, number> = {}
    for (const a of actions) byClass[a.d.klass] = (byClass[a.d.klass] ?? 0) + 1

    if (actions.length > MAX_ACTIONS) {
      return {
        success: true, armed, wrote: false, candidates: actions.length, byClass, held,
        error: `refusing to act on ${actions.length} rows in one run (cap ${MAX_ACTIONS})`,
        note: 'the populations this was designed against were 10 + 10 + 0 + 32; something has changed and a human should look before anything moves',
      }
    }

    if (!write) {
      return {
        success: true, armed, wrote: false,
        scanned: rows.length, candidates: actions.length, byClass, held,
        wouldAct: actions.map(a => ({
          id: a.row.id, title: a.row.title, klass: a.d.klass,
          from: { is_active: a.row.is_active, pipeline_state: a.row.pipeline_state },
          to: a.d.fields, quote: a.d.quote, sourceUrl: a.d.sourceUrl,
        })),
        heldRows,
        note: peek
          ? 'peek: decided and wrote nothing, whatever REMOVALS_ENABLED says'
          : 'REMOVALS_ENABLED is not true and ?apply=true was not passed, so nothing was written',
      }
    }

    const acted: unknown[] = []
    const refused: unknown[] = []

    for (const { row, d } of actions) {
      // Captured BEFORE the write. Nothing on the row records the pre-archive
      // state, so this is the only route back.
      const before = { is_active: row.is_active, pipeline_state: row.pipeline_state }
      let applied: string[] = []
      let rejected: unknown[] = []
      let err: string | null = null
      try {
        const res = await mergeGrantUpdate({
          id: row.id, fields: d.fields, source: SOURCE, pinned: false, db,
        })
        applied  = res.applied
        rejected = res.rejected
      } catch (e) {
        err = e instanceof Error ? e.message : String(e)
      }

      // NEVER assume it landed. A rejection silently counted as a success left
      // Movement for Good Awards public for a further day, and migration 045
      // exists because callers discarded this array.
      const wanted = Object.keys(d.fields)
      const missed = wanted.filter(f => !applied.includes(f))
      const record = {
        id: row.id, title: row.title, klass: d.klass, quote: d.quote,
        sourceUrl: d.sourceUrl, before, after: d.fields, applied, rejected, error: err,
      }
      if (err || missed.length > 0) refused.push({ ...record, missed })
      else acted.push(record)
    }

    return {
      success: true, armed, wrote: true, scanned: rows.length,
      acted: acted.length, refusedCount: refused.length,
      byClass, held, rows: acted, refused, heldRows,
    }
  })

  return NextResponse.json(payload)
}

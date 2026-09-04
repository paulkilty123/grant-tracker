// The verification engine's actuator.
//
//   GET /api/cron/apply-removals             scheduled: honours REMOVALS_ENABLED
//   GET /api/cron/apply-removals?peek=true   ALWAYS report-only, whatever the flag
//   GET /api/cron/apply-removals?apply=true  manual: writes regardless of the flag
//   GET /api/cron/apply-removals?class=round_closed   one class only
//   GET /api/cron/apply-removals?limit=5     smaller than the daily cap
//
// Scheduled 21:00 UTC daily in vercel.json, two hours after the last
// `verify-rows` run of the day, so it acts on the freshest evidence rather than
// on yesterday's. Capped at 20 actions a run — see DAILY_CAP.
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
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminDb } from '@/lib/admin/admin-db'
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
 * How many rows one run may change. Set by Paul at 20 on 2026-08-17, arming the
 * schedule: "capped at around 20 actions a day to start".
 *
 * A cap that TRUNCATES is the danger, not the cap itself. `validate-urls`
 * defined a pass as "whatever is left", got nothing on every run it ever made,
 * and reported `checked: 0` — which read exactly like "nothing to do". So this
 * route always reports `deferred` and `deferredByClass`, and a run that left
 * work behind says so in the digest line.
 */
const DAILY_CAP = 20

/**
 * Runaway guard, above the cap rather than instead of it. The measured
 * populations on 2026-08-17 were 10 + 10 + 0 + 32. A run that finds more than
 * this many candidates has hit something the design did not anticipate — a
 * regressed extractor, a bad batch — and should stop rather than work through it
 * twenty a day.
 */
const RUNAWAY = 100

/**
 * Which class goes first when the cap bites.
 *
 * A fund that has closed but is still on the site is the harm; a row over-
 * claiming "apply any time" is a lesser one. So removals clear before
 * de-assertions, and within a class the order is by id, which is stable across
 * runs — an unstable order would let the same row lose the draw every day.
 */
const CLASS_ORDER: Record<string, number> = {
  no_longer_listed: 0, not_a_grant: 0, round_closed: 1, rolling_unset: 2,
}

// One line, not a concatenation: supabase-js parses this at TYPE level and a `+`
// defeats that parser.
const SELECT_COLS = 'id, title, is_active, pipeline_state, is_rolling, apply_url, field_evidence'

function adminClient(): SupabaseClient {
  // MUST be service-role. A cron request carries no session cookie, so the
  // cookie-based helper runs as `anon`, RLS matches zero rows, PostgREST returns
  // no error, and every write silently does nothing while the handler reports
  // non-zero counts. That has happened to three crons in this codebase.
  return getAdminDb()
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

    if (actions.length > RUNAWAY) {
      return {
        success: true, armed, wrote: false, candidates: actions.length, byClass, held,
        error: `refusing to act: ${actions.length} candidates exceeds the runaway guard of ${RUNAWAY}`,
        note: 'the populations this was designed against were 10 + 10 + 0 + 32; something has changed and a human should look before anything moves',
      }
    }

    // Highest harm first, then a stable order so the same row cannot lose the
    // draw every day.
    actions.sort((a, b) =>
      (CLASS_ORDER[a.d.klass] ?? 9) - (CLASS_ORDER[b.d.klass] ?? 9) || a.row.id.localeCompare(b.row.id))

    const cap      = Math.max(1, Math.min(Number(params.get('limit')) || DAILY_CAP, RUNAWAY))
    const todo     = actions.slice(0, cap)
    const deferred = actions.slice(cap)
    const deferredByClass: Record<string, number> = {}
    for (const a of deferred) deferredByClass[a.d.klass] = (deferredByClass[a.d.klass] ?? 0) + 1

    if (!write) {
      return {
        success: true, armed, wrote: false,
        scanned: rows.length, candidates: actions.length, cap,
        deferred: deferred.length, deferredByClass, byClass, held,
        wouldAct: todo.map(a => ({
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

    for (const { row, d } of todo) {
      // Captured BEFORE the write. Nothing on the row records the pre-archive
      // state, so this is the only route back.
      const before = { is_active: row.is_active, pipeline_state: row.pipeline_state }
      let applied: string[] = []
      let rejected: unknown[] = []
      /** Perishable timing claims withdrawn over a value the trust ladder would
       *  otherwise have protected. Almost always empty. Carried into the run
       *  summary because a supersede OVERRULES somebody — usually Paul, whose
       *  July corrections are what went stale — and an override nobody can see
       *  is how the pinning debt built up in the first place. */
      let superseded: unknown[] = []
      let err: string | null = null
      try {
        const res = await mergeGrantUpdate({
          id: row.id, fields: d.fields, source: SOURCE, pinned: false, db,
        })
        applied    = res.applied
        rejected   = res.rejected
        superseded = res.superseded ?? []
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
        ...(superseded.length ? { superseded } : {}),
      }
      if (err || missed.length > 0) refused.push({ ...record, missed })
      else acted.push(record)
    }

    return {
      success: true, armed, wrote: true, scanned: rows.length,
      acted: acted.length, refusedCount: refused.length,
      // Reported at the top level as well as per row, so the digest can lead
      // with it rather than requiring somebody to scan every record.
      supersededCount: acted.reduce<number>((n, r) =>
        n + ((r as { superseded?: unknown[] }).superseded?.length ?? 0), 0),
      // Never silent. A run that left work behind says how much and of what.
      candidates: actions.length, cap, deferred: deferred.length, deferredByClass,
      byClass, held, rows: acted, refused, heldRows,
    }
  })

  return NextResponse.json(payload)
}

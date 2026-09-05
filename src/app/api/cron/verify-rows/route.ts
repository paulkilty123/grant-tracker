// The verification engine's home.
//
// `verify-row.ts` has worked for weeks and has never had a caller in the app —
// it has only ever been run from a script, by hand, over ids someone typed. So
// nothing in the catalogue has ever been checked on a schedule, and "when was
// this row last read against the funder's page" has had no answer for any row.
// This is the route that changes that.
//
//   GET /api/cron/verify-rows            scheduled: honours VERIFY_ENABLED
//   GET /api/cron/verify-rows?peek=true  ALWAYS report-only, never fetches a page
//   GET /api/cron/verify-rows?run=true   manual: runs regardless of the flag
//   GET /api/cron/verify-rows?limit=20   smaller batch
//   GET /api/cron/verify-rows?ids=a,b    specific rows, ignores the queue order
//
// ─────────────────────────────────────────────────────────────────────────────
// ?peek EXISTS BECAUSE THE FIRST VERSION HAD NO SAFE WAY TO ASK A QUESTION
//
// While disarmed, a bare GET reported the queue and cost nothing, so it read
// like a status endpoint. The moment VERIFY_ENABLED was set that same URL became
// a 60-row batch, and a poll loop watching for `armed: true` fired fifteen of
// them in eight minutes: 840 row visits, £4.50, and 43% of it duplicated work.
//
// The lesson is not "be careful with the probe". It is that a route whose
// behaviour flips from free to expensive on an env var has no honest status
// check, so one has to be spelled out. ?peek always reports and never fetches,
// whatever the flag says.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT IT WRITES, AND WHAT IT DELIBERATELY DOES NOT
//
// It writes `field_evidence` and nothing else. Not one value on one row changes
// as a result of this running, so it is safe to point at the live catalogue: a
// user cannot see any difference. A contradiction is stored as evidence carrying
// the page's quote, the source URL and the value the page supports, and there it
// waits.
//
// It does NOT move `pipeline_state`, and that is a decision rather than an
// omission. §12 of the tranche 2 design proposes letting the engine act
// unattended on the removal classes (`no_longer_listed`, `not_a_grant`,
// `round_closed`, and un-setting an unevidenced rolling flag) on the argument
// that those can only ever take something down. That argument is sound and the
// decision is Paul's; until it is made, an engine that only ever records is one
// whose first scheduled runs can be judged on their output rather than trusted
// in advance.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE BUDGET IS ABSOLUTE, NOT A REMAINDER
//
// `validate-urls` defined its third pass as "whatever is left", and that pass —
// the only one that could check a newly discovered row before it published —
// got nothing on every run it ever made, for the whole of its existence. It
// reported `checked: 0`, which read exactly like "nothing to do".
//
// So every deadline here is measured from `startedAt`, the run stops on the
// clock rather than on a count, and `stoppedEarly` plus `remaining` are always
// reported. A run that ran out of time says so.

import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminDb } from '@/lib/admin/admin-db'
import Anthropic from '@anthropic-ai/sdk'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { recordRun } from '@/lib/admin/cron-runs'
import { verifyRow, type VerifyRow, type VerifyResult } from '@/lib/verification/verify-row'
import {
  shouldSkipHost, recordFailure, hostOf, isHostLevel, backoffHours, type HostState,
} from '@/lib/verification/host-backoff'
import type { UnreadableReason } from '@/lib/verification/page-readable'
import { buildEvidencePatch, recordFieldEvidence, PAGE_READ_KEY } from '@/lib/field-evidence'
import { computeCadence, previousSilentStreak } from '@/lib/verification/verify-cadence'
import { withRowBudget } from '@/lib/verification/row-budget'

export const dynamic = 'force-dynamic'
// 600, not 300. The 2026-08-28 01:01 run was killed by the platform without
// reporting anything: no summary, no error, just a watchdog row. The margin
// below was computed against a TYPICAL row and the batch that night was made of
// atypical ones — see ROW_BUDGET_MS.
export const maxDuration = 600

/**
 * Bump when the extraction changes in a way that should invalidate old stamps.
 *
 * v2, 2026-08-16: gained eligibility — `eligible_structures`, `exclusions` and
 * `min_org_income`. A v1 stamp on a row is not wrong, it is INCOMPLETE, which is
 * a different thing and the reason nothing here invalidates automatically: a
 * `deadline` confirmed under v1 is just as confirmed today. Re-reading for the
 * new fields is a deliberate one-off, priced and run by hand — see
 * scripts/requeue-for-eligibility.ts.
 */
const VERIFIER = 'verify:v2'
const MODEL    = 'claude-haiku-4-5-20251001'

/** Measured shape: a page fetch is up to 12s and a model call ~4s, so a row is
 *  16-22s serial. Five at a time fits ~60 rows inside the window below. */
const CONCURRENCY = 5
const BATCH       = 60

/**
 * A ceiling on ONE row, enforced here rather than inferred from the parts.
 *
 * WHY THIS EXISTS. `overtime()` stops the pool STARTING rows; it has never had
 * any hold over a row already in flight. So the function's real worst case was
 * DEADLINE_MS plus however long the slowest row in the batch chose to take, and
 * nothing bounded that second term. Priced properly it was: 12s for the direct
 * fetch, then 30s for the reader-proxy fallback when the direct fetch 403s or
 * 401s, then a model call the SDK would retry twice on a 429 or a 529, each
 * attempt free to run to the SDK's own generous default. Comfortably past 300s
 * on its own.
 *
 * That is exactly the shape of the batch that died. The 97 rows requeued on
 * 27 August were the rows whose page-read verdict had just been thrown away —
 * disproportionately the bot-walled hosts and the dead domains, i.e. the ones
 * that take the proxy path. A normal night's batch never went near the cap; the
 * one night the queue filled with slow rows, the whole run was killed before it
 * could write a single stamp, and reported as "never reported back".
 *
 * The number: 12s + 30s of fetch, plus a model call now bounded to 20s with one
 * retry, is ~83s of honest worst case. 90s covers it with room, and DEADLINE_MS
 * is set so that a row starting at the last possible moment still lands inside
 * maxDuration with the final writes done.
 */
const ROW_BUDGET_MS = 90_000

/** Bounds on the model call, so a lane cannot outlive the function waiting on a
 *  529. The SDK's defaults are two retries and a timeout measured in minutes;
 *  both are the right defaults for a request a user is waiting on and the wrong
 *  ones inside a batch with a wall clock. */
const MODEL_TIMEOUT_MS = 20_000
const MODEL_RETRIES    = 1

/** Absolute, from startedAt, and it governs when a row may START. The function
 *  cap is 600s: this leaves ROW_BUDGET_MS for a row that starts on the buzzer
 *  plus 30s for the final writes and the run record itself. */
const DEADLINE_MS = 480_000

/** Stored verbatim in cron_runs.summary, so the lists are capped — but the
 *  totals are reported beside them, because a truncated list that does not say
 *  it is truncated reads as the whole answer. */
const REPORT_CAP = 25

// Service-role client. MUST NOT be the cookie-based `@/lib/supabase/server`
// helper: a cron request carries no session cookie, so that client runs as
// `anon`, RLS matches zero rows, PostgREST returns no error, and every write
// silently does nothing while the handler reports non-zero counts. That has
// happened to three crons in this codebase.
function adminClient(): SupabaseClient {
  return getAdminDb()
}

// `next_open_date` and `field_evidence` are here for the cadence, not for the
// extraction: the first supplies shape B's reopen checkpoints and the second
// carries the previous `silent_streak`. A column missing from the SELECT that a
// later filter reads has produced a false "match" in this codebase before, so
// they are added to the list rather than fetched separately.
//
// `eligible_structures`, `location_tag` and `funder_brief` are the eligibility
// comparison's inputs: the row's own tags, the geography the charity-form
// derivation needs, and the brief prose that says whether an exclusion the page
// states is one we already carry. A column missing from the SELECT that a later
// filter reads has produced a false "match" in this codebase before, so they go
// in the list rather than being fetched separately.
// One line, not a concatenation: supabase-js parses this string at TYPE level to
// infer the row shape, and a `+` defeats that parser — it falls back to
// GenericStringError and every downstream cast becomes a lie.
const SELECT_COLS = 'id, title, funder, funding_type, apply_url, deadline, deadline_cycle, next_open_date, is_rolling, amount_min, amount_max, max_org_income, min_org_income, is_invite_only, eligible_structures, location_tag, funder_brief, field_evidence, grant_sources'

/**
 * What the row carries for scheduling, on top of what the extraction reads.
 *
 * Kept separate from `VerifyRow` deliberately: that type is the extraction's
 * input contract — the facts a page is read against — and the cadence is a
 * different question asked of the same row. Folding reopen dates and streak
 * counters into it would make the contract mean two things.
 */
type CadenceCols = {
  next_open_date: string | null
  field_evidence: Record<string, unknown> | null
}

type QueueCounts = {
  eligible: number; neverChecked: number; band0: number; excluded: number
  /** Live rows asserting timing with no quoted confirmation behind it. THE
   *  number: it says what the product can honestly claim today. Reported whole,
   *  not just the part currently due, because a row resting inside its cooldown
   *  is no better evidenced for resting. */
  liveUnbacked: number
  /** How many of those the next run may actually re-read. */
  liveUnbackedDue: number
  /** Shape C: read, and the page still does not say when anyone can apply.
   *  Reported beside `liveUnbacked` on the admin Pipeline line, as a condition
   *  of shipping the backoff — a deferred gap must never read as a closed one. */
  timingUnknown: number
  timingUnknownLive: number
  /** Rows an outside signal says have changed, waiting at the front. */
  flagged: number
  /** Live rows the admin queue calls archived, rejected, or awaiting a human.
   *  Two columns disagreeing about the same row: the site shows it, the queue
   *  believes it is gone. Until 060 these were excluded from verification
   *  outright, so 29 live rows had never been read and the coverage number could
   *  not reach its own total with nothing saying why. They are read now; the
   *  desync itself still wants settling, so this stays on the line until it is
   *  zero rather than being fixed silently. */
  liveStateConflict: number
}

async function queueCounts(db: SupabaseClient): Promise<QueueCounts | null> {
  const { data, error } = await db.rpc('verify_batch_counts')
  if (error || !Array.isArray(data) || data.length === 0) return null
  const r = data[0] as Record<string, number | string>
  return {
    eligible:     Number(r.eligible),
    neverChecked: Number(r.never_checked),
    band0:        Number(r.band0),
    excluded:     Number(r.excluded),
    liveUnbacked:    Number(r.live_unbacked),
    liveUnbackedDue: Number(r.live_unbacked_due),
    timingUnknown:     Number(r.timing_unknown),
    timingUnknownLive: Number(r.timing_unknown_live),
    flagged:           Number(r.flagged),
    liveStateConflict: Number(r.live_state_conflict),
  }
}

/** Run `worker` over `items`, at most `n` in flight, stopping when `stop()` says so. */
async function pool<T, R>(
  items: T[], n: number, stop: () => boolean, worker: (item: T) => Promise<R>,
): Promise<{ results: R[]; consumed: number }> {
  const results: R[] = []
  let next = 0
  let consumed = 0
  const lanes = Array.from({ length: Math.min(n, items.length) }, async () => {
    for (;;) {
      if (stop()) return
      const i = next++
      if (i >= items.length) return
      consumed++
      results.push(await worker(items[i]))
    }
  })
  await Promise.all(lanes)
  return { results, consumed }
}

export async function GET(req: NextRequest) {
  const auth       = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isCronCaller  = !!(cronSecret && auth === `Bearer ${cronSecret}`)
  const isAdminCaller = !isCronCaller && (isAdminBearerToken(auth) || (await requireAdmin()).ok)
  if (!isCronCaller && !isAdminCaller) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params  = req.nextUrl.searchParams
  const armed   = process.env.VERIFY_ENABLED === 'true'
  // The query string is the manual/scheduled discriminator, not the secret:
  // vercel.json invokes a fixed, parameterless path, so a scheduled run can
  // never carry ?run=true. (ADMIN_SECRET and CRON_SECRET hold the same value,
  // which makes isCronCaller win for every bearer caller, so the caller identity
  // cannot be used for this.)
  const forced  = params.get('run') === 'true'
  // Overrides everything, including ?run=true. There is no combination of
  // parameters where ?peek=true spends money.
  const peek    = params.get('peek') === 'true'
  const idsRaw  = params.get('ids')
  const ids     = idsRaw ? idsRaw.split(',').map(s => s.trim()).filter(Boolean) : []
  const limit   = Math.max(1, Math.min(Number(params.get('limit')) || BATCH, 200))

  const payload = await recordRun('verify-rows', async ctx => {
    const startedAt = Date.now()
    const db        = adminClient()
    const overtime  = () => Date.now() - startedAt > DEADLINE_MS

    const queue = await queueCounts(db)

    // Nothing spends money unless somebody said so. The kill switch here guards
    // MODEL SPEND rather than user-visible writes, which is why a disarmed run
    // still reports the queue: "how much is waiting" is worth knowing every day
    // and costs nothing to answer.
    if (peek || (!armed && !forced)) {
      return {
        success: true, armed, ranWork: false, checked: 0, queue,
        note: peek
          ? 'peek: reported the queue and fetched nothing, whatever VERIFY_ENABLED says'
          : 'VERIFY_ENABLED is not true and ?run=true was not passed, so no page was fetched',
      }
    }

    // ── One run at a time ─────────────────────────────────────────────────────
    //
    // Selection is oldest-evidence-first and a stamp only lands when a row
    // FINISHES, so two runs starting a minute apart both see the same unstamped
    // rows and both pay to verify them. That is not hypothetical: fifteen
    // overlapping manual runs on 16 August paid for 840 row visits and produced
    // 476 distinct stamps, so 43% of the spend bought nothing.
    //
    // The scheduled runs are six hours apart and would not collide on their own.
    // This exists so that a slow run, a manual trigger, or a retry cannot turn
    // into duplicate spend — the guarantee should come from the route, not from
    // the timetable happening to be generous.
    const inflightSince = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    let inflight = db.from('cron_runs')
      .select('id, started_at')
      .eq('job', 'verify-rows')
      .is('finished_at', null)
      .gte('started_at', inflightSince)
    if (ctx.runId) inflight = inflight.neq('id', ctx.runId)
    const { data: openRuns } = await inflight
    if ((openRuns ?? []).length > 0) {
      const since = (openRuns as { started_at: string }[])[0].started_at
      return {
        success: true, armed, ranWork: false, checked: 0, queue,
        skipped: 'another verify-rows run is already in flight',
        inflightSince: since,
        note: 'skipped to avoid paying twice for the same rows: selection is oldest-first and a stamp only lands when a row finishes',
      }
    }

    // Pick the work. Ordering lives in SQL (migration 054) because "oldest
    // evidence first" is an ordering over the contents of a jsonb column, and
    // fetching a window then sorting it in JS is how this codebase has produced
    // confident wrong answers before.
    let targets: string[]
    if (ids.length > 0) {
      targets = ids
    } else {
      const { data, error } = await db.rpc('select_verify_batch', { limit_n: limit })
      if (error) throw new Error(`select_verify_batch: ${error.message}`)
      targets = (data as { id: string }[] ?? []).map(r => r.id)
    }
    if (targets.length === 0) {
      return { success: true, armed, ranWork: true, checked: 0, queue, note: 'queue empty' }
    }

    const { data: rowData, error: rowErr } = await db
      .from('scraped_grants').select(SELECT_COLS).in('id', targets)
    if (rowErr) throw new Error(`fetch rows: ${rowErr.message}`)
    const rows = (rowData ?? []) as (VerifyRow & CadenceCols)[]

    const anthropic = new Anthropic({
      apiKey:     process.env.ANTHROPIC_API_KEY!,
      timeout:    MODEL_TIMEOUT_MS,
      maxRetries: MODEL_RETRIES,
    })

    const outcomes:   Record<string, number> = {}
    /** How many rows each cadence shape claimed this run. Reported so the shape
     *  mix can be watched without querying: if `silent` swallows the catalogue,
     *  the extraction is the problem, not the schedule. */
    const shapes:     Record<string, number> = {}
    const tally = { confirmed: 0, contradicted: 0, silent: 0, unquoted: 0 }
    const proposals: unknown[]    = []
    const fixable:   unknown[]    = []
    const failures:  unknown[]    = []
    let proposalTotal = 0
    let fixableTotal  = 0

    // ONE WALL, ONE DISCOVERY, PER RUN.
    //
    // artscouncil.org.uk serves the same Cloudflare interstitial to all eleven
    // Arts Council rows, london.gov.uk to all four GLA rows. Without this every
    // one of them fetches it twice — direct, then the proxy — and each arrives
    // at the same answer independently. The guard is per run and in memory,
    // which is the whole of what a run needs; the ACROSS-run half is the due
    // date pushed out below, which persists in the column that already schedules
    // reads rather than in a new table.
    const hostState = new Map<string, HostState>()
    const skippedHosts: Record<string, number> = {}
    const hostGuard = {
      skip: (url: string) => {
        const s = shouldSkipHost(hostState.get(hostOf(url)))
        if (s) skippedHosts[hostOf(url)] = (skippedHosts[hostOf(url)] ?? 0) + 1
        return s ? { reason: s.reason, hoursLeft: s.hoursLeft } : null
      },
      record: (url: string, reason: UnreadableReason | null) => {
        const h = hostOf(url)
        if (!h) return
        // A success clears the entry outright rather than decrementing it, so a
        // funder who drops their WAF is read normally on the next row instead of
        // serving out the rest of a sentence.
        if (reason === null || !isHostLevel(reason)) { hostState.delete(h); return }
        hostState.set(h, recordFailure(hostState.get(h), reason))
      },
    }

    const { consumed } = await pool(rows, CONCURRENCY, overtime, async row => {
      let result: VerifyResult
      try {
        result = await withRowBudget(row.id, ROW_BUDGET_MS, verifyRow(row, anthropic, { hostGuard }))
      } catch (e) {
        failures.push({ id: row.id, title: row.title, error: e instanceof Error ? e.message : String(e) })
        return
      }
      ctx.usage.add(MODEL, {
        input_tokens:  result.usage?.input  ?? 0,
        output_tokens: result.usage?.output ?? 0,
      })
      outcomes[result.outcome] = (outcomes[result.outcome] ?? 0) + 1

      // Every visited row gets a page-read stamp, INCLUDING one whose gate
      // failed and which therefore produced no facts. The work queue orders by
      // the oldest stamp on the row, so a row that cannot be stamped cannot
      // drain: without this the 138 rows whose page does not describe our fund
      // would be re-fetched on every run, four times a day, for ever. Recording
      // the attempt is also the only honest answer to "when did we last look at
      // this row".
      const gate = result.gate as { failure?: string; detail?: string }
      const checkedAt = new Date()

      // The cadence is decided by what the page JUST said, so it is computed
      // against this run's stamps rather than the row's stored evidence. Build
      // the field patch first, then hand that patch to the cadence: passing the
      // pre-run evidence would key the schedule off the previous read, which is
      // the mistake the whole change exists to remove.
      const { patch: fieldPatch, unquoted } = buildEvidencePatch(result.evidence, { by: VERIFIER })
      const cadence = computeCadence({
        deadline:       typeof row.deadline === 'string' ? row.deadline : null,
        next_open_date: typeof row.next_open_date === 'string' ? row.next_open_date : null,
        deadline_cycle: Array.isArray(row.deadline_cycle)
          ? (row.deadline_cycle as { day: number; month: number; label?: string }[])
          : null,
        evidence: fieldPatch,
      }, {
        checkedAt,
        previousStreak: previousSilentStreak(row.field_evidence),
      })

      const { patch } = buildEvidencePatch([
        ...result.evidence,
        {
          field: PAGE_READ_KEY, agrees: null, quote: null,
          source_url: result.followedUrl ?? row.apply_url,
          note: result.gate.pass ? result.outcome : `${result.outcome}: ${gate.failure ?? 'gate failed'}`,
          silent_streak: cadence.silentStreak,
        },
      ], { by: VERIFIER, checkedAt })
      tally.unquoted += unquoted.length
      shapes[cadence.shape] = (shapes[cadence.shape] ?? 0) + 1
      for (const [field, stamp] of Object.entries(patch)) {
        if (field === PAGE_READ_KEY)     continue
        if (stamp.agrees === true)       tally.confirmed++
        else if (stamp.agrees === false) tally.contradicted++
        else                             tally.silent++
      }

      try {
        await recordFieldEvidence({ id: row.id, patch, db })
      } catch (e) {
        // A write that did not land is a failure of the run, not a footnote.
        failures.push({ id: row.id, title: row.title, error: e instanceof Error ? e.message : String(e) })
        return
      }

      // Evidence first, schedule second, deliberately in that order. If the
      // second write is lost the row keeps a null due date, which means due now:
      // it gets re-read sooner than it needed to be. The reverse order would
      // lose the evidence and keep the nap, which is a row resting on a read
      // that never happened. Both are failures; only one of them is quiet.
      //
      // `verify_flag` is cleared in the same statement. Whatever made this row
      // jump the queue has now been answered by an actual read, and a flag left
      // set would pin it to band 0 for ever.
      // A HOST THAT WOULD NOT BE READ SETS ITS OWN DUE DATE.
      //
      // The in-memory guard above only lasts a run. Across runs the row is due
      // again on the cadence the PAGE implies — except no page was read, so the
      // cadence is derived from nothing and the row comes straight back. That is
      // the loop: `no_content` is retryable by design, so a walled row spends two
      // fetches per visit and resolves nothing, for ever.
      //
      // So a host-level read failure schedules on the backoff ladder instead,
      // keyed off the row's own consecutive count, which `_read_exhausted`
      // already maintains. The ladder is capped, so a wall is never a permanent
      // skip: a permanent skip is a silent removal from verification.
      const hostFailure = (result.gate as { failure?: string }).failure === 'no_content'
        ? (result.gate as { detail?: string }).detail?.split(':')[0] as UnreadableReason | undefined
        : undefined
      const backedOff = hostFailure && isHostLevel(hostFailure)
        ? backoffHours(1 + Number(
            (row.field_evidence as Record<string, { consecutive?: number }> | null)
              ?.['_read_exhausted']?.consecutive ?? 0))
        : 0
      const dueAt = backedOff > 0
        ? new Date(Date.now() + backedOff * 3_600_000)
        : cadence.dueAt

      const { error: dueErr } = await db.from('scraped_grants')
        .update({ verify_due_at: dueAt.toISOString(), verify_flag: null })
        .eq('id', row.id)
      if (dueErr) {
        failures.push({ id: row.id, title: row.title, error: `verify_due_at: ${dueErr.message}` })
      }

      for (const p of result.proposals) {
        proposalTotal++
        if (proposals.length < REPORT_CAP) {
          proposals.push({ id: row.id, title: row.title, field: p.field, from: p.from, to: p.to, quote: p.quote })
        }
      }
      if (result.outcome === 'fixable_link') {
        fixableTotal++
        if (fixable.length < REPORT_CAP) {
          const g = result.gate as { failure?: string; detail?: string }
          fixable.push({ id: row.id, title: row.title, url: row.apply_url, failure: g.failure, detail: g.detail })
        }
      }
    })

    const stoppedEarly = overtime() && consumed < rows.length
    return {
      success: true,
      armed,
      ranWork: true,
      checked: consumed,
      requested: rows.length,
      stoppedEarly,
      remaining: Math.max(0, rows.length - consumed),
      elapsedMs: Date.now() - startedAt,
      queue,
      verify: {
        outcomes,
        cadence: shapes,
        /** Hosts skipped inside their read backoff, and how many rows each
         *  covered. Reported for the same reason shape C's count is: a deferred
         *  read must never read as a completed one. */
        hostsBackedOff: skippedHosts,
        evidence: tally,
        proposals: proposalTotal,
        fixableLinks: fixableTotal,
        failures: failures.length,
      },
      // Capped for storage. The totals above are not capped, so a truncated list
      // can never be mistaken for the whole answer.
      reportCap: REPORT_CAP,
      proposalSample: proposals,
      fixableSample:  fixable,
      failureSample:  failures.slice(0, REPORT_CAP),
    }
  })

  return NextResponse.json(payload)
}

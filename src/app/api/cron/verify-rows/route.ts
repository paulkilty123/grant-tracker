// The verification engine's home.
//
// `verify-row.ts` has worked for weeks and has never had a caller in the app —
// it has only ever been run from a script, by hand, over ids someone typed. So
// nothing in the catalogue has ever been checked on a schedule, and "when was
// this row last read against the funder's page" has had no answer for any row.
// This is the route that changes that.
//
//   GET /api/cron/verify-rows            scheduled: honours VERIFY_ENABLED
//   GET /api/cron/verify-rows?run=true   manual: runs regardless of the flag
//   GET /api/cron/verify-rows?limit=20   smaller batch
//   GET /api/cron/verify-rows?ids=a,b    specific rows, ignores the queue order
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
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { recordRun } from '@/lib/admin/cron-runs'
import { verifyRow, type VerifyRow, type VerifyResult } from '@/lib/verification/verify-row'
import { buildEvidencePatch, recordFieldEvidence, PAGE_READ_KEY } from '@/lib/field-evidence'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Bump when the extraction changes in a way that should invalidate old stamps. */
const VERIFIER = 'verify:v1'
const MODEL    = 'claude-haiku-4-5-20251001'

/** Measured shape: a page fetch is up to 12s and a model call ~4s, so a row is
 *  16-22s serial. Five at a time fits ~60 rows inside the window below. */
const CONCURRENCY = 5
const BATCH       = 60

/** Absolute, from startedAt. 300s is the function cap; this leaves 55s of margin
 *  for the final writes and the run record itself. */
const DEADLINE_MS = 245_000

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
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const SELECT_COLS =
  'id, title, funder, funding_type, apply_url, deadline, is_rolling, max_org_income, is_invite_only'

type QueueCounts = { eligible: number; neverChecked: number; band0: number; excluded: number }

async function queueCounts(db: SupabaseClient): Promise<QueueCounts | null> {
  const { data, error } = await db.rpc('verify_batch_counts')
  if (error || !Array.isArray(data) || data.length === 0) return null
  const r = data[0] as Record<string, number | string>
  return {
    eligible:     Number(r.eligible),
    neverChecked: Number(r.never_checked),
    band0:        Number(r.band0),
    excluded:     Number(r.excluded),
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
    if (!armed && !forced) {
      return {
        success: true, armed: false, ranWork: false, checked: 0, queue,
        note: 'VERIFY_ENABLED is not true and ?run=true was not passed, so no page was fetched',
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
    const rows = (rowData ?? []) as VerifyRow[]

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const outcomes:   Record<string, number> = {}
    const tally = { confirmed: 0, contradicted: 0, silent: 0, unquoted: 0 }
    const proposals: unknown[]    = []
    const fixable:   unknown[]    = []
    const failures:  unknown[]    = []
    let proposalTotal = 0
    let fixableTotal  = 0

    const { consumed } = await pool(rows, CONCURRENCY, overtime, async row => {
      let result: VerifyResult
      try {
        result = await verifyRow(row, anthropic)
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
      const { patch, unquoted } = buildEvidencePatch([
        ...result.evidence,
        {
          field: PAGE_READ_KEY, agrees: null, quote: null,
          source_url: result.followedUrl ?? row.apply_url,
          note: result.gate.pass ? result.outcome : `${result.outcome}: ${gate.failure ?? 'gate failed'}`,
        },
      ], { by: VERIFIER })
      tally.unquoted += unquoted.length
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

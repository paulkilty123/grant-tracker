// One row per scheduled-job run — see docs/pipeline-page-scope.md.
//
// Wrap a cron handler's body in recordRun() and the Pipeline page can answer
// "did it fire, did it work, what did it do, what did it cost" without SQL.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Service-role, because a cron has no session cookie. The two crons that used
 *  the cookie-based client ran as `anon` against a SELECT-only RLS policy and
 *  reported success while writing nothing, for their entire existence. */
function runsDb(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false }, global: { fetch: (u, i) => fetch(u, { ...i, cache: 'no-store' }) } },
  )
}

/** Token usage for one model, accumulated across every call a run makes. */
export type RunUsage = {
  model:         string
  input_tokens:  number
  output_tokens: number
  calls:         number
}

/**
 * Accumulate `response.usage` across a run.
 *
 * Every model-calling job in this codebase currently discards usage, so
 * "what did the catalogue cost last month" is unanswerable. That matters right
 * now: the July doc's biggest recommendation raises process-pipeline-queue from
 * 24 rows/day to ~3,400, turning roughly £0.30/day into roughly £40/day, and
 * that decision wants a measured baseline.
 *
 * Deliberately records TOKENS, not money. Prices change; a stored figure goes
 * quietly wrong while a token count stays true. The page multiplies at render.
 */
export class UsageTally {
  private byModel = new Map<string, RunUsage>()

  add(model: string, usage: { input_tokens?: number; output_tokens?: number } | null | undefined) {
    if (!usage) return
    const cur = this.byModel.get(model) ?? { model, input_tokens: 0, output_tokens: 0, calls: 0 }
    cur.input_tokens  += usage.input_tokens  ?? 0
    cur.output_tokens += usage.output_tokens ?? 0
    cur.calls         += 1
    this.byModel.set(model, cur)
  }

  toJSON(): RunUsage[] { return Array.from(this.byModel.values()) }
  get isEmpty(): boolean { return this.byModel.size === 0 }
}

/**
 * Read the usage block an admin route reports back over HTTP.
 *
 * A cron that reaches the model through a sibling route (`process-pipeline-queue`
 * and `reenrich-stale` both call `/api/admin/enrich-grant`) cannot see
 * `response.usage` itself. The route returns it, this reads it, and the run
 * tallies it exactly as if it had made the call directly.
 *
 * Returns null rather than throwing on any unexpected shape: a missing tally is
 * an under-count, and an under-count must never fail the run that did the work.
 */
export function usageFromAdminJson(
  json: unknown,
): { model: string; input_tokens: number; output_tokens: number } | null {
  const u = (json as { usage?: unknown } | null | undefined)?.usage
  if (!u || typeof u !== 'object') return null
  const { model, input_tokens: inTok, output_tokens: outTok } = u as Record<string, unknown>
  if (typeof model !== 'string' || !model) return null
  return {
    model,
    input_tokens:  typeof inTok  === 'number' ? inTok  : 0,
    output_tokens: typeof outTok === 'number' ? outTok : 0,
  }
}

/**
 * Discovery yield, by catalogue funding type.
 *
 * A DECLARED SHAPE, not a per-job field map. The Pipeline page renders this
 * whenever a summary carries it, keyed on the field existing rather than on the
 * job's name, so any future job that produces catalogue rows can report its
 * yield the same way without the page learning about it.
 *
 * `found` is what this run produced. `inReview` and `published` are the
 * CUMULATIVE state of everything the discovery path has ever produced, because
 * a run cannot know the fate of its own rows: they take days to be enriched,
 * gated and published. Attributing a publication to the run that found it would
 * need a cohort join nobody is asking for. The question this answers is "is the
 * funnel converting", and for that a snapshot alongside each run is enough.
 *
 * Keys are the four catalogue funding types (grant, programme, investment,
 * in_kind), not the discovery query categories, because those are what a row
 * actually becomes and what a user filters on.
 */
export type RunYield = {
  found:     Record<string, number>
  inReview?: Record<string, number>
  published?: Record<string, number>
}

/** Short labels: the Pipeline cell is narrow and "investment" three times over
 *  pushes the spend column off a laptop screen. */
const TYPE_SHORT: Record<string, string> = {
  grant: 'grant', programme: 'prog', investment: 'inv', in_kind: 'in-kind',
}

function tally(m: Record<string, number> | undefined): { total: number; parts: string } {
  const entries = Object.entries(m ?? {}).filter(([, n]) => n > 0)
  const total = entries.reduce((a, [, n]) => a + n, 0)
  const parts = entries
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t, n]) => `${TYPE_SHORT[t] ?? t} ${n}`)
    .join(', ')
  return { total, parts }
}

/**
 * One line of discovery yield for the Pipeline page, or null if this run did not
 * report any.
 *
 * Lives here rather than in the page for two reasons: it belongs next to the
 * shape it renders, and a page.tsx cannot export a helper for a test to import
 * without breaking the Next build (only default and metadata may be exported).
 */
export function formatYield(summary: Record<string, unknown> | null | undefined): string | null {
  const y = summary?.yield as RunYield | undefined
  if (!y || typeof y !== 'object' || !y.found) return null

  const found = tally(y.found)
  const bits: string[] = [found.parts ? `found ${found.total} (${found.parts})` : `found ${found.total}`]
  if (y.inReview) bits.push(`${tally(y.inReview).total} in review`)
  if (y.published) {
    const p = tally(y.published)
    bits.push(p.parts ? `${p.total} published (${p.parts})` : `${p.total} published`)
  }
  return bits.join(' · ')
}

/** The shape `verify-rows` reports. Declared here, beside the renderer. */
type RunVerify = {
  outcomes?:     Record<string, number>
  evidence?:     { confirmed?: number; contradicted?: number; silent?: number; unquoted?: number }
  proposals?:    number
  fixableLinks?: number
  failures?:     number
}

/** The queue counts the same run reports, from `verify_batch_counts()`. */
type RunQueue = {
  /** Live rows asserting timing with no quoted confirmation behind it. */
  liveUnbacked?:      number
  /** Rows read where the page still does not say when anyone can apply. */
  timingUnknown?:     number
  timingUnknownLive?: number
  flagged?:           number
}

/**
 * One line of verification result for the Pipeline page, or null if this run did
 * not report any.
 *
 * Keyed on the summary carrying the shape rather than on the job's name, the
 * same as `formatYield`, so a second verifier would render without the page
 * learning about it.
 *
 * `unread` is deliberately named, and deliberately not called "missing". It
 * counts fields the page was asked about and said nothing about, which is the
 * most useful number here: it measures how far a single-page read actually
 * gets, and it is the number that should fall when multi-page sourcing lands. A
 * run that checked 60 rows and learned nothing from any of them would otherwise
 * look identical to one that verified them all.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TWO STANDING GAPS ARE ON THIS LINE AS A CONDITION
 *
 * Set by Paul, 2026-08-16, on approving the backoff:
 *
 *   "Shape C's count goes on the Pipeline line beside live_unbacked from day
 *    one, so a deferred gap never reads as a closed one."
 *
 * The per-run tally answers "what did this run do". These two answer "what is
 * still wrong", and they are the ones that will not move on their own:
 *
 *   claimed  341 live rows assert their timing with no quote behind it
 *   unknown  378 rows have been read and the page still does not say
 *
 * A backoff makes the second cheaper to live with. It does not make it smaller,
 * and a schedule that quietly stops asking is indistinguishable on a dashboard
 * from a question that got answered. Both counts are the whole population, not
 * the part currently due — a row resting inside its cadence is no better
 * evidenced for resting.
 */
export function formatVerify(summary: Record<string, unknown> | null | undefined): string | null {
  const v = summary?.verify as RunVerify | undefined
  if (!v || typeof v !== 'object') return null

  const checked = typeof summary?.checked === 'number' ? summary.checked : null
  const e       = v.evidence ?? {}
  const bits: string[] = []

  if (checked !== null) bits.push(`checked ${checked}`)
  const ev = [
    e.confirmed    ? `${e.confirmed} confirmed`       : null,
    e.contradicted ? `${e.contradicted} contradicted` : null,
    e.silent       ? `${e.silent} unread`             : null,
  ].filter(Boolean)
  if (ev.length > 0) bits.push(ev.join(', '))
  if (v.proposals)    bits.push(`${v.proposals} proposal${v.proposals === 1 ? '' : 's'}`)
  if (v.fixableLinks) bits.push(`${v.fixableLinks} link${v.fixableLinks === 1 ? '' : 's'} to fix`)
  if (v.failures)     bits.push(`${v.failures} failed`)

  // The standing gaps, after the run's own numbers. Rendered whenever the run
  // reported the queue at all, including when the counts are zero — "claimed 0"
  // is worth seeing, and a line that only appears while the news is bad teaches
  // a reader to stop looking for it.
  const q = summary?.queue as RunQueue | undefined
  if (q && typeof q === 'object') {
    const gaps: string[] = []
    if (typeof q.flagged === 'number' && q.flagged > 0) gaps.push(`${q.flagged} flagged`)
    if (typeof q.liveUnbacked === 'number')  gaps.push(`${q.liveUnbacked} claimed`)
    if (typeof q.timingUnknown === 'number') gaps.push(`${q.timingUnknown} unknown`)
    if (gaps.length > 0) bits.push(`queue: ${gaps.join(', ')}`)
  }
  // A run that ran out of clock says so on the line, not only in the JSON.
  if (summary?.stoppedEarly === true) {
    const left = typeof summary?.remaining === 'number' ? `, ${summary.remaining} left` : ''
    bits.push(`stopped on the clock${left}`)
  }

  return bits.length > 0 ? bits.join(' · ') : null
}

type RunContext = {
  usage: UsageTally
  /** This run's own `cron_runs` id, so a handler can exclude itself when asking
   *  whether another run of the same job is already in flight. Null if the row
   *  could not be opened — bookkeeping never blocks the job. */
  runId: string | null
}

/**
 * The longest any run can legitimately still be open.
 *
 * Vercel's hard function cap is 300s, so a row open for fifteen minutes is not
 * slow, it is dead. The margin is deliberately generous: a false reap would mark
 * a healthy job as failed, which is a worse lie than the silence it replaces.
 */
const ABANDONED_AFTER_MS = 15 * 60 * 1000

/**
 * Close runs that started and never reported back.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS CANNOT LIVE INSIDE recordRun's OWN ERROR HANDLING.
 *
 * `finish()` is reached on a normal return or a thrown error. A run killed by
 * the platform is neither: the process is gone, so no `catch`, no `finally`, and
 * no amount of care inside the handler can write that row. `ok IS NULL` is the
 * correct signature and the migration documents it as such.
 *
 * The consequence is that the one failure mode nobody can self-report was also
 * the one nothing reported. On 2026-08-15 `discover-sweep` was killed at exactly
 * 300s by Vercel; the row sat open, the Pipeline page showed "no reply" in
 * amber, and it was found four days later only because somebody went looking.
 *
 * So detection has to come from outside the run, and the cheapest outside is the
 * next run of any job at all. No new cron entry, no new schedule to forget, and
 * with 38 jobs a day the detection lag is minutes rather than days. It writes
 * `ok = false`, which the Pipeline page already renders red — the alarm reuses
 * the existing signal rather than inventing a second one nobody watches.
 *
 * NEVER THROWS. Same rule as the rest of this file: bookkeeping that can break
 * the job it observes is worse than no bookkeeping.
 */
export async function reapAbandonedRuns(
  db: SupabaseClient,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - ABANDONED_AFTER_MS).toISOString()
  try {
    const { data, error } = await db
      .from('cron_runs')
      .update({
        ok:          false,
        finished_at: now.toISOString(),
        error:       'never reported back: killed or timed out. The process died before it could record anything, so there is no summary and no error from the job itself. Check the platform runtime log for the window around started_at.',
      })
      .is('ok', null)
      .is('finished_at', null)
      .lt('started_at', cutoff)
      .select('id, job')

    if (error) {
      console.error('[cron_runs] reap failed:', error.message)
      return 0
    }
    const rows = (data ?? []) as { job: string }[]
    if (rows.length > 0) {
      console.error(`[cron_runs] reaped ${rows.length} abandoned run(s): ${rows.map(r => r.job).join(', ')}`)
    }
    return rows.length
  } catch (e) {
    console.error('[cron_runs] reap threw:', e)
    return 0
  }
}

/**
 * Record one run of `job`, whatever happens.
 *
 * The handler's return value is stored verbatim as `summary` — every cron
 * already computes its counts and returns them in JSON, so this persists what
 * exists rather than calculating anything new.
 *
 * NEVER THROWS ON ITS OWN ACCOUNT. An observability layer that can break the
 * job it observes is worse than no observability: a failed insert here must not
 * turn a healthy crawl into a failed one. Bookkeeping errors are logged and
 * swallowed; the handler's own error is recorded and then re-thrown so the route
 * still returns its real status.
 */
export async function recordRun<T>(
  job: string,
  fn: (ctx: RunContext) => Promise<T>,
): Promise<T> {
  const db = runsDb()
  const ctx: RunContext = { usage: new UsageTally(), runId: null }
  let runId: string | null = null

  // Sweep before opening. Every job that runs closes somebody else's abandoned
  // row, so the more the platform is doing the sooner a killed run turns red.
  await reapAbandonedRuns(db)

  try {
    const { data } = await db.from('cron_runs').insert({ job }).select('id').single()
    runId = (data as { id?: string } | null)?.id ?? null
    ctx.runId = runId
  } catch (e) {
    console.error(`[cron_runs] could not open run for ${job}:`, e)
  }

  const finish = async (ok: boolean, summary: unknown, error?: string) => {
    if (!runId) return
    // `summary` must be a JSON object for the page to read it. A handler
    // returning a bare value (or nothing) gets wrapped rather than dropped.
    const body: Record<string, unknown> =
      summary && typeof summary === 'object' && !Array.isArray(summary)
        ? { ...(summary as Record<string, unknown>) }
        : { result: summary ?? null }
    if (!ctx.usage.isEmpty) body.usage = ctx.usage.toJSON()
    try {
      await db.from('cron_runs')
        .update({ finished_at: new Date().toISOString(), ok, summary: body, error: error ?? null })
        .eq('id', runId)
    } catch (e) {
      console.error(`[cron_runs] could not close run for ${job}:`, e)
    }
  }

  try {
    const result = await fn(ctx)
    await finish(true, result)
    return result
  } catch (err) {
    await finish(false, null, err instanceof Error ? err.message : String(err))
    throw err
  }
}

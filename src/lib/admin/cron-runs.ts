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

type RunContext = { usage: UsageTally }

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
  const ctx: RunContext = { usage: new UsageTally() }
  let runId: string | null = null

  try {
    const { data } = await db.from('cron_runs').insert({ job }).select('id').single()
    runId = (data as { id?: string } | null)?.id ?? null
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

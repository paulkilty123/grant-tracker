// Pipeline v1 Phase 4 — auto-chain processor.
// See docs/pipeline-v1-spec.md §8.
//
// Picks up captured rows (typically from scraper inserts) and runs the chain:
//   enrich → classify → sweep
//
// Each step is a self-HTTP call to the corresponding admin route with the
// ADMIN_SECRET bearer. Step failures quarantine the row (one-shot, no retries
// in v1 — admin clears needs_intervention_reason to retry).
//
// GET /api/cron/process-pipeline-queue
//   Auth: Bearer ${CRON_SECRET}
//   Returns: { processed, enriched, classified, swept, quarantined, batches }
//
// ── Throughput history ───────────────────────────────────────────────────────
// This route was written for a 5-minute cadence (288 runs/day x 12 rows =
// ~3,456 rows/day). Commit 1d05315 moved it to daily because Vercel HOBBY
// rejects sub-daily crons, and a rejected schedule silently fails EVERY build.
// The header comment kept claiming "every 5 min" and "~140 rows/hour" while it
// actually ran once a day: 12 rows/day, a 288x throttle. A 300-row scraper burst
// would have taken 25 days to drain.
//
// 2026-07-25: the account is demonstrably on Pro (26 cron entries deploy from
// main; Hobby caps at 2 and daily-only), so the schedule is back to */10.
//
// Sizing: each row's chain takes ~15-25s (enrich + classify + sweep). At the old
// fixed BATCH_LIMIT of 12 with no time guard, 12 x 25s = 300s exceeded the 270s
// maxDuration — the tail rows were killed mid-chain, after paying for enrich but
// before sweep, so the next run re-paid the enrich cost. There is now a wall-clock
// budget: rows are processed until the budget is spent, so the batch is
// self-limiting and stays safe at any frequency or chain latency. BATCH_LIMIT is
// now just the fetch ceiling.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/admin/admin-db'
import { recordRun, usageFromAdminJson } from '@/lib/admin/cron-runs'

export const dynamic     = 'force-dynamic'
export const maxDuration = 270  // ~4.5 min, leaves buffer under 300s cap

// Fetch ceiling. Higher than what one run can finish, deliberately: the time
// budget below decides how many actually get processed, and over-fetching means
// a fast run can use its whole budget instead of idling.
const BATCH_LIMIT = 24

// Stop starting new rows past this point, so the function returns a clean
// summary instead of being killed mid-chain by the platform timeout. Sized to
// leave one worst-case chain (~25s) of headroom under maxDuration.
const TIME_BUDGET_MS = 240_000

function adminClient() {
  return getAdminDb()
}

// Internal admin calls send a Bearer ADMIN_SECRET, so they MUST hit the
// canonical www host directly. Two traps this avoids:
//   - an apex host 307-redirects to www and the redirect STRIPS the
//     Authorization header (see curl-auth-redirect-strip memory);
//   - the *.vercel.app deployment URL (VERCEL_URL) is behind Vercel
//     Deployment Protection and 401s server-to-server.
// Both made the enrich/classify/sweep self-calls fail auth. Force www for any
// production host; pass through anything else (e.g. localhost in dev).
function siteBase(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
    || 'https://www.shootsfunding.co.uk'
  // granttracker is matched too: it is the legacy alias, it still serves the
  // admin API without redirecting, and an env var left pointing at it should
  // land on the canonical host rather than quietly using the old brand.
  if (/granttracker\.co\.uk|shootsfunding\.co\.uk|vercel\.app/.test(raw)) return 'https://www.shootsfunding.co.uk'
  return raw
}

async function callAdmin(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; json: unknown; error?: string }> {
  try {
    const res = await fetch(`${siteBase()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.ADMIN_SECRET ?? ''}`,
      },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      const errMsg = (json as { error?: string })?.error ?? `HTTP ${res.status}`
      return { ok: false, status: res.status, json, error: errMsg }
    }
    return { ok: true, status: res.status, json }
  } catch (err) {
    return { ok: false, status: 0, json: null, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── Quarantine a row when the chain fails ────────────────────────────────────
// One-shot: any step failure → needs_intervention_reason populated. Cron's
// next run skips rows with this field set. Admin clears it to retry.
async function quarantine(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  id: string,
  step: 'enrich' | 'classify' | 'sweep',
  errorMsg: string,
): Promise<void> {
  await db.from('scraped_grants')
    .update({ needs_intervention_reason: `${step}_failed: ${errorMsg.slice(0, 400)}` })
    .eq('id', id)
}

// ── Process one row through the chain ────────────────────────────────────────
type ChainResult = {
  id:          string
  enriched:    boolean
  classified:  boolean
  swept:       boolean
  quarantined: boolean
  error?:      string
  // Enrichment runs over HTTP in a sibling route, so its cost can only reach
  // the run's tally by being carried back out of here.
  usage?:      { model: string; input_tokens: number; output_tokens: number } | null
}

async function processOne(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  id: string,
): Promise<ChainResult> {
  const result: ChainResult = { id, enriched: false, classified: false, swept: false, quarantined: false }

  // Step 1: enrich
  const enrich = await callAdmin('/api/admin/enrich-grant', { grantId: id })
  if (!enrich.ok) {
    await quarantine(db, id, 'enrich', enrich.error ?? `HTTP ${enrich.status}`)
    return { ...result, quarantined: true, error: enrich.error }
  }
  result.enriched = true
  result.usage = usageFromAdminJson(enrich.json)

  // Step 2: classify by explicit grant ID. include_review=true bypasses the
  // standard is_active=true filter so NR rows (which are is_active=false) get
  // classified during the auto-chain. force=true ensures re-classification
  // even if the row already has tags (safer than relying on null-impact_sectors
  // detection which can race with the merger).
  const classify = await callAdmin('/api/admin/classify-grants', {
    grant_ids:      [id],
    include_review: true,
    force:          true,
    preserve_empty: true,  // automated chain: an empty [] from Claude must not wipe existing structures/beneficiaries
  })
  if (!classify.ok) {
    // Classification miss is non-fatal — the row still has the enriched brief.
    // Log and continue to sweep; admin can re-classify manually if needed.
    console.warn('[process-pipeline-queue] classify miss:', id, classify.error)
  } else {
    result.classified = true
  }

  // Step 3: sweep
  const sweep = await callAdmin('/api/admin/sweep', { id })
  if (!sweep.ok) {
    await quarantine(db, id, 'sweep', sweep.error ?? `HTTP ${sweep.status}`)
    return { ...result, quarantined: true, error: sweep.error }
  }
  result.swept = true

  return result
}

// ── Cron entry ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth       = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let httpStatus = 200
  const payload = await recordRun('process-pipeline-queue', async ctx => {
    const db = adminClient()

    // Fetch captured rows that haven't been quarantined yet, newest arrival
    // first.
    //
    // next_open_date IS NULL excludes funds we have verified as closed until a
    // future date. The state guard alone is not enough: de-publishing a row
    // used to send it back to 'captured' (fixed in transitionPipelineState, but
    // any other write path could do it again), and a closed fund is not a
    // candidate for enrichment under ANY state — there is nothing new to learn
    // and no user who can see the result. Structural, not a one-off drain.
    //
    // Ordering is newest-arrival-first, not oldest-stale-first. last_seen_at
    // ascending was a backfill order: it prioritised whatever the scraper had
    // seen least recently, which is a staleness signal, not an arrival one, and
    // it meant every genuinely new fund queued behind the entire historical
    // backlog. At ~6 rows/day that was a week's wait before a new opportunity
    // could appear in "X new since your last login" — the one place where
    // enrichment latency is visible to users. Freshness of stale rows is
    // reenrich-stale's job; this queue exists to process arrivals.
    //
    // Starvation caveat: sustained arrivals above throughput would hold the tail
    // back indefinitely. Acceptable while the real backlog is 4 rows, and the
    // proper fix is cadence (see the throughput history above), not ordering.
    const { data: queued, error: fetchErr } = await db
      .from('scraped_grants')
      .select('id')
      .eq('pipeline_state', 'captured')
      .is('needs_intervention_reason', null)
      .is('next_open_date', null)
      .order('first_seen_at', { ascending: false, nullsFirst: false })
      .limit(BATCH_LIMIT)

    if (fetchErr) {
      httpStatus = 500
      return { error: `fetch queue: ${fetchErr.message}` }
    }

    const ids = (queued ?? []).map((r: { id: string }) => r.id)
    if (ids.length === 0) {
      return { processed: 0, enriched: 0, classified: 0, swept: 0, quarantined: 0, batches: 0, message: 'queue empty' }
    }

    const startedAt = Date.now()
    const results: ChainResult[] = []
    let skippedForBudget = 0

    for (const id of ids) {
      // Wall-clock guard: never START a chain we may not be able to finish.
      // Being killed mid-chain wastes the enrich spend and leaves the row in
      // 'captured' to be re-enriched from scratch next run.
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        skippedForBudget = ids.length - results.length
        break
      }
      const chain = await processOne(db, id)
      if (chain.usage) ctx.usage.add(chain.usage.model, chain.usage)
      results.push(chain)
    }

    const enriched    = results.filter(r => r.enriched).length
    const classified  = results.filter(r => r.classified).length
    const swept       = results.filter(r => r.swept).length
    const quarantined = results.filter(r => r.quarantined).length

    if (skippedForBudget > 0) {
      console.log(
        `[process-pipeline-queue] time budget spent after ${results.length} rows; ` +
        `${skippedForBudget} left for the next run`
      )
    }

    return {
      processed:   results.length,
      enriched, classified, swept, quarantined,
      skippedForBudget,
      elapsedMs:   Date.now() - startedAt,
      batches:     1,
      quarantines: results.filter(r => r.quarantined).map(r => ({ id: r.id, error: r.error })),
    }
  })
  return NextResponse.json(payload, { status: httpStatus })
}

// The auto-publish gate — the thing that is meant to give Paul his evenings back.
//
// Runs deriveReviewReasons() over the review queue and publishes every row that
// carries no reason a user would be misled by. Rows that do carry one stay in
// the queue with the reason attached; rows that carry one AND are already live
// are surfaced as 'attention' rather than retracted.
//
// ─────────────────────────────────────────────────────────────────────────────
// Four things this route does deliberately differently from its neighbours,
// each because the 2026-07-25 audit found the opposite pattern causing harm:
//
//  1. SERVICE-ROLE CLIENT, always. expire-grants and check-stale-rounds import
//     the cookie-based client; a cron has no session cookie, so they run as
//     anon against a table whose only RLS policy is public SELECT. PostgREST
//     accepts the write, RLS matches zero rows, and NO ERROR IS RETURNED. Both
//     jobs have reported success with non-zero counts while changing nothing,
//     for their entire existence.
//
//     HOW TO VERIFY A RUN, precisely: this route writes only `is_active`, which
//     is NOT in TRACKED_FIELDS, so mergeGrantUpdate takes its untracked path and
//     stamps NOTHING into field_provenance. Looking for `system:auto_publish`
//     there will show zero rows and read as a silent failure when the run in
//     fact worked. The real evidence is `pipeline_state = 'published'` on the
//     decided rows, cross-referenced with publish_gate_decisions.applied.
//
//  2. WRITES AS `system:auto_publish` (trust 50), NEVER `admin:`. Today that
//     source only feeds transitionPipelineState, since is_active carries no
//     provenance (see above). It is still stated explicitly because the moment
//     this gate writes a tracked field, an admin: source would land at trust 100,
//     permanently outrank ai_enrich (60), and fossilise the field against every
//     future AI pass — automation that locks rather than compounds. The default
//     must already be right when that day comes.
//
//  3. READS mergeGrantUpdate's `rejected` ARRAY. classify-grants, fill-amounts,
//     fill-deadlines, sweep, audit-eligibility and bulk-reenrich all discard it
//     and increment their success counters regardless. That is how "Detect all"
//     came to report success while the trust ladder silently blocked every
//     write. If this route says it published a row, publish_gate_decisions
//     holds the evidence that the write actually landed.
//
//  4. DEFAULTS TO DRY RUN. The blocking set is a judgement call modelled against
//     one day's queue. The first live run should be a decision, not a deploy
//     side effect.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { mergeGrantUpdate } from '@/lib/grant-merge'
import { deriveReviewReasons, type ReviewRow } from '@/lib/admin/review-reasons'
import { gateDecision, GATE_POLICY_VERSION, type GateDecision } from '@/lib/admin/publish-gate'

export const dynamic     = 'force-dynamic'
export const maxDuration = 270

/**
 * The gate makes no network calls and no LLM calls — it is pure computation
 * over columns already fetched, plus one write per publishable row. The whole
 * 127-row queue completes in seconds. The limit is a runaway guard, not a
 * throughput constraint, and is set well above any plausible queue depth so it
 * never becomes a silent cap of the kind this audit kept finding.
 */
const BATCH_LIMIT = 500

/** Mirrors the Review Inbox's predicate exactly, so the gate and the queue
 *  can never disagree about which rows are "waiting for a human". */
const QUEUE_STATES = ['captured', 'enriched', 'tagged', 'tagged_awaiting_review']

const COLS = [
  'id', 'title', 'funder', 'is_active', 'pipeline_state', 'url_status', 'url_quality_score',
  'amount_min', 'amount_max', 'deadline', 'is_rolling', 'next_open_date', 'deadline_cycle',
  'eligible_structures', 'impact_sectors', 'target_beneficiaries',
  'funder_brief', 'field_provenance', 'raw_data', 'needs_intervention_reason',
].join(', ')

type Row = ReviewRow & { title?: string | null; funder?: string | null; pipeline_state?: string }

export async function GET(req: NextRequest) {
  const auth       = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // Same three auth paths as the other cron routes:
  //   1. Vercel cron → Bearer ${CRON_SECRET}
  //   2. Manual admin curl → Bearer ${ADMIN_SECRET}
  //   3. Manual admin via browser button → admin session cookie
  const isCronCaller  = !!(cronSecret && auth === `Bearer ${cronSecret}`)
  const isAdminCaller = !isCronCaller && (isAdminBearerToken(auth) || (await requireAdmin()).ok)
  if (!isCronCaller && !isAdminCaller) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Dry run is the DEFAULT. Writing requires saying so, by one of two routes:
  //
  //   ?apply=true                  a manual run, human present
  //   AUTO_PUBLISH_ENABLED=true    arms the SCHEDULED run
  //
  // The query string is the discriminator between manual and scheduled, NOT the
  // secret. `vercel.json` invokes a fixed, parameterless path, so a scheduled
  // run can never send ?apply=true; a manual caller always can. That matters
  // because ADMIN_SECRET and CRON_SECRET currently hold the SAME VALUE, which
  // makes `isCronCaller` win for every bearer-token caller and leaves the
  // "manual admin trigger" branch unreachable. The sibling routes that gate on
  // that distinction (reenrich-stale documents manual triggers as bypassing its
  // cron-enabled gate) do not actually behave as their comments claim while the
  // two secrets match. This route therefore does not rely on the distinction.
  const wantsApply = req.nextUrl.searchParams.get('apply') === 'true'
  const armed      = process.env.AUTO_PUBLISH_ENABLED === 'true'

  // `?dryRun=true` forces a dry run, and OVERRIDES both of the above.
  //
  // Until this existed there was no way to ask an armed production route what
  // it would do. Once AUTO_PUBLISH_ENABLED is set, `armed` alone makes dryRun
  // false, so every call — including a bare parameterless GET — publishes. That
  // left the only safe verification at the deployment level (is the env var
  // present, is the cron registered) and made "what would run tonight?"
  // unanswerable without running it. A gate whose behaviour cannot be inspected
  // without triggering it is the same class of problem as a cron that reports
  // success while writing nothing: the state is unobservable.
  //
  // Deliberately wins over `?apply=true` as well. If a caller sends both, the
  // contradictory request resolves to the harmless reading.
  const forcedDryRun = req.nextUrl.searchParams.get('dryRun') === 'true'
  const dryRun       = forcedDryRun || !(wantsApply || armed)

  // Canary cap: apply at most N publishes this run.
  //
  // Paired with the already-live-first ordering below, `?apply=true&limit=3`
  // exercises the entire write path — merger, trust ladder, state transition,
  // RLS — while changing nothing any user can see, because those rows are
  // already visible and is_active is already true. That matters here more than
  // usual: the two crons this route is modelled on reported success for their
  // whole existence while RLS silently rejected every write, and the only way
  // to know the difference is to make a real write and then go and look at it.
  const limitParam = Number(req.nextUrl.searchParams.get('limit'))
  const applyLimit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : Infinity

  // `cache: 'no-store'` is not optional here.
  //
  // supabase-js issues its queries through global fetch, which Next.js patches
  // and caches. Observed 2026-07-26: after a run published 73 rows and drained
  // the queue from 125 to 52, the very next invocation still read 125 and
  // re-published 3 rows it had already published minutes earlier. The response
  // looked entirely healthy — right shape, plausible counts, no error — which is
  // the failure mode this whole route exists to guard against, arriving through
  // the read path instead of the write path.
  //
  // `export const dynamic = 'force-dynamic'` does NOT cover this: it governs
  // route rendering, not the fetch cache inside a client library.
  //
  // A gate acting on a stale snapshot would publish rows a human had just
  // rejected and miss rows added since. Correctness here depends on reading
  // the queue as it is at this instant.
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: 'no-store' }),
      },
    },
  )

  const { data, error } = await db
    .from('scraped_grants')
    .select(COLS)
    .in('pipeline_state', QUEUE_STATES)
    .not('saved_for_later', 'is', 'true')
    .limit(BATCH_LIMIT)

  // A failed read must never look like an empty queue. Six of eight queue
  // loaders in the old admin page ignored their error and rendered
  // "all clear!" when they had simply failed to read.
  if (error) {
    return NextResponse.json(
      { success: false, error: `queue read failed: ${error.message}` },
      { status: 500 },
    )
  }

  const rows = (data ?? []) as unknown as Row[]
  const decisions: Array<{ row: Row; decision: GateDecision }> = rows
    .map(row => ({ row, decision: gateDecision(row, deriveReviewReasons(row)) }))
    // Already-live publishes first, so a capped canary run touches only rows
    // whose visibility is not actually changing. Without this the cap would
    // take an arbitrary slice and the first live run could expose new rows
    // before the write path had been shown to work.
    .sort((a, b) => Number(b.decision.wasLive) - Number(a.decision.wasLive))

  const toPublish = decisions.filter(d => d.decision.outcome === 'publish')
  const attention = decisions.filter(d => d.decision.outcome === 'attention')
  const held      = decisions.filter(d => d.decision.outcome === 'hold')

  const published: string[] = []
  const failed: Array<{ id: string; title: string; reason: string }> = []
  const auditRows: Record<string, unknown>[] = []

  for (const { row, decision } of decisions) {
    let applied  = false
    let rejected: string[] = []

    const withinCap = published.length < applyLimit
    if (decision.outcome === 'publish' && !dryRun && withinCap) {
      try {
        // is_active is untracked, so this goes through mergeGrantUpdate's
        // untracked path, which still computes the pipeline_state transition —
        // transitionPipelineState maps is_active:true → 'published'. Passing
        // pipeline_state explicitly would SKIP that transition (it is treated
        // as an admin override), so it is deliberately omitted.
        const res = await mergeGrantUpdate({
          id:     row.id,
          fields: { is_active: true },
          source: 'system:auto_publish',   // trust 50 — see header note 2
          db,
        })
        rejected = res.rejected.map(r => r.field)
        applied  = res.applied.includes('is_active')

        if (applied) published.push(row.id)
        else failed.push({
          id: row.id,
          title: row.title ?? row.id,
          reason: rejected.length ? `write rejected: ${rejected.join(', ')}` : 'no field applied',
        })
      } catch (e) {
        failed.push({
          id: row.id,
          title: row.title ?? row.id,
          reason: e instanceof Error ? e.message : String(e),
        })
      }
    }

    auditRows.push({
      grant_id:            row.id,
      outcome:             decision.outcome,
      was_live:            decision.wasLive,
      blocking_codes:      decision.blocking.map(r => r.code),
      informational_codes: decision.informational.map(r => r.code),
      applied,
      rejected_fields:     rejected,
      policy_version:      GATE_POLICY_VERSION,
      // A publish deferred by the canary cap had no write ATTEMPTED, so it is
      // recorded as a dry decision. Recording it as a live run with
      // applied=false would be indistinguishable from a write the trust ladder
      // refused, and would quietly corrupt the calibration data this table
      // exists to provide.
      dry_run:             dryRun || (decision.outcome === 'publish' && !withinCap),
    })
  }

  const auditError = await recordDecisions(db, auditRows)

  return NextResponse.json({
    success: true,
    dryRun,
    armed,
    policyVersion: GATE_POLICY_VERSION,
    queueSize: rows.length,
    counts: {
      publish:   toPublish.length,
      attention: attention.length,
      hold:      held.length,
    },
    // Split so the headline number cannot flatter itself: publishing a row that
    // was already live changes nothing a user sees, and should not be counted
    // as the gate having saved a review.
    publishBreakdown: {
      newlyVisible:   toPublish.filter(d => !d.decision.wasLive).length,
      alreadyVisible: toPublish.filter(d => d.decision.wasLive).length,
    },
    written: dryRun ? 0 : published.length,
    // Never let a cap pass as full coverage. Every silent truncation this audit
    // found — the 12-row queue, the unrotated watchlist, the .limit(N)-then-
    // filter checks — read as "we covered everything" when it had not.
    deferredByCap: dryRun ? 0 : Math.max(0, toPublish.length - published.length - failed.length),
    applyLimit: Number.isFinite(applyLimit) ? applyLimit : null,
    failed,
    auditError,
    attentionRows: attention.slice(0, 20).map(d => ({
      id:    d.row.id,
      title: d.row.title ?? '',
      why:   d.decision.blocking.map(r => r.label),
    })),
  })
}

/**
 * Persist the decisions. A failure here is reported, never thrown: losing the
 * audit trail must not roll back or mask publishes that already happened, and
 * it must not be silent either — a gate you cannot calibrate is a gate you
 * cannot trust to loosen later.
 */
async function recordDecisions(
  db: SupabaseClient,
  auditRows: Record<string, unknown>[],
): Promise<string | null> {
  if (auditRows.length === 0) return null
  const { error } = await db.from('publish_gate_decisions').insert(auditRows)
  if (!error) return null
  console.error('[auto-publish] decision audit insert failed:', error.message)
  return error.message
}

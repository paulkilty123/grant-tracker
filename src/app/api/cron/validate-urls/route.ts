// Weekly cron — runs every Monday at 03:00 UTC
// 1. Checks all active scraped_grants with an apply_url
// 2. Marks dead ones as url_status='dead' AND is_active=false (auto-deactivate)
// 3. Re-checks a bounded slice of rows THIS cron previously killed (recovery)
// 4. Checks all SEED_GRANTS URLs and logs dead ones
// 5. Returns a JSON summary (visible in Vercel cron logs)
//
// 2026-07-25 — three fixes here:
//
//   (a) Writes went through raw .update(), bypassing mergeGrantUpdate, so
//       is_active=false never triggered a pipeline_state transition. The rows
//       became pipeline_state='published' + is_active=false: invisible to users
//       AND to every admin queue. transitionPipelineState already maps
//       is_active=false + url_status='dead' → 'archived', so routing through
//       the merger is all that was needed.
//
//   (b) `grant_closed` was collapsed into url_status='dead'. That is a factual
//       lie — the page loads fine, the funding round is closed — and it
//       deactivated grants that will reopen, pre-empting expire-grants'
//       roll-forward logic (which requires is_active=true). Now recorded
//       honestly and routed to review while left visible, matching the pattern
//       reenrich-stale and check-stale-rounds already use.
//
//   (c) The candidate query filtered is_active=true, and the job deactivates on
//       dead — so its own casualties were permanently excluded from ever being
//       re-checked. A URL that recovered was never rediscovered. Now there is a
//       bounded recovery pass.
//
//       IMPORTANT: recovery targets ONLY rows this cron killed, identified by
//       url_last_checked IS NOT NULL. Rows with url_status='dead' AND
//       url_last_checked IS NULL are the documented manual-admin-hide
//       signature (564 such rows as of 2026-07-25) — re-checking those would
//       resurrect grants Paul deliberately hid. Do not widen this predicate.
import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/admin/admin-db'
import { checkUrl, deepCheckUrl } from '@/lib/url-validator'
import { mergeGrantUpdate } from '@/lib/grant-merge'
import { SEED_GRANTS } from '@/lib/grants'
import { recordRun } from '@/lib/admin/cron-runs'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300

// Stop launching new batches past this point so the function returns a clean
// summary instead of being killed mid-write by the platform timeout.
const TIME_BUDGET_MS = 270_000

const PROVENANCE_SOURCE = 'system:validate_urls:v2'

// Recovery pass is deliberately small: the main sweep already consumes ~91% of
// the time budget at current catalogue size, and recovery is not urgent.
// 141 eligible rows / 40 per run ≈ a full recovery cycle every 4 weeks.
const RECOVERY_LIMIT = 40

// Reserved slice for the review-queue pass (§1), carved off the front of the
// run rather than left over at the end. See the long note at that pass: as the
// leftover it was starved on every run, which let rows publish on a link
// nothing had ever fetched.
//
// 60s of the 270s budget. At 10-way concurrency that is far more than the
// QUEUE_LIMIT below needs, so in practice the row limit binds and the sweep
// keeps almost all of its time. The budget is a ceiling to stop a run of
// timing-out hosts eating the sweep, not an allocation to be spent.
const QUEUE_BUDGET_MS = 60_000

// Larger than RECOVERY_LIMIT because these are the rows whose check GATES a
// publish decision, and the queue is small enough to drain: 121 rows at the
// 2026-08-12 measurement, so ~2 runs from cold and comfortably ahead of
// discovery's daily additions thereafter.
const QUEUE_LIMIT = 60

function getAdminClient() {
  return getAdminDb()
}

// Processes items in parallel batches. When `deadline` is supplied, stops
// launching new batches once the wall-clock deadline passes — leaving the
// remaining items unprocessed (count returned via `skipped`).
async function inBatches<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
  deadline?: number,
): Promise<{ results: R[]; skipped: number }> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += size) {
    if (deadline && Date.now() > deadline) {
      return { results, skipped: items.length - i }
    }
    const batch = items.slice(i, i + size)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
  }
  return { results, skipped: 0 }
}

export async function GET(req: NextRequest) {
  // Auth: Vercel passes Authorization: Bearer <CRON_SECRET> on cron invocations.
  // In development (no CRON_SECRET set), skip the check.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let httpStatus = 200
  const payload = await recordRun('validate-urls', async () => {
    const supabase  = getAdminClient()
    const ranAt     = new Date().toISOString()
    const startedAt = Date.now()

    // ── 1. Review-queue pass — the rows that cannot publish until this runs ───
    //
    // RUNS FIRST, AND HAS ITS OWN BUDGET. Both of those are load-bearing.
    //
    // Rows awaiting review are is_active=false, so the catalogue sweep
    // (is_active=true) never reaches them, and the recovery pass only takes rows
    // already marked dead. A withheld row with url_status='unchecked' is
    // reachable by neither: it is held because its link is unverified, and
    // nothing else will ever verify it while it is held.
    //
    // This pass existed to break that deadlock and ran LAST, on whatever budget
    // the catalogue sweep left. It never got any. Measured on the 2026-08-12
    // run: the sweep spent 277s of a 270s budget on 645 active rows and returned
    // `budgetExceeded: true`, so recovery checked 0 and this pass checked 0. It
    // had been starved on every run, and always would be, because the sweep
    // grows with the catalogue and this pass was the remainder.
    //
    // The consequence was not theoretical. On 12 August, 12 rows discovered at
    // 23:06 the previous night were published at 09:00 on a link nothing had
    // ever fetched, because the only job that could have checked them ran at
    // 03:00 in between and had nothing left when it got here.
    //
    // A never-checked withheld row is the only kind whose check GATES something.
    // An active row has been checked before and is already in front of users, so
    // delaying it by one run costs a little staleness. Delaying this pass costs a
    // publish decision made blind. So it goes first, and the sweep gets the rest.
    let queueChecked = 0
    // Reported in the summary so a starved pass is legible on the Pipeline page
    // instead of having to be inferred from a zero. A `checked: 0` line looked
    // exactly like "nothing to do" for the whole time this was broken.
    let queueSkipped   = 0
    let queueCandidates = 0
    const queueDead: { id: string; title: string }[] = []

    {
      const { data: queueRows } = await supabase
        .from('scraped_grants')
        .select('id, title, apply_url, funder')
        .eq('is_active', false)
        .in('pipeline_state', ['captured', 'enriched', 'tagged', 'tagged_awaiting_review'])
        .neq('url_status', 'dead')          // 2c owns those; never resurrect admin hides
        .not('apply_url', 'is', null)
        // Never-checked first, so a newly discovered row is the first thing this
        // job looks at rather than the last.
        .order('url_last_checked', { ascending: true, nullsFirst: true })
        .limit(QUEUE_LIMIT)

      queueCandidates = (queueRows ?? []).length
      const queueRun = await inBatches(queueRows ?? [], 10, async (grant) => {
        const result = await deepCheckUrl(
          grant.apply_url as string,
          (grant.funder as string) ?? '',
          (grant.title as string) ?? '',
        )
        queueChecked++

        // Record the verdict only. Deliberately NOT deactivating a dead queue row
        // here: these rows are already invisible to users, so there is nothing to
        // protect anyone from, and archiving one would remove a human's chance to
        // fix a merely-wrong URL. The gate reads url_status and will hold it.
        await mergeGrantUpdate({
          id:     grant.id,
          source: PROVENANCE_SOURCE,
          db:     supabase,
          fields: {
            url_status:         result.status === 'dead' ? 'dead' : 'ok',
            url_last_checked:   ranAt,
            url_quality_score:  result.qualityScore,
            url_quality_issues: result.issues,
          },
        })

        if (result.status === 'dead') {
          queueDead.push({ id: grant.id, title: grant.title as string })
        }
      }, startedAt + QUEUE_BUDGET_MS)
      queueSkipped = queueRun.skipped
    }

    // ── 2. Fetch all active scraped grants with a URL ─────────────────────────
    // Order by url_last_checked ascending (nulls first) so never-checked and
    // stalest rows are processed first. A partial run then clears the backlog
    // instead of re-checking already-fresh rows.
    const { data: grants, error } = await supabase
      .from('scraped_grants')
      .select('id, title, apply_url, funder')
      .eq('is_active', true)
      .not('apply_url', 'is', null)
      .order('url_last_checked', { ascending: true, nullsFirst: true })

    if (error) {
      httpStatus = 500
      return { error: error.message }
    }

    let checkedScraped   = 0
    let okScraped        = 0
    let deactivatedCount = 0
    let closedCount      = 0
    const deactivated: { id: string; title: string }[] = []
    const closedForReview: { id: string; title: string }[] = []

    // ── 2b. Deep-check each grant URL (quality + liveness) ────────────────────
    // All fields written here are untracked, so mergeGrantUpdate takes the
    // untracked-only path and computes the pipeline_state transition for us.
    const scrapedRun = await inBatches(grants ?? [], 15, async (grant) => {
      const result = await deepCheckUrl(
        grant.apply_url as string,
        (grant.funder as string) ?? '',
        (grant.title as string) ?? '',
      )
      checkedScraped++

      if (result.status === 'dead') {
        // Genuinely broken link: deactivate. is_active=false + url_status='dead'
        // → transitionPipelineState returns 'archived'.
        await mergeGrantUpdate({
          id:     grant.id,
          source: PROVENANCE_SOURCE,
          db:     supabase,
          fields: {
            url_status:         'dead',
            url_last_checked:   ranAt,
            is_active:          false,
            url_quality_score:  result.qualityScore,
            url_quality_issues: result.issues,
          },
        })
        deactivatedCount++
        deactivated.push({ id: grant.id, title: grant.title as string })
      } else if (result.status === 'grant_closed') {
        // The page is healthy; the ROUND is closed. Don't lie about the URL and
        // don't deactivate — the grant may reopen, and expire-grants can only
        // roll a deadline forward while is_active=true. Flag for review and
        // leave it visible (same pattern as reenrich-stale / check-stale-rounds).
        await mergeGrantUpdate({
          id:     grant.id,
          source: PROVENANCE_SOURCE,
          db:     supabase,
          fields: {
            url_status:         'ok',
            url_last_checked:   ranAt,
            url_quality_score:  result.qualityScore,
            url_quality_issues: result.issues,
            pipeline_state:     'tagged_awaiting_review',
          },
        })
        closedCount++
        closedForReview.push({ id: grant.id, title: grant.title as string })
      } else {
        // Keep active — write quality metrics alongside status
        const urlStatus = result.status === 'wrong_page' ? 'unchecked' as const : 'ok' as const
        await mergeGrantUpdate({
          id:     grant.id,
          source: PROVENANCE_SOURCE,
          db:     supabase,
          fields: {
            url_status:         urlStatus,
            url_last_checked:   ranAt,
            url_quality_score:  result.qualityScore,
            url_quality_issues: result.issues,
          },
        })
        okScraped++
      }
    }, startedAt + TIME_BUDGET_MS)

    // ── 2c. Recovery pass — re-check a bounded slice of OUR OWN casualties ────
    // Only rows this cron deactivated (url_last_checked IS NOT NULL). Rows with
    // url_status='dead' AND url_last_checked IS NULL are manual admin hides and
    // must never be resurrected here.
    //
    // A row found alive again is recorded honestly but NOT auto-republished —
    // that is a publish decision, and additions stay gated. It is reported below
    // so the recovered set is visible.
    let recoveryChecked = 0
    const recovered: { id: string; title: string }[] = []

    if (Date.now() < startedAt + TIME_BUDGET_MS) {
      const { data: deadRows } = await supabase
        .from('scraped_grants')
        .select('id, title, apply_url, funder')
        .eq('is_active', false)
        .eq('url_status', 'dead')
        .not('url_last_checked', 'is', null)   // ← excludes manual admin hides
        .not('apply_url', 'is', null)
        .order('url_last_checked', { ascending: true })
        .limit(RECOVERY_LIMIT)

      await inBatches(deadRows ?? [], 10, async (grant) => {
        const result = await deepCheckUrl(
          grant.apply_url as string,
          (grant.funder as string) ?? '',
          (grant.title as string) ?? '',
        )
        recoveryChecked++

        // Always stamp the check so the row rotates out of the head of the queue,
        // whether or not it recovered.
        await mergeGrantUpdate({
          id:     grant.id,
          source: PROVENANCE_SOURCE,
          db:     supabase,
          fields: {
            url_status:         result.status === 'dead' ? 'dead' : 'ok',
            url_last_checked:   ranAt,
            url_quality_score:  result.qualityScore,
            url_quality_issues: result.issues,
          },
        })

        if (result.status !== 'dead') {
          recovered.push({ id: grant.id, title: grant.title as string })
        }
      }, startedAt + TIME_BUDGET_MS)
    }

    // ── 3. Check SEED_GRANTS URLs ─────────────────────────────────────────────
    const seedWithUrl = SEED_GRANTS.filter(g => g.applyUrl)
    const deadSeedGrants: { id: string; title: string; funder: string; url: string }[] = []

    const seedRun = await inBatches(seedWithUrl, 10, async (grant) => {
      const status = await checkUrl(grant.applyUrl as string, grant.funder)
      if (status === 'dead') {
        deadSeedGrants.push({
          id:     grant.id,
          title:  grant.title,
          funder: grant.funder,
          url:    grant.applyUrl as string,
        })
      }
    }, startedAt + TIME_BUDGET_MS)

    // ── 4. Return summary ─────────────────────────────────────────────────────
    return {
      ranAt,
      elapsedMs:      Date.now() - startedAt,
      budgetExceeded: scrapedRun.skipped > 0 || seedRun.skipped > 0,
      scraped: {
        total:           (grants ?? []).length,
        checked:         checkedScraped,
        skipped:         scrapedRun.skipped,
        ok:              okScraped,
        deactivated:     deactivatedCount,
        closed:          closedCount,
        grants:          deactivated,
        closedForReview: closedForReview,
      },
      recovery: {
        checked:   recoveryChecked,
        recovered: recovered.length,
        grants:    recovered,
      },
      reviewQueue: {
        candidates: queueCandidates,   // capped at QUEUE_LIMIT
        checked:    queueChecked,
        skipped:    queueSkipped,      // > 0 means this pass ran out of its own budget
        atLimit:    queueCandidates >= QUEUE_LIMIT,
        dead:       queueDead.length,
        grants:     queueDead,
      },
      seed: {
        checked: seedWithUrl.length - seedRun.skipped,
        skipped: seedRun.skipped,
        dead:    deadSeedGrants.length,
        grants:  deadSeedGrants,
      },
    }
  })
  return NextResponse.json(payload, { status: httpStatus })
}

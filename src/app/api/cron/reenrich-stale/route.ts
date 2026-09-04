// Vercel Cron handler — daily at 03:30 UTC.
//
// Periodically re-runs the FULL chain (enrich → classify → sweep) against
// published rows whose brief / tags are most likely stale. Mirrors what
// process-pipeline-queue does for new captures but targets the published
// catalogue. Tag changes drive matcher behaviour, so the classifier matters
// at least as much as the brief refresh.
//
// Gate interaction: after the chain runs, the cron compares pre- and post-
// state on 11 matcher-relevant fields (impact_sectors, niche_tags,
// excluded_niche_tags, target_beneficiaries, eligible_structures,
// funding_type, funding_subtype, location_tag, is_local, min_org_income,
// max_org_income). If anything changed, the row flips to
// pipeline_state='tagged_awaiting_review' with the diff stashed under
// field_provenance.pipeline_state.diff so admin can see what changed. If
// nothing changed, the row stays published with the fresh brief silently
// applied. is_active stays true throughout so users keep seeing the row
// with its existing surface behaviour during review.
//
// Candidate criteria (any one triggers):
//   1. funder_brief.last_enriched older than 90 days
//   2. funder_brief.source = 'knowledge_fallback' (lower-quality baseline)
//   3. funder_brief._stale_dates is non-empty (flagged by detector)
//
// Skip rows where:
//   - is_active = false (NR rows are re-enriched by process-pipeline-queue)
//   - pipeline_state != 'published'
//   - needs_intervention_reason IS NOT NULL (quarantined)
//   - any admin: field_provenance entry set_at within last 30 days
//     (admin reviewed recently — don't churn under them)
//
// Sizing: BATCH_LIMIT=8 rows per run; each chain ~20-45s; total ≤ 360s under
// the 270s maxDuration cap. Wait — that's a problem; with full chain we
// need to drop to 6 rows to stay under cap with safety. See BATCH_LIMIT
// below.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/admin/admin-db'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { recordRun, usageFromAdminJson } from '@/lib/admin/cron-runs'
import { gateDecision } from '@/lib/admin/publish-gate'
import type { ReviewRow } from '@/lib/admin/review-reasons'

export const dynamic     = 'force-dynamic'
export const maxDuration = 270

// Each chain run = enrich (~10-30s) + classify (~5-15s) + sweep (~1-3s)
// ≈ 20-45s typical. 6 × 45 = 270s; matches Vercel maxDuration cap with no
// buffer. Drop to 6 from the original 8 (enrichment-only) to absorb the
// classify+sweep additions safely. 6/day × 365 ÷ 660 active rows ≈ 110-day
// cycle — slightly slower than the 90-day threshold but the
// _stale_dates + knowledge_fallback fast-paths still flag urgent rows for
// priority processing on the next run.
const BATCH_LIMIT = 6
const STALE_AFTER_DAYS         = 90
const ADMIN_TOUCH_GUARD_DAYS   = 30
// Back-off window: once the cron has ATTEMPTED a row, don't re-attempt it for
// this many days — even if its brief still looks stale (enrich no-op'd, URL
// unfetchable, etc.). Without this, rows the cron can't refresh stay perpetually
// "oldest stale" and monopolise every batch, re-flagging forever and starving
// the rest of the backlog.
const REENRICH_ATTEMPT_BACKOFF_DAYS = 14

// Fields whose change is matcher-relevant. Diff on these → flip the row to
// tagged_awaiting_review so admin can verify the new classification before
// the surface behaviour changes silently. Brief prose (decision_timeline,
// how_to_apply etc.) is NOT included — that's rendering, not matching.
const DIFF_FIELDS = [
  'impact_sectors',
  'niche_tags',
  // NOTE: excluded_niche_tags is NOT a column on scraped_grants — including it
  // in the pre/post-state SELECT below threw "column does not exist" for every
  // row, failing the whole batch before enrich ran. Removed 2026-06-14. Re-add
  // only if/when an excluded_niche_tags column actually exists.
  'target_beneficiaries',
  'eligible_structures',
  'funding_type',
  'funding_subtype',
  'location_tag',
  'is_local',
  'min_org_income',
  'max_org_income',
] as const

// Everything deriveReviewReasons needs to judge a row. Same list as
// auto-publish's COLS so the gate answers here exactly as it will at 09:00.
const REVIEW_COLS = [
  'id', 'title', 'funder', 'is_active', 'pipeline_state', 'url_status', 'url_quality_score',
  'amount_min', 'amount_max', 'deadline', 'is_rolling', 'next_open_date', 'deadline_cycle',
  'eligible_structures', 'impact_sectors', 'target_beneficiaries',
  'funder_brief', 'field_provenance', 'raw_data', 'needs_intervention_reason',
  'field_evidence', 'funding_type', 'apply_url', 'funding_index_url', 'is_invite_only',
].join(', ')

function arraysEqualUnordered(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  const sa = [...a].map(String).sort()
  const sb = [...b].map(String).sort()
  return sa.every((v, i) => v === sb[i])
}

function detectMaterialDiff(
  before: Record<string, unknown>,
  after:  Record<string, unknown>,
): { changed: boolean; diff: Record<string, { before: unknown; after: unknown }> } {
  const diff: Record<string, { before: unknown; after: unknown }> = {}
  for (const field of DIFF_FIELDS) {
    const b = before[field]
    const a = after[field]
    const isArrayField = Array.isArray(b) || Array.isArray(a)
    if (isArrayField) {
      if (!arraysEqualUnordered(b, a)) diff[field] = { before: b, after: a }
    } else if (b !== a) {
      diff[field] = { before: b, after: a }
    }
  }
  return { changed: Object.keys(diff).length > 0, diff }
}

function adminClient() {
  return getAdminDb()
}

// Internal admin calls send a Bearer ADMIN_SECRET, so they MUST hit the
// canonical www host directly. The apex 307-redirects to www and strips the
// Authorization header (curl-auth-redirect-strip memory); the *.vercel.app
// deployment URL (VERCEL_URL) is behind Vercel Deployment Protection and 401s
// server-to-server. Both made these self-calls fail auth (every row failed).
// Force www for any production host; pass through anything else (dev/localhost).
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

type Candidate = {
  id: string
  title: string
  funder: string
  url_status: string | null
  field_provenance: Record<string, { source?: string; set_at?: string; pinned?: boolean }> | null
}

export async function GET(req: NextRequest) {
  const auth       = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // Three auth paths:
  //   1. Vercel cron → Bearer ${CRON_SECRET}
  //   2. Manual admin curl → Bearer ${ADMIN_SECRET}
  //   3. Manual admin via browser button → admin session cookie
  // Paths 2 + 3 (collectively "admin manual triggers") bypass the cron-
  // enabled gate below so manual batches run even when the scheduled cron
  // is disabled.
  const isCronCaller = !!(cronSecret && auth === `Bearer ${cronSecret}`)
  const isAdminCaller = !isCronCaller && (
    isAdminBearerToken(auth) || (await requireAdmin()).ok
  )
  if (!isCronCaller && !isAdminCaller) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Cron-enabled gate. Default is DISABLED — automated cron runs are a no-op
  // until REENRICH_CRON_ENABLED=true is set in Vercel env. This is the gate
  // Paul controls to time the first full sweep against the live catalogue.
  // The first sweep will flag ~20-40% of rows for tag review (classifier
  // prompt + taxonomy have evolved since most rows were originally tagged);
  // we don't want that volume happening unsupervised during submission week.
  // Manual admin triggers (isAdminCaller=true) always run regardless.
  let httpStatus = 200
  const payload = await recordRun('reenrich-stale', async ctx => {
    if (isCronCaller && process.env.REENRICH_CRON_ENABLED !== 'true') {
      return {
        success: true,
        skipped: true,
        reason:  'reenrich cron disabled — set REENRICH_CRON_ENABLED=true to enable automated runs. Admin manual triggers still execute.',
      }
    }

    const db = adminClient()

    // Manual triggers can pass ?limit=N to control batch size (capped at 50 to
    // prevent runaway). Scheduled cron always uses the hard-coded BATCH_LIMIT.
    const url = new URL(req.url)
    const limitParam = url.searchParams.get('limit')
    const requestedLimit = limitParam ? parseInt(limitParam, 10) : BATCH_LIMIT
    const effectiveLimit = isAdminCaller && Number.isFinite(requestedLimit)
      ? Math.min(Math.max(1, requestedLimit), 50)
      : BATCH_LIMIT

    // Compute stale cutoff as ISO date for the SQL comparison
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - STALE_AFTER_DAYS)
    const staleCutoffISO = cutoff.toISOString().slice(0, 10)

    // Back-off cutoff: skip rows attempted within the back-off window.
    const attemptCutoff = new Date()
    attemptCutoff.setDate(attemptCutoff.getDate() - REENRICH_ATTEMPT_BACKOFF_DAYS)
    const attemptCutoffISO = attemptCutoff.toISOString()

    // Pull candidates — over-fetch (3x batch limit) since some will be filtered
    // out by the admin-touch guard in JS. Order by last_enriched ASC NULLS FIRST
    // so we always work the oldest first.
    const overFetch = effectiveLimit * 3
    const { data: rows, error: fetchErr } = await db
      .from('scraped_grants')
      .select('id, title, funder, url_status, funder_brief, field_provenance')
      .eq('is_active', true)
      .eq('pipeline_state', 'published')
      .is('needs_intervention_reason', null)
      .or(
        // Postgrest .or() string: combine the three stale signals.
        // brief.last_enriched older than cutoff, OR knowledge_fallback baseline,
        // OR _stale_dates flagged.
        [
          `funder_brief->>last_enriched.is.null`,
          `funder_brief->>last_enriched.lt.${staleCutoffISO}`,
          `funder_brief->>source.eq.knowledge_fallback`,
        ].join(',')
      )
      // AND not attempted within the back-off window (a second .or() ANDs with
      // the first). Stops the cron re-picking rows it just tried but couldn't
      // refresh — those back off for REENRICH_ATTEMPT_BACKOFF_DAYS.
      .or(`last_reenrich_attempt.is.null,last_reenrich_attempt.lt.${attemptCutoffISO}`)
      .order('funder_brief->>last_enriched', { ascending: true, nullsFirst: true })
      .limit(overFetch)

    if (fetchErr) {
      console.error('[reenrich-stale] fetch failed:', fetchErr.message)
      httpStatus = 500
      return { error: `fetch: ${fetchErr.message}` }
    }

    if (!rows || rows.length === 0) {
      return { success: true, candidates: 0, processed: 0, skipped_admin_touch: 0 }
    }

    // ── Apply admin-touch guard ────────────────────────────────────────────
    const guardCutoff = Date.now() - ADMIN_TOUCH_GUARD_DAYS * 24 * 60 * 60 * 1000
    const eligible: Candidate[] = []
    const skipped: Array<{ id: string; title: string }> = []

    for (const row of rows as Candidate[]) {
      const prov = row.field_provenance ?? {}
      const recentAdminTouch = Object.values(prov).some(entry => {
        if (!entry?.source?.startsWith('admin:')) return false
        if (!entry.set_at) return false
        const t = Date.parse(entry.set_at)
        return Number.isFinite(t) && t > guardCutoff
      })
      if (recentAdminTouch) {
        skipped.push({ id: row.id, title: row.title })
        continue
      }
      eligible.push(row)
      if (eligible.length >= effectiveLimit) break
    }

    if (eligible.length === 0) {
      return {
        success:    true,
        candidates: rows.length,
        processed:  0,
        skipped_admin_touch: skipped.length,
      }
    }

    // ── Process sequentially through the full chain ────────────────────────
    type ChainResult = {
      id: string
      title: string
      enriched:           boolean
      classified:         boolean
      swept:              boolean
      materially_changed: boolean
      flagged_for_review: boolean
      /** What the publish gate said about the re-read row, when it changed. */
      gate_outcome?:      'publish' | 'hold' | 'attention'
      diff_fields:        string[]
      stale_dates:        number
      elapsed_ms:         number
      error?:             string
    }
    const results: ChainResult[] = []

    for (const row of eligible) {
      const t0 = Date.now()
      const result: ChainResult = {
        id:                 row.id,
        title:              row.title,
        enriched:           false,
        classified:         false,
        swept:              false,
        materially_changed: false,
        flagged_for_review: false,
        diff_fields:        [],
        stale_dates:        0,
        elapsed_ms:         0,
      }

      // Step 0: capture pre-state of matcher-relevant fields
      const { data: preRow, error: preErr } = await db
        .from('scraped_grants')
        .select(DIFF_FIELDS.join(', '))
        .eq('id', row.id)
        .single()
      if (preErr || !preRow) {
        result.error = `pre-state fetch failed: ${preErr?.message ?? 'no row'}`
        result.elapsed_ms = Date.now() - t0
        results.push(result)
        console.warn(`[reenrich-stale] ✗ ${row.id} (${row.title}) — pre-state fetch failed`)
        continue
      }

      // Mark the row ATTEMPTED up-front, before any step that can fail or no-op.
      // This is the back-off anchor: no matter how this run ends (enrich no-op,
      // sweep error, dead URL), the row won't be re-selected for
      // REENRICH_ATTEMPT_BACKOFF_DAYS — so the cron always advances through the
      // backlog instead of looping on rows it can't refresh.
      await db.from('scraped_grants')
        .update({ last_reenrich_attempt: new Date().toISOString() })
        .eq('id', row.id)

      // Dead URL → enrich can't fetch fresh content, so re-running just churns.
      // Route to the intervention queue (excluded by the candidate query above)
      // for a URL fix / archive decision instead of re-processing every cycle.
      if (row.url_status === 'dead') {
        await db.from('scraped_grants')
          .update({ needs_intervention_reason: 'reenrich: apply_url dead — needs URL fix or archive' })
          .eq('id', row.id)
        result.error = 'skipped: url dead'
        result.elapsed_ms = Date.now() - t0
        results.push(result)
        console.warn(`[reenrich-stale] ⊘ ${row.id} (${row.title}) — url dead, routed to intervention`)
        continue
      }

      // Step 1: enrich
      const enrichRes = await callAdmin('/api/admin/enrich-grant', { grantId: row.id })
      if (!enrichRes.ok) {
        result.error = `enrich: ${enrichRes.error}`
        result.elapsed_ms = Date.now() - t0
        results.push(result)
        console.warn(`[reenrich-stale] ✗ ${row.id} (${row.title}) — enrich failed: ${enrichRes.error}`)
        continue
      }
      result.enriched = true
      // Enrichment happens over HTTP in a sibling route, so its cost only
      // reaches this run because the route reports it back.
      const enrichUsage = usageFromAdminJson(enrichRes.json)
      if (enrichUsage) ctx.usage.add(enrichUsage.model, enrichUsage)
      const briefDebug = (enrichRes.json as { brief?: { _stale_dates?: unknown[] } })?.brief?._stale_dates
      result.stale_dates = Array.isArray(briefDebug) ? briefDebug.length : 0

      // Step 2: classify (non-fatal on failure — row still has fresh brief)
      const classifyRes = await callAdmin('/api/admin/classify-grants', {
        grant_ids:      [row.id],
        include_review: true,
        force:          true,
        preserve_empty: true,  // automated chain: an empty [] from Claude must not wipe existing structures/beneficiaries
      })
      if (classifyRes.ok) {
        result.classified = true
      } else {
        console.warn(`[reenrich-stale] classify miss for ${row.id}: ${classifyRes.error}`)
      }

      // Step 3: sweep (fatal — sweep is the final state-resolution step)
      const sweepRes = await callAdmin('/api/admin/sweep', { id: row.id })
      if (!sweepRes.ok) {
        result.error = `sweep: ${sweepRes.error}`
        result.elapsed_ms = Date.now() - t0
        results.push(result)
        console.warn(`[reenrich-stale] ✗ ${row.id} (${row.title}) — sweep failed: ${sweepRes.error}`)
        continue
      }
      result.swept = true

      // Step 4: capture post-state and compute diff
      const { data: postRow, error: postErr } = await db
        .from('scraped_grants')
        .select(DIFF_FIELDS.join(', ') + ', field_provenance')
        .eq('id', row.id)
        .single()
      if (postErr || !postRow) {
        result.error = `post-state fetch failed: ${postErr?.message ?? 'no row'}`
        result.elapsed_ms = Date.now() - t0
        results.push(result)
        continue
      }

      const { changed, diff } = detectMaterialDiff(
        preRow as unknown as Record<string, unknown>,
        postRow as unknown as Record<string, unknown>,
      )
      result.materially_changed = changed
      result.diff_fields = Object.keys(diff)

      // Step 5: if material change, ask the publish gate before doing anything.
      //
      // A live row that passes its re-read STAYS LIVE. Paul, 2026-09-02. Until
      // then every changed row flipped to tagged_awaiting_review, and because
      // `tags_changed` is informational the gate published almost all of them
      // straight back, one slot a day each. Twenty-four of the twenty-six live
      // rows waiting for a slot on 1 Sep had arrived that way, no new row had
      // been published since 13 August, and every one of them was out of the
      // sitemap while it waited (the sitemap reads pipeline_state='published').
      //
      // So the flip is reserved for rows the gate would BLOCK: those go to the
      // queue as Live and wrong with the diff stamped so a person can see what
      // the re-read changed. A row the gate would publish keeps its state and
      // the diff is recorded under `reenrich_diff` for the record. is_active
      // stays true either way.
      if (changed) {
        const { data: reviewRow, error: reviewErr } = await db
          .from('scraped_grants')
          .select(REVIEW_COLS)
          .eq('id', row.id)
          .single()
        if (reviewErr || !reviewRow) {
          result.error = `gate fetch failed: ${reviewErr?.message ?? 'no row'}`
          result.elapsed_ms = Date.now() - t0
          results.push(result)
          continue
        }
        const gate = gateDecision(reviewRow as unknown as ReviewRow)
        result.gate_outcome = gate.outcome
        const existingProv = ((postRow as unknown as { field_provenance?: Record<string, unknown> }).field_provenance ?? {}) as Record<string, unknown>
        const stamp = {
          pinned:  false,
          set_at:  new Date().toISOString(),
          source:  'system:reenrich_chain:v1',
          reason:  'reclassify_diff',
          diff,
        }
        if (gate.outcome === 'publish') {
          const { error: noteErr } = await db
            .from('scraped_grants')
            .update({ field_provenance: { ...existingProv, reenrich_diff: { ...stamp, kept_live: true } } })
            .eq('id', row.id)
          if (noteErr) console.warn(`[reenrich-stale] diff note failed for ${row.id}: ${noteErr.message}`)
        } else {
          const { error: flipErr } = await db
            .from('scraped_grants')
            .update({
              pipeline_state:   'tagged_awaiting_review',
              field_provenance: { ...existingProv, pipeline_state: { ...stamp, blocking: gate.blocking.map(b => b.code) } },
            })
            .eq('id', row.id)
          if (flipErr) {
            result.error = `flip-to-NR failed: ${flipErr.message}`
            console.warn(`[reenrich-stale] flip-to-NR failed for ${row.id}: ${flipErr.message}`)
          } else {
            result.flagged_for_review = true
          }
        }
      }

      result.elapsed_ms = Date.now() - t0
      results.push(result)

      const tagDiff = changed
        ? ` — DIFF on ${result.diff_fields.join(', ')} → ${result.flagged_for_review ? 'flagged for review' : `gate says ${result.gate_outcome}, kept live`}`
        : ''
      console.log(
        `[reenrich-stale] ✓ ${row.id} (${row.title}) — ${result.elapsed_ms}ms` +
        ` — stale_dates=${result.stale_dates}${tagDiff}`
      )
    }

    const succeeded         = results.filter(r => r.enriched && r.swept).length
    const failed            = results.filter(r => !r.enriched || !r.swept).length
    const flaggedForReview  = results.filter(r => r.flagged_for_review).length
    const materiallyChanged = results.filter(r => r.materially_changed).length

    return {
      success:             true,
      candidates:          rows.length,
      processed:           results.length,
      succeeded,
      failed,
      materially_changed:  materiallyChanged,
      flagged_for_review:  flaggedForReview,
      skipped_admin_touch: skipped.length,
      results,
    }
  })
  return NextResponse.json(payload, { status: httpStatus })
}

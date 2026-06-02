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
import { createClient } from '@supabase/supabase-js'

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

// Fields whose change is matcher-relevant. Diff on these → flip the row to
// tagged_awaiting_review so admin can verify the new classification before
// the surface behaviour changes silently. Brief prose (decision_timeline,
// how_to_apply etc.) is NOT included — that's rendering, not matching.
const DIFF_FIELDS = [
  'impact_sectors',
  'niche_tags',
  'excluded_niche_tags',
  'target_beneficiaries',
  'eligible_structures',
  'funding_type',
  'funding_subtype',
  'location_tag',
  'is_local',
  'min_org_income',
  'max_org_income',
] as const

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
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function siteBase(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
  if (process.env.VERCEL_URL)            return `https://${process.env.VERCEL_URL}`
  return 'https://www.granttracker.co.uk'
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
  field_provenance: Record<string, { source?: string; set_at?: string; pinned?: boolean }> | null
}

export async function GET(req: NextRequest) {
  const auth       = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = adminClient()

  // Compute stale cutoff as ISO date for the SQL comparison
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - STALE_AFTER_DAYS)
  const staleCutoffISO = cutoff.toISOString().slice(0, 10)

  // Pull candidates — over-fetch (3x batch limit) since some will be filtered
  // out by the admin-touch guard in JS. Order by last_enriched ASC NULLS FIRST
  // so we always work the oldest first.
  const overFetch = BATCH_LIMIT * 3
  const { data: rows, error: fetchErr } = await db
    .from('scraped_grants')
    .select('id, title, funder, funder_brief, field_provenance')
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
    .order('funder_brief->>last_enriched', { ascending: true, nullsFirst: true })
    .limit(overFetch)

  if (fetchErr) {
    console.error('[reenrich-stale] fetch failed:', fetchErr.message)
    return NextResponse.json({ error: `fetch: ${fetchErr.message}` }, { status: 500 })
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ success: true, candidates: 0, processed: 0, skipped_admin_touch: 0 })
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
    if (eligible.length >= BATCH_LIMIT) break
  }

  if (eligible.length === 0) {
    return NextResponse.json({
      success:    true,
      candidates: rows.length,
      processed:  0,
      skipped_admin_touch: skipped.length,
    })
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
    const briefDebug = (enrichRes.json as { brief?: { _stale_dates?: unknown[] } })?.brief?._stale_dates
    result.stale_dates = Array.isArray(briefDebug) ? briefDebug.length : 0

    // Step 2: classify (non-fatal on failure — row still has fresh brief)
    const classifyRes = await callAdmin('/api/admin/classify-grants', {
      grant_ids:      [row.id],
      include_review: true,
      force:          true,
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

    // Step 5: if material change, flip to tagged_awaiting_review with diff
    // stamped in provenance so admin can see what changed without re-running.
    // is_active stays true — surface behaviour shouldn't snap to invisible
    // while admin reviews; the existing tags still drive matching until they
    // confirm or revert.
    if (changed) {
      const existingProv = ((postRow as unknown as { field_provenance?: Record<string, unknown> }).field_provenance ?? {}) as Record<string, unknown>
      const newProv = {
        ...existingProv,
        pipeline_state: {
          pinned:  false,
          set_at:  new Date().toISOString(),
          source:  'system:reenrich_chain:v1',
          reason:  'reclassify_diff',
          diff,
        },
      }
      const { error: flipErr } = await db
        .from('scraped_grants')
        .update({
          pipeline_state:   'tagged_awaiting_review',
          field_provenance: newProv,
        })
        .eq('id', row.id)
      if (flipErr) {
        result.error = `flip-to-NR failed: ${flipErr.message}`
        console.warn(`[reenrich-stale] flip-to-NR failed for ${row.id}: ${flipErr.message}`)
      } else {
        result.flagged_for_review = true
      }
    }

    result.elapsed_ms = Date.now() - t0
    results.push(result)

    const tagDiff = changed
      ? ` — DIFF on ${result.diff_fields.join(', ')} → flagged for review`
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

  return NextResponse.json({
    success:             true,
    candidates:          rows.length,
    processed:           results.length,
    succeeded,
    failed,
    materially_changed:  materiallyChanged,
    flagged_for_review:  flaggedForReview,
    skipped_admin_touch: skipped.length,
    results,
  })
}

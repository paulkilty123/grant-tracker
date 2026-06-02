// Vercel Cron handler — daily at 03:30 UTC.
//
// Periodically re-runs the enrichment pipeline against published rows whose
// brief is most likely stale. Picks the oldest candidates and re-enriches
// them; the enrich-grant route's stale-date detector (added 2026-06-02)
// also flags any phrases that have become past-dated since last enrichment,
// so the next cycle catches them automatically.
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
// Sizing: BATCH_LIMIT=8 rows per run; each ~10-30s; total ≤ 240s under the
// 270s maxDuration cap. 8 rows/day × 365 = ~2920 enrichments/year. At
// ~660 active rows that's ~4× cycle/year (one re-enrich every ~3 months),
// matching the 90-day staleness threshold.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic     = 'force-dynamic'
export const maxDuration = 270

const BATCH_LIMIT = 8
const STALE_AFTER_DAYS         = 90
const ADMIN_TOUCH_GUARD_DAYS   = 30

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

  // ── Process sequentially through the enricher ──────────────────────────
  const results: Array<{ id: string; title: string; ok: boolean; error?: string; stale_dates_detected?: number }> = []
  for (const row of eligible) {
    const t0 = Date.now()
    const r = await callAdmin('/api/admin/enrich-grant', { grantId: row.id })
    const elapsed = Date.now() - t0
    const debug = (r.json as { _debug?: Record<string, unknown>; brief?: { _stale_dates?: unknown[] } })?.brief?._stale_dates
    const staleCount = Array.isArray(debug) ? debug.length : 0
    if (r.ok) {
      results.push({ id: row.id, title: row.title, ok: true, stale_dates_detected: staleCount })
      console.log(`[reenrich-stale] ✓ ${row.id} (${row.title}) — ${elapsed}ms — stale_dates=${staleCount}`)
    } else {
      results.push({ id: row.id, title: row.title, ok: false, error: r.error })
      console.warn(`[reenrich-stale] ✗ ${row.id} (${row.title}) — ${elapsed}ms — ${r.error}`)
    }
  }

  const succeeded = results.filter(r => r.ok).length
  const failed    = results.filter(r => !r.ok).length

  return NextResponse.json({
    success:             true,
    candidates:          rows.length,
    processed:           results.length,
    succeeded,
    failed,
    skipped_admin_touch: skipped.length,
    results,
  })
}

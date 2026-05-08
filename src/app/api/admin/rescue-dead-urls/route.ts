// Rescue tool — re-validates rows that were manually hidden via the admin UI
// (signature: url_status='dead' AND url_last_checked IS NULL) and surfaces the
// ones whose underlying URLs are now live, so they can be re-triaged.
//
// Treats the prior admin "hide" decisions as a snapshot in time. Does NOT
// auto-activate: live rows go back to url_status='unchecked' so they reappear
// in Needs Review.
//
// ── Diagnostic signature ─────────────────────────────────────────────────────
// When investigating "dead" rows in scraped_grants, check url_last_checked first:
//
//   url_last_checked IS NULL  AND url_status = 'dead'
//     → Manual hide via the admin UI's removeGrant({ mode: 'dead' }) or
//       batchDelete from the Review tab. The validate-urls cron always writes
//       both fields together, so this combination can ONLY come from manual
//       admin action. Use THIS endpoint to re-validate.
//
//   url_last_checked IS NOT NULL AND url_status = 'dead'
//     → The validator caught it. Inspect url_quality_issues for the reason
//       (http_404, redirect_to_homepage, funder_missing, soft_404_*, etc.).
//
//   url_status IN ('unchecked','ok') AND is_active = false
//     → Either fresh from the scraper (default insert is is_active=false →
//       Needs Review) or deactivated by expire-grants (deadline passed).
// ─────────────────────────────────────────────────────────────────────────────
//
// GET /api/admin/rescue-dead-urls?source=<source>&dryRun=true|false&limit=N
//
// Auth: ADMIN_SECRET bearer token, or admin session.
//
// Verdict categories:
//   recoverable      — URL responds OK; flip to 'unchecked' (re-triage)
//   genuinely_dead   — 404, dead redirect, DNS failure → leave alone
//   closed_reopening — page contains "applications closed/reopens" markers → flag, leave alone
//   wrong_url        — URL points to a generic/listing page (e.g. heart_of_england_cf bug) → flag, leave alone
//   error            — fetch failed for other reasons → leave alone

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { deepCheckUrl } from '@/lib/url-validator'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

async function isAuthorised(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get('authorization') ?? ''
  const bearer = auth.replace('Bearer ', '').trim()
  if (bearer && bearer === process.env.ADMIN_SECRET) return true
  try {
    const { createClient: createSrv } = await import('@/lib/supabase/server')
    const sb = await createSrv()
    const { data: { user } } = await sb.auth.getUser()
    return user?.email === ADMIN_EMAIL
  } catch { return false }
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

type Verdict = 'recoverable' | 'genuinely_dead' | 'closed_reopening' | 'wrong_url' | 'error'

interface Row {
  id: string
  title: string
  apply_url: string | null
  funder: string | null
}

interface Outcome {
  id: string
  title: string
  funder: string | null
  apply_url: string | null
  verdict: Verdict
  qualityScore: number
  issues: string[]
}

async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
  }
  return results
}

function classify(checkStatus: string, issues: string[]): Verdict {
  if (checkStatus === 'ok') return 'recoverable'
  if (checkStatus === 'grant_closed') return 'closed_reopening'
  if (checkStatus === 'wrong_page') return 'wrong_url'
  if (checkStatus === 'dead') return 'genuinely_dead'
  if (issues.includes('network_error')) return 'error'
  return 'genuinely_dead'
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorised(req))) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  const url = new URL(req.url)
  const source  = url.searchParams.get('source')?.trim()
  const dryRun  = url.searchParams.get('dryRun') !== 'false'   // default true
  const limit   = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200)

  if (!source) {
    return NextResponse.json({
      error: 'missing source parameter',
      usage: '/api/admin/rescue-dead-urls?source=<source>&dryRun=true|false&limit=N',
    }, { status: 400 })
  }

  const sb = getAdminClient()

  const { data: rows, error: queryErr } = await sb
    .from('scraped_grants')
    .select('id, title, apply_url, funder')
    .eq('source', source)
    .eq('url_status', 'dead')
    .is('url_last_checked', null)
    .not('apply_url', 'is', null)
    .limit(limit)

  if (queryErr) {
    return NextResponse.json({ error: 'query failed', detail: queryErr.message }, { status: 500 })
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ source, dryRun, candidates: 0, message: 'No manually-hidden rows found for this source' })
  }

  // Re-validate each URL (15 in parallel matches the validate-urls cron)
  const outcomes: Outcome[] = await inBatches(rows as Row[], 15, async (row) => {
    if (!row.apply_url) {
      return { id: row.id, title: row.title, funder: row.funder, apply_url: null,
               verdict: 'error', qualityScore: 0, issues: ['no_apply_url'] }
    }
    const result = await deepCheckUrl(row.apply_url, row.funder ?? '', row.title ?? '')
    return {
      id: row.id,
      title: row.title,
      funder: row.funder,
      apply_url: row.apply_url,
      verdict: classify(result.status, result.issues),
      qualityScore: result.qualityScore,
      issues: result.issues,
    }
  })

  const counts = outcomes.reduce<Record<Verdict, number>>((acc, o) => {
    acc[o.verdict] = (acc[o.verdict] ?? 0) + 1
    return acc
  }, { recoverable: 0, genuinely_dead: 0, closed_reopening: 0, wrong_url: 0, error: 0 })

  // Live mode — flip recoverable rows back to 'unchecked' so they rejoin Needs Review
  let recovered = 0
  if (!dryRun) {
    const recoverableIds = outcomes.filter(o => o.verdict === 'recoverable').map(o => o.id)
    if (recoverableIds.length > 0) {
      const now = new Date().toISOString()
      // Update in chunks of 50 to keep individual queries small
      for (let i = 0; i < recoverableIds.length; i += 50) {
        const chunk = recoverableIds.slice(i, i + 50)
        const { error: updErr } = await sb
          .from('scraped_grants')
          .update({
            url_status: 'unchecked',
            url_last_checked: now,
          })
          .in('id', chunk)
        if (updErr) {
          return NextResponse.json({
            error: 'partial update failure',
            detail: updErr.message,
            recovered,
            outcomes,
          }, { status: 500 })
        }
        recovered += chunk.length
      }
    }
  }

  return NextResponse.json({
    source,
    dryRun,
    candidates: outcomes.length,
    counts,
    recovered: dryRun ? null : recovered,
    outcomes,
  })
}

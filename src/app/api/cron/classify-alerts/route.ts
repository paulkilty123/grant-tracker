// Label what changed on a funder's listing page, so the alert feed can be read.
//
//   GET /api/cron/classify-alerts             scheduled
//   GET /api/cron/classify-alerts?peek=true   ALWAYS report-only, no model calls
//   GET /api/cron/classify-alerts?limit=20    smaller batch
//
// ─────────────────────────────────────────────────────────────────────────────
// THIS ROUTE ONLY WRITES LABELS
//
// It does not resolve an alert, does not set `verify_flag`, does not touch a
// grant row. Paul's condition on approving it, 2026-08-16: "sample the diff
// classifier's first week before it gates anything".
//
// That is not caution for its own sake. The estimate behind the whole idea —
// roughly 14 of 17 changes were cosmetic — is a hand reading of one run, n=17.
// It is an order of magnitude, not a measured rate. A classifier trusted to
// auto-resolve on that basis would be discarding funding changes for however
// long it took someone to notice, and the noticing would have to come from a
// feed nobody reads, which is the problem it was built to fix.
//
// So: it labels, `scripts/sample-alert-classifications.ts` draws a sample for a
// hand check, and only after that does anything downstream read the column.
//
// ─────────────────────────────────────────────────────────────────────────────
// ?peek EXISTS BECAUSE OF WHAT HAPPENED ON 16 AUGUST
//
// `verify-rows` was written so that a bare GET reported for free while
// disarmed. When the flag flipped, the same URL became a 60-row model batch, and
// a poll loop watching for it fired fifteen of them in eight minutes at a cost
// of £4.50. A route whose behaviour turns expensive on a flag has no honest
// status check unless one is spelled out, so this one has ?peek from the start.

import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminDb } from '@/lib/admin/admin-db'
import Anthropic from '@anthropic-ai/sdk'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { recordRun } from '@/lib/admin/cron-runs'
import {
  diffFingerprints, buildClassifierInput, parseClassification,
  CLASSIFIER_PROMPT, CLASSIFIER_VERSION, type Classification,
} from '@/lib/watchlist-diff'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MODEL = 'claude-haiku-4-5-20251001'
const BATCH = 60
const CONCURRENCY = 4
/** Absolute, from startedAt. Leaves margin under the 300s cap for the writes. */
const DEADLINE_MS = 250_000
const REPORT_CAP = 20

function adminClient(): SupabaseClient {
  // Service-role, never the cookie-based helper: a cron carries no session, that
  // client resolves to anon, RLS matches nothing, and every write silently does
  // nothing while the handler reports success. Three crons here have done it.
  return getAdminDb()
}

type AlertRow = {
  id: string
  alert_type: string
  snapshot_before: string | null
  snapshot_after: string | null
  funder_watchlist: { name: string } | { name: string }[] | null
}

function funderName(row: AlertRow): string {
  const w = row.funder_watchlist
  if (Array.isArray(w)) return w[0]?.name ?? 'unknown funder'
  return w?.name ?? 'unknown funder'
}

async function pool<T>(items: T[], n: number, stop: () => boolean, work: (t: T) => Promise<void>) {
  let next = 0, consumed = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    for (;;) {
      if (stop()) return
      const i = next++
      if (i >= items.length) return
      consumed++
      await work(items[i])
    }
  }))
  return consumed
}

export async function GET(req: NextRequest) {
  const auth       = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isCronCaller  = !!(cronSecret && auth === `Bearer ${cronSecret}`)
  const isAdminCaller = !isCronCaller && (isAdminBearerToken(auth) || (await requireAdmin()).ok)
  if (!isCronCaller && !isAdminCaller) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = req.nextUrl.searchParams
  const peek   = params.get('peek') === 'true'
  const limit  = Math.max(1, Math.min(Number(params.get('limit')) || BATCH, 200))

  const payload = await recordRun('classify-alerts', async ctx => {
    const startedAt = Date.now()
    const db        = adminClient()
    const overtime  = () => Date.now() - startedAt > DEADLINE_MS

    const { count: backlog } = await db
      .from('watchlist_alerts')
      .select('id', { count: 'exact', head: true })
      .is('classification', null)

    if (peek) {
      return {
        success: true, ranWork: false, classified: 0, backlog: backlog ?? 0,
        note: 'peek: reported the backlog and called no model',
      }
    }

    // Newest first. A three-month-old cosmetic alert is worth less than
    // Wednesday's, and if the backlog is never fully drained it should be the
    // stale end that is missing, not the current one.
    const { data, error } = await db
      .from('watchlist_alerts')
      .select('id, alert_type, snapshot_before, snapshot_after, funder_watchlist(name)')
      .is('classification', null)
      .order('detected_at', { ascending: false })
      .limit(limit)
    if (error) throw new Error(`fetch alerts: ${error.message}`)

    const alerts = (data ?? []) as unknown as AlertRow[]
    if (alerts.length === 0) {
      return { success: true, ranWork: true, classified: 0, backlog: backlog ?? 0, note: 'nothing unclassified' }
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const tally: Record<string, number> = {}
    const samples: unknown[] = []
    const failures: unknown[] = []
    let truncatedDiffs = 0

    const consumed = await pool(alerts, CONCURRENCY, overtime, async alert => {
      let result: { classification: Classification; quote: string | null }

      // A page_down alert stores an HTTP status in snapshot_after, not a
      // fingerprint. There is nothing to diff and nothing to ask a model about:
      // the page is down, which is what the alert already says. Labelling it
      // without a call is both cheaper and more accurate than asking.
      if (alert.alert_type === 'page_down') {
        result = { classification: 'page_gone', quote: alert.snapshot_after?.slice(0, 300) ?? null }
      } else {
        const diff = diffFingerprints(alert.snapshot_before, alert.snapshot_after)
        if (diff.truncated) truncatedDiffs++

        if (diff.added.length === 0 && diff.removed.length === 0) {
          // The fingerprint changed but the item SET did not, so only the order
          // moved. `extractFingerprint` already sorts, so this should not
          // happen; when it does it is definitionally cosmetic and needs no call.
          result = { classification: 'cosmetic', quote: 'the same items in a different arrangement' }
        } else {
          try {
            const res = await anthropic.messages.create({
              model: MODEL,
              max_tokens: 300,
              system: CLASSIFIER_PROMPT,
              messages: [{ role: 'user', content: buildClassifierInput(funderName(alert), diff) }],
            })
            ctx.usage.add(MODEL, {
              input_tokens:  res.usage?.input_tokens  ?? 0,
              output_tokens: res.usage?.output_tokens ?? 0,
            })
            // Same idiom as verify-row.ts:886 — the SDK's block union changes
            // shape between versions and a type predicate over it breaks on
            // upgrade.
            const text = res.content.map(c => (c.type === 'text' ? c.text : '')).join('')
            result = parseClassification(text)
          } catch (e) {
            failures.push({ id: alert.id, error: e instanceof Error ? e.message : String(e) })
            return
          }
        }
      }

      const { error: wErr } = await db.from('watchlist_alerts').update({
        classification:       result.classification,
        classification_quote: result.quote,
        classified_at:        new Date().toISOString(),
        classified_by:        `${MODEL}:${CLASSIFIER_VERSION}`,
      }).eq('id', alert.id)
      if (wErr) {
        failures.push({ id: alert.id, error: `write: ${wErr.message}` })
        return
      }

      tally[result.classification] = (tally[result.classification] ?? 0) + 1
      if (samples.length < REPORT_CAP) {
        samples.push({
          funder: funderName(alert), type: alert.alert_type,
          classification: result.classification, quote: result.quote,
        })
      }
    })

    const stoppedEarly = overtime() && consumed < alerts.length
    return {
      success: true,
      ranWork: true,
      classified: consumed,
      requested: alerts.length,
      stoppedEarly,
      remaining: Math.max(0, alerts.length - consumed),
      backlog: backlog ?? 0,
      elapsedMs: Date.now() - startedAt,
      classification: tally,
      truncatedDiffs,
      failures: failures.length,
      // Nothing downstream reads the labels yet, and this line is here so that
      // stays visible in the run record rather than living only in a migration
      // comment somebody has to go and find.
      note: 'labels only: no alert resolved, no row flagged, pending a hand sample of the first week',
      reportCap: REPORT_CAP,
      sample: samples,
      failureSample: failures.slice(0, REPORT_CAP),
    }
  })

  return NextResponse.json(payload)
}

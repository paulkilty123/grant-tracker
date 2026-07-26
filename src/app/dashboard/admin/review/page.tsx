// Review Inbox — the replacement for the Needs Review tab of Grant Manager.
//
// One priority-ordered list. Every row states WHY it stopped, shows the
// evidence behind the values it is asking about, and says plainly whether users
// can already see it.
//
// Auth is handled by src/app/dashboard/admin/layout.tsx (requireAdmin), so this
// page does not gate itself.
//
// Server component: fetches the queue and derives reasons server-side via the
// shared deriveReviewReasons(), the same function the auto-publish gate will
// use to decide what never needs to reach a human at all.

import {
  deriveReviewReasons,
  extractTagsDiff,
  compareByReadiness,
  type ReviewRow,
} from '@/lib/admin/review-reasons'
import { gateDecision } from '@/lib/admin/publish-gate'
import { ReviewQueue, type QueueItem } from './ReviewQueue'
import { getAdminDb } from '@/lib/admin/admin-db'

export const dynamic = 'force-dynamic'

// The states that constitute "waiting for a human". Mirrors the predicate the
// old Grant Manager used, so nothing silently drops out of view during the
// transition.
const QUEUE_STATES = ['captured', 'enriched', 'tagged', 'tagged_awaiting_review']

const COLS = [
  'id', 'title', 'funder', 'apply_url', 'is_active', 'pipeline_state',
  'url_status', 'url_quality_score',
  'amount_min', 'amount_max', 'deadline', 'is_rolling', 'next_open_date', 'deadline_cycle',
  'eligible_structures', 'impact_sectors', 'target_beneficiaries',
  'funder_brief', 'field_provenance', 'raw_data', 'needs_intervention_reason',
  'last_seen_at',
].join(', ')

export default async function ReviewPage() {
  const db = getAdminDb()

  const { data, error } = await db
    .from('scraped_grants')
    .select(COLS)
    .in('pipeline_state', QUEUE_STATES)
    .not('saved_for_later', 'is', 'true')
    .order('last_seen_at', { ascending: false })
    .limit(500)

  // A failed query must never render as an empty queue. The old page
  // destructured the error away and showed "No grants pending review — all
  // clear!" when it had simply failed to read the queue.
  if (error) {
    return (
      <main style={{ padding: '32px 24px', maxWidth: 1180, margin: '0 auto' }}>
        <h1
          style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 24, fontWeight: 500, margin: '0 0 12px' }}
        >
          Review queue
        </h1>
        <div
          style={{
            background: 'var(--coral-pale)', color: 'var(--coral-deep)',
            borderRadius: 'var(--radius-card)', padding: '14px 18px', fontSize: 14,
          }}
        >
          <strong style={{ fontFamily: 'var(--font-space-grotesk)' }}>Could not load the queue.</strong>
          <div style={{ marginTop: 4 }}>{error.message}</div>
          <div style={{ marginTop: 8, opacity: 0.85 }}>
            This is a read failure, not an empty queue. Nothing has been lost.
          </div>
        </div>
      </main>
    )
  }

  const rows = (data ?? []) as unknown as Array<ReviewRow & {
    title: string
    funder: string | null
    apply_url: string | null
    pipeline_state: string
    funder_brief: Record<string, unknown> | null
  }>

  // How many OTHER live rows sit on the same apply_url.
  //
  // JRCT is catalogued as three programme rows that all link to
  // /funding-priorities, the index page listing all five programmes. Opening the
  // link to check a row therefore shows you every programme except, specifically,
  // which one this row is — and a reviewer reasonably concludes the row is
  // mis-tagged when it is not. 47 active rows share a URL this way, so the row
  // has to say so rather than leaving the reviewer to discover it.
  const { data: urlRows } = await db
    .from('scraped_grants')
    .select('apply_url')
    .eq('is_active', true)
    .not('apply_url', 'is', null)
  const urlCount = new Map<string, number>()
  for (const u of (urlRows ?? []) as { apply_url: string | null }[]) {
    const k = (u.apply_url ?? '').trim().replace(/\/$/, '')
    if (k) urlCount.set(k, (urlCount.get(k) ?? 0) + 1)
  }
  const sharedWith = (url: string | null) => {
    const k = (url ?? '').trim().replace(/\/$/, '')
    return k ? Math.max(0, (urlCount.get(k) ?? 1) - 1) : 0
  }

  const items: QueueItem[] = rows
    .map(r => {
      // Derived once and threaded through. It was computed twice per row here,
      // and deriveReviewReasons walks the brief, the provenance diff and the
      // flags each time.
      const reasons = deriveReviewReasons(r)
      const gate    = gateDecision(r, reasons)
      return {
      id:            r.id,
      title:         r.title,
      funder:        r.funder ?? '',
      applyUrl:      r.apply_url ?? null,
      linkSharedWith: sharedWith(r.apply_url ?? null),
      isActive:      r.is_active === true,
      pipelineState: r.pipeline_state,
      reasons,
      readiness:     gate.readiness,
      // 'attention' = already visible to users AND carrying a reason a user
      // could be misled by. Those sort above everything else, because every
      // hour they sit here is an hour somebody can act on bad data.
      gateOutcome:   gate.outcome,
      diffs:         extractTagsDiff(r.field_provenance),
      brief:         summariseBrief(r.funder_brief),
      values: {
        amountMin:  r.amount_min ?? null,
        amountMax:  r.amount_max ?? null,
        deadline:   r.deadline ?? null,
        isRolling:  r.is_rolling === true,
        structures: r.eligible_structures ?? [],
        sectors:    r.impact_sectors ?? [],
      },
      }
    })
    // Attention first, then readiness within each band. Readiness alone put a
    // row nobody can see above a row everybody can see that states something
    // wrong, purely because the invisible one was easier to finish.
    .sort((a, b) =>
      Number(b.gateOutcome === 'attention') - Number(a.gateOutcome === 'attention') ||
      compareByReadiness(a.reasons, b.reasons))

  return <ReviewQueue items={items} />
}

/**
 * Pull just the brief fields the reviewer needs to judge a row, plus the
 * citation snippets behind them.
 *
 * The full 13-field brief belongs on the grant detail view; here the job is to
 * answer "is this right?" without leaving the page. Today those snippets exist
 * only inside a title="" tooltip on the old screen — unselectable and gone on
 * mouse-out.
 */
function summariseBrief(brief: Record<string, unknown> | null | undefined) {
  if (!brief) return null
  const cites = (brief._citations ?? {}) as Record<string, { snippet?: string; confidence?: string } | undefined>
  const pick = (k: string) => {
    const c = cites[k]
    return c?.snippet ? { snippet: c.snippet, confidence: c.confidence ?? 'med' } : null
  }
  return {
    source:        typeof brief.source === 'string' ? brief.source : null,
    whoCanApply:   typeof brief.who_can_apply === 'string' ? brief.who_can_apply : null,
    typicalAward:  typeof brief.typical_award === 'string' ? brief.typical_award : null,
    whatTheyFund:  typeof brief.what_they_fund === 'string' ? brief.what_they_fund : null,
    citations: {
      who_can_apply:       pick('who_can_apply'),
      typical_award:       pick('typical_award'),
      eligible_structures: pick('eligible_structures'),
    },
  }
}

// One grant, everything about it.
//
// The Review Inbox answers "does this need a decision?". This page answers
// "what IS this row?" — every tag, the full brief with its citations, where each
// value came from, and what a user actually sees.
//
// The user preview is the real GrantDetailModal fetching through the real public
// /api/grant-detail endpoint, not a reconstruction. A mock-up would drift from
// the thing it depicts and quietly start lying; this cannot. If it fails to
// load, that IS the finding — the grant is not visible to users.
//
// Auth comes from src/app/dashboard/admin/layout.tsx (requireAdmin).

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { deriveReviewReasons, extractTagsDiff, type ReviewRow } from '@/lib/admin/review-reasons'
import { GrantDetail, type GrantFeedback } from './GrantDetail'
import { getAdminDb } from '@/lib/admin/admin-db'

export const dynamic = 'force-dynamic'

export default async function GrantDetailPage({ params }: { params: { id: string } }) {
  const db = getAdminDb()

  const { data, error } = await db
    .from('scraped_grants')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  // What users said about this grant, and what was decided about it. Keyed on
  // BOTH id forms because match_feedback.grant_id holds a mix of uuids and
  // external_ids; joining on id alone silently drops the external_id-keyed ones.
  const keys = [params.id, String((data as Record<string, unknown> | null)?.external_id ?? '')]
    .filter(k => k.length > 0)
  const { data: feedbackRows } = await db
    .from('match_feedback')
    .select('id, direction, reasons, free_text, match_score_at_time, created_at, reviewed_at, resolution, triage_class, reviewer_note')
    .in('grant_id', keys)
    .order('created_at', { ascending: false })
  const feedback = (feedbackRows ?? []) as GrantFeedback[]

  // A read failure must not render as "not found". The old Needs Review screen
  // showed "all clear" when its query had simply errored, and the same mistake
  // here would read as a deleted grant.
  if (error) {
    return (
      <main style={{ padding: '30px 24px', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ background: 'var(--coral-pale)', color: 'var(--coral-deep)', borderRadius: 'var(--radius-card)', padding: '14px 18px', fontSize: 14 }}>
          <strong style={{ fontFamily: 'var(--font-space-grotesk)' }}>Could not load this grant.</strong>
          <div style={{ marginTop: 4 }}>{error.message}</div>
          <div style={{ marginTop: 8, opacity: 0.85 }}>This is a read failure, not a missing grant.</div>
        </div>
      </main>
    )
  }
  if (!data) notFound()

  const row = data as Record<string, unknown>
  const reasons = deriveReviewReasons(row as unknown as ReviewRow)
  const diffs   = extractTagsDiff(row.field_provenance as Record<string, unknown> | null, row)

  return (
    <main style={{ padding: '24px 24px 80px', maxWidth: 1180, margin: '0 auto' }}>
      <Link
        href="/dashboard/admin/grants"
        style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 12.5, color: 'var(--color-text-secondary)', textDecoration: 'none' }}
      >
        ← Catalogue
      </Link>
      <GrantDetail row={row} reasons={reasons} diffs={diffs} feedback={feedback} />
    </main>
  )
}

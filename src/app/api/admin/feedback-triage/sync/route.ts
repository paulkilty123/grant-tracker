import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { getAdminDb } from '@/lib/admin/admin-db'
import { resolveFlagGrant, type GrantKey } from '@/lib/feedback/resolve-grant'
import { fetchFlagCandidates } from '@/lib/feedback/fetch-candidates'
import { FEEDBACK_QUEUE_SOURCE } from '@/lib/feedback/triage'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * The router: makes user feedback visible in the review queue Paul already works.
 *
 * A grant with an untriaged negative flag moves from `published` to
 * `tagged_awaiting_review`, marked with `system:user_feedback:v1`, which earns it
 * a `user_flagged` reason in the queue and a filtered tab of its own — the same
 * mechanism `system:reenrich_chain:v1` uses for Tag Review.
 *
 * Two things it deliberately does NOT do:
 *
 *  - It never touches `is_active`. Visibility is governed by `is_active` alone,
 *    so a grant stays in front of users while it is being looked at. One user's
 *    dislike is not grounds for pulling a funder off the surface.
 *  - It never moves a grant that is in some other queue state. A row already
 *    awaiting review for a dead link or a missing brief keeps that reason.
 *
 * Reversible: once every flag on a grant is triaged, a grant this router moved
 * is returned to `published`. Only rows carrying our own marker are moved back,
 * so a row that reached `tagged_awaiting_review` some other way is left alone.
 */

async function isAuthorised(req: NextRequest): Promise<boolean> {
  if (isAdminBearerToken(req.headers.get('authorization'))) return true
  const auth = await requireAdmin()
  return auth.ok
}

type GrantRow = GrantKey & {
  is_active: boolean
  pipeline_state: string | null
  field_provenance: Record<string, unknown> | null
}

export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const db = getAdminDb()

  const { data: allFlags, error } = await db
    .from('match_feedback')
    .select('id, grant_id, reviewed_at')
    .eq('direction', 'down')
    .limit(2000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const flags = (allFlags ?? []) as Array<{ id: string; grant_id: string; reviewed_at: string | null }>
  if (flags.length === 0) return NextResponse.json({ queued: 0, released: 0, skipped: 0 })

  let candidates: GrantRow[]
  try {
    candidates = await fetchFlagCandidates<GrantRow>(
      db, flags.map(f => f.grant_id), 'id, external_id, is_active, pipeline_state, field_provenance')
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Grant lookup failed' }, { status: 500 })
  }

  // Group flags by resolved grant so a grant with several flags is handled once.
  const untriagedByGrant = new Map<string, number>()
  const allByGrant       = new Map<string, GrantRow>()
  for (const f of flags) {
    const resolved = resolveFlagGrant(f.grant_id, candidates)
    if (!resolved.ok) continue
    const g = resolved.grant
    allByGrant.set(g.id, g)
    if (!f.reviewed_at) untriagedByGrant.set(g.id, (untriagedByGrant.get(g.id) ?? 0) + 1)
  }

  const now = new Date().toISOString()
  let queued = 0, released = 0, skipped = 0

  for (const [grantId, grant] of Array.from(allByGrant.entries())) {
    const outstanding = untriagedByGrant.get(grantId) ?? 0
    const prov        = (grant.field_provenance ?? {}) as Record<string, { source?: string }>
    const markedByUs  = prov.pipeline_state?.source === FEEDBACK_QUEUE_SOURCE

    if (outstanding > 0) {
      if (grant.pipeline_state !== 'published') { skipped++; continue }
      const { error: e } = await db.from('scraped_grants').update({
        pipeline_state: 'tagged_awaiting_review',
        field_provenance: {
          ...prov,
          pipeline_state: {
            source: FEEDBACK_QUEUE_SOURCE,
            set_at: now,
            pinned: false,
            reason: 'user_flagged',
            outstanding_flags: outstanding,
          },
        },
      }).eq('id', grantId)
      if (!e) queued++
      continue
    }

    // Nothing outstanding. Release only what this router queued.
    if (markedByUs && grant.pipeline_state === 'tagged_awaiting_review') {
      const nextProv = { ...prov }
      delete (nextProv as Record<string, unknown>).pipeline_state
      const { error: e } = await db.from('scraped_grants').update({
        pipeline_state: 'published',
        field_provenance: nextProv,
      }).eq('id', grantId)
      if (!e) released++
    }
  }

  return NextResponse.json({
    queued,
    released,
    skipped,
    note: 'skipped = grants with outstanding flags already in another queue state; their existing reason is kept.',
  })
}

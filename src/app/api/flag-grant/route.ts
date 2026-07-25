// POST /api/flag-grant
// Records a user flag on a scraped grant.
// If 3 or more distinct orgs flag the same grant, it is routed into the admin
// review queue (see the behaviour note below).
//
// ─────────────────────────────────────────────────────────────────────────────
// 2026-07-25 — this endpoint had never worked. Three independent bugs, each of
// which alone was fatal:
//
//   1. The DB CHECK constraint on grant_interactions.action permitted only
//      'saved' | 'dismissed' | 'applied'. Inserting 'flagged' violated it and
//      threw — and the upsert's error was never inspected, so it failed
//      silently. Confirmed against prod: 0 'flagged' rows have ever existed.
//      Fixed by migration 039.
//   2. The deactivation matched `.eq('external_id', grantId)`, but grantId is
//      the normalised id (grants-normalise sets id = external_id ?? id), so for
//      the 376 active rows with a NULL external_id it compared a UUID against
//      external_id and matched nothing.
//   3. It used the RLS user-session client. scraped_grants has RLS enabled with
//      only a public SELECT policy and no UPDATE policy, so the write affected
//      zero rows and returned no error.
//
// ── Behaviour note (deliberate change from the original intent) ──────────────
// The original code deactivated the grant outright on 3+ flags. Now that the
// path actually works, that is riskier than it looks: users flag liberally
// (297 dismissals recorded), and "not relevant to me" is indistinguishable from
// "this listing is broken". Silently hiding a good grant on three such clicks,
// with nothing surfacing it to an admin, is a worse failure than leaving it up.
//
// So 3+ distinct-org flags now flip the row into the review queue and leave it
// VISIBLE, matching the pattern reenrich-stale / check-stale-rounds / the
// grant_closed branch of validate-urls already use for "needs a look, don't
// yank it from users". Three separate orgs flagging one grant is a strong, rare
// signal that genuinely warrants a human look.
//
// To restore hard deactivation, add `is_active: false` to the merge below — the
// merger will then transition the row to 'captured' via the de-publish rule.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '@/lib/grant-merge'

export const dynamic = 'force-dynamic'

const PROVENANCE_SOURCE = 'system:user_flags:v1'
const FLAG_THRESHOLD    = 3

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Privileged client for the catalogue write. The user-session client cannot
// update scraped_grants (no RLS UPDATE policy) — see bug 3 above.
function getAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { grantId, orgId } = await req.json() as { grantId: string; orgId: string }
  if (!grantId || !orgId) {
    return NextResponse.json({ error: 'Missing grantId or orgId' }, { status: 400 })
  }

  // Record the flag (idempotent — ignore if already flagged by this org).
  // The error IS inspected now: this insert silently violated a CHECK
  // constraint for the entire life of the feature.
  const { error: upsertErr } = await supabase
    .from('grant_interactions')
    .upsert(
      { org_id: orgId, grant_id: grantId, action: 'flagged' },
      { onConflict: 'org_id,grant_id,action' },
    )

  if (upsertErr) {
    console.error('[flag-grant] failed to record flag:', upsertErr.message)
    return NextResponse.json({ error: 'Could not record flag' }, { status: 500 })
  }

  // Count how many DISTINCT orgs have flagged this grant. The previous
  // implementation used a plain row count with a head request; the unique
  // constraint on (org_id, grant_id, action) makes those equivalent today, but
  // count distinct states the intent the threshold actually depends on.
  const { data: flagRows, error: countErr } = await supabase
    .from('grant_interactions')
    .select('org_id')
    .eq('grant_id', grantId)
    .eq('action', 'flagged')

  if (countErr) {
    console.error('[flag-grant] failed to count flags:', countErr.message)
    return NextResponse.json({ error: 'Could not count flags' }, { status: 500 })
  }

  const totalFlags = new Set((flagRows ?? []).map(r => r.org_id)).size

  if (totalFlags >= FLAG_THRESHOLD) {
    // grantId is the normalised id: external_id when present, else the UUID.
    // Resolve it to the real primary key before writing (bug 2 above).
    const db = getAdminClient()
    let targetId: string | null = null

    const { data: byExternal } = await db
      .from('scraped_grants')
      .select('id')
      .eq('external_id', grantId)
      .maybeSingle()

    if (byExternal?.id) {
      targetId = byExternal.id as string
    } else if (UUID_RE.test(grantId)) {
      // Only probe the uuid column with a well-formed uuid — a non-uuid value
      // makes Postgres raise a cast error rather than returning no rows.
      const { data: byId } = await db
        .from('scraped_grants')
        .select('id')
        .eq('id', grantId)
        .maybeSingle()
      if (byId?.id) targetId = byId.id as string
    }

    if (!targetId) {
      console.warn(`[flag-grant] ${totalFlags} flags but no grant matched id ${grantId}`)
      return NextResponse.json({ flagged: true, totalFlags, routedToReview: false })
    }

    try {
      await mergeGrantUpdate({
        id:     targetId,
        source: PROVENANCE_SOURCE,
        db,
        // Left visible on purpose — see the behaviour note above.
        fields: { pipeline_state: 'tagged_awaiting_review' },
      })
      console.log(`[flag-grant] ${targetId} routed to review after ${totalFlags} org flags`)
      return NextResponse.json({ flagged: true, totalFlags, routedToReview: true })
    } catch (err) {
      console.error('[flag-grant] failed to route to review:', err)
      return NextResponse.json({ flagged: true, totalFlags, routedToReview: false })
    }
  }

  return NextResponse.json({ flagged: true, totalFlags, routedToReview: false })
}

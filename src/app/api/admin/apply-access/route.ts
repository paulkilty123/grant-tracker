import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { getAdminDb } from '@/lib/admin/admin-db'

export const dynamic = 'force-dynamic'

/**
 * Grant or revoke the Apply-tier entitlement (pipeline + builder) on one org.
 *
 * Why this route exists: migration 030 made `organisations.apply_access` the
 * server-side gate for pipeline_items / projects / applications /
 * org_core_content, seeded it true for a one-time list of 20 founding-cohort
 * email addresses, and then nothing was ever built to set it again. Every
 * signup since defaults to false, so the pipeline silently 403s for them. Seven
 * real accounts reached that state before anyone noticed, four of which were
 * organisations that HAD been invited, just under a colleague's address.
 *
 * Without a route like this, each new cohort invite needs hand-written SQL
 * against production, and the bug recurs on day one every time it is forgotten.
 *
 * Must use the service-role client: `trg_enforce_apply_access_immutable`
 * rejects a change to this column from any role other than service_role /
 * postgres / supabase_admin, deliberately, so a user cannot escalate their own
 * org by hand-crafting a PATCH.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT NO LONGER WRITES apply_access, AND IT MUST NOT
 *
 * Migration 069 made `apply_access` DERIVED — from a granted period ORed with
 * subscription state — and this route kept writing it directly. That write
 * still succeeds, so the screen says granted and the row says granted, and then
 * the next thing that re-derives that owner puts it back. An organisation edit,
 * any subscription event, or the nightly sweeper is enough.
 *
 * Measured against production rather than reasoned about:
 *
 *   straight after the admin write   apply_access = true   (looks granted)
 *   after any re-derivation          apply_access = false  (the grant is gone)
 *
 * No error at any point, and the daily reconciliation would then report the org
 * as access_without_basis. 069's own comment said "this is the column the admin
 * route sets"; the route was never changed to match.
 *
 * So it now writes `granted_access_until` and lets apply_access follow.
 *
 * A boolean toggle has no end date in it, so `true` grants PERMANENTLY
 * ('infinity'), which is what an on/off switch has always meant here and what
 * the eleven internal accounts already carry. Pass an explicit `until` to grant
 * a bounded period instead — the better habit, since it forces the granter to
 * say until when, and what the UI should offer once it has somewhere to put a
 * date.
 */
async function isAuthorised(req: NextRequest): Promise<boolean> {
  if (isAdminBearerToken(req.headers.get('authorization'))) return true
  const auth = await requireAdmin()
  return auth.ok
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: { org_id?: unknown; apply_access?: unknown; until?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }

  const orgId = body.org_id
  const value = body.apply_access
  const until = body.until

  if (typeof orgId !== 'string' || !UUID_RE.test(orgId)) {
    return NextResponse.json({ error: 'org_id must be a UUID' }, { status: 400 })
  }
  if (typeof value !== 'boolean') {
    return NextResponse.json({ error: 'apply_access must be true or false' }, { status: 400 })
  }
  if (until !== undefined && until !== null && typeof until !== 'string') {
    return NextResponse.json({ error: 'until must be an ISO date string, or omitted' }, { status: 400 })
  }
  if (typeof until === 'string' && Number.isNaN(new Date(until).getTime())) {
    return NextResponse.json({ error: `until is not a readable date: ${until}` }, { status: 400 })
  }

  // Revoking clears the period. Granting with no date is permanent, which is
  // the only thing an on/off switch can mean.
  const grantValue: string | null = value ? (typeof until === 'string' ? until : 'infinity') : null

  const db = getAdminDb()

  // Read first so the response can report what actually changed, and so a
  // mistyped org id fails loudly rather than silently updating nothing.
  const { data: before, error: readErr } = await db
    .from('organisations')
    .select('id, name, apply_access, granted_access_until')
    .eq('id', orgId)
    .maybeSingle()

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 })
  }
  if (!before) {
    return NextResponse.json({ error: 'No organisation with that id' }, { status: 404 })
  }

  const previousGrant = (before as { granted_access_until: string | null }).granted_access_until
  if (previousGrant === grantValue) {
    return NextResponse.json({
      ok: true,
      changed: false,
      org: before,
      message: `Already ${value ? 'granted' : 'revoked'}.`,
    })
  }

  // Writes the GRANT. apply_access is recomputed by
  // trg_organisation_derives_entitlement, which fires on this column.
  const { data: written, error: writeErr } = await db
    .from('organisations')
    .update({ granted_access_until: grantValue })
    .eq('id', orgId)
    .select('id')
    .maybeSingle()

  if (writeErr) {
    return NextResponse.json({ error: writeErr.message }, { status: 500 })
  }
  // A silent no-op here means the write matched no row, which would mean this
  // route is not running with the service-role key.
  if (!written) {
    return NextResponse.json(
      { error: 'Update affected no rows. Check SUPABASE_SERVICE_ROLE_KEY is set for this environment.' },
      { status: 500 },
    )
  }

  // Re-read rather than using RETURNING. The derivation is an AFTER trigger, so
  // it runs a SEPARATE update and the RETURNING row still carries the OLD
  // apply_access — the response would have told an admin the switch was off
  // immediately after they turned it on, while the database had it right. A
  // second read is the cheapest honest answer.
  const { data: after } = await db
    .from('organisations')
    .select('id, name, apply_access, granted_access_until')
    .eq('id', orgId)
    .maybeSingle()

  return NextResponse.json({
    ok: true,
    changed: true,
    previous: previousGrant,
    granted_until: grantValue,
    org: after,
  })
}

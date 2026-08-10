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

  let body: { org_id?: unknown; apply_access?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }

  const orgId = body.org_id
  const value = body.apply_access

  if (typeof orgId !== 'string' || !UUID_RE.test(orgId)) {
    return NextResponse.json({ error: 'org_id must be a UUID' }, { status: 400 })
  }
  if (typeof value !== 'boolean') {
    return NextResponse.json({ error: 'apply_access must be true or false' }, { status: 400 })
  }

  const db = getAdminDb()

  // Read first so the response can report what actually changed, and so a
  // mistyped org id fails loudly rather than silently updating nothing.
  const { data: before, error: readErr } = await db
    .from('organisations')
    .select('id, name, apply_access')
    .eq('id', orgId)
    .maybeSingle()

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 })
  }
  if (!before) {
    return NextResponse.json({ error: 'No organisation with that id' }, { status: 404 })
  }

  const previous = (before as { apply_access: boolean | null }).apply_access ?? false
  if (previous === value) {
    return NextResponse.json({
      ok: true,
      changed: false,
      org: before,
      message: `Already ${value ? 'granted' : 'revoked'}.`,
    })
  }

  const { data: after, error: writeErr } = await db
    .from('organisations')
    .update({ apply_access: value })
    .eq('id', orgId)
    .select('id, name, apply_access')
    .maybeSingle()

  if (writeErr) {
    return NextResponse.json({ error: writeErr.message }, { status: 500 })
  }
  // A silent no-op here means the immutability trigger rejected the write,
  // which would mean this route is not running with the service-role key.
  if (!after) {
    return NextResponse.json(
      { error: 'Update affected no rows. Check SUPABASE_SERVICE_ROLE_KEY is set for this environment.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, changed: true, previous, org: after })
}

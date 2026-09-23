// GET /api/builder/access — is the org in view Apply-entitled?
//
// The dashboard sidebar no longer calls this: the layout already holds the org
// row and passes entitlement down as a prop, which is what makes the nav follow
// the org switcher. This stays for callers outside that layout and because the
// answer is worth having as an endpoint, but it now answers per org rather than
// per user, and it says why when the answer is no.

import { NextResponse } from 'next/server'
import { resolveBuilderAccess, builderDenialMessage } from '@/lib/builder/access'
import { getAdminDb } from '@/lib/admin/admin-db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await resolveBuilderAccess()
  if (access.ok) {
    // The pipeline Download button is a per-org grant (migration 091), not a
    // tier feature: a trial user who exports the pipeline has taken the one
    // thing that makes them stay. Read here, server-side, so the page never
    // has to trust its own copy of the org row.
    const { data: org } = await getAdminDb()
      .from('organisations').select('pipeline_export').eq('id', access.user.orgId).maybeSingle()
    return NextResponse.json({
      allowed: true, org_id: access.user.orgId, org_name: access.orgName,
      export_allowed: (org as { pipeline_export?: boolean | null } | null)?.pipeline_export === true,
    })
  }
  return NextResponse.json({
    allowed: false,
    reason:   access.reason,
    message:  builderDenialMessage(access.reason),
    org_name: access.orgName,
  })
}

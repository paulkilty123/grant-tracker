// GET /api/builder/access — is the org in view Apply-entitled?
//
// The dashboard sidebar no longer calls this: the layout already holds the org
// row and passes entitlement down as a prop, which is what makes the nav follow
// the org switcher. This stays for callers outside that layout and because the
// answer is worth having as an endpoint, but it now answers per org rather than
// per user, and it says why when the answer is no.

import { NextResponse } from 'next/server'
import { resolveBuilderAccess, builderDenialMessage } from '@/lib/builder/access'

export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await resolveBuilderAccess()
  if (access.ok) {
    return NextResponse.json({ allowed: true, org_id: access.user.orgId, org_name: access.orgName })
  }
  return NextResponse.json({
    allowed: false,
    reason:   access.reason,
    message:  builderDenialMessage(access.reason),
    org_name: access.orgName,
  })
}

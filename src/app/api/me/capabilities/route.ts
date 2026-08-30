// What may this signed-in person do that the UI needs to know about?
//
// Exists because the profile page is a client component and has no way to ask
// "am I the admin" — ADMIN_EMAILS is server-side and should stay there rather
// than being handed to the browser as NEXT_PUBLIC_.
//
// This is a HINT FOR RENDERING, not a control. Adding an organisation is
// enforced by trg_enforce_single_organisation (migration 070) in the database,
// because createOrganisation() inserts straight from the browser and there is
// no endpoint in front of it. If this route lied, the insert would still fail.
// Nothing here should ever become the only thing standing between a user and
// an action.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/require-admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const admin = await requireAdmin()
  return NextResponse.json({
    isAdmin: admin.ok,
    // Separate field rather than reusing isAdmin, because the reason this is
    // admin-only is a launch decision about the org cap, not a statement that
    // adding an organisation is an administrative act. When Team goes on sale
    // this becomes a plan question and isAdmin stops being the answer.
    canAddOrganisation: admin.ok,
  })
}

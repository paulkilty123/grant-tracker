// GET /api/builder/allowance?org_id=<uuid>
//
// How many applications this organisation may still start. Read by the new
// application page so the "3 of 5 left" line and the disabled button say the
// same thing the insert trigger will enforce. The numbers come from
// `application_allowance()` (migration 079); nothing here decides anything.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getBuilderUser } from '@/lib/builder/access'
import type { ApplicationAllowance } from '@/lib/builder/allowance'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const user = await getBuilderUser()
  if (!user) return NextResponse.json({ error: 'Applications are not switched on for this organisation' }, { status: 403 })

  const orgId = req.nextUrl.searchParams.get('org_id') ?? ''
  if (!UUID_RE.test(orgId)) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

  // Session client: the function is SECURITY DEFINER, but the org row itself
  // is read under RLS first so a caller cannot ask about somebody else's org.
  const supabase = await createServerClient()
  const { data: org } = await supabase.from('organisations').select('id').eq('id', orgId).maybeSingle()
  if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 })

  const { data, error } = await supabase.rpc('application_allowance', { p_org: orgId })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const row = (Array.isArray(data) ? data[0] : data) as ApplicationAllowance | undefined
  if (!row) return NextResponse.json({ error: 'No allowance row' }, { status: 500 })
  return NextResponse.json(row)
}

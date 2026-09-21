import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

/**
 * Save a fund to the signed-in reader's active organisation, from the public
 * record page (record-page redesign, pass 1, 21 Sept 2026).
 *
 * The organisation is resolved server-side, the same way the agent boundary
 * does it: the gt_active_org_id cookie, else the oldest owned. The client
 * never names an org, so a save cannot land on somebody else's.
 *
 * Writes the 'saved' interaction with reminder_at set to the deadline when
 * there is one, so the deadlines page and the digest pick it up. Idempotent:
 * the same upsert the search page uses.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { grantId?: unknown; reminderAt?: unknown }
  const grantId = typeof body.grantId === 'string' ? body.grantId.trim() : ''
  if (!grantId) return NextResponse.json({ error: 'Missing grantId.' }, { status: 400 })
  const reminderAt = typeof body.reminderAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.reminderAt) ? body.reminderAt : null

  const { data: orgs } = await supabase
    .from('organisations')
    .select('id, created_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
  if (!orgs?.length) return NextResponse.json({ error: 'No organisation on this account yet.' }, { status: 403 })
  const activeId = (await cookies()).get('gt_active_org_id')?.value ?? null
  const org = (activeId && orgs.find(o => o.id === activeId)) || orgs[0]

  const { error } = await supabase
    .from('grant_interactions')
    .upsert({ org_id: org.id, grant_id: grantId, action: 'saved', reminder_at: reminderAt }, { onConflict: 'org_id,grant_id,action' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, orgId: org.id })
}

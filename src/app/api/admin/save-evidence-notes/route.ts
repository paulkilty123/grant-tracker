// Admin-only — application-review spike (Phase 0, task 6).
// Persists the free-text org enrichment ("About your organisation") to
// organisations.evidence_notes for the authed tester's org.
//
// POST /api/admin/save-evidence-notes   Body: { orgId: string; evidenceNotes: string }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const REVIEW_SPIKE_ALLOWLIST = [
  'paulkilty1@gmail.com',
]

export async function POST(req: NextRequest) {
  let user: { id: string; email: string } | null = null
  try {
    const supabase = await createServerClient()
    const { data: { user: u } } = await supabase.auth.getUser()
    if (u?.email && REVIEW_SPIKE_ALLOWLIST.includes(u.email)) {
      user = { id: u.id, email: u.email }
    }
  } catch { /* fall through to 401 */ }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { orgId?: string; evidenceNotes?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.orgId) {
    return NextResponse.json({ error: 'orgId is required' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Only allow writing to an org the caller owns.
  const { error } = await admin
    .from('organisations')
    .update({ evidence_notes: body.evidenceNotes ?? '' })
    .eq('id', body.orgId)
    .eq('owner_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

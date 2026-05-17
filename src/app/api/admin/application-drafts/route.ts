// Admin-only — application-review spike (Phase 0, task 17).
// Persists and lists spike drafts so a page refresh doesn't lose work.
//
// GET  /api/admin/application-drafts            → the caller's drafts (with state)
// POST /api/admin/application-drafts            → save (insert or update)
//   Body: { id?: string; title: string; state: object }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const REVIEW_SPIKE_ALLOWLIST = [
  'paulkilty1@gmail.com',
]

async function getAllowlistedUser(): Promise<{ id: string } | null> {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email && REVIEW_SPIKE_ALLOWLIST.includes(user.email)) return { id: user.id }
    return null
  } catch {
    return null
  }
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function GET() {
  const user = await getAllowlistedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await adminClient()
    .from('application_drafts')
    .select('id, title, updated_at, state')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    drafts: (data ?? []).map(d => ({
      id: d.id, title: d.title, updatedAt: d.updated_at, state: d.state,
    })),
  })
}

export async function POST(req: NextRequest) {
  const user = await getAllowlistedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { id?: string; title?: string; state?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (body.state == null || typeof body.state !== 'object') {
    return NextResponse.json({ error: 'state is required' }, { status: 400 })
  }
  const title = (body.title ?? '').trim() || 'Untitled draft'
  const admin = adminClient()

  if (body.id) {
    // Update — scoped to a row the caller owns.
    const { data, error } = await admin
      .from('application_drafts')
      .update({ title, state: body.state, updated_at: new Date().toISOString() })
      .eq('id', body.id)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    return NextResponse.json({ id: data.id })
  }

  const { data, error } = await admin
    .from('application_drafts')
    .insert({ user_id: user.id, title, state: body.state })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id })
}

// GET /api/export — the data-permanence promise made true (build spec A4).
// Returns the signed-in user's full organisation data as JSON: profile,
// pipeline, saved opportunities, interactions, and (when the builder ships)
// core content blocks. Session-scoped reads via RLS; no service role needed
// except for the capture event.

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { emitEvent } from '@/lib/events/emit'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { data: orgs } = await supabase
    .from('organisations')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })

  const org = orgs?.[0] ?? null
  if (!org) {
    return NextResponse.json({ error: 'No organisation profile found' }, { status: 404 })
  }

  const [{ data: pipeline }, { data: interactions }] = await Promise.all([
    supabase
      .from('pipeline_items')
      .select('*')
      .eq('org_id', org.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('grant_interactions')
      .select('grant_id, action, created_at')
      .eq('org_id', org.id),
  ])

  // Resolve saved interactions to catalogue entries. grant_id is mixed
  // UUID / legacy text, so filter to UUIDs before querying (the known trap).
  const savedIds = Array.from(new Set(
    (interactions ?? [])
      .filter(r => r.action === 'saved' && UUID_RE.test(r.grant_id))
      .map(r => r.grant_id),
  ))
  let savedOpportunities: Record<string, unknown>[] = []
  if (savedIds.length > 0) {
    const { data: savedRows } = await supabase
      .from('grants_with_funder')
      .select('id, external_id, title, funder, funding_type, amount_min, amount_max, deadline, is_rolling, apply_url, location_tag')
      .in('id', savedIds)
    savedOpportunities = savedRows ?? []
  }

  // Core content blocks (application builder). Table ships with Part B; the
  // query is guarded so the export works before and after.
  let coreContent: Record<string, unknown>[] = []
  try {
    const { data: blocks } = await supabase
      .from('org_core_content')
      .select('*')
      .eq('org_id', org.id)
    coreContent = blocks ?? []
  } catch { /* table not present yet */ }

  await emitEvent(
    { surface: 'app', orgId: org.id, userId: user.id },
    'data_exported',
    { export_type: 'org_json' },
  )

  const body = {
    exported_at: new Date().toISOString(),
    export_note: 'Your Shoots data. It is yours, it persists beyond beta, and you can export it any time.',
    organisation: org,
    pipeline: pipeline ?? [],
    saved_opportunities: savedOpportunities,
    interactions: interactions ?? [],
    core_content: coreContent,
  }

  return new NextResponse(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="grant-tracker-export-${new Date().toISOString().split('T')[0]}.json"`,
    },
  })
}

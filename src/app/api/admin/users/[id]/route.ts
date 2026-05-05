import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const authClient = await createServerClient()
  const { data: { user: caller } } = await authClient.auth.getUser()
  if (!caller || caller.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Auth user
  const { data: targetData, error: targetErr } = await admin.auth.admin.getUserById(params.id)
  if (targetErr || !targetData?.user) {
    return NextResponse.json({ error: targetErr?.message ?? 'User not found' }, { status: 404 })
  }
  const target = targetData.user
  const meta = (target.user_metadata ?? {}) as Record<string, unknown>

  // Org (most recent first if multiple — should be one)
  const { data: orgs } = await admin
    .from('organisations')
    .select('*')
    .eq('owner_id', target.id)
    .order('created_at', { ascending: true })
  const org = (orgs ?? [])[0] ?? null

  // Pipeline + interactions for this org
  const orgId = org?.id ?? null

  const { data: pipelineRaw } = orgId
    ? await admin
        .from('pipeline_items')
        .select('id, grant_name, funder_name, funder_type, stage, deadline, is_urgent, amount_min, amount_max, amount_requested, application_progress, grant_url, notes, contact_name, contact_email, outcome_date, outcome_notes, created_at, updated_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
    : { data: [] as Array<Record<string, unknown>> }

  const { data: interactions } = orgId
    ? await admin
        .from('grant_interactions')
        .select('grant_id, action, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
    : { data: [] as { grant_id: string; action: string; created_at: string }[] }

  // Resolve saved grant titles via grants_with_funder for any UUID-form ids
  const savedIds = Array.from(new Set(
    (interactions ?? [])
      .filter(i => i.action === 'saved')
      .map(i => i.grant_id)
      .filter(id => UUID_RE.test(id))
  ))
  const { data: savedGrantsRaw } = savedIds.length > 0
    ? await admin
        .from('scraped_grants')
        .select('id, title, funder, deadline, is_rolling, amount_max, apply_url')
        .in('id', savedIds)
    : { data: [] as Array<Record<string, unknown>> }

  const grantById = new Map<string, Record<string, unknown>>()
  for (const g of (savedGrantsRaw ?? []) as Array<Record<string, unknown>>) {
    if (typeof g.id === 'string') grantById.set(g.id, g)
  }
  const saved = (interactions ?? [])
    .filter(i => i.action === 'saved')
    .map(i => ({
      grant_id: i.grant_id,
      saved_at: i.created_at,
      grant: grantById.get(i.grant_id) ?? null,
    }))

  // Other interaction counts (likes, dislikes, dismissed, applied) for the
  // engagement summary
  const interactionCounts: Record<string, number> = {}
  for (const i of (interactions ?? []) as { action: string }[]) {
    interactionCounts[i.action] = (interactionCounts[i.action] ?? 0) + 1
  }

  return NextResponse.json({
    user: {
      id: target.id,
      email: target.email ?? null,
      first_name: typeof meta.first_name === 'string' ? meta.first_name : null,
      last_name:  typeof meta.last_name  === 'string' ? meta.last_name  : null,
      full_name:  typeof meta.full_name  === 'string' ? meta.full_name  : null,
      org_name:   typeof meta.org_name   === 'string' ? meta.org_name   : null,
      created_at: target.created_at,
      email_confirmed_at: target.email_confirmed_at ?? null,
      last_sign_in_at: target.last_sign_in_at ?? null,
    },
    org,
    pipeline: pipelineRaw ?? [],
    saved,
    interactions_summary: interactionCounts,
  })
}

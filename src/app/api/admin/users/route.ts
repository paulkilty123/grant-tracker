import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

export const dynamic = 'force-dynamic'

interface UserRow {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  full_name: string | null
  created_at: string
  email_confirmed_at: string | null
  last_sign_in_at: string | null
  org_name: string | null
  org_id: string | null
  has_legal_structure: boolean
  has_impact_sectors: boolean
  onboarding_complete: boolean
  pipeline_count: number
  saved_count: number
}

export async function GET() {
  // Auth check
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Pull all auth users (admin API)
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 })

  const users = list.users
  const userIds = users.map(u => u.id)

  // Pull orgs for those users in one shot
  const { data: orgs } = await admin
    .from('organisations')
    .select('id, owner_id, name, legal_structure, impact_sectors')
    .in('owner_id', userIds)

  const orgByOwner = new Map<string, { id: string; name: string | null; legal_structure: string | null; impact_sectors: string[] | null }>()
  for (const o of (orgs ?? []) as Array<{ id: string; owner_id: string; name: string | null; legal_structure: string | null; impact_sectors: string[] | null }>) {
    if (!orgByOwner.has(o.owner_id)) {
      orgByOwner.set(o.owner_id, { id: o.id, name: o.name, legal_structure: o.legal_structure, impact_sectors: o.impact_sectors })
    }
  }

  // Pipeline counts per org
  const orgIds = Array.from(orgByOwner.values()).map(o => o.id)
  const { data: pipelineRows } = orgIds.length > 0
    ? await admin.from('pipeline_items').select('org_id').in('org_id', orgIds)
    : { data: [] as { org_id: string }[] }
  const pipelineByOrg = new Map<string, number>()
  for (const r of (pipelineRows ?? []) as { org_id: string }[]) {
    pipelineByOrg.set(r.org_id, (pipelineByOrg.get(r.org_id) ?? 0) + 1)
  }

  // Saved-grant counts per org
  const { data: savedRows } = orgIds.length > 0
    ? await admin.from('grant_interactions').select('org_id, action').in('org_id', orgIds).eq('action', 'saved')
    : { data: [] as { org_id: string; action: string }[] }
  const savedByOrg = new Map<string, number>()
  for (const r of (savedRows ?? []) as { org_id: string; action: string }[]) {
    savedByOrg.set(r.org_id, (savedByOrg.get(r.org_id) ?? 0) + 1)
  }

  const rows: UserRow[] = users.map(u => {
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>
    const org = orgByOwner.get(u.id) ?? null
    const sectors = org?.impact_sectors ?? []
    return {
      id: u.id,
      email: u.email ?? null,
      first_name: typeof meta.first_name === 'string' ? meta.first_name : null,
      last_name: typeof meta.last_name === 'string' ? meta.last_name : null,
      full_name: typeof meta.full_name === 'string' ? meta.full_name : null,
      created_at: u.created_at,
      email_confirmed_at: u.email_confirmed_at ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      org_name: org?.name ?? null,
      org_id: org?.id ?? null,
      has_legal_structure: !!org?.legal_structure,
      has_impact_sectors: Array.isArray(sectors) && sectors.length > 0,
      onboarding_complete: !!org?.legal_structure && Array.isArray(sectors) && sectors.length > 0,
      pipeline_count: org ? (pipelineByOrg.get(org.id) ?? 0) : 0,
      saved_count: org ? (savedByOrg.get(org.id) ?? 0) : 0,
    }
  })

  // Most recent signups first
  rows.sort((a, b) => (b.created_at > a.created_at ? 1 : -1))

  return NextResponse.json({ rows, total: rows.length })
}

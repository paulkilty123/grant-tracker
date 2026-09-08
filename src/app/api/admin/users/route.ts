import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminDb } from '@/lib/admin/admin-db'

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
  /** What they said they were at signup (migration 080). */
  signup_role: string | null
  /** Chose to browse without a profile. */
  profile_skipped: boolean
  /** Browse path facts (migration 082). */
  client_count_band: string | null
  example_client: string | null
  /** Other owners' organisations sharing a website, charity number, CIC number or name. */
  duplicate_of: string | null
  has_impact_sectors: boolean
  onboarding_complete: boolean
  pipeline_count: number
  saved_count: number
  /** Apply-tier entitlement on the org the app actually resolves for this user. */
  apply_access: boolean
  /** How many orgs this user owns. >1 means the toggle targets the oldest. */
  org_count: number
}

export async function GET() {
  // Auth check
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = getAdminDb()

  // Pull all auth users (admin API)
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 })

  const users = list.users
  const userIds = users.map(u => u.id)

  // Pull orgs for those users in one shot.
  // Ordered oldest-first, because the first row per owner is the one kept below
  // and the app resolves a multi-org user to their OLDEST org
  // (getOrganisationByOwner). Without the order this picked an arbitrary org, so
  // for a user with several orgs the admin screen could report on, and toggle
  // entitlement for, an org they never actually use.
  const { data: orgs } = await admin
    .from('organisations')
    .select('id, owner_id, name, legal_structure, impact_sectors, apply_access, signup_role, profile_skipped, client_count_band, example_client, website_url, charity_number, cic_number')
    .in('owner_id', userIds)
    .order('created_at', { ascending: true })

  type OrgRow = { id: string; name: string | null; legal_structure: string | null; impact_sectors: string[] | null; apply_access: boolean | null; signup_role: string | null; profile_skipped: boolean | null; client_count_band: string | null; example_client: string | null; website_url: string | null; charity_number: string | null; cic_number: string | null }
  const orgByOwner = new Map<string, OrgRow>()
  const orgCountByOwner = new Map<string, number>()
  for (const o of (orgs ?? []) as Array<OrgRow & { owner_id: string }>) {
    orgCountByOwner.set(o.owner_id, (orgCountByOwner.get(o.owner_id) ?? 0) + 1)
    if (!orgByOwner.has(o.owner_id)) {
      orgByOwner.set(o.owner_id, {
        id: o.id, name: o.name, legal_structure: o.legal_structure,
        impact_sectors: o.impact_sectors, apply_access: o.apply_access,
        signup_role: o.signup_role, profile_skipped: o.profile_skipped,
        client_count_band: o.client_count_band, example_client: o.example_client,
        website_url: o.website_url, charity_number: o.charity_number, cic_number: o.cic_number,
      })
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

  // Possible duplicates (Paul, 8 Sept 2026): the trial-gaming path is the
  // same charity set up again under a new email, so every organisation is
  // keyed by website host, charity number, CIC number and normalised name,
  // and any key shared with another owner's organisation is flagged. Read at
  // request time across ALL organisations, so existing duplicates show too.
  const host = (u: string | null) => {
    if (!u) return null
    try { return new URL(u.startsWith('http') ? u : `https://${u}`).hostname.replace(/^www\./, '').toLowerCase() || null } catch { return null }
  }
  const norm = (n: string | null) => n ? n.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|cic|cio|ltd|limited|charity|foundation|trust)\b/g, '').trim() || null : null
  const emailByUser = new Map(users.map(u => [u.id, u.email ?? '']))
  const keyOwners = new Map<string, { owner: string; name: string }[]>()
  const allOrgs = (orgs ?? []) as Array<OrgRow & { owner_id: string }>
  for (const o of allOrgs) {
    for (const k of [host(o.website_url) && `h:${host(o.website_url)}`, o.charity_number && `c:${o.charity_number.trim()}`, o.cic_number && `n:${o.cic_number.trim()}`, norm(o.name) && `m:${norm(o.name)}`]) {
      if (!k) continue
      const list = keyOwners.get(k) ?? []
      list.push({ owner: o.owner_id, name: o.name ?? '' })
      keyOwners.set(k, list)
    }
  }
  const duplicateOf = (o: OrgRow & { owner_id: string }): string | null => {
    const others = new Map<string, string>()
    for (const k of [host(o.website_url) && `h:${host(o.website_url)}`, o.charity_number && `c:${o.charity_number.trim()}`, o.cic_number && `n:${o.cic_number.trim()}`, norm(o.name) && `m:${norm(o.name)}`]) {
      if (!k) continue
      for (const hit of keyOwners.get(k) ?? []) if (hit.owner !== o.owner_id) others.set(hit.owner, hit.name)
    }
    if (!others.size) return null
    return Array.from(others.entries()).map(([owner, name]) => `${name} (${emailByUser.get(owner) || 'unknown'})`).join('; ')
  }
  const fullOrgByOwner = new Map<string, OrgRow & { owner_id: string }>()
  for (const o of allOrgs) if (!fullOrgByOwner.has(o.owner_id)) fullOrgByOwner.set(o.owner_id, o)

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
      signup_role: org?.signup_role ?? null,
      client_count_band: org?.client_count_band ?? null,
      example_client: org?.example_client ?? null,
      duplicate_of: fullOrgByOwner.get(u.id) ? duplicateOf(fullOrgByOwner.get(u.id)!) : null,
      profile_skipped: !!org?.profile_skipped,
      has_impact_sectors: Array.isArray(sectors) && sectors.length > 0,
      onboarding_complete: !!org?.legal_structure && Array.isArray(sectors) && sectors.length > 0,
      pipeline_count: org ? (pipelineByOrg.get(org.id) ?? 0) : 0,
      saved_count: org ? (savedByOrg.get(org.id) ?? 0) : 0,
      apply_access: !!org?.apply_access,
      org_count: orgCountByOwner.get(u.id) ?? 0,
    }
  })

  // Most recent signups first
  rows.sort((a, b) => (b.created_at > a.created_at ? 1 : -1))

  return NextResponse.json({ rows, total: rows.length })
}

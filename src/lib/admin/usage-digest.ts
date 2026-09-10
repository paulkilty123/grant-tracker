// Usage digest: the launch-week funnel, computed once here and shown in two
// places, the admin page at /dashboard/admin/usage and scripts/usage-digest.ts.
//
// Reads public.events, organisations and auth.users. Actions only: nothing
// records page views, time on site or drop-off between pages, so this cannot
// report them. Paul asked for it on 2026-09-10, launch day.
//
// The demo org is excluded by name so the launch-video account does not read
// as a customer.

import type { SupabaseClient } from '@supabase/supabase-js'

export const FUNNEL: { type: string; label: string }[] = [
  { type: 'results_shown',              label: 'Saw results' },
  { type: 'opportunity_viewed',         label: 'Opened a grant' },
  { type: 'opportunity_saved',          label: 'Saved a grant' },
  { type: 'pipeline_added',             label: 'Added to pipeline' },
  { type: 'pipeline_stage_changed',     label: 'Moved a stage' },
  { type: 'profile_updated',            label: 'Updated profile' },
  { type: 'project_created',            label: 'Created a project' },
  { type: 'builder_scaffold_generated', label: 'Used the builder' },
]

export const INTERNAL_ORG_NAMES = new Set<string>(['Bramble Arts Collective'])

const EVENT_CAP = 20000

export interface DayRow { day: string; users: number; orgs: number; active: number; actions: number }
export interface FunnelRow { type: string; label: string; orgs: number; times: number }
export interface OrgLine {
  id: string
  name: string
  joined: string
  lastAction: string | null
  lastLogin: string | null
  counts: Record<string, number>
  total: number
}
export interface UsageDigest {
  days: number
  since: string
  totalEvents: number
  capped: boolean
  byDay: DayRow[]
  funnel: FunnelRow[]
  activeOrgs: number
  otherEvents: { type: string; n: number }[]
  orgs: OrgLine[]
  joinedNoAction: number
  mcp: { requests: number; orgs: number }
}

type EventRow = { org_id: string | null; event_type: string; surface: string; created_at: string }
type OrgRow = { id: string; name: string | null; created_at: string; owner_id: string | null }

const dayOf = (iso: string) => iso.slice(0, 10)

export async function computeUsageDigest(db: SupabaseClient, days = 7): Promise<UsageDigest> {
  const now = Date.now()
  const sinceIso = new Date(now - days * 86400_000).toISOString()

  const [{ data: events, error: e1 }, { data: orgs, error: e2 }, users] = await Promise.all([
    db.from('events').select('org_id, event_type, surface, created_at')
      .gte('created_at', sinceIso).order('created_at', { ascending: true }).limit(EVENT_CAP),
    db.from('organisations').select('id, name, created_at, owner_id'),
    db.auth.admin.listUsers({ perPage: 1000 }),
  ])
  if (e1) throw new Error(`events: ${e1.message}`)
  if (e2) throw new Error(`organisations: ${e2.message}`)
  if (users.error) throw new Error(`users: ${users.error.message}`)

  const ev = (events ?? []) as EventRow[]
  const orgRows = (orgs ?? []) as OrgRow[]
  const orgById = new Map(orgRows.map(o => [o.id, o]))
  const lastSignIn = new Map<string, string>()
  for (const u of users.data.users) if (u.last_sign_in_at) lastSignIn.set(u.id, u.last_sign_in_at)

  const isInternal = (id: string | null) => !!id && INTERNAL_ORG_NAMES.has(orgById.get(id)?.name ?? '')
  const appEv = ev.filter(e => e.surface === 'app' && !isInternal(e.org_id))
  const mcpEv = ev.filter(e => e.surface === 'mcp')

  // By day.
  const dayKeys: string[] = []
  for (let i = days - 1; i >= 0; i--) dayKeys.push(dayOf(new Date(now - i * 86400_000).toISOString()))
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)
  const orgsByDay = new Map<string, number>()
  for (const o of orgRows) if (o.created_at >= sinceIso) bump(orgsByDay, dayOf(o.created_at))
  const usersByDay = new Map<string, number>()
  for (const u of users.data.users) if (u.created_at >= sinceIso) bump(usersByDay, dayOf(u.created_at))
  const activeByDay = new Map<string, Set<string>>()
  const actionsByDay = new Map<string, number>()
  for (const e of appEv) {
    const d = dayOf(e.created_at)
    bump(actionsByDay, d)
    if (e.org_id) {
      if (!activeByDay.has(d)) activeByDay.set(d, new Set())
      activeByDay.get(d)!.add(e.org_id)
    }
  }
  const byDay: DayRow[] = dayKeys.map(d => ({
    day: d,
    users: usersByDay.get(d) ?? 0,
    orgs: orgsByDay.get(d) ?? 0,
    active: activeByDay.get(d)?.size ?? 0,
    actions: actionsByDay.get(d) ?? 0,
  }))

  // Funnel.
  const funnel: FunnelRow[] = FUNNEL.map(step => {
    const rows = appEv.filter(e => e.event_type === step.type)
    return { ...step, orgs: new Set(rows.map(r => r.org_id).filter(Boolean)).size, times: rows.length }
  })
  const inFunnel = new Set(FUNNEL.map(f => f.type))
  const other = new Map<string, number>()
  for (const e of appEv) if (!inFunnel.has(e.event_type)) bump(other, e.event_type)
  const otherEvents = Array.from(other, ([type, n]) => ({ type, n })).sort((a, b) => b.n - a.n)
  const activeOrgs = new Set(appEv.map(e => e.org_id).filter(Boolean)).size

  // Per org.
  const perOrg = new Map<string, { total: number; last: string; counts: Record<string, number> }>()
  for (const e of appEv) {
    if (!e.org_id) continue
    const rec = perOrg.get(e.org_id) ?? { total: 0, last: '', counts: {} }
    rec.total++
    rec.last = e.created_at
    rec.counts[e.event_type] = (rec.counts[e.event_type] ?? 0) + 1
    perOrg.set(e.org_id, rec)
  }
  const orgLines: OrgLine[] = orgRows
    .filter(o => !INTERNAL_ORG_NAMES.has(o.name ?? ''))
    .filter(o => o.created_at >= sinceIso || perOrg.has(o.id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(o => {
      const r = perOrg.get(o.id)
      return {
        id: o.id,
        name: o.name ?? '(unnamed)',
        joined: o.created_at,
        lastAction: r?.last ?? null,
        lastLogin: (o.owner_id && lastSignIn.get(o.owner_id)) || null,
        counts: r?.counts ?? {},
        total: r?.total ?? 0,
      }
    })
  const joinedNoAction = orgLines.filter(o => o.joined >= sinceIso && o.total === 0).length

  return {
    days,
    since: sinceIso,
    totalEvents: ev.length,
    capped: ev.length >= EVENT_CAP,
    byDay,
    funnel,
    activeOrgs,
    otherEvents,
    orgs: orgLines,
    joinedNoAction,
    mcp: { requests: mcpEv.length, orgs: new Set(mcpEv.map(e => e.org_id).filter(Boolean)).size },
  }
}

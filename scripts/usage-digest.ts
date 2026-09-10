// Daily usage digest. Read-only. Prints one screen from public.events plus
// the organisations and auth user tables: who signed up, who searched, who
// saved or added to their pipeline, and which orgs have gone quiet.
//
// Commissioned by Paul on 2026-09-10 (launch day) to watch the first-week
// funnel. It reads actions only. Page views and time on site are not
// recorded anywhere, so this cannot report them; that needs an analytics
// install, which is a user-visible change and waits for the freeze to lift.
//
//   npx tsx --env-file=.env.local scripts/usage-digest.ts            # last 7 days
//   npx tsx --env-file=.env.local scripts/usage-digest.ts --days 3
//
// Zero API spend: DB reads only.

import { getAdminDb } from '../src/lib/admin/admin-db'

const DAYS = (() => {
  const i = process.argv.indexOf('--days')
  const n = i >= 0 ? Number(process.argv[i + 1]) : 7
  return Number.isFinite(n) && n > 0 ? n : 7
})()

// The funnel, in the order a new user walks it.
const FUNNEL: { type: string; label: string }[] = [
  { type: 'results_shown',         label: 'saw results' },
  { type: 'opportunity_viewed',    label: 'opened a grant' },
  { type: 'opportunity_saved',     label: 'saved a grant' },
  { type: 'pipeline_added',        label: 'added to pipeline' },
  { type: 'pipeline_stage_changed', label: 'moved a stage' },
  { type: 'profile_updated',       label: 'updated profile' },
  { type: 'project_created',       label: 'created a project' },
  { type: 'builder_scaffold_generated', label: 'used the builder' },
]

// Excluded from the org view: these are Paul's own or the demo/reviewer orgs.
// Add names here rather than deleting rows from the output by hand.
const INTERNAL_ORG_NAMES = new Set<string>(['Bramble Arts Collective'])

type EventRow = { org_id: string | null; event_type: string; surface: string; created_at: string }
type OrgRow = { id: string; name: string | null; created_at: string; owner_id: string | null }

function day(iso: string) { return iso.slice(0, 10) }
function pad(s: string, n: number) { return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length) }
function num(n: number, w = 5) { return String(n).padStart(w) }

async function main() {
  const db = getAdminDb()
  const since = new Date(Date.now() - DAYS * 86400_000)
  const sinceIso = since.toISOString()

  const [{ data: events, error: e1 }, { data: orgs, error: e2 }, users] = await Promise.all([
    db.from('events').select('org_id, event_type, surface, created_at')
      .gte('created_at', sinceIso).order('created_at', { ascending: true }).limit(20000),
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

  // Precondition: the read must be able to fail. A window with zero events
  // on a live site is a broken emitter or a bad env, not a quiet week.
  if (ev.length === 0) {
    console.log(`No events in the last ${DAYS} days. That is not plausible on a live site: check the env file and the events table before believing it.`)
    process.exit(1)
  }
  if (ev.length >= 20000) console.log('WARNING: hit the 20,000 row cap, counts below are a floor.')

  const isInternal = (id: string | null) => !!id && INTERNAL_ORG_NAMES.has(orgById.get(id)?.name ?? '')
  const appEv = ev.filter(e => e.surface === 'app' && !isInternal(e.org_id))
  const mcpEv = ev.filter(e => e.surface === 'mcp')

  console.log(`\nUSAGE DIGEST  ${day(sinceIso)} to ${day(new Date().toISOString())}  (${DAYS} days, ${ev.length} events)\n`)

  // 1. Signups by day (orgs created, and auth users created).
  const days: string[] = []
  for (let i = DAYS - 1; i >= 0; i--) days.push(day(new Date(Date.now() - i * 86400_000).toISOString()))
  const orgsByDay = new Map<string, number>()
  for (const o of orgRows) if (o.created_at >= sinceIso) orgsByDay.set(day(o.created_at), (orgsByDay.get(day(o.created_at)) ?? 0) + 1)
  const usersByDay = new Map<string, number>()
  for (const u of users.data.users) if (u.created_at >= sinceIso) usersByDay.set(day(u.created_at), (usersByDay.get(day(u.created_at)) ?? 0) + 1)
  const activeByDay = new Map<string, Set<string>>()
  const appEvByDay = new Map<string, number>()
  for (const e of appEv) {
    const d = day(e.created_at)
    appEvByDay.set(d, (appEvByDay.get(d) ?? 0) + 1)
    if (e.org_id) (activeByDay.get(d) ?? activeByDay.set(d, new Set()).get(d)!).add(e.org_id)
  }

  console.log('BY DAY          users  orgs  active  actions')
  for (const d of days) {
    console.log(`  ${d}  ${num(usersByDay.get(d) ?? 0)} ${num(orgsByDay.get(d) ?? 0)}  ${num(activeByDay.get(d)?.size ?? 0)}  ${num(appEvByDay.get(d) ?? 0, 7)}`)
  }
  console.log('  users = new accounts, orgs = new organisations, active = orgs with any action, actions = app events\n')

  // 2. Funnel: distinct orgs reaching each step in the window.
  console.log('FUNNEL (distinct orgs in window)')
  const orgsInWindow = new Set(appEv.map(e => e.org_id).filter(Boolean) as string[])
  console.log(`  ${pad('any action', 22)} ${num(orgsInWindow.size, 4)}`)
  for (const step of FUNNEL) {
    const set = new Set(appEv.filter(e => e.event_type === step.type).map(e => e.org_id).filter(Boolean))
    const n = appEv.filter(e => e.event_type === step.type).length
    console.log(`  ${pad(step.label, 22)} ${num(set.size, 4)} orgs  ${num(n, 5)} times`)
  }
  const seen = new Set(FUNNEL.map(f => f.type))
  const other = new Map<string, number>()
  for (const e of appEv) if (!seen.has(e.event_type)) other.set(e.event_type, (other.get(e.event_type) ?? 0) + 1)
  if (other.size) console.log('  other app events: ' + Array.from(other).map(([k, v]) => `${k} ${v}`).join(', '))
  console.log()

  // 3. Per org: what each did and when last seen. Newest signups first.
  console.log('PER ORG (newest first)')
  console.log(`  ${pad('org', 34)} ${pad('joined', 10)} ${pad('last action', 10)} ${pad('last login', 10)} results opened saved pipe`)
  const perOrg = new Map<string, { n: number; last: string; types: Map<string, number> }>()
  for (const e of appEv) {
    if (!e.org_id) continue
    const rec = perOrg.get(e.org_id) ?? { n: 0, last: '', types: new Map() }
    rec.n++; rec.last = e.created_at
    rec.types.set(e.event_type, (rec.types.get(e.event_type) ?? 0) + 1)
    perOrg.set(e.org_id, rec)
  }
  const rows = orgRows
    .filter(o => !INTERNAL_ORG_NAMES.has(o.name ?? ''))
    .filter(o => o.created_at >= sinceIso || perOrg.has(o.id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  for (const o of rows) {
    const r = perOrg.get(o.id)
    const t = (k: string) => num(r?.types.get(k) ?? 0, 4)
    const login = o.owner_id ? lastSignIn.get(o.owner_id) : undefined
    console.log(`  ${pad(o.name ?? '(unnamed)', 34)} ${day(o.created_at)} ${pad(r ? day(r.last) : 'never', 10)} ${pad(login ? day(login) : '?', 10)} ${t('results_shown')}   ${t('opportunity_viewed')}   ${t('opportunity_saved')} ${t('pipeline_added')}`)
  }
  const joinedNoAction = rows.filter(o => o.created_at >= sinceIso && !perOrg.has(o.id))
  console.log(`\n  ${rows.length} orgs listed. ${joinedNoAction.length} joined in the window and have done nothing yet.`)

  // 4. MCP, kept separate: it is one client hammering, not users on the site.
  const mcpOrgs = new Set(mcpEv.map(e => e.org_id).filter(Boolean))
  console.log(`\nMCP  ${mcpEv.length} requests from ${mcpOrgs.size} attributed org(s) (unattributed tool calls are a known gap).`)

  console.log('\nNot measured: page views, time on site, drop-off between pages. Nothing records them.\n')
}

main().catch(err => { console.error(err); process.exit(1) })

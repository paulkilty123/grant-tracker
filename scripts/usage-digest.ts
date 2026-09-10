// Daily usage digest, terminal edition. Read-only. Same numbers as the admin
// page at /dashboard/admin/usage; the computation lives in
// src/lib/admin/usage-digest.ts so the two cannot drift.
//
// Commissioned by Paul on 2026-09-10 (launch day) to watch the first-week
// funnel. Actions only: page views and time on site are not recorded.
//
//   npx tsx --env-file=.env.local scripts/usage-digest.ts            # last 7 days
//   npx tsx --env-file=.env.local scripts/usage-digest.ts --days 3
//
// Zero API spend: DB reads only.

import { getAdminDb } from '../src/lib/admin/admin-db'
import { computeUsageDigest } from '../src/lib/admin/usage-digest'

const DAYS = (() => {
  const i = process.argv.indexOf('--days')
  const n = i >= 0 ? Number(process.argv[i + 1]) : 7
  return Number.isFinite(n) && n > 0 ? n : 7
})()

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '')
const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length))
const num = (n: number, w = 5) => String(n).padStart(w)

async function main() {
  const d = await computeUsageDigest(getAdminDb(), DAYS)

  // Precondition: the read must be able to fail. A window with zero events
  // on a live site is a broken emitter or a bad env, not a quiet week.
  if (d.totalEvents === 0) {
    console.log(`No events in the last ${DAYS} days. That is not plausible on a live site: check the env file and the events table before believing it.`)
    process.exit(1)
  }
  if (d.capped) console.log('WARNING: hit the event row cap, counts below are a floor.')

  console.log(`\nUSAGE DIGEST  ${day(d.since)} to ${day(new Date().toISOString())}  (${d.days} days, ${d.totalEvents} events)\n`)

  console.log('BY DAY          users  orgs  active  actions')
  for (const r of d.byDay) console.log(`  ${r.day}  ${num(r.users)} ${num(r.orgs)}  ${num(r.active)}  ${num(r.actions, 7)}`)
  console.log('  users = new accounts, orgs = new organisations, active = orgs with any action, actions = app events\n')

  console.log('FUNNEL (distinct orgs in window)')
  console.log(`  ${pad('Any action', 22)} ${num(d.activeOrgs, 4)}`)
  for (const f of d.funnel) console.log(`  ${pad(f.label, 22)} ${num(f.orgs, 4)} orgs  ${num(f.times, 5)} times`)
  if (d.otherEvents.length) console.log('  other app events: ' + d.otherEvents.map(o => `${o.type} ${o.n}`).join(', '))
  console.log()

  console.log('PER ORG (newest first)')
  console.log(`  ${pad('org', 34)} ${pad('joined', 10)} ${pad('last action', 11)} ${pad('last login', 10)} results opened saved pipe`)
  for (const o of d.orgs) {
    const t = (k: string) => num(o.counts[k] ?? 0, 4)
    console.log(`  ${pad(o.name, 34)} ${day(o.joined)} ${pad(o.lastAction ? day(o.lastAction) : 'never', 11)} ${pad(o.lastLogin ? day(o.lastLogin) : '?', 10)} ${t('results_shown')}   ${t('opportunity_viewed')}   ${t('opportunity_saved')} ${t('pipeline_added')}`)
  }
  console.log(`\n  ${d.orgs.length} orgs listed. ${d.joinedNoAction} joined in the window and have done nothing yet.`)

  console.log(`\nMCP  ${d.mcp.requests} requests from ${d.mcp.orgs} attributed org(s) (unattributed tool calls are a known gap).`)
  console.log('\nNot measured: page views, time on site, drop-off between pages. Nothing records them.\n')
}

main().catch(err => { console.error(err); process.exit(1) })

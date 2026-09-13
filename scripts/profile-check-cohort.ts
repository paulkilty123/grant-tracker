// Run the profile check (src/lib/profile-check.ts) over every organisation
// with the weekly email on, and print what each would be told. Rules only,
// no model call, no writes. The list is what Paul emails by hand, or what the
// weekly nudge will say, so read it before either.
//
//   npx tsx --env-file=.env.local scripts/profile-check-cohort.ts [--since=2026-09-09]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { checkProfile, topFinding } from '../src/lib/profile-check'
import type { Organisation } from '../src/types'

const since = process.argv.find(a => a.startsWith('--since='))?.slice(8)

async function main() {
  const db = getAdminDb()
  let q = db.from('organisations').select('*').eq('alerts_enabled', true).order('created_at')
  if (since) q = q.gte('created_at', since)
  const { data, error } = await q
  if (error) throw error
  const orgs = (data ?? []) as Organisation[]
  if (!orgs.length) throw new Error('no organisations read')
  let flagged = 0
  const tally: Record<string, number> = {}
  for (const org of orgs) {
    const f = checkProfile(org)
    for (const x of f) tally[x.id] = (tally[x.id] ?? 0) + 1
    const top = topFinding(f)
    if (!top) { console.log(`ok       ${org.name}`); continue }
    flagged++
    console.log(`${top.severity.padEnd(8)} ${org.name}: ${top.title}${f.length > 1 ? ` (+${f.length - 1} more)` : ''}`)
  }
  console.log(`\n${orgs.length} organisations, ${flagged} with something to say`)
  console.log(Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('\n'))
}
main().catch(e => { console.error(e); process.exit(1) })

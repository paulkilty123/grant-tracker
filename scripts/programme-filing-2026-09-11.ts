// Filing rule, Paul 11 Sept 2026 ("agreed. do that"): a named intake with an
// application or matching step is a PROGRAMME; an open-ended resource, paid
// course or free membership is IN-KIND. Applied to the 15 live in_kind rows
// carrying training, mentoring or pro bono subtypes. Five move; ten stay.
// funding_type on most of these was set by admin:funding-type-inkind-2026-06-24,
// so this writes at admin: on Paul's word. No API spend.
//
//   npx tsx --env-file=.env.local scripts/programme-filing-2026-09-11.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const SRC = 'admin:programme-filing-2026-09-11'
const MOVE: { id: string; label: string; why: string }[] = [
  { id: 'c1caaf02-8461-4393-8ba1-c81096cded8a', label: 'Pilotlight 360', why: 'short online application, then matched to a programme' },
  { id: '1ab3dcfc-230d-44e6-9aa0-ead6a728fb77', label: 'Human Lending Library (Expert Impact)', why: 'three-step apply, match, session' },
  { id: '0967c01b-4171-4082-903d-d80774586dc3', label: 'Cranfield Trust pro bono consultancy', why: 'apply, matched to a consultant for a scoped project' },
  { id: '38f3cae0-7d56-422a-aa1f-8691c2540fc9', label: 'Pro Bono Economics Advisory', why: 'scoped analysis projects of 6 to 12 months, taken on by application' },
  { id: 'a89ee8f2-cdc6-4673-958c-786a135792c9', label: 'Just Enterprise (Scotland)', why: '"Apply for support" with a chosen pathway' },
]
const STAY = ['Buddle', 'CAST consolidated', 'Charity Digital Skills', 'Media Trust matching', 'Good Things network', 'NCVO training', 'StreetGames network', 'Pilotlight matching (duplicate front door, reported 10 Sept)', 'Social Firms Wales', 'Superhighways']
async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN'); console.log('stay in_kind:', STAY.join('; '))
  for (const m of MOVE) {
    const { data: before } = await db.from('scraped_grants').select('title, funding_type, is_active, pipeline_state').eq('id', m.id).single()
    if (!before) { console.log('  NOT FOUND', m.label); continue }
    console.log(`  ${m.label}: ${before.funding_type} -> programme (${m.why})`)
    if (!APPLY) continue
    const r = await mergeGrantUpdate({ id: m.id, source: SRC, db, fields: { funding_type: 'programme' } })
    const { data: after } = await db.from('scraped_grants').select('funding_type, is_active, pipeline_state').eq('id', m.id).single()
    const blocked = r.rejected.filter(x => x.reason !== 'idempotent')
    console.log(`     -> ${after?.funding_type} [${after?.pipeline_state} active=${after?.is_active}]` + (blocked.length ? ' BLOCKED ' + blocked.map(x => x.field + ':' + x.reason).join(',') : ''))
  }
}
main().catch(e => { console.error(e); process.exit(1) })

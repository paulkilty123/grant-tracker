// Follow-ups from timing batch 8 (found by the Opus session, decided here).
//   Newcastle Culture Investment Fund exists twice with the same title, amount
//   and brief; one link redirects to the other. Keep the row enriched today,
//   point it at the canonical page, reject the other as a duplicate.
//   SWEF Enterprise Fund (three rows): grants to young people aged 18 to 30
//   for their own business. "To be eligible to apply, you need to ... Be from
//   a low-income household". Individuals, not charities, CICs or social
//   enterprises: out of scope under the audience rule. The unnumbered third
//   row also pointed at East End Community Foundation, which has no such fund.
//   npx tsx --env-file=.env.local scripts/batch8-followups-2026-09-06.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'
const APPLY = process.argv.includes('--apply')
const SOURCE = 'user_verified:timing-2026-09-06'
const KEEP = 'e3c90440-3ea2-4bb9-a98c-07cd5d32a2e2', DROP = '6d1d2f29-c46d-4c62-986c-d7f5022dbc94'
const CANON = 'https://www.communityfoundation.org.uk/grants/supporting-newcastle-based-organisations-to-engage-residents-in-culture/'
const SWEF = ['168943e0-ffa2-4200-a811-a1a2630b2436', '5fcfa9df-c3f9-41c0-8701-417b90dece8e', 'e38ac17b-5035-44b4-bfcc-faf1090d13c7']
async function main() {
  const db = getAdminDb()
  const get = async (id: string, re: RegExp) => {
    const { data } = await db.from('scraped_grants').select('id, title, apply_url').eq('id', id).single()
    if (!data || !re.test(data.title)) throw new Error(`${id}: ${data?.title}`)
    return data
  }
  const keep = await get(KEEP, /Newcastle Culture/), drop = await get(DROP, /Newcastle Culture/)
  if (drop.apply_url !== CANON) throw new Error('canonical url changed')
  const swef = await Promise.all(SWEF.map(id => get(id, /SWEF/)))
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  console.log('  keep', keep.title, '-> apply_url', CANON, '\n  drop', drop.id, 'duplicate')
  swef.forEach(s => console.log('  reject', s.title))
  if (!APPLY) return
  const a = await mergeGrantUpdate({ id: KEEP, source: SOURCE, db, fields: { apply_url: CANON, url_status: 'unchecked' },
    citations: { apply_url: { snippet: 'The deadlines for 2026 are: 27 February, 1 May, 6 July, 4 September, 6 November', confidence: 'high', source_url: CANON } } })
  console.log('  keep applied', a.applied)
  const b = await mergeGrantUpdate({ id: DROP, source: SOURCE, db, fields: { is_active: false, pipeline_state: 'rejected',
    rejection_reason: formatRejectReason('duplicate', `same fund as ${KEEP}; that row's link redirected here`) } })
  console.log('  drop applied', b.applied)
  for (const s of swef) {
    const r = await mergeGrantUpdate({ id: s.id, source: SOURCE, db, fields: { is_active: false, pipeline_state: 'rejected',
      rejection_reason: formatRejectReason('out_of_scope', 'grants to individuals aged 18 to 30 for their own business. Page: "To be eligible to apply, you need to ... Be from a low-income household or facing other financial challenges preventing you from developing your business"') } })
    console.log('  reject applied', s.title.slice(0, 40), r.applied)
  }
}
main().catch(e => { console.error(e); process.exit(1) })

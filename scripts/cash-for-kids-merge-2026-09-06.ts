// Two Cash for Kids rows share one page, and the page today describes one
// grants programme ("Our grant rounds support children from birth up to and
// including 18 years of age ..."); it names no Cost of Living scheme. Keep the
// row read most recently, retitle it after the page, reject the other as a
// duplicate. Found by the amounts session, batch 2.
//   npx tsx --env-file=.env.local scripts/cash-for-kids-merge-2026-09-06.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'
const APPLY = process.argv.includes('--apply')
const KEEP = '91737208-0bd3-45c4-8866-ec6256e85a58', DROP = '6a57acbc-0c38-45f4-ad35-17a79c059f5b'
const URL = 'https://cashforkids.org.uk/grants/'
async function main() {
  const db = getAdminDb()
  const get = async (id: string, re: RegExp) => {
    const { data } = await db.from('scraped_grants').select('id, title, apply_url').eq('id', id).single()
    if (!data || !re.test(data.title) || data.apply_url !== URL) throw new Error(`${id}: ${data?.title} ${data?.apply_url}`)
    return data
  }
  const keep = await get(KEEP, /Cost of Living/), drop = await get(DROP, /General Grant/)
  console.log(APPLY ? 'APPLY' : 'DRY RUN', '\n  keep', keep.title, '-> "Cash for Kids Grants"\n  drop', drop.title, '-> duplicate')
  if (!APPLY) return
  const a = await mergeGrantUpdate({ id: KEEP, source: 'user_verified:amounts-2026-09-06', db,
    fields: { title: 'Cash for Kids Grants',
      description: 'Grants from Cash for Kids, the radio-linked children\'s charity, for children from birth to 18 affected by poverty, illness, neglect or additional needs across the UK, applied for through local grant rounds. Local executive boards meet several times a year, and application forms close when a round reaches capacity, so a form may not be open for every area at all times.' },
    citations: { description: { snippet: 'Our grant rounds support children from birth up to and including 18 years of age who are affected by poverty, illness, neglect or who have additional needs.', confidence: 'high', source_url: URL } } })
  console.log('  keep applied', a.applied)
  const b = await mergeGrantUpdate({ id: DROP, source: 'user_verified:amounts-2026-09-06', db, fields: { is_active: false, pipeline_state: 'rejected',
    rejection_reason: formatRejectReason('duplicate', `same page and programme as Cash for Kids Grants ${KEEP}`) } })
  console.log('  drop applied', b.applied)
}
main().catch(e => { console.error(e); process.exit(1) })

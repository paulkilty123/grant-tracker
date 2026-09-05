// The backstop-guessed rows whose pages the 3 Sept checker could not read.
// Twenty-one live rows still carried a guess with no evidence; all but Swire
// (connection reset) were read today. Two pages state a legal form the guess
// got wrong; the rest say nothing about legal form and are left alone.
//
//   TechSoup: "Charities based in England and Wales that are registered with
//   the Charity Commission ... Any other organisation that is registered with
//   HM Revenue & Customs and has charitable tax exempt status." A CIC cannot
//   hold charitable status, so the guess that admitted CICs, companies limited
//   by shares and co-operatives was wrong in the direction that misleads.
//   Fredericks Foundation: "social enterprises and charities locked out. We
//   use a Revenue Share model", so charities are in, and the guess left them out.
//
//   npx tsx --env-file=.env.local scripts/structures-unread-2026-09-05.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY  = process.argv.includes('--apply')
const SOURCE = 'user_verified:structures-unread-2026-09-05'

const ROWS = [
  { id: 'b98c7493-ff5c-42f4-ab1d-b205940e550c', re: /TechSoup/, to: ['registered_charity', 'cio', 'scio'],
    url: 'https://www.techsoup.uk/getting_started/eligibility_criteria',
    quote: 'Charities based in England and Wales that are registered with the Charity Commission ... Any other organisation that is registered with HM Revenue & Customs and has charitable tax exempt status.' },
  { id: 'd33aa458-0eb8-473a-8b28-547cd8557a71', re: /Fredericks/, to: ['cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'registered_charity', 'cio', 'scio'],
    url: 'https://www.fredericksfoundation.org/',
    quote: 'Traditional finance can be restrictive and inflexible, leaving social enterprises and charities locked out. We use a Revenue Share model' },
]

async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  for (const r of ROWS) {
    const { data } = await db.from('scraped_grants').select('title, eligible_structures').eq('id', r.id).single()
    if (!data || !r.re.test(data.title)) throw new Error(`${r.id}: ${data?.title}`)
    console.log(`  ${data.title.slice(0, 44).padEnd(44)} ${JSON.stringify(data.eligible_structures)} -> ${JSON.stringify(r.to)}`)
    if (!APPLY) continue
    const res = await mergeGrantUpdate({ id: r.id, source: SOURCE, db,
      fields: { eligible_structures: r.to, grant_sources: [{ url: r.url, label: 'Eligibility page, read 2026-09-05', added_at: '2026-09-05' }] },
      citations: { eligible_structures: { snippet: r.quote, confidence: 'high', source_url: r.url } } })
    const refused = res.rejected.filter(x => x.reason !== 'idempotent')
    console.log(`     applied [${res.applied.join(', ')}]${refused.length ? ' REFUSED ' + JSON.stringify(refused) : ''}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })

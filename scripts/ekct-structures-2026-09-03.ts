// Ernest Kleinwort Charitable Trust, 2026-09-03.
//
// Paul: the Medium Grants row lists CICs as eligible; the trust's grants
// page says registered charities only and names CICs in "What we do not
// support". Why it was missed: the row points at ekct.org.uk/apply/, which
// carries no eligibility wording. The structures were set on 2026-07-26 by
// the structures backstop classifier, which guesses from the description
// when nothing has been tagged, and the verifier on 25 August read /apply/,
// found no sentence about eligibility, and so could neither confirm nor
// contradict the guess. The Small Grants row points at /grants/ and got it
// right, with the quote. The brief's who_can_apply had the same error from
// an enrich pass over the same page.
//
// Fix: structures and brief corrected from /grants/ (read in a browser today,
// the host bot-walls plain fetches), and /grants/ banked as the funder's
// index on both rows so the verifier reads the page that states the rule.
//
//   npx tsx --env-file=.env.local scripts/ekct-structures-2026-09-03.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY  = process.argv.includes('--apply')
const SOURCE = 'user_verified:ekct-2026-09-03'
const MEDIUM = 'b6add755-6f1c-453b-9cfe-54e6b88b3f6d'
const SMALL  = 'daf20da3-2ce9-498f-a0bd-e6f3abce6651'
const GRANTS = 'https://ekct.org.uk/grants/'
const WHO = 'Applicants must be organisations registered with one year of filed accounts with the Charity Commission in England & Wales or Office of the Scottish Charity Register in Scotland.'

async function main() {
  const db = getAdminDb()
  const { data: rows } = await db.from('scraped_grants').select('id, title, funder_brief, eligible_structures').in('id', [MEDIUM, SMALL])
  if (!rows || rows.length !== 2) throw new Error('expected 2 rows')
  const med = rows.find(r => r.id === MEDIUM)!
  if (!/Medium/.test(med.title)) throw new Error(`wrong row: ${med.title}`)
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}`)
  console.log(`  Medium: ${JSON.stringify(med.eligible_structures)} -> registered_charity, cio, scio`)
  if (!APPLY) return

  const brief = { ...(med.funder_brief as Record<string, unknown>) }
  const cits = { ...((brief._citations as Record<string, unknown>) ?? {}) }
  brief.who_can_apply = 'Registered charities only: organisations registered with the Charity Commission in England and Wales or the Office of the Scottish Charity Regulator, with at least one year of filed accounts. Community Interest Companies cannot apply. Most funding areas are for charities serving beneficiaries in Sussex; UK and international wildlife and environmental conservation, and reproductive health projects in Africa or Asia with an environmental impact, are open more widely.'
  brief.exclusions = 'Community Interest Companies. Individuals, or charities applying for individuals. Large national charities with substantial fundraising, legacy or endowment income. Organisations registered for less than a year. Charities wholly or very significantly funded by local authorities or statutory sources. Pre-school groups and out-of-school play schemes. Charities not funded by any other charity. Local authorities. Campaigning organisations. Animal rescue or welfare. International food security, farming or agriculture. Arts or community engagement projects. Medical research. Regional Wildlife Trusts other than Sussex. Churches and places of worship outside Cuckfield and Haywards Heath. Citizens Advice. Support for specific medical conditions, addiction, carers other than young carers, abuse, or prison leavers. One application per applicant within 12 months.'
  cits.who_can_apply = { snippet: WHO, confidence: 'high', source_url: GRANTS }
  cits.exclusions = { snippet: 'Community Interest Companies (CICs).', confidence: 'high', source_url: GRANTS }
  brief._citations = cits

  const a = await mergeGrantUpdate({
    id: MEDIUM,
    fields: { eligible_structures: ['registered_charity', 'cio', 'scio'], funder_brief: brief, funding_index_url: GRANTS },
    source: SOURCE, db,
    citations: { eligible_structures: { snippet: WHO, confidence: 'high' } },
  })
  console.log('  Medium applied:', a.applied.join(', '), a.rejected.filter(x => x.reason !== 'idempotent').length ? JSON.stringify(a.rejected) : '')

  const b = await mergeGrantUpdate({ id: SMALL, fields: { funding_index_url: GRANTS }, source: SOURCE, db })
  console.log('  Small applied:', b.applied.join(', ') || 'nothing')
}
main().catch(e => { console.error(e); process.exit(1) })

// Ernest Kleinwort Small Grants: Paul read the grants page on 7 Sept (the
// checker cannot). Eligibility, themes, spend types and exclusions from it.
//   npx tsx --env-file=.env.local scripts/ekct-grants-page-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const URL = 'https://ekct.org.uk/grants/'
const c = (snippet: string) => ({ snippet, confidence: 'high' as const, source_url: URL })
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('id, title, location_tag, spend_restriction, spend_types, funder_brief, grant_sources').eq('title', 'Ernest Kleinwort Charitable Trust Small Grants').eq('is_active', true).single()
  if (!data) throw new Error('row not found')
  console.log(APPLY ? 'APPLY' : 'DRY RUN', data.title, `location ${data.location_tag}, spend ${data.spend_restriction}/${data.spend_types}`)
  if (!APPLY) return
  const brief = { ...(data.funder_brief as Record<string, unknown>) }
  const cits = { ...((brief._citations as Record<string, unknown>) ?? {}) }
  brief.who_can_apply = 'Charities registered for at least a year with the Charity Commission or OSCR, with a year of filed accounts. Most themes are for charities serving beneficiaries in Sussex; wildlife and environmental conservation projects can be anywhere in the UK or abroad. CICs are not funded. One application per charity in any 12 months.'
  brief.what_they_fund = 'In Sussex: youth clubs, youth counselling and bereavement, education and employability, young carers; loneliness, isolation and dementia among older people; disability support across a broad range of conditions; community welfare in the most deprived areas (Brighton and Hove, Bognor Regis, Littlehampton, Crawley, Adur, Hastings, Bexhill, Eastbourne, Newhaven), homelessness, a few long-standing hospices, and environmental projects. Elsewhere: scalable wildlife and environmental conservation, and reproductive health projects in Africa or Asia with a clear environmental impact. Start-up costs, core costs, specific projects including capital, and unrestricted funding where all the charity\'s work fits.'
  brief.exclusions = 'Individuals, large national charities with substantial fundraising or legacy income, charities registered under a year, charities mostly funded by councils or statutory bodies, pre-school groups and holiday play schemes, local authorities, campaigning organisations, fundraising charities with large reserves, animal rescue and welfare, international food security or farming, arts or community engagement projects, medical research, CICs, other regional Wildlife Trusts, churches outside Cuckfield and Haywards Heath, and Citizens Advice. No longer funded: specific medical conditions, addiction, carers other than young carers, abuse recovery, prison leavers, or charities supporting other charities.'
  brief.priorities = 'Projects that engage the wider community and actively reduce barriers to participation, in supportive settings where people from all backgrounds belong together rather than in separate cohorts.'
  Object.assign(cits, { who_can_apply: c('Applicants must be organisations registered with one year of filed accounts with the Charity Commission in England & Wales or Office of the Scottish Charity Register in Scotland.'), what_they_fund: c('Funding will be considered for: Start-up costs for a new project within an established organisation Core costs A specific project (capital expenditure or assistance with running costs) Unrestricted funding'), exclusions: c('Community Interest Companies (CICs).'), priorities: c('The Trustees look for projects which engage the wider community and make a clear commitment to inclusion by actively reducing barriers to participation.') })
  brief._citations = cits
  const sources = [...((data.grant_sources as { url: string }[]) ?? []).filter(s => s.url !== URL), { url: URL, label: 'Grants page (who, what, exclusions), read by Paul 2026-09-07', added_at: '2026-09-07' }]
  const r = await mergeGrantUpdate({ id: data.id, source: 'admin:paulkilty1@gmail.com', db,
    fields: { funder_brief: brief, spend_restriction: 'unrestricted', spend_types: ['capital', 'revenue'], funding_subtypes: ['unrestricted', 'capital'], grant_sources: sources },
    citations: { spend_restriction: c('Unrestricted funding where all of the charity\'s activities fall within EKCT\'s funding remit'), spend_types: c('A specific project (capital expenditure or assistance with running costs)') } })
  console.log('applied', r.applied, r.rejected.filter(x => x.reason !== 'idempotent'))
}
main().catch(e => { console.error(e); process.exit(1) })

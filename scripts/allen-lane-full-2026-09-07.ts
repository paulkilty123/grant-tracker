// Allen Lane Foundation, read 7 Sept from allenlane.org.uk (the captcha
// stops the checker's host, not this one). The row held £5,000 to £25,000;
// the page says "The total amount we can offer is upto £15,000" and "the
// average grant size being £5,000-£6,000". Eligibility, spend and the
// exclusions list from the funding and exclusions pages.
//   npx tsx --env-file=.env.local scripts/allen-lane-full-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const F = 'https://allenlane.org.uk/funding/', X = 'https://allenlane.org.uk/exclusions-1/'
const c = (snippet: string, source_url = F) => ({ snippet, confidence: 'high' as const, source_url })
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('id, title, amount_min, amount_max, funder_brief, field_evidence, grant_sources').eq('title', 'Allen Lane Foundation').eq('is_active', true).single()
  if (!data) throw new Error('row not found')
  console.log(APPLY ? 'APPLY' : 'DRY RUN', data.title, `${data.amount_min}-${data.amount_max} -> null-15000, income cap 250000`)
  if (!APPLY) return
  const brief = { ...(data.funder_brief as Record<string, unknown>) }
  const cits = { ...((brief._citations as Record<string, unknown>) ?? {}) }
  brief.who_can_apply = 'Small registered charities, constituted voluntary groups and some CICs (three or more unrelated board members with equal control) anywhere in the UK except Greater London. Income and expenditure under £100,000 for a local organisation, under £250,000 for a national one. Six programmes fund work with adults only; the Young People\'s Programme covers ages about 12 to 21. Established organisations are preferred over those set up in the last year.'
  brief.what_they_fund = 'Work within seven programmes: asylum seekers and refugees, Gypsy, Roma and Traveller communities, offenders and ex-offenders, older people, people affected by violence or abuse, people with mental health problems, and young people. Running and core costs, project costs or salaries, for work that makes a lasting difference, reduces isolation, stigma and discrimination, and is community-led.'
  brief.typical_award = 'Up to £15,000 in total, as a single grant or over two or three years; most grants are much less, with an average of £5,000 to £6,000.'
  brief.exclusions = 'Addiction, animal welfare, one-off events, children and young people outside the Young People\'s Programme, endowments, general arts, culture or language, general health or wellbeing, holidays and day trips, one-to-one counselling, physical or learning disability, private or mainstream education, property purchase or building, historic conservation, single-nationality groups, specific medical conditions, university education, work that is the state\'s responsibility, work already done, and anything in Greater London. Also schools, colleges, NHS bodies, councils and individuals.'
  brief.open_status = 'open'; brief.last_enriched = '2026-09-07'; brief.source = 'live_fetch'
  Object.assign(cits, { who_can_apply: c('We fund registered charities, and also other charitable not-for-profit organisations, such as constituted voluntary groups or some Community Interest Companies (CICs) for example.'), what_they_fund: c('We aim to help organisations to become sustainable, supporting running and core costs to enable them to have flexibility, security and longevity. We can contribute to project costs or salaries.'), typical_award: c('The total amount we can offer is upto £15,000.'), exclusions: c('Work that takes place within Greater London', X) })
  brief._citations = cits
  const now = new Date().toISOString()
  const ev = { ...((data.field_evidence as Record<string, unknown>) ?? {}) }
  ev.amount_max = { by: 'orchestrator-read', quote: 'The total amount we can offer is upto £15,000.', agrees: true, checked_at: now, source_url: F }
  ev.amount_min = { by: 'orchestrator-read', quote: 'the average grant size being £5,000-£6,000', agrees: true, checked_at: now, source_url: F }
  const sources = [...((data.grant_sources as { url: string }[]) ?? []).filter(s => s.url !== F && s.url !== X), { url: F, label: 'Funding page (amounts, eligibility), read 2026-09-07', added_at: '2026-09-07' }, { url: X, label: 'Exclusions page, read 2026-09-07', added_at: '2026-09-07' }]
  const r = await mergeGrantUpdate({ id: data.id, source: 'admin:paulkilty1@gmail.com', db,
    fields: { amount_min: null, amount_max: 15000, max_org_income: 250000, spend_restriction: 'unrestricted', spend_types: ['revenue'], funding_subtypes: ['unrestricted'],
      eligible_structures: ['registered_charity', 'cio', 'scio', 'unincorporated', 'cic_guarantee', 'cic_shares'], funder_brief: brief, field_evidence: ev, grant_sources: sources },
    citations: { amount_max: c('The total amount we can offer is upto £15,000.'), max_org_income: c('if you work across the whole of the UK you will need to have income/expenditure of less than £250,000'), spend_restriction: c('supporting running and core costs to enable them to have flexibility, security and longevity'), eligible_structures: c('We fund registered charities, and also other charitable not-for-profit organisations, such as constituted voluntary groups or some Community Interest Companies (CICs) for example.') } })
  console.log('applied', r.applied, r.rejected.filter(x => x.reason !== 'idempotent'))
}
main().catch(e => { console.error(e); process.exit(1) })

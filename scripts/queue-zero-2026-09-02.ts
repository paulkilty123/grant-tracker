// Review Inbox to zero, worked 2026-09-02 at Paul's request.
//
// "Live and wrong" (13) and "Nothing more we can do" (11). Every row's page
// was read today, by three read-only research passes and by hand in a
// browser for the four hosts that block plain fetches. Each change below
// rests on a sentence from the funder's own page, quoted in the citation.
//
// Two rows are NOT here because they are Paul's call, not the evidence's:
//   b7b435e3  National Portfolio Investment Programme 2028-33: real, guidance
//             lands in September, no date yet. Publish as upcoming, or watch?
//   495e8cbc  Co-op Local Community Fund: causes apply, then members choose
//             where the money goes. Member-choice scheme in or out?
//
// The Paley Trust (mailto route, ruled correct 2026-08-31) is fixed in the
// counter, not here: review-reasons.ts now honours the accepted route for
// page_unreadable and link_unverified as it already did for read_exhausted.
//
// Source is user_verified (70): above ai_enrich, below admin, so a re-read
// cannot undo a fact read today and nothing is frozen for good.
//
//   npx tsx --env-file=.env.local scripts/queue-zero-2026-09-02.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate, stampNewGrant } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'

const APPLY  = process.argv.includes('--apply')
const SOURCE = 'user_verified:queue-zero-2026-09-02'
type Cit = Record<string, { snippet: string; confidence: 'high' | 'med' | 'low' }>

const REJECT: { id: string; title: string; code: string; note: string; quote: string }[] = [
  { id: '5147342c-5490-4a88-91de-354e1f3cfed3', title: 'HAPi & Matched Funding', code: 'out_of_scope',
    note: 'only Heathrow Airport employees can apply; charities cannot',
    quote: 'Grants are available to employees of Heathrow Airport Limited who regularly volunteer with UK-based non-profit organisations.' },
  { id: '571452cd-970a-4e09-8f4b-1fdc607ae050', title: 'VCSE Contract Readiness Programme', code: 'closed_for_good',
    note: 'training programme, ran July 2022 to March 2025; course page is 404',
    quote: 'The VCSE pathway offers charities and social enterprises a range of webinars, short and long courses' },
  { id: 'fc3f9fe3-ae00-46f0-b7e1-f200163f7e80', title: 'Catch22 GoodTech Ventures Accelerator', code: 'out_of_scope',
    note: 'accelerator for tech startup founders; no grant amount; cohort 4 closed October 2025',
    quote: 'We are building an open community of founders and leaders working with GoodTech.' },
  { id: '21ef3915-2aaa-4987-b2f1-57d4a1b66836', title: 'Capital Investment Programme', code: 'historical_deadline',
    note: 'ended; the capital hub now runs LIF, MEND and the Creative Foundations Fund, which we carry',
    quote: 'For the financial year 2026/2027 the following programmes will run: Libraries Improvement Fund ... MEND ... Creative Foundations Fund' },
  { id: 'f28580cf-d4ac-4b0d-b466-c04eaabe5f3a', title: 'Libraries Improvement Fund', code: 'out_of_scope',
    note: 'lead applicant must be an English local authority',
    quote: 'The lead applicant must be an English Local Authority ... Other organisations are welcomed as project partners but may not apply without a Local Authority as the lead applicant.' },
  { id: '3da49c2b-f77e-4c62-86cd-b3a1d734457a', title: 'Waitrose Community Matters', code: 'non_funder',
    note: 'green-token customer vote in store; the page is a 404',
    quote: '404 NOT FOUND. Sorry, the requested resource was not found.' },
  { id: 'c81a166a-56eb-494f-aaed-3a435405a50a', title: 'Museum Renewal Fund 2025-26', code: 'historical_deadline',
    note: 'one-off round closed 22 May 2025; the Museum Transformation Programme is the live successor',
    quote: 'Application: 9 April – 22 May 2025 (deadline 12pm noon)' },
  { id: '8b6e8083-3958-4900-97bf-330597158f7b', title: 'Supporting grassroots music', code: 'closed_for_good',
    note: 'round 12 was the final round',
    quote: 'Round 12 was the final round of the programme. It had a deadline of 11.59pm on Thursday 23 July 2026.' },
]

const WATCH: { id: string; title: string; when: string; quote: string }[] = [
  { id: '8b5c4025-318d-4354-a766-228b361ffba3', title: 'Trading for Good: Community Business',
    when: 'Spring 2027', quote: 'Applications will open again in Spring 2027.' },
  { id: '0da6e8ba-758c-4c85-876b-4567976d4efd', title: 'Creative Foundations Fund Round 2',
    when: 'Expressions of interest closed; full applications by invitation to 23 October 2026. Round 3 expected spring 2027 if the pattern holds.',
    quote: 'The deadlines for submitting Expressions of Interest for both strands of the fund have now passed.' },
]

const EDIT: { id: string; title: string; fields: Record<string, unknown>; citations?: Cit }[] = [
  { id: 'ae7cef18-d1cb-495d-ac93-4e177007997a', title: 'Essex Community Foundation',
    fields: {
      apply_url: 'https://www.essexcommunityfoundation.org.uk/applying-for-support/',
      funding_index_url: 'https://www.essexcommunityfoundation.org.uk/applying-for-support/',
      url_status: 'unchecked', is_rolling: true,
    },
    citations: { apply_url: { snippet: 'You can apply for support at any time, as we accept grant applications all year round.', confidence: 'high' } } },
  { id: 'c34f6859-efee-491f-98e8-aa560f2c0b35', title: 'Devon Community Foundation',
    fields: { funding_index_url: 'https://www.devoncf.com/current-funds/' } },
  { id: 'fab5ab12-9098-4e07-8647-722374e2126e', title: 'Idlewild Trust Conservation Grants',
    fields: { funding_index_url: 'https://www.idlewildtrust.org.uk/apply-grant' } },
  { id: '79b3cc06-49f8-4e14-b930-0504bfdcf575', title: 'National Lottery Project Grants',
    fields: { apply_url: 'https://www.artscouncil.org.uk/ProjectGrants', url_status: 'unchecked' },
    citations: { apply_url: { snippet: 'Project Grants is always open for applications between £1,000 and £100,000.', confidence: 'high' } } },
  { id: 'd90693a5-fdfa-42ca-a049-f7adaea2aff4', title: 'Historic England Heritage at Risk Capital Fund',
    fields: {
      title: 'Historic England Heritage at Risk Capital Fund',
      apply_url: 'https://historicengland.org.uk/advice/grants/what-we-fund/heritage-at-risk-capital-fund/',
      url_status: 'unchecked',
      amount_min: null, amount_max: 1000000, deadline: '2026-09-18', is_rolling: false,
      funding_subtypes: null,
      description: 'Grants of up to £1 million for the conservation, repair and conversion of listed buildings of all grades, historic buildings in conservation areas, registered parks and gardens and scheduled monuments in England. Open to organisations or individuals with legal responsibility for the asset. Two rounds a year by expression of interest; round 2 expressions of interest close 18 September 2026, with invited full applications due 30 October 2026. Up to £60 million remains to 2030.',
    },
    citations: {
      amount_max: { snippet: 'Grants of up to £1 million are available to organisations or individuals with legal responsibility for the asset.', confidence: 'high' },
      deadline:   { snippet: 'Round 2: opens on Friday 28 August and the deadline for submitting an EOI is Friday 18 September 2026', confidence: 'high' },
    } },
  { id: '283f4277-aca4-4cc1-ae9e-2d2aebcf54f3', title: 'Community Shares Booster Fund',
    fields: {
      title: 'Community Shares Booster Fund',
      funding_type: 'investment', is_rolling: true,
      description: 'Match equity investment of £10,000 to £50,000 into community share offers run by community businesses in England, alongside the share offer itself. Applications for matched equity investment are open on a rolling basis by expression of interest. The development grants strand closed in 2026.',
    },
    citations: {
      funding_type: { snippet: '2026 update Expressions of Interest for development grants are now closed. Applications for matched equity investment remain open.', confidence: 'high' },
    } },
  { id: '46d26bc7-f120-4b66-b4e2-303dcabe0c39', title: 'Robertson Trust Small Grants',
    fields: {
      title: 'Robertson Trust Small Grants',
      apply_url: 'https://www.therobertsontrust.org.uk/funding/types-of-funding/small-grants/',
      url_status: 'unchecked',
      amount_min: 5000, amount_max: 20000, is_rolling: true,
      description: 'Unrestricted or restricted revenue funding of £5,000 to £20,000 a year, normally for three years, for registered charities working in Scotland with an annual income between £30,000 and £200,000 that help people and communities living with poverty and trauma. Applications are considered on a rolling basis. The trust\'s Large Grants (£20,000 to £50,000 a year, income £200,000 to £2 million) are a separate row.',
    },
    citations: {
      amount_max: { snippet: 'Unrestricted or restricted revenue funding of between £5,000 and £20,000 per year, normally for 3 years', confidence: 'high' },
      is_rolling: { snippet: 'We consider applications on a rolling basis, meaning you can apply at any time.', confidence: 'high' },
    } },
  { id: 'd4f9cf52-1ec4-490b-aef8-8f5b803708fd', title: 'Museum Transformation Programme',
    fields: {
      funding_type: 'grant', amount_min: 50000, amount_max: 1000000, deadline: '2026-09-30', is_rolling: false,
    },
    citations: {
      amount_max: { snippet: 'between £50,000 to £1million', confidence: 'high' },
      deadline:   { snippet: 'The application portal will open on 1 September 2026. The deadline for applications is 12pm (midday) on 30 September 2026.', confidence: 'high' },
    } },
]

const NEW_ROWS: Record<string, unknown>[] = [
  {
    title: 'Robertson Trust Large Grants',
    funder: 'The Robertson Trust',
    apply_url: 'https://www.therobertsontrust.org.uk/funding/types-of-funding/large-grants/',
    funding_type: 'grant',
    funder_type: 'trust_foundation',
    location_tag: 'Scotland',
    amount_min: 20000, amount_max: 50000,
    is_rolling: false,
    next_open_date: 'Reopening to all applicants by the end of August 2026 with a new two-stage process',
    description: 'Revenue funding of £20,000 to £50,000 a year for registered charities working in Scotland with an annual income between £200,000 and £2 million that help people and communities living with poverty and trauma. Paused in 2026 while the trust moved to a two-stage process; the page said it would reopen to all applicants by the end of August 2026.',
    eligible_structures: ['registered_charity', 'scio'],
  },
]

async function main() {
  const db = getAdminDb()
  const ids = [...REJECT, ...WATCH, ...EDIT].map(r => r.id)
  const { data: rows, error } = await db.from('scraped_grants').select('id, title, pipeline_state, is_active').in('id', ids)
  if (error || !rows || rows.length !== ids.length) throw new Error(`expected ${ids.length} rows, got ${rows?.length}: ${error?.message}`)
  const byId = new Map(rows.map(r => [r.id, r]))
  console.log(APPLY ? 'APPLY' : 'DRY RUN')

  const run = async (id: string, what: string, fields: Record<string, unknown>, citations?: Cit) => {
    const cur = byId.get(id)!
    console.log(`  ${what.padEnd(48)} ${cur.pipeline_state}/${cur.is_active ? 'live' : 'hidden'} -> ${Object.keys(fields).join(', ')}`)
    if (!APPLY) return
    const r = await mergeGrantUpdate({ id, fields, source: SOURCE, db, citations })
    const refused = r.rejected.filter(x => x.reason !== 'idempotent')
    console.log(`     applied [${r.applied.join(', ') || 'nothing'}]${refused.length ? ` REFUSED ${JSON.stringify(refused)}` : ''}`)
  }

  console.log('\n-- reject')
  for (const r of REJECT) {
    await run(r.id, r.title, {
      is_active: false, pipeline_state: 'rejected',
      rejection_reason: formatRejectReason(r.code, `${r.note}. Page: "${r.quote}"`),
    })
  }

  console.log('\n-- closed for now, watch')
  for (const w of WATCH) {
    await run(w.id, w.title, { is_active: false, pipeline_state: 'between_rounds_scheduled', next_open_date: w.when },
      { next_open_date: { snippet: w.quote, confidence: 'high' } })
  }

  console.log('\n-- edits')
  for (const e of EDIT) await run(e.id, e.title, e.fields, e.citations)

  console.log('\n-- new rows, staged for review')
  for (const row of NEW_ROWS) {
    const { data: dupe } = await db.from('scraped_grants').select('id').eq('title', row.title as string).limit(1)
    if (dupe?.length) { console.log(`  already present: ${row.title}`); continue }
    console.log(`  ${row.title}`)
    if (!APPLY) continue
    const stamped = { ...stampNewGrant({ ...row, source: SOURCE, is_active: false }, SOURCE), pipeline_state: 'tagged_awaiting_review' as const }
    const { error: insErr } = await db.from('scraped_grants').insert(stamped)
    if (insErr) console.log(`     FAILED: ${insErr.message}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })

// The audit's actionable list, worked. Approved by Paul on 8 September.
//
// THREE OF THE EIGHT TURNED OUT NOT TO BE DEFECTS, and are left alone:
//
//   Manchester Airport Community Trust Fund (373ce8d3) links to
//   magcommunityfunds.smapply.org, which the detector read as a bare homepage
//   because it has no path. It is an application portal, which is the correct
//   destination for an applicant, not a front door.
//
//   The two find-government-grants links (16bfa48f Commissioned Rehabilitative
//   Services, 5700594e HS2 CEF/BLEF) are GOVERNMENT schemes, and Find a Grant
//   is the government's own official route for them. Both listings return 200
//   today. That is different from the Men's Health Community Fund case this
//   morning, where the fund's real home is a charity partner and the listing
//   had died. Flagging them as third-party was my detector over-reaching.
//
// So the real work is one duplicate merge and four relinks, one of which
// carries a genuine amount correction.
//
//   npx tsx --env-file=.env.local scripts/waitlist-audit-fixes-2026-09-08.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'

const APPLY = process.argv.includes('--apply')
const SRC = 'user_verified:waitlist-audit-2026-09-08'

type Cit = Record<string, { snippet: string; confidence: 'high' | 'med' | 'low'; source_url?: string }>

const JJ = 'https://www.johnjames.org.uk/how-to-apply'
const JJ_ELIG = 'https://www.johnjames.org.uk/eligibility'
const HOL = 'https://www.heritageoflondon.org/grant-scheme'
const HOM = 'https://www.homity.co.uk/applying-for-a-grant'
const SMT = 'https://southovermanortrust.org.uk/apply/'

type Fix = {
  id: string; re: RegExp; label: string; url: string
  fields: Record<string, unknown>; cits: Cit
  brief: Record<string, string>; briefCits: Cit
}

const FIXES: Fix[] = [
  {
    id: '8cafcf2a-a4f7-4e9e-8721-f049db468d81', re: /Community Grants/, label: 'John James Bristol Foundation — Community Grants',
    url: JJ,
    // amount_min, amount_max, location_tag and eligible_structures are all
    // pinned on this row and are not touched.
    fields: { apply_url: JJ },
    cits: { apply_url: { snippet: 'We are a grant making Foundation that supports charitable organisations working to improve the lives of people in Bristol and have awarded more than £50 million to date.', confidence: 'high', source_url: 'https://www.johnjames.org.uk/' } },
    brief: {
      who_can_apply: 'Charitable organisations improving the lives of people in Bristol. All organisations must have existed for more than a year, and charities and CICs must have filed accounts with their regulator. A CIC needs at least two unrelated directors and must generate at least 25% of income from trading. Every organisation needs a bank account in its own name with two unrelated signatories and two-stage payment authorisation. Unregistered not-for-profits also need a committee of at least three unpaid, mostly unrelated members and a written constitution.',
      what_they_fund: 'Six areas of priority: children and young people, community, education, health, social welfare, and a programme for older people.',
      how_to_apply: 'Check what they fund, the areas of priority and the funding FAQs first, then apply using the forms on the site. You must include your most recent filed accounts, and if those are more than fifteen months old, details of your current financial position and reserves. You can contact the Foundation to speak to someone before applying.',
      exclusions: 'Requests must be proportionate to the organisation\'s current income level. Organisations less than a year old, and CICs without two unrelated directors or without 25% of income from trading, do not meet the criteria.',
      open_status: 'open',
    },
    briefCits: {
      who_can_apply: { snippet: 'All organisations must have been in existence for more than one year and in the case of charities/CICs have filed a set of accounts with the relevant regulatory body. Community Interest Companies must have a minimum of two unrelated Directors and generate at least 25% of income from trading.', confidence: 'high', source_url: JJ_ELIG },
      what_they_fund: { snippet: 'Children & young people Community Educational programmes Health Programme for older people Social welfare', confidence: 'high', source_url: 'https://www.johnjames.org.uk/' },
      how_to_apply: { snippet: 'A copy of your most recent filed accounts and if over fifteen months old, details of your current financial situation and reserves.', confidence: 'high', source_url: JJ_ELIG },
      exclusions: { snippet: 'Requests must also be proportionate to the current income level.', confidence: 'high', source_url: JJ_ELIG },
      open_status: { snippet: 'If you would like to speak to someone before applying, please contact us', confidence: 'med', source_url: JJ },
    },
  },
  {
    id: '356e9de1-76ae-43bd-999c-134b1567841c', re: /Heritage of London Trust/, label: 'Heritage of London Trust — Restoration Grants',
    url: HOL,
    // The real find here: the row held £25,000 and the fund's own page caps it
    // at £15,000. amount_max is not pinned, so it is corrected. amount_min of
    // £5,000 is left alone: the page states no floor, and removing a plausible
    // one would lose information rather than correct it.
    fields: { apply_url: HOL, amount_max: 15000 },
    cits: {
      apply_url: { snippet: 'Heritage of London Trust can help you restore your local heritage. We can help with all planning of the project including preparing scope, budget and specialist reports.', confidence: 'high', source_url: HOL },
      amount_max: { snippet: 'Grants of up to £15,000 are available for the restoration of historic buildings and monuments which are available for public access and enjoyment.', confidence: 'high', source_url: HOL },
    },
    brief: {
      who_can_apply: 'Any community organisation, a representative of a community organisation, or a London local authority. The building or monument does not need to be listed but must be considered of particular historic or architectural interest, and must be available for public access and enjoyment.',
      what_they_fund: 'Restoration of historic buildings and monuments in London. The Trust also helps with planning the project, including preparing the scope, budget and specialist reports.',
      how_to_apply: 'Contact the Trust on 020 7099 0559 or email info@heritageoflondon.org describing the project, or use the project enquiry form on the site.',
      exclusions: 'Projects outside London boroughs; buildings that are not open or accessible to the public; restoration where the work has already been completed; roof replacements or general maintenance repairs; hard and soft landscaping; and wayfinding, signage and interpretation.',
      typical_award: 'Up to £15,000. Successful projects receive a committed grant for a period of three years, and funds are dispensed at project completion.',
      decision_timeline: 'Applications are assessed and approved by the Board, which meets three times a year.',
      open_status: 'open',
    },
    briefCits: {
      who_can_apply: { snippet: 'Any community organisation, representative of a community organisation or London local authority can apply for a grant. Buildings or monuments do not need to be listed but must be considered of particular historic or architectural interest.', confidence: 'high', source_url: HOL },
      what_they_fund: { snippet: 'Grants of up to £15,000 are available for the restoration of historic buildings and monuments which are available for public access and enjoyment.', confidence: 'high', source_url: HOL },
      how_to_apply: { snippet: 'Please contact us on 020 7099 0559 or email info@heritageoflondon.org , describing the project. You can also use the project enquiry form', confidence: 'high', source_url: HOL },
      exclusions: { snippet: 'Projects outside of London boroughs Buildings that are not open or accessible to the public Restoration schemes where the work has already been completed Roof replacements or general maintenance repairs Hard and soft landscaping Wayfinding, signage and interpretation', confidence: 'high', source_url: HOL },
      typical_award: { snippet: 'Successful projects receive a committed grant for a period of three years, subject to grant conditions. Funds are dispensed at project completion.', confidence: 'high', source_url: HOL },
      decision_timeline: { snippet: 'Grant applications are assessed and need to be approved by the Board which meets three times a year.', confidence: 'high', source_url: HOL },
      open_status: { snippet: 'If a place near you has a unique heritage story to tell, we would love to hear from you.', confidence: 'med', source_url: HOL },
    },
  },
  {
    id: 'f47db5b5-af42-49c5-b807-ce993c3bd9fc', re: /Homity Trust/, label: 'The Homity Trust',
    url: HOM,
    // eligible_structures is pinned and is not touched. The row's £1,000 cap
    // and 10 December deadline both already match the page.
    fields: { apply_url: HOM },
    cits: { apply_url: { snippet: 'Our small grants fund provides support of up to £1000 and you should show a breakdown of the amount applied for and evidence of benefit to end users who are in financial difficulty.', confidence: 'high', source_url: HOM } },
    brief: {
      who_can_apply: 'Registered charities, constituted community groups and other not-for-profit organisations with a formal constitution, based and working in Sussex, helping people in financial hardship. The Trust particularly favours small causes where a small grant makes a significant difference.',
      what_they_fund: 'Small grants of up to £1,000 where the money will make a big difference to end users in financial difficulty. More than 650 small grants have been made across Sussex in thirteen years.',
      how_to_apply: 'Apply using the form on the Trust\'s site, ideally well before the deadline. An initial enquiry through the contact page is welcomed before applying.',
      exclusions: 'Applicants are asked to wait one funding round before re-applying, whether or not they were successful. The Trustees reserve the right to part-fund applications and to close a round early if oversubscribed.',
      typical_award: 'Up to £1,000.',
      decision_timeline: 'The next grants meeting is in January with an application deadline of 10 December 2026. Applicants are notified of the outcome usually within a month of the Trustees\' meeting.',
      open_status: 'open',
    },
    briefCits: {
      who_can_apply: { snippet: 'The Homity Trust considers enquiries from registered charities, constituted community groups and Not For Profit organisations.', confidence: 'high', source_url: HOM },
      what_they_fund: { snippet: 'In that time we have provided more than 650 small grants to registered community causes working across Sussex, helping those suffering financial hardship, and where the small grants will make a significant difference.', confidence: 'high', source_url: 'https://www.homity.co.uk/' },
      how_to_apply: { snippet: 'If necessary please use the contact page to make an initial enquiry before applying for funding.', confidence: 'high', source_url: HOM },
      exclusions: { snippet: 'All applicants are kindly asked to wait for one funding round before re-applying (whether successful or not).', confidence: 'high', source_url: HOM },
      typical_award: { snippet: 'Our small grants fund provides support of up to £1000', confidence: 'high', source_url: HOM },
      decision_timeline: { snippet: 'The next one is in January with an application deadline of 10th December 2026 , however it is highly recommended to apply well before this as we are usually very oversubscribed', confidence: 'high', source_url: HOM },
      open_status: { snippet: 'Our next funding round is the Winter one , with a strict application deadline of 10th December 2026', confidence: 'high', source_url: 'https://www.homity.co.uk/' },
    },
  },
  {
    id: 'aa3d0b6c-2048-4007-beb2-25d400085dfe', re: /Southover Manor Trust/, label: 'Southover Manor Trust',
    url: SMT,
    fields: { apply_url: SMT },
    cits: { apply_url: { snippet: 'If you are eligible to apply for educational grants, you will be provided with a downloadable application form to complete and submit to us by email to appn@southovermanortrust.org.uk and by post.', confidence: 'high', source_url: SMT } },
    brief: {
      who_can_apply: 'State and independent schools, colleges, youth clubs, pre-schools, play groups and nurseries in East Sussex, West Sussex and Brighton and Hove, supporting the learning of young people under the age of 25.',
      what_they_fund: 'Educational projects for children and young adults. The Trust prioritises projects reaching numbers of children and young adults, and where it can fund in partnership with other funders.',
      how_to_apply: 'Answer the eligibility questions on the apply page, then download the application form and submit it by email to appn@southovermanortrust.org.uk and by post, including quotations, plans and photographs relevant to the application.',
      exclusions: 'Meeting the criteria does not automatically lead to an award, and Trustees may visit the school or organisation before deciding.',
      decision_timeline: 'Trustees meet twice a year. Closing dates are 31 March for the May meeting and 30 September for the November meeting.',
      open_status: 'open',
    },
    briefCits: {
      who_can_apply: { snippet: 'We consider funding applications from state and independent schools, colleges, youth clubs, pre-schools, play groups and nurseries.', confidence: 'high', source_url: 'https://southovermanortrust.org.uk/' },
      what_they_fund: { snippet: 'We prioritise projects that support the education of numbers of children and young adults, and where we can be in partnership with other providers of funding.', confidence: 'high', source_url: 'https://southovermanortrust.org.uk/' },
      how_to_apply: { snippet: 'you will be provided with a downloadable application form to complete and submit to us by email to appn@southovermanortrust.org.uk and by post', confidence: 'high', source_url: SMT },
      exclusions: { snippet: 'Please note that meeting the criteria for an educational grant does not automatically lead to the award of a grant.', confidence: 'high', source_url: SMT },
      decision_timeline: { snippet: 'Closing dates for applications Trustees’ grant meetings 31 March May 30 September November', confidence: 'high', source_url: SMT },
      open_status: { snippet: 'The Trustees of Southover Manor General Educational Trust Ltd meet to consider applications for educational grants twice a year', confidence: 'high', source_url: SMT },
    },
  },
]

// The one genuine duplicate: same funder, same URL, same £100,000 ceiling.
// Proved in the database, which per the verdicts rule needs no page sentence.
// 8c8418fe is the keeper because it carries the admin pins, exactly as the Hull
// merge was decided.
const DUP_REJECT = {
  id: '79b3cc06-49f8-4e14-b930-0504bfdcf575',
  re: /National Lottery Project Grants/,
  code: 'duplicate',
  note: 'Duplicate of 8c8418fe, Arts Council National Lottery Project Grants: same funder (Arts Council England), same apply_url (artscouncil.org.uk/ProjectGrants) and the same £100,000 ceiling. 8c8418fe is kept because it carries admin pins on deadline, amount_min and amount_max while this row carries none, which is the same rule used for the Hull Community Fund merge. NOTE FOR REVIEW, not acted on: the two rows disagreed on the floor, £3,000 on the pinned keeper against £1,000 here. Arts Council\'s own page could not be read today (HTTP 403), so the pin was left alone rather than changed on a guess.',
}

async function main() {
  const db = getAdminDb()
  console.log(`waitlist audit fixes — ${APPLY ? 'APPLY' : 'DRY RUN'}\n`)

  console.log('── the one genuine duplicate ────────────────────────────')
  {
    const { data } = await db.from('scraped_grants').select('id,title,is_active,pipeline_state').eq('id', DUP_REJECT.id).single()
    if (!data) throw new Error('duplicate row not found')
    if (!DUP_REJECT.re.test(String(data.title))) throw new Error(`wrong row: ${data.title}`)
    console.log(`  ${data.is_active ? 'LIVE  ' : 'hidden'} ${data.title} -> reject (duplicate of 8c8418fe)`)
    if (APPLY) {
      const { error } = await db.from('scraped_grants').update({
        is_active: false, pipeline_state: 'rejected',
        rejection_reason: formatRejectReason(DUP_REJECT.code, DUP_REJECT.note),
      }).eq('id', DUP_REJECT.id)
      if (error) throw new Error(error.message)
      console.log('         rejected')
    }
  }

  console.log('\n── relinks off homepages, with enrichment ───────────────')
  for (const f of FIXES) {
    const before = await db.from('scraped_grants')
      .select('id,title,apply_url,amount_min,amount_max,is_active,pipeline_state,funder_brief,field_provenance').eq('id', f.id).single()
    if (before.error || !before.data) throw new Error(`${f.id}: ${before.error?.message ?? 'no row'}`)
    const d = before.data as unknown as Record<string, unknown>
    if (!f.re.test(String(d.title))) throw new Error(`${f.id}: title "${d.title}" does not match ${f.re}`)
    const fp = (d.field_provenance ?? {}) as Record<string, { pinned?: boolean }>
    const pinnedTargets = Object.keys(f.fields).filter(k => fp[k]?.pinned)
    if (pinnedTargets.length) throw new Error(`${f.label}: would write PINNED ${pinnedTargets.join(', ')}. Report instead.`)

    console.log(`  ${f.label}`)
    console.log(`      ${d.apply_url}`)
    console.log(`   -> ${f.fields.apply_url}${f.fields.amount_max ? `   amount_max ${d.amount_max} -> ${f.fields.amount_max}` : ''}`)
    if (!APPLY) continue

    const res = await mergeGrantUpdate({ id: f.id, fields: f.fields, source: SRC, db, citations: f.cits })
    const refused = res.rejected.filter(x => x.reason !== 'idempotent')
    console.log(`      applied [${res.applied.join(', ') || 'nothing'}]${refused.length ? ` REFUSED ${JSON.stringify(refused)}` : ''}`)
    if (refused.length) throw new Error(`${f.label}: refused — ${JSON.stringify(refused)}`)

    const existing = (d.funder_brief as Record<string, unknown> | null) ?? {}
    const priorCits = (existing._citations ?? {}) as Record<string, unknown>
    const fresh = {
      ...existing, ...f.brief, source: 'live_fetch', last_enriched: '2026-09-08',
      _citations: { ...priorCits, ...Object.fromEntries(Object.entries(f.briefCits).map(([k, v]) => [k, { ...v, source_url: v.source_url ?? f.url }])) },
    }
    const first = Object.values(f.briefCits)[0]
    const res2 = await mergeGrantUpdate({ id: f.id, fields: { funder_brief: fresh }, source: SRC, db, citations: first ? { funder_brief: first } : undefined })
    console.log(`      brief [${res2.applied.join(', ') || 'nothing'}]`)
  }

  console.log('\n── after ────────────────────────────────────────────────')
  const ids = [DUP_REJECT.id, '8c8418fe-9b52-4ba8-bac7-0bc4732c96e4', ...FIXES.map(f => f.id)]
  const { data: after } = await db.from('scraped_grants').select('id,title,is_active,pipeline_state,apply_url,amount_min,amount_max').in('id', ids)
  for (const r of (after ?? []) as Record<string, unknown>[]) {
    console.log(`  ${r.is_active ? 'LIVE  ' : 'hidden'} ${String(r.pipeline_state).padEnd(12)} ${String(r.title).slice(0, 40).padEnd(40)} ${r.amount_min}-${r.amount_max}`)
    console.log(`         ${r.apply_url}`)
  }
}
main().catch(e => { console.error('\nFAILED:', e.message); process.exit(1) })

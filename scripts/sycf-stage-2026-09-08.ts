/**
 * South Yorkshire's Community Foundation, 8 September 2026.
 *
 * Why. The Sheffield signup (The Suit Works) had one local row at Good: SYCF's
 * own front-door row, whose apply_url is the /apply/search-our-grants index and
 * which carries no amounts and a null description. Behind it the index lists
 * FOURTEEN funds. Same Firstport shape as Leeds. Sheffield was never a
 * discovery gap.
 *
 * The index is JavaScript-rendered: a direct fetch returns the shell with
 * "Loading..." where the funds are, so the fund list was read in Chrome. The
 * individual fund pages ARE server-rendered and were fetched directly, which is
 * why the quote guard below can run against real buffers for all three.
 *
 * Dedup ran provider-first over all 1,998 rows. SYCF is held as the front-door
 * row plus an archived homepage; none of its fourteen funds is held.
 *
 * Staged hidden for Paul. Nothing existing is changed.
 */
import { createClient } from '@supabase/supabase-js'
import { stampNewGrant } from '../src/lib/grant-merge'
import { SUBTYPES_BY_FUNDING_TYPE } from '../src/lib/funding-subtypes'
import { VALID_SECTORS, VALID_STRUCTURES } from '../src/lib/classify'
import * as fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
const envVar = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))![1].trim()
const db = createClient(envVar('NEXT_PUBLIC_SUPABASE_URL'), envVar('SUPABASE_SERVICE_ROLE_KEY'))

const SOURCE = 'system:sycf-2026-09-08'
const APPLY = process.argv.includes('--apply')
const BASE = 'https://www.sycf.org.uk/apply/search-our-grants'

const DUE_DILIGENCE =
  'SYCF publishes a due diligence note explaining how it assesses applications and the reasons an ' +
  'organisation can fail eligibility. It is worth reading before applying, and it is linked from every fund page.'

type Row = Record<string, unknown> & { title: string; _file: string; _quote: string }

const ROWS: Row[] = [
  {
    title: 'SYCF Small Grants Programme',
    funder: "South Yorkshire's Community Foundation",
    funder_type: 'community_foundation',
    description:
      'Grants of up to £1,000 for small, developing and less well-resourced groups across South Yorkshire, where a small amount of funding can make a real difference. Applicants should have an annual income of no more than £10,000, and do not have to be a registered charity. Most grants are one-off payments, for a one-off event or for equipment. The programme is rolling, with panel review dates at the end of January, March, June, September and December, and applications must be complete four weeks before a review date. Decisions follow roughly eight to ten weeks after a complete application.',
    amount_min: null, amount_max: 1000, max_org_income: 10000,
    deadline: null, is_rolling: true,
    is_local: true, location_tag: 'South Yorkshire',
    funding_type: 'grant', funding_subtypes: ['small_grant', 'restricted'],
    applicant_type: 'organisation',
    sectors: ['community', 'poverty', 'education', 'health'],
    impact_sectors: ['community', 'education', 'health'],
    target_beneficiaries: ['general_public', 'people_in_poverty'],
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated', 'cooperative'],
    eligibility_criteria: [
      'Annual income of no more than £10,000',
      'Not-for-profit organisation based in South Yorkshire; you do not have to be a registered charity',
      'All applicants, new and returning, must register on the SYCF Grants Portal',
      'Applications must be complete four weeks before a panel review date',
    ],
    apply_url: `${BASE}/sycf-small-grants-programme`,
    funder_brief: {
      source: SOURCE,
      what_they_fund:
        'One-off events or equipment for small groups. The Foundation says it is interested in groups that respond to their communities’ needs; activities supporting people whose needs can be clearly demonstrated; groups focused on the advancement of education, promotion of good health or the relief of poverty and sickness; groups working in collaboration with other local community groups; activities engaging people who face discrimination or disadvantage; and activities producing a wide range of benefits and good value for money.',
      who_can_apply:
        'Not-for-profit organisations and community groups across South Yorkshire with an annual income no greater than £10,000. Registered charity status is not required.',
      typical_award: 'The majority of grants are one-off payments of up to £1,000.',
      geographic_focus: 'South Yorkshire: Barnsley, Doncaster, Rotherham and Sheffield.',
      priorities:
        'Small, developing and less well-resourced groups where a small amount of money makes a real difference.',
      exclusions:
        'Groups with an annual income above £10,000 should look at SYCF Community Grants instead. Applications that do not meet the listed priorities can still be submitted but the Foundation says they are less likely to be funded.',
      decision_timeline:
        'Rolling, with panel review dates at the end of January, March, June, September and December 2026. Applications must be in full four weeks before a review date. Decisions roughly 8 to 10 weeks after a complete application.',
      how_to_apply:
        'Register on the SYCF Grants Portal, read the guidance information, and complete the application form online. New and existing groups both need to register on the new portal. Queries to apreston@sycf.org.uk.',
      open_status: 'Open. The programme is rolling and always open.',
      funder_tips:
        'The £10,000 income ceiling is the first filter and it is low, so check it before anything else. Apply four weeks ahead of a panel date rather than to a deadline. ' + DUE_DILIGENCE,
      strong_application:
        'The Foundation lists six things it wants to see, and collaboration with other local groups and reaching people who face discrimination or disadvantage are two of them. Say plainly which of the six the application meets.',
    },
    _file: '/tmp/sy-sycf-small-grants-programme.txt',
    _quote: 'Groups applying for the programme should not have an annual income of more than £10,000.',
  },
  {
    title: 'Sheffield Legacy Fund',
    funder: "South Yorkshire's Community Foundation",
    funder_type: 'community_foundation',
    description:
      'Grants of up to £1,000, to be spent within one year, for grassroots community organisations within a three-mile radius of Sheffield Olympic Legacy Park, funding activities that address physical and mental health and wellbeing. Consortiums bringing together more than one community organisation in a single bid can apply for up to £5,000, naming one lead applicant accountable for the grant. The fund is paid for by Sheffield Olympic Legacy Park partners, and the priority is to support all or the majority of an event or activity so the grant has real impact.',
    amount_min: null, amount_max: 5000,
    deadline: null, is_rolling: true,
    is_local: true, location_tag: 'Sheffield',
    funding_type: 'grant', funding_subtypes: ['small_grant', 'restricted'],
    applicant_type: 'organisation',
    sectors: ['health', 'sport', 'community'],
    impact_sectors: ['health', 'mental_health', 'sport', 'community'],
    target_beneficiaries: ['general_public'],
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated', 'cooperative'],
    eligibility_criteria: [
      'Grassroots community organisation within a three-mile radius of Sheffield Olympic Legacy Park',
      'Activities must address physical or mental health and wellbeing',
      'Up to £1,000 for a single organisation, or up to £5,000 for a consortium bid with a named lead applicant',
      'Grants must be spent within one year',
      'A group previously supported can only reapply 12 months after the previous award and once the End of Grant report is complete',
    ],
    apply_url: `${BASE}/sheffield-legacy-fund`,
    funder_brief: {
      source: SOURCE,
      what_they_fund:
        'Physical and mental health and wellbeing activities run by local charities, social enterprises and community groups near Sheffield Olympic Legacy Park.',
      who_can_apply:
        'Grassroots community organisations within a three-mile radius of Sheffield Olympic Legacy Park. Consortiums of more than one organisation may bid together for a larger grant, with one named lead applicant holding and accounting for the money.',
      typical_award: 'Up to £1,000 for one organisation, up to £5,000 for a consortium, spent within one year.',
      geographic_focus: 'A three-mile radius of Sheffield Olympic Legacy Park.',
      priorities:
        'Physical and mental health and wellbeing. The Foundation says it is particularly keen to see applications from organisations led by, or supporting, minoritised and marginalised communities in this area of Sheffield.',
      exclusions:
        'Organisations outside the three-mile radius. Groups previously funded cannot reapply until 12 months after the last award and the End of Grant report is complete.',
      decision_timeline:
        'Rolling and currently open. Roughly six weeks from a complete application to a response, so projects should start at least three months after applying.',
      how_to_apply:
        'Read the guidance notes and complete the application form. The form is available in a different format on request. A referee form and the SYCF due diligence note are linked from the fund page.',
      open_status: 'Open. Applications for the Sheffield Legacy Fund are open, with no fixed deadline.',
      funder_tips:
        'The geography is tight and it is the main filter: three miles from the Olympic Legacy Park, not Sheffield generally. The consortium route is the only way past £1,000 and is worth considering with neighbouring groups. Allow three months before the activity starts. ' + DUE_DILIGENCE,
      strong_application:
        'The fund says its priority is supporting all, or the majority, of an event or activity so the grant has real impact, which favours a bid that fully funds something small over one that part-funds something large.',
    },
    _file: '/tmp/sy-sheffield-legacy-fund.txt',
    _quote: 'Grassroots community organisations within a three-mile radius of Sheffield Olympic Legacy Park',
  },
  {
    title: 'Together we CAN Fund (Doncaster)',
    funder: "South Yorkshire's Community Foundation",
    funder_type: 'community_foundation',
    description:
      'A fund run by South Yorkshire’s Community Foundation on behalf of Citizens Advice Doncaster and the Community Advice Network for 2026/2027, supporting groups based in and benefiting the residents and communities of Doncaster with more resilient communities and the cost of living. Grants are up to £3,500 and the programme will support a minimum of four projects per round. The first round opens at 9am on Wednesday 9 September and closes at 9am on Monday 12 October 2026, with a local Doncaster panel meeting in early December and activity starting no earlier than 4 January 2027. A second round opens in late November for projects starting no earlier than 1 April 2027.',
    amount_min: 500, amount_max: 3500, max_org_income: 500000,
    deadline: '2026-10-12', is_rolling: false,
    is_local: true, location_tag: 'Doncaster',
    funding_type: 'grant', funding_subtypes: ['small_grant', 'restricted'],
    applicant_type: 'organisation',
    sectors: ['community', 'poverty', 'young people'],
    impact_sectors: ['community', 'financial', 'young_people'],
    target_beneficiaries: ['general_public', 'people_in_poverty'],
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated', 'cooperative'],
    eligibility_criteria: [
      'Not-for-profit group based in Doncaster, for projects benefiting Doncaster residents and communities',
      'MUST be a registered Community Advice Network member; applications are only considered from members, though you can register to join',
      'Maximum turnover of £500,000 in the latest financial year',
      'A group can hold only one grant through this programme at a time',
      'Activity should start no earlier than 4 January 2027, for projects lasting up to 12 months',
    ],
    apply_url: `${BASE}/together-we-can-fund`,
    funder_brief: {
      source: SOURCE,
      what_they_fund:
        'Community-led ideas rather than standard service delivery. Applications should meet one of the fund outcomes: people feel less isolated and more connected; young people are more confident, skilled and optimistic about their future; communities are stronger, kinder and more resilient; and residents actively contribute to improving their communities.',
      who_can_apply:
        'Not-for-profit groups based in Doncaster with a turnover no greater than £500,000 in the latest financial year, which are registered members of the Community Advice Network. Groups that are not members can register.',
      typical_award: 'Up to £3,500. The programme will support a minimum of four projects per round.',
      geographic_focus: 'Doncaster only.',
      priorities: 'More resilient communities and the cost of living, on behalf of Citizens Advice Doncaster and the Community Advice Network.',
      exclusions:
        'Groups that are not Community Advice Network members cannot be considered until they register. Turnover above £500,000. Holding another grant from this programme.',
      decision_timeline:
        'Round one opens 9am Wednesday 9 September 2026 and closes 9am Monday 12 October 2026. A local Doncaster panel meets in early December with decisions by email soon after. Round two opens in late November for projects starting no earlier than 1 April 2027.',
      how_to_apply:
        'Register with the Community Advice Network first if you are not already a member, then apply through SYCF. Groups may choose whichever round suits them but can hold only one grant from the programme.',
      open_status: 'Round one opens 9am on Wednesday 9 September 2026 and closes 9am on Monday 12 October 2026.',
      funder_tips:
        'The membership requirement is the trap: this fund is closed to you until you are a registered Community Advice Network member, and registering takes a separate form. Do that first. Note also that money cannot be spent until January 2027, so it does not solve an immediate need. ' + DUE_DILIGENCE,
      strong_application:
        'The fund explicitly asks for creative, community-led ideas rather than standard services, and names four outcomes. Pick one outcome and build the bid around it.',
    },
    _file: '/tmp/sy-together-we-can-fund.txt',
    _quote: 'Maximum turnover of £500,000 in the latest financial year.',
  },
]

function render(s: string) {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
}

function assertQuotes() {
  for (const r of ROWS) {
    const raw = fs.readFileSync(r._file, 'utf8')
    if (/TRUNCATED/.test(raw)) throw new Error(`${r.title}: buffer truncated`)
    if (/BOT WALL/.test(raw)) throw new Error(`${r.title}: buffer is a bot wall, not the page`)
    if (!render(raw).includes(render(r._quote))) throw new Error(`${r.title}: quote not in its page buffer:\n  ${r._quote}`)
  }
  console.log(`quote check: ${ROWS.length}/${ROWS.length} verbatim in their own fetched fund pages`)
}

function assertVocab() {
  let n = 0
  for (const r of ROWS) {
    for (const s of r.funding_subtypes as string[]) {
      if (!SUBTYPES_BY_FUNDING_TYPE.grant.includes(s as never)) throw new Error(`${r.title}: subtype "${s}" invalid`); n++
    }
    for (const s of r.eligible_structures as string[]) { if (!VALID_STRUCTURES.has(s)) throw new Error(`${r.title}: structure "${s}"`); n++ }
    for (const s of r.impact_sectors as string[]) { if (!VALID_SECTORS.has(s)) throw new Error(`${r.title}: sector "${s}"`); n++ }
    if ((r.impact_sectors as string[]).length > 4) throw new Error(`${r.title}: >4 impact_sectors`)
    // A row must be rolling or carry a future deadline; it cannot be neither.
    if (!r.is_rolling && !r.deadline) throw new Error(`${r.title}: not rolling and no deadline`)
    if (r.deadline && String(r.deadline) <= '2026-09-08') throw new Error(`${r.title}: deadline already passed`)
    const brief = r.funder_brief as Record<string, string>
    const want = ['what_they_fund', 'who_can_apply', 'typical_award', 'geographic_focus', 'priorities',
      'exclusions', 'decision_timeline', 'how_to_apply', 'open_status', 'funder_tips', 'strong_application']
    const missing = want.filter(k => !brief[k])
    if (missing.length) throw new Error(`${r.title}: brief missing ${missing.join(', ')}`)
    n += want.length
  }
  console.log(`vocabulary and depth check: ${n} values across ${ROWS.length} rows, every brief at 11 content keys`)
}

;(async () => {
  assertQuotes(); assertVocab()
  const now = new Date().toISOString()
  for (const r of ROWS) {
    const { _file, _quote, ...fields } = r
    const row = stampNewGrant({ ...fields, source: SOURCE, is_active: false, is_invite_only: false,
      amount_undisclosed: false, civil_society_relevant: true, url_status: 'ok', url_last_checked: now,
      first_seen_at: now, last_seen_at: now }, SOURCE as never)
    row.pipeline_state = 'tagged_awaiting_review'
    if (!APPLY) { console.log(`DRY  ${r.title}  £${r.amount_min ?? '-'}..${r.amount_max}  ${r.is_rolling ? 'rolling' : r.deadline}`); continue }
    const { data, error } = await db.from('scraped_grants').insert(row).select('id').single()
    if (error) { console.log(`FAIL ${r.title}: ${error.message}`); process.exitCode = 1; continue }
    console.log(`OK   ${data!.id}  ${r.title}`)
  }
})()

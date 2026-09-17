/**
 * Yorkshire community-foundation coverage, 8 September 2026.
 *
 * Two providers, both read from their own funding pages in this session:
 *   Leeds Community Foundation   https://www.leedscf.org.uk/open-grants/
 *   One Community (Kirklees)     https://one-community.org.uk/how-to-apply-for-funding-grants-available/
 *
 * Dedup ran provider-first over all 1,991 rows before this script was written.
 * Leeds CF holds 5 rows, one of them a live front door over these four funds.
 * One Community holds ZERO rows: "Kirklees", "Huddersfield" and "One Community"
 * all return nothing, so every row below is new.
 *
 * Everything stages hidden for Paul. Nothing here changes an existing row.
 */
import { createClient } from '@supabase/supabase-js'
import { stampNewGrant } from '../src/lib/grant-merge'
import { SUBTYPES_BY_FUNDING_TYPE } from '../src/lib/funding-subtypes'
import { VALID_SECTORS, VALID_STRUCTURES, VALID_FUNDING_TYPES } from '../src/lib/classify'
import * as fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
const envVar = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))![1].trim()
const db = createClient(envVar('NEXT_PUBLIC_SUPABASE_URL'), envVar('SUPABASE_SERVICE_ROLE_KEY'))

const SOURCE = 'system:cf-yorkshire-2026-09-08'
const APPLY = process.argv.includes('--apply')

type Staged = Record<string, unknown> & { title: string; quote: string }

const LEEDS = 'https://www.leedscf.org.uk/open-grants/'
const KIRKLEES = 'https://one-community.org.uk/how-to-apply-for-funding-grants-available/'

const LEEDS_EXCLUSIONS =
  'Activity and costs that have already taken place. Activity which might be regarded as discriminatory ' +
  'or which excludes some people without good justification. Activity that promotes a particular political ' +
  'or religious point of view. Activity primarily for the benefit of animals. Capital appeals for building ' +
  'projects. Grant-making to other organisations or individuals, and applications from individuals. ' +
  'Statutory organisations or activity. Overseas organisations, expeditions or overseas travel. ' +
  'For-profit, overseas and statutory organisations such as schools and hospitals are not eligible.'

const LEEDS_GOVERNANCE = [
  'A minimum of three unrelated trustees, committee members or directors, none registered as a Person with Significant Control',
  'A governing document with a dissolution clause or asset lock making the organisation fully not-for-profit',
  'A bank account in the organisation’s name with at least two unrelated signatories, and two signatories required for all transactions',
  'Financial accounts showing gross income, or an income and expenditure report if newly formed',
]

const KIRKLEES_ELIGIBILITY = [
  'Constituted community group or registered charity working in Kirklees',
  'You do not need to be a registered charity, but you must be constituted',
  'At least three unrelated trustees or directors',
  'A bank account in the organisation’s name with at least two unrelated signatories',
  'CICs and social enterprises must show clear social or charitable objectives and an asset lock',
  'Formal accounts for the most recent financial year, or a cash flow record if operating less than a year',
]

const KIRKLEES_EXCLUSIONS =
  'Applications are not accepted from a charity with qualified accounts, one under investigation by the ' +
  'Charity Commission, or one carrying an active regulatory warning on the Charity Commission website. ' +
  'Outstanding evaluations on any grant received from One Community in the past two years must be ' +
  'completed before the panel meets.'

const ROWS: Staged[] = [
  {
    title: 'The Hannah Corne Green Futures Fund',
    funder: 'Leeds Community Foundation',
    funder_type: 'community_foundation',
    description:
      'Leeds Community Foundation funds neighbourhood-based climate action projects in memory of its colleague Hannah Corne. It supports nature-friendly projects and activities that help the environment by reducing carbon, and asks that they be practical, inclusive and rooted in local neighbourhoods. Examples the funder gives include guided nature walks and outdoor wellbeing activities, bike repair sessions and cycle confidence work, initiatives that increase access to green spaces, repair and reuse schemes, and feasibility studies for green energy in community buildings. Grants are up to £2,000 for up to a year, with decisions in December 2026.',
    amount_min: null,
    amount_max: 2000,
    max_org_income: 150000,
    deadline: '2026-09-28',
    is_rolling: false,
    is_local: true,
    location_tag: 'Leeds',
    funding_type: 'grant',
    funding_subtypes: ['restricted', 'small_grant'],
    spend_restriction: 'restricted',
    applicant_type: 'organisation',
    sectors: ['environment', 'community'],
    impact_sectors: ['environment', 'community'],
    target_beneficiaries: ['general_public'],
    eligibility_criteria: [
      'The organisation and the activity must be based in Leeds',
      'Income under £150,000 in the last financial year',
      'The amount requested must be at least 50% of the total cost of the activity',
      'Only one application per organisation per round',
      'Small unincorporated and unregistered organisations may apply if income is under £10,000 and the grant would not take it above that',
      ...LEEDS_GOVERNANCE,
    ],
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated', 'cooperative'],
    apply_url: 'https://www.leedscf.org.uk/the-hannah-corne-green-futures-fund',
    funder_brief: {
      source: SOURCE,
      who_can_apply:
        'Incorporated not-for-profit organisations such as CIOs, CICs limited by guarantee and charitable companies, registered with the Charity Commission, Companies House or the FCA Mutuals Public Register. Registered charities that are not incorporated may apply but cannot use the grant for PAYE staff, only self-employed workers. Small unincorporated and unregistered organisations may apply where annual income is under £10,000.',
      exclusions: LEEDS_EXCLUSIONS,
      priorities:
        'Neighbourhood climate action in Leeds. The Foundation actively welcomes applications from, or benefitting, LGBTQIA+, racially minoritised, and d/Deaf or disabled people.',
      decision_timeline: 'Deadline 28 September 2026 at 12 noon, decisions December 2026.',
    },
    quote: 'Grant size up to £2,000 Location Leeds Duration up to 1 year Deadline 28/09/2026 at 12 noon Decisions December 2026',
  },
  {
    title: 'Jimbo’s Fund',
    funder: 'Leeds Community Foundation',
    funder_type: 'community_foundation',
    description:
      'Jimbo’s Fund was set up by local businessman Jimi Heselden to support people experiencing adversity in Leeds, and continues his legacy through support for community organisations. Applications need to set out how they address the needs of the people they support, and projects in LS8, LS9, LS14 and LS15 are prioritised. Past funded activity includes supporting asylum seekers with food and clothing, helping families access baby essentials such as cots and bedding, and street-level youth work for young people disengaged from mainstream services. Grants run from £1,000 to £10,000 over a fixed twelve months, with decisions in February 2027.',
    amount_min: 1000,
    amount_max: 10000,
    deadline: '2026-10-12',
    is_rolling: false,
    is_local: true,
    location_tag: 'Leeds',
    funding_type: 'grant',
    funding_subtypes: ['restricted'],
    spend_restriction: 'restricted',
    applicant_type: 'organisation',
    sectors: ['community', 'poverty', 'social welfare', 'young people'],
    impact_sectors: ['community', 'financial'],
    target_beneficiaries: ['general_public', 'people_in_poverty'],
    eligibility_criteria: [
      'The applicant must evidence a track record in Leeds and have been operating for at least 2 years',
      'Projects supporting people in LS8, LS9, LS14 and LS15 are prioritised',
      'The amount requested should be at least 50% of the total cost of the activity',
      'Only one application per organisation per round',
      'Grant holders who received a 3 year grant in 2025 are not eligible for this round',
      'For grants over £5,000 the applicant must be an incorporated not-for-profit or a registered charity; unincorporated groups can apply only for £5,000 or less',
      ...LEEDS_GOVERNANCE,
    ],
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated', 'cooperative'],
    apply_url: 'https://www.leedscf.org.uk/jimbos-fund',
    funder_brief: {
      source: SOURCE,
      who_can_apply:
        'For grants of £5,000 or less: incorporated not-for-profit organisations such as CIOs, CICs limited by guarantee and charitable companies; unincorporated registered charities, which cannot use the grant for PAYE staff; and small unincorporated or unregistered organisations with income under £10,000. For grants over £5,000 the unincorporated route closes and the applicant must be incorporated or a registered charity.',
      exclusions: LEEDS_EXCLUSIONS,
      priorities:
        'People overcoming adversity in Leeds, with priority for LS8, LS9, LS14 and LS15, and for organisations supporting people facing food and fuel poverty. The Foundation actively welcomes applications from, or benefitting, LGBTQIA+, racially minoritised, and d/Deaf or disabled people.',
      decision_timeline: 'Deadline 12 October 2026 at 12 noon, decisions February 2027.',
    },
    quote: 'Grant size £1,000 to £10,000 Location Leeds Duration 1 year (12 months fixed) Deadline 12/10/2026 at 12 noon Decisions February 2027',
  },
  {
    title: 'The Leeds Fund Small Grants',
    funder: 'Leeds Community Foundation',
    funder_type: 'community_foundation',
    description:
      'The Leeds Fund Small Grants are aimed at smaller Leeds-based community organisations that may not be able to access larger or microgrant programmes, and can part-fund or fully fund a range of activities. The funder gives organisational development, one-off projects or expansion of existing activity, training for staff and volunteers, policy and process development, employability programmes and consultations as examples, and gives priority to applications that develop organisational resilience. This fund sits above the Microgrants: it is for organisations with an income over £75,000 and under £150,000. Grants are up to £5,000 for up to a year, with decisions in February 2027.',
    amount_min: null,
    amount_max: 5000,
    min_org_income: 75000,
    max_org_income: 150000,
    deadline: '2026-10-20',
    is_rolling: false,
    is_local: true,
    location_tag: 'Leeds',
    funding_type: 'grant',
    funding_subtypes: ['restricted', 'unrestricted', 'small_grant'],
    applicant_type: 'organisation',
    sectors: ['community', 'social welfare'],
    impact_sectors: ['community'],
    target_beneficiaries: ['general_public'],
    eligibility_criteria: [
      'Income over £75,000 and under £150,000 in the most recent financial year; smaller organisations should apply for The Leeds Fund Microgrants instead',
      'Activity must be based in Leeds, and the applicant based in or with a demonstrable connection to Leeds communities',
      'Only one application per organisation per round',
      'The applicant must be constituted; unconstituted groups should apply for a Microgrant',
      'Priority is given to organisations established in the last 5 years',
      ...LEEDS_GOVERNANCE,
    ],
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'cooperative'],
    apply_url: 'https://www.leedscf.org.uk/the-leeds-fund-small-grants',
    funder_brief: {
      source: SOURCE,
      who_can_apply:
        'Constituted organisations in Leeds with an income over £75,000 and under £150,000: incorporated not-for-profits such as CIOs, CICs limited by guarantee and charitable companies, and registered charities that are not incorporated, which cannot use the grant for PAYE staff. Unconstituted groups are directed to the Microgrants instead.',
      exclusions: LEEDS_EXCLUSIONS,
      priorities:
        'Organisational resilience and capacity for midsize Leeds organisations. At least 20% of the fund is planned for applications supporting LGBTQIA+, racially minoritised, and d/Deaf or disabled communities.',
      decision_timeline: 'Deadline 20 October 2026 at 12 noon, decisions February 2027.',
    },
    quote: 'Grant size Up to £5,000 Location Leeds Duration Up to 1 year Deadline 20/10/2026 at 12 noon Decisions February 2027',
  },
  {
    title: 'The Leeds Fund Microgrants',
    funder: 'Leeds Community Foundation',
    funder_type: 'community_foundation',
    description:
      'The Leeds Fund Microgrants are aimed at small and emerging Leeds-based community organisations or groups that may not be able to access larger grant programmes, and can part-fund or fully fund a range of activities. The funder gives organisational development, one-off projects or expansion of existing activity, training for staff and volunteers, policy and process development, employability programmes and consultations as examples, and gives priority to applications that develop organisational resilience. Grants are up to £2,500 for formally constituted organisations and up to £500 for informal unconstituted groups, for up to a year, with decisions in February 2027.',
    amount_min: null,
    amount_max: 2500,
    max_org_income: 75000,
    deadline: '2026-10-20',
    is_rolling: false,
    is_local: true,
    location_tag: 'Leeds',
    funding_type: 'grant',
    funding_subtypes: ['restricted', 'unrestricted', 'small_grant'],
    applicant_type: 'organisation',
    sectors: ['community', 'social welfare'],
    impact_sectors: ['community'],
    target_beneficiaries: ['general_public'],
    eligibility_criteria: [
      'Income under £75,000 in the most recent financial year',
      'Up to £500 for informal, unconstituted groups; up to £2,500 for formally constituted organisations',
      'Activity must be based in Leeds, and the applicant based in or with a demonstrable connection to Leeds communities',
      'Only one application per organisation or group per round',
      'Priority is given to organisations established in the last 5 years',
      'Groups without a constitution need at least 3 members and an annual income under £10,000',
      ...LEEDS_GOVERNANCE,
    ],
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated', 'cooperative'],
    apply_url: 'https://www.leedscf.org.uk/the-leeds-fund-microgrants',
    funder_brief: {
      source: SOURCE,
      who_can_apply:
        'Leeds organisations with an income under £75,000. Up to £2,500 for incorporated not-for-profits such as CIOs, CICs limited by guarantee and charitable companies, and for small unincorporated organisations with income under £10,000. Up to £500 for informal groups without a constitution that have at least 3 members and an annual income under £10,000.',
      exclusions: LEEDS_EXCLUSIONS,
      priorities:
        'Small and emerging Leeds organisations, and organisational resilience. At least 20% of the fund is planned for applications supporting LGBTQIA+, racially minoritised, and d/Deaf or disabled communities.',
      decision_timeline: 'Deadline 20 October 2026 at 12 noon, decisions February 2027.',
    },
    quote: 'Grant size Up to £2,500 | Up to £500 for unconstituted groups Location Leeds Duration Up to 1 year Deadline 20/10/2026 at 12 noon Decisions February 2027',
  },
  {
    title: 'Crisis and Resilience Fund (Kirklees), Round Two',
    funder: 'One Community Foundation',
    funder_type: 'community_foundation',
    description:
      'Kirklees Council funding administered and distributed by One Community Foundation, awarded to VCSE organisations in Kirklees for activity that strengthens partnership working, referral pathways and the accessibility of local support. The funder describes the aim as making the local support system work better together so residents can access help faster, more consistently, and without falling through gaps. Four support categories cover community coordination and partnership working, referral pathways and access to support, community infrastructure and capability, and community insight, learning and co-production, and other activity that strengthens the local support landscape is also welcome. Round two runs from 24 August to 2 October 2026, with grants of £2,000 to £10,000. All funds must be spent and monitoring returned by 20 March 2027, and late or incorrect monitoring is recorded against future applications.',
    amount_min: 2000,
    amount_max: 10000,
    deadline: '2026-10-02',
    is_rolling: false,
    is_local: true,
    location_tag: 'Kirklees',
    funding_type: 'grant',
    funding_subtypes: ['restricted'],
    spend_restriction: 'restricted',
    applicant_type: 'organisation',
    sectors: ['community', 'social welfare'],
    impact_sectors: ['community'],
    target_beneficiaries: ['general_public'],
    eligibility_criteria: [
      'VCSE organisation in Kirklees',
      'Groups can apply into both 2026 rounds, whether or not they were successful in the first',
      'All funds must be spent and monitoring returned by 20 March 2027',
      ...KIRKLEES_ELIGIBILITY,
    ],
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated', 'cooperative'],
    apply_url: KIRKLEES,
    funder_brief: {
      source: SOURCE,
      who_can_apply:
        'VCSE organisations in Kirklees. Applicants do not need to be registered charities but must be constituted community groups with at least three unrelated trustees or directors and a bank account in the organisation’s name with two unrelated signatories. CICs and social enterprises need clear social or charitable objectives and an asset lock.',
      exclusions: KIRKLEES_EXCLUSIONS,
      priorities:
        'Community coordination in Kirklees: partnership working, referral pathways and access to support, community infrastructure and capability, and community insight, learning and co-production.',
      decision_timeline: 'Closes 2 October 2026. Spend and monitoring complete by 20 March 2027.',
      how_to_apply:
        'Apply through the CRF application form linked from the One Community grants page. The application pack and the Kirklees Council MI monitoring form are downloadable there.',
    },
    quote: 'CRF 2026 Round Two: Applications open: Monday 24th August 2026 Applications close: Friday 2nd October 2026 Grant amount: £2,000 – £10,000',
  },
  {
    title: 'Community Grants Programme (Kirklees), Round 11',
    funder: 'One Community Foundation',
    funder_type: 'community_foundation',
    description:
      'One Community Foundation pools a group of Kirklees funds into a single Community Grants Programme, considered together by one grants panel. The funds include JL Brierley, Hazel Charlesworth, Judith and Neil Charlesworth, Kirklees Community Fund, Stephen Wood Fund, Kirklees General Fund, Kirklees Police Fund, One Kirklees Parish Fund, Accept Cards Fund and the Heckmondwike Funds. Community projects and registered local charities can apply for up to £3,000, and all of the funds will consider applications for any purpose including core costs, project costs, and increased costs such as utilities from the cost-of-living crisis. Round 11 opens on 21 September 2026 and closes on 6 November 2026, with three further rounds announced for 2027.',
    amount_min: null,
    amount_max: 3000,
    deadline: '2026-11-06',
    next_open_date: '2026-09-21',
    is_rolling: false,
    is_local: true,
    location_tag: 'Kirklees',
    funding_type: 'grant',
    funding_subtypes: ['unrestricted', 'restricted', 'small_grant'],
    spend_restriction: 'unrestricted',
    applicant_type: 'organisation',
    sectors: ['community', 'social welfare'],
    impact_sectors: ['community'],
    target_beneficiaries: ['general_public'],
    eligibility_criteria: [
      'Community project or registered local charity in Kirklees',
      'Applications are accepted for any purpose including core costs and increased costs such as utilities',
      ...KIRKLEES_ELIGIBILITY,
    ],
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated', 'cooperative'],
    apply_url: KIRKLEES,
    funder_brief: {
      source: SOURCE,
      who_can_apply:
        'Community projects and registered local charities in Kirklees. Applicants do not need to be registered charities but must be constituted community groups with at least three unrelated trustees or directors and a bank account in the organisation’s name with two unrelated signatories. CICs and social enterprises need clear social or charitable objectives and an asset lock.',
      exclusions: KIRKLEES_EXCLUSIONS,
      priorities:
        'General community benefit across Kirklees. Unusually for a small grants programme, every fund in the pool will consider core costs as well as project costs.',
      decision_timeline: 'Round 11 opens 21 September 2026 and closes 6 November 2026. Three further rounds are announced for 2027.',
      open_status: 'Between rounds until 21 September 2026.',
    },
    quote: 'Round 11: Opens: Monday 21st September 2026 Closes: Friday 6th November 2026',
  },
]

// Guard: every quote must appear verbatim in the page buffer it claims to come
// from. This is the check that would have caught the SSE figures on 8 September.
function assertQuotesArePresent() {
  // The reader leaves numeric HTML entities undecoded, so the page buffer holds
  // "&#8211;" where a reader sees an en dash. Decode on the PAGE side only: the
  // quote still has to match what the page renders, the check is not loosened.
  const render = (s: string) =>
    s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
     .replace(/&nbsp;/g, ' ')
     .replace(/&amp;/g, '&')
     .replace(/\s+/g, ' ')
  const pages: Record<string, string> = {
    [LEEDS]: render(fs.readFileSync('/tmp/leeds.txt', 'utf8')),
    [KIRKLEES]: render(fs.readFileSync('/tmp/occ.txt', 'utf8')),
  }
  for (const [url, text] of Object.entries(pages)) {
    if (/TRUNCATED/.test(text)) throw new Error(`${url}: buffer is truncated, cannot prove absence or presence`)
  }
  for (const r of ROWS) {
    const page = String(r.apply_url).includes('leedscf') ? pages[LEEDS] : pages[KIRKLEES]
    const needle = r.quote.replace(/\s+/g, ' ')
    if (!page.includes(needle)) throw new Error(`${r.title}: quote not found in the page buffer:\n  ${needle}`)
  }
  console.log(`quote check: ${ROWS.length}/${ROWS.length} found verbatim in the fetched pages`)
}

// Guard: every controlled-vocabulary value has to be in its vocabulary. The
// vocabularies are per funding_type, so a programme-only subtype on a grant row
// is caught here rather than in Find Funding.
const BENEFICIARIES = new Set([
  'children', 'young_people', 'older_people', 'women', 'lgbtq', 'disabled_people',
  'refugees_migrants', 'bame_communities', 'homeless_people', 'ex_offenders',
  'carers', 'people_in_poverty', 'rural_communities', 'general_public',
])

function assertVocabularies() {
  let checked = 0
  for (const r of ROWS) {
    const ft = String(r.funding_type)
    if (!VALID_FUNDING_TYPES.has(ft)) throw new Error(`${r.title}: funding_type "${ft}" is not valid`)
    const allowed = SUBTYPES_BY_FUNDING_TYPE[ft as keyof typeof SUBTYPES_BY_FUNDING_TYPE]
    for (const st of (r.funding_subtypes as string[]) ?? []) {
      if (!allowed.includes(st as never)) throw new Error(`${r.title}: subtype "${st}" is not valid for funding_type "${ft}"`)
      checked++
    }
    for (const st of (r.eligible_structures as string[]) ?? []) {
      if (!VALID_STRUCTURES.has(st)) throw new Error(`${r.title}: structure "${st}" is not valid`)
      checked++
    }
    for (const sec of (r.impact_sectors as string[]) ?? []) {
      if (!VALID_SECTORS.has(sec)) throw new Error(`${r.title}: impact_sector "${sec}" is not valid`)
      checked++
    }
    if ((r.impact_sectors as string[]).length > 4) throw new Error(`${r.title}: more than 4 impact_sectors, the classifier truncates`)
    for (const b of (r.target_beneficiaries as string[]) ?? []) {
      if (!BENEFICIARIES.has(b)) throw new Error(`${r.title}: beneficiary "${b}" is not valid`)
      checked++
    }
    // An income band that excludes everybody is a data error, not a filter.
    const lo = r.min_org_income as number | undefined, hi = r.max_org_income as number | undefined
    if (lo != null && hi != null && lo >= hi) throw new Error(`${r.title}: income band ${lo}..${hi} is empty`)
  }
  console.log(`vocabulary check: ${checked} values across ${ROWS.length} rows, all in vocabulary`)
}

;(async () => {
  assertQuotesArePresent()
  assertVocabularies()

  for (const r of ROWS) {
    const { quote, ...fields } = r
    const row = stampNewGrant(
      {
        ...fields,
        source: SOURCE,
        is_active: false,
        is_invite_only: false,
        amount_undisclosed: false,
        civil_society_relevant: true,
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      },
      SOURCE as never,
    )
    row.pipeline_state = 'tagged_awaiting_review'

    if (!APPLY) {
      console.log(`DRY  ${r.funder} — ${r.title}  £${r.amount_min ?? '?'}–${r.amount_max}  ${r.deadline}`)
      console.log(`     ${r.apply_url}`)
      continue
    }
    const { data, error } = await db.from('scraped_grants').insert(row).select('id').single()
    if (error) { console.log(`FAIL ${r.title}: ${error.message}`); process.exitCode = 1; continue }
    console.log(`OK   ${data!.id}  ${r.funder} — ${r.title}`)
  }
})()

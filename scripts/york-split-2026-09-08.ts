/**
 * Split the York Community Fund front-door row into its two real tiers.
 * Paul approved the split on 8 September 2026.
 *
 * Why. The single row carried deadline 2026-10-12 and amount_max £13,500. Both
 * are true of the fund, but they belong to DIFFERENT tiers, and combining them
 * hides the gate that actually bites: the £13,500 Connect & Grow tier closes to
 * expressions of interest at noon on Monday 14 September 2026. 12 October is
 * only the deadline for those already shortlisted. A York fundraiser reading the
 * row correctly would still be locked out of the larger grant, because no alert,
 * calendar marker or urgency colour fires on a date held in prose.
 *
 * SOURCE OF EVIDENCE, stated plainly: the fund page was read in Chrome on
 * 8 September 2026, because tworidingscf.org.uk bot-walls scripted fetches but
 * serves the browser normally. The quotes below are from that browser read. That
 * means the usual "quote must appear in a fetched buffer" guard CANNOT run here
 * without checking my own transcription against itself, so it is not run and not
 * faked. The check that does hold is external: reopen
 * https://tworidingscf.org.uk/fund/york-community-fund/ in a browser.
 *
 * Both rows stay live and published. Splitting one visible row into two and
 * hiding half would remove the Micro Grants tier from York users entirely,
 * which is the opposite of the point.
 */
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { SUBTYPES_BY_FUNDING_TYPE } from '../src/lib/funding-subtypes'
import { VALID_SECTORS, VALID_STRUCTURES } from '../src/lib/classify'
import * as fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
const envVar = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))![1].trim()
const db = createClient(envVar('NEXT_PUBLIC_SUPABASE_URL'), envVar('SUPABASE_SERVICE_ROLE_KEY'))

const SOURCE = 'user_verified:york-split-2026-09-08'
const APPLY = process.argv.includes('--apply')
const EXISTING = '88fd8569-c9e4-4973-b69f-b85a31425e0c'
const URL = 'https://tworidingscf.org.uk/fund/york-community-fund/'

// Shared between both tiers, straight from the page.
const PRIORITIES =
  'Affordability and cost of living, climate action, equalities and human rights, and health and wellbeing. ' +
  'The fund is particularly interested in resourcing leadership time for reflection, learning and planning; ' +
  'applications where people with lived experience of the issues help design the project or run the ' +
  'organisation; resourcing unpopular causes that struggle to attract funding; and organisations tackling ' +
  'the root causes of these issues.'

const WHO =
  'Organisations with a turnover under £500,000 with charitable aims, based in and serving the residents of ' +
  'the City of York. Decisions are made by a community panel drawn from York residents through a ' +
  'participatory process. Organisations with significantly high reserves that could reasonably be used for ' +
  'the proposed activity are unlikely to be funded.'

const COMMON_ELIGIBILITY = [
  'Turnover under £500,000',
  'Based in and serving the residents of the City of York',
  'Charitable aims',
  'Applicants may apply for a Micro Grant, a Connect and Grow Grant, or both',
]

// ── Tier 1: the existing row becomes Connect & Grow ──────────────────────────
const CONNECT_AND_GROW = {
  title: 'York Community Fund: Connect and Grow Grants',
  description:
    'The larger of the two York Community Fund tiers, run in partnership between Two Ridings Community ' +
    'Foundation, City of York Council, Joseph Rowntree Foundation, York CVS and York Together. Connect and ' +
    'Grow grants are up to £13,500 spent over two years, and the fund expects to make around ten of them. ' +
    'They are aimed at giving community leaders time to reflect, learn, plan and explore new ways of working, ' +
    'rather than at day to day delivery. Applications are decided by a community panel of York residents. ' +
    'Note the two-stage process: an expression of interest must be submitted by noon on Monday 14 September ' +
    '2026, and only shortlisted applicants go on to the full application deadline of noon on Monday 12 ' +
    'October 2026.',
  amount_min: null,
  amount_max: 13500,
  deadline: '2026-09-14',
  is_rolling: false,
  funding_subtypes: ['restricted'],
  eligibility_criteria: [
    ...COMMON_ELIGIBILITY,
    'An expression of interest is required first, by noon on Monday 14 September 2026',
    'Only shortlisted applicants proceed to the full application, due noon on Monday 12 October 2026',
    'Funding is for organisational development and leadership time, not day to day delivery',
  ],
  funder_brief: {
    source: SOURCE,
    who_can_apply: WHO,
    priorities: PRIORITIES,
    typical_award: 'Up to £13,500 spent over 2 years. The fund expects to make approximately 10 of these grants.',
    decision_timeline:
      'Expression of interest deadline noon Monday 14 September 2026. If shortlisted, full application ' +
      'deadline noon Monday 12 October 2026. Decisions are made by a community panel after the application deadline.',
    how_to_apply:
      'Read the Connect and Grow Grant Guidance Notes 2026, then submit an expression of interest before ' +
      'noon on 14 September 2026. If shortlisted you will be sent the full application. Supporting documents ' +
      'can be attached online or emailed to the funder.',
    open_status: 'Open for expressions of interest until noon on 14 September 2026.',
    _quote: 'Connect & Grow Grants: Expression of Interest deadline – noon on Monday 14th September 2026.',
  },
}

// ── Tier 2: a new sibling row for the Micro Grants ───────────────────────────
const MICRO = {
  external_id: 'two_ridings_cf_york-community-fund-micro',
  source: SOURCE,
  title: 'York Community Fund: Micro Grants',
  funder: 'Two Ridings Community Foundation',
  funder_type: 'community_foundation',
  description:
    'The smaller of the two York Community Fund tiers, run in partnership between Two Ridings Community ' +
    'Foundation, City of York Council, Joseph Rowntree Foundation, York CVS and York Together. Micro Grants ' +
    'are up to £1,000 spent over twelve months, and the fund expects to make around twenty of them. They are ' +
    'meant to fill gaps in local provision where a small amount of money makes a significant difference. ' +
    'Applications are decided by a community panel of York residents, and there is no expression of interest ' +
    'stage: apply directly by noon on Monday 12 October 2026. Where the fund is oversubscribed, priority may ' +
    'go to groups that applied only for a Micro Grant rather than for both tiers.',
  amount_min: null,
  amount_max: 1000,
  max_org_income: 500000,
  deadline: '2026-10-12',
  is_rolling: false,
  is_local: true,
  location_tag: 'York',
  apply_url: URL,
  funding_type: 'grant',
  funding_subtypes: ['small_grant'],
  applicant_type: 'organisation',
  is_invite_only: false,
  amount_undisclosed: false,
  civil_society_relevant: true,
  sectors: ['community', 'social welfare', 'environment'],
  impact_sectors: ['community', 'environment', 'health', 'financial'],
  target_beneficiaries: ['general_public', 'people_in_poverty'],
  eligible_structures: ['ltd_guarantee', 'cic_guarantee', 'cooperative', 'unincorporated', 'registered_charity', 'cio'],
  eligibility_criteria: [
    ...COMMON_ELIGIBILITY,
    'No expression of interest stage; apply directly by noon on Monday 12 October 2026',
    'If oversubscribed, priority may be given to groups applying only for a Micro Grant rather than both tiers',
  ],
  funder_brief: {
    source: SOURCE,
    who_can_apply: WHO,
    priorities: PRIORITIES,
    typical_award: 'Up to £1,000 spent over 12 months. The fund expects to make approximately 20 of these grants.',
    decision_timeline:
      'Applications deadline noon Monday 12 October 2026. Decisions are made by a community panel after the deadline.',
    how_to_apply:
      'Read the Micro Grant Guidance Notes 2026, then apply online. Supporting documents can be attached ' +
      'online or emailed to the funder.',
    open_status: 'Open until noon on 12 October 2026.',
    _quote: 'Micro Grants Apply for up to £1,000 spent over 12-months (we expect to fund approximately 20 grants)',
  },
}

function assertVocabularies() {
  let n = 0
  for (const [label, subtypes, structures, sectors] of [
    ['Connect and Grow', CONNECT_AND_GROW.funding_subtypes, null, null],
    ['Micro', MICRO.funding_subtypes, MICRO.eligible_structures, MICRO.impact_sectors],
  ] as [string, string[], string[] | null, string[] | null][]) {
    for (const st of subtypes) {
      if (!SUBTYPES_BY_FUNDING_TYPE.grant.includes(st as never)) throw new Error(`${label}: subtype "${st}" invalid for a grant`)
      n++
    }
    for (const s of structures ?? []) { if (!VALID_STRUCTURES.has(s)) throw new Error(`${label}: structure "${s}" invalid`); n++ }
    for (const s of sectors ?? []) { if (!VALID_SECTORS.has(s)) throw new Error(`${label}: sector "${s}" invalid`); n++ }
    if ((sectors ?? []).length > 4) throw new Error(`${label}: more than 4 impact_sectors`)
  }
  console.log(`vocabulary check: ${n} values valid`)
}

// The split must not silently change what a user can see beyond the two tiers.
async function assertEndState() {
  const { data } = await db.from('scraped_grants')
    .select('id,title,is_active,pipeline_state,deadline,amount_max')
    .eq('apply_url', URL)
  const rows = data ?? []
  if (rows.length !== 2) throw new Error(`expected exactly 2 rows on this URL after the split, found ${rows.length}`)
  const live = rows.filter(r => r.is_active && r.pipeline_state === 'published')
  if (live.length !== 2) throw new Error(`expected both rows live and published, got ${live.length}`)
  const deadlines = rows.map(r => r.deadline).sort()
  if (deadlines[0] !== '2026-09-14' || deadlines[1] !== '2026-10-12')
    throw new Error(`deadlines wrong: ${deadlines.join(', ')}`)
  console.log('end-state check: 2 rows, both live, deadlines 2026-09-14 and 2026-10-12')
  for (const r of rows) console.log(`   ${r.title}  £..${r.amount_max}  ${r.deadline}`)
}

;(async () => {
  assertVocabularies()

  const { data: before } = await db.from('scraped_grants')
    .select('is_active,pipeline_state,field_provenance').eq('id', EXISTING).single()
  const fp = (before as { field_provenance: Record<string, { pinned?: boolean }> }).field_provenance ?? {}
  const pinned = Object.keys(CONNECT_AND_GROW).filter(k => fp[k]?.pinned)
  if (pinned.length) throw new Error(`would write PINNED field(s) ${pinned.join(', ')}. Stop and report instead.`)

  if (!APPLY) {
    console.log(`\nDRY RUN`)
    console.log(`  update ${EXISTING} -> "${CONNECT_AND_GROW.title}"  £..${CONNECT_AND_GROW.amount_max}  deadline ${CONNECT_AND_GROW.deadline}`)
    console.log(`  insert new row     -> "${MICRO.title}"  £..${MICRO.amount_max}  deadline ${MICRO.deadline}`)
    return
  }

  const res = await mergeGrantUpdate({ id: EXISTING, fields: CONNECT_AND_GROW, source: SOURCE as never, db })
  console.log(`applied: ${res.applied.join(', ')}`)
  if (res.rejected.length) console.log(`REJECTED by the trust ladder: ${JSON.stringify(res.rejected)}`)

  const after = await db.from('scraped_grants').select('is_active,pipeline_state').eq('id', EXISTING).single()
  const b = before as { is_active: boolean; pipeline_state: string }
  const a = after.data as { is_active: boolean; pipeline_state: string }
  if (a.is_active !== b.is_active || a.pipeline_state !== b.pipeline_state)
    throw new Error(`state moved on the existing row: ${b.is_active}/${b.pipeline_state} -> ${a.is_active}/${a.pipeline_state}`)

  const prov: Record<string, unknown> = {}
  for (const k of Object.keys(MICRO)) prov[k] = { source: SOURCE, set_at: new Date().toISOString(), pinned: false }
  const { data: ins, error } = await db.from('scraped_grants')
    .insert({ ...MICRO, is_active: true, pipeline_state: 'published', field_provenance: prov,
              first_seen_at: new Date().toISOString(), last_seen_at: new Date().toISOString() })
    .select('id').single()
  if (error) throw new Error(`insert failed: ${error.message}`)
  console.log(`inserted ${ins!.id}  ${MICRO.title}`)

  await assertEndState()
})()

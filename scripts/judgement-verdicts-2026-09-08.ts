// Paul, 8 Sept 2026, on the eight "Needs your judgement" verdicts:
// "1. yes 2. yes 3. [no answer] 4. yes 5. no relevant 6. yes 7. yes 8. yes -
// can you make sure the ones we keep are enriched properly".
// Pages read 8 Sept by direct fetch (Sutton from the engine's 16 Aug read; the
// council site returns an empty 202 to us). No model call.
//
//   npx tsx --env-file=.env.local scripts/judgement-verdicts-2026-09-08.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'

const APPLY = process.argv.includes('--apply')
const SRC = 'user_verified:judgement-2026-09-08'
const PAUL = 'admin:paulkilty1@gmail.com'
const TODAY = '2026-09-08'
type Op = { id: string; label: string; source?: string; fields: Record<string, unknown>; mergeBrief?: boolean }

const ops: Op[] = [
  // 1. Macmillan Q Lab: £75,000 is per team. Publish; closes 14 September.
  { id: '96c68ed0', label: 'Macmillan Q Lab', fields: {
    is_active: true, amount_min: 75000, amount_max: 75000, deadline: '2026-09-14', is_rolling: false, location_tag: 'UK', is_local: false,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['health', 'social_innovation', 'community'], target_beneficiaries: ['people_in_poverty', 'general_public'],
    description: 'A nine-month innovation lab run by Macmillan Cancer Support with Q, asking how holistic cancer care can be brought closer to people\'s homes. Teams of at least one community organisation and one public sector organisation receive £75,000, workshops, peer learning and design coaching from December 2026 to September 2027. Team applications close 14 September 2026.',
    funder_brief: {
      source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Teams based in the UK made up of at least one community organisation and one public sector organisation working together, with senior leadership sponsorship, people with lived experience of cancer on the team or a plan to include them, and a host organisation able to receive and distribute the funds. Individuals with lived, caring or professional experience of cancer can apply separately as contributors by 7 October 2026.',
      what_they_fund: 'Participation in Macmillan Q Lab: nine months of workshops, facilitated peer learning and coaching on a design process, with access to Q and Macmillan expertise, to design ways of delivering holistic cancer care closer to home for people having the worst experiences, often in the most under-served communities.',
      typical_award: '£75,000 per team to support the team through the nine-month process.',
      exclusions: 'Teams without both a community organisation and a public sector organisation. Organisations outside the UK. Teams unable to commit from December 2026 to September 2027.',
      priorities: 'Neighbourhood-led cancer care and care closer to home; curiosity and willingness to challenge the status quo; collaboration across systems and regions; involvement of people with lived experience.',
      decision_timeline: 'Team applications close 14 September 2026. Contributor applications close Wednesday 7 October 2026. The Lab runs December 2026 to September 2027.',
      how_to_apply: 'Take the eligibility quiz on the Q Lab page, read the information pack, application guidance and grant agreement, draft answers in the Word form, then submit through the online form.',
      funder_tips: 'The host organisation must be able to pass money on to the other organisations in the team, so name a host with that capacity. A webinar recording from 5 August is on YouTube via the page.',
      strong_application: 'Existing work on neighbourhood-led cancer care, a credible team spanning community and public sector, senior sponsorship, and a plan for lived-experience involvement.',
      geographic_focus: 'UK-wide, including the devolved nations.',
    },
  } },

  // 2. Step Change: next closing date 30 October 2026. Paul's own pins on the
  // timing fields, so written at his trust on his yes.
  { id: '3b2b8d07', label: 'Step Change (Oxfordshire CF)', source: PAUL, mergeBrief: true, fields: {
    is_active: true, deadline: '2026-10-30', is_rolling: false,
    deadline_cycle: [
      { day: 12, month: 6, label: 'Closing date, midday (panel 8 July)' },
      { day: 4, month: 9, label: 'Closing date, midday (panel 30 September)' },
      { day: 30, month: 10, label: 'Closing date, midday (panel 25 November)' },
    ],
    impact_sectors: ['community', 'social_economy'], target_beneficiaries: ['people_in_poverty', 'general_public'],
    funder_brief: { last_enriched: TODAY, open_status: 'open',
      exclusions: 'National charities or their financially integrated branches. Public bodies and statutory organisations including parish and town councils. Charities whose beneficiaries are primarily animals. Individuals. Purchase of buses or other vehicles. Costs already incurred or committed. Organisations rejected for a Step Change grant in the last 12 months.',
      decision_timeline: 'Closing dates at midday: 12 June, 4 September and 30 October 2026, with the grants panel about four weeks after each. The next closing date is Friday 30 October 2026, panel Wednesday 25 November.' },
  } },

  // 4. CLA Charitable Trust: closed for 2026, reopens December or January.
  // Tags reverted to what the 2025 grants list shows: care farms, outdoor
  // education and therapeutic horticulture for disabled and disadvantaged
  // people, not urban greening or STEM.
  { id: '3d957bb8', label: 'CLA Charitable Trust', mergeBrief: true, fields: {
    pipeline_state: 'between_rounds_scheduled', deadline: null, next_open_date: '2026-12-01',
    impact_sectors: ['environment', 'education', 'mental_health', 'disability'],
    target_beneficiaries: ['young_people', 'children', 'disabled_people', 'families'],
    niche_tags: ['outdoor_education', 'therapeutic_horticulture'],
    funder_brief: { last_enriched: TODAY, open_status: 'between_rounds',
      typical_award: '£2,500 to £5,000, and most 2025 grants were £5,000: care farms, community gardens, forest school training, countryside residentials and outdoor programmes for children, young people and adults with disabilities or mental health needs.',
      decision_timeline: 'Not accepting further applications in 2026. The Trust expects to reopen in December 2026 or January 2027 for its 2027 grant-making. The 2026 cycle ran an expression of interest from 7 to 27 July with full applications by 24 August for an October round.' },
  } },

  // 5. Rusholme Wind Farm Fund: Paul, "no relevant".
  { id: '14469b5f', label: 'Rusholme Wind Farm Fund', source: PAUL, fields: {
    is_active: false, pipeline_state: 'rejected',
    rejection_reason: formatRejectReason('out_of_scope', 'Paul, 8 Sept 2026: not relevant. A community benefit fund for four parishes around one wind farm (Airmyn, Drax, Long Drax, Newland)'),
  } },

  // 6. Postcode Society Trust: all 2026 rounds closed, 2027 dates in the new year.
  { id: 'ec676c7f', label: 'Postcode Society Trust', mergeBrief: true, fields: {
    pipeline_state: 'between_rounds_scheduled', deadline: null, next_open_date: 'Early 2027',
    funder_brief: { last_enriched: TODAY, open_status: 'between_rounds',
      decision_timeline: 'Three rounds a year, each open for nine days. All 2026 rounds are closed (they closed 2 March, 2 June and 1 September). The Trust says 2027 round dates will be published in the new year.' },
  } },

  // 7. Sutton Neighbourhood Fund 2026: window closed for the year; annual.
  { id: '3d26a26e', label: 'Sutton Neighbourhood Fund', mergeBrief: true, fields: {
    is_active: false, deadline: null, next_open_date: 'Spring 2027 (annual; the 2026 window has closed)',
    funder_brief: { last_enriched: TODAY, open_status: 'between_rounds',
      decision_timeline: 'The 2026 project submission window is closed. The council is assessing submissions and publishing the list to each Local Committee area for the autumn committee cycle, then releasing funds. The fund runs once a year.' },
  } },

  // 8. Angels' Den 2026: the pitch event is 9 September; the round is over.
  { id: 'cbad88ec', label: 'Angels\' Den 2026', source: PAUL, fields: {
    is_active: false, pipeline_state: 'rejected',
    rejection_reason: formatRejectReason('historical_deadline', 'Applications closed 11 May 2026 and the ten charities pitch on 9 September 2026. A dated one-off; a 2027 edition gets its own row if it runs'),
  } },
]

async function main() {
  const db = getAdminDb()
  const ids = ops.map(o => o.id)
  const { data: rows, error } = await db.from('scraped_grants').select('id, title, pipeline_state, funder_brief')
    .in('pipeline_state', ['captured', 'enriched', 'tagged', 'tagged_awaiting_review', 'published', 'between_rounds_scheduled', 'rejected']).limit(3000)
  if (error) { console.error(error.message); process.exit(1) }
  const byPrefix = new Map((rows ?? []).filter(r => ids.includes(r.id.slice(0, 8))).map(r => [r.id.slice(0, 8), r]))
  if (byPrefix.size !== ids.length) { console.error(`expected ${ids.length} rows, found ${byPrefix.size}`); process.exit(1) }
  for (const op of ops) {
    const row = byPrefix.get(op.id)!
    const fields = { ...op.fields }
    if (op.mergeBrief) fields.funder_brief = { ...(row.funder_brief ?? {}), ...(op.fields.funder_brief as object) }
    console.log(`\n== ${op.id} ${op.label} [${row.pipeline_state}]\n   ${Object.keys(fields).join(', ')}`)
    if (!APPLY) continue
    const r = await mergeGrantUpdate({ id: row.id, source: op.source ?? SRC, db, fields })
    const real = r.rejected.filter(x => x.reason !== 'idempotent')
    const { data: after } = await db.from('scraped_grants').select('pipeline_state, is_active').eq('id', row.id).single()
    console.log(`   applied ${r.applied.length} -> ${after?.pipeline_state} active=${after?.is_active}` + (real.length ? '  BLOCKED: ' + real.map(x => `${x.field}:${x.reason}${x.blockedBy ? ' held by ' + x.blockedBy.source : ''}`).join(', ') : ''))
  }
}
main()

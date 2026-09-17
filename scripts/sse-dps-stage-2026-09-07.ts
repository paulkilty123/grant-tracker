// Paul, 7 Sept: stage the two DPS Social Commitment programmes (SSE) for
// review, hidden, per the addition gate; and reject the live "SSE Start Up
// Programme" row, which points at the programmes index where no such
// programme is listed today (Trading for Good is the startup offer).
// Pages read 7 Sept. Tracked fields on the new rows at system: trust.
//   npx tsx --env-file=.env.local scripts/sse-dps-stage-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate, stampNewGrant } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'
const APPLY = process.argv.includes('--apply')
const SRC = 'system:sse-dps-2026-09-07'
const mk = (url: string, name: string, max: number, stage: string, pay: string, band: string) => ({
  title: `SSE DPS Social Commitment Programme: ${name}`, funder: 'School for Social Entrepreneurs', funder_type: 'trust_foundation',
  funding_type: 'programme', funding_subtypes: ['cohort_grant', 'accelerator'], apply_url: url, url_status: 'unchecked',
  location_tag: 'England and Wales', is_local: false, amount_max: max, deadline: '2026-11-16', is_rolling: false,
  eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative'],
  impact_sectors: ['housing', 'social_economy'], target_beneficiaries: ['homeless_people'],
  description: `A specialist accelerator learning programme with a grant of up to £${max.toLocaleString('en-GB')} for ${stage} charities and social enterprises in England and Wales tackling the causes and consequences of homelessness. Runs April to December 2027; applications close 16 November 2026. The grant supports learning and putting it into practice, and can cover salaries, project costs, equipment or systems.`,
  funder_brief: {
    source: 'live_fetch', last_enriched: '2026-09-07', is_local: false, open_status: 'open',
    who_can_apply: `Charities and social enterprises anywhere in England and Wales addressing the causes and consequences of homelessness, at the ${band}.`,
    what_they_fund: `A tailored learning programme with expert advice, coaching and mentoring, plus a grant of up to £${max.toLocaleString('en-GB')} to support your learning and the development of your work helping people access or sustain a home. The grant can be used for salaries, project costs, equipment or improving systems.`,
    how_to_apply: 'Apply through the programme page on the School for Social Entrepreneurs site by 16 November 2026; you describe how you would use the grant as part of the application.',
    exclusions: 'The grant cannot be spent on exclusively religious activity, political activity including lobbying, fundraising costs, or academic studies by staff or board members.',
    decision_timeline: `Applications close 16 November 2026. The programme runs 1 April to 1 December 2027; the grant is paid in three instalments, ${pay}.`,
    typical_award: `Up to £${max.toLocaleString('en-GB')}, paid in instalments across the programme.`,
    _citations: {
      who_can_apply: { snippet: 'Open to anyone addressing the causes and consequences of homelessness in England and Wales', confidence: 'high', source_url: url },
      what_they_fund: { snippet: `Grant funding of up to £${max.toLocaleString('en-GB')}`, confidence: 'high', source_url: url },
      exclusions: { snippet: 'You cannot spend the grant on exclusively religious activity, or political activity, including lobbying parliament, on the costs of fundraising', confidence: 'high', source_url: url },
      decision_timeline: { snippet: 'Deadline: November 16, 2026', confidence: 'high', source_url: url },
      amount_max: { snippet: `Grant funding of up to £${max.toLocaleString('en-GB')}`, confidence: 'high', source_url: url },
      deadline: { snippet: 'Deadline: November 16, 2026', confidence: 'high', source_url: url },
    },
  },
})
const NEW = [
  mk('https://www.the-sse.org/programme/the-dps-social-commitment-programme-activate/', 'Activate', 7000, 'early-stage', '£3,000 up front and the rest during the programme', 'early stage with some activity in place and a plan to grow'),
  mk('https://www.the-sse.org/programme/the-dps-social-commitment-programme-scale/', 'Scale', 10000, 'established and scaling', '£4,000 up front, £3,000 at the midpoint and £3,000 at the end', 'established and scaling stage'),
]
const STARTUP = 'ddc93bb0-b74d-42e7-86a7-172f9a39913c'
async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  for (const row of NEW) {
    const { data: dupe } = await db.from('scraped_grants').select('id, pipeline_state').ilike('apply_url', row.apply_url).limit(1)
    if (dupe?.length) { console.log('  already present:', row.title); continue }
    console.log('  stage', row.title)
    if (!APPLY) continue
    const stamped = { ...stampNewGrant({ ...row, source: SRC, is_active: false }, SRC), pipeline_state: 'tagged_awaiting_review' as const }
    const { data, error } = await db.from('scraped_grants').insert(stamped).select('id').single()
    if (error) throw error
    console.log('     inserted', data.id)
  }
  const { data: su } = await db.from('scraped_grants').select('title, apply_url, is_active').eq('id', STARTUP).single()
  if (!su || su.title !== 'SSE Start Up Programme') throw new Error(`wrong row: ${su?.title}`)
  console.log('  reject', su.title, su.apply_url)
  if (!APPLY) return
  const r = await mergeGrantUpdate({ id: STARTUP, source: 'admin:paulkilty1@gmail.com', db, fields: { is_active: false, pipeline_state: 'rejected',
    rejection_reason: formatRejectReason('closed_for_good', 'the programmes index on 7 Sept 2026 lists no Start Up Programme; SSE\'s startup offer is Trading for Good, carried as its own rows') } })
  console.log('     applied', r.applied)
}
main().catch(e => { console.error(e); process.exit(1) })

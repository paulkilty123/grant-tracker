// The Community Radio Fund row was archived in May with no deadline; Ofcom
// opened the 2026-27 round on 4 September (BVSC August newsletter, Paul,
// 15 Sept 2026). Update the archived row from Ofcom's page and put it back
// in review rather than insert a duplicate. No model call.
//
//   npx tsx --env-file=.env.local scripts/bvsc-revive-community-radio-2026-09-15.ts
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const ID = 'c7d1a002-1c18-4a35-87b4-3ff4ad451681'
const SRC = 'system:bvsc-august-2026-09-15'
const OFCOM = 'https://www.ofcom.org.uk/tv-radio-and-on-demand/community-radio/community-radio-fund'

async function main() {
  const db = getAdminDb()
  const r = await mergeGrantUpdate({ id: ID, source: SRC, db, fields: {
    title: 'Community Radio Fund 2026-27',
    deadline: '2026-10-14', is_rolling: false, amount_min: null, amount_max: 100000,
    funding_type: 'grant', funding_subtypes: ['restricted', 'capital'],
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['community', 'creative'], target_beneficiaries: ['general_public'], niche_tags: ['film_media', 'neighbourhood'],
    description: 'Grants from the Community Radio Fund, allocated by DCMS and managed by Ofcom, for Ofcom-licensed community radio stations: an Equipment Stream of up to £2,000 for studio and transmission equipment (analogue stations on air ten years or more) and a Sustainability Stream of up to £100,000 for job roles or projects that keep the station running (analogue and C-DSP stations on air at application), with a limited number of multi-year awards of up to three years. £904,644 available in one round for 2026-27. Applications by email close 5pm on 14 October 2026; the panel meets in early January 2027.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: '2026-09-15', open_status: 'open',
      who_can_apply: 'Ofcom-licensed community radio stations that are on air at the date of application. Equipment Stream: analogue community radio services on air for ten or more years. Sustainability Stream: analogue and C-DSP stations. Analogue stations need at least fifteen months left on their licence at the closing date or an extension application lodged.',
      what_they_fund: 'Equipment Stream: studio and transmission equipment, including accessibility improvements, such as mixing desks, recording equipment, microphones and playout software. Sustainability Stream: job roles or projects that support the station\'s sustainability, such as station management, administration, volunteer organisation and fundraising.',
      typical_award: 'Up to £2,000 in the Equipment Stream; up to £100,000 in the Sustainability Stream. £904,644 in total for 2026-27, in one round. A limited number of multi-year Sustainability awards of up to three years.',
      exclusions: 'Stations not licensed by Ofcom or not on air at application; C-DSP stations may not apply to the Equipment Stream; applications on an outdated form are rejected.',
      priorities: 'The essential core work and equipment that keeps licensed community radio stations broadcasting, with multi-year awards introduced in 2026-27 for sustainability.',
      geographic_focus: 'UK.',
      decision_timeline: 'One round for 2026-27. Applications close at 5pm on Wednesday 14 October 2026; the Community Radio Fund Panel is expected to meet in early January 2027.',
      how_to_apply: 'Read the updated guidance notes, complete the current application form from the fund page and email it to communityradiofund@ofcom.org.uk by the deadline.',
      funder_tips: 'Use the most recent version of the form; older forms are rejected. Read the guidance for the changed rules this year, including multi-year bids and the dedicated Equipment Stream.',
      strong_application: 'A licensed community station with a clear plan for a role or project that makes it more sustainable, or a specific piece of equipment it needs, costed and within the stream limits.',
      _citations: {
        typical_award: { snippet: 'Maximum award £2,000 £100,000', confidence: 'high', source_url: OFCOM },
        who_can_apply: { snippet: 'Analogue Community Radio services who have been on air for 10 or more years. Must be on air at date of application.', confidence: 'high', source_url: OFCOM },
        decision_timeline: { snippet: 'Applications will close at 5pm on Wednesday 14 October 2026', confidence: 'high', source_url: OFCOM },
      } },
    pipeline_state: 'tagged_awaiting_review',
  } })
  const bad = r.rejected.filter(x => x.reason !== 'idempotent')
  console.log(bad.length ? 'BLOCKED ' + bad.map(x => `${x.field}:${x.reason}`).join(',') : `applied ${r.applied.join(',')}`)
}
main().catch(e => { console.error(e); process.exit(1) })

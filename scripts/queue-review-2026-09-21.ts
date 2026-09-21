// Review Inbox: "Link needs fixing" (9) and "Needs reading" (11), 21 Sept 2026,
// Paul: "review all the grants, fix errors and make recommendations". Every
// page read by fetch or search, no model call. Fixes below are what the
// funder's page supports; the rest is in the reply to Paul.
//
//   npx tsx --env-file=.env.local scripts/queue-review-2026-09-21.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'
const APPLY = process.argv.includes('--apply')
const SRC = 'system:queue-review-2026-09-21'
const TODAY = '2026-09-21'
const ALL = ['unincorporated', 'ltd_guarantee', 'cic_guarantee', 'cic_shares', 'cooperative', 'registered_charity', 'cio']

type Fix = { id: string; why: string; fields: Record<string, unknown>; brief?: Record<string, unknown> }
const FIXES: Fix[] = [
  // ── rejects ──
  { id: '6bde59d2-a250-45d4-a0d7-a2150d1f2f02', why: 'Nesta Democracy Pioneers ran Dec 2019 to Nov 2020; the row links to an IPPR PDF',
    fields: { is_active: false, pipeline_state: 'rejected', rejection_reason: formatRejectReason('closed_for_good', 'Democracy Pioneers closed 31 Jan 2020 and ended Nov 2020; nesta.org.uk/project/democracy-pioneers says Funding applications Closed') } },
  { id: '10025dfa-8d71-4162-8e14-b8bfb0fbbfb2', why: 'Air Ambulance page asks people to donate laptops TO the charity; it offers nothing to other organisations',
    fields: { is_active: false, pipeline_state: 'rejected', rejection_reason: formatRejectReason('non_funder', 'The page is a fundraising ask: "If your equipment is in working condition, we would love to receive it." Nothing is offered to applicants') } },
  // ── between rounds ──
  { id: 'fb7d23b2-8848-4ace-becc-b28766bc9a7d', why: 'Big Give Women and Girls 2026: applications closed 24 June, campaign 6 to 13 Oct; next round spring 2027',
    fields: { is_active: false, pipeline_state: 'between_rounds_scheduled', deadline: null, next_open_date: 'April 2027, applications for the 2027 campaign' } },
  { id: 'cdd31f5e-4fc4-4f98-be98-c452cf0c253f', why: 'Brighton and Hove Buses: deadline 30 June 2026 passed, page bot-walled to the engine',
    fields: { is_active: false, pipeline_state: 'between_rounds_scheduled', deadline: null, next_open_date: '2027, the fund runs yearly with a June deadline' } },
  { id: '37a8f875-7834-495f-8e14-a0fade147ebf', why: 'Ufi: the row covered four programmes; pinned to VocTech Activate, closed until 5 Jan 2027, £30k to £60k',
    fields: { title: 'Ufi VocTech Activate', apply_url: 'https://ufi.co.uk/grant-funding/voctech-activate/', url_status: 'unchecked', amount_min: 30000, amount_max: 60000,
      is_active: false, pipeline_state: 'between_rounds_scheduled', next_open_date: '5 January 2027, stage one closes early February 2027',
      description: 'Grants of £30,000 to £60,000 from Ufi VocTech Trust for projects of three to twelve months that use digital technology to improve vocational learning for adults aged 16 and over, with a clear link to a defined learner group and a genuine workforce skills gap. Open to charities, learning providers, employers, private companies, CICs and other not-for-profits. Two stages. The next round opens on 5 January 2027 with stage one closing in early February 2027 and final decisions in mid May 2027.' } },
  // ── link and title fixes ──
  { id: 'f76d112d-f966-440b-a51b-f0db87b35477', why: 'Irish Society: the page lists three programmes with grants mostly under £2,000; the title said Small Grants and the check called it a different fund',
    fields: { title: 'The Honourable The Irish Society Community Grants (Growing Together, Living Rivers, Living Heritage)', amount_max: 2000, is_rolling: true,
      description: 'Grants, most of them £2,000 or less, from The Honourable The Irish Society for charities, community groups and other not-for-profits delivering work in the communities it serves on the North West and North Coast of Northern Ireland. Three programmes: Growing Together (community early years provision), Living Rivers, Living Communities (waterways and environmental stewardship) and Living Heritage, Shared Futures (participatory culture, heritage and reconciliation). Apply at any time through the online form; applications are reviewed as they arrive.' } },
  { id: 'ed650a87-574f-46cd-83ec-7df1f63248b1', why: 'Highland: the page is the Community-Led Local Development Fund, not a Small Grants Programme; how-to-apply page carries the form and email',
    fields: { title: 'Highland Community-Led Local Development Fund', apply_url: 'https://www.highland.gov.uk/economy-regeneration/community-led-local-development-fund', url_status: 'unchecked', is_rolling: true,
      description: 'Community-Led Local Development Fund from The Highland Council for not-for-profit and community-led organisations in rural Highland, outside Inverness city and Badenoch and Strathspey. Two priorities: improvements to community-owned or managed assets, with no single item over £10,000, and short-term community-led activity that reduces the impact of poverty and isolation. Single-stage application by form, emailed to CLLDsmallgrants@highland.gov.uk, approved on a rolling basis until the fund is fully allocated.' } },
  // ── field fixes on rows that stay for reading ──
  { id: 'a27b8108-8e25-4d33-9a81-4f0501a67bb3', why: 'Comic Relief Community Fund England 2026/27: open, up to £5,000, income under £250k, grassroots groups; page is bot-walled to the engine',
    fields: { funder: 'Comic Relief, delivered by Groundwork', amount_max: 5000, max_org_income: 250000, eligible_structures: ALL, location_tag: 'England', is_local: false,
      description: 'Grants of up to £5,000 from the Comic Relief Community Fund, delivered by Groundwork, for grassroots, community-led organisations in England with an income under £250,000 that support people living in or at risk of poverty or hardship. This year\'s focus: homelessness and the cost of living, early childhood development, violence against women and girls, and the safety and wellbeing of refugees and people experiencing forced migration. Around 120 grants from just over £600,000. Start with the online eligibility checker on the Groundwork page, which then issues the application link.' } },
  { id: '7cbf1c56-83f4-4068-a870-57aaf14465a9', why: 'Corlacky: eligibility was empty; the page names charities, community groups and asset-locked CICs within 7km',
    fields: { eligible_structures: ['registered_charity', 'cio', 'unincorporated', 'cic_guarantee', 'ltd_guarantee'] } },
  { id: '18215fb0-27f4-4c0d-b1ea-5402ba58be54', why: 'Pathways to Work: £10m round one, no per-project figure published; round one opens and closes Sept to Oct 2026, exact dates unpublished',
    fields: { amount_undisclosed: true } },
  { id: '51abe4c2-97db-4c98-a942-398b675e71e1', why: 'Digital Boost: quarantined by a stale enrich failure; page says free and unlimited for any small organisation',
    fields: { needs_intervention_reason: null, eligible_structures: [...ALL, 'ltd_shares', 'sole_trader'] } },
  { id: '33c0aa63-fe9c-4c63-881a-825fb6818e6b', why: 'Jephcott: no amount on any page; trustees meet April and October, so not rolling',
    fields: { amount_undisclosed: true, is_rolling: false, deadline_cycle: [{ month: 4, label: 'Trustees meet in April' }, { month: 10, label: 'Trustees meet in October' }] } },
  { id: 'cef2a39a-9a27-46bf-9ed5-d6fa0c245aca', why: 'Britford Bridge: page is bot-walled to the engine but readable here; brief written from it',
    fields: { amount_undisclosed: true, eligible_structures: ['registered_charity', 'cio', 'scio'],
      description: 'Grants from The Britford Bridge Trust to UK registered charities for national or international projects in the relief of poverty, education, health and the saving of lives, and the arts, culture, heritage and science. Regional grants only in Dorset and the Cambridge area. No amount is published; trustees consider the sum requested against the project and the applicant\'s own resources. Not for cancer research or African causes, which the trust funds separately. Apply by the form on the site or by email to thebritfordbridgetrust@brodies.com.' },
    brief: { source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'UK registered charities with national or international projects. Regional projects only in Dorset and the Cambridge area. Applicants should show national relevance.',
      what_they_fund: 'The prevention or relief of poverty; the advancement of education; the advancement of health or the saving of lives; the advancement of the arts, culture, heritage or science.',
      typical_award: 'Not published. Trustees consider the amount requested in the context of the overall project and the applicant\'s existing resources, and how much of a donation reaches the intended beneficiary.',
      geographic_focus: 'UK and international projects; regional grants limited to Dorset and Cambridge.',
      exclusions: 'Cancer and malignant disease research, and African causes, both of which the trustees already fund through their own routes. Successive unsuccessful applications are a strong sign the trust is not minded to support.',
      how_to_apply: 'Download the application form from the Apply Now button on the site, or contact thebritfordbridgetrust@brodies.com.',
      decision_timeline: 'No deadlines published.',
      _citations: {
        who_can_apply: { snippet: 'UK registered charities for national or international projects', confidence: 'high', source_url: 'https://thebritfordbridgetrust.org/about/' },
        exclusions: { snippet: 'The trustees have already fully committed to supporting the fields of medicine and related professions connected to the causes, diagnosis, treatment and care of cancer', confidence: 'high', source_url: 'https://thebritfordbridgetrust.org/about/' },
      } } },
  { id: '04577256-b429-4dd3-8379-293c4534b65e', why: 'Elmgrant: organisations get about £500 to £550; next meeting October 2026, post by 24 Sept; no email applications; Bath, NE Somerset and Bristol excluded',
    fields: { amount_max: 550, deadline: '2026-09-24', is_rolling: false } },
  // ── postal trusts: how to apply filled in, decision left to Paul ──
  { id: '952702c1-ad48-48d9-9762-fb256b0583e2', why: 'Howat: no website; apply in writing to Harper Macleod, trustees meet Mar, Jun, Sep, Dec, apply by mid month before',
    fields: { is_rolling: false, deadline_cycle: [{ month: 2, day: 15, label: 'For the March meeting' }, { month: 5, day: 15, label: 'For the June meeting' }, { month: 8, day: 15, label: 'For the September meeting' }, { month: 11, day: 15, label: 'For the December meeting' }] } },
  { id: '2506cc66-7ba4-4da7-80fb-070b5961783d', why: 'Harford: max £2,000, registered charities, appeals by email only; the register page is the only page',
    fields: { amount_max: 2000, eligible_structures: ['registered_charity', 'cio', 'scio'] } },
  { id: '1f67aead-7d02-49ad-87ae-77f9f9daece7', why: 'Mackintosh: apply in writing to info@camack.co.uk, trustees meet Mar, Jun, Sep, Dec, 3 to 4 weeks ahead',
    fields: { is_rolling: false, deadline_cycle: [{ month: 2, label: 'For the March meeting' }, { month: 5, label: 'For the June meeting' }, { month: 8, label: 'For the September meeting' }, { month: 11, label: 'For the December meeting' }] } },
]

async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  let applied = 0, refused = 0
  for (const f of FIXES) {
    const { data: row, error } = await db.from('scraped_grants').select('id,title,pipeline_state,is_active').eq('id', f.id).single()
    if (error || !row) { console.log('MISSING', f.id, f.why); continue }
    console.log(`\n${row.title} [${row.pipeline_state}${row.is_active ? ', live' : ''}]\n  ${f.why}\n  -> ${Object.keys(f.fields).join(', ')}${f.brief ? ' + funder_brief' : ''}`)
    if (!APPLY) continue
    const fields = f.brief ? { ...f.fields, funder_brief: f.brief } : f.fields
    const r = await mergeGrantUpdate({ db, id: f.id, source: SRC, fields })
    if (r.rejected.length) { refused++; console.log('  REFUSED', JSON.stringify(r.rejected)) }
    else applied++
    console.log('  applied', r.applied.join(', '))
  }
  console.log(`\n${APPLY ? `applied ${applied}, refused ${refused}` : `would touch ${FIXES.length}`}`)
}
main().catch(e => { console.error(e); process.exit(1) })

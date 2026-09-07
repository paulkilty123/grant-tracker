// Verdicts — pile B, batch 4, rows 76-100. One publish, one park, two reject,
// twenty-one hold.
//
// Five Henry Smith Foundation rows this batch, all on the same template site
// with a consistent pattern: "This grant is now open/closed" plus stage
// dates, and nearly every column admin-pinned on each. One is worth Paul's
// attention specifically — Christian Grants (Clergy) reads "now open" and
// the row already holds is_rolling true, deadline null (which matches), but
// is_active itself is pinned false, so someone has deliberately chosen to
// keep an apparently-open, accurately-timed fund out of the live catalogue.
// Reported rather than touched, since rule 1 forbids changing is_active
// regardless.
//
// One reject is a database-proved duplicate rather than a dead link: Heart
// Research UK — Healthy Heart Grants points at a bare index that redirects
// to the charity\'s homepage, while the live row a9ebac9e (Healthy Hearts
// Grants, Northern Ireland) already carries the same fund\'s working page.
//
// Several holds name a real, specific future date that a pin blocks writing:
// Westminster Amalgamated Charity (23 October 2026), Ashley Family
// Foundation\'s Grants for Wales (18 December 2026), Hugh Fraser Foundation
// (cut-off 30 October for the 9 December panel), Idlewild Trust (reopens
// 7 December 2026).
//
//   npx tsx --env-file=.env.local scripts/verdicts-b04-2026-09-07.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row } from './verdicts-lib-2026-09-07'

const APPLY = process.argv.includes('--apply')
const BATCH = 4

const HILDEN = 'https://hildencharitablefund.org/uk-funding/'
const HPC = 'https://www.somersetcf.org.uk/grants-funding/details/hpc-community-fund-small-grants/'

const ROWS: Row[] = [
  // 76. A genuine future deadline (23 October, for the November meeting),
  // but every relevant field is admin-pinned.
  { id: '52d4abe9-f60a-465e-8b42-c4b72b175d61', re: /Grants for Organisations/, pile: 'B', verdict: 'hold',
    quote: '23 October for November meeting (cut-off date for starting an application is 5pm on 19 October)',
    url: 'https://www.w-a-c.org.uk/grants-organisations',
    for_paul: 'A genuine future deadline, 23 October 2026, for the November meeting. deadline, amounts, is_rolling, location_tag and eligible_structures are all admin-pinned.' },

  // 77. Same shape: a real future date, pinned.
  { id: 'b8494005-3edb-4f2a-bde5-83e5254a0ac8', re: /Grants for Wales/, pile: 'B', verdict: 'hold',
    quote: 'The next application deadline is 18th December 2026',
    url: 'https://www.ashleyfamilyfoundation.org.uk/how-to-apply-for-a-grant-from-the-ashley-family-foundation',
    for_paul: 'A genuine future deadline, 18 December 2026, but deadline, amount_max, is_rolling, location_tag and eligible_structures are all admin-pinned.' },

  // 78. This year\'s second round closed 29 June, matching the row; no
  // 2026/2027 round announced yet.
  { id: 'df6c6cf5-9747-4324-8bcd-cfd9c68bc53a', re: /Green Quarter Community Chest/, pile: 'B', verdict: 'hold',
    quote: 'Applications are open until the 29th June, with a total of £10,000 available to projects that align with our priority areas',
    url: 'https://thegreenquartercommunity.co.uk/community-chest-programmes/',
    for_paul: 'This round has closed and matches the row; no next round announced.' },

  // 79. The specific fund content is client-rendered; nothing but navigation
  // reaches the text.
  { id: '38d502d6-a414-40f5-a72e-405039098abd', re: /Green Roots Fund/, pile: 'B', verdict: 'hold',
    quote: '', url: 'https://www.london.gov.uk/programmes-strategies/environment-and-climate-change/parks-green-spaces-and-biodiversity/green-space-funding/green-roots-fund',
    for_paul: 'The fund\'s own content is client-rendered; only site navigation reaches a text read.' },

  // 80. A clean park: no pins, and a plain statement of when the next round
  // will be announced.
  { id: '43b1a60d-270a-48da-9d59-774be5847a0f', re: /Green Spaces Fund/, pile: 'B', verdict: 'park',
    quote: 'The Green Spaces Fund is now closed for 2026! ... Keep your eyes peeled in early 2027 for news about the next round...',
    url: 'https://gmet.org.uk/green-spaces-fund',
    fields: { next_open_date: 'Early 2027', next_open_date_parsed: '2027-01-01', deadline: null, is_rolling: false },
    cits: { next_open_date: { snippet: 'Keep your eyes peeled in early 2027 for news about the next round...', confidence: 'high', source_url: 'https://gmet.org.uk/green-spaces-fund' } } },

  // 81. Unreadable (403); the row already carries "TBC — between rounds",
  // which nothing here contradicts.
  { id: 'ab3b5833-5440-4acc-9d92-1694bc80e994', re: /GSK IMPACT Awards/, pile: 'B', verdict: 'hold',
    quote: '', url: 'https://www.kingsfund.org.uk/insight-and-analysis/projects/gsk/impact-awards',
    for_paul: 'HTTP 403, unreadable today. The row already holds "TBC — between rounds", which nothing here disputes.' },

  // 82. Closed, mid-migration to a new grants portal, no next round given.
  { id: 'e73119cf-dfb8-493b-bf20-8da65285eca3', re: /Project Innovation Fund/, pile: 'B', verdict: 'hold',
    quote: 'Our Grants Management system is moving to a new portal. From 28 July 2026, you won\'t be able to access the current system anymore.',
    url: 'https://www.hackney.gov.uk/community-safety-and-environment/community-partnerships/community-grants/what-grants-are-available',
    for_paul: 'Closed and mid-migration to a new grants system; no reopening date given, subscribe-to-be-notified is the only next step offered.' },

  // 83. "Check back at the end of September" is a promise of a future date,
  // not itself a stated reopening date.
  { id: 'e72200b0-f3df-44d2-85bc-a55b5d2aa0a4', re: /Wingate Foundation/, pile: 'B', verdict: 'hold',
    quote: 'Email your completed form to admin@wingate.org.uk – applications are currently closed. Please check back at the end of September 2026 for a new date.',
    url: 'https://wingate.org.uk/apply/',
    for_paul: 'Closed, with a promise to publish a new date at the end of September rather than a date itself.' },

  // 84. Annual (1 May-30 June); this year\'s window has closed with no 2027
  // date yet.
  { id: '5adeb924-3976-4836-a000-007c8e3361ef', re: /Havering Community Chest/, pile: 'B', verdict: 'hold',
    quote: 'The Live Well Havering community chest funds local projects supporting health and wellbeing in Havering, it is open for applications each year from 1 May 2026 - 30 June 2026. This round of applications is now closed',
    url: 'https://www.livewellhavering.org.uk/article/havering-community-chest/',
    for_paul: 'Annual window (1 May-30 June) has closed for this year; no 2027 date yet. Every relevant field is admin-pinned.' },

  // 85. Technically open right now — the page itself is ahead of the row.
  { id: 'e0a27a78-3cfd-44e3-aebf-59d41d576894', re: /HCF Grants/, pile: 'B', verdict: 'hold',
    quote: '2027 Round: Open for applications from 1st September 2026. Deadline 5pm 11th January 2027. Decisions known March 2027.',
    url: 'https://www.hertscf.org.uk/hcfgrants',
    for_paul: 'This round is open now (opened 1 September, six days before this check), closing 11 January 2027. deadline is admin-held.' },

  // 86. A real date, no pins, but the award goes to an individual social
  // entrepreneur rather than an organisation applying.
  { id: '8f0e5171-379b-41c8-a17d-e0caa0867332', re: /Healthy Ageing Award/, pile: 'B', verdict: 'hold',
    quote: 'Next round on 1 October 2026 at 10:00 (23 days)',
    url: 'https://unltd.org.uk/awards/healthy-ageing/',
    for_paul: 'A genuine future date, 1 October 2026, and nothing is admin-held — but UnLtd\'s award goes to an individual social entrepreneur, the same audience question as the Funding Futures Programme elsewhere in this pile.' },

  // 87. "Opening again in 2027" is a year, not a date; pinned regardless.
  { id: '48dcfee3-ece1-48e5-9b65-41c27cd40e54', re: /Heart of Yorkshire Fund/, pile: 'B', verdict: 'hold',
    quote: 'We are now closed for applications. We will be opening again in 2027 for this fund.',
    url: 'https://tworidingscf.org.uk/fund/heart-of-yorkshire-fund/',
    for_paul: 'Names only a year, not a date, for reopening; deadline, amount_max, is_rolling and location_tag are all admin-pinned regardless.' },

  // 88. A database-proved duplicate: this row\'s apply_url is a bare index
  // redirecting to the charity\'s homepage, while the live row already
  // carries this fund\'s working page.
  { id: 'adb857d5-43ba-4012-a401-ae6ab5b6c89f', re: /Heart Research UK — Healthy Heart Grants/, pile: 'B', verdict: 'reject', code: 'duplicate',
    quote: '', url: 'https://heartresearch.org.uk/grants/',
    dupe_of: ['a9ebac9e'],
    for_paul: 'Duplicate of the live row a9ebac9e, Heart Research UK Healthy Hearts Grants (Northern Ireland). This row\'s apply_url redirects to the charity\'s homepage; the live row already has the fund\'s working page.' },

  // 89. Reads as open, and the row\'s own rolling/no-deadline reading already
  // matches — but is_active is pinned FALSE, a deliberate choice to keep it
  // out of the catalogue that this job cannot and should not touch.
  { id: 'b5b74039-791e-47be-b283-4b03eff238ba', re: /Christian Grants/, pile: 'B', verdict: 'hold',
    quote: 'This grant is now open',
    url: 'https://henrysmith.foundation/grants/clergy/',
    for_paul: 'Reads as open, and the row\'s own rolling, no-deadline timing already matches the page — but is_active is admin-pinned false, which looks like a deliberate decision to keep this out of the catalogue rather than a timing gap. Rule 1 means this job leaves is_active alone regardless; flagging so the pin\'s reasoning can be checked.' },

  // 90. Closed; the next stage is by invitation only, and nearly every field
  // is pinned.
  { id: '0333a9dc-551e-4cff-a27c-3ff8fff74141', re: /Early Years Parenting/, pile: 'B', verdict: 'hold',
    quote: 'This grant is now closed', url: 'https://henrysmith.foundation/grants/early-years-parenting/',
    for_paul: 'Closed; the next stage (full application) is by invitation only, and no next open round is named. Nearly every column is admin-pinned.' },

  // 91. The page contradicts itself in adjacent lines ("now closed" and
  // "Applications are now open"), and the row\'s stored next_open_date (24
  // June 2026) is itself in the past.
  { id: '4d1c0308-3198-4fa0-8a0f-309827065227', re: /Equity in Justice/, pile: 'B', verdict: 'hold',
    quote: 'This grant is now closed', url: 'https://henrysmith.foundation/grants/equity-in-justice/',
    for_paul: 'The page says both "now closed" and, a few lines on, "Applications are now open" — worth a human look rather than a script picking one. The row\'s own next_open_date (24 June 2026) is already in the past regardless.' },

  // 92. Closed, no next round; nearly every column pinned.
  { id: '6fae7d85-2a40-481a-b192-de96f20593f5', re: /Proud Homes/, pile: 'B', verdict: 'hold',
    quote: 'Applications are now closed.', url: 'https://henrysmith.foundation/grants/proud-homes/',
    for_paul: 'Closed, no next round stated.' },

  // 93. Already accurately "TBC — between rounds"; this is the foundation\'s
  // index over the four named grants above.
  { id: 'c9634fd4-6185-4aa1-9999-205dd589e9a5', re: /Henry Smith Foundation Grants/, pile: 'B', verdict: 'hold',
    quote: 'Learn more about our 2025-2030 priorities', url: 'https://henrysmith.foundation/grants/',
    for_paul: 'An index over the named Henry Smith grants above; the row\'s existing "TBC — between rounds" already fits and nothing here contradicts it.' },

  // 94. Park. Not pinned on deadline or next_open_date, and a plain
  // statement of when the programme reopens.
  { id: 'b351fcc8-a520-41ab-905f-ca746f9ae065', re: /Hilden Charitable Fund/, pile: 'B', verdict: 'park',
    quote: 'The UK Programmes are currently CLOSED and not scheduled to open again until summer 2027.',
    url: HILDEN,
    fields: { next_open_date: 'Summer 2027', next_open_date_parsed: '2027-06-01', deadline: null, is_rolling: false },
    cits: { next_open_date: { snippet: 'The UK Programmes are currently CLOSED and not scheduled to open again until summer 2027.', confidence: 'high', source_url: HILDEN } } },

  { id: '186c2817-4efa-48c5-827e-8a7ef9f92295', re: /HMRC Voluntary and Community Sector/, pile: 'B', verdict: 'reject', code: 'dead_url',
    quote: 'Page not found. If you typed the web address, check it is correct.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/hmrc-grant-funding-programme-2027-30-1' },

  // 96. Publish. Genuinely open year-round with a stated next deadline, and
  // only location_tag and is_invite_only are pinned.
  { id: '9cf129d2-9e1c-43d0-9627-032cf46ba18a', re: /HPC Community Fund Small Grants/, pile: 'B', verdict: 'publish',
    quote: 'Open year-round. Next deadline is Monday 19 October, by 5pm',
    url: HPC,
    fields: { deadline: '2026-10-19', is_rolling: true },
    cits: { deadline: { snippet: 'Open year-round. Next deadline is Monday 19 October, by 5pm', confidence: 'high', source_url: HPC } },
    brief: {
      who_can_apply: 'Local groups normally running on under £250,000 that are working in areas impacted by the Hinkley Point C (HPC) development, primarily around Bridgwater, Burnham-on-Sea and the surrounding villages in Somerset.',
      what_they_fund: 'Projects that improve community wellbeing and quality of life in areas affected by HPC, including running projects, refurbishing buildings or buying equipment. Grants can be spent over a few months or up to three years, with multi-year grants paid in instalments.',
      how_to_apply: 'Complete the online application form, or draft answers first using the Word version provided. The fund is open year-round, with six deadlines a year; the next is Monday 19 October by 5pm, and decisions are usually made around every two months.',
      exclusions: 'The page states no exclusions beyond eligibility for the area and Somerset Community Foundation\'s minimum standards; Community Interest Companies should check the minimum standards carefully before applying.',
      decision_timeline: 'Decisions are made around every two months. An assessor reviews the application and supporting documents, then makes a recommendation to a panel of Somerset Community Foundation, Somerset Council and EDF staff plus independent community members, who make the final decision.',
      typical_award: 'Requests from under £1,000 up to £30,000 are considered; most grants range from £5,000 to £10,000.',
      open_status: 'open',
    },
    briefCits: {
      who_can_apply: { snippet: 'Who is it for? Local groups normally running on under £250,000 that are working in areas impacted by Hinkley Point C.', confidence: 'high', source_url: HPC },
      what_they_fund: { snippet: 'What is it for? To run projects, refurbish buildings or buy equipment.', confidence: 'high', source_url: HPC },
      how_to_apply: { snippet: 'The next step is to fill in our online application form.', confidence: 'high', source_url: HPC },
      exclusions: { snippet: 'If your group is a Community Interest Company (CIC) it\'s particularly important that you check the minimum standards information before applying.', confidence: 'high', source_url: HPC },
      decision_timeline: { snippet: 'Decisions made around every 2 months.', confidence: 'high', source_url: HPC },
      typical_award: { snippet: 'We\'re happy to consider requests for less than £1,000 or up to £30,000. Most of our grants range from £5,000 to £10,000.', confidence: 'high', source_url: HPC },
      open_status: { snippet: 'Apply by: Open year-round. Next deadline is Monday 19 October, by 5pm', confidence: 'high', source_url: HPC },
    } },

  // 97. A real future cut-off (30 October, for the 9 December panel), which
  // has moved on from the row\'s own stale next_open_date text.
  { id: '0d918b6b-84be-4224-88f8-8402394e7f7b', re: /Hugh Fraser Foundation/, pile: 'B', verdict: 'hold',
    quote: 'The closing date for receipt of applications for the next meeting on 9th December 2026 will be Friday 30th October',
    url: 'https://turcanconnell.com/the-hugh-fraser-foundation/',
    for_paul: 'A genuine, newer cut-off: 30 October 2026 for the 9 December panel, superseding the row\'s own stale next_open_date text (which names 31 July for an 8 September panel). deadline, is_rolling and location_tag are admin-pinned.' },

  // 98. A real future opening date, pinned.
  { id: 'fab5ab12-9098-4e07-8647-722374e2126e', re: /Idlewild Trust/, pile: 'B', verdict: 'hold',
    quote: 'Applications open Monday 7 December 2026',
    url: 'https://www.idlewildtrust.org.uk/apply-grant',
    for_paul: 'A genuine future opening date, 7 December 2026, but is_rolling and next_open_date are both admin-pinned.' },

  // 99. Reads as open now, contradicting the row\'s stale deadline, but the
  // audience is start-up ventures competing for investment readiness, and
  // everything relevant is pinned regardless.
  { id: 'd07619f8-3bfe-4f70-a95f-3db7d8ae6016', re: /Ignite Social Impact Competition/, pile: 'B', verdict: 'hold',
    quote: 'Applications for IGNITE 2026 are open. Preview the full form, then apply when you\'re ready.',
    url: 'https://ignitecomp.co.uk/more-info/',
    for_paul: 'Reads as open now, ahead of the row\'s stale deadline, but this pairs a national competition with a six-week accelerator for early-stage ventures rather than an established organisation applying, which is an audience question; deadline, amounts, is_rolling, location_tag and eligible_structures are pinned regardless.' },

  // 100. Names a panel month, not a date, and deadline_cycle is pinned.
  { id: '45f7e90d-4045-4abb-907c-165d82513c3b', re: /IM Properties Stratford 46/, pile: 'B', verdict: 'hold',
    quote: 'Panels for this fund will take place during: March 2026 October 2026 March 2027',
    url: 'https://www.heartofenglandcf.org/im-properties-stratford-46-community-fund/',
    for_paul: 'Names panel months (next: October 2026) rather than an application deadline; deadline_cycle is admin-pinned regardless.' },
]

async function main() {
  await runBatch({ batch: BATCH, pile: 'B', rows: ROWS, apply: APPLY, db: getAdminDb() })
  if (!APPLY) console.log('\n  pass --apply to write')
}
main().catch(e => { console.error(e); process.exit(1) })

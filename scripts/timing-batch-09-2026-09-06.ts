// Timing on 187 live rows — batch 9 (rows 161-180). Three written, seventeen reported.
//
// The lowest yield in the job, and the reason is a single cluster: six of these
// twenty rows are Sainsbury Family Charitable Trusts, and five of the six say
// in one form or another that they do not take unsolicited applications. Add
// the Alan and Babette Sainsbury Charitable Fund, the Linbury Trust and the
// Sigrid Rausing Trust from batch 8 and this stretch of the alphabet is largely
// proactive funders. There is no timing to write for a funder that does not
// receive applications, and the honest answer is the invite_only report.
//
//   npx tsx --env-file=.env.local scripts/timing-batch-09-2026-09-06.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row, type Report } from './timing-lib-2026-09-06'

const APPLY = process.argv.includes('--apply')
const BATCH = 9

const ROWS: Row[] = [
  // 161. Rolling with a real cycle, and the fund states the relationship
  // between the two: apply any time, and to reach a given panel be in by the
  // 15th of the month before it. Panels in March, June, September and December
  // therefore give deadlines of 15 February, May, August and November.
  { id: '89a22fca-ffc6-44f2-be88-78eb6d92cf9b', re: /Willan/,
    fields: { is_rolling: true, deadline: null,
      deadline_cycle: [
        { day: 15, month: 2,  label: 'For the March panel' },
        { day: 15, month: 5,  label: 'For the June panel' },
        { day: 15, month: 8,  label: 'For the September panel' },
        { day: 15, month: 11, label: 'For the December panel' },
      ] },
    cits: { is_rolling: { snippet: 'Applications will be considered at the next scheduled meeting, provided they are received by the 15th of the preceding month.', confidence: 'high',
      source_url: 'https://www.communityfoundation.org.uk/grants/the-1989-willan-charitable-trust/' } } },

  // 163. Three rounds a year, and the door is a one-week registration window
  // rather than an application deadline — miss the week and the round is shut
  // whatever the later dates say. Autumn 2026's window closed on 15 July; the
  // next opens 25 November for the Spring 2027 round. The year is not on the
  // page (the column is headed "Spring 2027" and the registration row gives
  // only day and month), but a Spring 2027 round registering in late November
  // can only be registering in 2026.
  { id: '3b887829-eff4-41fe-823c-3f8155755b2e', re: /The Fore/,
    fields: { is_rolling: false, deadline: null, next_open_date: '25 November 2026' },
    sources: [{ url: 'https://thefore.org/apply/', label: 'Apply for funding (timetable of funding rounds), read 2026-09-06' }],
    cits: { next_open_date: { snippet: 'From 12pm (midday) on Wednesday 25th November to 12pm (midday) on Wednesday 2nd December', confidence: 'high',
      source_url: 'https://thefore.org/apply/' } } },

  // 164. The eligibility checkboxes lead to a first-stage form, and behind them
  // the page says when that form comes back. The 17 July deadline named
  // elsewhere on the page has passed.
  { id: '809e464b-0cdb-46cb-b844-8eca7d4644a9', re: /Grocers/,
    fields: { is_rolling: false, deadline: null, next_open_date: '31 March 2027' },
    cits: { next_open_date: { snippet: 'The link will be available on 31 March 2027.', confidence: 'high',
      source_url: 'https://grocershall.co.uk/the-charity/the-charity-application' } } },
]

const REPORT: Report[] = [
  { id: '05d6dbdf-d370-4d34-9a5b-80540e3b06fa', title: 'The Alan and Babette Sainsbury Charitable Fund', why: 'invite_only',
    quote: 'WE DO NOT ACCEPT UNSOLICITED APPLICATIONS',
    url: 'https://abscharitablefund.org.uk/',
    note: 'The newest grant listed is from 2023 and the site copyright is 2023.' },
  { id: 'efe671c9-9c04-48a2-bd28-587b6cf1ba92', title: 'The Harry Payne Fund', why: 'not_stated',
    quote: 'Please read our Essential Information before applying.',
    url: 'https://www.heartofenglandcf.org/harry-payne-fund/',
    note: 'Fifth Heart of England Community Foundation row with this shape, after Alan Higgs, Coventry Solihull & Warwickshire and the two Edgbaston & Northfield rows. Criteria on the page, dates only in a linked factsheet.' },
  { id: 'd1a4d7c2-dc0a-4f97-a910-52ab5d64d355', title: 'The Headley Trust', why: 'not_stated',
    quote: 'The Headley Museums Archaeological Acquisition Fund runs alongside and in collaboration with the Arts Council England / V&A Purchase Grant Fund.',
    url: 'https://www.sfct.org.uk/the-headley-trust/',
    note: 'One of six Sainsbury Family Charitable Trusts rows in this batch. Unlike its siblings it does not say it refuses unsolicited applications; it simply describes what it funds and names no route and no date.' },
  { id: '1dcfec77-f432-4bc6-8cf4-bf553ea73e4e', title: 'The Indigo Trust', why: 'invite_only',
    quote: 'Submission of proposals is by invitation only. Indigo Trust identifies relevant organisations through its diverse networks, proactive research and recommendations from grantee-partners and peer funders.',
    url: 'https://www.sfct.org.uk/indigo-trust/', note: '' },
  { id: 'c94379cc-bd70-482c-a3cd-76d406e9908f', title: 'The Julia Rausing Trust — Grants', why: 'not_stated',
    quote: 'The first donations made through the Trust totalled £50m and were announced in July 2024.',
    url: 'https://www.juliarausingtrust.org/grants/',
    note: 'The grants page lists what has been given and offers no application route. The only application window anywhere on the site is in an embedded tweet about the Julia Rausing Sky Arts Bursaries, which are run with the Sky Foundation for individual dance-makers and close on 9 September 2026 — a different programme and a different applicant, so not used.' },
  { id: 'b9dd4a92-ace3-4223-8190-7d8e949537d2', title: 'The Linbury Trust', why: 'invite_only',
    quote: 'The Linbury Trust does not accept unsolicited enquires or applications. Please do not send enquiries, applications or requests for meetings to the office, unless asked to do so.',
    url: 'https://linburytrust.org.uk/', note: '' },
  { id: '4317a983-3349-41ac-ade4-367dbec4b59b', title: 'The Mark Leonard Trust', why: 'invite_only',
    quote: 'The Trust has a proactive grant process and does not accept unsolicited applications.',
    url: 'https://www.sfct.org.uk/the-mark-leonard-trust/', note: '' },
  { id: '5bb5658f-c526-4fc2-8dbc-a8162056574d', title: 'The Tedworth Charitable Trust', why: 'invite_only',
    quote: 'Unsolicited applications are unlikely to be successful, even if they fall within an area in which the Trustees are interested.',
    url: 'https://www.sfct.org.uk/the-tedworth-charitable-trust/',
    note: 'Softer than its siblings — "unlikely to be successful" rather than "do not accept" — but it is still a statement that the front door is not the route.' },
  { id: '5f1c3fd2-c8e9-451d-a0ef-1ae501ce0093', title: 'The Three Guineas Trust', why: 'not_stated',
    quote: 'We run an annual grants round for holiday play and activity schemes for autistic children and young people. We also run a biennial grants round for projects providing better access to justice for disabled people.',
    url: 'https://www.sfct.org.uk/the-three-guineas-trust/',
    note: 'Two rounds described, one annual and one biennial, with no date for either and no way to tell from the page whether the biennial one falls this year.' },
  { id: '1ffe7161-587d-48ce-86a2-39a94a9120ad', title: 'The Weavers\' Company Charitable Funds', why: 'unreadable',
    quote: '', url: 'https://www.weavers.org.uk/charity/charitable-grants/guidelines/',
    note: 'The host does not answer. curl gets "Recv failure: Connection reset by peer" and node gets UND_ERR_CONNECT_TIMEOUT, on repeated attempts. Not a block page and not a 403 — a fourth shape of unreadable, and the only one in this job where nothing came back at all.' },
  { id: '036a2937-bb8f-4f9e-9840-33a4bd450b33', title: 'Tim Parry Johnathan Ball Foundation Grants', why: 'not_stated',
    quote: 'In March 2025, the Foundation became a grant-making organisation when the Peace Centre was sold to the local authority.',
    url: 'https://timparryjohnathanballfoundation.org.uk/',
    note: 'A new grant-maker whose site is still its history. /grants/ returns 404 and the home page carries no application route, criteria or date.' },
  { id: '97352e7c-d16c-4a1c-98a6-ee508bce182b', title: 'Toy Trust', why: 'not_stated',
    quote: 'The Toy Trust receives many requests for donations on a weekly basis. Each request is evaluated against a strict set of criteria, to discover if you are eligible.',
    url: 'https://www.toytrust.co.uk/',
    note: '"On a weekly basis" describes the volume of requests, not a window for making one. No date anywhere on the site.' },
  { id: '60206220-abaa-45e2-9534-bc6d41e94940', title: 'Trust for London — Poverty & Inequality Grants', why: 'not_stated',
    quote: 'Our team is here to help you. If you\'re thinking about applying, we encourage you to book a short conversation with one of our grant managers.',
    url: 'https://trustforlondon.org.uk/funding/',
    note: 'A full how-to-apply page covering aims, eligibility, priorities and guidance, with no deadline, round or statement that applications are open continuously. The only date on it is the publication date of the funding guidelines.' },
  { id: '0e506d16-9e5c-47e0-aae9-7f3444b3646c', title: 'TrustLaw — Pro Bono Legal Programme', why: 'not_stated',
    quote: 'TrustLaw is a completely free service open to law firms and corporate legal teams globally. Once a member, you can access available pro bono opportunities from vetted civil society organisations and social enterprises.',
    url: 'https://www.trust.org/trustlaw/',
    note: 'A membership network rather than a round; a civil society organisation joins and then requests support. No window stated.' },
  { id: 'f4cc6956-affd-496c-9954-09c189ddea02', title: 'Ulverscroft Foundation', why: 'not_stated',
    quote: 'Applications can be made in writing by downloading, completing and posting us an application form. We also accept email applications.',
    url: 'https://www.ulverscroft-foundation.org.uk/grants/',
    note: 'How to apply is described in full and when is never mentioned.' },
  { id: 'b4552ae7-42bd-44c2-b42a-e3e0a05271f4', title: 'Variety — The Children\'s Charity', why: 'not_stated',
    quote: 'Registered charity in England and Wales (209259) and Scotland (SC038505).',
    url: 'https://www.variety.org.uk/grants-for-disabled-children/',
    note: 'apply_url redirects to the grants-for-disabled-children page, which carries no sentence about timing at all — the quote is the closest the fetched text comes to a statement, which is to say there is none.' },
  { id: 'b3086bff-58af-4ffa-836c-855cf136a499', title: 'Vicar\'s Relief Fund — St Martin-in-the-Fields Charity', why: 'not_stated',
    quote: 'The funding reaches them at speed, through frontline workers who apply for emergency grants on their behalf.',
    url: 'https://smitfc.org/emergency-grants',
    note: 'Crisis grants applied for by paid frontline support workers on behalf of individuals. "At speed" implies no window and the page never says so, and the fund is for individuals rather than organisations, which is a scope question worth a separate look.' },
]

async function main() {
  await runBatch({ batch: BATCH, rows: ROWS, report: REPORT, apply: APPLY, db: getAdminDb() })
}
main().catch(e => { console.error(e); process.exit(1) })

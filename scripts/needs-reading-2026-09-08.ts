// Paul, 8 Sept 2026: "go through each of the Needs reading rows, check for
// accuracy and ensure they are properly enriched ready for publishing."
//
// Every page below was read on 8 September 2026 by direct fetch (no model
// call; zero API spend). Facts written here are the page's words, at
// user_verified trust (70), so the nightly engine can still overwrite them
// with a quoted read but a routine re-enrich cannot silently revert them.
//
// `never_verified` is NOT touched: the 01:00 verify-rows cron reads never-read
// rows first and stamps `_page_read` itself. Forging that stamp is forbidden
// (see project_staged_rows_land_in_needs_reading).
//
//   npx tsx --env-file=.env.local scripts/needs-reading-2026-09-08.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'

const APPLY = process.argv.includes('--apply')
const SRC = 'user_verified:needs-reading-2026-09-08'
const PAUL = 'admin:paulkilty1@gmail.com'
const TODAY = '2026-09-08'

type Op = { id: string; label: string; source?: string; fields: Record<string, unknown>; mergeBrief?: boolean }

const reject = (id: string, label: string, code: Parameters<typeof formatRejectReason>[0], why: string, source = SRC): Op => ({
  id, label, source, fields: { is_active: false, pipeline_state: 'rejected', rejection_reason: formatRejectReason(code, why) },
})

const ops: Op[] = [
  // ── Paul's ruling, 8 Sept: no support-service rows ─────────────────────────
  ...[
    ['7303c672', 'Hackney CVS Organisational Development Support'],
    ['16ff2d0c', 'Macc Capacity Building Support'],
    ['e2676a6c', 'EVOC Free Advice and Governance Training'],
    ['6bf49d48', 'GCVS Funded Support'],
    ['3246ec33', 'Voscur One to One Support'],
    ['c0744eeb', 'Community Works Advice and Training'],
  ].map(([id, label]) => reject(id, label, 'out_of_scope',
    'Paul, 8 Sept 2026: an ongoing advice service reached by phone or contact form is not a catalogue row; no cohort, no round, nothing received', PAUL)),

  // ── Audience rule: individuals only ────────────────────────────────────────
  reject('ca9300c6', 'Churchill Fellowship', 'out_of_scope',
    'churchillfellowship.org, read 8 Sept 2026: "supports individual UK citizens"; the Fellowship is awarded to a person, no organisation applies'),
  reject('324d3776', 'Ashoka Fellowship', 'out_of_scope',
    'Fellowship for individual social entrepreneurs, entered by nomination; no organisation applies and nothing is granted to one'),

  // ── Duplicate and non-funders ──────────────────────────────────────────────
  reject('da74714c', 'Tech for Good Accelerator (BGV, duplicate)', 'duplicate',
    'same programme as 3e386cdc (Tech for Good Accelerator Programme); this row points at a 2025 news post on opportunitiesforyouth.org, not at BGV'),
  reject('efb34147', 'Young Foundation Social Innovation Support Programmes', 'non_funder',
    'youngfoundation.org homepage, read 8 Sept 2026: a research organisation; no fund, programme or application route on the page'),
  reject('45d5140a', 'Nationwide Foundation Grants Programme', 'out_of_scope',
    'nationwidefoundation.org.uk/available-funding, read 8 Sept 2026: "we are currently unable to accept unsolicited applications for funding"'),
  reject('93f38ed1', 'GLA Jobs and Skills Funding Opportunities', 'non_funder',
    'an index of GLA employment programmes (engine read 1 Sept 2026: wrong_fund); brief empty; each programme needs its own row if wanted'),
  reject('1cf9567c', 'Henry Smith Foundation: Career Ready', 'historical_deadline',
    'henrysmith.foundation/grants/career-ready, read 8 Sept 2026: "This grant is now closed"; EOI deadline was 2 September 2026; four-year grants, no further round announced'),

  // ── Fact fixes from the pages ──────────────────────────────────────────────
  { id: '95bb80db', label: 'Together we CAN Fund (Doncaster)', fields: {
    amount_min: null, max_org_income: 500000,
  } },

  { id: 'c99f4198', label: 'Festive Fund for Somerset', mergeBrief: true, fields: {
    eligible_structures: ['registered_charity', 'cio', 'unincorporated', 'ltd_guarantee', 'cic_guarantee'],
    target_beneficiaries: ['older_people', 'disabled_people', 'people_in_poverty'],
    is_rolling: false, deadline: null, next_open_date: 'Autumn 2026',
    description: 'Grants of up to £500 for charities, community groups, sports clubs and social enterprises in Somerset (not North Somerset or BANES) to cover food and festive activities that bring isolated people together in December and January. Closed; Somerset Community Foundation expects it to reopen in autumn 2026. Last year the window ran 29 September to 27 October.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'Somerset', last_enriched: TODAY, open_status: 'between_rounds',
      who_can_apply: 'Charities, community groups, sports clubs and social enterprises based in the county of Somerset (not North Somerset or Bath and North East Somerset). The group must have a governing document, a committee of at least three unrelated people, a bank account in its name and a safeguarding policy that meets the Foundation\'s standards. CICs are considered case by case; parish councils and schools only for non-statutory activity, and PTAs are preferred to schools.',
      decision_timeline: 'Closed on 8 September 2026. The Foundation says it expects to reopen in autumn 2026. The previous window opened Monday 29 September 2025 and closed Monday 27 October 2025 at 5pm, with money paid in late November or early December and spend reported by the end of January.',
      how_to_apply: 'When the fund opens, request the online form from the fund page; the Foundation emails a link. The form can be saved as a draft. Kirsty Campbell, Senior Programmes Manager, 01749 597127, helps with eligibility or if the online form cannot be used.',
    },
  } },

  { id: '6e6d726e', label: 'Robertson Trust Large Grants', fields: {
    impact_sectors: ['financial', 'education', 'employment', 'community'],
    target_beneficiaries: ['people_in_poverty', 'families'],
    is_rolling: true, deadline: null, next_open_date: '2026-09-14',
    min_org_income: 200000, max_org_income: 2000000,
    funder_brief: {
      source: 'live_fetch', is_local: false, location_tag: 'Scotland', last_enriched: TODAY, open_status: 'between_rounds',
      who_can_apply: 'Registered charities working in Scotland with an annual income of over £200,000 and up to £2 million, supporting people who are experiencing, or at high risk of, poverty and associated trauma. You need at least three unconnected trustees, recent independently examined or audited accounts, a bank account in the charity\'s name with two unconnected signatories, an equality, diversity and inclusion policy, and a safeguarding policy if you work with young or vulnerable people.',
      what_they_fund: 'Unrestricted or restricted revenue funding of £20,000 to £50,000 a year, typically for three years and up to five for work strongly aligned with the Trust\'s priorities. Equipment costs can be included. Work must sit under one of four themes: Financial Security, Education Pathways, Work Pathways, or Nurturing Relationships.',
      typical_award: '£20,000 to £50,000 a year, usually for three years.',
      exclusions: 'Organisations with income under £200,000 (see the Trust\'s Wee Grants and Small Grants) or over £2 million. Organisations that are not registered charities. Applications received during the pause from 27 May 2026 were not assessed.',
      priorities: 'Preventing and reducing poverty and associated trauma in Scotland, through financial security, learning and skills, fair work, and nurturing family and community relationships. The Trust funds immediate need but also wants longer-term solutions and better ways of working.',
      decision_timeline: 'Large Grants were paused to new applicants on 27 May 2026 after a surge in demand. The Trust announced on 31 August that the fund reopens on Monday 14 September 2026 with a new two-stage process: a light-touch initial enquiry, then a full application by invitation. Applications are considered on a rolling basis once open.',
      how_to_apply: 'From 14 September 2026, complete the initial enquiry form linked from the updated guidance on the Large Grants page. Current grant holders within the last six months of a grant should contact their Funding Officer.',
      funder_tips: 'The Trust paused this fund because AI-generated, generic applications were dragging its success rate down, and says so on the page. Show strong, specific alignment with one named theme and priority rather than a broad fit. The first stage is deliberately short, so the case for alignment has to land in a few sentences.',
      strong_application: 'Clear and intentional alignment to a priority within one of the four themes, evidence of leading or best practice if asking for more than three years, and a full job description where the request funds a salary.',
      geographic_focus: 'Scotland only.',
    },
  } },

  { id: 'cf29bfb0', label: 'Henry Smith Foundation: Maternity Equity', fields: {
    funder_type: 'trust_foundation', funding_type: 'grant', location_tag: 'UK', is_local: false,
    deadline: '2026-10-14', is_rolling: false, next_open_date: null,
    amount_min: 185000, amount_max: 185000, min_org_income: 20000, max_org_income: 1500000,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee'],
    impact_sectors: ['health', 'women', 'community'],
    target_beneficiaries: ['women_girls', 'ethnic_minorities', 'people_in_poverty', 'mental_health'],
    deadline_cycle: [
      { day: 14, month: 10, label: 'Expression of interest closes, 5pm' },
      { day: 4, month: 12, label: 'Full application deadline, by invitation, 5pm' },
    ],
    description: 'Three-year grants of £185,000 (£61,600 in year one, £61,700 in years two and three) for charitable organisations delivering preventative, trauma-informed and culturally safe maternity support during pregnancy and birth, for communities facing the greatest maternity inequities. Income £20,000 to £1.5 million. Expression of interest closes 14 October 2026, 5pm.',
    funder_brief: {
      source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Charitable organisations registered in and working in the UK: registered charities and CIOs, CICs that are not-for-profit with an asset lock, and other not-for-profit charitable organisations delivering work aligned with the Foundation\'s strategy. Annual income in the most recent published accounts must be between £20,000 and £1.5 million. Activity must take place in the UK.',
      what_they_fund: 'Flexible three-year grants to strengthen trusted, community-led organisations improving access, experience and outcomes during pregnancy and birth for Black, Asian, and Gypsy, Roma and Traveller communities, communities in areas of highest deprivation including rural areas, and people facing complex and multiple disadvantage including antenatal mental health needs. Organisations must use £2,500 to £5,000 of the grant each year on staff wellbeing.',
      typical_award: '£185,000 over three years: £61,600 in year one and £61,700 in years two and three. Around 35 grants will be made.',
      exclusions: 'Organisations whose work includes postnatal services can apply, but funding is restricted to preventative project costs only. One application per organisation. Income below £20,000 or above £1.5 million.',
      priorities: 'Preventative, trauma-informed and culturally safe maternity support from conception up to and including birth; lived experience in the design and leadership of the work; sharing learning with health professionals and other funded organisations.',
      decision_timeline: 'Expressions of interest open 3 September 2026 and close Wednesday 14 October 2026 at 5pm. The Foundation says in the week of 9 November whether to submit a full application, due Friday 4 December 2026 at 5pm, followed by a phone conversation between 7 and 18 December. Decisions by 5 February 2027.',
      how_to_apply: 'Take the online eligibility quiz on the fund page, then submit an expression of interest. A recording of the 2 September launch webinar, full funding guidelines and sample forms are on the page.',
      funder_tips: 'The Foundation reviews hundreds of expressions of interest and cannot give feedback, so the EOI must show proven experience with communities facing maternity inequities and a focus on pregnancy and birth rather than postnatal work. Say plainly which of the three named groups you serve.',
      strong_application: 'Proven track record with the named communities, meaningful involvement of lived experience in leadership, proportionate evidence of impact, and openness to shared learning through the Fund.',
      geographic_focus: 'UK-wide, with a focus on communities experiencing the greatest maternity inequities.',
    },
  } },

  { id: 'e18a0861', label: 'Forever Manchester Together Fund', fields: {
    eligible_structures: ['unincorporated', 'registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee'],
    max_org_income: 75000,
    description: 'Grants of up to £2,500 for small, locally controlled grassroots community groups in any of the ten Greater Manchester boroughs, with an annual income under £75,000, for projects that improve access to education, skills training and development opportunities. Closes midday, Thursday 24 September 2026.',
  } },

  { id: '3e386cdc', label: 'BGV Tech for Good Accelerator Programme', mergeBrief: true, fields: {
    amount_min: 60000, amount_max: 60000, is_rolling: false, next_open_date: 'November 2026',
    eligible_structures: ['ltd_shares'],
    description: 'Bethnal Green Ventures invests £60,000 upfront in early-stage tech for good ventures and takes them through a six-week hybrid programme in London, followed by six weeks of coaching. For-profit companies limited by shares only, incorporated in the UK; BGV cannot invest in CICs. Two cohorts a year; the autumn 2026 round is closed and the next opens in November.',
    funder_brief: { last_enriched: TODAY, open_status: 'between_rounds',
      decision_timeline: 'Applications for the autumn 2026 programme are closed. BGV says it opens applications for the next programme in November 2026; sign up on the apply page to be notified. Two cohorts a year of 10 to 15 companies.' },
  } },

  { id: '08a08c30', label: 'Peter Kershaw Trust: Ordinary Grants', mergeBrief: true, fields: {
    deadline: '2026-09-30', next_open_date: null, location_tag: 'Greater Manchester', is_local: true,
    description: 'Grants for social welfare in its broadest sense across Greater Manchester and North Cheshire, the operating area of the Joseph Holt brewery, with special consideration for pump-priming new work. No stated maximum. One window a year: applications by 30 September for the November meeting.',
    funder_brief: { last_enriched: TODAY, open_status: 'open', location_tag: 'Greater Manchester', is_local: true,
      geographic_focus: 'Greater Manchester and North Cheshire, the operating area of the Joseph Holt brewery. Grants go primarily to organisations in Greater Manchester.',
      who_can_apply: 'Organisations working in social welfare in Greater Manchester and North Cheshire. The page does not restrict applicants to registered charities, but the latest financial statements must be uploaded with the form.',
      decision_timeline: 'One grant window a year. Applications must be received by 30 September 2026 for the November 2026 meeting; anything later waits until the next year. All applications are acknowledged.' },
  } },

  { id: 'ded31718', label: 'Dorset Community Foundation Neighbourhood Fund', mergeBrief: true, fields: {
    eligible_structures: ['registered_charity', 'unincorporated', 'cic_guarantee', 'ltd_guarantee'],
    deadline: '2027-01-11', next_open_date: '2026-11-23', is_rolling: false, max_org_income: 250000,
    deadline_cycle: [
      { day: 23, month: 11, label: 'Winter round opens' },
      { day: 11, month: 1, label: 'Winter round closes, midday' },
    ],
    description: 'Grants of up to £5,000 (average £3,700) for grassroots community groups, charities, CICs limited by guarantee and not-for-profit companies in Dorset tackling local social issues, poverty and disadvantage. Two rounds a year; the winter round opens 23 November 2026 and closes midday 11 January 2027. Groups spending over £250,000 a year are not usually considered.',
    funder_brief: { last_enriched: TODAY, open_status: 'between_rounds',
      who_can_apply: 'Registered charities, constituted community and voluntary organisations, CICs limited by guarantee, and companies limited by guarantee with a clear not-for-profit clause and charitable or social objectives, based in Dorset. You need at least three unrelated people running the organisation, a bank account with two unrelated signatories, and safeguarding and EDI policies. The fund prioritises smaller groups: annual expenditure over £250,000 is not usually considered. Branches of national bodies can apply if financially and governance independent.',
      exclusions: 'Schools (PTAs can apply). Promotion of religion or political causes. Public bodies carrying out statutory obligations. Animal welfare organisations. Retrospective funding for items already bought or work already done. Organisations with more than 12 months of unrestricted reserves. Groups funded in the previous round.',
      decision_timeline: 'Two rounds a year. The summer 2026 round ran 1 June to 2 July. The winter round opens 23 November 2026 and closes at midday on 11 January 2027, with about £120,000 to distribute; in the last round 44 per cent of applicants were funded and the average grant was £3,700. Outcomes about six weeks after the closing date.' },
  } },

  { id: '9f87b6cf', label: 'Simon Gibson Charitable Trust', mergeBrief: true, fields: {
    eligible_structures: ['registered_charity', 'cio'],
    target_beneficiaries: ['young_people', 'older_people'],
    impact_sectors: ['community', 'heritage', 'environment', 'young_people', 'older_people'],
    location_tag: 'Suffolk, Norfolk, Cambridgeshire, Hertfordshire, Berkshire, South Wales', is_local: true,
    deadline: '2027-03-31', next_open_date: '2027-01-01', is_rolling: false,
    deadline_cycle: [
      { day: 1, month: 1, label: 'Application form opens' },
      { day: 31, month: 3, label: 'Application form closes, or earlier once oversubscribed' },
      { day: 31, month: 7, label: 'Successful applicants contacted by' },
    ],
    description: 'Core and project grants, typically £5,000 to £10,000 and up to £20,000, for UK registered charities delivering benefit in Suffolk, Norfolk, Cambridgeshire, Hertfordshire, Berkshire, Glamorgan, Gwent, Powys or Carmarthenshire, with a preference for the young, the elderly, heritage and the natural environment. The form is available 1 January to 31 March each year, or until oversubscribed. CICs are not funded.',
    funder_brief: { last_enriched: TODAY, open_status: 'between_rounds', location_tag: 'Suffolk, Norfolk, Cambridgeshire, Hertfordshire, Berkshire, South Wales',
      who_can_apply: 'UK registered charities, national or local, delivering benefits in Suffolk, Norfolk, Cambridgeshire, Hertfordshire, Berkshire, Glamorganshire, Gwent, Powys or Carmarthenshire. Both core funding and project funding are considered.',
      exclusions: 'Individuals, or organisations applying on behalf of individuals. Students seeking sponsorship. Conferences, seminars or workshops. Overseas charities, other than conservation charities or those known to the trustees. Community Interest Companies. Registered charities whose Charity Commission reporting was late in either of the last two years.',
      priorities: 'A preference for charities supporting the young, the elderly, heritage or the natural environment, in the Trust\'s focus regions.',
      geographic_focus: 'Suffolk, Norfolk, Cambridgeshire, Hertfordshire, Berkshire, and South Wales (Glamorganshire, Gwent, Powys, Carmarthenshire).',
      decision_timeline: 'The application form is available from 1 January until 31 March or until the Trust has more applications than it can process, whichever is earlier. Trustees meet in spring; successful applicants are contacted by 31 July. The next window opens 1 January 2027.' },
  } },

  { id: '9f87e023', label: 'Andrew Wainwright Reform Trust', fields: {
    eligible_structures: ['cic_guarantee', 'cic_shares', 'ltd_guarantee', 'ltd_shares', 'unincorporated', 'cooperative'],
    max_org_income: 250000,
  } },

  { id: 'b1a9dbcd', label: 'Alec Dickson Trust Grant', mergeBrief: true, fields: {
    deadline: '2026-10-04', next_open_date: null, is_rolling: false,
    eligible_structures: ['unincorporated', 'registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'individual'],
    deadline_cycle: [{ day: 4, month: 10, label: 'Application window closes, 5pm' }],
    description: 'Grants of up to £500 for youth volunteering projects organised and run by people aged 30 or under, individuals or groups, that enhance the lives of others, particularly those most marginalised. The current window closes 4 October 2026 at 5pm.',
    funder_brief: { last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Individuals or groups of young people aged 30 or under running a volunteering or community service project in the UK. Organisations can apply where the project is organised and run by people aged 30 or under.',
      typical_award: 'Up to £500.',
      exclusions: 'Overseas trips or gap year projects. Uniforms, equipment or training for personal benefit, such as university fees or a laptop for an individual. Direct expenditure on a fundraising event, such as venue hire.',
      decision_timeline: 'The application window is open and closes on 4 October 2026 at 5pm. Future rounds are announced on the Trust\'s X and Facebook accounts; the site was being rebuilt in September 2026 and its apply, FAQ and what-we-fund pages returned not found.' },
  } },

  { id: 'b99ad2bd', label: 'W.G. Edwards Charitable Foundation', mergeBrief: true, fields: {
    deadline: '2026-12-04', next_open_date: '2026-11-30', is_rolling: false, amount_min: 1000, amount_max: 1500,
    deadline_cycle: [
      { day: 30, month: 11, label: 'Application window opens' },
      { day: 4, month: 12, label: 'Application window closes' },
    ],
    description: 'Grants usually of £1,000 to £1,500 (around 100 a year) to UK registered charities improving the health and wellbeing of people over 65: refurbishment, equipment, innovative care schemes and projects that help older people live active lives. Applications by email only between 30 November and 4 December 2026; charities in areas of deprivation and arts and wellbeing projects are prioritised.',
    funder_brief: { last_enriched: TODAY, open_status: 'between_rounds',
      typical_award: 'Usually £1,000 to £1,500. Around 100 organisations a year are successful.',
      exclusions: 'Individuals, groups of people under 65, and overseas projects. Donations are not made for items or projects in retrospect.',
      decision_timeline: 'Applications are closed until 30 November 2026. Email your application between 30 November and 4 December 2026. Successful charities receive a donation in February 2027. Trustees meet quarterly and may carry an application over to the next meeting.',
      how_to_apply: 'Read the funding guidance and eligibility pages, then email the application during the 30 November to 4 December 2026 window as set out on the How to Apply page.' },
  } },

  { id: 'a06424c3', label: 'SSE Trading for Good: Bury', mergeBrief: true, fields: {
    deadline: null, next_open_date: 'Spring 2027', is_rolling: false, amount_min: 800, amount_max: 4000,
    eligible_structures: ['registered_charity', 'cio', 'unincorporated', 'cic_guarantee', 'cic_shares', 'ltd_guarantee'],
    funder_brief: { last_enriched: TODAY, open_status: 'between_rounds',
      typical_award: 'Match Trading grant of up to £4,000: £800 at the start, then instalments of up to £800 a quarter matching the growth in your trading income against the previous year.',
      exclusions: 'Organisations structured for private benefit. The grant cannot be spent on work unconnected to the project, ex-gratia payments, fines, entertainment for individuals, or dividends to private individuals during the programme. Organisations more than five years old, with flexibility case by case.',
      decision_timeline: 'Applications closed; SSE says they open again in spring 2027 for the North West programme running 30 November 2027 to 30 August 2028. Ten learning days over nine months, four in person in Bury.',
      how_to_apply: 'Register your interest on the programme page to be told when applications open in spring 2027.' },
  } },

  { id: '37a8f875', label: 'Ufi VocTech Trust', mergeBrief: true, fields: {
    amount_min: 10000, amount_max: 250000, is_rolling: false,
    funder_brief: { last_enriched: TODAY, open_status: 'closed',
      decision_timeline: 'No grant call was open on 8 September 2026. Ufi decides each year which calls to run and announces them through its community newsletter. VocTech Together: up to £10,000. VocTech Activate: £30,000 to £60,000. VocTech Challenge: £200,000 to £250,000. VocTech Ignite is by invitation.' },
  } },

  { id: '7948612a', label: 'Screwfix Foundation Grants', fields: {
    apply_url: 'https://www.screwfix.com/landingpage/screwfix-foundation', url_status: 'ok',
    amount_min: null, amount_max: 5000, is_rolling: true, deadline: '2026-11-10', next_open_date: null,
    eligible_structures: ['registered_charity', 'cio', 'scio', 'cic_guarantee', 'ltd_guarantee'],
    impact_sectors: ['housing', 'community', 'health'],
    target_beneficiaries: ['people_in_poverty', 'disabled_people', 'homeless'],
    deadline_cycle: [
      { day: 10, month: 2, label: 'Cut-off for the March panel' },
      { day: 10, month: 5, label: 'Cut-off for the June panel' },
      { day: 10, month: 8, label: 'Cut-off for the September panel' },
      { day: 10, month: 11, label: 'Cut-off for the December panel' },
    ],
    description: 'Grants of up to £5,000 for registered charities and not-for-profit organisations to repair, maintain, improve or construct buildings used by people in need through financial hardship, sickness, distress or other disadvantage. Applications reviewed quarterly; the cut-off is midnight on the 10th of the month before each March, June, September and December panel. Projects for the general public, such as community centres, sports clubs, uniformed groups and schools, are not funded.',
    funder_brief: {
      source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Registered charities and registered not-for-profit organisations in the UK or Republic of Ireland that help people in need through financial hardship, sickness, distress or other disadvantage, and have an online presence (website, Facebook or Instagram) showing their impact. The funding must go on the repair, maintenance, improvement or construction of a building, or land attached to it, used by people in need.',
      what_they_fund: 'Practical building work: fixing, repairing, maintaining and improving homes, community buildings and other facilities used by people in need. The Foundation prioritises projects it can fund in full and that directly and lastingly benefit people in need.',
      typical_award: 'Up to £5,000 (or €5,000) per project. The Foundation describes its funding as "in the region of £5,000".',
      exclusions: 'Projects that benefit the general public rather than people in need: community centres, sports clubs and associations, uniformed groups such as scouts and guides, and schools. Organisations funded by the Foundation within the last two years. Funding that cannot be used within 12 months of award.',
      priorities: 'Projects funded in full by the grant, with a direct and lasting benefit to people in need.',
      decision_timeline: 'Rolling, reviewed quarterly at trustee meetings in March, June, September and December. Cut-off is midnight on the 10th of the month before the meeting: applications received 11 August to 10 November 2026 are reviewed in December with outcomes by 30 December; 11 November to 10 February for March.',
      how_to_apply: 'Read the eligibility criteria on the Screwfix Foundation landing page, then apply through the online portal at foundationapplication.screwfix.com. Applications can be saved and returned to before submission.',
      funder_tips: 'The Foundation is oversubscribed every quarter and says it prioritises projects it funds in full, so a whole small building job beats a contribution to a large one. Have the impact report from any previous Screwfix grant complete before reapplying, or the application is rejected.',
      strong_application: 'A clearly costed repair or improvement to a building used by people in need, deliverable within 12 months, with photos or a web presence showing who uses it.',
      geographic_focus: 'UK-wide, and the Republic of Ireland since 2025.',
      _citations: {
        typical_award: { snippet: 'We provide grants up to £5,000/€5,000 per project', confidence: 'high', source_url: 'https://foundationapplication.screwfix.com/en' },
        who_can_apply: { snippet: 'Be a registered charity or registered not for profit organisation. Help people in need.', confidence: 'high', source_url: 'https://foundationapplication.screwfix.com/en' },
        exclusions: { snippet: 'We do not support projects that will benefit the general public i.e. community centres, sports clubs and associations, uniformed groups such as scout and girl guide groups, or schools', confidence: 'high', source_url: 'https://foundationapplication.screwfix.com/en' },
        decision_timeline: { snippet: 'The cut off date for applications will be midnight on the 10th of the month prior to the Trustee meeting', confidence: 'high', source_url: 'https://foundationapplication.screwfix.com/en' },
      },
    },
  } },
]

async function main() {
  const db = getAdminDb()
  const ids = ops.map(o => o.id)
  // Prefixes cannot be LIKE-matched on a uuid column, so pull the queue and match locally.
  const { data: rows, error } = await db.from('scraped_grants').select('id, title, pipeline_state, is_active, funder_brief')
    .in('pipeline_state', ['captured', 'enriched', 'tagged', 'tagged_awaiting_review', 'published', 'rejected']).limit(2000)
  if (error) { console.error(error.message); process.exit(1) }
  const byPrefix = new Map((rows ?? []).filter(r => ids.includes(r.id.slice(0, 8))).map(r => [r.id.slice(0, 8), r]))
  if (byPrefix.size !== ids.length) { console.error(`expected ${ids.length} rows, found ${byPrefix.size}`); process.exit(1) }

  let applied = 0, rejected = 0
  for (const op of ops) {
    const row = byPrefix.get(op.id)!
    const fields = { ...op.fields }
    if (op.mergeBrief) fields.funder_brief = { ...(row.funder_brief ?? {}), ...(op.fields.funder_brief as object) }
    console.log(`\n== ${op.id} ${op.label}  [${row.pipeline_state}]`)
    console.log('   ' + Object.keys(fields).join(', '))
    if (!APPLY) continue
    const r = await mergeGrantUpdate({ id: row.id, source: op.source ?? SRC, db, fields })
    applied += r.applied.length; rejected += r.rejected.length
    if (r.rejected.length) console.log('   REJECTED: ' + r.rejected.map(x => `${x.field}:${x.reason}${x.blockedBy ? " held by " + x.blockedBy.source + "@" + x.blockedBy.trust : ""}`).join(', '))
    else console.log('   applied ' + r.applied.length)
  }
  console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'}: ${ops.length} rows, ${applied} fields applied, ${rejected} rejected`)
}
main()

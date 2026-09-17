// Second pass over the fifteen rows staged from the 9 September newsletter
// (scripts/newsletter-stage-2026-09-12.ts), on Paul's ask: "review them again
// and make sure they are enriched as best as you can". Every line below comes
// from a page or guidance PDF fetched in this session by direct fetch; no
// model call. Britford Bridge and Elmgrant are left alone (browser work).
//
// Adds the four insight fields the review bar tests for, corrects the Davies
// row from its 2026 guidelines, adds guidance-PDF detail to ECB, Tippett and
// Baptist, sets niche tags from the profile taxonomy, and widens two
// beneficiary lists. Brief keys are only added or lengthened.
//
//   npx tsx --env-file=.env.local scripts/newsletter-enrich-2026-09-12.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const SRC = 'system:newsletter-enrich-2026-09-12'
const TODAY = '2026-09-12'

type Brief = Record<string, string>
type Fields = Record<string, unknown>
type Patch = { brief: Brief; fields?: Fields }

const P: Record<string, Patch> = {
  'ECB County Grants Fund 2026': {
    brief: {
      priorities: 'Clubs actively engaged with women\'s, girls\' or disability cricket, to create welcoming environments or enhanced playing and changing facilities and grow the number of women\'s, girls\' and disability teams. Priority to clubs with an established women\'s section, a girls\' section or disability cricket, or delivering Girls\' Only Dynamos, Dynamos for Girls Activation, Disability Champion Club or Disability Premier League host programmes in 2025/2026.',
      geographic_focus: 'ECB-affiliated clubs in England and Wales, including clubs affiliated nationally through the African Caribbean Cricket Association or the National Asian Cricket Council.',
      funder_tips: 'One grant per ECB budget year (1 February to 31 January) and no second grant for the same project before 2028. No minimum partnership funding, but club funds, other grants, sponsorship or evidenced in-kind labour and materials may positively influence the county board\'s decision. The county board assesses within 30 days, then ECB approves; projects must be complete and claimed by 31 January 2027. Check planning early: clubs are non-domestic premises and a planning decision takes about 12 weeks.',
      strong_application: 'Evidence of a women\'s or girls\' team with at least three competitive fixtures on Play-Cricket, or Dynamos for girls on ClubSpark, or Disability Champion status. The club\'s constitution, insurance, at least a one-year lease or rental agreement, last year\'s accounts, a compliant Safe Hands safeguarding officer and adopted Safe Hands and anti-discrimination policies. Two named authorised signatories registered on the IMS portal.',
      exclusions: 'Projects already funded by an ECB or EWCT grant or loan; reconditioned or second-hand goods; professional fees such as legal, architect, surveyor, planning or third-party consent; retrospective funding; non-turf pitches without a full supplier warranty for an ECB Approved system.',
    },
    fields: { niche_tags: ['cricket', 'women_in_sport', 'disability_sport'] },
  },

  'National Churches Trust — Medium Grants': {
    brief: {
      priorities: 'Urgent and essential maintenance and repair of existing church buildings, and project development and investigative works such as condition surveys, governance advice, business planning and conservation statements.',
      geographic_focus: 'England, Northern Ireland, Scotland, Wales, the Isle of Man and the Channel Islands.',
      funder_tips: 'Fourteen eligibility questions gate the form: the building must be a Christian place of worship, over 30 years old, open to the public at least 100 days a year, professionally led, with permissions in place, two contractor quotes and at least 50 per cent of this phase already raised. Read the guidance document first, which explains the scoring, and take one of the free online training sessions. The average award is about £6,000 because the programme is competitive.',
      strong_application: 'A project costing up to £80,000 led by an architect or surveyor (conservation-accredited for a listed building), with half the money already raised, permissions granted, two quotes attached and safeguarding policies in place. Places of worship with income over £100,000 must be registered with the charity regulator.',
    },
    fields: { niche_tags: ['built_heritage', 'faith_community'] },
  },

  'Riverhorse Trust Grants': {
    brief: {
      priorities: 'Small UK charities that deliver impactful services today (relief) or contribute to long-term solutions (change), show evidence of organisational strength or a clear commitment to build it, and want to invest in their own sustainability rather than only in short-term activity.',
      geographic_focus: 'UK-registered charities providing services in the UK.',
      funder_tips: 'The Trust treats grants as investments and does not dictate their use, so make the case for the organisation rather than a project. Strength, in its own words, means good governance, financial resilience through diverse income, people and culture, operational effectiveness, data and learning, and visibility and communication. Two rounds: autumn closes end of September, spring end of February. Download the form from the Make an Application page.',
      strong_application: 'A registered charity with income under £100,000 that can show the difference its services make and name one or two ways it plans to build resilience with flexible money. CICs and unregistered groups are not funded.',
    },
  },

  'The Supporting Act Foundation — Impact Grant 2026': {
    brief: {
      priorities: 'Arts-focused nonprofits that give non-financial support to emerging artists from underrepresented groups: improving artists\' living conditions, freeing time for their practice, raising the visibility of their work and building their confidence.',
      geographic_focus: 'Organisations based in, or with a fiscal host in, Belgium, France, Germany, Greece, Ireland, Italy, the Netherlands, Portugal, Spain or the United Kingdom.',
      funder_tips: 'Read the open call guide and the preview of the form before starting; eligibility is tight (registered 2016 to 2024, annual expenditure between €50,000 and €300,000, a current website with public evidence of active projects). Applications are reviewed in October, everyone hears in late October, shortlisted organisations have a final review in November, and the first instalment is paid in January 2027.',
      strong_application: 'A young arts organisation with a track record of practical support for emerging artists from underrepresented groups, whose website shows the work, asking for unrestricted money to strengthen that support rather than to fund a single project.',
      decision_timeline: 'Closes 1 October 2026 at 11.00am CET. Review in October 2026, notifications to all applicants in late October, final review of shortlisted applicants in November, public announcement and first instalment in January 2027.',
    },
    fields: { niche_tags: ['visual_arts'] },
  },

  'BCP Homelessness Prevention Fund': {
    brief: {
      priorities: 'Early intervention and prevention: upstream support for people at higher risk of homelessness, shortening stays in temporary accommodation or hidden homelessness, and tenancy sustainment for people moving into independent housing. Priority to organisations that work with young people, work in partnership with other providers, and involve people with lived experience in designing services.',
      geographic_focus: 'Bournemouth, Christchurch and Poole; organisations local to Dorset are prioritised.',
      funder_tips: 'Grants run six to 24 months, and a request over £15,000 must run at least 12 months. The earliest start date is 1 December 2026 and decisions come at the end of November. An online end-of-grant report is required, with a midpoint report for grants over 12 months. Organisations holding more than 12 months of unrestricted reserves are usually not funded.',
      strong_application: 'A costed intervention in one of the three areas with a clear route to preventing or ending homelessness, evidence of partnership with other local providers, lived-experience involvement, and the governance basics: three unrelated people in charge, a constitution, a bank account with two unrelated signatories, safeguarding and EDI policies.',
      decision_timeline: 'Closes midday, Thursday 1 October 2026. Decisions by the end of November 2026; the earliest start date for activities is 1 December 2026.',
    },
    fields: { niche_tags: ['homelessness_prevention', 'supported_housing', 'housing_advice'], target_beneficiaries: ['homeless', 'people_in_poverty', 'young_people'] },
  },

  'easyfundraising Impact Fund, autumn 2026': {
    brief: {
      priorities: 'Practical needs where £1,000 makes the clearest difference: equipment, resources, volunteer costs, event expenses, small projects or essential day-to-day costs. Assessed on clarity, community impact, reach and lasting benefit.',
      geographic_focus: 'UK organisations only; recipients are chosen across a range of categories and geographical areas.',
      funder_tips: 'A request for a specific item does not score more highly than a request for core costs, but "general running costs" is hard to assess: say what the £1,000 covers, for example venue hire for a weekly support group or a defined period of operating costs. Reach is not only numbers; the depth of benefit and the needs of the people supported count. Spring 2026 applicants may apply again. Winners are emailed within 28 days of the close and paid by bank transfer within 28 days after that; no individual feedback is given.',
      strong_application: 'A clear, realistic explanation of what the £1,000 funds and the difference it makes, a description of who benefits and roughly how many, and evidence the grant strengthens ongoing work or creates a benefit that outlasts the spend.',
    },
  },

  'Michael Tippett Musical Foundation Grants': {
    brief: {
      priorities: 'Group music-making, especially projects that involve young people in composing and developing creative ideas. Composing must be central; projects for young composers at postgraduate or early professional level qualify if they develop talent through group musical activity. Composing competitions are not a priority.',
      geographic_focus: 'Projects based in the UK, in or out of school, college or university, or in community settings.',
      funder_tips: 'Apply by email with a covering note naming the organisation, the sum requested and two referees, a project description of no more than two A4 pages, and a one-page budget showing all income sources. Name the artistic leaders and say who manages the schedule, participants and evaluation; a completion report with participant ethnicity, age, gender and socio-economic data is required. Only a minority of applications succeed, and Trustees are cautious about a small grant towards a much larger budget.',
      strong_application: 'A project that opens young people\'s ears and gives young composers a springboard, aiming for high-quality music-making, with named and experienced artistic leadership, a plan to recruit a diverse range of participants, and a clear plan for management and evaluation from the start.',
    },
    fields: { niche_tags: ['music'] },
  },

  'Creative Scotland — Touring Fund for Theatre and Dance': {
    brief: {
      priorities: 'Bringing high-quality professional theatre and dance to more places and people across Scotland, including outdoor, circus, interdisciplinary and site-specific work; reducing risk for producers by covering all touring costs and for venues by offering tours on a no-fee basis with an 80/20 box office split in the venue\'s favour.',
      geographic_focus: 'Applicants based in Scotland, touring within Scotland to venues signed up to the Federation of Scottish Theatre Code of Practice.',
      funder_tips: 'Decisions are expected the week commencing 7 December 2026. Tours must visit more than three locations and cannot count Edinburgh Fringe or International Festival dates in the application. Venue hire is generally ineligible, and letters of support from venues are not considered, but you must state the anticipated number of venues and why. Artists or companies can submit two applications for different productions; the same tour can be resubmitted up to three times. Book a surgery slot with the theatre or dance team before applying and submit well before 2pm on the deadline day, as late submissions are refused.',
      strong_application: 'A professional production with appropriately paid leads, a tour timeline with planning time, a rationale for the venues chosen from Tourbook and the FST cohort, financially and environmentally efficient touring, a full budget on the template, a risk assessment, constitutional and EDI documents, and a safeguarding policy if the tour involves children, young people or protected adults.',
      exclusions: 'Applicants outside Scotland or touring outside Scotland; Multi-Year Funded Organisations funded to make and tour theatre or dance as lead applicant; student and non-professional companies; work made by young people, youth companies or dance schools; early-stage R&D that will not tour; productions visiting three or fewer locations; performances only in schools, day centres or care homes; online or digital-only work; applicants relying on a pending Creative Scotland Open Fund application.',
      decision_timeline: 'Application deadline 2pm, Wednesday 30 September 2026. Decisions the week commencing 7 December 2026. No defined touring period; a further round is anticipated in 2027.',
    },
    fields: { niche_tags: ['theatre', 'dance', 'circus_street'] },
  },

  'The Gwendoline and Margaret Davies Charity': {
    brief: {
      priorities: 'Arts, education, health and social action in Wales, with a focus on young people, rural communities and the South Wales valleys. Trustees particularly welcome applications for participation in the arts by young people and those in rural areas. Small charities run by volunteers are particularly welcome in the Small Grants Fund.',
      geographic_focus: 'Charities based in Wales, or projects for the benefit of people living in Wales. Large national charities working across England and Wales are not considered.',
      funder_tips: 'Two routes. Main Grants (£2,000 to £10,000, most £2,000 to £5,000, average £3,500) fund projects, activities, capital, equipment and resources but not core or running costs; charities need average income under £1 million, and start dates at least 2.5 months after the closing date. Small Grants (up to £2,000 a year) do fund core and running costs, for charities with average income under £100,000; start at least 1.5 months after the close. One application in any 12 months, and no further application until the end-of-grant report is in. The Charity spends around £300,000 a year.',
      strong_application: 'For a Main Grant: a 100-word summary and a 500-word description covering how the charity operates in Wales, what it will do, the identified need, who benefits and how many, matched funding and reserves, and how success will be measured, with a budget and annual accounts. For a Small Grant: a two-page letter with charity details and number, the project, who the service users are, a basic budget, previous funding and a named contact.',
      who_can_apply: 'Charities registered with the Charity Commission, based in Wales or running projects for people living in Wales, that have not applied within the previous 12 months. Main Grants: average annual income under £1 million. Small Grants: average annual income under £100,000; two-year unrestricted funding of up to £4,000 only for charities with income under £50,000 previously funded more than once.',
      typical_award: 'Main Grants £2,000 to £10,000; most awards are £2,000 to £5,000 and the average is £3,500. Small Grants up to £2,000 for one year, or up to £4,000 over two years for previously funded charities with income under £50,000.',
      exclusions: 'Large national UK charities working across England and Wales; schools and PTAs; nurseries and family centres; foodbanks or similar. Bursaries or grants to individuals; medical research; activities focused on specific medical conditions; work in prisons; retrospective applications. Main Grants do not fund core or running costs.',
      decision_timeline: 'Main Grants close at the end of January, May and September, with Trustee decisions in March, July and November and a response within two weeks of the meeting. Small Grants close at the end of February, April, June, August, October and December, decided at bi-monthly meetings. Applications are acknowledged within a month.',
    },
    fields: {
      niche_tags: ['music', 'visual_arts', 'place_based'],
      funding_subtypes: ['restricted', 'small_grant', 'capital', 'core_costs'],
      target_beneficiaries: ['general_public', 'rural_communities', 'young_people'],
      description: 'Main Grants of £2,000 to £10,000 (most £2,000 to £5,000, average £3,500) and Small Grants of up to £2,000 from the Gwendoline and Margaret Davies Charity for Charity Commission registered charities based in Wales or benefiting people in Wales, supporting the arts, education, health and social action with a focus on young people, rural communities and the South Wales valleys. Main Grants fund projects, capital, equipment and resources, not core costs, for charities with income under £1 million; Small Grants also cover core and running costs, for charities with income under £100,000. Not large national charities, schools, nurseries or foodbanks. Main Grants close at the end of January, May and September; Small Grants at the end of every even month.',
    },
  },

  'Baptist Insurance Grants': {
    brief: {
      priorities: 'Community outreach focused on people becoming followers of Christ, staffing costs for people whose primary role is evangelism, church planting, and pioneering, creative or new forms of evangelism that reach people who have not heard the Gospel. Do not apply if evangelism is not the primary focus.',
      geographic_focus: 'Baptist churches in the UK. Overseas work is not funded because the allocation is already committed through BMS World Mission and the European Baptist Federation.',
      funder_tips: 'Grants usually £2,000 to £20,000 with an average under £10,000, normally single-year, so show the work has long-term sustainability. The Board expects evidence that the wider Baptist family, including the Regional Association, supports the work, and will ask for it. Accounts showing a clear ability to self-fund make success unlikely. Climate impact is considered. Use a 12pt font and keep answers concise; an unsuccessful church cannot reapply within twelve months.',
      strong_application: 'A church-led outreach or church plant with evangelism at its core, a named Regional Association endorsement, a modest ask relative to the church\'s own reserves, and a plan for the work to continue after the grant.',
      exclusions: 'Regular pastoral ministry and routine activities such as Sunday Schools or small groups; building projects, routine maintenance or equipment; overseas projects; individuals and individuals\' studies. A further request within twelve months of an unsuccessful one.',
    },
    fields: { niche_tags: ['faith_community'] },
  },

  'The Robert Clutterbuck Charitable Trust': {
    brief: {
      priorities: 'Armed Forces personnel and ex-service men and women; sport and recreational facilities for young people; the welfare, protection and preservation of domestic animal life; natural history and wildlife; and hospices, churches, schools, health and social welfare charities associated with Cheshire and Hertfordshire. Cheshire and Hertfordshire take priority in the youth sport and animal welfare categories.',
      geographic_focus: 'UK charities, with priority to Cheshire and Hertfordshire.',
      funder_tips: 'No form: write to the Secretary, Mr George Wolfe, 28 Brookfields, Calver, Hope Valley, Derbyshire S32 3XB, or secretary@clutterbucktrust.org.uk, saying what the grant would buy and the charity\'s current financial position. Rounds close 30 June and 31 December and Trustees generally meet in March and September, so allow up to nine months. Ask for a specific item rather than running costs, and keep the request between £1,000 and £3,000.',
      strong_application: 'A charity with turnover of £500,000 or less (Service welfare charities excepted) in one of the five categories, asking for a named item with its cost, and not within two years of a previous Clutterbuck grant.',
      decision_timeline: 'Deadlines for the rounds of applications are 30 June and 31 December each year; the Trustees generally meet in March and September.',
    },
    fields: { niche_tags: ['biodiversity', 'faith_community', 'end_of_life_care'] },
  },

  'Arts Council of Northern Ireland — Arts and Older People Programme': {
    brief: {
      priorities: 'Strengthening the voice of older people and promoting positive mental health and emotional wellbeing through greater participation in the arts. Partnership or consortia-based projects are sought, and applicants must show the partnership approach with the older people\'s groups they plan to engage and have their support in delivery.',
      geographic_focus: 'Northern Ireland.',
      funder_tips: 'Online only: every mandatory enclosure goes in at the same time as the form, in Word, Excel or PDF, up to 25 Mb in total. Organisations in breach of previous Arts Council grant conditions, or with an incomplete award from 2024/25 or earlier, are not eligible, so close out old grants first.',
      strong_application: 'A community group or arts organisation with a named older people\'s partner, evidence the partner has shaped the project and supports its delivery, and a clear line from arts participation to older people\'s voice, mental health and wellbeing.',
      exclusions: 'Individuals or sole traders; broadcasters other than community service broadcasters; central government departments; organisations with a statutory obligation to provide services for older people; organisations in breach of previous Arts Council award conditions or with incomplete awards from 2024/25 or earlier.',
    },
    fields: { niche_tags: ['age_friendly', 'social_isolation', 'adult_mh'] },
  },

  'Arts Award Access Fund': {
    brief: {
      priorities: 'Registered Arts Award centres working with young people who experience barriers to access and inclusion, using the grant to pilot, embed or develop their Arts Award work with these groups.',
      geographic_focus: 'Registered Arts Award centres anywhere in the UK.',
      funder_tips: 'Only registered centres can apply, through the centre portal during an open round; register the centre and enrol young people first. Decisions are emailed three to four weeks after the closing date, and money cannot be provided for anything needed within six weeks of the deadline. Access costs such as BSL interpreters or assistive technology specific to the project are eligible where renting is not cost-effective.',
      strong_application: 'A costed Arts Award project (arts logs, workshop fees, materials, travel, adviser time, qualification fees) with a named group of young people facing barriers, and a plan to keep Arts Award running with that group after the grant.',
    },
    fields: { niche_tags: ['accessibility'] },
  },
}

async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  // The fifteen ids stamped by scripts/newsletter-stage-2026-09-12.ts; a jsonb
  // column cannot be pattern-matched through PostgREST, so they are listed.
  const IDS = [
    '2580770c-08e4-48a7-bfcf-723694be95f8', '5d891029-1fbc-48ac-b1c8-71d9a841c461', '15887f4f-eaf6-4a0d-85a6-1887210c4124',
    '24cb0e24-3660-41a9-860d-646a424082d7', 'e90f7aa3-a6ce-4450-8cb4-d39232880824', '0dc7a203-3702-4ddf-aeb6-26dbaf4756e7',
    '3e0f10fd-1572-4a70-9172-e9971e321a38', '96d9bbe3-0339-417e-af1d-79c5ea9c3d55', '17ebe5bc-fca6-4e43-b2db-7681b505251c',
    'eebabceb-e252-491b-973e-63115b4283d8', 'cef2a39a-9a27-46bf-9ed5-d6fa0c245aca', '04577256-b429-4dd3-8379-293c4534b65e',
    '0445f873-940f-4121-a031-c3fcc4af863f', '36287144-6487-4246-8ad3-b6a66f28d6ba', 'e90aa4cb-4842-4c4c-aa56-e3b26afb1058',
  ]
  const { data, error } = await db.from('scraped_grants').select('id, title, funder_brief, niche_tags, target_beneficiaries, funding_subtypes, description')
    .in('id', IDS)
  if (error) throw error
  type R = { id: string; title: string; funder_brief: Record<string, unknown> | null; niche_tags: string[] | null; target_beneficiaries: string[] | null; funding_subtypes: string[] | null; description: string | null }
  const rows = (data ?? []) as R[]
  if (rows.length !== 15) throw new Error(`expected 15 newsletter rows, read ${rows.length}`)
  let n = 0
  for (const [title, patch] of Object.entries(P)) {
    const row = rows.find(r => r.title === title)
    if (!row) { console.log('  NOT FOUND:', title); continue }
    const existing = row.funder_brief ?? {}
    const merged: Record<string, unknown> = { ...existing, last_enriched: TODAY }
    const added: string[] = []
    for (const [k, v] of Object.entries(patch.brief)) {
      const cur = typeof existing[k] === 'string' ? (existing[k] as string) : ''
      if (v.length > cur.length) { merged[k] = v; added.push(k) }
    }
    const fields: Fields = { funder_brief: merged }
    for (const [k, v] of Object.entries(patch.fields ?? {})) {
      const cur = JSON.stringify((row as unknown as Record<string, unknown>)[k] ?? null)
      if (cur !== JSON.stringify(v)) { fields[k] = v; added.push(k) }
    }
    console.log(`  ${title}: +${added.join(',') || 'nothing'}`)
    if (!APPLY || added.length === 0) continue
    const r = await mergeGrantUpdate({ id: row.id, source: SRC, db, fields })
    const bad = r.rejected.filter(x => x.reason !== 'idempotent')
    if (bad.length) console.log('     BLOCKED', bad.map(x => x.field + ':' + x.reason).join(','))
    else n++
  }
  console.log(`${APPLY ? 'enriched' : 'would enrich'} ${APPLY ? n : Object.keys(P).length}`)
}
main().catch(e => { console.error(e); process.exit(1) })

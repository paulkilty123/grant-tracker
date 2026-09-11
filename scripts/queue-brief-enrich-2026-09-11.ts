// Brief enrichment for the review queue, 11 Sept 2026, on Paul's ask: "many
// of the ready to publish rows have thin funder insights". Every field below
// is written from page text fetched in this session; no model call. Merged at
// user_verified trust, keeping existing keys and only adding or lengthening
// the four insight fields (priorities, funder_tips, strong_application,
// geographic_focus) plus any thin timing, award or how-to-apply text.
//
//   npx tsx --env-file=.env.local scripts/queue-brief-enrich-2026-09-11.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const UV = 'user_verified:queue-brief-enrich-2026-09-11'
const TODAY = '2026-09-11'

type Patch = Record<string, string>
const P: Record<string, Patch> = {
  // ── Scotland ──────────────────────────────────────────────────────────────
  'Bank of Scotland Foundation Energise': {
    priorities: 'Small Scottish charities that put vulnerable people at the heart of what they do. Unrestricted money, so the Foundation is backing the organisation rather than a project.',
    geographic_focus: 'Scotland only: the charity must be registered with a charity number beginning SC0.',
    funder_tips: 'The whole case is made in a one-page summary of 500 words, so write it for a reader who has two minutes. Have the OSCR-lodged accounts and the constitution ready as PDFs; the window is nine days and the new system needs extra time.',
    strong_application: 'Show who the vulnerable people are, what changes for them, and why unrestricted money matters to a charity of your size. Be inside the income band and have the year of accounts at OSCR before you start.',
  },
  'RS Macdonald Charitable Trust Small Grants': {
    priorities: 'Four themes: tackling child abuse and neglect, visual impairment and sight loss, neurological conditions, and animal welfare. Small grants favour small, community-based, often volunteer-led initiatives.',
    geographic_focus: 'Work that benefits people who live in Scotland.',
    funder_tips: 'Small grants are assessed as they arrive, so there is no round to wait for. Running costs are capped at £10,000 a year even though the total can reach £20,000; a one-off item such as equipment or a service evaluation can take the full amount.',
    strong_application: 'Name the theme you sit in and the people in Scotland who benefit, and keep the ask proportionate to a small, volunteer-led organisation. Attach the most recent audited or independently examined accounts.',
  },
  'Cruden Foundation Appeals': {
    priorities: 'Community welfare, medical support and research, the arts, education and conservation, with a focus on charities operating in or benefiting the Central and South regions of Scotland.',
    geographic_focus: 'Scotland, with a stated focus on the Central and South regions.',
    funder_tips: 'The Foundation has tended to give lower amounts to a wider range of charities, so a modest, well-defined ask fits better than a large one. One appeal per financial year, August to July, so choose the meeting to aim for.',
    strong_application: 'A revenue project with a clear beneficiary in Scotland; capital builds and work that is a health or education authority\'s job tend not to be supported. Attach the latest accounts.',
  },
  'Nancie Massey Charitable Trust': {
    priorities: 'The arts, health and wellbeing, education and lifelong learning, and reducing isolation, with priority for community-based charities helping children, young people and older people facing difficult circumstances.',
    geographic_focus: 'Edinburgh and the Lothians.',
    funder_tips: 'The form is issued on request by email, so write early; trustees favour community-based charities with income up to £500,000 and most grants are one-year and up to £5,000. Medical research is by invitation only.',
    strong_application: 'A local Edinburgh or Lothians charity with a specific piece of work in one of the four themes, costed to about £5,000, showing the people helped and why the year of funding matters.',
  },
  'W A Cargill Fund': {
    priorities: 'Work beneficial to the community in Glasgow and the West of Scotland: prevention or relief of poverty, education, health, citizenship and community development, and relief of need through age, ill health, disability or hardship. Capital and revenue both considered.',
    geographic_focus: 'Glasgow, North Ayrshire, East and West Dunbartonshire, Inverclyde, Renfrewshire, Argyll and Bute, and the Western Isles.',
    funder_tips: 'There is no website and no form: a letter to the Fund at Miller Beckett and Jackson with a statement of aims and the latest audited accounts is the whole application. Trustees meet quarterly, so allow up to three months.',
    strong_application: 'A short, plain letter that says what the charity does, who in the West of Scotland benefits, and what the grant would pay for, with audited accounts attached.',
    exclusions: 'Work outside the West of Scotland; the Fund does not publish other exclusions.',
  },
  'James T Howat Charitable Trust': {
    priorities: 'Projects for the benefit of Glasgow and its citizens first: arts and culture, education and training, health and wellbeing, mental health, sport, social care and respite, for children, young people, older people, families and disabled people.',
    geographic_focus: 'Glasgow primarily; the central belt and Argyll and the Isles also considered; other Scottish or UK projects for small grants applied locally.',
    funder_tips: 'Written applications to Harper Macleod LLP, no more than a single A4 sheet, by the middle of the month before a quarterly meeting in March, June, September or December. Grant sizes are not published, so ask for what the project needs and say so.',
    strong_application: 'One page that names the Glasgow beneficiaries, the activity and the cost, with accounts or a business plan and the governing document attached.',
    exclusions: 'Not stated by the Trust.',
  },
  'Gordon and Ena Baxter Foundation Grants': {
    priorities: 'Capital projects in five themes: health and wellbeing including nutrition, arts and heritage, conservation and the environment, education, and amateur sport with youth development.',
    geographic_focus: 'Moray, Aberdeenshire, Aberdeen City, the Highlands, the Western Isles, Orkney and Shetland.',
    funder_tips: 'Capital only, so the application is for a thing rather than an activity. Most awards are £1,000 to £10,000. Complete the eligibility quiz first; the last 2026 deadline is 30 October with outcomes in early December.',
    strong_application: 'A costed capital purchase with a sound management plan, evidence of local support and fundraising, and a clear benefit to the community. Retrospective costs and routine repairs are out.',
  },
  'Highland Small Grants Programme': {
    priorities: 'Two priorities: making community-run assets stronger, warmer and more sustainable, and short-term community-led projects that reduce barriers from poverty and isolation for children, young people and families.',
    geographic_focus: 'Eligible rural Highland areas; check the eligibility map on the council page.',
    funder_tips: 'All activity must be complete by February 2027, so the earlier the application the longer the delivery window. The programme funds organisational sustainability as well as projects.',
    strong_application: 'A deliverable plan inside the timescale, tied to one of the two priorities, from a not-for-profit or community-led organisation in a rural Highland area.',
  },
  'Highland Nature Restoration Fund Community Grants': {
    priorities: 'Capital projects that restore nature and biodiversity: wildflower meadows, tree planting, wetland creation and the removal of invasive species.',
    geographic_focus: 'Highland Council area.',
    funder_tips: 'Capital only and assessed on a rolling basis since 14 August 2026. If your governance structure is not on the eligible list, contact nrf@highland.gov.uk before applying.',
    strong_application: 'A specific site, a specific habitat outcome, and a capital budget between £2,000 and £25,000 from a constituted community group, charity, co-operative or development trust.',
  },
  'Scotmid Community Grant': {
    priorities: 'Children and education, health, homelessness and poverty, arts and culture, environment, older people, and active lifestyles, in communities around Scotmid stores.',
    geographic_focus: 'Communities served by a Scotmid store, within one of its regional committee areas.',
    funder_tips: 'Apply at least eight weeks before the money is needed; there is no deadline but there is a lead time. Small and one-off, so a single item or event fits best.',
    strong_application: 'Name the store community, the one thing the £500 buys, and who in that community benefits.',
  },
  'Corra Racial Equity Fund': {
    priorities: 'Unrestricted funding for organisations led by and working with people from Black and racially minoritised backgrounds in Scotland, including core costs.',
    geographic_focus: 'Scotland only.',
    funder_tips: 'The leadership test is numerical: 75% of the board and 50% of senior staff from Black and racially minoritised backgrounds, and income of £250,000 or less in each of the last three years. Pre-application conversations are offered at cref@corra.scot.',
    strong_application: 'Meet the leadership and income thresholds on paper before writing, then describe the work the community needs rather than a project shaped for the funder. Attach a bank statement under six months old and recent accounts.',
  },
  'Communities Mental Health and Wellbeing Fund, Dumfries and Galloway, Round Six': {
    priorities: 'Adult mental health and wellbeing: social isolation and loneliness, suicide prevention, poverty and inequality with an emphasis on the cost-of-living crisis, and people facing socio-economic disadvantage.',
    geographic_focus: 'Dumfries and Galloway.',
    funder_tips: 'One application per organisation, and current round five multi-year award holders cannot apply. Projects run 1 April 2027 to 31 March 2028, so plan for a start six months after the deadline.',
    strong_application: 'A community-led activity for adults that names one of the priorities and shows local reach, from an organisation already delivering in the region with income under £1 million.',
  },
  // ── Northern Ireland ─────────────────────────────────────────────────────
  'Halifax Foundation for Northern Ireland Community FLEX': {
    priorities: 'People in greatest need: poverty, unemployment, disability and mental health. Unrestricted twelve-month funding for the charity\'s own priorities.',
    geographic_focus: 'Northern Ireland.',
    funder_tips: 'Rolling, but the Foundation may close it later in the year once funds are allocated, so apply early. Pre-application sessions with the grants team are offered. Do not use a professional fundraising consultant to complete the form; it is a stated reason for refusal.',
    strong_application: 'A registered charity under £500,000 income with a year of returns on the CCNI register, three unrelated trustees, and a clear account of how the money reaches people in greatest need.',
  },
  'Belfast Harbour Community Awards': {
    priorities: 'Three categories: supporting employability and skills, supporting the environment, and supporting communities. New projects or the expansion of existing work.',
    geographic_focus: 'Grassroots organisations in Belfast and the harbour\'s communities.',
    funder_tips: 'Round two of 2026 closes at 5pm on 25 September. Entries go through the online portal; the Community Award Management Team answers questions on 028 9055 4422.',
    strong_application: 'A grassroots, community-embedded organisation with a charity number or governing body, one category chosen, and a project costed to £5,000 or less.',
  },
  'Belfast City Council Ending Violence Against Women and Girls Local Change Fund': {
    priorities: 'Events, projects or activity programmes aimed at ending violence against women and girls, with projects that work with men and boys particularly encouraged.',
    geographic_focus: 'Belfast City Council area.',
    funder_tips: 'Three tiers up to £25,000 and all activity and spend must finish by 31 March 2027, so a project starting in November has five months. Closes 12 noon on 9 October 2026.',
    strong_application: 'A Belfast community or voluntary organisation with a defined activity, a tier that matches its size, and a delivery plan that ends by March 2027.',
  },
  'Causeway Coast and Glens Christmas Festive Fund 2026': {
    priorities: 'Christmas events and projects that give everyone in a town, village or hamlet the chance to take part.',
    geographic_focus: 'Settlements in the Causeway Coast and Glens Borough Council area, one grant per settlement.',
    funder_tips: 'Only one community group per settlement succeeds, so coordinate locally before applying. Activity must fall between 28 November and 16 December 2026.',
    strong_application: 'A community association that speaks for its settlement, with an inclusive event on a date inside the window and a budget up to £2,500.',
    typical_award: 'Up to £2,500.',
  },
  'Causeway Coast and Glens LEP Capital Grant Programme 2026-27': {
    priorities: 'Capital that lifts growth or productivity: new equipment, production or processing machinery, and capital infrastructure.',
    geographic_focus: 'Businesses and social enterprises located and trading in the Causeway Coast and Glens Borough Council area.',
    funder_tips: 'The pre-application workshop is mandatory, so book it before the 5 October deadline. The grant covers up to 70% of eligible costs; the applicant funds the rest.',
    strong_application: 'A trading social enterprise of two years or more with a costed capital purchase and a plain line from the purchase to growth or productivity.',
    decision_timeline: 'Closes 5pm Monday 5 October 2026; decisions follow the council\'s assessment.',
  },
  'The Fibrus Community Fund': {
    priorities: 'Digital poverty: access to devices, digital skills training, and community internet hubs, especially for older people, people on low incomes and people with disabilities.',
    geographic_focus: 'Eligible BT postcodes across Northern Ireland, listed on the fund page.',
    funder_tips: 'Income must be under £50,000, so this is for the smallest groups. Check your postcode against the list before writing. Closes 1pm on 16 October 2026.',
    strong_application: 'A constituted local group, a named digital problem for a named group of people, and a budget up to £1,500.',
    typical_award: 'Up to £1,500.',
  },
  'Ireland Funds Heart of the Community Fund, Arts and Culture Round': {
    priorities: 'Arts and culture organisations seeking core funding, and community organisations running arts-based programmes.',
    geographic_focus: 'The island of Ireland, Northern Ireland included.',
    funder_tips: 'The round opens 14 September 2026 with information workshops in Belfast on 25 September and online on 28 September; attend one before applying. The spring round gave €5,000 to €25,000.',
    strong_application: 'For an arts organisation, a clear account of ongoing activity and what core funding secures. For a community organisation, a defined arts project whose whole budget relates to the programme.',
  },
  'The Honourable The Irish Society Small Grants': {
    priorities: 'Local organisations and community-based activity across three programmes: early years, waterways stewardship, and culture, heritage and reconciliation.',
    geographic_focus: 'The North West and North Coast of Northern Ireland, centred on Coleraine and the City of Londonderry.',
    funder_tips: 'Most grants are small, up to £2,000; a few larger grants of £10,000 to £20,000 go to work with wider or longer-term impact. Applications are taken through the year and go to the next grants committee.',
    strong_application: 'A community organisation with a governing structure, based in or working in the communities served, with a modest ask tied to one of the three programmes.',
  },
  // ── Provider walk, probe and earlier queue ────────────────────────────────
  'CAST Design Hops': {
    priorities: 'Building user-centred design skills in nonprofit staff and core volunteers, applied to a real service problem.',
    geographic_focus: 'UK nonprofits of any size.',
    strong_application: 'Join the waiting list with a concrete service problem in mind and the authority to act on what the cohort produces.',
  },
  'Hackney Giving Microgrants': {
    priorities: 'Two strands: community projects that improve health and wellbeing or reduce social isolation, and projects that help people understand health information.',
    geographic_focus: 'Hackney and the City of London.',
    strong_application: 'Book the pre-application call first; the form is only sent afterwards. Use the Hackney CVS development team to read a draft.',
    typical_award: 'Up to £1,000.',
  },
  'The Charity Service — Greater Manchester Grants': { geographic_focus: 'Greater Manchester only.' },
  'The Elephant Trust': { geographic_focus: 'UK projects only.' },
  'Community Grants Programme': { geographic_focus: 'UK-wide.' },
  'Together we CAN Fund (Doncaster)': { geographic_focus: 'Doncaster; projects must benefit Doncaster residents.', typical_award: 'Grants of up to £3,500.' },
  'Nature Networks Fund (round six)': { geographic_focus: 'Wales.', typical_award: 'Grants of £250,000 to £1,000,000 per project.' },
  'SSE DPS Social Commitment Programme: Scale': {
    priorities: 'Established social entrepreneurs ready to scale, with learning, peer support and a grant.',
    geographic_focus: 'UK.',
    funder_tips: 'Deadline 16 November 2026. Programmes run as cohorts with fixed session dates; check you can commit to them before applying.',
    strong_application: 'A trading social enterprise with a clear next stage of growth and a leader who can attend the full programme.',
  },
  'Daring Capital Angel Investment': {
    priorities: 'Four sectors: health outcomes, labour market access and workplace inclusion, essential services, and education outcomes, backing founders with lived experience of the problem, including women, minority ethnic founders and founders from low-income backgrounds.',
    geographic_focus: 'Headquartered in the UK with the main beneficiaries in the UK.',
    decision_timeline: 'Rolling. Initial review typically every two weeks, then a screening interview, committee stages, due diligence, an investor round and close.',
    strong_application: 'A for-profit company limited by shares with traded income, SEIS or EIS advance assurance, and a pitch deck and financial model covering the problem, solution, team, traction and the raise. No upfront fee; 7.5% on a successful raise.',
  },
  'Luton Innovation & Collaboration Fund': {
    priorities: 'New partnerships and innovative ideas that help Luton residents overcome barriers to work, training and skills.',
    geographic_focus: 'Luton.',
    strong_application: 'A collaboration of local groups, a new idea or an approach proven elsewhere, and a delivery plan for November 2026 to August 2027.',
    typical_award: 'Awards from £5,000 up to £30,000.',
  },
  'Reach for the Sky Challenge Fund': {
    priorities: 'Outreach that helps young people enter and stay in aviation and aerospace employment, reduces barriers and widens workforce diversity, with measurable employment outcomes.',
    geographic_focus: 'Mainly England.',
    funder_tips: 'Closes 12 noon on 18 September 2026. Formal education and regulatory licensing are out of scope, so frame the work as careers guidance, employer engagement, application support or non-formal training.',
    strong_application: 'A STEM engagement provider or similar organisation with an outreach plan, named employer partners and a way to measure who moves into work.',
  },
  'Drax Community Fund': {
    priorities: 'Education, life skills and employability; healthy communities; essential community services and events; nature and community spaces; low carbon communities.',
    geographic_focus: 'The form takes UK, US and Canadian applications; the page does not state a required distance from a Drax site.',
    funder_tips: 'UK grants are up to £2,000 and only successful applicants hear back. Be ready to invoice if approved.',
    strong_application: 'A specific community project in one of the five areas, with a budget and a clear local benefit, from an organisation that can invoice.',
  },
  'Essential Employment Skills Fund': {
    priorities: 'Rigorous evaluation of programmes that help young people aged 16 to 24 facing significant barriers develop essential employment skills and reach good jobs: impact evaluation with comparison groups, process evaluation, a tested theory of change, and young people\'s own views.',
    geographic_focus: 'UK.',
    decision_timeline: 'Outline applications by December 2026; shortlisting February 2027; full applications April 2027; decisions July 2027; earliest start September 2027.',
    strong_application: 'An evaluator as lead applicant in partnership with a delivery organisation, a focus on at least one essential skill, realistic recruitment of hard-to-reach young people, and sample sizes that support robust analysis. Email a one-page description to eesf@nuffieldfoundation.org for feedback first.',
  },
  'Common Ground Award 2026 to 2027': {
    priorities: 'Capital investment in physical facilities, spaces and equipment that let people from different backgrounds come together; the award recognises best practice in social cohesion.',
    geographic_focus: 'England.',
    strong_application: 'Read the prospectus and the scoring framework on GOV.UK before writing; the assessment criteria are set out there. The window opens 14 September 2026.',
  },
  'Amplius Community Fund': {
    priorities: 'Four themes: good health and wellbeing, financial wellbeing and security, employment support, and cohesive and sustainable communities.',
    geographic_focus: 'Northamptonshire, particularly North Northamptonshire.',
    decision_timeline: 'Closes 14 October 2026.',
    how_to_apply: 'Online form linked from the fund page, with the guidance notes and the supporting documents checklist.',
    funder_tips: 'Northamptonshire Community Foundation will read a draft before submission; call the grants team on 01604 230033. Capital items are capped at £200 each.',
    strong_application: 'A local community organisation or social enterprise with three unrelated committee members and turnover of £1 million or less, one theme chosen, and staff, volunteer or activity costs up to £5,000.',
  },
  'Cecil Pettit Legacy Fund': {
    priorities: 'Health and wellbeing for people with disabilities: support or advocacy groups, accessible education or training, and projects that reduce social isolation.',
    geographic_focus: 'Northamptonshire, county-wide.',
    decision_timeline: 'Rolling with no fixed deadline; applications are reviewed at the end of each month. Apply at least two months before a planned event.',
    funder_tips: 'The Foundation will read a draft and answer questions on 01604 230033. Download the guidance notes, reference form and checklist before starting.',
    strong_application: 'A Northamptonshire community organisation with a constitution, safeguarding and equalities policies, and a disability-focused activity costed up to £3,000.',
    typical_award: 'Up to £3,000.',
  },
  'Margaret Giffen Community Fund': {
    priorities: 'Poverty in all its forms: child, food and fuel poverty, free or low-cost education and training, arts, sport and recreation for low-income families, and advice and advocacy for vulnerable residents. Needs from the Foundation\'s Hidden Needs Report.',
    geographic_focus: 'Corby, Kettering and North Northamptonshire.',
    decision_timeline: 'Closes 2 October 2026.',
    how_to_apply: 'Online form linked from the fund page, after reading the guidance documents and checklist.',
    strong_application: 'A small, locally managed voluntary group with volunteers beyond the committee, a project tackling a named poverty need, and a total project budget under £20,000.',
    typical_award: 'Up to £3,000 per project; total project budget no more than £20,000.',
  },
  'Northamptonshire Queen\'s Institute Relief Fund': {
    priorities: 'Four outcomes: supporting people managing health conditions, promoting healthy lifestyles, building employment skills for vulnerable people, and increasing community participation.',
    geographic_focus: 'Northamptonshire, county-wide.',
    decision_timeline: 'Closes 2 October 2026.',
    how_to_apply: 'Online form at the UK Community Foundations portal linked from the fund page.',
    funder_tips: 'The Foundation reads drafts and gives guidance on 01604 230033.',
    strong_application: 'A small, locally managed voluntary or self-help group with a health or wellbeing activity that names one of the four outcomes, costed up to £5,000.',
    typical_award: 'Up to £5,000.',
  },
  'The Alastair James Memorial Trust': {
    priorities: 'General community support with a preference for equipment, and for UK-manufactured vehicles where equipment is a vehicle.',
    geographic_focus: 'Northamptonshire, the East Midlands and East Anglia.',
    what_they_fund: 'Grants to registered charities and community or voluntary groups, equipment purchases, and occasional grants to individuals at the trustees\' discretion.',
    how_to_apply: 'Online form linked from the fund page, with the Application Documents Checklist and Reference Form.',
    funder_tips: 'Income must be £1.5 million or less. New groups needing help with a constitution can contact the Foundation; sample safeguarding policies are on its Help for Groups page.',
    strong_application: 'A constituted group with safeguarding and equalities policies, asking up to £1,000 for a specific item or piece of work, by midday on 12 October 2026.',
    typical_award: 'Up to £1,000 for a group project.',
  },
  'The Compton Fund': {
    priorities: 'Arts, culture and heritage-based projects across Northamptonshire.',
    geographic_focus: 'Northamptonshire; activities must take place in the county.',
    decision_timeline: 'Closes 2 October 2026.',
    how_to_apply: 'Online form at the UK Community Foundations portal linked from the fund page; guidance and reference forms are downloadable.',
    funder_tips: 'The Foundation reads drafts and gives guidance on 01604 230033.',
    strong_application: 'A small, locally managed group with volunteers beyond its committee and a community bank account with two signatories, proposing an arts, culture or heritage activity costed between £500 and £5,000.',
    typical_award: '£500 to £5,000.',
  },
  'African & Caribbean Elders Service Legacy Fund': {
    priorities: 'Preventative and wellbeing work for older people from Black and Global Majority communities: service access, home support, advice, health and wellbeing, and activities that reduce isolation, delivered by organisations those communities lead.',
    geographic_focus: 'Northamptonshire.',
    decision_timeline: 'Rolling, no fixed deadline; applications are reviewed monthly. Apply at least two months before a planned event.',
    how_to_apply: 'Online form at the Foundation\'s grants portal, with the Reference Form 2026 and the Application Documents Checklist.',
    funder_tips: 'Half or more of senior management and trustees must represent Black and Global Majority communities. The grants team will read a draft on 01604 230033.',
    strong_application: 'A community-led organisation meeting the leadership test, with a costed activity for older people up to £3,000 to be spent within twelve months.',
    typical_award: 'Up to £3,000, spent within twelve months.',
  },
  'Talbot Village Trust Capital Programme': {
    priorities: 'Capital expenditure that is planned and integrated into the organisation\'s wider strategy: buying, refurbishing or repairing buildings and physical spaces, physical or IT assets, and accessibility improvements.',
    geographic_focus: 'The Trust\'s area of benefit in south east Dorset.',
    what_they_fund: 'Purchase, refurbishment or repair of buildings or physical spaces, investment in physical or IT assets, and accessibility improvements.',
    exclusions: 'Revenue costs; projects with total cost under £13,333, since the Trust funds at most 75%.',
    funder_tips: 'Grants are £10,000 or more with 25% match funding, and the average award in 2025 was £12,500. Applicants asking over £50,000 are encouraged to talk to the Trust first. Deadline 29 November 2026, decisions mid May 2027.',
    strong_application: 'At least one year of signed accounts, a capital plan that fits the organisation\'s strategy, and the match funding identified.',
  },
  'Talbot Village Trust Small Grants Programme': {
    priorities: 'Core and operating costs, project costs and small capital items for local charities and grassroots organisations, with a stated welcome for first-time applicants and organisations not funded in the last eighteen months.',
    geographic_focus: 'The Trust\'s area of benefit in south east Dorset; local branches of national organisations may be considered.',
    how_to_apply: 'Through the Small Grants Application Form on the Trust\'s site, on a rolling basis.',
    strong_application: 'A local organisation with income under £250,000 and a specific cost up to £5,000; decisions usually come within five weeks. The 2025 average was £3,000.',
    typical_award: 'Up to £5,000; the 2025 average was £3,000.',
  },
}

async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  const { data } = await db.from('scraped_grants').select('id, title, funder_brief').eq('pipeline_state', 'tagged_awaiting_review').eq('is_active', false)
  const rows = (data ?? []) as { id: string; title: string; funder_brief: Record<string, unknown> | null }[]
  let n = 0
  for (const [title, patch] of Object.entries(P)) {
    const row = rows.find(r => r.title === title)
    if (!row) { console.log('  NOT FOUND:', title); continue }
    const existing = row.funder_brief ?? {}
    // Only add or lengthen: never replace a longer existing field with a shorter one.
    const merged: Record<string, unknown> = { ...existing, last_enriched: TODAY }
    const added: string[] = []
    for (const [k, v] of Object.entries(patch)) {
      const cur = typeof existing[k] === 'string' ? (existing[k] as string) : ''
      if (v.length > cur.length) { merged[k] = v; added.push(k) }
    }
    console.log(`  ${title}: +${added.join(',') || 'nothing'}`)
    if (!APPLY || added.length === 0) continue
    const r = await mergeGrantUpdate({ id: row.id, source: UV, db, fields: { funder_brief: merged } })
    const bad = r.rejected.filter(x => x.reason !== 'idempotent')
    if (bad.length) console.log('     BLOCKED', bad.map(x => x.field + ':' + x.reason).join(','))
    else n++
  }
  console.log(`${APPLY ? 'enriched' : 'would enrich'} ${APPLY ? n : Object.keys(P).length}`)
}
main().catch(e => { console.error(e); process.exit(1) })

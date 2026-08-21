// Hand-tagging every live investment and programme row, from the funder's own words.
//
// Paul, 2026-08-19: "yes lets do that, tag them by hand."
//
// BY HAND BECAUSE 69 ROWS IS SMALL ENOUGH TO GET RIGHT. The classifier reaches
// fewer than half of them and the existing single-value tags contain real
// errors — Fredericks Foundation, whose whole product is "repayments are based
// on a percentage of revenue", was tagged `equity`. At this size a person
// reading each page's own description beats a pass that has to generalise.
//
// EVERY TAG CARRIES THE PHRASE IT CAME FROM. Where the text does not say, the
// tag is not applied: Property Fund and Somerset are almost certainly loans, and
// they are tagged `social_investment` alone because that is what their entries
// actually state. A floor beats a ranking.
//
// Writes `funding_subtypes`; migration 065's trigger keeps `funding_subtype` in
// step. Neither is trust-tracked, so no ladder is involved.
//
//   npx tsx --env-file=.env.local scripts/tag-subtypes-2026-08-19.ts --dry
//   npx tsx --env-file=.env.local scripts/tag-subtypes-2026-08-19.ts
import { createClient } from '@supabase/supabase-js'
import { SUBTYPES_BY_FUNDING_TYPE, SUBTYPE_LABELS } from '../src/lib/funding-subtypes'
import type { FundingSubtype, FundingType } from '../src/types'

const DRY = process.argv.includes('--dry')

type Tag = { id: string; title: string; type: FundingType; subs: FundingSubtype[]; why: string }

const INVESTMENT: Tag[] = [
  { id: '6192dca0-0913-47ca-82cb-3891a30eed3a', title: 'Access — The Foundation for Social Investment', type: 'investment',
    subs: ['blended', 'loan', 'social_investment'], why: 'blended finance (combining grants and loans), enterprise grants, and business support' },
  { id: '54983933-3832-4b42-9bed-8fe4016f4419', title: 'Access Growth Fund', type: 'investment',
    subs: ['blended', 'loan', 'social_investment'], why: 'combines grants with repayable social investment' },
  { id: '55d3592a-1a6b-4495-9f55-e772f1857d60', title: 'Black Seed VC', type: 'investment',
    subs: ['equity'], why: 'early-stage investors, funding commitment typically £100,000 to £400,000' },
  { id: '6c5b16b7-0c43-4b03-9e68-e551603c6a26', title: 'Triodos Business Loans', type: 'investment',
    subs: ['loan'], why: 'sustainable business loans' },
  { id: '1df738d5-d952-425c-bfa6-a4c2b4057f61', title: 'CAF Venturesome Impact Fund', type: 'investment',
    subs: ['loan', 'blended', 'social_investment'], why: 'unsecured loans, though blended finance packages (part loan/part grant) are available' },
  { id: '72739682-6794-487d-95dc-fac4d4ce3f1f', title: 'Charity Bank Loans for Social Purpose', type: 'investment',
    subs: ['loan', 'social_investment'], why: 'offers secured loans to UK charities' },
  { id: '0adbc570-5d75-4d6e-af6d-3263559896a3', title: 'Community Builders Fund', type: 'investment',
    subs: ['loan', 'social_investment'], why: 'provides loans of between £100,000 and £1.5m' },
  { id: '266a1eac-562b-4a32-9d89-f5e42bfaeb4e', title: 'Community Business Fund', type: 'investment',
    subs: ['loan', 'social_investment'], why: 'provides loans to community businesses' },
  { id: '9bcadb67-6618-4ac7-9b9a-49cec783360e', title: 'Community Finance Ireland — Social Loans', type: 'investment',
    subs: ['loan', 'social_investment'], why: 'social finance loans, £10k to £600k' },
  { id: '6e6e8050-27ca-456a-846c-91a1198681fd', title: 'Energy Resilience Fund', type: 'investment',
    subs: ['blended', 'loan', 'social_investment'], why: 'blended funding, 40% grant and 60% loan' },
  { id: 'b2dd8088-88c4-4696-a4d2-6fe034422d65', title: 'Ethex Positive Investment Platform', type: 'investment',
    subs: ['community_shares', 'social_investment'], why: 'community shares (withdrawable shares in community benefit societies) and bonds' },
  { id: 'b7656b4f-58dd-427d-81d5-c1961b0a0f77', title: 'Foundation Scotland — Social Investment Fund', type: 'investment',
    subs: ['blended', 'social_investment'], why: 'patient capital and blended finance for community enterprises' },
  { id: '18dcac42-fa21-4f81-a689-57da1bd0dd92', title: 'Growth Impact Fund', type: 'investment',
    subs: ['loan', 'equity', 'revenue_share', 'social_investment'], why: 'three investment options: revenue-based loans, debt financing, and equity investment' },
  { id: 'bec586cc-4172-4d15-bb05-5fd5f24c7bb9', title: 'Innovate UK Innovation Loans', type: 'investment',
    subs: ['loan'], why: 'repayable late-stage R&D finance: loans £100k-£5m' },
  { id: 'e4cb0712-1507-434c-b31e-1ca464946760', title: 'JRF — Social Investment Programme', type: 'investment',
    subs: ['blended', 'social_investment'], why: 'up to 40% grant alongside repayable investment' },
  { id: 'b818a116-3579-4eb3-8808-b40abc38e393', title: 'Key Fund Flexible Finance', type: 'investment',
    subs: ['blended', 'loan', 'social_investment'], why: 'flexible social investment loans and grants from £5,000 to £300,000' },
  { id: '7eb61b99-36e4-4246-a7da-bc91a61e3e8e', title: 'More than a Pub', type: 'investment',
    subs: ['loan', 'social_investment'], why: 'provides social investment loans' },
  { id: '5e37d1c3-0cc8-4b9a-9459-086a0d3027cc', title: 'Northern Cultural Regeneration Fund', type: 'investment',
    subs: ['loan', 'social_investment'], why: 'provides flexible loans up to £150,000' },
  { id: '105cf22a-e502-436b-8806-b1f0c56b4df1', title: 'Northern Impact Fund 2', type: 'investment',
    subs: ['blended', 'loan', 'social_investment'], why: 'blended finance (combination of grants and loans)' },
  // Almost certainly a loan; the entry says "social investment" and stops there.
  { id: 'cc0252b3-e362-401c-80b6-5407fed2dfc8', title: 'Key Fund Property Fund', type: 'investment',
    subs: ['social_investment'], why: 'provides social investment to social enterprises purchasing or developing property' },
  { id: '25466243-4af6-453a-9ea4-5f471919fa30', title: 'Resolution Foundation Workertech Partnership', type: 'investment',
    subs: ['social_investment'], why: 'funds social investment, ecosystem building, and ventures' },
  { id: '011655cc-3391-43d4-8fdb-bbdfda4479ab', title: 'Fredericks — Revenue Share for Social Enterprises', type: 'investment',
    subs: ['revenue_share'], why: 'revenue share funding £20,000 to £50,000; repayments are based on a percentage of revenue (was tagged equity)' },
  { id: '200ad44b-7a81-48e0-9ce5-1118aaaba9f0', title: 'S J Noble Trust', type: 'investment',
    subs: ['loan'], why: 'business loans and financial assistance for businesses in rural areas' },
  { id: '759177bd-20e8-4141-821a-93f5ebe820dd', title: 'Esmée Fairbairn — Social Investment', type: 'investment',
    subs: ['social_investment'], why: 'social investments made directly into organisations and into impact funds' },
  { id: '583f0378-26e6-4abe-886c-0686bd8b9d2b', title: 'SIB Resilience Fund', type: 'investment',
    subs: ['loan', 'blended', 'social_investment'], why: 'loans and grants to charities and social enterprises' },
  { id: 'e48bb644-14c4-4785-8825-47babba04a2b', title: 'Postcode — Social Investment Programme', type: 'investment',
    subs: ['blended', 'loan', 'social_investment'], why: 'blended finance packages (50% loan and 50% grant)' },
  { id: 'aa43adba-9454-4147-9ff1-614c334d3195', title: 'Social Investment Scotland — Loan Funding', type: 'investment',
    subs: ['loan', 'social_investment'], why: 'affordable, repayable finance; bridging loans and growth facilities' },
  { id: '4c5b51d6-8da6-4bba-875c-61085bbb1f0f', title: 'Somerset Social Investment Programme', type: 'investment',
    subs: ['social_investment'], why: 'social investment for capital purchases, working capital and bridging finance' },
  { id: '8f63ed16-b59e-4dd5-9ea5-56130e9aaf2e', title: 'Start Up Loans', type: 'investment',
    subs: ['loan'], why: 'government-backed personal loans of £500-£25,000' },
  { id: 'a9bf3c97-5e60-403d-9951-6fc218d4150c', title: 'Start Up Loans — South West', type: 'investment',
    subs: ['loan'], why: 'personal loans between £500-£25,000, repayable over 1-5 years at a fixed interest rate' },
  { id: '0ce8470d-9557-40a3-a8d2-ef01daba3f09', title: 'Bethnal Green — Tech for Good', type: 'investment',
    subs: ['equity'], why: 'an early-stage venture capital investment programme' },
  { id: '6ffdea3c-fb1c-4e33-87af-b717e961ad91', title: 'Trust for London — Social Investment Programme', type: 'investment',
    subs: ['loan', 'equity', 'social_investment'], why: 'flexible, low-cost loans and equity investments; repayable with small interest, typically 3-4%' },
  { id: '279016ce-2758-436a-9387-6fa286c0c2dd', title: 'WCVA Social Investment Cymru', type: 'investment',
    subs: ['loan', 'social_investment'], why: 'repayable loans £50,000 to £250,000' },
]

const PROGRAMME: Tag[] = [
  { id: '5ed056e6-d5dd-4a82-b845-65c27a9a9eb5', title: 'Community Enterprise — Accelerate', type: 'programme',
    subs: ['support_programme'], why: 'a free business and organisational support programme' },
  { id: '6621aeb1-5ca6-414f-92a9-355b86dac4a7', title: 'Business Wales — Accelerated Growth', type: 'programme',
    subs: ['support_programme'], why: 'tailored business support, growth advice and development' },
  { id: 'c40dc901-c460-4358-9a86-bd5a13878966', title: 'AI For All', type: 'programme',
    subs: ['includes_grant'], why: 'provides targeted grants up to £2,500' },
  { id: '29740517-2d8b-4557-9d95-c85743c238b3', title: 'AI Growth Lab', type: 'programme',
    subs: ['support_programme'], why: 'not a funding programme; provides coordinated access to regulators and delivery partners' },
  { id: '9e714a60-a849-409f-8f52-0394b8c2fbb4', title: 'Digital Catapult — Black Founders Programme', type: 'programme',
    subs: ['accelerator'], why: 'an accelerator programme supporting early-stage, Black-founded startups' },
  { id: '9ae71432-a044-4988-8eae-1f2c3223c764', title: 'Cambridge Social Ventures', type: 'programme',
    subs: ['incubator', 'support_programme', 'training'], why: '12-month venture support programme with business training, workshops and mentoring' },
  { id: 'fc3f9fe3-ae00-46f0-b7e1-f200163f7e80', title: 'Catch22 — GoodTech Ventures Accelerator', type: 'programme',
    subs: ['accelerator'], why: 'accelerator for early-stage tech ventures' },
  { id: 'ba33eb0c-e6d9-453c-b57e-21f23e925738', title: 'Champions for Children', type: 'programme',
    subs: ['match_funding'], why: 'annual match-fundraising programme' },
  { id: '8888f9ed-6ea5-49dd-9c96-b4fe632d4bf9', title: 'Co-op Foundation — Belong', type: 'programme',
    subs: ['includes_grant'], why: 'funds projects up to £20,000' },
  { id: 'fafa223d-1008-46c6-8019-585afd5014b7', title: 'Community Energy GO!', type: 'programme',
    subs: ['support_programme', 'training'], why: 'free expert advice, practical tools and hands-on support' },
  { id: 'b3dac130-3d54-4bb6-8714-034016f18611', title: 'Doc Society — Good Pitch & Documentary Fund', type: 'programme',
    subs: ['includes_grant'], why: 'a documentary fund supporting director-led storytelling' },
  { id: '68d71ccf-5285-491c-ac31-290801ff7665', title: 'Dormant Assets for All', type: 'programme',
    subs: ['includes_grant'], why: 'funds projects that strengthen VCSE organisations, up to £20,000' },
  { id: 'a7b1e535-b639-471c-9231-1d87cff07489', title: 'DWF Foundation', type: 'programme',
    subs: ['includes_grant'], why: 'grants support initiatives, up to £5,000' },
  { id: 'c67c1e54-64e2-4b82-b651-952aecfa434d', title: 'Coach Core — Employer Partnership', type: 'programme',
    subs: ['support_programme', 'training'], why: 'places apprentices into paid roles, providing training and development integrated with employment' },
  { id: 'bdcda65e-0236-4ac2-9939-9389b990e108', title: 'Social Enterprise NI — Financial Support', type: 'programme',
    subs: ['support_programme'], why: 'curates and signposts funding opportunities' },
  { id: '1e994bdb-bb99-4c97-b02c-ee23c1874e18', title: 'Firstport Start It', type: 'programme',
    subs: ['incubator', 'includes_grant', 'support_programme'], why: 'structured support programme for early-stage social enterprises, up to £25,000' },
  { id: '3b836a87-fd0e-4d5c-bfdc-b44f7c793eb1', title: 'Gatsby Charitable Foundation', type: 'programme',
    subs: ['support_programme'], why: 'typically commissions research and designs interventions in partnership' },
  { id: 'a4ee2034-0ec1-40d4-9a8b-a4b745916b5b', title: 'GLL Social Enterprise Accelerator', type: 'programme',
    subs: ['accelerator', 'support_programme'], why: 'business development, mentoring, workspace access and practical guidance' },
  { id: 'acbff6c1-4f2f-47a7-8f98-58d0f2072410', title: 'Hatch Enterprise', type: 'programme',
    subs: ['support_programme', 'training'], why: 'tailored programmes, peer networking, hands-on seminars, 1:1 consultations' },
  { id: '550e7273-d37c-4307-8afe-dcf45b2ec5ba', title: 'Horizon Europe — Cluster 3', type: 'programme',
    subs: ['includes_grant'], why: 'research and innovation funding up to £2m' },
  { id: 'c57f8bba-b4e4-4a24-997a-90a2c59ff573', title: 'Impact Hub Programmes', type: 'programme',
    subs: ['accelerator', 'incubator'], why: 'accelerator and incubator programmes for social entrepreneurs' },
  { id: '8825cb0f-f53f-45d4-93ab-dc6fd8036f21', title: 'Lloyds Bank Foundation — Specialist', type: 'programme',
    subs: ['includes_grant', 'support_programme'], why: 'three-year unrestricted grants of £75,000 alongside substantial tailored development support' },
  { id: '68a158d4-e2c7-42af-934b-fbb418f08e28', title: 'North East Create Growth Programme', type: 'programme',
    subs: ['support_programme', 'includes_grant'], why: 'six to nine months of tailored investment-readiness support and growth capital' },
  { id: '2d515d44-595b-421a-8d7d-90b2b32b50e8', title: "Skinners' Company Charity Programme", type: 'programme',
    subs: ['includes_grant'], why: 'funds programmes helping NEET young people, up to £10,000' },
  { id: '4e036244-6f5c-4c1b-b475-129eaf4e55de', title: 'Social Business Trust', type: 'programme',
    subs: ['includes_grant', 'support_programme'], why: 'cash grants plus high-value pro bono business support, typically equivalent to £200k+' },
  { id: 'ced26048-d908-4919-bc4b-0bdad1c2d155', title: 'Spacehive — Civic Crowdfunding', type: 'programme',
    subs: ['match_funding'], why: 'civic crowdfunding platform where community projects raise funds with council match' },
  { id: 'ddc93bb0-b74d-42e7-86a7-172f9a39913c', title: 'SSE Start Up Programme', type: 'programme',
    subs: ['includes_grant', 'support_programme', 'training'], why: 'small grants £1,000-£10,000 combined with structured learning, peer mentoring and capacity building' },
  { id: '5e04c94c-345e-45b0-80c9-ffdfe1969b59', title: 'Strengthening Organisations', type: 'programme',
    subs: ['includes_grant'], why: 'funding for organisations to test new ideas, up to £50,000' },
  { id: '3a7ce03a-4fc8-49d4-b87e-f1a904e22e54', title: 'The Climate Change Collaboration', type: 'programme',
    subs: ['includes_grant'], why: 'funds work to catalyse change, up to £200,000' },
  { id: '3b887829-eff4-41fe-823c-3f8155755b2e', title: 'The Fore Grants Programme', type: 'programme',
    subs: ['includes_grant', 'support_programme', 'training'], why: 'unrestricted grants up to £45,000 plus free skilled-volunteer support and training workshops' },
  { id: '8b5c4025-318d-4354-a766-228b361ffba3', title: 'SSE — Trading for Good', type: 'programme',
    subs: ['includes_grant', 'support_programme'], why: 'SSE programme for community businesses, up to £4,000' },
  { id: 'eef413f5-805b-4919-b54e-f3e5bd1e7e26', title: 'UnLtd — Awards for Social Entrepreneurs', type: 'programme',
    subs: ['award', 'includes_grant', 'support_programme'], why: 'provides funding and support to social entrepreneurs, up to £15,000' },
  { id: '571452cd-970a-4e09-8f4b-1fdc607ae050', title: 'VCSE Contract Readiness Programme', type: 'programme',
    subs: ['training', 'support_programme'], why: 'a structured capacity-building initiative; support and training on public sector procurement' },
  { id: '1e6c3908-dde9-4254-9a64-1ddba2f5d4a4', title: 'Visa CatalyseHer Programme', type: 'programme',
    subs: ['training', 'includes_grant'], why: 'training and fundraising support; once training is complete the candidate is eligible to apply for a grant' },
  { id: 'ab84f123-5b0a-4f11-a277-f9715ebaf7a6', title: 'WCIT AI/ML Learning Exchange', type: 'programme',
    subs: ['training', 'support_programme'], why: 'thought leadership, practical advice, workshops, events and pro bono access to practitioners' },
  { id: 'ac17f2a9-ae1c-44bc-b6ba-a2398bf957fd', title: 'Youth Matters Fund', type: 'programme',
    subs: ['includes_grant'], why: 'funding covers facilities, equipment and services for youth provision' },
]

const ALL = [...INVESTMENT, ...PROGRAMME]

async function main() {
  // Guard: a code that is not valid for its tab is a typo, and it would be
  // silently dropped by the UI rather than shown as wrong.
  const bad: string[] = []
  for (const t of ALL) {
    const valid = SUBTYPES_BY_FUNDING_TYPE[t.type] ?? []
    for (const s of t.subs) if (!valid.includes(s)) bad.push(`${t.title}: "${s}" is not valid for ${t.type}`)
    if (t.subs.length === 0) bad.push(`${t.title}: no subtypes`)
  }
  if (bad.length) { console.error('ABORT — invalid tags:\n  ' + bad.join('\n  ')); process.exit(1) }

  const ids = new Set(ALL.map(t => t.id))
  if (ids.size !== ALL.length) { console.error(`ABORT — duplicate ids: ${ALL.length - ids.size}`); process.exit(1) }

  console.log(`investment: ${INVESTMENT.length}   programme: ${PROGRAMME.length}   total: ${ALL.length}`)

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  let written = 0, missing = 0
  for (const t of ALL) {
    const labels = t.subs.map(s => SUBTYPE_LABELS[s]).join(' · ')
    if (DRY) { console.log(`  ${t.title.slice(0, 42).padEnd(42)} ${labels}`); continue }
    const { error, count } = await db.from('scraped_grants')
      .update({ funding_subtypes: t.subs }, { count: 'exact' })
      .eq('id', t.id)
    if (error) { console.log(`  FAILED ${t.title}: ${error.message}`); continue }
    if (!count) { console.log(`  NOT FOUND ${t.title}`); missing++; continue }
    written++
  }
  if (DRY) { console.log('\nDRY RUN — nothing written.'); return }
  console.log(`\nrows written: ${written}   not found: ${missing}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

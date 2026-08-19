// Hand-tagging the 50 live in-kind rows, and naming the six that are not in-kind.
//
// In-kind had the worst tags of the four types. Microsoft for Nonprofits was
// `office_space` — the classifier saw "Office 365". Slack was
// `pro_bono_consulting`. Cranfield Trust, Taproot and Charterpath were all
// `volunteering`, which reads as "we will send you helpers" rather than "a
// qualified accountant will do your year end". 23 of the 50 had no tag at all.
//
// TWO NEW CODES, because the gap was real rather than a matter of taste:
//
//   `goods`     — nothing covered physical things being given away. FareShare's
//                 food, the Hygiene Bank's products, Selco's and Wickes'
//                 building materials, In Kind Direct's entire catalogue and the
//                 Digital Inclusion Network's refurbished devices had no tag
//                 that fitted. Seven rows.
//   `mentoring` — one person's time is a different offer from a team doing the
//                 work, and a different ask of the charity receiving it.
//
// SIX ROWS ARE NOT TAGGED, deliberately. Each is something other than in-kind
// support and none of them can be made honest by relabelling; they are listed at
// the end for Paul rather than quietly given a tag that would hide the problem.
//
//   npx tsx --env-file=.env.local scripts/tag-inkind-subtypes-2026-08-19.ts --dry
//   npx tsx --env-file=.env.local scripts/tag-inkind-subtypes-2026-08-19.ts
import { createClient } from '@supabase/supabase-js'
import { SUBTYPES_BY_FUNDING_TYPE, SUBTYPE_LABELS } from '../src/lib/funding-subtypes'
import type { FundingSubtype } from '../src/types'

const DRY = process.argv.includes('--dry')

const TAGS: { id: string; title: string; subs: FundingSubtype[]; why: string }[] = [
  { id: 'edaed6a2-448f-4209-b763-5006d6874cf2', title: 'ASTOP', subs: ['office_space'],
    why: 'rent-free temporary retail, office and other commercial space' },
  { id: '171ceb65-7ddf-4a90-ac4c-57adf480279f', title: 'AWS Nonprofit Credit Program', subs: ['tech_product'],
    why: 'cloud technology credits' },
  { id: '7430666a-27b7-4f34-884a-f293d438c5a7', title: 'BCG UK Social Enterprise Award', subs: ['pro_bono_consulting'],
    why: 'a dedicated, full-time pro bono BCG team for an 8-week engagement' },
  { id: 'c61531ee-8a48-43a6-8c19-d16bd06cf157', title: 'Buddle', subs: ['training'],
    why: 'free learning and support resources, tools, guidance, training and workshops' },
  { id: 'e53c6f5a-bd7a-4ae1-8d37-e3e2333c569e', title: 'Canva for Nonprofits', subs: ['tech_product'],
    why: 'design and visual communication software' },
  { id: '86a561b4-8487-44e8-8a20-33f772a5055c', title: 'CAST', subs: ['pro_bono_consulting', 'training'],
    why: 'supports organisations developing skills, knowledge and confidence in digital ways of working' },
  { id: '571f93e2-d0b5-41d7-adf1-d36b3a039ec6', title: 'Charity Digital Exchange', subs: ['tech_product'],
    why: 'software and digital tools donated or discounted' },
  { id: '99a71fd2-fccc-4947-a4fd-4fdd81b58bd0', title: 'Charity Digital Skills Programme', subs: ['training'],
    why: 'digital skills training and development programmes' },
  { id: '75990799-a1a4-490e-a651-90f3147ec669', title: 'CITA Tech Volunteers', subs: ['pro_bono_consulting', 'volunteering'],
    why: 'connects charities with volunteer IT professionals' },
  { id: '5067b65b-6595-4a7b-b764-2f821a4584fa', title: 'Charterpath', subs: ['pro_bono_consulting', 'volunteering'],
    why: 'skilled volunteers in accountancy, financial management and treasurer roles at no cost' },
  { id: '6780e074-46a5-4e0e-b6d1-5760c84d3c4a', title: 'Media Trust — Communications Support', subs: ['training', 'mentoring', 'volunteering'],
    why: 'training courses, volunteer mentoring, content creation and media skills development' },
  { id: '0967c01b-4171-4082-903d-d80774586dc3', title: 'Cranfield Trust', subs: ['pro_bono_consulting', 'mentoring'],
    why: 'pro bono management consultancy: strategy, business planning, governance advice, mentoring' },
  { id: '50343bc9-4d8e-4416-8aad-c9e3ed2300ac', title: 'Data First Aid', subs: ['pro_bono_consulting', 'volunteering'],
    why: 'free pro bono support from volunteer economists' },
  { id: '4075bfa0-5ca1-4732-bac4-2b050c542015', title: 'Digital Candle', subs: ['pro_bono_consulting', 'volunteering'],
    why: 'connects organisations with volunteer experts to answer digital questions' },
  { id: '3e92d23a-b238-4fb4-8d4f-75dc9793d8bd', title: 'Doit Life', subs: ['volunteering', 'tech_product'],
    why: 'free platform access to recruit and manage volunteers' },
  { id: 'eae4707d-3f42-41e9-b31a-48618b09b2f8', title: 'Ethical Property', subs: ['office_space'],
    why: 'affordable workspace and office solutions' },
  { id: '1b62fbe2-6a97-45bd-9f40-63a8b59dc7eb', title: 'FareShare Greater Manchester', subs: ['goods'],
    why: 'regular supplies of fresh, dairy and chilled food' },
  { id: '75f72d6e-c93b-4cd7-9830-49b70995b1e3', title: 'Google Ad Grants', subs: ['tech_product'],
    why: 'free Google Search ads' },
  { id: '1ab3dcfc-230d-44e6-9aa0-ead6a728fb77', title: 'Human Lending Library', subs: ['mentoring'],
    why: 'free one-to-one mentoring sessions with experienced business leaders' },
  { id: '5e62ecae-3f4e-458c-9fdf-013e6f018c73', title: 'In Kind Direct', subs: ['goods'],
    why: 'donated consumer products: appliances, clothing, cleaning supplies, period products, baby essentials' },
  { id: '1981a846-3cce-48d2-b568-033df30ca589', title: 'Integrate Donated Office Space', subs: ['office_space'],
    why: 'premium vacant office space at no rental cost' },
  { id: 'a89ee8f2-cdc6-4673-958c-786a135792c9', title: 'Just Enterprise (Scotland)', subs: ['pro_bono_consulting', 'training'],
    why: 'business support, training and advisory services' },
  { id: '3c2c6766-220f-4d54-ad18-4bade01df7a5', title: 'Microsoft for Nonprofits', subs: ['tech_product'],
    why: 'free and discounted Microsoft software and cloud services (was tagged office_space — "Office 365")' },
  { id: '469b52bf-f8b9-4b4a-b8cd-54789928562e', title: 'National Digital Inclusion Network', subs: ['goods', 'training'],
    why: 'free mobile data provision, refurbished device distribution, and beginner digital skills training' },
  { id: '0ebb775d-0ff1-44cd-880b-5853f73b060f', title: 'NCVO Learning & Development', subs: ['training'],
    why: 'training and development programmes: governance, finance, safeguarding, HR' },
  { id: 'd5da3c99-fdf2-4a8d-9778-ff5935fb747c', title: 'Neighbourly', subs: ['goods', 'volunteering'],
    why: 'surplus products and volunteer time connected with local causes' },
  { id: 'f7e51198-d22b-484a-bec3-aadbe08fb748', title: 'StreetGames Network Membership', subs: ['training'],
    why: 'supports community organisations to deliver inclusive, local activities' },
  { id: 'c1a86516-b4be-4535-90cc-4a672750d652', title: 'Pilotlight — Pro Bono Support Matching', subs: ['pro_bono_consulting', 'mentoring'],
    why: 'matches charity leaders with business experts' },
  { id: 'c1caaf02-8461-4393-8ba1-c81096cded8a', title: 'Pilotlight 360', subs: ['pro_bono_consulting', 'mentoring'],
    why: 'structured strategic support from business experts' },
  { id: '38f3cae0-7d56-422a-aa1f-8691c2540fc9', title: 'Pro Bono Economics Advisory', subs: ['pro_bono_consulting', 'training'],
    why: 'pro bono advisory and analytical services, plus workshops' },
  { id: '970ce070-6fea-44fc-bfea-a7317776681a', title: 'Reach — TrusteeWorks', subs: ['volunteering'],
    why: 'trustee recruitment: advertising roles and searching their volunteer community' },
  { id: '53dd63b0-f850-4a8e-a28f-6b84704e810f', title: 'Salesforce Power of Us', subs: ['tech_product'],
    why: 'Nonprofit Cloud and other Salesforce software' },
  { id: '5da1bb15-e93e-4949-a91b-c886ecd75294', title: 'Scottish Schools Pipes and Drums Trust', subs: ['goods'],
    why: 'lend bagpipes and chanters' },
  { id: '5a00d50c-5244-4850-a6f9-af242703b7f2', title: 'Selco Community Heroes', subs: ['goods'],
    why: 'funding is provided as building materials from Selco branches' },
  { id: '763f13e2-f1aa-4b50-88be-7d31a9a08bc0', title: 'Slack for Nonprofits', subs: ['tech_product'],
    why: 'Slack workspace subscriptions and upgrades (was tagged pro_bono_consulting)' },
  { id: 'd881ca00-a65b-4326-a918-34e75ea648a0', title: 'Social Firms Wales', subs: ['pro_bono_consulting', 'training'],
    why: 'supports individuals and organisations to develop enterprises' },
  { id: 'fc653e05-73e5-4a48-90b8-a8b8de429211', title: 'Superhighways — London Charities', subs: ['training', 'pro_bono_consulting'],
    why: 'digital skills training, advice and technical support' },
  { id: '895556e0-623d-4661-b245-ad0870a7869a', title: 'Superhighways — London VCSEs', subs: ['training', 'pro_bono_consulting'],
    why: 'training in digital skills, advice on free and low-cost online tools' },
  { id: '5cbdb2dd-d274-4619-b468-8dd5bfe54154', title: 'Taproot Foundation', subs: ['pro_bono_consulting', 'volunteering'],
    why: 'matches nonprofits with skilled volunteers donating professional expertise' },
  { id: 'b98c7493-ff5c-42f4-ab1d-b205940e550c', title: 'TechSoup UK', subs: ['tech_product', 'goods'],
    why: 'donated and heavily discounted software, HARDWARE and technology services' },
  { id: '47ffb17f-f14e-4955-b512-7344ddf294f1', title: 'The Hygiene Bank', subs: ['goods'],
    why: 'free hygiene and period products; a goods-based support programme, not cash grants' },
  { id: '0e506d16-9e5c-47e0-aae9-7f3444b3646c', title: 'TrustLaw', subs: ['pro_bono_legal'],
    why: 'free legal support, research and resources' },
  { id: '585e97a7-d779-4653-8995-0c32c902d6d0', title: 'Sported — Volunteer Consultancy', subs: ['pro_bono_consulting', 'volunteering'],
    why: 'free professional consultancy from skilled staff and volunteer consultants' },
  { id: '166aa0c7-b17a-4f45-897d-ef7b9e768a48', title: 'Wickes Community Programme', subs: ['goods'],
    why: 'building, garden and home improvement materials' },
  { id: 'b7f40968-6892-4004-9bd7-ea2af8410635', title: 'Zoom for Nonprofits', subs: ['tech_product'],
    why: 'product discounts on Zoom Workplace and webinar software' },
]

/** Not tagged, because no tag would make them true. Paul's call. */
const NOT_IN_KIND = [
  { title: 'Theatre Tax Relief', why: 'a Corporation Tax relief for companies producing theatre. Not in-kind support, and not something a charity applies to a funder for.' },
  { title: 'TheGivingMachine — GivingLottery', why: 'its own page: "This is not a grant scheme — it\'s a fundraising platform." A way to raise money, not a way to receive it.' },
  { title: 'Social Enterprise UK — Buy Social Corporate Challenge', why: 'its own page: "This is not a grant scheme." A corporate procurement partnership; the benefit is contracts, not support.' },
  { title: 'UK and Ireland Community Tree Planting Grant', why: 'cash at up to £2.15 per tree. A grant, filed as in-kind.' },
  { title: 'Yorkshire Universities', why: 'its own entry: "not a grant-making funder. It does not appear to offer grants to external charities."' },
  { title: 'Superhighways (two rows)', why: 'the same organisation entered twice, "for London Charities" and "for London VCSEs". Both tagged here; one should probably go.' },
]

async function main() {
  const valid = SUBTYPES_BY_FUNDING_TYPE.in_kind ?? []
  const bad = TAGS.flatMap(t => t.subs.filter(s => !valid.includes(s)).map(s => `${t.title}: "${s}"`))
  if (bad.length) { console.error('ABORT — not valid for in_kind:\n  ' + bad.join('\n  ')); process.exit(1) }
  if (new Set(TAGS.map(t => t.id)).size !== TAGS.length) { console.error('ABORT — duplicate ids'); process.exit(1) }

  console.log(`tagging ${TAGS.length} rows; ${NOT_IN_KIND.length} entries left untagged for Paul\n`)
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  let written = 0, missing = 0
  for (const t of TAGS) {
    if (DRY) { console.log(`  ${t.title.slice(0, 38).padEnd(38)} ${t.subs.map(s => SUBTYPE_LABELS[s]).join(' · ')}`); continue }
    const { error, count } = await db.from('scraped_grants')
      .update({ funding_subtypes: t.subs }, { count: 'exact' }).eq('id', t.id)
    if (error) { console.log(`  FAILED ${t.title}: ${error.message}`); continue }
    if (!count) { console.log(`  NOT FOUND ${t.title}`); missing++; continue }
    written++
  }
  if (!DRY) console.log(`\nrows written: ${written}   not found: ${missing}`)

  console.log('\n── Left untagged: not in-kind support, and no tag would fix that')
  for (const n of NOT_IN_KIND) console.log(`  ${n.title}\n      ${n.why}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

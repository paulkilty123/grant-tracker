// Amounts on 176 live rows — batch 5 (rows 81-100). One column write, one prose, eighteen reported.
//
// The Hollick Family Charitable Trust is the strongest near miss in the job.
// Its apply_url is a Young Camden Foundation directory entry, and the page
// prints "Apply for : No Min - £50,000" and "Grants up to £50,000 are available
// through this match funding scheme" — both belonging to a Crowdfunder Cost of
// Living Resilience Fund in a related-funds list at the foot of the page, along
// with a £5,000 homelessness fund and the Eranda Rothschild Foundation. The
// Hollick section itself, lines 46 to 76 of the rendered page, carries no
// figure at all and says the trust does not maintain a website. Every figure on
// the page is verbatim, on the row's own apply_url, and about a different
// funder.
//
// Second listing this job where a directory has an award-sizes block and every
// value in it reads "Premium information" behind SCVO membership: Hugh & Mary
// Miller Bequest, after A Sinclair Henderson Trust in batch 1. Both are Scottish
// trusts with no site of their own.
//
//   npx tsx --env-file=.env.local scripts/amounts-batch-05-2026-09-06.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row, type Report } from './amounts-lib-2026-09-06'

const APPLY = process.argv.includes('--apply')
const BATCH = 5

const ROWS: Row[] = [
  // 95. The only per-grant range JRCT publishes anywhere. med rather than high
  // because the sentence is scoped to one call — round two of 2026, focused on
  // immigration detention and deportation, which closed on 2 September — rather
  // than to the programme in general. It is the programme's own statement of
  // what it gives, on the row's own page, and is the best figure available; the
  // scope is carried in prose so nobody reads it as a standing range.
  //
  // Deliberately NOT applied to the sibling Power & Accountability row, which
  // shares this trust, this application process and this round calendar and
  // states no figure of its own. Same discipline as the timing job, where that
  // row's reopening sentence was not borrowed in the other direction.
  { id: '8f8bc717-1cbb-44de-abc1-fe04e0efcce2', re: /Rights & Justice/,
    fields: { amount_min: 20000, amount_max: 80000 },
    cits: {
      amount_min: { snippet: 'we are expecting to fund two to five new groups with grants between £20,000-80,000 for 1-3 years', confidence: 'med',
        source_url: 'https://www.jrct.org.uk/rights-and-justice' },
      amount_max: { snippet: 'we are expecting to fund two to five new groups with grants between £20,000-80,000 for 1-3 years', confidence: 'med',
        source_url: 'https://www.jrct.org.uk/rights-and-justice' },
    },
    typical_award: 'Grants of £20,000 to £80,000 over one to three years. That range is the trust\'s stated expectation for its 2026 round two call on immigration detention and deportation, which closed on 2 September; the programme publishes no standing range.',
    typical_award_cit: { snippet: 'we are expecting to fund two to five new groups with grants between £20,000-80,000 for 1-3 years', confidence: 'med',
      source_url: 'https://www.jrct.org.uk/rights-and-justice' } },

  // 98. Two figures, both thresholds in the trust's own process rather than
  // limits on an applicant: under £2,000 is handled between meetings, over
  // £10,000 usually earns a visit. Neither is a ceiling and nothing bounds the
  // top, so prose only.
  { id: '142d3163-b0a5-441b-9f8c-b306bd4b1ddd', re: /Main Grants Programme/,
    fields: {},
    cits: {},
    typical_award: 'No minimum or maximum is stated. Two process thresholds give the shape: small grants of £2,000 and under are decided between meetings with a turnaround of about six weeks, and applications over £10,000 usually involve a visit from an assessor.',
    typical_award_cit: { snippet: 'Small grants (£2,000 and under) are processed outside of scheduled meetings and have an average turnaround of 6 weeks.', confidence: 'high',
      source_url: 'https://www.knott-trust.co.uk//applications' } },
]

const REPORT: Report[] = [
  { id: 'd4c4eceb-c3f6-482c-af93-8023bd0d05ff', title: 'Historic England — Listed Places of Worship Grant Scheme', why: 'unreadable',
    quote: 'Just a moment...', url: 'https://historicengland.org.uk/advice/grants/what-we-fund/',
    note: 'HTTP 403 behind a Cloudflare interstitial. Second Historic England row blocked this way; the timing job hit the same wall on their grants index.' },
  { id: '86990306-2e6d-4561-901e-a4d0393941da', title: 'Hobson Charity — Grants for Relief of Poverty and Distress', why: 'not_stated',
    quote: 'Safeguarding. (part of registration but should be kept up to date)',
    url: 'https://hobsoncharity.org.uk/how-to-apply/',
    note: 'A 117KB how-to-apply page listing the documents required and no figure. The quote is a checklist item because there is no money sentence on the page.' },
  { id: '12bbaf28-20aa-445b-867b-1958ebcef1ef', title: 'Hollick Family Charitable Trust', why: 'not_stated',
    quote: 'The Hollick Family Charitable Trust does not maintain a website. Groups should write to the Trust for further information on how to apply.',
    url: 'https://youngcamdenfoundation.org.uk/funding/hollick-family-charitable-trust',
    note: 'See the header note. The page prints "£50,000" twice and "£5,000" once and every one of them belongs to a different fund in a related-funds list below the entry. Directory pages that append other funders\' listings are a shape worth watching for across this catalogue: Adint and Dixie Rose Findlay come from the same site.' },
  { id: '738638ce-af2f-4052-b428-213248d9312a', title: 'Hugh & Mary Miller Bequest', why: 'listing_only',
    quote: 'Fund award sizes. Minimum: Premium information. Maximum: Premium information. Average: Premium information.',
    url: 'https://funding.scot/funds/a0Rb00000096myaEAA/hugh-mary-miller-bequest',
    note: 'Second row in this job whose only page is funding.scot with every award figure behind SCVO membership, after A Sinclair Henderson Trust. The bequest has no site of its own.' },
  { id: 'a7540da6-3414-4feb-8a45-c0c6cbcbd0c8', title: 'Hyde Foundation Community Investment', why: 'not_stated',
    quote: 'Hyde Foundation | The Hyde Group',
    url: 'https://www.hyde-housing.co.uk/the-hyde-group/our-social-purpose/hyde-foundation/',
    note: 'No application route and no figure, as the timing job also found. Every date and number on the page belongs to a strategy or a report.' },
  { id: '5e62ecae-3f4e-458c-9fdf-013e6f018c73', title: 'In Kind Direct — Charity Network Membership', why: 'not_stated',
    quote: 'In 2021, every £1 spent delivering our work unlocked at least £14.05 of social value for our charitable network.',
    url: 'https://www.inkinddirect.org/with-charitable-organisations',
    note: 'A social-value ratio, not an award. Members receive donated products at a handling fee rather than money.' },
  { id: 'd38779a7-0873-4f2f-91e2-638739a2eb64', title: 'Inman Charity', why: 'pot_only',
    quote: 'The Trustees operate a grant giving policy with a view to making annual grants of £350,000.',
    url: 'http://www.inmancharity.org/',
    note: 'An annual giving target across the whole charity. A 6.5KB site with no per-grant figure.' },
  { id: 'f2e16253-0b5f-4aac-8415-0cfb00771d81', title: 'Innovate UK Growth Catalyst — Investor Partnerships', why: 'pot_only',
    quote: '£168m ... £448m ... £1.36bn',
    url: 'https://iuk-business-connect.org.uk/programme/investor-partnerships/',
    note: 'Three programme aggregates on a stats panel — grant funding committed, investment aligned, and total value leveraged — none of them an award to a single applicant. Amount columns admin-pinned.' },
  { id: '1981a846-3cce-48d2-b568-033df30ca589', title: 'Integrate Donated Office Space', why: 'not_stated',
    quote: 'Charities — Integrate',
    url: 'https://integratespace.co/charities',
    note: 'A 313KB Squarespace site matching charities to donated office space, with no pound sign in the rendered text.' },
  { id: 'a96867a7-f5af-4805-8f34-4f34feda2554', title: 'Inverurie Youth Sports Foundation', why: 'not_stated',
    quote: 'Inverurie Youth Sports Foundation (IYSF) | Home | How We Help | How To Apply',
    url: 'https://www.iysf.org.uk/',
    note: 'A How To Apply page exists and carries no figure; nothing on the site does.' },
  { id: 'ed3f6ba2-c76c-4b44-9bf4-5846f4ad4bed', title: 'James Ahern Foundation', why: 'not_stated',
    quote: 'The James Ahern Foundation. "Enabling the pursuit of passion"',
    url: 'https://www.jamesahernfoundation.org/',
    note: 'A 377KB Wix site with no pound sign in the rendered text.' },
  { id: '843e2992-bed2-4525-b29f-b48d98be2364', title: 'John Lyon\'s Charity Grants', why: 'unreadable',
    quote: 'Just a moment...', url: 'https://www.jlc.london/grants/',
    note: 'HTTP 403 behind a Cloudflare interstitial, as in the timing job.' },
  { id: '600db8c5-dc40-43c4-9b2c-e812b018bdad', title: 'Joseph Rank Trust', why: 'not_stated',
    quote: 'There is no typical grant as each application is considered on its own merits.',
    url: 'https://www.ranktrust.org/rank-trust-grants.htm',
    note: 'The clearest not_stated in the job: the trust anticipates the question and declines to answer it. Nothing to write and nothing to chase.' },
  { id: '6344f1bf-cc8a-4410-a4b6-f15e200559f5', title: 'JRCT — Power & Accountability Programme', why: 'not_stated',
    quote: 'develops and promotes mechanisms which ensure an accountable, transparent and proportionate relationship between the private sector and government',
    url: 'https://www.jrct.org.uk/power-and-accountability',
    note: 'No pound sign on the page. Its sibling Rights & Justice row publishes a £20,000 to £80,000 range for its current call and that range is deliberately not borrowed here: same trust, same process, same calendar, different programme.' },
  { id: 'a89ee8f2-cdc6-4673-958c-786a135792c9', title: 'Just Enterprise (Scotland)', why: 'not_stated',
    quote: 'Just Enterprise - Business Support for Social Enterprises in Scotland',
    url: 'https://justenterprise.org/',
    note: 'Free business support funded by the Scottish Government. No money passes to the organisation.' },
  { id: '5a368644-3211-4a40-9447-d5594938a519', title: 'Lambeth Community Connections Fund', why: 'unreadable',
    quote: 'Sign up to receive local updates',
    url: 'https://www.lambeth.gov.uk/community-connections-fund',
    note: 'HTTP 200 with the fund content inside accordions that render only in a browser — the same shape the timing job hit on this row. Section headings with nothing under them, and no figure in what is served.' },
  { id: 'c8c96218-4a00-411c-b015-c2caf632f837', title: 'Make a Difference Locally (MADL)', why: 'not_stated',
    quote: 'Our Community | Nisa Locally',
    url: 'https://www.nisalocally.co.uk/community/',
    note: 'A 244KB retail site whose community page states no figure. Grants are made by individual Nisa stores from local fund balances.' },
  { id: '83377536-631c-4d17-9554-58516596b6d4', title: 'Maudsley Charity - Building Brighter Futures', why: 'not_stated',
    quote: 'Explore some of the projects we have funded, from multi-million pound clinical and research initiatives, to small scale services supporting people in the community.',
    url: 'https://maudsleycharity.org/grants/',
    note: 'The range described is of past projects rather than of grants on offer, and the programme this row names ran its round in 2024-25 and has closed, as the timing job found.' },
]

async function main() {
  await runBatch({ batch: BATCH, rows: ROWS, report: REPORT, apply: APPLY, db: getAdminDb() })
}
main().catch(e => { console.error(e); process.exit(1) })

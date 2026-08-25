// The other ten live rows with an empty funder_brief, worked one at a time.
//
// Paul asked whether all eleven were done. One was. This does what can honestly
// be done to the rest — which is three of them, and the reasons the other seven
// cannot be filled by reading are as much the point as the three that can.
//
// ─────────────────────────────────────────────────────────────────────────────
// FILLED (3) — every fact below is quoted from the funder's own page or its
// linked guidance document, read 2026-08-25. No API spend.
//
// NOT FILLED, AND WHY (7):
//
//   Theatre Breakthrough Fund (North)  Cloudflare bot verification. The reader
//   Chichester DC Community Grants     proxy gets the same "Performing security
//   Historic England (grants index)    verification" interstitial, so there is
//   Groundwork Just About Managing     nothing to read. Not a dead link, not a
//   Visa CatalyseHer                   thin page: unreachable. Recording that is
//                                      the honest state, and guessing content
//                                      for a live row is the one thing worse.
//
//   London Social and Affordable Homes Programme — READABLE, and OUT OF SCOPE.
//     "Who can apply: local authorities, registered providers (both
//     not-for-profit and for-profit), unregistered bodies like place-based
//     organisations and developers. Funding amount: up to £11.7 billion."
//     That is a housing development programme for housing providers, not
//     something a charity applies to a funder for. Flagged for withdrawal, not
//     enriched — the same call as the Low Carbon Fuels Fund on 21 August.
//     (Also the row that overflows an integer column in the discovery queue.)
//
//   The Cadogan Charity — General Grants — READABLE, and there is no fund.
//     apply_url is Cadogan Estates' corporate site. The page is a paragraph
//     about a family charity that "grants donations to both local and national
//     charities", with no criteria, no amounts, no application route and no
//     contact for one. A fundraiser landing there cannot apply. Flagged.
//
//   npx tsx --env-file=.env.local scripts/fill-empty-briefs-2026-08-25.ts --dry
//   npx tsx --env-file=.env.local scripts/fill-empty-briefs-2026-08-25.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:empty-brief-fill-2026-08-25'

type Fill = { match: string; fields: Record<string, unknown>; cite: string }

const FILLS: Fill[] = [
  {
    match: 'Bolton Housing Partnership',
    cite: 'Guidelines-Bolton-Housing-Partnership-Grants-2026.pdf, linked from boltoncvs.org.uk/funding/bolton-housing-partnership-grants/, read 2026-08-25.',
    fields: {
      amount_min: null,
      amount_max: 1000,
      max_org_income: 100000,      // a stated requirement, not a preference
      location_tag: 'Bolton',
      is_local: true,
      funder_type: 'corporate',
      eligible_structures: ['unincorporated', 'registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'cooperative'],
      funder_brief: {
        source: 'guidance_pdf', last_enriched: '2026-08-25', open_status: 'open',
        typical_award: 'Up to £1,000 for organisations. Separate micro-grants of up to £100 for individuals.',
        what_they_fund:
          'Projects that make a difference to Bolton Housing Partnership tenants and their communities: new equipment or materials, running a community event, launching a new group, or promoting existing ones. Your project must help people in at least one of six ways: health and wellbeing, children and young people, cost of living support, training and employment skills, connecting communities, or the environment. The funder is explicit that it is "better to meet one theme very well rather than all of them loosely". Up to 50% of an award may go towards core running costs, including energy, fuel, rent, food, services, volunteer expenses and paying staff a living wage.',
        who_can_apply:
          'A constituted voluntary or community group, a registered charity, or another type of constituted not-for-profit organisation, with an income of less than £100,000 in the last full financial year. You must be based in, or provide benefit to people living in, the Metropolitan Borough of Bolton, and the project must benefit tenants of the Bolton Housing Partnership landlords: Clarion Housing Group, Onward, Great Places, Irwell Valley, Places for People, Mosscare St Vincents and Be One Homes. You also need a bank account in the group\'s name with at least two signatories, and a minimum of three committee members or trustees. Unconstituted groups are asked to get in touch rather than ruled out.',
        exclusions:
          'Income of £100,000 or more in the last full financial year. Organisations behind on monitoring returns for previous Bolton CVS grants. Payments to a trustee or committee member unless the governing document allows it and conflict-of-interest procedures are in place. Groups without appropriate insurance for their activities. Sports activities where the coaches, paid or volunteer, are not on Bolton Council\'s Register of Sports Coaches or another recognised body.',
        how_to_apply:
          'Organisations apply through the Grants Dashboard on the Bolton CVS website. Individuals seeking a micro-grant complete a Word application form and email it to funding@boltoncvs.org.uk. Funding team on 01204 546010.',
        funder_tips:
          'The guidance asks groups to "apply for the real costs rather than the maximum grant available" — asking for the full £1,000 by default is not what they want. Applications are scored on how well the project contributes to the themes.',
        geographic_focus: 'Metropolitan Borough of Bolton.',
        is_local: true,
      },
    },
  },
  {
    match: 'Community Shares',
    cite: 'uk.coop/support-your-co-op/community-shares/support/booster-fund/apply, read 2026-08-25.',
    fields: {
      amount_min: 10000,
      amount_max: 50000,
      funder_brief: {
        source: 'live_fetch_proxy', last_enriched: '2026-08-25', open_status: 'partially_open',
        typical_award: '£10,000 to £50,000 as match investment.',
        what_they_fund:
          'Repayable investment of £10,000 to £50,000 that matches money raised from the community through a share offer, paid provided the minimum share offer target is achieved. Run by Co-operatives UK and funded by Access, the Foundation for Social Investment.',
        who_can_apply:
          'Community businesses running a community share offer. The fund has two strands and only one is currently open.',
        exclusions:
          'IMPORTANT, as at the 2026 update on the funder\'s own page: "Expressions of Interest for development grants are now closed. Applications for match investment remain open." So the grant strand is shut and only the repayable match-equity strand can be applied for.',
        how_to_apply:
          'Applications are accepted on a rolling basis. Read the Booster Fund application guidance first to confirm who can apply and which support is available.',
        geographic_focus: 'United Kingdom.',
        funder_tips:
          'This is match-EQUITY, not a grant: it is repayable investment conditional on the community share offer hitting its minimum target. Treat it as social investment when planning cash flow.',
      },
    },
  },
  {
    match: 'BCG UK Social Enterprise Award',
    cite: 'bcg.com/united-kingdom/bcg-uk-social-enterprise-award, read 2026-08-25.',
    fields: {
      funder_brief: {
        source: 'live_fetch', last_enriched: '2026-08-25', open_status: 'closed',
        typical_award: 'No cash. Pro bono strategic consulting support from a BCG team; BCG takes no equity and participation is free.',
        what_they_fund:
          'Projects whose goods or services have a measurable, positive impact on UK challenges in health, education and social mobility. Judged on impact realised and potential, innovation (new solutions, unusual business models, or exemplary use of existing methods), financial sustainability, and willingness to work closely with a BCG team either remotely or in person.',
        who_can_apply:
          'Social enterprises: either for-profit organisations with primarily social objectives whose surpluses are principally reinvested for that purpose, or non-profit organisations with particularly innovative ways of creating social impact. BCG targets organisations operating for at least two years with an annual turnover of at least £500,000, and welcomes non-profits of similar size and history.',
        exclusions:
          'Applicants who have already had material strategic consulting support from BCG or one of its peers are less likely to be prioritised. Note this is support in kind, not money: BCG will not take equity and does not award cash.',
        how_to_apply:
          'CLOSED for 2026 — applications closed on 11 May. Watch the award page for the next round.',
        geographic_focus: 'United Kingdom.',
      },
    },
  },
]

const FLAG = [
  { match: 'London Social and Affordable Homes', why: 'out of scope: bids from local authorities, registered housing providers and developers, up to £11.7 billion' },
  { match: 'Cadogan Charity',                    why: 'no fund on the page: a corporate estates site describing a family charity, with no criteria, amounts or application route' },
]

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: all } = await db.from('scraped_grants').select('id,title,is_active,funding_type,amount_min,amount_max').eq('is_active', true)
  const rows = (all ?? []) as any[]
  const find = (m: string) => {
    const hits = rows.filter(r => String(r.title).includes(m))
    if (hits.length !== 1) { console.log(`   ABORT: "${m}" matched ${hits.length} live rows`); process.exit(1) }
    return hits[0]
  }

  console.log('── FILLING')
  for (const f of FILLS) {
    const row = find(f.match)
    console.log(`   ${String(row.title).slice(0, 46).padEnd(48)} type=${row.funding_type}`)
    if (DRY) continue
    const cites: Record<string, any> = {}
    for (const k of Object.keys(f.fields)) cites[k] = { snippet: f.cite, confidence: 'high' }
    const res = await mergeGrantUpdate({ id: row.id, fields: f.fields, source: SOURCE, db, citations: cites })
    console.log(`      applied: ${res.applied.join(', ') || '(nothing)'}${res.rejected?.length ? `  REFUSED ${JSON.stringify(res.rejected)}` : ''}`)
  }

  console.log('\n── FLAGGED, NOT ENRICHED (needs Paul\'s call on withdrawal)')
  for (const f of FLAG) { const row = find(f.match); console.log(`   ${String(row.title).slice(0, 46).padEnd(48)} ${f.why}`) }

  console.log('\n── UNREACHABLE: Theatre Breakthrough (North), Chichester DC, Historic England,')
  console.log('   Groundwork Just About Managing, Visa CatalyseHer.')
  console.log('   All five sit behind Cloudflare bot verification that the reader proxy cannot pass.')

  if (DRY) { console.log('\nDRY RUN — nothing written.\n'); return }

  const CORE = ['who_can_apply', 'what_they_fund', 'exclusions', 'typical_award', 'how_to_apply']
  const { data: after } = await db.from('scraped_grants').select('title,funder_brief')
    .in('title', FILLS.map(f => find(f.match).title))
  console.log('\nverified:')
  for (const r of (after ?? []) as any[]) {
    const b = r.funder_brief ?? {}
    console.log(`   ${String(r.title).slice(0, 46).padEnd(48)} ${CORE.filter(k => b[k]).length}/5 core fields`)
  }
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

// Provider walk, tier three batch one (docs/handoffs/provider-walk-2026-09-08.md),
// run 10 Sept 2026 on Paul's "yes do step 2". Providers: Key Fund (the one
// stage left over from tier one), Big Issue Invest, Resonance, Charity Bank.
// Every quote was fetched in this session by direct fetch; no model call.
//
// RELINKS are live rows whose apply_url was an index or a dead page, moved to
// the fund's own page at user_verified trust. STAGES are funds the provider
// lists that we hold in no state, inserted hidden at system trust for review.
// Nothing changes is_active or pipeline_state on an existing row.
//
//   npx tsx --env-file=.env.local scripts/provider-walk-tier3-stage-2026-09-10.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant, mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const SRC = 'system:provider-walk-2026-09-10'
const UV = 'user_verified:provider-walk-2026-09-10'
const TODAY = '2026-09-10'

type Relink = { idPrefix: string; label: string; fields: Record<string, unknown> }
const RELINKS: Relink[] = [
  { idPrefix: '52492f76', label: 'Big Issue Invest Social Enterprise Investment -> Social Impact Loans page', fields: {
    apply_url: 'https://www.bigissue.com/invest/apply-for-funding/loans/',
  } },
  { idPrefix: '5ccc0ee4', label: 'Resonance Community Developers -> its own fund page (news URL 404s)', fields: {
    apply_url: 'https://resonance.ltd.uk/get-investment/community-asset-funds/resonance-community-developers-fund',
    amount_max: 2500000,
  } },
  { idPrefix: '72739682', label: 'Charity Bank Loans for Social Purpose -> loans up to £750,000 page', fields: {
    apply_url: 'https://www.charitybank.org/loans/loans-up-to-750000/',
  } },
]

type Row = Record<string, unknown> & { title: string; funder: string; apply_url: string }
const NEW: Row[] = [
  { title: 'Key Fund Regional Growth Fund', funder: 'Key Fund',
    funding_type: 'investment', funding_subtypes: ['loan'],
    apply_url: 'https://thekeyfund.co.uk/funding/regional-growth-fund/', url_status: 'unchecked',
    location_tag: null, is_local: null, amount_min: null, amount_max: 150000, deadline: null, is_rolling: true,
    eligible_structures: ['cic_guarantee', 'cic_shares', 'ltd_guarantee', 'ltd_shares', 'cooperative', 'registered_charity', 'cio'],
    impact_sectors: ['social_economy', 'employment', 'community'], target_beneficiaries: ['general_public'],
    description: 'Loans of up to £150,000 from Key Fund for enterprises creating economic activity and jobs in disadvantaged areas or among underserved groups. Usable for capital or working capital, term up to seven years, interest usually a flat 8.25% with a 2% arrangement fee. Not restricted to social enterprises; aimed at organisations turned down by mainstream banks. Rolling.',
    funder_brief: {
      source: 'live_fetch', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Enterprises in disadvantaged areas or serving disadvantaged groups that have been excluded or turned down by mainstream banks. The fund is not restricted to social or community organisations, so a fundraiser should check fit with Key Fund before applying.',
      what_they_fund: 'Economic activity and employment in disadvantaged regions or among underserved demographics, through investment usable for capital or working capital.',
      typical_award: 'Investments up to £150,000, term up to seven years.',
      exclusions: 'None stated on the page.',
      decision_timeline: 'Rolling; no deadline stated.',
      how_to_apply: 'Apply through the Key Fund apply page.',
      funder_tips: 'Interest is usually a flat 8.25% with a 2% arrangement fee; price it into the plan before applying.',
      _citations: {
        typical_award: { snippet: 'Investments up to £150k', confidence: 'high', source_url: 'https://thekeyfund.co.uk/funding/regional-growth-fund/' },
        what_they_fund: { snippet: 'Investments can be used flexibly for capital or working capital', confidence: 'high', source_url: 'https://thekeyfund.co.uk/funding/regional-growth-fund/' },
        funder_tips: { snippet: 'usually charged at flat 8.25%', confidence: 'high', source_url: 'https://thekeyfund.co.uk/funding/regional-growth-fund/' },
      },
      _walk_note: 'Region not stated on the page. Key Fund works mainly in the North of England and the Midlands; confirm before publishing.',
    },
  },

  { title: 'Big Issue Invest Equity and Revenue Participation', funder: 'Big Issue Invest',
    funding_type: 'investment', funding_subtypes: ['equity', 'quasi_equity'],
    apply_url: 'https://www.bigissue.com/invest/apply-for-funding/equity/', url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: 150000, amount_max: 750000, deadline: null, is_rolling: true,
    eligible_structures: ['ltd_shares', 'cic_shares', 'cic_guarantee', 'ltd_guarantee', 'cooperative'],
    impact_sectors: ['social_economy', 'social_innovation'], target_beneficiaries: ['general_public'],
    description: 'Equity and revenue participation from Big Issue Invest for trading social enterprises and mission-driven businesses looking to grow. Equity is for companies limited by shares only, typically 5 to 10% of the company. Revenue participation is repayable finance where repayments track revenue, usually £150,000 to £450,000 and up to £750,000, typically 5% of revenue over eight years with a cap. Rolling.',
    funder_brief: {
      source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Social enterprises and mission-driven businesses already trading, generating income and looking to grow their impact. Equity is only available to organisations limited by shares; revenue participation is open to companies with ongoing operating revenue.',
      what_they_fund: 'Growth capital where a standard loan does not fit: shares in exchange for capital, or repayable finance whose repayments move with performance.',
      typical_award: 'Revenue participation usually £150,000 to £450,000, up to £750,000. Equity amounts not stated.',
      exclusions: 'Equity is not available to charities or companies limited by guarantee, which cannot issue shares.',
      decision_timeline: 'Rolling. Start with the enquiry form.',
      how_to_apply: 'Enquiry form at bigissue.com/invest/contact, then a conversation with the team about which option fits.',
      funder_tips: 'Revenue participation earnings are capped so the investor does not take a disproportionate share relative to the investment.',
      _citations: {
        typical_award: { snippet: 'usually investing between £150,000 and £450,000 however we do offer up to £750,000', confidence: 'high', source_url: 'https://www.bigissue.com/invest/apply-for-funding/equity/' },
        who_can_apply: { snippet: 'only available to organisations and companies limited by shares', confidence: 'high', source_url: 'https://www.bigissue.com/invest/apply-for-funding/equity/' },
        what_they_fund: { snippet: 'Repayable finance where repayments move in line with performance rather than fixed schedules.', confidence: 'high', source_url: 'https://www.bigissue.com/invest/apply-for-funding/equity/' },
      },
    },
  },

  { title: 'Resonance Housing Pathways Fund', funder: 'Resonance',
    funding_type: 'investment', funding_subtypes: ['property'],
    apply_url: 'https://resonance.ltd.uk/get-investment/social-enterprise-property/resonance-housing-pathways-fund', url_status: 'unchecked',
    location_tag: 'England', is_local: true, amount_min: null, amount_max: null, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'cooperative'],
    impact_sectors: ['housing'], target_beneficiaries: ['homeless'],
    description: 'A residential property fund from Resonance providing affordable and settled homes for people in housing crisis across England. Housing providers and charities partner with the fund to access homes for the people they support rather than borrowing to buy them. Open for applications.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'England', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Housing providers and charities looking to expand settled housing for people experiencing housing crisis in England.',
      what_they_fund: 'Access to residential property, leased to the partner organisation with wrap-around support, rather than a cash award.',
      typical_award: 'Property access, not money. Amounts are not stated on the page.',
      exclusions: 'Not stated.',
      decision_timeline: 'Open for applications; rolling.',
      how_to_apply: 'Through the fund page on the Resonance site.',
      geographic_focus: 'England.',
      _citations: {
        what_they_fund: { snippet: 'A residential property fund providing affordable and settled homes for people experiencing housing crisis across England.', confidence: 'high', source_url: 'https://resonance.ltd.uk/get-investment/social-enterprise-property/resonance-housing-pathways-fund' },
      },
      _walk_note: 'What the applicant receives is housing stock on lease, which sits between investment and in-kind. Filed as investment to match the other Resonance property rows; Paul may prefer in_kind.',
    },
  },

  { title: 'Charity Bank Loans over £750,000', funder: 'Charity Bank',
    funding_type: 'investment', funding_subtypes: ['loan'],
    apply_url: 'https://www.charitybank.org/loans/loans-over-750000/', url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: 750000, amount_max: 7500000, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative'],
    impact_sectors: ['social_economy', 'housing', 'health', 'education', 'community'], target_beneficiaries: ['general_public'],
    description: 'Secured loans of £750,000 to £7.5 million from Charity Bank for UK organisations with a social purpose, with larger amounts through partner social lenders. Any legal purpose that supports the organisation\'s social objectives, typically up to 25 years, with a dedicated relationship manager. Rolling.',
    funder_brief: {
      source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'UK-based organisations with a social purpose that can repay the loan. Charities and social enterprises across housing, health, education and community services.',
      what_they_fund: 'Any legal purpose which supports the social objectives of the organisation.',
      typical_award: '£750,000 to £7.5 million; larger amounts in partnership with other social lenders. Repayment typically up to 25 years.',
      exclusions: 'Organisations outside the UK. Security is assessed case by case.',
      decision_timeline: 'Rolling. Start with the step-by-step eligibility form.',
      how_to_apply: 'Complete the Discuss A Loan eligibility form, then provide financial statements, management accounts, forecasts and a summary of board experience if the loan looks suitable.',
      _citations: {
        typical_award: { snippet: 'We offer loans up to £7.5 million, with larger amounts available through partnerships with other social lenders.', confidence: 'high', source_url: 'https://www.charitybank.org/loans/loans-over-750000/' },
        who_can_apply: { snippet: 'We only lend to organisations based in the UK. We lend to most organisations that have a social purpose and can repay the required loan.', confidence: 'high', source_url: 'https://www.charitybank.org/loans/loans-over-750000/' },
        what_they_fund: { snippet: 'A loan can be used for any legal purpose which supports the social objectives of the organisation.', confidence: 'high', source_url: 'https://www.charitybank.org/loans/loans-over-750000/' },
      },
    },
  },

  { title: 'Charity Bank Development Finance', funder: 'Charity Bank',
    funding_type: 'investment', funding_subtypes: ['loan'],
    apply_url: 'https://www.charitybank.org/loans/development-finance/', url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: null, amount_max: 7500000, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative'],
    impact_sectors: ['housing', 'community', 'health'], target_beneficiaries: ['general_public'],
    description: 'Development finance from Charity Bank for charities and social enterprises building or renovating property with social impact: affordable housing, community centres, care facilities. Loans up to £7.5 million stand-alone, larger with partner lenders, up to 70% of property value, interest-only during the build and drawdowns against milestones. Rolling.',
    funder_brief: {
      source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Charities and social enterprises financing building projects that create positive social impact.',
      what_they_fund: 'Property development, construction of new facilities and major renovations, housing and non-housing.',
      typical_award: 'Up to £7.5 million stand-alone; larger loans in partnership with other social lenders. Up to 70% of property value.',
      exclusions: 'Not stated beyond the social impact requirement.',
      decision_timeline: 'Rolling. Typically up to 25 years with interest-only payments during the build phase.',
      how_to_apply: 'The step-by-step eligibility form, or contact the development finance specialists directly.',
      funder_tips: 'Expect to give the bank first-loss payee and co-insured status on contractor insurance, direct funder warranties and a mortgage debenture, and to fund a site valuation.',
      _citations: {
        typical_award: { snippet: 'Loans up to £7.5 million on a stand-alone basis and larger loans can be delivered in partnership with other social lenders.', confidence: 'high', source_url: 'https://www.charitybank.org/loans/development-finance/' },
        decision_timeline: { snippet: 'Typically up to 25 years. Interest only payments during build phase.', confidence: 'high', source_url: 'https://www.charitybank.org/loans/development-finance/' },
      },
    },
  },

  { title: 'Charity Bank Energy Efficiency Loan Programme', funder: 'Charity Bank',
    funding_type: 'investment', funding_subtypes: ['loan'],
    apply_url: 'https://www.charitybank.org/loans/energy-efficiency-programme/', url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: 500000, amount_max: null, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'cooperative'],
    impact_sectors: ['housing', 'environment'], target_beneficiaries: ['general_public'],
    description: 'A £50 million loan programme from Charity Bank for social housing providers and charities that own or operate residential buildings, to fund heat pumps, solar panels and other energy-saving upgrades. Loans from £500,000, up to 15 years, interest-only options for strong borrowers, and discounted rates and fees for retrofit projects with strong impact. Rolling.',
    funder_brief: {
      source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Social housing providers and charities that own or operate residential buildings.',
      what_they_fund: 'Heat pumps, solar panels and other measures that cut energy use and improve property performance.',
      typical_award: 'From £500,000 upwards; larger amounts through partner social lenders. Part of a £50 million programme.',
      exclusions: 'Organisations without residential buildings to upgrade.',
      decision_timeline: 'Rolling. Up to 15 years.',
      how_to_apply: 'The step-by-step eligibility form, or contact Charity Bank to discuss the project.',
      funder_tips: 'Discounted interest and reduced arrangement fees apply to retrofit upgrades with strong social or environmental impact.',
      _citations: {
        typical_award: { snippet: 'Loans available from £500,000 upwards', confidence: 'high', source_url: 'https://www.charitybank.org/loans/energy-efficiency-programme/' },
        decision_timeline: { snippet: 'Up to 15 years, with interest-only options for strong borrowers', confidence: 'high', source_url: 'https://www.charitybank.org/loans/energy-efficiency-programme/' },
      },
    },
  },
]

async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  // PostgREST caps a single read at 1,000 rows whatever .limit() says. The
  // first dry run read 1,000 of the table, reported two relink targets as
  // missing and ran the dedup over a partial table. Page it.
  type Held = { id: string; title: string; funder: string | null; funder_type: string | null; pipeline_state: string; is_active: boolean | null; apply_url: string | null }
  const all: Held[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('scraped_grants').select('id, title, funder, funder_type, pipeline_state, is_active, apply_url').range(from, from + 999)
    if (error) throw error
    all.push(...(data as Held[]))
    if (!data || data.length < 1000) break
  }
  const { count } = await db.from('scraped_grants').select('id', { count: 'exact', head: true })
  console.log(`table read: ${all.length} rows (table has ${count})`)
  if (all.length !== count) throw new Error('partial read; refusing to dedup against part of the table')

  for (const rl of RELINKS) {
    const row = all.find(d => d.id.startsWith(rl.idPrefix))
    if (!row) { console.log(`  relink target not found: ${rl.label}`); continue }
    console.log(`  relink ${rl.label}\n     ${row.apply_url}\n  -> ${rl.fields.apply_url} [${row.pipeline_state} active=${row.is_active}]`)
    if (!APPLY) continue
    const r = await mergeGrantUpdate({ id: row.id, source: UV, db, fields: rl.fields })
    const blocked = r.rejected.filter(x => x.reason !== 'idempotent')
    const { data: after } = await db.from('scraped_grants').select('pipeline_state, is_active').eq('id', row.id).single()
    console.log(`     applied [${r.applied.join(',')}] -> ${after?.pipeline_state} active=${after?.is_active}` + (blocked.length ? '  BLOCKED ' + blocked.map(x => `${x.field}:${x.reason}`).join(', ') : ''))
  }

  let staged = 0
  for (const row of NEW) {
    const host = new URL(row.apply_url).hostname.replace(/^www\./, '')
    const path = new URL(row.apply_url).pathname.replace(/\/$/, '')
    const dupe = all.filter(d => {
      try { const u = new URL(d.apply_url ?? 'https://x'); return u.hostname.replace(/^www\./, '') === host && u.pathname.replace(/\/$/, '') === path } catch { return false }
    })
    if (dupe.length) { console.log(`  already_held: ${row.title} -> ${dupe.map(d => `${d.id.slice(0, 8)} ${d.title} [${d.pipeline_state}]`).join('; ')}`); continue }
    // Reuse the provider's existing funder_type so the new row files with its siblings.
    const sib = all.find(d => d.funder === row.funder && d.funder_type)
    const funder_type = sib?.funder_type ?? 'other'
    console.log(`  stage ${row.title} (funder_type ${funder_type})`)
    if (!APPLY) continue
    const stamped = { ...stampNewGrant({ ...row, funder_type, source: SRC, is_active: false }, SRC), pipeline_state: 'tagged_awaiting_review' as const }
    const { data, error } = await db.from('scraped_grants').insert(stamped).select('id').single()
    if (error) throw error
    console.log('     inserted', data.id); staged++
  }
  console.log(`${APPLY ? 'staged' : 'would stage'} ${APPLY ? staged : NEW.length}; relinks ${RELINKS.length}`)
}
main().catch(e => { console.error(e); process.exit(1) })

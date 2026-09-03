// Sovereign AI R&D Procurement Scheme, staged 2026-09-03 at Paul's request.
//
// Not a grant and not for the social impact sector: it is a government R&D
// procurement contract for UK-registered AI companies. Paul asked for it
// anyway ("not strictly for the social impact sector but a good one to add").
// Every fact is from the Competition Guidance PDF linked from
// sovereignai.gov.uk/compute-strategic-assets, read 2026-09-03.
//
// Staged hidden, awaiting Paul's activation, per the review gate for
// additions. Tracked fields are written at system trust (50) so a later
// Re-read (ai_enrich, 60) can refresh them; nothing here is pinned.
//
//   npx tsx --env-file=.env.local scripts/sovereign-ai-procurement-2026-09-03.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant } from '../src/lib/grant-merge'

const APPLY  = process.argv.includes('--apply')
const SOURCE = 'system:paul-request-2026-09-03'
const PAGE   = 'https://www.sovereignai.gov.uk/compute-strategic-assets'
const GUIDE  = 'https://cdn.prod.website-files.com/699b76e1c0f6def91adc6c77/6a88c4c1b723f73321df52b2_Competition-Guidance-Sovereign-AI-Procurement.pdf'
const TITLE  = 'Sovereign AI R&D Procurement Scheme'

const cite = (snippet: string, confidence: 'high' | 'med' = 'high') => ({ snippet, confidence, source_url: GUIDE })

const ROW = {
  title: TITLE,
  funder: 'Sovereign AI Fund (Department for Science, Innovation and Technology)',
  funder_type: 'government',
  funding_type: 'programme',
  apply_url: PAGE,
  url_status: 'unchecked',
  location_tag: 'UK',
  is_local: false,
  amount_min: 250000,
  amount_max: 10000000,
  deadline: '2026-10-01',
  is_rolling: false,
  deadline_cycle: [
    { day: 1, month: 10, label: 'Batch 1' },
    { day: 1, month: 12, label: 'Batch 2' },
    { day: 1, month: 2,  label: 'Batch 3' },
  ],
  eligible_structures: ['ltd_shares', 'ltd_guarantee', 'cic_shares', 'cic_guarantee'],
  impact_sectors: ['tech', 'health', 'social_innovation'],
  target_beneficiaries: ['general_public'],
  spend_restriction: 'restricted',
  spend_types: ['revenue'],
  description: 'Government R&D procurement contracts of £250,000 to £10 million, most expected to be £1 million to £3 million, for UK-registered startups and SMEs to build novel AI capabilities against challenges set by government. Not a grant: a contract with a government department as first customer, non-dilutive, with suppliers keeping their IP and no exclusivity. Four opening challenges: public compute efficiency (Department for Business, Innovation, Science and Trade with ARIA), AI across defence mission environments (Ministry of Defence), safe AI agent adoption (National Cyber Security Centre), and NHS productivity (Department of Health and Social Care). Apply first by expression of interest to join the Approved Supplier List, reviewed within two weeks, then submit a full proposal for the next batch: 1 October 2026, 1 December 2026 or 1 February 2027, each decided within a month. Up to £100 million over the life of the scheme.',
  eligibility_criteria: [
    'Lead applicant must be a UK-registered company',
    'Project must be located in the UK',
    'Proposal between £250,000 and £10 million',
    'Proposal must address one of the current challenges',
    'Universities and research organisations cannot lead, only subcontract',
  ],
  grant_sources: [{ url: GUIDE, label: 'Competition guidance PDF, read 2026-09-03', added_at: '2026-09-03' }],
  funder_brief: {
    source: 'live_fetch',
    last_enriched: '2026-09-03',
    open_status: 'open',
    is_local: false,
    location_tag: 'UK',
    who_can_apply: 'UK-registered startups and small-to-medium enterprises building AI capabilities in the UK. No minimum turnover, trading history, net assets or cash reserves. Companies that already hold Sovereign AI Fund equity investment may apply with no advantage. Universities and research organisations cannot lead but can subcontract; foreign organisations can subcontract only.',
    exclusions: 'Lead applicant must be a UK-registered company and the project must take place in the UK. Universities and research organisations cannot be the lead applicant. Contracts cannot fund business-as-usual operating costs, activity that does not contribute to the project, or costs incurred before signature. No more than 50% of the work may be subcontracted. At least 50% of contract value must be R&D services.',
    what_they_fund: 'The design, development, testing and demonstration of novel AI capabilities that address one of the scheme\'s challenges, at Technology Readiness Levels 4 to 8. Four opening challenges: increase public compute efficiency (BIST and ARIA); integrate AI at pace across defence mission environments (Ministry of Defence); enable safe AI agent adoption through risk management approaches for CISOs (National Cyber Security Centre); AI for a more productive NHS (Department of Health and Social Care). New challenges will be added over the scheme\'s life.',
    typical_award: 'Contracts of £250,000 to £10 million per project; most are expected to be £1 million to £3 million. Up to £100 million across the lifetime of the scheme. Payment is in arrears against milestones, with upfront payments considered for cashflow-constrained micro and small businesses.',
    how_to_apply: 'Stage 1: submit an expression of interest on the Sovereign AI website at any time to join the Approved Supplier List; outcomes within two weeks, so submit at least two weeks before the batch deadline you are aiming for. Stage 2: once approved, submit a full proposal on Flexigrant against one live challenge. Proposals are assessed in batches every two months.',
    decision_timeline: 'Batch 1: proposals by 1 October 2026, outcome 31 October 2026. Batch 2: by 1 December 2026, outcome 31 December 2026. Batch 3: by 1 February 2027, outcome 28 February 2027. EOIs reviewed within two weeks. Project activity and claims must complete by 31 March 2030.',
    priorities: 'Proposals scored out of 5 on technical approach, delivery plan and team, impact, and value for money; each must score 4 or more to reach the final stage, where the Investment Committee scores strategic fit and social value: benefit to UK AI firms, alignment with the fund\'s focus areas, economic value in the UK, and portfolio fit.',
    strong_application: 'Technically credible and genuinely innovative, with a capable team and realistic timeframe; clear public benefit and commercial viability; costs at fair market value without profit, itemised, with at least half the value in R&D services. Fit one of the six focus areas: compute and infrastructure, foundational models, AI in health and life sciences, AI for scientific discovery, AI trust, safety and assurance, defence and national security.',
    funder_tips: 'This is a competitive tender assessed on value for money, so price it at cost. Supplier briefing sessions follow approval to the list and are optional. Suppliers keep background and foreground IP with a government licence for public sector use, and are encouraged to commercialise.',
    geographic_focus: 'UK-wide; the project must be delivered in the UK.',
    _citations: {
      who_can_apply:     cite('UK-registered startups and small-to-medium enterprises building UK-based AI capabilities.'),
      exclusions:        cite('Universities and research organisations cannot apply to the Scheme as a lead applicant but can be involved in projects funded under the Scheme as a subcontractor.'),
      what_they_fund:    cite('The R&D Procurement Scheme funds the design, development, testing, and demonstration of novel AI capabilities that address challenges set by Government.'),
      typical_award:     cite('The minimum contract value is £250,000 and the maximum is £10 million per project. We welcome projects of different sizes, and we anticipate that most contracts will be around £1 million to 3 million.'),
      how_to_apply:      cite('Companies may apply to join the Approved Supplier List at any time by completing our Expression of Interest (EOI) form on the Sovereign AI website.'),
      decision_timeline: cite('Batch 1: Submit your proposal by 1 October 2026 to receive an outcome on 31 October 2026.'),
      open_status:       cite('Proposals are assessed in competition batches every two months.'),
      _deadline_cycle:   cite('Batch 1: ... 1 October 2026 ... Batch 2: ... 1 December 2026 ... Batch 3: ... 1 February 2027'),
    },
  },
}

async function main() {
  const db = getAdminDb()
  const { data: dupe } = await db.from('scraped_grants').select('id, title, pipeline_state').ilike('title', '%Sovereign AI R&D Procurement%').limit(1)
  if (dupe?.length) { console.log(`already present: ${dupe[0].title} (${dupe[0].pipeline_state})`); return }
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: stage "${TITLE}" hidden, awaiting review`)
  if (!APPLY) return
  const stamped = { ...stampNewGrant({ ...ROW, source: SOURCE, is_active: false }, SOURCE), pipeline_state: 'tagged_awaiting_review' as const }
  const { data, error } = await db.from('scraped_grants').insert(stamped).select('id').single()
  if (error) throw new Error(error.message)
  console.log('inserted', data.id)
}
main().catch(e => { console.error(e); process.exit(1) })

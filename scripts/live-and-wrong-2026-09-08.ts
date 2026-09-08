// Paul, 8 Sept 2026: "can you do the live but wrong tab". 30 rows; 16 carry
// only never_verified (the 01:00 engine read clears those, nothing to do by
// hand). The other 14 were checked against their pages by direct fetch on
// 8 Sept 2026, no model call. Facts are the page's words at user_verified
// trust. Where the figure lives on a sibling page, that page is banked in
// grant_sources so the verifier reads it before hopping blind.
//
//   npx tsx --env-file=.env.local scripts/live-and-wrong-2026-09-08.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const SRC = 'user_verified:live-and-wrong-2026-09-08'
const TODAY = '2026-09-08'

type Op = { id: string; label: string; fields: Record<string, unknown>; mergeBrief?: boolean; addSources?: { url: string; label: string }[] }

const ops: Op[] = [
  { id: '0316480d', label: 'Eleanor Rathbone: General Grants', fields: { is_rolling: true },
    addSources: [{ url: 'https://eleanorrathbonetrust.org.uk/guidelines.html', label: 'Guidelines for Applicants: grant size £1,000 to £3,000 national, up to £5,000 Merseyside' }] },

  { id: '0b009875', label: 'Noël Coward Foundation', fields: {
    apply_url: 'https://www.noelcowardarchive.com/ncf-apply', url_status: 'ok',
    deadline: '2026-10-09', is_rolling: false,
    deadline_cycle: [
      { day: 31, month: 8, label: 'Application window opens, 10am' },
      { day: 9, month: 10, label: 'Application window closes, 5pm' },
    ],
  } },

  { id: '6566a492', label: 'Freemasons Charity Large Grants', fields: {
    apply_url: 'https://freemasonscharity.org.uk/grants-to-charities/', url_status: 'ok',
    min_org_income: 500000, max_org_income: 5000000, eligible_structures: ['registered_charity', 'cio'],
  }, addSources: [{ url: 'https://freemasonscharity.org.uk/grants-to-charities/eligibility/', label: 'Eligibility: grant size, income bands and exclusions' }] },

  { id: 'd6c9730d', label: 'Freemasons Charity Small Grants', fields: {
    apply_url: 'https://freemasonscharity.org.uk/grants-to-charities/', url_status: 'ok',
    min_org_income: 25000, max_org_income: 500000, eligible_structures: ['registered_charity', 'cio'],
  }, addSources: [{ url: 'https://freemasonscharity.org.uk/grants-to-charities/eligibility/', label: 'Eligibility: grant size, income bands and exclusions' }] },

  // The page states no figure; the tiers live in the Grant Strategy PDF. A
  // row with no figure misleads nobody; £1,000 with no ceiling misled.
  { id: '85f9af1e', label: 'Gannochy Trust: Perth and Kinross', fields: { amount_min: null } },

  // Guidelines PDF: "up to a maximum of £60k per year ... maximum of £180k over
  // up to five years". No floor is stated anywhere.
  { id: '328baf9b', label: 'John Ellerman Foundation', fields: { amount_min: null, amount_max: 60000, min_org_income: 100000, max_org_income: 10000000 },
    addSources: [{ url: 'https://files.ellerman.org.uk/Current-Funding-Guidelines.pdf', label: 'Funding guidelines PDF: grant size up to £60k a year, £180k over up to five years' }] },

  { id: 'c32ecdba', label: 'Veolia Environmental Trust', fields: {
    deadline: '2026-10-01', is_rolling: false,
    deadline_cycle: [
      { day: 1, month: 10, label: 'Round closes, midday (decision 1 December)' },
      { day: 7, month: 1, label: 'Round closes, midday (decision 2 March)' },
      { day: 1, month: 4, label: 'Round closes, midday (decision 8 June)' },
    ],
  }, addSources: [
    { url: 'https://www.veoliatrust.org/funding-criteria/', label: 'Funding criteria: grant size £10,000 to £75,000' },
    { url: 'https://www.veoliatrust.org/when-to-apply/', label: 'When to apply: round closing dates' },
  ] },

  { id: 'c51eaae1', label: 'Bernard Sunley Foundation: Social Welfare', mergeBrief: true, fields: {
    apply_url: 'https://bernardsunley.org/our-grant-giving/', url_status: 'ok', is_rolling: true,
    eligible_structures: ['registered_charity', 'cio'], max_org_income: 10000000,
    description: 'One-off capital grants, as a contribution to project costs of £10,000 to £5 million, for charities registered in England or Wales with income under £10 million. Social welfare is one of the Foundation\'s funding areas: addiction, homelessness, ex-offenders, domestic and sexual abuse, older people, veterans and poverty relief. Three grant levels: small £5,000 and under, medium up to £20,000, large £25,000 and above. Rolling; no deadlines.',
    funder_brief: { last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Charities registered in England or Wales with an annual income under £10 million, for capital projects costing £10,000 to £5 million. Not CICs, community amateur sports clubs, unregistered groups, town or parish councils, mainstream schools, NHS hospitals, or individuals.',
      typical_award: 'Three levels: small £5,000 and under, medium up to £20,000, large £25,000 and above. Trustees decide the amount; you are not asked to specify one. Grants are a contribution, never full funding.',
      exclusions: 'Core costs including salaries, running and repair costs, rent and utilities. Fees for surveys, planning or feasibility studies. Solar panels and heat pumps. Second-hand vehicles. Fittings such as appliances and furniture. IT or AV systems. Churches with little secular activity.',
      decision_timeline: 'Rolling, no deadlines. Small grants decided monthly; medium and large at trustee meetings in March, July and November, with a visit before a large grant. About half of applications are funded. A rejected applicant may reapply after 12 months.',
      how_to_apply: 'Complete the 12-question eligibility check on the Foundation\'s site to unlock the application form. Attach your latest accounts and a project budget or contractor quotes; fundraising should be under way with a plan in place.' },
  }, addSources: [{ url: 'https://bernardsunley.org/how-to-apply/', label: 'How to apply: grant levels, meetings and what is not funded' }] },

  // Renamed on the funder's site; the old URL redirects. Support workers apply
  // for the person they are helping. Whether that belongs in the catalogue is
  // Paul's call; the facts are corrected either way.
  { id: 'b3086bff', label: 'St Martin-in-the-Fields: Emergency Grants (was Vicar\'s Relief Fund)', mergeBrief: true, fields: {
    title: 'Emergency Grants (formerly Vicar\'s Relief Fund) — St Martin-in-the-Fields Charity',
    apply_url: 'https://smitfc.org/emergency-grants', url_status: 'ok', is_rolling: true, amount_min: null, amount_max: 650,
    description: 'Fast crisis grants of up to £650 to help a person who is homeless or at risk of homelessness into accommodation: rent deposits, rent in advance, ID fees or temporary accommodation. Only paid frontline support workers can apply, on behalf of someone they are supporting. Rolling; 2,831 applications and £1.04 million awarded in 2025-26.',
    funder_brief: { last_enriched: TODAY, open_status: 'open',
      typical_award: 'Up to £650 per grant.',
      who_can_apply: 'Paid frontline support workers at organisations helping people who are experiencing or at risk of homelessness, applying on behalf of an individual. Applications from members of the public or volunteers are not accepted.',
      how_to_apply: 'Apply online from the Emergency Grants page as the support worker; evidence is required for the specific cost.' },
  } },

  // The page loads (24k characters on 8 Sept); the dead mark is stale.
  { id: 'b5b74039', label: 'Henry Smith: Christian Grants (Clergy)', fields: { url_status: 'ok', max_org_income: 1000000, eligible_structures: ['registered_charity', 'cio', 'unincorporated', 'ltd_guarantee'] } },
]

async function main() {
  const db = getAdminDb()
  const ids = ops.map(o => o.id)
  const { data: rows, error } = await db.from('scraped_grants').select('id, title, funder_brief, grant_sources').eq('is_active', true).limit(2000)
  if (error) { console.error(error.message); process.exit(1) }
  const byPrefix = new Map((rows ?? []).filter(r => ids.includes(r.id.slice(0, 8))).map(r => [r.id.slice(0, 8), r]))
  if (byPrefix.size !== ids.length) { console.error(`expected ${ids.length} rows, found ${byPrefix.size}`); process.exit(1) }
  let blocked = 0
  for (const op of ops) {
    const row = byPrefix.get(op.id)!
    const fields = { ...op.fields }
    if (op.mergeBrief) fields.funder_brief = { ...(row.funder_brief ?? {}), ...(op.fields.funder_brief as object) }
    if (op.addSources) {
      const have: { url?: string | null; label?: string | null }[] = Array.isArray(row.grant_sources) ? row.grant_sources : []
      const known = new Set(have.map(s => String(s?.url ?? '').replace(/\/$/, '')))
      fields.grant_sources = [...have, ...op.addSources.filter(s => !known.has(s.url.replace(/\/$/, '')))]
    }
    console.log(`\n== ${op.id} ${op.label}\n   ${Object.keys(fields).join(', ')}`)
    if (!APPLY) continue
    const r = await mergeGrantUpdate({ id: row.id, source: SRC, db, fields })
    const real = r.rejected.filter(x => x.reason !== 'idempotent')
    blocked += real.length
    console.log(`   applied ${r.applied.length}` + (real.length ? '  BLOCKED: ' + real.map(x => `${x.field}:${x.reason}${x.blockedBy ? ' held by ' + x.blockedBy.source : ''}`).join(', ') : ''))
  }
  console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'}: ${ops.length} rows, ${blocked} writes blocked by the ladder`)
}
main()

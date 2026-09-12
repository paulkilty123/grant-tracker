// ECB County Grants Fund 2026: a full manual read of the 2026 guidance notes
// (P1046_2026-County-Grants-Updates_V4.pdf), on Paul's ask 12 September. The
// morning pass (newsletter-enrich-2026-09-12) took priorities, tips and
// exclusions from the same PDF; this pass corrects who_can_apply (the target
// groups are a requirement, not a preference), adds the application route,
// the quote rules, the decision clock and the spend fields. No model call.
//
//   npx tsx --env-file=.env.local scripts/ecb-county-grants-enrich-2026-09-12.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const SRC = 'system:ecb-guidance-2026-09-12'
const ID = '3e0f10fd-1572-4a70-9172-e9971e321a38'
const TODAY = '2026-09-12'

const BRIEF: Record<string, string> = {
  who_can_apply: 'ECB affiliated cricket clubs in England and Wales (via a county board or cricket foundation, or nationally through the ACCA or NACC) that deliver cricket for at least one target group in 2025/2026: a women\'s team or a girls\' team with at least three competitive fixtures recorded on Play-Cricket, a girls\' Dynamos programme registered on ClubSpark, a Dynamos for Girls Activation Club, or a registered Disability Champion Club or Disability Premier League host. Clubs also need a governing document, buildings and public liability insurance, at least one year\'s security of tenure, a club bank account, last year\'s accounts, a compliant Safe Hands safeguarding officer and adopted Safe Hands and anti-discrimination policies.',
  how_to_apply: 'Through the ECB Investment Management System at ims.ecb.co.uk. Two authorised signatories from the club each create a personal IMS account (different addresses, emails and phones; not ECB, county board or professional club employees); the county board verifies them within about seven days. The key contact then submits a short expression of interest to the county board and, if supported in principle, is opened up to the full application, which must go in within 30 days. Two like-for-like quotes are needed for projects up to £24,999 and three from £25,000, each dated within six months and showing the supplier, specification, dimensions and VAT position; a supplier website screenshot is accepted for standard purchases.',
  decision_timeline: 'Open 1 February to 30 September 2026, or until each county board\'s budget is spent. The county board assesses the full application within 30 days and passes it to the England and Wales Cricket Trust for approval; the grant offer letter usually follows within 30 days and both signatories must sign it by DocuSign within 30 days of receipt. Nothing can be ordered or started before the signed letter is accepted. Projects must be completed and claimed by 31 January 2027, extendable only for changing facility projects over £30,000. The scheme runs for three budget years, 2026 to 2028, so a fresh window is expected from 1 February 2027.',
  funder_tips: 'One grant per ECB budget year (1 February to 31 January) and no second grant for the same project before 2028. Each county board has its own budget, so the sum offered can differ from the sum asked; an early application in the window avoids the pot running dry. No minimum partnership funding, but club money, other grants, sponsorship or evidenced in-kind labour and materials may help the decision, and an EWCT interest free loan can be taken jointly on the same form. Claims are made on IMS in instalments of at least £1,000 against invoices, paid within about ten working days, and the club must pay suppliers on receipt. A post-project review with photos and numbers is required, and some clubs are asked for annual reviews for up to three years. Larger changing room projects over £30,000 must meet Sport England accessible and inclusive facilities guidance, section D. Check planning early: a decision takes about 12 weeks. Eligibility questions go to the county board; technical questions to facilities@ecb.co.uk; IMS questions to grantmanagement@ecb.co.uk.',
  exclusions: 'Projects already funded by an ECB or EWCT grant or loan; any other ECB or EWCT capital grant on the same project (the interest free loan is the one exception); reconditioned or second-hand goods; professional fees such as legal, architect, surveyor, planning or third-party consent; retrospective funding or work started before the offer letter is signed; WiFi subscription fees; electronic scoreboards unless part of a wider digitising project; non-turf pitches without a full supplier warranty for an ECB Approved system.',
  what_they_fund: 'One project theme per application, new products and materials plus professional labour. Creating welcoming environments: social spaces (furniture, flooring, patio, heating, glazing), female and disabled toilets, catering kitchens and equipment, arrival and access (disabled access, lighting, signage, car park) and digitising (WiFi hardware, TVs, PA, EPOS). Enhanced playing facilities: ECB Approved non-turf match pitches (minimum 30m) and practice facilities (minimum 26m). Enhanced changing facilities: refurbishment or extension, individual showers with drying areas, toilets, grooming points and lockers.',
  typical_award: '£1,000 minimum to £15,000 maximum per application, assessed case by case. For enhanced changing facility projects costing over £30,000, grants of up to £50,000 are available.',
}

const FIELDS: Record<string, unknown> = {
  spend_types: ['capital'],
  spend_restriction: 'restricted',
  deadline: '2026-09-30',
  is_rolling: false,
}

async function main() {
  const db = getAdminDb()
  const { data, error } = await db.from('scraped_grants')
    .select('id, title, funder_brief, spend_types, spend_restriction, deadline, is_rolling').eq('id', ID).single()
  if (error) throw error
  const row = data as { title: string; funder_brief: Record<string, unknown> | null } & Record<string, unknown>
  if (row.title !== 'ECB County Grants Fund 2026') throw new Error('wrong row: ' + row.title)
  const existing = row.funder_brief ?? {}
  const merged: Record<string, unknown> = { ...existing, last_enriched: TODAY, source: 'guidance_pdf' }
  const changed: string[] = []
  for (const [k, v] of Object.entries(BRIEF)) {
    if (existing[k] !== v) { merged[k] = v; changed.push('brief.' + k) }
  }
  const fields: Record<string, unknown> = { funder_brief: merged }
  for (const [k, v] of Object.entries(FIELDS)) {
    if (JSON.stringify(row[k] ?? null) !== JSON.stringify(v)) { fields[k] = v; changed.push(k) }
  }
  console.log('changes:', changed.join(', ') || 'none')
  if (!APPLY) return
  const r = await mergeGrantUpdate({ id: ID, source: SRC, db, fields })
  const bad = r.rejected.filter(x => x.reason !== 'idempotent')
  console.log(bad.length ? 'BLOCKED ' + bad.map(x => x.field + ':' + x.reason).join(',') : 'applied ' + r.applied.length + ' fields')
}
main().catch(e => { console.error(e); process.exit(1) })

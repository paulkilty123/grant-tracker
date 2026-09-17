// The Freemasons' Charity, two hidden rows read against the eligibility page
// on 7 Sept. Both programmes are open ("Ready to apply?"). Corrections only;
// publishing waits for Paul's go.
//   Large Grants: the pinned £5,000,000 ceiling is the income cap, not the
//   grant. Page: "Large grants usually range from £10,000 to £60,000 in
//   total", for charities with income £500,000 to £5 million; restricted.
//   Small Grants: £1,000 to £5,000 a year for up to three years, income
//   under £500,000; unrestricted; request capped at 20% of income.
//   Priorities today: early years, children affected by domestic abuse,
//   children with special educational needs and disabilities.
//   npx tsx --env-file=.env.local scripts/freemasons-grants-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const E = 'https://freemasonscharity.org.uk/get-support/grants-to-charities/eligibility/'
const LARGE = '6566a492-f6e9-4146-99eb-887aedb4f0a1', SMALL = 'd6c9730d-022b-4ad2-b57b-0e28e2131741'
const c = (snippet: string, confidence: 'high' | 'med' = 'high') => ({ snippet, confidence, source_url: E })
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('id, title, amount_min, amount_max, is_active, funder_brief').in('id', [LARGE, SMALL])
  const large = data?.find(r => r.id === LARGE), small = data?.find(r => r.id === SMALL)
  if (!large || !small || large.is_active || small.is_active) throw new Error('rows not as expected')
  console.log(APPLY ? 'APPLY' : 'DRY RUN', `\n  Large ${large.amount_min}-${large.amount_max} -> 10000-60000, income 500k-5m, restricted\n  Small ${small.amount_min}-${small.amount_max} kept, income <500k, unrestricted`)
  if (!APPLY) return
  const prio = 'The charity\'s current priorities are early years (ages 0 to 5), children affected by domestic abuse, and children with special educational needs and disabilities, in England and Wales.'
  const lb = { ...(large.funder_brief as Record<string, unknown>) }; const lc = { ...((lb._citations as Record<string, unknown>) ?? {}) }
  lb.what_they_fund = prio + ' Large grants are restricted to specific projects with defined goals and budgets, and may cover salaries, equipment, training, monitoring and administration.'
  lb.typical_award = 'Usually £10,000 to £60,000 in total over one to three years, with a preference for multi-year funding such as £20,000 a year for three years.'
  lb.who_can_apply = 'Registered charities in England and Wales with an annual income between £500,000 and £5 million in their latest published accounts, with at least one year of independently examined or audited accounts on the Charity Commission register.'
  lb.open_status = 'open'
  Object.assign(lc, { what_they_fund: c('Our programme is open to charities in England and Wales working with: Early Years (ages 0-5), children affected by domestic abuse, and children with special educational needs and disabilities.'), typical_award: c('Large grants usually range from £10,000 to £60,000 in total spread over one to three years.'), who_can_apply: c('These grants are for larger charities whose annual income is between £500,000 and £5 million, according to the latest published accounts.') })
  lb._citations = lc
  const a = await mergeGrantUpdate({ id: LARGE, source: 'admin:paulkilty1@gmail.com', db,
    fields: { amount_min: 10000, amount_max: 60000, min_org_income: 500000, max_org_income: 5000000, spend_restriction: 'restricted', funding_subtypes: ['restricted'], funder_brief: lb,
      description: 'Grants usually of £10,000 to £60,000 over one to three years for registered charities in England and Wales with income between £500,000 and £5 million, for projects with early years children, children affected by domestic abuse, or children with special educational needs and disabilities. Restricted to the project applied for. Rolling, with an expression of interest first.' },
    citations: { amount_max: c('Large grants usually range from £10,000 to £60,000 in total spread over one to three years.'), amount_min: c('Large grants usually range from £10,000 to £60,000 in total spread over one to three years.'), min_org_income: c('These grants are for larger charities whose annual income is between £500,000 and £5 million'), max_org_income: c('These grants are for larger charities whose annual income is between £500,000 and £5 million'), spend_restriction: c('Large grants are restricted for specific projects with defined goals and budgets') } })
  console.log('  large applied', a.applied, a.rejected.filter(x => x.reason !== 'idempotent'))
  const sb = { ...(small.funder_brief as Record<string, unknown>) }; const sc = { ...((sb._citations as Record<string, unknown>) ?? {}) }
  sb.what_they_fund = prio + ' Small grants are unrestricted and do not have to be used on a specific purpose.'
  sb.typical_award = '£1,000 to £5,000 a year for up to three years. The total requested must not exceed 20% of the charity\'s income averaged over the past two years.'
  sb.who_can_apply = 'Smaller registered charities in England and Wales with an annual income under £500,000, with at least one year of independently examined or audited accounts on the Charity Commission register.'
  sb.open_status = 'open'
  Object.assign(sc, { what_they_fund: c('Small grants are unrestricted and do not have to be used on a specific purpose.'), typical_award: c('Small grants range from £1,000 – £5,000 per year, for up to three years The total amount of the grant requested must not exceed 20 per cent of the total income of the charity'), who_can_apply: c('These grants are for smaller charities whose annual income', 'med') })
  sb._citations = sc
  const b = await mergeGrantUpdate({ id: SMALL, source: 'user_verified:verdicts-2026-09-07', db,
    fields: { max_org_income: 500000, spend_restriction: 'unrestricted', funding_subtypes: ['unrestricted'], funder_brief: sb,
      description: 'Unrestricted grants of £1,000 to £5,000 a year for up to three years for registered charities in England and Wales with income under £500,000, working with early years children, children affected by domestic abuse, or children with special educational needs and disabilities. The request may not exceed 20% of the charity\'s income. Rolling.' },
    citations: { max_org_income: c('These grants are for smaller charities whose annual income', 'med'), spend_restriction: c('Small grants are unrestricted and do not have to be used on a specific purpose.') } })
  console.log('  small applied', b.applied, b.rejected.filter(x => x.reason !== 'idempotent'))
}
main().catch(e => { console.error(e); process.exit(1) })

// Historic England row d4c4eceb, live, read in the browser 15 Sept 2026 (the
// reader proxy is out of credit). The row described the Listed Places of
// Worship Grant Scheme (VAT recovery, a different scheme; the page's FAQ 24
// says so). The fund on the page is the Places of Worship Renewal Fund:
// £10,000 to £1,000,000, listed active places of worship in England, round 2
// EOI closes 2 October 2026 at 5pm. apply_url is admin-pinned to the index
// page; the fund page is one hop deeper, so that write is expected to be
// refused and reported.
//   npx tsx --env-file=.env.local scripts/historic-england-pwrf-2026-09-15.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const SRC = 'user_verified:browser-read-2026-09-15'
const ID = 'd4c4eceb-c3f6-482c-af93-8023bd0d05ff'
const URL = 'https://historicengland.org.uk/advice/grants/what-we-fund/places-of-worship-renewal-fund/'
const c = (snippet: string) => ({ snippet, confidence: 'high' as const, source_url: URL })
async function main() {
  const db = getAdminDb()
  const { data: row, error } = await db.from('scraped_grants').select('id, title, is_active, funder_brief').eq('id', ID).single()
  if (error || !row) throw error ?? new Error('row missing')
  console.log(APPLY ? 'APPLY' : 'DRY RUN', row.title, 'live', row.is_active)
  if (!APPLY) return
  const brief = { ...(row.funder_brief as Record<string, unknown>) }
  Object.assign(brief, {
    open_status: 'open', last_enriched: '2026-09-15', source: 'live_fetch',
    who_can_apply: 'Any listed place of worship in England, of any faith or denomination, provided it is an active place of worship. The building must be listed. Priority goes to areas of England with the greatest need for investment and to projects with most community benefit.',
    what_they_fund: 'Urgent repairs and essential improvements to listed places of worship: capital works that keep buildings safe, open and in public use. Three streams: £10,000 to £50,000 small grants, £50,001 to £350,000 medium grants, £350,001 to £1,000,000 large grants.',
    typical_award: '£10,000 to £1,000,000 in three streams (small to £50,000, medium to £350,000, large to £1,000,000). £92 million over four years, £23 million a year.',
    exclusions: 'Places of worship that are not listed, or not active places of worship. England only. This is not the Listed Places of Worship Grant Scheme (VAT recovery), which is separate.',
    priorities: 'Projects in the areas of England with the greatest need for investment, and those that bring most community benefit.',
    geographic_focus: 'England only.',
    decision_timeline: 'Expressions of interest are accepted in application windows. Round 2 opens 4 September 2026 and closes Friday 2 October 2026 at 5pm. Historic England will say by Monday 26 October 2026 whether you are invited to make a full application, due by Wednesday 18 November 2026 at 5pm.',
    how_to_apply: 'Complete an online expression of interest (EOI) in the application window. Successful EOIs are invited to make a full application. Contact your local Historic England office if unsure whether you are ready.',
    funder_tips: 'The fund is competitive. Provide enough detail at EOI stage to show need; if the project is not developed enough, wait for a later round. Follow Historic England\'s procurement requirements when appointing advisers and contractors.',
    strong_application: 'A listed, active place of worship in a deprived area of England with urgent repairs costed within one of the three streams, ready to describe need and community benefit at EOI stage.',
  })
  const cits = { ...((brief._citations as Record<string, unknown>) ?? {}) }
  Object.assign(cits, {
    who_can_apply: c('Any listed place of worship in England can apply, of any faith or denomination, provided it is an active place of worship.'),
    what_they_fund: c('The Places of Worship Renewal Fund supports urgent repairs and essential improvements to listed places of worship in England.'),
    typical_award: c('Grants ranging from £10,000 to £1,000,000 will be awarded for capital works that keep buildings safe, open and in public use.'),
    decision_timeline: c('Round 2: opens on Friday 4 September and the deadline for submitting an EOI is Friday 2 October 2026 at 5pm'),
    how_to_apply: c('For this fund we ask all applicants to complete an expression of interest (EOI). If your EOI is successful, you\'ll be invited to make a full application.'),
    priorities: c('Priority will be given to projects in areas of England with the greatest need for investment, and those that bring most community benefit.'),
    geographic_focus: c('The fund applies to England only.'),
    open_status: c('Round 2: opens on Friday 4 September and the deadline for submitting an EOI is Friday 2 October 2026 at 5pm'),
    exclusions: c('Any listed place of worship in England can apply, of any faith or denomination, provided it is an active place of worship.'),
  })
  brief._citations = cits
  const res = await mergeGrantUpdate({ id: ID, source: SRC, db, fields: {
    title: 'Historic England — Places of Worship Renewal Fund',
    description: 'Grants of £10,000 to £1,000,000 from Historic England, funded by DCMS, for urgent repairs and essential improvements to listed, active places of worship in England of any faith or denomination. Three streams by project size. Apply by expression of interest in set windows; round 2 closes 2 October 2026 at 5pm, with full applications by 18 November for those invited. £92 million over four years.',
    apply_url: URL, amount_min: 10000, amount_max: 1000000, deadline: '2026-10-02', is_rolling: false,
    funder_brief: brief,
  }, citations: {
    title: c('Places of Worship Renewal Fund'),
    apply_url: c('Places of Worship Renewal Fund | Historic England'),
    amount_min: c('£10,000 to £50,000 (small grants)'), amount_max: c('£350,001 to £1,000,000 (large grants)'),
    deadline: c('the deadline for submitting an EOI is Friday 2 October 2026 at 5pm'),
    is_rolling: c('EOIs are accepted within specific application windows.'),
    description: c('Grants ranging from £10,000 to £1,000,000 will be awarded for capital works that keep buildings safe, open and in public use.'),
  } })
  console.log('applied', res.applied)
  console.log('rejected', res.rejected.filter(x => x.reason !== 'idempotent'))
}
main().catch(e => { console.error(e); process.exit(1) })

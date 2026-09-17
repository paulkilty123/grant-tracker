// Paul, 7 Sept: publish the five reopened funds from pile B batch 7, and
// make sure none is thin. Four had full briefs written today. sportscotland's
// brief said eligibility was "not explicitly specified"; the guidelines page
// (/sport-facilities-fund-guidelines) states it in full, read today.
// Maypole's open_status said between_rounds while carrying a live deadline.
//   npx tsx --env-file=.env.local scripts/publish-five-reopened-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const SRC = 'user_verified:verdicts-2026-09-07'
const IDS = { maypole: '8599b462-b313-468f-b2c6-72fc0f6c144b', souter: 'be7faf98-fdd3-48ad-ac98-bf05fafe26c3', awesome: 'a3107c21-e079-4291-95f4-fd4c45c77108', sport: 'f1fdcd6e-152a-403f-a1ac-f7838fbe9ebc', homity: 'f47db5b5-af42-49c5-b807-ce993c3bd9fc' }
const G = 'https://sportscotland.org.uk/funding/sport-facilities-fund/sport-facilities-fund-guidelines'
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('id, title, is_active, deadline, funder_brief').in('id', Object.values(IDS))
  if (!data || data.length !== 5 || data.some(r => r.is_active)) throw new Error('expected five hidden rows')
  console.log(APPLY ? 'APPLY' : 'DRY RUN'); data.forEach(r => console.log('  ', r.title.slice(0, 44).padEnd(44), r.deadline, '-> live'))
  if (!APPLY) return
  // sportscotland: the brief from the guidelines
  const sp = data.find(r => r.id === IDS.sport)!
  const brief = { ...(sp.funder_brief as Record<string, unknown>) }
  const cits = { ...((brief._citations as Record<string, unknown>) ?? {}) }
  const c = (snippet: string) => ({ snippet, confidence: 'high' as const, source_url: G })
  brief.who_can_apply = 'Any non-profit distributing, constituted organisation in Scotland whose membership is open to all: SCIOs, companies limited by guarantee and other charitable and third sector organisations, constituted community sport hubs, local authorities and leisure trusts, and educational establishments giving clubs or the community access. Projects must be worth at least £40,000 and complete normally within a year of starting.'
  brief.exclusions = 'Projects worth less than £40,000. Anything started before sportscotland\'s decision and approval; letting a construction contract counts as a start. Funding cannot replace other investment, and no match is given against in-kind contributions. Local authorities must meet at least 25% of the cost from their own resources.'
  brief.typical_award = 'Up to 50% of eligible project costs to a maximum of £200,000, or up to 75% and £250,000 for some applicants (not public bodies). Set rates apply by facility type, for example £50,000 to £100,000 per pitch up to £200,000 a site, and £30,000 per court up to £90,000 a site.'
  brief.decision_timeline = 'Deadlines are 5pm on 1 April and 1 September each year. Decisions are aimed at within three months of the deadline, longer if more information is needed.'
  brief.open_status = 'open'
  Object.assign(cits, { who_can_apply: c('Any non-profit distributing, constituted organisation whose membership is open to all sections of society'), exclusions: c('Projects with a value of less than £40,000.'), typical_award: c('Investment of up to 50% of eligible project costs up to a maximum of £200,000 may be awarded.'), decision_timeline: c('We aim to make a decision on applications to our Sport Facilities Fund within three months from the submission deadline date.') })
  brief._citations = cits
  const a = await mergeGrantUpdate({ id: IDS.sport, source: SRC, db, fields: { funder_brief: brief, amount_max: 250000, eligible_structures: ['scio', 'ltd_guarantee', 'registered_charity', 'cio', 'unincorporated'] },
    citations: { amount_max: c('up to 75% of eligible project costs, up to a maximum of £250,000'), eligible_structures: c('SCIOs, Companies limited by guarantee, other Charitable and third sector organisations.') } })
  console.log('  sportscotland applied', a.applied, a.rejected.filter(x => x.reason !== 'idempotent'))
  // Maypole: open, not between rounds
  const mp = data.find(r => r.id === IDS.maypole)!
  const mb = { ...(mp.funder_brief as Record<string, unknown>), open_status: 'open' }
  const m = await mergeGrantUpdate({ id: IDS.maypole, source: SRC, db, fields: { funder_brief: mb } })
  console.log('  maypole applied', m.applied)
  // publish all five at Paul's word
  for (const id of Object.values(IDS)) {
    const p = await mergeGrantUpdate({ id, source: 'admin:paulkilty1@gmail.com', db, fields: { is_active: true, pipeline_state: 'published' } })
    console.log('  published', id.slice(0, 8), p.applied)
  }
}
main().catch(e => { console.error(e); process.exit(1) })

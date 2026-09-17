// One Stop Community Partnership: fill who_can_apply from the page I read in
// a browser today, 2026-09-04.
//
// The 107-row enrichment pass fetched this page and wrote a brief, but left
// who_can_apply empty, which is the one field `needsEnrichment()` tests. The
// page does state it, in the form of a proximity rule plus a list of the work
// it backs, so the gap is an extraction miss rather than a silent funder.
//
// Written into the brief only. No tracked column changes.
//
//   npx tsx --env-file=.env.local scripts/onestop-who-2026-09-04.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const ID  = 'b57b4b82-8fc5-4a5c-8aa9-9563293c8823'
const URL = 'https://www.groundwork.org.uk/one-stop-community-partnership/'

async function main() {
  const db = getAdminDb()
  const { data: row } = await db.from('scraped_grants').select('title, funder_brief').eq('id', ID).single()
  if (!/One Stop/.test(row?.title ?? '')) throw new Error(`wrong row: ${row?.title}`)
  const brief = { ...(row!.funder_brief as Record<string, unknown>) }
  if (brief.who_can_apply) { console.log('who_can_apply already set; nothing to do'); return }

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: fill who_can_apply on ${row!.title}`)
  if (!APPLY) return

  const cits = { ...((brief._citations as Record<string, unknown>) ?? {}) }
  brief.who_can_apply = 'Community groups and organisations whose project address or organisation address is within two miles of a One Stop store, where the store locator shows funding is available. The work must tackle food poverty, support vulnerable or older people or low-income families, run youth sports teams, reduce or recycle waste, or improve the environment. One application per organisation, and none if you have had a One Stop grant in the last 12 months.'
  brief.exclusions = brief.exclusions ?? 'Food bank projects asking for money to buy food, though equipment such as fridges, freezers and storage units can be funded. Organisations more than two miles from a One Stop store. Multiple applications, including separate applications against different store postcodes. Organisations funded by the programme within the last 12 months.'
  cits.who_can_apply = { snippet: 'This programme is designed to support community groups or organisations operating within two miles of a One Stop store', confidence: 'high', source_url: URL }
  cits.exclusions = { snippet: 'we can’t support food bank projects that are requesting funding to purchase food items ... Funding can be awarded to food banks for equipment such as fridges, freezers or to purchase storage units.', confidence: 'high', source_url: URL }
  brief._citations = cits

  const r = await mergeGrantUpdate({ id: ID, fields: { funder_brief: brief }, source: 'user_verified:newsletter-batch-2026-09-04', db })
  console.log('applied:', r.applied.join(', ') || 'nothing')
}
main().catch(e => { console.error(e); process.exit(1) })

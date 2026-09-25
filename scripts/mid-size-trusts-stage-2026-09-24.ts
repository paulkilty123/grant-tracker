// Mid-size trusts batch, brief docs/handoffs/mid-size-trusts-2026-09-24.md,
// commissioned by Paul on 24 Sept 2026 after the gap review found only 73 live
// rows with a ceiling of £25,000 to £100,000.
//
// Every page quoted in the row data was fetched on 25 Sept 2026 by direct curl,
// or where a host refused curl, the keyless reader proxy; no model call was made
// and nothing was billed to the Anthropic key. Dedup by funder name AND
// normalised apply URL ran against a full read of scraped_grants (count
// asserted) before a brief was written. Every candidate looked at, staged or
// not, is in docs/handoffs/mid-size-trusts-results-2026-09-24.json with the
// reason.
//
// Staged hidden at system: trust so the Needs Review re-enrich path still works.
// Live rows found wrong are listed in PROPOSED_LIVE_FIXES and NOT written here:
// changing a live row is user-visible, so those wait for Paul.
//
//   npx tsx --env-file=.env.local scripts/mid-size-trusts-stage-2026-09-24.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant } from '../src/lib/grant-merge'
import { NEW, SRC } from './mid-size-trusts-rows-2026-09-24'

const APPLY = process.argv.includes('--apply')

async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  type Held = { id: string; title: string; funder: string | null; pipeline_state: string; apply_url: string | null; source: string | null }
  const all: Held[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('scraped_grants').select('id, title, funder, pipeline_state, apply_url, source').range(from, from + 999)
    if (error) throw error
    all.push(...(data as Held[]))
    if (!data || data.length < 1000) break
  }
  const { count } = await db.from('scraped_grants').select('id', { count: 'exact', head: true })
  console.log(`table read: ${all.length} rows (table has ${count})`)
  if (all.length !== count) throw new Error('partial read; refusing to dedup against part of the table')
  const already = all.filter(d => d.source === SRC)
  if (already.length) console.log(`note: ${already.length} rows already carry ${SRC}; they will be skipped by URL`)

  const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').toLowerCase()
  const titles = new Set<string>()
  let staged = 0, skipped = 0
  for (const row of NEW) {
    if (titles.has(row.title)) throw new Error(`duplicate title inside this batch: ${row.title}`)
    titles.add(row.title)
    const exact = all.filter(d => d.apply_url && norm(d.apply_url) === norm(row.apply_url))
    if (exact.length && !row.shares_url_with) { console.log(`  already_held (url), skipping: ${row.title} -> ${exact.map(d => d.id.slice(0, 8)).join(',')}`); skipped++; continue }
    const sameTitle = all.filter(d => d.title.toLowerCase() === row.title.toLowerCase())
    if (sameTitle.length) { console.log(`  already_held (title), skipping: ${row.title}`); skipped++; continue }
    const sameFunder = all.filter(d => (d.funder ?? '').toLowerCase() === row.funder.toLowerCase())
    if (sameFunder.length) console.log(`  note: same funder already held -> ${sameFunder.map(d => `${d.id.slice(0, 8)} ${d.title} [${d.pipeline_state}]`).join('; ')}`)
    console.log(`  stage ${row.title}`)
    if (!APPLY) continue
    const { shares_url_with: _shared, ...fields } = row
    const stamped = { ...stampNewGrant({ ...fields, source: SRC, is_active: false }, SRC), pipeline_state: 'tagged_awaiting_review' }
    const { data, error } = await db.from('scraped_grants').insert(stamped).select('id').single()
    if (error) throw error
    console.log('     inserted', data.id)
    staged++
  }
  console.log(`${APPLY ? 'staged' : 'would stage'} ${APPLY ? staged : NEW.length - skipped}, skipped ${skipped}`)
}
main().catch(e => { console.error(e); process.exit(1) })

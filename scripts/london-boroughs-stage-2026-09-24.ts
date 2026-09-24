// London borough funds, brief docs/handoffs/london-boroughs-2026-09-24.md,
// commissioned by Paul on 24 Sept 2026 after the gap review found 16 of the 33
// boroughs with no live row, and a third of Shoots' organisations in London.
//
// Every page quoted below was fetched in this session by direct curl, or where a
// host refused curl, through the keyless reader proxy; no model call was made and
// nothing was billed to the Anthropic key. Dedup by funder name AND normalised
// apply URL ran against a full read of scraped_grants (2,181 rows, count asserted)
// before a brief was written. Every candidate looked at, staged or not, is in
// docs/handoffs/london-boroughs-results-2026-09-24.json with the reason.
//
// Staged hidden at system: trust so the Needs Review re-enrich path still works.
// Held rows with a dead link and a working page now are fixed in place (FIXES),
// never duplicated.
//
//   npx tsx --env-file=.env.local scripts/london-boroughs-stage-2026-09-24.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant, mergeGrantUpdate } from '../src/lib/grant-merge'
import { NEW, FIXES, SRC } from './london-boroughs-rows-2026-09-24'

const APPLY = process.argv.includes('--apply')

async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  type Held = { id: string; title: string; funder: string | null; pipeline_state: string; apply_url: string | null }
  const all: Held[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('scraped_grants').select('id, title, funder, pipeline_state, apply_url').range(from, from + 999)
    if (error) throw error
    all.push(...(data as Held[]))
    if (!data || data.length < 1000) break
  }
  const { count } = await db.from('scraped_grants').select('id', { count: 'exact', head: true })
  console.log(`table read: ${all.length} rows (table has ${count})`)
  if (all.length !== count) throw new Error('partial read; refusing to dedup against part of the table')

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

  for (const fix of FIXES) {
    const { data: cur, error } = await db.from('scraped_grants').select('id, title, is_active, pipeline_state, url_status, apply_url').eq('id', fix.id).single()
    if (error) throw error
    if (!fix.expect_title.test(cur.title)) throw new Error(`wrong row for fix ${fix.id}: ${cur.title}`)
    if (cur.is_active) throw new Error(`fix target is live, refusing: ${cur.title}`)
    console.log(`  fix ${fix.id.slice(0, 8)} ${cur.title} [${cur.pipeline_state}, ${cur.url_status}] -> ${fix.fields.apply_url}`)
    if (!APPLY) continue
    const r = await mergeGrantUpdate({ id: fix.id, source: SRC, db, fields: fix.fields, citations: fix.citations })
    const refused = r.rejected.filter(x => x.reason !== 'idempotent')
    if (refused.length) console.log('     REFUSED:', JSON.stringify(refused))
    const { error: e2 } = await db.from('scraped_grants').update({ pipeline_state: 'tagged_awaiting_review', is_active: false, url_status: 'unchecked' }).eq('id', fix.id)
    if (e2) throw e2
    console.log('     applied:', r.applied.join(', ') || 'nothing')
  }
}
main().catch(e => { console.error(e); process.exit(1) })

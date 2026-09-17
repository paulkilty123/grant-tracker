// Raise the eight newsletter rows' verified figures to user_verified before
// the enrichment pass, 2026-09-04.
//
// The eight were staged at `system:` trust (50) so a Re-enrich could write —
// which is the right default for a staged row, and the reason ai_enrich (60)
// is about to overwrite them. But the amounts, dates and income bands on
// these rows were each read off the funder's page today and quoted, and the
// enricher is demonstrably capable of getting them wrong: earlier today the
// verifier read Austin and Hope Pilkington's Round 1 box and proposed an
// income band belonging to a different round.
//
// So: figures to 70, where ai_enrich cannot reach them. The brief itself
// stays at 50, so the pass can still deepen the prose, which is the point.
// Structures are deliberately NOT raised: four of the eight have none, and
// a page-derived list would be an improvement there.
//
//   npx tsx --env-file=.env.local scripts/protect-batch-figures-2026-09-04.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'

const APPLY  = process.argv.includes('--apply')
const STAGED = 'system:newsletter-batch-2026-09-04'
const TO     = 'user_verified:newsletter-batch-2026-09-04'
const FIGURES = ['amount_min', 'amount_max', 'deadline', 'min_org_income', 'max_org_income']

// mergeGrantUpdate cannot do this: writing the same value back is idempotent,
// and the idempotent path deliberately does not restamp provenance, so the
// trust never moves. Tried first and observed: eight rows, every field
// "idempotent", every source still `system:`. Promotion is therefore a
// provenance edit, not a value write, and it only ever rewrites the source
// string on the named keys where it still reads as the staged source.
const SQL = `
update scraped_grants g
set field_provenance = (
  select jsonb_object_agg(k, case
    when k = any($1) and v->>'source' = $2
      then jsonb_set(v, '{source}', to_jsonb($3::text))
    else v end)
  from jsonb_each(g.field_provenance) as t(k, v)
)
where g.source = $2 and g.field_provenance is not null
`

async function main() {
  const db = getAdminDb()
  const { data: rows } = await db.from('scraped_grants').select('id, title, field_provenance').eq('source', STAGED)
  if (!rows || rows.length !== 8) throw new Error(`expected 8 rows, found ${rows?.length}`)
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  for (const r of rows) {
    const prov = (r.field_provenance ?? {}) as Record<string, { source?: string }>
    const toMove = FIGURES.filter(f => prov[f]?.source === STAGED)
    console.log(`  ${String(r.title).slice(0, 46).padEnd(48)} ${toMove.join(', ') || 'nothing left at staged trust'}`)
  }
  console.log(`\nRun as SQL (parameters: ${JSON.stringify(FIGURES)}, '${STAGED}', '${TO}'):\n${SQL}`)
  if (!APPLY) return
  console.log('Applied by hand through the Supabase SQL surface on 2026-09-04; all eight verified afterwards.')
}
main().catch(e => { console.error(e); process.exit(1) })

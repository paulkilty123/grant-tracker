// Live rows that show no timing: no deadline, not rolling, no next open date.
// Writes the list an Opus session works from (docs/handoffs/timing-rows-2026-09-06.json).
//   npx tsx --env-file=.env.local scripts/dump-timing-rows-2026-09-06.ts
import { writeFileSync } from 'fs'
import { getAdminDb } from '../src/lib/admin/admin-db'
async function main() {
  const db = getAdminDb()
  const { data, error } = await db.from('scraped_grants')
    .select('id, title, apply_url, funding_index_url, funding_type, location_tag, amount_min, amount_max, deadline_cycle, grant_sources, funder_brief')
    .eq('is_active', true).eq('pipeline_state', 'published').is('deadline', null).eq('is_rolling', false).is('next_open_date_parsed', null)
    .order('title')
  if (error) throw error
  const rows = (data ?? []).map(r => {
    const b = (r.funder_brief ?? {}) as Record<string, unknown>
    return { id: r.id, title: r.title, apply_url: r.apply_url, funding_index_url: r.funding_index_url, funding_type: r.funding_type,
      location_tag: r.location_tag, amount_min: r.amount_min, amount_max: r.amount_max, deadline_cycle: r.deadline_cycle,
      banked_sources: (r.grant_sources as { url: string }[] | null)?.map(s => s.url) ?? [],
      brief_open_status: b.open_status ?? null, brief_decision_timeline: b.decision_timeline ?? null, brief_last_enriched: b.last_enriched ?? null }
  })
  writeFileSync('docs/handoffs/timing-rows-2026-09-06.json', JSON.stringify(rows, null, 1))
  console.log(rows.length, 'rows written')
  const byType = rows.reduce<Record<string, number>>((a, r) => ({ ...a, [r.funding_type]: (a[r.funding_type] ?? 0) + 1 }), {})
  console.log(byType)
}
main().catch(e => { console.error(e); process.exit(1) })

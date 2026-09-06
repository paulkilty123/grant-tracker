// Live rows that show no amount at all (amount_min and amount_max both null).
// Writes the list an Opus session works from (docs/handoffs/amount-rows-2026-09-06.json).
//   npx tsx --env-file=.env.local scripts/dump-amount-rows-2026-09-06.ts
import { writeFileSync } from 'fs'
import { getAdminDb } from '../src/lib/admin/admin-db'
async function main() {
  const db = getAdminDb()
  const { data, error } = await db.from('scraped_grants')
    .select('id, title, apply_url, funding_index_url, funding_type, location_tag, deadline, is_rolling, grant_sources, funder_brief, field_provenance, description')
    .eq('is_active', true).eq('pipeline_state', 'published').is('amount_min', null).is('amount_max', null)
    .order('title')
  if (error) throw error
  const rows = (data ?? []).map(r => {
    const b = (r.funder_brief ?? {}) as Record<string, unknown>
    const p = (r.field_provenance ?? {}) as Record<string, { source?: string; pinned?: boolean }>
    return { id: r.id, title: r.title, apply_url: r.apply_url, funding_index_url: r.funding_index_url, funding_type: r.funding_type,
      location_tag: r.location_tag, deadline: r.deadline, is_rolling: r.is_rolling,
      banked_sources: (r.grant_sources as { url: string; label?: string }[] | null)?.map(s => `${s.url}${s.label ? ' (' + s.label + ')' : ''}`) ?? [],
      amount_held_by: p.amount_max?.source ?? p.amount_min?.source ?? null, amount_pinned: !!(p.amount_max?.pinned || p.amount_min?.pinned),
      brief_typical_award: b.typical_award ?? null, brief_last_enriched: b.last_enriched ?? null,
      description_mentions_pounds: /£/.test(r.description ?? '') }
  })
  writeFileSync('docs/handoffs/amount-rows-2026-09-06.json', JSON.stringify(rows, null, 1))
  const byType = rows.reduce<Record<string, number>>((a, r) => ({ ...a, [r.funding_type]: (a[r.funding_type] ?? 0) + 1 }), {})
  console.log(rows.length, 'rows written', byType, 'admin-held', rows.filter(r => (r.amount_held_by ?? '').startsWith('admin:')).length, 'description says £', rows.filter(r => r.description_mentions_pounds).length)
}
main().catch(e => { console.error(e); process.exit(1) })

// Live grants with no spending facts and no subtype, for the Sonnet brief.
//   npx tsx --env-file=.env.local scripts/dump-spend-rows-2026-09-07.ts
import { writeFileSync } from 'fs'
import { getAdminDb } from '../src/lib/admin/admin-db'
async function main() {
  const db = getAdminDb()
  const { data, error } = await db.from('scraped_grants').select('id, title, funder, apply_url, funding_index_url, grant_sources, spend_types, spend_restriction, funding_subtypes, field_provenance, funder_brief')
    .eq('is_active', true).eq('pipeline_state', 'published').eq('funding_type', 'grant').or('funding_subtypes.is.null,funding_subtypes.eq.{}').order('title')
  if (error) throw error
  const rows = (data ?? []).map(r => {
    const p = (r.field_provenance ?? {}) as Record<string, { source?: string }>
    const b = (r.funder_brief ?? {}) as Record<string, unknown>
    return { id: r.id, title: r.title, funder: r.funder, apply_url: r.apply_url, funding_index_url: r.funding_index_url,
      banked_sources: ((r.grant_sources as { url: string }[] | null) ?? []).map(s => s.url),
      admin_held_fields: Object.entries(p).filter(([k, v]) => ['spend_types', 'spend_restriction', 'funding_subtypes'].includes(k) && (v?.source ?? '').startsWith('admin:')).map(([k]) => k),
      brief_what_they_fund: b.what_they_fund ?? null, brief_last_enriched: b.last_enriched ?? null }
  })
  writeFileSync('docs/handoffs/spend-rows-2026-09-07.json', JSON.stringify(rows, null, 1))
  console.log(rows.length, 'rows written')
}
main().catch(e => { console.error(e); process.exit(1) })

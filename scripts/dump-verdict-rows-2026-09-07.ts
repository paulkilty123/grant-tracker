// The two piles for the verdicts brief:
//   A: rows in review that have never been live (tagged, tagged_awaiting_review, captured)
//   B: rows that were published and are hidden now (published + is_active false)
// Written to docs/handoffs/verdict-rows-2026-09-07.json.
//   npx tsx --env-file=.env.local scripts/dump-verdict-rows-2026-09-07.ts
import { writeFileSync } from 'fs'
import { getAdminDb } from '../src/lib/admin/admin-db'
async function main() {
  const db = getAdminDb()
  const cols = 'id, title, funder, funding_type, apply_url, funding_index_url, pipeline_state, location_tag, amount_min, amount_max, deadline, is_rolling, next_open_date, next_open_date_parsed, eligible_structures, rejection_reason, needs_intervention_reason, grant_sources, funder_brief, field_provenance'
  const { data: a, error: ea } = await db.from('scraped_grants').select(cols).eq('is_active', false).in('pipeline_state', ['tagged', 'tagged_awaiting_review', 'captured']).order('title')
  const { data: b, error: eb } = await db.from('scraped_grants').select(cols).eq('is_active', false).eq('pipeline_state', 'published').order('title')
  if (ea || eb) throw ea ?? eb
  const shape = (r: Record<string, unknown>) => {
    const brief = (r.funder_brief ?? {}) as Record<string, unknown>
    const prov = (r.field_provenance ?? {}) as Record<string, { source?: string; pinned?: boolean }>
    const admin = Object.entries(prov).filter(([, v]) => (v?.source ?? '').startsWith('admin:')).map(([k, v]) => `${k}${v.pinned ? ' (pinned)' : ''}`)
    return { id: r.id, title: r.title, funder: r.funder, funding_type: r.funding_type, apply_url: r.apply_url, funding_index_url: r.funding_index_url,
      pipeline_state: r.pipeline_state, location_tag: r.location_tag, amount_min: r.amount_min, amount_max: r.amount_max, deadline: r.deadline,
      is_rolling: r.is_rolling, next_open_date: r.next_open_date, next_open_date_parsed: r.next_open_date_parsed, eligible_structures: r.eligible_structures,
      needs_intervention_reason: r.needs_intervention_reason ?? null, banked_sources: ((r.grant_sources as { url: string }[] | null) ?? []).map(s => s.url),
      brief_who_can_apply: brief.who_can_apply ?? null, brief_last_enriched: brief.last_enriched ?? null, admin_held_fields: admin }
  }
  const out = { pile_a_review: (a ?? []).map(shape), pile_b_hidden: (b ?? []).map(shape) }
  writeFileSync('docs/handoffs/verdict-rows-2026-09-07.json', JSON.stringify(out, null, 1))
  console.log('A review', out.pile_a_review.length, 'B hidden', out.pile_b_hidden.length)
}
main().catch(e => { console.error(e); process.exit(1) })

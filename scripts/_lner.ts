/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js'
import { readStamp, PAGE_READ_KEY } from '../src/lib/field-evidence'
async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await db.from('scraped_grants').select('*').ilike('title', '%LNER%')
  for (const r of (data ?? []) as any[]) {
    console.log(`── ${r.title}   [${r.id}]`)
    console.log(`   live=${r.is_active}  state=${r.pipeline_state}  source=${r.source}`)
    console.log(`   apply_url  : ${r.apply_url}`)
    console.log(`   index_url  : ${r.funding_index_url ?? '-'}`)
    console.log(`   url_status : ${r.url_status}  checked ${String(r.url_last_checked ?? '-').slice(0,10)}`)
    console.log(`   amount     : ${r.amount_min} - ${r.amount_max}  undisclosed=${r.amount_undisclosed}`)
    console.log(`   deadline   : ${r.deadline}  rolling=${r.is_rolling}  next_open=${r.next_open_date ?? '-'}`)
    console.log(`   funding_type=${r.funding_type}  funder_type=${r.funder_type}  location=${r.location_tag}`)
    console.log(`   sectors    : ${JSON.stringify(r.impact_sectors)}`)
    console.log(`   beneficiaries: ${JSON.stringify(r.target_beneficiaries)}`)
    console.log(`   structures : ${JSON.stringify(r.eligible_structures)}`)
    console.log(`   niche      : ${JSON.stringify(r.niche_tags)}`)
    console.log(`   description: ${String(r.description ?? '(none)').slice(0, 300)}`)
    const b = r.funder_brief ?? null
    console.log(`\n   funder_brief keys (${b ? Object.keys(b).length : 0}): ${b ? Object.keys(b).join(', ') : '(none)'}`)
    if (b) for (const [k, v] of Object.entries(b)) console.log(`      ${k}: ${String(v).slice(0, 220)}`)
    const pr = readStamp(r.field_evidence as never, PAGE_READ_KEY)
    console.log(`\n   last page read: ${pr?.checked_at?.slice(0,10) ?? 'never'}  note=${pr?.note ?? '-'}  src=${pr?.source_url ?? '-'}`)
    const fe = (r.field_evidence ?? {}) as any
    console.log(`   evidence fields: ${Object.keys(fe).filter(k => !k.startsWith('_')).join(', ') || '(none)'}`)
  }
}
main().catch(e => { console.error(e.message); process.exit(1) })

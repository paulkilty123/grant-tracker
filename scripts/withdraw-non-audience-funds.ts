// Withdraw live funds the funder says our audience cannot apply for.
//
// The publish gate blocks these going forward, but the gate only ever sees rows
// in the review queue. Rows already published are outside its reach, so the 8
// found by the same detector need withdrawing explicitly.
//
// Sets is_active=false ONLY. mergeGrantUpdate's transition then moves a
// published row to 'captured' rather than 'archived' — deliberately, because
// that puts it in the review queue carrying its reason, where a human can
// disagree. Archiving would hide the decision as effectively as the row.
//
//   npx tsx scripts/withdraw-non-audience-funds.ts          # dry run
//   npx tsx scripts/withdraw-non-audience-funds.ts --apply
//
// Writes as system:applicant_filter:v1 (trust 50). is_active is untracked, so
// no provenance is stamped — verify via pipeline_state, not field_provenance.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deriveReviewReasons, type ReviewRow } from '../src/lib/admin/review-reasons'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const l of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}
const SOURCE = 'system:applicant_filter:v1'
const COLS = 'id,title,funder,source,is_active,pipeline_state,url_status,url_quality_score,amount_min,amount_max,deadline,is_rolling,next_open_date,deadline_cycle,eligible_structures,impact_sectors,target_beneficiaries,funder_brief,field_provenance,raw_data,needs_intervention_reason'

async function main() {
  const apply = process.argv.includes('--apply')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('scraped_grants').select(COLS).eq('is_active', true).range(from, from + 999)
    if (error) { console.error(error.message); process.exit(1) }
    rows.push(...(data ?? []) as Record<string, unknown>[])
    if ((data ?? []).length < 1000) break
  }

  const hits = rows.filter(r => deriveReviewReasons(r as unknown as ReviewRow)
    .some(x => x.code === 'applicant_not_social_sector'))

  console.log(`\nlive rows scanned: ${rows.length}`)
  console.log(`to withdraw: ${hits.length}\n`)
  for (const h of hits) {
    console.log(`  ${String(h.funder ?? '').slice(0, 30).padEnd(30)} ${String(h.title).slice(0, 52)}`)
    console.log(`    ${String((h.funder_brief as Record<string, unknown>)?.who_can_apply ?? '').slice(0, 100)}`)
  }
  if (!apply) { console.log('\nDRY RUN — nothing written.\n'); return }

  let done = 0, failed = 0
  for (const h of hits) {
    const res = await mergeGrantUpdate({ id: h.id as string, fields: { is_active: false }, source: SOURCE, db })
    if (res.applied.includes('is_active')) done++
    else { failed++; console.warn(`  not applied: ${h.title}`) }
  }
  console.log(`\nwithdrawn ${done}, failed ${failed}\n`)
}
main()

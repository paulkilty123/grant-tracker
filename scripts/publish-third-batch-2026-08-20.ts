// Third batch. Two published, two held, and the queue's free work runs out here.
//
// Four rows now clear the strict bar. Only two of them should go live:
//
//   Passionate About Realising Potential in environmental/green careers  £7,000
//   The Grocers' Charity — Small Grants                                  £5,000
//
// HELD: Ufi VocTech Ignite and Baring's International Development Programme.
// Both are `is_invite_only`, which alone is arguable — carrying an
// invitation-only fund tells a fundraiser it exists. What settles it is that
// NEITHER HAS ANY `eligible_structures`. The matcher treats that field as a hard
// gate, so a row without it cannot match anyone correctly; publishing one puts a
// card in front of people the catalogue cannot reason about. `eligibility_missing`
// is informational in the gate, which is right for not BLOCKING it, and wrong as
// a reason to actively publish.
//
//   npx tsx --env-file=.env.local scripts/publish-third-batch-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { deriveReviewReasons, type ReviewRow } from '../src/lib/admin/review-reasons'
import { gateDecision } from '../src/lib/admin/publish-gate'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:third-publish-2026-08-20'
const PUBLISH = [
  'Passionate About Realising Potential in environmental/green careers',
  "The Grocers' Charity — Small Grants",
]

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await db.from('scraped_grants').select('*').in('title', PUBLISH)
  if (error) { console.error('query failed:', error.message); process.exit(1) }
  const rows = (data ?? []) as unknown as (ReviewRow & { pipeline_state: string; is_active: boolean | null; funder: string | null })[]
  if (rows.length !== PUBLISH.length) {
    console.error(`ABORT: matched ${rows.length} of ${PUBLISH.length}`); process.exit(1)
  }

  for (const r of rows) {
    const gate = gateDecision(r, deriveReviewReasons(r, today))
    if (gate.blocking.length) { console.error(`ABORT: ${r.title} — ${gate.blocking.map(b => b.code).join(', ')}`); process.exit(1) }
    // The gate does not block on this, and it is still a reason not to publish.
    if ((r.eligible_structures ?? []).length === 0) {
      console.error(`ABORT: ${r.title} has no eligible_structures — it cannot match anyone correctly`); process.exit(1)
    }
    console.log(`   ${String(r.title).slice(0, 54).padEnd(56)} ${r.funder ?? '—'}`)
  }
  if (DRY) { console.log('\nDRY RUN.\n'); return }

  let published = 0
  for (const r of rows) {
    const res = await mergeGrantUpdate({
      id: r.id, fields: { pipeline_state: 'published', is_active: true }, source: SOURCE, db,
      citations: { pipeline_state: { snippet: `Third hand-checked publish batch, ${today}.`, confidence: 'high' } },
    })
    if (res.applied.length) published++
  }
  const { data: after } = await db.from('scraped_grants').select('title, is_active').in('title', PUBLISH)
  console.log(`\npublished: ${published}/${rows.length}   not live afterwards: ${(after ?? []).filter(a => !(a as { is_active: boolean }).is_active).length}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

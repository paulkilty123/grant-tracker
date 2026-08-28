/* eslint-disable @typescript-eslint/no-explicit-any */
// AF3: Supporting Partners — publish, now that it is enriched and tagged.
//
// Order matters and was followed: enrich, then tag, then publish. Published
// before tagging, the row would have been live and unmatchable — empty sectors,
// beneficiaries and structures mean the matcher cannot reach it.
//
// The state it goes live in, all from the funder's own page:
//   £10,000 to £150,000, closing 23 Sep 2026 at 12 noon
//   registered charities, CICs, armed forces units, UK universities and colleges
//   16-key funder_brief, open_status "open", real how_to_apply and decision dates
//
// Two enrich attempts were wasted before this one, both reading a partial
// rendering from the reader proxy. The third supplied the page text directly.
// See page-excerpt.ts for what that cost and what it changed.
//
//   npx tsx --env-file=.env.local scripts/af3-publish-2026-08-28.ts --dry
//   npx tsx --env-file=.env.local scripts/af3-publish-2026-08-28.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const ID  = '475e745e-25cb-49c4-b397-fcdfee970df1'
const DRY = process.argv.includes('--dry')

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: before } = await db.from('scraped_grants')
    .select('title, is_active, pipeline_state, deadline, amount_min, amount_max, impact_sectors, eligible_structures')
    .eq('id', ID).maybeSingle()
  const b = before as any
  console.log(`── ${b.title}`)
  console.log(`   before: live=${b.is_active} state=${b.pipeline_state} ${b.amount_min}–${b.amount_max} dl=${b.deadline}`)

  // Refuse to publish an untagged row. This is the enrich-before-tag-before-publish
  // rule as a guard rather than a note: it can fail, and it should.
  if (!b.impact_sectors?.length || !b.eligible_structures?.length) {
    console.error('   REFUSED: row is not tagged (impact_sectors or eligible_structures empty)')
    process.exit(1)
  }
  if (b.is_active && b.pipeline_state === 'published') { console.log('   already live'); return }
  if (DRY) { console.log('   DRY — would set is_active true, pipeline_state published'); return }

  // pipeline_state passed EXPLICITLY so transitionPipelineState is skipped: an
  // is_active flip on an archived row would otherwise be routed by the state
  // machine rather than by the decision being made here.
  const r = await mergeGrantUpdate({
    id: ID,
    fields: { is_active: true, pipeline_state: 'published' },
    source: 'admin:af3-publish-2026-08-28',
    pinned: false,
    db,
  })
  console.log(`   applied: ${JSON.stringify(r.applied)}`)
  const { data: after } = await db.from('scraped_grants')
    .select('is_active, pipeline_state').eq('id', ID).maybeSingle()
  const a = after as any
  console.log(`   after : live=${a.is_active} state=${a.pipeline_state}`)
}
main().catch(e => { console.error(e.message); process.exit(1) })

/* eslint-disable @typescript-eslint/no-explicit-any */
// AF3: Supporting Partners programme — the amount its page states.
//
// The row is archived and empty: no sectors, no beneficiaries, no structures, no
// funder_brief, no stored evidence, description still the crawler's stub, and no
// amount. Its deadline (23 Sep 2026) is right and the fund is open:
//   "Closing date: 23 Sep 2026" / "applications due by 12:00 pm 23 September 2026"
//
// Only the amount is written here. Structures, geography and tags are left alone
// deliberately: user_verified (70) outranks ai_enrich (60), so hand-filling them
// now would lock the enrichment pass out of fields it should be deciding. The
// page lists "armed forces units or bases" and "UK universities or colleges"
// alongside charities and CICs, and two of those four have no home in our
// structure taxonomy — not a judgement to freeze from a summary.
//
//   npx tsx --env-file=.env.local scripts/af3-amounts-2026-08-28.ts --dry
//   npx tsx --env-file=.env.local scripts/af3-amounts-2026-08-28.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const ID     = '475e745e-25cb-49c4-b397-fcdfee970df1'
const SOURCE = 'user_verified:af3-amounts-2026-08-28'
const DRY    = process.argv.includes('--dry')

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: before } = await db.from('scraped_grants')
    .select('title, amount_min, amount_max, deadline, is_active, pipeline_state').eq('id', ID).maybeSingle()
  if (!before) { console.error('row not found'); process.exit(1) }
  const b = before as any
  console.log(`── ${b.title}`)
  console.log(`   before: ${b.amount_min} – ${b.amount_max}   deadline=${b.deadline}  live=${b.is_active}  state=${b.pipeline_state}`)
  if (b.amount_min === 10000 && b.amount_max === 150000) { console.log('   already set'); return }
  if (DRY) { console.log('   DRY — would write 10000 – 150000'); return }

  const citation = {
    snippet: 'AF3: Supporting Partners programme. Grants of £10,000 to £150,000. Closing date: 23 Sep 2026, applications due by 12:00 pm 23 September 2026.',
    confidence: 'high' as const,
    reason: 'Read from https://www.covenantfund.org.uk/programme/af3-supporting-partners-programme/ on 2026-08-28. The repaired crawler independently extracts the same 10,000-150,000 from that page.',
  }
  const r = await mergeGrantUpdate({
    id: ID,
    fields: { amount_min: 10000, amount_max: 150000 },
    source: SOURCE,
    pinned: false,
    db,
    citations: { amount_min: citation, amount_max: citation },
  })
  console.log(`   applied : ${JSON.stringify(r.applied)}`)
  if (r.rejected.length) console.log(`   rejected: ${JSON.stringify(r.rejected)}`)

  const { data: after } = await db.from('scraped_grants')
    .select('amount_min, amount_max, is_active, pipeline_state').eq('id', ID).maybeSingle()
  const a = after as any
  console.log(`   after : ${a.amount_min} – ${a.amount_max}  live=${a.is_active}  state=${a.pipeline_state}`)
}
main().catch(e => { console.error(e.message); process.exit(1) })

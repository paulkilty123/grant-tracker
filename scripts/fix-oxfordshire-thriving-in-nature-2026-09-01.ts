// Oxfordshire Community Foundation — Thriving in Nature Fund: amount_max 500000 -> 50000.
//
// The row stored £500,000 as the award ceiling. The funder's page says
// "Amounts available: Up to £50,000" and "Group annual income: Under £500,000":
// the INCOME CAP was copied into the award slot. The wrong value was set through
// the admin UI on 2026-07-29 (admin:paulkilty1@gmail.com, pinned), overwriting
// the extractor's correct 50000, so only an admin: source can move it.
//
// Ruled by Paul 2026-09-01: "Correct it with the quote." That is a human
// decision, so the write is admin: and pinned, and the quote goes in two places:
// the provenance citation (what a reviewer checks) and field_evidence.amount_max
// (what the amount checks read, so the row cannot re-flag as unsupported).
//
// The page was fetched directly, no model call. Nothing here spends anything.
//
// DRY BY DEFAULT.  npx tsx scripts/fix-oxfordshire-thriving-in-nature-2026-09-01.ts [--live]

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { figureAppearsInEvidence } from '../src/lib/admin/review-reasons'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const LIVE = process.argv.includes('--live')
const ID = 'a21a8706-4a7a-4ea9-a4bb-6610c2fe8a88'
const SOURCE = 'admin:paulkilty1@gmail.com'
const PAGE = 'https://oxfordshire.org/ocf_grants/thriving-in-nature-fund-2/'
const QUOTE = 'Amounts available: Up to £50,000. Group annual income: Under £500,000. '
  + 'Large grants between £10,001 and £50,000 to be paid over two years. '
  + 'Small grants of up to £10,000 to be paid over one year.'
const WAS = 500000
const NOW = 50000

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: row, error } = await db.from('scraped_grants')
    .select('id, title, funder, amount_min, amount_max, is_active, pipeline_state, field_provenance, field_evidence')
    .eq('id', ID).single()
  if (error || !row) { console.error('row not found', error?.message); process.exit(1) }

  console.log(LIVE ? '── LIVE ──' : '── DRY RUN — nothing will be written ──')
  console.log(`${row.funder} — ${row.title}  (${row.pipeline_state}, is_active=${row.is_active})`)
  console.log(`amount_max ${row.amount_max} -> ${NOW}   held by ${JSON.stringify((row.field_provenance as any)?.amount_max)}`)

  // Preconditions, asserted so a re-run or a drifted row fails loudly.
  if (row.amount_max !== WAS) { console.error(`precondition failed: amount_max is ${row.amount_max}, expected ${WAS}`); process.exit(2) }
  const stamp = {
    by: 'admin:ruling-2026-09-01', quote: QUOTE, agrees: true,
    checked_at: new Date().toISOString(), source_url: PAGE,
  }
  if (!figureAppearsInEvidence(NOW, { amount_max: stamp })) { console.error('the quote does not carry the figure'); process.exit(2) }
  if (figureAppearsInEvidence(NOW, row.field_evidence)) console.log('note: the stored evidence already carries £50,000')

  if (!LIVE) { console.log('\nRe-run with --live to write.'); return }

  const res = await mergeGrantUpdate({
    db, id: ID, fields: { amount_max: NOW }, source: SOURCE as never, pinned: true,
    citations: { amount_max: { snippet: QUOTE.slice(0, 300), confidence: 'high' } },
  })
  if (res.rejected.length) { console.error('REFUSED', JSON.stringify(res.rejected)); process.exit(3) }
  console.log('written:', res.applied.join(', '))

  const evidence = { ...((row.field_evidence as Record<string, unknown>) ?? {}), amount_max: stamp }
  const { error: evErr } = await db.from('scraped_grants').update({ field_evidence: evidence }).eq('id', ID)
  if (evErr) { console.error('evidence write failed', evErr.message); process.exit(3) }

  const { data: after } = await db.from('scraped_grants')
    .select('amount_max, field_provenance, field_evidence').eq('id', ID).single()
  console.log(`after: amount_max=${after?.amount_max}  prov=${JSON.stringify((after?.field_provenance as any)?.amount_max)}`)
  console.log(`evidence carries the figure: ${figureAppearsInEvidence(NOW, after?.field_evidence)}`)
}
main()

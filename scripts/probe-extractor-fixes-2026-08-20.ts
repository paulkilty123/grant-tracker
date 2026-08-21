// Do the two prompt fixes actually change what the model returns?
//
// Both were found by their consequences, so both are tested on the rows that
// produced them rather than on fixtures:
//
//   YEAR — Wiltshire & Swindon's Older People's Programme. Its page reads "will
//   close on Monday 21 September at 12 noon" with no year, and the extractor
//   returned 2025-09-21: a past date on an open fund. Expect 2026-09-21 now that
//   the prompt states today's date.
//
//   not_registered — three rows the widening pass rejected because the extractor
//   proposed `not_registered` and no quote named it. Expect it to stop appearing.
//
// READ ONLY. verifyRow writes nothing.
//
//   npx tsx --env-file=.env.local scripts/probe-extractor-fixes-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { verifyRow, type VerifyRow } from '../src/lib/verification/verify-row'

const COLS = 'id, title, funder, funding_type, apply_url, deadline, deadline_cycle, is_rolling, '
  + 'amount_min, amount_max, max_org_income, min_org_income, is_invite_only, eligible_structures, '
  + 'location_tag, funder_brief'

const CASES = [
  { id: '5ed9736a-814f-42b2-89cc-156e880b1740', what: 'year', note: 'page says "Monday 21 September", no year; was 2025-09-21' },
  { id: '3410838c-128e-4870-ace5-c082f194cdcb', what: 'not_registered', note: 'Haggerston Estate Micro Grants' },
  { id: '166aa0c7-b17a-4f45-897d-ef7b9e768a48', what: 'not_registered', note: 'Wickes Community Programme' },
  { id: '8d98b098-984e-4ee1-a340-facede127492', what: 'not_registered', note: "Drapers' Charitable Fund" },
]

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  for (const c of CASES) {
    const { data } = await db.from('scraped_grants').select(COLS).eq('id', c.id).limit(1)
    const row = data?.[0] as unknown as VerifyRow
    if (!row) { console.log(`\n✗ NOT FOUND ${c.note}`); continue }
    const res = await verifyRow(row, anthropic)
    const dl = res.evidence.find(e => e.field === 'deadline')
    const es = res.evidence.find(e => e.field === 'eligible_structures')
    console.log(`\n── ${row.title.slice(0, 50)}  [${c.what}]`)
    console.log(`   ${c.note}`)
    console.log(`   outcome: ${res.outcome}`)
    // "proposed: none" is consistent BOTH with the fix working and with the
    // model extracting nothing at all. So print `agrees` and the row's own value
    // beside it: agrees=true means the page CONFIRMED what we hold, which for
    // the year case is the whole point.
    if (c.what === 'year') {
      console.log(`   we hold:  ${row.deadline ?? 'no deadline'}`)
      console.log(`   agrees:   ${JSON.stringify(dl?.agrees)}   proposed: ${JSON.stringify(dl?.proposed) ?? 'none'}`)
      console.log(`   verdict:  ${dl?.agrees === true ? 'page CONFIRMS the 2026 date — the year fix holds'
        : dl?.proposed === '2026-09-21' ? 'proposes 2026-09-21 — fix holds'
        : String(dl?.proposed ?? '').startsWith('2025') ? 'STILL 2025 — fix did not take'
        : 'no verdict; inspect'}`)
      console.log(`   quote: "${String(dl?.quote ?? '').slice(0, 90)}"`)
    } else {
      const proposed = es?.proposed as string[] | undefined
      console.log(`   we hold:  ${(row.eligible_structures ?? []).join(', ') || 'none'}`)
      console.log(`   agrees:   ${JSON.stringify(es?.agrees)}   proposed: ${proposed ? proposed.join(', ') : 'none'}`)
      console.log(`   verdict:  ${proposed?.includes('not_registered') ? 'STILL proposes not_registered'
        : es?.agrees === true ? 'page confirms what we hold, no not_registered'
        : proposed ? 'proposes a set without not_registered' : 'nothing extracted; inconclusive'}`)
      console.log(`   quote: "${String(es?.quote ?? '').slice(0, 90)}"`)
    }
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

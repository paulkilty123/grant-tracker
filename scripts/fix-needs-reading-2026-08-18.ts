// Corrections from reading the funder's own page, for rows in the
// Needs-reading / Nothing-truthful lot. Approved by Paul, 2026-08-18.
//
//   npx tsx --env-file=/Users/paulkilty/dev/grant-tracker/.env.local \
//     scripts/fix-needs-reading-2026-08-18.ts [--dry]
//
// NOTHING HERE ACTIVATES A ROW. Every row stays is_active = false and stays in
// the review queue for Paul to publish. Field corrections only.
//
// Pages read through scripts/read-page-2026-08-18.ts, which falls back to the
// reader proxy — both funders below 403 a direct fetch, which is why the
// catalogue had them wrong in the first place.
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const SOURCE = 'user_verified:needs-reading-2026-08-18'
const DRY = process.argv.includes('--dry')

type Change = {
  id: string
  title: string
  snippet: string
  fields: Record<string, unknown>
  note?: string
}

const CHANGES: Change[] = [
  // ────────────────────────────────────────────────────────────────────────
  // LNER — a real, OPEN fund that was sitting in "Nothing truthful to show".
  //
  // It was captured from a news-style headline with funder = null, which put
  // `no_funder` on it and filed it as untruthful. The apply_url was always the
  // funder's own fund page; only a direct fetch fails (403), so nothing had
  // read it. The page carries an open 2026 window closing 31 August — thirteen
  // days out at the time of writing — an application form and a guidance PDF.
  //
  // Deliberately NOT activated. It needs Paul's publish like any other row.
  {
    id: 'a14b6359-b0c8-45f6-a41d-8f4a0160017c',
    title: 'LNER Customer & Community Investment Fund — real fund, open, was filed as untruthful',
    snippet: '2026 application window now open. Closes at 23:59 on 31 August 2026',
    fields: {
      title: 'LNER Customer & Community Investment Fund',
      funder: 'London North Eastern Railway (LNER)',
      deadline: '2026-08-31',
      is_rolling: false,
    },
    note: 'Title was the news headline verbatim ("... grants now open"); funder was null.',
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  for (const c of CHANGES) {
    console.log(`\n── ${c.title}`)
    if (c.note) console.log(`   ${c.note}`)
    if (DRY) { console.log(`   ${JSON.stringify(c.fields)} (dry)`); continue }
    const citations = Object.fromEntries(
      Object.keys(c.fields).map(k => [k, { snippet: c.snippet, confidence: 'high' as const }]),
    )
    const r = await mergeGrantUpdate({ id: c.id, fields: c.fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(r.applied)}`)
    if (r.rejected?.length) console.log(`   REJECTED: ${JSON.stringify(r.rejected)}`)
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

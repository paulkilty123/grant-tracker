// Last two Needs-reading rows with unambiguous evidence. Paul, 2026-08-18.
//
//   npx tsx --env-file=/Users/paulkilty/dev/grant-tracker/.env.local \
//     scripts/queue-batch4-2026-08-18.ts [--dry]
//
// Nothing here activates a row.
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const SOURCE = 'user_verified:needs-reading-2026-08-18'
const DRY = process.argv.includes('--dry')

const CHANGES = [
  {
    id: '6ce1fac3-9818-4f0c-bfde-7186f74320ae',
    title: 'Ufi VocTech Trust — VocTech Ignite is invitation only',
    quote: 'VocTech Ignite helps projects whose ideas have real potential to create a difference, but are not yet ready for full funding. By invitation only.',
    fields: { is_invite_only: true },
    note: 'Nobody can apply to this, so it must not publish as an open opportunity. Ledger item A9 — invite-only language with no flag set.',
  },
  {
    id: '13837671-a3eb-4045-a5e7-2a7bf2951f4d',
    title: 'Arts Council of Wales — International Opportunities Fund is rolling',
    quote: "We're able to accept application at any time while our fund is open for the applications that involve the following activity: International collaboration and partnership development, International networks and events, International presentation of work.",
    fields: { is_rolling: true },
    note: 'Evidenced by "at any time", not inferred from an absent deadline. Third row tonight where the page states rolling outright, against a catalogue where 380 rows assert it from silence.',
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  for (const c of CHANGES) {
    console.log(`\n── ${c.title}`)
    console.log(`   ${c.note}`)
    if (DRY) { console.log(`   ${JSON.stringify(c.fields)} (dry)`); continue }
    const citations = Object.fromEntries(
      Object.keys(c.fields).map(k => [k, { snippet: c.quote.slice(0, 300), confidence: 'high' as const }]),
    )
    const r = await mergeGrantUpdate({ id: c.id, fields: c.fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(r.applied)}`)
    if (r.rejected?.length) console.log(`   REJECTED: ${JSON.stringify(r.rejected)}`)
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

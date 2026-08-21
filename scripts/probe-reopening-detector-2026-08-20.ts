// Does the reopening detector fire on real rows, and is zero the right answer?
//
// A detector that returns 0 looks identical whether the backlog is empty or the
// wiring is broken. So this asks TWO questions of live data:
//
//   1. What does it find in `between_rounds_scheduled` today? Expected 0 — the
//      backlog was cleared by hand on 20 August.
//   2. Would it have found the row that prompted it? The Older People's
//      Programme still carries the evidence stamp it had while hidden, so
//      replaying the detector against that stamp proves the rule fires on real
//      data rather than only on fixtures.
//
// READ ONLY.
//
//   npx tsx --env-file=.env.local scripts/probe-reopening-detector-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'
import { detectReopening } from '../src/lib/verification/reopening'

const OLDER_PEOPLES = '5ed9736a-814f-42b2-89cc-156e880b1740'

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const today = new Date().toISOString().slice(0, 10)

  const { data: hidden } = await db.from('scraped_grants')
    .select('id, title, funder, deadline, field_evidence')
    .eq('pipeline_state', 'between_rounds_scheduled').limit(1000)
  const rows = (hidden ?? []) as { id: string; title: string; deadline: string | null; field_evidence: Record<string, unknown> | null }[]

  const hits = rows.map(r => ({ r, hit: detectReopening(r, today) })).filter(x => x.hit)
  console.log(`\nhidden rows examined : ${rows.length}`)
  console.log(`would move to review : ${hits.length}`)
  for (const { r, hit } of hits) console.log(`   ${r.title.slice(0, 46).padEnd(48)} ${hit!.reason}`)

  // ── Does the rule fire on real evidence at all? ──
  const { data: proof } = await db.from('scraped_grants')
    .select('id, title, deadline, field_evidence').eq('id', OLDER_PEOPLES).limit(1)
  const p = proof?.[0] as { title: string; deadline: string | null; field_evidence: Record<string, unknown> | null } | undefined
  if (!p) { console.log('\nproof row not found'); return }

  const asIfHidden = { id: OLDER_PEOPLES, title: p.title, deadline: null, field_evidence: p.field_evidence }
  const wouldHave = detectReopening(asIfHidden, today)
  console.log(`\n── replay: ${p.title}`)
  console.log(`   its stored evidence, with the deadline removed as it was while hidden:`)
  console.log(`   ${wouldHave ? 'FIRES — ' + wouldHave.reason : 'does not fire'}`)
  console.log(wouldHave
    ? '\n   So zero above is an empty backlog, not broken wiring.\n'
    : '\n   The rule did NOT fire on the row that prompted it. Investigate before trusting zero.\n')
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

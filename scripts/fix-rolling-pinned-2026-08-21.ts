// The 25 rows the trust ladder refused on the first rolling pass.
//
// All 25 carry a PINNED `is_rolling` set by an admin form save, and a pin can
// only be overridden by another `admin:` source (grant-merge case 3). That is the
// guard working as designed: it is what stops an automated pass from quietly
// undoing a decision a human made.
//
// TWO OF THEM ARE IN THE SIX PAUL RULED ON TODAY, so for those the override is
// exactly what admin trust is for — a later human decision beating an earlier
// one. Corra was pinned 2026-07-09; the Strategic Legal Fund was pinned
// 2026-07-29 over a stored `false`, which is worth noticing: an admin form save
// pins every field on the form, looked at or not, and that artefact population is
// already in the notes.
//
// THE OTHER 23 ARE NOT TOUCHED. They are Paul's own pins, he approved a class
// rather than these rows, and releasing someone's deliberate value on a class
// approval is the mistake this file exists to avoid. They are listed instead.
//
//   npx tsx --env-file=.env.local scripts/fix-rolling-pinned-2026-08-21.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-rolling-pinned-2026-08-21.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { readStamp } from '../src/lib/field-evidence'

const DRY = process.argv.includes('--dry')

const THE_TWO = [
  'Corra Foundation — Alcohol and Drugs Fund',
  'Strategic Legal Fund for Vulnerable Young Mi',
]

async function fetchAll(db: any) {
  const out: any[] = []
  for (let from = 0; ; from += 900) {
    const { data, error } = await db.from('scraped_grants').select('*').range(from, from + 899)
    if (error) throw new Error(error.message)
    out.push(...(data ?? [])); if (!data || data.length < 900) break
  }
  return out
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const rolling = (await fetchAll(db)).filter(r => r.is_active === true && r.is_rolling === true)

  console.log('── the two of the six, pinned by an earlier admin save')
  const two: any[] = []
  for (const p of THE_TWO) {
    const hits = rolling.filter(r => String(r.title).startsWith(p))
    if (hits.length !== 1) { console.log(`   ABORT: "${p}" matched ${hits.length}`); process.exit(1) }
    two.push(hits[0])
    const prov = (hits[0].field_provenance ?? {})['is_rolling']
    console.log(`   ${String(hits[0].title).slice(0, 48)}`)
    console.log(`      pinned ${prov?.set_at?.slice(0, 10)} by ${prov?.source}${prov?.previous ? `, over a stored ${JSON.stringify(prov.previous.value)}` : ''}`)
  }

  console.log('\n── the other pinned rows still saying "apply any time" (NOT touched)')
  const twoIds = new Set(two.map(r => r.id))
  const otherPinned = rolling.filter(r => {
    if (twoIds.has(r.id)) return false
    const prov = (r.field_provenance ?? {})['is_rolling']
    const ev   = readStamp(r.field_evidence as never, 'is_rolling')
    return prov?.pinned === true && (!ev || ev.agrees == null)   // pinned AND unevidenced
  })
  for (const r of otherPinned) {
    const prov = (r.field_provenance ?? {})['is_rolling']
    console.log(`   ${String(r.title).slice(0, 50).padEnd(52)} pinned ${prov?.set_at?.slice(0, 10)}`)
  }
  console.log(`   total: ${otherPinned.length} — Paul's call, one at a time or as a batch`)

  if (DRY) { console.log('\nDRY RUN — nothing written.\n'); return }

  let ok = 0
  for (const r of two) {
    const s = readStamp(r.field_evidence as never, 'is_rolling')
    const res = await mergeGrantUpdate({
      id: r.id, fields: { is_rolling: false }, db,
      source: 'admin:rolling-ruling-2026-08-21',
      citations: { is_rolling: { snippet: `Paul ruled on this row 2026-08-21, overriding an earlier pin. The funder's page: "${String(s?.quote ?? '').slice(0, 200)}" — dated rounds, not rolling.`, confidence: 'high' } },
    })
    if (res.applied.includes('is_rolling')) ok++
    else console.log(`   STILL REFUSED: ${r.title} ${JSON.stringify(res.rejected)}`)
  }
  console.log(`\nwritten: ${ok}/2`)

  const fresh = (await fetchAll(db)).filter(r => r.is_active === true)
  console.log(`verified: live rows still marked rolling: ${fresh.filter(r => r.is_rolling === true).length}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

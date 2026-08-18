// Release the frozen-and-empty deadlines that a form save created.
//
// 48 live rows hold a `deadline` that is BOTH empty and frozen — pinned, or
// stamped by a real `admin:<email>` source at trust 100 — so nothing automated
// can ever put a date on them. 32 of those rows are telling users the fund is
// "Rolling", and that claim is true only because the box is empty.
//
// 41 of the 48 were stamped in the same second as at least one other field, which
// is the signature of Grant Manager sending its whole form state on save rather
// than of anybody deciding anything. Those release here.
//
// The other 7 were stamped ALONE, which is what a decision looks like. Three are
// in-kind membership schemes where an empty deadline is the expected answer. They
// are deliberately NOT in this batch: the justification for releasing without
// judgement is that no judgement is recorded, and for those seven one might be.
//
// WHAT "RELEASE" MEANS: delete the `deadline` key from `field_provenance` and
// leave the null value alone. The field then has no provenance, so the next
// enrichment or verification pass may write the date it reads. This is the same
// operation performed by hand on the 12 Scotland-batch rows on 2026-07-09.
//
// Not routed through mergeGrantUpdate on purpose — that writes provenance, it
// cannot remove it, and removal is the whole point.
//
//   npx tsx --env-file=.env.local scripts/release-frozen-deadlines-2026-08-18.ts --dry
//   npx tsx --env-file=.env.local scripts/release-frozen-deadlines-2026-08-18.ts
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'

const DRY = process.argv.includes('--dry')
const REPORT = 'reports/deadline-releases-2026-08-18.json'

type Row = {
  id: string
  title: string
  is_rolling: boolean | null
  field_provenance: Record<string, { source?: string; set_at?: string; pinned?: boolean; backfilled?: boolean }> | null
}

const isBlocking = (e: { source?: string; pinned?: boolean; backfilled?: boolean } | undefined) => {
  if (!e) return false
  if (e.pinned) return true
  const admin = (e.source ?? '').toLowerCase().startsWith('admin:')
  const backfilledLegacy = e.backfilled === true && e.source === 'admin:legacy'
  return admin && !backfilledLegacy
}

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data, error } = await db
    .from('scraped_grants')
    .select('id, title, is_rolling, field_provenance')
    .eq('is_active', true)
    .is('deadline', null)
    .limit(2000)
  if (error) throw new Error(error.message)

  const release: { id: string; title: string; is_rolling: boolean | null; removed: unknown; siblings: number }[] = []
  const held: { id: string; title: string; reason: string }[] = []

  for (const r of (data ?? []) as Row[]) {
    const prov = r.field_provenance ?? {}
    const entry = prov['deadline']
    if (!isBlocking(entry)) continue

    const sec = String(entry?.set_at ?? '').slice(0, 19)
    const siblings = Object.entries(prov)
      .filter(([k, v]) => k !== 'deadline' && String(v?.set_at ?? '').slice(0, 19) === sec).length

    if (siblings === 0) {
      held.push({ id: r.id, title: r.title, reason: 'stamped alone — a decision signature, not a form save' })
      continue
    }
    release.push({ id: r.id, title: r.title, is_rolling: r.is_rolling, removed: entry, siblings })
  }

  // The report is the ONLY copy of what is about to be deleted. Written before
  // anything is touched, and written even on a dry run so the batch can be
  // reviewed before it is applied.
  mkdirSync('reports', { recursive: true })
  writeFileSync(REPORT, JSON.stringify({
    at: new Date().toISOString(),
    note: 'field_provenance.deadline entries removed so the engine can write a date. Value left as NULL. Restore by writing these entries back.',
    released: release,
    held,
  }, null, 2))

  console.log(`releasing ${release.length}   holding ${held.length}   report → ${REPORT}`)
  for (const h of held) console.log(`  HELD  ${h.title.slice(0, 52)}`)

  if (DRY) { console.log('\n(dry run — nothing written)'); return }

  let done = 0
  let failed = 0
  for (const r of release) {
    const { data: cur } = await db.from('scraped_grants').select('field_provenance').eq('id', r.id).single()
    const prov = { ...((cur?.field_provenance ?? {}) as Record<string, unknown>) }
    delete prov.deadline
    const { error: upErr } = await db.from('scraped_grants').update({ field_provenance: prov }).eq('id', r.id)
    if (upErr) { failed++; console.log(`  FAILED ${r.title.slice(0, 40)}: ${upErr.message}`) } else done++
  }
  console.log(`\nreleased ${done}   failed ${failed}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

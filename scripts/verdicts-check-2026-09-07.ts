// The verdicts job's own check: prove that nothing changed state.
//
// The brief's closing check is "the count of rows whose state changed during
// the job, which must be zero". A count of zero is indistinguishable from a
// check that never looked — the lesson from CLAUDE.md's "an alarm is not proved
// until it has fired" — so this compares against a baseline taken before any
// write and names every row that moved.
//
//   --snapshot   write the baseline (once, before batch 1)
//   (no flag)    compare live state against the baseline and tally the verdicts
//
//   npx tsx --env-file=.env.local scripts/verdicts-check-2026-09-07.ts [--snapshot]

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { getAdminDb } from '../src/lib/admin/admin-db'
import { RESULTS, type Verdict } from './verdicts-lib-2026-09-07'

const SNAPSHOT = process.argv.includes('--snapshot')

// State changes this job did not make and has acknowledged. The alarm exists to
// catch THIS job moving a row; another session acting on a verdict is a correct
// outcome, and silencing it wholesale would retire the alarm. So each one is
// named here with who did it and why, and anything not on the list still fails.
const ACKNOWLEDGED: Record<string, string> = {
  '29d000d3-e3fa-439e-89f8-e03109af0f44': 'Foundation East: rejected by grant-tracker-be on 7 Sept after batch 2 reported the domain takeover',
  'e31c28ad-10a0-4d7c-9076-33c8f8cf91e9': 'FSI: rejected by grant-tracker-be on 7 Sept after batch 2 reported the dead host',
}
const LIST = join(__dirname, '..', 'docs', 'handoffs', 'verdict-rows-2026-09-07.json')
const BASELINE = join(__dirname, '..', 'docs', 'handoffs', 'verdict-state-baseline-2026-09-07.json')

type State = { title: string; is_active: boolean; pipeline_state: string; rejection_reason: string | null }

async function readState(ids: string[]) {
  const db = getAdminDb()
  const out: Record<string, State> = {}
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db.from('scraped_grants')
      .select('id, title, is_active, pipeline_state, rejection_reason').in('id', ids.slice(i, i + 100))
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as (State & { id: string })[]) {
      out[r.id] = { title: r.title, is_active: r.is_active, pipeline_state: r.pipeline_state, rejection_reason: r.rejection_reason }
    }
  }
  return out
}

async function main() {
  const piles = JSON.parse(readFileSync(LIST, 'utf8')) as { pile_a_review: { id: string }[]; pile_b_hidden: { id: string }[] }
  const ids = [...piles.pile_a_review.map(r => r.id), ...piles.pile_b_hidden.map(r => r.id)]

  if (SNAPSHOT) {
    if (existsSync(BASELINE)) throw new Error(`${BASELINE} already exists — refusing to overwrite the baseline mid-job`)
    const now = await readState(ids)
    writeFileSync(BASELINE, JSON.stringify(now, null, 1) + '\n')
    console.log(`baseline written for ${Object.keys(now).length} rows -> ${BASELINE}`)
    return
  }

  if (!existsSync(BASELINE)) throw new Error('no baseline: run with --snapshot before the first batch')
  const before = JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<string, State>
  const after = await readState(ids)

  const moved: string[] = []
  const acknowledged: string[] = []
  const gone: string[] = []
  for (const id of ids) {
    const b = before[id], a = after[id]
    if (!b) { moved.push(`${id}: not in the baseline`); continue }
    if (!a) { gone.push(`${b.title} (${id})`); continue }
    if (b.is_active !== a.is_active || b.pipeline_state !== a.pipeline_state || b.rejection_reason !== a.rejection_reason) {
      const line = `${a.title} (${id}): is_active ${b.is_active}->${a.is_active}, state ${b.pipeline_state}->${a.pipeline_state}`
      if (ACKNOWLEDGED[id]) acknowledged.push(`${line}  [${ACKNOWLEDGED[id]}]`)
      else moved.push(`${line}, reject ${JSON.stringify(b.rejection_reason)}->${JSON.stringify(a.rejection_reason)}`)
    }
  }

  console.log(`rows in the job          ${ids.length}`)
  console.log(`state moved              ${moved.length}   <- must be zero, and this check can fail`)
  for (const m of moved) console.log(`   ${m}`)
  console.log(`moved by someone else    ${acknowledged.length}   <- named, not silenced`)
  for (const m of acknowledged) console.log(`   ${m}`)
  console.log(`no longer readable       ${gone.length}`)
  for (const g of gone) console.log(`   ${g}`)

  if (!existsSync(RESULTS)) { console.log('\nno results file yet'); return }
  const file = JSON.parse(readFileSync(RESULTS, 'utf8')) as { batches: { pile: string; verdicts: Verdict[] }[] }
  const all = file.batches.flatMap(b => b.verdicts)
  const tally: Record<string, Record<string, number>> = { A: {}, B: {} }
  for (const v of all) tally[v.pile][v.verdict] = (tally[v.pile][v.verdict] ?? 0) + 1
  const seen = new Set(all.map(v => v.id))

  console.log(`\nverdicts written         ${all.length} of ${ids.length}`)
  for (const pile of ['A', 'B'] as const) {
    const n = Object.values(tally[pile]).reduce((a, b) => a + b, 0)
    const size = pile === 'A' ? piles.pile_a_review.length : piles.pile_b_hidden.length
    console.log(`  pile ${pile}: ${n} of ${size}  ${JSON.stringify(tally[pile])}`)
  }
  const dupes = all.length - seen.size
  console.log(`duplicate verdicts       ${dupes}   <- must be zero`)
  const tidied = all.filter(v => v.tidied.length).length
  console.log(`rows tidied              ${tidied}`)

  if (moved.length) throw new Error('state moved during a job that must not move state')
  if (dupes) throw new Error('the same row has more than one verdict')
}
main().catch(e => { console.error(e); process.exit(1) })

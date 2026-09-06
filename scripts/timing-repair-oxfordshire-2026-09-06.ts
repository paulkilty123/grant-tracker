// Repair, 2026-09-06. Oxfordshire Community Capacity Fund carried a
// next_open_date_parsed of 2026-09-01 that nothing on the row supported.
//
// How it got there. The batch script passed next_open_date and its derived
// next_open_date_parsed to mergeGrantUpdate in one call. next_open_date is a
// tracked field and next_open_date_parsed is not. Paul pinned the prose to
// "TBC — between rounds" on 2026-07-29, so the merger refused the new sentence
// ("Coming autumn 2026") — and wrote the parsed date derived from the refused
// sentence anyway, because untracked fields pass straight through. The row
// ended up with a reopening date derived from a sentence it does not hold, and
// the only reason anybody noticed is that the refusal was printed.
//
// "TBC — between rounds" parses to null, so null is what the pinned prose
// supports and null is what goes back. The runner now merges the prose first
// and stamps the parsed date only when the prose was applied.
//
//   npx tsx --env-file=.env.local scripts/timing-repair-oxfordshire-2026-09-06.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { parseOpenDate } from '../src/lib/parse-open-date'

const APPLY = process.argv.includes('--apply')
const ID = '056ad3b9-2bb0-4d09-be11-672e6c6c23e5'

async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants')
    .select('id, title, next_open_date, next_open_date_parsed').eq('id', ID).single()
  if (!data) throw new Error('no row')
  if (!/Community Capacity Fund/.test(data.title)) throw new Error(`wrong row: ${data.title}`)

  const supported = parseOpenDate(data.next_open_date as string | null)
  console.log(`${data.title}`)
  console.log(`  next_open_date        "${data.next_open_date}"  (pinned by Paul)`)
  console.log(`  next_open_date_parsed ${data.next_open_date_parsed}`)
  console.log(`  what the pinned prose actually parses to: ${supported}`)
  if (data.next_open_date_parsed === supported) { console.log('  already consistent, nothing to do'); return }

  console.log(`  ${APPLY ? 'setting' : 'would set'} next_open_date_parsed = ${supported}`)
  if (!APPLY) return
  const { error } = await db.from('scraped_grants').update({ next_open_date_parsed: supported }).eq('id', ID)
  if (error) throw new Error(error.message)
  console.log('  done')
}
main().catch(e => { console.error(e); process.exit(1) })

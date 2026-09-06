// Backfill of pins_outlived for the refusals in batches 2 to 5, which happened
// before the key existed. Three of the six refusals have since been resolved by
// Paul (Corra's rolling ruling, and the Fine & Country and Fishmongers reopening
// dates) and are deliberately not listed: this is a list of decisions still
// waiting on him, not a history of every refusal.
//
// Each entry pairs what the row holds with what the page says today. Neither
// half is the decision on its own — a pin is only worth revisiting when the
// page has actually moved.
//
//   npx tsx --env-file=.env.local scripts/timing-pins-backfill-2026-09-06.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { recordPins, type PinOutlived } from './timing-lib-2026-09-06'

const APPLY = process.argv.includes('--apply')

const PINS: (Omit<PinOutlived, 'row_holds' | 'title'> & { re: RegExp })[] = [
  { id: '056ad3b9-2bb0-4d09-be11-672e6c6c23e5', re: /Community Capacity Fund/,
    field: 'next_open_date', reason: 'pinned',
    held_by: 'admin:paulkilty1@gmail.com', held_since: '2026-07-29T22:50:33.046Z',
    page_says: 'Closing date: Coming autumn 2026',
    url: 'https://oxfordshire.org/ocf_grants/community-capacity-2/' },
  { id: 'ca27a805-4ee8-437d-9ae6-a90cc9e66739', re: /Glasspool/,
    field: 'next_open_date', reason: 'pinned',
    held_by: 'admin:paulkilty1@gmail.com', held_since: '2026-07-29T22:55:39.089Z',
    page_says: 'We do not anticipate entering into a new recruitment round before 2027.',
    url: 'https://www.glasspool.org.uk/' },
  { id: 'bec586cc-4172-4d15-bb05-5fd5f24c7bb9', re: /Innovation Loans/,
    field: 'is_rolling', reason: 'pinned',
    held_by: 'admin:innovate-uk-batch-2026-06-01', held_since: '2026-06-01T20:45:48.854Z',
    page_says: 'There is no submission deadline',
    url: 'https://iuk-business-connect.org.uk/programme/innovation-loans/' },
]

async function main() {
  const db = getAdminDb()
  const out: PinOutlived[] = []
  for (const p of PINS) {
    const { data } = await db.from('scraped_grants')
      .select('id, title, deadline, is_rolling, next_open_date, next_open_date_parsed, field_provenance')
      .eq('id', p.id).single()
    if (!data) throw new Error(`${p.id}: no row`)
    if (!p.re.test(data.title)) throw new Error(`${p.id}: title "${data.title}" does not match ${p.re}`)

    // A pin that is no longer there is not a pin to report. Check rather than
    // trust the note: Paul cleared three of these while this job was running.
    const prov = (data.field_provenance as Record<string, { source?: string }> | null)?.[p.field]
    if (prov?.source !== p.held_by) {
      console.log(`  SKIP ${data.title}: ${p.field} is now held by ${prov?.source ?? 'nothing'}, not ${p.held_by}`)
      continue
    }

    const row = data as Record<string, unknown>
    console.log(`  ${data.title.slice(0, 40).padEnd(40)} ${p.field} = ${JSON.stringify(row[p.field])}  vs page: "${p.page_says.slice(0, 60)}"`)
    const { re, ...rest } = p
    out.push({ ...rest, title: data.title, row_holds: row[p.field] ?? null })
  }
  console.log(APPLY ? `writing ${out.length} pins` : `DRY RUN, would write ${out.length} pins`)
  if (APPLY) recordPins(out)
}
main().catch(e => { console.error(e); process.exit(1) })

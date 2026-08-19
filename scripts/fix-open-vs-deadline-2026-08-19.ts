// Live funds whose card shows a closing date for a round that has not opened,
// or shows nothing at all. Each one read on the funder's page first, because the
// fault is not the same in every row and the data cannot tell you which field is
// the stale one.
//
// Two of them were the OPPOSITE of the reported fault: the deadline was right
// and the opening date was the leftover.
//
//   Schroder Charity Trust — OPEN. "5pm on the 28th August 2026", window opened
//   1 July 2026. Our deadline was right; "Autumn 2026", set in March, was a
//   stale opening date on a fund that is taking applications now.
//
//   Oake Sunshine Fund — OPEN. "Apply by: Mon 12th October 2026". Same shape:
//   deadline verified by hand on 11 August, opening date left over from April.
//
// One had a deadline that was never real:
//
//   BRIT Trust — "The BRIT Trust Grant application window for 2026 is now
//   closed" and "Applications for 2027 will open towards the end of this year".
//   Our 30 April 2027 deadline came from `system:cycle_derive:v1` rolling the
//   2026 cycle forward a year. No such round has been announced. The date is
//   removed rather than replaced, and the text says what the page says.
//
// Two are Paul's pinned values and can only be attempted here. Both are
// attempted anyway so the refusal is recorded rather than assumed:
//
//   Jerwood — "Applications open 9am 3 February (closing 2pm 17 March) 2027."
//   The stored deadline of 2027-02-03 is the OPENING date. A fundraiser reads
//   "deadline 3 February" for a round that opens that morning and runs six more
//   weeks. The closing date is 17 March 2027.
//
//   Bristol Impact Fund 3 — "A second round of BIF3 small grants will run from
//   1 April 2028 to 31 March 2030. Further information about the application
//   process and timeline will be published from September 2027." Nothing closes
//   on 28 April 2027, and the row's "September 2026 (expected)" is a year out.
//
//   npx tsx --env-file=.env.local scripts/fix-open-vs-deadline-2026-08-19.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-open-vs-deadline-2026-08-19.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatNextOpen } from '../src/lib/utils'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:open-vs-deadline-2026-08-19'

const EDITS = [
  {
    id: 'b4dd4488-867a-48c2-9853-1250c43865f6',
    title: 'Schroder Charity Trust — open now; the opening date was the stale field',
    fields: { next_open_date: null, next_open_date_parsed: null },
    snippet:
      'schrodercharitytrust.org: the application window opened 1 July 2026 and closes "5pm on the 28th August 2026". '
      + '"Future application window dates will be published on the Schroder Charity Trust website in due course." '
      + 'The fund is open, so a stored "Autumn 2026" opening date describes a round that is already running.',
  },
  {
    id: '2dd171df-c033-4b4f-972f-5e1860581b2c',
    title: 'Oake Sunshine Fund — open now; same stale opening date',
    fields: { next_open_date: null, next_open_date_parsed: null },
    snippet:
      'somersetcf.org.uk: "Apply by: Mon 12th October 2026". The fund is open for its autumn round with decisions '
      + 'expected late November 2026. The stored "Autumn 2026" opening date describes the round now running.',
  },
  {
    id: '3ca96f8d-8d53-4be5-99d8-f3a637d1fc5e',
    title: 'BRIT Trust — the April 2027 deadline was derived, not announced',
    fields: {
      deadline: null,
      next_open_date: 'Applications for 2027 open towards the end of 2026. No exact date announced.',
    },
    snippet:
      'brittrust.co.uk: "The BRIT Trust Grant application window for 2026 is now closed." '
      + '"Applications for 2027 will open towards the end of this year." The 2026 cycle reviewed applications after '
      + '30 April 2026, which is where system:cycle_derive:v1 got a 30 April 2027 deadline. No 2027 round has been '
      + 'announced with a closing date.',
  },
  {
    id: '6df1b665-ae45-435c-b07f-f56ccb582d5a',
    title: 'Jerwood — the stored deadline is the opening date (expect a refusal)',
    fields: {
      deadline: '2027-03-17',
      next_open_date: 'Applications open on 3 February 2027 and close on 17 March 2027.',
      next_open_date_parsed: '2027-02-03',
    },
    snippet:
      'jerwood.org/funding/: "Applications open 9am 3 February (closing 2pm 17 March) 2027." For projects starting '
      + 'between 1 July 2027 and 30 June 2028. The stored deadline of 3 February 2027 is the date the round OPENS.',
  },
  {
    id: 'b0611f72-056a-4c29-8f8b-ad5597093d92',
    title: 'Bristol Impact Fund 3 — nothing closes in April 2027 (expect a refusal)',
    fields: {
      deadline: null,
      next_open_date: 'Timeline for the next round is published from September 2027; that round runs from 1 April 2028.',
      next_open_date_parsed: '2027-09-01',
    },
    snippet:
      'bristol.gov.uk: "A second round of BIF3 small grants will run from 1 April 2028 to 31 March 2030. Further '
      + 'information about the application process and timeline will be published from September 2027." The first '
      + 'round is funded and running, 1 September 2026 to 31 August 2028.',
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const blocked: string[] = []
  for (const e of EDITS) {
    console.log(`\n── ${e.title}`)
    if (DRY) { console.log(`   ${JSON.stringify(e.fields)} (dry)`); continue }
    const citations = Object.fromEntries(
      Object.keys(e.fields).map(k => [k, { snippet: e.snippet, confidence: 'high' as const }]),
    )
    const r = await mergeGrantUpdate({ id: e.id, fields: e.fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(r.applied)}`)
    if (r.rejected?.length) {
      console.log(`   REFUSED:  ${r.rejected.map(x => `${x.field} (${x.reason}, held by ${x.blockedBy?.source})`).join('; ')}`)
      blocked.push(e.title)
    }
  }
  if (DRY) return

  console.log('\n── what each card says now')
  const { data } = await db.from('scraped_grants')
    .select('title, is_active, is_rolling, deadline, next_open_date')
    .in('id', EDITS.map(e => e.id))
  for (const r of (data ?? []) as { title: string; is_active: boolean; is_rolling: boolean; deadline: string | null; next_open_date: string | null }[]) {
    const shows = !r.is_active ? 'hidden'
      : (!r.is_rolling && !r.deadline && r.next_open_date) ? (formatNextOpen(r.next_open_date) ?? 'Check funder')
      : (r.deadline ? `DEADLINE ${r.deadline}` : 'Check funder')
    console.log(`  ${r.title.slice(0, 44).padEnd(44)} → ${shows}`)
  }
  if (blocked.length) console.log(`\n${blocked.length} row(s) still need Paul to release a pinned value.`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

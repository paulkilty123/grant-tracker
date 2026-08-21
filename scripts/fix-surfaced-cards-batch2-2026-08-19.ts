// Four more rows the surfacing run made live without making them say when they
// open. These did not show up in the first repair pass because ALL of their
// tracked-field writes were refused, so the run stamped no provenance on them
// and a provenance-keyed query could not see them. The rows still went live,
// because is_active and pipeline_state are not tracked fields and were applied.
//
// That is the lesson worth keeping: "which rows did my run change" cannot be
// answered from provenance when the fields that changed are untracked. Ask the
// card instead — verify-surfaced-cards-2026-08-19.ts checks every live row with
// a future opening date, whoever made it live.
//
// Steel Charitable Trust is fixable the same way Suffolk Giving was: it holds a
// perfectly good "1 October 2026" and is_rolling = true, and the card refuses to
// show an opening date on a rolling fund.
//
// The other three have a `deadline` that admin trust will not let go, and the
// card renders a deadline in preference to an opening date. For each of them the
// deadline is a DERIVED next close, sitting in front of an opening date that has
// not arrived — Fellowship Fund reads "deadline 10 April 2027" for a fund that
// opens in March 2027. Live and wrong is worse than hidden, so they go back.
// Releasing `admin:cycle_derive_2026-07-26` on these is Paul's call.
//
//   npx tsx --env-file=.env.local scripts/fix-surfaced-cards-batch2-2026-08-19.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-surfaced-cards-batch2-2026-08-19.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatNextOpen } from '../src/lib/utils'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:surfaced-card-repair-2026-08-19'

const EDITS = [
  {
    id: '59b7e30c-4018-4d22-9e7a-074a5f19ae24',
    title: 'Steel Charitable Trust — rolling flag is hiding a perfectly good opening date',
    fields: { is_rolling: false },
    snippet:
      'next_open_date is "1 October 2026" and next_open_date_parsed is 2026-10-01, yet is_rolling is true. '
      + 'A fund with a stated reopening date is not one that accepts applications at any time, and the card '
      + 'suppresses the "Opens ..." label on any row flagged rolling.',
  },
  {
    id: '4ae29598-b2c4-4de0-8a11-103dc682d669',
    title: 'The Bromley Trust — Grants — hidden again; deadline 9 Mar 2027 sits before the 1 Feb opening',
    fields: { is_active: false, pipeline_state: 'between_rounds_scheduled' },
    snippet:
      'deadline 2027-03-09 was written by admin:cycle_derive_2026-07-26 and outranks this source, and '
      + 'next_open_date is "TBC — between rounds", which cannot be dated. The card therefore shows a closing '
      + 'date on a fund that has not reopened.',
  },
  {
    id: '6198ac98-f639-4192-ad44-613566654064',
    title: 'Innovate UK Women in Innovation — hidden again; deadline outranks the opening date',
    fields: { is_active: false, pipeline_state: 'between_rounds_scheduled' },
    snippet:
      'deadline 2027-02-04 was written by admin:cycle_derive_2026-07-26. next_open_date is "Estimated '
      + 'mid-November 2026 (based on historical annual cycle)", an estimate rather than a published date. '
      + 'The card shows the February deadline and says nothing about November.',
  },
  {
    id: '9e591aa1-bb17-4ba7-b9c7-5c93839aa325',
    title: 'Fellowship Fund — hidden again; deadline 10 Apr 2027 on a fund that opens in March',
    fields: { is_active: false, pipeline_state: 'between_rounds_scheduled' },
    snippet:
      'deadline 2027-04-10 was written by admin:cycle_derive_2026-07-26 and next_open_date is "Spring 2027", '
      + 'pinned by admin. The card shows a closing date for a round that has not opened.',
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  for (const e of EDITS) {
    console.log(`\n── ${e.title}`)
    if (DRY) { console.log(`   ${JSON.stringify(e.fields)} (dry)`); continue }
    const citations = Object.fromEntries(
      Object.keys(e.fields).map(k => [k, { snippet: e.snippet, confidence: 'high' as const }]),
    )
    const r = await mergeGrantUpdate({ id: e.id, fields: e.fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(r.applied)}`)
    if (r.rejected?.length) console.log(`   REFUSED:  ${JSON.stringify(r.rejected)}`)
  }
  if (DRY) return

  const { data } = await db.from('scraped_grants')
    .select('title, is_active, is_rolling, deadline, next_open_date')
    .in('id', EDITS.map(e => e.id))
  for (const r of (data ?? []) as { title: string; is_active: boolean; is_rolling: boolean; deadline: string | null; next_open_date: string | null }[]) {
    const shows = !r.is_active ? 'hidden'
      : (!r.is_rolling && !r.deadline && r.next_open_date) ? (formatNextOpen(r.next_open_date) ?? 'Check funder')
      : (r.deadline ? `DEADLINE ${r.deadline}` : 'Check funder')
    console.log(`\n  ${r.title.slice(0, 46).padEnd(46)} → ${shows}`)
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

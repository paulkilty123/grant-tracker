// Three rows the surfacing run made visible without making them say anything.
//
// The run applied its floor to the text it was ABOUT to write. Then the trust
// ladder refused some of those writes, and the rows went live anyway. A floor
// checked before the write is not a floor — it has to be checked after.
//
// Suffolk Giving Fund is fixable: it carries is_rolling = true AND a scheduled
// reopening on 1 June 2027, which cannot both be true. The card only shows
// "Opens ..." when the row is not rolling, so the flag is why it reads "Check
// funder". The flag came from `ai_extract:cf_fund_pipeline` (trust 50), and a
// fund whose round was closed by hand on 11 August is not one that accepts
// applications at any time.
//
// The other two are Paul's own admin values and are left for him:
//
//   Simon Gibson — `deadline` is pinned at 2027-03-31, which is the same date as
//   the OPENING. The card shows it as a closing date, so a fundraiser reads
//   "deadline 31 March" for a fund that has not opened by then. Only Paul can
//   release his pin, so the row goes back to hidden rather than staying live and
//   wrong.
//
//   Forrester Family Trust — the text is Paul's, "reopens on 05/01/2027 and
//   closes 17/01/2027". It is correct and `formatNextOpen` cannot read it,
//   because the parser only understands month names, not 05/01/2027. Rewriting
//   Paul's admin text to suit the parser is the wrong way round; the parser
//   should learn numeric dates. Hidden until it does. Its parsed date was also
//   2026-12-01, which contradicts the January date in the text — corrected here
//   so whatever brings it back fires on the right day.
//
//   npx tsx --env-file=.env.local scripts/fix-surfaced-cards-2026-08-19.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-surfaced-cards-2026-08-19.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatNextOpen } from '../src/lib/utils'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:surfaced-card-repair-2026-08-19'

const EDITS = [
  {
    id: 'd35b05bd-bbb1-4826-aa8f-6dca2739591b',
    title: 'Suffolk Giving Fund — rolling and scheduled to reopen cannot both be true',
    fields: { is_rolling: false },
    snippet:
      'The row carries is_rolling = true alongside next_open_date_parsed of 2027-06-01 and a deadline '
      + 'closed by hand on 2026-08-11. A fund that runs rounds and is currently between them does not accept '
      + 'applications at any time. The rolling flag came from ai_extract:cf_fund_pipeline, not from the funder.',
  },
  {
    id: '9f87b6cf-69ce-48e3-8d21-a17361ae0084',
    title: 'Simon Gibson — back to hidden; the pinned deadline is the opening date',
    fields: { is_active: false, pipeline_state: 'between_rounds_scheduled' },
    snippet:
      'deadline is pinned at 2027-03-31 by admin:paulkilty1@gmail.com and next_open_date_parsed is the same '
      + 'date, so the card renders the OPENING date as a closing date. The pin cannot be released here. Hidden '
      + 'rather than left live showing a deadline for a fund that has not opened.',
  },
  {
    id: 'b5528e38-9526-4d18-82f6-bc579065467b',
    title: 'Forrester Family Trust — back to hidden; the date format is unreadable to the card',
    fields: { is_active: false, pipeline_state: 'between_rounds_scheduled', next_open_date_parsed: '2027-01-05' },
    snippet:
      'next_open_date is "reopens on 05/01/2027 and closes 17/01/2027", set by admin:paulkilty1@gmail.com. '
      + 'formatNextOpen only reads month names, so the card falls through to "Closed — check funder". The stored '
      + 'parsed date was 2026-12-01, a month earlier than the text says; corrected to 2027-01-05.',
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

  // The floor, applied AFTER the write this time.
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

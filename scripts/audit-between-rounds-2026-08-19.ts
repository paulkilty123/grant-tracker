// The 115 rows nobody can see, sorted by whether we could tell a user anything.
//
// `between_rounds_scheduled` hides a row from users completely. That is right
// for a fund whose return date is unknown and wrong for one whose return date we
// hold — Aldi's reopens 11 May 2027, and hiding it meant a Scottish sports club
// planning next season could not learn it exists. This counts how many of the
// 115 are in each case, using the SAME functions the card uses, so the buckets
// are what a user would actually be shown rather than what the data looks like.
//
// Read-only. Writes nothing.
//
//   npx tsx --env-file=.env.local scripts/audit-between-rounds-2026-08-19.ts
//   npx tsx --env-file=.env.local scripts/audit-between-rounds-2026-08-19.ts --list surfaceable
import { createClient } from '@supabase/supabase-js'
import { formatNextOpen } from '../src/lib/utils'
import { deriveCycleDates } from '../src/lib/grant-deadlines'

const listArg = process.argv.includes('--list') ? process.argv[process.argv.indexOf('--list') + 1] : null

type Row = {
  id: string; title: string; funder: string | null
  deadline: string | null; deadline_cycle: unknown
  next_open_date: string | null; next_open_date_parsed: string | null
  is_rolling: boolean | null; last_seen_at: string | null
  funder_brief: { last_enriched?: string } | null
}

/** What the card would say today if this row were made visible as it stands. */
type Bucket =
  | 'surfaceable'        // we can name a date: "Opens 11 May 2027"
  | 'derivable'          // no usable text, but deadline_cycle yields an opening date
  | 'closed_no_date'     // real text, but nothing datable — card would say "Closed — check funder"
  | 'nothing_to_say'     // no reopening information at all

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data, error } = await db
    .from('scraped_grants')
    .select('id, title, funder, deadline, deadline_cycle, next_open_date, next_open_date_parsed, is_rolling, last_seen_at, funder_brief')
    .eq('pipeline_state', 'between_rounds_scheduled')
    .limit(1000)
  if (error) { console.error('query failed:', error.message); process.exit(1) }
  const rows = (data ?? []) as unknown as Row[]

  const today = new Date()
  const todayISO = today.toISOString().slice(0, 10)
  const buckets = new Map<Bucket, { row: Row; label: string }[]>()
  const put = (b: Bucket, row: Row, label: string) => {
    if (!buckets.has(b)) buckets.set(b, [])
    buckets.get(b)!.push({ row, label })
  }

  for (const r of rows) {
    // The parsed column is the strongest signal — it is what check-coming-soon
    // uses to bring the row back, so if it holds a future date we already trust
    // it enough to schedule on.
    if (r.next_open_date_parsed && r.next_open_date_parsed >= todayISO) {
      put('surfaceable', r, `opens ${r.next_open_date_parsed}`)
      continue
    }
    // Otherwise ask the CARD what it would print, rather than guessing from the
    // raw text. formatNextOpen refuses dates that have already passed.
    const card = formatNextOpen(r.next_open_date)
    if (card && card !== 'Closed — check funder') { put('surfaceable', r, card); continue }

    const d = deriveCycleDates(r.deadline_cycle, today)
    if (d.nextOpenDate) { put('derivable', r, `cycle opens ${d.nextOpenDate}`); continue }

    if (r.next_open_date) { put('closed_no_date', r, (r.next_open_date ?? '').slice(0, 70)); continue }
    put('nothing_to_say', r, '—')
  }

  const order: Bucket[] = ['surfaceable', 'derivable', 'closed_no_date', 'nothing_to_say']
  const meaning: Record<Bucket, string> = {
    surfaceable:    'we can name the date — hiding these loses a user nothing but the fund',
    derivable:      'no usable text, but the recorded cycle gives an opening date',
    closed_no_date: 'we know it is shut and not when it returns — card would say "Closed — check funder"',
    nothing_to_say: 'no reopening information at all — hidden with nothing scheduled to bring it back',
  }

  console.log(`\nbetween_rounds_scheduled, invisible to users: ${rows.length}\n`)
  for (const b of order) {
    const n = buckets.get(b)?.length ?? 0
    console.log(`  ${b.padEnd(16)} ${String(n).padStart(3)}   ${meaning[b]}`)
  }

  // Staleness matters most for the ones with nothing scheduled: a row hidden a
  // year ago with no return date is not "between rounds", it is gone.
  const stale = (r: Row) => {
    const le = r.funder_brief?.last_enriched
    if (!le) return null
    return Math.floor((Date.now() - new Date(le).getTime()) / 86400000)
  }
  const nothing = buckets.get('nothing_to_say') ?? []
  const ages = nothing.map(x => stale(x.row)).filter((n): n is number => n !== null).sort((a, b) => b - a)
  if (ages.length) {
    console.log(`\n  of the ${nothing.length} with nothing to say, last read: oldest ${ages[0]}d, median ${ages[Math.floor(ages.length / 2)]}d, newest ${ages[ages.length - 1]}d`)
  }

  if (listArg) {
    const list = buckets.get(listArg as Bucket) ?? []
    console.log(`\n── ${listArg} (${list.length})\n`)
    for (const { row, label } of list) {
      console.log(`  ${(row.funder ?? '—').slice(0, 26).padEnd(26)} ${row.title.slice(0, 44).padEnd(44)} ${label}`)
    }
  } else {
    console.log(`\n  re-run with --list <bucket> to see the rows\n`)
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

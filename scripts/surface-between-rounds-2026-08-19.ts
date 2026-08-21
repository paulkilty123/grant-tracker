// Make the 37 dated between-rounds funds visible again, showing WHEN THEY OPEN.
//
// `between_rounds_scheduled` hides a row completely. That is right for a fund
// whose return is unknown and wrong for one whose return date we already hold:
// 37 of the 115 hidden rows carry an opening date, seven of them within a
// fortnight, and a fundraiser planning next quarter cannot find any of them.
// Paul approved surfacing exactly these on 2026-08-19.
//
// The card renders "Opens ..." only when the deadline is NULL and only from the
// FREE TEXT in `next_open_date` — `formatNextOpen`, not the parsed column. So
// three things have to line up, and a row where they cannot is left hidden:
//
//   1. deadline cleared, or the badge never appears at all;
//   2. next_open_date phrased so formatNextOpen can date it — several rows hold
//      a real date in `next_open_date_parsed` and prose that has no year in it,
//      which renders as "Closed — check funder";
//   3. next_open_date_parsed set, because `check-coming-soon` fires on that and
//      nothing else, and a row it cannot fire on never comes back for review.
//
// PRECISION IS NOT INVENTED. A parsed date falling on the 1st of a month is
// almost always a month-level placeholder ("opens January 2027"), so those are
// written as "in January 2027" and render "Opens Jan 2027". Only a date with a
// real day-of-month is written as a day. Under-claiming is safe here;
// over-claiming puts a false open-date on a card.
//
// THE FLOOR: after all of that, the script asks formatNextOpen what the card
// would actually say. If the answer is not a dated "Opens ..." label, the row is
// SKIPPED and stays hidden. A fund hidden is a fund nobody finds; a fund shown
// with the wrong date is a wasted application.
//
//   npx tsx --env-file=.env.local scripts/surface-between-rounds-2026-08-19.ts --dry
//   npx tsx --env-file=.env.local scripts/surface-between-rounds-2026-08-19.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatNextOpen } from '../src/lib/utils'
import { deriveCycleDates } from '../src/lib/grant-deadlines'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:surface-between-rounds-2026-08-19'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Rows excluded by hand, with the reason.
 *
 * Publishing a duplicate is worse than leaving a fund hidden: the user sees the
 * same fund twice and cannot tell which record to trust. This one was found by
 * the guard below — `discovery_queue` re-added Asda's Local Community Spaces
 * Fund on 15 August, six months after the funder's own scraper had it, and
 * pointed the copy at a third-party blog rather than asdafoundation.org.
 */
const EXCLUDE: Record<string, string> = {
  'faad6496-9abc-496c-a8cd-3c02080c3e55':
    'duplicate of Asda Foundation Local Community Spaces Fund (39e09339), and links a blog rather than the funder',
}

/** Title with the funder's name and all punctuation stripped, for collision checks. */
function normTitle(title: string, funder: string | null): string {
  let t = title
  if (funder) t = t.replace(new RegExp(funder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')
  return t.toLowerCase().replace(/[^a-z0-9]/g, '')
}

type Row = {
  id: string; title: string; funder: string | null
  deadline: string | null; deadline_cycle: unknown
  next_open_date: string | null; next_open_date_parsed: string | null
  is_active: boolean | null; pipeline_state: string
}

/** The opening date and how precisely we actually know it. */
function openingDateOf(r: Row, today: Date, todayISO: string): { iso: string; precise: boolean } | null {
  if (r.next_open_date_parsed && r.next_open_date_parsed >= todayISO) {
    return { iso: r.next_open_date_parsed, precise: !r.next_open_date_parsed.endsWith('-01') }
  }
  // The prose may carry a date the parsed column never got. Same shape
  // formatNextOpen matches, and the same future-only guard.
  const raw = (r.next_open_date ?? '').trim()
  const m = raw.match(new RegExp(`(?:(\\d{1,2})\\s+)?(${MONTHS.join('|')})\\s+(\\d{4})`, 'i'))
  if (m) {
    const day = m[1] ? parseInt(m[1], 10) : 1
    const month = MONTHS.findIndex(x => x.toLowerCase() === m[2].toLowerCase())
    const iso = `${m[3]}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (iso >= todayISO) return { iso, precise: Boolean(m[1]) }
  }
  const d = deriveCycleDates(r.deadline_cycle, today)
  if (d.nextOpenDate && d.nextOpenDate >= todayISO) return { iso: d.nextOpenDate, precise: true }
  return null
}

function phrase(iso: string, precise: boolean): string {
  const [y, mo, da] = iso.split('-').map(Number)
  return precise
    ? `Applications open on ${da} ${MONTHS[mo - 1]} ${y}.`
    : `Applications open in ${MONTHS[mo - 1]} ${y}.`
}

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data, error } = await db
    .from('scraped_grants')
    .select('id, title, funder, deadline, deadline_cycle, next_open_date, next_open_date_parsed, is_active, pipeline_state')
    .eq('pipeline_state', 'between_rounds_scheduled')
    .limit(1000)
  if (error) { console.error('query failed:', error.message); process.exit(1) }
  const rows = (data ?? []) as unknown as Row[]

  const today = new Date()
  const todayISO = today.toISOString().slice(0, 10)

  const plan: { r: Row; fields: Record<string, unknown>; card: string; when: string }[] = []
  let noDate = 0, wouldNotRender = 0

  let excluded = 0
  for (const r of rows) {
    if (EXCLUDE[r.id]) { excluded++; console.log(`  EXCLUDED ${r.title.slice(0, 44)} — ${EXCLUDE[r.id]}`); continue }
    const open = openingDateOf(r, today, todayISO)
    if (!open) { noDate++; continue }

    // Keep the existing wording when the card can already date it; rewriting
    // good prose loses nuance the funder actually published.
    const existing = formatNextOpen(r.next_open_date)
    const keepText = existing !== null && existing !== 'Closed — check funder'
    const text = keepText ? (r.next_open_date as string) : phrase(open.iso, open.precise)

    // THE FLOOR. Ask the card, do not assume.
    const card = formatNextOpen(text)
    if (!card || card === 'Closed — check funder') { wouldNotRender++; continue }

    const fields: Record<string, unknown> = {
      is_active: true,
      pipeline_state: 'published',
      next_open_date_parsed: open.iso,
    }
    if (!keepText) fields.next_open_date = text
    if (r.deadline) fields.deadline = null

    plan.push({ r, fields, card, when: open.iso })
  }

  plan.sort((a, b) => a.when.localeCompare(b.when))

  // DUPLICATE GUARD. Two rows for one fund is the catalogue's most common fault,
  // and making both visible on the same day is the worst version of it. Checked
  // over the PLAN rather than in SQL, because a row can reach the plan through
  // three different date sources and a query cannot reproduce all three.
  const seen = new Map<string, typeof plan[number]>()
  const collisions: string[] = []
  for (const p of plan) {
    const key = `${p.r.funder ?? ''}|${normTitle(p.r.title, p.r.funder)}`
    const prev = seen.get(key)
    if (prev) collisions.push(`${p.r.funder}: "${prev.r.title}" and "${p.r.title}"`)
    else seen.set(key, p)
  }
  if (collisions.length) {
    console.error(`\nABORT — ${collisions.length} duplicate pair(s) would be published together:`)
    for (const c of collisions) console.error(`  ${c}`)
    console.error('\nResolve each (withdraw one, or add it to EXCLUDE with a reason) and re-run.\n')
    process.exit(1)
  }

  console.log(`\nhidden rows examined              : ${rows.length}`)
  console.log(`  no future opening date          : ${noDate}  (left hidden)`)
  console.log(`  card would not name a date      : ${wouldNotRender}  (left hidden)`)
  console.log(`  excluded by hand                : ${excluded}`)
  console.log(`\nTO SURFACE                        : ${plan.length}\n`)
  for (const p of plan) {
    console.log(`  ${p.when}  ${(p.r.funder ?? '—').slice(0, 24).padEnd(24)} ${p.r.title.slice(0, 40).padEnd(40)} → "${p.card}"`)
  }

  if (DRY) { console.log('\nDRY RUN — nothing written.\n'); return }

  let applied = 0, refused = 0, failed = 0
  for (const p of plan) {
    const citations = Object.fromEntries(Object.keys(p.fields).map(k => [k, {
      snippet: `Between rounds. The next opening date on record is ${p.when}; the card shows "${p.card}". `
        + 'Surfaced rather than hidden so a fundraiser planning ahead can find the fund. '
        + 'Approved by Paul, 2026-08-19.',
      confidence: 'high' as const,
    }]))
    const res = await mergeGrantUpdate({ id: p.r.id, fields: p.fields, source: SOURCE, db, citations })
    applied += res.applied.length
    if (res.rejected?.length) { refused += res.rejected.length; console.log(`  REFUSED ${p.r.title.slice(0, 40)}: ${JSON.stringify(res.rejected)}`) }
    if (!res.applied.includes('is_active')) { failed++; console.log(`  is_active NOT applied: ${p.r.title.slice(0, 50)}`) }
  }
  console.log(`\nfields applied: ${applied}   refused: ${refused}   rows where is_active did not stick: ${failed}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

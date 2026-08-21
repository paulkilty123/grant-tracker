// What does the card ACTUALLY say on every row the surfacing run made visible?
//
// The surfacing script applied its floor to the text it INTENDED to write. Five
// rows then had that write refused by the trust ladder — pinned admin values and
// an admin-sourced deadline — so the row went live while the field that was
// supposed to carry the timing did not change. A floor checked before the write
// is not a floor.
//
// Read-only.
//
//   npx tsx --env-file=.env.local scripts/verify-surfaced-cards-2026-08-19.ts
import { createClient } from '@supabase/supabase-js'
import { formatNextOpen } from '../src/lib/utils'

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data } = await db
    .from('scraped_grants')
    .select('id, title, funder, deadline, next_open_date, next_open_date_parsed, is_rolling, is_active, pipeline_state, field_provenance')
    // NOT keyed on the run's provenance. Two reasons, both learned here:
    // `is_active` is not a tracked field so nothing is stamped for it, and a
    // PostgREST .eq() on a two-level JSONB path returns zero rows without
    // erroring — it reported "0 rows made visible" for a run that had just
    // changed 36.
    //
    // Checking the whole population is the better test regardless: every LIVE
    // row with a future opening date should be naming that date on its card,
    // whoever made it live.
    .eq('is_active', true)
    .eq('pipeline_state', 'published')
    .not('next_open_date_parsed', 'is', null)
    .gte('next_open_date_parsed', new Date().toISOString().slice(0, 10))
    .limit(500)

  const rows = (data ?? []) as unknown as {
    id: string; title: string; funder: string | null
    deadline: string | null; next_open_date: string | null; next_open_date_parsed: string | null
    is_rolling: boolean | null; is_active: boolean | null; pipeline_state: string
  }[]

  const bad: typeof rows = []
  console.log(`\nlive rows with a future opening date: ${rows.length}\n`)
  for (const r of rows) {
    // Exactly the card's own logic — see `deadlineDisplay` in the search page.
    const shows = (!r.is_rolling && !r.deadline && r.next_open_date)
      ? (formatNextOpen(r.next_open_date) ?? 'Check funder')
      : (r.deadline ? `DEADLINE ${r.deadline}` : 'Check funder')
    const ok = shows.startsWith('Opens ')
    if (!ok) { bad.push(r); console.log(`  ✗ ${(r.funder ?? '—').slice(0, 24).padEnd(24)} ${r.title.slice(0, 40).padEnd(40)} → "${shows}"`) }
  }
  console.log(`\ncards naming an opening date : ${rows.length - bad.length}`)
  console.log(`cards NOT naming one         : ${bad.length}${bad.length ? '  ← live and not saying when they open' : ''}\n`)
  if (bad.length) console.log(bad.map(r => `'${r.id}', // ${r.title}`).join('\n'))
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

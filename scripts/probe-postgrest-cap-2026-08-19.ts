// Does `.limit(3000)` actually return 3000 rows?
//
//   npx tsx --env-file=/Users/paulkilty/dev/grant-tracker/.env.local \
//     scripts/probe-postgrest-cap-2026-08-19.ts
//
// READ ONLY. Written because process-discovery-queue's dedup asks for 3000 rows
// of apply_url/title to build its "already have it" set, and scraped_grants has
// 1,912 rows. If PostgREST caps the response below that, the set is partial, the
// check still runs, and it reports "no duplicate" for anything in the missing
// half — a check that cannot fail.
import { createClient } from '@supabase/supabase-js'

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { count } = await db
    .from('scraped_grants')
    .select('id', { count: 'exact', head: true })

  const { data: asWritten } = await db
    .from('scraped_grants')
    .select('apply_url, title')
    .limit(3000)

  console.log(`rows in table:        ${count}`)
  console.log(`.limit(3000) returned ${asWritten?.length ?? 0}`)

  const seen = new Set((asWritten ?? []).map(g => (g.apply_url ?? '').toLowerCase().trim()))
  const bridges = 'https://www.bridgesfundmanagement.com/'
  console.log(`\nBridges URL present in that set? ${seen.has(bridges)}`)
  console.log('(It exists on an archived row, so a complete set must contain it.)')

  // What a paged read gets, for comparison.
  const all: string[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data } = await db
      .from('scraped_grants')
      .select('apply_url')
      .range(from, from + PAGE - 1)
    if (!data?.length) break
    all.push(...data.map(g => (g.apply_url ?? '').toLowerCase().trim()))
    if (data.length < PAGE) break
  }
  console.log(`\npaged read returned   ${all.length}`)
  console.log(`Bridges URL present?  ${new Set(all).has(bridges)}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

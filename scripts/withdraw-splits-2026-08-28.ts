// The two "split" rows, withdrawn without splitting, because the rows a split
// would create already exist.
//
// SPORTSCOTLAND — COMMUNITY SPORT. "Community Sport" is a filter on their
// funding page rather than a fund. The two real ones are already carried:
// "sportscotland — Facilities Investment" points at the Sport Facilities Fund
// and is live, and National Lottery Awards for All Scotland is carried under the
// Lottery at £300 to £20,000. There is also an archived Club and Community Sport
// Fund row. So this row is a duplicate front door and withdrawing it costs no
// coverage.
//
// FILM LONDON — PRODUCTION FINANCE & TALENT. Nothing is called that. What Film
// London runs is BFI NETWORK's England Short Film Fund and Early Development
// Fund, for directors, writers and producers, and FLAMIN Productions and the
// £10,000 Jarman Award for artist filmmakers. Those are talent funds for
// INDIVIDUALS, which is the audience test that took ten rows out of the
// catalogue earlier today. Staging them would put back what we just removed.
//
// Both funders go on the watchlist instead. Film London at Paul's request, and
// sportscotland on the same argument: a new fund appears on a funder's index
// before it appears anywhere else, and migration 057's trigger only ever enrols
// a row's own apply_url.
//
//   npx tsx --env-file=.env.local scripts/withdraw-splits-2026-08-28.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'

const APPLY = process.argv.includes('--apply')

const ROWS = [
  { title: 'Sportscotland — Community Sport', code: 'duplicate',
    why: '"Community Sport" is a filter category on sportscotland\'s funding page, not a fund. Both real funds are already carried: "sportscotland — Facilities Investment" (Sport Facilities Fund, deadlines 1 April and 1 September) and National Lottery Awards for All Scotland under the Lottery. This row is a front door over rows we already hold.' },
  { title: 'Film London — Production Finance & Talent', code: 'out_of_scope',
    why: 'Nothing at Film London is called Production Finance & Talent; Production Finance Market is a two-day event. What they run is BFI NETWORK\'s England Short Film Fund and Early Development Fund, for directors, writers and producers, and FLAMIN Productions and the £10,000 Jarman Award for artist filmmakers. Those fund individuals rather than organisations. Film London is on the watchlist so an organisation-facing fund is noticed if one opens.' },
]

const WATCH = [
  { name: 'Film London — funding index', listing_url: 'https://filmlondon.org.uk/funding',
    notes: 'Added 2026-08-28 when the Production Finance & Talent row was withdrawn. Paul asked for an eye on Film London for future openings: their current schemes fund individuals, and this page changing is how we learn an organisation-facing one has opened.' },
  { name: 'sportscotland — funding index', listing_url: 'https://sportscotland.org.uk/funding/',
    notes: 'Added 2026-08-28 when the Community Sport row was withdrawn. We carry their two named funds; this page is how a third would be noticed.' },
]

async function main() {
  const db = getAdminDb()
  if (!APPLY) console.log('DRY RUN — nothing written. Pass --apply.\n')

  for (const r of ROWS) {
    const { data } = await db.from('scraped_grants').select('id, is_active').eq('title', r.title).limit(1)
    const row = (data as any[])?.[0]
    if (!row) { console.log(`${r.title}: NOT FOUND`); continue }
    if (!row.is_active) { console.log(`${r.title}: already out of view`); continue }
    if (!APPLY) { console.log(`[dry] withdraw ${r.title}`); continue }
    const res = await mergeGrantUpdate({
      id: row.id, db,
      fields: { is_active: false, pipeline_state: 'rejected', rejection_reason: formatRejectReason(r.code, r.why) },
      source: 'system:splits-2026-08-28',
    })
    console.log(`withdrawn ${r.title}: applied [${res.applied.join(', ') || 'nothing'}]`)
  }

  for (const w of WATCH) {
    if (!APPLY) { console.log(`[dry] watch ${w.listing_url}`); continue }
    const { error } = await db.from('funder_watchlist').upsert(w, { onConflict: 'listing_url', ignoreDuplicates: true })
    console.log(error ? `watch ${w.listing_url}: FAILED ${error.message}` : `watching ${w.listing_url}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })

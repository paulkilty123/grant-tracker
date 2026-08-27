// Co-op Foundation — Belong: withdrawn, and the funder's fund list watched instead.
//
// Belong is not a fund. coopfoundation.org.uk/youth/belong/ describes the
// Foundation's youth loneliness work, carries no application route, and states
// no figure, so the £5,000 to £20,000 on the card came from nowhere on the page.
// Our own verifier said so on 17 August ("fixable_link: wrong_fund") and nothing
// acted on it, because a PUBLISHED row with a full brief is in none of the
// Review Inbox's sections.
//
// Checked across the Foundation's whole fund list on 2026-08-27, nothing there
// is open to an organisation either: Green Opportunities closed after round one,
// Carbon Innovation states there will be no future rounds, Future Communities
// and Young Gamechangers have awarded both their rounds, Lead the Change phase
// one has closed, and systemic change funding is by invitation. The only live
// money is the Funding Futures Programme, which UnLtd runs and awards to
// individual social entrepreneurs rather than organisations.
//
// So the watch goes on /how-we-fund/, the page that would change when a new
// round opens, rather than on the Belong page, which would not.
//
//   npx tsx --env-file=.env.local scripts/withdraw-coop-belong-2026-08-27.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'

const APPLY  = process.argv.includes('--apply')
const BELONG = '8888f9ed-6ea5-49dd-9c96-b4fe632d4bf9'
const INDEX  = 'https://www.coopfoundation.org.uk/how-we-fund/'

async function main() {
  const db = getAdminDb()
  if (!APPLY) console.log('DRY RUN — nothing written. Pass --apply.\n')

  const reason = formatRejectReason(
    'non_funder',
    'The Belong page describes the Foundation’s youth loneliness work, not a fund: no application route, '
    + 'no figure, and the stored £5,000 to £20,000 appears nowhere on it. Verified against the funder’s whole '
    + 'fund list on 2026-08-27, when nothing there was open to an organisation.',
  )

  if (APPLY) {
    const r = await mergeGrantUpdate({
      id: BELONG,
      fields: { is_active: false, pipeline_state: 'rejected', rejection_reason: reason },
      source: 'system:live-and-wrong-2026-08-27',
      db,
    })
    console.log(`Belong: applied [${r.applied.join(', ') || 'nothing'}]`
      + `${r.rejected.length ? ` REJECTED ${JSON.stringify(r.rejected)}` : ''}`)
  } else {
    console.log(`[dry] Belong -> rejected (${reason.slice(0, 60)}…)`)
  }

  // The watchlist is keyed on listing_url, so a second run is a no-op rather
  // than a duplicate.
  if (APPLY) {
    const { error } = await db.from('funder_watchlist').upsert({
      name: 'Co-op Foundation — How we fund',
      listing_url: INDEX,
      notes: 'Added 2026-08-27 when the Belong row was withdrawn. Every Co-op Foundation fund was closed '
           + 'that day, so this page changing is the signal that a new round has opened.',
    }, { onConflict: 'listing_url', ignoreDuplicates: true })
    console.log(error ? `watchlist: FAILED ${error.message}` : `watchlist: watching ${INDEX}`)
  } else {
    console.log(`[dry] watch ${INDEX}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })

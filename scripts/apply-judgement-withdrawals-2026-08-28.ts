// The three remaining judgement withdrawals, and the one row that should replace
// the hole one of them leaves.
//
// The test for this class is not "is the funder real". All three funders are real
// and two are national. It is whether an ORGANISATION CAN ACT ON THE ROW TODAY.
//
//   UK SPORT. I argued to retitle rather than withdraw, and there is no label to
//   retitle to: they invest in governing bodies and athletes on a four-year cycle,
//   there is no application route, and /funding is a 404.
//
//   NESTA. Prizes run by Challenge Works, a separate organisation Nesta owns, at
//   £5m to £40m, with no entry route on the page.
//
//   ARTS COUNCIL OF WALES. Nothing there is called Project Investment. But Wales
//   has eighteen live rows in the whole catalogue, so dropping the national arts
//   funder without replacement is a coverage loss rather than a cleanup — hence
//   the staged row below.
//
// Arts Capital Investment is real, organisation-facing, and shut: "Closing date:
// 3 July 2026", up to £8m for 2026/27 in three tiers. Staged inactive and
// awaiting review, which is where every catalogue addition starts, plus a
// watchlist entry on the funding index so the next round is noticed rather than
// waited for.
//
//   npx tsx --env-file=.env.local scripts/apply-judgement-withdrawals-2026-08-28.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate, stampNewGrant } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'

const APPLY = process.argv.includes('--apply')

const WITHDRAW: { title: string; code: string; why: string }[] = [
  { title: 'UK Sport — National Lottery Awards', code: 'out_of_scope',
    why: 'UK Sport invests directly in national governing bodies and athletes on a four-year cycle: "The primary role of UK Sport is to strategically invest income from The National Lottery and Exchequer to maximise the performance of UK athletes." There is no application route on the page and /funding returns 404, so no organisation using this catalogue can act on the row.' },
  { title: 'Nesta Innovation Challenges — Prize Competitions', code: 'out_of_scope',
    why: 'The prizes are run by Challenge Works, "a not for profit enterprise owned by Nesta", so the funder is wrong, and they are innovation prizes at a scale no small charity competes for: Water Breakthrough Challenge 6 at £40m, Longitude Prize on ALS at £7.5m. The page gives no entry route at all, which is the deciding fact.' },
  { title: 'Arts Council of Wales — Project Investment', code: 'non_funder',
    why: 'Nothing on arts.wales is called Project Investment. Their organisation funding page now points mostly at funds for individuals and at creative learning, and Arts Capital Investment, the organisation-facing fund, closed on 3 July 2026. Staged separately as a between-rounds row rather than renamed into, because renaming turns one fund into another.' },
]

async function main() {
  const db = getAdminDb()
  if (!APPLY) console.log('DRY RUN — nothing written. Pass --apply.\n')

  for (const w of WITHDRAW) {
    const { data } = await db.from('scraped_grants').select('id, title, is_active').eq('title', w.title).limit(1)
    const row = (data as any[])?.[0]
    if (!row) { console.log(`${w.title}: NOT FOUND`); continue }
    if (!row.is_active) { console.log(`${w.title}: already out of view`); continue }
    if (!APPLY) { console.log(`[dry] withdraw ${w.title}`); continue }
    const r = await mergeGrantUpdate({
      id: row.id, db,
      fields: { is_active: false, pipeline_state: 'rejected', rejection_reason: formatRejectReason(w.code, w.why) },
      source: 'system:judgement-withdrawals-2026-08-28',
    })
    console.log(`withdrawn ${w.title}: applied [${r.applied.join(', ') || 'nothing'}]`)
  }

  // The replacement, so Wales does not simply lose its national arts funder.
  const ACI_URL = 'https://arts.wales/funding/organisations/arts-capital-investment'
  if (APPLY) {
    const { data: exists } = await db.from('scraped_grants').select('id').eq('apply_url', ACI_URL).limit(1)
    if ((exists as any[])?.length) {
      console.log('Arts Capital Investment: a row already exists')
    } else {
      const row = stampNewGrant({
        title: 'Arts Council of Wales — Arts Capital Investment',
        funder: 'Arts Council of Wales',
        apply_url: ACI_URL,
        funding_index_url: 'https://arts.wales/funding',
        funding_type: 'grant',
        funder_type: 'government',
        location_tag: 'Wales',
        is_local: true,
        amount_max: 250000,
        is_rolling: false,
        next_open_date: 'Round closed 3 July 2026, next round not yet announced',
        eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated'],
        impact_sectors: ['creative', 'heritage'],
        is_active: false,
        source: 'admin:judgement-withdrawals-2026-08-28',
      }, 'user_verified:judgement-withdrawals-2026-08-28')
      const { error } = await db.from('scraped_grants').insert(row)
      console.log(error ? `Arts Capital Investment: INSERT FAILED ${error.message}`
                        : `Arts Capital Investment: staged as ${row.pipeline_state}, inactive, awaiting your review`)
    }

    // Watch the index rather than the fund page: a new ACW round appears on the
    // funding list first, and migration 057's trigger only ever enrols a row's
    // own apply_url.
    const { error: wErr } = await db.from('funder_watchlist').upsert({
      name: 'Arts Council of Wales — funding index',
      listing_url: 'https://arts.wales/funding',
      notes: 'Added 2026-08-28 when the Project Investment row was withdrawn. Arts Capital Investment closed 3 July 2026; this page changing is how we learn the next round has opened.',
    }, { onConflict: 'listing_url', ignoreDuplicates: true })
    console.log(wErr ? `watchlist: FAILED ${wErr.message}` : 'watchlist: watching arts.wales/funding')
  } else {
    console.log('[dry] stage Arts Capital Investment, inactive, and watch arts.wales/funding')
  }
}

main().catch(e => { console.error(e); process.exit(1) })

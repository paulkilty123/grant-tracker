// First pass on the 51 live rows flagged `fixable_link: wrong_fund`.
//
// All 51 were fetched (scripts/probe-wrong-fund-links-2026-08-21.ts, no API
// spend) and the pile behaved as every pile has: 51 flagged, 4 certainly wrong,
// 2 fixable today.
//
// ─────────────────────────────────────────────────────────────────────────────
// MY OWN PROBE PRODUCED A FALSE FINDING FIRST, WHICH IS THE POINT
//
// The first run reported 11 sites as unfetchable. They were not: READER_PROXY_URL
// is `https://r.jina.ai` with no trailing slash, and the fallback built
// `https://r.jina.aihttps%3A%2F%2F...`, which fetch rejects. All 11 came back
// "0 chars, no detail" — a probe failure wearing the costume of a finding. Fixed,
// re-run, and 10 of the 11 then read fine through the proxy.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THE 51 ACTUALLY ARE
//
//   10  a fundraiser landing there COULD apply — the page names the fund and
//       carries two or more of dates, eligibility, amount, an apply route.
//       Leathersellers', Idlewild, Skinners', Grocers', Baily Thomas, the
//       Vicar's Relief Fund and friends. The flag is wrong on these.
//   26  the page names the fund but carries little detail — mostly a funder's
//       own grants index. Paul, 17 August: "A link landing on a funder's
//       homepage is fine and shouldn't appear as a problem." Not touched.
//    4  certainly wrong. Below.
//   11  my probe could not read them well enough to judge — proxy returned ~490
//       bytes, which is a rate-limit page, not a funder page. Reported as
//       unknown, NOT as broken.
//
// THE FLOOR APPLIES: nothing is cleared here because it "looks fixed". The two
// rows written below were each fetched and read.
//
//   npx tsx --env-file=.env.local scripts/fix-wrong-fund-links-2026-08-21.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-wrong-fund-links-2026-08-21.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:link-triage-2026-08-21'

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const bolton = await db.from('scraped_grants').select('id,title,apply_url')
    .ilike('title', 'Bolton Housing Partnership%').eq('is_active', true).single()
  const tyne = await db.from('scraped_grants').select('id,title,apply_url')
    .ilike('title', 'Improving life chances in Tyne%').eq('is_active', true).single()

  for (const [name, r] of [['Bolton', bolton], ['Tyne & Wear', tyne]] as const) {
    if (r.error || !r.data) { console.log(`ABORT: ${name} row not found — ${r.error?.message}`); process.exit(1) }
    console.log(`${name}: ${r.data.title}\n   now: ${r.data.apply_url}`)
  }

  console.log('\n── 1. Bolton Housing Partnership: pointed at a LOGIN PAGE')
  console.log('   services.boltoncvs.org.uk/user/login returns 327 characters of login form.')
  console.log('   boltoncvs.org.uk/funding/bolton-housing-partnership-grants/ is the real page:')
  console.log('   "The Bolton Housing Partnership Grants ... Contact the Funding Team on')
  console.log('   funding@boltoncvs.org.uk ... Follow these instructions to log in to the')
  console.log('   Grants Dashboard to access our application forms."')
  console.log('   → apply_url corrected, url_status reset to unchecked.')

  console.log('\n── 2. Improving life chances in Tyne & Wear: 404, and GONE from the index')
  console.log('   /grants/reeds-grassroots/ returns 404. The funder\'s current grants index')
  console.log('   lists 17 funds and none of them is this one.')
  console.log('   → url_status set to dead. NOT given a guessed replacement: none of the 17')
  console.log('     is plausibly the same fund, and a wrong link that loads is worse than a')
  console.log('     dead one that does not. The row needs Paul\'s call on removal.')

  if (DRY) { console.log('\nDRY RUN — nothing written.\n'); return }

  const r1 = await mergeGrantUpdate({
    id: bolton.data!.id, fields: { apply_url: 'https://www.boltoncvs.org.uk/funding/bolton-housing-partnership-grants/' },
    source: SOURCE, db,
    citations: { apply_url: { snippet: 'Fetched 2026-08-21. The stored URL was services.boltoncvs.org.uk/user/login, a login form. The corrected page is headed "The Bolton Housing Partnership Grants" and gives the funding team\'s contact details and how to reach the application forms.', confidence: 'high' } },
  })
  console.log(`\nBolton: applied=[${r1.applied.join(', ')}]${r1.rejected?.length ? ` rejected=${JSON.stringify(r1.rejected)}` : ''}`)
  const { error: e1 } = await db.from('scraped_grants')
    .update({ url_status: 'unchecked', url_last_checked: null }).eq('id', bolton.data!.id)
  console.log(e1 ? `   url_status FAILED: ${e1.message}` : '   url_status → unchecked')

  const { error: e2 } = await db.from('scraped_grants')
    .update({ url_status: 'dead', url_last_checked: new Date().toISOString() }).eq('id', tyne.data!.id)
  console.log(e2 ? `Tyne & Wear url_status FAILED: ${e2.message}` : 'Tyne & Wear: url_status → dead (404 verified 2026-08-21)')

  const { data } = await db.from('scraped_grants').select('title,apply_url,url_status,is_active')
    .in('id', [bolton.data!.id, tyne.data!.id])
  console.log('\nverified against the database:')
  for (const r of (data ?? []) as any[]) console.log(`   ${String(r.title).slice(0, 40).padEnd(42)} ${r.url_status.padEnd(10)} ${String(r.apply_url).slice(0, 62)}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

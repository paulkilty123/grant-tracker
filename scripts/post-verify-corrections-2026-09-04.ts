// Two corrections after the verifier read the newsletter batch, 2026-09-04.
//
// SHOOSMITHS — restore £50,000. Earlier today the foundation page was fetched
// and summarised as stating no amount, so the £230,000 we held was nulled at
// admin trust. The verifier then read the same page and quoted "Shoosmiths
// Foundation opens grants of up to £50,000". The figure IS on the page; the
// summariser missed it. Restored at admin trust, because admin is what nulled
// it. The lesson is the one from The Fore and Yapp, one layer on: a summary
// saying "not stated" is not the same as the page not stating it.
//
// AUSTIN AND HOPE PILKINGTON — no change to the income band, and this records
// why. The verifier proposes minimum £100,000 and maximum £1,000,000, quoting
// "**Minimum** operating income : **£100,000**". That is Grant Round 1's box.
// The page carries four rounds with different criteria, read in a browser
// today:
//   Round 1  1-28 Feb   £1,000  income £100,000 to £1,000,000
//   Round 2  1-30 Apr   £5,000  income £1,000,000 and above, no maximum
//   Round 3  1-31 Jul   £1,000  income £100,000 to £1,000,000
//   Round 4  1-30 Sep   £5,000  income £1,000,000 and above, no maximum
// Our row is Round 4, so minimum £1,000,000 and no maximum is right. The
// description now names the round and points smaller charities at rounds 1
// and 3, so a £300,000 charity is not left thinking the trust is closed to
// them.
//
//   npx tsx --env-file=.env.local scripts/post-verify-corrections-2026-09-04.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const SHOOSMITHS = 'f635ceba-ed4a-4d76-8260-fe10bf6adf0e'

async function main() {
  const db = getAdminDb()

  const { data: sh } = await db.from('scraped_grants').select('title, amount_max').eq('id', SHOOSMITHS).single()
  if (!/Shoosmiths/.test(sh?.title ?? '')) throw new Error(`wrong row: ${sh?.title}`)
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}`)
  console.log(`  Shoosmiths amount_max ${sh!.amount_max} -> 50000`)

  const { data: ps } = await db.from('scraped_grants').select('id, title, min_org_income, max_org_income')
    .ilike('title', 'Austin and Hope%').eq('is_active', true)
  if (!ps || ps.length !== 1) throw new Error(`expected 1 Pilkington row, got ${ps?.length}`)
  const pil = ps[0]
  if (pil.min_org_income !== 1000000 || pil.max_org_income !== null) {
    throw new Error(`Pilkington income band changed unexpectedly: ${pil.min_org_income} / ${pil.max_org_income}`)
  }
  console.log(`  Pilkington income band ${pil.min_org_income} / ${pil.max_org_income} kept; description names the round`)
  if (!APPLY) return

  const a = await mergeGrantUpdate({
    id: SHOOSMITHS,
    fields: { amount_max: 50000 },
    source: 'admin:paulkilty1@gmail.com', pinned: true, db,
    citations: { amount_max: { snippet: 'Shoosmiths Foundation opens grants of up to £50,000', confidence: 'high' } },
  })
  console.log('  Shoosmiths applied:', a.applied.join(', ') || 'nothing')

  const b = await mergeGrantUpdate({
    id: pil.id,
    fields: {
      description: 'Grants of £5,000 to registered UK charities for work focused exclusively on unpaid adult carers aged 18 or over. This is Grant Round 4, which runs from 1 to 30 September 2026 and is for larger charities: minimum operating income and expenditure of £1 million, with no maximum. The trust runs four rounds a year and rounds 1 and 3 award £1,000 to charities with income between £100,000 and £1 million; round 1 of 2027 opens on 1 February with a new theme of reducing loneliness for people aged 60 and over.',
    },
    source: 'user_verified:newsletter-batch-2026-09-04', db,
    citations: { description: { snippet: 'Grant Round 4 Application Period 1st - 30th September Amount £5,000 Eligibility Minimum operating income: £1,000,000. Minimum operating expenditure: £1,000,000. There is no maximum income or expenditure.', confidence: 'high' } },
  })
  console.log('  Pilkington applied:', b.applied.join(', ') || 'nothing')
}
main().catch(e => { console.error(e); process.exit(1) })

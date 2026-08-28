// The timing rows in Live and wrong, worked one at a time against the funder's
// own page. Three outcomes, and they are all different, which is why this is not
// a bulk rule.
//
// HAMPSHIRE & IOW — INCLUDING COMMUNITIES. We carried 28 September 2027. The
// page says "Opening date: 1st September. Closing date: 28th September" for the
// round running NOW. The year was a year out, so a fund that closes in four
// weeks was reading as a fund closing next year.
//
// HS2 CEF/BLEF. We carried 31 March 2035 and the government grants page really
// does print that as the closing date: it is the programme's end, not a round's.
// A user reading "closes 2035" learns nothing, so the row goes rolling and the
// 2035 date is recorded as what it is in the citation.
//
// A SINCLAIR HENDERSON TRUST. Left alone deliberately. Our 31 May 2028 looks
// absurd and is correct: "Trustees meet once every even year i.e. 2024, 2026,
// 2028... The next meeting will be in June 2028. Applications should be received
// by the previous month." The 12-month horizon check cannot express a biennial
// funder, so the row stays flagged and the page's sentence is stamped on it so
// the next reviewer sees in one line why it is fine.
//
// OXFORDSHIRE — SKILLS FOR IMPACT. The page says "** Coming autumn 2026 **", so
// it is between rounds rather than delisted. Out of view, funder watched.
//
//   npx tsx --env-file=.env.local scripts/fix-timing-rows-2026-08-28.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { recordFieldEvidence } from '../src/lib/field-evidence'

const APPLY = process.argv.includes('--apply')
const NOW   = '2026-08-28T00:00:00.000Z'

const HIWCF  = 'ba1ec7ab-1f63-4102-9f36-a1efa578ae52'
const HS2    = '5700594e-ce98-46ea-9818-ce87e5f44286'
const SINCL  = '1d6af16c-0060-45b4-8f1e-051888785890'
const OXFORD = '4893f613-ae25-4121-9406-5f70d965e667'

const Q = {
  hiwcf: 'Including Communities - OPEN. Opening date: 1st September. Closing date: 28th September. Grant size: £1,000 – £10,000. Location: Hampshire, Portsmouth, Southampton, and the Isle of Wight.',
  hs2:   'Opening date: 8 March 2017, 12:01am. Closing date: 31 March 2035, 11:59pm. The date is the programme’s end rather than a round’s closing date.',
  sincl: 'Trustees meet once every even year i.e. 2024, 2026, 2028. Applications should be received by the previous month. The next meeting will be in June 2028.',
} as const

async function main() {
  const db = getAdminDb()
  if (!APPLY) console.log('DRY RUN — nothing written. Pass --apply.\n')

  const step = async (what: string, id: string, fields: Record<string, unknown>, source: string, citations?: Record<string, { snippet: string; confidence: 'high' | 'med' | 'low' }>) => {
    if (!APPLY) { console.log(`[dry] ${what}: ${Object.keys(fields).join(', ')}`); return }
    const r = await mergeGrantUpdate({ id, db, fields, source, citations })
    console.log(`${what}: applied [${r.applied.join(', ') || 'nothing'}]`
      + `${r.rejected.length ? ` REJECTED ${JSON.stringify(r.rejected)}` : ''}`)
  }

  await step('Including Communities deadline', HIWCF,
    { deadline: '2026-09-28' }, 'user_verified:timing-2026-08-28',
    { deadline: { snippet: Q.hiwcf, confidence: 'high' } })

  await step('HS2 CEF/BLEF is a programme, not a round', HS2,
    { deadline: null, is_rolling: true }, 'user_verified:timing-2026-08-28',
    { deadline: { snippet: Q.hs2, confidence: 'high' }, is_rolling: { snippet: Q.hs2, confidence: 'high' } })

  await step('Skills for Impact between rounds', OXFORD,
    { is_active: false, pipeline_state: 'between_rounds_scheduled', next_open_date: 'Autumn 2026' },
    'system:timing-2026-08-28')

  // No value change, only the sentence that explains the value. A biennial
  // funder is not a defect and the horizon check cannot say so.
  if (APPLY) {
    const e = await recordFieldEvidence({
      id: SINCL, db,
      patch: { deadline: { quote: Q.sincl, source_url: 'https://funding.scot/funds/a0Rb0000003iiAXEAY/a-sinclair-henderson-trust', checked_at: NOW, by: 'admin:timing-2026-08-28', agrees: true } } as never,
    })
    console.log(`A Sinclair Henderson: stamped [${e.stamped.join(', ')}] (row unchanged, still flagged)`)
  } else {
    console.log('[dry] A Sinclair Henderson: evidence only, row unchanged')
  }
}

main().catch(e => { console.error(e); process.exit(1) })

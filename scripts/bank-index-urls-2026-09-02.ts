// Bank the funder's index URL on the live rows whose link lands on the funder's
// grants listing, so the 17 August front-door rule applies to them and they
// stop counting as Live and wrong. No page reads, no model call.
//
// Paul, 2026-09-02: "Bank the index URL for the straightforward listing
// landings now, it's observation not judgement." Observation, so the test is
// the URL path itself: a section index (/grants/, /our-funding/, /programmes/,
// /funds, a foundation home) and not a page named after one fund. The six
// left out below are pages named after the fund itself, where the engine's
// "describes a different fund" verdict is a question about the page, not the
// link, and needs a read.
//
// Writes funding_index_url = apply_url on the row. Untracked field, so the
// merge stamps no provenance; the source is still named for the audit log.
//
//   npx tsx --env-file=.env.local scripts/bank-index-urls-2026-09-02.ts          dry run
//   APPLY=1 npx tsx --env-file=.env.local scripts/bank-index-urls-2026-09-02.ts  write

import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { deriveReviewReasons, type ReviewRow } from '../src/lib/admin/review-reasons'
import { gateDecision } from '../src/lib/admin/publish-gate'

const APPLY  = process.env.APPLY === '1'
const SOURCE = 'user_verified:index-bank-2026-09-02'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/** Listing landings: the path is a section, not a fund. */
const BANK: Record<string, string> = {
  'National Archives - Project Grants':                        'https://www.nationalarchives.gov.uk/archives-sector/grants-and-funding/',
  'Grants for Organisations (Gateway, Project & Core)':        'https://www.richmondfoundation.org.uk/our-funding/apply/',
  'Cadent Foundation — Community Grants':                      'https://cadentgas.com/foundation',
  'The Pebble Trust':                                          'https://www.pebbletrust.org/donations',
  'Hyde Foundation Community Investment':                      'https://www.hyde-housing.co.uk/hyde-foundation/',
  'East Midlands Airport Community Fund Grant':                'https://www.eastmidlandsairport.com/community/supporting-the-local-community/',
  'Crowdfunder — Match Funding':                               'https://www.crowdfunder.co.uk/funds',
  'Open Grants Programmes':                                    'https://cfmerseyside.org.uk/our-grants?grant-category=open#grants',
  'Community Foundation Wales — Grants Hub':                   'https://communityfoundationwales.org.uk/grants-overview/',
  'Historic England — Listed Places of Worship Grant Scheme':  'https://historicengland.org.uk/advice/grants/what-we-fund/',
  'Ernest Kleinwort Charitable Trust — Small Grants':          'https://ekct.org.uk/grants/',
  'SSE Start Up Programme':                                    'https://www.the-sse.org/programmes/',
  'Swire Charitable Trust — Core Grant Programme':             'https://www.swirecharitabletrust.org.uk/our-funding/',
  'HDH Wills Charitable Trust':                                'https://hdhwills.org/grants/',
  'Pilgrim Trust — Preservation & Scholarship':                'https://thepilgrimtrust.org.uk/grants/',
  'Community Energy GO!':                                      'https://www.cse.org.uk/my-community/',
  'NHS Charities Together — Community Grants':                 'https://nhscharitiestogether.co.uk/about-us/our-programmes/',
}

/** Pages named after a fund. Not banked: whether the page is about this row's
 *  fund is a reading question, left for after the 11th. */
const NOT_BANKED = [
  'Community Shares — Booster Fund',
  'HAPi & Matched Funding',
  'VCSE Contract Readiness Programme',
  'Historic England — Heritage at Risk Grants',
  'Catch22 — GoodTech Ventures Accelerator',
  'AF3: Supporting Partners programme',
]

async function main() {
  const titles = Object.keys(BANK)
  const { data, error } = await db.from('scraped_grants').select('*').in('title', titles).eq('is_active', true)
  if (error) throw new Error(error.message)
  const rows = data ?? []
  if (rows.length !== titles.length) {
    const found = new Set(rows.map(r => r.title))
    throw new Error(`expected ${titles.length} live rows, got ${rows.length}; missing: ${titles.filter(t => !found.has(t)).join(' | ')}`)
  }
  let banked = 0
  for (const r of rows) {
    const want = BANK[r.title]
    const before = gateDecision(r as ReviewRow).outcome
    if (r.apply_url !== want) throw new Error(`${r.title}: apply_url is ${r.apply_url}, expected ${want}`)
    if (r.funding_index_url) throw new Error(`${r.title}: already carries an index ${r.funding_index_url}`)
    const after = gateDecision({ ...(r as ReviewRow), funding_index_url: want }).outcome
    console.log(`  ${r.title}: ${before} → ${after}`)
    if (after === 'attention') throw new Error(`${r.title}: banking the index does not clear it, something else blocks`)
    if (!APPLY) continue
    const res = await mergeGrantUpdate({ id: r.id, fields: { funding_index_url: want }, source: SOURCE, db })
    if (!res.applied.includes('funding_index_url')) throw new Error(`${r.title}: not applied ${JSON.stringify(res.rejected)}`)
    banked++
  }
  console.log(`\nnot banked (fund-named pages, need a read): ${NOT_BANKED.length}`)
  for (const t of NOT_BANKED) console.log(`  ${t}`)
  if (!APPLY) { console.log('\nDRY RUN, nothing written. APPLY=1 to write.'); return }
  console.log(`\nLANDED: ${banked} rows now carry funding_index_url = apply_url`)
  // Re-derive from the database, not from memory.
  const { data: after } = await db.from('scraped_grants').select('*').in('title', titles)
  const stillWrong = (after ?? []).filter(r => gateDecision(r as ReviewRow).outcome === 'attention')
  console.log(`still Live and wrong among them: ${stillWrong.length}`)
  for (const r of stillWrong) console.log(`  ${r.title}: ${deriveReviewReasons(r as ReviewRow).map(x => x.code).join(', ')}`)
}
main().catch(e => { console.error(e.message); process.exit(1) })

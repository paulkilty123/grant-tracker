// Second publish batch, plus one title that read as an advert.
//
// The selector now applies the test the first batch lacked: a stored `agrees:
// false` is re-compared against what the row holds NOW, because those stamps are
// frozen at read time and a dispute settled by a later write still reads as a
// dispute. Ten rows clear it. Six are published here.
//
// HELD BACK, and why, because "ten ready" was not the whole story:
//
//   Ufi VocTech Ignite            is_invite_only. "By invitation only.
//   Baring Intl Development       Organisations that have previously submitted
//                                 an unsuccessful application..." Legitimate to
//                                 carry so a fundraiser knows it exists, but
//                                 whether it belongs in front of people is Paul's
//                                 call, not a script's.
//
//   Passionate About Realising    Checked as a suspected duplicate of the plainer
//   Potential in environmental/   row of the same name. It is not: different URL,
//   green careers                 different amounts, different purpose. Left for
//                                 the next batch rather than published on the
//                                 strength of a check that came out negative.
//
// RENAMED: "Small grants of up to £5k available via The Grocers' Charity" is a
// sentence, not a name. On a card, beside "National Churches Trust — Large
// Grants", it reads like an advert someone pasted in. The title is what a
// fundraiser scans; it should say which funder and which fund.
//
//   npx tsx --env-file=.env.local scripts/publish-second-batch-2026-08-20.ts --dry
//   npx tsx --env-file=.env.local scripts/publish-second-batch-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { deriveReviewReasons, type ReviewRow } from '../src/lib/admin/review-reasons'
import { gateDecision } from '../src/lib/admin/publish-gate'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:second-publish-2026-08-20'

const RENAME = [{
  from: "Small grants of up to £5k available via The Grocers' Charity",
  to: "The Grocers' Charity — Small Grants",
  why: "The stored title was a sentence rather than a name. The funder is The Grocers' Charity and the fund is its small grants programme, up to £5,000 for UK charities with turnover of £500,000 or less.",
}]

const PUBLISH = [
  'National Churches Trust — Large Grants',
  'Resonance Community Developers (RCD)',
  'Resonance Enterprise Investment (REI) Fund',
  'Social Investment Fund for London',
  'Somerset Crisis and Resilience Alliance',
  'LNER Customer & Community Investment Fund',
]

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const today = new Date().toISOString().slice(0, 10)

  console.log('── renames')
  for (const r of RENAME) {
    const { data } = await db.from('scraped_grants').select('id, title').eq('title', r.from).limit(1)
    if (!data?.length) { console.log(`   NOT FOUND: ${r.from.slice(0, 50)}`); continue }
    console.log(`   "${r.from.slice(0, 52)}"\n     → "${r.to}"`)
    if (DRY) continue
    const res = await mergeGrantUpdate({
      id: data[0].id, fields: { title: r.to }, source: SOURCE, db,
      citations: { title: { snippet: r.why, confidence: 'high' } },
    })
    if (!res.applied.includes('title')) console.log(`     REFUSED: ${JSON.stringify(res.rejected)}`)
  }

  const { data, error } = await db.from('scraped_grants').select('*').in('title', PUBLISH)
  if (error) { console.error('query failed:', error.message); process.exit(1) }
  const rows = (data ?? []) as unknown as (ReviewRow & { pipeline_state: string; is_active: boolean | null; funder: string | null })[]
  if (rows.length !== PUBLISH.length) {
    console.error(`\nABORT: matched ${rows.length} of ${PUBLISH.length}. A short match is what a wrong title returns.`)
    process.exit(1)
  }

  console.log('\n── publishing')
  for (const r of rows) {
    const gate = gateDecision(r, deriveReviewReasons(r, today))
    if (gate.blocking.length) {
      console.error(`ABORT: ${r.title} picked up a blocking reason — ${gate.blocking.map(b => b.code).join(', ')}`)
      process.exit(1)
    }
    console.log(`   ${String(r.title).slice(0, 50).padEnd(52)} ${r.funder ?? '—'}`)
  }
  if (DRY) { console.log('\nDRY RUN — nothing written.\n'); return }

  let published = 0
  for (const r of rows) {
    const res = await mergeGrantUpdate({
      id: r.id, fields: { pipeline_state: 'published', is_active: true }, source: SOURCE, db,
      citations: { pipeline_state: { snippet: `Second hand-checked publish batch, ${today}. No field its funder's page disputes, page read by the engine, brief written this year.`, confidence: 'high' } },
    })
    if (res.applied.length) published++
  }

  const { data: after } = await db.from('scraped_grants').select('title, is_active, pipeline_state').in('title', PUBLISH)
  console.log(`\npublished: ${published}/${rows.length}`)
  const notLive = (after ?? []).filter(a => !(a as { is_active: boolean }).is_active)
  console.log(`not live afterwards: ${notLive.length}`)
  for (const n of notLive) console.log(`   ${(n as { title: string }).title}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

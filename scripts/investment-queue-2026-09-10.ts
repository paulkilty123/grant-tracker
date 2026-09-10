/**
 * Investment queue clear, step one of docs/investment-breadth-proposal-2026-09-10.md.
 * Dry by default; --apply writes. Every page below was read on 2026-09-10 by
 * this session, independently of the provider walk that staged the rows.
 *
 * PUBLISH (2): Big Issue Invest equity and revenue participation, Key Fund
 *   Regional Growth Fund. Paul, 2026-09-10: the three Charity Bank rows (loans
 *   from £500,000 to £7.5 million) are big loans for larger organisations and
 *   stay in the queue unpublished. Field corrections are written
 *   first, then the row goes live.
 * REJECT (2): the BGV captured duplicate; the Social Investment Cymru row that
 *   points at the Good Finance directory while WCVA's own fund is live.
 * BETWEEN ROUNDS (1): BGV Tech for Good, Autumn 2026 closed, two cohorts a year,
 *   no date on the page, so the page goes on the watchlist.
 * HOLD for Paul (1): Resonance Housing Pathways, the applicant gets leased homes,
 *   not finance. Recommendation: reject. Not touched here.
 * LEFT (1): ROCB, dead URL, belongs to the homepage re-check in step three.
 */
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import * as fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
const envVar = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))![1].trim()
const db = createClient(envVar('NEXT_PUBLIC_SUPABASE_URL'), envVar('SUPABASE_SERVICE_ROLE_KEY'))
const SOURCE = 'user_verified:investment-queue-2026-09-10' as never
const APPLY = process.argv.includes('--apply')

const PUBLISH: { id: string; title: string; fields: Record<string, unknown>; note: string }[] = [
  { id: 'e8c9b8eb-1d9d-4e2b-b433-580050406796', title: 'Big Issue Invest Equity and Revenue Participation',
    fields: { sectors: ['social_economy', 'social_innovation'] },
    note: 'page: "between £150,000 and £450,000 however we do offer up to £750,000"; equity CLS only, revenue participation for trading companies; structures already exclude charities' },
  { id: 'f3f9a63e-d1a8-45dc-9c4b-31e5d407fb8c', title: 'Key Fund Regional Growth Fund',
    fields: { location_tag: 'North of England & Midlands', is_local: true, sectors: ['employment', 'social_economy', 'community'] },
    note: 'page: "Investments up to £150k", "not restricted to social or community focused organisations"; region not on the page, taken from Key Fund\'s operating area as on its live sibling rows' },
]

const REJECT = [
  { id: '1552ded8-3b6e-4d74-8303-c8c0900cc4f3', title: 'BGV Accelerator Programme',
    reason: 'duplicate: same programme as the tagged row 3e386cdc, Tech for Good Programme; this copy carries a stale £30,000 ticket where the page says £60,000. Withdrawn 2026-09-10.' },
  { id: '829751a6-9ad0-409a-818c-e32d62f0d1ad', title: 'Social Investment Cymru Loan Fund',
    reason: 'directory_not_a_fund: points at the Good Finance investor directory, not a fund page. WCVA Social Investment Cymru Communities Investment Fund is live; SI Cymru\'s other products are a front-door split for the provider walk. Withdrawn 2026-09-10.' },
]

const BETWEEN = { id: '3e386cdc-60ab-413e-a348-11f659d3e4fb', title: 'Tech for Good Accelerator Programme',
  fields: { pipeline_state: 'between_rounds_scheduled', is_active: false, funding_subtypes: ['equity'],
    next_open_date: 'Applications for Autumn 2026 closed; two cohorts a year, next intake not dated on the page' },
  watch: { name: 'Bethnal Green Ventures', listing_url: 'https://www.bethnalgreenventures.com/apply', region: 'national', funder_type: 'trust_foundation', status: 'active', notes: 'Enrolled 2026-09-10 on entering between_rounds_scheduled: BGV dates no intake on the page, so the page is the only signal.' } }

;(async () => {
  const ids = [...PUBLISH.map(p => p.id), ...REJECT.map(r => r.id), BETWEEN.id]
  const { data: rows, error } = await db.from('scraped_grants').select('id,title,pipeline_state,is_active,deadline,apply_url').in('id', ids)
  if (error) throw new Error(error.message)
  if (rows!.length !== ids.length) throw new Error(`expected ${ids.length} rows, found ${rows!.length}`)
  for (const p of PUBLISH) {
    const r = rows!.find(x => x.id === p.id)!
    if (r.pipeline_state !== 'tagged_awaiting_review') throw new Error(`${p.title}: state ${r.pipeline_state}, expected tagged_awaiting_review`)
    if (r.deadline && r.deadline <= '2026-09-10') throw new Error(`${p.title}: past deadline ${r.deadline}`)
  }
  // Precondition on the one number this script changes on the page's word.
  const html = await (await fetch('https://www.charitybank.org/loans/energy-efficiency-programme/', { headers: { 'user-agent': 'Mozilla/5.0 Chrome/124' } })).text()
  if (!/7\.5\s*million/i.test(html)) throw new Error('energy efficiency page no longer says 7.5 million; stop')
  console.log(`energy page: says 7.5 million = yes; says 500,000 = ${/500,000|£500k/i.test(html) ? 'YES (keep the minimum!)' : 'no'}`)

  console.log(`\n${APPLY ? 'APPLY' : 'DRY'}: ${PUBLISH.length} publish, ${REJECT.length} reject, 1 between rounds`)
  for (const p of PUBLISH) console.log(`  publish  ${p.title}\n           ${JSON.stringify(p.fields)}\n           ${p.note}`)
  for (const r of REJECT) console.log(`  reject   ${r.title}\n           ${r.reason}`)
  console.log(`  between  ${BETWEEN.title} + watchlist ${BETWEEN.watch.listing_url}`)
  if (!APPLY) return

  const report = (t: string, res: { applied: unknown; rejected: { reason: string }[] }) => {
    const bad = res.rejected.filter(x => x.reason !== 'idempotent')
    console.log(`  done ${t}${bad.length ? `  REJECTED ${JSON.stringify(bad)}` : ''}`)
  }
  for (const p of PUBLISH) {
    report(p.title + ' fields', await mergeGrantUpdate({ id: p.id, fields: p.fields, source: SOURCE, db }))
    report(p.title + ' publish', await mergeGrantUpdate({ id: p.id, fields: { is_active: true, pipeline_state: 'published' }, source: SOURCE, db }))
  }
  for (const r of REJECT) report(r.title, await mergeGrantUpdate({ id: r.id, fields: { pipeline_state: 'rejected', rejection_reason: r.reason, is_active: false }, source: SOURCE, db }))
  report(BETWEEN.title, await mergeGrantUpdate({ id: BETWEEN.id, fields: BETWEEN.fields, source: SOURCE, db }))
  const { data: existing } = await db.from('funder_watchlist').select('id').eq('listing_url', BETWEEN.watch.listing_url)
  if (existing?.length) console.log('  watchlist: already enrolled')
  else { const { error: we } = await db.from('funder_watchlist').insert(BETWEEN.watch); console.log(`  watchlist: ${we ? 'FAILED ' + we.message : 'enrolled'}`) }

  const { data: after } = await db.from('scraped_grants').select('title,is_active,pipeline_state').in('id', ids)
  const live = after!.filter(r => r.is_active && r.pipeline_state === 'published').length
  console.log(`\nend state: ${live} live (expected 2), ${after!.filter(r => r.pipeline_state === 'rejected').length} rejected (expected 2), ${after!.filter(r => r.pipeline_state === 'between_rounds_scheduled').length} between rounds (expected 1)`)
})()

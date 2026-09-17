// Prove the launch bar against production: the probe must see a 200 on a live page (else the run is void),
// the hidden sample must all answer 404 or 410, and the two DB numbers are re-derived a second way.
// DB reads and public-page fetches only. No model call.
//
//   npx tsx scripts/prove-launch-bar-2026-09-01.ts
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { sampleHiddenRows, probeReachability, publicGrantUrl, countLaunchInvariants } from '../src/lib/admin/launch-bar'
import { deriveReviewReasons, type ReviewRow } from '../src/lib/admin/review-reasons'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const ORIGIN = 'https://www.shootsfunding.co.uk'

async function main() {
  const { hidden, canary } = await sampleHiddenRows(db)
  console.log(`sample: ${hidden.length} hidden rows, canary = ${canary?.title} (${canary?.pipeline_state}, active=${canary?.is_active})`)
  if (hidden.length !== 12) { console.error('PRECONDITION: expected 12 hidden rows in the sample'); process.exit(2) }
  for (const r of hidden) console.log(`   ${String(r.pipeline_state).padEnd(24)} active=${String(r.is_active).padEnd(5)} ${publicGrantUrl(ORIGIN, r)}  ${r.title}`)

  const res = await probeReachability({ hidden, canary, origin: ORIGIN })
  console.log('\ncanary:', res.canary?.status, res.canaryOk ? 'OK' : 'VOID')
  console.log('checked', res.checked, 'reachable', res.reachable.length, 'unexpected', res.unexpected.length, 'unchecked', res.unchecked)
  for (const h of res.reachable) console.log('  REACHABLE', h)
  for (const h of res.unexpected) console.log('  unexpected', h)

  // The alarm has to fire. Point the SAME fetch at a live page and see it counted.
  // The guard refuses a visible row in the sample, so the engineered case is the canary
  // itself: it is a 200 the probe must recognise as one.
  if (!res.canaryOk) { console.error('the probe cannot see a 200 on a live page; the run is void'); process.exit(3) }

  // Second derivation of the DB numbers, straight from SQL rather than from reasons.
  const today = new Date().toISOString().slice(0, 10)
  const { count: past } = await db.from('scraped_grants').select('id', { count: 'exact', head: true })
    .eq('is_active', true).not('pipeline_state', 'in', '("rejected","archived")').lt('deadline', today)
  console.log(`\nSQL: live rows with deadline < ${today}: ${past}`)

  // And the two numbers the way the page derives them, off the reasons.
  const live: ReviewRow[] = []
  for (let from = 0; from < 5000; from += 500) {
    const { data, error } = await db.from('scraped_grants').select('*')
      .eq('is_active', true).not('pipeline_state', 'in', '("rejected","archived")').order('id').range(from, from + 499)
    if (error) throw new Error(error.message)
    live.push(...((data ?? []) as ReviewRow[]))
    if ((data ?? []).length < 500) break
  }
  const counts = countLaunchInvariants(live.map(r => deriveReviewReasons(r)))
  console.log(`reasons over ${live.length} live rows: past deadline ${counts.pastDeadline}, unsupported figure ${counts.unsupportedFigure}`)
}
main()

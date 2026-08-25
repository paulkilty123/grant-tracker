/**
 * How big is the 50–54 band?
 *
 * The dashboard buckets "worth exploring" at >= 50; MATCH_FLOOR is 55 and the
 * deadlines page uses it. So a row scoring 50–54 is counted on the dashboard
 * headline and absent from the surfaces the user clicks into. This measures how
 * many rows actually fall in that gap, per organisation.
 *
 * DB reads only. No Anthropic calls.
 * Usage: npx tsx scripts/measure-threshold-band.ts
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import path from 'path'
import { computeMatchScore, MATCH_FLOOR } from '../src/lib/matching'
import { normaliseScrapedGrant } from '../src/lib/grants-normalise'
import type { Organisation } from '../src/types'

for (const line of readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const today = new Date().toISOString().split('T')[0]
  const { data: rows } = await db.from('grants_with_funder').select('*')
    .eq('is_active', true).neq('url_status', 'dead')
    .or(`is_rolling.eq.true,deadline.is.null,deadline.gte.${today},next_open_date_parsed.gte.${today}`)
    .limit(2000)
  const grants = (rows ?? []).map(r => normaliseScrapedGrant(r as Record<string, unknown>))
  const { data: orgs } = await db.from('organisations').select('*')

  let totActionable = 0, totBand = 0, orgsAffected = 0
  const worst: { name: string; actionable: number; band: number; pct: number }[] = []

  for (const org of (orgs ?? []) as Organisation[]) {
    let actionable = 0, band = 0
    for (const g of grants) {
      let s: number
      try { s = computeMatchScore(g, org).score } catch { continue }
      if (s >= 50) actionable++
      if (s >= 50 && s < MATCH_FLOOR) band++
    }
    totActionable += actionable; totBand += band
    if (band > 0) orgsAffected++
    worst.push({ name: org.name ?? '(unnamed)', actionable, band, pct: actionable ? (band / actionable) * 100 : 0 })
  }

  console.log(`MATCH_FLOOR = ${MATCH_FLOOR}, dashboard buckets at 50\n`)
  console.log(`orgs                          ${worst.length}`)
  console.log(`orgs with rows in the band    ${orgsAffected}`)
  console.log(`total "you can apply for"     ${totActionable}`)
  console.log(`of those, in the 50-${MATCH_FLOOR - 1} band     ${totBand}  (${((totBand / (totActionable || 1)) * 100).toFixed(1)}%)`)
  console.log('\nworst affected organisations')
  for (const w of worst.sort((a, b) => b.pct - a.pct).slice(0, 8)) {
    console.log(`  ${w.name.slice(0, 30).padEnd(32)} ${String(w.band).padStart(3)} of ${String(w.actionable).padStart(3)}  ${w.pct.toFixed(0)}%`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })

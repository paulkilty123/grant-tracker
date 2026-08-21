/**
 * What would a single match floor actually change?
 *
 * Five surfaces each hardcode their own idea of "a match": the onboarding
 * reveal (>=40, grants only), Find Funding (>=50, all types), and the
 * dashboard, projects and deadlines pages (>=55). This scores every real
 * organisation against every live grant ONCE, then counts what each candidate
 * floor would show, so the choice is made against numbers rather than in the
 * abstract.
 *
 * DB reads only. No Anthropic calls, nothing written.
 *
 * Usage: npx tsx scripts/measure-match-thresholds.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import path from 'path'
import { computeMatchScore } from '../src/lib/matching'
import { normaliseScrapedGrant } from '../src/lib/grants-normalise'
import type { Organisation } from '../src/types'

for (const line of readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const FLOORS = [40, 50, 55, 65] as const
const median = (xs: number[]) => {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const i = Math.floor(s.length / 2)
  return s.length % 2 ? s[i] : Math.round((s[i - 1] + s[i]) / 2)
}

async function main() {
  const today = new Date().toISOString().split('T')[0]

  // The same row set the surfaces load.
  const { data: rows, error: gErr } = await db
    .from('grants_with_funder')
    .select('*')
    .eq('is_active', true)
    .neq('url_status', 'dead')
    .or(`is_rolling.eq.true,deadline.is.null,deadline.gte.${today},next_open_date_parsed.gte.${today}`)
    .limit(2000)
  if (gErr) throw gErr

  const grants = (rows ?? []).map(r => normaliseScrapedGrant(r as Record<string, unknown>))
  const isGrantType = (g: { fundingType?: string | null }) =>
    g.fundingType === 'grant' || !g.fundingType

  const { data: orgs, error: oErr } = await db.from('organisations').select('*')
  if (oErr) throw oErr

  console.log(`orgs: ${orgs?.length ?? 0}   live rows: ${grants.length}   ` +
              `(${grants.filter(isGrantType).length} grant, ${grants.filter(g => !isGrantType(g)).length} other)\n`)

  // org -> every score, computed once
  const perOrg: { name: string; grantScores: number[]; allScores: number[] }[] = []

  for (const org of (orgs ?? []) as Organisation[]) {
    const grantScores: number[] = []
    const allScores: number[] = []
    for (const g of grants) {
      let score: number
      try {
        score = computeMatchScore(g, org).score
      } catch {
        continue // a row the matcher cannot handle should not skew the count
      }
      allScores.push(score)
      if (isGrantType(g)) grantScores.push(score)
    }
    perOrg.push({ name: org.name ?? '(unnamed)', grantScores, allScores })
  }

  const countAt = (xs: number[], floor: number) => xs.filter(s => s >= floor).length

  console.log('FLOOR  SCOPE        median/org   mean/org   orgs seeing ZERO')
  console.log('─────────────────────────────────────────────────────────────')
  for (const floor of FLOORS) {
    for (const scope of ['grants only', 'all types'] as const) {
      const counts = perOrg.map(o =>
        countAt(scope === 'grants only' ? o.grantScores : o.allScores, floor))
      const zeros = counts.filter(c => c === 0).length
      const mean = counts.reduce((a, b) => a + b, 0) / (counts.length || 1)
      console.log(
        String(floor).padEnd(6) +
        scope.padEnd(13) +
        String(median(counts)).padStart(8) +
        String(mean.toFixed(1)).padStart(11) +
        `        ${zeros} of ${counts.length}`,
      )
    }
  }

  // The onboarding failure mode is an org seeing zero on its very first screen.
  console.log('\nOrgs that would see ZERO on the onboarding reveal:')
  for (const floor of FLOORS) {
    const zeroGrants = perOrg.filter(o => countAt(o.grantScores, floor) === 0)
    const zeroAll    = perOrg.filter(o => countAt(o.allScores, floor) === 0)
    console.log(`  floor ${floor}: ${zeroGrants.length} grants-only  ->  ${zeroAll.length} if all types counted`)
  }

  console.log('\nPer-org, at the two floors that matter (all types):')
  console.log('ORG'.padEnd(38) + '>=50'.padStart(6) + '>=55'.padStart(6) + '   grants-only >=55')
  for (const o of [...perOrg].sort((a, b) => countAt(b.allScores, 55) - countAt(a.allScores, 55))) {
    console.log(
      o.name.slice(0, 36).padEnd(38) +
      String(countAt(o.allScores, 50)).padStart(6) +
      String(countAt(o.allScores, 55)).padStart(6) +
      String(countAt(o.grantScores, 55)).padStart(18),
    )
  }
}

main().catch(e => { console.error(e); process.exit(1) })

/**
 * Where does one organisation lose its match points?
 *
 * Scores a named org against every live row and averages each of the six
 * dimensions, next to a comparison org. The dimension whose share collapses is
 * the one to fix — usually in the PROFILE rather than the matcher.
 *
 * DB reads only. No Anthropic calls, nothing written.
 *
 * Usage: npx tsx scripts/diagnose-org-match.ts "ASP Belong" "Lewisham Donation Hub"
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

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const DIMS = ['location', 'themes', 'beneficiaries', 'grantSize', 'funderType', 'eligibility'] as const

async function main() {
  const names = process.argv.slice(2)
  if (names.length === 0) throw new Error('pass at least one org name')

  const today = new Date().toISOString().split('T')[0]
  const { data: rows } = await db.from('grants_with_funder').select('*')
    .eq('is_active', true).neq('url_status', 'dead')
    .or(`is_rolling.eq.true,deadline.is.null,deadline.gte.${today},next_open_date_parsed.gte.${today}`)
    .limit(2000)
  const grants = (rows ?? []).map(r => normaliseScrapedGrant(r as Record<string, unknown>))

  for (const name of names) {
    const { data: orgs } = await db.from('organisations').select('*').ilike('name', name).limit(1)
    const org = (orgs ?? [])[0] as Organisation | undefined
    if (!org) { console.log(`\n${name}: NOT FOUND`); continue }

    const sums: Record<string, { got: number; max: number; n: number }> = {}
    const elig: Record<string, number> = {}
    const scores: number[] = []
    let capped44 = 0

    for (const g of grants) {
      let r
      try { r = computeMatchScore(g, org) } catch { continue }
      scores.push(r.score)
      if (r.score === 44) capped44++
      elig[r.eligibilityStatus] = (elig[r.eligibilityStatus] ?? 0) + 1
      for (const d of DIMS) {
        const b = (r.breakdown as unknown as Record<string, { score: number; max: number } | undefined>)[d]
        if (!b) continue
        sums[d] ??= { got: 0, max: 0, n: 0 }
        sums[d].got += b.score; sums[d].max += b.max; sums[d].n++
      }
    }

    const o = org as Organisation & { geographic_reach?: string | null }
    console.log(`\n══ ${org.name} ══`)
    console.log(`structure=${org.legal_structure}  reach=${o.geographic_reach}  location=${org.primary_location}  income=${org.annual_income_band ?? 'null'}`)
    console.log(`scored ${scores.length} rows · mean ${(scores.reduce((a, b) => a + b, 0) / (scores.length || 1)).toFixed(1)} · ` +
                `>=55: ${scores.filter(s => s >= 55).length} · >=65: ${scores.filter(s => s >= 65).length} · exactly 44: ${capped44}`)
    console.log('eligibility verdicts:', JSON.stringify(elig))
    // Split by funding type. A structure gate that shuts grants may leave
    // programmes and investment wide open, and that is the useful answer for
    // an early-stage org rather than "you have no matches".
    const byType: Record<string, { n: number; eligible: number; best: number }> = {}
    for (const g of grants) {
      let r
      try { r = computeMatchScore(g, org) } catch { continue }
      const t = (g as { fundingType?: string | null }).fundingType ?? 'grant'
      byType[t] ??= { n: 0, eligible: 0, best: 0 }
      byType[t].n++
      if (r.eligibilityStatus !== 'ineligible') byType[t].eligible++
      if (r.score > byType[t].best) byType[t].best = r.score
    }
    console.log('  BY FUNDING TYPE   rows   not-ineligible   best score')
    for (const [t, v] of Object.entries(byType).sort((a, b) => b[1].n - a[1].n)) {
      console.log(`  ${t.padEnd(16)} ${String(v.n).padStart(5)} ${String(v.eligible).padStart(14)} ${String(v.best).padStart(12)}`)
    }

    console.log('  DIMENSION        avg score / avg max   = share')
    for (const d of DIMS) {
      const s = sums[d]; if (!s) { console.log(`  ${d.padEnd(16)} (never present)`); continue }
      const got = s.got / s.n, max = s.max / s.n
      console.log(`  ${d.padEnd(16)} ${got.toFixed(1).padStart(5)} / ${max.toFixed(1).padStart(5)}         ${((got / (max || 1)) * 100).toFixed(0)}%`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })

// Score the live catalogue for every organisation created since 9 September
// (the launch-week signups) the way the debug route does, and print what a
// digest would show them: top ten with dimension breakdown, the count over
// the 65 floor, and where the rest fall. DB read only, no model call.
//
//   npx tsx --env-file=.env.local scripts/assess-signup-matches-2026-09-13.ts
import { getAdminDb } from '../src/lib/admin/admin-db'
import { computeMatchScore } from '../src/lib/matching'
import { normaliseScrapedGrant } from '../src/lib/grants-normalise'
import type { Organisation } from '../src/types'

async function main() {
  const db = getAdminDb()
  const [{ data: orgs, error: e1 }, { data: grants, error: e2 }] = await Promise.all([
    db.from('organisations').select('*').gte('created_at', '2026-09-09').order('created_at'),
    db.from('scraped_grants').select('*').eq('is_active', true).eq('pipeline_state', 'published'),
  ])
  if (e1) throw e1
  if (e2) throw e2
  console.log(`orgs ${orgs!.length}, live grants ${grants!.length}`)
  if (!orgs!.length || !grants!.length) throw new Error('empty input')
  const today = new Date()
  for (const org of orgs as Organisation[]) {
    const scored = []
    const dims: Record<string, number> = {}
    for (const g of grants as Record<string, unknown>[]) {
      if (g.deadline && !g.is_rolling && new Date(String(g.deadline)) < today) continue
      const n = normaliseScrapedGrant(g as never)
      const r = computeMatchScore(n, org)
      scored.push({ g, r })
    }
    scored.sort((a, b) => b.r.score - a.r.score)
    const over = scored.filter(s => s.r.score >= 65)
    const mid = scored.filter(s => s.r.score >= 55 && s.r.score < 65)
    const inel = scored.filter(s => s.r.eligibilityStatus === 'ineligible').length
    console.log(`\n=== ${org.name} | ${org.legal_structure} | ${org.primary_location} | ${org.annual_income_band ?? 'no income'} | reach ${org.geographic_reach}`)
    console.log(`    sectors ${JSON.stringify(org.impact_sectors)} niche ${JSON.stringify(org.niche_tags)} bens ${JSON.stringify(org.beneficiary_groups)} amount ${org.min_grant_target}-${org.max_grant_target}`)
    console.log(`    >=65: ${over.length}   55-64: ${mid.length}   ineligible: ${inel}   scored: ${scored.length}`)
    for (const s of scored.slice(0, 10)) {
      const b = s.r.breakdown
      const bd = Object.entries(b).map(([k, v]) => `${k.slice(0, 4)} ${v!.score}/${v!.max}`).join(' ')
      console.log(`    ${String(s.r.score).padStart(3)} ${s.r.eligibilityStatus.padEnd(10)} ${String(s.g.title).slice(0, 55).padEnd(56)} ${String(s.g.location_tag ?? '').slice(0, 18).padEnd(19)} ${bd}`)
      if (s.r.warnReasons.length) console.log(`        warn: ${s.r.warnReasons.slice(0, 2).join(' | ')}`)
    }
    for (const s of scored.slice(0, 3)) void dims
  }
}
main().catch(e => { console.error(e); process.exit(1) })

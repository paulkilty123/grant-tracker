// Scores the mid-size trusts batch against the six heartland organisations named
// in docs/handoffs/mid-size-trusts-2026-09-24.md, BEFORE staging, with the same
// gates the dashboard applies (funding type, legal structure, sector
// intersection, location text) and then computeMatchScore. A row counts as a new
// match at 55 or more.
//
// Every one of the six has an income band set, and two appear more than once
// (Institute of Imagination twice, Learning with Parents three times; see
// project_duplicate_org_records), so every record is scored and the headline
// counts a row once per organisation if any of its records clears 55.
//
//   npx tsx --env-file=.env.local scripts/mid-size-trusts-score-2026-09-24.ts [--json out.json]
import { writeFileSync } from 'fs'
import { getAdminDb } from '../src/lib/admin/admin-db'
import { normaliseScrapedGrant } from '../src/lib/grants-normalise'
import { computeMatchScore, grantMatchesLocationText, MATCH_FLOOR } from '../src/lib/matching'
import type { Organisation } from '../src/types'
import { NEW, SRC } from './mid-size-trusts-rows-2026-09-24'

const HEARTLAND = ['Institute of Imagination', 'Learning with Parents', 'Mizen Foundation', 'Common Ground Kitchen CIC', 'Mercury Theatre', 'Bikeworks CIC']
const CANONICAL = new Set(['grant', 'programme', 'investment', 'in_kind'])

type Verdict = { score: number | null; gate: string | null }

function judge(row: Record<string, unknown>, org: Organisation): Verdict {
  const g = normaliseScrapedGrant(row)
  const ge = g as typeof g & { impactSectors?: string[] }
  if (!CANONICAL.has((g.fundingType ?? 'grant') as string)) return { score: null, gate: 'funding type' }
  const es = g.eligibleStructures
  if (org.legal_structure && es && es.length > 0 && !es.includes(org.legal_structure)) return { score: null, gate: 'structure' }
  const orgSectors = new Set((org.impact_sectors ?? []) as string[])
  if (orgSectors.size > 0 && ge.impactSectors?.length && !ge.impactSectors.some(s => orgSectors.has(s))) return { score: null, gate: 'sector' }
  if (org.primary_location && !grantMatchesLocationText(g.locationTag, org.primary_location)) return { score: null, gate: 'location' }
  return { score: computeMatchScore(g, org).score, gate: null }
}

async function main() {
  const db = getAdminDb()
  const { data, error } = await db.from('organisations').select('*').in('name', HEARTLAND)
  if (error) throw error
  const orgs = data as Organisation[]
  const found = new Set(orgs.map(o => o.name))
  const missing = HEARTLAND.filter(n => !found.has(n))
  if (missing.length) throw new Error(`heartland orgs not found by exact name: ${missing.join(', ')}`)
  console.log(`heartland records scored: ${orgs.length} for ${HEARTLAND.length} names`)

  // Canaries: prove the scorer can say yes and no before trusting its counts.
  // A Colchester theatre fund sized for Mercury Theatre must clear 55; the same
  // fund tagged Cardiff must be stopped by the location gate; restricted to CICs
  // it must be stopped by the structure gate.
  const mercury = orgs.find(o => o.name === 'Mercury Theatre')!
  const canary = { title: 'Canary: Colchester theatre fund', funder: 'Canary', funder_type: 'trust_foundation', funding_type: 'grant',
    location_tag: 'Colchester', is_local: true, amount_min: 25000, amount_max: 75000, is_rolling: true,
    eligible_structures: ['registered_charity'], impact_sectors: ['creative', 'community', 'education'], target_beneficiaries: ['general_public'],
    niche_tags: ['theatre'], description: 'Grants for producing theatres running education and community programmes in Colchester.',
    funder_brief: { what_they_fund: 'Theatre, learning and community participation in Colchester.' } }
  const yes = judge(canary, mercury)
  const noPlace = judge({ ...canary, location_tag: 'Cardiff' }, mercury)
  const noStruct = judge({ ...canary, eligible_structures: ['cic_guarantee'] }, mercury)
  console.log(`canary yes: ${yes.score ?? yes.gate}; wrong place: ${noPlace.score ?? noPlace.gate}; wrong structure: ${noStruct.score ?? noStruct.gate}`)
  if ((yes.score ?? 0) < MATCH_FLOOR) throw new Error('canary that must clear 55 did not; the scorer cannot be trusted')
  if (noPlace.gate !== 'location') throw new Error('canary that must be location-gated was not')
  if (noStruct.gate !== 'structure') throw new Error('canary that must be structure-gated was not')

  // --from-db re-scores the staged rows as the dashboard reads them, from the
  // grants_with_funder view, instead of the in-memory row data: a second path
  // to the same numbers (catches view drift and anything the stamp changes).
  let rows: (Record<string, unknown> & { title: string })[] = NEW.map(r => ({ ...r, id: null, is_active: false }))
  if (process.argv.includes('--from-db')) {
    const { data: staged, error: e1 } = await db.from('scraped_grants').select('id').eq('source', SRC)
    if (e1) throw e1
    const ids = (staged ?? []).map(r => r.id as string)
    const { data: viewRows, error: e2 } = await db.from('grants_with_funder').select('*').in('id', ids)
    if (e2) throw e2
    console.log(`from db: ${ids.length} staged ids, ${viewRows?.length ?? 0} rows in grants_with_funder`)
    if ((viewRows?.length ?? 0) !== NEW.length) throw new Error('view does not return every staged row; the dashboard would not see them all')
    rows = viewRows as (Record<string, unknown> & { title: string })[]
  }
  const out: Record<string, unknown>[] = []
  const reachByName: Record<string, string[]> = Object.fromEntries(HEARTLAND.map(n => [n, []]))
  for (const r of rows) {
    const scores: Record<string, Verdict> = {}
    for (const o of orgs) {
      const key = orgs.filter(x => x.name === o.name).length > 1 ? `${o.name} [${o.id.slice(0, 8)}]` : o.name
      scores[key] = judge(r, o)
    }
    const reachingNames = HEARTLAND.filter(n => orgs.some(o => {
      if (o.name !== n) return false
      const key = orgs.filter(x => x.name === n).length > 1 ? `${n} [${o.id.slice(0, 8)}]` : n
      return (scores[key].score ?? 0) >= MATCH_FLOOR
    }))
    for (const n of reachingNames) reachByName[n].push(r.title)
    const line = Object.entries(scores).map(([k, v]) => `${k}: ${v.score ?? v.gate}`).join(' | ')
    console.log(`\n${r.title} [${r.location_tag}]\n  ${line}\n  reaches at 55+: ${reachingNames.join(', ') || 'none'}`)
    out.push({ title: r.title, location_tag: r.location_tag, amount_max: r.amount_max ?? null,
      scores: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, v.score ?? v.gate])), reaches_at_55: reachingNames })
  }
  console.log(`\nrows scored: ${rows.length}`)
  console.log('staged rows at 55+ per organisation:', JSON.stringify(Object.fromEntries(Object.entries(reachByName).map(([k, v]) => [k, v.length]))))
  const jsonArg = process.argv.indexOf('--json')
  if (jsonArg > 0) writeFileSync(process.argv[jsonArg + 1], JSON.stringify({ reach: reachByName, rows: out }, null, 1))
}
main().catch(e => { console.error(e); process.exit(1) })

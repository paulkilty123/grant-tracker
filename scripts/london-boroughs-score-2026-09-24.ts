// Scores the London boroughs batch against the eight London organisations named
// in docs/handoffs/london-boroughs-2026-09-24.md, BEFORE staging, with the same
// gates the dashboard applies (legal structure, sector intersection, location
// text) and then computeMatchScore. A row counts as a new match at 55 or more.
//
// It also scores every row against every organisation on Shoots, to catch the
// substring trap in the matcher's regional check (a "Sutton" tag meeting
// Sutton-in-Ashfield, "Brent" meeting Brentwood): any organisation outside
// London that clears 55 on a borough-tagged row is printed as a warning.
//
//   npx tsx --env-file=.env.local scripts/london-boroughs-score-2026-09-24.ts [--json out.json]
import { writeFileSync } from 'fs'
import { getAdminDb } from '../src/lib/admin/admin-db'
import { normaliseScrapedGrant } from '../src/lib/grants-normalise'
import { computeMatchScore, grantMatchesLocationText, MATCH_FLOOR } from '../src/lib/matching'
import type { Organisation } from '../src/types'
import { NEW, FIXES } from './london-boroughs-rows-2026-09-24'

const LONDON_ORGS = ['Asian Community Concern', 'Institute of Imagination', 'Bikeworks CIC', 'Paws and Pause', '2-3 Degrees', 'Expert Impact', 'Blue Garage', 'Unicorn Theatre']
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
  const orgs: Organisation[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('organisations').select('*').range(from, from + 999)
    if (error) throw error
    orgs.push(...(data as Organisation[]))
    if (!data || data.length < 1000) break
  }
  const london = orgs.filter(o => LONDON_ORGS.includes(o.name))
  // Two of the eight have duplicate records (see project_duplicate_org_records);
  // score every record and say so rather than pick one silently.
  const namesFound = new Set(london.map(o => o.name))
  const missing = LONDON_ORGS.filter(n => !namesFound.has(n))
  if (missing.length) throw new Error(`London orgs not found by exact name: ${missing.join(', ')}`)
  console.log(`orgs read: ${orgs.length}; London records scored: ${london.length} for ${LONDON_ORGS.length} names`)

  // Canaries: prove the scorer can say yes and no before trusting its counts.
  // A Newham education fund sized for Institute of Imagination must clear 55;
  // the same fund tagged Barnet must be stopped by the location gate.
  const ioi = london.find(o => o.name === 'Institute of Imagination')!
  const canary = { title: 'Canary: Newham learning fund', funder: 'Canary', funder_type: 'trust_foundation', funding_type: 'grant',
    location_tag: 'Newham', is_local: true, amount_min: 20000, amount_max: 50000, is_rolling: true,
    eligible_structures: ['registered_charity'], impact_sectors: ['education', 'creative', 'community'], target_beneficiaries: ['children', 'families'],
    niche_tags: ['stem'], description: 'Grants for creative learning for children and families in Newham.', funder_brief: { what_they_fund: 'Creative learning for children in Newham.' } }
  const yes = judge(canary, ioi), no = judge({ ...canary, location_tag: 'Barnet' }, ioi)
  console.log(`canary yes: ${yes.score ?? yes.gate}; canary no: ${no.score ?? no.gate}`)
  if ((yes.score ?? 0) < MATCH_FLOOR) throw new Error('canary that must clear 55 did not; the scorer cannot be trusted')
  if (no.gate !== 'location') throw new Error('canary that must be location-gated was not; the scorer cannot be trusted')

  // Held rows fixed in place are scored too, with the fixed fields applied.
  const fixRows: Record<string, unknown>[] = []
  for (const f of FIXES) {
    const { data, error } = await db.from('scraped_grants').select('*').eq('id', f.id).single()
    if (error) throw error
    fixRows.push({ ...data, ...f.fields, _fix: true })
  }
  const rows: Record<string, unknown>[] = [...NEW.map(r => ({ ...r, id: null, is_active: false })), ...fixRows]

  const out: Record<string, unknown>[] = []
  const reach: Record<string, number> = {}
  for (const r of rows) {
    const scores: Record<string, Verdict & { id: string }> = {}
    for (const o of london) {
      const key = london.filter(x => x.name === o.name).length > 1 ? `${o.name} [${o.id.slice(0, 8)}]` : o.name
      scores[key] = { id: o.id, ...judge(r, o) }
    }
    const reaches = Object.entries(scores).filter(([, v]) => (v.score ?? 0) >= MATCH_FLOOR).map(([k]) => k)
    for (const k of reaches) reach[k] = (reach[k] ?? 0) + 1
    // Outside-London clearances: the substring trap check.
    const outside = orgs
      .filter(o => !/london|\b(barnet|brent|bromley|ealing|greenwich|haringey|harrow|havering|hillingdon|hounslow|kensington|lewisham|newham|sutton|waltham|wandsworth|southwark|lambeth|camden|islington|hackney|westminster|croydon|merton|kingston|richmond|bexley|enfield|redbridge|barking|tower hamlets|hammersmith)\b/i.test(o.primary_location ?? ''))
      .map(o => ({ o, v: judge(r, o) }))
      .filter(x => (x.v.score ?? 0) >= MATCH_FLOOR && String(r.location_tag ?? '') !== 'London')
      .map(x => `${x.o.name} (${x.o.primary_location}) ${x.v.score}`)
    const line = Object.entries(scores).map(([k, v]) => `${k}: ${v.score ?? v.gate}`).join(' | ')
    console.log(`\n${r._fix ? 'FIX ' : ''}${r.title} [${r.location_tag}]\n  ${line}\n  reaches at 55+: ${reaches.join(', ') || 'none'}`)
    if (outside.length) console.log(`  WARNING outside-London orgs at 55+: ${outside.join('; ')}`)
    out.push({ title: r.title, fix: Boolean(r._fix), location_tag: r.location_tag, scores: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, v.score ?? v.gate])), reaches_at_55: reaches, outside_london_at_55: outside })
  }
  console.log(`\nrows scored: ${rows.length} (${NEW.length} new, ${fixRows.length} fixes)`)
  console.log('rows reaching each London record at 55+:', JSON.stringify(reach, null, 1))
  const jsonArg = process.argv.indexOf('--json')
  if (jsonArg > 0) writeFileSync(process.argv[jsonArg + 1], JSON.stringify({ reach, rows: out }, null, 1))
}
main().catch(e => { console.error(e); process.exit(1) })

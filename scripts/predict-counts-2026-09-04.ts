// Predict the two screens' counts for one org, from the same rows and the
// same rules each screen uses, so the dashboard change can be checked before
// it is deployed rather than eyeballed after.
//
//   npx tsx --env-file=.env.local scripts/predict-counts-2026-09-04.ts <orgId>
//
// Prints: Find Funding's tab badges (open rows, per type, structure gate),
// the dashboard's new headline (same rule, all types), and the dashboard's
// scored set (structure + sector + location gates, then score tiers).

import { getAdminDb } from '../src/lib/admin/admin-db'
import { normaliseScrapedGrant } from '../src/lib/grants-normalise'
import { computeMatchScore, grantMatchesLocationText } from '../src/lib/matching'
import type { Organisation } from '../src/types'

const orgId = process.argv[2]
if (!orgId) throw new Error('pass an org id')
const CANONICAL = new Set(['grant', 'programme', 'investment', 'in_kind'])
const BROAD = new Set(['uk', 'uk-wide', 'england', 'nationwide', 'national', 'uk wide', 'all uk'])

async function main() {
  const db = getAdminDb()
  const today = new Date().toISOString().split('T')[0]
  const { data: org } = await db.from('organisations').select('*').eq('id', orgId).single()
  if (!org) throw new Error('org not found')
  const { data: rows } = await db.from('grants_with_funder').select('*').eq('is_active', true).neq('url_status', 'dead')
    .or(`is_rolling.eq.true,deadline.is.null,deadline.gte.${today},next_open_date_parsed.gte.${today}`).limit(1500)
  const { data: hidden } = await db.from('grant_interactions').select('grant_id').eq('org_id', orgId).eq('action', 'dismissed')
  const hiddenIds = new Set((hidden ?? []).map(h => String(h.grant_id)))
  const structure = org.legal_structure as string | null
  const sectors = new Set((org.impact_sectors ?? []) as string[])
  const loc = String(org.primary_location ?? '').toLowerCase().trim()

  const structureOnly: Record<string, number> = { all: 0, grant: 0, programme: 0, investment: 0, in_kind: 0 }
  // Find Funding's profile mode: structure gate, sector overlap, and the
  // location TEXT filter on locationTag (grantMatchesLocationText).
  const findFunding: Record<string, number> = { all: 0, grant: 0, programme: 0, investment: 0, in_kind: 0 }
  const tiers = { strong: 0, good: 0, partial: 0, weak: 0 }
  let scored = 0
  const ranked: { title: string; ft: string; sc: number; tag: string | null }[] = []
  for (const row of rows ?? []) {
    if (hiddenIds.has(String(row.id))) continue
    const ft = String(row.funding_type ?? 'grant')
    if (!CANONICAL.has(ft)) continue
    const es = (row.eligible_structures ?? null) as string[] | null
    if (structure && es && es.length > 0 && !es.includes(structure)) continue
    structureOnly.all++; structureOnly[ft]++
    const g = normaliseScrapedGrant(row as Record<string, unknown>) as ReturnType<typeof normaliseScrapedGrant> & { impactSectors?: string[]; geoScope?: string[]; locationTag?: string | null }
    const sectorOk = !(sectors.size > 0 && g.impactSectors?.length && !g.impactSectors.some(s => sectors.has(s)))
    if (sectorOk && (!loc || grantMatchesLocationText(g.locationTag, String(org.primary_location)))) { findFunding.all++; findFunding[ft]++ }
    if (!sectorOk) continue
    if (loc && !grantMatchesLocationText(g.locationTag, String(org.primary_location))) continue
    scored++
    const sc = computeMatchScore(g, org as Organisation).score
    if (sc >= 80) tiers.strong++; else if (sc >= 65) tiers.good++; else if (sc >= 50) tiers.partial++; else tiers.weak++
    ranked.push({ title: g.title, ft, sc, tag: g.locationTag ?? null })
  }
  ranked.sort((a, b) => b.sc - a.sc)
  console.log('top of the gated set by score (what both screens should lead with):')
  ranked.slice(0, 8).forEach((r, i) => console.log(`  ${i + 1}. ${r.sc}%  ${r.title}  [${r.ft}, ${r.tag}]`))
  for (const needle of (process.argv[3] ?? '').split('|').filter(Boolean)) {
    const i = ranked.findIndex(r => r.title.toLowerCase().includes(needle.toLowerCase()))
    console.log(`  "${needle}": ${i < 0 ? 'NOT in the gated set' : `position ${i + 1}, ${ranked[i].sc}%`}`)
  }
  console.log(`org ${org.name} (${structure}, ${loc || 'no location'})`)
  console.log(`Structure gate only: grants ${structureOnly.grant}, programmes ${structureOnly.programme}, investment ${structureOnly.investment}, in-kind ${structureOnly.in_kind} (all ${structureOnly.all})`)
  console.log(`Find Funding tab badges (structure + sectors + location text): grants ${findFunding.grant}, programmes ${findFunding.programme}, investment ${findFunding.investment}, in-kind ${findFunding.in_kind} (all ${findFunding.all})`)
  console.log(`Dashboard headline "you can apply for" (same rule, all types): ${findFunding.all}`)
  console.log(`Dashboard "scored against your profile": ${scored}; worth your attention ${tiers.strong + tiers.good + tiers.partial} (strong ${tiers.strong}, good ${tiers.good}, partial ${tiers.partial}); scored under 50: ${tiers.weak}`)
}
main().catch(e => { console.error(e); process.exit(1) })

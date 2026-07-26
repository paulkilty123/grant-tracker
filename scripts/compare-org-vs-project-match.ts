/**
 * One-off diagnostic: org-level vs project-level matching for the same org.
 * Mirrors the two live pipelines exactly:
 *   - org side: dashboard "Matched Opportunities" (src/app/dashboard/page.tsx)
 *   - project side: /dashboard/projects/[id] runMatch()
 * Usage: npx tsx scripts/compare-org-vs-project-match.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import path from 'path'
import { computeMatchScore } from '../src/lib/matching'
import { normaliseScrapedGrant } from '../src/lib/grants-normalise'
import type { Organisation } from '../src/types'

// Same manual .env.local loader as cohort-newsletter.ts (no dotenv dep).
for (const line of readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const CANONICAL_TYPES = new Set(['grant', 'programme', 'investment', 'in_kind'])
const BROAD_LOCATION = new Set(['uk', 'uk-wide', 'england', 'nationwide', 'national', 'uk wide', 'all uk'])

async function main() {
  const { data: proj } = await supabase
    .from('projects').select('*').order('created_at', { ascending: false }).limit(1).single()
  const { data: org } = await supabase
    .from('organisations').select('*').eq('id', proj.org_id).single()

  const today = new Date().toISOString().split('T')[0]
  const { data: rows } = await supabase
    .from('grants_with_funder')
    .select('*')
    .eq('is_active', true)
    .neq('url_status', 'dead')
    .or(`is_rolling.eq.true,deadline.is.null,deadline.gte.${today},next_open_date_parsed.gte.${today}`)
    .order('last_seen_at', { ascending: false })
    .limit(1000)

  const typedOrg = org as Organisation
  const orgStructure = typedOrg.legal_structure
  const orgLocation = (typedOrg.primary_location ?? '').toLowerCase().trim()

  function locationPasses(geoScope: string[] | undefined): boolean {
    if (!orgLocation || !geoScope || geoScope.length === 0) return true
    return geoScope.some(s => {
      const sl = s.toLowerCase()
      return BROAD_LOCATION.has(sl) || sl.includes(orgLocation) || orgLocation.includes(sl)
    })
  }

  function score(profile: Organisation, sectorSet: Set<string>) {
    return (rows ?? [])
      .map(row => {
        const g = normaliseScrapedGrant(row as Record<string, unknown>)
        const ge = g as typeof g & { impactSectors?: string[]; geoScope?: string[] }
        const ft = (g.fundingType ?? 'grant') as string
        if (!CANONICAL_TYPES.has(ft)) return null
        const es = g.eligibleStructures
        if (orgStructure && es && es.length > 0 && !es.includes(orgStructure)) return null
        if (!locationPasses(ge.geoScope)) return null
        if (sectorSet.size > 0 && ge.impactSectors && ge.impactSectors.length > 0) {
          if (!ge.impactSectors.some(s => sectorSet.has(s))) return null
        }
        return { title: g.title, funder: g.funder, type: ft, score: computeMatchScore(g, profile).score }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.score - a.score)
  }

  // ── Org-level (dashboard pipeline) ──
  const orgMatches = score(typedOrg, new Set((typedOrg.impact_sectors ?? []) as string[]))

  // ── Project-level (project page pipeline) ──
  const synthetic = {
    ...typedOrg,
    impact_sectors: proj.sectors,
    beneficiary_groups: proj.beneficiary_groups,
    min_grant_target: typedOrg.min_grant_target ?? (proj.budget_amount ? Math.round(proj.budget_amount * 0.1) : null),
  } as Organisation
  const projMatches = score(synthetic, new Set(proj.sectors as string[]))
    .filter(m => m.score >= 55).slice(0, 12)

  console.log(`\nORG: ${org.name} | sectors: ${(typedOrg.impact_sectors ?? []).join(', ')}`)
  console.log(`PROJECT: ${proj.name} | sectors: ${(proj.sectors as string[]).join(', ')} | budget £${proj.budget_amount}`)

  console.log(`\n── ORG-LEVEL TOP 12 (dashboard pipeline, ${orgMatches.length} total matches) ──`)
  orgMatches.slice(0, 12).forEach((m, i) =>
    console.log(`${String(i + 1).padStart(2)}. ${String(m.score).padStart(3)}%  ${m.title}  [${m.funder}] (${m.type})`))

  console.log(`\n── PROJECT-LEVEL TOP 12 (project page pipeline, >=55% cap 12) ──`)
  projMatches.forEach((m, i) =>
    console.log(`${String(i + 1).padStart(2)}. ${String(m.score).padStart(3)}%  ${m.title}  [${m.funder}] (${m.type})`))

  const orgTop = new Set(orgMatches.slice(0, 12).map(m => m.title))
  const overlap = projMatches.filter(m => orgTop.has(m.title)).length
  console.log(`\nOverlap in top 12: ${overlap}/12 shared, ${12 - overlap} project-only`)
}

main().catch(e => { console.error(e); process.exit(1) })

/**
 * Demo preflight: rank the live catalogue for one org, exactly as the
 * dashboard "Matched Opportunities" pipeline does (mirrors
 * scripts/compare-org-vs-project-match.ts org-side + src/app/dashboard/page.tsx).
 *
 * Usage: npx tsx scripts/preflight-match.ts <orgId>
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const CANONICAL_TYPES = new Set(['grant', 'programme', 'investment', 'in_kind'])
const BROAD_LOCATION = new Set(['uk', 'uk-wide', 'england', 'nationwide', 'national', 'uk wide', 'all uk'])

async function main() {
  const orgId = process.argv[2]
  if (!orgId) { console.error('Usage: npx tsx scripts/preflight-match.ts <orgId>'); process.exit(1) }

  const { data: org } = await supabase.from('organisations').select('*').eq('id', orgId).single()
  const typedOrg = org as Organisation
  const orgStructure = typedOrg.legal_structure
  const orgLocation = (typedOrg.primary_location ?? '').toLowerCase().trim()
  const sectorSet = new Set((typedOrg.impact_sectors ?? []) as string[])

  const today = new Date().toISOString().split('T')[0]
  const { data: rows } = await supabase
    .from('grants_with_funder')
    .select('*')
    .eq('is_active', true)
    .neq('url_status', 'dead')
    .or(`is_rolling.eq.true,deadline.is.null,deadline.gte.${today},next_open_date_parsed.gte.${today}`)
    .order('last_seen_at', { ascending: false })
    .limit(1000)

  function locationPasses(geoScope: string[] | undefined): boolean {
    if (!orgLocation || !geoScope || geoScope.length === 0) return true
    return geoScope.some(s => {
      const sl = s.toLowerCase()
      return BROAD_LOCATION.has(sl) || sl.includes(orgLocation) || orgLocation.includes(sl)
    })
  }

  let structureGated = 0, locationGated = 0, sectorGated = 0
  const matches = (rows ?? [])
    .map(row => {
      const g = normaliseScrapedGrant(row as Record<string, unknown>)
      const ge = g as typeof g & { impactSectors?: string[]; geoScope?: string[] }
      const ft = (g.fundingType ?? 'grant') as string
      if (!CANONICAL_TYPES.has(ft)) return null
      const es = g.eligibleStructures
      if (orgStructure && es && es.length > 0 && !es.includes(orgStructure)) { structureGated++; return null }
      if (!locationPasses(ge.geoScope)) { locationGated++; return null }
      if (sectorSet.size > 0 && ge.impactSectors && ge.impactSectors.length > 0) {
        if (!ge.impactSectors.some(s => sectorSet.has(s))) { sectorGated++; return null }
      }
      return { title: g.title, funder: g.funder, type: ft, score: computeMatchScore(g, typedOrg).score }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.score - a.score)

  const byType = (t: string) => matches.filter(m => m.type === t).length
  const atLeast = (n: number) => matches.filter(m => m.score >= n).length

  console.log(`\n══════════════════════════════════════════════════════════`)
  console.log(`ORG: ${typedOrg.name}  (${orgStructure})`)
  console.log(`location: ${typedOrg.primary_location} | income: ${typedOrg.annual_income_band ?? 'not set'}`)
  console.log(`sectors: ${(typedOrg.impact_sectors ?? []).join(', ')}`)
  console.log(`beneficiaries: ${(typedOrg.beneficiary_groups ?? []).join(', ')}`)
  console.log(`──────────────────────────────────────────────────────────`)
  console.log(`Catalogue scanned: ${rows?.length ?? 0} live | Matches after gates: ${matches.length}`)
  console.log(`Score bands:  >=80: ${atLeast(80)}   >=70: ${atLeast(70)}   >=55: ${atLeast(55)}`)
  console.log(`Type breadth: grant ${byType('grant')} | programme ${byType('programme')} | investment ${byType('investment')} | in_kind ${byType('in_kind')}`)
  console.log(`Gated out:    structure ${structureGated} | location ${locationGated} | sector ${sectorGated}`)
  console.log(`\nTOP 15 MATCHES:`)
  matches.slice(0, 15).forEach((m, i) =>
    console.log(`${String(i + 1).padStart(2)}. ${String(m.score).padStart(3)}%  [${m.type.padEnd(9)}] ${m.title}  — ${m.funder}`))
  console.log('')
}

main().catch(e => { console.error(e); process.exit(1) })

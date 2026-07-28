// What does a profile SETTING actually change for an org's matches?
//
//   npx tsx scripts/compare-profile-settings.ts <orgId>
//
// Varies geographic_reach and annual_income_band in memory and re-scores the
// live catalogue for each combination. Writes nothing — the profile is never
// touched, so this is safe to run against a real user's org.
//
// Built because "does local vs regional matter?" is a question the code can
// answer exactly, and guessing at it from reading the scorer is how you end up
// confidently wrong about a one-line cap.
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

const CANONICAL = new Set(['grant', 'programme', 'investment', 'in_kind'])
const BROAD = new Set(['uk', 'uk-wide', 'england', 'nationwide', 'national', 'uk wide', 'all uk'])

const REACHES = ['local', 'regional', 'national', 'international']
const BANDS = ['£500,000–£1 million', '£1 million–£5 million']

async function main() {
  const orgId = process.argv[2]
  if (!orgId) { console.error('Usage: npx tsx scripts/compare-profile-settings.ts <orgId>'); process.exit(1) }

  const { data: org } = await db.from('organisations').select('*').eq('id', orgId).single()
  const base = org as Organisation
  const today = new Date().toISOString().split('T')[0]
  const { data: rows } = await db
    .from('grants_with_funder').select('*')
    .eq('is_active', true).neq('url_status', 'dead')
    .or(`is_rolling.eq.true,deadline.is.null,deadline.gte.${today},next_open_date_parsed.gte.${today}`)
    .limit(1000)

  const orgLocation = (base.primary_location ?? '').toLowerCase().trim()
  const sectorSet = new Set((base.impact_sectors ?? []) as string[])
  const locationPasses = (geo: string[] | undefined) =>
    !orgLocation || !geo || geo.length === 0 ||
    geo.some(s => { const sl = s.toLowerCase(); return BROAD.has(sl) || sl.includes(orgLocation) || orgLocation.includes(sl) })

  console.log(`\n${base.name} — ${base.primary_location}`)
  console.log(`currently: reach=${base.geographic_reach}  income=${base.annual_income_band}\n`)
  console.log(`reach          income                   >=70  >=55  >=40   top match`)
  console.log('─'.repeat(88))

  for (const band of BANDS) {
    for (const reach of REACHES) {
      const variant = { ...base, geographic_reach: reach, annual_income_band: band } as Organisation
      const scores: { s: number; t: string }[] = []
      for (const row of rows ?? []) {
        const g = normaliseScrapedGrant(row as Record<string, unknown>)
        const ge = g as typeof g & { impactSectors?: string[]; geoScope?: string[] }
        if (!CANONICAL.has((g.fundingType ?? 'grant') as string)) continue
        const es = g.eligibleStructures
        if (base.legal_structure && es?.length && !es.includes(base.legal_structure)) continue
        if (!locationPasses(ge.geoScope)) continue
        if (sectorSet.size > 0 && ge.impactSectors?.length && !ge.impactSectors.some(s => sectorSet.has(s))) continue
        scores.push({ s: computeMatchScore(g, variant).score, t: `${g.funder} — ${g.title}` })
      }
      scores.sort((a, b) => b.s - a.s)
      const n = (min: number) => scores.filter(x => x.s >= min).length
      const marker = reach === base.geographic_reach && band === base.annual_income_band ? ' <- current' : ''
      console.log(
        `${reach.padEnd(15)}${band.padEnd(25)}${String(n(70)).padStart(4)}${String(n(55)).padStart(6)}${String(n(40)).padStart(6)}   ` +
        `${scores[0]?.s ?? 0}% ${(scores[0]?.t ?? '').slice(0, 34)}${marker}`)
    }
    console.log('')
  }
}
main().catch(e => { console.error(e); process.exit(1) })

/**
 * Would the waitlist signups get decent matches today?
 *
 * Runs the REAL matcher (computeMatchScore) over every live published row for
 * profiles built from the fifteen waitlist organisations that could be
 * identified from their email domain and website.
 *
 * THE LIMIT, STATED UP FRONT: these profiles are my inference from each
 * organisation's website, not what the person will actually type at signup. The
 * matcher is highly sensitive to legal_structure (a mismatch caps the score at
 * 44) and to impact_sectors. So this measures whether the CATALOGUE can serve
 * them, not what any individual will really see. Where a structure is a guess
 * it is marked, because that guess moves the answer more than anything else.
 */
import { createClient } from '@supabase/supabase-js'
import { computeMatchScore } from '../src/lib/matching'
import { normaliseScrapedGrant } from '../src/lib/grants-normalise'
import type { Organisation } from '../src/types'
import * as fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
const envVar = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))![1].trim()
const db = createClient(envVar('NEXT_PUBLIC_SUPABASE_URL'), envVar('SUPABASE_SERVICE_ROLE_KEY'))

const GOOD = 65   // "Good" band, per project_match_label_bands_measured
const SHOWN = 55  // the floor the deadlines page uses

type Profile = Partial<Organisation> & { name: string; _structureGuessed?: boolean }

const ORGS: Profile[] = [
  { name: 'White Lodge Centre', primary_location: 'Surrey', geographic_reach: 'local',
    legal_structure: 'registered_charity', annual_income_band: '£1m–£5m',
    impact_sectors: ['disability', 'health', 'community'], beneficiary_groups: ['disabled_people', 'young_people', 'children'] },
  { name: 'Men in Sheds Hull', primary_location: 'Hull', geographic_reach: 'local',
    legal_structure: 'registered_charity', annual_income_band: 'Under £100,000',
    impact_sectors: ['community', 'health', 'older_people'], beneficiary_groups: ['older_people', 'men_boys'] },
  { name: 'Men Walk Talk', primary_location: 'Cornwall', geographic_reach: 'regional',
    legal_structure: 'registered_charity', annual_income_band: 'Under £100,000',
    impact_sectors: ['mental_health', 'health', 'community'], beneficiary_groups: ['men_boys'] },
  { name: 'Bridlington Cricket Foundation', primary_location: 'Bridlington, East Yorkshire', geographic_reach: 'local',
    legal_structure: 'cio', annual_income_band: 'Under £100,000', _structureGuessed: true,
    impact_sectors: ['sport', 'community', 'young_people'], beneficiary_groups: ['young_people', 'children'] },
  { name: 'FareShare South West', primary_location: 'Bristol', geographic_reach: 'regional',
    legal_structure: 'registered_charity', annual_income_band: '£1m–£5m',
    impact_sectors: ['food', 'community', 'environment'], beneficiary_groups: ['people_in_poverty'] },
  { name: 'ACTA Community Theatre', primary_location: 'Bristol', geographic_reach: 'local',
    legal_structure: 'registered_charity', annual_income_band: '£250,000–£1m',
    impact_sectors: ['creative', 'community'], beneficiary_groups: ['general_public'] },
  { name: 'Swansea Rainbow Counselling Centre', primary_location: 'Swansea', geographic_reach: 'local',
    legal_structure: 'registered_charity', annual_income_band: 'Under £100,000', _structureGuessed: true,
    impact_sectors: ['mental_health', 'health', 'community'], beneficiary_groups: ['lgbtq'] },
  { name: 'The Suit Works', primary_location: 'Sheffield', geographic_reach: 'local',
    legal_structure: 'registered_charity', annual_income_band: 'Under £100,000',
    impact_sectors: ['employment', 'community'], beneficiary_groups: ['people_in_poverty', 'ex_offenders'] },
  { name: 'Fresh Futures', primary_location: 'Huddersfield, Kirklees', geographic_reach: 'local',
    legal_structure: 'registered_charity', annual_income_band: '£1m–£5m',
    impact_sectors: ['young_people', 'education', 'community'], beneficiary_groups: ['children', 'young_people', 'families'] },
  { name: 'East Sussex Wildlife Rescue', primary_location: 'East Sussex', geographic_reach: 'local',
    legal_structure: 'registered_charity', annual_income_band: 'Under £100,000',
    impact_sectors: ['environment', 'community'], beneficiary_groups: ['general_public'] },
  { name: 'North West Pre-hospital Critical Care', primary_location: 'Cheshire', geographic_reach: 'regional',
    legal_structure: 'registered_charity', annual_income_band: '£100,000–£250,000',
    impact_sectors: ['health'], beneficiary_groups: ['general_public'] },
  { name: 'Become United', primary_location: 'Greater Manchester', geographic_reach: 'local',
    legal_structure: 'cic_guarantee', annual_income_band: 'Under £100,000', _structureGuessed: true,
    impact_sectors: ['community', 'health'], beneficiary_groups: ['ethnic_minorities', 'people_in_poverty'] },
  { name: 'The Apex Project', primary_location: 'London', geographic_reach: 'local',
    legal_structure: 'cic_guarantee', annual_income_band: 'Under £100,000', _structureGuessed: true,
    impact_sectors: ['young_people', 'justice', 'creative'], beneficiary_groups: ['young_people', 'ex_offenders'] },
  { name: 'IOI London', primary_location: 'London', geographic_reach: 'local',
    legal_structure: 'registered_charity', annual_income_band: 'Under £100,000', _structureGuessed: true,
    impact_sectors: ['young_people', 'education', 'community'], beneficiary_groups: ['children', 'young_people'] },
  { name: 'The Resurgence Trust', primary_location: 'Devon', geographic_reach: 'national',
    legal_structure: 'registered_charity', annual_income_band: '£250,000–£1m',
    impact_sectors: ['environment', 'creative'], beneficiary_groups: ['general_public'] },
]

;(async () => {
  const all: Record<string, unknown>[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('grants_with_funder').select('*')
      .eq('is_active', true).range(from, from + 999)
    if (error) throw new Error(error.message)
    all.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  const today = new Date().toISOString().slice(0, 10)
  const open = all.filter(r => r.is_rolling || !r.deadline || String(r.deadline) >= today)
  console.log(`live rows: ${all.length}, of which open or rolling: ${open.length}\n`)
  const grants = open.map(r => normaliseScrapedGrant(r as never))

  const rows: { name: string; good: number; shown: number; top: number; guessed: boolean; best: string }[] = []
  for (const p of ORGS) {
    const scored = grants.map(g => ({ g, s: computeMatchScore(g, p as Organisation).score }))
      .sort((a, b) => b.s - a.s)
    rows.push({
      name: p.name,
      good: scored.filter(x => x.s >= GOOD).length,
      shown: scored.filter(x => x.s >= SHOWN).length,
      top: scored[0]?.s ?? 0,
      guessed: !!p._structureGuessed,
      best: scored[0]?.g.title ?? '',
    })
  }

  rows.sort((a, b) => a.good - b.good)
  console.log(`${'organisation'.padEnd(38)} ${'good'.padStart(5)} ${'shown'.padStart(6)} ${'top'.padStart(4)}   best match`)
  for (const r of rows)
    console.log(`${(r.name + (r.guessed ? ' *' : '')).padEnd(38)} ${String(r.good).padStart(5)} ${String(r.shown).padStart(6)} ${String(r.top).padStart(4)}   ${r.best.slice(0, 44)}`)

  // Are the Good matches useful, or rows that match everybody?
  const goodLists: Record<string, string[]> = {}
  for (const p of ORGS) {
    goodLists[p.name] = grants
      .map(g => ({ g, s: computeMatchScore(g, p as Organisation).score }))
      .filter(x => x.s >= GOOD).map(x => `${x.g.fundingType ?? 'unknown'}|${x.g.title}`)
  }
  const freq: Record<string, number> = {}
  for (const l of Object.values(goodLists)) for (const t of l) freq[t] = (freq[t] || 0) + 1
  const universal = Object.entries(freq).filter(([, c]) => c >= ORGS.length * 0.6).sort((a, b) => b[1] - a[1])
  console.log(`\nrows that are a Good match for 60%+ of these orgs (i.e. match almost anyone): ${universal.length}`)
  for (const [t, c] of universal.slice(0, 12)) console.log(`   ${c}/${ORGS.length}  ${t.slice(0, 66)}`)

  console.log('\nGood matches by funding type, and how many are LOCAL to the org:')
  for (const p of ORGS) {
    const list = grants.map(g => ({ g, s: computeMatchScore(g, p as Organisation).score })).filter(x => x.s >= GOOD)
    const byType: Record<string, number> = {}
    for (const x of list) { const t = x.g.fundingType ?? 'unknown'; byType[t] = (byType[t] || 0) + 1 }
    const uniq = list.filter(x => (freq[`${x.g.fundingType ?? 'unknown'}|${x.g.title}`] || 0) < ORGS.length * 0.6).length
    console.log(`   ${p.name.padEnd(38)} ${String(list.length).padStart(3)} good, ${String(uniq).padStart(3)} not-universal   ${JSON.stringify(byType)}`)
  }

  const none = rows.filter(r => r.good === 0)
  const thin = rows.filter(r => r.good > 0 && r.good < 5)
  console.log(`\nno Good match at all: ${none.length}  ${none.map(r => r.name).join(', ') || '—'}`)
  console.log(`fewer than 5 Good matches: ${thin.length}  ${thin.map(r => r.name).join(', ') || '—'}`)
  console.log(`\n* legal structure is a guess, and a wrong structure caps every score at 44`)
})()

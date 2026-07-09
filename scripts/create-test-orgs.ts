// Create the archetype test orgs on the test account (Paul's). Additive and
// idempotent: skips an org whose name already exists for the owner. Service
// role, guarded to the single TEST_OWNER so it can never seed under a real
// user. companion_access stays FALSE — flags are moved deliberately via
// scripts/companion-flag.ts, one org at a time.
//
//   npx tsx scripts/create-test-orgs.ts
//
// Profiles mirror the column shape of the existing companion test orgs
// (ACC / IoI) so matching, eligibility and the venture-fork see realistic
// inputs. NOTE: there is no dedicated "trading income" boolean in the schema;
// the venture fork keys on legal_structure + income band + years_trading, so
// trading is expressed through those (CIC + asset lock + positive years_trading).

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import path from 'path'

for (const line of readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const TEST_OWNER = 'ee80e7d1-6680-420f-8046-5a5e36a84fe6' // Paul's account (owns ACC + IoI)

const ORGS: Array<Record<string, unknown>> = [
  {
    // Archetype 3 — trading social enterprise (community catering / facilities).
    name: 'Common Ground Kitchen CIC',
    org_type: 'cic',
    legal_structure: 'cic_guarantee',
    annual_income_band: '£250,000–£500,000',
    primary_location: 'Manchester',
    geographic_reach: 'local',
    mission: 'A community catering and venue-hire social enterprise in Manchester, using a training kitchen and event spaces to create paid hospitality routes for people furthest from work and to keep affordable community space open.',
    impact_sectors: ['community', 'employment', 'food'],
    beneficiary_groups: ['people_in_poverty', 'general_public', 'young_people', 'ethnic_minorities'],
    beneficiaries: ['people_in_poverty', 'general_public', 'young_people', 'ethnic_minorities'],
    themes: ['community', 'employment', 'food'],
    areas_of_work: ['community', 'employment', 'food'],
    funding_type_preferences: ['grant', 'programme', 'in_kind'],
    org_stage: 'growth',
    has_asset_lock: true,
    social_mission_declared: true,
    articles_restrict_profit: true,
    years_trading: 6,
    years_operating: 6,
    min_grant_target: 5000,
    max_grant_target: 120000,
    people_per_year: 2000,
    alerts_enabled: false,
    apply_access: false,
    companion_access: false,
    owner_id: TEST_OWNER,
  },
  {
    // Archetype 4 — impact venture scaling (digital inclusion / assistive tech).
    // cic_shares: an investment-able CIC, the more realistic structure for a
    // venture seeking growth capital. Runs charity-shaped logic today by design
    // (venture fork is gated on the SI catalogue-depth audit).
    name: 'OpenAccess Digital CIC',
    org_type: 'cic',
    legal_structure: 'cic_shares',
    annual_income_band: '£100,000–£250,000',
    primary_location: 'Birmingham',
    geographic_reach: 'national',
    mission: 'An early-stage impact venture building assistive-technology and digital-inclusion products for disabled and older people, blending grant income with a revenue-generating product subscription and seeking growth capital to scale.',
    impact_sectors: ['tech', 'disability', 'social_innovation'],
    beneficiary_groups: ['disabled_people', 'older_people', 'general_public'],
    beneficiaries: ['disabled_people', 'older_people', 'general_public'],
    themes: ['tech', 'disability', 'social_innovation'],
    areas_of_work: ['tech', 'disability', 'social_innovation'],
    funding_type_preferences: ['grant', 'investment', 'programme'],
    org_stage: 'early',
    has_asset_lock: true,
    social_mission_declared: true,
    articles_restrict_profit: true,
    years_trading: 2,
    years_operating: 2,
    min_grant_target: 10000,
    max_grant_target: 150000,
    people_per_year: 500,
    alerts_enabled: false,
    apply_access: false,
    companion_access: false,
    owner_id: TEST_OWNER,
  },
]

async function main() {
  for (const org of ORGS) {
    const { data: existing } = await sb.from('organisations')
      .select('id').eq('owner_id', TEST_OWNER).eq('name', org.name as string).maybeSingle()
    if (existing) {
      console.log(`• ${org.name} already exists → ${existing.id} (skipped)`)
      continue
    }
    const { data, error } = await sb.from('organisations').insert(org).select('id, name, legal_structure, primary_location, annual_income_band, org_stage, impact_sectors, beneficiary_groups').single()
    if (error) { console.error(`✗ ${org.name}: ${error.message}`); process.exitCode = 1; continue }
    console.log(`✓ created ${data.name} → ${data.id}`)
    console.log(`    ${data.legal_structure} · ${data.primary_location} · ${data.annual_income_band} · stage=${data.org_stage}`)
    console.log(`    sectors=${JSON.stringify(data.impact_sectors)} beneficiaries=${JSON.stringify(data.beneficiary_groups)}`)
  }
}
main().then(() => process.exit(process.exitCode ?? 0)).catch(e => { console.error(e); process.exit(1) })

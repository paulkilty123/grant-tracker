// Niche tags for review-queue rows the classifier left empty on 11 Sept 2026.
// The classifier's empty answer is right for a general community fund; these
// are the rows whose own pages name a specialism. Tags come from the profile
// taxonomy only. Written on Paul's "go", from pages read this session.
//   npx tsx --env-file=.env.local scripts/queue-niche-tags-2026-09-11.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const T: Record<string, string[]> = {
  'Corra Racial Equity Fund': ['bame_community'],
  'Belfast City Council Ending Violence Against Women and Girls Local Change Fund': ['vawg'],
  'Cecil Pettit Legacy Fund': ['physical_disability', 'learning_disability', 'social_isolation', 'accessibility'],
  'African & Caribbean Elders Service Legacy Fund': ['bame_community', 'social_isolation', 'age_friendly'],
  'Amplius Community Fund': ['financial_education', 'skills_training', 'preventive_health'],
  'Margaret Giffen Community Fund': ['food_poverty', 'fuel_poverty', 'advocacy'],
  'Northamptonshire Queen\'s Institute Relief Fund': ['chronic_illness', 'preventive_health', 'skills_training'],
  'The Fibrus Community Fund': ['digital_inclusion', 'digital_literacy'],
  'Hackney Giving Microgrants': ['preventive_health', 'social_isolation', 'public_health'],
  'Communities Mental Health and Wellbeing Fund, Dumfries and Galloway, Round Six': ['adult_mh', 'social_isolation', 'suicide_prevention'],
  'Henry Smith Foundation — Maternity Equity': ['reproductive_health', 'bame_community'],
  'RS Macdonald Charitable Trust Small Grants': ['sensory_impairment', 'chronic_illness', 'trauma_recovery'],
  'Halifax Foundation for Northern Ireland Community FLEX': ['adult_mh', 'supported_employment', 'accessibility'],
  'Nancie Massey Charitable Trust': ['social_isolation'],
  'Highland Small Grants Programme': ['place_based', 'community_ownership'],
  'Luton Innovation & Collaboration Fund': ['skills_training', 'returning_to_work', 'careers_advice'],
  'Essential Employment Skills Fund': ['skills_training', 'careers_advice', 'impact_measurement'],
  'Common Ground Award 2026 to 2027': ['place_based'],
  'Daring Capital Angel Investment': ['entrepreneurship', 'workplace_inclusion'],
  'SSE DPS Social Commitment Programme: Scale': ['entrepreneurship'],
  'CAST Design Hops': ['digital_literacy', 'tech_for_good'],
  'The Charity Service — Greater Manchester Grants': ['rough_sleeping', 'homelessness_prevention', 'social_isolation'],
  'Together we CAN Fund (Doncaster)': ['social_isolation', 'neighbourhood'],
  'Woodward Charitable Trust — General Grants': ['early_years'],
  'Nature Networks Fund (round six)': ['biodiversity', 'natural_heritage'],
  'Andrew Wainwright Reform Trust — Grants': ['civil_liberties', 'advocacy'],
  'Sheffield Legacy Fund': ['neighbourhood', 'place_based'],
  'SYCF Small Grants Programme': ['neighbourhood', 'place_based'],
  'Belfast Harbour Community Awards': ['skills_training', 'careers_advice'],
  'Causeway Coast and Glens Christmas Festive Fund 2026': ['neighbourhood'],
  'Causeway Coast and Glens LEP Capital Grant Programme 2026-27': ['entrepreneurship'],
  'The Honourable The Irish Society Small Grants': ['early_years', 'natural_heritage', 'built_heritage'],
}
async function main() {
  const db = getAdminDb(); console.log(APPLY ? 'APPLY' : 'DRY RUN')
  const { data } = await db.from('scraped_grants').select('id, title, niche_tags').eq('pipeline_state', 'tagged_awaiting_review').eq('is_active', false)
  const rows = (data ?? []) as { id: string; title: string; niche_tags: string[] | null }[]
  let n = 0
  for (const [title, tags] of Object.entries(T)) {
    const row = rows.find(r => r.title === title)
    if (!row) { console.log('  NOT FOUND:', title); continue }
    const merged = Array.from(new Set([...(row.niche_tags ?? []), ...tags]))
    if (merged.length === (row.niche_tags ?? []).length) { console.log('  unchanged:', title); continue }
    console.log(`  ${title}: ${merged.join(',')}`)
    if (!APPLY) continue
    const r = await mergeGrantUpdate({ id: row.id, source: 'user_verified:queue-niche-tags-2026-09-11', db, fields: { niche_tags: merged } })
    if (r.applied.includes('niche_tags')) n++; else console.log('     not applied', r.rejected.map(x => x.field + ':' + x.reason))
  }
  console.log(`${APPLY ? 'tagged' : 'would tag'} ${APPLY ? n : Object.keys(T).length}`)
}
main().catch(e => { console.error(e); process.exit(1) })

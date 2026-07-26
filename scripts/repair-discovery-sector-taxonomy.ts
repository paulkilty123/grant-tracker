// Map discovery-queue sector values onto the catalogue's real taxonomy.
//
// process-discovery-queue carried its own 19-value sector list that overlapped
// VALID_SECTORS on only three values. Everything else it wrote was a string the
// matcher cannot read, so the row looked well-tagged in admin and matched
// nobody. The route now imports VALID_SECTORS and validates its output; this
// repairs the rows it already wrote.
//
// All affected rows are unpublished, so nothing users can see changes. Writing
// at system trust (50) rather than admin (100) deliberately: this is a
// mechanical taxonomy translation, not a human's judgement about the fund, and
// pinning it at admin trust would block the classifier from ever improving it.
//
//   npx tsx scripts/repair-discovery-sector-taxonomy.ts           # dry run
//   npx tsx scripts/repair-discovery-sector-taxonomy.ts --apply
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VALID_SECTORS } from '../src/lib/classify'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const SOURCE = 'system:sector_taxonomy_repair:v1'

/** Discovery's vocabulary -> the catalogue's. Compound values map to both. */
const TRANSLATION: Record<string, string[]> = {
  arts_culture:                ['creative'],
  children_families:           ['young_people'],
  community_development:       ['community'],
  disability:                  ['disability'],
  education_training:          ['education'],
  environment_conservation:    ['environment'],
  health_wellbeing:            ['health'],
  wellbeing:                   ['health'],
  heritage:                    ['heritage'],
  homelessness_housing:        ['housing'],
  human_rights_equality:       ['justice'],
  mental_health:               ['mental_health'],
  older_people:                ['older_people'],
  poverty_financial_inclusion: ['financial'],
  social_enterprise_support:   ['social_economy'],
  sport_recreation:            ['sport'],
  wildlife_biodiversity:       ['environment'],
  women_girls:                 ['women'],
  young_people:                ['young_people'],
  faith_communities:           ['community'],
}

async function main() {
  const apply = process.argv.includes('--apply')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  const { data, error } = await db
    .from('scraped_grants')
    .select('id, funder, title, impact_sectors, is_active')
  if (error) throw new Error(error.message)

  let applied = 0, rejected = 0, unmapped = 0
  for (const row of (data ?? []) as { id: string; funder: string | null; title: string | null; impact_sectors: string[] | null; is_active: boolean }[]) {
    const current = row.impact_sectors ?? []
    const foreign = current.filter(s => !VALID_SECTORS.has(s))
    if (!foreign.length) continue

    const translated: string[] = []
    const lost: string[] = []
    for (const s of current) {
      if (VALID_SECTORS.has(s)) { if (!translated.includes(s)) translated.push(s); continue }
      const mapped = TRANSLATION[s]
      if (!mapped) { lost.push(s); continue }
      for (const m of mapped) if (!translated.includes(m)) translated.push(m)
    }

    // Never write an empty list: a row with no sectors matches nobody, which is
    // the failure this whole repair exists to undo.
    if (!translated.length) {
      unmapped++
      console.log(`SKIP  ${row.funder} — ${row.title}\n      nothing maps: ${current.join(', ')}`)
      continue
    }

    console.log(`${row.is_active ? 'LIVE' : '    '}  ${row.funder} — ${row.title}`)
    console.log(`      ${current.join(', ')}\n   -> ${translated.join(', ')}${lost.length ? `   (dropped, no mapping: ${lost.join(', ')})` : ''}`)

    if (!apply) continue
    const result = await mergeGrantUpdate({
      id: row.id,
      fields: { impact_sectors: translated, sectors: translated },
      source: SOURCE,
      pinned: false,
      db,
    })
    if (result.applied.includes('impact_sectors')) applied++
    else { rejected++; console.log(`      REJECTED by trust ladder`) }
  }

  console.log(`\n${apply ? `applied ${applied}, rejected ${rejected}` : 'DRY RUN — nothing written'}, unmappable ${unmapped}`)
}

main().catch(e => { console.error(e); process.exit(1) })

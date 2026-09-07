// Citation correction, 2026-09-07. Lambeth Community Connections Fund.
//
// grant-tracker-be's read on batch 3: the stored citation was the sentence
// about WHEN spending must start (a compliance deadline), not the sentence
// that names revenue and capital as the two funded categories. The value
// (spend_types: ['capital','revenue']) is right and stays; only the citation
// swaps to the page's actual "what we fund" sentence.
//
// Same gap as the earlier Newcastle and Co-op fixes: mergeGrantUpdate checks
// idempotence by VALUE before trust, so writing the same array again would
// return `idempotent` and leave the old citation in place. This patches the
// one provenance entry directly and nothing else.
//
//   npx tsx --env-file=.env.local scripts/spend-fix-lambeth-citation-2026-09-07.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'

const APPLY = process.argv.includes('--apply')
const ID = '5a368644-3211-4a40-9447-d5594938a519'
const URL = 'https://www.lambeth.gov.uk/community-connections-fund/what-can-we-fund'
const OLD_SNIPPET = 'Successful projects will enter into a grant agreement with Lambeth Council and grant funding must begin being spent within 6 months of the grant agreement for revenue funding, and one year for capital projects.'
const NEW_SNIPPET = 'The fund supports both physical projects, such as community space or public realm projects, and non-physical projects like training and skills sharing, health and wellbeing, community safety, or cultural programmes.'

async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants')
    .select('id, title, spend_types, is_active, pipeline_state, field_provenance').eq('id', ID).single()
  if (!data) throw new Error('no row')
  if (!/Lambeth Community Connections Fund/.test(data.title)) throw new Error(`wrong row: ${data.title}`)
  const types = (data.spend_types as string[] | null) ?? []
  if (types.sort().join(',') !== 'capital,revenue') throw new Error(`spend_types is ${JSON.stringify(data.spend_types)}, not [capital, revenue] — stop`)

  const prov = structuredClone(data.field_provenance) as Record<string, { citation?: { snippet?: string; source_url?: string } }>
  const entry = prov?.spend_types
  if (!entry?.citation) throw new Error('no spend_types citation to correct')
  if (entry.citation.snippet === NEW_SNIPPET) { console.log('already corrected, nothing to do'); return }
  if (entry.citation.snippet !== OLD_SNIPPET) throw new Error(`citation is "${entry.citation.snippet}", not the one this script expects — leaving it alone`)

  const beforeState = { is_active: data.is_active, pipeline_state: data.pipeline_state }
  console.log(`${data.title}`)
  console.log(`  citation was: "${entry.citation.snippet}"`)
  console.log(`  citation ->   "${NEW_SNIPPET}"${APPLY ? '' : ' (dry run)'}`)
  if (!APPLY) return

  entry.citation.snippet = NEW_SNIPPET
  entry.citation.source_url = URL
  const { error } = await db.from('scraped_grants').update({ field_provenance: prov }).eq('id', ID)
  if (error) throw new Error(error.message)

  const after = await db.from('scraped_grants').select('is_active, pipeline_state').eq('id', ID).single()
  if (JSON.stringify(beforeState) !== JSON.stringify(after.data)) throw new Error('state moved — put it back')
  console.log('  done, state unchanged')
}
main().catch(e => { console.error(e); process.exit(1) })

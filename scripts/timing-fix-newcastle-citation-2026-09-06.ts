// Citation source_url correction, 2026-09-06. Newcastle Culture Investment Fund.
//
// The row's is_rolling citation pointed at
//   .../supporting-newcastle-based-organisations-to-engage-residents-in-culture/
// which is where the row's apply_url redirects to. Both URLs serve the same
// page, so the quote verifies either way — but the row's own apply_url carries
// the sentence, and a citation that points somewhere other than the row's page
// makes a reviewer check the wrong thing first. Flagged by the orchestrating
// session; the reading itself is unchanged.
//
// This cannot be fixed by re-running the batch script. mergeGrantUpdate is
// idempotent by value: is_rolling is already true, so the write is a no-op and
// the provenance — citation included — is left exactly as it was. Correcting a
// citation without changing the value it justifies therefore needs a direct
// write, which is what this does, to that one key and nothing else.
//
//   npx tsx --env-file=.env.local scripts/timing-fix-newcastle-citation-2026-09-06.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'

const APPLY = process.argv.includes('--apply')
const ID    = 'e3c90440-3ea2-4bb9-a98c-07cd5d32a2e2'
const RIGHT = 'https://www.communityfoundation.org.uk/grants/supporting-newcastle-based-arts-organisations-to-impact-the-health-and-wellbeing-of-newcastle-city-residents/'

async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants')
    .select('id, title, apply_url, is_rolling, field_provenance').eq('id', ID).single()
  if (!data) throw new Error('no row')
  if (!/Newcastle Culture Investment Fund/.test(data.title)) throw new Error(`wrong row: ${data.title}`)
  if (data.apply_url !== RIGHT) throw new Error(`apply_url has moved: ${data.apply_url}`)

  const prov = structuredClone(data.field_provenance) as Record<string, {
    source?: string
    citation?: { snippet: string; confidence: string; source_url?: string }
  }>
  const entry = prov?.is_rolling
  if (!entry?.citation) throw new Error('no is_rolling citation to correct')
  if (entry.source !== 'user_verified:timing-2026-09-06') {
    throw new Error(`is_rolling is now held by ${entry.source}, not this job — leaving it alone`)
  }

  console.log(`${data.title}`)
  console.log(`  snippet     "${entry.citation.snippet}"`)
  console.log(`  source_url  ${entry.citation.source_url}`)
  console.log(`  ${APPLY ? 'setting' : 'would set'}      ${RIGHT}`)
  if (entry.citation.source_url === RIGHT) { console.log('  already correct'); return }
  if (!APPLY) return

  entry.citation.source_url = RIGHT
  const { error } = await db.from('scraped_grants').update({ field_provenance: prov }).eq('id', ID)
  if (error) throw new Error(error.message)
  console.log('  done')
}
main().catch(e => { console.error(e); process.exit(1) })

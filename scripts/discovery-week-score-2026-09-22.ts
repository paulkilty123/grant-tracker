// Measured, not estimated: which of the 16 rows staged on 21 Sept 2026 score 55+
// for each of the seven trial organisations named in
// docs/handoffs/discovery-week-2026-09-22.md, and whether the row lists that
// organisation's legal_structure.
//
//   set -a; . ./.env.local; set +a; npx tsx scripts/discovery-week-score-2026-09-22.ts
import { getAdminDb } from '../src/lib/admin/admin-db'
import { normaliseScrapedGrant } from '../src/lib/grants-normalise'
import { computeMatchScore } from '../src/lib/matching'
import type { Organisation } from '../src/types'

const SRC = 'system:discovery-week-2026-09-22'
const FLOOR = 55
const ORG_PREFIXES = ['8a3139de', '2b8d875a', 'b35d2980', 'a33c3512', '98b5b3e3', '9bee94d2', 'ff6c8e7a']

async function main() {
  const db = getAdminDb()

  // Staged rows, read back from the view the matcher actually uses.
  const staged: Record<string, unknown>[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('grants_with_funder').select('*').eq('source', SRC).range(from, from + 999)
    if (error) throw error
    staged.push(...(data as Record<string, unknown>[]))
    if (!data || data.length < 1000) break
  }
  console.log(`staged rows visible in grants_with_funder for ${SRC}: ${staged.length}`)
  // Precondition: if this is 0 the whole measurement is void.
  if (staged.length === 0) throw new Error('precondition failed: no staged rows found, nothing can be measured')

  // grants_with_funder does not expose pipeline_state, so check the base table.
  const { data: base, error: berr } = await db
    .from('scraped_grants').select('id, is_active, pipeline_state, source').eq('source', SRC)
  if (berr) throw berr
  const bad = (base as { is_active: boolean; pipeline_state: string }[])
    .filter(r => r.is_active === true || r.pipeline_state !== 'tagged_awaiting_review')
  console.log(`staged rows in scraped_grants: ${base!.length}; active or not awaiting review (must be 0): ${bad.length}`)
  if (base!.length === 0) throw new Error('precondition failed: no staged rows in scraped_grants')
  if (bad.length) throw new Error('a staged row is live or in the wrong pipeline state')

  const { data: orgsRaw, error: oerr } = await db.from('organisations').select('*')
  if (oerr) throw oerr
  const orgs = (orgsRaw as Organisation[])

  for (const p of ORG_PREFIXES) {
    const org = orgs.find(o => o.id.startsWith(p))
    if (!org) { console.log(`\n${p}: ORG NOT FOUND`); continue }
    const rows = staged
      .map(r => {
        const g = normaliseScrapedGrant(r as never)
        return { g, raw: r, score: computeMatchScore(g, org).score }
      })
      .filter(x => x.score >= FLOOR)
      .sort((a, b) => b.score - a.score)
    const structOk = rows.filter(x => (x.raw.eligible_structures as string[] | null ?? []).includes(org.legal_structure as string))
    console.log(`\n${org.name} (${org.id.slice(0, 8)}) legal_structure=${org.legal_structure}`)
    console.log(`  staged rows scoring ${FLOOR}+: ${rows.length}; of those listing ${org.legal_structure}: ${structOk.length}`)
    for (const x of rows) {
      const ok = (x.raw.eligible_structures as string[] | null ?? []).includes(org.legal_structure as string)
      console.log(`    ${String(x.score).padStart(3)}  ${ok ? 'structure listed  ' : 'structure NOT list'}  ${x.g.title}`)
    }
  }

  // Sanity control: the floor must be able to exclude. Report the full spread.
  const org0 = orgs.find(o => o.id.startsWith(ORG_PREFIXES[0]))!
  const spread = staged.map(r => computeMatchScore(normaliseScrapedGrant(r as never), org0).score).sort((a, b) => a - b)
  console.log(`\ncontrol: score spread for ${org0.name} across all 16 staged rows: ${spread.join(', ')}`)
}

main().catch(e => { console.error(e); process.exit(1) })

// Why do Barbara Ward Children's + East End Community Foundation under-score for
// IoI? Per-dimension breakdown vs surfaced comparators (John Lyon's = local that
// cleared the bar; BBC CiN = children's that cleared it; Paul Hamlyn = top).
//   npx tsx --env-file=.env.local scripts/agent-eval/ioi-diagnose.ts

import { readFileSync } from 'fs'
import { resolve } from 'path'
try {
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
    let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v
  }
} catch { /* rely on --env-file */ }

const TEST_IOI = 'f1f9c904-ef5a-4591-8c6d-e7d9a1535133'
const TARGETS = ['Barbara Ward', 'East End Community', 'John Lyon', 'BBC Children', 'Paul Hamlyn']

async function main() {
  const repo = await import('../../src/lib/agent/tools/repository')
  const { computeMatchScore } = await import('../../src/lib/matching')
  const [org, catalogue] = await Promise.all([repo.getOrg(TEST_IOI), repo.getActiveCatalogue()])

  console.log('IoI profile: sectors [creative, education, community], beneficiaries [children, families, people_in_poverty], loc Newham/London, reach regional\n')

  for (const t of TARGETS) {
    // best-scoring catalogue row for this funder
    const rows = catalogue.filter(g => String((g as unknown as Record<string, unknown>).funder).toLowerCase().includes(t.toLowerCase()))
    if (!rows.length) { console.log(`── ${t}: no catalogue row\n`); continue }
    const best = rows.map(g => ({ g, r: computeMatchScore(g, org!) })).sort((a, b) => b.r.score - a.r.score)[0]
    const g = best.g as unknown as Record<string, unknown>
    const b = best.r.breakdown as unknown as Record<string, { score: number; max: number }>
    console.log(`── ${g.funder}  —  ${String(g.title).slice(0, 44)}`)
    console.log(`   TOTAL ${best.r.score}   loc ${b.location.score}/${b.location.max} · themes ${b.themes.score}/${b.themes.max} · benef ${b.beneficiaries.score}/${b.beneficiaries.max} · size ${b.grantSize.score}/${b.grantSize.max} · funderType ${b.funderType.score}/${b.funderType.max} · elig ${b.eligibility.score}/${b.eligibility.max}`)
    console.log(`   tags: sectors ${JSON.stringify(g.impactSectors ?? g.sectors ?? [])} | beneficiaries ${JSON.stringify(g.targetBeneficiaries ?? g.beneficiaryGroups ?? [])} | locationTag ${JSON.stringify(g.locationTag)} | funderType ${g.funderType} | amount ${g.amountMin}-${g.amountMax}`)
    if (best.r.positiveReasons?.length) console.log(`   + ${best.r.positiveReasons.join(' · ')}`)
    if (best.r.warnReasons?.length) console.log(`   ! ${best.r.warnReasons.join(' · ')}`)
    console.log('')
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })

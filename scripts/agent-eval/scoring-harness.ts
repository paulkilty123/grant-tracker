// Scoring-variant harness (F8 + Part B). ONE benchmark, MANY candidate scorers,
// comparable results. A "variant" is a MatchWeights config passed to the REAL
// computeMatchScore (so caps/freshness/IDF all apply — faithful, not an
// approximation). Each variant's scores rank through the SAME cash-first
// context.ts ordering, then the harness reports:
//   - RECALL: Devi's catalogued cash picks surfaced at the top-40 cut
//   - PRECISION (retention): her pursued funders in the top-10, the winner surfaced
//   - GUARD (overfitting): CGK + ACC top-candidate sanity — Devi is n=1, so a
//     variant that lifts her recall must not wreck other archetypes.
//
// Extensible: the semantic-similarity blend (Part B) and beneficiary-adjacency
// schemes plug in as alternative score functions over the same rows/orgs.
//
//   npx tsx --env-file=.env.local scripts/agent-eval/scoring-harness.ts

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
const DEVI_PREFIX = '7c89f4ff'
const CGK = '4ef429df-19d0-49b0-9c7b-ccb802b70a6d'
const ACC = '61cc84b1-0154-4107-a69f-2f8bb21b5e9d'
const CASH = new Set(['unrestricted', 'project', 'capital'])
const CHARS: Record<string, string[]> = { grant: ['unrestricted', 'project', 'capital'], investment: ['investment'], programme: [], in_kind: [] }

const norm = (s: string) => (s || '').toLowerCase().replace(/&/g, ' and ')
  .replace(/\b(the|foundation|trust|charitable|charity|fund|programme|program|limited|ltd|uk|of|for|and|grant|grants|company)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
const overlaps = (a: string, b: string) => { const na = norm(a), nb = norm(b); if (!na || !nb) return false; return na === nb || (na.length >= 4 && nb.includes(na)) || (nb.length >= 4 && na.includes(nb)) }

type W = { location: number; themesGrant: number; beneficiaryGrant: number; funderType: number; eligibility: number }
const base: W = { location: 15, themesGrant: 35, beneficiaryGrant: 20, funderType: 8, eligibility: 12 }
const VARIANTS: Array<{ name: string; w: W }> = [
  { name: 'baseline t35/b20', w: base },
  { name: 't30/b25', w: { ...base, themesGrant: 30, beneficiaryGrant: 25 } },
  { name: 't25/b30', w: { ...base, themesGrant: 25, beneficiaryGrant: 30 } },
  { name: 't20/b35', w: { ...base, themesGrant: 20, beneficiaryGrant: 35 } },
  { name: 't25/b30 loc20', w: { ...base, themesGrant: 25, beneficiaryGrant: 30, location: 20 } },
]

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const repo = await import('../../src/lib/agent/tools/repository')
  const { computeMatchScore, INCOME_MIDPOINTS } = await import('../../src/lib/matching')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const catalogue = await repo.getActiveCatalogue()

  async function cacheFor(orgId: string) {
    const [org, goal] = await Promise.all([repo.getOrg(orgId), repo.getGoal(orgId)])
    const gapChars = goal?.mix_targets && Object.keys(goal.mix_targets).length > 0 ? new Set(Object.keys(goal.mix_targets)) : CASH
    const gapApp = (t: string) => (CHARS[t] ?? Array.from(CASH)).some(c => gapChars.has(c))
    const gapRem = goal ? Math.max(0, goal.target_amount - goal.secured_amount) : 0
    const incomeMid = INCOME_MIDPOINTS[(org as unknown as { annual_income_band?: string }).annual_income_band ?? ''] ?? null
    const sizeBad = (min: number | null | undefined) => !min ? false : (gapRem > 0 && min > gapRem) || (!!incomeMid && min > incomeMid * 0.5)
    return { org, gapApp, sizeBad }
  }
  const rank = (cache: Awaited<ReturnType<typeof cacheFor>>, w: W) => catalogue
    .map(g => { const gg = g as unknown as Record<string, unknown>; return { funder: String(gg.funder), type: String(gg.fundingType), amountMin: gg.amountMin as number | null, s: computeMatchScore(g, cache.org!, undefined, w).score } })
    .sort((a, b) => { const ga = cache.gapApp(a.type), gb = cache.gapApp(b.type); if (ga !== gb) return ga ? -1 : 1; const sa = !cache.sizeBad(a.amountMin), sb2 = !cache.sizeBad(b.amountMin); if (sa !== sb2) return sa ? -1 : 1; return b.s - a.s })

  const ioiCache = await cacheFor(TEST_IOI), cgkCache = await cacheFor(CGK), accCache = await cacheFor(ACC)
  const { data: srcRows } = await sb.from('organisations').select('id').ilike('name', '%institute of imagination%')
  const devi = (srcRows ?? []).find(r => (r as { id: string }).id.startsWith(DEVI_PREFIX)) as { id: string }
  const { data: pipe } = await sb.from('pipeline_items').select('grant_name, funder_name').eq('org_id', devi.id)
  const devs = (pipe ?? []).map(p => (p as { funder_name?: string; grant_name: string }).funder_name || (p as { grant_name: string }).grant_name)

  console.log('variant           | recall@40 | top10 | winner | CGK guard         | ACC guard')
  console.log('------------------|-----------|-------|--------|-------------------|------------------')
  for (const V of VARIANTS) {
    const ir = rank(ioiCache, V.w)
    let denom = 0, recall = 0, top10 = 0, winner = 0
    for (const key of devs) {
      let best = -1, gap = false
      ir.forEach((r, i) => { if (overlaps(key, r.funder) && (best === -1 || i < best)) { best = i; gap = ioiCache.gapApp(r.type) } })
      if (best === -1) continue
      if (gap) { denom++; if (best < 40) recall++ }
      if (best < 10) top10++
      if (/national lottery community/i.test(key)) winner = best + 1
    }
    const guard = (c: typeof cgkCache) => { const t = rank(c, V.w).slice(0, 10); return { nc: t.filter(r => !c.gapApp(r.type)).length, sz: t.filter(r => c.sizeBad(r.amountMin)).length, top: t[0]?.funder.slice(0, 13) ?? '' } }
    const gc = guard(cgkCache), ga = guard(accCache)
    console.log(`${V.name.padEnd(17)} | ${(recall + '/' + denom).padStart(9)} | ${String(top10).padStart(5)} | ${('#' + winner).padStart(6)} | nc${gc.nc} sz${gc.sz} ${gc.top.padEnd(11)} | nc${ga.nc} sz${ga.sz} ${ga.top}`)
  }
  console.log('\nrecall@40 = Devi catalogued-cash picks in top-40 | top10 = her funders in top-10 | winner = National Lottery rank | guard nc/sz = non-cash/size-bad in top-10 (must be 0)')
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })

// Precise rank of every Devi pipeline funder in IoI's FULL ranked candidate list
// (context.ts ranking replicated uncapped), so near-miss vs deep-miss is visible.
//   npx tsx --env-file=.env.local scripts/agent-eval/ioi-rank-devi.ts

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
const CASH = new Set(['unrestricted', 'project', 'capital'])
const CHARS: Record<string, string[]> = { grant: ['unrestricted', 'project', 'capital'], investment: ['investment'], programme: [], in_kind: [] }

const norm = (s: string) => (s || '').toLowerCase().replace(/&/g, ' and ')
  .replace(/\b(the|foundation|trust|charitable|charity|fund|programme|program|limited|ltd|uk|of|for|and|grant|grants|company)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
const overlaps = (a: string, b: string) => {
  const na = norm(a), nb = norm(b); if (!na || !nb) return false
  return na === nb || (na.length >= 4 && nb.includes(na)) || (nb.length >= 4 && na.includes(nb))
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const repo = await import('../../src/lib/agent/tools/repository')
  const { computeMatchScore, INCOME_MIDPOINTS } = await import('../../src/lib/matching')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  const [goal, org, catalogue] = await Promise.all([repo.getGoal(TEST_IOI), repo.getOrg(TEST_IOI), repo.getActiveCatalogue()])
  if (!goal || !org) throw new Error('missing goal/org')
  const o = org as unknown as { annual_income_band?: string }

  const gapChars = goal.mix_targets && Object.keys(goal.mix_targets).length > 0 ? new Set(Object.keys(goal.mix_targets)) : CASH
  const gapApp = (t: string | null | undefined) => (CHARS[t ?? 'grant'] ?? Array.from(CASH)).some(c => gapChars.has(c))
  const gapRemaining = Math.max(0, goal.target_amount - goal.secured_amount)
  const incomeMid = INCOME_MIDPOINTS[o.annual_income_band ?? ''] ?? null
  const sizeBad = (min: number | null | undefined) => !min ? false : (gapRemaining > 0 && min > gapRemaining) || (!!incomeMid && min > incomeMid * 0.5)

  const ranked = catalogue.map(g => {
    const gg = g as Record<string, unknown>
    return { funder: String(gg.funder), title: String(gg.title), type: String(gg.fundingType), amountMin: gg.amountMin as number | null, score: computeMatchScore(g, org).score }
  }).sort((a, b) => {
    const ga = gapApp(a.type), gb = gapApp(b.type); if (ga !== gb) return ga ? -1 : 1
    const sa = !sizeBad(a.amountMin), sb2 = !sizeBad(b.amountMin); if (sa !== sb2) return sa ? -1 : 1
    return b.score - a.score
  })
  const cutScore = ranked[39]?.score ?? 0
  console.log(`Full ranked catalogue for IoI: ${ranked.length} rows. Top-40 cut score ≈ ${cutScore}.\n`)

  const { data: srcRows } = await sb.from('organisations').select('id').ilike('name', '%institute of imagination%')
  const devi = (srcRows ?? []).find(r => (r as { id: string }).id.startsWith(DEVI_PREFIX)) as { id: string }
  const { data: pipe } = await sb.from('pipeline_items').select('grant_name, funder_name, stage').eq('org_id', devi.id)
  const devs = (pipe ?? []) as Array<{ grant_name: string; funder_name: string | null; stage: string }>

  const rows = devs.map(d => {
    const key = d.funder_name || d.grant_name
    let best = -1, bestScore = 0, bestTitle = ''
    ranked.forEach((r, i) => {
      if ((overlaps(key, r.funder) || overlaps(d.grant_name, r.title)) && (best === -1 || i < best)) { best = i; bestScore = r.score; bestTitle = r.title }
    })
    return { key, stage: d.stage, rank: best === -1 ? null : best + 1, score: best === -1 ? null : bestScore, title: bestTitle }
  }).sort((a, b) => (a.rank ?? 99999) - (b.rank ?? 99999))

  console.log('Devi funder                                    stage       rank    score   band')
  for (const r of rows) {
    const band = r.rank == null ? 'NOT IN CATALOGUE' : r.rank <= 40 ? 'surfaced (top 40)' : r.rank <= 80 ? 'NEAR-MISS' : 'DEEP-MISS'
    console.log(`  ${r.key.slice(0, 44).padEnd(44)} ${r.stage.padEnd(11)} ${String(r.rank ?? '-').padStart(4)}  ${String(r.score ?? '-').padStart(5)}   ${band}`)
  }
  const near = rows.filter(r => r.rank && r.rank > 40 && r.rank <= 80).length
  const deep = rows.filter(r => r.rank && r.rank > 80).length
  const miss = rows.filter(r => r.rank == null).length
  console.log(`\nsurfaced ≤40: ${rows.filter(r => r.rank && r.rank <= 40).length} | near-miss (41-80): ${near} | deep-miss (>80): ${deep} | not catalogued: ${miss}`)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })

// Ground-truth blind comparison: the adviser's ranked candidate set for the
// test IoI (mirrored profile) vs Devi's real 32-item pipeline. Reports funder
// overlap, catalogue coverage of what Devi actually pursued, and what each side
// has that the other doesn't.
//   npx tsx --env-file=.env.local scripts/agent-eval/ioi-comparison.ts

import { readFileSync } from 'fs'
import { resolve } from 'path'
try {
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
    let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v
  }
} catch { /* rely on --env-file */ }

const TEST_IOI = 'f1f9c904-ef5a-4591-8c6d-e7d9a1535133' // mirrored test org (adviser)
const DEVI_IOI_PREFIX = '7c89f4ff'                       // Devi's real org (ground truth)

const norm = (s: string) => (s || '').toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/\b(the|foundation|trust|charitable|charity|fund|programme|program|limited|ltd|uk|of|for|and|grant|grants)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
const overlaps = (a: string, b: string) => {
  const na = norm(a), nb = norm(b); if (!na || !nb) return false
  return na === nb || (na.length >= 4 && nb.includes(na)) || (nb.length >= 4 && na.includes(nb))
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const repo = await import('../../src/lib/agent/tools/repository')
  const { assembleBriefingPack } = await import('../../src/lib/agent/context')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  // ── adviser side: IoI pack candidates (the matcher's ranked, eligibility-checked set)
  const [goal, pipeline, org] = await Promise.all([repo.getGoal(TEST_IOI), repo.getPipeline(TEST_IOI), repo.getOrg(TEST_IOI)])
  if (!goal || !org) throw new Error('test IoI missing goal/org')
  const [orgFacts, catalogue] = await Promise.all([repo.getOrgFacts(TEST_IOI), repo.getActiveCatalogue()])
  const pack = assembleBriefingPack({ org, goal, pipeline, orgFacts, catalogue, asOf: new Date().toISOString().slice(0, 10), userTurn: null })
  const cands = pack.candidates as unknown as Array<Record<string, unknown>>

  // ── ground truth: Devi's real pipeline
  const { data: srcRows } = await sb.from('organisations').select('id, name').ilike('name', '%institute of imagination%')
  const devi = (srcRows ?? []).find(r => (r as { id: string }).id.startsWith(DEVI_IOI_PREFIX)) as { id: string } | undefined
  if (!devi) throw new Error('Devi org not found')
  const { data: pipeRows } = await sb.from('pipeline_items').select('grant_name, funder_name, stage, amount_requested').eq('org_id', devi.id)
  const devs = (pipeRows ?? []) as Array<{ grant_name: string; funder_name: string | null; stage: string; amount_requested: number | null }>

  // ── whole-catalogue funder set (coverage: does the catalogue even hold Devi's funders?)
  const catFunders = Array.from(new Set(catalogue.map(g => (g as unknown as Record<string, unknown>).funder as string).filter(Boolean)))

  console.log(`ADVISER candidate set (IoI pack): ${cands.length} ranked, eligibility-checked`)
  console.log(`GROUND TRUTH (Devi's pipeline): ${devs.length} items`)
  console.log(`Catalogue funders total: ${catFunders.length}\n`)

  // ── Devi's pipeline, each tagged: surfaced by adviser? in catalogue at all?
  console.log('═══ DEVI\'S 32 — did the adviser find them? ═══')
  let surfaced = 0, inCat = 0, missing = 0
  const devFunders = devs.map(d => d.funder_name || d.grant_name)
  for (const d of devs.sort((a, b) => (a.funder_name || a.grant_name).localeCompare(b.funder_name || b.grant_name))) {
    const key = d.funder_name || d.grant_name
    const inPack = cands.find(c => overlaps(key, String(c.funder)) || overlaps(d.grant_name, String(c.title)))
    const inCatalogue = catFunders.find(f => overlaps(key, f))
    let tag = ''
    if (inPack) { tag = `✓ SURFACED (rank ~${cands.indexOf(inPack) + 1})`; surfaced++ }
    else if (inCatalogue) { tag = '◐ in catalogue, not surfaced'; inCat++ }
    else { tag = '✗ NOT in catalogue'; missing++ }
    console.log(`  [${d.stage.padEnd(10)}] ${(d.funder_name || d.grant_name).slice(0, 46).padEnd(46)} ${tag}`)
  }
  console.log(`\n  surfaced by adviser: ${surfaced}/${devs.length}  |  in catalogue but not surfaced: ${inCat}  |  not in catalogue: ${missing}`)

  // ── adviser's top candidates, tagged: in Devi's pipeline?
  console.log('\n═══ ADVISER top 20 — did Devi pursue them? ═══')
  cands.slice(0, 20).forEach((c, i) => {
    const inDevi = devFunders.find(df => overlaps(df, String(c.funder)))
    const el = (c.eligibility as { status?: string } | undefined)?.status ?? '?'
    console.log(`  ${String(i + 1).padStart(2)}. ${String(c.funder).slice(0, 40).padEnd(40)} ${String(c.fundingType).padEnd(9)} ${el.padEnd(16)} ${inDevi ? '✓ in Devi\'s pipeline' : ''}`)
  })
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })

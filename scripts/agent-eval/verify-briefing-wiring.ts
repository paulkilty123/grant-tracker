// Verify the wired guidance layer end-to-end through the REAL get_briefing tool
// (not authorBriefing directly): first call generates + caches an agent_runs
// row; second call must return the SAME generated_at (cache hit, no re-spend).
//
//   npx tsx --env-file=.env.local scripts/agent-eval/verify-briefing-wiring.ts "Common Ground"

import { readFileSync } from 'fs'
import { resolve } from 'path'
try {
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v
  }
} catch { /* rely on --env-file */ }

async function main() {
  const nameQuery = process.argv[2] ?? 'Common Ground'
  const { createClient } = await import('@supabase/supabase-js')
  const { getBriefing } = await import('../../src/lib/agent/tools')
  type Ctx = import('../../src/lib/agent/tools/types').ToolContext

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: orgRow } = await sb.from('organisations').select('id, name, owner_id').ilike('name', `%${nameQuery}%`).limit(1).maybeSingle()
  if (!orgRow) throw new Error(`org not found for "${nameQuery}"`)
  const o = orgRow as { id: string; name: string; owner_id: string }
  console.log(`Org: ${o.name} (${o.id})`)
  const ctx: Ctx = { orgId: o.id, surface: 'app', tier: 'companion', userId: o.owner_id }

  const t0 = Date.now()
  const r1 = await getBriefing(ctx, {})
  const ms1 = Date.now() - t0
  const p1 = r1.data
  if (!p1.has_goal) { console.log('no goal → onboarding payload; nothing to verify'); return }
  console.log(`\n[call 1] ${(ms1 / 1000).toFixed(1)}s  guidance=${p1.guidance ? 'present' : 'null'}`)
  if (p1.guidance) {
    console.log(`  generated_at: ${p1.guidance.generated_at}`)
    console.log(`  my_read: ${p1.guidance.my_read.slice(0, 90)}...`)
    console.log(`  agenda (${p1.guidance.agenda.length}):`)
    p1.guidance.agenda.forEach(x => console.log(`    - [${x.ref.split(':')[0]}] ${x.title}`))
  }

  const t1 = Date.now()
  const r2 = await getBriefing(ctx, {})
  const ms2 = Date.now() - t1
  const p2 = r2.data
  if (!p2.has_goal) return
  console.log(`\n[call 2] ${(ms2 / 1000).toFixed(1)}s  guidance=${p2.guidance ? 'present' : 'null'}  generated_at: ${p2.guidance?.generated_at}`)

  const cacheHit = p1.guidance && p2.guidance && p1.guidance.generated_at === p2.guidance.generated_at
  console.log(`\ncache hit on call 2 (same generated_at, no re-spend): ${cacheHit ? 'YES ✓' : 'NO ✗'}`)
  console.log(`call 2 faster (no LLM): ${ms2 < ms1 / 2 ? 'YES ✓' : 'no'}  (${(ms1 / 1000).toFixed(1)}s → ${(ms2 / 1000).toFixed(1)}s)`)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })

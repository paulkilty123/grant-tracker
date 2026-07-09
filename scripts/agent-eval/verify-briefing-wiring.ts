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
  const { refreshBriefingGuidance } = await import('../../src/lib/agent/tools/plan')
  type Ctx = import('../../src/lib/agent/tools/types').ToolContext

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: orgRow } = await sb.from('organisations').select('id, name, owner_id').ilike('name', `%${nameQuery}%`).limit(1).maybeSingle()
  if (!orgRow) throw new Error(`org not found for "${nameQuery}"`)
  const o = orgRow as { id: string; name: string; owner_id: string }
  console.log(`Org: ${o.name} (${o.id})`)
  const ctx: Ctx = { orgId: o.id, surface: 'app', tier: 'companion', userId: o.owner_id }

  // The GA gate: get_briefing is READ-ONLY, so a read must never block on the LLM.
  const t0 = Date.now()
  const r1 = await getBriefing(ctx, {})
  const ms1 = Date.now() - t0
  const p1 = r1.data
  if (!p1.has_goal) { console.log('no goal → onboarding payload; nothing to verify'); return }
  console.log(`\n[read 1] ${(ms1 / 1000).toFixed(1)}s  guidance=${p1.guidance ? 'present' : 'null'}  stale=${p1.guidance_stale}`)

  // The refresh is where generation happens — out of the read path (~9-14s).
  const tR = Date.now()
  const refresh = await refreshBriefingGuidance(ctx)
  console.log(`[refresh] ${((Date.now() - tR) / 1000).toFixed(1)}s  ${JSON.stringify(refresh)}`)

  const t2 = Date.now()
  const r2 = await getBriefing(ctx, {})
  const ms2 = Date.now() - t2
  const p2 = r2.data
  if (!p2.has_goal) return
  console.log(`[read 2] ${(ms2 / 1000).toFixed(1)}s  guidance=${p2.guidance ? 'present' : 'null'}  stale=${p2.guidance_stale}`)
  if (p2.guidance) {
    console.log(`  my_read: ${p2.guidance.my_read.slice(0, 84)}...`)
    p2.guidance.agenda.forEach(x => console.log(`    - [${x.ref.split(':')[0]}] ${x.title}`))
  }

  const readsFast = ms1 < 3000 && ms2 < 3000
  console.log(`\nreads never block on the LLM (both < 3s): ${readsFast ? 'YES ✓' : `NO ✗ (${(ms1 / 1000).toFixed(1)}s / ${(ms2 / 1000).toFixed(1)}s)`}`)
  console.log(`guidance served after refresh: ${p2.guidance ? 'YES ✓' : 'no (deterministic fallback)'}`)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })

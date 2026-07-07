// Schema smoke — verifies migrations 036 (goal purposes) and 037 (threads)
// end-to-end through the REAL tool/orchestrator layers on a throwaway org.
//
//   npx tsx --env-file=.env.local scripts/agent-eval/schema-smoke.ts
//
// No model calls — pure tool-layer + persistence checks, costs nothing.
// Each section self-gates: a missing migration reports SKIPPED with the exact
// file to apply, not a stack trace.

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
} catch { /* ambient env */ }

const rule = (t: string) => console.log(`\n${'─'.repeat(78)}\n${t}\n${'─'.repeat(78)}`)
let failures = 0
function check(label: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${!ok && detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const tools = await import('../../src/lib/agent/tools')
  const repo = await import('../../src/lib/agent/tools/repository')
  const threads = await import('../../src/lib/agent/orchestrator/threads')
  const { deriveMix, RULEBOOK_VERSION } = await import('../../src/lib/agent/tools/mix')
  const { STAGE_WEIGHTS } = await import('../../src/lib/agent/context')
  type Ctx = import('../../src/lib/agent/tools/types').ToolContext

  // ── rulebook v1.0 units (pure — no DB, no model) ───────────────────────────
  rule(`rulebook units — ${RULEBOOK_VERSION}`)
  const r2 = deriveMix([{ category: 'programme', label: 'x', approx_amount: 100 }])
  check('R2 programme → project 90 / unrestricted 10', r2.recommended_mix?.project === 90 && r2.recommended_mix?.unrestricted === 10)
  const r3a = deriveMix([{ category: 'staffing', label: 'x' }])
  check('R3 unrefined staffing carries the clarify question + 50/50 default',
    !!r3a.components[0].clarify && r3a.components[0].mapping?.project === 50)
  const r3b = deriveMix([{ category: 'staffing', label: 'x', refinement: 'delivery post' }])
  check('R3 delivery refinement → project 100, no clarify', r3b.components[0].mapping?.project === 100 && !r3b.components[0].clarify)
  const r3c = deriveMix([{ category: 'staffing', label: 'x', refinement: 'organisational' }])
  check('R3 organisational refinement → unrestricted 100', r3c.components[0].mapping?.unrestricted === 100)
  const r5 = deriveMix([{ category: 'capacity', label: 'x' }])
  check('R5 capacity carries clarify + programme/in_kind opportunity types',
    !!r5.components[0].clarify && JSON.stringify(r5.components[0].recommended_opportunity_types) === '["programme","in_kind"]')
  const r8 = deriveMix([{ category: 'match_funding', label: 'x', approx_amount: 10000 }])
  check('R8 match_funding on-rulebook (project 100)', r8.components[0].off_rulebook === false && r8.components[0].mapping?.project === 100)
  check('stage weights finalised (identified 0 / applying 0.25 / submitted 0.4)',
    STAGE_WEIGHTS.identified === 0 && STAGE_WEIGHTS.applying === 0.25 && STAGE_WEIGHTS.submitted === 0.4 && STAGE_WEIGHTS.won === 1)

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  const applied = {
    purposes: !(await sb.from('goal_purposes').select('id').limit(1)).error,
    pipelineCols: !(await sb.from('pipeline_items').select('purpose_id, source').limit(1)).error,
    threads: !(await sb.from('agent_threads').select('id').limit(1)).error,
  }

  const { data: anyOrg } = await sb.from('organisations').select('owner_id').limit(1).single()
  if (!anyOrg) throw new Error('could not read an owner_id')
  const ownerId = (anyOrg as { owner_id: string }).owner_id
  const { data: created, error: orgErr } = await sb.from('organisations').insert({
    name: 'ZZ Schema Smoke (delete me)', owner_id: ownerId,
    org_type: 'registered_charity', legal_structure: 'registered_charity',
    annual_income_band: '£100,000–£250,000', primary_location: 'UK-wide',
    geographic_reach: 'regional', impact_sectors: ['mental_health'],
    beneficiary_groups: ['young_people'], funding_type_preferences: ['grant'],
    min_grant_target: 5000, max_grant_target: 100000, years_trading: 5,
  }).select('id').single()
  if (orgErr || !created) throw new Error(`test org insert failed: ${orgErr?.message}`)
  const orgId = (created as { id: string }).id
  const ctx: Ctx = { orgId, surface: 'app', tier: 'companion', userId: ownerId }

  try {
    // ── 036: purposes end-to-end ─────────────────────────────────────────────
    rule('036 — goal purposes')
    if (!applied.purposes || !applied.pipelineCols) {
      console.log('  ⏭  SKIPPED — apply supabase/migrations/036_goal_purposes.sql first')
      failures += 1
    } else {
      const set1 = await tools.setFundingGoal(ctx, {
        title: 'Smoke goal', target_amount: 250000,
        start_date: '2026-01-01', end_date: '2026-12-31',
        purposes: [
          { category: 'core', label: 'Core running costs', approx_amount: 150000 },
          { category: 'programme', label: 'Youth programmes', approx_amount: 80000 },
          { category: 'capital', label: 'Minibus appeal', approx_amount: 20000 },
        ],
        secured_amount: 15000, // off-pipeline → should materialise as a pre_existing won item
      })
      check('set_funding_goal persists 3 purposes', set1.data.purposes.length === 3, `got ${set1.data.purposes.length}`)
      check('off-pipeline secured derives into goal (15000)', set1.data.goal.secured_amount === 15000, `got ${set1.data.goal.secured_amount}`)

      const { data: preRow } = await sb.from('pipeline_items').select('source, stage').eq('org_id', orgId).eq('source', 'pre_existing').maybeSingle()
      check('pre_existing won item exists with source marker', !!preRow && (preRow as Record<string, unknown>).stage === 'won')

      const capital = set1.data.purposes.find(p => p.category === 'capital')!
      const add = await tools.addToPipeline(ctx, {
        grant_name: 'Minibus Fund', funder_name: 'Vehicle Trust',
        stage: 'submitted', amount_requested: 20000, purpose_id: capital.purpose_id,
      })
      check('add_to_pipeline accepts purpose assignment', !!add.data.id)

      let badAssign = false
      try {
        await tools.addToPipeline(ctx, { grant_name: 'X', purpose_id: '00000000-0000-0000-0000-000000000000' })
      } catch { badAssign = true }
      check('foreign/unknown purpose_id rejected', badAssign)

      const progress = await repo.getPurposeProgress(orgId)
      const capProg = progress?.purposes.find(p => p.purpose_id === capital.purpose_id)
      check('per-purpose progress derives (capital weighted 8000 = 20000 × 0.4)', capProg?.weighted === 8000, `got ${capProg?.weighted}`)
      check('unassigned bucket carries the pre_existing win', progress?.unassigned.secured === 15000, `got ${progress?.unassigned.secured}`)

      await tools.updatePipelineItem(ctx, { pipeline_item_id: add.data.id, stage: 'won' })
      const progress2 = await repo.getPurposeProgress(orgId)
      const capProg2 = progress2?.purposes.find(p => p.purpose_id === capital.purpose_id)
      check('win moves per-purpose secured (20000)', capProg2?.secured === 20000, `got ${capProg2?.secured}`)

      // Goal ADJUSTMENT without purposes → re-parent, ids stable
      const set2 = await tools.setFundingGoal(ctx, {
        title: 'Smoke goal raised', target_amount: 300000,
        start_date: '2026-01-01', end_date: '2026-12-31',
      })
      check('adjustment supersedes prior goal', set2.data.superseded_prior)
      check('purposes carried forward on adjustment', set2.data.purposes.length === 3, `got ${set2.data.purposes.length}`)
      check('purpose ids stable across adjustment (pipeline refs survive)',
        set2.data.purposes.some(p => p.purpose_id === capital.purpose_id))
      check('secured derives across adjustment (15000 + 20000)', set2.data.goal.secured_amount === 35000, `got ${set2.data.goal.secured_amount}`)

      const upd = await tools.updateGoalPurposes(ctx, {
        add: [{ category: 'staffing', label: 'Youth worker post', approx_amount: 30000, refinement: 'delivery post' }],
        retire: [set1.data.purposes.find(p => p.category === 'programme')!.purpose_id],
      })
      check('update_goal_purposes add+retire', upd.data.added === 1 && upd.data.retired === 1 && upd.data.purposes.length === 3,
        `added ${upd.data.added} retired ${upd.data.retired} now ${upd.data.purposes.length}`)
      check('refinement persists and reads back', upd.data.purposes.find(p => p.category === 'staffing')?.refinement === 'delivery post')

      const plan = await tools.getPlanState(ctx, {})
      check('get_plan_state carries purposes block', plan.data.has_goal === true && !!plan.data.purposes && plan.data.purposes.items.length === 3)
    }

    // ── 037: threads ─────────────────────────────────────────────────────────
    rule('037 — thread persistence')
    if (!applied.threads) {
      console.log('  ⏭  SKIPPED — apply supabase/migrations/037_agent_threads.sql first')
      failures += 1
    } else {
      const t1 = await threads.getOrCreateActiveThread(orgId)
      const t2 = await threads.getOrCreateActiveThread(orgId)
      check('one active thread per org (stable id)', !!t1 && t1 === t2)

      await threads.appendTurn(t1!, orgId, [
        { role: 'user', content: 'Where do we stand?' },
        { role: 'assistant', content: [{ type: 'text', text: 'Let me check.' }, { type: 'tool_use', id: 'tu_1', name: 'get_briefing', input: {} }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: '{"gap": 100}' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Here is where you stand.' }] },
      ], { turnKind: 'chat', usage: { model: 'smoke', input_tokens: 1, output_tokens: 1, cost_estimate_microgbp: 0, duration_ms: 1, tool_names: ['get_briefing'], loop_iterations: 2 } })

      const history = await threads.loadThreadHistory(t1!)
      check('turn persists and replays (4 messages)', history.length === 4, `got ${history.length}`)
      check('replay opens on a plain user message', history[0]?.role === 'user' && typeof history[0]?.content === 'string')

      const view = await threads.loadThreadView(t1!)
      check('drawer view folds tool_result carriers (3 visible)', view.length === 3, `got ${view.length}`)
      check('drawer view carries tool names', view.some(v => v.tool_names.includes('get_briefing')))
    }
  } finally {
    rule('CLEANUP')
    await sb.from('events').delete().eq('org_id', orgId)
    await sb.from('pipeline_items').delete().eq('org_id', orgId)
    if (applied.threads) await sb.from('agent_threads').delete().eq('org_id', orgId) // cascades messages
    if (applied.purposes) await sb.from('goal_purposes').delete().eq('org_id', orgId)
    await sb.from('goals').delete().eq('org_id', orgId)
    const { error: delErr } = await sb.from('organisations').delete().eq('id', orgId)
    console.log(`org delete err: ${delErr?.message ?? 'none'}`)
  }

  rule('RESULT')
  console.log(failures === 0 ? '✓ schema smoke clean' : `✗ ${failures} failure(s)/skip(s)`)
  process.exit(failures === 0 ? 0 : 2)
}

main().catch(e => { console.error('\nFATAL:', e); process.exit(1) })

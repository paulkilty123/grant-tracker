// Live orchestrator end-to-end — the conversational loop against the real
// tool layer, real goals table, real catalogue. Companion piece to
// live-strategist.ts: that validated the tools in isolation; this validates
// the SECOND consumer (the in-app orchestrator) driving them multi-turn.
//
//   npx tsx --env-file=.env.local scripts/agent-eval/live-orchestrator.ts
//
// Costs real (small) money: ~4 model turns on AGENT_CHAT_MODEL (default
// Sonnet 4.6 via llm.ts AGENT_MODEL; override with env to A/B).
//
// Scripted turns, seeded from the MCP test transcript's probes:
//   T1  "where do we stand" with NO goal      → get_briefing → onboarding relay
//   T2  states target + deadline + mix        → set_funding_goal (mix inference)
//   T3  "give me my briefing" (strategist)    → get_briefing full → constraint-led readout
//   T4  "mark the X grant won" BY NAME        → get_pipeline → update_pipeline_item
//                                               (outcomes entering the system in conversation)
//   T5  asks for application prose            → REFUSAL (scaffold-not-ghostwriter)
//
// A dedicated throwaway org is created and cascade-deleted in `finally`.

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
} catch { /* rely on --env-file / ambient env */ }

const rule = (t: string) => console.log(`\n${'─'.repeat(78)}\n${t}\n${'─'.repeat(78)}`)
const gbp = (micro: number) => `£${(micro / 1e6).toFixed(4)}`

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const { addToPipeline } = await import('../../src/lib/agent/tools')
  const { runAgentTurn } = await import('../../src/lib/agent/orchestrator/loop')
  const { pickModel } = await import('../../src/lib/agent/orchestrator/config')
  type Ctx = import('../../src/lib/agent/tools/types').ToolContext
  type MessageParam = import('@anthropic-ai/sdk').default.MessageParam

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  const { data: anyOrg, error: ownerErr } = await sb.from('organisations').select('owner_id').limit(1).single()
  if (ownerErr || !anyOrg) throw new Error(`could not read an owner_id: ${ownerErr?.message}`)
  const ownerId = (anyOrg as { owner_id: string }).owner_id

  const orgRow = {
    name: 'ZZ Orchestrator E2E (delete me)',
    owner_id: ownerId,
    org_type: 'registered_charity',
    legal_structure: 'registered_charity',
    annual_income_band: '£100,000–£250,000',
    primary_location: 'UK-wide',
    geographic_reach: 'regional',
    impact_sectors: ['mental_health', 'education', 'young_people'],
    beneficiary_groups: ['young_people', 'children', 'families'],
    funding_type_preferences: ['grant', 'investment', 'in_kind'],
    min_grant_target: 5000,
    max_grant_target: 100000,
    years_trading: 5,
  }
  const { data: created, error: orgErr } = await sb.from('organisations').insert(orgRow).select('id').single()
  if (orgErr || !created) throw new Error(`test org insert failed: ${orgErr?.message}`)
  const orgId = (created as { id: string }).id
  const ctx: Ctx = { orgId, surface: 'app', tier: 'companion', userId: ownerId }
  console.log(`Test org: ${orgId} — chat model ${pickModel('chat')}, strategist model ${pickModel('strategist')}`)

  const totals = { input: 0, output: 0, micro: 0 }
  let history: MessageParam[] = []

  async function turn(label: string, userTurn: string, kind: 'chat' | 'strategist') {
    rule(`${label}  [${kind}]  «${userTurn}»`)
    const events: string[] = []
    const res = await runAgentTurn({
      ctx, history, userTurn, turnKind: kind,
      onEvent: ev => {
        if (ev.type === 'tool_start') events.push(`→ tool ${ev.name}`)
        if (ev.type === 'tool_done') events.push(`← ${ev.name} ${ev.ok ? 'ok' : 'ERROR'}`)
      },
    })
    history = res.messages
    if (events.length) console.log(events.join('\n'))
    console.log(`\n${res.text.trim()}\n`)
    console.log(`   [${res.usage.loop_iterations} iteration(s) · in ${res.usage.input_tokens} / out ${res.usage.output_tokens} tokens · ${gbp(res.usage.cost_estimate_microgbp)} · ${res.usage.duration_ms}ms]`)
    totals.input += res.usage.input_tokens
    totals.output += res.usage.output_tokens
    totals.micro += res.usage.cost_estimate_microgbp
    return res
  }

  try {
    // Seed a small pipeline through the tool layer (one 'won' so secured derives).
    for (const it of [
      { grant_name: 'Youth Mental Health Fund', funder_name: 'Wellbeing Trust', stage: 'won' as const, amount_requested: 40000 },
      { grant_name: 'Community Resilience Grant', funder_name: 'Resilience Foundation', stage: 'applying' as const, amount_requested: 30000 },
    ]) await addToPipeline(ctx, it)

    await turn('T1', 'Where do we stand against our funding goal?', 'chat')

    await turn('T2', 'Our target is £250,000 by the end of December 2026, starting from January. Aim for 70% grants, 20% contracts, 10% corporate. We won’t take gambling or arms money.', 'chat')

    const t3 = await turn('T3', 'Give me my briefing — where do I stand and what should I do next?', 'strategist')

    const t4 = await turn('T4', 'Good news — the Community Resilience Grant came through at the full £30,000. Mark it won.', 'chat')

    await turn('T5', 'Great — now draft the first two paragraphs of our application to the strongest candidate you mentioned.', 'chat')

    rule('SESSION TOTALS')
    console.log(`turns: 5 · input ${totals.input} tokens · output ${totals.output} tokens · est. ${gbp(totals.micro)}`)
    console.log(`outcome loop in T4: ${t4.usage.tool_names.join(', ') || '(none)'}`)
    console.log(`briefing tools used in T3: ${t3.usage.tool_names.join(', ') || '(none)'}`)
  } finally {
    rule('CLEANUP')
    await sb.from('events').delete().eq('org_id', orgId)
    await sb.from('pipeline_items').delete().eq('org_id', orgId)
    await sb.from('goals').delete().eq('org_id', orgId)
    const { error: delErr } = await sb.from('organisations').delete().eq('id', orgId)
    const left = await Promise.all([
      sb.from('goals').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
      sb.from('pipeline_items').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
      sb.from('organisations').select('id', { count: 'exact', head: true }).eq('id', orgId),
    ])
    console.log(`org delete err: ${delErr?.message ?? 'none'}`)
    console.log(left.every(r => (r.count ?? 0) === 0) ? '✓ CLEANUP OK — nothing left behind' : '✗ CLEANUP INCOMPLETE — inspect manually')
  }
}

main().then(() => process.exit(0)).catch(e => { console.error('\nFATAL:', e); process.exit(1) })

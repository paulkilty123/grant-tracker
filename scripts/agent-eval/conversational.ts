// Conversational eval runner (build-spec §14.1.4) — drives the orchestrator
// live against the real tool layer, one throwaway org per case, and grades the
// transcript programmatically. Costs a few pence per full run on the pinned
// lane models (§14.4).
//
//   npx tsx --env-file=.env.local scripts/agent-eval/conversational.ts
//   npx tsx --env-file=.env.local scripts/agent-eval/conversational.ts --case CV-04
//
// Exit codes: 0 all assertions pass · 2 assertion failures (model behaviour
// regression — read the report) · 1 fatal (harness broke).
//
// The number lint is the conversational counterpart of gate G6: every £ figure
// in assistant text must be traceable to a tool result or the user's own words
// in this conversation — rounded, blended, or model-computed figures fail.

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
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

import { CONVERSATIONAL_CASES, type ConversationalCase, type TurnAssertions } from './conversational-cases'

const rule = (t: string) => console.log(`\n${'─'.repeat(78)}\n${t}\n${'─'.repeat(78)}`)

interface AssertionResult { pass: boolean; label: string; detail?: string }
interface TurnRecord {
  user: string
  kind: string
  text: string
  tool_calls: Array<{ name: string; input: Record<string, unknown> }>
  usage: { input_tokens: number; output_tokens: number; cost_estimate_microgbp: number }
  assertions: AssertionResult[]
}
interface CaseRecord { id: string; title: string; pass: boolean; turns: TurnRecord[]; error?: string }

// ── number lint ──────────────────────────────────────────────────────────────

function harvestAllowedNumbers(text: string, into: Set<number>): void {
  const re = /\d[\d,]*(?:\.\d+)?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[0].replace(/,/g, ''))
    if (Number.isFinite(n)) into.add(Math.round(n))
  }
}

function lintPoundFigures(assistantText: string, allowed: Set<number>): AssertionResult {
  const offenders: string[] = []
  const re = /£\s?([\d.,]+)\s*(k|m)?\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(assistantText)) !== null) {
    const raw = Number(m[1].replace(/,/g, ''))
    if (!Number.isFinite(raw)) continue
    const mult = m[2]?.toLowerCase() === 'k' ? 1_000 : m[2]?.toLowerCase() === 'm' ? 1_000_000 : 1
    const value = Math.round(raw * mult)
    if (!allowed.has(value)) offenders.push(`${m[0].trim()} (=${value})`)
  }
  return offenders.length
    ? { pass: false, label: 'number lint', detail: `£ figures not traceable to tool results or user turns: ${offenders.join(', ')}` }
    : { pass: true, label: 'number lint' }
}

// ── assertion evaluation ─────────────────────────────────────────────────────

function evaluateTurn(
  a: TurnAssertions,
  text: string,
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>,
  allowedNumbers: Set<number>,
): AssertionResult[] {
  const out: AssertionResult[] = []
  const called = toolCalls.map(t => t.name)

  for (const tool of a.mustCallTools ?? []) {
    out.push(called.includes(tool)
      ? { pass: true, label: `calls ${tool}` }
      : { pass: false, label: `calls ${tool}`, detail: `called: [${called.join(', ') || 'none'}]` })
  }
  for (const tool of a.mustNotCallTools ?? []) {
    out.push(!called.includes(tool)
      ? { pass: true, label: `does not call ${tool}` }
      : { pass: false, label: `does not call ${tool}` })
  }
  for (const { re, why } of a.mustMatch ?? []) {
    out.push(re.test(text)
      ? { pass: true, label: `matches: ${why}` }
      : { pass: false, label: `matches: ${why}`, detail: `pattern ${re}` })
  }
  for (const { re, why } of a.mustNotMatch ?? []) {
    const m = text.match(re)
    out.push(!m
      ? { pass: true, label: `avoids: ${why}` }
      : { pass: false, label: `avoids: ${why}`, detail: `matched "${m[0]}"` })
  }
  for (const { tool, check } of a.toolInput ?? []) {
    const call = toolCalls.find(t => t.name === tool)
    if (!call) { out.push({ pass: false, label: `${tool} input`, detail: 'tool not called' }); continue }
    const problem = check(call.input)
    out.push(problem
      ? { pass: false, label: `${tool} input`, detail: problem }
      : { pass: true, label: `${tool} input` })
  }
  if (a.numberLint) out.push(lintPoundFigures(text, allowedNumbers))
  return out
}

// ── runner ───────────────────────────────────────────────────────────────────

async function runCase(c: ConversationalCase): Promise<CaseRecord> {
  const { createClient } = await import('@supabase/supabase-js')
  const { addToPipeline, setFundingGoal } = await import('../../src/lib/agent/tools')
  const { runAgentTurn } = await import('../../src/lib/agent/orchestrator/loop')
  type Ctx = import('../../src/lib/agent/tools/types').ToolContext
  type MessageParam = import('@anthropic-ai/sdk').default.MessageParam

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: anyOrg } = await sb.from('organisations').select('owner_id').limit(1).single()
  if (!anyOrg) throw new Error('could not read an owner_id')
  const ownerId = (anyOrg as { owner_id: string }).owner_id

  const { data: created, error: orgErr } = await sb.from('organisations').insert({
    name: `ZZ Conversational Eval ${c.id} (delete me)`,
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
  }).select('id').single()
  if (orgErr || !created) throw new Error(`test org insert failed: ${orgErr?.message}`)
  const orgId = (created as { id: string }).id
  const ctx: Ctx = { orgId, surface: 'app', tier: 'companion', userId: ownerId }

  const record: CaseRecord = { id: c.id, title: c.title, pass: true, turns: [] }
  try {
    for (const item of c.setup.pipeline) await addToPipeline(ctx, item)
    if (c.setup.goal) await setFundingGoal(ctx, c.setup.goal)

    let history: MessageParam[] = []
    const allowedNumbers = new Set<number>()

    for (const t of c.turns) {
      harvestAllowedNumbers(t.user, allowedNumbers)
      const before = history.length + 1 // +1 for the user turn the loop appends
      const res = await runAgentTurn({ ctx, history, userTurn: t.user, turnKind: t.kind })
      const newMessages = res.messages.slice(before)
      history = res.messages

      const toolCalls: Array<{ name: string; input: Record<string, unknown> }> = []
      for (const msg of newMessages) {
        if (!Array.isArray(msg.content)) continue
        for (const block of msg.content) {
          if (typeof block === 'object' && block !== null && 'type' in block) {
            if (block.type === 'tool_use') {
              toolCalls.push({ name: String(block.name), input: (block.input ?? {}) as Record<string, unknown> })
            }
            if (block.type === 'tool_result') {
              harvestAllowedNumbers(typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? ''), allowedNumbers)
            }
          }
        }
      }

      const assertions = evaluateTurn(t.assert, res.text, toolCalls, allowedNumbers)
      if (assertions.some(x => !x.pass)) record.pass = false
      record.turns.push({
        user: t.user, kind: t.kind, text: res.text, tool_calls: toolCalls,
        usage: { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens, cost_estimate_microgbp: res.usage.cost_estimate_microgbp },
        assertions,
      })
    }
  } finally {
    await sb.from('events').delete().eq('org_id', orgId)
    await sb.from('pipeline_items').delete().eq('org_id', orgId)
    await sb.from('goals').delete().eq('org_id', orgId)
    await sb.from('organisations').delete().eq('id', orgId)
  }
  return record
}

function renderMd(records: CaseRecord[], model: string): string {
  const lines: string[] = [`# Conversational eval — ${new Date().toISOString()}`, '', `Model: ${model}`, '']
  for (const r of records) {
    lines.push(`## ${r.id} — ${r.title} — ${r.pass ? '✅ PASS' : '❌ FAIL'}`, '')
    r.turns.forEach((t, i) => {
      lines.push(`### Turn ${i + 1} [${t.kind}]`, '', `> ${t.user}`, '')
      lines.push(`Tools: ${t.tool_calls.map(c => c.name).join(', ') || '(none)'}`)
      for (const a of t.assertions) lines.push(`- ${a.pass ? '✅' : '❌'} ${a.label}${a.detail ? ` — ${a.detail}` : ''}`)
      lines.push('', '<details><summary>transcript</summary>', '', t.text.trim(), '', '</details>', '')
    })
  }
  return lines.join('\n')
}

async function main() {
  const caseFilter = process.argv.includes('--case') ? process.argv[process.argv.indexOf('--case') + 1] : null
  const cases = caseFilter ? CONVERSATIONAL_CASES.filter(c => c.id === caseFilter) : CONVERSATIONAL_CASES
  if (!cases.length) throw new Error(`no case matches '${caseFilter}'`)

  const { pickModel } = await import('../../src/lib/agent/orchestrator/config')
  const records: CaseRecord[] = []
  let micro = 0

  for (const c of cases) {
    rule(`${c.id} — ${c.title}`)
    console.log(`seed: ${c.seed}`)
    let r: CaseRecord
    try {
      r = await runCase(c)
    } catch (e) {
      // A dead case must not kill the suite (or lose the report to a stale file).
      r = { id: c.id, title: c.title, pass: false, turns: [], error: e instanceof Error ? e.message : String(e) }
      console.log(`  ✗ case errored: ${r.error}`)
    }
    records.push(r)
    for (const t of r.turns) {
      micro += t.usage.cost_estimate_microgbp
      console.log(`  tools: ${t.tool_calls.map(x => x.name).join(', ') || '(none)'}`)
      for (const a of t.assertions) console.log(`  ${a.pass ? '✅' : '❌'} ${a.label}${a.detail ? ` — ${a.detail}` : ''}`)
    }
    console.log(r.pass ? `${c.id} PASS` : `${c.id} FAIL`)
  }

  mkdirSync(resolve(process.cwd(), 'scripts/agent-eval/reports'), { recursive: true })
  writeFileSync(resolve(process.cwd(), 'scripts/agent-eval/reports/latest-conversational.json'), JSON.stringify(records, null, 2))
  writeFileSync(resolve(process.cwd(), 'scripts/agent-eval/reports/latest-conversational.md'), renderMd(records, pickModel('chat')))

  const failed = records.filter(r => !r.pass)
  rule('SUMMARY')
  console.log(`${records.length - failed.length}/${records.length} cases pass · est. cost £${(micro / 1e6).toFixed(4)}`)
  console.log('report: scripts/agent-eval/reports/latest-conversational.{json,md}')
  if (failed.length) {
    console.log(`failing: ${failed.map(f => f.id).join(', ')}`)
    process.exit(2)
  }
}

main().then(() => process.exit(0)).catch(e => { console.error('\nFATAL:', e); process.exit(1) })

// Goal-agent eval runner.
//
//   --stub          (default) deterministic stub reasoner → gates + assertions
//   --assemble-only context pack build only, no reasoner
//   --full          real reasoning pass (LLM) → gates + assertions + R1–R7 judge
//   --case GS-NN    run a single case
//   --consistency N run each case N times (full mode: aggregate gates/rubric)
//
// --full needs ANTHROPIC_API_KEY (loaded from .env.local below) and makes live
// model calls (cost is instrumented per case).

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import path from 'path'
import { loadCases } from './cases'
import { buildPack } from './pack'
import { stubReason } from './stub-reasoner'
import { runGates, runAssertions } from './graders/gates'
import { runJudge, rubricScore } from './graders/judge'
import { reason } from '../../src/lib/agent/reason'
import { AGENT_MODEL } from '../../src/lib/agent/llm'
import type { CaseResult, AgentRunOutput, BriefingPack, GoldenCase } from '../../src/lib/agent/types'

const ROOT = path.resolve(__dirname, '../..')
const REPORTS_DIR = path.resolve(__dirname, 'reports')

// Load .env.local so --full can reach ANTHROPIC_API_KEY (no dotenv dep).
try {
  for (const line of readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* env optional for --stub / --assemble-only */ }

function parseArgs(argv: string[]) {
  const a = { mode: 'stub' as 'stub' | 'assemble-only' | 'full' | 'regrade', only: '', consistency: 1 }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t === '--assemble-only') a.mode = 'assemble-only'
    else if (t === '--full') a.mode = 'full'
    else if (t === '--regrade') a.mode = 'regrade'
    else if (t === '--stub') a.mode = 'stub'
    else if (t === '--case') a.only = argv[++i] ?? ''
    else if (t === '--consistency') a.consistency = Math.max(1, parseInt(argv[++i] ?? '1', 10) || 1)
  }
  return a
}

interface Summary {
  mode: string; cases: number; fixturesResolved: number
  gatesPass: number; assertionsPass: number; rubricPass: number; fullPass: number
  schemaErrors: number; totalCostMicroGbp: number; model: string; results: CaseResult[]
}

async function evalFull(c: GoldenCase, pack: BriefingPack, runs: number): Promise<{ result: Partial<CaseResult>; output: AgentRunOutput | null }> {
  const gateFails = new Set<string>()
  const assertFails = new Set<string>()
  let lastGates: CaseResult['gates'] = []
  let lastAsserts: CaseResult['assertions'] = []
  const scoreList: number[] = []
  let minDimAll = 5
  let cost = 0
  let lastNote = ''
  let lastScores: Record<string, number> = {}
  let model = AGENT_MODEL
  let lastOutput: AgentRunOutput | null = null

  for (let i = 0; i < runs; i++) {
    const r = await reason(pack)
    model = r.model
    cost += r.usage.costMicroGbp
    const output: AgentRunOutput = r.output
    lastOutput = output
    const gates = runGates(output, pack, c)
    const asserts = runAssertions(output, pack, c)
    lastGates = gates; lastAsserts = asserts
    for (const g of gates) if (!g.pass) gateFails.add(g.gate)
    for (const a of asserts) if (!a.pass) assertFails.add(a.assertion)
    const j = await runJudge(output, pack, c)
    if (j.usage) cost += j.usage.costMicroGbp
    const rs = rubricScore(j.scores, c.expected.rubric_focus)
    scoreList.push(rs.score); minDimAll = Math.min(minDimAll, rs.minDim)
    lastNote = j.note; lastScores = j.scores
  }

  const meanScore = scoreList.length ? Math.round((scoreList.reduce((a, b) => a + b, 0) / scoreList.length) * 100) / 100 : 0
  const gatesPass = gateFails.size === 0
  const assertionsPass = assertFails.size === 0
  const rubricPass = meanScore >= 4 && minDimAll >= 3
  return {
    result: {
      gates: lastGates, assertions: lastAsserts, gatesPass, assertionsPass,
      rubric: { score: meanScore, minDim: minDimAll, scores: lastScores, note: lastNote },
      rubricPass, pass: gatesPass && assertionsPass && rubricPass, costMicroGbp: cost, model,
    },
    output: lastOutput,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const isFull = args.mode === 'full' || args.mode === 'regrade'
  const loaded = loadCases().filter(l => !args.only || l.case.id === args.only)
  if (loaded.length === 0) { console.error('No cases loaded.'); process.exit(1) }
  const loadErrors = loaded.filter(l => l.errors.length > 0)

  console.log(`\n══ Goal-agent eval — ${args.mode} mode (${loaded.length} cases${args.consistency > 1 ? `, ×${args.consistency}` : ''}) ══`)
  console.log(`Cases loaded: ${loaded.length}  |  schema-valid: ${loaded.length - loadErrors.length}/${loaded.length}`)
  for (const l of loadErrors) console.log(`  SCHEMA ${l.case.id}: ${l.errors.join(' · ')}`)
  if (args.mode === 'full') console.log(`Reasoning model: ${AGENT_MODEL}  (live calls; cost instrumented)`)

  const results: CaseResult[] = []
  const rawOutputs: Record<string, AgentRunOutput> = {}

  // Re-grade replays the saved outputs of the last --full run through the
  // graders — free (no LLM), so grader iteration costs nothing.
  let savedOutputs: Record<string, AgentRunOutput> = {}
  const priorById: Record<string, CaseResult> = {}
  if (args.mode === 'regrade') {
    savedOutputs = JSON.parse(readFileSync(path.join(REPORTS_DIR, 'latest-full-outputs.json'), 'utf8'))
    const prior = JSON.parse(readFileSync(path.join(REPORTS_DIR, 'latest-full.json'), 'utf8')) as { results?: CaseResult[] }
    for (const r of prior.results ?? []) priorById[r.id] = r
    console.log('Re-grading saved --full outputs (no LLM calls).')
  }

  for (const l of loaded) {
    const c = l.case
    let pack: BriefingPack
    try { pack = buildPack(c) } catch (err) {
      results.push({ id: c.id, version: c.version, family: c.family, mode: c.run_mode, fixturesResolved: false, gates: [], assertions: [], gatesPass: false, assertionsPass: false, pass: false, notes: [`pack build threw: ${(err as Error).message}`] })
      continue
    }
    const fixturesResolved = (pack.candidates.length + pack.ruleOutAnnex.length) > 0
    const base: CaseResult = { id: c.id, version: c.version, family: c.family, mode: c.run_mode, fixturesResolved, gates: [], assertions: [], gatesPass: fixturesResolved, assertionsPass: true, pass: fixturesResolved, notes: [] }

    if (args.mode === 'assemble-only') {
      base.notes = [`pack: ${pack.candidates.length} candidates, ${pack.ruleOutAnnex.length} ruled out, gap £${pack.arithmetic.gap.toLocaleString('en-GB')}`]
      results.push(base); continue
    }
    if (args.mode === 'regrade') {
      const output = savedOutputs[c.id]
      if (!output) { results.push({ ...base, gatesPass: false, pass: false, notes: ['no saved output — run --full first'] }); continue }
      const gates = runGates(output, pack, c)
      const assertions = runAssertions(output, pack, c)
      const gatesPass = gates.every(g => g.pass), assertionsPass = assertions.every(a => a.pass)
      const prior = priorById[c.id]
      const rubric = prior?.rubric ?? null
      const rubricPass = !!rubric && rubric.score >= 4 && rubric.minDim >= 3
      results.push({ ...base, gates, assertions, gatesPass, assertionsPass, rubric, rubricPass, pass: gatesPass && assertionsPass && rubricPass, costMicroGbp: prior?.costMicroGbp ?? 0, model: prior?.model, notes: ['regraded'] })
      const r = results[results.length - 1]
      console.log(`  ${r.pass ? '✓' : '·'} ${r.id} [${r.family}] gates ${r.gates.filter(g => g.pass).length}/${r.gates.length}  rubric ${r.rubric?.score ?? '—'} (min ${r.rubric?.minDim ?? '—'})  assert ${r.assertions.filter(a => a.pass).length}/${r.assertions.length}`)
      for (const g of r.gates.filter(g => !g.pass)) console.log(`      ✗ ${g.gate}: ${g.detail}`)
      continue
    }
    if (args.mode === 'stub') {
      const output = stubReason(pack)
      const gates = runGates(output, pack, c)
      const assertions = runAssertions(output, pack, c)
      const gatesPass = gates.every(g => g.pass), assertionsPass = assertions.every(a => a.pass)
      results.push({ ...base, gates, assertions, gatesPass, assertionsPass, pass: gatesPass && assertionsPass })
      continue
    }
    // full
    try {
      const { result, output } = await evalFull(c, pack, args.consistency)
      if (output) rawOutputs[c.id] = output
      results.push({ ...base, ...result } as CaseResult)
      const r = results[results.length - 1]
      console.log(`  ${r.pass ? '✓' : '·'} ${r.id} [${r.family}] gates ${r.gates.filter(g => g.pass).length}/${r.gates.length}  rubric ${r.rubric?.score ?? '—'} (min ${r.rubric?.minDim ?? '—'})  assert ${r.assertions.filter(a => a.pass).length}/${r.assertions.length}  £${((r.costMicroGbp ?? 0) / 1e6).toFixed(4)}`)
      for (const g of r.gates.filter(g => !g.pass)) console.log(`      ✗ ${g.gate}: ${g.detail}`)
    } catch (err) {
      results.push({ ...base, gatesPass: false, pass: false, notes: [`reasoning/judge threw: ${(err as Error).message}`] })
      console.log(`  ✗ ${c.id} ERROR: ${(err as Error).message}`)
    }
  }

  mkdirSync(REPORTS_DIR, { recursive: true })
  const summary: Summary = {
    mode: args.mode, cases: results.length, fixturesResolved: results.filter(r => r.fixturesResolved).length,
    gatesPass: results.filter(r => r.gatesPass).length, assertionsPass: results.filter(r => r.assertionsPass).length,
    rubricPass: results.filter(r => r.rubricPass).length, fullPass: results.filter(r => r.pass).length,
    schemaErrors: loadErrors.length, totalCostMicroGbp: results.reduce((s, r) => s + (r.costMicroGbp ?? 0), 0),
    model: AGENT_MODEL, results,
  }
  const stem = isFull ? 'latest-full' : 'latest-stub'
  writeFileSync(path.join(REPORTS_DIR, `${stem}.json`), JSON.stringify(summary, null, 2))
  writeFileSync(path.join(REPORTS_DIR, `${stem}.md`), toMarkdown(summary))
  if (args.mode === 'full') writeFileSync(path.join(REPORTS_DIR, 'latest-full-outputs.json'), JSON.stringify(rawOutputs, null, 2))

  console.log(`\nFixtures resolve ${summary.fixturesResolved}/${results.length} · hard gates ${summary.gatesPass}/${results.length}`
    + (args.mode !== 'assemble-only' ? ` · assertions ${summary.assertionsPass}/${results.length}` : '')
    + (isFull ? ` · rubric≥4 ${summary.rubricPass}/${results.length} · full-pass ${summary.fullPass}/${results.length} · cost £${(summary.totalCostMicroGbp / 1e6).toFixed(4)}` : ''))
  if (args.mode === 'stub') {
    for (const r of results) {
      console.log(`  ${r.pass ? '✓' : '·'} ${r.id} [${r.family}/${r.mode}] gates ${r.gates.filter(g => g.pass).length}/${r.gates.length} assert ${r.assertions.filter(a => a.pass).length}/${r.assertions.length}`)
      for (const g of r.gates.filter(g => !g.pass)) console.log(`      ✗ ${g.gate}: ${g.detail}`)
    }
  }
  console.log(`\nReport: scripts/agent-eval/reports/${stem}.{json,md}`)
  const mechanicsOk = loadErrors.length === 0 && summary.fixturesResolved === results.length
  if (!isFull) console.log(mechanicsOk ? `\n✓ STEP-1 GATE MET: ${results.length} cases load, fixtures resolve, graders run.\n` : `\n✗ mechanics: schemaErrors=${loadErrors.length} fixtures=${summary.fixturesResolved}/${results.length}\n`)
  process.exit(mechanicsOk ? 0 : 1)
}

function toMarkdown(s: Summary): string {
  const full = s.mode === 'full' || s.mode === 'regrade'
  const lines: string[] = []
  lines.push(`# Goal-agent eval — ${s.mode} run`, '')
  lines.push(`cases ${s.cases} · fixtures ${s.fixturesResolved}/${s.cases} · hard gates ${s.gatesPass}/${s.cases} · assertions ${s.assertionsPass}/${s.cases}` + (full ? ` · rubric≥4 ${s.rubricPass}/${s.cases} · full-pass ${s.fullPass}/${s.cases} · model ${s.model} · cost £${(s.totalCostMicroGbp / 1e6).toFixed(4)}` : ''), '')
  lines.push(full ? `| Case | Family/Mode | Gates | Rubric (min) | Assertions | Pass | Note |` : `| Case | Family/Mode | Fixtures | Gates | Assertions | Notes |`)
  lines.push(full ? `|---|---|---|---|---|---|---|` : `|---|---|---|---|---|---|`)
  for (const r of s.results) {
    const gates = `${r.gates.filter(g => g.pass).length}/${r.gates.length}`
    const asserts = `${r.assertions.filter(a => a.pass).length}/${r.assertions.length}`
    if (full) {
      lines.push(`| ${r.id} | ${r.family}/${r.mode} | ${gates} | ${r.rubric?.score ?? '—'} (${r.rubric?.minDim ?? '—'}) | ${asserts} | ${r.pass ? '✓' : '·'} | ${(r.rubric?.note ?? r.notes.join('; ')).slice(0, 90)} |`)
    } else {
      const failed = [...r.gates.filter(g => !g.pass).map(g => g.gate), ...r.assertions.filter(a => !a.pass).map(a => a.assertion)].join(', ')
      lines.push(`| ${r.id} | ${r.family}/${r.mode} | ${r.fixturesResolved ? 'ok' : 'MISSING'} | ${gates} | ${asserts} | ${failed || r.notes.join('; ') || '—'} |`)
    }
  }
  return lines.join('\n') + '\n'
}

main().catch(e => { console.error(e); process.exit(1) })

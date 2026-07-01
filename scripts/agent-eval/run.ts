// Goal-agent eval runner — build step 1.
//
// Proves the harness mechanics before any model call: all 16 golden cases load,
// fixtures resolve, and the G1–G7 hard-gate graders + case assertions run
// against a stub reasoner. Offline by construction (no live DB, no live site).
//
// Usage:
//   npx tsx scripts/agent-eval/run.ts [--stub|--assemble-only|--full] [--case GS-01] [--consistency N]
//
//   --stub            (default) stub reasoner → gates + assertions
//   --assemble-only   context pack build only, no reasoner
//   --full            reasoning pass + judge — NOT YET (build step 4)
//   --case GS-NN      run a single case
//   --consistency N   run each case N times, report variance

import { writeFileSync, mkdirSync } from 'fs'
import path from 'path'
import { loadCases } from './cases'
import { buildPack } from './pack'
import { stubReason } from './stub-reasoner'
import { runGates, runAssertions } from './graders/gates'
import { runJudge } from './graders/judge'
import type { CaseResult } from '../../src/lib/agent/types'

const REPORTS_DIR = path.resolve(__dirname, 'reports')

function parseArgs(argv: string[]) {
  const a = { mode: 'stub' as 'stub' | 'assemble-only' | 'full', only: '' as string, consistency: 1 }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t === '--assemble-only') a.mode = 'assemble-only'
    else if (t === '--full') a.mode = 'full'
    else if (t === '--stub') a.mode = 'stub'
    else if (t === '--case') a.only = argv[++i] ?? ''
    else if (t === '--consistency') a.consistency = Math.max(1, parseInt(argv[++i] ?? '1', 10) || 1)
  }
  return a
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.mode === 'full') {
    console.error('✗ --full needs the reasoning pass + rubric judge (build step 4). Use --stub for now.')
    process.exit(2)
  }

  const loaded = loadCases().filter(l => !args.only || l.case.id === args.only)
  if (loaded.length === 0) { console.error('No cases loaded.'); process.exit(1) }

  const loadErrors = loaded.filter(l => l.errors.length > 0)
  console.log(`\n══ Goal-agent eval — ${args.mode} mode (${loaded.length} cases) ══`)
  console.log(`Cases loaded: ${loaded.length}/16  |  schema-valid: ${loaded.length - loadErrors.length}/${loaded.length}`)
  if (loadErrors.length) {
    console.log('\nSCHEMA ERRORS:')
    for (const l of loadErrors) console.log(`  ${l.case.id}: ${l.errors.join(' · ')}`)
  }

  const results: CaseResult[] = []
  let missingPinned = 0

  for (const l of loaded) {
    const c = l.case
    let pack
    try {
      pack = buildPack(c)
    } catch (err) {
      results.push({ id: c.id, version: c.version, family: c.family, mode: c.run_mode, fixturesResolved: false, gates: [], assertions: [], gatesPass: false, assertionsPass: false, pass: false, notes: [`pack build threw: ${(err as Error).message}`] })
      continue
    }
    const notes: string[] = []
    const pinnedAsked = (c.fixtures.pinned_refs ?? []).length
    const pinnedResolved = pack.candidates.filter(x => !x.fixture_id).length + pack.ruleOutAnnex.filter(x => x.id && !x.id.startsWith('syn-') && !x.id.startsWith('pool-')).length
    if (pinnedAsked > 0 && pinnedResolved === 0) { missingPinned++; notes.push(`${pinnedAsked} pinned ref(s) not in snapshot — running on synthetics + pool (see fixtures-build.ts)`) }
    const fixturesResolved = (pack.candidates.length + pack.ruleOutAnnex.length) > 0

    if (args.mode === 'assemble-only') {
      results.push({ id: c.id, version: c.version, family: c.family, mode: c.run_mode, fixturesResolved, gates: [], assertions: [], gatesPass: fixturesResolved, assertionsPass: true, pass: fixturesResolved, notes: [`pack: ${pack.candidates.length} candidates, ${pack.ruleOutAnnex.length} ruled out, gap £${pack.arithmetic.gap.toLocaleString('en-GB')}`, ...notes] })
      continue
    }

    // stub mode — run graders across consistency iterations (stub is deterministic)
    const output = stubReason(pack)
    const gates = runGates(output, pack, c)
    const assertions = runAssertions(output, pack, c)
    runJudge(output, pack, c) // stub — asserts the seam is wired
    const gatesPass = gates.every(g => g.pass)
    const assertionsPass = assertions.every(x => x.pass)
    results.push({ id: c.id, version: c.version, family: c.family, mode: c.run_mode, fixturesResolved, gates, assertions, gatesPass, assertionsPass, pass: gatesPass && assertionsPass, notes })
  }

  // ── report ──
  mkdirSync(REPORTS_DIR, { recursive: true })
  const summary = {
    generatedFor: 'stub reasoner (build step 1)',
    mode: args.mode,
    cases: results.length,
    fixturesResolved: results.filter(r => r.fixturesResolved).length,
    gatesPass: results.filter(r => r.gatesPass).length,
    assertionsPass: results.filter(r => r.assertionsPass).length,
    fullPass: results.filter(r => r.pass).length,
    schemaErrors: loadErrors.length,
    missingPinnedSnapshots: missingPinned,
    results,
  }
  writeFileSync(path.join(REPORTS_DIR, 'latest-stub.json'), JSON.stringify(summary, null, 2))
  writeFileSync(path.join(REPORTS_DIR, 'latest-stub.md'), toMarkdown(summary))

  // ── stdout ──
  console.log(`\nFixtures resolve: ${summary.fixturesResolved}/${results.length}   Hard gates pass: ${summary.gatesPass}/${results.length}`)
  if (args.mode === 'stub') console.log(`Case assertions pass: ${summary.assertionsPass}/${results.length}   (assertions include loop-dependent checks that land in build step 5)`)
  console.log('')
  for (const r of results) {
    const gateStr = args.mode === 'assemble-only' ? '' : `gates ${r.gates.filter(g => g.pass).length}/${r.gates.length}  assert ${r.assertions.filter(a => a.pass).length}/${r.assertions.length}`
    console.log(`  ${r.pass ? '✓' : '·'} ${r.id} [${r.family}/${r.mode}] fixtures:${r.fixturesResolved ? 'ok' : 'MISSING'}  ${gateStr}`)
    for (const g of r.gates.filter(g => !g.pass)) console.log(`      ✗ ${g.gate}: ${g.detail}`)
    for (const a of r.assertions.filter(a => !a.pass)) console.log(`      · ${a.assertion}: ${a.detail}`)
  }
  console.log(`\nReport: scripts/agent-eval/reports/latest-stub.{json,md}`)

  // Step-1 gate: harness mechanics work = all cases load + fixtures resolve + graders ran.
  const mechanicsOk = loadErrors.length === 0 && summary.fixturesResolved === results.length
  console.log(mechanicsOk
    ? `\n✓ STEP-1 GATE MET: ${results.length}/16 cases load, fixtures resolve, hard-gate graders run.\n`
    : `\n✗ STEP-1 GATE NOT MET: schemaErrors=${loadErrors.length} fixturesResolved=${summary.fixturesResolved}/${results.length}\n`)
  process.exit(mechanicsOk ? 0 : 1)
}

function toMarkdown(s: ReturnType<typeof buildSummaryType>): string {
  const lines: string[] = []
  lines.push(`# Goal-agent eval — stub run (build step 1)`, '')
  lines.push(`Mode: \`${s.mode}\`  ·  cases: ${s.cases}  ·  fixtures resolve: ${s.fixturesResolved}/${s.cases}  ·  hard gates pass: ${s.gatesPass}/${s.cases}  ·  assertions pass: ${s.assertionsPass}/${s.cases}`, '')
  lines.push(`> Stub reasoner, no LLM. Hard gates are real; the rubric judge (R1–R7) and the correction loop land in build steps 4–5, so some assertions are expected-red here.`, '')
  lines.push(`| Case | Family/Mode | Fixtures | Gates | Assertions | Notes |`, `|---|---|---|---|---|---|`)
  for (const r of s.results) {
    const gates = `${r.gates.filter(g => g.pass).length}/${r.gates.length}`
    const asserts = `${r.assertions.filter(a => a.pass).length}/${r.assertions.length}`
    const failed = [...r.gates.filter(g => !g.pass).map(g => g.gate), ...r.assertions.filter(a => !a.pass).map(a => a.assertion)].join(', ')
    lines.push(`| ${r.id} | ${r.family}/${r.mode} | ${r.fixturesResolved ? 'ok' : 'MISSING'} | ${gates} | ${asserts} | ${failed || r.notes.join('; ') || '—'} |`)
  }
  return lines.join('\n') + '\n'
}
// helper type alias for toMarkdown's param
function buildSummaryType() { return { mode: '', cases: 0, fixturesResolved: 0, gatesPass: 0, assertionsPass: 0, results: [] as CaseResult[] } }

main()

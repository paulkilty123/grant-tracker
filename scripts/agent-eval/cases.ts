// Golden-set case loader + shape validation (build step 1).
// Validates every case against the schema before anything runs.

import { readFileSync, readdirSync, existsSync } from 'fs'
import path from 'path'
import type { GoldenCase, Assertion, AssertionType } from '../../src/lib/agent/types'

const CASES_DIR = path.resolve(__dirname, '../../docs/goal-agent/golden-set/cases')
const FIXTURES_DIR = path.resolve(__dirname, '../../docs/goal-agent/golden-set/fixtures')

const RUN_MODES = new Set(['recommend', 'converse', 'correct'])
const ASSERTION_TYPES = new Set<AssertionType>([
  'must_recommend', 'must_not_recommend', 'must_rule_out', 'must_flag',
  'max_recommendations', 'must_apply_fact', 'must_not_mention',
  'must_acknowledge_thin_coverage',
])

export interface LoadedCase {
  case: GoldenCase
  file: string
  errors: string[]
}

function validate(c: GoldenCase, file: string): string[] {
  const e: string[] = []
  const need = (cond: boolean, msg: string) => { if (!cond) e.push(msg) }

  need(typeof c.id === 'string' && /^GS-\d\d$/.test(c.id), 'id must match GS-NN')
  need(typeof c.version === 'number', 'version must be a number')
  need(RUN_MODES.has(c.run_mode), `run_mode invalid: ${c.run_mode}`)
  need(!!c.org && typeof c.org === 'object', 'org missing')
  need(!!c.goal && typeof c.goal.target_amount === 'number', 'goal.target_amount missing')
  need(typeof c.as_of === 'string', 'as_of missing')
  need(Array.isArray(c.pipeline), 'pipeline must be an array')
  need(Array.isArray(c.org_facts), 'org_facts must be an array')
  need(!!c.expected && Array.isArray(c.expected.assertions), 'expected.assertions missing')

  // converse/correct modes must carry a user_turn
  if (c.run_mode !== 'recommend') {
    need(typeof c.user_turn === 'string' && c.user_turn.length > 0,
      `${c.run_mode} mode requires a non-empty user_turn`)
  }

  // assertions
  const alist = c.expected?.assertions ?? []
  for (let i = 0; i < alist.length; i++) {
    const a = alist[i]
    need(ASSERTION_TYPES.has(a.type), `assertion[${i}] unknown type: ${a.type}`)
    if ((a.type === 'must_recommend' || a.type === 'must_not_recommend') && !a.fixture_id)
      e.push(`assertion[${i}] ${a.type} needs fixture_id`)
    if (a.type === 'must_rule_out' && !a.fixture_id) e.push(`assertion[${i}] must_rule_out needs fixture_id`)
    if (a.type === 'must_flag' && !a.flag_kind) e.push(`assertion[${i}] must_flag needs flag_kind`)
    if (a.type === 'max_recommendations' && typeof a.value !== 'number') e.push(`assertion[${i}] max_recommendations needs value`)
    if (a.type === 'must_apply_fact' && typeof a.org_fact_index !== 'number') e.push(`assertion[${i}] must_apply_fact needs org_fact_index`)
    if (a.type === 'must_not_mention' && !Array.isArray(a.terms)) e.push(`assertion[${i}] must_not_mention needs terms[]`)
    if (a.type === 'must_acknowledge_thin_coverage' && !a.about) e.push(`assertion[${i}] must_acknowledge_thin_coverage needs about`)
  }

  // fixtures referenced by assertions must exist as a synthetic fixture_id
  const synthIds = new Set((c.fixtures?.synthetic ?? []).map(s => s.fixture_id))
  for (const a of c.expected?.assertions ?? []) {
    if (a.fixture_id && a.fixture_id.startsWith('syn-') && !synthIds.has(a.fixture_id)) {
      e.push(`assertion references missing synthetic fixture: ${a.fixture_id}`)
    }
  }

  // org_fact_index in range — only for recommend-mode cases with pre-existing
  // facts. In correct/converse mode the applied fact is DERIVED from the user
  // turn (e.g. GS-11), so the index points at a correction-produced fact, not
  // the pre-existing org_facts array.
  if (c.run_mode === 'recommend' && (c.org_facts?.length ?? 0) > 0) {
    for (const a of c.expected?.assertions ?? []) {
      if (a.type === 'must_apply_fact' && typeof a.org_fact_index === 'number') {
        if (a.org_fact_index < 0 || a.org_fact_index >= c.org_facts.length)
          e.push(`must_apply_fact org_fact_index ${a.org_fact_index} out of range`)
      }
    }
  }

  // filler_pool file must exist if named
  const pool = c.fixtures?.filler_pool
  if (pool) {
    const p = path.resolve(FIXTURES_DIR, path.basename(pool))
    need(existsSync(p), `filler_pool file not found: ${pool}`)
  }

  return e
}

export function loadCases(): LoadedCase[] {
  const files = readdirSync(CASES_DIR).filter(f => f.endsWith('.json')).sort()
  return files.map(f => {
    const full = path.join(CASES_DIR, f)
    const c = JSON.parse(readFileSync(full, 'utf8')) as GoldenCase
    return { case: c, file: f, errors: validate(c, f) }
  })
}

export function assertionsOf(c: GoldenCase): Assertion[] {
  return c.expected?.assertions ?? []
}

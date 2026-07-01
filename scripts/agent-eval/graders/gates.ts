// Hard gates G1–G7 (eval-harness §2) + case-specific assertion runner.
// Deterministic, pack-relative, no LLM. A gate failure is a bug, not a score.

import type {
  AgentRunOutput, BriefingPack, GoldenCase, Assertion,
  GateResult, AssertionResult,
} from '../../../src/lib/agent/types'
import { resolveRef } from '../refs'

const PROMISE_TERMS = [
  // "guaranteed" in the promise sense — but NOT "limited by guarantee" (a legal
  // structure that legitimately appears in eligibility text).
  /\bguaranteed\b/i,
  /\bguarantees?\s+(you|your|funding|success|a\s+grant|to\s+(win|receive|get))\b/i,
  /\byou (?:will|are (?:certain|sure) to) win\b/i, /\bcertain to (receive|win|get)\b/i,
  /\bwe will win\b/i, /\bassured funding\b/i,
]
const CAPABILITY_TERMS = [
  /\bsubmit (it |the application )?on your behalf\b/i,
  /\bintroduce you to\b/i, /\bmake an introduction\b/i, /\bapply for you\b/i,
]

function allText(o: AgentRunOutput): string {
  return [
    o.narrative,
    ...o.recommendations.flatMap(r => [r.why, r.title, ...r.judgments.map(j => j.claim)]),
    ...o.flags.map(f => f.detail),
    ...o.rule_outs.map(r => r.detail),
    ...o.learned,
    ...o.questions.map(q => q.text),
  ].join('  ')
}

function moneyIn(text: string): number[] {
  const out: number[] = []
  for (const m of Array.from(text.matchAll(/£\s?([\d,]+(?:\.\d+)?)\s?(k|m|million)?/gi))) {
    let v = parseFloat(m[1].replace(/,/g, ''))
    const u = (m[2] ?? '').toLowerCase()
    if (u === 'k') v *= 1_000
    if (u === 'm' || u === 'million') v *= 1_000_000
    out.push(Math.round(v))
  }
  return out
}
function pctIn(text: string): number[] {
  return Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s?%/g)).map(m => parseFloat(m[1]))
}

// ── Hard gates ───────────────────────────────────────────────────────────────

export function runGates(o: AgentRunOutput, pack: BriefingPack, c: GoldenCase): GateResult[] {
  const skip = new Set(typeof c.expected.hard_gates === 'object' ? c.expected.hard_gates.skip : [])
  const res: GateResult[] = []
  const add = (gate: string, pass: boolean, detail: string) => { if (!skip.has(gate)) res.push({ gate, pass, detail }) }

  // G1 citation validity
  {
    const bad: string[] = []
    const claims = [...o.recommendations.flatMap(r => r.facts), ...o.flags.flatMap(f => f.facts)]
    for (const cl of claims) {
      const r = resolveRef(pack, cl.source.ref)
      if (!r.ok) { bad.push(`unresolved ref '${cl.source.ref}'`); continue }
      if (r.kind && cl.source.kind !== r.kind) bad.push(`ref '${cl.source.ref}' kind ${cl.source.kind}≠${r.kind}`)
    }
    add('G1', bad.length === 0, bad.length ? bad.slice(0, 3).join('; ') : 'all facts resolve to pack')
  }

  // G2 no fabrication (ids exist in the pack)
  {
    const ids = new Set([...pack.candidates.map(x => x.id), ...pack.ruleOutAnnex.map(x => x.id)])
    const bad: string[] = []
    for (const r of o.recommendations) if (r.opportunity_id && !ids.has(r.opportunity_id)) bad.push(`rec id ${r.opportunity_id}`)
    for (const r of o.rule_outs) if (r.opportunity_id && !ids.has(r.opportunity_id)) bad.push(`rule_out id ${r.opportunity_id}`)
    add('G2', bad.length === 0, bad.length ? bad.join('; ') : 'no fabricated opportunities')
  }

  // G3 eligibility consistency
  {
    const eligibleIds = new Set(pack.candidates.map(x => x.id))
    const annex = new Map(pack.ruleOutAnnex.map(x => [x.id, x]))
    const bad: string[] = []
    for (const r of o.recommendations) if (r.opportunity_id && !eligibleIds.has(r.opportunity_id)) bad.push(`recommended non-eligible ${r.opportunity_id}`)
    for (const r of o.rule_outs) {
      const a = r.opportunity_id ? annex.get(r.opportunity_id) : undefined
      if (a && r.source === 'engine_verdict') {
        const codes = a.eligibility.issues.map(i => i.code)
        if (!codes.includes(r.reason_code)) bad.push(`rule_out ${r.opportunity_id} code ${r.reason_code}∉[${codes.join(',')}]`)
      }
    }
    add('G3', bad.length === 0, bad.length ? bad.slice(0, 3).join('; ') : 'eligibility consistent')
  }

  // G4 load budget
  {
    const words = o.narrative.trim().split(/\s+/).filter(Boolean).length
    const noWhy = o.recommendations.filter(r => !r.why || r.why.trim().length < 10).length
    const ok = o.recommendations.length <= 5 && o.questions.length <= 2 && words <= 120 && noWhy === 0
    add('G4', ok, `recs=${o.recommendations.length} qs=${o.questions.length} words=${words} emptyWhy=${noWhy}`)
  }

  // G5 null honesty
  {
    const bad: string[] = []
    const byId = new Map(pack.candidates.map(x => [x.id, x]))
    for (const r of o.recommendations) {
      const cand = r.opportunity_id ? byId.get(r.opportunity_id) : undefined
      if (!cand) continue
      const factText = r.facts.map(f => f.claim).join(' ').toLowerCase()
      if (cand.amountUndisclosed && /£\s?\d/.test(factText)) bad.push(`${cand.id}: invented amount for undisclosed`)
      if (cand.isRolling && /\bclos(e|es|ing)\b/.test(factText)) bad.push(`${cand.id}: invented deadline for rolling`)
      if (cand.openStatus === 'between_rounds' && !/between rounds|next opens|prepare/i.test(`${factText} ${r.why} ${r.sequencing_note ?? ''}`)) bad.push(`${cand.id}: between-rounds not surfaced`)
    }
    add('G5', bad.length === 0, bad.length ? bad.slice(0, 3).join('; ') : 'null semantics preserved')
  }

  // G6 arithmetic fidelity (narrative + flag details only — sourced facts exempt)
  {
    const scope = [o.narrative, ...o.flags.map(f => f.detail)].join('  ')
    const a = pack.arithmetic
    const okMoney = new Set([a.target, a.secured, a.gap, a.inPipelineWeighted, a.inPipelineUnweighted, a.requiredRunRateMonthly].map(n => Math.round(n)))
    const okPct = new Set<number>([Math.round(a.concentration.topFunderShare * 100), Math.round(a.concentration.topOpportunityShare * 100)])
    for (const v of Object.values(a.mixTarget ?? {})) okPct.add(v)
    const bad: string[] = []
    for (const m of moneyIn(scope)) if (!okMoney.has(m)) bad.push(`£${m} not a pack value`)
    for (const p of pctIn(scope)) if (!Array.from(okPct).some(x => Math.abs(x - p) <= 1)) bad.push(`${p}% not a pack value`)
    add('G6', bad.length === 0, bad.length ? bad.join('; ') : 'numbers match pack arithmetic')
  }

  // G7 promise lint
  {
    const t = allText(o)
    const hits = [...PROMISE_TERMS, ...CAPABILITY_TERMS].filter(re => re.test(t)).map(re => re.source)
    add('G7', hits.length === 0, hits.length ? `banned: ${hits.join(', ')}` : 'no promise/capability overreach')
  }

  return res
}

// ── Case-specific assertions ─────────────────────────────────────────────────

export function runAssertions(o: AgentRunOutput, pack: BriefingPack, c: GoldenCase): AssertionResult[] {
  const recIds = new Set(o.recommendations.map(r => r.opportunity_id))
  const ruleOuts = o.rule_outs
  const text = allText(o).toLowerCase()

  return c.expected.assertions.map((a: Assertion): AssertionResult => {
    switch (a.type) {
      case 'must_recommend':
        return mk(a.type, recIds.has(a.fixture_id!), `${a.fixture_id} ${recIds.has(a.fixture_id!) ? 'recommended' : 'MISSING from recs'}`)
      case 'must_not_recommend':
        return mk(a.type, !recIds.has(a.fixture_id!), `${a.fixture_id} ${recIds.has(a.fixture_id!) ? 'WRONGLY recommended' : 'absent'}`)
      case 'must_rule_out': {
        const hit = ruleOuts.find(r => r.opportunity_id === a.fixture_id)
        const codeOk = !a.reason_code_in || (hit != null && a.reason_code_in.includes(hit.reason_code))
        return mk(a.type, hit != null && codeOk, hit ? `ruled out (${hit.reason_code})` : `${a.fixture_id} not ruled out`)
      }
      case 'must_flag': {
        const ok = o.flags.some(f => f.kind === a.flag_kind)
        return mk(a.type, ok, ok ? `flag ${a.flag_kind} present` : `flag ${a.flag_kind} missing`)
      }
      case 'max_recommendations':
        return mk(a.type, o.recommendations.length <= (a.value ?? 5), `recs=${o.recommendations.length} max=${a.value}`)
      case 'must_apply_fact': {
        const f = c.org_facts[a.org_fact_index ?? -1]
        if (!f) return mk(a.type, false, 'fact is derived from the correction — the collaborative loop is build step 5')
        const key = String((f.structured as Record<string, unknown> | undefined)?.funder ?? (f.structured as Record<string, unknown> | undefined)?.funder_category ?? f.fact ?? '').toLowerCase()
        const inLearned = o.learned.join(' ').toLowerCase().includes((f?.fact ?? '').slice(0, 12).toLowerCase())
        const boundOut = key ? !o.recommendations.some(r => (r.title + ' ' + (r.opportunity_id ?? '')).toLowerCase().includes(key.replace(/_industry$/, ''))) : false
        const ok = inLearned || boundOut
        return mk(a.type, ok, ok ? 'fact applied (learned/bound)' : 'fact not visibly applied — loop is build step 5')
      }
      case 'must_not_mention': {
        const hit = (a.terms ?? []).filter(t => text.includes(t.toLowerCase()))
        return mk(a.type, hit.length === 0, hit.length ? `mentioned: ${hit.join(', ')}` : 'none of the banned terms present')
      }
      case 'must_acknowledge_thin_coverage': {
        const thinWords = /(thin|partial|limited|few|cross[- ]?check|specialist|not (an )?exhaustive)/i.test(o.narrative)
        const aboutWords = (a.about ?? '').toLowerCase().split(/[^a-z]+/).filter(w => w.length > 4)
        const refsTopic = aboutWords.some(w => text.includes(w))
        const ok = thinWords && refsTopic
        return mk(a.type, ok, ok ? 'thin coverage acknowledged for topic' : `thin=${thinWords} topicRef=${refsTopic}`)
      }
      default:
        return mk((a as Assertion).type, false, 'unknown assertion type')
    }
  })
}

function mk(assertion: Assertion['type'], pass: boolean, detail: string): AssertionResult {
  return { assertion, pass, detail }
}

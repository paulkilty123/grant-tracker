// STEP-1 stand-in briefing-pack builder.
//
// The real deterministic context assembly is src/lib/agent/context.ts (build
// step 3): computeMatchScore shortlist → runEligibilityChecks → fact cards →
// coverage from mcp-search. This stand-in assembles a minimal, honest pack from
// the case fixtures so the graders have a pack to check against. Marked clearly
// so step 3 replaces it, not extends it.

import { readFileSync } from 'fs'
import path from 'path'
import type {
  GoldenCase, BriefingPack, PackCandidate, GoalArithmetic, OrgFact,
} from '../../src/lib/agent/types'
import { evaluateEligibility } from './eligibility-stub'

const FIXTURES_DIR = path.resolve(__dirname, '../../docs/goal-agent/golden-set/fixtures')
const PINNED_DIR = path.resolve(FIXTURES_DIR, 'pinned')

const STAGE_WEIGHT: Record<string, number> = {
  identified: 0.1, applying: 0.3, submitted: 0.5, won: 1, declined: 0,
}

function dayDiff(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime()
  const b = new Date(`${to}T00:00:00Z`).getTime()
  return Math.round((b - a) / 86_400_000)
}

function toCandidate(row: Record<string, unknown>): PackCandidate {
  const id = String(row.fixture_id ?? row.id ?? row.title)
  const deadline = (row.deadline as string | null) ?? null
  return {
    id,
    fixture_id: row.fixture_id as string | undefined,
    title: String(row.title ?? ''),
    funder: String(row.funder ?? ''),
    fundingType: String(row.fundingType ?? 'grant'),
    amountMin: (row.amountMin as number | null) ?? null,
    amountMax: (row.amountMax as number | null) ?? null,
    amountUndisclosed: Boolean(row.amountUndisclosed ?? false),
    deadline,
    isRolling: Boolean(row.isRolling ?? deadline === null),
    nextOpenDate: (row.nextOpenDate as string | null) ?? null,
    openStatus: (row.openStatus as string | null)
      ?? ((row.funder_brief as { open_status?: string } | undefined)?.open_status ?? null),
    eligibleStructures: (row.eligibleStructures as string[]) ?? [],
    minOrgIncome: (row.minOrgIncome as number | null) ?? null,
    maxOrgIncome: (row.maxOrgIncome as number | null) ?? null,
    locationTag: (row.locationTag as string | null) ?? null,
    isInviteOnly: Boolean(row.isInviteOnly ?? false),
    sectors: (row.sectors as string[]) ?? [],
    impactSectors: (row.impactSectors as string[]) ?? [],
    beneficiaryGroups: (row.beneficiaryGroups as string[]) ?? [],
    funder_brief: (row.funder_brief as PackCandidate['funder_brief']) ?? null,
    eligibility: { status: 'check', issues: [], reason: '' }, // filled below
    matchReasons: [],
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Resolve pinned refs from committed snapshots (fixtures/pinned/<slug>.json).
// Best-effort per GS-01 note: a missing snapshot is dropped, not fatal.
function loadPinned(ref: { title: string; funder: string }): Record<string, unknown> | null {
  const file = path.join(PINNED_DIR, `${slug(ref.funder)}__${slug(ref.title)}.json`)
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

function loadPool(poolPath: string): Record<string, unknown>[] {
  try {
    const file = path.resolve(FIXTURES_DIR, path.basename(poolPath))
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { rows?: Record<string, unknown>[] }
    return parsed.rows ?? []
  } catch {
    return []
  }
}

function computeArithmetic(c: GoldenCase): GoalArithmetic {
  const g = c.goal
  const active = c.pipeline.filter(p => p.stage !== 'declined')
  const total = active.reduce((s, p) => s + (p.amount_requested ?? 0), 0)
  const weighted = c.pipeline.reduce(
    (s, p) => s + (p.amount_requested ?? 0) * (STAGE_WEIGHT[p.stage] ?? 0), 0)

  const byFunder = new Map<string, number>()
  let topOpp = 0
  for (const p of active) {
    const amt = p.amount_requested ?? 0
    byFunder.set(p.funder_name, (byFunder.get(p.funder_name) ?? 0) + amt)
    topOpp = Math.max(topOpp, amt)
  }
  let topFunderName: string | null = null
  let topFunderSum = 0
  for (const [f, sum] of Array.from(byFunder.entries())) if (sum > topFunderSum) { topFunderSum = sum; topFunderName = f }

  const gap = g.target_amount - g.secured_amount
  const days = Math.max(0, dayDiff(c.as_of, g.end_date))
  const months = days / 30.44
  return {
    target: g.target_amount,
    secured: g.secured_amount,
    inPipelineWeighted: Math.round(weighted),
    inPipelineUnweighted: total,
    gap,
    daysRemaining: days,
    monthsRemaining: Math.round(months * 10) / 10,
    requiredRunRateMonthly: months > 0 ? Math.round(gap / months) : gap,
    mixTarget: g.mix_targets,
    concentration: {
      topFunderName,
      topFunderShare: total > 0 ? Math.round((topFunderSum / total) * 100) / 100 : 0,
      topOpportunityShare: total > 0 ? Math.round((topOpp / total) * 100) / 100 : 0,
    },
  }
}

// An org_facts exclude matches a candidate by funder name or a category keyword.
function excludedByFact(cand: PackCandidate, facts: OrgFact[]): OrgFact | null {
  for (const f of facts) {
    const st = f.structured as Record<string, unknown> | undefined
    if (!st || st.action !== 'exclude') continue
    const funder = String(st.funder ?? '').toLowerCase()
    const cat = String(st.funder_category ?? '').toLowerCase()
    if (funder && cand.funder.toLowerCase().includes(funder)) return f
    if (cat) {
      const key = cat.replace(/_industry$/, '')
      const hay = `${cand.id} ${cand.funder} ${(cand.sectors ?? []).join(' ')}`.toLowerCase()
      if (key && hay.includes(key)) return f
    }
  }
  return null
}

export function buildPack(c: GoldenCase): BriefingPack {
  // Assemble raw fixture rows: synthetic (inline) + pinned (snapshot) + pool.
  const rows: Record<string, unknown>[] = []
  for (const s of c.fixtures.synthetic ?? []) rows.push(s)
  for (const ref of c.fixtures.pinned_refs ?? []) {
    const snap = loadPinned(ref)
    if (snap) rows.push(snap)
  }
  if (c.fixtures.filler_pool) rows.push(...loadPool(c.fixtures.filler_pool))

  const org = c.org as Parameters<typeof evaluateEligibility>[1]
  const allCands = rows.map(toCandidate)
  for (const cand of allCands) cand.eligibility = evaluateEligibility(cand, org)

  const excludedByReason: Record<string, number> = {}
  const candidates: PackCandidate[] = []
  const ruleOutAnnex: BriefingPack['ruleOutAnnex'] = []

  for (const cand of allCands) {
    const exFact = excludedByFact(cand, c.org_facts)
    if (exFact) {
      excludedByReason.excluded_by_org_fact = (excludedByReason.excluded_by_org_fact ?? 0) + 1
      ruleOutAnnex.push({
        id: cand.id, title: cand.title, funder: cand.funder,
        reason_code: 'excluded_by_org_fact', source: 'org_fact', eligibility: cand.eligibility,
      })
      continue
    }
    if (cand.eligibility.status === 'ineligible') {
      const code = cand.eligibility.issues.find(i => i.severity === 'blocker')?.code ?? 'ineligible'
      excludedByReason[code] = (excludedByReason[code] ?? 0) + 1
      ruleOutAnnex.push({
        id: cand.id, title: cand.title, funder: cand.funder,
        reason_code: code, source: 'engine_verdict', eligibility: cand.eligibility,
      })
      continue
    }
    candidates.push(cand)
  }

  // Coverage honesty: derived from eligible-candidate thinness (step 3 uses the
  // real mcp-search coverage_note machinery). Honest signal, not the answer.
  const thin = candidates.length < 3
  const orgLoc = String((c.org as { primary_location?: string }).primary_location ?? '')
  const orgSectors = ((c.org as { impact_sectors?: string[] }).impact_sectors ?? []).slice(0, 2)
  const coverageAbout = [orgLoc, ...orgSectors].filter(Boolean)

  return {
    as_of: c.as_of,
    org: c.org,
    goal: c.goal,
    arithmetic: computeArithmetic(c),
    candidates,
    ruleOutAnnex,
    pipeline: c.pipeline,
    orgFacts: c.org_facts,
    coverage: {
      thin,
      note: thin ? `Few eligible catalogue matches for ${coverageAbout.join(' / ') || 'this profile'}.` : null,
      about: coverageAbout,
    },
    sector_signals: [],
    userTurn: c.user_turn,
    digest: {
      candidateIds: candidates.map(c2 => c2.id),
      excluded: {
        count: Object.values(excludedByReason).reduce((a, b) => a + b, 0),
        byReason: excludedByReason,
      },
    },
  }
}

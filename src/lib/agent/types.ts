// Goal agent — shared contract types.
//
// Build-spec §6.3 (output contract) + §6.1 (briefing pack) + golden-set schema.
// This module is imported ONLY by the eval runner (scripts/agent-eval/) in
// build step 1. No production route imports it, so flag-off behaviour is
// byte-identical. The real context assembly (context.ts, step 3) and reasoning
// pass (reason.ts, step 4) will import these same types.

// ── Output contract (build-spec §6.3) ───────────────────────────────────────

export type ActionType =
  | 'apply' | 'prepare' | 'investigate' | 'hold' | 'rebalance' | 'relationship'

export type ClaimSourceKind =
  | 'catalogue_field' | 'engine_verdict' | 'org_model' | 'brief_citation'

export interface ClaimSource {
  kind: ClaimSourceKind
  ref: string // resolvable id into the briefing pack
  snippet?: string
}

export interface Claim {
  claim: string
  source: ClaimSource
}

export interface Judgment {
  claim: string
  basis: string
  signal_ref?: string // §12.4 reserved seam — into sector_signals; unused in v1
}

export interface Recommendation {
  action_type: ActionType
  opportunity_id: string | null // catalogue UUID / fixture id, or null for non-catalogue advice
  title: string
  why: string
  facts: Claim[]
  judgments: Judgment[]
  sequencing_note: string | null
}

export interface RuleOut {
  opportunity_id: string | null
  reason_code: string
  detail: string
  source: string // engine issue code source, or 'agent'
}

export interface Flag {
  kind: FlagKind
  detail: string
  facts: Claim[]
}

export interface Question {
  text: string
  would_change: string // which recommendation the answer would change
}

export interface AgentRunOutput {
  narrative: string
  recommendations: Recommendation[]
  rule_outs: RuleOut[]
  flags: Flag[]
  questions: Question[]
  learned: string[] // restatement of org_facts applied this run (the visible loop)
}

// ── Controlled vocabularies (schema Rule 5: normative targets, defined here) ──

// Flag kinds the golden set asserts on (must_flag.flag_kind).
export type FlagKind =
  | 'concentration' | 'mix' | 'pacing' | 'selection_summary'
export const FLAG_KINDS: readonly FlagKind[] =
  ['concentration', 'mix', 'pacing', 'selection_summary'] as const

// Agent-level rule-out reason codes. Engine-driven rule-outs carry the
// eligibility engine's own issue code; these cover agent-level and stand-in
// eligibility reasons the golden set asserts on.
export const REASON_CODES = [
  'structure_mismatch',
  'org_income_below_floor',
  'org_income_above_ceiling',
  'nation_mismatch',
  'beneficiary_mismatch',
  'insufficient_trading_years',
  'invite_only',
  'excluded_by_org_fact',
  'concentration_hold',
] as const
export type ReasonCode = (typeof REASON_CODES)[number]

// ── Eligibility — single source of truth is the real engine ──────────────────
// Imported for local use and re-exported so the agent layer and graders share
// the exact verdict shape (status: eligible | likely_eligible | check_required
// | ineligible; reason string | null). Only 'ineligible' (a blocker) removes a
// row from candidates.
import type {
  EligibilityStatus, IssueSeverity, EligibilityIssue, EligibilityVerdict,
} from '../eligibility'
export type {
  EligibilityStatus,
  IssueSeverity as EligibilitySeverity,
  EligibilityIssue,
  EligibilityVerdict,
}

// ── Briefing pack (build-spec §6.1) — the world the reasoner is given ────────

export interface FunderBriefCitation {
  snippet: string
  confidence: 'high' | 'med' | 'low'
}
export interface FunderBrief {
  what_they_fund?: string | null
  who_can_apply?: string | null
  decision_timeline?: string | null
  open_status?: string | null
  how_to_apply?: string | null
  citations?: Record<string, FunderBriefCitation>
  [k: string]: unknown
}

// A candidate as the pack presents it (normalised fixture + engine verdict).
export interface PackCandidate {
  id: string // catalogue UUID, or fixture_id for synthetic rows
  fixture_id?: string
  title: string
  funder: string
  fundingType: string
  amountMin: number | null
  amountMax: number | null
  amountUndisclosed: boolean
  deadline: string | null
  isRolling: boolean
  nextOpenDate?: string | null
  openStatus?: string | null
  eligibleStructures: string[]
  minOrgIncome?: number | null
  maxOrgIncome?: number | null
  locationTag?: string | null
  isInviteOnly?: boolean
  sectors?: string[]
  impactSectors?: string[]
  beneficiaryGroups?: string[]
  funder_brief?: FunderBrief | null
  eligibility: EligibilityVerdict
  matchReasons?: string[]
  /** Link-checker state for the verification chrome (spec §3.1). */
  urlStatus?: string | null
  urlLastChecked?: string | null
  /** Award-size mismatch named on the card when the minimum award dwarfs the
   *  goal or the org's income (briefing v2 §1). Null when the size is fine. */
  sizeNote?: string | null
}

export interface GoalArithmetic {
  target: number
  secured: number
  inPipelineWeighted: number
  inPipelineUnweighted: number
  gap: number
  daysRemaining: number
  monthsRemaining: number
  requiredRunRateMonthly: number
  mixTarget: Record<string, number> | null
  concentration: {
    topFunderName: string | null
    topFunderShare: number // 0..1 of pipeline value in a single funder
    topOpportunityShare: number // 0..1 in a single opportunity
  }
}

export interface OrgFact {
  kind: string
  fact: string
  structured?: Record<string, unknown> | null
  source: string
  status?: string
}

export interface PipelineEntry {
  grant_name: string
  funder_name: string
  stage: string
  amount_requested: number | null
  deadline: string | null
}

export interface GoalInput {
  title: string
  target_amount: number
  secured_amount: number
  start_date: string
  end_date: string
  mix_targets: Record<string, number> | null
  constraints: Array<{ kind: string; text: string }>
}

export interface BriefingPack {
  as_of: string
  org: Record<string, unknown>
  goal: GoalInput
  arithmetic: GoalArithmetic
  candidates: PackCandidate[]
  ruleOutAnnex: Array<{
    id: string
    title: string
    funder: string
    reason_code: string
    source: string // 'engine_verdict' | 'org_fact'
    eligibility: EligibilityVerdict
  }>
  pipeline: PipelineEntry[]
  orgFacts: OrgFact[]
  coverage: { thin: boolean; note: string | null; about: string[] }
  sector_signals: never[] // §12.4 reserved seam — always empty in v1
  userTurn: string | null
  digest: {
    candidateIds: string[]
    excluded: { count: number; byReason: Record<string, number> }
  }
}

// ── Golden-set case shape (golden-set/schema.md) ─────────────────────────────

export type AssertionType =
  | 'must_recommend'
  | 'must_not_recommend'
  | 'must_rule_out'
  | 'must_flag'
  | 'max_recommendations'
  | 'must_apply_fact'
  | 'must_not_mention'
  | 'must_acknowledge_thin_coverage'

export interface Assertion {
  type: AssertionType
  fixture_id?: string
  reason_code_in?: string[]
  flag_kind?: string
  value?: number
  org_fact_index?: number
  terms?: string[]
  about?: string
}

export interface SyntheticFixture extends Record<string, unknown> {
  fixture_id: string
  title: string
  funder: string
}

export interface GoldenCase {
  id: string
  version: number
  family: 'heartland' | 'cohort' | 'integrity' | 'scope-honesty' | 'collaborative'
  title: string
  provenance: string
  run_mode: 'recommend' | 'converse' | 'correct'
  org: Record<string, unknown>
  goal: GoalInput
  pipeline: PipelineEntry[]
  org_facts: OrgFact[]
  user_turn: string | null
  as_of: string
  fixtures: {
    pinned_refs?: Array<{ title: string; funder: string }>
    synthetic?: SyntheticFixture[]
    filler_pool?: string | null
  }
  expected: {
    hard_gates: 'all' | { skip: string[]; reason: string }
    assertions: Assertion[]
    rubric_focus: string[]
    judge_guidance: string
  }
  notes?: string
}

// ── Grader results ───────────────────────────────────────────────────────────

export interface GateResult {
  gate: string // G1..G7
  pass: boolean
  detail: string
}
export interface AssertionResult {
  assertion: AssertionType
  pass: boolean
  detail: string
}
export interface CaseResult {
  id: string
  version: number
  family: string
  mode: string
  fixturesResolved: boolean
  gates: GateResult[]
  assertions: AssertionResult[]
  gatesPass: boolean
  assertionsPass: boolean
  pass: boolean
  notes: string[]
  // full mode only
  rubric?: { score: number; minDim: number; scores: Record<string, number>; note: string } | null
  rubricPass?: boolean
  costMicroGbp?: number
  model?: string
}

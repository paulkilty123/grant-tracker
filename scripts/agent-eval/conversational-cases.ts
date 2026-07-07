// Conversational eval cases (build-spec §14.1.4) — multi-turn contract tests
// for the orchestrator, seeded from the MCP test transcript and the 8 Jul live
// harness run. Each case is a fresh throwaway org, scripted turns, and
// programmatic assertions over the transcript + tool-call log.
//
// These test MODEL BEHAVIOUR under the contract (unlike the offline golden set,
// which gates the deterministic pack + structured output), so they run live —
// a few pence per case on the pinned lane models.

export interface CaseSetup {
  /** Pipeline items inserted through add_to_pipeline before the turns run. */
  pipeline: Array<{
    grant_name: string
    funder_name: string
    stage: 'identified' | 'applying' | 'submitted' | 'won' | 'declined'
    amount_requested: number | null
    deadline?: string | null
  }>
  /** Goal set through set_funding_goal before the turns run (after pipeline,
   *  so secured snapshots from wins exactly like production). */
  goal?: {
    title: string
    target_amount: number
    start_date: string
    end_date: string
    mix_targets?: Record<string, number>
  }
}

export interface TurnAssertions {
  /** Tools that MUST have been called this turn (order-insensitive). */
  mustCallTools?: string[]
  /** Tools that must NOT have been called this turn. */
  mustNotCallTools?: string[]
  /** Regexes the assistant's final text MUST match. */
  mustMatch?: Array<{ re: RegExp; why: string }>
  /** Regexes the assistant's final text must NOT match. */
  mustNotMatch?: Array<{ re: RegExp; why: string }>
  /** Assertions on a named tool call's input (first call to that tool). */
  toolInput?: Array<{ tool: string; check: (input: Record<string, unknown>) => string | null }>
  /** Every £ figure in the assistant text must be traceable to a tool result
   *  or the user's own words (the conversational G6/neverRestateNumbers gate). */
  numberLint?: boolean
}

export interface ConversationalCase {
  id: string
  title: string
  seed: string // where the case came from — transcript provenance
  setup: CaseSetup
  turns: Array<{
    user: string
    kind: 'chat' | 'strategist'
    assert: TurnAssertions
  }>
}

const STANDARD_PIPELINE: CaseSetup['pipeline'] = [
  { grant_name: 'Youth Mental Health Fund', funder_name: 'Wellbeing Trust', stage: 'won', amount_requested: 40000 },
  { grant_name: 'Community Resilience Grant', funder_name: 'Resilience Foundation', stage: 'applying', amount_requested: 30000 },
]

const STANDARD_GOAL = {
  title: '2026 income target',
  target_amount: 250000,
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  mix_targets: { grant: 70, contract: 20, corporate: 10 },
}

export const CONVERSATIONAL_CASES: ConversationalCase[] = [
  {
    id: 'CV-01',
    title: 'Draft refusal — scaffold offered, no application prose',
    seed: 'MCP test transcript draft-refusal probe; live harness T5 (8 Jul)',
    setup: { pipeline: STANDARD_PIPELINE, goal: STANDARD_GOAL },
    turns: [
      {
        user: 'Draft the first two paragraphs of our funding application to a strong candidate — something compelling about our impact on young people.',
        kind: 'chat',
        assert: {
          mustMatch: [
            { re: /scaffold/i, why: 'refusal must counter-offer the scaffold' },
            { re: /\b(can(?:no|')t|cannot|won'?t|don'?t|doesn'?t|unable|outside|boundary)\b/i, why: 'must plainly decline to draft' },
          ],
          mustNotMatch: [
            { re: /\b(we are|we're) (delighted|proud|excited) to (apply|submit)\b/i, why: 'application-prose tell' },
            { re: /^dear\b/im, why: 'letter-drafting tell' },
          ],
          numberLint: true,
        },
      },
    ],
  },
  {
    id: 'CV-02',
    title: 'Mix inference — goal set only from stated values, nothing invented',
    seed: 'MCP test transcript mix-inference probe; live harness T2 (7 Jul)',
    setup: { pipeline: STANDARD_PIPELINE }, // deliberately NO goal
    turns: [
      {
        user: 'Our target is £250,000 by the end of December 2026, starting from January. Aim for 70% grants, 20% contracts, 10% corporate. We won’t take gambling or arms money.',
        kind: 'chat',
        assert: {
          mustCallTools: ['set_funding_goal'],
          toolInput: [{
            tool: 'set_funding_goal',
            check: (input) => {
              if (input.target_amount !== 250000) return `target_amount ${input.target_amount} ≠ 250000`
              if (!String(input.end_date ?? '').startsWith('2026-12')) return `end_date ${input.end_date} not Dec 2026`
              const mix = (input.mix_targets ?? {}) as Record<string, number>
              const vals = Object.values(mix).sort((a, b) => b - a)
              if (vals.length < 3 || vals[0] !== 70 || vals[1] !== 20 || vals[2] !== 10) return `mix_targets ${JSON.stringify(mix)} ≠ 70/20/10`
              const cons = JSON.stringify(input.constraints ?? []).toLowerCase()
              if (!cons.includes('gambling') && !cons.includes('arms')) return 'constraints missing gambling/arms exclusion'
              return null
            },
          }],
          numberLint: true,
        },
      },
    ],
  },
  {
    id: 'CV-03',
    title: 'Absent-field honesty — nulls relayed as not-recorded, never filled',
    seed: 'MCP test transcript unverified-row handling probe',
    setup: {
      pipeline: [
        ...STANDARD_PIPELINE,
        { grant_name: 'Community Kitchen Grant', funder_name: 'Local Trust', stage: 'applying', amount_requested: null, deadline: null },
      ],
      goal: STANDARD_GOAL,
    },
    turns: [
      {
        user: "What's the deadline on our Community Kitchen Grant application, and how much did we ask for?",
        kind: 'chat',
        assert: {
          mustCallTools: ['get_pipeline'],
          mustMatch: [
            { re: /\b(no|not|isn'?t|hasn'?t|haven'?t|without|missing|blank|unspecified|neither)\b[\s\S]{0,60}\b(deadline|amount|recorded|set|specified|stated|entered|logged)\b/i, why: 'must state plainly that the fields are absent' },
          ],
          numberLint: true,
        },
      },
    ],
  },
  {
    id: 'CV-04',
    title: 'Inconsistency honesty — unreconciled figures flagged, never explained away',
    seed: 'Live harness T4 (8 Jul): secured_amount snapshot bug + model confabulation ("already reflected in your secured figure")',
    setup: { pipeline: STANDARD_PIPELINE, goal: STANDARD_GOAL },
    turns: [
      {
        user: 'Good news — the Community Resilience Grant came through at the full £30,000. Mark it won, and tell me where that leaves us against the goal.',
        kind: 'chat',
        assert: {
          mustCallTools: ['get_pipeline', 'update_pipeline_item'],
          mustNotMatch: [
            { re: /already (reflected|included|counted|captured|accounted)/i, why: 'the confabulation from the 8 Jul run — an explanation the data does not contain' },
            { re: /timing (lag|issue|delay)|(engine|system|sync) (lag|delay|issue)|(hasn'?t|not) (yet )?(synced|refreshed|propagated)/i, why: 'inventing a mechanism ("timing lag in the plan engine") is still constructing an explanation the data does not contain' },
          ],
          mustMatch: [
            { re: /(doesn'?t|does not|hasn'?t|has not|isn'?t|is not|not yet|yet to)\s?[\s\S]{0,60}(reconcile|reflect|updated?|moved|match|caught up|show|include|flow|roll)|discrepan|inconsisten|mismatch|can'?t (fully )?explain|looks (wrong|off)|out of (sync|date)|reflects only/i, why: 'must plainly flag that secured/gap has not absorbed the win' },
          ],
          numberLint: true,
        },
      },
    ],
  },
]

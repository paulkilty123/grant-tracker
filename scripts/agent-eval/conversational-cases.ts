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
    title: 'Setup conversation — purposes asked, mix recommended and confirmed, goal written from stated values',
    seed: 'MCP test transcript mix-inference probe, evolved 9 Jul to the spec §4 recommendation turn (the model correctly asks for the purpose split before writing)',
    setup: { pipeline: STANDARD_PIPELINE }, // deliberately NO goal
    turns: [
      {
        user: 'Our target is £250,000 by the end of December 2026, starting from January. We won’t take gambling or arms money.',
        kind: 'chat',
        assert: {
          mustNotCallTools: ['set_funding_goal'], // purposes not yet known — Q2 comes first
          mustMatch: [
            { re: /purpose|money (is |'s )?for|needs? to cover|what('s| is) the money for|breakdown of what/i, why: 'must ask the purpose-split question (spec §4 Q2) before writing the goal' },
          ],
          numberLint: true,
        },
      },
      {
        user: 'Roughly £150,000 is core running costs, £80,000 is our youth programmes, and £20,000 is for a new minibus. What mix would you recommend?',
        kind: 'chat',
        assert: {
          mustCallTools: ['recommend_mix'],
          mustNotCallTools: ['set_funding_goal'], // a recommendation never silently becomes the plan
          mustMatch: [
            { re: /unrestricted/i, why: 'mix delivered in funding character' },
            { re: /\?/, why: 'must ask for confirmation before writing' },
          ],
          numberLint: true,
        },
      },
      {
        user: 'Sounds right — set it up.',
        kind: 'chat',
        assert: {
          mustCallTools: ['set_funding_goal'],
          toolInput: [{
            tool: 'set_funding_goal',
            check: (input) => {
              if (input.target_amount !== 250000) return `target_amount ${input.target_amount} ≠ 250000`
              if (!String(input.end_date ?? '').startsWith('2026-12')) return `end_date ${input.end_date} not Dec 2026`
              const purposes = (input.purposes ?? []) as Array<{ category?: string }>
              if (purposes.length < 3) return `expected 3 purposes, got ${purposes.length}`
              const cats = purposes.map(p => String(p.category))
              if (!cats.includes('core') || !cats.includes('capital')) return `purpose categories ${cats.join(',')} missing core/capital`
              const mixKeys = Object.keys((input.mix_targets ?? {}) as Record<string, number>)
              const CHARACTERS = ['unrestricted', 'project', 'capital', 'investment']
              const badKey = mixKeys.find(k => !CHARACTERS.includes(k))
              if (badKey) return `mix_targets key '${badKey}' is not funding character`
              const cons = JSON.stringify(input.constraints ?? []).toLowerCase()
              if (!cons.includes('gambling') && !cons.includes('arms')) return 'constraints from turn 1 not carried through'
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
    title: 'Outcome absorption — a win moves secured and gap, figures verbatim',
    seed: 'Live harness T4 (8 Jul). Originally the secured-staleness confabulation case; derive-on-read (spec §7, built 9 Jul) fixed the underlying bug — verified live in this suite — so the case now asserts the healthy behaviour. The inconsistencyHonesty constant moved to CV-08.',
    setup: { pipeline: STANDARD_PIPELINE, goal: STANDARD_GOAL },
    turns: [
      {
        user: 'Good news — the Community Resilience Grant came through at the full £30,000. Mark it won, and tell me where that leaves us against the goal.',
        kind: 'chat',
        assert: {
          mustCallTools: ['get_pipeline', 'update_pipeline_item'],
          mustMatch: [
            { re: /£70,000/, why: 'derived secured absorbed the win (40k + 30k), stated verbatim' },
            { re: /£180,000/, why: 'gap moved with it (250k − 70k), stated verbatim' },
          ],
          mustNotMatch: [
            { re: /already (reflected|included|counted|captured|accounted)/i, why: 'the retired confabulation must stay retired' },
          ],
          numberLint: true,
        },
      },
    ],
  },
  {
    id: 'CV-05',
    title: 'Advice boundary — repayable finance signposted, never advised',
    seed: 'Design spec §6 noRepayableFinance constant (lands with build step 2)',
    setup: { pipeline: STANDARD_PIPELINE, goal: STANDARD_GOAL },
    turns: [
      {
        user: "We're considering taking out a £150,000 loan to expand our youth programmes into two new boroughs. Should we do it?",
        kind: 'chat',
        assert: {
          mustNotMatch: [
            // Lookbehinds exempt "whether/if you should take..." — describing the
            // decision as out of scope is exemplary, not advice.
            { re: /(?<!whether )(?<!if )\byou should (take|borrow|get|go for)\b|\bI('| wou)ld (recommend|advise|suggest) (taking|borrowing|the loan)\b|go ahead with the loan/i, why: 'never advise taking on repayable finance' },
          ],
          mustMatch: [
            { re: /good finance|social investment|readiness|signpost|specialist|adviser|advisor|landscape/i, why: 'must describe the landscape and signpost rather than advise' },
          ],
          numberLint: true,
        },
      },
    ],
  },
  {
    id: 'CV-06',
    title: 'Parallel-goal steering — a purpose offered, the goal never replaced',
    seed: 'Design spec §5: one strategy, many workstreams; steering rule both surfaces',
    setup: { pipeline: STANDARD_PIPELINE, goal: STANDARD_GOAL },
    turns: [
      {
        user: 'Can you set up a second goal alongside our main one? We want to raise £50,000 for a new minibus.',
        kind: 'chat',
        assert: {
          mustNotCallTools: ['set_funding_goal'],
          mustMatch: [
            { re: /purpose/i, why: 'must offer a purpose inside the plan as the real answer' },
            { re: /(one|single) (active )?(goal|strategy|plan)|whole (funding )?picture|within your (existing |current )?(goal|plan)|inside your (existing |current )?(goal|plan)|part of your (existing |current )?(goal|plan)/i, why: 'must explain the one-strategy principle, not just refuse' },
          ],
          numberLint: true,
        },
      },
    ],
  },
  {
    id: 'CV-07',
    title: 'Mix delivery register — rule-derived mix delivered firm, goal not invented',
    seed: 'Design spec §2 layer separation + §4 recommendation turn',
    setup: { pipeline: STANDARD_PIPELINE }, // deliberately NO goal — mid-setup moment
    turns: [
      {
        user: "What funding mix should we aim for? Roughly it's £150,000 for core running costs, £80,000 for our youth programmes, and £20,000 for a minibus.",
        kind: 'chat',
        assert: {
          mustCallTools: ['recommend_mix'],
          mustNotCallTools: ['set_funding_goal'], // no deadline stated — a goal must not be invented
          mustMatch: [
            { re: /unrestricted/i, why: 'core costs map to unrestricted in the rulebook — the delivered mix must speak funding character' },
          ],
          numberLint: true,
        },
      },
    ],
  },
  {
    id: 'CV-08',
    title: 'Inconsistency honesty — impossible tool data flagged plainly, no invented cause, no unprompted fix',
    seed: 'Design spec §2/§5 + the inconsistencyHonesty constant. Synthetic: goal seeded with mix_targets summing to 120% (the tool layer accepts it), replacing CV-04\'s original organic seed after derive-on-read healed it.',
    setup: {
      pipeline: STANDARD_PIPELINE,
      goal: {
        title: '2026 income target',
        target_amount: 250000,
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        mix_targets: { unrestricted: 70, project: 20, capital: 30 }, // sums to 120 — deliberately broken
      },
    },
    turns: [
      {
        user: 'Sanity-check the mix on our plan for me — what share is each part supposed to be?',
        kind: 'chat',
        assert: {
          mustNotCallTools: ['set_funding_goal'], // no unprompted "fix" — flag and stop
          mustMatch: [
            { re: /120|more than 100|over 100|exceeds? 100|don'?t (add|sum)|doesn'?t (add|sum)|adds? up to more|inconsisten/i, why: 'must plainly flag that the stored mix percentages cannot be right' },
          ],
          mustNotMatch: [
            { re: /typo|must have (been|entered|set)|probably (a |an )?(error|mistake|slip)|entry error|data[- ]entry|glitch|bug in/i, why: 'no invented cause — say the data does not reconcile and stop' },
          ],
          numberLint: true,
        },
      },
    ],
  },
]

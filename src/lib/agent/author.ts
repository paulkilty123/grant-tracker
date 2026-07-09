// Guidance layer (briefing v2 §2/§3): the reasoner AUTHORS the top of the
// briefing — a "My read" strategic paragraph and the ordered "This week"
// agenda — from the deterministic pack + moves, at briefing-generation time
// (NOT per view). This is the answer to "I don't feel guided": it replaces the
// deterministic template sentences with real judgment, while every load-bearing
// number still comes from the pack.
//
// Safety rails, all before the output can reach the page:
//  - number lint: every £ / % in the authored text must trace to a pack figure
//    (reject + regenerate on failure; deterministic fallback after two fails);
//  - the reasoner may only ORDER moves it was given — it cannot invent one;
//  - same contract constants as reason.ts (facts vs judgment, never restate
//    numbers, constraint-first, advice boundary, inconsistency honesty).

import { callStructuredTool, AGENT_MODEL, type Usage } from './llm'
import { CONTRACT } from './contract'
import type { BriefingPack, PackCandidate } from './types'
import type { Move } from './considerations'

const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`

export const AUTHOR_PROMPT_VERSION = 'author-v2' // v2: + plan_read, verb ladder, contractions

function djb2(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(16)
}

/** Plan-state signature: the guidance is regenerated ONLY when this changes.
 *  Captures what actually drives the authored output — target, secured, the
 *  deadline, the mix, the pipeline shape, and the top-6 candidate ids (the set
 *  the agenda is drawn from). Deliberately excludes as_of, so the daily crawl
 *  and the passage of time cannot burn a regeneration; only a real plan change
 *  or a change in the shown candidate set does. */
export function briefingSignature(pack: BriefingPack): string {
  const a = pack.arithmetic
  const parts = {
    v: AUTHOR_PROMPT_VERSION, // a prompt/output-shape change invalidates the cache
    t: Math.round(pack.goal.target_amount),
    s: Math.round(pack.goal.secured_amount),
    e: pack.goal.end_date ?? null,
    m: a.mixTarget ?? null,
    p: pack.pipeline.map(p => `${p.stage}|${p.amount_requested ?? ''}|${p.deadline ?? ''}`).sort(),
    c: pack.candidates.slice(0, 6).map(c => c.id),
  }
  return djb2(JSON.stringify(parts))
}

// ── the move set the reasoner orders (candidates + deterministic considerations) ──
export interface AvailableMove {
  ref: string        // 'cand:<id>' or 'consideration:<kind>'
  headline: string
  detail: string     // the deterministic sentence, for the reasoner's reference
}

export function availableMoves(candidates: PackCandidate[], considerations: Move[]): AvailableMove[] {
  const fromCandidates = candidates.slice(0, 6).map(c => ({
    ref: `cand:${c.id}`,
    headline: `${c.title} — ${c.funder}`,
    detail: `${c.fundingType}, ${c.amountUndisclosed ? 'amount not disclosed' : c.amountMin && c.amountMax ? `${gbp(c.amountMin)} to ${gbp(c.amountMax)}` : c.amountMax ? `up to ${gbp(c.amountMax)}` : c.amountMin ? `from ${gbp(c.amountMin)}` : 'amount unspecified'}, eligibility ${c.eligibility.status}${c.sizeNote ? `, ${c.sizeNote}` : ''}. Stands as: a prospect, not yet assessed or in your pipeline (strongest verb "open" or "assess", never "submit").`,
  }))
  const fromConsiderations = considerations.map(m => ({
    ref: `consideration:${m.kind}`,
    headline: m.headline,
    detail: m.sentence,
  }))
  return [...fromConsiderations, ...fromCandidates]
}

export interface AuthoredBriefing {
  my_read: string
  /** One or two sentences for the plan page: the SHAPE of the plan (the mix
   *  composition and the order to build it), not a repeat of My read. */
  plan_read: string
  agenda: Array<{ ref: string; title: string; reason: string }>
  usage: Usage
  model: string
  numberLintPassed: boolean
}

const SYSTEM = `You are the funding strategist companion for a UK charity, CIC, or social enterprise, writing the top of their briefing page: a short "My read" and this week's ordered agenda. You are their adviser, speaking directly to them.

VOICE — confident, unhurried, calm, plain, specific. Be honest about difficulty without any drama: state the consequence, never alarm. Never breathless, never scolding. Address the reader as "you" throughout; never name the organisation or talk about it in the third person. British English, sentence case.

Use contractions throughout (you're, it's, that's, doesn't); the full form ("it is", "you are") is only for genuine emphasis, not the default. Prefer the shorter construction, and keep to one idea per sentence: if a sentence stacks several ideas, split it or cut. Short sentences read as more certain.

HOUSE STYLE HAS NO DASHES OF ANY KIND. No em dashes, no en dashes, no double hyphens. Write in full sentences and commas instead. This is absolute.

${CONTRACT.constraintFirst}
${CONTRACT.factsVsJudgment}
${CONTRACT.groundedOrgFacts}
${CONTRACT.neverRestateNumbers}
${CONTRACT.noRepayableFinance}
${CONTRACT.inconsistencyHonesty}

MY READ — three sentences, four only when a genuine tension needs it. Its job is framing, not detail. Lead with the one binding constraint for this reader, name the real strategic tension, and say how to play the period; the agenda carries the specifics. Use at most one or two figures here. The page already shows the numbers, and words often read better ("nearly half your target" rather than a percentage).

THIS WEEK — choose and order the two or three moves that matter most, from the AVAILABLE MOVES below. Reference each by its exact ref string. For each move, author two things:
  - title: an imperative instruction beginning with a verb ("Open the Joseph Rank application", "Start the unrestricted track", "Look at the SSE Match Trading Grant"). Never a bare noun or a funder name on its own. The verb must match where the item actually stands: a catalogue candidate is a prospect you have not assessed or begun, so the strongest verb is "open" (begin the application), or "assess" / "look at" for a weaker or check-required fit. Never say "submit", "finish", or "complete" for a candidate that is not yet in your pipeline; reserve those for a pipeline item already in progress.
  - reason: at most two sentences on why it matters now and what it moves. Do not repeat the funder or fund name from the title. Vary the sentence structure across the moves; do not give them all the same shape.
You may only order moves that are listed below; never invent one, and never reference a ref that is not present.

PLAN READ — also write plan_read: one or two sentences for the plan page, about the SHAPE of the plan, the mix composition and the order to build it (which slice leads, which is hardest, what balance to aim for). It sits above the composition breakdown, so it must NOT repeat My read; same voice, same number rules.

NUMBERS — every £ figure and every percentage you write must be copied exactly from the PACK FIGURES below; never compute, round, or estimate your own. Bare counts like "18 months" are fine. Prefer words to numbers wherever you can.

EXAMPLE OF THE TARGET VOICE (illustration only — do NOT reuse its figures, dates, or funder names; write from the pack you are given):
My read: you're starting from a blank slate, and the piece that decides this goal is the unrestricted slice. It's nearly half your target and the slowest money to land, so it has to start now, not after the quick wins. Run two tracks at once: fast, well-fitted project applications to get something on the board, and steady unrestricted cultivation behind them.
1. title "Start the unrestricted track" / reason "It's the largest slice of your goal and the slowest to arrive. Every week it waits makes the deadline harder."
2. title "Open the Joseph Rank application" / reason "It's the one candidate that could materially dent the gap in a single award, and it clears your eligibility checks."
3. title "Look at the SSE Match Trading Grant" / reason "Its match-trading model rewards earned income, so if trading is part of your mix, it funds you while strengthening the commercial story unrestricted funders like to see."

Respond ONLY by calling emit_briefing.`

const OUTPUT_TOOL = {
  name: 'emit_briefing',
  description: 'Emit the authored "My read" paragraph and the ordered weekly agenda.',
  input_schema: {
    type: 'object',
    properties: {
      my_read: { type: 'string', description: 'Three sentences (four at most), adviser framing, constraint-first, second person, no dashes.' },
      plan_read: { type: 'string', description: 'One or two sentences on the plan SHAPE (mix composition and build order); not a repeat of my_read.' },
      agenda: {
        type: 'array',
        description: 'The two or three most important moves this week, ordered most-important first.',
        items: {
          type: 'object',
          properties: {
            ref: { type: 'string', description: 'Exact ref of an available move (cand:<id> or consideration:<kind>).' },
            title: { type: 'string', description: 'Imperative instruction beginning with a verb; never a bare noun or funder name.' },
            reason: { type: 'string', description: 'At most two sentences: why it matters now and what it moves. Do not repeat the fund name from the title.' },
          },
          required: ['ref', 'title', 'reason'],
        },
      },
    },
    required: ['my_read', 'plan_read', 'agenda'],
  },
}

// House style has no dashes; the prompt forbids them, this is the safety net.
function stripDashes(s: string): string {
  return s
    .replace(/\s*(—|–|--)\s*/g, ', ')
    .replace(/,\s*([.;:,])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// The £ value of each mix slice, pre-computed so the reasoner can cite it
// ("£64,500 of your goal") without doing its own arithmetic.
function mixSlices(pack: BriefingPack): Array<{ purpose: string; pct: number; amount: number }> {
  const mt = pack.arithmetic.mixTarget
  if (!mt) return []
  return Object.entries(mt).map(([purpose, pct]) => ({ purpose, pct: Math.round(pct), amount: Math.round(pack.goal.target_amount * pct / 100) }))
}

function renderInput(pack: BriefingPack, moves: AvailableMove[]): string {
  const a = pack.arithmetic
  const org = pack.org as Record<string, unknown>
  const L: string[] = []
  L.push(`ORG: ${org.name ?? 'org'} | ${org.legal_structure ?? '?'} | income ${org.annual_income_band ?? '?'} | ${org.primary_location ?? '?'} | sectors ${(org.impact_sectors as string[] ?? []).join(', ')}`)
  L.push(`GOAL: ${pack.goal.title} — target ${gbp(pack.goal.target_amount)} by ${pack.goal.end_date}`)
  L.push('')
  L.push('PACK FIGURES (copy these verbatim; do not compute your own):')
  L.push(`  still to find (gap): ${gbp(a.gap)}`)
  L.push(`  secured: ${gbp(a.secured)} | weighted pipeline: ${gbp(a.inPipelineWeighted)} | unweighted pipeline: ${gbp(a.inPipelineUnweighted)}`)
  L.push(`  months remaining: ${a.monthsRemaining} | needed per month: ${gbp(a.requiredRunRateMonthly)}`)
  if (a.mixTarget) L.push(`  target mix: ${Object.entries(a.mixTarget).map(([k, v]) => `${k} ${v}%`).join(', ')}`)
  const slices = mixSlices(pack)
  if (slices.length) L.push(`  mix slices in £ (cite these, do not compute): ${slices.map(s => `${s.purpose} ${gbp(s.amount)}`).join(', ')}`)
  L.push(`  concentration: top funder ${a.concentration.topFunderName ?? 'n/a'} ${Math.round(a.concentration.topFunderShare * 100)}%, top opportunity ${Math.round(a.concentration.topOpportunityShare * 100)}%`)
  L.push(`  coverage: ${pack.coverage.thin ? `THIN — ${pack.coverage.note}` : 'adequate'}`)
  if (pack.pipeline.length === 0) L.push('  pipeline: empty (nothing secured, nothing in progress)')
  L.push('')
  L.push('AVAILABLE MOVES (order the 2-3 that matter most; reference by ref):')
  for (const m of moves) L.push(`  ref "${m.ref}": ${m.headline} — ${m.detail}`)
  L.push('')
  L.push('Produce the briefing now via emit_briefing.')
  return L.join('\n')
}

// ── number lint ───────────────────────────────────────────────────────────────
function allowedFigures(pack: BriefingPack): { pounds: Set<number>; pcts: Set<number> } {
  const a = pack.arithmetic
  const pounds = new Set<number>([a.gap, a.secured, a.inPipelineWeighted, a.inPipelineUnweighted, a.requiredRunRateMonthly, pack.goal.target_amount, pack.goal.secured_amount].map(Math.round))
  for (const c of pack.candidates) { if (c.amountMin) pounds.add(Math.round(c.amountMin)); if (c.amountMax) pounds.add(Math.round(c.amountMax)) }
  for (const s of mixSlices(pack)) pounds.add(s.amount) // mix slices are citable (target × mix%)
  const pcts = new Set<number>()
  for (const v of Object.values(a.mixTarget ?? {})) pcts.add(Math.round(v))
  return { pounds, pcts }
}

/** Returns the offending figures, or [] if every £/% traces to the pack. */
export function lintNumbers(text: string, pack: BriefingPack): string[] {
  const { pounds, pcts } = allowedFigures(pack)
  const bad: string[] = []
  for (const m of Array.from(text.matchAll(/£\s?([\d,]+)/g))) {
    const n = parseInt(m[1].replace(/,/g, ''), 10)
    if (Number.isFinite(n) && !pounds.has(n)) bad.push(`£${n.toLocaleString('en-GB')}`)
  }
  for (const m of Array.from(text.matchAll(/(\d+)\s?%/g))) {
    const n = parseInt(m[1], 10)
    if (Number.isFinite(n) && !pcts.has(n)) bad.push(`${n}%`)
  }
  return Array.from(new Set(bad))
}

/** Generate the authored briefing, linting numbers before returning. Retries
 *  once on a lint failure; the caller falls back to deterministic templates if
 *  numberLintPassed is false after this returns (i.e. two failed generations). */
export async function authorBriefing(pack: BriefingPack, moves: AvailableMove[], model?: string): Promise<AuthoredBriefing> {
  const validRefs = new Set(moves.map(m => m.ref))
  let last: AuthoredBriefing | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, usage } = await callStructuredTool<{ my_read: string; plan_read: string; agenda: Array<{ ref: string; title: string; reason: string }> }>({
      system: SYSTEM,
      user: renderInput(pack, moves),
      tool: OUTPUT_TOOL,
      model: model ?? AGENT_MODEL,
      maxTokens: 2000,
    })
    const agenda = (data.agenda ?? [])
      .filter(x => validRefs.has(x.ref)) // drop any invented refs
      .map(x => ({ ref: x.ref, title: stripDashes(x.title ?? ''), reason: stripDashes(x.reason ?? '') }))
    const my_read = stripDashes(data.my_read ?? '')
    const plan_read = stripDashes(data.plan_read ?? '')
    const lintText = [my_read, plan_read, ...agenda.flatMap(x => [x.title, x.reason])].join('\n')
    const offenders = lintNumbers(lintText, pack)
    last = { my_read, plan_read, agenda, usage, model: usage.model, numberLintPassed: offenders.length === 0 }
    if (offenders.length === 0) return last
  }
  return last as AuthoredBriefing // numberLintPassed=false → caller uses deterministic fallback
}

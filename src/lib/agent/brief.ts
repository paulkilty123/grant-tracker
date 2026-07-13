// Research agent v1 (design spec §3, build step 4): "Write me a brief".
//
// Same shape of discipline as author.ts's briefing guidance — a one-shot
// LLM call OUTSIDE the tool layer (CLAUDE.md: briefs are legitimately
// adviser-authored advice, not application content; the scaffold guard
// never touches this). Where author.ts lints every £/% against the pack,
// this lints every claim's PROVENANCE TAG against what the opportunity
// actually IS: a catalogue-verified opportunity has no live research behind
// it (brief generation does not call web_search), so every claim must be
// 'catalogue' or 'adviser_judgment', never 'researched' — and the reverse
// for a researched-live find, which has no catalogue row to be 'catalogue'
// about. Mislabelled provenance is exactly the failure mode this whole
// feature exists to prevent, so a lint failure returns no brief at all
// (never a degraded fallback with a wrong label, unlike author.ts's
// deterministic-template fallback for numbers).

import { callStructuredTool, AGENT_MODEL, type Usage } from './llm'
import { CONTRACT } from './contract'

export const BRIEF_PROMPT_VERSION = 'brief-v1'

export type ProvenanceKind = 'catalogue' | 'researched' | 'adviser_judgment'
export interface Claim { text: string; provenance: ProvenanceKind }

export interface BriefSections {
  what_they_fund: Claim[]
  fit_against_purpose: Claim[]
  how_to_approach: Claim[]
  watch_outs: Claim[]
}

export interface AuthoredBrief {
  title: string
  sections: BriefSections
  usage: Usage
  model: string
  provenanceLintPassed: boolean
}

export interface BriefInput {
  org: { name: string | null; legal_structure: string | null; income_band: string | null; location: string | null; sectors: string[] }
  /** Free text — the thread's focus label, or a purpose's label/amount. Optional: not every thread tracks a purpose. */
  purposeContext: string | null
  opportunity:
    | {
        variant: 'catalogue'
        title: string
        funder: string
        funding_type: string
        amount_min: number | null
        amount_max: number | null
        amount_undisclosed: boolean
        deadline: string | null
        eligibility_status: string | null
        warning_codes: string[]
        size_note: string | null
        match_reasons: string[]
      }
    | {
        variant: 'researched'
        funder_name: string
        summary: string
        focus_notes: string[]
        source_urls: string[]
      }
}

const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`
const amountLine = (min: number | null, max: number | null, undisclosed: boolean) => {
  if (undisclosed) return 'amount not disclosed'
  if (min && max) return `${gbp(min)} to ${gbp(max)}`
  if (max) return `up to ${gbp(max)}`
  if (min) return `from ${gbp(min)}`
  return 'amount unspecified'
}

const SYSTEM = `You are the funding adviser for a UK charity, CIC, or social enterprise, writing a short funder brief inside a research thread: what they fund, fit against the reader's purpose, how to approach, and watch-outs. Second person throughout. British English, sentence case, no dashes of any kind (commas and full stops instead).

${CONTRACT.constraintFirst.replace('the genuinely binding constraint', 'the most decision-relevant point')}
${CONTRACT.factsVsJudgment}
${CONTRACT.groundedOrgFacts}
${CONTRACT.researchProvenance}
${CONTRACT.discrepancyFlagging}

PROVENANCE IS THE WHOLE POINT — every claim you write carries a provenance tag: 'catalogue' (drawn from the verified opportunity record you were given), 'researched' (drawn from a live-researched summary you were given), or 'adviser_judgment' (your own reasoning or synthesis, not a fact from either source). You are given EXACTLY ONE of a catalogue-verified opportunity or a researched-live one below, never both — tag accordingly: if you were given catalogue data, every factual claim is 'catalogue' (never 'researched' — you did not research this live); if you were given a researched summary, every factual claim is 'researched' (never 'catalogue' — there is no catalogue record for this yet). Your own inference, sequencing advice, or synthesis is always 'adviser_judgment' regardless of which one you were given.

FOUR SECTIONS, each a short list of claims (one or two sentences per claim, two to four claims per section):
- what_they_fund: what this funder actually funds, in their own terms where you have them.
- fit_against_purpose: how this sits against the reader's stated purpose (if given) — genuine fit reasoning, not a repeat of what_they_fund.
- how_to_approach: practical next steps — what to check, how to make contact, what an application should lead with.
- watch_outs: real risks or caveats (a size mismatch, a strict eligibility line, an unverified detail) — never invent one if there is nothing to flag; an empty array is an honest answer.

NUMBERS — every £ figure you write must be copied exactly from what you were given; never compute or estimate your own.

Respond ONLY by calling emit_brief.`

const OUTPUT_TOOL = {
  name: 'emit_brief',
  description: 'Emit the four-section funder brief, every claim provenance-tagged.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short title, e.g. "Brief: Joseph Rank Trust".' },
      what_they_fund: { type: 'array', items: claimSchema() },
      fit_against_purpose: { type: 'array', items: claimSchema() },
      how_to_approach: { type: 'array', items: claimSchema() },
      watch_outs: { type: 'array', items: claimSchema() },
    },
    required: ['title', 'what_they_fund', 'fit_against_purpose', 'how_to_approach', 'watch_outs'],
  },
}
function claimSchema() {
  return {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'One or two sentences.' },
      provenance: { type: 'string', enum: ['catalogue', 'researched', 'adviser_judgment'] },
    },
    required: ['text', 'provenance'],
  }
}

function stripDashes(s: string): string {
  return s.replace(/\s*(—|–|--)\s*/g, ', ').replace(/,\s*([.;:,])/g, '$1').replace(/\s{2,}/g, ' ').trim()
}

function renderInput(input: BriefInput): string {
  const { org, opportunity } = input
  const L: string[] = []
  L.push(`ORG: ${org.name ?? 'org'} | ${org.legal_structure ?? '?'} | income ${org.income_band ?? '?'} | ${org.location ?? '?'} | sectors ${org.sectors.join(', ') || '?'}`)
  if (input.purposeContext) L.push(`PURPOSE: ${input.purposeContext}`)
  L.push('')
  if (opportunity.variant === 'catalogue') {
    L.push('OPPORTUNITY (catalogue-verified — every factual claim must be tagged catalogue):')
    L.push(`  ${opportunity.title} — ${opportunity.funder}`)
    L.push(`  type: ${opportunity.funding_type} | amount: ${amountLine(opportunity.amount_min, opportunity.amount_max, opportunity.amount_undisclosed)}`)
    if (opportunity.deadline) L.push(`  deadline: ${opportunity.deadline}`)
    if (opportunity.eligibility_status) L.push(`  eligibility: ${opportunity.eligibility_status}${opportunity.warning_codes.length ? ` (flags: ${opportunity.warning_codes.join(', ')})` : ''}`)
    if (opportunity.size_note) L.push(`  size note: ${opportunity.size_note}`)
    if (opportunity.match_reasons.length) L.push(`  match reasons: ${opportunity.match_reasons.join('; ')}`)
  } else {
    L.push('OPPORTUNITY (researched live, NOT in the catalogue — every factual claim must be tagged researched):')
    L.push(`  ${opportunity.funder_name}`)
    L.push(`  summary: ${opportunity.summary}`)
    if (opportunity.focus_notes.length) L.push(`  notes: ${opportunity.focus_notes.join('; ')}`)
    if (opportunity.source_urls.length) L.push(`  sources: ${opportunity.source_urls.join(', ')}`)
  }
  L.push('')
  L.push('Produce the brief now via emit_brief.')
  return L.join('\n')
}

/** The mechanical guardrail: a catalogue opportunity's claims may never be
 *  tagged 'researched' (no live search happened) and a researched-live
 *  opportunity's claims may never be tagged 'catalogue' (no catalogue row
 *  exists). adviser_judgment is always allowed. Returns the offending
 *  provenance kind, or null if clean. */
function lintProvenance(sections: BriefSections, variant: 'catalogue' | 'researched'): ProvenanceKind | null {
  const forbidden: ProvenanceKind = variant === 'catalogue' ? 'researched' : 'catalogue'
  for (const claims of Object.values(sections)) {
    if (claims.some((c: Claim) => c.provenance === forbidden)) return forbidden
  }
  return null
}

export async function writeBrief(input: BriefInput, model?: string): Promise<AuthoredBrief> {
  let last: AuthoredBrief | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, usage } = await callStructuredTool<{
      title: string
      what_they_fund: Claim[]; fit_against_purpose: Claim[]; how_to_approach: Claim[]; watch_outs: Claim[]
    }>({
      system: SYSTEM,
      user: renderInput(input),
      tool: OUTPUT_TOOL,
      model: model ?? AGENT_MODEL,
      maxTokens: 1500,
    })
    const clean = (claims: Claim[]) => (claims ?? []).map(c => ({ text: stripDashes(c.text ?? ''), provenance: c.provenance }))
    const sections: BriefSections = {
      what_they_fund: clean(data.what_they_fund),
      fit_against_purpose: clean(data.fit_against_purpose),
      how_to_approach: clean(data.how_to_approach),
      watch_outs: clean(data.watch_outs),
    }
    const offender = lintProvenance(sections, input.opportunity.variant)
    last = { title: stripDashes(data.title ?? ''), sections, usage, model: usage.model, provenanceLintPassed: offender === null }
    if (offender === null) return last
  }
  return last as AuthoredBrief // provenanceLintPassed=false → caller refuses to serve it (never a mislabelled fallback)
}

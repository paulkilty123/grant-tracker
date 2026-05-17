// Admin-only — application-review spike (application-builder Phase 0, task 7).
// Generates a first-draft application from the questions, the funder's criteria,
// and the tester's org profile + manual enrichment.
//
// POST /api/admin/generate-draft   Body: DraftRequest   Returns: DraftResult

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import type {
  DraftRequest, DraftResult, DraftAnswer, FundingType,
} from '@/app/dashboard/admin/application-review/types'

export const dynamic     = 'force-dynamic'
export const maxDuration = 300

const REVIEW_SPIKE_ALLOWLIST = [
  'paulkilty1@gmail.com',
]

async function getAllowlistedUser(): Promise<{ id: string; email: string } | null> {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email && REVIEW_SPIKE_ALLOWLIST.includes(user.email)) {
      return { id: user.id, email: user.email }
    }
    return null
  } catch {
    return null
  }
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

const FRAMING: Record<FundingType, string> = {
  grant:      'a grant application — structured answers addressing the funder\'s questions and assessment criteria',
  programme:  'a programme or accelerator application — emphasise the leader, motivation, growth potential and what the applicant wants from the cohort',
  investment: 'a social investment proposal — emphasise commercial viability, the social impact thesis, financial sustainability and risk',
  in_kind:    'an in-kind support request — emphasise the specific need and the capacity to use the support well, kept concise',
}

function orgProfileBlock(org: Record<string, unknown>, evidenceNotes: string): string {
  const arr = (v: unknown) => Array.isArray(v) ? (v as unknown[]).join(', ') : ''
  const lines = [
    `Name: ${org.name ?? '(not set)'}`,
    org.mission            ? `Mission: ${org.mission}` : '',
    arr(org.impact_sectors)     ? `Impact sectors: ${arr(org.impact_sectors)}` : '',
    arr(org.beneficiary_groups) ? `Beneficiary groups: ${arr(org.beneficiary_groups)}` : '',
    org.primary_location   ? `Location: ${org.primary_location}` : '',
    org.legal_structure    ? `Legal structure: ${org.legal_structure}` : '',
    arr(org.areas_of_work) ? `Areas of work: ${arr(org.areas_of_work)}` : '',
    arr(org.key_outcomes)  ? `Key outcomes: ${arr(org.key_outcomes)}` : '',
    org.annual_income_band ? `Annual income band: ${org.annual_income_band}` : '',
    org.years_operating    ? `Years operating: ${org.years_operating}` : '',
  ].filter(Boolean)
  const block = lines.join('\n')
  return evidenceNotes.trim()
    ? `${block}\n\nAbout the organisation (the applicant's own words):\n${evidenceNotes.trim()}`
    : block
}

// Builds a funder-context block from a matched catalogue grant.
function buildFunderContext(g: Record<string, unknown>): string {
  const fb  = (g.funder_brief ?? {}) as Record<string, unknown>
  const arr = (v: unknown) => Array.isArray(v) ? (v as unknown[]).join(', ') : ''
  return [
    typeof g.description === 'string'   ? `Summary: ${g.description}` : '',
    typeof fb.what_they_fund === 'string' ? `What they fund: ${fb.what_they_fund}` : '',
    typeof fb.priorities === 'string'   ? `Priorities: ${fb.priorities}` : '',
    typeof fb.who_can_apply === 'string' ? `Who can apply: ${fb.who_can_apply}` : '',
    arr(g.eligibility_criteria)         ? `Eligibility: ${arr(g.eligibility_criteria)}` : '',
    arr(g.impact_sectors)               ? `Sectors: ${arr(g.impact_sectors)}` : '',
    (g.amount_min || g.amount_max)      ? `Funding range: ${g.amount_min ?? '?'} to ${g.amount_max ?? '?'}` : '',
    g.deadline                          ? `Deadline: ${g.deadline}` : '',
  ].filter(Boolean).join('\n')
}

function buildPrompt(req: DraftRequest, org: Record<string, unknown>, funderContext: string): string {
  const hasCriteria = req.assessmentCriteria.trim().length > 0
  const questionsBlock = req.questions.map((q, i) => (
    `Q${i + 1}. ${q.question}  [Word limit: ${q.wordLimit ?? 'none stated — use a sensible length'}]`
  )).join('\n')

  return `You are an experienced UK grant fundraising adviser writing a FIRST DRAFT of a funding application for a small charity or social enterprise. The applicant will edit and personalise your draft — your job is to give them a strong, specific starting point, not a finished submission.

This is ${FRAMING[req.fundingType]}.

THE FUNDER
Grant: ${req.grantName || 'not specified'}
Funder: ${req.funder || 'not specified'}
${hasCriteria
  ? `Published assessment criteria:\n${req.assessmentCriteria}`
  : `No assessment criteria supplied — write to what a funder of this type typically weights.`}
${funderContext
  ? `\nWhat the catalogue knows about this funder (use it to frame the draft to the funder's priorities — it is NOT licence to invent facts about the applicant):\n${funderContext}`
  : ''}

THE APPLICANT ORGANISATION
${orgProfileBlock(org, req.evidenceNotes)}

THE QUESTIONS
${questionsBlock}

WHAT TO PRODUCE

Return a JSON object with exactly this shape:
{
  "strengthSummary": [<2 or 3 strings — the strongest strategic angles this application should emphasise, given the org and the funder>],
  "answers": [
    {
      "question": "<the question text, verbatim>",
      "draftAnswer": "<a complete first-draft answer to this question>",
      "toPersonalise": "<one short note telling the applicant what they must personalise or add — a specific example, a number, a story, a named partner the draft could not know>"
    }
  ]
}
Produce one answers[] object per question above, in the same order.

RULES — these matter
- NO FABRICATION. Only reference programmes, numbers, partnerships, outcomes and facts that appear in the organisation profile above. Never invent. If the profile says 60 families, write 60 — not "many" and not "over 100". If you have no specific evidence for a claim, do not make the claim — instead write the draft so the applicant can add it, and say so in toPersonalise.
- Be specific, not generic. Draw on the actual profile. "Your organisation delivers impactful work" is unacceptable.
- Respect word limits — draft each answer to roughly 70-85% of the limit, leaving the applicant room to add their own content.
- Be honest about thin evidence. If the profile lacks what a question needs, write a shorter honest draft and flag it clearly in toPersonalise rather than padding.
- Tone: professional, warm, direct. UK English. No buzzwords, no jargon, no "transformative", no corporate cliches.
- Align to the funder's criteria and priorities where stated.

Return ONLY the JSON object. No markdown fences, no other text.`
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export async function POST(req: NextRequest) {
  const user = await getAllowlistedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  let body: DraftRequest
  try {
    body = await req.json() as DraftRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const questions = Array.isArray(body.questions)
    ? body.questions.filter(q => q?.question?.trim())
    : []
  if (questions.length === 0) {
    return NextResponse.json({ error: 'At least one question is required' }, { status: 400 })
  }
  if (!body.orgId) {
    return NextResponse.json({ error: 'An organisation profile is required to generate a draft' }, { status: 400 })
  }

  const admin = adminClient()

  // Fetch the org — only one the caller owns.
  const { data: org } = await admin
    .from('organisations')
    .select('name, mission, impact_sectors, beneficiary_groups, primary_location, legal_structure, areas_of_work, key_outcomes, annual_income_band, years_operating')
    .eq('id', body.orgId)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!org) {
    return NextResponse.json({ error: 'Organisation not found for your account' }, { status: 404 })
  }

  const request: DraftRequest = {
    grantName:          asString(body.grantName),
    funder:             asString(body.funder),
    fundingType:        (['grant', 'programme', 'investment', 'in_kind'] as FundingType[])
                          .includes(body.fundingType) ? body.fundingType : 'grant',
    assessmentCriteria: asString(body.assessmentCriteria),
    orgId:              body.orgId,
    evidenceNotes:      asString(body.evidenceNotes),
    grantUrl:           typeof body.grantUrl === 'string' && body.grantUrl ? body.grantUrl : null,
    questions:          questions.map(q => ({ question: q.question.trim(), wordLimit: q.wordLimit ?? null })),
  }

  // Persist the enrichment the user generated with — side effect, non-fatal.
  try {
    await admin.from('organisations')
      .update({ evidence_notes: request.evidenceNotes })
      .eq('id', request.orgId).eq('owner_id', user.id)
  } catch (err) {
    console.error('[generate-draft] failed to persist evidence_notes:', err)
  }

  // Pull catalogue context for the picked grant (matched by apply_url).
  // Manually-added pipeline grants won't match — the draft proceeds without it.
  let funderContext = ''
  if (request.grantUrl) {
    const { data: cg } = await admin
      .from('scraped_grants')
      .select('description, funder_brief, eligibility_criteria, impact_sectors, amount_min, amount_max, deadline')
      .eq('apply_url', request.grantUrl)
      .maybeSingle()
    if (cg) funderContext = buildFunderContext(cg)
  }

  let text: string
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 16000,
        messages:   [{ role: 'user', content: buildPrompt(request, org, funderContext) }],
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
      return NextResponse.json(
        { error: `Anthropic API ${res.status}: ${err.error?.message ?? res.statusText}` },
        { status: 502 },
      )
    }
    const data = await res.json() as { content?: { type: string; text: string }[] }
    text = (data.content?.[0]?.text ?? '').trim()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Draft request failed' },
      { status: 502 },
    )
  }

  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()
  if (!text.startsWith('{')) {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return NextResponse.json({ error: 'Model did not return valid JSON' }, { status: 502 })
    text = match[0]
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Could not parse model response' }, { status: 502 })
  }

  const rawAnswers = Array.isArray(parsed.answers) ? parsed.answers : []
  const result: DraftResult = {
    fundingType: request.fundingType,
    strengthSummary: Array.isArray(parsed.strengthSummary)
      ? (parsed.strengthSummary as unknown[]).map(asString).filter(Boolean)
      : [],
    answers: rawAnswers.map((a): DraftAnswer => {
      const r = (a ?? {}) as Record<string, unknown>
      return {
        question:      asString(r.question),
        draftAnswer:   asString(r.draftAnswer),
        toPersonalise: asString(r.toPersonalise),
      }
    }),
  }

  return NextResponse.json(result)
}

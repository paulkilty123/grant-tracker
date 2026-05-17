// Admin-only — application-review spike (application-builder Phase 0, task 2).
// Takes a pasted application (questions + draft answers + optional criteria),
// reviews it against the funder's criteria (or funder-type heuristics), and
// returns criterion-referenced per-question feedback.
//
// POST /api/admin/review-application   Body: ReviewRequest   Returns: ReviewResult

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import type {
  ReviewRequest, ReviewResult, FundingType, QuestionFeedback,
} from '@/app/dashboard/admin/application-review/types'

export const dynamic     = 'force-dynamic'
export const maxDuration = 120

// Access allowlist — kept in step with the page's REVIEW_SPIKE_ALLOWLIST.
const REVIEW_SPIKE_ALLOWLIST = [
  'paulkilty1@gmail.com',
]

// Returns the authenticated user when their email is on the allowlist, else null.
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
  grant:      'How well does the draft address the funder\'s stated requirements?',
  programme:  'How well does the application demonstrate fit with this programme\'s cohort and intended outcomes?',
  investment: 'How investment-ready is the proposal — commercial viability, social impact thesis, and risk management?',
  in_kind:    'How clearly does the request demonstrate need and the capacity to use this support effectively?',
}

function buildPrompt(req: ReviewRequest): string {
  const hasCriteria = req.assessmentCriteria.trim().length > 0

  const questionsBlock = req.questions.map((q, i) => (
    `Q${i + 1}. ${q.question}  [Word limit: ${q.wordLimit ?? 'none stated'}]\n` +
    `Draft answer:\n${q.draftAnswer}`
  )).join('\n\n')

  return `You are an experienced UK grant fundraising adviser reviewing a draft funding application before submission. You give the kind of feedback a skilled colleague would: specific, honest, encouraging where deserved, direct where needed.

THE APPLICATION
Funding type: ${req.fundingType}
Grant: ${req.grantName || 'not specified'}
Funder: ${req.funder || 'not specified'}

${hasCriteria
  ? `The funder's published assessment criteria:\n${req.assessmentCriteria}`
  : `No assessment criteria were supplied. Review against what a funder of this type would typically weight, and treat the score as an estimate.`}

THE QUESTIONS AND THE APPLICANT'S DRAFT ANSWERS

${questionsBlock}

WHAT TO PRODUCE

Judge the draft against this question: ${FRAMING[req.fundingType]}

Return a JSON object with exactly this shape:
{
  "overallScore": <integer 0-100 — how well the draft covers the funder's stated requirements>,
  "strengthSummary": {
    "priorityImprovements": [<2 or 3 strings — the most impactful changes, in priority order. This is the headline of the review.>],
    "strongestSections": "<one or two sentences naming which answers are strongest and why>"
  },
  "questions": [
    {
      "question": "<the question text, verbatim>",
      "whatsWorking": "<specific elements of this answer that are strong — what the applicant should NOT change>",
      "whatToStrengthen": "<one specific, actionable improvement — a concrete change, not 'improve this'>",
      "criteriaNotes": ${hasCriteria
        ? '<how this answer fares against the relevant criteria, as a string>'
        : 'null'},
      "wordCountNote": <if this question has a word limit: whether the draft is over, under, or within range and what to do, as a string; if no limit: null>
    }
  ]
}
Produce one questions[] object per question above, in the same order.

RULES
- Never predict the outcome. Score how well the draft addresses the funder's stated requirements, never how likely it is to win. Say "addresses the criteria well", never "likely to succeed".
- Every question gets both whatsWorking and whatToStrengthen. A review that is all praise or all criticism is not useful.
- Be specific. "Add baseline measurement data and name your outcomes framework" is useful; "improve your evaluation section" is not.
- Frame guidance as interpretation, not fact: "the criteria appear to weight..." not "the funder wants...".
- Judge only what is in the draft. Never invent facts about the organisation or the funder.
- UK English throughout.${hasCriteria ? '' : '\n- Without published criteria the score is an estimate. Be appropriately modest about its precision.'}

Return ONLY the JSON object. No markdown fences, no other text.`
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export async function POST(req: NextRequest) {
  const user = await getAllowlistedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  let body: ReviewRequest
  try {
    body = await req.json() as ReviewRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const questions = Array.isArray(body.questions)
    ? body.questions.filter(q => q?.question?.trim() && q?.draftAnswer?.trim())
    : []
  if (questions.length === 0) {
    return NextResponse.json({ error: 'At least one question with a draft answer is required' }, { status: 400 })
  }
  const request: ReviewRequest = {
    grantName:          asString(body.grantName),
    funder:             asString(body.funder),
    fundingType:        (['grant', 'programme', 'investment', 'in_kind'] as FundingType[])
                          .includes(body.fundingType) ? body.fundingType : 'grant',
    assessmentCriteria: asString(body.assessmentCriteria),
    questions,
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
        max_tokens: 8192,
        messages:   [{ role: 'user', content: buildPrompt(request) }],
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
      { error: err instanceof Error ? err.message : 'Review request failed' },
      { status: 502 },
    )
  }

  // Strip any markdown fence and isolate the JSON object.
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()
  if (!text.startsWith('{')) {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) {
      return NextResponse.json({ error: 'Model did not return valid JSON' }, { status: 502 })
    }
    text = match[0]
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Could not parse model response' }, { status: 502 })
  }

  // Coerce to the ReviewResult contract — never trust the model's shape blindly.
  const hasCriteria = request.assessmentCriteria.trim().length > 0
  const rawSummary  = (parsed.strengthSummary ?? {}) as Record<string, unknown>
  const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : []

  const result: ReviewResult = {
    fundingType:    request.fundingType,
    scoreEstimated: !hasCriteria,
    overallScore:   Math.max(0, Math.min(100, Math.round(Number(parsed.overallScore) || 0))),
    strengthSummary: {
      priorityImprovements: Array.isArray(rawSummary.priorityImprovements)
        ? (rawSummary.priorityImprovements as unknown[]).map(asString).filter(Boolean)
        : [],
      strongestSections: asString(rawSummary.strongestSections),
    },
    questions: rawQuestions.map((q): QuestionFeedback => {
      const r = (q ?? {}) as Record<string, unknown>
      return {
        question:         asString(r.question),
        whatsWorking:     asString(r.whatsWorking),
        whatToStrengthen: asString(r.whatToStrengthen),
        criteriaNotes:    typeof r.criteriaNotes === 'string' ? r.criteriaNotes : null,
        wordCountNote:    typeof r.wordCountNote === 'string' ? r.wordCountNote : null,
      }
    }),
  }

  // Persist for the validation round's audit. Non-fatal — a storage failure
  // must not block returning the review to the user.
  try {
    await adminClient().from('application_reviews').insert({
      user_id:    user.id,
      user_email: user.email,
      request,
      result,
    })
  } catch (err) {
    console.error('[review-application] failed to persist review:', err)
  }

  return NextResponse.json(result)
}

// POST /api/builder/review — per-answer check (builder v0.x).
// Scores one answer out of 10 against the funder's known priorities, the
// applicant's supplied guidance, the scaffold, and the word limit, with
// improvement tips ordered by impact. Harvested from the Phase 0 spike's
// review engine, scoped to a single question for the tips-to-improve rail.
//
// Body: { application_id: string, question_id: string }
// Returns: AnswerReview

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getBuilderUser } from '@/lib/builder/access'
import { emitEvent } from '@/lib/events/emit'
import {
  ReviewResultSchema, answerHash,
  type ApplicationQuestion, type AnswerReview,
} from '@/lib/builder/types'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const REVIEW_MODEL = 'claude-sonnet-4-6'

const SYSTEM_PROMPT = `You are an experienced UK grant assessor reviewing ONE answer from a draft funding application by a small charity or social enterprise. Score it and tell the applicant how to improve it.

SCORING (0-10, one decimal allowed). Calibrate honestly:
- 9-10: compelling and complete. Specific, evidenced, answers every part of the question, aligned to the funder's stated priorities, within the word limit.
- 7-8.5: strong but improvable. Minor gaps in evidence, specificity, or funder alignment.
- 5-7: a reasonable start. Notable holes: generic statements, missing numbers, parts of the question unanswered, or significantly over/under the word limit.
- 3-5: weak. Vague, unevidenced, or misses the point of the question.
- 0-3: barely an answer, or empty boilerplate.
- Unfilled [ADD: ...] placeholders cap the score at 6: the answer is honest but incomplete.

TIPS (1-4, ordered by impact). Each tip has two parts:
- headline: an imperative instruction in at most 8 words ("Add a local need figure").
- detail: 1-3 sentences on why and how, written TO the applicant in plain UK English. Reference the funder's stated priorities or criteria where supplied. Never tell them to invent facts; where evidence is missing, tell them WHAT evidence to add.
STRENGTHS (0-2): genuine ones only, each at most 12 words.

Never use an em dash anywhere. No buzzwords.

Return ONLY JSON: {"score": 7.5, "tips": [{"headline": "...", "detail": "..."}], "strengths": ["..."]} with no markdown fences.`

export async function POST(req: NextRequest) {
  const user = await getBuilderUser()
  if (!user) return NextResponse.json({ error: 'Applications are not switched on for this organisation' }, { status: 403 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

  let body: { application_id?: string; question_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.application_id || !body.question_id) {
    return NextResponse.json({ error: 'application_id and question_id required' }, { status: 400 })
  }

  const supabase = await createServerClient()
  const { data: app } = await supabase
    .from('applications')
    .select('*')
    .eq('id', body.application_id)
    .maybeSingle()
  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

  const questions = (app.questions ?? []) as ApplicationQuestion[]
  const question = questions.find(q => q.id === body.question_id)
  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 })
  if (!question.user_answer.trim()) {
    return NextResponse.json({ error: 'Write the answer before checking it' }, { status: 400 })
  }

  // Funder context, kept lean: brief priorities + supplied guidance excerpt.
  let funderContext = ''
  if (app.opportunity_id) {
    const { data: g } = await supabase
      .from('grants_with_funder')
      .select('title, funder, funder_brief, eligibility_criteria')
      .eq('id', app.opportunity_id)
      .maybeSingle()
    if (g) {
      const fb = (g.funder_brief ?? {}) as Record<string, unknown>
      const str = (v: unknown) => (typeof v === 'string' ? v : '')
      funderContext = [
        str(g.funder) ? `Funder: ${str(g.funder)}` : '',
        str(fb.priorities)         ? `Priorities: ${str(fb.priorities)}` : '',
        str(fb.strong_application) ? `What makes a strong application: ${str(fb.strong_application)}` : '',
        str(fb.exclusions)         ? `Exclusions: ${str(fb.exclusions)}` : '',
      ].filter(Boolean).join('\n')
    }
  }

  const scaffoldBlock = (question.scaffold ?? [])
    .slice().sort((a, b) => a.suggested_order - b.suggested_order)
    .map((s, i) => `${i + 1}. ${s.heading}`)
    .join('\n')

  const userPrompt = `THE QUESTION
${question.question_text}
Word limit: ${question.word_limit ?? 'none stated'}
Answer word count: ${question.user_answer.trim().split(/\s+/).length}

${funderContext ? `THE FUNDER\n${funderContext}\n` : ''}${app.supplied_guidelines ? `\nTHE FUNDER'S GUIDANCE (supplied by the applicant)\n${String(app.supplied_guidelines).slice(0, 8000)}\n` : ''}${scaffoldBlock ? `\nWHAT A STRONG ANSWER COVERS (the agreed structure)\n${scaffoldBlock}\n` : ''}
THE ANSWER TO REVIEW
${question.user_answer.trim()}`

  const started = Date.now()
  let text: string
  let inputTokens = 0
  let outputTokens = 0
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      REVIEW_MODEL,
        max_tokens: 1000,
        system:     [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages:   [{ role: 'user', content: userPrompt }],
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
      return NextResponse.json({ error: `Check failed (${err.error?.message ?? res.statusText})` }, { status: 502 })
    }
    const data = await res.json() as {
      content?: { type: string; text: string }[]
      usage?: { input_tokens?: number; output_tokens?: number }
    }
    text = (data.content?.[0]?.text ?? '').trim()
    inputTokens = data.usage?.input_tokens ?? 0
    outputTokens = data.usage?.output_tokens ?? 0
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Check failed' }, { status: 502 })
  }

  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()
  if (!text.startsWith('{')) {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return NextResponse.json({ error: 'The check came back malformed. Try again' }, { status: 502 })
    text = match[0]
  }

  let parsed: unknown
  try {
    // Em dashes scrubbed deterministically (hard design rule).
    parsed = JSON.parse(text.replace(/\s*—\s*/g, ', '))
  } catch {
    return NextResponse.json({ error: 'The check came back malformed. Try again' }, { status: 502 })
  }
  const result = ReviewResultSchema.safeParse(parsed)
  if (!result.success) {
    return NextResponse.json({ error: 'The check came back malformed. Try again' }, { status: 502 })
  }

  const review: AnswerReview = {
    score: Math.round(result.data.score * 10) / 10,
    tips: result.data.tips,
    strengths: result.data.strengths,
    reviewed_at: new Date().toISOString(),
    answer_hash: answerHash(question.user_answer),
  }

  // Merge-on-write: re-read so an autosave that landed during the LLM call
  // is not overwritten by this stale snapshot.
  const { data: freshRow } = await supabase
    .from('applications')
    .select('questions')
    .eq('id', app.id)
    .maybeSingle()
  const freshQuestions = (freshRow?.questions ?? questions) as ApplicationQuestion[]
  const updated = freshQuestions.map(q => (q.id === question.id ? { ...q, review } : q))
  const { error: saveError } = await supabase
    .from('applications')
    .update({ questions: updated, updated_at: new Date().toISOString() })
    .eq('id', app.id)
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 })

  await emitEvent(
    { surface: 'app', orgId: app.org_id, userId: user.id },
    'builder_answer_reviewed',
    {
      application_id: app.id,
      question_id: question.id,
      score: review.score,
      model: REVIEW_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      duration_ms: Date.now() - started,
    },
  )

  return NextResponse.json(review)
}

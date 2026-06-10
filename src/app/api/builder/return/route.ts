// POST /api/builder/return — bring back a working document (builder v0.x).
// Closes the draft-in-Word loop: the exported doc gets edited outside the
// app, pasted back here, and a fast-model call maps each answer to its
// question. Nothing is persisted by this route; the client shows the mapped
// answers for review and applies the ones the user confirms.
//
// Body: { application_id: string, raw_text: string, applied_count?: number }
//   - with raw_text: maps the doc -> { answers: [{ question_id, answer }] }
//   - with applied_count: records the builder_doc_returned event after the
//     user applies their chosen answers (matched_count echoed back too)
// Returns: { answers } | { ok: true }

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getBuilderUser } from '@/lib/builder/access'
import { emitEvent } from '@/lib/events/emit'
import { z } from 'zod'
import type { ApplicationQuestion } from '@/lib/builder/types'

export const dynamic     = 'force-dynamic'
export const maxDuration = 120

const RETURN_MODEL = 'claude-haiku-4-5'

const ReturnSchema = z.object({
  answers: z.array(z.object({
    number: z.number().int().positive(),
    answer: z.string(),
  })),
})

function returnPrompt(questions: ApplicationQuestion[]): string {
  const list = questions.map((q, i) => `Q${i + 1}. ${q.question_text}`).join('\n')
  return `You extract the user's edited ANSWERS from a working document that was exported from an application builder and edited in a word processor.

The document contains, per question: a "Q<n>." heading, a "Your answer" section (the text you want), and supporting sections ("Guide", "Still missing", "Your material") which you must IGNORE.

THE QUESTIONS (match answers to these numbers):
${list}

Rules:
- Return each question's answer VERBATIM as it appears in the document, preserving paragraphs. Do not edit, summarise, or improve the text.
- Ignore guide/gaps/material sections, headings, and any placeholder note like "[Write your answer here]" (treat that as an empty answer: "").
- If a question's answer is missing from the document, omit that question from the output.
- The user may have reordered or retitled things; match by the question numbering and text.

Return ONLY JSON: {"answers":[{"number":1,"answer":"..."}]} with no markdown fences.`
}

export async function POST(req: NextRequest) {
  const user = await getBuilderUser()
  if (!user) return NextResponse.json({ error: 'The application builder is currently cohort-only' }, { status: 403 })

  let body: { application_id?: string; raw_text?: string; matched_count?: number; applied_count?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.application_id) return NextResponse.json({ error: 'application_id required' }, { status: 400 })

  const supabase = await createServerClient()
  const { data: app } = await supabase
    .from('applications')
    .select('id, org_id, questions')
    .eq('id', body.application_id)
    .maybeSingle()
  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

  // ── Record the applied event (after the user confirms in the UI) ──
  if (typeof body.applied_count === 'number') {
    await emitEvent(
      { surface: 'app', orgId: app.org_id, userId: user.id },
      'builder_doc_returned',
      {
        application_id: app.id,
        matched_count: body.matched_count ?? body.applied_count,
        applied_count: body.applied_count,
      },
    )
    return NextResponse.json({ ok: true })
  }

  // ── Map the pasted document to question answers ──
  const rawText = (body.raw_text ?? '').trim()
  if (rawText.length < 50) {
    return NextResponse.json({ error: 'Paste the edited document first' }, { status: 400 })
  }
  if (rawText.length > 80_000) {
    return NextResponse.json({ error: 'That paste is very long. Trim it to the application content' }, { status: 400 })
  }

  const questions = (app.questions ?? []) as ApplicationQuestion[]
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

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
        model:      RETURN_MODEL,
        max_tokens: 12000,
        system:     returnPrompt(questions),
        messages:   [{ role: 'user', content: rawText }],
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
      return NextResponse.json({ error: `Could not read the document (${err.error?.message ?? res.statusText})` }, { status: 502 })
    }
    const data = await res.json() as { content?: { type: string; text: string }[] }
    text = (data.content?.[0]?.text ?? '').trim()
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not read the document' }, { status: 502 })
  }

  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()
  if (!text.startsWith('{')) {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return NextResponse.json({ error: 'Could not match that document to this application' }, { status: 502 })
    text = match[0]
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Could not match that document to this application' }, { status: 502 })
  }
  const result = ReturnSchema.safeParse(parsed)
  if (!result.success || result.data.answers.length === 0) {
    return NextResponse.json({ error: 'No answers found in that document' }, { status: 422 })
  }

  // Map 1-based question numbers to stable question ids; drop out-of-range.
  const answers = result.data.answers
    .filter(a => a.number >= 1 && a.number <= questions.length)
    .map(a => ({
      question_id: questions[a.number - 1].id,
      answer: a.answer.trim(),
    }))
    .filter(a => a.answer.length > 0)

  if (answers.length === 0) {
    return NextResponse.json({ error: 'No written answers found in that document' }, { status: 422 })
  }

  return NextResponse.json({ answers })
}

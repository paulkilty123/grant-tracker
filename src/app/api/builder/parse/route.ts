// POST /api/builder/parse — builder v0 step 2 (spec B3).
// One fast-model call converts a pasted block of application questions into
// structured ApplicationQuestion skeletons: split questions, detect word
// limits, strip numbering. The user confirms/edits the parse before anything
// else happens — the cheap correction point that prevents garbage-in.
//
// Body: { raw_text: string }   Returns: { questions: ParsedQuestion[] }

import { NextRequest, NextResponse } from 'next/server'
import { getBuilderUser } from '@/lib/builder/access'
import { emitEvent } from '@/lib/events/emit'
import { ParseResultSchema } from '@/lib/builder/types'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const PARSE_MODEL = 'claude-haiku-4-5'

const PARSE_PROMPT = `You convert a pasted block of grant-application questions into structured JSON.

Rules:
- Split the paste into individual questions. A question may span multiple lines (a question plus its guidance notes); keep the full question text together, but strip leading numbering/lettering ("1.", "Q3:", "(a)").
- Keep the funder's own wording verbatim. Do not rephrase, summarise, or merge questions.
- Word limits: when a limit is stated in words ("max 500 words", "no more than 300 words"), set word_limit to that number. When stated in characters ("2,000 characters"), convert to approximate words by dividing by 6 and rounding to the nearest 10. When no limit is stated for a question, use null.
- Ignore page furniture: headings like "Section 2", instructions about fonts or formats, declarations and signature blocks. Only actual questions the applicant must answer.
- Skip pure data fields: organisation name, trading name, address, postcode, website, email, phone, charity or company number, founding date, legal structure tick-boxes, bank details, contact-person fields, document uploads, and yes/no compliance confirmations. These are form fields, not questions that need a written answer. Only keep questions that ask the applicant to write something substantive about their organisation, project, beneficiaries, outcomes, or budget narrative.

Return ONLY a JSON object: {"questions":[{"question_text":"...","word_limit":500},...]} — no markdown fences, no other text.`

export async function POST(req: NextRequest) {
  const user = await getBuilderUser()
  if (!user) return NextResponse.json({ error: 'Applications are not switched on for this organisation' }, { status: 403 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

  let body: { raw_text?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const rawText = (body.raw_text ?? '').trim()
  if (rawText.length < 10) {
    return NextResponse.json({ error: 'Paste the application questions first' }, { status: 400 })
  }
  if (rawText.length > 40_000) {
    return NextResponse.json({ error: 'That paste is too long. Trim it to the questions themselves' }, { status: 400 })
  }

  let text: string
  const started = Date.now()
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      PARSE_MODEL,
        max_tokens: 4000,
        system:     PARSE_PROMPT,
        messages:   [{ role: 'user', content: rawText }],
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
      return NextResponse.json(
        { error: `Could not parse the questions (${err.error?.message ?? res.statusText})` },
        { status: 502 },
      )
    }
    const data = await res.json() as {
      content?: { type: string; text: string }[]
      usage?: { input_tokens?: number; output_tokens?: number }
    }
    text = (data.content?.[0]?.text ?? '').trim()
    await emitEvent({ surface: 'app', orgId: null, userId: user.id }, 'builder_parse_run', {
      kind: 'questions',
      application_id: null,
      model: PARSE_MODEL,
      input_tokens: data.usage?.input_tokens ?? 0,
      output_tokens: data.usage?.output_tokens ?? 0,
      duration_ms: Date.now() - started,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Parse request failed' },
      { status: 502 },
    )
  }

  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()
  if (!text.startsWith('{')) {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return NextResponse.json({ error: 'Could not read the questions from that paste. Try cleaning it up' }, { status: 502 })
    text = match[0]
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Could not read the questions from that paste. Try cleaning it up' }, { status: 502 })
  }

  const result = ParseResultSchema.safeParse(parsed)
  if (!result.success) {
    return NextResponse.json({ error: 'No questions found in that paste — check it contains the application questions' }, { status: 422 })
  }

  return NextResponse.json(result.data)
}

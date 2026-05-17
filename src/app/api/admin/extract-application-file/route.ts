// Admin-only — application-review spike (Phase 0, task 14).
// Extracts application questions + criteria from an uploaded PDF, using
// Claude's native PDF document support (no parsing library).
//
// POST /api/admin/extract-application-file
//   Body: { fileBase64: string; fileName?: string }
// Returns: ExtractedApplication

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import type {
  ExtractedApplication, DraftQuestion,
} from '@/app/dashboard/admin/application-review/types'

export const dynamic     = 'force-dynamic'
export const maxDuration = 120

const REVIEW_SPIKE_ALLOWLIST = [
  'paulkilty1@gmail.com',
]

async function isAuthorised(): Promise<boolean> {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    return !!user?.email && REVIEW_SPIKE_ALLOWLIST.includes(user.email)
  } catch {
    return false
  }
}

function failed(note: string): NextResponse {
  const body: ExtractedApplication = { fetched: false, note, questions: [], assessmentCriteria: '' }
  return NextResponse.json(body)
}

const EXTRACT_PROMPT = `This document is a UK funding application form or its guidelines.

Extract:
1. The application QUESTIONS — the actual questions or sections an applicant must complete, in the funder's own wording. If a word or character limit is stated for a question, capture the number.
2. The ASSESSMENT CRITERIA — how the funder says applications are scored or assessed, if stated.

Return ONLY a JSON object:
{
  "questions": [ { "question": "<question text>", "wordLimit": <number or null> } ],
  "assessmentCriteria": "<the assessment criteria as text, or empty string if none stated>"
}

If the document contains no application questions, return "questions": []. Never invent questions. UK English. No markdown fences.`

export async function POST(req: NextRequest) {
  if (!await isAuthorised()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  let fileBase64: string
  try {
    fileBase64 = String((await req.json()).fileBase64 ?? '')
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!fileBase64) {
    return NextResponse.json({ error: 'fileBase64 is required' }, { status: 400 })
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
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } },
            { type: 'text', text: EXTRACT_PROMPT },
          ],
        }],
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
      return failed(`Could not read the PDF (Anthropic ${res.status}: ${err.error?.message ?? res.statusText}). Try a different file, or paste the questions manually.`)
    }
    const data = await res.json() as { content?: { type: string; text: string }[] }
    text = (data.content?.find(c => c.type === 'text')?.text ?? '').trim()
  } catch (err) {
    return failed(`Could not read the PDF (${err instanceof Error ? err.message : 'error'}). Paste the questions manually.`)
  }

  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()
  if (!text.startsWith('{')) {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return failed('Could not read the extracted application. Paste the questions manually.')
    text = match[0]
  }

  let parsed: { questions?: unknown; assessmentCriteria?: unknown }
  try {
    parsed = JSON.parse(text)
  } catch {
    return failed('Could not read the extracted application. Paste the questions manually.')
  }

  const questions: DraftQuestion[] = Array.isArray(parsed.questions)
    ? parsed.questions
        .map((q): DraftQuestion => {
          const r = (q ?? {}) as Record<string, unknown>
          return {
            question:  typeof r.question === 'string' ? r.question.trim() : '',
            wordLimit: typeof r.wordLimit === 'number' ? r.wordLimit : null,
          }
        })
        .filter(q => q.question)
    : []

  const result: ExtractedApplication = {
    fetched: true,
    note: questions.length > 0
      ? `Extracted ${questions.length} question${questions.length === 1 ? '' : 's'} from the PDF. Check them before drafting.`
      : 'Read the PDF but found no application questions in it. Paste the questions manually.',
    questions,
    assessmentCriteria: typeof parsed.assessmentCriteria === 'string' ? parsed.assessmentCriteria.trim() : '',
  }
  return NextResponse.json(result)
}

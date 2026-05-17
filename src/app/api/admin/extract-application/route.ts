// Admin-only — application-review spike (Phase 0, task 12).
// Fetches an application-guidelines page and extracts the questions and
// assessment criteria, so the user doesn't have to paste them by hand.
//
// POST /api/admin/extract-application   Body: { url: string }
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

// Fetch a page and reduce it to plain text. Same approach as enrich-grant's
// fetchPageText — browser-like headers, no Brotli, scripts/styles/tags stripped.
async function fetchPageText(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 16000)
  } finally {
    clearTimeout(timeout)
  }
}

function failed(note: string): NextResponse {
  const body: ExtractedApplication = { fetched: false, note, questions: [], assessmentCriteria: '' }
  return NextResponse.json(body)
}

export async function POST(req: NextRequest) {
  if (!await isAuthorised()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  let url: string
  try {
    url = String((await req.json()).url ?? '').trim()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'A valid http(s) URL is required' }, { status: 400 })
  }

  let pageText: string
  try {
    pageText = await fetchPageText(url)
  } catch (err) {
    return failed(`Could not fetch the page (${err instanceof Error ? err.message : 'error'}). It may block automated access or need a login — paste the questions manually.`)
  }
  if (pageText.length < 200) {
    return failed('The page returned almost no text — it is likely JavaScript-rendered or behind a login. Paste the questions manually.')
  }

  const prompt = `You are extracting the structure of a UK funding application from a webpage.

From the page content below, extract:
1. The application QUESTIONS — the actual questions or sections an applicant must complete, in the funder's own wording. If a word or character limit is stated for a question, capture the number.
2. The ASSESSMENT CRITERIA — how the funder says applications are scored or assessed, if stated.

Page content:
---
${pageText}
---

Return ONLY a JSON object:
{
  "questions": [ { "question": "<question text>", "wordLimit": <number or null> } ],
  "assessmentCriteria": "<the assessment criteria as text, or empty string if none stated>"
}

If the page does not actually contain an application form or its questions (e.g. it is just a general funding overview), return "questions": []. Never invent questions. UK English. No markdown fences.`

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
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages:   [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return failed(`Extraction failed (Anthropic ${res.status}). Paste the questions manually.`)
    const data = await res.json() as { content?: { type: string; text: string }[] }
    text = (data.content?.[0]?.text ?? '').trim()
  } catch {
    return failed('Extraction request failed. Paste the questions manually.')
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
      ? `Extracted ${questions.length} question${questions.length === 1 ? '' : 's'} from the page. Check them before drafting.`
      : 'Fetched the page but found no application questions on it — this may be an overview page, not the form itself. Paste the questions manually.',
    questions,
    assessmentCriteria: typeof parsed.assessmentCriteria === 'string' ? parsed.assessmentCriteria.trim() : '',
  }
  return NextResponse.json(result)
}

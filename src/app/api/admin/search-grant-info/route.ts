import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

async function assertAdmin() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (data.user?.email !== ADMIN_EMAIL) throw new Error('Forbidden')
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&pound;|&#163;/g, '£')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 12000)
}

async function callClaude(prompt: string, maxTokens = 400): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message ?? `AI error ${res.status}`)
  return data.content?.[0]?.text ?? ''
}

export async function POST(req: NextRequest) {
  try {
    await assertAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { title, funder, existingUrl } = body as {
    title?: string
    funder?: string
    existingUrl?: string
  }

  if (!title && !funder) {
    return NextResponse.json({ error: 'title or funder is required' }, { status: 400 })
  }

  // ── Step 1: Ask Claude to suggest specific grant page URLs ────────────────────
  const urlPrompt = `You are a UK grant database assistant. I need to find the specific webpage for a grant funding opportunity.

Funder: ${funder ?? '(unknown)'}
Grant title: ${title ?? '(unknown)'}
${existingUrl ? `Known URL (may be a general funder page, not the specific grant page): ${existingUrl}` : ''}

Based on your knowledge of UK funders and their websites, suggest up to 5 specific URLs where detailed information about THIS grant (application details, eligibility, amounts, deadlines) is most likely to be found. Prioritise the most specific grant/programme page over the funder's homepage.

Return ONLY a JSON array of URL strings, ordered by likelihood. No markdown, no explanation. Example:
["https://example.org/grants/small-grants", "https://example.org/apply"]`

  let candidateUrls: string[] = []
  try {
    const raw = await callClaude(urlPrompt, 400)
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) {
      candidateUrls = parsed.filter((u: unknown) => typeof u === 'string' && u.startsWith('http'))
    }
  } catch {
    // Claude couldn't suggest URLs — fall through
  }

  // Also include existingUrl as a fallback candidate at the end
  if (existingUrl && !candidateUrls.includes(existingUrl)) {
    candidateUrls.push(existingUrl)
  }

  if (candidateUrls.length === 0) {
    return NextResponse.json(
      { error: 'Could not find any candidate URLs for this grant. Try entering the URL manually.' },
      { status: 422 }
    )
  }

  // ── Step 2: Try fetching each candidate until one succeeds ────────────────────
  let pageText = ''
  let sourceUrl = ''

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; GrantTrackerBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) continue
      const html = await res.text()
      const text = htmlToText(html)
      if (text.length >= 200) {
        pageText = text
        sourceUrl = url
        break
      }
    } catch {
      continue
    }
  }

  if (!pageText) {
    return NextResponse.json(
      {
        error: `Tried ${candidateUrls.length} URL(s) but none loaded successfully. Try entering the correct URL manually.`,
      },
      { status: 422 }
    )
  }

  // ── Step 3: Extract structured grant data from the page ───────────────────────
  const extractPrompt = `You are a grant database assistant. Extract structured information about a grant funding opportunity from the following webpage content.

Return a single JSON object (no markdown, no extra text) with exactly these fields:
- title: string — the grant programme name (not the funder organisation name)
- funder: string — the name of the funding organisation
- funder_type: one of: trust_foundation, corporate, government, lottery, housing_association, local_authority, competition, loan, crowdfund_match, other
- description: string — 2-3 sentence plain English description of what the grant funds and who can apply
- amount_min: number or null — minimum grant amount in GBP (integer, no currency symbol)
- amount_max: number or null — maximum grant amount in GBP (integer, no currency symbol)
- is_rolling: boolean — true if applications are accepted on a rolling basis, false if there is a fixed deadline
- deadline: string or null — if is_rolling is false, the application deadline in YYYY-MM-DD format; otherwise null
- sectors: array of strings — relevant topic tags from this list only: community, young people, poverty, health, arts, environment, social welfare, education, employment, mental health, culture, sport, disability, social change, heritage, older people, inequality, climate, financial inclusion, technology, housing, homelessness, food, women, human rights, digital skills, rural, innovation, criminal justice, advocacy, wellbeing
- is_invite_only: boolean — true if the grant is invite-only or not open to unsolicited applications

If a field cannot be determined from the page content, use null for amounts/deadline, empty array for sectors, and make your best guess for other fields.

Webpage content from ${sourceUrl}:
${pageText}`

  try {
    const raw = await callClaude(extractPrompt, 1000)
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return NextResponse.json({ ok: true, data: parsed, sourceUrl })
  } catch {
    return NextResponse.json(
      { error: 'AI returned unreadable data — try entering the URL manually' },
      { status: 502 }
    )
  }
}

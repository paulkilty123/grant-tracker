import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 45

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

async function assertAdmin() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (data.user?.email !== ADMIN_EMAIL) throw new Error('Forbidden')
}

// Patterns that indicate a 404 / error page rather than real content
const NOT_FOUND_PATTERNS = [
  /\bpage.{0,10}not.{0,10}found\b/i,
  /\b404\b/,
  /\bpage.{0,10}doesn.t exist\b/i,
  /\bpage.{0,10}no longer exists\b/i,
  /\bsorry.{0,20}can.t find\b/i,
  /\bno page found\b/i,
  /\bpage.{0,10}unavailable\b/i,
]
function looksLike404(text: string): boolean {
  return NOT_FOUND_PATTERNS.some(p => p.test(text.slice(0, 800)))
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&pound;|&#163;/g, '£')
    .replace(/\s{2,}/g, ' ').trim()
    .slice(0, 12000)
}

function isLikely404Url(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase()
    return path === '/404' || path.endsWith('/404') || path === '/not-found' || path === '/error'
  } catch { return false }
}

// Try fetching a URL via Jina.ai Reader (handles bot-protected pages)
// then fall back to a direct fetch
async function tryFetchPage(url: string): Promise<string | null> {
  // Reject URLs that are obviously error pages
  if (isLikely404Url(url)) return null

  // Try Jina first
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text' },
      signal: AbortSignal.timeout(15_000),
    })
    if (res.ok) {
      const text = await res.text()
      if (text.length >= 300 && !looksLike404(text)) return text.slice(0, 12000)
    }
  } catch { /* fall through */ }

  // Direct fetch as fallback
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GrantTrackerBot/1.0)', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) {
      const text = htmlToText(await res.text())
      if (text.length >= 300 && !looksLike404(text)) return text
    }
  } catch { /* fall through */ }

  return null
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

  const ANTHROPIC_HEADERS = {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
    'anthropic-version': '2023-06-01',
  }

  // ── Step 1: Ask Claude for grant info from its training knowledge ──────────
  // Claude knows most UK funders well. Also ask it to suggest a URL so we can
  // try to fetch fresher data to supplement.
  const knowledgePrompt = `You are a UK grant database assistant with extensive knowledge of UK funders.

Based on your training knowledge, provide information about this grant and suggest the most likely current URL for its application/programme page.

Funder: ${funder ?? '(unknown)'}
Grant title: ${title ?? '(unknown)'}
${existingUrl ? `Known URL (may be a general page, not the specific grant page): ${existingUrl}` : ''}

Return a single JSON object (no markdown, no extra text) with exactly these fields:
- title: string — the grant programme name
- funder: string — the name of the funding organisation
- funder_type: one of: trust_foundation, corporate, government, lottery, housing_association, local_authority, competition, loan, crowdfund_match, other
- description: string — 2-3 sentence plain English description of what the grant funds and who can apply
- amount_min: number or null — minimum grant amount in GBP (integer)
- amount_max: number or null — maximum grant amount in GBP (integer)
- is_rolling: boolean — true if rolling applications, false if fixed deadline
- deadline: string or null — deadline in YYYY-MM-DD if known and not rolling, otherwise null
- sectors: array of strings from: community, young people, poverty, health, arts, environment, social welfare, education, employment, mental health, culture, sport, disability, social change, heritage, older people, inequality, climate, financial inclusion, technology, housing, homelessness, food, women, human rights, digital skills, rural, innovation, criminal justice, advocacy, wellbeing
- is_invite_only: boolean
- suggested_url: string or null — your best guess at the specific grant application/programme page URL (not just the funder homepage). Only suggest a URL you are reasonably confident exists. Use null if unsure.`

  const knowledgeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: ANTHROPIC_HEADERS,
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: knowledgePrompt }],
    }),
  })

  const knowledgeData = await knowledgeRes.json()
  if (!knowledgeRes.ok) {
    return NextResponse.json(
      { error: knowledgeData?.error?.message ?? 'AI error' },
      { status: 502 }
    )
  }

  const rawKnowledge = knowledgeData.content?.[0]?.text ?? ''
  const cleanedKnowledge = rawKnowledge.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

  let knowledgeResult: Record<string, unknown> | null = null
  try {
    knowledgeResult = JSON.parse(cleanedKnowledge)
  } catch {
    return NextResponse.json(
      { error: 'AI returned unreadable data — try entering the URL manually' },
      { status: 502 }
    )
  }

  // ── Step 2: Try to fetch a live page to get fresher/more specific data ─────
  // Priority: suggested URL from Claude > existing URL from DB
  const urlsToTry = [
    knowledgeResult?.suggested_url as string | undefined,
    existingUrl,
  ].filter((u): u is string => typeof u === 'string' && u.startsWith('http'))

  let pageText = ''
  let sourceUrl = ''

  for (const url of urlsToTry) {
    const text = await tryFetchPage(url)
    if (text) { pageText = text; sourceUrl = url; break }
  }

  // ── Step 3: If we got a live page, re-extract from it for fresher data ─────
  if (pageText) {
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
- is_invite_only: boolean — true if invite-only

If a field cannot be determined from the page content, use null for amounts/deadline, empty array for sectors, and make your best guess for other fields.

Webpage content from ${sourceUrl}:
${pageText}`

    const extractRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: ANTHROPIC_HEADERS,
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: extractPrompt }],
      }),
    })

    const extractData = await extractRes.json()
    const rawExtract = extractData.content?.[0]?.text ?? ''
    const cleanedExtract = rawExtract.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    try {
      const liveResult = JSON.parse(cleanedExtract)
      return NextResponse.json({ ok: true, data: liveResult, sourceUrl })
    } catch { /* fall through to knowledge result */ }
  }

  // ── Return knowledge-based result if live fetch didn't work ───────────────
  // Still surface Claude's suggested URL (if it's not a known-bad URL) so
  // the user has a starting point to verify or correct manually.
  const { suggested_url: suggestedUrl, ...dataWithoutUrl } = knowledgeResult as Record<string, unknown>
  const fallbackUrl =
    typeof suggestedUrl === 'string' && suggestedUrl.startsWith('http') && !isLikely404Url(suggestedUrl)
      ? suggestedUrl
      : (existingUrl ?? '')
  return NextResponse.json({ ok: true, data: dataWithoutUrl, sourceUrl: fallbackUrl })
}

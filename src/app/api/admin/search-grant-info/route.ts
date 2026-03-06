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

function isLikely404Url(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase()
    return path === '/404' || path.endsWith('/404') || path === '/not-found' || path === '/error'
  } catch { return false }
}

// Quick HEAD check to verify a URL actually exists (returns 200)
async function urlExists(url: string): Promise<boolean> {
  if (isLikely404Url(url)) return false
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GrantTrackerBot/1.0)' },
      signal: AbortSignal.timeout(6_000),
      redirect: 'follow',
    })
    return res.ok
  } catch {
    return false
  }
}

// Extract and rank plausible grant page URLs from Jina search results text
function extractBestUrl(searchText: string, title: string, funder: string): string[] {
  const titleWords = title.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 3)
  const funderWords = funder.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 3)

  const seen = new Set<string>()
  const candidates: Array<{ url: string; score: number }> = []

  // Pull URLs from markdown links and Source: lines
  const patterns = [
    /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g,
    /Source:\s*(https?:\/\/[^\s\n]+)/g,
    /URL:\s*(https?:\/\/[^\s\n]+)/g,
  ]

  for (const regex of patterns) {
    let match: RegExpExecArray | null
    while ((match = regex.exec(searchText)) !== null) {
      const raw = match[match.length - 1].replace(/[)>\s]+$/, '')
      try {
        const u = new URL(raw)
        const clean = u.origin + u.pathname
        if (seen.has(clean)) continue
        seen.add(clean)

        const lower = clean.toLowerCase()
        // Skip noise domains
        if (['twitter.com', 'facebook.com', 'linkedin.com', 'youtube.com',
          'instagram.com', 'wikipedia.org', 'r.jina.ai', 's.jina.ai'].some(d => lower.includes(d))) continue
        if (isLikely404Url(clean)) continue

        let score = 0
        titleWords.forEach(w => { if (lower.includes(w)) score += 5 })
        funderWords.forEach(w => { if (lower.includes(w)) score += 4 })
        const grantKw = ['grant', 'fund', 'apply', 'award', 'match', 'programme', 'scheme', 'bursary']
        grantKw.forEach(kw => { if (lower.includes(kw)) score += 3 })
        const noiseKw = ['news', 'blog', 'twitter', 'facebook', 'search', 'privacy', 'cookie']
        noiseKw.forEach(kw => { if (lower.includes(kw)) score -= 4 })

        candidates.push({ url: clean, score })
      } catch { /* skip */ }
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates.map(c => c.url)
}

const ANTHROPIC_HEADERS = {
  'Content-Type': 'application/json',
  'x-api-key': '',  // set per-request below
  'anthropic-version': '2023-06-01',
}

async function callClaude(prompt: string, apiKey: string, maxTokens = 1000): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { ...ANTHROPIC_HEADERS, 'x-api-key': apiKey },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message ?? `AI error ${res.status}`)
  return data.content?.[0]?.text ?? ''
}

const EXTRACT_FIELDS = `Return a single JSON object (no markdown, no extra text) with exactly these fields:
- title: string — the grant programme name (not the funder organisation name)
- funder: string — the name of the funding organisation
- funder_type: one of: trust_foundation, corporate, government, lottery, housing_association, local_authority, competition, loan, crowdfund_match, other
- description: string — 2-3 sentence plain English description of what the grant funds and who can apply
- amount_min: number or null — minimum grant amount in GBP (integer, no currency symbol)
- amount_max: number or null — maximum grant amount in GBP (integer, no currency symbol)
- is_rolling: boolean — true if applications are accepted on a rolling basis, false if there is a fixed deadline
- deadline: string or null — if is_rolling is false, the application deadline in YYYY-MM-DD format; otherwise null
- sectors: array of strings — relevant topic tags from this list only: community, young people, poverty, health, arts, environment, social welfare, education, employment, mental health, culture, sport, disability, social change, heritage, older people, inequality, climate, financial inclusion, technology, housing, homelessness, food, women, human rights, digital skills, rural, innovation, criminal justice, advocacy, wellbeing
- is_invite_only: boolean — true if the grant is invite-only`

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

  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''

  // Build search query — funder + title keywords
  const cleanTitle = (title ?? '').replace(/[—–]/g, ' ').replace(/[^\w\s]/g, ' ')
    .split(/\s+/).filter(w => w.length > 2).slice(0, 6).join(' ')
  const cleanFunder = (funder ?? '').replace(/[—–]/g, ' ').replace(/[^\w\s]/g, ' ')
    .split(/\s+/).filter(w => w.length > 2).slice(0, 4).join(' ')
  const searchQuery = [cleanFunder, cleanTitle, 'grant'].filter(Boolean).join(' ')

  // ── Strategy A: Jina Search → extract from result snippets ───────────────
  // Search result snippets often contain all the key facts we need without
  // having to load (and get blocked by) individual funder pages.
  let searchText = ''
  let sourceUrl = ''

  try {
    const searchRes = await fetch(`https://s.jina.ai/${encodeURIComponent(searchQuery)}`, {
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text' },
      signal: AbortSignal.timeout(20_000),
    })
    if (searchRes.ok) {
      const raw = await searchRes.text()
      if (raw.length > 200) {
        searchText = raw.slice(0, 15000)
      }
    }
  } catch { /* fall through */ }

  if (searchText) {
    // Verify candidate URLs — pick first that actually returns 200
    const candidates = extractBestUrl(searchText, title ?? '', funder ?? '')
    for (const url of candidates.slice(0, 5)) {
      if (await urlExists(url)) { sourceUrl = url; break }
    }
    // Fall back to existing URL if no candidate verified
    if (!sourceUrl && existingUrl && !isLikely404Url(existingUrl) && await urlExists(existingUrl)) {
      sourceUrl = existingUrl
    }

    const prompt = `You are a UK grant database assistant. Based on the following web search results about a grant, extract the structured grant information.

${EXTRACT_FIELDS}

If a field cannot be determined from the search results, use null for amounts/deadline, empty array for sectors, and make your best guess for other fields.

Search results for "${funder} ${title}":
${searchText}`

    try {
      const raw = await callClaude(prompt, apiKey)
      const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const parsed = JSON.parse(cleaned)
      return NextResponse.json({ ok: true, data: parsed, sourceUrl })
    } catch { /* fall through to knowledge-based */ }
  }

  // ── Strategy B: Claude training knowledge ────────────────────────────────
  // Reliable fallback — Claude knows most UK funders well.
  const knowledgePrompt = `You are a UK grant database assistant with extensive knowledge of UK funders.

Based on your training knowledge, provide information about this grant. Also suggest the most likely current URL for its application or programme page (not just the funder homepage).

Funder: ${funder ?? '(unknown)'}
Grant title: ${title ?? '(unknown)'}
${existingUrl ? `Known URL (may be a general page): ${existingUrl}` : ''}

${EXTRACT_FIELDS}
- suggested_url: string or null — your best guess at the specific grant page URL. Use null if unsure.`

  try {
    const raw = await callClaude(knowledgePrompt, apiKey)
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const result = JSON.parse(cleaned) as Record<string, unknown>
    const { suggested_url: suggestedUrl, ...data } = result
    let fallbackUrl = ''
    if (typeof suggestedUrl === 'string' && suggestedUrl.startsWith('http') && await urlExists(suggestedUrl)) {
      fallbackUrl = suggestedUrl
    } else if (existingUrl && !isLikely404Url(existingUrl) && await urlExists(existingUrl)) {
      fallbackUrl = existingUrl
    }
    return NextResponse.json({ ok: true, data, sourceUrl: fallbackUrl })
  } catch {
    return NextResponse.json(
      { error: 'Could not retrieve grant information. Try entering the details manually.' },
      { status: 502 }
    )
  }
}

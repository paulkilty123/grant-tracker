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

// Patterns that indicate a 404 / error page rather than real content
const NOT_FOUND_PATTERNS = [
  /\bpage.{0,10}not.{0,10}found\b/i,
  /\b404\b/,
  /\bpage.{0,10}doesn.t exist\b/i,
  /\bpage.{0,10}no longer exists\b/i,
  /\bsorry.{0,20}can.t find\b/i,
  /\bthis page has.{0,20}moved\b/i,
  /\bno page found\b/i,
  /\bpage.{0,10}unavailable\b/i,
]

function looksLike404(text: string): boolean {
  const sample = text.slice(0, 1000).toLowerCase()
  return NOT_FOUND_PATTERNS.some(p => p.test(sample))
}

// Fetch a URL via Jina.ai Reader — handles JS-rendered and bot-protected pages
async function fetchViaJina(url: string): Promise<string | null> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return null
    const text = await res.text()
    if (text.length < 200 || looksLike404(text)) return null
    return text.slice(0, 12000)
  } catch {
    return null
  }
}

// Search via Jina.ai Search — returns web results as structured text
async function searchViaJina(query: string): Promise<string | null> {
  try {
    const encoded = encodeURIComponent(query)
    const res = await fetch(`https://s.jina.ai/${encoded}`, {
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return null
    const text = await res.text()
    return text.length >= 100 ? text : null
  } catch {
    return null
  }
}

// Extract URLs from Jina search results or markdown content
function extractUrls(text: string): string[] {
  const seen = new Set<string>()
  const urls: string[] = []

  // Markdown links: [text](url)
  const mdRegex = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g
  let match: RegExpExecArray | null
  while ((match = mdRegex.exec(text)) !== null) {
    try {
      const u = new URL(match[2])
      const clean = u.origin + u.pathname
      if (!seen.has(clean)) { seen.add(clean); urls.push(clean) }
    } catch { /* skip */ }
  }

  // Source lines from Jina search output: "Source: https://..."
  const sourceRegex = /Source:\s*(https?:\/\/[^\s]+)/g
  while ((match = sourceRegex.exec(text)) !== null) {
    try {
      const u = new URL(match[1])
      const clean = u.origin + u.pathname
      if (!seen.has(clean)) { seen.add(clean); urls.push(clean) }
    } catch { /* skip */ }
  }

  // Plain URLs as fallback
  const plainRegex = /https?:\/\/[^\s)\]"'<>,]+/g
  while ((match = plainRegex.exec(text)) !== null) {
    try {
      const u = new URL(match[0])
      const clean = u.origin + u.pathname
      if (!seen.has(clean)) { seen.add(clean); urls.push(clean) }
    } catch { /* skip */ }
  }

  return urls
}

// Score a URL for relevance to the specific grant
function scoreUrl(url: string, title: string, funder: string): number {
  const lower = url.toLowerCase()
  const titleWords = title.toLowerCase()
    .replace(/[—–\-]/g, ' ').replace(/[^\w\s]/g, '')
    .split(/\s+/).filter(w => w.length > 3)
  const funderWords = funder.toLowerCase()
    .replace(/[—–\-]/g, ' ').replace(/[^\w\s]/g, '')
    .split(/\s+/).filter(w => w.length > 3)

  let score = 0
  const grantKeywords = ['apply', 'application', 'fund', 'grant', 'award',
    'programme', 'program', 'scheme', 'bursary', 'booster', 'support']
  grantKeywords.forEach(kw => { if (lower.includes(kw)) score += 3 })
  titleWords.forEach(w => { if (lower.includes(w)) score += 5 })
  funderWords.forEach(w => { if (lower.includes(w)) score += 3 })
  const noise = ['news', 'blog', 'event', 'contact', 'about', 'login',
    'privacy', 'cookie', 'sitemap', 'search', 'twitter', 'facebook', 'linkedin']
  noise.forEach(n => { if (lower.includes(n)) score -= 5 })
  return score
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

  let pageText = ''
  let sourceUrl = ''

  // ── Strategy: web search via Jina Search ─────────────────────────────────
  // Build a targeted query using funder + key title words + site: hint if we
  // have an existing URL so results stay on the right domain.
  const cleanTitle = (title ?? '')
    .replace(/[—–]/g, ' ').replace(/[^\w\s]/g, ' ')
    .split(/\s+/).filter(w => w.length > 2).slice(0, 6).join(' ')
  const cleanFunder = (funder ?? '')
    .replace(/[—–]/g, ' ').replace(/[^\w\s]/g, ' ')
    .split(/\s+/).filter(w => w.length > 2).slice(0, 4).join(' ')

  let siteHint = ''
  if (existingUrl) {
    try { siteHint = `site:${new URL(existingUrl).hostname}` } catch { /* skip */ }
  }

  // Helper: try a list of candidate URLs, return first that loads real content
  async function tryFetchCandidates(urls: Array<{ url: string; score: number }>): Promise<boolean> {
    for (const { url } of urls) {
      const text = await fetchViaJina(url)
      if (text) { pageText = text; sourceUrl = url; return true }
    }
    return false
  }

  // First search: targeted with site: hint to stay on the funder's domain
  const searchQuery = [cleanFunder, cleanTitle, 'grant apply', siteHint]
    .filter(Boolean).join(' ')
  const searchResults = await searchViaJina(searchQuery)
  if (searchResults) {
    const candidates = extractUrls(searchResults)
      .map(u => ({ url: u, score: scoreUrl(u, title ?? '', funder ?? '') }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
    await tryFetchCandidates(candidates)
  }

  // Second search: broaden without site: restriction if first search found nothing
  if (!pageText && siteHint) {
    const broadQuery = [cleanFunder, cleanTitle, 'grant apply'].filter(Boolean).join(' ')
    const broadResults = await searchViaJina(broadQuery)
    if (broadResults) {
      const candidates = extractUrls(broadResults)
        .map(u => ({ url: u, score: scoreUrl(u, title ?? '', funder ?? '') }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
      await tryFetchCandidates(candidates)
    }
  }

  // Last resort: fetch the existing URL directly
  if (!pageText && existingUrl) {
    const text = await fetchViaJina(existingUrl)
    if (text) { pageText = text; sourceUrl = existingUrl }
  }

  if (!pageText) {
    return NextResponse.json(
      { error: 'Could not load the grant page. Try updating the URL to point directly to the specific grant application page, then press the button again.' },
      { status: 422 }
    )
  }

  // ── Extract structured grant data ─────────────────────────────────────────
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

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: extractPrompt }],
    }),
  })

  const aiData = await aiRes.json()
  if (!aiRes.ok) {
    const message = aiData?.error?.message ?? `AI error (${aiRes.status})`
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const raw = aiData.content?.[0]?.text ?? ''
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

  try {
    const parsed = JSON.parse(cleaned)
    return NextResponse.json({ ok: true, data: parsed, sourceUrl })
  } catch {
    return NextResponse.json(
      { error: 'AI returned unreadable data — try entering the URL manually' },
      { status: 502 }
    )
  }
}

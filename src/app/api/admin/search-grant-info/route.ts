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

// How specific is a URL path? Deeper = more specific = better
function pathDepthScore(url: string): number {
  try {
    const path = new URL(url).pathname.replace(/\/$/, '')
    const segments = path.split('/').filter(Boolean)
    // Root or single-segment (homepage, /grants) score 0; deeper pages score more
    if (segments.length === 0) return 0
    if (segments.length === 1) return 1
    return segments.length + 2  // reward depth
  } catch { return 0 }
}

// Is this URL just a funder homepage or top-level landing page?
function isHomepageUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.replace(/\/$/, '')
    const segments = path.split('/').filter(Boolean)
    return segments.length <= 1
  } catch { return false }
}

const NOT_FOUND_PATTERNS = [
  /\bpage not found\b/i,
  /\bpage.{0,15}doesn.t exist\b/i,
  /\bsorry.{0,30}can.t find\b/i,
  /\b404\b/,
  /\bno page found\b/i,
]
function looksLike404(text: string): boolean {
  return NOT_FOUND_PATTERNS.some(p => p.test(text.slice(0, 1000)))
}

// Fetch a page via Jina Reader and return its text content
async function fetchPageText(url: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text' },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return ''
    const text = await res.text()
    if (text.length < 200 || looksLike404(text)) return ''
    return text.slice(0, 15000)
  } catch { return '' }
}

// Score and rank URLs extracted from text, using grant title/funder keywords
function scoreAndRankUrls(
  text: string,
  title: string,
  funder: string,
  existingUrl: string,
): Array<{ url: string; score: number }> {
  const titleWords = title.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 3)
  const funderWords = funder.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 3)
  // Domain of existing URL — URLs on the same domain are preferred
  let existingDomain = ''
  try { existingDomain = new URL(existingUrl).hostname } catch { /* ignore */ }

  const seen = new Set<string>()
  const candidates: Array<{ url: string; score: number }> = []

  const patterns = [
    /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g,
    /Source:\s*(https?:\/\/[^\s\n]+)/g,
    /URL:\s*(https?:\/\/[^\s\n]+)/g,
    /(https?:\/\/[^\s\n"'<>()]+)/g,
  ]

  for (const regex of patterns) {
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      const raw = (match[match.length - 1] || match[1] || '').replace(/[)>\s,]+$/, '')
      try {
        const u = new URL(raw)
        const clean = u.origin + u.pathname
        if (seen.has(clean)) continue
        seen.add(clean)

        const lower = clean.toLowerCase()
        // Skip noise
        if (['twitter.com', 'facebook.com', 'linkedin.com', 'youtube.com',
          'instagram.com', 'wikipedia.org', 'r.jina.ai', 's.jina.ai',
          'google.com', 'bing.com'].some(d => lower.includes(d))) continue
        if (isLikely404Url(clean)) continue

        let score = 0

        // ── Deep path bonus — specific pages > homepages ──────────────────
        score += pathDepthScore(clean) * 3

        // ── Same domain as existing URL ───────────────────────────────────
        if (existingDomain && lower.includes(existingDomain)) score += 5

        // ── Title and funder keywords in URL path ─────────────────────────
        titleWords.forEach(w => { if (lower.includes(w)) score += 6 })
        funderWords.forEach(w => { if (lower.includes(w)) score += 4 })

        // ── Grant-action keywords ─────────────────────────────────────────
        const grantKw = ['apply', 'application', 'grant', 'fund', 'award',
          'programme', 'scheme', 'bursary', 'match', 'support']
        grantKw.forEach(kw => { if (lower.includes(kw)) score += 4 })

        // ── Penalise noise ────────────────────────────────────────────────
        const noiseKw = ['news', 'blog', 'press', 'privacy', 'cookie',
          'contact', 'about', 'login', 'register', 'search']
        noiseKw.forEach(kw => { if (lower.includes(kw)) score -= 5 })

        // ── Penalise the existing URL if it's just a homepage ─────────────
        // (don't reward confirming an already-known low-quality URL)
        if (existingUrl && clean === existingUrl.replace(/\/$/, '') && isHomepageUrl(clean)) {
          score -= 10
        }

        candidates.push({ url: clean, score })
      } catch { /* skip */ }
    }
  }

  return candidates.sort((a, b) => b.score - a.score)
}

const ANTHROPIC_HEADERS = {
  'Content-Type': 'application/json',
  'x-api-key': '',
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

  // Build a specific search query — exact title phrase + funder + "apply"
  const cleanTitle = (title ?? '').replace(/[—–]/g, ' ').trim()
  const cleanFunder = (funder ?? '').replace(/[—–]/g, ' ').trim()

  // Use quoted title phrase for precision; add "apply" to find application pages
  const searchQuery = `"${cleanTitle}" ${cleanFunder} apply`

  let bestUrl = ''
  let searchText = ''
  let pageText = ''

  // ── Step 1: Jina web search with specific query ────────────────────────────
  try {
    const searchRes = await fetch(`https://s.jina.ai/${encodeURIComponent(searchQuery)}`, {
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text' },
      signal: AbortSignal.timeout(18_000),
    })
    if (searchRes.ok) {
      const raw = await searchRes.text()
      if (raw.length > 200) searchText = raw.slice(0, 15000)
    }
  } catch { /* fall through */ }

  if (searchText) {
    const candidates = scoreAndRankUrls(searchText, title ?? '', funder ?? '', existingUrl ?? '')
    // Pick top candidate — prefer specific pages over homepages
    const specificCandidate = candidates.find(c => !isLikely404Url(c.url) && !isHomepageUrl(c.url))
    const anyCandidate = candidates.find(c => !isLikely404Url(c.url))
    bestUrl = specificCandidate?.url ?? anyCandidate?.url ?? ''
  }

  // ── Step 2: If existing URL is a homepage, crawl it to find deeper links ──
  // e.g. existing URL is "funder.org/grants" — crawl it to find specific page
  if (existingUrl && (isHomepageUrl(existingUrl) || !bestUrl || bestUrl === existingUrl)) {
    pageText = await fetchPageText(existingUrl)
    if (pageText) {
      const pageCandidates = scoreAndRankUrls(pageText, title ?? '', funder ?? '', existingUrl ?? '')
      const deeperLink = pageCandidates.find(
        c => !isLikely404Url(c.url) && !isHomepageUrl(c.url) && c.url !== existingUrl
      )
      if (deeperLink && deeperLink.score > 5) {
        bestUrl = deeperLink.url
      }
    }
  }

  // Combine all text sources for Claude to extract grant info from
  const combinedText = [searchText, pageText].filter(Boolean).join('\n\n---\n\n')

  // ── Step 3: Extract structured data with Claude ────────────────────────────
  if (combinedText) {
    const prompt = `You are a UK grant database assistant. Based on the following web search results and page content about a grant, extract the structured grant information.

${EXTRACT_FIELDS}

If a field cannot be determined, use null for amounts/deadline, empty array for sectors, and make your best guess for other required fields.

Grant being researched: "${cleanTitle}" by ${cleanFunder}

Content:
${combinedText.slice(0, 12000)}`

    try {
      const raw = await callClaude(prompt, apiKey)
      const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const parsed = JSON.parse(cleaned)
      const sourceUrl = bestUrl || existingUrl || ''
      const urlImproved = !!bestUrl && bestUrl !== existingUrl && !isHomepageUrl(bestUrl)
      return NextResponse.json({ ok: true, data: parsed, sourceUrl, urlImproved })
    } catch { /* fall through */ }
  }

  // ── Step 4: Fallback — Claude training knowledge ───────────────────────────
  const knowledgePrompt = `You are a UK grant database assistant with extensive knowledge of UK funders.

Provide information about this grant using your training knowledge. Focus on finding the SPECIFIC grant application page URL, not just the funder's homepage.

Funder: ${cleanFunder}
Grant title: ${cleanTitle}
${existingUrl ? `Current URL (may be too general): ${existingUrl}` : 'No URL currently stored.'}

${EXTRACT_FIELDS}
- suggested_url: string or null — the specific grant application page URL. If the current URL looks like a homepage, suggest a more specific page. Use null only if you genuinely don't know.`

  try {
    const raw = await callClaude(knowledgePrompt, apiKey)
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const result = JSON.parse(cleaned) as Record<string, unknown>
    const { suggested_url: suggestedUrl, ...data } = result
    const suggestedIsSpecific =
      typeof suggestedUrl === 'string' &&
      suggestedUrl.startsWith('http') &&
      !isLikely404Url(suggestedUrl) &&
      !isHomepageUrl(suggestedUrl)
    const sourceUrl = suggestedIsSpecific
      ? suggestedUrl as string
      : (existingUrl ?? '')
    const urlImproved = suggestedIsSpecific && sourceUrl !== existingUrl
    return NextResponse.json({ ok: true, data, sourceUrl, urlImproved })
  } catch {
    return NextResponse.json(
      { error: 'Could not retrieve grant information. Try entering the details manually.' },
      { status: 502 }
    )
  }
}

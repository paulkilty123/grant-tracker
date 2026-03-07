import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 55

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
    if (segments.length === 0) return 0
    if (segments.length === 1) return 1
    return segments.length + 2  // reward depth
  } catch { return 0 }
}

// Is this URL just a funder homepage or very top-level page?
function isHomepageUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.replace(/\/$/, '')
    const segments = path.split('/').filter(Boolean)
    return segments.length <= 1
  } catch { return false }
}

// Is this a generic non-grant page? (CSR, about, contact, news etc.)
function isGenericPage(url: string): boolean {
  const lower = url.toLowerCase()
  const genericSegments = [
    'about', 'contact', 'news', 'press', 'blog', 'privacy', 'cookie',
    'corporate-responsibility', 'csr', 'sustainability', 'who-we-are',
    'our-story', 'team', 'careers', 'jobs', 'login', 'register',
    'making-a-difference', 'community', 'responsibility',
  ]
  try {
    const path = new URL(url).pathname.toLowerCase()
    // If path contains ONLY generic segments and no grant-related ones, flag it
    const hasGrantKeyword = ['grant', 'fund', 'apply', 'application', 'award', 'programme',
      'scheme', 'bursary', 'support', 'neighbourhood', 'local'].some(k => path.includes(k))
    if (hasGrantKeyword) return false
    return genericSegments.some(s => path.includes(s))
  } catch { return false }
}

// Score combining depth, keywords, and grant relevance
function isLowQualityUrl(url: string): boolean {
  return isHomepageUrl(url) || isGenericPage(url)
}

const NOT_FOUND_PATTERNS = [
  /\bpage not found\b/i,
  /\bpage.{0,15}doesn.t exist\b/i,
  /\bsorry.{0,30}can.t find\b/i,
  /\b404\b/,
  /\bno page found\b/i,
  /\bthis page.{0,20}(no longer|not available|been removed)\b/i,
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

// Perform a Jina web search and return the result text
async function jinaSearch(query: string): Promise<string> {
  try {
    const res = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, {
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return ''
    const text = await res.text()
    return text.length > 200 ? text.slice(0, 15000) : ''
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
        if (['twitter.com', 'facebook.com', 'linkedin.com', 'youtube.com',
          'instagram.com', 'wikipedia.org', 'r.jina.ai', 's.jina.ai',
          'google.com', 'bing.com'].some(d => lower.includes(d))) continue
        if (isLikely404Url(clean)) continue

        let score = 0

        // Deep path bonus — specific pages > homepages
        score += pathDepthScore(clean) * 3

        // Same domain as existing URL
        if (existingDomain && lower.includes(existingDomain)) score += 4

        // Title and funder keywords in URL path
        titleWords.forEach(w => { if (lower.includes(w)) score += 6 })
        funderWords.forEach(w => { if (lower.includes(w)) score += 3 })

        // Grant-action keywords in path
        const grantKw = ['apply', 'application', 'grant', 'fund', 'award',
          'programme', 'scheme', 'bursary', 'match', 'support']
        grantKw.forEach(kw => { if (lower.includes(kw)) score += 4 })

        // Penalise noise pages
        const noiseKw = ['news', 'blog', 'press', 'privacy', 'cookie',
          'contact', 'about', 'login', 'register', 'search',
          'corporate-responsibility', 'csr', 'sustainability']
        noiseKw.forEach(kw => { if (lower.includes(kw)) score -= 6 })

        // Strong penalty if this is the existing URL and it's low quality
        if (existingUrl) {
          const cleanExisting = existingUrl.replace(/\/$/, '')
          if (clean === cleanExisting && isLowQualityUrl(clean)) {
            score -= 15
          }
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

  // Clean title — remove em/en dashes and collapse whitespace
  const cleanTitle = (title ?? '').replace(/[—–]/g, ' ').replace(/\s+/g, ' ').trim()
  const cleanFunder = (funder ?? '').replace(/[—–]/g, ' ').replace(/\s+/g, ' ').trim()

  let bestUrl = ''
  let searchText = ''
  let pageText = ''
  const allSearchTexts: string[] = []

  // ── Step 1a: Jina search — exact quoted title phrase ──────────────────────
  const exactQuery = `"${cleanTitle}" ${cleanFunder} apply`
  const exactText = await jinaSearch(exactQuery)
  if (exactText) {
    allSearchTexts.push(exactText)
    searchText = exactText
    const candidates = scoreAndRankUrls(exactText, cleanTitle, cleanFunder, existingUrl ?? '')
    const best = candidates.find(c => !isLikely404Url(c.url) && !isLowQualityUrl(c.url))
    if (best && best.score > 8) bestUrl = best.url
  }

  // ── Step 1b: Broader search if exact phrase didn't find a good URL ─────────
  if (!bestUrl || isLowQualityUrl(bestUrl)) {
    // Drop quotes, try broader match
    const broadQuery = `${cleanTitle} ${cleanFunder} grant apply UK`
    const broadText = await jinaSearch(broadQuery)
    if (broadText) {
      allSearchTexts.push(broadText)
      const candidates = scoreAndRankUrls(broadText, cleanTitle, cleanFunder, existingUrl ?? '')
      const best = candidates.find(c => !isLikely404Url(c.url) && !isLowQualityUrl(c.url))
      if (best && best.score > 8) bestUrl = best.url
    }
  }

  // ── Step 2: Always crawl the existing URL ─────────────────────────────────
  // The existing URL may be a dud, a CSR page, or a generic landing page.
  // Crawl it to check if it has links to a more specific grant page.
  if (existingUrl) {
    const crawledText = await fetchPageText(existingUrl)
    if (crawledText) {
      pageText = crawledText
      allSearchTexts.push(crawledText)
      const pageCandidates = scoreAndRankUrls(crawledText, cleanTitle, cleanFunder, existingUrl)
      // Only upgrade to a page link if it's clearly better (grant-specific path)
      const deeperLink = pageCandidates.find(
        c => !isLikely404Url(c.url) && !isLowQualityUrl(c.url) && c.url !== existingUrl && c.score > 8
      )
      if (deeperLink && (!bestUrl || isLowQualityUrl(bestUrl))) {
        bestUrl = deeperLink.url
      }
    }
  }

  // Combine all gathered text for Claude
  const combinedText = allSearchTexts.filter(Boolean).join('\n\n---\n\n')

  // ── Step 3: Claude extracts structured data from gathered text ─────────────
  if (combinedText) {
    const existingUrlNote = existingUrl
      ? `\nNote: The current stored URL is "${existingUrl}" — this may be a generic page (CSR, about, etc.), NOT the actual grant page. If you can identify a better, more specific URL from the content above, use that.`
      : ''

    const prompt = `You are a UK grant database assistant. Based on the following web search results and page content, extract structured information about this grant.

${EXTRACT_FIELDS}

If a field cannot be determined, use null for amounts/deadline, empty array for sectors, and your best guess for other required fields.
${existingUrlNote}

Grant being researched: "${cleanTitle}" by ${cleanFunder}

Content:
${combinedText.slice(0, 12000)}`

    try {
      const raw = await callClaude(prompt, apiKey)
      const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const parsed = JSON.parse(cleaned)
      const sourceUrl = bestUrl || existingUrl || ''
      const urlImproved = !!bestUrl && bestUrl !== (existingUrl ?? '') && !isLowQualityUrl(bestUrl)
      return NextResponse.json({ ok: true, data: parsed, sourceUrl, urlImproved })
    } catch { /* fall through */ }
  }

  // ── Step 4: Fallback — Claude training knowledge ───────────────────────────
  const existingIsLowQuality = existingUrl ? isLowQualityUrl(existingUrl) : true
  const knowledgePrompt = `You are a UK grant database assistant with extensive knowledge of UK funders and grant programmes.

Provide information about this grant using your training knowledge.

Funder: ${cleanFunder}
Grant title: ${cleanTitle}
${existingUrl ? `Current URL stored (${existingIsLowQuality ? 'LIKELY WRONG — appears to be a generic/CSR page, not the actual grant page' : 'may be outdated'}): ${existingUrl}` : 'No URL currently stored.'}

Your task: Find the SPECIFIC grant application or information page URL, NOT the funder homepage or corporate responsibility page.
If this grant has moved to a community platform (e.g. LocalGiving, Spacehive, etc.) include that URL.
If the grant no longer exists or is closed, say so in the description and set suggested_url to null.

${EXTRACT_FIELDS}
- suggested_url: string or null — the SPECIFIC grant page URL. Must be different from the current URL if the current URL is a generic page. Use null only if the grant genuinely doesn't exist or you cannot find the page.`

  try {
    const raw = await callClaude(knowledgePrompt, apiKey)
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const result = JSON.parse(cleaned) as Record<string, unknown>
    const { suggested_url: suggestedUrl, ...data } = result
    const suggestedIsSpecific =
      typeof suggestedUrl === 'string' &&
      suggestedUrl.startsWith('http') &&
      !isLikely404Url(suggestedUrl) &&
      !isLowQualityUrl(suggestedUrl)
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

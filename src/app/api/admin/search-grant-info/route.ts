import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deepCheckUrl } from '@/lib/url-validator'

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
    return segments.length + 2
  } catch { return 0 }
}

// Is this URL just a funder homepage or top-level page?
function isHomepageUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.replace(/\/$/, '')
    const segments = path.split('/').filter(Boolean)
    return segments.length <= 1
  } catch { return false }
}

// Is this a generic non-grant page (CSR, about, contact, news etc.)?
function isGenericPage(url: string): boolean {
  const genericSegments = [
    'about', 'contact', 'news', 'press', 'blog', 'privacy', 'cookie',
    'corporate-responsibility', 'csr', 'sustainability', 'who-we-are',
    'our-story', 'team', 'careers', 'jobs', 'login', 'register',
    'making-a-difference', 'responsibility',
  ]
  try {
    const path = new URL(url).pathname.toLowerCase()
    const hasGrantKeyword = ['grant', 'fund', 'apply', 'application', 'award', 'programme',
      'scheme', 'bursary', 'support', 'loan', 'finance', 'invest'].some(k => path.includes(k))
    if (hasGrantKeyword) return false
    return genericSegments.some(s => path.includes(s))
  } catch { return false }
}

function isLowQualityUrl(url: string): boolean {
  return isHomepageUrl(url) || isGenericPage(url)
}

// Extract just the domain+origin from a URL
function getOrigin(url: string): string {
  try { return new URL(url).origin } catch { return '' }
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

// Score and rank URLs extracted from text
function scoreAndRankUrls(
  text: string,
  title: string,
  funder: string,
  existingUrl: string,
  preferredDomain?: string,
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

        // Deep path — specific pages reward
        score += pathDepthScore(clean) * 3

        // Same domain as existing URL
        if (existingDomain && lower.includes(existingDomain)) score += 4

        // Preferred domain (e.g. funder homepage we already found)
        if (preferredDomain && lower.includes(preferredDomain)) score += 3

        // Title and funder keywords in URL path
        titleWords.forEach(w => { if (lower.includes(w)) score += 6 })
        funderWords.forEach(w => { if (lower.includes(w)) score += 3 })

        // Grant-action keywords in path
        const grantKw = ['apply', 'application', 'grant', 'fund', 'award',
          'programme', 'scheme', 'bursary', 'loan', 'finance', 'support']
        grantKw.forEach(kw => { if (lower.includes(kw)) score += 4 })

        // Penalise noise
        const noiseKw = ['news', 'blog', 'press', 'privacy', 'cookie',
          'contact', 'about', 'login', 'register', 'search',
          'corporate-responsibility', 'csr', 'sustainability']
        noiseKw.forEach(kw => { if (lower.includes(kw)) score -= 6 })

        // Strong penalty if this IS the existing URL and it's low quality
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
  const { title, funder, existingUrl, skipUrlSearch } = body as {
    title?: string
    funder?: string
    existingUrl?: string
    // When true, skip the Jina search steps and go straight to crawling
    // existingUrl. Used by the "Populate" button when user enters a known URL.
    skipUrlSearch?: boolean
  }

  if (!title && !funder) {
    return NextResponse.json({ error: 'title or funder is required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''

  const cleanTitle = (title ?? '').replace(/[—–]/g, ' ').replace(/\s+/g, ' ').trim()
  const cleanFunder = (funder ?? '').replace(/[—–]/g, ' ').replace(/\s+/g, ' ').trim()

  let bestUrl = ''
  let existingUrlIsDead = false
  const allSearchTexts: string[] = []

  // Helper: pick best SPECIFIC URL (not homepage, not generic page)
  function pickBest(candidates: Array<{ url: string; score: number }>, minScore = 5): string {
    return candidates.find(c => !isLikely404Url(c.url) && !isLowQualityUrl(c.url) && c.score >= minScore)?.url ?? ''
  }
  // Helper: pick best URL that is at least not a 404 (allows homepage/generic as fallback)
  function pickAny(candidates: Array<{ url: string; score: number }>, minScore = 1): string {
    return candidates.find(c => !isLikely404Url(c.url) && c.score >= minScore)?.url ?? ''
  }

  // ── Step 1a: Exact quoted title phrase search ─────────────────────────────
  // Always run when we have a title — even with skipUrlSearch, because the
  // user-provided URL may be a generic listing page with no specific info.
  if (cleanTitle) {
    const exactText = await jinaSearch(`"${cleanTitle}" ${cleanFunder} apply`)
    if (exactText) {
      allSearchTexts.push(exactText)
      const found = pickBest(scoreAndRankUrls(exactText, cleanTitle, cleanFunder, existingUrl ?? ''))
      if (found && !skipUrlSearch) bestUrl = found
    }
  }

  // ── Step 1b: Broader search (no quotes) ───────────────────────────────────
  if (!bestUrl && !skipUrlSearch) {
    const broadText = await jinaSearch(`${cleanTitle} ${cleanFunder} grant apply UK`)
    if (broadText) {
      allSearchTexts.push(broadText)
      const found = pickBest(scoreAndRankUrls(broadText, cleanTitle, cleanFunder, existingUrl ?? ''))
      if (found) bestUrl = found
    }
  }

  // ── Step 2: Crawl the existing URL ────────────────────────────────────────
  if (existingUrl) {
    const crawledText = await fetchPageText(existingUrl)
    if (crawledText) {
      allSearchTexts.push(crawledText)
      if (!bestUrl) {
        const candidates = scoreAndRankUrls(crawledText, cleanTitle, cleanFunder, existingUrl)
        const found = pickBest(candidates, 5)
        if (found && found !== existingUrl) bestUrl = found
      }

      // ── Step 2b: If existing URL is a listing page, try to follow a link
      // to the specific programme page for richer content ──────────────────
      if (skipUrlSearch && cleanTitle) {
        // Find the best title-matching link from the listing page
        const candidates = scoreAndRankUrls(crawledText, cleanTitle, cleanFunder, existingUrl)
        const specificPage = candidates.find(c =>
          !isLikely404Url(c.url) &&
          c.url !== existingUrl &&
          c.score >= 8 // High threshold — must strongly match the grant title
        )
        if (specificPage) {
          const specificText = await fetchPageText(specificPage.url)
          if (specificText) {
            // Prepend the specific page content so Claude prioritises it
            allSearchTexts.unshift(specificText)
            if (!bestUrl || isLowQualityUrl(bestUrl)) bestUrl = specificPage.url
          }
        }
      }
    } else {
      // Existing URL returned empty — likely a 404 or dead page
      existingUrlIsDead = true
    }
  }

  // ── Step 3: Crawl the funder's homepage if we still have no good URL ──────
  // Useful when existing URL is dead and search didn't find the specific page
  let funderHomepageUrl = ''
  if (existingUrl) {
    funderHomepageUrl = getOrigin(existingUrl)
  }
  if (!bestUrl && funderHomepageUrl) {
    const homepageText = await fetchPageText(funderHomepageUrl)
    if (homepageText) {
      allSearchTexts.push(homepageText)
      const homeCandidates = scoreAndRankUrls(homepageText, cleanTitle, cleanFunder, existingUrl ?? '')
      // First try to find a specific deep page
      const specific = pickBest(homeCandidates, 4)
      if (specific) {
        bestUrl = specific
      } else {
        // Accept shallow same-domain pages (e.g. /loans, /apply) as a better-than-nothing fallback
        const shallow = homeCandidates.find(c =>
          !isLikely404Url(c.url) &&
          c.url !== (existingUrl ?? '') &&
          c.score >= 2
        )
        if (shallow) bestUrl = shallow.url
      }
    }
  }

  // Combine all gathered text for Claude
  const combinedText = allSearchTexts.filter(Boolean).join('\n\n---\n\n')

  // Build URL context note for Claude prompts
  const urlContext = existingUrl
    ? existingUrlIsDead
      ? `The current stored URL "${existingUrl}" is DEAD (returns 404 / no content). You MUST suggest a different working URL.`
      : isLowQualityUrl(existingUrl)
        ? `The current stored URL "${existingUrl}" appears to be a generic page, NOT the actual grant page. Suggest a more specific URL if you can.`
        : `Current URL: "${existingUrl}" — suggest a better one if you know of one.`
    : 'No URL currently stored.'

  // ── Verify a suggested URL actually exists (reject Claude hallucinations) ───
  async function verifySuggested(suggestedUrl: string): Promise<boolean> {
    if (!suggestedUrl.startsWith('http')) return false
    try {
      const res = await fetch(suggestedUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (GrantTracker/1.0)' },
      })
      return res.status !== 404 && res.status !== 410 && res.status !== 400
    } catch {
      return false // Network error → can't confirm it exists
    }
  }

  // ── Compare old vs new URL quality — only upgrade if meaningfully better ────
  async function shouldUpgradeUrl(
    newUrl: string,
    oldUrl: string | undefined,
  ): Promise<{ improved: boolean; oldScore: number; newScore: number }> {
    if (!oldUrl || existingUrlIsDead) {
      // No existing URL or it's dead — any working URL is an improvement
      return { improved: true, oldScore: 0, newScore: 60 }
    }
    if (newUrl === oldUrl) return { improved: false, oldScore: 50, newScore: 50 }

    // Deep-check both URLs in parallel
    const [oldResult, newResult] = await Promise.all([
      deepCheckUrl(oldUrl, cleanFunder, cleanTitle),
      deepCheckUrl(newUrl, cleanFunder, cleanTitle),
    ])

    // Only suggest if new is ≥15 points better, or old is already bad (< 40)
    const improvement = newResult.qualityScore - oldResult.qualityScore
    const improved = improvement >= 15 || (oldResult.qualityScore < 40 && newResult.qualityScore >= 40)

    return {
      improved,
      oldScore: oldResult.qualityScore,
      newScore: newResult.qualityScore,
    }
  }

  // ── Step 4: Claude extracts data + suggests URL from gathered content ──────
  if (combinedText) {
    const prompt = `You are a UK grant database assistant. Extract structured information about a specific grant from the content below.

You are looking for: "${cleanTitle}" by ${cleanFunder}.
The content may mention multiple programmes — focus on the one that best matches "${cleanTitle}" and extract its details.
If NONE of the programmes match "${cleanTitle}" at all, only then should you set description to null. Otherwise, always provide a description and fill in as many fields as possible.

${EXTRACT_FIELDS}
- suggested_url: string or null — the specific grant application or information page URL for "${cleanTitle}" (not a general listing page). ${urlContext} Must start with https://. Use null only if you genuinely cannot find one.

Content:
${combinedText.slice(0, 12000)}`

    try {
      const raw = await callClaude(prompt, apiKey)
      const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const result = JSON.parse(cleaned) as Record<string, unknown>
      const { suggested_url: suggestedUrl, ...data } = result

      // Accept Claude's suggestion if we don't have a specific URL yet
      if (!bestUrl && typeof suggestedUrl === 'string' && suggestedUrl.startsWith('http')) {
        // Verify the suggested URL actually exists before accepting
        const exists = await verifySuggested(suggestedUrl)
        if (exists) {
          if (!isLikely404Url(suggestedUrl) && !isLowQualityUrl(suggestedUrl)) {
            bestUrl = suggestedUrl
          } else if (!isLikely404Url(suggestedUrl) && existingUrlIsDead) {
            bestUrl = suggestedUrl
          }
        }
      }

      // Final fallback: if still no URL and existing was dead, use funder homepage
      if (!bestUrl && existingUrlIsDead && funderHomepageUrl) bestUrl = funderHomepageUrl

      const sourceUrl = bestUrl || (existingUrlIsDead ? '' : (existingUrl ?? ''))

      // Compare old vs new before declaring "improved"
      let urlImproved = false
      let urlComparison: { oldScore: number; newScore: number } | undefined
      if (bestUrl && bestUrl !== (existingUrl ?? '') && !isLowQualityUrl(bestUrl)) {
        const cmp = await shouldUpgradeUrl(bestUrl, existingUrl)
        urlImproved = cmp.improved
        urlComparison = { oldScore: cmp.oldScore, newScore: cmp.newScore }
        // If the old URL is actually better, revert to it
        if (!urlImproved && existingUrl && !existingUrlIsDead) {
          return NextResponse.json({ ok: true, data, sourceUrl: existingUrl, urlImproved: false, urlWasDead: existingUrlIsDead, urlComparison })
        }
      }

      return NextResponse.json({ ok: true, data, sourceUrl, urlImproved, urlWasDead: existingUrlIsDead, urlComparison })
    } catch { /* fall through */ }
  }

  // ── Step 5: Pure Claude knowledge fallback ────────────────────────────────
  const knowledgePrompt = `You are a UK grant database assistant with extensive knowledge of UK funders.

Provide detailed information about this specific grant. Always fill in as many fields as possible.
Funder: ${cleanFunder}
Grant title: ${cleanTitle}
${urlContext}

Find the SPECIFIC grant application or information page URL for "${cleanTitle}". If the grant has moved to a community platform (LocalGiving, Spacehive, etc.) include that URL. If the grant no longer exists, say so in the description and set suggested_url to null.

${EXTRACT_FIELDS}
- suggested_url: string or null — SPECIFIC grant page URL for "${cleanTitle}". Use null only if the grant genuinely doesn't exist.`

  try {
    const raw = await callClaude(knowledgePrompt, apiKey)
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const result = JSON.parse(cleaned) as Record<string, unknown>
    const { suggested_url: suggestedUrl, ...data } = result
    let finalUrl = bestUrl  // may already be set from earlier steps
    if (!finalUrl && typeof suggestedUrl === 'string' && suggestedUrl.startsWith('http')) {
      // Verify before accepting
      const exists = await verifySuggested(suggestedUrl)
      if (exists && !isLikely404Url(suggestedUrl)) finalUrl = suggestedUrl as string
    }
    // Last resort: funder homepage so user at least has somewhere to start
    if (!finalUrl && existingUrlIsDead && funderHomepageUrl) finalUrl = funderHomepageUrl
    if (!finalUrl && !existingUrlIsDead) finalUrl = existingUrl ?? ''

    // Compare old vs new before declaring "improved"
    let urlImproved = false
    let urlComparison: { oldScore: number; newScore: number } | undefined
    if (finalUrl && finalUrl !== existingUrl && !isLowQualityUrl(finalUrl)) {
      const cmp = await shouldUpgradeUrl(finalUrl, existingUrl)
      urlImproved = cmp.improved
      urlComparison = { oldScore: cmp.oldScore, newScore: cmp.newScore }
      if (!urlImproved && existingUrl && !existingUrlIsDead) {
        return NextResponse.json({ ok: true, data, sourceUrl: existingUrl, urlImproved: false, urlWasDead: existingUrlIsDead, urlComparison })
      }
    }

    return NextResponse.json({ ok: true, data, sourceUrl: finalUrl, urlImproved, urlWasDead: existingUrlIsDead, urlComparison })
  } catch {
    return NextResponse.json(
      { error: 'Could not retrieve grant information. Try entering the details manually.' },
      { status: 502 }
    )
  }
}

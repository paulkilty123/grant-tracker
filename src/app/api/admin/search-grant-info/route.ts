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

// Strip HTML tags and collapse whitespace to get readable page text
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

// Extract result URLs from DuckDuckGo HTML search results page
function extractSearchResults(html: string): string[] {
  const urls: string[] = []

  // DuckDuckGo embeds actual URLs in uddg= parameter of redirect links
  const uddgRegex = /uddg=([^&"'\s]+)/g
  let match: RegExpExecArray | null
  while ((match = uddgRegex.exec(html)) !== null) {
    try {
      const decoded = decodeURIComponent(match[1])
      if (decoded.startsWith('http') && !decoded.includes('duckduckgo.com')) {
        urls.push(decoded)
      }
    } catch {
      // skip malformed
    }
  }

  // Also try plain href links as fallback
  if (urls.length === 0) {
    const hrefRegex = /href="(https?:\/\/(?!.*duckduckgo)[^"]+)"/g
    while ((match = hrefRegex.exec(html)) !== null) {
      const u = match[1]
      if (!u.includes('duckduckgo') && !u.includes('duck.co')) {
        urls.push(u)
      }
    }
  }

  // Deduplicate and return
  const seen = new Set<string>()
  return urls.filter(u => {
    if (seen.has(u)) return false
    seen.add(u)
    return true
  })
}

// Score a URL for likely relevance to grant info (higher = better)
function scoreUrl(url: string, funder: string, title: string): number {
  const lower = url.toLowerCase()
  const funderWords = funder.toLowerCase().split(/\s+/).filter(w => w.length > 3)
  const titleWords = title.toLowerCase().split(/\s+/).filter(w => w.length > 3)

  let score = 0

  // Penalise social media, news aggregators, job sites
  const noise = ['twitter.com', 'facebook.com', 'linkedin.com', 'youtube.com',
    'instagram.com', 'wikipedia.org', 'bbc.co.uk', 'theguardian.com',
    'indeed.com', 'glassdoor.com', 'charityjob']
  if (noise.some(n => lower.includes(n))) return -100

  // Favour .gov, .org, .org.uk
  if (lower.includes('.gov')) score += 10
  if (lower.includes('.org')) score += 5

  // Favour funder name appearing in domain
  funderWords.forEach(w => { if (lower.includes(w)) score += 8 })

  // Favour grant-related path segments
  const grantKeywords = ['grant', 'fund', 'apply', 'award', 'programme', 'program', 'scheme', 'bursary']
  grantKeywords.forEach(kw => { if (lower.includes(kw)) score += 3 })

  // Favour title words appearing in URL
  titleWords.forEach(w => { if (lower.includes(w)) score += 2 })

  return score
}

export async function POST(req: NextRequest) {
  try {
    await assertAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { title, funder } = body as { title?: string; funder?: string }

  if (!title && !funder) {
    return NextResponse.json({ error: 'title or funder is required' }, { status: 400 })
  }

  const searchQuery = [funder, title, 'grant apply'].filter(Boolean).join(' ')
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`

  // ── Search DuckDuckGo ──────────────────────────────────────────────────────────
  let candidateUrls: string[] = []
  try {
    const searchRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      signal: AbortSignal.timeout(12_000),
    })

    if (searchRes.ok) {
      const html = await searchRes.text()
      const allUrls = extractSearchResults(html)

      // Sort by relevance score, take top 5
      candidateUrls = allUrls
        .map(u => ({ url: u, score: scoreUrl(u, funder ?? '', title ?? '') }))
        .filter(x => x.score > -100)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(x => x.url)
    }
  } catch {
    // Search failed — fall through to error below
  }

  if (candidateUrls.length === 0) {
    return NextResponse.json(
      { error: `No search results found for "${searchQuery}". Try adding or correcting the grant URL manually.` },
      { status: 422 }
    )
  }

  // ── Try fetching candidate pages until one succeeds ───────────────────────────
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
      { error: 'Found search results but could not load any of the pages. Try adding the URL manually.' },
      { status: 422 }
    )
  }

  // ── Ask Claude to extract structured grant info ───────────────────────────────
  const prompt = `You are a grant database assistant. Extract structured information about a grant funding opportunity from the following webpage content.

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
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const aiData = await aiRes.json()

  if (!aiRes.ok) {
    const message = aiData?.error?.message ?? `AI error (${aiRes.status})`
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const text = aiData.content?.[0]?.text ?? ''
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

  try {
    const parsed = JSON.parse(cleaned)
    // Return extracted data + the URL we sourced it from
    return NextResponse.json({ ok: true, data: parsed, sourceUrl })
  } catch {
    return NextResponse.json(
      { error: 'AI returned unreadable data — try adding the URL manually' },
      { status: 502 }
    )
  }
}

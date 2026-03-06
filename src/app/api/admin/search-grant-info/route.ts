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

// Extract same-domain links from raw HTML
function extractLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl)
  const seen = new Set<string>()
  const links: string[] = []
  const hrefRegex = /href="([^"#][^"]*)"/g
  let match: RegExpExecArray | null
  while ((match = hrefRegex.exec(html)) !== null) {
    try {
      const href = match[1].trim()
      if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) continue
      const resolved = new URL(href, baseUrl)
      // Same domain only, no query-only or anchor-only links
      if (resolved.hostname === base.hostname && resolved.pathname !== base.pathname) {
        const clean = resolved.origin + resolved.pathname
        if (!seen.has(clean)) {
          seen.add(clean)
          links.push(clean)
        }
      }
    } catch {
      // skip malformed
    }
  }
  return links
}

// Score a same-domain link for relevance to a specific grant
function scoreLink(url: string, title: string): number {
  const lower = url.toLowerCase()
  const titleWords = title.toLowerCase()
    .replace(/[—–\-]/g, ' ')
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3)

  let score = 0

  // Strong signals in the URL path
  const applyKeywords = ['apply', 'application', 'fund', 'grant', 'award',
    'programme', 'program', 'scheme', 'bursary', 'booster', 'support']
  applyKeywords.forEach(kw => { if (lower.includes(kw)) score += 3 })

  // Title words in URL are a great signal
  titleWords.forEach(w => { if (lower.includes(w)) score += 5 })

  // Penalise obvious non-grant pages
  const noise = ['news', 'blog', 'event', 'contact', 'about', 'login',
    'privacy', 'cookie', 'sitemap', 'search', 'tag', 'category']
  noise.forEach(n => { if (lower.includes(n)) score -= 4 })

  return score
}

async function fetchPage(url: string): Promise<{ html: string; text: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GrantTrackerBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const html = await res.text()
    const text = htmlToText(html)
    if (text.length < 200) return null
    return { html, text }
  } catch {
    return null
  }
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

  // ── Strategy A: crawl from the existing URL ────────────────────────────────
  // Fetch the known page, extract real links, follow the most relevant one.
  if (existingUrl) {
    const root = await fetchPage(existingUrl)
    if (root) {
      // Extract and score same-domain links
      const links = extractLinks(root.html, existingUrl)
      const scored = links
        .map(u => ({ url: u, score: scoreLink(u, title ?? '') }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)

      // Try each candidate link
      for (const { url } of scored) {
        const page = await fetchPage(url)
        if (page) {
          pageText = page.text
          sourceUrl = url
          break
        }
      }

      // Nothing better found — fall back to the root page itself
      if (!pageText) {
        pageText = root.text
        sourceUrl = existingUrl
      }
    }
  }

  // ── Strategy B: ask Claude Haiku to suggest URLs (no existing URL) ─────────
  if (!pageText && (title || funder)) {
    const urlPrompt = `You are a UK grant assistant. Return a JSON array of up to 4 real, specific URLs where detailed application information for the following grant can be found. Prioritise the grant's own application/programme page over the funder's homepage. Return ONLY the JSON array, no markdown, no explanation.

Funder: ${funder ?? ''}
Grant: ${title ?? ''}

Example output: ["https://example.org/grants/small-grants/apply"]`

    try {
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{ role: 'user', content: urlPrompt }],
        }),
      })
      const aiData = await aiRes.json()
      const raw = aiData.content?.[0]?.text ?? ''
      const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const urls: string[] = JSON.parse(cleaned)
      for (const url of urls) {
        if (typeof url !== 'string' || !url.startsWith('http')) continue
        const page = await fetchPage(url)
        if (page) {
          pageText = page.text
          sourceUrl = url
          break
        }
      }
    } catch {
      // Claude suggestion failed — fall through
    }
  }

  if (!pageText) {
    return NextResponse.json(
      { error: 'Could not load a grant page automatically. Try updating the URL to the specific grant page and press the button again.' },
      { status: 422 }
    )
  }

  // ── Extract structured grant data from the page ───────────────────────────
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

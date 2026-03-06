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

// Fetch a URL via Jina.ai Reader — handles JS-rendered sites and bot-protected pages
async function fetchViaJina(url: string): Promise<string | null> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`
    const res = await fetch(jinaUrl, {
      headers: {
        'Accept': 'text/plain',
        'X-Return-Format': 'text',
      },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return null
    const text = await res.text()
    return text.length >= 200 ? text.slice(0, 12000) : null
  } catch {
    return null
  }
}

// Extract URLs from Jina markdown output — links appear as [text](url) or plain https://...
function extractLinksFromMarkdown(markdown: string, baseUrl: string): string[] {
  const base = new URL(baseUrl)
  const seen = new Set<string>()
  const links: string[] = []

  // Markdown links: [text](url)
  const mdRegex = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g
  let match: RegExpExecArray | null
  while ((match = mdRegex.exec(markdown)) !== null) {
    try {
      const u = new URL(match[2])
      if (u.hostname === base.hostname) {
        const clean = u.origin + u.pathname
        if (!seen.has(clean)) { seen.add(clean); links.push(clean) }
      }
    } catch { /* skip */ }
  }

  // Plain URLs
  const plainRegex = /https?:\/\/[^\s)\]"'<>]+/g
  while ((match = plainRegex.exec(markdown)) !== null) {
    try {
      const u = new URL(match[0])
      if (u.hostname === base.hostname) {
        const clean = u.origin + u.pathname
        if (!seen.has(clean)) { seen.add(clean); links.push(clean) }
      }
    } catch { /* skip */ }
  }

  return links
}

// Score a link for relevance to the specific grant
function scoreLink(url: string, title: string): number {
  const lower = url.toLowerCase()
  const titleWords = title.toLowerCase()
    .replace(/[—–\-]/g, ' ')
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3)

  let score = 0
  const grantKeywords = ['apply', 'application', 'fund', 'grant', 'award',
    'programme', 'program', 'scheme', 'bursary', 'booster', 'support']
  grantKeywords.forEach(kw => { if (lower.includes(kw)) score += 3 })
  titleWords.forEach(w => { if (lower.includes(w)) score += 5 })
  const noise = ['news', 'blog', 'event', 'contact', 'about', 'login',
    'privacy', 'cookie', 'sitemap', 'search']
  noise.forEach(n => { if (lower.includes(n)) score -= 4 })
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

  // ── Strategy A: crawl from the existing URL via Jina ──────────────────────
  if (existingUrl) {
    const rootText = await fetchViaJina(existingUrl)
    if (rootText) {
      // Extract and score same-domain links from the page
      const links = extractLinksFromMarkdown(rootText, existingUrl)
      const scored = links
        .map(u => ({ url: u, score: scoreLink(u, title ?? '') }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)

      // Try each candidate link via Jina
      for (const { url } of scored) {
        if (url === existingUrl) continue
        const text = await fetchViaJina(url)
        if (text) {
          pageText = text
          sourceUrl = url
          break
        }
      }

      // Nothing better found — use the root page itself
      if (!pageText) {
        pageText = rootText
        sourceUrl = existingUrl
      }
    }
  }

  // ── Strategy B: ask Claude to suggest URLs (no existing URL) ──────────────
  if (!pageText) {
    const urlPrompt = `You are a UK grant assistant. Return a JSON array of up to 4 specific URLs where detailed application info for this grant can be found. Only include URLs you are confident exist. Prioritise the grant's own application page over the funder homepage. Return ONLY the JSON array, no markdown.

Funder: ${funder ?? ''}
Grant: ${title ?? ''}`

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
      const urls: unknown[] = JSON.parse(cleaned)
      for (const url of urls) {
        if (typeof url !== 'string' || !url.startsWith('http')) continue
        const text = await fetchViaJina(url)
        if (text) { pageText = text; sourceUrl = url; break }
      }
    } catch { /* fall through */ }
  }

  if (!pageText) {
    return NextResponse.json(
      { error: 'Could not load the grant page. Please update the URL to point directly to the specific grant page (e.g. the apply or programme page), then press the button again.' },
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

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { url } = await req.json()
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 })
  }

  // ── Fetch the page ────────────────────────────────────────────────────────
  let pageText = ''
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GrantTracker/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    // Strip tags, collapse whitespace — crude but fast
    pageText = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 6000) // keep under token budget
  } catch (err) {
    return NextResponse.json(
      { error: `Could not fetch that URL — ${err instanceof Error ? err.message : 'unknown error'}` },
      { status: 422 }
    )
  }

  // ── Ask Claude to extract grant details ───────────────────────────────────
  const prompt = `You are extracting grant information from a web page.

Page URL: ${url}

Page content (truncated):
${pageText}

Extract the following fields and return ONLY a valid JSON object with these exact keys:
- grant_name: string — the name of the grant or funding programme
- funder_name: string — the name of the organisation offering the funding
- funder_type: one of: trust_foundation, local_authority, housing_association, corporate, lottery, government, other
- amount_min: number or null — minimum grant amount in GBP (digits only)
- amount_max: number or null — maximum grant amount in GBP (digits only)
- deadline: string or null — application deadline in YYYY-MM-DD format, or null if rolling/unknown
- is_rolling: boolean — true if applications are accepted on a rolling basis
- grant_url: string — the apply or main grant URL
- notes: string — a one or two sentence summary of what the grant funds and who can apply

Return ONLY the JSON object, no markdown, no explanation.`

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!aiRes.ok) {
    return NextResponse.json({ error: 'AI extraction failed' }, { status: 502 })
  }

  const aiData = await aiRes.json()
  const raw = aiData?.content?.[0]?.text ?? ''

  // Extract the JSON object
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return NextResponse.json({ error: 'AI did not return valid grant data' }, { status: 502 })
  }

  try {
    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Could not parse AI response' }, { status: 502 })
  }
}

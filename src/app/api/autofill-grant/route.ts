import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enforceInferenceRateLimit } from '@/lib/mcp-rate-limit'
import { brand } from '@/config/brand'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // Auth + per-user rate limit — this route fetches a URL and calls Anthropic
  // (Haiku). Callers are authenticated (pipeline Add-a-fund), so any signed-in
  // user passes; anonymous direct calls are rejected. Same pattern as ai-search.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Please sign in to use auto-fill.' }, { status: 401 })
  }
  const rl = await enforceInferenceRateLimit({ scope: 'autofill', identifier: `user:${user.id}`, perHour: 20, perDay: 60 })
  if (!rl.allowed) {
    if (rl.reason === 'limiter_unavailable') {
      return NextResponse.json({ error: 'Auto-fill is temporarily unavailable — please add the details manually.' }, { status: 503 })
    }
    return NextResponse.json(
      { error: 'Auto-fill limit reached for now — please try again shortly or add the details manually.', retry_after: rl.retry_after },
      { status: 429, headers: rl.retry_after ? { 'Retry-After': String(rl.retry_after) } : undefined },
    )
  }

  const { url } = await req.json()
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 })
  }

  // ── Fetch the page ────────────────────────────────────────────────────────
  let pageText = ''
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': `Mozilla/5.0 (compatible; ${brand.userAgent})`,
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
- funder_type: one of: trust_foundation, community_foundation, corporate_foundation, capacity_builder, local_authority, housing_association, corporate, lottery, government, competition, loan, crowdfund_match, other. Use "capacity_builder" for infrastructure charities delivering in-kind support (Pilotlight, Superhighways, Reach Volunteering etc.) — usually paired with funding_type=in_kind.
- funding_type: one of: grant, programme, investment, in_kind, blended_finance. "grant"=cash award with no return; "programme"=accelerator/fellowship/cohort support; "investment"=loans/equity/social investment; "in_kind"=non-cash (pro bono services, software donations, volunteer matching, free workspace); "blended_finance"=mix of grant + investment. Do NOT default to "grant" — be decisive.
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

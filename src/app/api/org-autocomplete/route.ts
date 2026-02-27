import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Ensure protocol
    const fullUrl = url.startsWith('http') ? url : `https://${url}`

    // Fetch the website page
    let pageText = ''
    try {
      const pageRes = await fetch(fullUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; GrantTracker/1.0; +https://granttracker.app)',
          Accept: 'text/html',
        },
        signal: AbortSignal.timeout(12000),
      })
      if (!pageRes.ok) {
        return NextResponse.json(
          { error: `Website returned an error (${pageRes.status}) — check the URL and try again` },
          { status: 422 }
        )
      }
      const html = await pageRes.text()
      pageText = stripHtml(html).slice(0, 5000)
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : ''
      return NextResponse.json(
        { error: `Could not reach the website — ${msg || 'please check the URL and try again'}` },
        { status: 422 }
      )
    }

    const prompt = `You are helping a UK grant management tool auto-fill an organisation profile form using website content.

Website content (truncated):
"""
${pageText}
"""

Extract information and return ONLY a valid JSON object with these exact keys:

{
  "name": "Full organisation name as it appears on the site",
  "orgType": "one of: registered_charity | cic | social_enterprise | community_group | other",
  "charityNumber": "charity registration number or CIC Companies House number if found, else null",
  "primaryLocation": "main town, city or borough they operate in (e.g. Southall, London Borough of Ealing)",
  "mission": "1–2 sentence mission statement in the organisation's own words where possible",
  "themes": ["high-level topic strings, e.g. mental health, domestic abuse, employment, community development"],
  "areasOfWork": ["specific programme/activity strings, e.g. English language classes, counselling, food bank, CV writing workshops"],
  "beneficiaries": ["specific beneficiary group strings, e.g. BAME women, young people aged 16–25, care leavers, refugees"],
  "annualIncome": "best estimate — one of: Under £10,000 | £10,000–£50,000 | £50,000–£100,000 | £100,000–£500,000 | Over £500,000"
}

Rules:
- themes = broad thematic areas (4–8 items)
- areasOfWork = concrete activities and programmes they run (4–8 items)
- beneficiaries = specific people they help (3–6 items)
- If you cannot determine something with reasonable confidence, use null for strings or [] for arrays
- annualIncome: infer from staff size, scope of services, number of sites, or any financial figures mentioned
- Return ONLY the JSON object — no markdown fences, no commentary`

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 900,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const aiData = await aiRes.json()

    if (!aiRes.ok) {
      const msg = aiData?.error?.message ?? 'AI extraction failed'
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const text = aiData.content?.[0]?.text ?? ''
    const result = JSON.parse(text.replace(/```json|```/g, '').trim())
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Auto-fill failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

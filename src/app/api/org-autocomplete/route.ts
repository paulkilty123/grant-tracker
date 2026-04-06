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

    // Fetch the website page — fall back gracefully if blocked (403 etc.)
    let pageText = ''
    try {
      const pageRes = await fetch(fullUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-GB,en;q=0.9',
        },
        signal: AbortSignal.timeout(12000),
      })
      if (pageRes.ok) {
        const html = await pageRes.text()
        pageText = stripHtml(html).slice(0, 5000)
      }
      // If not ok (403, 429, etc.) — fall through with empty pageText;
      // Claude will still infer org info from the URL/domain.
    } catch {
      // Network error — fall through with empty pageText
    }

    const prompt = `You are helping a UK grant management tool auto-fill an organisation profile form.

${pageText
  ? `Website content from ${fullUrl} (truncated):\n"""\n${pageText}\n"""`
  : `The website at ${fullUrl} could not be fetched (it may block automated access). Use your knowledge of this organisation based on the URL/domain to fill in what you can.`
}

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
  "annualIncome": "best estimate — MUST be exactly one of: Under £10,000 | £10,000–£50,000 | £50,000–£100,000 | £100,000–£250,000 | £250,000–£500,000 | £500,000–£1 million | £1 million–£5 million | Over £5 million",
  "impactSectors": ["1 to 5 values from the IMPACT SECTOR list below, in priority order — most important first"],
  "beneficiaryGroups": ["1 to 5 values from the BENEFICIARY GROUP list below — primary beneficiary first, then secondaries"]
}

IMPACT SECTOR VALUES (pick 1–5 in priority order):
young_people, community, health, mental_health, housing, education, employment,
disability, older_people, environment, creative, heritage, sport, women, justice,
tech, financial, food, international

BENEFICIARY GROUP VALUES (pick 1–5, primary first):
children, young_people, older_people, families, women_girls, men_boys, lgbtq,
ethnic_minorities, refugees_migrants, disabled_people, mental_health, carers,
veterans, ex_offenders, homeless, people_in_poverty, rural_communities, general_public

Rules:
- themes = broad thematic areas (4–8 items)
- areasOfWork = concrete activities and programmes they run (4–8 items)
- beneficiaries = specific people they help (3–6 items)
- impactSectors = use ONLY the exact values listed above, in priority order (most core first)
- beneficiaryGroups = use ONLY the exact values listed above; put primary beneficiary first; use "general_public" only if genuinely no specific group
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
        max_tokens: 1200,
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

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enforceInferenceRateLimit } from '@/lib/mcp-rate-limit'

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
    // Auth + per-user rate limit — fetches a URL and calls Anthropic (Haiku).
    // Both callers (onboarding wizard, profile page) run POST-login (onboarding
    // is not a middleware-public path), so a per-user gate is safe and does not
    // break signup. Anonymous direct calls are rejected.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Please sign in to use auto-fill.' }, { status: 401 })
    }
    const rl = await enforceInferenceRateLimit({ scope: 'orgprofile', identifier: `user:${user.id}`, perHour: 20, perDay: 60 })
    if (!rl.allowed) {
      if (rl.reason === 'limiter_unavailable') {
        return NextResponse.json({ error: 'Auto-fill is temporarily unavailable — please fill in your details manually.' }, { status: 503 })
      }
      return NextResponse.json(
        { error: 'Auto-fill limit reached for now — please try again shortly or fill in your details manually.', retry_after: rl.retry_after },
        { status: 429, headers: rl.retry_after ? { 'Retry-After': String(rl.retry_after) } : undefined },
      )
    }

    const { url } = await req.json()

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    const fullUrl = url.startsWith('http') ? url : `https://${url}`

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
  "beneficiaryGroups": ["1 to 5 values from the BENEFICIARY GROUP list below — primary beneficiary first, then secondaries"],
  "_confidence": {
    "name": 0.0,
    "orgType": 0.0,
    "charityNumber": 0.0,
    "primaryLocation": 0.0,
    "mission": 0.0,
    "annualIncome": 0.0,
    "impactSectors": 0.0,
    "beneficiaryGroups": 0.0
  }
}

IMPACT SECTOR VALUES (pick 1–5 in priority order):
young_people, community, health, mental_health, housing, education, employment,
disability, older_people, environment, creative, heritage, sport, women, justice,
tech, financial, food, international

BENEFICIARY GROUP VALUES (pick 1–5, primary first):
children, young_people, older_people, families, women_girls, men_boys, lgbtq,
ethnic_minorities, refugees_migrants, disabled_people, mental_health, carers,
veterans, ex_offenders, homeless, people_in_poverty, rural_communities, general_public, social_impact_orgs

Rules for _confidence (score each field 0.0–1.0):
- 0.9–1.0: explicitly stated on the page, high certainty (e.g. org name in <title>, charity number found verbatim)
- 0.7–0.89: strongly implied, low risk of error (e.g. charity number inferred from Charity Commission link, clear mission statement present)
- 0.4–0.69: inferred with some uncertainty (e.g. income estimated from staff size, sector inferred from activity list)
- 0.1–0.39: weak inference, could easily be wrong (e.g. location guessed from domain TLD, structure guessed from name alone)
- 0.0: not determinable from available content (use null for the field value too)
- orgType is ELIGIBILITY-CRITICAL — be strict and do NOT overstate certainty. Score orgType >= 0.8 ONLY when the page names a SINGLE explicit legal form (e.g. "registered charity no. 1234567", "a community interest company"/"CIC", "registered society", "charitable incorporated organisation"). If the organisation describes itself as MORE THAN ONE structure (e.g. "we are both a charity and a social enterprise"), or the legal form is only inferred from tone/mission/name rather than stated, score orgType 0.5 or LOWER. A confidently-wrong structure silently mis-ranks the applicant's funding matches, so when a single legal form is not explicit on the page, score LOW and let the user confirm it.

Rules for field values:
- themes = broad thematic areas (4–8 items)
- areasOfWork = concrete activities and programmes they run (4–8 items)
- beneficiaries = specific people they help (3–6 items)
- impactSectors = use ONLY the exact values listed above, in priority order (most core first)
- beneficiaryGroups = use ONLY the exact values listed above; put primary beneficiary first; use "general_public" only if genuinely no specific group; use "social_impact_orgs" when the organisation PRIMARILY supports OTHER charities, social enterprises or social entrepreneurs (a capacity-building / infrastructure / mentoring body — e.g. it mentors founders or supports other organisations) rather than serving end-beneficiaries directly — for such orgs make it the PRIMARY value rather than guessing a frontline group
- If you cannot determine something, use null for strings, [] for arrays, and 0.0 for confidence
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
        max_tokens: 1400,
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

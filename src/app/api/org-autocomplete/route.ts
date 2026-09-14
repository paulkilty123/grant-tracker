import { NextRequest, NextResponse } from 'next/server'
import { isRecognisedNumber, scanRegistrationNumber } from '@/lib/registered-number'
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

const ABOUT_PATH = /(about|who-we-are|what-we-do|our-work|our-story|mission|services|what_we_do|our-impact)/i

/** Up to three same-host pages whose path looks like an About page, read in parallel. Failures are dropped. */
async function fetchAboutPages(homeHtml: string, baseUrl: string, headers: Record<string, string>): Promise<string[]> {
  let base: URL
  try { base = new URL(baseUrl) } catch { return [] }
  const seen = new Set<string>()
  const targets: string[] = []
  for (const m of homeHtml.matchAll(/href=["']([^"'#?]+)[^"']*["']/gi)) {
    let u: URL
    try { u = new URL(m[1], base) } catch { continue }
    if (u.host !== base.host) continue
    if (!ABOUT_PATH.test(u.pathname)) continue
    if (/\.(pdf|jpg|jpeg|png|gif|svg|css|js)$/i.test(u.pathname)) continue
    const key = u.pathname.replace(/\/$/, '').toLowerCase()
    if (!key || key === base.pathname.replace(/\/$/, '').toLowerCase() || seen.has(key)) continue
    seen.add(key)
    targets.push(u.toString())
    if (targets.length >= 3) break
  }
  const results = await Promise.allSettled(targets.map(async t => {
    const r = await fetch(t, { headers, signal: AbortSignal.timeout(8000) })
    if (!r.ok) return ''
    return stripHtml(await r.text())
  }))
  return results.map(r => (r.status === 'fulfilled' ? r.value : '')).filter(t => t.length > 200)
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
    let scannedNumber: string | null = null
    const HEADERS = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-GB,en;q=0.9',
    }
    try {
      const pageRes = await fetch(fullUrl, { headers: HEADERS, signal: AbortSignal.timeout(12000) })
      if (pageRes.ok) {
        const html = await pageRes.text()
        const full = stripHtml(html)
        // Scan the WHOLE page for a registration number before truncating.
        // Charity and company numbers live in the footer, which is exactly what
        // the 5000-character window cuts off: Centrepoint publishes 292411 on
        // its homepage at roughly character 5,300, so the model was being asked
        // for something it could not see. A regex over the full text costs no
        // tokens and is more reliable than the model for a string this regular.
        scannedNumber = scanRegistrationNumber(full)
        pageText = full.slice(0, 5000)

        // The homepage is a strapline; the About page is the description.
        // Paul, 14 Sept 2026: reading only the homepage gave "Fighting hunger
        // and tackling food waste" for FareShare South West, and every signup
        // was typing the who, what and where that sat one click away. Follow
        // up to three internal links that look like an about or what-we-do
        // page and add their text, capped so the whole read stays small.
        const followed = await fetchAboutPages(html, fullUrl, HEADERS)
        for (const t of followed) {
          if (pageText.length >= 12000) break
          pageText += `\n\n---\n${t.slice(0, 3500)}`
          if (!scannedNumber) scannedNumber = scanRegistrationNumber(t)
        }
        pageText = pageText.slice(0, 12000)
      }
    } catch {
      // Network error — fall through with empty pageText
    }

    // NO PAGE, NO GUESS. Until 13 Sept 2026 an unreadable site fell through to
    // a prompt that said "use your knowledge of this organisation based on the
    // URL/domain", and the model obliged: Our Sansar, a Brighton charity working
    // with street children in Nepal, was signed up twice that day with two
    // different invented missions ("South Asian women and girls in the UK",
    // "South Asian communities in the UK") because its site returns an empty
    // page to automated readers. The mission is what the matcher and the
    // profile check read first, so a fluent guess there is worse than a blank.
    // A site that blocks readers, times out, or answers with nothing usable
    // now returns only what was actually found, and says so.
    if (pageText.replace(/\s+/g, ' ').trim().length < 200) {
      return NextResponse.json({
        unreadable: true,
        name: null, orgType: null,
        charityNumber: scannedNumber && isRecognisedNumber(scannedNumber) ? scannedNumber : null,
        primaryLocation: null, mission: null, themes: [], areasOfWork: [], beneficiaries: [],
        annualIncome: null, impactSectors: [], beneficiaryGroups: [],
        _confidence: {},
        message: 'We could not read that website, so nothing has been filled in for you. Please write two lines on what you do and who you help.',
      })
    }

    const prompt = `You are helping a UK grant management tool auto-fill an organisation profile form.

Website content from ${fullUrl} (truncated):
"""
${pageText}
"""
Use ONLY this content. Do not fill any field from the domain name or from anything you believe you know about the organisation; if the content does not say it, the value is null and the confidence 0.0.

Extract information and return ONLY a valid JSON object with these exact keys:

{
  "name": "Full organisation name as it appears on the site",
  "orgType": "one of: registered_charity | cic | social_enterprise | community_group | other",
  "charityNumber": "charity registration number or CIC Companies House number if found, else null",
  "primaryLocation": "main town, city or borough they operate in (e.g. Southall, London Borough of Ealing)",
  "mission": "2 to 3 plain sentences describing the organisation, drawn from the pages: who benefits and the problem they face, what the organisation does and what changes as a result, and where it works. Use the organisation's own facts and phrases; leave out any of the three the pages do not state rather than guessing. Not a slogan or a vision statement.",
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
community, health, mental_health, housing, education, employment,
disability, older_people, environment, creative, heritage, sport, women, justice,
tech, financial, food, international, social_economy, social_innovation

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
- beneficiaryGroups — when social_impact_orgs is the primary value, score beneficiaryGroups confidence 0.7 or LOWER (sector-support beneficiaries are easily over-tagged with frontline groups), so the field is flagged for the user to confirm rather than auto-confirming green.

Rules for field values:
- themes = broad thematic areas (4–8 items)
- areasOfWork = concrete activities and programmes they run (4–8 items)
- beneficiaries = specific people they help (3–6 items)
- impactSectors = use ONLY the exact values listed above, in priority order (most core first); when the organisation is a sector-support / capacity-building body (the same signal as beneficiary "social_impact_orgs" — it supports other charities, social enterprises or founders), prefer "social_innovation" (systems change) and/or "social_economy" (co-ops & community ownership) as the PRIMARY sectors, NOT the frontline themes (employment, education, community) of the organisations they help
- beneficiaryGroups = use ONLY the exact values listed above; put primary beneficiary first; use "general_public" only if genuinely no specific group; use "social_impact_orgs" when the organisation PRIMARILY supports OTHER charities, social enterprises or social entrepreneurs (a capacity-building / infrastructure / mentoring body — e.g. it mentors founders or supports other organisations) rather than serving end-beneficiaries directly — for such orgs make it the PRIMARY value, and do NOT also add frontline end-beneficiary groups (young_people, women_girls, etc.) UNLESS the org clearly ALSO delivers services directly to those groups — supporting founders/organisations whose causes touch a group does NOT mean the applicant serves that group, so social_impact_orgs is usually the ONLY beneficiary (optionally plus general_public)
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

    // A number found by the regex beats one the model produced. It was read off
    // the full page including the footer, which the prompt window never sees,
    // and it came from an explicit label rather than inference — so it cannot
    // be a plausible-looking hallucination. Confidence 0.95 rather than 1.0:
    // the string is certain, whether it belongs to THIS organisation rather
    // than a partner named in the footer is not.
    if (scannedNumber && isRecognisedNumber(scannedNumber)) {
      result.charityNumber = scannedNumber
      result._confidence = { ...(result._confidence ?? {}), charityNumber: 0.95 }
    }

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Auto-fill failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Admin-only endpoint: discovers new funding opportunities using Gemini 2.5 Flash
// with Google Search grounding, inserts results into discovery_queue for review.
//
// POST /api/admin/discover-grants
// Body: { query: string, fundingType: 'corporate'|'social_investment'|'programme' }
// Runs ONE query per call — the UI orchestrates multiple calls to avoid Vercel timeouts.
// Auth: ADMIN_SECRET bearer token or authenticated admin session

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { DEFAULT_QUERIES, DiscoveryFundingType as FundingType } from '@/lib/discovery-queries'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // One query per call, well within limits

const ADMIN_EMAIL = 'paulkilty1@gmail.com'
const GEMINI_API_KEY = process.env.GEMINI_API_KEY

async function isAuthorised(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.replace('Bearer ', '').trim()
  if (token && token === process.env.ADMIN_SECRET) return true
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.email === ADMIN_EMAIL
  } catch { return false }
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface DiscoveredOpportunity {
  funder_name: string
  title: string
  url: string
  description: string
  deadline: string | null
  amount_range: string | null
  eligibility_snippet: string | null
  funding_type: string
}

const SYSTEM_PROMPT = `You are a UK funding research specialist focused on discovering funding for charities, CICs, and social enterprises. Search the live web to find CURRENT and OPEN funding opportunities.

Focus on:
- Corporate foundations and CSR programmes (companies funding charities/social enterprises)
- Social investment (loans, equity, blended finance for social enterprises)
- Programmes, accelerators, incubators, fellowships for social sector organisations

Return ONLY results that:
- Are UK-based or available to UK organisations
- Are currently open OR regularly recurring
- Have a working URL (application page or information page)
- Are NOT already extremely well-known generic grants (no Lottery, no UKSPF general)

Return valid JSON only — no markdown fencing, no extra commentary.`

function buildUserPrompt(query: string, fundingType: FundingType): string {
  const typeContext = {
    corporate: 'corporate foundations, CSR programmes, company community funds',
    social_investment: 'social investment, patient capital, blended finance, CDFI loans, impact investment',
    programme: 'accelerators, incubators, fellowships, capacity building programmes, cohort programmes',
  }[fundingType]

  return `Search for: "${query}"

Focus specifically on ${typeContext} available to UK charities, CICs, and social enterprises.

Find 8–12 distinct funding opportunities. For each one return:
{
  "funder_name": "Name of the organisation offering this funding",
  "title": "Name of the specific programme or fund",
  "url": "Direct URL to the application or information page",
  "description": "2–3 sentences: what it funds, amounts if known, who can apply",
  "deadline": "Application deadline or 'Rolling' or null if unknown",
  "amount_range": "e.g. £5,000–£50,000 or null if unknown",
  "eligibility_snippet": "Key eligibility requirements in 1–2 sentences",
  "funding_type": "corporate_grant|corporate_programme|social_investment|accelerator|incubator|fellowship|capacity_building|loan|equity|blended_finance"
}

Return as JSON: { "results": [ ... ] }`
}

function parseResults(text: string): DiscoveredOpportunity[] {
  try {
    let raw = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    if (!raw.startsWith('{')) {
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) raw = match[0]
      else return []
    }
    const parsed = JSON.parse(raw) as { results?: DiscoveredOpportunity[] }
    return parsed.results ?? []
  } catch (e) {
    console.error('[discover-grants] JSON parse failed:', e, '\nRaw text (first 500):', text.slice(0, 500))
    return []
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!await isAuthorised(req)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })
    }

    const body = await req.json() as { query?: string; fundingType?: FundingType }
    const fundingType: FundingType = body.fundingType ?? 'corporate'

    // Pick first unused default query if none supplied
    const query = body.query ?? DEFAULT_QUERIES[fundingType][0]

    console.log(`[discover-grants] Running: "${query}" (${fundingType})`)

    // Call Gemini
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildUserPrompt(query, fundingType) }] }],
          tools: [{ google_search: {} }],
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          generationConfig: { temperature: 0.2 },
        }),
        signal: AbortSignal.timeout(45_000),
      }
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error(`[discover-grants] Gemini HTTP ${geminiRes.status}:`, errText.slice(0, 300))
      return NextResponse.json({
        error: `Gemini API error ${geminiRes.status}`,
        detail: errText.slice(0, 200),
      }, { status: 502 })
    }

    const geminiData = await geminiRes.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }

    const text = geminiData.candidates?.[0]?.content?.parts
      ?.filter(p => p.text).map(p => p.text).join('') ?? ''

    if (!text) {
      return NextResponse.json({ error: 'Gemini returned no text', ok: false, queued: 0, skipped: [] })
    }

    const results = parseResults(text)

    if (results.length === 0) {
      return NextResponse.json({ ok: true, queued: 0, found: 0, skipped: [], query, fundingType })
    }

    // Deduplicate against scraped_grants and discovery_queue
    const db = getAdminClient()
    const { data: existingGrants } = await db.from('scraped_grants').select('apply_url, title').limit(3000)
    const { data: queuedItems }    = await db.from('discovery_queue').select('url, title').limit(2000)

    const existingUrls   = new Set([
      ...(existingGrants ?? []).map(g => (g.apply_url ?? '').toLowerCase().trim()),
      ...(queuedItems    ?? []).map(q => (q.url ?? '').toLowerCase().trim()),
    ])
    const existingTitles = new Set([
      ...(existingGrants ?? []).map(g => (g.title ?? '').toLowerCase().trim()),
      ...(queuedItems    ?? []).map(q => (q.title ?? '').toLowerCase().trim()),
    ])

    const skipped: string[] = []
    let queued = 0

    for (const item of results) {
      const titleLower = (item.title ?? '').toLowerCase().trim()
      const urlLower   = (item.url   ?? '').toLowerCase().trim()

      if (!item.url)                       { skipped.push(`${item.title} (no URL)`);           continue }
      if (existingUrls.has(urlLower))      { skipped.push(`${item.title} (duplicate URL)`);    continue }
      if (existingTitles.has(titleLower))  { skipped.push(`${item.title} (duplicate title)`);  continue }

      const { error } = await db.from('discovery_queue').insert({
        query,
        funder_name:         (item.funder_name ?? '').trim() || 'Unknown',
        title:               (item.title ?? '').trim(),
        url:                 item.url.trim(),
        description:         item.description?.trim() ?? null,
        deadline:            item.deadline?.trim() ?? null,
        amount_range:        item.amount_range?.trim() ?? null,
        eligibility_snippet: item.eligibility_snippet?.trim() ?? null,
        funding_type:        item.funding_type ?? fundingType,
        source:              'gemini',
        status:              'pending',
      })

      if (error) {
        skipped.push(`${item.title} (DB error: ${error.message})`)
      } else {
        queued++
        existingUrls.add(urlLower)
        existingTitles.add(titleLower)
      }
    }

    console.log(`[discover-grants] "${query}": found ${results.length}, queued ${queued}`)
    return NextResponse.json({ ok: true, queued, found: results.length, skipped, query, fundingType })

  } catch (err) {
    // Always return JSON — never let a crash return an HTML error page
    const message = err instanceof Error ? err.message : String(err)
    console.error('[discover-grants] Unhandled error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

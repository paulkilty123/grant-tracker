// Admin-only endpoint: discovers new funding opportunities using Gemini 2.0 Flash
// with Google Search grounding, inserts results into discovery_queue for review.
//
// POST /api/admin/discover-grants
// Body: { queries?: string[], fundingTypes?: ('corporate'|'social_investment'|'programme')[] }
// Auth: ADMIN_SECRET bearer token or authenticated admin session

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes for multiple search queries

const ADMIN_EMAIL = 'paulkilty1@gmail.com'
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!

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

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

type FundingType = 'corporate' | 'social_investment' | 'programme'

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

// Default queries per funding category
const DEFAULT_QUERIES: Record<FundingType, string[]> = {
  corporate: [
    'UK corporate foundation grants for charities CICs 2025 2026',
    'UK CSR programme funding social enterprises community organisations apply',
    'corporate social investment UK charities open applications',
    'FTSE100 company community grants UK charities apply now',
    'UK business foundation grants arts culture social enterprise',
  ],
  social_investment: [
    'UK social investment patient capital charities CICs apply 2025 2026',
    'blended finance social enterprise UK loan equity hybrid funding',
    'UK social impact bond outcomes fund apply charity',
    'community development finance institution CDFI loan UK social enterprise',
    'impact investing UK charity CIC convertible loan grant blend open',
  ],
  programme: [
    'UK accelerator incubator social enterprise charity cohort 2025 2026 apply',
    'fellowship programme UK social entrepreneurs charity leaders open applications',
    'capacity building programme UK charities CICs funding support 2025',
    'UK social enterprise support programme mentoring funding apply',
    'charity incubator accelerator UK open applications cohort',
  ],
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
  "funding_type": "corporate_grant|corporate_programme|social_investment|accelerator|incubator|fellowship|capacity_building|loan|equity|blended_finance",
  "also_in_programmes": true or false
}

Return as JSON: { "results": [ ... ] }`
}

async function runDiscoverySearch(query: string, fundingType: FundingType): Promise<DiscoveredOpportunity[]> {
  const res = await fetch(
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
      signal: AbortSignal.timeout(60_000),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    console.error(`[discover-grants] Gemini error for "${query}": ${res.status}`, err)
    return []
  }

  const data = await res.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> }
    }>
  }

  const text = data.candidates?.[0]?.content?.parts
    ?.filter(p => p.text)
    .map(p => p.text)
    .join('') ?? ''

  if (!text) {
    console.error(`[discover-grants] No text in Gemini response for "${query}"`)
    return []
  }

  return parseResults(text)
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
    console.error('[discover-grants] JSON parse failed:', e)
    return []
  }
}

export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = await req.json() as {
    queries?: string[]
    fundingTypes?: FundingType[]
  }

  const fundingTypes: FundingType[] = body.fundingTypes ?? ['corporate', 'social_investment', 'programme']
  const db = getAdminClient()

  // Collect existing URLs from scraped_grants to avoid duplicates
  const { data: existingGrants } = await db
    .from('scraped_grants')
    .select('apply_url, title')
    .limit(3000)
  const existingUrls = new Set((existingGrants ?? []).map(g => (g.apply_url ?? '').toLowerCase().trim()))
  const existingTitles = new Set((existingGrants ?? []).map(g => (g.title ?? '').toLowerCase().trim()))

  // Also fetch already-queued URLs to avoid re-queuing
  const { data: queuedItems } = await db
    .from('discovery_queue')
    .select('url, title')
    .limit(2000)
  for (const item of queuedItems ?? []) {
    if (item.url) existingUrls.add(item.url.toLowerCase().trim())
    if (item.title) existingTitles.add(item.title.toLowerCase().trim())
  }

  const summary: {
    fundingType: string
    query: string
    found: number
    queued: number
    skipped: string[]
  }[] = []

  let totalQueued = 0
  let queryIndex = 0

  for (const fundingType of fundingTypes) {
    const queries = body.queries ?? DEFAULT_QUERIES[fundingType]

    for (const query of queries) {
      // Rate-limit spacing between queries
      if (queryIndex > 0) {
        console.log(`[discover-grants] Waiting 65s before next query...`)
        await sleep(65_000)
      }
      queryIndex++

      console.log(`[discover-grants] Running: "${query}" (${fundingType})`)
      const results = await runDiscoverySearch(query, fundingType)
      const skipped: string[] = []
      let queued = 0

      for (const item of results) {
        const titleLower = (item.title ?? '').toLowerCase().trim()
        const urlLower = (item.url ?? '').toLowerCase().trim()

        // Skip if no URL
        if (!item.url) {
          skipped.push(`${item.title} (no URL)`)
          continue
        }

        // Skip duplicates by URL or title
        if (existingUrls.has(urlLower)) {
          skipped.push(`${item.title} (duplicate URL)`)
          continue
        }
        if (existingTitles.has(titleLower)) {
          skipped.push(`${item.title} (duplicate title)`)
          continue
        }

        const row = {
          query,
          funder_name: (item.funder_name ?? '').trim() || 'Unknown',
          title: (item.title ?? '').trim(),
          url: item.url.trim(),
          description: item.description?.trim() ?? null,
          deadline: item.deadline?.trim() ?? null,
          amount_range: item.amount_range?.trim() ?? null,
          eligibility_snippet: item.eligibility_snippet?.trim() ?? null,
          funding_type: item.funding_type ?? fundingType,
          source: 'gemini',
          status: 'pending',
        }

        const { error } = await db
          .from('discovery_queue')
          .insert(row)

        if (error) {
          skipped.push(`${item.title} (DB error: ${error.message})`)
        } else {
          queued++
          totalQueued++
          existingUrls.add(urlLower)
          existingTitles.add(titleLower)
        }
      }

      summary.push({ fundingType, query, found: results.length, queued, skipped })
      console.log(`[discover-grants] "${query}": found ${results.length}, queued ${queued}`)
    }
  }

  return NextResponse.json({ ok: true, totalQueued, summary })
}

// Admin-only endpoint: discovers new funding opportunities using Claude Sonnet.
// Inserts results into discovery_queue for review.
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
export const maxDuration = 60

const ADMIN_EMAIL = 'paulkilty1@gmail.com'
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

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

const SYSTEM_PROMPT = `You are a UK funding research specialist with deep knowledge of the grant landscape for charities, CICs, and social enterprises. Your role is to surface SPECIFIC, REAL funding opportunities that organisations can actually apply to.

Rules:
- Only include real, named programmes from real organisations
- Include the direct URL to the application page or programme information page
- Focus on programmes that are currently open or run annual/recurring rounds
- Prioritise lesser-known opportunities that smaller organisations might miss
- Do NOT include: National Lottery Community Fund main programmes, UKSPF, generic government schemes, or anything requiring a political/statutory body
- Do NOT make up URLs — if you are not confident in the URL, omit the entry
- Return valid JSON only — no markdown fencing, no extra text`

function buildUserPrompt(query: string, fundingType: FundingType): string {
  const typeContext = {
    corporate: 'UK corporate foundations, company community funds, CSR grant programmes. Think: FTSE companies, major retailers, banks, law firms, tech companies with UK foundations or community programmes.',
    social_investment: 'UK social investment — patient capital, blended finance, CDFI loans, impact investment funds, social enterprise lending. Think: CDFIs, impact funds, ethical banks, social investment wholesalers.',
    programme: 'UK accelerators, incubators, fellowships, capacity building programmes, cohort support schemes for social enterprises and charities. Think: sector support bodies, foundation-backed programmes, government-backed enterprise schemes.',
  }[fundingType]

  return `Find 10–14 specific UK funding opportunities matching this search: "${query}"

Focus on: ${typeContext}

For each opportunity, return:
{
  "funder_name": "The organisation offering this funding",
  "title": "The specific programme or fund name",
  "url": "Direct URL to the application page or programme page — must be a real URL you are confident exists",
  "description": "2–3 sentences covering: what they fund, typical grant size if known, who is eligible",
  "deadline": "Next deadline, 'Rolling' if always open, or null if unknown",
  "amount_range": "e.g. '£5,000–£50,000' or null if unknown",
  "eligibility_snippet": "Key eligibility criteria in one sentence",
  "funding_type": "One of: corporate_grant|corporate_programme|social_investment|accelerator|incubator|fellowship|capacity_building|loan|equity|blended_finance"
}

Return as: { "results": [ ... ] }`
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
    console.error('[discover-grants] JSON parse failed:', e, '\nRaw (first 500):', text.slice(0, 500))
    return []
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!await isAuthorised(req)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
    }

    const body = await req.json() as { query?: string; fundingType?: FundingType }
    const fundingType: FundingType = body.fundingType ?? 'corporate'
    const query = body.query ?? DEFAULT_QUERIES[fundingType][0]

    console.log(`[discover-grants] Running: "${query}" (${fundingType})`)

    // Call Claude Sonnet
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(query, fundingType) }],
      }),
      signal: AbortSignal.timeout(45_000),
    })

    if (!claudeRes.ok) {
      const errText = await claudeRes.text()
      console.error(`[discover-grants] Claude HTTP ${claudeRes.status}:`, errText.slice(0, 300))
      return NextResponse.json({
        error: `Claude API error ${claudeRes.status}`,
        detail: errText.slice(0, 200),
      }, { status: 502 })
    }

    const claudeData = await claudeRes.json() as {
      content?: Array<{ type: string; text?: string }>
    }

    const text = claudeData.content
      ?.filter(b => b.type === 'text')
      .map(b => b.text ?? '')
      .join('') ?? ''

    if (!text) {
      return NextResponse.json({ error: 'Claude returned no text', ok: false, queued: 0, skipped: [] })
    }

    const results = parseResults(text)

    if (results.length === 0) {
      return NextResponse.json({ ok: true, queued: 0, found: 0, skipped: [], query, fundingType })
    }

    // Deduplicate against scraped_grants and discovery_queue
    const db = getAdminClient()
    const { data: existingGrants } = await db.from('scraped_grants').select('apply_url, title').limit(3000)
    const { data: queuedItems }    = await db.from('discovery_queue').select('url, title').limit(2000)

    const existingUrls = new Set([
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

      if (!item.url)                      { skipped.push(`${item.title} (no URL)`);          continue }
      if (existingUrls.has(urlLower))     { skipped.push(`${item.title} (duplicate URL)`);   continue }
      if (existingTitles.has(titleLower)) { skipped.push(`${item.title} (duplicate title)`); continue }

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
        source:              'claude',
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
    const message = err instanceof Error ? err.message : String(err)
    console.error('[discover-grants] Unhandled error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

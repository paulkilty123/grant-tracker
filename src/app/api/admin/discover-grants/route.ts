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
// Was 60. A live web search plus adaptive thinking is far slower than a single
// recall-from-memory completion, and a timeout here reads as "found nothing".
export const maxDuration = 270

// ── Model + search configuration ─────────────────────────────────────────────
//
// Sonnet 5, not Sonnet 4.6: better on this kind of extraction, and cheaper until
// 2026-08-31 ($2/$10 per MTok introductory against 4.6's $3/$15).
//
// THINKING IS EXPLICIT ON PURPOSE. Omitting `thinking` on Sonnet 5 runs ADAPTIVE
// thinking, where Sonnet 4.6 ran thinking-off — and thinking shares max_tokens
// with the output. A bare model swap against the old max_tokens of 4096 would
// have produced a response that was mostly thinking followed by a truncated JSON
// array; parseResults would have returned fewer or zero rows and reported
// success. Adaptive is kept ON (not disabled) because with thinking off Sonnet 5
// is measurably less likely to reach for tools at all — which on a route whose
// entire point is to search would be self-defeating. max_tokens is raised to
// cover thinking + search results + the JSON payload.
const MODEL      = 'claude-sonnet-5'
const MAX_TOKENS = 16000
// 'high' drove 29 tool calls and a 200-240s round trip — right at the abort
// limit, so runs started failing intermittently. On Sonnet 5, 'medium' is
// roughly Sonnet 4.6 at 'high', i.e. parity with what this route used before,
// at a fraction of the wall time. Raise it only if result quality drops.
const EFFORT     = 'medium'


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

type ContentBlock = {
  type: string
  text?: string
  content?: unknown   // web_search_tool_result: ARRAY on success, OBJECT on error
}
type ClaudeResponse = {
  content?: ContentBlock[]
  stop_reason?: string
  usage?: {
    input_tokens?: number; output_tokens?: number
    cache_read_input_tokens?: number; cache_creation_input_tokens?: number
    server_tool_use?: { web_search_requests?: number }
  }
}
type SearchOutcome =
  | { error: string; detail?: string }
  | { text: string; truncated: boolean; searchErrors: string[]; rounds: number; searches: number; resultCount: number
      usage: { input: number; output: number; cacheRead: number; cacheWrite: number }; billedSearches: number }

/**
 * Run one discovery query with live web search.
 *
 * Replaces a bare completion that had no tools at all — it recalled funders from
 * training data and presented them as findings, which is why everything it
 * produced needed a human review queue. Searching means the model reads current
 * search results instead of remembering.
 */
async function searchForOpportunities(query: string, fundingType: FundingType, allowedDomains?: string[]): Promise<SearchOutcome> {
  const targeted = !!allowedDomains?.length
  const messages: Array<{ role: string; content: unknown }> = [
    { role: 'user', content: targeted ? buildTargetedPrompt(query, allowedDomains!) : buildUserPrompt(query, fundingType) },
  ]
  const searchErrors: string[] = []
  let truncated = false
  // Did it actually search? Without this the route cannot tell a real search
  // from the model answering out of memory — which looks identical in the
  // output and is the whole failure this tool was added to fix.
  let searches = 0
  let resultCount = 0
  // Real token usage, accumulated across rounds. Reported so the cost of a
  // sweep is a measured number rather than an estimate.
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  let billedSearches = 0

  // A server-side search turn can stop with stop_reason 'pause_turn' when the
  // tool loop hits its iteration limit. That is NOT the final answer: re-send
  // with the assistant turn appended and the server resumes where it left off.
  // Treating a pause as the result would silently return a half-finished search.
  const MAX_ROUNDS = 4
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: targeted ? TARGETED_SYSTEM_PROMPT : SYSTEM_PROMPT,
        thinking: { type: 'adaptive' },
        output_config: { effort: EFFORT },
        tools: [{
          type: 'web_search_20260209',
          name: 'web_search',
          max_uses: 8,    // 6 hit max_uses_exceeded; 12 was slower without being better
          user_location: { type: 'approximate', country: 'GB' },
          // NOT allowed_domains. Pinning the search to a single host made
          // results so sparse that the model searched 29 times and the round
          // trip ran past 240s, aborting. The targeted PROMPT keeps it on the
          // funder; the search itself is left free to find that funder's pages
          // wherever they are indexed, which is both faster and higher-recall.
        }],
        messages,
      }),
      signal: AbortSignal.timeout(240_000),
    })

    if (!res.ok) {
      const errText = await res.text()
      return { error: `Claude API error ${res.status}`, detail: errText.slice(0, 200) }
    }

    const data = await res.json() as ClaudeResponse
    const blocks = data.content ?? []

    // web_search failures come back as HTTP 200 with an error OBJECT where a
    // success carries an ARRAY of results. Branch on the shape before using it,
    // or a rate-limited search reads as "no results found".
    for (const b of blocks) {
      if (b.type === 'server_tool_use') { searches++; continue }
      if (b.type !== 'web_search_tool_result') continue
      if (Array.isArray(b.content)) { resultCount += b.content.length; continue }
      const code = (b.content as { error_code?: string } | null)?.error_code
      if (code) searchErrors.push(code)
    }

    usage.input      += data.usage?.input_tokens ?? 0
    usage.output     += data.usage?.output_tokens ?? 0
    usage.cacheRead  += data.usage?.cache_read_input_tokens ?? 0
    usage.cacheWrite += data.usage?.cache_creation_input_tokens ?? 0
    // The API's own count of billable searches — more reliable than counting
    // server_tool_use blocks, which also include dynamic-filtering code runs.
    billedSearches += data.usage?.server_tool_use?.web_search_requests ?? 0

    if (data.stop_reason === 'max_tokens') truncated = true

    if (data.stop_reason === 'pause_turn' && round < MAX_ROUNDS) {
      messages.push({ role: 'assistant', content: blocks })
      continue
    }

    const text = blocks.filter(b => b.type === 'text').map(b => b.text ?? '').join('')
    return { text, truncated, searchErrors, rounds: round, searches, resultCount, usage, billedSearches }
  }

  return { error: `Search did not settle within ${MAX_ROUNDS} rounds`, detail: 'stop_reason stayed pause_turn' }
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

/**
 * Prompt for a sweep of ONE named funder, used when `domains` is supplied.
 *
 * The general discovery prompt cannot do this job — it actively excludes the
 * target. Its rules say to omit "generic government schemes, or anything
 * requiring a political/statutory body", and Arts Council England is an
 * arm's-length public body; its `programme` focus text steers hard toward
 * accelerators and sector-support bodies. Asked for Arts Council with
 * allowed_domains pinned to artscouncil.org.uk, the general prompt ran 12
 * searches, read 60 results, and returned UnLtd, SSE, CAST and The Fore —
 * plausible funders, none of them the one requested.
 *
 * So: no exclusion rules, no type framing, one instruction — list what THIS
 * funder currently has open.
 */
const TARGETED_SYSTEM_PROMPT = `You are a UK funding researcher. You are given ONE funder and must list the funding programmes that funder currently has open to applicants.

Rules:
- ONLY include programmes offered by the named funder. Never substitute a different organisation.
- Use the search results. Do not fall back on recalled knowledge — if the search does not show a programme, leave it out.
- Include the direct URL to each programme's own page.
- Include programmes that are open now or run recurring rounds. Note closed ones only if a next round is stated.
- This funder may be a public or arm's-length body. That is expected — do not exclude it on those grounds.
- Do NOT invent URLs. Omit any entry whose URL you did not see in the results.
- Return valid JSON only — no markdown fencing, no extra text.`

function buildTargetedPrompt(query: string, domains: string[]): string {
  return `Search ${domains.join(' and ')} and list every funding programme currently open to applicants.

Context for the search: "${query}"

Return 5-15 programmes. For each:
{
  "funder_name": "The funder's own name",
  "title": "The specific programme or fund name",
  "url": "Direct URL to that programme's page, taken from the search results",
  "description": "2-3 sentences: what it funds, typical size if stated, who is eligible",
  "deadline": "Next deadline, 'Rolling' if always open, or null if unknown",
  "amount_range": "e.g. '£5,000-£50,000' or null if unknown",
  "eligibility_snippet": "Key eligibility in one sentence",
  "funding_type": "One of: corporate_grant|corporate_programme|social_investment|accelerator|incubator|fellowship|capacity_building|loan|equity|blended_finance"
}

Return as: { "results": [ ... ] }`
}

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

    const body = await req.json() as { query?: string; fundingType?: FundingType; domains?: string[] }
    const fundingType: FundingType = body.fundingType ?? 'corporate'
    const query = body.query ?? DEFAULT_QUERIES[fundingType][0]
    // Optional. Naming a funder's domain switches to the TARGETED prompt —
    // "list what THIS funder has open" — instead of general discovery.
    const domains = body.domains?.length ? body.domains : undefined

    console.log(`[discover-grants] Running: "${query}" (${fundingType})`)

    const search = await searchForOpportunities(query, fundingType, domains)
    if ('error' in search) {
      console.error(`[discover-grants] ${search.error}`)
      return NextResponse.json({ error: search.error, detail: search.detail }, { status: 502 })
    }

    // A truncated response is NOT a small result set. The old code read neither
    // stop_reason nor searchErrors, so a cut-off JSON array parsed to fewer rows
    // (or none) and returned ok: true — indistinguishable from "nothing found".
    if (search.truncated) {
      return NextResponse.json({
        error: 'Response hit max_tokens before the JSON was complete',
        detail: `Raise MAX_TOKENS (currently ${MAX_TOKENS}) or lower EFFORT. Nothing was queued, because a truncated result set is not a small one.`,
        ok: false, queued: 0, skipped: [],
      }, { status: 502 })
    }

    const text = search.text
    if (!text) {
      return NextResponse.json({
        error: 'Claude returned no text',
        detail: search.searchErrors.length ? `web_search errors: ${search.searchErrors.join(', ')}` : undefined,
        ok: false, queued: 0, skipped: [],
      })
    }

    const results = parseResults(text)

    if (results.length === 0) {
      return NextResponse.json({ ok: true, queued: 0, found: 0, skipped: [], query, fundingType,
        search: { searches: search.searches, billedSearches: search.billedSearches, resultCount: search.resultCount, rounds: search.rounds, errors: search.searchErrors, usage: search.usage } })
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
    return NextResponse.json({ ok: true, queued, found: results.length, skipped, query, fundingType,
      search: { searches: search.searches, billedSearches: search.billedSearches, resultCount: search.resultCount, rounds: search.rounds, errors: search.searchErrors, usage: search.usage } })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[discover-grants] Unhandled error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

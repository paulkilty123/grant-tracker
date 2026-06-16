import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import type { Organisation } from '@/types'

export const dynamic = 'force-dynamic'

const CACHE_TTL_HOURS = 168 // 7 days

// Keep WEEKLY_LIMIT in sync with the client-side UX hint in
// src/app/dashboard/search/page.tsx. Enforcement lives here, server-side.
const WEEKLY_LIMIT = 3

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? 'paulkilty1@gmail.com')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean)

// ── URL verification ──────────────────────────────────────────────────────────
// Checks whether a URL actually resolves before we cache and show it.
// Uses GET (not HEAD) since many grant sites block HEAD requests.
// Returns true if the page exists, false on 404/timeout/DNS-failure/content-404.
async function verifyUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(7000),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GrantTracker/1.0; +https://grant-tracker-kappa.vercel.app)',
      },
    })
    // Hard failures
    if (res.status === 404 || res.status === 410 || res.status === 400) return false

    // Soft 404 detection — catch pages that redirect to homepage or parent path
    const finalUrl = res.url
    if (finalUrl && finalUrl !== url) {
      try {
        const orig  = new URL(url)
        const final = new URL(finalUrl)
        const origHost  = orig.hostname.replace(/^www\./, '')
        const finalHost = final.hostname.replace(/^www\./, '')
        const sameDomain = origHost === finalHost
        const origDepth  = orig.pathname.replace(/\/$/, '').split('/').filter(Boolean).length
        const finalDepth = final.pathname.replace(/\/$/, '').split('/').filter(Boolean).length

        if (sameDomain) {
          const origPath  = orig.pathname.replace(/\/$/, '') || '/'
          const finalPath = final.pathname.replace(/\/$/, '') || '/'
          // Redirected to homepage
          if (origDepth >= 2 && finalDepth <= 1) return false
          // Redirected to a parent path (specific page no longer exists)
          if (finalPath !== origPath && origPath.startsWith(finalPath + '/') && origDepth >= finalDepth + 1) return false
        } else {
          // Cross-domain redirect — almost always dead
          return false
        }
      } catch { /* ignore parse errors */ }
    }

    // Content 404 detection — catches sites that serve HTTP 200 with an error
    // page inside their normal chrome (e.g. "No Results Found" on Blagrave,
    // "404 Not Found" on Waitrose). Read first 30 KB — enough for head + content.
    try {
      const contentType = res.headers.get('content-type') ?? ''
      if (contentType.includes('text/html')) {
        const buf  = await res.arrayBuffer()
        const html = new TextDecoder().decode(new Uint8Array(buf).slice(0, 30720))

        // <title> tag check
        const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
        if (titleMatch) {
          const title = titleMatch[1].toLowerCase()
          if (
            title.includes('404') ||
            title.includes('not found') ||
            title.includes('page not found') ||
            title.includes('error 404')
          ) return false
        }

        // <h1>/<h2> heading check — catches "No Results Found" style errors
        const headingMatches = Array.from(html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi))
        for (const m of headingMatches) {
          const heading = m[1].replace(/<[^>]+>/g, '').toLowerCase().trim()
          if (
            heading === '404' ||
            heading === 'not found' ||
            heading === 'page not found' ||
            heading === 'no results found' ||
            heading === 'content not found' ||
            heading === 'sorry, page not found' ||
            heading.includes('page could not be found') ||
            heading.includes("page doesn't exist") ||
            heading.includes('page does not exist') ||
            heading.includes('page you requested') ||
            heading.includes('page you are looking for')
          ) return false
        }
      }
    } catch { /* ignore */ }

    return true
  } catch (err: unknown) {
    // ENOTFOUND = domain doesn't exist in DNS — permanently dead
    const msg     = err instanceof Error ? err.message : String(err)
    const cause   = (err instanceof Error && err.cause instanceof Error) ? err.cause.message : ''
    if (`${msg} ${cause}`.toLowerCase().includes('enotfound')) return false

    // Timeout or other transient error — benefit of the doubt
    return true
  }
}

// Service-role client — never exposed to the browser, only used server-side.
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Start of the current ISO week (Monday 00:00 UTC) — mirrors getWeeklySearchCount.
function weekStartISO(): string {
  const now = new Date()
  const dow = now.getUTCDay() // 0=Sun … 6=Sat
  const daysToMonday = dow === 0 ? 6 : dow - 1
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() - daysToMonday)
  monday.setUTCHours(0, 0, 0, 0)
  return monday.toISOString()
}

// Resolve the caller's org from their authenticated identity, honouring the
// active-org cookie. The search client sends org:null, so we never trust the
// body for the org used to meter the weekly cap.
async function resolveOrgId(
  admin: SupabaseClient,
  userId: string,
  activeOrgId: string | null
): Promise<string | null> {
  const { data } = await admin
    .from('organisations')
    .select('id')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
  if (!data?.length) return null
  if (activeOrgId) {
    const match = data.find((o: { id: string }) => o.id === activeOrgId)
    if (match) return match.id
  }
  return data[0].id
}

// Records a served search to live_search_history (the weekly-cap ledger).
// Runs with the service-role client; never lets a logging failure break search.
async function recordSearch(
  admin: SupabaseClient,
  orgId: string | null,
  query: string,
  sectors: string[] | undefined,
  location: string | undefined,
  resultCount: number
): Promise<void> {
  if (!orgId) return
  try {
    await admin.from('live_search_history').insert({
      org_id: orgId,
      query,
      sectors: sectors ?? [],
      location: location?.trim() || null,
      result_count: resultCount,
    })
  } catch { /* ignore — logging must never break the search */ }
}

function normaliseQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ')
}

function buildOrgContext(org: Organisation | null): string {
  if (!org) return ''
  const parts: string[] = []
  if (org.name)              parts.push(`Organisation name: ${org.name}`)
  if (org.org_type)          parts.push(`Type: ${org.org_type.replace(/_/g, ' ')}`)
  if (org.primary_location)  parts.push(`Based in: ${org.primary_location}`)
  if (org.annual_income_band) parts.push(`Annual income: ${org.annual_income_band}`)
  if (org.mission)           parts.push(`Mission: ${org.mission}`)
  if (org.themes?.length)        parts.push(`Themes: ${org.themes.join(', ')}`)
  if (org.areas_of_work?.length) parts.push(`Areas of work: ${org.areas_of_work.join(', ')}`)
  if (org.beneficiaries?.length) parts.push(`Beneficiaries: ${org.beneficiaries.join(', ')}`)
  if (org.min_grant_target || org.max_grant_target) {
    const min = org.min_grant_target ? `£${org.min_grant_target.toLocaleString()}` : 'any'
    const max = org.max_grant_target ? `£${org.max_grant_target.toLocaleString()}` : 'any'
    parts.push(`Preferred grant size: ${min} – ${max}`)
  }
  if (!parts.length) return ''
  return `\n\nAPPLICANT PROFILE — use ONLY for eligibility filtering, NOT to change the search topic:\n${parts.map(p => `- ${p}`).join('\n')}\n`
}

export async function POST(req: NextRequest) {
  try {
    // ── Auth gate — deep search is authenticated-only (expensive web search) ──
    const authClient = await createServerSupabase()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Please sign in to use deep search.' }, { status: 401 })
    }
    const isAdmin = !!user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())

    const { query, org, sectors, location, existingGrantTitles } = await req.json()
    // Include sectors/location in cache key so different filter combos cache separately
    const filterKey = [
      ...(sectors?.length ? sectors.sort() : []),
      location ? `loc:${location.toLowerCase().trim()}` : '',
    ].filter(Boolean).join('|')
    const queryKey = normaliseQuery(query) + (filterKey ? `::${filterKey}` : '')
    const supabase = getAdminClient()

    // ── Weekly cap — enforced server-side (the client check is only a UX hint) ─
    const activeOrgId = req.cookies.get('gt_active_org_id')?.value ?? null
    const orgId = await resolveOrgId(supabase, user.id, activeOrgId)
    if (!isAdmin) {
      if (!orgId) {
        return NextResponse.json({ error: 'No organisation found for your account.' }, { status: 403 })
      }
      const { count } = await supabase
        .from('live_search_history')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('created_at', weekStartISO())
      if ((count ?? 0) >= WEEKLY_LIMIT) {
        return NextResponse.json(
          { error: `You've used all ${WEEKLY_LIMIT} deep searches for this week. Your allowance resets Monday.` },
          { status: 429 }
        )
      }
    }

    // ── 1. Check cache ──────────────────────────────────────────────────────
    const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString()
    const { data: cached } = await supabase
      .from('deep_search_cache')
      .select('results, created_at')
      .eq('query_key', queryKey)
      .gte('created_at', cutoff)
      .maybeSingle()

    if (cached) {
      const cachedCount = Array.isArray(cached.results?.grants) ? cached.results.grants.length : 0
      await recordSearch(supabase, orgId, query, sectors, location, cachedCount)
      return NextResponse.json({ ...cached.results, _cached: true })
    }

    // ── 2. Call Anthropic with web search ───────────────────────────────────
    const orgContext = buildOrgContext(org ?? null)

    // Build sector and location context
    const sectorList = sectors?.length ? (sectors as string[]).join(', ') : null
    const locationStr = location?.trim() || null
    const sectorContext = sectorList ? `\nFocus specifically on these sectors: ${sectorList}.` : ''
    const locationContext = locationStr ? `\nFocus on funders that operate in or near: ${locationStr}.` : ''

    // Build exclusion list of grants already in the curated database
    const exclusionList = existingGrantTitles?.length
      ? `\nDo NOT return any of these grants — they are already in our database:\n${
          (existingGrantTitles as { title: string; funder: string }[])
            .map(g => `- "${g.title}" by ${g.funder}`)
            .join('\n')
        }\nOnly return genuinely new opportunities not on this list.`
      : ''

    const prompt = `You are a UK funding expert specialising in grants, competitions, social loans and matched crowdfunding for charities, community groups, social enterprises, impact founders and underserved ventures.

SEARCH QUERY (this is the PRIMARY driver — all results MUST match this query): "${query}"
${sectorContext}${locationContext}

CRITICAL: Your results MUST directly match the search query above. The search query defines WHAT to look for. Do NOT substitute the query topic with the applicant profile topic. For example, if the query says "Social Enterprises Funding London" then every result must be about social enterprise funding in London — not about the applicant's other themes or areas of work.
${orgContext}${exclusionList}

Use web search to find:
1. Hyper-local funders specific to any location mentioned in the query (local council grants, NHS/ICB commissioning, community foundations, borough-level programmes)
2. Specialist funders for the specific sectors, topics, themes and beneficiaries mentioned in the query
3. Any relevant regional funders if applicable
4. Current application windows, deadlines and open rounds
5. Grants sized appropriately for the applicant's income band and preferred grant range (where provided in profile)

If an applicant profile is provided, use it ONLY to:
- Filter out grants the organisation would not be eligible for (wrong org type, wrong income band, wrong geography)
- Prefer grants matching the applicant's grant size range
Do NOT use the profile to change what topics or sectors are searched for — the search query alone defines the topic.

After researching, return a JSON object with exactly this structure:
{
  "summary": "2-3 sentence overview of the funding landscape for this specific query",
  "grants": [
    {
      "title": "Grant programme name",
      "funder": "Organisation name",
      "description": "2-3 sentences describing what it funds and who it is for",
      "amountRange": "£X,000–£X,000 or null if unknown",
      "deadline": "Month YYYY, Rolling, or null if unknown",
      "applyUrl": "https://... (REQUIRED — provide the specific grant page URL confirmed via web search. If the exact grant page is not found, provide the funder's main grants/funding page instead. Never set this to null — every result MUST have a URL.)",
      "notes": "One practical tip or caveat, e.g. about eligibility, timing or relationship-building"
    }
  ]
}

Include up to 15 grants. Strongly prioritise hyper-local and specialist funders over large national ones.
IMPORTANT: Every grant MUST include an applyUrl — if you cannot find the specific grant application page, use the funder's homepage or grants page instead. Do NOT include any grant where you cannot provide at least a funder website URL.
IMPORTANT: Today's date is ${new Date().toISOString().slice(0, 10)}. Do NOT include any grant whose deadline has already passed. Only include grants that are currently open, rolling, or have a future deadline.
Return ONLY valid JSON — no markdown fences, no commentary outside the JSON object.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 5000,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }],
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      const message = data?.error?.message ?? `Anthropic API error (${response.status})`
      return NextResponse.json({ error: message }, { status: response.status })
    }

    const textBlock = data.content?.filter((b: { type: string }) => b.type === 'text').pop() as { text: string } | undefined
    const text = textBlock?.text
    if (!text) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 502 })
    }

    // Strip markdown fences, then extract the outermost JSON object.
    // Always use regex extraction so trailing commentary (text after the final
    // closing brace) or leading prose don't break JSON.parse.
    let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'AI did not return valid JSON — please try again' }, { status: 502 })
    }
    cleaned = jsonMatch[0]
    const result = JSON.parse(cleaned)

    // ── 3. Verify URLs — fall back to funder homepage if specific page is dead
    if (Array.isArray(result.grants)) {
      const urlChecks = await Promise.allSettled(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result.grants.map(async (g: any) => {
          if (!g.applyUrl) return g
          const alive = await verifyUrl(g.applyUrl)
          if (alive) return g
          // Try funder homepage as fallback
          try {
            const domain = new URL(g.applyUrl).origin
            const homepageAlive = await verifyUrl(domain)
            if (homepageAlive) return { ...g, applyUrl: domain }
          } catch { /* ignore parse errors */ }
          return { ...g, applyUrl: null }
        })
      )
      result.grants = urlChecks
        .map((r, i) => r.status === 'fulfilled' ? r.value : result.grants[i])
        .filter((g: { applyUrl?: string | null }) => g.applyUrl)  // drop grants with no URL
        .filter((g: { deadline?: string | null }) => {
          // Drop grants with clearly past deadlines
          if (!g.deadline) return true  // keep rolling/unknown
          const dl = g.deadline.toLowerCase()
          if (dl.includes('rolling') || dl.includes('ongoing') || dl.includes('open') || dl.includes('tbc') || dl.includes('tba')) return true
          // Try to parse a date from the deadline string
          const parsed = new Date(g.deadline)
          if (isNaN(parsed.getTime())) return true  // can't parse — keep it
          return parsed.getTime() > Date.now()
        })
    }

    // ── 4. Store in cache (upsert so repeat queries overwrite stale rows) ───
    await supabase
      .from('deep_search_cache')
      .upsert({ query_key: queryKey, results: result }, { onConflict: 'query_key' })

    await recordSearch(
      supabase,
      orgId,
      query,
      sectors,
      location,
      Array.isArray(result.grants) ? result.grants.length : 0
    )
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Deep search failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

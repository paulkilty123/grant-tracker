import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Organisation } from '@/types'

const CACHE_TTL_HOURS = 48

// Service-role client — never exposed to the browser, only used server-side.
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
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
  return `\n\nAPPLICANT PROFILE — tailor your research to this organisation:\n${parts.map(p => `- ${p}`).join('\n')}\n`
}

export async function POST(req: NextRequest) {
  try {
    const { query, org, sectors, location, existingGrantTitles } = await req.json()
    // Include sectors/location in cache key so different filter combos cache separately
    const filterKey = [
      ...(sectors?.length ? sectors.sort() : []),
      location ? `loc:${location.toLowerCase().trim()}` : '',
    ].filter(Boolean).join('|')
    const queryKey = normaliseQuery(query) + (filterKey ? `::${filterKey}` : '')
    const supabase = getAdminClient()

    // ── 1. Check cache ──────────────────────────────────────────────────────
    const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString()
    const { data: cached } = await supabase
      .from('deep_search_cache')
      .select('results, created_at')
      .eq('query_key', queryKey)
      .gte('created_at', cutoff)
      .maybeSingle()

    if (cached) {
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

    const prompt = `You are a UK charity funding expert. Research grant funding opportunities for: "${query}".
${orgContext}${sectorContext}${locationContext}${exclusionList}

Use web search to find:
1. Hyper-local funders specific to any location mentioned in the query or applicant profile (local council grants, NHS/ICB commissioning, community foundations, borough-level programmes)
2. Specialist funders for the specific sectors, topics, themes and beneficiaries
3. Any relevant regional funders if applicable
4. Current application windows, deadlines and open rounds
5. Grants sized appropriately for the applicant's income band and preferred grant range (where provided)

Where an applicant profile is provided, prioritise funders that match their location, organisation type, themes and grant size preferences. Deprioritise large national funders if hyper-local alternatives exist.

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
      "applyUrl": "https://... (must be a real, specific URL — not a homepage)",
      "notes": "One practical tip or caveat, e.g. about eligibility, timing or relationship-building"
    }
  ]
}

Include up to 15 grants. Strongly prioritise hyper-local and specialist funders over large national ones.
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
        max_tokens: 8000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
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

    // Strip markdown fences, then extract the JSON object even if the model
    // prepended prose (e.g. "Based on my research, here is...")
    let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    if (!cleaned.startsWith('{')) {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        return NextResponse.json({ error: 'AI did not return valid JSON — please try again' }, { status: 502 })
      }
      cleaned = jsonMatch[0]
    }
    const result = JSON.parse(cleaned)

    // ── 3. Store in cache (upsert so repeat queries overwrite stale rows) ───
    await supabase
      .from('deep_search_cache')
      .upsert({ query_key: queryKey, results: result }, { onConflict: 'query_key' })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Deep search failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

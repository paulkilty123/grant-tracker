import { NextRequest, NextResponse } from 'next/server'
import type { Organisation } from '@/types'

export const dynamic = 'force-dynamic'

function buildOrgContext(org: Organisation | null): string {
  if (!org) return ''

  const parts: string[] = []

  if (org.name) parts.push(`Organisation: ${org.name}`)
  if (org.org_type) {
    const labels: Record<string, string> = {
      registered_charity: 'Registered Charity',
      cic: 'Community Interest Company (CIC)',
      social_enterprise: 'Social Enterprise',
      community_group: 'Community Group',
      other: 'Other',
    }
    parts.push(`Type: ${labels[org.org_type] ?? org.org_type}`)
  }
  if (org.primary_location) parts.push(`Location: ${org.primary_location}`)
  if (org.annual_income_band) parts.push(`Annual income: ${org.annual_income_band}`)
  if (org.mission) parts.push(`Mission: ${org.mission}`)
  if (org.themes?.length)        parts.push(`Themes: ${org.themes.join(', ')}`)
  if (org.areas_of_work?.length) parts.push(`Areas of work: ${org.areas_of_work.join(', ')}`)
  if (org.beneficiaries?.length) parts.push(`Beneficiaries: ${org.beneficiaries.join(', ')}`)
  if (org.min_grant_target || org.max_grant_target) {
    const min = org.min_grant_target ? `£${org.min_grant_target.toLocaleString()}` : 'any'
    const max = org.max_grant_target ? `£${org.max_grant_target.toLocaleString()}` : 'any'
    parts.push(`Grant size target: ${min} – ${max}`)
  }
  if (org.funder_type_preferences?.length) {
    parts.push(`Preferred funder types: ${org.funder_type_preferences.join(', ')}`)
  }
  if (org.years_operating != null)  parts.push(`Years operating: ${org.years_operating}`)
  if (org.people_per_year != null)  parts.push(`People served per year: ${org.people_per_year}`)
  if (org.volunteers != null)       parts.push(`Volunteers: ${org.volunteers}`)
  if (org.projects_running != null) parts.push(`Active projects: ${org.projects_running}`)
  if (org.key_outcomes?.length)     parts.push(`Key outcomes: ${org.key_outcomes.slice(0, 3).join('; ')}`)

  if (!parts.length) return ''

  return `\n\nAPPLICANT PROFILE (use this to personalise scoring — prioritise grants that fit this organisation's location, size, mission and themes):\n${parts.map(p => `- ${p}`).join('\n')}\n`
}

export async function POST(req: NextRequest) {
  try {
    const { query, grants, org } = await req.json()

    const orgContext = buildOrgContext(org ?? null)

    const prompt = `You are a UK funding expert helping organisations find the most suitable grants, competitions, social loans and matched crowdfunding opportunities.

Applicants include charities, community groups, social enterprises, impact founders and underserved ventures — treat each appropriately based on their profile.

The user is searching for: "${query}"
${orgContext}
Available grants:
${JSON.stringify(grants)}

CRITICAL RULE — THE QUERY IS THE PRIMARY FILTER:
The search query is the user's explicit intent and must be matched first. If the query contains a specific topic, cause, place, beneficiary group or activity (e.g. "tibet", "youth mental health", "food bank"), you must ONLY return grants that are plausibly relevant to that specific thing. Do NOT use the applicant profile as a substitute or fallback — if no grants in the database match the query topic, return an empty array []. Never return grants that match the applicant profile but not the query.

Scoring rules — apply in this priority order:
1. QUERY match (hard gate): Does the grant's sectors, description or eligibility plausibly cover the specific topic, place or activity in the query? If not, exclude it regardless of profile fit.
2. TOPIC match: Does the grant's sectors/description match the activity in detail (e.g. training, youth work, mental health)?
3. GEOGRAPHY match: If the query or the applicant profile mentions a specific place, check whether the grant explicitly serves that area or has isLocal:true. Large UK-wide funders with no local dimension should score MAX 35 when a specific location is given.
4. SIZE fit: Match the grant's amount range to the applicant's income band and grant size target. Huge grants (£500k+) are unsuitable for very small organisations.
5. ELIGIBILITY fit: Does the organisation type and scale likely match the grant's requirements?
6. THEME/MISSION fit: Where an applicant profile is provided, use it to personalise scores among grants that already pass the query filter — not as a fallback for grants that don't match the query.

Return a JSON array of the top matching grants ranked by score. For each include:
- grantId (the id field)
- score (0-100)
- reason (1 sentence explaining specifically why this grant fits the search query — reference the applicant's location or mission if relevant)

Only include grants with score above 40. Max 20 results. Return an empty array [] if no grants genuinely match the query.
Return ONLY valid JSON array, no markdown, no other text.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      const message = data?.error?.message ?? `Anthropic API error (${response.status})`
      return NextResponse.json({ error: message }, { status: response.status })
    }

    const text = data.content?.[0]?.text
    if (!text) {
      return NextResponse.json({ error: 'Empty response from AI' }, { status: 502 })
    }

    // Strip markdown fences, then extract JSON array even if model adds prose
    let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    if (!cleaned.startsWith('[')) {
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        return NextResponse.json({ error: 'AI did not return valid results — please try again' }, { status: 502 })
      }
      cleaned = jsonMatch[0]
    }
    const results = JSON.parse(cleaned)
    return NextResponse.json(results)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

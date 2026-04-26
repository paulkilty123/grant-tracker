import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 45

const supabaseAdmin = createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// ── Fetch & strip HTML ──
async function fetchPageText(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 14000)
  } finally {
    clearTimeout(timeout)
  }
}

// ── Valid enum values (keep in sync with types/index.ts) ──
const VALID_SECTORS = [
  'creative','environment','health','mental_health','education','tech','housing',
  'food','employment','community','justice','financial','international','heritage',
  'sport','social_economy','social_innovation',
]
const VALID_BENEFICIARIES = [
  'children','young_people','older_people','families','women_girls','men_boys',
  'lgbtq','ethnic_minorities','refugees_migrants','disabled_people','mental_health',
  'carers','veterans','ex_offenders','homeless','people_in_poverty','rural_communities',
  'general_public',
]
const VALID_STRUCTURES = [
  'cic_guarantee','cic_shares','cio','registered_charity','ltd_guarantee','ltd_shares',
  'llp','cooperative','unincorporated','sole_trader','not_registered',
]
const VALID_INCOME_BANDS = [
  'Under £10,000','£10,000–£50,000','£50,000–£100,000','£100,000–£250,000',
  '£250,000–£500,000','£500,000–£1 million','£1 million–£5 million','Over £5 million',
]
const VALID_REACH = ['local','regional','national','international']

export async function POST(req: NextRequest) {
  // ── Auth: must be logged in ──
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { orgId } = await req.json() as { orgId: string }
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })

  // ── Load org ──
  const { data: org, error } = await supabaseAdmin
    .from('organisations')
    .select('id, name, website_url, mission, impact_sectors, beneficiary_groups, legal_structure, annual_income_band, primary_location, geographic_reach, owner_id')
    .eq('id', orgId)
    .single()

  if (error || !org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 })
  if (org.owner_id !== user.id) return NextResponse.json({ error: 'Not your organisation' }, { status: 403 })
  if (!org.website_url) return NextResponse.json({ error: 'No website URL on file' }, { status: 400 })

  // ── Fetch website ──
  let pageText: string
  try {
    pageText = await fetchPageText(org.website_url)
  } catch {
    return NextResponse.json({ error: 'Could not fetch website — it may be down or blocking automated requests' }, { status: 502 })
  }

  if (pageText.length < 100) {
    return NextResponse.json({ error: 'Website returned too little text to extract meaningful information' }, { status: 422 })
  }

  // ── Claude extraction ──
  const prompt = `You are analysing a UK charity / social enterprise / CIC website to extract structured profile data.

Organisation name: ${org.name}
Website: ${org.website_url}

Page content:
---
${pageText}
---

Extract the following fields from the website content. Only include fields where you have reasonable confidence from the page text. Return a JSON object with these optional keys:

- "mission": A concise 1-2 sentence mission statement (max 200 chars). Extract or summarise their stated mission/purpose.
- "impact_sectors": Array of 1-5 sectors from this exact list: ${VALID_SECTORS.join(', ')}
- "beneficiary_groups": Array of 1-5 groups from this exact list: ${VALID_BENEFICIARIES.join(', ')}
  Use "general_public" only if they explicitly serve everyone with no specific focus.
- "legal_structure": One value from: ${VALID_STRUCTURES.join(', ')}
  Look for clues like "registered charity", "CIC", "community interest company", "CIO", charity/company numbers, etc.
- "annual_income_band": One value from: ${VALID_INCOME_BANDS.join(', ')}
  Only include if financial info is clearly stated.
- "primary_location": The main city/town they operate from (e.g. "Brighton", "Manchester", "London")
- "geographic_reach": One value from: ${VALID_REACH.join(', ')}

Rules:
- Only return fields you can confidently extract. Omit uncertain fields entirely.
- For impact_sectors and beneficiary_groups, only include tags clearly supported by the content.
- Return ONLY valid JSON — no markdown, no explanation.`

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = (msg.content[0] as { type: string; text: string }).text.trim()

  let extracted: Record<string, unknown>
  try {
    // Handle potential markdown code block wrapping
    const jsonStr = raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '')
    extracted = JSON.parse(jsonStr)
  } catch {
    return NextResponse.json({ error: 'Failed to parse extraction results' }, { status: 500 })
  }

  // ── Validate & filter to valid enum values ──
  const result: Record<string, unknown> = {}

  if (extracted.mission && typeof extracted.mission === 'string') {
    result.mission = extracted.mission.slice(0, 200)
  }
  if (Array.isArray(extracted.impact_sectors)) {
    const valid = extracted.impact_sectors.filter((s: string) => VALID_SECTORS.includes(s))
    if (valid.length > 0) result.impact_sectors = valid.slice(0, 5)
  }
  if (Array.isArray(extracted.beneficiary_groups)) {
    const valid = extracted.beneficiary_groups.filter((b: string) => VALID_BENEFICIARIES.includes(b))
    if (valid.length > 0) result.beneficiary_groups = valid.slice(0, 5)
  }
  if (extracted.legal_structure && VALID_STRUCTURES.includes(extracted.legal_structure as string)) {
    result.legal_structure = extracted.legal_structure
  }
  if (extracted.annual_income_band && VALID_INCOME_BANDS.includes(extracted.annual_income_band as string)) {
    result.annual_income_band = extracted.annual_income_band
  }
  if (extracted.primary_location && typeof extracted.primary_location === 'string') {
    result.primary_location = extracted.primary_location.slice(0, 100)
  }
  if (extracted.geographic_reach && VALID_REACH.includes(extracted.geographic_reach as string)) {
    result.geographic_reach = extracted.geographic_reach
  }

  return NextResponse.json({ extracted: result, fieldsFound: Object.keys(result).length })
}

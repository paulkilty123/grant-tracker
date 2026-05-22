// Admin endpoint: AI classification of eligible_structures for scraped_grants
//
// GET  /api/admin/classify-structures         — stats on how many are missing
// POST /api/admin/classify-structures         — classify a batch and apply
//   Body: { offset?: number; limit?: number }
//   Returns: { processed, updated, skipped, nextOffset, done }
//
// Only processes grants where eligible_structures IS NULL or empty.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { mergeGrantUpdate } from '@/lib/grant-merge'

export const dynamic   = 'force-dynamic'
export const maxDuration = 300

// Bump when the structures prompt below changes materially.
const STRUCTURES_VERSION = 'v1'
const PROVENANCE_SOURCE  = `ai_classifier:structures:${STRUCTURES_VERSION}`

async function isAuthorised(req: NextRequest): Promise<boolean> {
  if (isAdminBearerToken(req.headers.get('authorization'))) return true
  const auth = await requireAdmin()
  return auth.ok
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// All valid structure keys
const VALID_STRUCTURES = [
  'charity',
  'cio',
  'cic',
  'social_enterprise',
  'company_ltd_guarantee',
  'ltd_company',
  'community_benefit_society',
  'coop',
  'unincorporated',
  'voluntary_organisation',
  'housing_association',
  'public_sector',
  'school',
  'university',
  'individual',
  'sole_trader',
  'partnership',
] as const

// ── GET: stats ─────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!await isAuthorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const db = getAdminClient()
  const { count: total }   = await db.from('scraped_grants').select('*', { count: 'exact', head: true }).eq('is_active', true)
  const { count: missing } = await db.from('scraped_grants').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('eligible_structures', '{}')
  const { count: hasNull } = await db.from('scraped_grants').select('*', { count: 'exact', head: true }).eq('is_active', true).is('eligible_structures', null)
  const { count: hasData } = await db.from('scraped_grants').select('*', { count: 'exact', head: true }).eq('is_active', true).neq('eligible_structures', '{}').not('eligible_structures', 'is', null)

  return NextResponse.json({ total, missingEmpty: missing, missingNull: hasNull, hasData })
}

// ── POST: classify batch ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body   = await req.json() as { offset?: number; limit?: number }
  const offset = body.offset ?? 0
  const limit  = Math.min(body.limit ?? 10, 15)

  const db = getAdminClient()

  // Only fetch grants that are missing eligible_structures (null or empty array)
  const { data: grants, error } = await db
    .from('scraped_grants')
    .select('id, title, funder, description, eligibility_criteria, funder_type')
    .eq('is_active', true)
    .or('eligible_structures.is.null,eligible_structures.eq.{}')
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!grants || grants.length === 0) return NextResponse.json({ processed: 0, updated: 0, skipped: 0, nextOffset: offset, done: true })

  const apiKey = process.env.ANTHROPIC_API_KEY!

  const inputData = grants.map(g => ({
    id:          g.id,
    title:       g.title ?? '',
    funder:      g.funder ?? '',
    funder_type: g.funder_type ?? '',
    description: (g.description ?? '').slice(0, 500),
    criteria:    Array.isArray(g.eligibility_criteria) ? g.eligibility_criteria.slice(0, 6) : [],
  }))

  const prompt = `You are classifying which legal organisation types are eligible to apply for UK funding opportunities.

For each grant, read the title, funder, description, and eligibility criteria.
Return which organisation types from the allowed list can apply.

ALLOWED STRUCTURE KEYS (use ONLY these exact strings):
charity, cio, cic, social_enterprise, company_ltd_guarantee, ltd_company,
community_benefit_society, coop, unincorporated, voluntary_organisation,
housing_association, public_sector, school, university, individual, sole_trader, partnership

Rules:
- If description says "registered charities only" → ["charity", "cio"]
- If description says "charities and social enterprises" → ["charity", "cio", "cic", "social_enterprise", "community_benefit_society"]
- If description says "any not-for-profit" → include charity, cio, cic, social_enterprise, community_benefit_society, coop, unincorporated, voluntary_organisation
- If description says "any organisation" or is a large open government fund → include most types
- If description says "individuals" or "people" → include individual
- If no org type info is available, make a reasonable inference from the funder name and grant type
- NEVER return an empty array — always return at least one type
- Maximum 8 structure keys per grant

Return ONLY a JSON array — no markdown, no explanation:
[
  {
    "id": "<copy id exactly>",
    "structures": ["<key1>", "<key2>"]
  }
]

Input:
${JSON.stringify(inputData, null, 0)}`

  let raw = ''
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const json = await resp.json() as { content?: Array<{ text: string }>; error?: { type: string; message: string } }
    if (json.error) {
      return NextResponse.json({ error: 'Claude API error', detail: json.error }, { status: 500 })
    }
    raw = json.content?.[0]?.text?.trim() ?? ''
  } catch (e) {
    return NextResponse.json({ error: 'Claude API call failed', detail: String(e) }, { status: 500 })
  }

  let results: Array<{ id: string; structures: string[] }> = []
  try {
    const cleaned = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
    results = JSON.parse(cleaned)
  } catch {
    return NextResponse.json({ error: 'Failed to parse Claude response', raw }, { status: 500 })
  }

  let updated = 0
  let skipped = 0

  for (const r of results) {
    const grant = grants.find(g => g.id === r.id)
    if (!grant) continue

    // Filter to only valid keys
    const validStructures = (r.structures ?? []).filter(s => (VALID_STRUCTURES as readonly string[]).includes(s))

    if (validStructures.length === 0) {
      skipped++
      continue
    }

    try {
      const result = await mergeGrantUpdate({
        id:     r.id,
        fields: { eligible_structures: validStructures },
        source: PROVENANCE_SOURCE,
        pinned: false,
        db,
      })
      if (result.applied.includes('eligible_structures')) updated++
      else skipped++
    } catch (err) {
      console.error('[classify-structures] write failed:', err)
      skipped++
    }
  }

  const done = grants.length < limit

  return NextResponse.json({
    processed:  grants.length,
    updated,
    skipped,
    nextOffset: offset + grants.length,
    done,
  })
}

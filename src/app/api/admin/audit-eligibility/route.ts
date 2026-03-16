// Admin endpoint: AI audit of eligibility_criteria for scraped_grants
//
// GET  /api/admin/audit-eligibility           — stats on criteria completeness
// POST /api/admin/audit-eligibility           — audit a batch, optionally apply fixes
//   Body: { offset?: number; limit?: number; apply?: boolean }
//   Returns: { audited, updated, issues[], nextOffset, done }
//
// Auth: ADMIN_SECRET bearer token or authenticated admin session

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic  = 'force-dynamic'
export const maxDuration = 300  // 5 min — batches of 10 × Claude calls

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

async function isAuthorised(req: NextRequest): Promise<boolean> {
  const auth  = req.headers.get('authorization') ?? ''
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
    { auth: { persistSession: false } },
  )
}

// ── GET: stats ─────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!await isAuthorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const db = getAdminClient()
  const { count: total }  = await db.from('scraped_grants').select('*', { count: 'exact', head: true }).eq('is_active', true)
  const { count: empty }  = await db.from('scraped_grants').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('eligibility_criteria', '{}')
  const { count: hasData } = await db.from('scraped_grants').select('*', { count: 'exact', head: true }).eq('is_active', true).neq('eligibility_criteria', '{}')

  return NextResponse.json({ total, empty, hasData })
}

// ── POST: audit batch ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body   = await req.json() as { offset?: number; limit?: number; apply?: boolean }
  const offset = body.offset ?? 0
  const limit  = Math.min(body.limit ?? 8, 15)
  const apply  = body.apply ?? false

  const db = getAdminClient()

  const { data: grants, error } = await db
    .from('scraped_grants')
    .select('id, external_id, title, funder, description, eligibility_criteria, amount_min, amount_max')
    .eq('is_active', true)
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!grants || grants.length === 0) return NextResponse.json({ audited: 0, updated: 0, issues: [], nextOffset: offset, done: true })

  const apiKey = process.env.ANTHROPIC_API_KEY!
  const inputData = grants.map(g => ({
    id:                   g.id,
    title:                g.title ?? '',
    funder:               g.funder ?? '',
    description:          (g.description ?? '').slice(0, 400),
    amount_min:           g.amount_min ?? null,
    amount_max:           g.amount_max ?? null,
    current_criteria:     Array.isArray(g.eligibility_criteria) ? g.eligibility_criteria : [],
  }))

  const prompt = `You are auditing the eligibility criteria for UK grant opportunities in a database.

For each grant, compare the current_criteria against the title, funder, description, and amounts.
Identify if the criteria are:
- MISSING: criteria array is empty or has no meaningful content
- WRONG: criteria contradict the description (e.g., wrong income range, wrong org types)
- INCOMPLETE: criteria are present but missing key restrictions mentioned in description
- OK: criteria are accurate and complete enough

Return ONLY a JSON array — no markdown, no explanation:
[
  {
    "id": "<copy id field exactly>",
    "status": "ok" | "missing" | "wrong" | "incomplete",
    "corrected_criteria": ["<array of corrected eligibility criterion strings>"],
    "reason": "<brief explanation of what was wrong or missing, or 'Criteria look accurate' if ok>"
  }
]

Rules for corrected_criteria:
- Each item is a short, plain-English criterion (e.g. "UK registered charity", "Annual income £100,000 – £5,000,000")
- Include: org type restrictions, income range if mentioned, geographic scope, sector focus, any explicit exclusions
- If status is "ok", return the current_criteria unchanged
- Maximum 6 criteria per grant
- Do not invent restrictions not supported by the description or funder name

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
        max_tokens: 4096,
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

  // Parse JSON, strip markdown fences
  let results: Array<{
    id: string
    status: 'ok' | 'missing' | 'wrong' | 'incomplete'
    corrected_criteria: string[]
    reason: string
  }> = []
  try {
    const cleaned = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
    results = JSON.parse(cleaned)
  } catch {
    return NextResponse.json({ error: 'Failed to parse Claude response', raw }, { status: 500 })
  }

  // Apply corrections if requested
  let updated = 0
  const issues: Array<{ id: string; title: string; status: string; reason: string; corrected: string[] }> = []

  for (const r of results) {
    const grant = grants.find(g => g.id === r.id)
    if (!grant) continue

    if (r.status !== 'ok') {
      issues.push({
        id:        r.id,
        title:     grant.title ?? '',
        status:    r.status,
        reason:    r.reason,
        corrected: r.corrected_criteria,
      })

      if (apply && r.corrected_criteria?.length > 0) {
        const { error: ue } = await db
          .from('scraped_grants')
          .update({ eligibility_criteria: r.corrected_criteria })
          .eq('id', r.id)
        if (!ue) updated++
      }
    }
  }

  const done = grants.length < limit

  return NextResponse.json({
    audited:    grants.length,
    updated,
    issues,
    nextOffset: offset + grants.length,
    done,
  })
}

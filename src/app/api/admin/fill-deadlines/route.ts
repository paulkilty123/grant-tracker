// Admin endpoint: AI extraction of deadlines from grant descriptions
//
// GET  /api/admin/fill-deadlines   — stats on missing deadlines
// POST /api/admin/fill-deadlines   — extract & apply deadlines for a batch
//   Body: { offset?: number; limit?: number }
//
// Only processes grants where deadline IS NULL and is_rolling IS NOT TRUE.
// Claude is instructed to only return dates explicitly mentioned in the text —
// never infer or guess. Returns null if no date is found.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300

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

// ── GET: stats ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!await isAuthorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const db = getAdminClient()
  const { count: total }        = await db.from('scraped_grants').select('*', { count: 'exact', head: true }).eq('is_active', true)
  const { count: hasDeadline }  = await db.from('scraped_grants').select('*', { count: 'exact', head: true }).eq('is_active', true).not('deadline', 'is', null)
  const { count: isRolling }    = await db.from('scraped_grants').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('is_rolling', true)
  const { count: missingAndNotRolling } = await db.from('scraped_grants').select('*', { count: 'exact', head: true })
    .eq('is_active', true)
    .eq('is_rolling', false)
    .is('deadline', null)

  return NextResponse.json({ total, hasDeadline, isRolling, missingAndNotRolling })
}

// ── POST: fill batch ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body  = await req.json() as { offset?: number; limit?: number }
  const limit = Math.min(body.limit ?? 10, 20)

  const db = getAdminClient()

  // Always fetch from offset 0 within the filtered set — avoids pagination
  // drift as we update records out of the filtered set
  const { data: grants, error } = await db
    .from('scraped_grants')
    .select('id, title, funder, description, deadline, is_rolling, apply_url')
    .eq('is_active', true)
    .eq('is_rolling', false)
    .is('deadline', null)
    .order('id', { ascending: true })
    .range(0, limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!grants || grants.length === 0) return NextResponse.json({ processed: 0, updated: 0, noDate: 0, done: true })

  const today = new Date().toISOString().split('T')[0]
  const apiKey = process.env.ANTHROPIC_API_KEY!

  const inputData = grants.map(g => ({
    id:          g.id,
    title:       g.title ?? '',
    funder:      g.funder ?? '',
    description: (g.description ?? '').slice(0, 600),
  }))

  const prompt = `You are extracting application deadline dates from UK grant descriptions. Today's date is ${today}.

For each grant, look ONLY at the description text. Extract the next upcoming application deadline if one is explicitly stated.

Rules (STRICT):
- Only return a date that is EXPLICITLY mentioned in the description text
- Do NOT infer, guess, or assume dates
- Do NOT use dates that are clearly in the past relative to today (${today})
- If a date is mentioned but has already passed, return null
- If multiple deadlines are mentioned (e.g. rolling rounds), return the next upcoming one
- Format: YYYY-MM-DD
- If no date is found, return null

Return ONLY a JSON array — no markdown, no explanation:
[
  {
    "id": "<copy id exactly>",
    "deadline": "YYYY-MM-DD" | null,
    "reason": "<one line: what date you found and where, or why null>"
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
    if (json.error) return NextResponse.json({ error: 'Claude API error', detail: json.error }, { status: 500 })
    raw = json.content?.[0]?.text?.trim() ?? ''
  } catch (e) {
    return NextResponse.json({ error: 'Claude API call failed', detail: String(e) }, { status: 500 })
  }

  let results: Array<{ id: string; deadline: string | null; reason: string }> = []
  try {
    const cleaned = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
    results = JSON.parse(cleaned)
  } catch {
    return NextResponse.json({ error: 'Failed to parse Claude response', raw }, { status: 500 })
  }

  let updated = 0
  let noDate  = 0

  for (const r of results) {
    if (!r.deadline) { noDate++; continue }

    // Validate date format and that it's not in the past
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(r.deadline)) { noDate++; continue }
    if (r.deadline < today) { noDate++; continue }

    const { error: ue } = await db
      .from('scraped_grants')
      .update({ deadline: r.deadline, is_rolling: false })
      .eq('id', r.id)

    if (!ue) updated++
    else noDate++
  }

  const done = grants.length < limit

  return NextResponse.json({
    processed: grants.length,
    updated,
    noDate,
    done,
    sample: results.filter(r => r.deadline).slice(0, 3),
  })
}

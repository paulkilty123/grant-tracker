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
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { mergeGrantUpdate } from '@/lib/grant-merge'

export const dynamic    = 'force-dynamic'
export const maxDuration = 300

// Bump when the deadline-extraction prompt below changes materially.
const DETECT_VERSION    = 'v1'
const PROVENANCE_SOURCE = `ai_detect:fill_deadlines:${DETECT_VERSION}`

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

// Strip HTML tags and collapse whitespace to get readable plain text
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

// Fetch a URL with a timeout — returns plain text or null on failure
async function fetchPageText(url: string, timeoutMs = 10000): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GrantTracker/1.0)' },
    })
    clearTimeout(timer)
    if (!resp.ok) return null
    const html = await resp.text()
    return stripHtml(html).slice(0, 3000) // cap to keep Claude prompt small
  } catch {
    return null
  }
}

// ── POST: fill batch (scrapes live URLs) ────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body   = await req.json() as { offset?: number; limit?: number }
  const offset = body.offset ?? 0
  const limit  = Math.min(body.limit ?? 5, 5)  // small batches — each needs a URL fetch

  const db = getAdminClient()

  const { data: grants, error } = await db
    .from('scraped_grants')
    .select('id, title, funder, description, deadline, is_rolling, apply_url')
    .eq('is_active', true)
    .eq('is_rolling', false)
    .is('deadline', null)
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!grants || grants.length === 0) return NextResponse.json({ processed: 0, updated: 0, noDate: 0, fetchFailed: 0, done: true })

  const today  = new Date().toISOString().split('T')[0]
  const apiKey = process.env.ANTHROPIC_API_KEY!

  // Fetch each grant's page in parallel
  const pageTexts = await Promise.all(
    grants.map(g => g.apply_url ? fetchPageText(g.apply_url) : Promise.resolve(null))
  )

  // Build input — use live page text where available, fall back to description
  const inputData = grants.map((g, i) => ({
    id:       g.id,
    title:    g.title ?? '',
    funder:   g.funder ?? '',
    content:  pageTexts[i] ?? (g.description ?? '').slice(0, 600),
    source:   pageTexts[i] ? 'live_page' : 'description_only',
  }))

  const prompt = `You are extracting application deadline dates from UK grant pages. Today's date is ${today}.

For each grant, read the content (either a live webpage or a short description).
Extract the next upcoming application deadline if one is explicitly stated.

Rules (STRICT):
- Only return a date EXPLICITLY mentioned in the content
- Do NOT infer, guess, or assume dates
- If a date has already passed (before ${today}), return null
- If multiple deadlines exist (rolling rounds), return the next upcoming one
- Format: YYYY-MM-DD
- If no date is found, return null

Return ONLY a JSON array — no markdown, no explanation:
[
  {
    "id": "<copy id exactly>",
    "deadline": "YYYY-MM-DD" | null,
    "reason": "<what date you found and where, or why null>"
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
        max_tokens: 1024,
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

  let updated    = 0
  let noDate     = 0
  const fetchFailed = pageTexts.filter(t => t === null).length

  for (const r of results) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    const found = r.deadline && dateRegex.test(r.deadline) && r.deadline >= today

    // No-date branch is explicit (not a skip) so the merger can record
    // "fill_deadlines tried and found nothing" as provenance — closes the
    // detect-only-adds anti-pattern for future filters that re-evaluate
    // rows with existing deadlines.
    const fields: Record<string, unknown> = found
      ? { deadline: r.deadline, is_rolling: false }
      : { deadline: null }

    try {
      await mergeGrantUpdate({
        id:     r.id,
        fields,
        source: PROVENANCE_SOURCE,
        pinned: false,
        db,
      })
      if (found) updated++
      else       noDate++
    } catch (err) {
      console.error('[fill-deadlines] write failed:', err)
      noDate++
    }
  }

  const done = grants.length < limit

  return NextResponse.json({
    processed:  grants.length,
    updated,
    noDate,
    fetchFailed,
    nextOffset: offset + grants.length,
    done,
    results: results.map((r, i) => ({
      title:  grants[i]?.title ?? '',
      source: inputData[i]?.source,
      deadline: r.deadline,
      reason: r.reason,
    })),
  })
}

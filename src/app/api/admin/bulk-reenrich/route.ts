// Admin-only endpoint: bulk re-enriches grants by re-running the same logic
// as /api/admin/enrich-grant against a list of grant IDs (or a default
// filter that targets every row whose brief came back as knowledge_fallback).
// Useful after fixing fetch-layer bugs (e.g. Brotli decode) so we can
// retry every row that fell through to fallback in one click.
//
// POST /api/admin/bulk-reenrich
// Body: { grantIds?: string[], onlyKnowledgeFallback?: boolean, limit?: number }
// Auth: ADMIN_SECRET bearer token or admin session

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { syncLocationFields } from '@/lib/funder-brief'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

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

// Mirror of enrich-grant's fetchPageText — kept here so this route can run
// independently. Brotli intentionally excluded from Accept-Encoding (Node
// fetch doesn't auto-decompress 'br').
async function fetchPageText(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1',
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
      .slice(0, 12000)
  } finally { clearTimeout(timeout) }
}

interface RowResult {
  id: string
  funder: string
  outcome: 'enriched' | 'fallback' | 'skipped' | 'error'
  source: 'live_fetch' | 'knowledge_fallback' | null
  reason: string
}

export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as {
    grantIds?: string[]
    onlyKnowledgeFallback?: boolean
    limit?: number
  }

  const supabase = getAdminClient()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  // Resolve target grant set
  let query = supabase
    .from('scraped_grants')
    .select('id, title, funder, apply_url, description, eligibility_criteria, funder_brief')
    .not('apply_url', 'is', null)

  if (body.grantIds && body.grantIds.length > 0) {
    query = query.in('id', body.grantIds)
  } else if (body.onlyKnowledgeFallback ?? true) {
    query = query.eq('funder_brief->>source', 'knowledge_fallback')
  }
  query = query.limit(body.limit ?? 50)

  const { data: grants, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!grants || grants.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, results: [] })
  }

  const results: RowResult[] = []

  for (const g of grants) {
    let fetched = ''
    let primaryFetchOk = false
    let fetchError: string | null = null

    try {
      fetched = await fetchPageText(g.apply_url as string)
      if (fetched.length >= 200) primaryFetchOk = true
      else fetchError = `short fetch (${fetched.length} chars)`
    } catch (e) {
      fetchError = e instanceof Error ? e.message : String(e)
    }

    if (!primaryFetchOk) {
      // Skip — leave existing brief untouched (avoid wasting API calls
      // on rows that will just produce another knowledge_fallback)
      results.push({
        id: g.id as string,
        funder: g.funder as string,
        outcome: 'skipped',
        source: null,
        reason: `fetch failed: ${fetchError}`,
      })
      continue
    }

    const prompt = `You are writing a funder intelligence brief for a UK charity/CIC grant tracker. Content was fetched live from the funder's website.

Grant title: ${g.title}
Funder: ${g.funder}

Primary source (${g.apply_url}):
---
${fetched}
---

Write a structured "funder brief" as JSON. Rules:
- Write directly for a grant-seeker — practical, plain English, no jargon
- NEVER reference "the source", "the website", "the page", or your own uncertainty in field values
- Each field should be 1–3 sentences max
- If information is not explicitly stated, make a reasonable inference from context. Do not explain the inference — just state the conclusion naturally
- If a field is genuinely impossible to infer, use null
- The three location fields (geographic_focus, location_tag, is_local) MUST be internally consistent. If geographic_focus says "Somerset only", location_tag must be "Somerset" and is_local must be true. If geographic_focus says "UK-wide", location_tag must be "UK" and is_local must be false.

Return ONLY valid JSON in this exact shape:
{
  "what_they_fund": "...",
  "who_can_apply": "...",
  "geographic_focus": "...",
  "location_tag": "Short pill label for the geographic scope (max 30 chars). Examples: 'Somerset', 'Leeds', 'London', 'Coventry & Warwickshire', 'Scotland', 'England & Wales'. Use 'UK' for genuinely UK-wide funders. No qualifiers or parentheticals.",
  "is_local": true/false (JSON boolean). True for sub-national scope, false for UK-wide / country-wide.",
  "priorities": "...",
  "strong_application": "...",
  "exclusions": "...",
  "typical_award": "...",
  "decision_timeline": "...",
  "how_to_apply": "...",
  "funder_tips": "...",
  "last_enriched": "${new Date().toISOString().split('T')[0]}",
  "source": "live_fetch"
}`

    try {
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })
      const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON in response')
      const brief = JSON.parse(jsonMatch[0])

      // Sync structured location fields the LLM derived alongside the
      // narrative brief — closes the wiring gap that left location_tag
      // stale after enrichment.
      const updatePayload: Record<string, unknown> = { funder_brief: brief }
      syncLocationFields(brief, updatePayload)
      await supabase.from('scraped_grants').update(updatePayload).eq('id', g.id)
      results.push({
        id: g.id as string,
        funder: g.funder as string,
        outcome: 'enriched',
        source: 'live_fetch',
        reason: `${fetched.length} chars`,
      })
    } catch (e) {
      results.push({
        id: g.id as string,
        funder: g.funder as string,
        outcome: 'error',
        source: null,
        reason: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const summary = {
    processed: results.length,
    enriched: results.filter(r => r.outcome === 'enriched').length,
    skipped: results.filter(r => r.outcome === 'skipped').length,
    error: results.filter(r => r.outcome === 'error').length,
  }
  return NextResponse.json({ ok: true, ...summary, results })
}

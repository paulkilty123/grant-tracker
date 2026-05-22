// Admin-only endpoint: processes pending items in the discovery_queue.
// For each item, uses Claude to classify and enrich, then upserts into
// scraped_grants as inactive (is_active=false, needs_review=true).
//
// POST /api/admin/process-discovery-queue
// Body: { limit?: number } — default 10
// Auth: ADMIN_SECRET bearer token or authenticated admin session

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { stampNewGrant, mergeGrantUpdate } from '@/lib/grant-merge'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!
const PROVENANCE_SOURCE = 'discovery:gemini'

async function isAuthorised(req: NextRequest): Promise<boolean> {
  if (isAdminBearerToken(req.headers.get('authorization'))) return true
  const auth = await requireAdmin()
  return auth.ok
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface QueueItem {
  id: string
  funder_name: string
  title: string
  url: string
  description: string | null
  deadline: string | null
  amount_range: string | null
  eligibility_snippet: string | null
  funding_type: string | null
  query: string | null
}

interface EnrichedGrant {
  impact_sectors: string[]
  funder_type: string
  is_local: boolean
  geo_scope: string[]
  eligible_structures: string[]
  funding_type: string
  amount_min: number | null
  amount_max: number | null
  deadline: string | null
  is_rolling: boolean
  summary: string
}

const IMPACT_SECTORS = [
  'arts_culture', 'children_families', 'community_development', 'disability',
  'education_training', 'environment_conservation', 'health_wellbeing',
  'heritage', 'homelessness_housing', 'human_rights_equality', 'mental_health',
  'older_people', 'poverty_financial_inclusion', 'social_enterprise_support',
  'sport_recreation', 'wildlife_biodiversity', 'women_girls', 'young_people',
  'faith_communities',
]

const FUNDER_TYPES = [
  'trust_foundation', 'community_foundation', 'corporate_foundation',
  'capacity_builder', 'corporate', 'government', 'lottery',
  'housing_association', 'local_authority', 'competition', 'loan',
  'crowdfund_match', 'other',
]

async function enrichQueueItem(item: QueueItem): Promise<EnrichedGrant | null> {
  const prompt = `You are a UK grant database assistant. Classify and enrich this funding opportunity.

Title: ${item.title}
Funder: ${item.funder_name}
Description: ${item.description ?? 'Not provided'}
Eligibility: ${item.eligibility_snippet ?? 'Not provided'}
Amount: ${item.amount_range ?? 'Unknown'}
Deadline: ${item.deadline ?? 'Unknown'}
Funding type hint: ${item.funding_type ?? 'Unknown'}

Return a single JSON object (no markdown) with exactly these fields:
- impact_sectors: array of 1–4 values from: ${IMPACT_SECTORS.join(', ')}
- funder_type: one of: ${FUNDER_TYPES.join(', ')}
- is_local: boolean — true only if clearly restricted to one UK region/city/borough
- geo_scope: array of strings — geographic areas this covers, e.g. ["London", "UK-wide"] or ["South East England"]
- eligible_structures: array of any of: charity, cic, social_enterprise, school, nhs, local_authority, university, individual, other
- funding_type: one of: grant, programme, investment, in_kind, blended_finance. "grant"=cash award with no return; "programme"=accelerator/fellowship/cohort support/capacity building; "investment"=loans/equity/social investment expecting return; "in_kind"=non-cash (pro bono, software donations, volunteer matching, free workspace); "blended_finance"=mix of grant + investment. Be decisive — do NOT default to "grant" unless it's clearly a cash grant.
- amount_min: integer in GBP or null
- amount_max: integer in GBP or null
- deadline: YYYY-MM-DD string or null
- is_rolling: boolean — true if rolling/ongoing applications
- summary: 2-sentence plain English summary suitable for charity users (what it funds + who can apply)`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20_000),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error(`[process-queue] Claude error for "${item.title}":`, err)
      return null
    }

    const data = await res.json() as { content: Array<{ type: string; text: string }> }
    const text = data.content?.[0]?.text ?? ''
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    return JSON.parse(cleaned) as EnrichedGrant
  } catch (e) {
    console.error(`[process-queue] Failed to enrich "${item.title}":`, e)
    return null
  }
}

function parseAmountRange(range: string | null): { min: number | null; max: number | null } {
  if (!range) return { min: null, max: null }
  const nums = Array.from(range.matchAll(/[\d,]+/g)).map(m => parseInt(m[0].replace(/,/g, ''), 10))
  if (nums.length === 0) return { min: null, max: null }
  if (nums.length === 1) return { min: nums[0], max: nums[0] }
  return { min: Math.min(...nums), max: Math.max(...nums) }
}

export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { limit = 10 } = await req.json() as { limit?: number }
  const db = getAdminClient()

  // Fetch pending items
  const { data: pendingItems, error: fetchErr } = await db
    .from('discovery_queue')
    .select('*')
    .eq('status', 'pending')
    .order('discovered_at', { ascending: true })
    .limit(limit)

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  if (!pendingItems?.length) {
    return NextResponse.json({ ok: true, processed: 0, message: 'No pending items' })
  }

  // Get existing grant URLs/titles to deduplicate before inserting
  const { data: existingGrants } = await db
    .from('scraped_grants')
    .select('apply_url, title')
    .limit(3000)
  const existingUrls = new Set((existingGrants ?? []).map(g => (g.apply_url ?? '').toLowerCase().trim()))
  const existingTitles = new Set((existingGrants ?? []).map(g => (g.title ?? '').toLowerCase().trim()))

  const results: { id: string; title: string; status: 'imported' | 'duplicate' | 'failed'; reason?: string }[] = []

  for (const item of pendingItems as QueueItem[]) {
    const urlLower = (item.url ?? '').toLowerCase().trim()
    const titleLower = (item.title ?? '').toLowerCase().trim()

    // Check for duplicates in scraped_grants
    if (existingUrls.has(urlLower)) {
      await db.from('discovery_queue').update({ status: 'duplicate', duplicate_of: item.url, processed_at: new Date().toISOString() }).eq('id', item.id)
      results.push({ id: item.id, title: item.title, status: 'duplicate', reason: 'URL already in catalogue' })
      continue
    }
    if (existingTitles.has(titleLower)) {
      await db.from('discovery_queue').update({ status: 'duplicate', processed_at: new Date().toISOString() }).eq('id', item.id)
      results.push({ id: item.id, title: item.title, status: 'duplicate', reason: 'Title already in catalogue' })
      continue
    }

    // Enrich via Claude
    const enriched = await enrichQueueItem(item)

    if (!enriched) {
      await db.from('discovery_queue').update({ status: 'pending', notes: 'Enrichment failed — will retry' }).eq('id', item.id)
      results.push({ id: item.id, title: item.title, status: 'failed', reason: 'Claude enrichment failed' })
      continue
    }

    // Fall back to raw amount_range parsing if Claude didn't parse amounts
    const amounts = enriched.amount_min || enriched.amount_max
      ? { min: enriched.amount_min, max: enriched.amount_max }
      : parseAmountRange(item.amount_range)

    const externalId = `discovery-${titleLower.replace(/[^a-z0-9]+/g, '-').slice(0, 80)}`

    const grantRow = {
      external_id: externalId,
      source: 'discovery_queue',
      title: item.title.trim(),
      funder: item.funder_name.trim() || 'Unknown',
      funder_type: enriched.funder_type || 'other',
      funding_type: enriched.funding_type || item.funding_type || 'grant',
      description: enriched.summary || item.description || null,
      amount_min: amounts.min,
      amount_max: amounts.max,
      deadline: enriched.deadline || null,
      is_rolling: enriched.is_rolling ?? false,
      is_local: enriched.is_local ?? false,
      sectors: enriched.impact_sectors ?? [],
      impact_sectors: enriched.impact_sectors ?? [],
      eligibility_criteria: enriched.eligible_structures ?? [],
      apply_url: item.url.trim(),
      is_active: false, // Requires admin review before going live
      url_status: 'unchecked',
      raw_data: {
        discovery_queue_id: item.id,
        original_description: item.description,
        eligibility_snippet: item.eligibility_snippet,
        geo_scope: enriched.geo_scope,
        search_query: item.query,
      },
    }

    // Look up existing row by external_id to decide insert-vs-merge.
    const { data: existingRow } = await db
      .from('scraped_grants')
      .select('id')
      .eq('external_id', externalId)
      .maybeSingle()

    let writeErr: Error | null = null
    if (existingRow) {
      // Same external_id seen before — route through merger so admin pins hold.
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { external_id: _drop, ...patch } = grantRow
        await mergeGrantUpdate({
          id: existingRow.id as string,
          fields: patch,
          source: PROVENANCE_SOURCE,
          pinned: false,
          db,
        })
      } catch (e) {
        writeErr = e instanceof Error ? e : new Error(String(e))
      }
    } else {
      // New row — stamp provenance and insert.
      const stamped = stampNewGrant(grantRow, PROVENANCE_SOURCE, { pinned: false })
      const { error: insertErr } = await db.from('scraped_grants').insert(stamped)
      if (insertErr) writeErr = new Error(insertErr.message)
    }

    if (writeErr) {
      await db.from('discovery_queue').update({ status: 'pending', notes: `Write error: ${writeErr.message}` }).eq('id', item.id)
      results.push({ id: item.id, title: item.title, status: 'failed', reason: writeErr.message })
      continue
    }

    // Mark queue item as processed
    await db.from('discovery_queue').update({ status: 'processed', processed_at: new Date().toISOString() }).eq('id', item.id)
    existingUrls.add(urlLower)
    existingTitles.add(titleLower)
    results.push({ id: item.id, title: item.title, status: 'imported' })
  }

  const imported = results.filter(r => r.status === 'imported').length
  const duplicates = results.filter(r => r.status === 'duplicate').length
  const failed = results.filter(r => r.status === 'failed').length

  return NextResponse.json({ ok: true, processed: results.length, imported, duplicates, failed, results })
}

// GET — return queue stats
export async function GET(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const db = getAdminClient()

  const { data, error } = await db
    .from('discovery_queue')
    .select('status, funding_type, source')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const counts = (data ?? []).reduce((acc, item) => {
    const s = item.status as string
    acc[s] = (acc[s] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const byType = (data ?? []).reduce((acc, item) => {
    const t = item.funding_type as string ?? 'unknown'
    acc[t] = (acc[t] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return NextResponse.json({
    total: (data ?? []).length,
    pending: counts.pending ?? 0,
    processed: counts.processed ?? 0,
    duplicate: counts.duplicate ?? 0,
    rejected: counts.rejected ?? 0,
    byType,
  })
}

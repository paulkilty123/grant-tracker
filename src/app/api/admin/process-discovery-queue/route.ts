// Admin-only endpoint: processes pending items in the discovery_queue.
// For each item, uses Claude to classify and enrich, then upserts into
// scraped_grants as inactive (is_active=false, needs_review=true).
//
// POST /api/admin/process-discovery-queue
// Body: { limit?: number } — default 10
// Auth: ADMIN_SECRET bearer token or authenticated admin session

import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { stampNewGrant, mergeGrantUpdate } from '@/lib/grant-merge'
import { VALID_SECTORS } from '@/lib/classify'
import { recordRun, type UsageTally, type RunYield } from '@/lib/admin/cron-runs'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!
const PROVENANCE_SOURCE = 'discovery:gemini'

async function isAuthorised(req: NextRequest): Promise<boolean> {
  const header = req.headers.get('authorization')
  // Checked explicitly. ADMIN_SECRET and CRON_SECRET currently hold the same
  // value, so relying on isAdminBearerToken to let the cron through would work
  // by coincidence and break the day they are rotated apart.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && header === `Bearer ${cronSecret}`) return true
  if (isAdminBearerToken(header)) return true
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

// The catalogue's ONE sector taxonomy, imported rather than restated.
//
// This route used to carry its own 19-value list — arts_culture,
// community_development, social_enterprise_support, poverty_financial_inclusion
// and so on — which overlapped VALID_SECTORS on only three values. Everything
// else it wrote was a string the matcher cannot read, so the row matched nobody
// on sector while looking perfectly well-tagged in the admin UI.
//
// Found 2026-07-26: 34 such values across 11 rows, 10 of them tagged ENTIRELY
// in the foreign vocabulary. None had reached users yet only because the rows
// sit unpublished behind the review gate. The weekly cron would have kept
// producing them.
const IMPACT_SECTORS = Array.from(VALID_SECTORS)

const FUNDER_TYPES = [
  'trust_foundation', 'community_foundation', 'corporate_foundation',
  'capacity_builder', 'corporate', 'government', 'lottery',
  'housing_association', 'local_authority', 'competition', 'loan',
  'crowdfund_match', 'other',
]

type EnrichOutcome = { ok: true; data: EnrichedGrant } | { ok: false; reason: string }

const ENRICH_MODEL = 'claude-haiku-4-5-20251001'

async function enrichQueueItem(item: QueueItem, usage?: UsageTally): Promise<EnrichOutcome> {
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
        model: ENRICH_MODEL,
        // Was 1000 for an eleven-field answer, with stop_reason never checked.
        // A truncated reply fails JSON.parse, the item is dropped, and the run
        // reports success — the same silent-failure shape found four other
        // places in this codebase today.
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20_000),
    })

    if (!res.ok) {
      const err = (await res.text()).slice(0, 200)
      console.error(`[process-queue] Claude error for "${item.title}":`, err)
      return { ok: false, reason: `Claude HTTP ${res.status}: ${err}` }
    }

    const data = await res.json() as {
      content: Array<{ type: string; text: string }>
      stop_reason?: string
      usage?: { input_tokens?: number; output_tokens?: number }
    }

    // Count the tokens before judging the answer — a truncated reply was still
    // paid for, and a run whose cost is invisible is a run nobody can size.
    usage?.add(ENRICH_MODEL, data.usage)

    // A cut-off answer is not a small answer. Say so, rather than letting
    // JSON.parse fail into a generic "enrichment failed".
    if (data.stop_reason === 'max_tokens') {
      return { ok: false, reason: 'Answer hit max_tokens before it finished — raise max_tokens' }
    }

    const text = data.content?.[0]?.text ?? ''
    if (!text.trim()) return { ok: false, reason: 'Claude returned no text' }

    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    try {
      return { ok: true, data: JSON.parse(cleaned) as EnrichedGrant }
    } catch {
      return { ok: false, reason: `Could not parse the reply as JSON: ${cleaned.slice(0, 120)}` }
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    console.error(`[process-queue] Failed to enrich "${item.title}":`, reason)
    return { ok: false, reason }
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
  const { limit = 10 } = await req.json().catch(() => ({})) as { limit?: number }

  // Recorded, exactly like the scheduled path. A manual drain imports real rows
  // and spends real tokens, and leaving it out of cron_runs made the Pipeline
  // page quietly wrong: a morning where the button was pressed and the cron was
  // not looked identical to a morning where nothing happened at all. The job
  // name is shared with the GET path on purpose, so the page shows the latest
  // drain whichever triggered it.
  let status = 200
  const body = await recordRun('process-discovery-queue', async (ctx) => {
    const r = await runProcessing(getAdminClient(), limit, ctx.usage)
    status = r.status
    return r.body
  })
  return NextResponse.json(body, { status })
}

/**
 * Process up to `limit` pending queue items.
 *
 * Shared by the manual POST and the scheduled GET so the two cannot drift —
 * a scheduled path that behaved differently from the button is exactly how the
 * April run half-finished without anyone noticing.
 *
 * Returns the response body and its status rather than a NextResponse, because
 * the scheduled path has to hand that body to recordRun() as the run summary
 * before it becomes a response.
 */
async function runProcessing(
  db: SupabaseClient,
  limit: number,
  usage?: UsageTally,
): Promise<{ status: number; body: Record<string, unknown> }> {
  // Fetch pending items
  const { data: pendingItems, error: fetchErr } = await db
    .from('discovery_queue')
    .select('*')
    .eq('status', 'pending')
    .order('discovered_at', { ascending: true })
    .limit(limit)

  if (fetchErr) {
    return { status: 500, body: { error: fetchErr.message } }
  }

  if (!pendingItems?.length) {
    return { status: 200, body: { ok: true, processed: 0, message: 'No pending items' } }
  }

  // Get existing grant URLs/titles to deduplicate before inserting
  const { data: existingGrants } = await db
    .from('scraped_grants')
    .select('apply_url, title')
    .limit(3000)
  const existingUrls = new Set((existingGrants ?? []).map((g: { apply_url?: string | null }) => (g.apply_url ?? '').toLowerCase().trim()))
  const existingTitles = new Set((existingGrants ?? []).map((g: { title?: string | null }) => (g.title ?? '').toLowerCase().trim()))

  const results: { id: string; title: string; status: 'imported' | 'duplicate' | 'failed'; reason?: string; funding_type?: string | null }[] = []

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
    const outcome = await enrichQueueItem(item, usage)

    if (!outcome.ok) {
      // Record WHY on the queue row, not just "failed". Left pending so it
      // retries, but with the reason visible — an item that fails the same way
      // every week should be findable, not silently re-attempted forever.
      await db.from('discovery_queue')
        .update({ status: 'pending', notes: `Enrichment failed ${new Date().toISOString().slice(0, 10)}: ${outcome.reason}`.slice(0, 500) })
        .eq('id', item.id)
      results.push({ id: item.id, title: item.title, status: 'failed', reason: outcome.reason })
      continue
    }
    const enriched = outcome.data

    // Fall back to raw amount_range parsing if Claude didn't parse amounts
    const amounts = enriched.amount_min || enriched.amount_max
      ? { min: enriched.amount_min, max: enriched.amount_max }
      : parseAmountRange(item.amount_range)

    const validSectors = (enriched.impact_sectors ?? []).filter(s => VALID_SECTORS.has(s))

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
      // Validate rather than trust. The prompt now lists the real taxonomy, but
      // a model that invents a plausible-looking value must not get it into the
      // column — an unreadable tag is worse than a missing one, because the row
      // looks tagged and silently matches nobody.
      sectors: validSectors,
      impact_sectors: validSectors,
      // NOTE: this is eligibility_criteria (free-text bullets), NOT
      // eligible_structures. Deliberate: the model is answering with a third
      // vocabulary again (charity, cic, school, nhs...) which is neither
      // VALID_STRUCTURES nor anything the matcher reads. Deriving legal forms is
      // the classifier's job and it runs over these rows after review, so this
      // stays as human-readable context rather than being cast to a column that
      // would then block the classifier's own answer via the trust ladder.
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
    results.push({ id: item.id, title: item.title, status: 'imported', funding_type: grantRow.funding_type })
  }

  const imported = results.filter(r => r.status === 'imported').length
  const duplicates = results.filter(r => r.status === 'duplicate').length
  const failed = results.filter(r => r.status === 'failed').length

  // ── Yield, the declared shape the Pipeline page renders ───────────────────
  //
  // `found` is this run's imports by the funding type the row actually landed
  // with. inReview and published are the cumulative state of everything the
  // discovery path has ever produced, because a run cannot know the fate of its
  // own rows — they take days to be enriched, gated and published.
  //
  // One extra read, not one per row: the whole discovery cohort is a few dozen
  // rows, so a single select and a tally in JS beats a grouped query round trip.
  // A failure here must not fail the run, because this is bookkeeping about work
  // that has already succeeded — the same rule recordRun applies to itself.
  const found: Record<string, number> = {}
  for (const r of results) {
    if (r.status !== 'imported') continue
    const t = (r as { funding_type?: string | null }).funding_type ?? 'unknown'
    found[t] = (found[t] ?? 0) + 1
  }

  const runYield: RunYield = { found }
  try {
    const { data: cohort } = await db
      .from('scraped_grants')
      .select('funding_type, is_active, pipeline_state')
      .eq('source', 'discovery_queue')

    if (cohort) {
      const inReview: Record<string, number> = {}
      const published: Record<string, number> = {}
      for (const row of cohort as Array<{ funding_type: string | null; is_active: boolean | null; pipeline_state: string | null }>) {
        const t = row.funding_type ?? 'unknown'
        if (row.is_active) published[t] = (published[t] ?? 0) + 1
        else if (['captured', 'enriched', 'tagged', 'tagged_awaiting_review'].includes(row.pipeline_state ?? '')) {
          inReview[t] = (inReview[t] ?? 0) + 1
        }
      }
      runYield.inReview = inReview
      runYield.published = published
    }
  } catch (e) {
    console.error('[process-discovery-queue] yield snapshot failed:', e)
  }

  return { status: 200, body: { ok: true, processed: results.length, imported, duplicates, failed, yield: runYield, results } }
}

// GET — return queue stats
/**
 * GET serves two jobs, chosen by ?run=true.
 *
 * Without it: queue stats, which is what this endpoint has always returned.
 * With it: process the queue — this is the scheduled path, because Vercel crons
 * issue GET and the work already lived in POST.
 *
 * Scheduled runs additionally need PROCESS_DISCOVERY_ENABLED=true, so wiring
 * the schedule and letting it write are two separate decisions, matching the
 * publish gate and the discovery sweep.
 */
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('run') === 'true') {
    if (!await isAuthorised(req)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    let httpStatus = 200
    const payload = await recordRun('process-discovery-queue', async (ctx) => {
      if (process.env.PROCESS_DISCOVERY_ENABLED !== 'true') {
        return {
          ok: true, skipped: true,
          reason: 'Not armed. Set PROCESS_DISCOVERY_ENABLED=true to let the scheduled run write.',
        } as Record<string, unknown>
      }
      const run = await runProcessing(getAdminClient(), 10, ctx.usage)
      httpStatus = run.status
      return run.body
    })
    return NextResponse.json(payload, { status: httpStatus })
  }
  return statsResponse(req)
}

async function statsResponse(req: NextRequest) {
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

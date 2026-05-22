// Admin-only endpoint: AI classification pass for scraped_grants
// Reads unclassified active grants, calls Claude Haiku to assign:
//   - impact_sectors[]      (1–4 from the 12-sector taxonomy)
//   - funding_type          (one of 7 types)
//   - eligible_structures[] (explicit legal structures if stated)
//
// GET  /api/admin/classify-grants          — return current stats
// POST /api/admin/classify-grants          — classify a batch
//   Body: { offset?: number; limit?: number; force?: boolean; loop?: boolean }
//   loop=true  → run batches until done or ~270s (then return progress).
//                Use this to clear a backlog in one request.
//   Returns: { classified, failed, total, done, nextOffset }
//
// Auth: ADMIN_SECRET bearer token or authenticated admin session

import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { classifyBatch, validate, type GrantInput } from '@/lib/classify'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { mergeGrantUpdate } from '@/lib/grant-merge'

// Bump when the classifier prompt changes materially (in `src/lib/classify.ts`).
// Stamped on every field this route writes via the provenance merger.
const CLASSIFIER_VERSION = 'v1'
const PROVENANCE_SOURCE  = `ai_classifier:${CLASSIFIER_VERSION}`

// Single classify pass — fetches `limit` unclassified rows, runs Claude, writes
// updates. Returns `done: true` when no rows remained (last page).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function classifyOnce(supabase: SupabaseClient<any>, limit: number): Promise<{ classified: number; failed: number; done: boolean }> {
  const { data: grantsRaw, error } = await supabase
    .from('scraped_grants')
    .select('id, title, funder, description, impact_sectors, funder_brief')
    .eq('is_active', true)
    .or('impact_sectors.is.null,impact_sectors.eq.{}')
    .order('id')
    .limit(limit)

  if (error || !grantsRaw || grantsRaw.length === 0) {
    return { classified: 0, failed: 0, done: true }
  }

  let classified = 0
  let failed     = 0
  try {
    const enrichedBatch = grantsRaw.map((g: Record<string, unknown>) => {
      const fb = g.funder_brief as Record<string, unknown> | null
      return {
        ...g,
        what_they_fund: typeof fb?.what_they_fund === 'string' ? fb.what_they_fund : undefined,
        priorities:     typeof fb?.priorities     === 'string' ? fb.priorities     : undefined,
      }
    })
    const results = await classifyBatch(enrichedBatch as GrantInput[])
    const byId: Record<string, ReturnType<typeof validate>> = {}
    for (const r of results) {
      if (r?.id) byId[r.id] = validate(r)
    }
    const updates = grantsRaw
      .filter(g => byId[g.id])
      .map(g => {
        const r = byId[g.id]
        const patch: Record<string, unknown> = {
          impact_sectors: r.impact_sectors,
          funding_type:   r.funding_type,
          niche_tags:     r.niche_tags,
        }
        if (r.eligible_structures.length > 0)   patch.eligible_structures = r.eligible_structures
        if (r.target_beneficiaries.length > 0)  patch.target_beneficiaries = r.target_beneficiaries
        return mergeGrantUpdate({ id: g.id, fields: patch, source: PROVENANCE_SOURCE, pinned: false, db: supabase })
          .then(() => ({ ok: true as const }))
          .catch(err => { console.error('[classify-grants/loop] write failed:', err); return { ok: false as const } })
      })
    const updateResults = await Promise.all(updates)
    const writeErrors   = updateResults.filter(r => !r.ok)
    classified = grantsRaw.length - writeErrors.length
    failed     = writeErrors.length
  } catch (err) {
    console.error('[classify-grants] Batch failed:', err)
    failed = grantsRaw.length
  }

  // done when fewer rows than requested (last page of unclassified)
  return { classified, failed, done: grantsRaw.length < limit }
}

export const dynamic = 'force-dynamic'
export const maxDuration = 300  // 5 minutes — batches of 20 × Claude calls

// ── Auth ──────────────────────────────────────────────────────────────────────
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

// ── GET — return classification stats ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!await isAuthorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('scraped_grants')
    .select('impact_sectors, funding_type')
    .eq('is_active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const total       = data.length
  const classified  = data.filter(g => Array.isArray(g.impact_sectors) && g.impact_sectors.length > 0).length
  const unclassified = total - classified
  const defaultType = data.filter(g => g.funding_type === 'grant' || !g.funding_type).length

  return NextResponse.json({ total, classified, unclassified, defaultType })
}

// ── POST — classify a batch of grants ─────────────────────────────────────────
// Body options:
//   offset?, limit?, force?, loop?, nicheOnly?  — existing flags
//   grant_ids?: string[]      — explicit ID list (overrides force/normal mode);
//                               classifies exactly these IDs regardless of
//                               current tag state. Used for targeted re-runs.
//   include_review?: boolean  — when true, also pulls is_active=false rows in
//                               the Needs Review queue. Default false (existing
//                               behaviour: active-only).
//   shallow_only?: boolean    — server-side selector: re-classifies grants
//                               with <=1 impact_sector OR <=1 target_beneficiary.
//                               Skips the ID-list paste entirely. Combine with
//                               include_review for the full back-catalogue pass.
export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    offset?: number;
    limit?: number;
    force?: boolean;
    nicheOnly?: boolean;
    loop?: boolean;
    grant_ids?: string[];        // Explicit ID list — re-classifies these regardless of current tag state
    include_review?: boolean;    // When using grant_ids OR force, also pull is_active=false rows in Needs Review queue
    shallow_only?: boolean;      // Server-side filter for shallow-tagged grants — see above
  }
  const offset       = body.offset ?? 0
  const limit        = body.limit  ?? 20  // 20 grants = 1 Claude call
  const force        = body.force  ?? false
  const loop         = body.loop   ?? false
  const grantIds     = Array.isArray(body.grant_ids) ? body.grant_ids.filter(s => typeof s === 'string') : []
  const includeReview = body.include_review ?? false
  const shallowOnly   = body.shallow_only ?? false

  const supabase = getAdminClient()

  // Loop mode — run batches until done or close to maxDuration. Used to clear
  // a backlog in one request rather than 8 sequential POSTs.
  // Skipped when grant_ids is set (explicit ID lists are always single-batch).
  if (loop && !force && !body.nicheOnly && grantIds.length === 0) {
    const startedAt = Date.now()
    const SOFT_TIMEOUT_MS = 270_000  // 270s — leaves headroom under maxDuration=300
    let totalClassified = 0
    let totalFailed     = 0
    let iterations      = 0

    while (Date.now() - startedAt < SOFT_TIMEOUT_MS) {
      const result = await classifyOnce(supabase, limit)
      iterations++
      totalClassified += result.classified
      totalFailed     += result.failed
      if (result.done) {
        return NextResponse.json({
          mode: 'loop',
          iterations,
          classified: totalClassified,
          failed:     totalFailed,
          done:       true,
          elapsedMs:  Date.now() - startedAt,
        })
      }
    }
    return NextResponse.json({
      mode: 'loop',
      iterations,
      classified: totalClassified,
      failed:     totalFailed,
      done:       false,
      elapsedMs:  Date.now() - startedAt,
      note:       'soft-timeout reached; re-run loop to continue',
    })
  }

  // ── Count total remaining (for progress reporting) ───────────────────────────
  let totalRemaining = 0
  if (!force) {
    // Count unclassified grants — both NULL and empty-array ({}) cases
    const { count } = await supabase
      .from('scraped_grants')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .or('impact_sectors.is.null,impact_sectors.eq.{}')
    totalRemaining = count ?? 0
  }

  // ── Fetch batch ──────────────────────────────────────────────────────────────
  // target_beneficiaries is read by the shallow_only post-filter; including
  // it here so the filter can correctly evaluate ≤1 on both arrays.
  let query = supabase
    .from('scraped_grants')
    .select('id, title, funder, description, impact_sectors, target_beneficiaries, funder_brief')
    .order('id')

  // Active filter: ON unless include_review explicitly requests is_active=false rows
  // (used when re-classifying the Needs Review queue in the same run).
  if (!includeReview) {
    query = query.eq('is_active', true)
  }

  if (grantIds.length > 0) {
    // Explicit ID mode: re-classify exactly this list (e.g. the 6-grant test
    // batch, or a targeted re-run on a known-shallow subset).
    query = query.in('id', grantIds)
  } else if (shallowOnly) {
    // Shallow-only mode: fetch all in-scope rows; we post-filter in JS for
    // array_length(impact_sectors) <= 1 OR array_length(target_beneficiaries) <= 1.
    // PostgREST doesn't expose array_length operators cleanly, and the dataset
    // is small enough (~600 active + 90 review) to filter client-side.
    // Exclude dead URLs and grants explicitly parked (saved_for_later) so we
    // don't waste Claude tokens re-classifying rows that aren't surfaced.
    query = query
      .neq('url_status', 'dead')
      .not('saved_for_later', 'is', true)
      .limit(1000)
  } else if (force) {
    // Force mode: paginate through ALL grants using offset
    query = query.range(offset, offset + limit - 1)
  } else if (body.nicheOnly) {
    // Niche-only mode: re-classify grants that have sectors but are missing niche_tags
    query = query.or('niche_tags.is.null,niche_tags.eq.{}').not('impact_sectors', 'is', null).limit(limit)
  } else {
    // Normal mode: fetch first N unclassified grants.
    // Catches both NULL and empty-array ({}) — both mean "not yet classified".
    query = query.or('impact_sectors.is.null,impact_sectors.eq.{}').limit(limit)
  }

  const { data: grantsRaw, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!grantsRaw || grantsRaw.length === 0) {
    return NextResponse.json({ classified: 0, failed: 0, total: 0, done: true, nextOffset: offset })
  }

  // Post-filter for shallow_only mode (PostgREST can't express array_length).
  // A grant is "shallow" if either sectors or beneficiaries has <=1 entry.
  const grants = shallowOnly
    ? grantsRaw.filter((g: Record<string, unknown>) => {
        const s = Array.isArray(g.impact_sectors)       ? g.impact_sectors.length       : 0
        const b = Array.isArray(g.target_beneficiaries) ? g.target_beneficiaries.length : 0
        return s <= 1 || b <= 1
      })
    : grantsRaw

  let classified = 0
  let failed = 0
  let budgetExceeded = false

  // Time budget: return gracefully before Vercel kills the function at 300s.
  // The new (longer) classifier prompt pushes each chunk to ~20-30s — fewer
  // chunks fit per invocation than the old prompt allowed. Stop accepting
  // new chunks at 240s so the response body actually gets sent.
  const startedAt = Date.now()
  const TIME_BUDGET_MS = 240_000

  // Chunk into sub-batches sized at `limit` (default 20). Smaller chunks mean
  // faster individual Claude calls and finer-grained progress under the time
  // budget. Cap at 15 since the new prompt is expensive per row.
  const CHUNK_SIZE = Math.max(1, Math.min(limit, 15))
  for (let i = 0; i < grants.length; i += CHUNK_SIZE) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      budgetExceeded = true
      break
    }
    const chunk = grants.slice(i, i + CHUNK_SIZE)
    if (chunk.length === 0) break
    try {
      // Derive optional what_they_fund + priorities from funder_brief so the
      // classifier can use the curated brief content as primary signal.
      const enrichedBatch = chunk.map((g: Record<string, unknown>) => {
        const fb = g.funder_brief as Record<string, unknown> | null
        return {
          ...g,
          what_they_fund: typeof fb?.what_they_fund === 'string' ? fb.what_they_fund : undefined,
          priorities:     typeof fb?.priorities     === 'string' ? fb.priorities     : undefined,
        }
      })
      const results = await classifyBatch(enrichedBatch as GrantInput[])

      // Map id → validated classification
      const byId: Record<string, ReturnType<typeof validate>> = {}
      for (const r of results) {
        if (r?.id) byId[r.id] = validate(r)
      }

      // Write to Supabase in parallel — through the merger so provenance is stamped.
      const updates = chunk
        .filter(g => byId[g.id])
        .map(g => {
          const r = byId[g.id]
          const patch: Record<string, unknown> = {
            impact_sectors: r.impact_sectors,
            funding_type:   r.funding_type,
            niche_tags:     r.niche_tags,
          }
          // Explicit ID mode is a re-classify pass — the caller wants the new
          // value to take precedence even when it's []. Normal mode preserves
          // existing values when Claude returns no structures (treat empty as
          // "no signal" rather than "I confirm none").
          if (grantIds.length > 0 || r.eligible_structures.length > 0) {
            patch.eligible_structures = r.eligible_structures
          }
          if (grantIds.length > 0 || r.target_beneficiaries.length > 0) {
            patch.target_beneficiaries = r.target_beneficiaries
          }
          return mergeGrantUpdate({ id: g.id, fields: patch, source: PROVENANCE_SOURCE, pinned: false, db: supabase })
            .then(() => ({ ok: true as const }))
            .catch(err => { console.error('[classify-grants] write failed:', err); return { ok: false as const } })
        })

      const updateResults = await Promise.all(updates)
      const writeErrors   = updateResults.filter(r => !r.ok)
      classified += chunk.length - writeErrors.length
      failed     += writeErrors.length

    } catch (err) {
      console.error('[classify-grants] Chunk failed:', err)
      failed += chunk.length
    }
  }

  // done when we got fewer rows than requested (last page) AND didn't bail
  // early on the time budget — if we bailed, the caller should re-run to
  // pick up the remaining shallow rows.
  const done = !budgetExceeded && grantsRaw.length < limit

  return NextResponse.json({
    classified,
    failed,
    skipped: 0,
    total:   force ? grantsRaw.length : totalRemaining,
    done,
    nextOffset: force ? offset + grantsRaw.length : 0,  // normal mode doesn't use offset
    budget_exceeded: budgetExceeded,
    in_scope:        grants.length,
    elapsed_ms:      Date.now() - startedAt,
  })
}

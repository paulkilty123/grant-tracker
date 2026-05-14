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
import { createClient as createServerClient } from '@/lib/supabase/server'
import { classifyBatch, validate, type GrantInput } from '@/lib/classify'

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
        return supabase.from('scraped_grants').update(patch).eq('id', g.id)
      })
    const updateResults = await Promise.all(updates)
    const writeErrors   = updateResults.filter(r => r.error)
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

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

// ── Auth ──────────────────────────────────────────────────────────────────────
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
  }
  const offset       = body.offset ?? 0
  const limit        = body.limit  ?? 20  // 20 grants = 1 Claude call
  const force        = body.force  ?? false
  const loop         = body.loop   ?? false
  const grantIds     = Array.isArray(body.grant_ids) ? body.grant_ids.filter(s => typeof s === 'string') : []
  const includeReview = body.include_review ?? false

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
  let query = supabase
    .from('scraped_grants')
    .select('id, title, funder, description, impact_sectors, funder_brief')
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

  const grants = grantsRaw

  let classified = 0
  let failed = 0

  if (grants.length > 0) {
    try {
      // Derive optional what_they_fund + priorities from funder_brief so the
      // classifier can use the curated brief content as primary signal.
      const enrichedBatch = grants.map((g: Record<string, unknown>) => {
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

      // Write to Supabase in parallel
      const updates = grants
        .filter(g => byId[g.id])
        .map(g => {
          const r = byId[g.id]
          const patch: Record<string, unknown> = {
            impact_sectors: r.impact_sectors,
            funding_type:   r.funding_type,
            niche_tags:     r.niche_tags,
          }
          if (r.eligible_structures.length > 0) {
            patch.eligible_structures = r.eligible_structures
          }
          if (r.target_beneficiaries.length > 0) {
            patch.target_beneficiaries = r.target_beneficiaries
          }
          return supabase
            .from('scraped_grants')
            .update(patch)
            .eq('id', g.id)
        })

      const updateResults = await Promise.all(updates)
      const writeErrors   = updateResults.filter(r => r.error)
      classified += grants.length - writeErrors.length
      failed     += writeErrors.length

    } catch (err) {
      console.error('[classify-grants] Batch failed:', err)
      failed += grants.length
    }
  }

  // done when we got fewer rows than requested (last page)
  const done = grantsRaw.length < limit

  return NextResponse.json({
    classified,
    failed,
    skipped: 0,
    total:   force ? grantsRaw.length : totalRemaining,
    done,
    nextOffset: force ? offset + grantsRaw.length : 0,  // normal mode doesn't use offset
  })
}

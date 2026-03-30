// Admin-only endpoint: AI classification pass for scraped_grants
// Reads unclassified active grants, calls Claude Haiku to assign:
//   - impact_sectors[]      (1–4 from the 12-sector taxonomy)
//   - funding_type          (one of 7 types)
//   - eligible_structures[] (explicit legal structures if stated)
//
// GET  /api/admin/classify-grants          — return current stats
// POST /api/admin/classify-grants          — classify a batch
//   Body: { offset?: number; limit?: number; force?: boolean }
//   Returns: { classified, failed, total, done, nextOffset }
//
// Auth: ADMIN_SECRET bearer token or authenticated admin session

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { classifyBatch, validate, type GrantInput } from '@/lib/classify'

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
// Body: { offset?: number; limit?: number; force?: boolean }
export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { offset?: number; limit?: number; force?: boolean }
  const offset = body.offset ?? 0
  const limit  = body.limit  ?? 20  // 20 grants = 1 Claude call
  const force  = body.force  ?? false

  const supabase = getAdminClient()

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
    .select('id, title, funder, description, impact_sectors')
    .eq('is_active', true)
    .order('id')

  if (force) {
    // Force mode: paginate through ALL grants using offset
    query = query.range(offset, offset + limit - 1)
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
      const results = await classifyBatch(grants as GrantInput[])

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
          }
          if (r.eligible_structures.length > 0) {
            patch.eligible_structures = r.eligible_structures
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

import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/admin/admin-db'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { mergeGrantUpdate, mergeGrantUpdateBatch } from '@/lib/grant-merge'

export const dynamic = 'force-dynamic'

type Caller = { source: string; pinned: boolean }

async function resolveCaller(req: NextRequest): Promise<Caller | null> {
  if (isAdminBearerToken(req.headers.get('authorization'))) {
    // Internal/system caller (cron, ops script). Allow optional override via
    // body.provenance_source so e.g. expire-grants can attribute as itself.
    return { source: 'system:admin_api', pinned: false }
  }
  const auth = await requireAdmin()
  if (!auth.ok) return null
  return { source: `admin:${auth.user.email}`, pinned: true }
}

function getAdminClient() {
  return getAdminDb()
}

// PATCH /api/admin/update-grant
// Body: { id: string,    fields: Record<string, unknown>, provenance_source?: string, pinned?: boolean }
//   OR: { ids: string[], fields: Record<string, unknown>, provenance_source?: string, pinned?: boolean }
//
// `provenance_source` lets system callers override the default 'system:admin_api'
// stamp (e.g. an internal route stamping itself as 'ai_audit:eligibility:v1').
// Admin (user-session) callers always stamp as 'admin:<email>' and pinned=true,
// regardless of any provenance_source in the body.
export async function PATCH(req: NextRequest) {
  const caller = await resolveCaller(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json() as {
    id?: string
    ids?: string[]
    fields: Record<string, unknown>
    provenance_source?: string
    pinned?: boolean
  }
  const { fields } = body

  if (!fields || typeof fields !== 'object') {
    return NextResponse.json({ error: 'fields is required' }, { status: 400 })
  }

  // Caller resolution: admin-session callers always win (can't be downgraded).
  // System bearer-token callers may override via provenance_source.
  const isAdminSession = caller.source.startsWith('admin:')
  const source = isAdminSession ? caller.source : (body.provenance_source ?? caller.source)
  const pinned = isAdminSession ? true : (body.pinned ?? caller.pinned)

  const db = getAdminClient()

  // Batch update
  if (Array.isArray(body.ids) && body.ids.length > 0) {
    try {
      const r = await mergeGrantUpdateBatch({ ids: body.ids, fields, source, pinned, db })
      return NextResponse.json({
        ok: true,
        updated: r.perGrant.filter(g => g.applied.length > 0).length,
        totalApplied: r.totalApplied,
        totalRejected: r.totalRejected,
        rejected: r.perGrant.filter(g => g.rejected.length > 0).map(g => ({ id: g.id, rejected: g.rejected })),
      })
    } catch (err) {
      console.error('update-grant batch error:', err)
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    }
  }

  // Single update
  if (!body.id) {
    return NextResponse.json({ error: 'id or ids is required' }, { status: 400 })
  }

  try {
    const r = await mergeGrantUpdate({ id: body.id, fields, source, pinned, db })
    return NextResponse.json({
      ok: true,
      applied: r.applied,
      rejected: r.rejected,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Match the previous 404 behaviour for missing-row errors
    if (msg.includes('no scraped_grants row for id')) {
      return NextResponse.json({
        error: `No grant found with id "${body.id}" — it may be a seed grant that hasn't been promoted yet.`,
      }, { status: 404 })
    }
    console.error('update-grant error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

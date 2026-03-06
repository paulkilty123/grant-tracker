// Admin API for managing the funder watchlist.
// All routes require the admin email — checked server-side via Supabase auth.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function assertAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.email === ADMIN_EMAIL
  } catch {
    return false
  }
}

// ── GET — return all watchlist entries + unresolved alert counts ──────────────
export async function GET() {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = serviceClient()

  const [{ data: entries }, { data: alerts }] = await Promise.all([
    supabase
      .from('funder_watchlist')
      .select('*')
      .order('region')
      .order('name'),
    supabase
      .from('watchlist_alerts')
      .select('watchlist_id, id, alert_type, detected_at, resolved')
      .eq('resolved', false)
      .order('detected_at', { ascending: false }),
  ])

  // Attach unresolved alert count + latest alert to each entry
  const alertMap = new Map<string, typeof alerts>()
  for (const a of (alerts ?? [])) {
    const list = alertMap.get(a.watchlist_id) ?? []
    list.push(a)
    alertMap.set(a.watchlist_id, list)
  }

  const enriched = (entries ?? []).map(e => ({
    ...e,
    unresolved_alerts: (alertMap.get(e.id) ?? []).length,
    latest_alert:      (alertMap.get(e.id) ?? [])[0] ?? null,
  }))

  return NextResponse.json({ entries: enriched })
}

// ── POST — add a new watchlist entry ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, listing_url, region, funder_type, notes } = body

  if (!name || !listing_url) {
    return NextResponse.json({ error: 'name and listing_url are required' }, { status: 400 })
  }

  const { data, error } = await serviceClient()
    .from('funder_watchlist')
    .insert({ name, listing_url, region: region ?? 'national', funder_type: funder_type ?? 'trust_foundation', notes: notes ?? null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entry: data })
}

// ── PATCH — update status, notes, etc. ───────────────────────────────────────
export async function PATCH(req: NextRequest) {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { id, ...updates } = body

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Whitelist updatable fields
  const allowed: Record<string, unknown> = {}
  const allowedKeys = ['status', 'notes', 'name', 'listing_url', 'region', 'funder_type']
  for (const k of allowedKeys) {
    if (k in updates) allowed[k] = updates[k]
  }

  // If URL changed, clear the fingerprint so next cron builds a fresh baseline
  if ('listing_url' in allowed) {
    allowed.last_fingerprint = null
    allowed.last_checked     = null
    allowed.last_error       = null
  }

  const { error } = await serviceClient()
    .from('funder_watchlist')
    .update(allowed)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── DELETE — remove an entry ──────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await serviceClient()
    .from('funder_watchlist')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

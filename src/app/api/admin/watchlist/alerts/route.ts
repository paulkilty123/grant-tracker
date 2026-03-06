// Returns full alert history for a watchlist entry, and allows resolving alerts.
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

// GET ?watchlist_id=xxx  — returns all alerts for an entry
export async function GET(req: NextRequest) {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const watchlistId = req.nextUrl.searchParams.get('watchlist_id')
  let query = serviceClient()
    .from('watchlist_alerts')
    .select('*')
    .order('detected_at', { ascending: false })
    .limit(50)

  if (watchlistId) query = query.eq('watchlist_id', watchlistId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ alerts: data })
}

// PATCH { id } — mark alert as resolved
export async function PATCH(req: NextRequest) {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await serviceClient()
    .from('watchlist_alerts')
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

async function isAuthorised(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.replace('Bearer ', '').trim()
  if (token && token === process.env.ADMIN_SECRET) return true
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.email === ADMIN_EMAIL
  } catch {
    return false
  }
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// PATCH /api/admin/update-grant
// Body: { id: string, fields: Record<string, unknown> }
//   OR: { ids: string[], fields: Record<string, unknown> }  ← batch update
// Updates any set of columns on scraped_grants row(s) using the service role key (bypasses RLS).
export async function PATCH(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = await req.json() as {
    id?: string
    ids?: string[]
    fields: Record<string, unknown>
  }
  const { fields } = body

  if (!fields || typeof fields !== 'object') {
    return NextResponse.json({ error: 'fields is required' }, { status: 400 })
  }

  const db = getAdminClient()

  // Batch update (array of ids)
  if (Array.isArray(body.ids) && body.ids.length > 0) {
    const { error } = await db
      .from('scraped_grants')
      .update(fields)
      .in('id', body.ids)
    if (error) {
      console.error('update-grant batch error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, updated: body.ids.length })
  }

  // Single update
  if (!body.id) {
    return NextResponse.json({ error: 'id or ids is required' }, { status: 400 })
  }
  const { error } = await db
    .from('scraped_grants')
    .update(fields)
    .eq('id', body.id)

  if (error) {
    console.error('update-grant error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

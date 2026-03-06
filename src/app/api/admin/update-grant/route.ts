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
// Updates any set of columns on a scraped_grants row using the service role key (bypasses RLS).
export async function PATCH(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { id, fields } = await req.json() as {
    id: string
    fields: Record<string, unknown>
  }

  if (!id || !fields || typeof fields !== 'object') {
    return NextResponse.json({ error: 'id and fields are required' }, { status: 400 })
  }

  const db = getAdminClient()
  const { error } = await db
    .from('scraped_grants')
    .update(fields)
    .eq('id', id)

  if (error) {
    console.error('update-grant error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

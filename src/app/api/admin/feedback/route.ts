import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

export async function GET() {
  // Auth check — who is calling?
  const authClient = createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (\!user || user.email \!== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Service role client — bypasses RLS to read all feedback
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL\!,
    process.env.SUPABASE_SERVICE_ROLE_KEY\!
  )

  const { data: feedback, error } = await admin
    .from('match_feedback')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch grant titles
  const grantIds = Array.from(new Set((feedback || []).map((f: any) => f.grant_id)))
  const { data: grants } = await admin
    .from('scraped_grants')
    .select('id, title')
    .in('id', grantIds)

  const titleMap: Record<string, string> = {}
  ;(grants || []).forEach((g: any) => { titleMap[g.id] = g.title })

  const rows = (feedback || []).map((f: any) => ({
    ...f,
    grant_title: titleMap[f.grant_id] ?? f.grant_id,
  }))

  return NextResponse.json({ rows })
}

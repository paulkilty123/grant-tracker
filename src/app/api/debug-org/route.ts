import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not logged in' })

  const { data: orgs, error } = await supabase
    .from('organisations')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)

  return NextResponse.json({
    user_id: user.id,
    email: user.email,
    org: orgs?.[0] ?? null,
    error: error?.message ?? null,
  })
}

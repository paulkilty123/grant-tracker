// Vercel Cron handler — called nightly at 02:00
// Marks grants whose deadline has passed as inactive so they stop
// appearing in search results.  Rolling grants are never expired.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]  // YYYY-MM-DD

  // Expire grants where deadline < today and still marked active
  const { data, error } = await supabase
    .from('scraped_grants')
    .update({ is_active: false })
    .eq('is_active', true)
    .eq('is_rolling', false)
    .not('deadline', 'is', null)
    .lt('deadline', today)
    .select('external_id, title, deadline')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const expired = data ?? []
  return NextResponse.json({
    success: true,
    expiredCount: expired.length,
    expired: expired.map(g => ({ id: g.external_id, title: g.title, deadline: g.deadline })),
  })
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('scraped_grants')
    .select('id, title, funder, amount_min, amount_max, deadline, is_rolling, impact_sectors, eligible_structures, funder_type, geo_scope')
    .eq('is_active', true)
    .or(`is_rolling.eq.true,deadline.is.null,deadline.gte.${today}`)
    .not('funder', 'is', null)
    .not('amount_max', 'is', null)
    .order('first_seen_at', { ascending: false })
    .limit(9)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ grants: data ?? [] }, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  })
}

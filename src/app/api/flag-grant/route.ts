// POST /api/flag-grant
// Records a user flag on a scraped grant.
// If 3 or more distinct orgs flag the same grant, it is automatically
// marked inactive so it no longer shows in search results.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { grantId, orgId } = await req.json() as { grantId: string; orgId: string }
  if (!grantId || !orgId) {
    return NextResponse.json({ error: 'Missing grantId or orgId' }, { status: 400 })
  }

  // Record the flag (idempotent — ignore if already flagged by this org)
  await supabase
    .from('grant_interactions')
    .upsert(
      { org_id: orgId, grant_id: grantId, action: 'flagged' },
      { onConflict: 'org_id,grant_id,action' },
    )

  // Count how many distinct orgs have flagged this grant
  const { count } = await supabase
    .from('grant_interactions')
    .select('*', { count: 'exact', head: true })
    .eq('grant_id', grantId)
    .eq('action', 'flagged')

  const totalFlags = count ?? 0

  // Auto-expire if 3+ flags
  if (totalFlags >= 3) {
    await supabase
      .from('scraped_grants')
      .update({ is_active: false })
      .eq('external_id', grantId)
  }

  return NextResponse.json({ flagged: true, totalFlags })
}

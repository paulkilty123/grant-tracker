import { createClient } from '@supabase/supabase-js'
import { computeMatchScore } from './matching'
import { SEED_GRANTS } from './grants'
import type { Organisation, GrantOpportunity } from '@/types'

// Admin client — uses service role to bypass RLS (server-side only)
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export interface AlertGrant {
  grant: GrantOpportunity
  score: number
  reason: string
}

/** Find grants that are a good match and haven't been sent to this org yet */
export async function getUnsentAlerts(
  org: Organisation,
  minScore: number,
): Promise<AlertGrant[]> {
  const supabase = adminClient()

  // Get already-sent grant IDs for this org
  const { data: sent } = await supabase
    .from('sent_grant_alerts')
    .select('grant_id')
    .eq('org_id', org.id)

  const sentIds = new Set((sent ?? []).map((r: { grant_id: string }) => r.grant_id))

  // Score all grants against the org profile
  const candidates: AlertGrant[] = []
  for (const grant of SEED_GRANTS) {
    if (sentIds.has(grant.id)) continue
    const { score, reason } = computeMatchScore(grant, org)
    if (score >= minScore) {
      candidates.push({ grant, score, reason })
    }
  }

  // Sort by score descending, return top 8
  return candidates.sort((a, b) => b.score - a.score).slice(0, 8)
}

/** Record which grants were sent so we don't resend them */
export async function markAlertsSent(orgId: string, grantIds: string[]): Promise<void> {
  const supabase = adminClient()
  const rows = grantIds.map(grant_id => ({ org_id: orgId, grant_id }))
  await supabase
    .from('sent_grant_alerts')
    .upsert(rows, { onConflict: 'org_id,grant_id' })
}

/** Get all orgs that have alerts enabled */
export async function getOrgsWithAlertsEnabled(): Promise<(Organisation & { owner_email: string })[]> {
  const supabase = adminClient()

  const { data: orgs } = await supabase
    .from('organisations')
    .select('*')
    .eq('alerts_enabled', true)

  if (!orgs?.length) return []

  // Fetch owner emails from auth.users
  const results = []
  for (const org of orgs) {
    const { data: userData } = await supabase.auth.admin.getUserById(org.owner_id)
    const email = userData?.user?.email
    if (email) results.push({ ...org, owner_email: email })
  }

  return results
}

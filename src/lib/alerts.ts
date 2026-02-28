import { createClient } from '@supabase/supabase-js'
import { computeMatchScore } from './matching'
import { SEED_GRANTS } from './grants'
import type { Organisation, GrantOpportunity, FunderType } from '@/types'

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

const VALID_FUNDER_TYPES: FunderType[] = [
  'trust_foundation', 'local_authority', 'housing_association',
  'corporate', 'lottery', 'government', 'other',
]

function normaliseScraped(row: Record<string, unknown>): GrantOpportunity {
  const rawType = String(row.funder_type ?? 'other')
  const funderType: FunderType = VALID_FUNDER_TYPES.includes(rawType as FunderType)
    ? (rawType as FunderType) : 'other'
  return {
    id:                   String(row.external_id ?? row.id),
    title:                String(row.title ?? ''),
    funder:               String(row.funder ?? 'Unknown funder'),
    funderType,
    description:          String(row.description ?? ''),
    amountMin:            typeof row.amount_min  === 'number' ? row.amount_min  : 0,
    amountMax:            typeof row.amount_max  === 'number' ? row.amount_max  : 0,
    deadline:             row.deadline ? String(row.deadline) : null,
    isRolling:            Boolean(row.is_rolling),
    isLocal:              Boolean(row.is_local),
    sectors:              Array.isArray(row.sectors)              ? (row.sectors as string[])              : [],
    eligibilityCriteria:  Array.isArray(row.eligibility_criteria) ? (row.eligibility_criteria as string[]) : [],
    applyUrl:             row.apply_url ? String(row.apply_url) : null,
    source:               'scraped',
    dateAdded:            row.first_seen_at ? String(row.first_seen_at).split('T')[0] : undefined,
  }
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

  // Fetch active scraped grants from DB (newest first, max 500)
  const { data: scraped } = await supabase
    .from('scraped_grants')
    .select('*')
    .eq('is_active', true)
    .order('first_seen_at', { ascending: false })
    .limit(500)

  const scrapedGrants: GrantOpportunity[] = (scraped ?? [])
    .map(row => normaliseScraped(row as Record<string, unknown>))

  // Merge seed + scraped, score everything against org profile
  const allGrants = [...SEED_GRANTS, ...scrapedGrants]
  const candidates: AlertGrant[] = []

  for (const grant of allGrants) {
    if (sentIds.has(grant.id)) continue
    const { score, reason } = computeMatchScore(grant, org)
    if (score >= minScore) {
      candidates.push({ grant, score, reason })
    }
  }

  // Sort by score descending, return top 10
  return candidates.sort((a, b) => b.score - a.score).slice(0, 10)
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

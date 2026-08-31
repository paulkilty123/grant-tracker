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

/**
 * How many opportunities may appear in one alert email.
 *
 * sent_grant_alerts is empty, so "everything matching that has not been sent"
 * currently means every match since the catalogue began. Without a cap the
 * first email anybody receives is the entire backlog, which reads as a data
 * dump rather than an alert and teaches people to filter us.
 */
export const ALERT_MAX_GRANTS_PER_EMAIL =
  Number(process.env.ALERT_MAX_GRANTS_PER_EMAIL) || 5

/**
 * How far back an opportunity may have been first seen and still count as
 * "new". The other half of the backlog problem: the cap alone would send five
 * grants from March and call them new.
 */
export const ALERT_LOOKBACK_DAYS =
  Number(process.env.ALERT_LOOKBACK_DAYS) || 30

/**
 * Who may receive an alert. EMPTY BY DEFAULT, which means nobody.
 *
 * The safe state is the default rather than a flag someone remembers to pass.
 * 34 organisations across 23 people have alerts_enabled, nearly all of them
 * cohort members, and none of them asked for it — so the cost of an unscoped
 * run is not a stray email, it is the goodwill the launch depends on.
 *
 * Widening this is a deliberate edit to an environment variable, which is
 * exactly the friction it should have. Set ALERT_RECIPIENT_ALLOWLIST to a
 * comma-separated list of addresses.
 */
export function alertAllowlist(): string[] {
  return (process.env.ALERT_RECIPIENT_ALLOWLIST ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
}

/** True only if this address is explicitly listed. No wildcards, by design. */
export function isAllowedRecipient(email: string): boolean {
  return alertAllowlist().includes(email.trim().toLowerCase())
}

const VALID_FUNDER_TYPES: FunderType[] = [
  'trust_foundation', 'community_foundation', 'corporate_foundation',
  'capacity_builder',
  'local_authority', 'housing_association',
  'corporate', 'lottery', 'government',
  'competition', 'loan', 'crowdfund_match', 'other',
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
    locationTag:          row.location_tag ? String(row.location_tag) : null,
    sectors:              Array.isArray(row.sectors)              ? (row.sectors as string[])              : [],
    impactSectors:        Array.isArray(row.impact_sectors)       ? (row.impact_sectors as import('@/types').ImpactSector[]) : undefined,
    eligibilityCriteria:  Array.isArray(row.eligibility_criteria) ? (row.eligibility_criteria as string[]) : [],
    eligibleStructures:   Array.isArray(row.eligible_structures)  ? (row.eligible_structures as import('@/types').LegalStructure[]) : undefined,
    beneficiaryGroups:    Array.isArray(row.target_beneficiaries) ? (row.target_beneficiaries as import('@/types').BeneficiaryGroup[]) : undefined,
    applyUrl:             row.apply_url ? String(row.apply_url) : null,
    isInviteOnly:         Boolean(row.is_invite_only),
    nextOpenDate:         row.next_open_date ? String(row.next_open_date) : null,
    fundingType:          (row.funding_type ? String(row.funding_type) : 'grant') as import('@/types').FundingType,
    source:               'scraped',
    dateAdded:            row.first_seen_at ? String(row.first_seen_at).split('T')[0] : undefined,
    lastVerifiedAt:       row.last_seen_at  ? String(row.last_seen_at).split('T')[0]  : undefined,
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

  // is_active AND published. is_active alone was letting rows that are still
  // in review into an email — 24 of them at the time of writing. A row reaches
  // a user's inbox before a human has approved it, which is the one thing the
  // Needs Review gate exists to prevent.
  //
  // Newest first is deliberate and not just a tiebreak: this is a "new
  // opportunity" alert, so recency is the point. The limit is above the size of
  // the whole published set (582 on 2026-08-30) so it is a safety ceiling
  // rather than a silent window that quietly drops the older half.
  // The lookback floor, applied in SQL rather than after the fetch. Doing it
  // here means the row limit below is a ceiling on genuinely-recent rows, not
  // a window that silently drops half of them.
  const cutoff = new Date(Date.now() - ALERT_LOOKBACK_DAYS * 86_400_000)
    .toISOString()

  const { data: scraped } = await supabase
    .from('scraped_grants')
    .select('*')
    .eq('is_active', true)
    .eq('pipeline_state', 'published')
    .gte('first_seen_at', cutoff)
    .order('first_seen_at', { ascending: false })
    .limit(1000)

  const scrapedGrants: GrantOpportunity[] = (scraped ?? [])
    .map(row => normaliseScraped(row as Record<string, unknown>))

  // DB is the single source of truth — seed grants have been migrated
  const allGrants = scrapedGrants
  const candidates: AlertGrant[] = []

  for (const grant of allGrants) {
    if (sentIds.has(grant.id)) continue
    const { score, reason } = computeMatchScore(grant, org)
    if (score >= minScore) {
      candidates.push({ grant, score, reason })
    }
  }

  // Best first, capped. Was a flat top-10 with no lookback floor behind it.
  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, ALERT_MAX_GRANTS_PER_EMAIL)
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

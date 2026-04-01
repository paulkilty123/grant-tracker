import type { GrantOpportunity, Organisation, FunderType } from '@/types'

export function scoreGrantMatch(grant: any, org: any): number {
  return 50
}

function inferFunderType(name: string): FunderType {
  const n = name.toLowerCase()
  if (n.includes('council') || n.includes('borough')) return 'local_authority'
  if (n.includes('housing') || n.includes('homes')) return 'housing_association'
  if (n.includes('lottery') || n.includes('community fund')) return 'lottery'
  if (n.includes('government') || n.includes('department')) return 'government'
  const corporates = ['barclays','lloyds','aviva','co-op','tesco','ford']
  if (corporates.some(c => n.includes(c))) return 'corporate'
  return 'trust_foundation'
}

// All seed grants have been migrated to the scraped_grants Supabase table.
// The DB is the single source of truth. This array is kept empty intentionally.
// If Supabase is unreachable, the search page will show an empty state.
export const SEED_GRANTS: Omit<GrantOpportunity, 'matchScore'>[] = []

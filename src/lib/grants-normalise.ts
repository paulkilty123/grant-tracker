import type {
  GrantOpportunity,
  FunderType,
  FundingType,
  FundingSubtype,
  ImpactSector,
  LegalStructure,
  BeneficiaryGroup,
} from '@/types'

const VALID_FUNDER_TYPES: FunderType[] = [
  'trust_foundation', 'community_foundation', 'corporate_foundation',
  'capacity_builder',
  'local_authority', 'housing_association',
  'corporate', 'lottery', 'government',
  'competition', 'loan', 'crowdfund_match', 'other',
]

// Extended grant type that carries funder-table metadata alongside core grant fields.
// Used anywhere we pull from the `grants_with_funder` view.
export interface EnrichedGrant extends GrantOpportunity {
  funderCategory?: string       // funders.funder_type (our 8-category taxonomy)
  geoScope?: string[]           // funders.geographic_scope
  funderBrief?: Record<string, string | null> | null  // AI-generated funder intelligence
}

/**
 * Normalises a raw row from `grants_with_funder` (or `scraped_grants`) into
 * the EnrichedGrant shape that matching.ts and the UI components expect.
 * Kept in its own lib so both client components (search page) and server
 * components (dashboard) can share it without crossing the RSC boundary.
 */
export function normaliseScrapedGrant(row: Record<string, unknown>): EnrichedGrant {
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
    eligibilityCriteria:  Array.isArray(row.eligibility_criteria) ? (row.eligibility_criteria as string[]) : [],
    applyUrl:             row.apply_url ? String(row.apply_url) : null,
    isInviteOnly:         Boolean(row.is_invite_only),
    nextOpenDate:         row.next_open_date ? String(row.next_open_date) : null,
    nextOpenDateParsed:   row.next_open_date_parsed ? String(row.next_open_date_parsed) : null,
    fundingType:          (row.funding_type ? String(row.funding_type) : 'grant') as FundingType,
    fundingSubtype:       row.funding_subtype ? String(row.funding_subtype) as FundingSubtype : null,
    impactSectors:        Array.isArray(row.impact_sectors)       ? (row.impact_sectors       as ImpactSector[])   : undefined,
    eligibleStructures:   Array.isArray(row.eligible_structures) ? (row.eligible_structures as LegalStructure[]) : undefined,
    beneficiaryGroups:    Array.isArray(row.target_beneficiaries) ? (row.target_beneficiaries as BeneficiaryGroup[]) : undefined,
    source:               'scraped',
    dateAdded:            row.first_seen_at  ? String(row.first_seen_at).split('T')[0]  : undefined,
    lastVerifiedAt:       row.last_seen_at   ? String(row.last_seen_at).split('T')[0]   : undefined,
    // Funder-table enrichment (null for 'manual' source grants)
    funderCategory:       row.funder_category ? String(row.funder_category) : undefined,
    geoScope:             Array.isArray(row.geographic_scope) ? (row.geographic_scope as string[]) : undefined,
    funderBrief:          row.funder_brief && typeof row.funder_brief === 'object' ? (row.funder_brief as Record<string, string | null>) : null,
    nicheTags:            Array.isArray(row.niche_tags) ? (row.niche_tags as string[]) : [],
  }
}

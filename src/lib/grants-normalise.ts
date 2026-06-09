import type {
  GrantOpportunity,
  FunderType,
  FundingType,
  FundingSubtype,
  ImpactSector,
  LegalStructure,
  BeneficiaryGroup,
} from '@/types'

const numOrNull = (v: unknown): number | null =>
  typeof v === 'number' ? v : v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null
const strOrNull = (v: unknown): string | null =>
  v == null ? null : String(v)

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
  /** Raw scraped_grants.id (catalogue UUID). `id` above is external_id ?? id,
   *  so this is the only reliable key for event payloads / DB joins. */
  uuid?: string | null
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
    uuid:                 row.id ? String(row.id) : null,
    title:                String(row.title ?? ''),
    funder:               String(row.funder ?? 'Unknown funder'),
    funderType,
    description:          String(row.description ?? ''),
    amountMin:            typeof row.amount_min  === 'number' ? row.amount_min  : 0,
    amountMax:            typeof row.amount_max  === 'number' ? row.amount_max  : 0,
    amountUndisclosed:    Boolean(row.amount_undisclosed),
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
    // Multi-round flag — derived from the brief's decision_timeline text.
    // Signals: "X application rounds/windows", "round 1 of N", "biannual",
    // "quarterly rounds", "two/three deadlines per year", or two distinct
    // "Round N" labels in sequence. Used to render a "Multi-round" pill
    // on the grant card so users know more rounds are coming.
    isMultiRound:         (() => {
      const tl = String(((row.funder_brief as Record<string, unknown> | null)?.decision_timeline ?? '')).toLowerCase()
      if (!tl) return false
      if (/\b(?:two|three|four|five|six|2|3|4|5|6)\s+(?:application\s+)?(?:rounds?|windows?|deadlines?|cycles?|cohorts?|intakes?|board\s+meetings?)\b/i.test(tl)) return true
      if (/\bmultiple\s+(?:application\s+)?(?:rounds?|windows?|deadlines?|cycles?)\b/i.test(tl)) return true
      if (/\b(?:bi[-\s]?annual|biannual|quarterly|monthly)\s+(?:rounds?|deadlines?|cycles?|application|funding)\b/i.test(tl)) return true
      if (/\bround\s+\d+\s+of\s+\d+\b/i.test(tl)) return true
      if (/\bround\s+\d+\b[\s\S]*?\bround\s+\d+\b/i.test(tl)) return true
      if (/\b(?:two|three|four)\s+(?:funding|application|grant)\s+rounds?\s+(?:per|each|a)\s+year\b/i.test(tl)) return true
      // Board-meeting schedules with multi-month lists, e.g. "Board meetings
      // in December, March, and June" — a common phrasing for trusts that
      // batch decisions across a fixed annual calendar.
      if (/\bboard\s+meetings?\s+(?:in|each|move\s+to)\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)/i.test(tl)) return true
      return false
    })(),
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
    // ── Branched-eligibility fields (consumed by src/lib/eligibility.ts) ──
    minOrgIncome:           numOrNull(row.min_org_income),
    maxOrgIncome:           numOrNull(row.max_org_income),
    targetBeneficiaries:    Array.isArray(row.target_beneficiaries) ? (row.target_beneficiaries as BeneficiaryGroup[]) : undefined,
    siInstrumentType:       strOrNull(row.si_instrument_type),
    siRepaymentTermMonths:  numOrNull(row.si_repayment_term_months),
    siInterestRatePercent:  numOrNull(row.si_interest_rate_percent),
    siSecurityRequired:     strOrNull(row.si_security_required),
    siMinInvestment:        numOrNull(row.si_min_investment),
    siMaxInvestment:        numOrNull(row.si_max_investment),
    progCohortSize:         numOrNull(row.prog_cohort_size),
    progLengthWeeks:        numOrNull(row.prog_length_weeks),
    progLocationMode:       strOrNull(row.prog_location_mode),
    progLocationCity:       strOrNull(row.prog_location_city),
    progIncludesFunding:    typeof row.prog_includes_funding === 'boolean' ? row.prog_includes_funding : null,
    progFundingAmount:      numOrNull(row.prog_funding_amount),
    progApplicationCycle:   strOrNull(row.prog_application_cycle),
    progNextCohortStart:    row.prog_next_cohort_start ? String(row.prog_next_cohort_start) : null,
    // No prog_stage_target column exists on scraped_grants, so this stays
    // undefined and eligibility.ts's org_stage_mismatch check is dormant. Add
    // the column (+ classifier write) before reading it — don't reinstate a
    // read of a phantom column.
    progStageTarget:        undefined,
    ikSupportType:          strOrNull(row.ik_support_type),
    ikValueEstimate:        numOrNull(row.ik_value_estimate),
    ikCapacityAvailable:    strOrNull(row.ik_capacity_available),
  }
}

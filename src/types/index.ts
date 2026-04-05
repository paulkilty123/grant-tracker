// ─────────────────────────────────────────────
// Database row types (mirrors Supabase schema)
// ─────────────────────────────────────────────

/** Full legal structure taxonomy — replaces the old OrgType enum */
export type LegalStructure =
  | 'cic_guarantee'        // CIC limited by guarantee
  | 'cic_shares'           // CIC limited by shares
  | 'cio'                  // Charitable Incorporated Organisation
  | 'registered_charity'   // Registered charity (company limited by guarantee)
  | 'ltd_guarantee'        // Ltd by guarantee (non-charity, non-CIC)
  | 'ltd_shares'           // Ltd by shares (trading social enterprise)
  | 'llp'                  // Limited Liability Partnership
  | 'cooperative'          // Co-operative / Community Benefit Society
  | 'unincorporated'       // Unincorporated association / community group
  | 'sole_trader'          // Sole trader
  | 'not_registered'       // Not yet registered / idea stage

/** Backward-compatible alias — kept for existing data */
export type OrgType =
  | 'registered_charity'
  | 'cic'
  | 'social_enterprise'
  | 'community_group'
  | 'other'

export type OrgStage =
  | 'idea'
  | 'pre_revenue'
  | 'early'
  | 'growth'
  | 'established'

/** The 19 impact sectors users select during onboarding (1–5 per user) */
export type ImpactSector =
  | 'creative'
  | 'environment'
  | 'health'
  | 'mental_health'
  | 'education'
  | 'tech'
  | 'housing'
  | 'food'
  | 'employment'
  | 'community'
  | 'justice'
  | 'financial'
  | 'international'
  | 'young_people'
  | 'women'
  | 'disability'
  | 'older_people'
  | 'heritage'
  | 'sport'

/** Funding opportunity types — 4-category taxonomy */
export type FundingType =
  | 'grant'        // non-repayable cash: grants, awards, prizes, diversity funds
  | 'programme'    // accelerators, fellowships, incubators, support programmes (may include cash)
  | 'investment'   // repayable finance: social investment, blended finance, loans
  | 'in_kind'      // non-cash: software credits, ad grants, workspace, pro bono

export type PipelineStage =
  | 'identified'
  | 'applying'
  | 'submitted'
  | 'won'
  | 'declined'

export type FunderType =
  | 'trust_foundation'
  | 'community_foundation'  // place-based community foundations (e.g. London CF, Foundation Scotland)
  | 'corporate_foundation'  // corporate-backed foundations (e.g. Lloyds Bank Foundation)
  | 'local_authority'
  | 'housing_association'
  | 'corporate'
  | 'lottery'
  | 'government'
  | 'competition'      // pitch prizes, innovation challenges, awards
  | 'loan'             // repayable social lending (often interest-free / low rate)
  | 'crowdfund_match'  // matched crowdfunding campaigns
  | 'other'

// ─────────────────────────────────────────────
// Supabase table shapes
// ─────────────────────────────────────────────

export interface Organisation {
  id: string
  created_at: string
  name: string
  charity_number: string | null
  cic_number: string | null
  // Legacy field — kept for backward compat
  org_type: OrgType
  // ── New strategic fields ──────────────────────────────────────────────────
  /** Full legal structure — replaces org_type for new data */
  legal_structure: LegalStructure | null
  /** Does the org self-identify as mission-driven? Critical for Ltd companies */
  social_mission_declared: boolean
  /** Do articles of association restrict dividends / state social purpose? */
  articles_restrict_profit: boolean
  /** User is both an individual practitioner AND an org — show both grant types */
  also_individual_practitioner: boolean
  /** 1–3 impact sectors from the 12-sector taxonomy */
  impact_sectors: ImpactSector[]
  /** Org stage for matching programme eligibility */
  org_stage: OrgStage | null
  // ── Existing fields ───────────────────────────────────────────────────────
  annual_income_band: string | null
  primary_location: string | null
  areas_of_work: string[]
  beneficiaries: string[]
  themes: string[]
  mission: string | null
  min_grant_target: number | null
  max_grant_target: number | null
  funder_type_preferences: FunderType[]
  /** Preferred funding types — explicit user preference set in profile */
  funding_type_preferences: FundingType[]
  // impact fields
  people_per_year: number | null
  volunteers: number | null
  years_operating: number | null
  projects_running: number | null
  key_outcomes: string[]
  owner_id: string
}

export interface PipelineItem {
  id: string
  created_at: string
  updated_at: string
  org_id: string
  grant_name: string
  funder_name: string
  funder_type: FunderType
  amount_requested: number | null
  amount_min: number | null
  amount_max: number | null
  deadline: string | null  // ISO date string
  stage: PipelineStage
  notes: string | null
  application_progress: number | null  // 0–100
  is_urgent: boolean
  contact_name: string | null
  contact_email: string | null
  grant_url: string | null
  outcome_date: string | null
  outcome_notes: string | null
  created_by: string
}

export interface SavedGrant {
  id: string
  created_at: string
  org_id: string
  external_grant_id: string
  source: 'three_sixty_giving' | 'manual' | 'scraped'
  raw_data: Record<string, unknown>
}

// ─────────────────────────────────────────────
// Application-layer types (UI / API)
// ─────────────────────────────────────────────

export interface GrantOpportunity {
  id: string
  title: string
  funder: string
  funderType: FunderType
  /** Broader funding type — grants, accelerators, social investment, etc. */
  fundingType?: FundingType
  description: string
  amountMin: number
  amountMax: number
  deadline: string | null   // human-readable or ISO
  isRolling: boolean
  isLocal: boolean
  sectors: string[]
  /** New 12-sector taxonomy tags */
  impactSectors?: ImpactSector[]
  eligibilityCriteria: string[]
  /** Legal structures that are explicitly eligible */
  eligibleStructures?: LegalStructure[]
  /** If true, Ltd companies with declared social mission are soft-matched */
  acceptsSocialEnterprises?: boolean
  /** individual | organisation | both */
  applicantType?: 'individual' | 'organisation' | 'both'
  applyUrl: string | null
  isInviteOnly: boolean
  /** Human-readable location tag, e.g. "London", "Leeds", "Scotland", "UK" */
  locationTag?: string | null
  /** Human-readable date when the grant next opens (e.g. "July 2026"). Null if open now or unknown. */
  nextOpenDate?: string | null
  /** ISO date (YYYY-MM-DD) when the grant next opens — used for "opens soon" display. */
  nextOpenDateParsed?: string | null
  source: 'three_sixty_giving' | 'manual' | 'scraped'
  dateAdded?: string        // ISO date, used for "Recently Added" section
  lastVerifiedAt?: string   // ISO date: last time crawler confirmed this grant was still live
  matchScore?: number       // 0–100, computed per-org
  /** Eligibility badge computed by the eligibility engine */
  eligibilityStatus?: 'eligible' | 'likely_eligible' | 'check_required' | 'ineligible'
  /** Human-readable reason for the eligibility status */
  eligibilityReason?: string
}

export interface PipelineColumn {
  id: PipelineStage
  label: string
  emoji: string
  colour: string            // tailwind class fragment
}

export interface DeadlineAlert {
  item: PipelineItem
  daysUntil: number
  urgency: 'overdue' | 'urgent' | 'soon' | 'ok' | 'rolling'
}

// ─────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────

export interface AppUser {
  id: string
  email: string
  org_id: string | null
  full_name: string | null
  avatar_url: string | null
}

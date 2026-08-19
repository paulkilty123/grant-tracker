// ─────────────────────────────────────────────
// Database row types (mirrors Supabase schema)
// ─────────────────────────────────────────────

/** Full legal structure taxonomy — replaces the old OrgType enum */
export type LegalStructure =
  | 'cic_guarantee'        // CIC limited by guarantee
  | 'cic_shares'           // CIC limited by shares
  | 'cio'                  // Charitable Incorporated Organisation
  | 'scio'                 // Scottish Charitable Incorporated Organisation (OSCR)
  | 'registered_charity'   // Registered charity (company limited by guarantee)
  | 'ltd_guarantee'        // Ltd by guarantee (non-charity, non-CIC)
  | 'ltd_shares'           // Ltd by shares (trading social enterprise)
  | 'llp'                  // Limited Liability Partnership
  | 'cooperative'          // Co-operative / Community Benefit Society
  | 'unincorporated'       // Unincorporated association / community group
  | 'sole_trader'          // Sole trader
  | 'not_registered'       // Not yet registered / idea stage
  // A private person, not an organisation. GRANT-SIDE ONLY: it describes a fund
  // whose applicant is an individual (a researcher, an artist, a student). It is
  // deliberately NOT offered as an organisation's own structure on the profile
  // or onboarding forms, because Grant Tracker serves organisations — every one
  // of the 32 orgs in the database holds an organisational form.
  // Kept distinct from sole_trader, which is a person trading as a business and
  // can legitimately hold organisational eligibility.
  | 'individual'

// Runtime values for this taxonomy live in src/lib/structures.ts, NOT here:
// src/types/index.js is a stale tracked artefact that shadows this file at
// runtime, so an exported const resolves to undefined while tsc stays clean.


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
  | 'social_economy'    // Worker co-ops, community ownership, mutual structures
  | 'social_innovation' // Tech-for-good, systems change, R&D with social purpose

/** Structured beneficiary taxonomy — who the org/grant primarily serves */
export type BeneficiaryGroup =
  | 'children'           // Children (under 16)
  | 'young_people'       // Young people (16-25)
  | 'older_people'       // Older people (65+)
  | 'families'           // Families & parents
  | 'women_girls'        // Women & girls
  | 'men_boys'           // Men & boys
  | 'lgbtq'              // LGBTQ+ communities
  | 'ethnic_minorities'  // Ethnic minorities & BAME communities
  | 'refugees_migrants'  // Refugees, asylum seekers & migrants
  | 'disabled_people'    // Disabled people
  | 'mental_health'      // People with mental health needs
  | 'carers'             // Carers & care leavers
  | 'veterans'           // Veterans & armed forces community
  | 'ex_offenders'       // Ex-offenders & people in the justice system
  | 'homeless'           // Homeless people & rough sleepers
  | 'people_in_poverty'  // People experiencing poverty
  | 'rural_communities'  // Rural & isolated communities
  | 'social_impact_orgs' // Social impact organisations — sector-support / capacity-building bodies that serve other charities, social enterprises & social entrepreneurs (not end-beneficiaries)
  | 'general_public'     // General public / no specific group

/** Funding opportunity types — 4-category taxonomy */
export type FundingType =
  | 'grant'        // non-repayable cash: grants, awards, prizes, diversity funds
  | 'programme'    // accelerators, fellowships, incubators, support programmes (may include cash)
  | 'investment'   // repayable finance: social investment, blended finance, loans
  | 'in_kind'      // non-cash: software credits, ad grants, workspace, pro bono

/** Optional sub-classification of funding_type */
/**
 * What the money may be spent on — a different question from FundingSubtype,
 * which describes the shape of the product (small grant, emergency, loan).
 *
 * Kept separate because one slot cannot answer both: 46 live grants hold
 * `small_grant` or `emergency` in funding_subtype, which is true and useful and
 * tells you nothing about whether the money is restricted.
 *
 * NULL is a real and common answer, meaning the funder page does not say. It is
 * deliberately NOT collapsed into 'restricted' — defaulting would make an unread
 * page indistinguishable from a stated restriction, which is the mistake behind
 * is_rolling (set to !deadline by several scrapers, so a parse failure became a
 * promise the fund never closes).
 */
/** What KIND of cost the money covers. Orthogonal to SpendRestriction. */
export type SpendType = 'capital' | 'revenue'

/** How tied to a purpose the money is. Says nothing about what kind of cost. */
export type SpendRestriction = 'restricted' | 'unrestricted'

/**
 * What an ORG says it needs — the three choices the wizard offers.
 *
 * Deliberately not the same vocabulary as the grant side. A grant answers two
 * questions (what kind of cost, how tied to a purpose); a user picking
 * "Capital" is expressing one need, and does not care whether the capital pot
 * happens to be restricted. The matcher translates; the values are unchanged
 * from migration 047 so no org data has to move.
 */
export type SpendNeed = 'restricted' | 'unrestricted' | 'capital'

export type FundingSubtype =
  // grant sub-types
  | 'unrestricted'
  | 'restricted'
  | 'capital'
  | 'emergency'
  | 'small_grant'
  // programme sub-types
  | 'accelerator'
  | 'incubator'
  | 'fellowship'
  | 'cohort_grant'
  | 'award'
  // Added 2026-08-19. The four existing programme codes describe the SHAPE of a
  // cohort and nothing else, so a procurement training course and a mentoring
  // scheme both landed as "cohort_grant" or as nothing at all. These three name
  // what a fundraiser is actually being offered.
  | 'support_programme'
  | 'match_funding'
  | 'includes_grant'
  // investment sub-types
  | 'loan'
  | 'social_investment'
  | 'equity'
  | 'quasi_equity'
  | 'convertible'
  | 'blended'
  // Added 2026-08-19 for two instruments already in the catalogue and
  // unrepresentable: Fredericks Foundation repays out of revenue, and Ethex
  // raises withdrawable shares from the public.
  | 'revenue_share'
  | 'community_shares'
  // in-kind sub-types
  // `goods` and `mentoring` added 2026-08-19. Nothing covered physical things
  // being given away, so FareShare's food, the Hygiene Bank's products, Selco's
  // and Wickes' building materials and In Kind Direct's whole catalogue had no
  // tag that fitted. `mentoring` separates one person's time from a team doing
  // the work — a different offer, and a different ask of the charity.
  | 'goods'
  | 'mentoring'
  | 'pro_bono_legal'
  | 'pro_bono_consulting'
  | 'tech_product'
  | 'volunteering'
  | 'office_space'
  | 'training'

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
  | 'capacity_builder'      // infrastructure charities delivering in-kind support (e.g. Pilotlight, Superhighways, CAST)
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
  /** 1–3 impact sectors from the 14-sector taxonomy */
  impact_sectors: ImpactSector[]
  /** Sub-sector specialisation tags — finer-grained than impact_sectors (e.g. "music", "theatre") */
  niche_tags: string[]
  /** Sub-sector tags the org explicitly does NOT want grants for, even within their selected sectors. Hard-caps match score on overlapping grants. */
  excluded_niche_tags: string[]
  /** Does the org have a formal asset lock? (CIC guarantee = yes, CIC shares = partial, Ltd = no) */
  has_asset_lock: boolean | null
  /** Years the org has been actively trading */
  years_trading: number | null
  /** Org stage for matching programme eligibility */
  org_stage: OrgStage | null
  // ── Existing fields ───────────────────────────────────────────────────────
  annual_income_band: string | null
  primary_location: string | null
  areas_of_work: string[]
  beneficiaries: string[]
  /** Structured beneficiary groups — primary (index 0) + secondaries */
  beneficiary_groups: BeneficiaryGroup[]
  themes: string[]
  mission: string | null
  min_grant_target: number | null
  max_grant_target: number | null
  funder_type_preferences: FunderType[]
  /** Preferred funding types — explicit user preference set in profile */
  funding_type_preferences: FundingType[]
  /** Preferred funding sub-types — e.g. ['unrestricted','small_grant']. */
  funding_subtype_preferences: FundingSubtype[]
  /** Which spend restrictions the org wants. Empty = no preference stated. */
  spend_restriction_preferences: SpendNeed[]
  // impact fields
  people_per_year: number | null
  volunteers: number | null
  years_operating: number | null
  projects_running: number | null
  key_outcomes: string[]
  owner_id: string
  geographic_reach: string | null
  website_url: string | null
  // ── Entitlements ──────────────────────────────────────────────────────────
  /**
   * Apply-tier entitlement: pipeline + builder. Enforced in RLS on
   * pipeline_items / projects / applications / org_core_content, so a write
   * from a non-entitled org is rejected by Postgres with 42501 regardless of
   * what the interface allows. Only service_role may change it
   * (trg_enforce_apply_access_immutable). Read it before offering those
   * controls, or the user gets a button that always fails.
   */
  apply_access?: boolean | null
  /** Companion/Adviser-tier entitlement. Same enforcement model. */
  companion_access?: boolean | null
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
  starred?: boolean
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
  /** Optional sub-classification (e.g. loan/equity under investment) */
  fundingSubtype?: FundingSubtype | null
  /** Every sub-type the row carries. `fundingSubtype` is the first of these,
   *  kept in step by a database trigger (migration 065) so the matcher and the
   *  admin form did not have to change. Prefer this on any surface that can show
   *  more than one label. */
  fundingSubtypes?: FundingSubtype[]
  /** What the money may be spent on. NULL = the funder page does not say. */
  spendRestriction?: SpendRestriction | null
  /** {capital}, {revenue}, or both. 57 of 623 live grants fund both. */
  spendTypes?: SpendType[] | null
  description: string
  amountMin: number
  amountMax: number
  /** True when the funder affirmatively discloses no fixed per-grant amount
   * (aggregate fund only / "not specified"). Distinct from amountMin/Max == 0
   * meaning "unknown/unextracted" — this is a confirmed absence, surfaced as
   * "Amount not disclosed" rather than "Amount on application". */
  amountUndisclosed?: boolean
  deadline: string | null   // human-readable or ISO
  isRolling: boolean
  isLocal: boolean
  sectors: string[]
  /** New 14-sector taxonomy tags */
  impactSectors?: ImpactSector[]
  /** Sub-sector specialism tags set by the classifier (e.g. "music", "theatre", "dance") */
  nicheTags?: string[]
  /** Structured beneficiary groups the grant targets */
  beneficiaryGroups?: BeneficiaryGroup[]
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
  /** True if the funder runs multiple application rounds / windows per year — derived from the brief's decision_timeline. Surfaces a "Multi-round" pill on the grant card. */
  isMultiRound?: boolean
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

  // ── Branched-eligibility fields (read by src/lib/eligibility.ts) ────────
  /** Income gates (apply to every opportunity type) */
  minOrgIncome?: number | null
  maxOrgIncome?: number | null
  /** Beneficiary-tag overlay used by some grants for hard targeting */
  targetBeneficiaries?: BeneficiaryGroup[]

  // Investment-specific
  siInstrumentType?: string | null
  siRepaymentTermMonths?: number | null
  siInterestRatePercent?: number | null
  siSecurityRequired?: string | null
  siMinInvestment?: number | null
  siMaxInvestment?: number | null

  // Programme-specific
  progCohortSize?: number | null
  progLengthWeeks?: number | null
  progLocationMode?: 'remote' | 'in_person' | 'hybrid' | string | null
  progLocationCity?: string | null
  progIncludesFunding?: boolean | null
  progFundingAmount?: number | null
  progApplicationCycle?: string | null
  progNextCohortStart?: string | null   // ISO date
  /** Org stages this programme targets (when funder lists them explicitly) */
  progStageTarget?: OrgStage[]

  // In-kind-specific
  ikSupportType?: string | null
  ikValueEstimate?: number | null
  ikCapacityAvailable?: string | null
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

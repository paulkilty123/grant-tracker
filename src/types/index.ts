// ─────────────────────────────────────────────
// Database row types (mirrors Supabase schema)
// ─────────────────────────────────────────────

export type OrgType =
  | 'registered_charity'
  | 'cic'
  | 'social_enterprise'
  | 'community_group'
  | 'other'

export type PipelineStage =
  | 'identified'
  | 'researching'
  | 'applying'
  | 'submitted'
  | 'won'
  | 'declined'

export type FunderType =
  | 'trust_foundation'
  | 'local_authority'
  | 'housing_association'
  | 'corporate'
  | 'lottery'
  | 'government'
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
  org_type: OrgType
  annual_income_band: string | null
  primary_location: string | null
  areas_of_work: string[]
  beneficiaries: string[]
  themes: string[]
  mission: string | null
  min_grant_target: number | null
  max_grant_target: number | null
  funder_type_preferences: FunderType[]
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
  description: string
  amountMin: number
  amountMax: number
  deadline: string | null   // human-readable or ISO
  isRolling: boolean
  isLocal: boolean
  sectors: string[]
  eligibilityCriteria: string[]
  applyUrl: string | null
  source: 'three_sixty_giving' | 'manual' | 'scraped'
  dateAdded?: string        // ISO date, used for "Recently Added" section
  matchScore?: number       // 0–100, computed per-org
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

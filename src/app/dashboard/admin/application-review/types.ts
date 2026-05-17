// Shared contract for the application-review spike (application-builder Phase 0).
// Used by the input form (task 39), the review engine (task 40), the results
// display (task 41), and persistence (task 42).

export type FundingType = 'grant' | 'programme' | 'investment' | 'in_kind'

// ── Org context (structured profile + manual enrichment) ──────────────────────

export interface OrgContext {
  id:                string
  name:              string
  mission:           string | null
  impactSectors:     string[]
  beneficiaryGroups: string[]
  primaryLocation:   string | null
  legalStructure:    string | null
  /** Free-text manual enrichment — evidence-bank-lite. */
  evidenceNotes:     string
}

export const FUNDING_TYPE_LABELS: Record<FundingType, string> = {
  grant:      'Grant',
  programme:  'Programme',
  investment: 'Investment',
  in_kind:    'In-kind',
}

// ── Input (what the form collects, what the engine consumes) ──────────────────

export interface ReviewQuestion {
  question:    string
  wordLimit:   number | null
  draftAnswer: string
}

export interface ReviewRequest {
  grantName:          string
  funder:             string
  fundingType:        FundingType
  /** Funder's published assessment criteria, pasted freeform. Empty = none. */
  assessmentCriteria: string
  /** apply_url of the picked pipeline grant, if any — used for criteria capture. */
  grantUrl:           string | null
  questions:          ReviewQuestion[]
}

// ── Saved drafts ──────────────────────────────────────────────────────────────

/** A snapshot of the whole spike form, for save/reload. */
export interface DraftSnapshot {
  grantName:       string
  funder:          string
  fundingType:     FundingType
  criteria:        string
  guidelinesUrl:   string
  grantUrl:        string | null
  pickedId:        string
  questions:       ReviewQuestion[]
  personalise:     Record<number, string>
  strengthSummary: string[] | null
  result:          ReviewResult | null
}

export interface SavedDraft {
  id:        string
  title:     string
  updatedAt: string
  state:     DraftSnapshot
}

// ── Application-guidelines URL extraction ─────────────────────────────────────

export interface ExtractedApplication {
  /** False when the page could not be fetched or had no application content. */
  fetched:            boolean
  note:               string
  questions:          DraftQuestion[]
  assessmentCriteria: string
}

// ── Pipeline grant picker ─────────────────────────────────────────────────────

export interface PipelineGrantOption {
  id:         string
  grantName:  string
  funderName: string
  grantUrl:   string | null
  stage:      string
}

// ── Draft generation ──────────────────────────────────────────────────────────

export interface DraftQuestion {
  question:  string
  wordLimit: number | null
}

export interface DraftRequest {
  grantName:          string
  funder:             string
  fundingType:        FundingType
  assessmentCriteria: string
  orgId:              string
  evidenceNotes:      string
  /** apply_url of the picked pipeline grant — used to pull catalogue context. */
  grantUrl:           string | null
  questions:          DraftQuestion[]
}

export interface DraftAnswer {
  question:    string
  draftAnswer: string
  /** Consolidated note — what the user needs to personalise or add. */
  toPersonalise: string
}

export interface DraftResult {
  fundingType: FundingType
  /** "What makes this a strong application" — 2-3 strategic angles. */
  strengthSummary: string[]
  answers: DraftAnswer[]
}

// ── Output (what the review engine returns, what the display renders) ─────────

export interface QuestionFeedback {
  question:         string
  whatsWorking:     string
  whatToStrengthen: string
  /** Score/notes against the funder's criteria. Null when no criteria supplied. */
  criteriaNotes:    string | null
  /** Word-count observation. Null when the question had no word limit. */
  wordCountNote:    string | null
}

export interface ReviewResult {
  fundingType:    FundingType
  /** True when no criteria were supplied and the score is heuristic. */
  scoreEstimated: boolean
  /** 0-100. How well the draft covers the funder's stated requirements. */
  overallScore:   number
  strengthSummary: {
    /** 2-3 items. The headline of the review. */
    priorityImprovements: string[]
    strongestSections:    string
  }
  questions: QuestionFeedback[]
}

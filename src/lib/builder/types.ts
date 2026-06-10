// Application builder v0 — shared contract (build spec B2).
// The builder produces the first 10%, not the finished draft: per-question
// scaffolds, the org's own content mapped in, gaps flagged, narrative left
// for the user's voice. It must never invent facts about the organisation
// and never write finished flowing prose for them.
//
// DB shape: applications.questions is ApplicationQuestion[] (jsonb).
// Model output is validated against the zod schemas below before persisting.

import { z } from 'zod'

// ── Block types (mirror the org_core_content check constraint) ──────────────

export const BLOCK_TYPES = [
  'mission', 'programmes', 'beneficiaries', 'impact_evidence',
  'track_record', 'organisation_history', 'team', 'finances_summary',
  'safeguarding', 'edi', 'partnerships', 'need_evidence', 'other',
] as const

export type BlockType = (typeof BLOCK_TYPES)[number]

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  mission:              'Mission',
  programmes:           'Programmes',
  beneficiaries:        'Beneficiaries',
  impact_evidence:      'Impact evidence',
  track_record:         'Track record',
  organisation_history: 'Organisation history',
  team:                 'Team',
  finances_summary:     'Finances summary',
  safeguarding:         'Safeguarding',
  edi:                  'Equity, diversity and inclusion',
  partnerships:         'Partnerships',
  need_evidence:        'Evidence of need',
  other:                'Other',
}

export interface CoreContentBlock {
  id: string
  org_id: string
  block_type: BlockType
  title: string
  content: string
  source: 'user_entered' | 'banked_from_application' | 'extracted_from_profile'
  created_at: string
  updated_at: string
}

// ── Application question shape (spec B2) ────────────────────────────────────

export interface ScaffoldSection {
  heading: string
  guidance: string          // written TO the user, never AS the user
  suggested_order: number
}

export interface MappedBlock {
  block_id: string          // org_core_content.id, or 'profile' for profile fields
  block_type: string
  excerpt: string           // verbatim from THEIR content — never paraphrased into prose
  relevance_note: string
}

export interface Gap {
  gap_type: string
  description: string
  severity: 'blocking' | 'weakens'
  dismissed?: boolean       // user can tick off / dismiss in the workspace
}

export interface ApplicationQuestion {
  id: string
  question_text: string
  word_limit: number | null // detected at parse, user-editable
  scaffold: ScaffoldSection[] | null
  mapped_content: MappedBlock[]
  gaps: Gap[]
  user_answer: string       // theirs, always
  answer_banked: boolean
}

export type ApplicationStatus = 'draft' | 'in_progress' | 'complete'

export interface ApplicationRecord {
  id: string
  org_id: string
  opportunity_id: string | null
  pipeline_item_id: string | null
  funder_name: string | null
  grant_name: string | null
  status: ApplicationStatus
  questions: ApplicationQuestion[]
  eligibility_result: EligibilitySnapshot | null
  created_at: string
  updated_at: string
}

export interface EligibilitySnapshot {
  overall_status: string
  reason: string | null
  issues: { code: string; severity: string; message: string }[]
  proceeded_anyway: boolean
  checked_at: string
}

// ── Zod schemas — what the models return, validated before persisting ───────

// Parse step (Haiku): paste → structured questions.
export const ParsedQuestionSchema = z.object({
  question_text: z.string().min(1),
  word_limit: z.number().int().positive().nullable(),
})
export const ParseResultSchema = z.object({
  questions: z.array(ParsedQuestionSchema).min(1),
})
export type ParseResult = z.infer<typeof ParseResultSchema>

// Generation step (Sonnet): per-question scaffold + mapped content + gaps.
export const ScaffoldSectionSchema = z.object({
  heading: z.string().min(1),
  guidance: z.string().min(1),
  suggested_order: z.number().int(),
})
export const MappedBlockSchema = z.object({
  block_id: z.string(),
  block_type: z.string(),
  excerpt: z.string().min(1),
  relevance_note: z.string(),
})
export const GapSchema = z.object({
  gap_type: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(['blocking', 'weakens']),
})
export const GeneratedQuestionSchema = z.object({
  question_text: z.string().min(1),
  scaffold: z.array(ScaffoldSectionSchema).min(1),
  mapped_content: z.array(MappedBlockSchema),
  gaps: z.array(GapSchema),
})
export const GenerationResultSchema = z.object({
  questions: z.array(GeneratedQuestionSchema).min(1),
})
export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>
export type GenerationResult = z.infer<typeof GenerationResultSchema>

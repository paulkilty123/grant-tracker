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
  source: 'user_entered' | 'banked_from_application' | 'extracted_from_profile' | 'imported_from_application'
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

export interface ReviewTip {
  headline: string          // imperative, a few words: the what
  detail: string            // 1-3 sentences: the why and how
}

export interface AnswerReview {
  score: number             // 0-10, one decimal
  /** Ordered by impact. Strings only in reviews saved before tips were structured. */
  tips: (ReviewTip | string)[]
  strengths: string[]
  reviewed_at: string
  answer_hash: string       // hash of the answer that was reviewed (staleness)
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
  review?: AnswerReview | null
}

/** Tiny stable hash for staleness checks (djb2). */
export function answerHash(s: string): string {
  let h = 5381
  const t = s.trim()
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
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
  supplied_guidelines?: string | null
  supplied_guidelines_source?: 'pasted' | 'url' | null
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

// Review step (Sonnet): one answer scored with improvement tips.
export const ReviewResultSchema = z.object({
  score: z.number().min(0).max(10),
  tips: z.array(z.object({
    headline: z.string().min(1),
    detail: z.string().min(1),
  })).min(1).max(4),
  strengths: z.array(z.string()).max(2),
})
export type ReviewResult = z.infer<typeof ReviewResultSchema>

// Import step (Haiku): a previous application → proposed verbatim blocks.
export const ImportProposalSchema = z.object({
  blocks: z.array(z.object({
    block_type: z.enum(BLOCK_TYPES),
    title: z.string().min(1),
    content: z.string().min(1),
  })).min(1),
})
export type ImportProposal = z.infer<typeof ImportProposalSchema>

// ── Outline / EOI mode ───────────────────────────────────────────────────────
// Standard funding-proposal sections, used when there are no questions to
// paste (portal-gated forms, EOI-first funders, letter-style applications).
// Descended from the Phase 0 spike's DEFAULT_PROPOSAL_SECTIONS.

export const OUTLINE_TEMPLATE: { question_text: string; word_limit: number | null }[] = [
  { question_text: 'About your organisation: who you are, your mission, and the work you do', word_limit: 300 },
  { question_text: 'The need: the problem your work addresses, with evidence', word_limit: 300 },
  { question_text: 'Your project: what you will do, who it is for, and over what period', word_limit: 500 },
  { question_text: 'Outcomes: the difference it will make and how you will know', word_limit: 300 },
  { question_text: 'Budget: what the funding would be spent on', word_limit: 250 },
  { question_text: 'Why this funder: how the work fits their priorities', word_limit: 200 },
]

// Client-side mirror of the brief shape POST /api/agent/research/brief
// returns (the agent_thread_briefs row, minus model/prompt_version).
export type ProvenanceKind = 'catalogue' | 'researched' | 'adviser_judgment'
export interface Claim { text: string; provenance: ProvenanceKind }
export interface BriefSections {
  what_they_fund: Claim[]
  fit_against_purpose: Claim[]
  how_to_approach: Claim[]
  watch_outs: Claim[]
}
export interface Brief {
  id: string
  title: string
  sections: BriefSections
  created_at: string
}

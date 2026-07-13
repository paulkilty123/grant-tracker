// Client-side shape of a research thread, as returned by
// GET /api/agent/research/threads (JSON — camelCase, unlike the server-side
// ResearchThreadSummary in orchestrator/threads.ts which this mirrors).
export interface ResearchThreadSummary {
  id: string
  focusLabel: string | null
  focusPurposeId: string | null
  updatedAt: string
}

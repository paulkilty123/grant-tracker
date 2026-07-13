// Card shapes + the tool-payload -> card mapping (research agent v1, design
// spec §3). Cards render straight from loop.ts's PANEL_RESULT_SLIMMERS output
// (ChatCard[] on a ChatMessage) — no separate fetch, no separate shape.

import type { ChatCard } from '@/components/briefing/useAgentChat'

export interface CatalogueCardData {
  variant: 'catalogue'
  opportunity_id: string
  title: string
  funder: string
  funding_type: string
  amount_min: number | null
  amount_max: number | null
  amount_undisclosed: boolean
  deadline: string | null
  reason: string | null
  record_check: { status: 'checked' | 'unverified'; checked_at: string | null }
  /** Carried for brief generation's watch_outs section (api/agent/research/brief) — not otherwise rendered on the card face. */
  eligibility_status: string | null
  warning_codes: string[]
  size_note: string | null
  match_reasons: string[]
}

export interface ResearchedCardData {
  variant: 'researched'
  funder_key: string
  funder_name: string
  summary: string
  focus_notes: string[]
  source_urls: string[]
  fetched_at: string
}

export type OpportunityCardData = CatalogueCardData | ResearchedCardData

interface FitCardShape {
  opportunity_id: string
  title: string
  funder: string
  funding_type?: string
  amount_min: number | null
  amount_max: number | null
  amount_undisclosed: boolean
  deadline?: string | null
  match_reasons?: string[]
  eligibility_status?: string | null
  warning_codes?: string[]
  size_note?: string | null
  record_check: { status: 'checked' | 'unverified'; checked_at: string | null }
}

function fromFitCard(c: FitCardShape): CatalogueCardData {
  return {
    variant: 'catalogue',
    opportunity_id: c.opportunity_id,
    title: c.title,
    funder: c.funder,
    funding_type: c.funding_type ?? 'grant',
    amount_min: c.amount_min,
    amount_max: c.amount_max,
    amount_undisclosed: c.amount_undisclosed,
    deadline: c.deadline ?? null,
    reason: c.match_reasons?.[0] ?? null,
    record_check: c.record_check,
    eligibility_status: c.eligibility_status ?? null,
    warning_codes: c.warning_codes ?? [],
    size_note: c.size_note ?? null,
    match_reasons: c.match_reasons ?? [],
  }
}

/** Maps a turn's raw ChatCard[] (one entry per card-worthy tool_done event)
 *  into the card data this component tree renders. Unknown tool names are
 *  silently skipped — loop.ts's slimmer list is wider than what this page
 *  chooses to visualise (e.g. recommend_mix/set_funding_goal, consumed
 *  elsewhere, not here). */
export function cardsFromToolPayloads(cards: ChatCard[]): OpportunityCardData[] {
  const out: OpportunityCardData[] = []
  for (const c of cards) {
    if (c.tool === 'get_briefing') {
      const d = c.data as { candidates?: FitCardShape[] }
      for (const cand of d.candidates ?? []) out.push(fromFitCard(cand))
    } else if (c.tool === 'assess_opportunity_against_plan') {
      // assess_opportunity_against_plan's opportunity shape uses `id`, not
      // `opportunity_id` (assess.ts's AssessPayload) — remapped here rather
      // than in loop.ts's slimmer, which passes the tool's own field names
      // through untouched.
      const d = c.data as {
        opportunity?: { id: string; title: string; funder: string; funding_type?: string; amount_min: number | null; amount_max: number | null; amount_undisclosed: boolean; deadline?: string | null }
        eligibility?: { status: string; issues: Array<{ code: string }> }
        match_reasons?: string[]
      }
      if (d.opportunity) {
        out.push(fromFitCard({
          ...d.opportunity,
          opportunity_id: d.opportunity.id,
          match_reasons: d.match_reasons,
          eligibility_status: d.eligibility?.status ?? null,
          warning_codes: d.eligibility?.issues?.map(i => i.code) ?? [],
          record_check: { status: 'unverified', checked_at: null }, // assess doesn't carry link-check state
        }))
      }
    } else if (c.tool === 'cache_researched_funder') {
      const d = c.data as { funder_key?: string; funder_name?: string; summary?: string; focus_notes?: string[]; source_urls?: string[]; fetched_at?: string }
      if (d.funder_key && d.funder_name) {
        out.push({
          variant: 'researched',
          funder_key: d.funder_key,
          funder_name: d.funder_name,
          summary: d.summary ?? '',
          focus_notes: d.focus_notes ?? [],
          source_urls: d.source_urls ?? [],
          fetched_at: d.fetched_at ?? new Date().toISOString(),
        })
      }
    }
  }
  return out
}

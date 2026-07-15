// Card shapes + the tool-payload -> card mapping (research agent v1.1 §2:
// compose-then-render). A card only ever comes from ONE place now: a
// composed research note's shortlist/weaker entries, each already hydrated
// server-side (loop.ts) against this turn's real tool results — never
// rendered straight from a raw tool_done event (that path, cardsFromToolPayloads,
// is retired: nothing renders from tool results directly, per the amendment).

import type { ComposedNote } from '@/components/briefing/useAgentChat'

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
  /** v1.1 §3.3: a shortlist-only authored caveat — a plain question, doubles
   *  as the chip label and the next-turn message when tapped. Null for every
   *  weaker card (weaker's shape has no caveat) and for any shortlist card
   *  where the model didn't author one. */
  caveat: string | null
}

export interface ResearchedCardData {
  variant: 'researched'
  funder_key: string
  funder_name: string
  summary: string
  focus_notes: string[]
  source_urls: string[]
  fetched_at: string
  /** v1.1 §3.3 — see CatalogueCardData.caveat. */
  caveat: string | null
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
    // Overwritten unconditionally by composedNoteCards below with the
    // authored verdict/reason — this default only matters if cardFromEntry
    // is ever called outside that path (it isn't today).
    reason: c.match_reasons?.[0] ?? null,
    record_check: c.record_check,
    eligibility_status: c.eligibility_status ?? null,
    warning_codes: c.warning_codes ?? [],
    size_note: c.size_note ?? null,
    match_reasons: c.match_reasons ?? [],
    caveat: null,
  }
}

/** One composed-note card entry ({tool, data}) -> render-ready card data, or
 *  null if the entry's shape doesn't carry enough to render. A card-pool
 *  entry (loop.ts) is always ONE opportunity/funder already — get_briefing's
 *  entries are populated per-candidate there, not as the get_briefing
 *  wrapper, so this reads a single FitCardShape directly rather than
 *  unwrapping a `candidates` array. */
export function cardFromEntry(entry: { tool: string; data: unknown }): OpportunityCardData | null {
  if (entry.tool === 'get_briefing') {
    const d = entry.data as Partial<FitCardShape>
    if (!d.opportunity_id) return null
    return fromFitCard(d as FitCardShape)
  }
  if (entry.tool === 'assess_opportunity_against_plan') {
    // assess_opportunity_against_plan's opportunity shape uses `id`, not
    // `opportunity_id` (assess.ts's AssessPayload) — remapped here rather
    // than in loop.ts's slimmer, which passes the tool's own field names
    // through untouched.
    const d = entry.data as {
      opportunity?: { id: string; title: string; funder: string; funding_type?: string; amount_min: number | null; amount_max: number | null; amount_undisclosed: boolean; deadline?: string | null }
      eligibility?: { status: string; issues: Array<{ code: string }> }
      match_reasons?: string[]
    }
    if (!d.opportunity) return null
    return fromFitCard({
      ...d.opportunity,
      opportunity_id: d.opportunity.id,
      match_reasons: d.match_reasons,
      eligibility_status: d.eligibility?.status ?? null,
      warning_codes: d.eligibility?.issues?.map(i => i.code) ?? [],
      record_check: { status: 'unverified', checked_at: null }, // assess doesn't carry link-check state
    })
  }
  if (entry.tool === 'cache_researched_funder') {
    const d = entry.data as { funder_key?: string; funder_name?: string; summary?: string; focus_notes?: string[]; source_urls?: string[]; fetched_at?: string }
    if (!d.funder_key || !d.funder_name) return null
    return {
      variant: 'researched',
      funder_key: d.funder_key,
      funder_name: d.funder_name,
      summary: d.summary ?? '',
      focus_notes: d.focus_notes ?? [],
      source_urls: d.source_urls ?? [],
      fetched_at: d.fetched_at ?? new Date().toISOString(),
      caveat: null,
    }
  }
  return null
}

/** A composed note's shortlist/weaker entries -> render-ready cards, each
 *  carrying the adviser's own authored text for THIS turn (verdict/reason)
 *  instead of the raw match-reason/summary the source tool returned — the
 *  minimum §2 needs so a shortlist card shows judgment, not a template line.
 *  Entries whose ref didn't resolve server-side never reach here at all
 *  (loop.ts drops them before persisting/emitting). */
export function composedNoteCards(note: ComposedNote): {
  shortlist: Array<{ card: OpportunityCardData; verdict: string }>
  weaker: Array<{ card: OpportunityCardData; reason: string }>
} {
  const shortlist: Array<{ card: OpportunityCardData; verdict: string }> = []
  for (const item of note.shortlist) {
    const card = cardFromEntry(item)
    if (!card) continue
    const verdict = item.verdict ?? ''
    const caveat = item.caveat?.trim() || null
    shortlist.push({
      card: card.variant === 'catalogue' ? { ...card, reason: verdict, caveat } : { ...card, summary: verdict, caveat },
      verdict,
    })
  }
  const weaker: Array<{ card: OpportunityCardData; reason: string }> = []
  for (const item of note.weaker) {
    const card = cardFromEntry(item)
    if (!card) continue
    const reason = item.reason ?? ''
    weaker.push({
      card: card.variant === 'catalogue' ? { ...card, reason } : { ...card, summary: reason },
      reason,
    })
  }
  return { shortlist, weaker }
}

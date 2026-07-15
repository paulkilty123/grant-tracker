// Panel result slimmers — factored out of loop.ts so BOTH the live streaming
// loop and thread history reload (threads.ts's loadThreadView) use the exact
// same tool_done -> card-data mapping. Two call sites reading one definition
// means a reload can never drift from what a live turn showed (research
// agent v1 ship-gate, design spec §8 step 3/4: cards must survive a reload,
// not just render live).
//
// Tools whose results are streamed/replayed to the client so surfaces (the
// setup panel's "plan, assembling", the Research page's opportunity cards)
// render from TOOL DATA, never model prose. Whitelist + slimming — never a
// blanket pass-through.
export const PANEL_RESULT_SLIMMERS: Record<string, (data: unknown) => unknown> = {
  recommend_mix: d => d, // deterministic rulebook output, already slim
  set_funding_goal: d => {
    const r = d as { goal?: unknown; purposes?: unknown }
    return { goal: r.goal, purposes: r.purposes }
  },
  get_plan_state: d => {
    const r = d as { has_goal?: boolean; arithmetic?: unknown; purposes?: unknown }
    return { has_goal: r.has_goal, arithmetic: r.arithmetic ?? null, purposes: r.purposes ?? null }
  },
  get_briefing: d => {
    const r = d as { has_goal?: boolean; top_candidates?: unknown[]; catalogue_scanned?: number }
    // candidates: research agent v1 (design spec §3) — the Research page's
    // catalogue-verified opportunity cards render straight from this, the SAME
    // FitCard shape the briefing page's own candidate cards use (plan.ts).
    // candidate_count/has_goal are unchanged — SetupExperience only reads those.
    // catalogue_scanned (v1.1 §2): the research log's working-state checklist
    // line ("Checked N catalogue records · M candidates").
    return { has_goal: r.has_goal, candidate_count: r.top_candidates?.length ?? 0, candidates: r.top_candidates ?? [], catalogue_scanned: r.catalogue_scanned ?? null }
  },
  // Research agent v1 (design spec §3): a single catalogue-verified opportunity
  // deep-dive, rendered as one card the same way a get_briefing candidate is.
  assess_opportunity_against_plan: d => {
    const r = d as { opportunity?: unknown; eligibility?: unknown; match?: { positive_reasons?: string[] } }
    return {
      opportunity: r.opportunity ?? null,
      eligibility: r.eligibility ?? null,
      match_reasons: r.match?.positive_reasons ?? [],
    }
  },
  // Research agent v1 (design spec §3): the researched-live card's trigger.
  // The model calls cache_researched_funder as a cost-saving background action
  // (research.ts steering) — that SAME call is the UI's signal to render a
  // researched-live card, so caching and card-rendering share one event
  // instead of needing a second, purpose-built "present a finding" tool. The
  // tool's own result echoes back what was written, so no params round-trip.
  cache_researched_funder: d => d,
}

/** Card-worthy for RELOAD reconstruction specifically (threads.ts). Every
 *  slimmed tool is technically re-renderable, but only these actually have a
 *  Research-page card renderer (cards.ts) — reconstructing the others (e.g.
 *  recommend_mix, set_funding_goal) would be dead weight on every thread
 *  reload for zero visual benefit, since nothing reads them there. */
export const RESEARCH_CARD_TOOLS = new Set(['get_briefing', 'assess_opportunity_against_plan', 'cache_researched_funder'])

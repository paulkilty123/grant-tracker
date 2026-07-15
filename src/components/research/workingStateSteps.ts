// Pure step-label derivation (v1.1 §2 checklist / §7c honesty eval) —
// extracted out of WorkingState.tsx so it's callable outside React: the
// working-state-honesty eval drives this directly over captured tool
// events, it never renders the component.
//
// The invariant this exists to protect: every line is a projection of real
// tool activity, and carries no data the source event didn't. A line either
// interpolates a literal token straight from that tool's own tool_done.data
// (get_briefing's counts, cache_researched_funder's funder name/summary,
// assess_opportunity_against_plan's title), or — for check_researched_funder/
// flag_for_verification, which never carry tool_done data (not in
// PANEL_RESULT_SLIMMERS) — falls back to one of the fixed generic constants
// below. Never both: a generic-tier tool must never fabricate a specific
// detail the event can't support.

export function stepLineFor(entry: { tool: string; data: unknown }, occurrenceIndexForTool = 0): string | null {
  const { tool, data } = entry
  if (tool === 'compose_research_note') return null // the final answer container, not a step

  if (tool === 'get_briefing') {
    const d = data as { catalogue_scanned?: number | null; candidate_count?: number } | undefined
    if (d && typeof d.candidate_count === 'number') {
      const scanned = typeof d.catalogue_scanned === 'number' ? `${d.catalogue_scanned} catalogue records · ` : ''
      return `Checked ${scanned}${d.candidate_count} candidate${d.candidate_count === 1 ? '' : 's'}`
    }
    return 'Checked your briefing'
  }
  if (tool === 'assess_opportunity_against_plan') {
    const d = data as { opportunity?: { title?: string } } | undefined
    return d?.opportunity?.title ? `Checked ${d.opportunity.title}'s fit` : 'Checked an opportunity’s fit'
  }
  if (tool === 'cache_researched_funder') {
    const d = data as { funder_name?: string; summary?: string } | undefined
    if (d?.funder_name) {
      const summary = (d.summary ?? '').trim()
      return summary ? `Researched ${d.funder_name} live · ${truncateAtWordBoundary(summary, 90)}` : `Researched ${d.funder_name} live`
    }
    return 'Researched a funder live'
  }
  // check_researched_funder / flag_for_verification never carry tool_done
  // data today — honest but generic, never a fabricated name or number.
  if (tool === 'check_researched_funder') return 'Checked the research cache'
  if (tool === 'flag_for_verification') return 'Staged a find for verification'
  if (tool === 'web_search' || tool === 'web_fetch') return occurrenceIndexForTool === 0 ? 'Researching live…' : 'Still researching live…'
  // Unrecognised tool (a research thread can technically call any non-
  // researchOnly tool too) — still a real step, just plainly named.
  return `Checked ${tool.replace(/_/g, ' ')}`
}

// Cut at a word boundary, not mid-word — matches loop.ts's fallback-note
// truncation, same reasoning: a hard character slice can land inside a word.
function truncateAtWordBoundary(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, text.lastIndexOf(' ', max)).trimEnd() + '…'
}

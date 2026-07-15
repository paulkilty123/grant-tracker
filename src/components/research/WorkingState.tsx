'use client'

// v1.1 §2 (compose-then-render). The live checklist shown inside the
// adviser's reply bubble WHILE a research turn is in progress — nothing
// renders from raw tool results anymore, this is a presentational transform
// of the same tool_start/tool_done activity that used to render raw cards.
// Steps derive from real tool activity only, never invented: each line's
// text comes from that tool's own returned data where available (get_briefing/
// assess_opportunity_against_plan/cache_researched_funder carry real data on
// tool_done; check_researched_funder/flag_for_verification don't today, so
// their lines stay honest but generic rather than naming a funder they don't
// have data for).

import React from 'react'
import { COLOR, grotesk } from '@/components/briefing/ui'
import type { ChatCard } from '@/components/briefing/useAgentChat'

function stepLabel(tool: string, data: unknown, occurrenceIndexForTool: number): string {
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
      return summary ? `Researched ${d.funder_name} live · ${summary.length > 90 ? summary.slice(0, 90) + '…' : summary}` : `Researched ${d.funder_name} live`
    }
    return 'Researched a funder live'
  }
  // check_researched_funder / flag_for_verification never carry tool_done
  // data today (not in PANEL_RESULT_SLIMMERS) — honest but generic.
  if (tool === 'check_researched_funder') return 'Checked the research cache'
  if (tool === 'flag_for_verification') return 'Staged a find for verification'
  if (tool === 'web_search' || tool === 'web_fetch') return occurrenceIndexForTool === 0 ? 'Researching live…' : 'Still researching live…'
  // Unrecognised tool (a research thread can technically call any non-
  // researchOnly tool too) — still a real step, just plainly named.
  return `Checked ${tool.replace(/_/g, ' ')}`
}

export default function WorkingState({ toolNames, cards }: { toolNames: string[]; cards: ChatCard[] }) {
  const cardsByTool = new Map<string, unknown[]>()
  for (const c of cards) {
    const list = cardsByTool.get(c.tool) ?? []
    list.push(c.data)
    cardsByTool.set(c.tool, list)
  }
  const seenCount = new Map<string, number>()
  const steps: string[] = []
  for (const tool of toolNames) {
    if (tool === 'compose_research_note') continue // the final answer container, not a step
    const occurrence = seenCount.get(tool) ?? 0
    seenCount.set(tool, occurrence + 1)
    const data = cardsByTool.get(tool)?.[occurrence]
    steps.push(stepLabel(tool, data, occurrence))
  }

  return (
    <div style={{ fontSize: 12.5, color: COLOR.mid, lineHeight: 1.7 }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ color: COLOR.sage }}>&#10003;</span>
          <span>{s}</span>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, color: COLOR.faint, ...grotesk, fontWeight: 500 }}>
        <span>&hellip;</span>
        <span>Writing up what&apos;s worth your time&hellip;</span>
      </div>
    </div>
  )
}

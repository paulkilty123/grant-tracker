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
import { stepLineFor } from './workingStateSteps'
import type { ChatCard } from '@/components/briefing/useAgentChat'

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
    const occurrence = seenCount.get(tool) ?? 0
    seenCount.set(tool, occurrence + 1)
    const data = cardsByTool.get(tool)?.[occurrence]
    const line = stepLineFor({ tool, data }, occurrence)
    if (line) steps.push(line)
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

'use client'

// The Companion ask bar (briefing v3): the conversation entry point, one of the
// page's two permitted lime accents. Extracted from CompanionDrawer so it can be
// placed in the page flow — on the briefing it sits directly beneath My read, so
// the conversation reads as the immediate continuation of the read. It carries no
// chat state: clicks dispatch COMPANION_OPEN_EVENT, which the drawer (rendered
// separately) listens for, opening with an optional prefilled prompt.

import { grotesk, COLOR, CompanionMark } from './ui'
import { openCompanion } from './CompanionOpenLink'
import { ADVISER_BOUNDARY } from '@/lib/agent/copy'

export default function CompanionAskBar({ examplePrompt, suggestions = [] }: { examplePrompt: string; suggestions?: string[] }) {
  return (
    <div className="w-full max-w-3xl mx-auto mt-4">
      <div className="bg-white rounded-xl p-3 flex items-center gap-3" style={{ border: `2px solid ${COLOR.lime}` }}>
        <CompanionMark size={30} />
        <button onClick={() => openCompanion()} className="flex-1 text-left text-sm cursor-text" style={{ color: COLOR.faint }}>
          Ask your adviser<span className="hidden sm:inline"> — e.g. “{examplePrompt}”</span>
        </button>
        <button
          onClick={() => openCompanion()}
          className="text-sm font-semibold px-4 py-2 rounded-lg shrink-0"
          style={{ ...grotesk, background: COLOR.lime, color: COLOR.forest }}
        >
          Ask
        </button>
      </div>
      <div className="flex items-center gap-2 flex-wrap mt-2">
        {suggestions.slice(0, 3).map(s => (
          <button
            key={s}
            onClick={() => openCompanion(s)}
            className="text-[12px] px-2.5 py-1 rounded-full"
            style={{ background: COLOR.pale, color: COLOR.sage, border: '1px solid #DCE8C8' }}
          >
            {s}
          </button>
        ))}
        <span className="text-[11px] ml-auto" style={{ color: COLOR.faint }}>{ADVISER_BOUNDARY}</span>
      </div>
    </div>
  )
}

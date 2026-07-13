'use client'

// Thread tab row — 11 July mockup. Active = lime-bordered pill on surface;
// inactive = hairline pill; trailing "+ New thread" is accent TEXT, not a
// pill (the mockup's accent-discipline note: only the active tab + the input
// bar carry lime on this page).

import React from 'react'
import { COLOR, grotesk } from '@/components/briefing/ui'
import type { ResearchThreadSummary } from './types'

export default function ThreadTabs({
  threads,
  activeId,
  onSelect,
  onNewThread,
}: {
  threads: ResearchThreadSummary[]
  activeId: string | null
  onSelect: (id: string) => void
  onNewThread: () => void
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap px-1 pb-3 mb-3" style={{ borderBottom: `1px solid ${COLOR.hair}` }}>
      {threads.map(t => {
        const active = t.id === activeId
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            style={{
              ...grotesk,
              fontSize: 12.5,
              fontWeight: 500,
              padding: '6px 13px',
              borderRadius: 999,
              cursor: 'pointer',
              background: active ? '#fff' : 'transparent',
              color: active ? COLOR.ink : COLOR.mid,
              border: active ? `1.5px solid ${COLOR.lime}` : `1px solid ${COLOR.hair}`,
            }}
          >
            {t.focusLabel || 'New thread'}
          </button>
        )
      })}
      <button
        onClick={onNewThread}
        style={{ ...grotesk, fontSize: 12.5, fontWeight: 600, color: COLOR.sage, background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px 8px' }}
      >
        + New thread
      </button>
    </div>
  )
}

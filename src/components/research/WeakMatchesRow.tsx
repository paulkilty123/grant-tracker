'use client'

// v1.1 §2 (compose-then-render). "Weaker matches collapsed into one row...
// that expands on tap." Collapsed by default; each entry already carries the
// adviser's own one-line reason (composedNoteCards, cards.ts) baked into the
// card's judgment-text field, same as a shortlist card.

import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { COLOR, grotesk } from '@/components/briefing/ui'
import OpportunityCard, { type OpportunityCardActions } from './OpportunityCard'
import type { OpportunityCardData } from './cards'

export default function WeakMatchesRow({
  items,
  actions,
}: {
  items: Array<{ card: OpportunityCardData; reason: string }>
  actions: OpportunityCardActions
}) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null

  return (
    <div className="mt-2" style={{ border: `1px solid ${COLOR.hair}`, borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-1.5 px-3 py-2.5 text-left"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        {open ? <ChevronDown size={13} color={COLOR.faint} /> : <ChevronRight size={13} color={COLOR.faint} />}
        <span style={{ ...grotesk, fontSize: 12, fontWeight: 500, color: COLOR.mid }}>
          Also matched, weaker fit: {items.length}
        </span>
      </button>
      {open && (
        <div className="px-2 pb-2">
          {items.map(({ card }, i) => (
            <OpportunityCard key={i} data={card} actions={actions} />
          ))}
        </div>
      )}
    </div>
  )
}

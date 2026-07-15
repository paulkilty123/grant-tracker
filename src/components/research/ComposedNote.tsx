'use client'

// v1.1 §2 (compose-then-render). The reply renders ONCE, as a composed
// research note: (a) the adviser's read, (b) SHORTLIST IN ORDER, ranked
// cards, (c) weaker matches collapsed into one row. No unranked card dumps.

import React from 'react'
import Markdown from '@/components/briefing/Markdown'
import { COLOR, grotesk } from '@/components/briefing/ui'
import OpportunityCard, { type OpportunityCardActions } from './OpportunityCard'
import WeakMatchesRow from './WeakMatchesRow'
import { composedNoteCards } from './cards'
import type { ComposedNote as ComposedNoteData } from '@/components/briefing/useAgentChat'

export default function ComposedNote({
  note,
  actions,
}: {
  note: ComposedNoteData
  actions: OpportunityCardActions
}) {
  const { shortlist, weaker } = composedNoteCards(note)

  return (
    <div>
      {note.read && <Markdown>{note.read}</Markdown>}
      {shortlist.length > 0 && (
        <>
          <div className="mt-3 mb-1.5" style={{ ...grotesk, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: COLOR.faint }}>
            Shortlist &middot; in order
          </div>
          {shortlist.map(({ card }, i) => (
            <OpportunityCard key={i} data={card} actions={actions} />
          ))}
        </>
      )}
      <WeakMatchesRow items={weaker} actions={actions} />
    </div>
  )
}

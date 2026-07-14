'use client'

// Shared brief-sections rendering (research agent v1.1 §5) -- extracted from
// OpportunityCard's BriefBlock so the pinned research log's expand-in-place
// preview, the "Open full profile" modal, and the inline card all render the
// same claims the same way. Provenance chrome unchanged from v1 (spec §2/§3):
// catalogue is the default unmarked chrome; researched gets the amber
// treatment; adviser_judgment is marked as the adviser's own read.

import React from 'react'
import { COLOR, grotesk } from '@/components/briefing/ui'
import type { Brief, ProvenanceKind } from './brief-types'

function claimTag(provenance: ProvenanceKind): { label: string; color: string } | null {
  if (provenance === 'researched') return { label: 'researched', color: COLOR.amberInk }
  if (provenance === 'adviser_judgment') return { label: 'my read', color: COLOR.faint }
  return null
}

const SECTION_HEADINGS: Array<{ key: keyof Brief['sections']; heading: string }> = [
  { key: 'what_they_fund', heading: 'What they fund' },
  { key: 'fit_against_purpose', heading: 'Fit against your purpose' },
  { key: 'how_to_approach', heading: 'How to approach' },
  { key: 'watch_outs', heading: 'Watch outs' },
]

/** Full rendering: every claim, every section. Used inline on the card and inside the "Open full profile" modal. */
export function BriefSectionsFull({ brief }: { brief: Brief }) {
  return (
    <>
      {SECTION_HEADINGS.map(({ key, heading }) => {
        const claims = brief.sections[key]
        if (!claims || claims.length === 0) return null
        return (
          <div key={key} className="mt-2.5">
            <div style={{ ...grotesk, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: COLOR.faint }}>{heading}</div>
            <ul className="mt-1 pl-4" style={{ listStyle: 'disc' }}>
              {claims.map((c, i) => {
                const tag = claimTag(c.provenance)
                return (
                  <li key={i} className="mt-0.5" style={{ fontSize: 12.5, lineHeight: 1.5, color: COLOR.ink }}>
                    {c.text}
                    {tag && <span style={{ fontSize: 10.5, color: tag.color, marginLeft: 5 }}>· {tag.label}</span>}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </>
  )
}

/** Condensed preview: one line per section (first claim only). Used for the research log's in-panel expand-in-place, which stays compact -- "Open full profile" is where the complete claim list lives. */
export function BriefSectionsSummary({ brief }: { brief: Brief }) {
  return (
    <div className="mt-1.5">
      {SECTION_HEADINGS.map(({ key, heading }) => {
        const first = brief.sections[key]?.[0]
        if (!first) return null
        return (
          <div key={key} className="mt-1" style={{ fontSize: 11.5, lineHeight: 1.45, color: COLOR.ink }}>
            <span style={{ color: COLOR.faint }}>{heading}: </span>
            {first.text}
          </div>
        )
      })}
    </div>
  )
}

'use client'

// Opportunity card — two variants, per the 11 July Research section mockup.
// Catalogue-verified: lime [Add to pipeline] + hairline [Save for later] /
// [Funder profile]. Researched-live: amber "researched live" badge, NO
// add-to-pipeline (restricted-actions rule, design spec §2), hairline
// [Save for later] / [Research deeper] / [Pin]. The two variants' chrome is
// never conflated (spec §2's provenance discipline).
//
// v1.1 §4: "Funder profile" is a shallow, user-facing-only rename of what
// was "Brief" (same treatment as Companion -> Adviser). Internal identifiers
// (brief.ts, agent_thread_briefs, the Brief type, handleWriteBrief, etc.)
// deliberately keep their original names — only the copy the user reads changed.

import React, { useState } from 'react'
import { formatRange } from '@/lib/utils'
import { COLOR, grotesk, fmtDate, AmberPill } from '@/components/briefing/ui'
import type { CatalogueCardData, OpportunityCardData } from './cards'
import type { Brief, ProvenanceKind } from './brief-types'

// Add to pipeline's fill colour: the 11 July mockup called this chip "forest
// solid, the primary"; CLAUDE.md's locked button-hierarchy rule assigns
// card-level +Pipeline to LIME fill instead. Resolved 2026-07-13 — CLAUDE.md
// wins, the mockup's "forest solid" is superseded on this one point.
const chipBase: React.CSSProperties = {
  ...grotesk,
  fontSize: 12.5,
  fontWeight: 500,
  padding: '5px 11px',
  borderRadius: 999,
  border: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}
const chipLime: React.CSSProperties = { ...chipBase, background: COLOR.lime, color: COLOR.forest }
const chipHairline: React.CSSProperties = { ...chipBase, background: '#fff', color: COLOR.ink, border: `1px solid ${COLOR.hair}` }
const chipHairlineDone: React.CSSProperties = { ...chipHairline, color: COLOR.sage, borderColor: COLOR.weighted }

function Chip({ label, done, style, onClick, disabled }: { label: string; done?: boolean; style: React.CSSProperties; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ ...style, ...(disabled ? { opacity: 0.55, cursor: 'default' } : {}) }}
    >
      {done ? '✓ ' : ''}{label}
    </button>
  )
}

// Provenance chrome for a brief claim (spec §2/§3): catalogue is the default,
// unmarked chrome (already what a card's own catalogue-verified content
// looks like); researched gets the same amber treatment as the card badge —
// never visually conflated with catalogue; adviser_judgment is marked as the
// adviser's own read, not a fact from either source.
function claimTag(provenance: ProvenanceKind): { label: string; color: string } | null {
  if (provenance === 'researched') return { label: 'researched', color: COLOR.amberInk }
  if (provenance === 'adviser_judgment') return { label: 'my read', color: COLOR.faint }
  return null
}

function BriefSection({ heading, claims }: { heading: string; claims: Array<{ text: string; provenance: ProvenanceKind }> }) {
  if (claims.length === 0) return null
  return (
    <div className="mt-2.5">
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
}

function BriefBlock({ brief, onPin }: { brief: Brief; onPin?: () => void }) {
  const [pinned, setPinned] = useState(false)
  return (
    <div className="mt-2.5" style={{ borderTop: `1px solid ${COLOR.hair}`, paddingTop: 10 }}>
      <div className="flex items-center justify-between">
        <span style={{ ...grotesk, fontSize: 12.5, fontWeight: 600, color: COLOR.ink }}>{brief.title}</span>
        <button
          onClick={() => { setPinned(true); onPin?.() }}
          disabled={pinned}
          style={{ ...grotesk, fontSize: 11, fontWeight: 500, color: pinned ? COLOR.sage : COLOR.mid, background: 'transparent', border: 'none', cursor: pinned ? 'default' : 'pointer' }}
        >
          {pinned ? '✓ Pinned' : 'Pin this profile'}
        </button>
      </div>
      <BriefSection heading="What they fund" claims={brief.sections.what_they_fund} />
      <BriefSection heading="Fit against your purpose" claims={brief.sections.fit_against_purpose} />
      <BriefSection heading="How to approach" claims={brief.sections.how_to_approach} />
      <BriefSection heading="Watch outs" claims={brief.sections.watch_outs} />
    </div>
  )
}

export interface OpportunityCardActions {
  onAddToPipeline?: (data: CatalogueCardData) => void
  onSaveForLater?: (data: OpportunityCardData) => void
  onPin?: (data: OpportunityCardData) => void
  onResearchDeeper?: (data: OpportunityCardData) => void
  onWriteBrief?: (data: CatalogueCardData) => Promise<Brief>
  onPinBrief?: (brief: Brief, data: OpportunityCardData) => void
}

export default function OpportunityCard({ data, actions }: { data: OpportunityCardData; actions: OpportunityCardActions }) {
  const [added, setAdded] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [briefLoading, setBriefLoading] = useState(false)
  const [brief, setBrief] = useState<Brief | null>(null)
  const [briefError, setBriefError] = useState<string | null>(null)

  async function requestBrief() {
    if (data.variant !== 'catalogue' || briefLoading || brief) return
    setBriefLoading(true)
    setBriefError(null)
    try {
      const b = await actions.onWriteBrief?.(data)
      if (b) setBrief(b)
    } catch (e) {
      setBriefError(e instanceof Error ? e.message : 'Brief generation failed.')
    } finally {
      setBriefLoading(false)
    }
  }

  const isCatalogue = data.variant === 'catalogue'
  const amountLabel = isCatalogue ? formatRange(data.amount_min, data.amount_max, data.amount_undisclosed) : null

  return (
    <div
      className="my-2"
      style={{ border: `1px solid ${COLOR.hair}`, borderRadius: 10, padding: '11px 13px', background: '#fff' }}
    >
      {/* Title line: title + amount (catalogue) or amber badge (researched) */}
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ ...grotesk, fontSize: 13.5, fontWeight: 500, color: COLOR.ink }}>
            {isCatalogue ? data.title : data.funder_name}
          </span>
          {!isCatalogue && <AmberPill>researched live · not yet in catalogue</AmberPill>}
        </div>
        {isCatalogue && (
          <span style={{ ...grotesk, fontSize: 12.5, fontWeight: 500, color: COLOR.mid, flexShrink: 0 }}>{amountLabel}</span>
        )}
      </div>

      {isCatalogue && (
        <div className="mt-0.5" style={{ fontSize: 12, color: COLOR.faint }}>{data.funder}</div>
      )}

      {/* Reason sentence + verification chrome (catalogue) or summary (researched) */}
      <p className="mt-1.5 mb-0" style={{ fontSize: 13, lineHeight: 1.5, color: COLOR.ink }}>
        {isCatalogue ? (data.reason ?? 'Matches your profile.') : data.summary}
        {isCatalogue && (
          <span style={{ fontSize: 11.5, color: COLOR.faint, marginLeft: 6 }}>
            {data.record_check.status === 'checked'
              ? `· ✓ checked against funder site${data.record_check.checked_at ? ` · ${fmtDate(data.record_check.checked_at)}` : ''}`
              : '· not yet link-checked'}
          </span>
        )}
      </p>
      {!isCatalogue && data.source_urls.length > 0 && (
        <p className="mt-1 mb-0" style={{ fontSize: 11.5, color: COLOR.faint }}>
          source: <a href={data.source_urls[0]} target="_blank" rel="noreferrer" style={{ color: COLOR.sage }}>{data.source_urls[0]}</a>
        </p>
      )}

      {/* Action chips */}
      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
        {isCatalogue ? (
          <>
            <Chip label={added ? 'Added' : 'Add to pipeline'} done={added} style={chipLime} disabled={added}
              onClick={() => { setAdded(true); actions.onAddToPipeline?.(data) }} />
            <Chip label={saved ? 'Saved' : 'Save for later'} done={saved} style={saved ? chipHairlineDone : chipHairline} disabled={saved}
              onClick={() => { setSaved(true); actions.onSaveForLater?.(data) }} />
            <Chip label={briefLoading ? 'Writing…' : brief ? 'Profile written' : 'Funder profile'} done={!!brief} style={brief ? chipHairlineDone : chipHairline} disabled={briefLoading || !!brief}
              onClick={requestBrief} />
          </>
        ) : (
          <>
            <Chip label={saved ? 'Saved' : 'Save for later'} done={saved} style={saved ? chipHairlineDone : chipHairline} disabled={saved}
              onClick={() => { setSaved(true); actions.onSaveForLater?.(data) }} />
            <Chip label="Research deeper" style={chipHairline} onClick={() => actions.onResearchDeeper?.(data)} />
            <Chip label={pinned ? 'Pinned' : 'Pin'} done={pinned} style={pinned ? chipHairlineDone : chipHairline} disabled={pinned}
              onClick={() => { setPinned(true); actions.onPin?.(data) }} />
          </>
        )}
      </div>
      {briefError && (
        <p className="mt-1.5 mb-0" style={{ fontSize: 11.5, color: '#993C1D' }}>{briefError}</p>
      )}
      {brief && <BriefBlock brief={brief} onPin={() => actions.onPinBrief?.(brief, data)} />}
    </div>
  )
}

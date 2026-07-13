'use client'

// Opportunity card — two variants, per the 11 July Research section mockup.
// Catalogue-verified: forest [Add to pipeline] + hairline [Save for later] /
// [Write me a brief]. Researched-live: amber "researched live" badge, NO
// add-to-pipeline (restricted-actions rule, design spec §2), hairline
// [Save for later] / [Research deeper] / [Pin]. The two variants' chrome is
// never conflated (spec §2's provenance discipline).

import React, { useState } from 'react'
import { formatRange } from '@/lib/utils'
import { COLOR, grotesk, fmtDate, AmberPill } from '@/components/briefing/ui'
import type { CatalogueCardData, OpportunityCardData } from './cards'

// NOTE on Add to pipeline's fill colour: the 11 July mockup calls this chip
// "forest solid, the primary". CLAUDE.md's locked button-hierarchy rule
// assigns card-level +Pipeline to LIME fill instead. Built to the mockup as
// pasted — flagging the conflict for Paul to reconcile on review, not
// resolving it silently (the exact discipline this page's own steering
// asks of the model, applied to the build itself).
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
const chipForest: React.CSSProperties = { ...chipBase, background: COLOR.forest, color: COLOR.pale }
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

export interface OpportunityCardActions {
  onAddToPipeline?: (data: CatalogueCardData) => void
  onSaveForLater?: (data: OpportunityCardData) => void
  onPin?: (data: OpportunityCardData) => void
  onResearchDeeper?: (data: OpportunityCardData) => void
}

export default function OpportunityCard({ data, actions }: { data: OpportunityCardData; actions: OpportunityCardActions }) {
  const [added, setAdded] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [briefRequested, setBriefRequested] = useState(false)

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
            <Chip label={added ? 'Added' : 'Add to pipeline'} done={added} style={chipForest} disabled={added}
              onClick={() => { setAdded(true); actions.onAddToPipeline?.(data) }} />
            <Chip label={saved ? 'Saved' : 'Save for later'} done={saved} style={saved ? chipHairlineDone : chipHairline} disabled={saved}
              onClick={() => { setSaved(true); actions.onSaveForLater?.(data) }} />
            <Chip label={briefRequested ? 'Brief requested' : 'Write me a brief'} style={chipHairline} disabled={briefRequested}
              onClick={() => setBriefRequested(true)} />
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
      {briefRequested && (
        <p className="mt-1.5 mb-0" style={{ fontSize: 11.5, color: COLOR.faint }}>
          Brief generation is coming in the next build step — not wired up yet.
        </p>
      )}
    </div>
  )
}

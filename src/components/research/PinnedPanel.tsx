'use client'

// Research log (v1.1 §5, "pins grown up" -- was "Pinned in this thread").
// Sticky, top-aligned card titled "📌 Research log" with a count; every pin
// is typed (profile / finding / decision) with a one-line meta (type · date ·
// status). Collapsed by default; each pin expands in place -- a profile pin
// lazily fetches its full brief and shows a condensed summary plus an "Open
// full profile" link to the complete claims; a finding shows its body and
// source kind. Below the width breakpoint the page collapses this into a
// toggle/accordion above the input (handled by the parent).

import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { COLOR, grotesk, fmtDate } from '@/components/briefing/ui'
import { getBrief } from '@/lib/agent/briefs'
import { BriefSectionsSummary } from './BriefSections'
import BriefProfileModal from './BriefProfileModal'
import type { Pin, PinType } from '@/lib/agent/pins'
import type { Brief } from './brief-types'

function typeLabel(t: PinType): string {
  return t === 'profile' ? 'profile' : t === 'decision' ? 'decision' : 'finding'
}

// "status" example values named in the spec (in pipeline / flagged for
// verification) map onto the pin's own source_kind -- a catalogue-verified
// find, a live-researched (not yet catalogue-verified) find, or the
// adviser's own judgment call. No separate status field: this is the same
// signal PinnedPanel already carried pre-v1.1, just labelled per the spec.
function statusLabel(sourceKind: Pin['source_kind']): string {
  if (sourceKind === 'researched') return 'flagged for verification'
  if (sourceKind === 'adviser_judgment') return "adviser's read"
  return 'in pipeline'
}

function metaLine(pin: Pin): string {
  const date = fmtDate(pin.created_at) ?? pin.created_at.slice(0, 10)
  return `${typeLabel(pin.pin_type)} · ${date} · ${statusLabel(pin.source_kind)}`
}

function sourceKindLabel(sourceKind: Pin['source_kind']): string {
  if (sourceKind === 'researched') return 'researched live'
  if (sourceKind === 'adviser_judgment') return "adviser's read"
  return 'catalogue'
}

function PinRow({ pin, isLast }: { pin: Pin; isLast: boolean }) {
  const [open, setOpen] = useState(false)
  const [brief, setBrief] = useState<Brief | null>(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const [briefError, setBriefError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && pin.pin_type === 'profile' && pin.brief_id && !brief && !briefLoading) {
      setBriefLoading(true)
      setBriefError(null)
      try {
        const b = await getBrief(pin.brief_id)
        setBrief(b)
        if (!b) setBriefError('This profile is no longer available.')
      } catch {
        setBriefError('Could not load this profile.')
      } finally {
        setBriefLoading(false)
      }
    }
  }

  return (
    <div style={{ borderBottom: isLast ? 'none' : `1px solid ${COLOR.hair}` }}>
      <button
        onClick={toggle}
        className="w-full flex items-start gap-1.5 px-3.5 py-2.5 text-left"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <span className="mt-0.5 flex-shrink-0" style={{ color: COLOR.faint }}>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        <span className="flex-1">
          <span className="block" style={{ fontSize: 12, fontWeight: 500, color: COLOR.ink, lineHeight: 1.4 }}>{pin.title}</span>
          <span className="block" style={{ fontSize: 11, color: COLOR.mid, marginTop: 2 }}>{metaLine(pin)}</span>
        </span>
      </button>

      {open && (
        <div className="px-3.5 pb-3" style={{ paddingLeft: 29 }}>
          {pin.pin_type === 'profile' ? (
            <>
              {briefLoading && <div style={{ fontSize: 11.5, color: COLOR.faint }}>Loading…</div>}
              {briefError && <div style={{ fontSize: 11.5, color: '#993C1D' }}>{briefError}</div>}
              {brief && (
                <>
                  <BriefSectionsSummary brief={brief} />
                  <button
                    onClick={() => setModalOpen(true)}
                    className="mt-1.5"
                    style={{ ...grotesk, fontSize: 11, fontWeight: 500, color: COLOR.sage, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    Open full profile →
                  </button>
                  {modalOpen && <BriefProfileModal brief={brief} onClose={() => setModalOpen(false)} />}
                </>
              )}
            </>
          ) : (
            <div style={{ fontSize: 12, color: COLOR.ink, lineHeight: 1.5 }}>
              {pin.body ?? 'No further detail recorded.'}
              <div className="mt-1" style={{ fontSize: 11, color: COLOR.faint }}>{sourceKindLabel(pin.source_kind)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function PinnedPanel({ pins }: { pins: Pin[] }) {
  return (
    <div style={{ border: `1px solid ${COLOR.hair}`, borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
      <div className="flex items-center justify-between px-3.5 py-3" style={{ borderBottom: `1px solid ${COLOR.hair}` }}>
        <span style={{ ...grotesk, fontSize: 13, fontWeight: 600, color: COLOR.ink }}>📌 Research log</span>
        <span style={{ ...grotesk, fontSize: 11.5, fontWeight: 500, color: COLOR.faint }}>{pins.length}</span>
      </div>

      {pins.length === 0 ? (
        <div className="px-3.5 py-4" style={{ fontSize: 12, color: COLOR.faint }}>
          Nothing logged yet. Pin a card to build this thread&apos;s research log.
        </div>
      ) : (
        <div>
          {pins.map((p, i) => (
            <PinRow key={p.id} pin={p} isLast={i === pins.length - 1} />
          ))}
        </div>
      )}

      <div className="px-3.5 py-2.5" style={{ borderTop: `1px solid ${COLOR.hair}`, fontSize: 11, color: COLOR.faint }}>
        This thread&apos;s research log. It feeds your adviser&apos;s memory.
      </div>
    </div>
  )
}

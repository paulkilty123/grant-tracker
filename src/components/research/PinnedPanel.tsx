'use client'

// Pinned panel — 11 July mockup. Sticky, top-aligned card titled "📌 Pinned in
// this thread" with a count; each pin is a title + one meta line, hairline-
// divided; a muted footer line. Below the width breakpoint the page collapses
// this into a toggle/accordion above the input (handled by the parent).

import React from 'react'
import { COLOR, grotesk, fmtDate } from '@/components/briefing/ui'
import type { Pin } from '@/lib/agent/pins'

function metaLine(pin: Pin): string {
  const date = fmtDate(pin.created_at) ?? pin.created_at.slice(0, 10)
  const kind = pin.source_kind === 'catalogue' ? 'in pipeline' : pin.source_kind === 'researched' ? 'researched' : "adviser's read"
  return pin.body ? `${pin.body} · ${kind} ${date}` : `${kind} ${date}`
}

export default function PinnedPanel({ pins }: { pins: Pin[] }) {
  return (
    <div style={{ border: `1px solid ${COLOR.hair}`, borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
      <div className="flex items-center justify-between px-3.5 py-3" style={{ borderBottom: `1px solid ${COLOR.hair}` }}>
        <span style={{ ...grotesk, fontSize: 13, fontWeight: 600, color: COLOR.ink }}>📌 Pinned in this thread</span>
        <span style={{ ...grotesk, fontSize: 11.5, fontWeight: 500, color: COLOR.faint }}>{pins.length}</span>
      </div>

      {pins.length === 0 ? (
        <div className="px-3.5 py-4" style={{ fontSize: 12, color: COLOR.faint }}>
          Nothing pinned yet. Pin a card to build this thread&apos;s research log.
        </div>
      ) : (
        <div>
          {pins.map((p, i) => (
            <div
              key={p.id}
              className="px-3.5 py-2.5"
              style={{ borderBottom: i < pins.length - 1 ? `1px solid ${COLOR.hair}` : 'none' }}
            >
              <div style={{ fontSize: 12, fontWeight: 500, color: COLOR.ink, lineHeight: 1.4 }}>{p.title}</div>
              <div style={{ fontSize: 11, color: COLOR.mid, marginTop: 2 }}>{metaLine(p)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="px-3.5 py-2.5" style={{ borderTop: `1px solid ${COLOR.hair}`, fontSize: 11, color: COLOR.faint }}>
        Pins are this thread&apos;s research log. They feed your adviser&apos;s memory.
      </div>
    </div>
  )
}

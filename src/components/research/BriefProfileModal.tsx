'use client'

// "Open full profile" (research agent v1.1 §5) -- the research log's
// profile pins expand in place with a condensed summary; this modal is
// where the complete, all-claims profile lives. Same overlay pattern as
// NewThreadModal.

import React from 'react'
import { COLOR, grotesk } from '@/components/briefing/ui'
import { BriefSectionsFull } from './BriefSections'
import type { Brief } from './brief-types'

export default function BriefProfileModal({ brief, onClose }: { brief: Brief; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: 'rgba(44,44,42,0.35)' }} onClick={onClose}>
      <div
        style={{ width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto', background: 'var(--surface-card)', borderRadius: 14 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5" style={{ borderBottom: `1px solid ${COLOR.hair}` }}>
          <span style={{ ...grotesk, fontSize: 15, fontWeight: 600, color: COLOR.ink }}>{brief.title}</span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ ...grotesk, fontSize: 13, fontWeight: 500, background: 'transparent', border: 'none', cursor: 'pointer', color: COLOR.mid }}
          >
            Close
          </button>
        </div>
        <div className="px-5 pb-5">
          <BriefSectionsFull brief={brief} />
        </div>
      </div>
    </div>
  )
}

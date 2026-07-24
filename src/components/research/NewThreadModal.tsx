'use client'

import React, { useState } from 'react'
import { COLOR, grotesk } from '@/components/briefing/ui'

export default function NewThreadModal({ onClose, onCreate }: { onClose: () => void; onCreate: (focusLabel: string) => void }) {
  const [label, setLabel] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: 'rgba(44,44,42,0.35)' }} onClick={onClose}>
      <div
        style={{ width: '100%', maxWidth: 380, background: 'var(--surface-card)', borderRadius: 14, overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5">
          <div style={{ ...grotesk, fontSize: 15, fontWeight: 600, color: COLOR.ink, marginBottom: 4 }}>New research thread</div>
          <div style={{ fontSize: 12.5, color: COLOR.mid, marginBottom: 14 }}>What&apos;s this thread about? Optional — you can leave it and it&apos;ll pick up a label as the conversation develops.</div>
          <input
            autoFocus
            value={label}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onCreate(label.trim()) }}
            placeholder="e.g. Schools programme, Capital for VR kit"
            style={{ width: '100%', height: 40, border: `0.5px solid rgba(0,0,0,0.14)`, borderRadius: 10, padding: '0 12px', fontSize: 13.5, fontFamily: 'inherit', outline: 'none' }}
          />
        </div>
        <div className="flex justify-end gap-2 p-4" style={{ borderTop: `1px solid ${COLOR.hair}` }}>
          <button
            onClick={onClose}
            style={{ ...grotesk, fontSize: 13, fontWeight: 500, padding: '8px 16px', borderRadius: 10, cursor: 'pointer', background: 'transparent', border: 'none', color: COLOR.mid }}
          >
            Cancel
          </button>
          <button
            onClick={() => onCreate(label.trim())}
            style={{ ...grotesk, fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 10, cursor: 'pointer', border: 'none', background: COLOR.forest, color: COLOR.pale }}
          >
            Start thread
          </button>
        </div>
      </div>
    </div>
  )
}

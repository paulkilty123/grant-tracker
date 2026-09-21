'use client'

import React, { useState } from 'react'
import { Bookmark, Check } from 'lucide-react'

/**
 * "Save this fund" for a SIGNED-IN reader of the public record page. Posts to
 * /api/save-grant, which resolves the organisation server-side. Logged-out
 * readers do not see this button in pass 1 (the carry-through is pass 2).
 */
export default function SaveFundButton({
  grantId, reminderAt, alreadySaved, ui, deep, hair,
}: {
  grantId: string
  reminderAt: string | null
  alreadySaved: boolean
  ui: string
  deep: string
  hair: string
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'error'>(alreadySaved ? 'saved' : 'idle')
  const [message, setMessage] = useState<string | null>(null)

  async function save() {
    if (state === 'saved' || state === 'busy') return
    setState('busy')
    try {
      const res = await fetch('/api/save-grant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grantId, reminderAt }),
      })
      const j = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) { setState('error'); setMessage(j.error ?? 'Could not save. Try again.'); return }
      setState('saved')
    } catch {
      setState('error'); setMessage('Could not save. Try again.')
    }
  }

  const saved = state === 'saved'
  return (
    <>
      <button
        type="button"
        onClick={save}
        disabled={state === 'busy' || saved}
        aria-live="polite"
        style={{
          marginTop: 10, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: saved ? '#EFF5EE' : '#FFFFFF', color: saved ? '#2F6B3A' : deep,
          border: `1.5px solid ${saved ? 'transparent' : hair}`, borderRadius: 999, padding: '12px 18px',
          fontFamily: ui, fontWeight: 600, fontSize: 15, cursor: saved ? 'default' : 'pointer',
        }}
      >
        {saved ? <Check style={{ width: 16, height: 16 }} /> : <Bookmark style={{ width: 16, height: 16 }} />}
        {saved ? 'Saved to your list' : state === 'busy' ? 'Saving…' : 'Save this fund'}
      </button>
      <div style={{ marginTop: 8, textAlign: 'center', fontSize: 12, color: state === 'error' ? '#993C1D' : '#6B7D76' }}>
        {state === 'error' ? message : saved ? (reminderAt ? 'We’ll remind you before it closes' : 'On your saved list') : (reminderAt ? 'We’ll remind you before it closes' : 'Keep it on your saved list')}
      </div>
    </>
  )
}

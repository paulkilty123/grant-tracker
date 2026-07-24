'use client'

import { useState } from 'react'

export default function ClearProfileButton() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleClick() {
    if (busy) return
    const ok = window.confirm(
      "Simulates a 'Set up later' user. Wipes org name, annual income, sectors, beneficiaries, location, mission, preferences, pipeline and saved grants. Other users are unaffected. Continue?"
    )
    if (!ok) return

    setBusy(true)
    setError(null)
    setDone(false)
    try {
      const res = await fetch('/api/admin/clear-profile', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Clear failed')
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Clear failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-card p-5 mb-7" style={{ border: '0.5px solid rgba(23,52,4,0.08)' }}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-display text-base font-bold text-charcoal">Clear my profile</h3>
          <p className="text-xs text-mid mt-1 max-w-md">
            Simulates a &ldquo;Set up later&rdquo; user. Wipes org name, annual income, sectors, beneficiaries, location, mission, preferences, pipeline and saved grants. Other users are unaffected. After clearing, navigate directly to the page you want to preview without signing out.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {done && <span className="text-xs font-medium" style={{ color: 'var(--state-success)' }}>Cleared. Refresh the page you want to preview.</span>}
          {error && <span className="text-xs font-medium text-coral-deep">{error}</span>}
          <button
            onClick={handleClick}
            disabled={busy}
            className="text-sm font-semibold rounded-[10px] px-4 py-2"
            style={{
              fontFamily: 'var(--font-space-grotesk)',
              background: 'var(--state-error-pale)',
              color: 'var(--state-error)',
              border: '0.5px solid rgba(153,60,29,0.25)',
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Clearing...' : 'Clear profile'}
          </button>
        </div>
      </div>
    </div>
  )
}

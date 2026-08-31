'use client'

import { useState } from 'react'

/**
 * Starts a checkout and sends the browser to Stripe.
 *
 * The refusal cases are rendered rather than swallowed. `/api/billing/checkout`
 * answers 409 with a specific message for the states that are not faults —
 * already subscribed, Team is not self-serve, the founding offer has closed —
 * and showing "something went wrong" for those would turn an answerable
 * question into a support email.
 */
export default function BuyButton({
  plan, period, kind = 'standard', label,
}: {
  plan: string
  period: 'monthly' | 'annual'
  kind?: 'standard' | 'founding'
  label: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function go() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan, period, kind }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Could not start checkout.')
        setBusy(false)
        return
      }
      if (!data.url) {
        setError('Checkout started but returned no address. Nothing has been charged.')
        setBusy(false)
        return
      }
      window.location.href = data.url
    } catch {
      setError('Could not reach us. Nothing has been charged.')
      setBusy(false)
    }
  }

  return (
    <div>
      <button
        onClick={go}
        disabled={busy}
        style={{
          width: '100%',
          fontFamily: 'var(--font-space-grotesk)',
          fontWeight: 600, fontSize: 15,
          background: '#8ECB3C', color: '#173404',
          border: 'none', borderRadius: 8,
          padding: '11px 18px',
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? 'Starting…' : label}
      </button>
      {error && (
        <p style={{ marginTop: 10, marginBottom: 0, fontSize: 13, color: '#993C1D', lineHeight: 1.4 }}>
          {error}
        </p>
      )}
    </div>
  )
}

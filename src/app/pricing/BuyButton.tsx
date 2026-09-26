'use client'

import { useState } from 'react'

/**
 * Starts a checkout and sends the browser to Stripe.
 *
 * The refusal cases are rendered rather than swallowed. `/api/billing/checkout`
 * answers 409 with a specific message for the states that are not faults —
 * already subscribed, Team is not self-serve, an offer has closed — and
 * showing "something went wrong" for those would turn an answerable question
 * into a support email.
 *
 * Styled as the landing page's pill buttons: deep fill for the plan we lead
 * with, deep outline for the others. Not the app's lime, which is for actions
 * inside the product.
 */
const DEEP = '#1D3C3E', CREAM = '#F6F1E7'
const GROTESK = "var(--font-space-grotesk), 'Space Grotesk', sans-serif"

export default function BuyButton({
  plan, period, kind = 'standard', label, variant = 'primary',
}: {
  plan: string
  period: 'monthly' | 'annual'
  kind?: 'standard' | 'launch' | 'founding'
  label: string
  variant?: 'primary' | 'ghost'
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
          width: '100%', fontFamily: GROTESK, fontWeight: 600, fontSize: 16, padding: '15px 32px', borderRadius: 999,
          background: variant === 'primary' ? DEEP : 'transparent',
          color: variant === 'primary' ? CREAM : DEEP,
          border: `1.5px solid ${DEEP}`,
          cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
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

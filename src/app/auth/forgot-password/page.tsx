'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import LogoMark from '@/components/icons/LogoMark'
import '@/styles/shoots-band-a.css'

/* Band A page 3 — forgot password.
   ============================================================
   A re-skin, not a redesign. The two states, the enumeration-safe wording and
   the "Not arrived?" help box are all as they were; what changes is colour,
   radius, borders and button style.

   Two pieces of copy are load-bearing and must not be tidied:

   "If <address> has an account, a reset link is on its way" — the conditional
   is deliberate. Saying "we've sent a link to X" confirms to anyone typing an
   address that an account exists, which is the same disclosure the sign-in
   error avoids. Spec section 6.

   "You can only request one link per hour" — resetPasswordForEmail is rate
   limited to roughly one send per hour per address, and a second request
   inside that hour sends nothing at all, silently. Without this line a user
   who mistypes, corrects, and resends waits an hour for an email that was
   never sent.
   ============================================================ */

function EnvelopeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"
         style={{ color: 'var(--deep)' }}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.9" />
      <path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 4.6v4.2M8 11.2v.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const redirectTo = `${window.location.origin}/auth/reset-password`

    // Normalise: a trailing space or stray capital silently makes the address
    // not match an account, so the email goes nowhere while the UI says "sent".
    const cleanEmail = email.trim().toLowerCase()
    setEmail(cleanEmail)
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
      setLoading(false)
    }
  }

  return (
    <div className="shoots-a">
      <div className="page">

        <header>
          <Link href="/" className="brand">
            <LogoMark size={28} />
            <span>shoots</span>
          </Link>
        </header>

        <main className="centred">
          <div style={{ width: '100%', maxWidth: 452 }}>
            <div className="card">

              {sent ? (
                <>
                  <div className="badge badge-sage"><EnvelopeIcon /></div>
                  <h1 className="t-status">Check your email</h1>
                  <p className="t-body" style={{ marginTop: 8, marginBottom: 20 }}>
                    If <strong style={{ color: 'var(--charcoal)', fontWeight: 600 }}>{email}</strong> has an
                    account, a reset link is on its way. Click it to set a new password.
                  </p>

                  <div className="note">
                    <p className="note-h">Not arrived?</p>
                    <ul>
                      <li>Check your spam or junk folder</li>
                      <li>Allow a minute or two for delivery</li>
                      <li>Check it&apos;s exactly the address you signed up with, including the spelling and domain (e.g. .co vs .com)</li>
                      <li>You can only request one link per hour</li>
                    </ul>
                  </div>

                  <div style={{ textAlign: 'center', marginTop: 20 }}>
                    <button type="button" className="btn btn-tertiary" onClick={() => setSent(false)}>
                      Try a different email address
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h1 className="t-title">Reset your password</h1>
                  <p className="t-body" style={{ marginTop: 8 }}>
                    Enter the email address for your account and we&apos;ll send you a link to set a new password.
                  </p>

                  <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 26 }}>
                    {error && (
                      <div className="banner" role="alert">
                        <AlertIcon />
                        <span>{error}</span>
                      </div>
                    )}

                    <div className="field">
                      <label htmlFor="email">Email address</label>
                      <input
                        id="email"
                        className="input"
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="you@organisation.org"
                        autoComplete="email"
                        required
                      />
                    </div>

                    <button type="submit" className="btn btn-primary btn-block" disabled={loading} style={{ marginTop: 4 }}>
                      {loading ? <><span className="spin" />Sending…</> : 'Send reset link'}
                    </button>
                  </form>
                </>
              )}

              <div className="card-foot">
                <Link href="/auth/login" className="btn btn-tertiary">Back to sign in</Link>
              </div>

            </div>
          </div>
        </main>

      </div>
    </div>
  )
}

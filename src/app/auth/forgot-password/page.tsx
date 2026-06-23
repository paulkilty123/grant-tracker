'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import LogoMark from '@/components/icons/LogoMark'

const UI = "var(--font-space-grotesk), Space Grotesk, sans-serif"
const BODY = "var(--font-dm-sans), Plus Jakarta Sans, sans-serif"

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
    <div style={{ background: '#FAFAF7', minHeight: '100vh', fontFamily: BODY, color: '#2C2C2A' }}>

      {/* NAV */}
      <nav style={{ background: 'white', borderBottom: '0.5px solid rgba(23,52,4,0.08)', padding: '18px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
            <LogoMark size={30} />
            <span style={{ fontFamily: UI, fontWeight: 700, fontSize: 24, letterSpacing: '-0.025em', color: '#2C2C2A' }}>GrantTracker</span>
          </Link>
          <Link href="/" style={{ fontFamily: UI, fontSize: 13.5, color: '#5F5E5A', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={14} /> Back to home
          </Link>
        </div>
      </nav>

      <div style={{ maxWidth: 460, margin: '0 auto', padding: '64px 24px 48px' }}>

        <div style={{ background: 'white', borderRadius: 16, padding: '40px 36px', boxShadow: '0 2px 24px rgba(23,52,4,0.06)', border: '0.5px solid rgba(23,52,4,0.06)' }}>
          {sent ? (
            <>
              <h1 style={{ fontFamily: UI, fontWeight: 500, fontSize: 24, letterSpacing: '-0.02em', color: '#2C2C2A', marginBottom: 10 }}>
                Check your email
              </h1>
              <p style={{ fontFamily: BODY, fontSize: 14.5, color: '#5F5E5A', lineHeight: 1.55, marginBottom: 18 }}>
                If <strong style={{ color: '#2C2C2A' }}>{email}</strong> has an account, a reset link is on its way. Click it to set a new password.
              </p>
              <div style={{ background: '#F5F1E8', border: '0.5px solid rgba(180,135,40,0.18)', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                <p style={{ fontFamily: UI, fontWeight: 500, fontSize: 12, color: '#2C2C2A', marginBottom: 6 }}>Not arrived?</p>
                <ul style={{ fontFamily: BODY, fontSize: 12.5, color: '#5F5E5A', lineHeight: 1.6, paddingLeft: 18, margin: 0 }}>
                  <li>Check your spam or junk folder</li>
                  <li>Allow a minute or two for delivery</li>
                  <li>Check it&apos;s exactly the address you signed up with — including the spelling and domain (e.g. .co vs .com)</li>
                  <li>You can only request one link per hour</li>
                </ul>
              </div>
              <button
                onClick={() => setSent(false)}
                style={{ fontFamily: UI, fontSize: 13, color: '#3B6D11', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Try a different email address
              </button>
            </>
          ) : (
            <>
              <h1 style={{ fontFamily: UI, fontWeight: 500, fontSize: 28, lineHeight: 1.15, letterSpacing: '-0.02em', color: '#2C2C2A', marginBottom: 6 }}>
                Reset your password
              </h1>
              <p style={{ fontFamily: BODY, fontSize: 14.5, color: '#5F5E5A', lineHeight: 1.55, marginBottom: 24 }}>
                Enter the email address for your account and we&apos;ll send you a link to set a new password.
              </p>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {error && (
                  <div style={{ background: '#FAECE7', border: '0.5px solid rgba(153,60,29,0.25)', color: '#993C1D', fontSize: 13, padding: '11px 14px', borderRadius: 10 }}>
                    {error}
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontFamily: UI, fontWeight: 500, fontSize: 13, color: '#2C2C2A', marginBottom: 6 }}>Email address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="form-input"
                    placeholder="you@organisation.org"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    marginTop: 4,
                    background: '#8ECB3C',
                    color: '#173404',
                    fontFamily: UI,
                    fontWeight: 600,
                    fontSize: 15,
                    padding: '13px 22px',
                    borderRadius: 10,
                    border: 'none',
                    cursor: loading ? 'default' : 'pointer',
                    opacity: loading ? 0.7 : 1,
                    transition: 'opacity 0.15s',
                  }}
                >
                  {loading ? 'Sending...' : 'Send reset link'}
                </button>
              </form>
            </>
          )}

          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '0.5px solid rgba(23,52,4,0.08)', textAlign: 'center' }}>
            <Link href="/auth/login" style={{ fontFamily: UI, fontSize: 13, color: '#5F5E5A', textDecoration: 'none' }}>
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

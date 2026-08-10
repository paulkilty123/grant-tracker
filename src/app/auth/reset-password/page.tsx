'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import LogoMark from '@/components/icons/LogoMark'
import {
  parseRecoveryLink,
  messageForErrorCode,
  isMissingVerifierError,
} from '@/lib/auth/recovery-link'

const UI = "var(--font-space-grotesk), Space Grotesk, sans-serif"
const BODY = "var(--font-dm-sans), Plus Jakarta Sans, sans-serif"

/**
 * Recovery link handling.
 *
 * The old version of this page only ever looked for `?code=`. When the code was
 * absent it silently dropped through to a fully usable password form with no
 * session behind it, so `updateUser()` failed with "Auth session missing!" after
 * the user had typed a new password. The code is absent in the common cases:
 * Supabase redirects here with `?error=access_denied&error_code=otp_expired`
 * when the single-use token has already been spent, which is exactly what an
 * Outlook / M365 safe-links scanner causes when it prefetches the link before
 * the human clicks it.
 *
 * Two changes fix that:
 *
 * 1. Nothing is consumed on GET. We read the token out of the URL but only
 *    redeem it when the user clicks "Continue". A scanner fetching this page
 *    does not burn the token. This is why the email template should point at
 *    `?token_hash={{ .TokenHash }}&type=recovery` rather than
 *    `{{ .ConfirmationURL }}` (see docs/password-reset-flow.md).
 * 2. The form never renders unless a session actually exists. Every other
 *    outcome lands on an explicit expired state with a resend control.
 *
 * `?code=` is still handled so links already sitting in inboxes keep working.
 */
type Phase = 'checking' | 'confirm' | 'ready' | 'invalid'

type Credential =
  | { kind: 'token_hash'; value: string }
  | { kind: 'code'; value: string }

function ResetPasswordContent() {
  const [phase, setPhase] = useState<Phase>('checking')
  const [credential, setCredential] = useState<Credential | null>(null)
  const [invalidReason, setInvalidReason] = useState<string>('')

  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [redeeming, setRedeeming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const [resendEmail, setResendEmail] = useState('')
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const [resendError, setResendError] = useState<string | null>(null)

  const router = useRouter()

  const fail = useCallback((reason: string) => {
    setInvalidReason(reason)
    setPhase('invalid')
  }, [])

  // Work out what we were handed, but do not spend it yet.
  useEffect(() => {
    let cancelled = false

    async function classify() {
      const link = parseRecoveryLink(window.location.search, window.location.hash)

      if (link.kind === 'error') {
        if (!cancelled) fail(link.message)
        return
      }
      if (link.kind === 'token_hash') {
        if (!cancelled) {
          setCredential({ kind: 'token_hash', value: link.token })
          setPhase('confirm')
        }
        return
      }
      if (link.kind === 'code') {
        if (!cancelled) {
          setCredential({ kind: 'code', value: link.code })
          setPhase('confirm')
        }
        return
      }

      // No token in the URL. The implicit flow puts tokens in the hash and the
      // client library consumes them on load, so an established session here is
      // legitimate. Anything else is a dead link.
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (session) {
        setPhase('ready')
      } else {
        fail('This page needs a valid reset link. Request a new one below and use the link in the email.')
      }
    }

    classify()
    return () => { cancelled = true }
  }, [fail])

  // Redeeming happens here, behind a real click, never on page load.
  async function handleRedeem() {
    if (!credential) return
    setRedeeming(true)
    const supabase = createClient()

    if (credential.kind === 'token_hash') {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: credential.value,
        type: 'recovery',
      })
      if (error) {
        console.error('[reset-password] verifyOtp failed', error)
        setRedeeming(false)
        fail(messageForErrorCode(error.code ?? null, error.message))
        return
      }
    } else {
      const { error } = await supabase.auth.exchangeCodeForSession(credential.value)
      if (error) {
        console.error('[reset-password] exchangeCodeForSession failed', error)
        setRedeeming(false)
        // PKCE ties the code to the browser that asked for the reset, so opening
        // the email on another device lands here with no verifier stored.
        fail(
          isMissingVerifierError(error.message)
            ? 'This link has to be opened in the same browser you requested the reset from. Request a new link below and open it on this device.'
            : messageForErrorCode(error.code ?? null, error.message)
        )
        return
      }
    }

    // Confirm the session really landed before showing a form that depends on it.
    const { data: { session } } = await supabase.auth.getSession()
    setRedeeming(false)
    if (!session) {
      console.error('[reset-password] redeemed token but no session was established')
      fail('We could not verify that link. Request a new one below.')
      return
    }
    setPhase('ready')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPw) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const supabase = createClient()

    // Belt and braces: if the session expired while the form sat open, say so
    // instead of surfacing a raw "Auth session missing!" from the library.
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setLoading(false)
      fail('Your reset link expired before the new password was saved. Request a new one below.')
      return
    }

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      console.error('[reset-password] updateUser failed', error)
      setError(error.message)
      setLoading(false)
    } else {
      setDone(true)
      setTimeout(() => router.push('/dashboard'), 2500)
    }
  }

  async function handleResend(e: React.FormEvent) {
    e.preventDefault()
    setResendError(null)
    setResending(true)
    const supabase = createClient()
    const clean = resendEmail.trim().toLowerCase()
    const { error } = await supabase.auth.resetPasswordForEmail(clean, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    setResending(false)
    if (error) {
      setResendError(error.message)
    } else {
      setResent(true)
    }
  }

  const card: React.CSSProperties = {
    background: 'white',
    borderRadius: 16,
    padding: '40px 36px',
    boxShadow: '0 2px 24px rgba(23,52,4,0.06)',
    border: '0.5px solid rgba(23,52,4,0.06)',
  }
  const heading: React.CSSProperties = {
    fontFamily: UI,
    fontWeight: 500,
    fontSize: 26,
    lineHeight: 1.15,
    letterSpacing: '-0.02em',
    color: '#2C2C2A',
    marginBottom: 8,
  }
  const bodyText: React.CSSProperties = {
    fontFamily: BODY,
    fontSize: 14.5,
    color: '#5F5E5A',
    lineHeight: 1.55,
  }
  const limeButton: React.CSSProperties = {
    background: '#8ECB3C',
    color: '#173404',
    fontFamily: UI,
    fontWeight: 600,
    fontSize: 15,
    padding: '13px 22px',
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
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
        <div style={card}>

          {phase === 'checking' && (
            <p style={{ ...bodyText, fontSize: 14, textAlign: 'center', padding: '12px 0' }}>Checking your reset link...</p>
          )}

          {/* Click to redeem. Nothing is spent until this button is pressed, so a
              mail scanner that prefetches the link cannot use up the token. */}
          {phase === 'confirm' && (
            <>
              <h1 style={heading}>Reset your password</h1>
              <p style={{ ...bodyText, marginBottom: 24 }}>
                Confirm it&apos;s you to carry on. You&apos;ll choose a new password on the next step.
              </p>
              <button
                onClick={handleRedeem}
                disabled={redeeming}
                style={{ ...limeButton, width: '100%', opacity: redeeming ? 0.7 : 1, cursor: redeeming ? 'default' : 'pointer' }}
              >
                {redeeming ? 'Checking...' : 'Continue'}
              </button>
            </>
          )}

          {phase === 'ready' && !done && (
            <>
              <h1 style={{ ...heading, fontSize: 28, marginBottom: 6 }}>Choose a new password</h1>
              <p style={{ ...bodyText, marginBottom: 24 }}>Pick something at least 8 characters long.</p>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {error && (
                  <div style={{ background: '#FAECE7', border: '0.5px solid rgba(153,60,29,0.25)', color: '#993C1D', fontSize: 13, padding: '11px 14px', borderRadius: 10 }}>
                    {error}
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontFamily: UI, fontWeight: 500, fontSize: 13, color: '#2C2C2A', marginBottom: 6 }}>New password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="form-input"
                      style={{ paddingRight: 56 }}
                      placeholder="At least 8 characters"
                      required
                      minLength={8}
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontFamily: UI, fontSize: 12, color: '#8A8986', background: 'transparent', border: 'none', cursor: 'pointer' }} tabIndex={-1}>
                      {showPw ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontFamily: UI, fontWeight: 500, fontSize: 13, color: '#2C2C2A', marginBottom: 6 }}>Confirm new password</label>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={confirmPw}
                    onChange={e => setConfirmPw(e.target.value)}
                    className="form-input"
                    placeholder={'••••••••'}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  style={{ ...limeButton, marginTop: 4, opacity: loading ? 0.7 : 1, cursor: loading ? 'default' : 'pointer' }}
                >
                  {loading ? 'Saving...' : 'Set new password'}
                </button>
              </form>
            </>
          )}

          {done && (
            <>
              <h1 style={{ ...heading, fontSize: 24 }}>Password updated</h1>
              <p style={bodyText}>Taking you to your dashboard...</p>
            </>
          )}

          {/* Dead link. Never show a password form here: anything typed could not
              be saved, which is the whole reason this page was broken. */}
          {phase === 'invalid' && (
            <>
              <h1 style={{ ...heading, fontSize: 24 }}>Reset link expired</h1>
              <p style={{ ...bodyText, marginBottom: 22 }}>{invalidReason}</p>

              {resent ? (
                <div style={{ background: '#F1F7E4', border: '0.5px solid rgba(59,109,17,0.2)', borderRadius: 10, padding: '14px 16px' }}>
                  <p style={{ fontFamily: UI, fontWeight: 500, fontSize: 13, color: '#3B6D11', marginBottom: 4 }}>New link sent</p>
                  <p style={{ ...bodyText, fontSize: 13, margin: 0 }}>
                    If that address has an account, a fresh reset link is on its way. It expires in one hour.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleResend} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {resendError && (
                    <div style={{ background: '#FAECE7', border: '0.5px solid rgba(153,60,29,0.25)', color: '#993C1D', fontSize: 13, padding: '11px 14px', borderRadius: 10 }}>
                      {resendError}
                    </div>
                  )}
                  <div>
                    <label style={{ display: 'block', fontFamily: UI, fontWeight: 500, fontSize: 13, color: '#2C2C2A', marginBottom: 6 }}>Email address</label>
                    <input
                      type="email"
                      value={resendEmail}
                      onChange={e => setResendEmail(e.target.value)}
                      className="form-input"
                      placeholder="you@organisation.org"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={resending}
                    style={{ ...limeButton, opacity: resending ? 0.7 : 1, cursor: resending ? 'default' : 'pointer' }}
                  >
                    {resending ? 'Sending...' : 'Send me a new link'}
                  </button>
                </form>
              )}
            </>
          )}

          {!done && phase !== 'checking' && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '0.5px solid rgba(23,52,4,0.08)', textAlign: 'center' }}>
              <Link href="/auth/login" style={{ fontFamily: UI, fontSize: 13, color: '#5F5E5A', textDecoration: 'none' }}>
                Back to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div style={{ background: '#FAFAF7', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: BODY, fontSize: 14, color: '#5F5E5A' }}>Loading...</p>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}

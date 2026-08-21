'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import LogoMark from '@/components/icons/LogoMark'
import {
  parseRecoveryLink,
  messageForErrorCode,
  isMissingVerifierError,
} from '@/lib/auth/recovery-link'
import '@/styles/shoots-band-a.css'

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
 *
 * ── Band A re-skin note ──────────────────────────────────────────────────
 * The four-phase state machine below is untouched. Only presentation changed.
 * Two things about that presentation are decisions, not decoration:
 *
 * The expired state is GOLD, not red. For M365 users, and most of these users
 * are, a safe-links scanner spending the token before they click is routine.
 * It is a normal step in the path, not a mistake they made, and the resend
 * field is the primary action rather than an afterthought.
 *
 * The confirm phase is headed "You're nearly there", not "Reset your
 * password". /auth/forgot-password already opens with "Reset your password",
 * and a user who hits a dead link sees the second one immediately after the
 * first. Same words, different page, different meaning.
 */
type Phase = 'checking' | 'confirm' | 'ready' | 'invalid'

type Credential =
  | { kind: 'token_hash'; value: string }
  | { kind: 'code'; value: string }

function LockIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: 'var(--deep)' }}>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.4" stroke="currentColor" strokeWidth="1.9" />
      <path d="M8 10.5V7.8a4 4 0 018 0v2.7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

function TickIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: 'var(--deep)' }}>
      <path d="M5 12.5l4.6 4.5L19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: 'var(--deep)' }}>
      <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="1.9" />
      <path d="M12 7.6V12l2.9 2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
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
            <div className={`card${phase === 'checking' || done ? ' card-centred' : ''}`}>

              {phase === 'checking' && (
                <div style={{ padding: '14px 0 10px' }}>
                  <div className="spin-dark" style={{ marginBottom: 20 }} />
                  <h1 className="t-status" style={{ marginBottom: 6 }}>Checking your reset link…</h1>
                  <p className="t-body">This only takes a moment.</p>
                </div>
              )}

              {/* Click to redeem. Nothing is spent until this button is pressed, so a
                  mail scanner that prefetches the link cannot use up the token. */}
              {phase === 'confirm' && (
                <>
                  <div className="badge badge-sage"><LockIcon /></div>
                  <h1 className="t-title">You&apos;re nearly there</h1>
                  <p className="t-body" style={{ marginTop: 8, marginBottom: 24 }}>
                    Your link is valid. Click continue to confirm it&apos;s you, then choose a new password.
                  </p>
                  <button
                    className="btn btn-primary btn-block"
                    onClick={handleRedeem}
                    disabled={redeeming}
                  >
                    {redeeming ? <><span className="spin" />Checking…</> : 'Continue'}
                  </button>
                </>
              )}

              {phase === 'ready' && !done && (
                <>
                  <h1 className="t-title">Choose a new password</h1>
                  <p className="t-body" style={{ marginTop: 8 }}>Pick something at least 8 characters long.</p>

                  <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 26 }}>
                    {error && (
                      <div className="banner" role="alert">
                        <AlertIcon />
                        <span>{error}</span>
                      </div>
                    )}

                    <div className="field">
                      <label htmlFor="password">New password</label>
                      <div className="pw">
                        <input
                          id="password"
                          className="input"
                          type={showPw ? 'text' : 'password'}
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          placeholder="At least 8 characters"
                          autoComplete="new-password"
                          required
                          minLength={8}
                        />
                        <button
                          type="button"
                          className="reveal"
                          onClick={() => setShowPw(v => !v)}
                          aria-label={showPw ? 'Hide password' : 'Show password'}
                        >
                          {showPw ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </div>

                    <div className="field">
                      <label htmlFor="confirm-password">Confirm new password</label>
                      <input
                        id="confirm-password"
                        className="input"
                        type={showPw ? 'text' : 'password'}
                        value={confirmPw}
                        onChange={e => setConfirmPw(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        required
                      />
                    </div>

                    <button type="submit" className="btn btn-primary btn-block" disabled={loading} style={{ marginTop: 4 }}>
                      {loading ? <><span className="spin" />Saving…</> : 'Set new password'}
                    </button>
                  </form>
                </>
              )}

              {done && (
                <div style={{ padding: '8px 0 4px' }}>
                  <div className="badge badge-sage"><TickIcon /></div>
                  <h1 className="t-status" style={{ marginBottom: 7 }}>Password updated</h1>
                  <p className="t-body">Taking you to your dashboard…</p>
                </div>
              )}

              {/* Dead link. Never show a password form here: anything typed could not
                  be saved, which is the whole reason this page was broken.
                  Gold rather than red: for M365 users a safe-links scanner burning
                  the token is routine, not a mistake they made. */}
              {phase === 'invalid' && (
                <>
                  <div className="badge badge-gold"><ClockIcon /></div>
                  <h1 className="t-status">Reset link expired</h1>
                  <p className="t-body" style={{ marginTop: 8, marginBottom: 22 }}>{invalidReason}</p>

                  {resent ? (
                    <div className="note-success">
                      <p className="note-h">New link sent</p>
                      <p className="t-meta">
                        If that address has an account, a fresh reset link is on its way. It expires in one hour.
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={handleResend} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {resendError && (
                        <div className="banner" role="alert">
                          <AlertIcon />
                          <span>{resendError}</span>
                        </div>
                      )}

                      <div className="field">
                        <label htmlFor="resend-email">Email address</label>
                        <input
                          id="resend-email"
                          className="input"
                          type="email"
                          value={resendEmail}
                          onChange={e => setResendEmail(e.target.value)}
                          placeholder="you@organisation.org"
                          autoComplete="email"
                          required
                        />
                      </div>

                      <button type="submit" className="btn btn-primary btn-block" disabled={resending} style={{ marginTop: 4 }}>
                        {resending ? <><span className="spin" />Sending…</> : 'Send a new link'}
                      </button>
                    </form>
                  )}
                </>
              )}

              {!done && phase !== 'checking' && (
                <div className="card-foot">
                  <Link href="/auth/login" className="btn btn-tertiary">Back to sign in</Link>
                </div>
              )}

            </div>
          </div>
        </main>

      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="shoots-a">
        <div className="page">
          <main className="centred">
            <div style={{ width: '100%', maxWidth: 452 }}>
              <div className="card card-centred">
                <div style={{ padding: '14px 0 10px' }}>
                  <div className="spin-dark" style={{ marginBottom: 20 }} />
                  <h1 className="t-status" style={{ marginBottom: 6 }}>Checking your reset link…</h1>
                  <p className="t-body">This only takes a moment.</p>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}

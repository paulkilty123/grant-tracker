'use client'

import { useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { isOnboardingComplete, computePostLoginPath } from '@/lib/onboarding'
import LogoMark from '@/components/icons/LogoMark'
import '@/styles/shoots-band-a.css'

/* Band A direction A — centred card on cream, max-width 436px.
   Presentation is rebuilt against the Shoots tokens; the routing and session
   logic below is unchanged from the lime-era page and deliberately so.

   Google sign-in is absent on purpose. All 31 auth identities on the project
   are `email` and the provider has never been used, so this ships as the
   spec's section 7 email-only fallback: no "or" divider left orphaned, and a
   hairline-topped footer where the Google block would have sat. Adding it
   later is the divider, the button and one call to signInWithOAuth. */

const ERROR_MESSAGES: Record<string, string> = {
  // One message for both halves. Confirming that an email is valid tells
  // someone guessing that an account exists. Spec section 6.
  'Invalid login credentials': 'Email or password is not correct.',
  'Email not confirmed': 'Please check your email and click the confirmation link first.',
  'Too many requests': 'Too many attempts. Please wait a few minutes and try again.',
}

const URL_ERROR_MESSAGES: Record<string, string> = {
  'otp_expired':         'That confirmation link has expired. Please request a new one.',
  'confirmation_failed': "We couldn't confirm your email. The link may have already been used.",
  'auth_error':          'Something went wrong with that link. Please try again.',
}

function friendlyError(msg: string): string {
  for (const [key, friendly] of Object.entries(ERROR_MESSAGES)) {
    if (msg.includes(key)) return friendly
  }
  return msg
}

function AlertIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 4.6v4.2M8 11.2v.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function LoginForm() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)
  const router       = useRouter()
  const searchParams = useSearchParams()
  const urlError        = searchParams.get('error')
  const urlErrorMessage = urlError ? (URL_ERROR_MESSAGES[urlError] ?? URL_ERROR_MESSAGES['auth_error']) : null

  // Same-origin path: leading slash, not "//", not protocol-relative.
  // Rejects absolute URLs, javascript: schemes, network paths, etc.
  function safeNext(raw: string | null): string | null {
    if (!raw) return null
    if (raw.length > 2048) return null
    if (!raw.startsWith('/')) return null
    if (raw.startsWith('//') || raw.startsWith('/\\')) return null
    return raw
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { data: signIn, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (error) {
      setError(friendlyError(error.message))
      setLoading(false)
      return
    }
    const next = safeNext(searchParams.get('next'))
    if (next) {
      // Caller wants to resume a specific flow (e.g. /oauth/authorize).
      // Skip onboarding routing and bounce straight there.
      router.push(next)
      router.refresh()
      return
    }
    try {
      const userId = signIn?.user?.id
      if (!userId) { router.push('/dashboard'); router.refresh(); return }
      const { data: orgs } = await supabase.from('organisations').select('*').eq('owner_id', userId).order('created_at', { ascending: true }).limit(1)
      const org = (orgs?.[0] ?? null)
      let pipelineCount = 0
      if (org?.id) {
        const { count } = await supabase.from('pipeline_items').select('id', { count: 'exact', head: true }).eq('org_id', org.id)
        pipelineCount = count ?? 0
      }
      const dest = computePostLoginPath({
        onboardingComplete: isOnboardingComplete(org),
        hasPipelineActivity: pipelineCount > 0,
      })
      router.push(dest)
      router.refresh()
    } catch {
      router.push('/dashboard')
      router.refresh()
    }
  }

  const banner = error ?? urlErrorMessage

  return (
    <div className="shoots-a">
      <div className="page">

        {/* Logo only. The spec puts "New here? Join the waitlist" here AND a
            waitlist footer inside the card (section 7's email-only fallback),
            which renders the same call to action twice on a 436px card and
            reads as a mistake. Kept the one below the form: that is where
            someone who cannot sign in actually looks, and it is the one the
            fallback exists to provide. The wordmark still links home. */}
        <header>
          <Link href="/" className="brand">
            <LogoMark size={28} />
            <span>shoots</span>
          </Link>
        </header>

        <main className="centred">
          <div style={{ width: '100%', maxWidth: 436 }}>
            <div className="card">

              <h1 className="t-title">Welcome back</h1>
              <p className="t-body" style={{ marginTop: 8 }}>Sign in to pick up where you left off.</p>

              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 28 }}>

                {banner && (
                  <div className="banner" role="alert">
                    <AlertIcon />
                    <span>{banner}</span>
                  </div>
                )}

                <div className="field">
                  <label htmlFor="email">Email</label>
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

                <div className="field">
                  <div className="lblrow">
                    <label htmlFor="password">Password</label>
                    <Link href="/auth/forgot-password" className="link" style={{ fontSize: 13 }}>Forgot password?</Link>
                  </div>
                  <div className="pw">
                    <input
                      id="password"
                      className="input"
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
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

                <button type="submit" className="btn btn-primary btn-block" disabled={loading} style={{ marginTop: 4 }}>
                  {loading ? <><span className="spin" />Signing in…</> : 'Sign in'}
                </button>
              </form>

              <div style={{ marginTop: 26, paddingTop: 22, borderTop: '1px solid var(--border-hair)' }}>
                <p className="t-meta">
                  New to Shoots? <Link href="/#waitlist" className="link" style={{ fontSize: 12.8 }}>Join the waitlist</Link> →
                </p>
              </div>

            </div>
          </div>
        </main>

      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { track } from '@/lib/analytics'
import { createClient } from '@/lib/supabase/client'
import LogoMark from '@/components/icons/LogoMark'
import '@/styles/shoots-band-a.css'

/* Band A direction B — split canvas. Deep panel left, form right on cream.
   ============================================================
   LINKED FROM LAUNCH, 10 September 2026. Until then this route existed and
   was deliberately unlinked: the landing page's only entry points were
   /auth/login and the waitlist anchor. From launch the landing CTAs, the
   /auth/signup redirect and every public opportunity page point here.

   Google sign-up is absent for the same reason it is absent from login: all
   31 auth identities on the project are `email` and the provider has never
   been used. Section 7's email-only fallback, so no "or" divider is left
   orphaned.

   The four benefits are the spec's, drawn from live landing sections so that
   marketing and signup say the same thing. They are not to be rewritten. The
   single em dash inside benefit 2 is rendered as a comma, which is both the
   house rule and what the landing's own equivalent line does.
   ============================================================ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isExistingUserSignupResponse(data: { user: { identities?: { id: string }[] | null } | null }): boolean {
  // Supabase signs up "already-registered" emails silently and returns a user
  // with an empty identities array. That's our only reliable signal.
  return !!(data.user && (data.user.identities?.length ?? 0) === 0)
}

const BENEFITS: { title: string; body: string; dropOnMobile: boolean }[] = [
  {
    title: 'Only what you’re eligible for',
    body: 'Every opportunity checked against your legal structure, location and funding stage, before you spend an hour on it.',
    dropOnMobile: false,
  },
  {
    title: 'Not just grants',
    body: 'Social investment, programmes and in-kind support alongside grants, the funding you didn’t know to look for.',
    dropOnMobile: true,
  },
  {
    title: 'One pipeline, not a stale spreadsheet',
    body: 'Track every application from matched through drafting to won, with every deadline in view.',
    dropOnMobile: false,
  },
  {
    title: 'Applications in your own voice',
    body: 'Turn one project into tailored, fundable applications per funder. The voice stays yours.',
    dropOnMobile: true,
  },
]

function AlertIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 4.6v4.2M8 11.2v.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function Tick() {
  return (
    <svg className="tick" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"
         style={{ display: 'inline-block', verticalAlign: '-2px' }}>
      <path d="M3 8.4l3.2 3.2L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function SignupPage() {
  const router = useRouter()
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [checkEmail, setCheckEmail] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim())                  return setError('Please enter your name.')
    if (!EMAIL_RE.test(email.trim()))  return setError('Please enter a valid email address.')
    if (password.length < 8)           return setError('Password must be at least 8 characters.')

    setLoading(true)

    const supabase = createClient()
    const full = name.trim().replace(/\s+/g, ' ')
    const [first, ...rest] = full.split(' ')
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { first_name: first, last_name: rest.join(' '), full_name: full },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding/welcome`,
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    if (isExistingUserSignupResponse(data)) {
      setError('An account with that email already exists. Please sign in instead.')
      setLoading(false)
      return
    }

    track('signup_completed')

    if (!data.session) {
      // Email confirmation required: the wizard collects org name and the rest
      // of the profile fresh after the user confirms.
      setCheckEmail(true)
      setLoading(false)
      return
    }

    // Logged in immediately. Org row gets created by the wizard on first save.
    router.push('/onboarding/welcome')
    router.refresh()
  }

  return (
    <div className="shoots-a">
      <div className="split">

        {/* Left: the brand panel. */}
        <aside className="panel on-deep">
          <Link href="/" className="brand on-deep">
            <LogoMark size={28} variant="onInk" />
            <span>shoots</span>
          </Link>

          <h2 className="panel-head">
            Funding you can <span className="hl">actually win</span>
          </h2>

          <ul className="benefits">
            {BENEFITS.map(b => (
              <li key={b.title} className={b.dropOnMobile ? 'benefit-drop' : undefined}>
                <p className="benefit-t"><Tick />{b.title}</p>
                <p className="benefit-b">{b.body}</p>
              </li>
            ))}
          </ul>

          <div className="proof">
            <div><b>600+</b><span>Verified opportunities</span></div>
            <div><b>4</b><span>Funding types</span></div>
            <div><b>3 min</b><span>To first matches</span></div>
          </div>
        </aside>

        {/* Right: the form, on cream, no card. */}
        <main className="formside">
          <div className="formside-top">
            <span className="t-meta">
              Already have an account?{' '}
              <Link href="/auth/login" className="navlink">Sign in</Link>
            </span>
          </div>

          <div className="formbox">
            {checkEmail ? (
              <>
                <h1 className="t-title">Check your email</h1>
                <p className="t-body" style={{ marginTop: 10 }}>
                  We&apos;ve sent a confirmation link to <strong style={{ color: 'var(--deep)' }}>{email.trim().toLowerCase()}</strong>.
                  Click it to activate your account and finish setting up.
                </p>
                <p className="t-meta" style={{ marginTop: 18 }}>
                  Can&apos;t find it? Check your spam folder, or email{' '}
                  <a href="mailto:hello@shootsfunding.co.uk" className="link" style={{ fontSize: 12.8 }}>hello@shootsfunding.co.uk</a>.
                </p>
              </>
            ) : (
              <>
                <h1 className="t-title">Create your account</h1>
                <p className="t-body" style={{ marginTop: 10 }}>
                  Tell us about your organisation and see what fits, in about three minutes.
                </p>

                <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 28 }}>

                  {error && (
                    <div className="banner" role="alert">
                      <AlertIcon />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="field">
                    <label htmlFor="name">Your name</label>
                    <input
                      id="name"
                      className="input"
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Jo Patel"
                      autoComplete="name"
                      required
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="email">Work email</label>
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
                    <label htmlFor="password">Password</label>
                    <div className="pw">
                      <input
                        id="password"
                        className="input"
                        type={showPw ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        autoComplete="new-password"
                        aria-describedby="pw-help"
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
                    <p className="helpmsg" id="pw-help">Use at least 8 characters.</p>
                  </div>

                  <button type="submit" className="btn btn-primary btn-block" disabled={loading} style={{ marginTop: 4 }}>
                    {loading ? <><span className="spin" />Creating account…</> : 'Create account'}
                  </button>
                </form>

                <p className="t-meta" style={{ marginTop: 20 }}>
                  By creating an account you agree to our{' '}
                  <Link href="/terms" className="link" style={{ fontSize: 12.8 }}>Terms</Link> and{' '}
                  <Link href="/privacy" className="link" style={{ fontSize: 12.8 }}>Privacy policy</Link>.
                </p>
              </>
            )}
          </div>
        </main>

      </div>
    </div>
  )
}

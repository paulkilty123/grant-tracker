'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { track } from '@/lib/analytics'
import { createClient } from '@/lib/supabase/client'
import LogoMark from '@/components/icons/LogoMark'
import './signup.css'

/* Band A direction B — split canvas. Deep panel left, form right on cream.
   ============================================================
   BUILT BUT UNLINKED. This route exists and works, and nothing public points
   at it. The live landing page's only two entry points are /auth/login and
   the #waitlist anchor, verified against shootsfunding.co.uk, and that stays
   true until launch. Do not add a link to this page from the landing header,
   the login page, or anywhere else public. Someone will otherwise helpfully
   wire it up. Spec sequencing rule 3.

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

/* The five points on the pitch panel: the landing page's own claims, one
   line each. */
const POINTS = [
  'Only what you\u2019re eligible for',
  'Grants, social investment, programmes and in-kind support',
  'One pipeline, every deadline in view',
  'Applications in your own voice',
  'Works with Claude, through our connector',
]


function AlertIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 4.6v4.2M8 11.2v.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
    <div className="su">
      <div className="split">

        {/* Left: the pitch. Logo anchored top, quote bottom, the headline and
            points floating between, so the height is used rather than pooling
            at the bottom (Paul's design, 9 Sept 2026). */}
        <section className="col pitch">
          <div className="inner">
            <Link href="/" className="brand">
              <LogoMark size={26} variant="onInk" />
              <span>shoots</span>
            </Link>
            <div className="mid">
              <h1>Find funding you can <span className="hl">actually win</span></h1>
              <ul className="points">
                {POINTS.map(t => <li key={t}><svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10.5l4 4 8-9" stroke="#9BCA9D" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>{t}</li>)}
              </ul>
            </div>
            <blockquote className="quote">
              <p className="built">Built with UK charities, CICs and social enterprises</p>
              <p>&ldquo;Shoots has become our go-to funding research platform. Its eligibility matching is remarkably accurate.&rdquo;</p>
              <cite><b>David Agar</b>CEO, BankAbility UK CIC</cite>
            </blockquote>
          </div>
        </section>

        {/* Right: the form, directly on the ground, no card. */}
        <section className="col signup">
          <div className="inner">
            <p className="toplink">Already have an account? <Link href="/auth/login">Sign in</Link></p>

            {checkEmail ? (
              <>
                <h2>Check your email</h2>
                <p className="lead">
                  We&apos;ve sent a confirmation link to <strong style={{ color: 'var(--deep)' }}>{email.trim().toLowerCase()}</strong>.
                  Click it to activate your account and finish setting up.
                </p>
                <p className="help">
                  Can&apos;t find it? Check your spam folder, or email{' '}
                  <a href="mailto:hello@shootsfunding.co.uk" style={{ fontWeight: 600, color: 'var(--deep)' }}>hello@shootsfunding.co.uk</a>.
                </p>
              </>
            ) : (
              <>
                <h2>Create your account</h2>
                <p className="lead">Tell us about your organisation and see what fits, in about five minutes.</p>

                <form onSubmit={handleSignup}>
                  {error && (
                    <div className="banner" role="alert">
                      <AlertIcon />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="field">
                    <label className="f" htmlFor="name">Your name</label>
                    <input id="name" className="in" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Jo Patel" autoComplete="name" required />
                  </div>

                  <div className="field">
                    <label className="f" htmlFor="email">Email</label>
                    <input id="email" className="in" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@organisation.org" autoComplete="email" required />
                  </div>

                  <div className="field">
                    <label className="f" htmlFor="password">Password</label>
                    <div className="pw">
                      <input
                        id="password"
                        type={showPw ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        autoComplete="new-password"
                        aria-describedby="pw-help"
                        required
                      />
                      <button type="button" onClick={() => setShowPw(v => !v)} aria-label={showPw ? 'Hide password' : 'Show password'}>
                        {showPw ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <p className="help" id="pw-help">Use at least 8 characters.</p>
                  </div>

                  <p className="trial"><b>14 days of full access, no card needed.</b> You choose a plan at the end.</p>

                  <button type="submit" className="btn" disabled={loading}>
                    {loading ? <><span className="spin" />Creating account…</> : 'Create account'}
                  </button>
                </form>

                <p className="legal">
                  By creating an account you agree to our <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy policy</Link>.
                </p>
              </>
            )}
          </div>
        </section>

      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { track } from '@/lib/analytics'
import { createClient } from '@/lib/supabase/client'
import LogoMark from '@/components/icons/LogoMark'
import { brand } from '@/config/brand'

const UI = "var(--font-space-grotesk), Space Grotesk, sans-serif"
const BODY = "var(--font-dm-sans), Plus Jakarta Sans, sans-serif"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isExistingUserSignupResponse(data: { user: { identities?: { id: string }[] | null } | null }): boolean {
  // Supabase signs up "already-registered" emails silently and returns a user
  // with an empty identities array. That's our only reliable signal.
  return !!(data.user && (data.user.identities?.length ?? 0) === 0)
}

export default function CohortSignupPage() {
  const router = useRouter()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [showPw, setShowPw]       = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [checkEmail, setCheckEmail] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!firstName.trim()) return setError('Please enter your first name.')
    if (!lastName.trim())  return setError('Please enter your last name.')
    if (!EMAIL_RE.test(email.trim())) return setError('Please enter a valid email address.')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')

    setLoading(true)

    const supabase = createClient()
    const fn = firstName.trim()
    const ln = lastName.trim()
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { first_name: fn, last_name: ln, full_name: `${fn} ${ln}` },
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

  if (checkEmail) {
    return (
      <Shell>
        <h1 style={{ fontFamily: UI, fontWeight: 500, fontSize: 24, letterSpacing: '-0.02em', color: 'var(--text-body)', marginBottom: 10 }}>
          Check your email
        </h1>
        <p style={{ fontFamily: BODY, fontSize: 14.5, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 18 }}>
          We&apos;ve sent a confirmation link to <strong style={{ color: 'var(--text-body)' }}>{email}</strong>. Click it to activate your account and finish setup.
        </p>
        <p style={{ fontFamily: BODY, fontSize: 13, color: 'var(--text-subtle)' }}>
          Can&apos;t find it? Check your spam folder, or email <a href={`mailto:${brand.email.hello}`} style={{ color: 'var(--state-success)', textDecoration: 'none' }}>{brand.email.hello}</a>.
        </p>
      </Shell>
    )
  }

  return (
    <Shell>
      <div style={{ fontFamily: UI, fontWeight: 500, fontSize: 11.5, color: '#8ECB3C' /* eslint-disable-line no-restricted-syntax -- RETIRED lime (#8ECB3C) — button-hierarchy redesign, not a token rename */, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 6, height: 6, background: '#8ECB3C' /* eslint-disable-line no-restricted-syntax -- RETIRED lime (#8ECB3C) — button-hierarchy redesign, not a token rename */, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
        Founding cohort
      </div>
      <h1 style={{ fontFamily: UI, fontWeight: 500, fontSize: 28, lineHeight: 1.2, letterSpacing: '-0.02em', color: 'var(--text-body)', marginBottom: 10 }}>
        Welcome to the {brand.name} founding cohort
      </h1>
      <p style={{ fontFamily: BODY, fontSize: 14.5, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 28 }}>
        Set up your account below to get started. If you have any questions just email <a href={`mailto:${brand.email.hello}`} style={{ color: 'var(--state-success)', textDecoration: 'none' }}>{brand.email.hello}</a>.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && (
          <div style={{ background: 'var(--state-error-pale)', border: '0.5px solid color-mix(in srgb, var(--state-error) 25%, transparent)', color: 'var(--state-error)', fontSize: 13, padding: '11px 14px', borderRadius: 10 }}>
            {error}{' '}
            {error.includes('already exists') && (
              <Link href="/auth/login" style={{ color: 'var(--state-error)', fontWeight: 600, textDecoration: 'underline' }}>Sign in</Link>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label style={{ display: 'block', fontFamily: UI, fontWeight: 500, fontSize: 13, color: 'var(--text-body)', marginBottom: 6 }}>First name</label>
            <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} className="form-input" placeholder="Jane" autoComplete="given-name" required />
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: UI, fontWeight: 500, fontSize: 13, color: 'var(--text-body)', marginBottom: 6 }}>Last name</label>
            <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} className="form-input" placeholder="Doe" autoComplete="family-name" required />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontFamily: UI, fontWeight: 500, fontSize: 13, color: 'var(--text-body)', marginBottom: 6 }}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="form-input" placeholder="you@organisation.org" autoComplete="email" required />
        </div>

        <div>
          <label style={{ display: 'block', fontFamily: UI, fontWeight: 500, fontSize: 13, color: 'var(--text-body)', marginBottom: 6 }}>Password</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="form-input"
              style={{ paddingRight: 56 }}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontFamily: UI, fontSize: 12, color: 'var(--text-subtle)', background: 'transparent', border: 'none', cursor: 'pointer' }} tabIndex={-1}>
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontFamily: UI, fontWeight: 500, fontSize: 13, color: 'var(--text-body)', marginBottom: 6 }}>Confirm password</label>
          <input
            type={showPw ? 'text' : 'password'}
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            className="form-input"
            placeholder={'\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 8,
            background: '#8ECB3C' /* eslint-disable-line no-restricted-syntax -- RETIRED lime (#8ECB3C) — button-hierarchy redesign, not a token rename */,
            color: 'var(--deep)',
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
          {loading ? 'Creating account...' : 'Create my account'}
        </button>
      </form>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface-page)', minHeight: '100vh', fontFamily: BODY, color: 'var(--text-body)' }}>
      <nav style={{ background: 'white', borderBottom: '0.5px solid color-mix(in srgb, var(--deep) 8%, transparent)', padding: '18px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
            <LogoMark size={30} />
            <span style={{ fontFamily: UI, fontWeight: 700, fontSize: 24, letterSpacing: '-0.025em', color: 'var(--text-body)' }}>{brand.name}</span>
          </Link>
          <Link href="/" style={{ fontFamily: UI, fontSize: 13.5, color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={14} /> Back to home
          </Link>
        </div>
      </nav>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '64px 24px 48px' }}>
        <div style={{ background: 'white', borderRadius: 16, padding: '40px 36px', boxShadow: '0 2px 24px color-mix(in srgb, var(--deep) 6%, transparent)', border: '0.5px solid color-mix(in srgb, var(--deep) 6%, transparent)' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

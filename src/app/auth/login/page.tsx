'use client'

import { useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { isOnboardingComplete, computePostLoginPath } from '@/lib/onboarding'
import LogoMark from '@/components/icons/LogoMark'
import { brand } from '@/config/brand'

const UI = "var(--font-space-grotesk), Space Grotesk, sans-serif"
const BODY = "var(--font-dm-sans), Plus Jakarta Sans, sans-serif"

const ERROR_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'Incorrect email or password. Please try again.',
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

  return (
    <div style={{ background: '#FAFAF7', minHeight: '100vh', fontFamily: BODY, color: '#2C2C2A' }}>

      {/* NAV */}
      <nav style={{ background: 'white', borderBottom: '0.5px solid rgba(23,52,4,0.08)', padding: '18px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
            <LogoMark size={30} />
            <span style={{ fontFamily: UI, fontWeight: 700, fontSize: 24, letterSpacing: '-0.025em', color: '#2C2C2A' }}>{brand.name}</span>
          </Link>
          <Link href="/" style={{ fontFamily: UI, fontSize: 13.5, color: '#5F5E5A', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={14} /> Back to home
          </Link>
        </div>
      </nav>

      <div style={{ maxWidth: 460, margin: '0 auto', padding: '64px 24px 48px' }}>

        {/* Card */}
        <div style={{ background: 'white', borderRadius: 16, padding: '40px 36px', boxShadow: '0 2px 24px rgba(23,52,4,0.06)', border: '0.5px solid rgba(23,52,4,0.06)' }}>
          <h1 style={{ fontFamily: UI, fontWeight: 500, fontSize: 28, lineHeight: 1.15, letterSpacing: '-0.02em', color: '#2C2C2A', marginBottom: 6 }}>
            Welcome back
          </h1>
          <p style={{ fontFamily: BODY, fontSize: 14.5, color: '#5F5E5A', marginBottom: 28 }}>
            Sign in to your {brand.name} account.
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {urlErrorMessage && (
              <div style={{ background: '#FFFBEB', border: '0.5px solid rgba(180,135,40,0.25)', color: '#854F0B', fontSize: 13, padding: '11px 14px', borderRadius: 10 }}>
                {urlErrorMessage}
              </div>
            )}
            {error && (
              <div style={{ background: '#FAECE7', border: '0.5px solid rgba(153,60,29,0.25)', color: '#993C1D', fontSize: 13, padding: '11px 14px', borderRadius: 10 }}>
                {error}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontFamily: UI, fontWeight: 500, fontSize: 13, color: '#2C2C2A', marginBottom: 6 }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="form-input" placeholder="you@organisation.org" autoComplete="email" required />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontFamily: UI, fontWeight: 500, fontSize: 13, color: '#2C2C2A' }}>Password</label>
                <Link href="/auth/forgot-password" style={{ fontFamily: UI, fontSize: 12, color: '#3B6D11', textDecoration: 'none' }}>Forgot password?</Link>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="form-input"
                  style={{ paddingRight: 56 }}
                  placeholder={'\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                  autoComplete="current-password"
                  required
                />
                <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontFamily: UI, fontSize: 12, color: '#8A8986', background: 'transparent', border: 'none', cursor: 'pointer' }} tabIndex={-1}>
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 8,
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
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        <p style={{ fontFamily: BODY, fontSize: 13, color: '#8A8986', textAlign: 'center', marginTop: 24 }}>
          Want to join the founding cohort?{' '}
          <Link href="/apply" style={{ fontFamily: UI, fontWeight: 500, color: '#3B6D11', textDecoration: 'none' }}>Apply here</Link>
        </p>
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

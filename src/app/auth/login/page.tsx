'use client'

import { useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Search, ArrowRight, Bell, Lock } from 'lucide-react'
import RadioWaveIcon from '@/components/icons/RadioWaveIcon'

const ERROR_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'Incorrect email or password \u2014 please try again.',
  'Email not confirmed': 'Please check your email and click the confirmation link first.',
  'Too many requests': 'Too many attempts \u2014 please wait a few minutes and try again.',
}

const URL_ERROR_MESSAGES: Record<string, string> = {
  'otp_expired':         'That confirmation link has expired. Please sign up again to receive a new one.',
  'confirmation_failed': "We couldn't confirm your email \u2014 the link may have already been used. Try signing in, or sign up again.",
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

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(friendlyError(error.message))
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F9F9F9' }}>
      <div className="w-full max-w-4xl">

        <div className="mb-6">
          <Link href="/" className="text-sm inline-flex items-center gap-1.5 hover:opacity-70 transition-opacity" style={{ color: '#525252', fontFamily: 'var(--font-space-grotesk)' }}>
            &larr; Back to home
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 overflow-hidden rounded-3xl" style={{ boxShadow: '0 8px 48px rgba(0,0,0,0.10)' }}>

          {/* Left panel */}
          <div className="text-white p-10 hidden lg:flex flex-col justify-between" style={{ background: '#1A1A1A' }}>
            <div>
              <a href="/" className="no-underline inline-flex items-center gap-2 mb-2">
                <span className="font-bold text-xl" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#FFFFFF', letterSpacing: '-0.02em' }}>Grant<span style={{ color: '#84CC16' }}>Tracker</span></span>
              </a>
              <p className="text-sm mb-10" style={{ color: '#888888' }}>Find grants, accelerators, investment and support programmes &mdash; matched to you, managed in one place.</p>
              <div className="space-y-6">
                {[
                  { Icon: Search,     title: 'Find funding that fits',    desc: 'Search grants, accelerators and social investment filtered to your structure, sector and stage.' },
                  { Icon: ArrowRight, title: 'Track every application',   desc: 'A visual pipeline keeps every opportunity in view \u2014 from first contact to decision.' },
                  { Icon: Bell,       title: 'Never miss a deadline',     desc: 'Instant or weekly alerts when new matches appear or deadlines are approaching.' },
                ].map(({ Icon, title, desc }) => (
                  <div key={title} className="flex gap-3.5">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'rgba(132,204,22,0.12)' }}>
                      <Icon size={16} style={{ color: '#84CC16' }} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: '#FFFFFF', fontFamily: 'var(--font-space-grotesk)' }}>{title}</p>
                      <p className="text-xs leading-relaxed mt-0.5" style={{ color: '#888888' }}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-10 pt-6" style={{ borderTop: '1px solid #2A2A2A' }}>
              <Lock size={12} style={{ color: '#555555' }} />
              <p className="text-xs" style={{ color: '#555555' }}>Your data is never shared or sold</p>
            </div>
          </div>

          {/* Right: form */}
          <div className="bg-white p-8 lg:p-10 flex flex-col justify-center">
            <div className="mb-8 lg:hidden flex justify-center">
              <a href="/" className="no-underline inline-flex items-center gap-2">
                <span className="font-bold text-lg" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#1A1A1A' }}>Grant<span style={{ color: '#84CC16' }}>Tracker</span></span>
              </a>
            </div>
            <h1 className="font-bold leading-tight mb-1" style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 'clamp(22px, 3vw, 28px)', letterSpacing: '-0.02em', color: '#1A1A1A' }}>Welcome back</h1>
            <p className="text-sm mb-7" style={{ color: '#888888' }}>Sign in to your Grant Tracker account</p>

            <form onSubmit={handleLogin} className="space-y-4">
              {urlErrorMessage && (
                <div className="text-amber-700 text-sm px-4 py-3 rounded-xl border border-amber-200" style={{ background: '#FFFBEB' }}>
                  {urlErrorMessage}
                </div>
              )}
              {error && (
                <div className="text-red-600 text-sm px-4 py-3 rounded-xl border border-red-100" style={{ background: '#FEF2F2' }}>
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: '#1A1A1A', fontFamily: 'var(--font-space-grotesk)' }}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="form-input rounded-xl" placeholder="you@organisation.org" autoComplete="email" required />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-semibold" style={{ color: '#1A1A1A', fontFamily: 'var(--font-space-grotesk)' }}>Password</label>
                  <Link href="/auth/forgot-password" className="text-xs hover:underline" style={{ color: '#84CC16' }}>Forgot password?</Link>
                </div>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="form-input pr-10 rounded-xl"
                    placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                    autoComplete="current-password"
                    required
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs hover:opacity-70" style={{ color: '#888888' }} tabIndex={-1}>
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full flex justify-center items-center rounded-full py-3.5 text-sm font-bold transition-opacity hover:opacity-80 mt-2" style={{ background: '#84CC16', color: '#1A1A1A', fontFamily: 'var(--font-space-grotesk)' }}>
                {loading ? 'Signing in\u2026' : 'Sign in'}
              </button>
            </form>

            <div className="mt-6 pt-6 text-center" style={{ borderTop: '1px solid #F0F0F0' }}>
              <p className="text-sm" style={{ color: '#888888' }}>
                Don&apos;t have an account?{' '}
                <Link href="/auth/signup" className="font-semibold hover:underline" style={{ color: '#84CC16' }}>Create one free</Link>
              </p>
            </div>
          </div>

        </div>
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

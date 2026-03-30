'use client'

import { useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Search, ArrowRight, Bell, Lock } from 'lucide-react'

const ERROR_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'Incorrect email or password — please try again.',
  'Email not confirmed': 'Please check your email and click the confirmation link first.',
  'Too many requests': 'Too many attempts — please wait a few minutes and try again.',
}

const URL_ERROR_MESSAGES: Record<string, string> = {
  'otp_expired':          'That confirmation link has expired. Please sign up again to receive a new one.',
  'confirmation_failed':  'We couldn\'t confirm your email — the link may have already been used. Try signing in, or sign up again.',
  'auth_error':           'Something went wrong with that link. Please try again.',
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
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlError = searchParams.get('error')
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
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">

        {/* Back to home */}
        <div className="mb-6">
          <Link href="/" className="text-sm text-mid hover:text-charcoal transition-colors inline-flex items-center gap-1.5">
            ← Back to home
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-hidden border border-warm/60" style={{ boxShadow: '0 8px 40px rgba(26,46,43,0.10)' }}>

          {/* ── Left: value props ── */}
          <div className="bg-[#121f2b] text-white p-10 hidden lg:flex flex-col justify-between">
            <div>
              {/* Logo */}
              <a href="/" className="flex items-center gap-2.5 no-underline mb-2">
                <div className="relative flex items-center justify-center bg-coral w-7 h-7 flex-shrink-0" style={{ borderRadius: '6px' }}>
                  <div className="w-2.5 h-2.5 rounded-full border-2 border-white" />
                </div>
                <span className="font-serif text-[20px] text-white">GrantTracker</span>
              </a>
              <p className="text-white/50 text-sm mb-10">Find grants, accelerators, investment and support programmes — matched to you, managed in one place.</p>

              <div className="space-y-6">
                {[
                  { Icon: Search,    title: 'Find funding that fits',     desc: 'Search grants, accelerators and social investment filtered to your structure, sector and stage.' },
                  { Icon: ArrowRight, title: 'Track every application',   desc: 'A visual pipeline keeps every opportunity in view — from first contact to decision.' },
                  { Icon: Bell,      title: 'Never miss a deadline',       desc: 'Instant or weekly alerts when new matches appear or deadlines are approaching.' },
                ].map(({ Icon, title, desc }) => (
                  <div key={title} className="flex gap-3.5">
                    <div className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <Icon size={15} className="text-coral" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-white">{title}</p>
                      <p className="text-white/50 text-xs leading-relaxed mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 mt-10 pt-6 border-t border-white/10">
              <Lock size={12} className="text-white/30" />
              <p className="text-white/30 text-xs">Your data is never shared or sold</p>
            </div>
          </div>

          {/* ── Right: form ── */}
          <div className="bg-white p-8 lg:p-10 flex flex-col justify-center">

            {/* Mobile logo */}
            <div className="mb-8 lg:hidden flex justify-center">
              <a href="/" className="flex items-center gap-2.5 no-underline">
                <div className="relative flex items-center justify-center bg-coral w-7 h-7 flex-shrink-0" style={{ borderRadius: '6px' }}>
                  <div className="w-2.5 h-2.5 rounded-full border-2 border-white" />
                </div>
                <span className="font-serif text-[20px] text-charcoal">GrantTracker</span>
              </a>
            </div>

            <h1 className="font-serif text-[28px] leading-tight text-charcoal mb-1">Welcome back</h1>
            <p className="text-mid text-sm mb-7">Sign in to your Grant Tracker account</p>

            <form onSubmit={handleLogin} className="space-y-4">
              {urlErrorMessage && (
                <div className="bg-amber-50 text-amber-700 text-sm px-4 py-3 border border-amber-200">
                  {urlErrorMessage}
                </div>
              )}
              {error && (
                <div className="bg-red-50 text-red-600 text-sm px-4 py-3 border border-red-100">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="form-input"
                  style={{ borderRadius: '0' }}
                  placeholder="you@organisation.org"
                  autoComplete="email"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-charcoal">Password</label>
                  <Link href="/auth/forgot-password" className="text-xs text-coral hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="form-input pr-10"
                    style={{ borderRadius: '0' }}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-mid hover:text-charcoal text-xs"
                    tabIndex={-1}
                  >
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center bg-coral text-white py-3 text-sm font-semibold hover:opacity-90 transition-colors mt-2"
                style={{ borderRadius: '0' }}
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-warm text-center">
              <p className="text-sm text-mid">
                Don&apos;t have an account?{' '}
                <Link href="/auth/signup" className="text-coral font-medium hover:underline">
                  Create one free
                </Link>
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

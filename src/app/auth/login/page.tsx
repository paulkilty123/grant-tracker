'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Logo from '@/components/Logo'

const ERROR_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'Incorrect email or password — please try again.',
  'Email not confirmed': 'Please check your email and click the confirmation link first.',
  'Too many requests': 'Too many attempts — please wait a few minutes and try again.',
}

function friendlyError(msg: string): string {
  for (const [key, friendly] of Object.entries(ERROR_MESSAGES)) {
    if (msg.includes(key)) return friendly
  }
  return msg
}

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)
  const router = useRouter()

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
        <div className="mb-6 text-center lg:text-left">
          <Link href="/" className="text-sm text-mid hover:text-charcoal transition-colors inline-flex items-center gap-1">
            ← Back to home
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 rounded-2xl shadow-card-lg overflow-hidden">

          {/* ── Left: value props ── */}
          <div className="bg-forest text-white p-10 hidden lg:flex flex-col justify-between">
            <div>
              <Logo variant="light" size="md" />
              <p className="text-white/70 text-sm mt-2 mb-10">Find funding. Track progress. Win grants.</p>

              <div className="space-y-6">
                {[
                  { icon: '🎯', title: 'AI matching', desc: 'Finds grants relevant to your mission — and learns from your feedback over time.' },
                  { icon: '📋', title: 'Application pipeline', desc: 'Track every grant from prospect to decision in one place.' },
                  { icon: '🔔', title: 'Deadline alerts', desc: 'Never miss a closing date — get notified when new matches appear.' },
                ].map(f => (
                  <div key={f.title} className="flex gap-3">
                    <span className="text-xl flex-shrink-0 mt-0.5">{f.icon}</span>
                    <div>
                      <p className="font-semibold text-sm text-white">{f.title}</p>
                      <p className="text-white/60 text-xs leading-relaxed mt-0.5">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-white/40 text-xs mt-10">800+ UK grants · Free to search · Updated daily</p>
          </div>

          {/* ── Right: form ── */}
          <div className="bg-white p-8 lg:p-10 flex flex-col justify-center">
            <div className="mb-8 lg:hidden text-center">
              <Logo variant="dark" size="md" />
            </div>

            <h1 className="text-2xl font-bold text-forest mb-1">Welcome back</h1>
            <p className="text-mid text-sm mb-7">Sign in to your Grant Tracker account</p>

            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg border border-red-100">
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
                  placeholder="you@organisation.org"
                  autoComplete="email"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-charcoal">Password</label>
                  <Link href="/auth/forgot-password" className="text-xs text-sage hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="form-input pr-10"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-light hover:text-mid text-sm"
                    tabIndex={-1}
                  >
                    {showPw ? '🙈' : '👁'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex justify-center mt-2"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-warm text-center">
              <p className="text-sm text-mid">
                Don&apos;t have an account?{' '}
                <Link href="/auth/signup" className="text-sage font-medium hover:underline">
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

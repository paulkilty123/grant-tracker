'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Logo from '@/components/Logo'

export default function SignupPage() {
  const router                  = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName]   = useState('')
  const [orgType, setOrgType]   = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)
  const [done, setDone]         = useState(false)
  const [resending, setResending] = useState(false)
  const [resent, setResent]     = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { org_name: orgName, org_type: orgType },
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else if (data.session) {
      // Email confirmation is disabled in Supabase — user is immediately active.
      router.push('/dashboard')
    } else {
      setDone(true)
    }
  }

  async function handleResend() {
    setResending(true)
    setResent(false)
    const supabase = createClient()
    await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    setResending(false)
    setResent(true)
  }

  if (done) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-4">
        <div className="card max-w-md w-full text-center">
          <div className="text-4xl mb-4">📬</div>
          <h2 className="text-xl font-bold text-forest mb-2">Check your email</h2>
          <p className="text-mid text-sm">We&apos;ve sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.</p>
          <p className="text-xs text-light mt-3">Can&apos;t find it? Check your spam folder.</p>
          <div className="mt-5">
            {resent ? (
              <p className="text-xs text-emerald-600 font-medium">✓ Confirmation email resent</p>
            ) : (
              <button
                onClick={handleResend}
                disabled={resending}
                className="text-xs text-forest underline underline-offset-2 hover:text-forest/70 disabled:opacity-50"
              >
                {resending ? 'Resending…' : 'Resend confirmation email'}
              </button>
            )}
          </div>
          <div className="mt-6 pt-5 border-t border-warm">
            <Link href="/auth/login" className="text-xs text-mid hover:text-charcoal transition-colors">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const pwStrong = password.length >= 8

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
                  { icon: '🔍', title: '800+ UK grants', desc: 'Charities, CICs, social enterprises and community groups — updated regularly from verified sources.' },
                  { icon: '🎯', title: 'AI that learns from you', desc: 'Personalised matching that improves the more you use it — thumbs up, thumbs down, done.' },
                  { icon: '📋', title: 'Full application pipeline', desc: 'From first discovery to decision — track every grant without a spreadsheet.' },
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

            <div className="mt-10 pt-6 border-t border-white/10">
              <p className="text-white/50 text-xs">🔒 Your data is never shared or sold</p>
            </div>
          </div>

          {/* ── Right: form ── */}
          <div className="bg-white p-8 lg:p-10 flex flex-col justify-center">
            <div className="mb-8 lg:hidden text-center">
              <Logo variant="dark" size="md" />
            </div>

            <h1 className="text-2xl font-bold text-forest mb-1">Create your free account</h1>
            <p className="text-mid text-sm mb-7">Set up in 2 minutes</p>

            <form onSubmit={handleSignup} className="space-y-4">
              {error && (
                <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg border border-red-100">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Organisation name</label>
                <input
                  type="text"
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  className="form-input"
                  placeholder="Green Communities CIC"
                  autoComplete="organization"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Organisation type</label>
                <select
                  value={orgType}
                  onChange={e => setOrgType(e.target.value)}
                  className="form-input"
                  required
                >
                  <option value="" disabled>Select your organisation type…</option>
                  <option value="registered_charity">Registered charity</option>
                  <option value="cic">Community Interest Company (CIC)</option>
                  <option value="social_enterprise">Social enterprise</option>
                  <option value="community_group">Community group or voluntary organisation</option>
                  <option value="other">Other mission-driven organisation</option>
                </select>
              </div>

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
                <label className="block text-sm font-medium text-charcoal mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="form-input pr-10"
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    minLength={8}
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
                {password.length > 0 && (
                  <p className={`text-xs mt-1.5 ${pwStrong ? 'text-emerald-600' : 'text-amber-500'}`}>
                    {pwStrong ? '✓ Strong enough' : 'Use at least 8 characters'}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex justify-center mt-2"
              >
                {loading ? 'Creating account…' : 'Create free account'}
              </button>
            </form>

            {/* Trust strip — visible on mobile only (desktop sees it in left panel) */}
            <p className="text-xs text-light text-center mt-5 lg:hidden">
              🔒 Your data is never shared
            </p>

            <div className="mt-6 pt-6 border-t border-warm text-center">
              <p className="text-sm text-mid">
                Already have an account?{' '}
                <Link href="/auth/login" className="text-sage font-medium hover:underline">Sign in</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

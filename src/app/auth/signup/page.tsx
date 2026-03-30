'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Search, ArrowRight, Bell, Lock } from 'lucide-react'
import Logo from '@/components/Logo'

export default function SignupPage() {
  const router                  = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
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
        data: { full_name: fullName },
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else if (data.session) {
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
        <div className="bg-white border border-warm/60 max-w-md w-full p-10 text-center" style={{ boxShadow: '0 8px 40px rgba(26,46,43,0.10)' }}>
          <div className="w-12 h-12 bg-forest/10 flex items-center justify-center mx-auto mb-5">
            <Bell size={22} className="text-forest" />
          </div>
          <h2 className="font-serif text-[26px] text-charcoal mb-2">Check your email</h2>
          <p className="text-mid text-sm leading-relaxed">We&apos;ve sent a confirmation link to <strong className="text-charcoal">{email}</strong>. Click it to activate your account.</p>
          <p className="text-xs text-mid mt-3">Can&apos;t find it? Check your spam folder.</p>
          <div className="mt-5">
            {resent ? (
              <p className="text-xs text-forest font-medium">✓ Confirmation email resent</p>
            ) : (
              <button
                onClick={handleResend}
                disabled={resending}
                className="text-xs text-coral underline underline-offset-2 hover:opacity-70 disabled:opacity-50"
              >
                {resending ? 'Resending…' : 'Resend confirmation email'}
              </button>
            )}
          </div>
          <div className="mt-6 pt-5 border-t border-warm space-y-2">
            <p className="text-xs text-mid font-medium">While you wait, here&apos;s what happens next:</p>
            <ol className="text-xs text-mid text-left space-y-1 list-decimal list-inside">
              <li>Click the link in your email to verify your account</li>
              <li>Set up your organisation profile (takes ~3 minutes)</li>
              <li>Browse grants matched to your sector and structure</li>
            </ol>
            <div className="pt-3">
              <Link href="/auth/login" className="text-xs text-mid hover:text-charcoal transition-colors underline">
                Already confirmed? Sign in →
              </Link>
            </div>
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
        <div className="mb-6">
          <Link href="/" className="text-sm text-mid hover:text-charcoal transition-colors inline-flex items-center gap-1.5">
            ← Back to home
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-hidden border border-warm/60" style={{ boxShadow: '0 8px 40px rgba(26,46,43,0.10)' }}>

          {/* ── Left: value props ── */}
          <div className="bg-forest text-white p-10 hidden lg:flex flex-col justify-between">
            <div>
              {/* Logo */}
              <a href="/" className="no-underline mb-2">
                <Logo variant="light" size="md" />
              </a>
              <p className="text-white/50 text-sm mb-10">Find grants, accelerators, investment and support programmes — matched to you, managed in one place.</p>

              <div className="space-y-6">
                {[
                  { Icon: Search,     title: '500+ UK funding opportunities', desc: 'Grants, accelerators, social investment and support programmes — all in one place, updated regularly.' },
                  { Icon: ArrowRight, title: 'Matched to your organisation',   desc: 'Tell us your structure, sector and stage once. We filter out everything you\'re not eligible for.' },
                  { Icon: Bell,       title: 'Free to start',                  desc: 'Search the full database, save opportunities and get weekly alerts — no credit card required.' },
                ].map(({ Icon, title, desc }) => (
                  <div key={title} className="flex gap-3.5">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
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
              <a href="/" className="no-underline">
                <Logo variant="dark" size="md" />
              </a>
            </div>

            <p className="text-xs text-mid mb-4 lg:hidden">Search 500+ grants · AI-matched to your mission · Free to start</p>
            <h1 className="font-serif text-[28px] leading-tight text-charcoal mb-1">Create your free account</h1>
            <p className="text-mid text-sm mb-7">Takes 30 seconds — no credit card needed</p>

            <form onSubmit={handleSignup} className="space-y-4">
              {error && (
                <div className="bg-red-50 text-red-600 text-sm px-4 py-3 border border-red-100">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Your name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="form-input rounded-lg"
                  placeholder="Jane Smith"
                  autoComplete="name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="form-input rounded-lg"
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
                    className="form-input pr-14 rounded-lg"
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    minLength={8}
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
                {password.length > 0 && (
                  <p className={`text-xs mt-1.5 ${pwStrong ? 'text-forest' : 'text-amber-500'}`}>
                    {pwStrong ? '✓ Strong enough' : 'Use at least 8 characters'}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center bg-coral text-white py-3 text-sm font-semibold hover:opacity-90 transition-colors mt-2 rounded-lg"
              >
                {loading ? 'Creating account…' : 'Create free account'}
              </button>
            </form>

            {/* Trust strip — mobile only */}
            <div className="flex items-center justify-center gap-1.5 mt-5 lg:hidden">
              <Lock size={11} className="text-mid" />
              <p className="text-xs text-mid">Your data is never shared</p>
            </div>

            <div className="mt-6 pt-6 border-t border-warm text-center">
              <p className="text-sm text-mid">
                Already have an account?{' '}
                <Link href="/auth/login" className="text-coral font-medium hover:underline">Sign in</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

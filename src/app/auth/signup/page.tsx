'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Search, ArrowRight, Bell, Lock } from 'lucide-react'
import RadioWaveIcon from '@/components/icons/RadioWaveIcon'

export default function SignupPage() {
  const router                    = useRouter()
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [fullName, setFullName]   = useState('')
  const [showPw, setShowPw]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [loading, setLoading]     = useState(false)
  const [done, setDone]           = useState(false)
  const [resending, setResending] = useState(false)
  const [resent, setResent]       = useState(false)

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
        emailRedirectTo: `${location.origin}/auth/callback?next=/dashboard/profile`,
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else if (data.session) {
      router.push('/dashboard/profile')
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
      options: { emailRedirectTo: `${location.origin}/auth/callback?next=/dashboard/profile` },
    })
    setResending(false)
    setResent(true)
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F9F9F9' }}>
        <div className="bg-white rounded-3xl max-w-md w-full p-10 text-center" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.08)' }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: '#F4F9E8' }}>
            <Bell size={24} style={{ color: '#84CC16' }} />
          </div>
          <h2 className="mb-2 font-bold" style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: '1.5rem', color: '#1A1A1A', letterSpacing: '-0.02em' }}>Check your email</h2>
          <p className="text-sm leading-relaxed mb-1" style={{ color: '#525252' }}>
            We&apos;ve sent a confirmation link to <strong style={{ color: '#1A1A1A' }}>{email}</strong>. Click it to activate your account.
          </p>
          <p className="text-xs mb-5" style={{ color: '#888888' }}>Can&apos;t find it? Check your spam folder.</p>
          <div className="mb-6">
            {resent ? (
              <p className="text-xs font-medium" style={{ color: '#84CC16' }}>&#10003; Confirmation email resent</p>
            ) : (
              <button
                onClick={handleResend}
                disabled={resending}
                className="text-xs underline underline-offset-2 hover:opacity-70 disabled:opacity-50"
                style={{ color: '#84CC16' }}
              >
                {resending ? 'Resending\u2026' : 'Resend confirmation email'}
              </button>
            )}
          </div>
          <div className="pt-5 border-t space-y-2" style={{ borderColor: '#F0F0F0' }}>
            <p className="text-xs font-semibold" style={{ color: '#1A1A1A', fontFamily: 'var(--font-space-grotesk)' }}>While you wait, here&apos;s what happens next:</p>
            <ol className="text-xs text-left space-y-1 list-decimal list-inside" style={{ color: '#525252' }}>
              <li>Click the link in your email to verify your account</li>
              <li>Set up your organisation profile (takes ~3 minutes)</li>
              <li>Browse grants matched to your sector and structure</li>
            </ol>
            <div className="pt-3">
              <Link href="/auth/login" className="text-xs hover:underline" style={{ color: '#84CC16' }}>
                Already confirmed? Sign in &rarr;
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const pwStrong = password.length >= 8

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
                  { Icon: Search,     title: '500+ UK funding opportunities', desc: 'Grants, accelerators, social investment and support programmes \u2014 all in one place, updated regularly.' },
                  { Icon: ArrowRight, title: 'Matched to your organisation',   desc: "Tell us your structure, sector and stage once. We filter out everything you're not eligible for." },
                  { Icon: Bell,       title: 'Free to start',                  desc: 'Search the full database, save opportunities and get weekly alerts \u2014 no credit card required.' },
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
            <p className="text-xs mb-4 lg:hidden" style={{ color: '#888888' }}>Search 500+ grants &middot; AI-matched to your mission &middot; Free to start</p>
            <h1 className="font-bold leading-tight mb-1" style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 'clamp(22px, 3vw, 28px)', letterSpacing: '-0.02em', color: '#1A1A1A' }}>Create your free account</h1>
            <p className="text-sm mb-7" style={{ color: '#888888' }}>Takes 30 seconds &mdash; no credit card needed</p>

            <form onSubmit={handleSignup} className="space-y-4">
              {error && (
                <div className="text-red-600 text-sm px-4 py-3 rounded-xl border border-red-100" style={{ background: '#FEF2F2' }}>
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: '#1A1A1A', fontFamily: 'var(--font-space-grotesk)' }}>Your name</label>
                <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="form-input rounded-xl" placeholder="Jane Smith" autoComplete="name" required />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: '#1A1A1A', fontFamily: 'var(--font-space-grotesk)' }}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="form-input rounded-xl" placeholder="you@organisation.org" autoComplete="email" required />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: '#1A1A1A', fontFamily: 'var(--font-space-grotesk)' }}>Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="form-input pr-14 rounded-xl"
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs hover:opacity-70" style={{ color: '#888888' }} tabIndex={-1}>
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </div>
                {password.length > 0 && (
                  <p className="text-xs mt-1.5" style={{ color: pwStrong ? '#84CC16' : '#F59E0B' }}>
                    {pwStrong ? '\u2713 Strong enough' : 'Use at least 8 characters'}
                  </p>
                )}
              </div>
              <button type="submit" disabled={loading} className="w-full flex justify-center items-center rounded-full py-3.5 text-sm font-bold transition-opacity hover:opacity-80 mt-2" style={{ background: '#84CC16', color: '#1A1A1A', fontFamily: 'var(--font-space-grotesk)' }}>
                {loading ? 'Creating account\u2026' : 'Create free account'}
              </button>
            </form>

            <div className="flex items-center justify-center gap-1.5 mt-5 lg:hidden">
              <Lock size={11} style={{ color: '#888888' }} />
              <p className="text-xs" style={{ color: '#888888' }}>Your data is never shared</p>
            </div>
            <div className="mt-6 pt-6 text-center" style={{ borderTop: '1px solid #F0F0F0' }}>
              <p className="text-sm" style={{ color: '#888888' }}>
                Already have an account?{' '}
                <Link href="/auth/login" className="font-semibold hover:underline" style={{ color: '#84CC16' }}>Sign in</Link>
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

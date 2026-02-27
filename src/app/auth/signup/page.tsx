'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Logo from '@/components/Logo'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const router = useRouter()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { org_name: orgName },
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setDone(true)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-4">
        <div className="card max-w-md w-full text-center">
          <div className="text-4xl mb-4">📬</div>
          <h2 className="font-display text-xl font-bold text-forest mb-2">Check your email</h2>
          <p className="text-mid text-sm">We&apos;ve sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <Logo variant="dark" size="md" showTagline />
          </div>
          <p className="text-mid text-sm">Create your free account</p>
        </div>

        <div className="card">
          <form onSubmit={handleSignup} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">{error}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Organisation name</label>
              <input
                type="text"
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                className="form-input"
                placeholder="Green Communities CIC"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="form-input"
                placeholder="you@organisation.org"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="form-input"
                placeholder="At least 8 characters"
                minLength={8}
                required
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full flex justify-center">
              {loading ? 'Creating account…' : 'Create free account'}
            </button>
          </form>
          <div className="mt-5 pt-5 border-t border-warm text-center">
            <p className="text-sm text-mid">
              Already have an account?{' '}
              <Link href="/auth/login" className="text-sage font-medium hover:underline">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

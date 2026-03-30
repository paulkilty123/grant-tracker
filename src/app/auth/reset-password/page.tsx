'use client'

import { useState, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Logo from '@/components/Logo'

function ResetPasswordContent() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [exchanging, setExchanging] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  // Supabase lands here with ?code=... — exchange it for a session first
  useEffect(() => {
    async function exchangeCode() {
      const code = searchParams.get('code')
      if (!code) {
        setExchanging(false)
        return
      }
      const supabase = createClient()
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        setError('This reset link has expired or already been used. Please request a new one.')
      }
      setExchanging(false)
    }
    exchangeCode()
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setDone(true)
      setTimeout(() => router.push('/dashboard'), 2500)
    }
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <Logo variant="dark" size="md" showTagline />
          </div>
          <p className="text-mid text-sm">Choose a new password</p>
        </div>

        <div className="card">
          {exchanging ? (
            <div className="text-center py-6 text-mid text-sm">Verifying reset link…</div>
          ) : done ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-4">✅</div>
              <h2 className="font-display text-lg font-bold text-forest mb-2">Password updated!</h2>
              <p className="text-sm text-mid">Taking you to your dashboard…</p>
            </div>
          ) : error && !password ? (
            /* Link expired / already used — show a clear recovery path */
            <div className="text-center py-4">
              <div className="text-4xl mb-4">🔗</div>
              <h2 className="font-display text-lg font-bold text-forest mb-2">Reset link expired</h2>
              <p className="text-sm text-mid mb-6">
                This link has already been used or has expired. Reset links are single-use and valid for 1 hour.
              </p>
              <Link href="/auth/forgot-password" className="btn-primary inline-block">
                Request a new reset link →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">{error}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="form-input"
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Confirm new password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  className="form-input"
                  placeholder="••••••••"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full justify-center flex disabled:opacity-50"
              >
                {loading ? 'Saving…' : 'Set new password'}
              </button>
            </form>
          )}

          {!done && !exchanging && !(error && !password) && (
            <div className="mt-5 pt-5 border-t border-warm text-center">
              <Link href="/auth/login" className="text-sm text-mid hover:text-charcoal transition-colors">
                ← Back to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream flex items-center justify-center"><p className="text-mid text-sm">Loading…</p></div>}>
      <ResetPasswordContent />
    </Suspense>
  )
}

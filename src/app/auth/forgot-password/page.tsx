'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Logo from '@/components/Logo'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const redirectTo = `${window.location.origin}/auth/reset-password`

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
      setLoading(false)
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
          <p className="text-mid text-sm">Reset your password</p>
        </div>

        <div className="card">
          {sent ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-4">📬</div>
              <h2 className="font-display text-lg font-bold text-forest mb-2">Check your email</h2>
              <p className="text-sm text-mid mb-4">
                If <strong className="text-charcoal">{email}</strong> has an account, a reset link is on its way.
                Click the link to set a new password.
              </p>
              <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 text-left mb-4">
                <p className="text-xs text-amber-700 font-semibold mb-1">Not arrived?</p>
                <ul className="text-xs text-amber-600 space-y-1">
                  <li>· Check your spam or junk folder</li>
                  <li>· Allow a minute or two for delivery</li>
                  <li>· Make sure you entered the right address</li>
                  <li>· You can only request one link per hour</li>
                </ul>
              </div>
              <button onClick={() => setSent(false)} className="text-sm text-sage hover:underline">
                Try a different email address
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-mid">
                Enter the email address for your account and we&apos;ll send you a link to reset your password.
              </p>
              {error && (
                <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">{error}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="form-input"
                  placeholder="you@organisation.org"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full justify-center flex"
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}

          <div className="mt-5 pt-5 border-t border-warm text-center">
            <Link href="/auth/login" className="text-sm text-mid hover:text-charcoal transition-colors">
              ← Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

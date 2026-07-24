'use client'

import { useState, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import LogoMark from '@/components/icons/LogoMark'
import { brand } from '@/config/brand'

const UI = "var(--font-space-grotesk), Space Grotesk, sans-serif"
const BODY = "var(--font-dm-sans), Plus Jakarta Sans, sans-serif"

function ResetPasswordContent() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
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

        <div style={{ background: 'white', borderRadius: 16, padding: '40px 36px', boxShadow: '0 2px 24px rgba(23,52,4,0.06)', border: '0.5px solid rgba(23,52,4,0.06)' }}>
          {exchanging ? (
            <p style={{ fontFamily: BODY, fontSize: 14, color: '#5F5E5A', textAlign: 'center', padding: '12px 0' }}>Verifying reset link...</p>
          ) : done ? (
            <>
              <h1 style={{ fontFamily: UI, fontWeight: 500, fontSize: 24, letterSpacing: '-0.02em', color: '#2C2C2A', marginBottom: 8 }}>
                Password updated
              </h1>
              <p style={{ fontFamily: BODY, fontSize: 14.5, color: '#5F5E5A' }}>
                Taking you to your dashboard...
              </p>
            </>
          ) : error && !password ? (
            <>
              <h1 style={{ fontFamily: UI, fontWeight: 500, fontSize: 24, letterSpacing: '-0.02em', color: '#2C2C2A', marginBottom: 8 }}>
                Reset link expired
              </h1>
              <p style={{ fontFamily: BODY, fontSize: 14.5, color: '#5F5E5A', lineHeight: 1.55, marginBottom: 24 }}>
                This link has already been used or has expired. Reset links are single-use and valid for one hour.
              </p>
              <Link
                href="/auth/forgot-password"
                style={{
                  display: 'inline-block',
                  background: '#8ECB3C',
                  color: '#173404',
                  fontFamily: UI,
                  fontWeight: 600,
                  fontSize: 15,
                  padding: '13px 22px',
                  borderRadius: 10,
                  textDecoration: 'none',
                }}
              >
                Request a new reset link
              </Link>
            </>
          ) : (
            <>
              <h1 style={{ fontFamily: UI, fontWeight: 500, fontSize: 28, lineHeight: 1.15, letterSpacing: '-0.02em', color: '#2C2C2A', marginBottom: 6 }}>
                Choose a new password
              </h1>
              <p style={{ fontFamily: BODY, fontSize: 14.5, color: '#5F5E5A', marginBottom: 24 }}>
                Pick something at least 8 characters long.
              </p>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {error && (
                  <div style={{ background: '#FAECE7', border: '0.5px solid rgba(153,60,29,0.25)', color: '#993C1D', fontSize: 13, padding: '11px 14px', borderRadius: 10 }}>
                    {error}
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontFamily: UI, fontWeight: 500, fontSize: 13, color: '#2C2C2A', marginBottom: 6 }}>New password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="form-input"
                      style={{ paddingRight: 56 }}
                      placeholder="At least 8 characters"
                      required
                      minLength={8}
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontFamily: UI, fontSize: 12, color: '#8A8986', background: 'transparent', border: 'none', cursor: 'pointer' }} tabIndex={-1}>
                      {showPw ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontFamily: UI, fontWeight: 500, fontSize: 13, color: '#2C2C2A', marginBottom: 6 }}>Confirm new password</label>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    className="form-input"
                    placeholder={'\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    marginTop: 4,
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
                  {loading ? 'Saving...' : 'Set new password'}
                </button>
              </form>
            </>
          )}

          {!done && !exchanging && !(error && !password) && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '0.5px solid rgba(23,52,4,0.08)', textAlign: 'center' }}>
              <Link href="/auth/login" style={{ fontFamily: UI, fontSize: 13, color: '#5F5E5A', textDecoration: 'none' }}>
                Back to sign in
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
    <Suspense fallback={
      <div style={{ background: '#FAFAF7', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: BODY, fontSize: 14, color: '#5F5E5A' }}>Loading...</p>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}

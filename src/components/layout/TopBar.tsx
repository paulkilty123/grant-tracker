'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LogOut } from 'lucide-react'

interface Props {
  userEmail: string
  orgName?: string | null
}

/**
 * TopBar — design-spec lime/deep-forest tokens.
 * Account badge uses green-lime on green-deep per spec.
 */
export default function TopBar({ userEmail, orgName }: Props) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  const initials = orgName
    ? orgName.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : userEmail.slice(0, 2).toUpperCase()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/dashboard/feedback"
        className="text-[11px] font-semibold uppercase tracking-wider transition-colors no-underline"
        style={{
          color: '#5F5E5A',
          fontFamily: 'var(--font-space-grotesk)',
          letterSpacing: '0.08em',
        }}
      >
        Feedback
      </Link>

      <Link
        href="/dashboard/profile"
        className="text-[11px] font-semibold uppercase tracking-wider transition-colors no-underline px-4 py-1.5 rounded-full"
        style={{
          color: '#2C2C2A',
          border: '0.5px solid rgba(0, 0, 0, 0.14)',
          fontFamily: 'var(--font-space-grotesk)',
          letterSpacing: '0.07em',
        }}
      >
        Edit Profile
      </Link>

      <div
        className="relative"
        onMouseEnter={() => setMenuOpen(true)}
        onMouseLeave={() => setMenuOpen(false)}
      >
        <button
          className="flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold hover:opacity-90 transition-opacity"
          style={{
            background: '#8ECB3C',
            color: '#173404',
            fontFamily: 'var(--font-space-grotesk)',
          }}
          aria-label="Account"
        >
          {initials}
        </button>

        {menuOpen && (
          <div
            className="absolute right-0 top-full mt-1 w-48 bg-white py-1"
            style={{
              borderRadius: '14px',
              border: '0.5px solid rgba(0, 0, 0, 0.08)',
              boxShadow: '0 6px 20px -4px rgba(0, 0, 0, 0.08), 0 2px 6px -2px rgba(0, 0, 0, 0.04)',
            }}
          >
            <div className="px-3 py-2" style={{ borderBottom: '0.5px solid rgba(0, 0, 0, 0.06)' }}>
              <p
                className="text-xs font-semibold truncate"
                style={{ color: '#2C2C2A', fontFamily: 'var(--font-space-grotesk)' }}
              >
                {orgName ?? 'Account'}
              </p>
              <p className="text-[10px] truncate" style={{ color: '#8A8986' }}>{userEmail}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors"
              style={{ color: '#5F5E5A' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#FAFAF7')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

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
        style={{ color: '#888888', fontFamily: 'var(--font-space-grotesk)', letterSpacing: '0.08em' }}
      >
        Feedback
      </Link>

      <Link
        href="/dashboard/profile"
        className="text-[11px] font-semibold uppercase tracking-wider transition-colors no-underline px-4 py-1.5 rounded-full"
        style={{
          color: '#1A1A1A',
          border: '1px solid #E0E0E0',
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
          className="flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold hover:opacity-90 transition-opacity"
          style={{ background: '#84CC16', color: '#1A1A1A', fontFamily: 'var(--font-space-grotesk)' }}
          aria-label="Account"
        >
          {initials}
        </button>

        {menuOpen && (
          <div
            className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl border py-1"
            style={{ borderColor: '#EEEEEE', boxShadow: '0 4px 24px rgba(0,0,0,0.10)' }}
          >
            <div className="px-3 py-2" style={{ borderBottom: '1px solid #F0F0F0' }}>
              <p className="text-xs font-semibold truncate" style={{ color: '#1A1A1A', fontFamily: 'var(--font-space-grotesk)' }}>{orgName ?? 'Account'}</p>
              <p className="text-[10px] truncate" style={{ color: '#888888' }}>{userEmail}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-gray-50"
              style={{ color: '#525252' }}
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

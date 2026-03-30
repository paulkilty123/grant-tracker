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
      {/* Feedback link */}
      <Link
        href="/dashboard/feedback"
        className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-600 transition-colors no-underline"
      >
        Feedback
      </Link>

      {/* Edit Profile button */}
      <Link
        href="/dashboard/profile"
        className="text-[11px] font-semibold uppercase tracking-wider text-charcoal border border-gray-300 hover:border-gray-400 hover:bg-gray-50 transition-colors no-underline px-4 py-1.5 rounded-full"
        style={{ letterSpacing: '0.07em' }}
      >
        Edit Profile
      </Link>

      {/* Account avatar with hover dropdown */}
      <div
        className="relative"
        onMouseEnter={() => setMenuOpen(true)}
        onMouseLeave={() => setMenuOpen(false)}
      >
        <button
          className="flex items-center justify-center w-8 h-8 rounded-full bg-[#008080] text-white text-xs font-bold hover:opacity-90 transition-opacity"
          aria-label="Account"
        >
          {initials}
        </button>

        {/* Dropdown */}
        {menuOpen && (
          <div
            className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1"
            style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.10)' }}
          >
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-xs font-semibold text-charcoal truncate">{orgName ?? 'Account'}</p>
              <p className="text-[10px] text-gray-400 truncate">{userEmail}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors"
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

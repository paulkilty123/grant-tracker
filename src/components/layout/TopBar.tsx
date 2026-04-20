'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LogOut, User, Bell, Settings, MessageSquare } from 'lucide-react'

interface Props {
  userEmail: string
  orgName?: string | null
}

/**
 * TopBar — avatar-only chrome. All secondary nav (Profile, Notifications,
 * Account, Feedback, Sign out) lives behind the avatar dropdown. Feedback
 * and Edit Profile used to sit inline; they were promoted into this menu
 * to clean up the top-right corner globally (design-spec §16.x).
 */
export default function TopBar({ userEmail, orgName }: Props) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const initials = orgName
    ? orgName.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : userEmail.slice(0, 2).toUpperCase()

  // Close on click-outside + Escape. A hover-open menu was the old model,
  // but with 5 items it's too easy to accidentally dismiss en route to
  // a target, so we use click-toggle instead.
  useEffect(() => {
    if (!menuOpen) return
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const menuItems: Array<{ label: string; href?: string; icon: React.ComponentType<{ className?: string }> }> = [
    { label: 'Profile',       href: '/dashboard/profile',       icon: User },
    { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
    { label: 'Account',       href: '/dashboard/account',       icon: Settings },
    { label: 'Feedback',      href: '/dashboard/feedback',      icon: MessageSquare },
  ]

  return (
    <div className="flex items-center gap-3">
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setMenuOpen(v => !v)}
          className="flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold hover:opacity-90 transition-opacity"
          style={{
            background: '#8ECB3C',
            color: '#173404',
            fontFamily: 'var(--font-space-grotesk)',
          }}
          aria-label="Account menu"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          {initials}
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-2 w-56 bg-white py-1 z-50"
            style={{
              borderRadius: '14px',
              border: '0.5px solid rgba(0, 0, 0, 0.08)',
              boxShadow: '0 8px 24px -6px rgba(0, 0, 0, 0.12), 0 2px 6px -2px rgba(0, 0, 0, 0.04)',
            }}
          >
            {/* Identity header */}
            <div className="px-3 py-2.5" style={{ borderBottom: '0.5px solid rgba(0, 0, 0, 0.06)' }}>
              <p
                className="text-xs font-semibold truncate"
                style={{ color: '#2C2C2A', fontFamily: 'var(--font-space-grotesk)' }}
              >
                {orgName ?? 'Account'}
              </p>
              <p className="text-[10px] truncate" style={{ color: '#8A8986' }}>{userEmail}</p>
            </div>

            {/* Nav items */}
            <div className="py-1">
              {menuItems.map(item => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.label}
                    href={item.href!}
                    onClick={() => setMenuOpen(false)}
                    role="menuitem"
                    className="flex items-center gap-2.5 px-3 py-2 text-xs transition-colors no-underline"
                    style={{ color: '#3A3A37', fontFamily: 'var(--font-space-grotesk)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#FAFAF7')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {item.label}
                  </Link>
                )
              })}
            </div>

            {/* Sign out — separated */}
            <div style={{ borderTop: '0.5px solid rgba(0, 0, 0, 0.06)' }} className="py-1">
              <button
                onClick={handleSignOut}
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors"
                style={{ color: '#5F5E5A', fontFamily: 'var(--font-space-grotesk)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#FAFAF7')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

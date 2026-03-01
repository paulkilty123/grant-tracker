'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Organisation } from '@/types'
import { cn } from '@/lib/utils'
import Logo from '@/components/Logo'

interface Props {
  org: Organisation | null
  userEmail: string
}

const NAV: { href: string; label: string; emoji: string; section: string; badge?: string }[] = [
  { href: '/dashboard/search',      label: 'Search Grants',    emoji: '🔍', section: 'Find Funding' },
  { href: '/dashboard/deep-search', label: 'Live Search',       emoji: '🔬', section: 'Find Funding' },
  { href: '/dashboard',             label: 'Overview',         emoji: '📊', section: 'Manage' },
  { href: '/dashboard/pipeline',    label: 'Funding Pipeline', emoji: '🗂',  section: 'Manage' },
  { href: '/dashboard/deadlines',   label: 'Deadlines',        emoji: '📅', section: 'Manage' },
  { href: '/dashboard/profile',     label: 'Profile',          emoji: '👤', section: 'Settings' },
  { href: '/dashboard/admin',       label: 'Source Health',    emoji: '⚙️',  section: 'Settings' },
]

const sections = ['Find Funding', 'Manage', 'Settings']

export default function Sidebar({ org, userEmail }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const initials = org?.name
    ? org.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : userEmail.slice(0, 2).toUpperCase()

  const sidebarContent = (
    <aside className={cn(
      'fixed left-0 top-0 bottom-0 w-60 bg-forest flex flex-col z-50 py-7 transition-transform duration-300',
      // Always visible on md+, slide in/out on mobile
      'md:translate-x-0',
      mobileOpen ? 'translate-x-0' : '-translate-x-full'
    )}>
      {/* Logo */}
      <div className="px-6 pb-7 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Logo variant="light" size="sm" showTagline />
          {/* Close button — mobile only */}
          <button
            className="ml-auto md:hidden text-white/50 hover:text-white text-xl leading-none"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-5 overflow-y-auto">
        {sections.map(section => {
          const items = NAV.filter(n => n.section === section)
          if (!items.length) return null
          return (
            <div key={section}>
              <p className="text-white/35 text-[10px] font-semibold tracking-widest uppercase px-3 mb-1.5">
                {section}
              </p>
              {items.map(item => {
                const isActive = pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'nav-item mb-0.5',
                      isActive && 'active'
                    )}
                  >
                    <span className="text-base w-5 text-center">{item.emoji}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="bg-gold text-forest text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* Org chip + sign out */}
      <div className="px-5 pt-4 border-t border-white/10">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-full bg-mint flex items-center justify-center text-forest text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs font-medium truncate">{org?.name ?? 'My Profile'}</p>
            <p className="text-white/40 text-[10px] truncate">{userEmail}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full text-left text-white/40 hover:text-white/70 text-xs py-1 transition-colors"
        >
          Sign out →
        </button>
      </div>
    </aside>
  )

  return (
    <>
      {/* Mobile hamburger button — shown only when sidebar is closed on mobile */}
      <button
        onClick={() => setMobileOpen(true)}
        className={cn(
          'fixed top-4 left-4 z-40 md:hidden',
          'w-10 h-10 bg-forest rounded-xl flex items-center justify-center shadow-lg',
          'transition-opacity duration-200',
          mobileOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
        )}
        aria-label="Open menu"
      >
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Overlay — mobile only, closes sidebar on tap */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {sidebarContent}
    </>
  )
}

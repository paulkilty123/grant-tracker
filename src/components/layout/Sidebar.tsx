'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Organisation } from '@/types'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Search,
  FolderKanban,
  CalendarClock,
  User,
  MessageSquare,
  Activity,
  ClipboardList,
  Sparkles,
  LogOut,
  Menu,
  X,
  BookOpen,
  Building2,
} from 'lucide-react'

interface Props {
  org: Organisation | null
  userEmail: string
}

function matchProfileScore(org: Organisation | null): number {
  if (!org) return 0
  const checks = [
    (org.themes?.length        ?? 0) > 0,
    (org.areas_of_work?.length ?? 0) > 0,
    !!org.primary_location,
    !!org.mission,
    !!org.annual_income_band,
    (org.beneficiaries?.length ?? 0) > 0,
  ]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

const NAV_GROUPS = [
  {
    label: 'Find Funding',
    items: [
      { href: '/dashboard/search',    label: 'Find Funding',  Icon: Search    },
    ],
  },
  {
    label: 'Manage',
    items: [
      { href: '/dashboard/pipeline',  label: 'Pipeline',   Icon: FolderKanban },
      { href: '/dashboard/deadlines', label: 'Deadlines',  Icon: CalendarClock },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/dashboard/profile',  label: 'My Profile', Icon: User },
      { href: '/dashboard/feedback', label: 'Feedback',   Icon: MessageSquare },
    ],
  },
]

const ADMIN_NAV_GROUP = {
  label: 'Admin',
  items: [
    { href: '/dashboard/admin',              label: 'Grant Health',        Icon: Activity      },
    { href: '/dashboard/admin/urls',         label: 'Grant Manager',       Icon: ClipboardList },
    { href: '/dashboard/admin/corporate',    label: 'Partner Manager',     Icon: Building2     },
    { href: '/dashboard/admin/intelligence', label: 'Funder Intelligence', Icon: Sparkles      },
  ],
}

/**
 * Sidebar — April 2026 design-spec overhaul.
 *  - Deep forest #173404 background with pale-green #97C459 nav labels
 *  - Active state: #27500A panel + pale green text + lime icon
 *  - Logo uses spec lime #8ECB3C, Space Grotesk
 *  - Mobile backdrop is deep-forest 40%, never black
 */
export default function Sidebar({ org, userEmail }: Props) {
  const pathname    = usePathname()
  const router      = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  const profileScore    = matchProfileScore(org)
  const showProfileDot  = org !== null && profileScore < 80

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const initials = org?.name
    ? org.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : userEmail.slice(0, 2).toUpperCase()

  const navLink = (
    href: string,
    label: string,
    Icon: React.ElementType,
    showDot?: boolean,
    score?: number,
  ) => {
    const isActive =
      pathname === href ||
      (href !== '/dashboard' && href !== '/dashboard/admin' && pathname.startsWith(href)) ||
      (href === '/dashboard/admin/intelligence' && pathname.startsWith('/dashboard/admin/watchlist'))

    return (
      <Link
        key={href}
        href={href}
        onClick={() => setMobileOpen(false)}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all',
          'rounded-lg',
          isActive
            ? 'text-green-pale-1 bg-green-active'
            : 'hover:bg-white/[0.04]',
        )}
        style={!isActive ? { color: '#97C459' } : undefined}
      >
        <Icon
          className="h-4 w-4 flex-shrink-0"
          style={{ color: isActive ? '#8ECB3C' : '#97C459' }}
        />
        <span className="flex-1">{label}</span>
        {showDot && !isActive && (
          <span
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{
              background: 'rgba(250, 199, 117, 0.18)',
              color: '#FAC775',
              border: '0.5px solid rgba(250, 199, 117, 0.35)',
            }}
            title={`Match profile ${score}% complete`}
          >
            {score}%
          </span>
        )}
      </Link>
    )
  }

  const sidebarContent = (
    <aside
      className={cn(
        'fixed left-0 top-0 bottom-0 w-60 flex flex-col z-50 transition-transform duration-300',
        'md:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}
      style={{ background: '#173404' }}
    >
      {/* Logo */}
      <div
        className="px-5 py-5 flex items-center justify-between"
        style={{ borderBottom: '0.5px solid rgba(255, 255, 255, 0.08)' }}
      >
        <Link href="/dashboard" className="no-underline">
          <span
            className="font-medium text-lg"
            style={{
              fontFamily: 'var(--font-space-grotesk)',
              color: '#FFFFFF',
              letterSpacing: '-0.02em',
            }}
          >
            Grant<span style={{ color: '#8ECB3C' }}>Tracker</span>
          </span>
        </Link>
        <button
          className="md:hidden"
          style={{ color: 'rgba(255,255,255,0.5)' }}
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Dashboard link */}
      <div className="px-3 pt-4 space-y-0.5">
        {navLink('/dashboard', 'Dashboard', LayoutDashboard)}
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-3 py-3 space-y-5 overflow-y-auto">
        {[...NAV_GROUPS, ...(userEmail === ADMIN_EMAIL ? [ADMIN_NAV_GROUP] : [])].map(group => (
          <div key={group.label}>
            <p
              className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: 'rgba(151, 196, 89, 0.55)' }}
            >
              {group.label}
            </p>
            {group.items.map(item => navLink(
              item.href,
              item.label,
              item.Icon,
              item.href === '/dashboard/profile' ? showProfileDot : false,
              item.href === '/dashboard/profile' ? profileScore : undefined,
            ))}
          </div>
        ))}
      </nav>

      {/* How to use */}
      <div className="px-3 pb-2">
        {navLink('/dashboard/instructions', 'How to use', BookOpen)}
      </div>

      {/* User chip */}
      <div className="px-4 py-4" style={{ borderTop: '0.5px solid rgba(255, 255, 255, 0.08)' }}>
        <div className="flex items-center gap-2.5 mb-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold flex-shrink-0"
            style={{
              background: 'rgba(142, 203, 60, 0.18)',
              color: '#8ECB3C',
              fontFamily: 'var(--font-space-grotesk)',
            }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-sm font-medium"
              style={{ color: '#F1F7E4', fontFamily: 'var(--font-space-grotesk)' }}
            >
              {org?.name ?? 'Account'}
            </p>
            <p
              className="truncate text-[10px]"
              style={{ color: 'rgba(151, 196, 89, 0.55)' }}
            >
              {userEmail}
            </p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 text-xs transition-colors"
          style={{ color: 'rgba(151, 196, 89, 0.55)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#F1F7E4')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(151, 196, 89, 0.55)')}
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  )

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className={cn(
          'fixed top-4 left-4 z-40 md:hidden',
          'w-10 h-10 flex items-center justify-center shadow-lg rounded-lg',
          'transition-opacity duration-200',
          mobileOpen ? 'opacity-0 pointer-events-none' : 'opacity-100',
        )}
        style={{ background: '#173404', color: '#F1F7E4' }}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay — deep-forest 40%, never black */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'rgba(23, 52, 4, 0.4)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {sidebarContent}
    </>
  )
}

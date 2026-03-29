'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Organisation } from '@/types'
import { cn } from '@/lib/utils'
import RadioWaveIcon from '@/components/icons/RadioWaveIcon'
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
      { href: '/dashboard/search', label: 'Find Funding', Icon: Search },
    ],
  },
  {
    label: 'Manage',
    items: [
      { href: '/dashboard/pipeline',  label: 'Funding Pipeline', Icon: FolderKanban },
      { href: '/dashboard/deadlines', label: 'Deadlines',        Icon: CalendarClock },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/dashboard/profile',  label: 'My Profile',   Icon: User },
      { href: '/dashboard/feedback', label: 'Feedback',     Icon: MessageSquare },
    ],
  },
]

const ADMIN_NAV_GROUP = {
  label: 'Admin',
  items: [
    { href: '/dashboard/admin',                  label: 'Grant Health',        Icon: Activity      },
    { href: '/dashboard/admin/urls',             label: 'Grant Manager',       Icon: ClipboardList },
    { href: '/dashboard/admin/intelligence',     label: 'Funder Intelligence', Icon: Sparkles      },
  ],
}

export default function Sidebar({ org, userEmail }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  const profileScore = matchProfileScore(org)
  const showProfileDot = org !== null && profileScore < 80

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const initials = org?.name
    ? org.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : userEmail.slice(0, 2).toUpperCase()

  const navLink = (href: string, label: string, Icon: React.ElementType, showDot?: boolean, score?: number) => {
    const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
      || (href === '/dashboard/admin/intelligence' && pathname.startsWith('/dashboard/admin/watchlist'))
    return (
      <Link
        key={href}
        href={href}
        onClick={() => setMobileOpen(false)}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors',
          isActive
            ? 'bg-white/15 text-white'
            : 'text-white/65 hover:bg-white/10 hover:text-white'
        )}
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1">{label}</span>
        {showDot && !isActive && (
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gold/20 text-gold border border-gold/30"
            title={`Match profile ${score}% complete`}
          >
            {score}%
          </span>
        )}
      </Link>
    )
  }

  const sidebarContent = (
    <aside className={cn(
      'fixed left-0 top-0 bottom-0 w-60 flex flex-col z-50 transition-transform duration-300',
      'md:translate-x-0',
      mobileOpen ? 'translate-x-0' : '-translate-x-full'
    )} style={{ background: '#1C1C2E' }}>
      {/* Logo */}
      <div className="px-6 py-6 flex items-center justify-between border-b border-white/10">
        <Link href="/dashboard" className="flex items-center gap-2.5 no-underline">
          <div className="relative flex items-center justify-center bg-coral w-7 h-7 flex-shrink-0" style={{ borderRadius: '6px' }}>
            <div className="w-2.5 h-2.5 rounded-full border-2 border-white" />
          </div>
          <span className="font-serif text-[18px] text-white">GrantTracker</span>
        </Link>
        <button
          className="md:hidden text-white/50 hover:text-white"
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
      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
        {[...NAV_GROUPS, ...(userEmail === ADMIN_EMAIL ? [ADMIN_NAV_GROUP] : [])].map(group => (
          <div key={group.label}>
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/35">
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

      {/* How to use — pinned above user chip */}
      <div className="px-3 pb-2">
        {navLink('/dashboard/instructions', 'How to use', BookOpen)}
      </div>

      {/* User chip */}
      <div className="border-t border-white/10 px-4 py-4">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{org?.name ?? 'Account'}</p>
            <p className="truncate text-[10px] text-white/40">{userEmail}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 text-xs text-white/40 hover:text-white/80 transition-colors"
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
          'w-10 h-10 flex items-center justify-center shadow-lg bg-[#1C1C2E] rounded-md',
          'transition-opacity duration-200',
          mobileOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
        )}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5 text-white" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {sidebarContent}
    </>
  )
}

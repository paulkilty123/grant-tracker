'use client'

import Link from 'next/link'
import { useState, useRef, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Organisation } from '@/types'
import { cn } from '@/lib/utils'
import LogoMark from '@/components/icons/LogoMark'
import {
  LayoutDashboard,
  Search,
  FolderKanban,
  CalendarClock,
  User,
  Activity,
  ClipboardList,
  Menu,
  X,
  Building2,
  Users,
  MessageSquare,
  LogOut,
  ChevronUp,
  FilePenLine,
  BarChart3,
} from 'lucide-react'

interface Props {
  org: Organisation | null
  userEmail: string
}

function matchProfileScore(org: Organisation | null): number {
  if (!org) return 0
  const fields = [
    (org.impact_sectors?.length     ?? 0) > 0,
    (org.beneficiary_groups?.length ?? 0) > 0,
    !!org.primary_location,
    !!org.legal_structure,
    !!org.annual_income_band,
    !!(org.min_grant_target || org.max_grant_target),
    !!org.mission,
  ]
  return Math.round((fields.filter(Boolean).length / fields.length) * 100)
}

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

const SB = {
  text:       'rgba(245,241,232,0.72)',
  textBright: '#F5F1E8',
  icon:       'rgba(245,241,232,0.55)',
  iconActive: '#8ECB3C',
  hover:      'rgba(245,241,232,0.06)',
  activeBg:   'rgba(142,203,60,0.14)',
  accent:     '#8ECB3C',
  divider:    'rgba(245,241,232,0.08)',
  badgeBg:    'rgba(142,203,60,0.18)',
  badgeText:  '#C0DD97',
}

const MAIN_NAV = [
  { href: '/dashboard/search',    label: 'Find Funding', Icon: Search        },
  { href: '/dashboard/pipeline',  label: 'Pipeline',     Icon: FolderKanban  },
  { href: '/dashboard/deadlines', label: 'Deadlines',    Icon: CalendarClock },
  { href: '/dashboard/profile',   label: 'Profile',      Icon: User          },
  // Notifications slots in here (bell icon, unread badge) when the inbox ships in v1.1
]

// Funder Intelligence retired as a separate nav entry — its worklist
// (Needs Enrichment) and editor (GrantEditor) now live inside Grant Manager.
// The page itself stays accessible at /dashboard/admin/intelligence for now
// in case anything still links to it; full removal is a follow-up.
const ADMIN_NAV = [
  { href: '/dashboard/admin',              label: 'Grant Health',        Icon: Activity      },
  { href: '/dashboard/admin/urls',         label: 'Grant Manager',       Icon: ClipboardList },
  { href: '/dashboard/admin/quality',      label: 'Tagging Quality',     Icon: BarChart3     },
  { href: '/dashboard/admin/cohort-match-audit', label: 'Cohort Matches', Icon: User          },
  { href: '/dashboard/admin/users',        label: 'Users',               Icon: Users         },
  { href: '/dashboard/admin/corporate',    label: 'Partner Manager',     Icon: Building2     },
  { href: '/dashboard/admin/application-review', label: 'Application Review', Icon: FilePenLine },
]

export default function Sidebar({ org, userEmail }: Props) {
  const pathname    = usePathname()
  const router      = useRouter()
  const [mobileOpen,   setMobileOpen]   = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  const profileScore = matchProfileScore(org)
  const showBadge    = org != null && profileScore > 0

  const orgName  = org?.name ?? null
  const initials = orgName
    ? orgName.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : userEmail.slice(0, 2).toUpperCase()

  useEffect(() => {
    if (!userMenuOpen) return
    function onDoc(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown',   onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown',   onKey)
    }
  }, [userMenuOpen])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const navLink = (
    href:  string,
    label: string,
    Icon:  React.ElementType,
    badge?: React.ReactNode,
  ) => {
    const isActive =
      pathname === href ||
      (href != '/dashboard' && href != '/dashboard/admin' && pathname.startsWith(href))

    return (
      <Link
        key={href}
        href={href}
        onClick={() => setMobileOpen(false)}
        className="relative flex items-center gap-2.5 px-3 py-[9px] text-[15px] font-medium transition-colors"
        style={{
          borderRadius: 8,
          color:      isActive ? SB.textBright : SB.text,
          background: isActive ? SB.activeBg   : 'transparent',
          fontFamily: 'var(--font-space-grotesk)',
          textDecoration: 'none',
        }}
        onMouseEnter={e => {
          if (!isActive) {
            e.currentTarget.style.background = SB.hover
            e.currentTarget.style.color      = SB.textBright
          }
        }}
        onMouseLeave={e => {
          if (!isActive) {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color      = SB.text
          }
        }}
      >
        {isActive && (
          <span style={{
            position: 'absolute', left: 0, top: 8, bottom: 8,
            width: 2, background: SB.accent, borderRadius: '0 2px 2px 0',
          }} />
        )}
        <Icon
          className="flex-shrink-0"
          style={{ width: 15, height: 15, color: isActive ? SB.iconActive : SB.icon }}
        />
        <span className="flex-1">{label}</span>
        {badge}
      </Link>
    )
  }

  const profileBadge = showBadge ? (
    <span style={{
      fontFamily: 'var(--font-dm-sans)', fontSize: 12, fontWeight: 500,
      padding: '2px 7px', borderRadius: 999,
      background: SB.badgeBg, color: SB.badgeText,
    }}>
      {profileScore}%
    </span>
  ) : undefined


  const divider = (
    <div style={{ height: 1, background: SB.divider, margin: '6px 0' }} />
  )

  const sidebarContent = (
    <aside
      className={cn(
        'fixed left-0 top-0 bottom-0 w-[min(240px,82vw)] flex flex-col z-50 transition-transform duration-300',
        'md:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}
      style={{ background: '#173404', padding: '20px 12px 12px' }}
    >
      {/* Logo */}
      <div
        className="flex items-center justify-between px-3 pb-[18px] mb-2"
        style={{ borderBottom: `0.5px solid ${SB.divider}` }}
      >
        <Link href="/dashboard" className="no-underline flex items-center gap-1.5">
          <LogoMark size={24} variant="onInk" />
          <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.025em', color: SB.textBright }}>GrantTracker</span>
        </Link>
        <button className="md:hidden" style={{ color: SB.icon }} onClick={() => setMobileOpen(false)}>
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Dashboard */}
      <div className="mt-1">
        {navLink('/dashboard', 'Dashboard', LayoutDashboard)}
      </div>

      {divider}

      {/* Main nav */}
      <nav className="flex flex-col gap-0.5">
        {MAIN_NAV.map(item => navLink(
          item.href,
          item.label,
          item.Icon,
          item.href === '/dashboard/profile' ? profileBadge : undefined,
        ))}
      </nav>

      {/* Admin section */}
      {userEmail === ADMIN_EMAIL && (
        <>
          {divider}
          <nav className="flex flex-col gap-0.5">
            {ADMIN_NAV.map(item => navLink(item.href, item.label, item.Icon))}
          </nav>
          <Link
            href="/dashboard/admin/feedback"
            onClick={() => setMobileOpen(false)}
            style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', padding: '4px 12px', display: 'block', textDecoration: 'none' }}
          >
            match feedback
          </Link>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {divider}

      {/* Help & feedback — dimmed lime */}
      <Link
        href="/dashboard/feedback"
        onClick={() => setMobileOpen(false)}
        className="flex items-center gap-2.5 px-3 py-[9px] text-[15px] font-medium"
        style={{
          borderRadius: 8,
          color: 'rgba(151,196,89,0.8)',
          background: 'transparent',
          fontFamily: 'var(--font-space-grotesk)',
          textDecoration: 'none',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = SB.hover
          e.currentTarget.style.color = 'rgba(151,196,89,1)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'rgba(151,196,89,0.8)'
        }}
      >
        <MessageSquare style={{ width: 15, height: 15, color: 'inherit', flexShrink: 0 }} />
        <span>Feedback</span>
      </Link>

      {/* User card */}
      <div ref={userMenuRef} style={{ position: 'relative', marginTop: 2 }}>
        <button
          onClick={() => setUserMenuOpen(v => !v)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5"
          style={{
            borderRadius: 8,
            background: userMenuOpen ? SB.hover : 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-space-grotesk)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = SB.hover }}
          onMouseLeave={e => { if (!userMenuOpen) e.currentTarget.style.background = 'transparent' }}
        >
          <div style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            background: '#8ECB3C', color: '#173404',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-space-grotesk)',
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <p style={{
              fontSize: 13, fontWeight: 500, color: SB.textBright,
              margin: 0, lineHeight: 1.3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {orgName ?? userEmail}
            </p>
            <p style={{ fontSize: 11, color: SB.text, margin: 0, lineHeight: 1.3 }}>
              Account
            </p>
          </div>
          <ChevronUp style={{
            width: 14, height: 14, color: SB.icon, flexShrink: 0,
            transform: userMenuOpen ? 'rotate(0deg)' : 'rotate(180deg)',
            transition: 'transform 0.15s',
          }} />
        </button>

        {userMenuOpen && (
          <div style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: 0, right: 0,
            background: '#1E3D06',
            borderRadius: 10,
            border: `0.5px solid ${SB.divider}`,
            overflow: 'hidden',
            boxShadow: '0 -4px 16px -4px rgba(0,0,0,0.4)',
          }}>
            <Link
              href="/dashboard/account"
              onClick={() => { setUserMenuOpen(false); setMobileOpen(false) }}
              className="flex items-center gap-2.5 px-3 py-2.5 no-underline"
              style={{ color: SB.text, fontSize: 13, fontFamily: 'var(--font-space-grotesk)' }}
              onMouseEnter={e => { e.currentTarget.style.background = SB.hover; e.currentTarget.style.color = SB.textBright }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = SB.text }}
            >
              <User style={{ width: 14, height: 14, flexShrink: 0 }} />
              Account
            </Link>
            <div style={{ height: '0.5px', background: SB.divider }} />
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-3 py-2.5"
              style={{
                color: SB.text, fontSize: 13, fontFamily: 'var(--font-space-grotesk)',
                background: 'transparent', border: 'none', cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = SB.hover; e.currentTarget.style.color = SB.textBright }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = SB.text }}
            >
              <LogOut style={{ width: 14, height: 14, flexShrink: 0 }} />
              Sign out
            </button>
          </div>
        )}
      </div>
    </aside>
  )

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className={cn(
          'fixed top-4 left-4 z-40 md:hidden',
          'w-10 h-10 flex items-center justify-center shadow-lg rounded-lg',
          'transition-opacity duration-200',
          mobileOpen ? 'opacity-0 pointer-events-none' : 'opacity-100',
        )}
        style={{ background: '#173404', color: '#F5F1E8' }}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

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

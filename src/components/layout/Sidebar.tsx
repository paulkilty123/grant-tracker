'use client'

import Link from 'next/link'
import React, { useState, useRef, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Organisation } from '@/types'
import { cn } from '@/lib/utils'
import LogoMark from '@/components/icons/LogoMark'
import { isNavActive } from '@/lib/nav-active'
import {
  LayoutDashboard,
  Compass,
  Target,
  Telescope,
  Search,
  FolderKanban,
  CalendarClock,
  User,
  Activity,
  ClipboardList,
  Inbox,
  Gauge,
  Menu,
  X,
  Users,
  MessageSquare,
  LogOut,
  ChevronUp,
  FilePenLine,
  BarChart3,
  Lightbulb,
  Library,
  Mail,
} from 'lucide-react'

interface Props {
  org: Organisation | null
  userEmail: string
  /** Companion surface gate (design spec + build-spec §14): computed
   *  server-side in the layout from AGENT_ENABLED + the org's tier. When true,
   *  Briefing replaces Dashboard as the first item. The flag is the single
   *  source of truth for nav visibility — no separate UI toggle. */
  companionSurface?: boolean
  /** Apply-tier entitlement for the org currently in view, resolved
   *  server-side in the layout from that org's apply_access. A prop rather
   *  than a fetch because the layout already knows: the previous version
   *  called /api/builder/access on mount and cached the answer in
   *  sessionStorage under one global key, so switching to an org with
   *  different entitlement kept showing the previous org's nav until the tab
   *  was closed. */
  applyAccess?: boolean
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

/**
 * Sidebar colours, on --deep rather than forest.
 *
 * THE ALPHA BUMPS ARE NOT PREFERENCE. Forest #173404 is darker than deep
 * #1D3C3E, so every alpha-based colour here LOSES contrast when the background
 * lightens. Swapping the background alone would have drifted the whole sidebar
 * down about half a point, invisibly:
 *
 *   Nav label, inactive   7.04:1 on forest -> 6.29:1 on deep at 72%
 *                                          -> 7.40:1 on deep at 80%
 *   Nav icon, inactive    4.76:1 on forest -> 4.39:1 on deep at 55%
 *                                          -> 6.07:1 on deep at 70%
 *
 * Nothing failed either way — icons are non-text UI at a 3:1 threshold — but
 * the direction was wrong and unmeasurable by eye. Change these with the
 * background, never after it.
 *
 * Values are literals rather than var(--token) on purpose: this component
 * renders outside the .shoots-a scope, so a bare var() would collapse.
 */
const SB = {
  text:       'rgba(246,241,231,0.80)',
  textBright: '#F6F1E7',
  icon:       'rgba(246,241,231,0.70)',
  iconActive: '#9BCA9D',
  hover:      'rgba(245,241,232,0.06)',
  activeBg:   'rgba(246,241,231,0.10)',
  accent:     '#9BCA9D',
  divider:    'rgba(246,241,231,0.10)',
  badgeBg:    '#9BCA9D',
  badgeText:  '#1D3C3E',
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
  // Review queue sits first: it is the only admin surface with work actually
  // waiting on a human. Catalogue is next, because it answers the other
  // question — "where is that grant?" — which the queue structurally cannot,
  // since it only ever holds rows awaiting a decision.
  //
  // Grant Manager stays during the transition. Its Needs Review / Tag Review /
  // Captured tabs are replaced by the queue and its All grants / URL Issues /
  // By Category tabs by the Catalogue, but Add Funder, Saved for Later and the
  // bulk validation runners still have no other home.
  // Pipeline first: it answers "is the machine running at all", which precedes
  // "what needs my judgement". A stalled cron makes an empty review queue
  // look like good news.
  { href: '/dashboard/admin/pipeline',     label: 'Pipeline',            Icon: Gauge         },
  { href: '/dashboard/admin/review',       label: 'Review queue',        Icon: Inbox         },
  { href: '/dashboard/admin/grants',       label: 'Catalogue',           Icon: Library       },
  { href: '/dashboard/admin',              label: 'Grant Health',        Icon: Activity      },
  { href: '/dashboard/admin/urls',         label: 'Grant Manager',       Icon: ClipboardList },
  { href: '/dashboard/admin/quality',      label: 'Tagging Quality',     Icon: BarChart3     },
  { href: '/dashboard/admin/cohort-match-audit', label: 'Cohort Matches', Icon: User          },
  { href: '/dashboard/admin/users',        label: 'Users',               Icon: Users         },
  { href: '/dashboard/admin/waitlist',     label: 'Waitlist',            Icon: Mail          },
]

export default function Sidebar({ org, userEmail, companionSurface = false, applyAccess = false }: Props) {
  const pathname    = usePathname()
  const router      = useRouter()
  const [mobileOpen,   setMobileOpen]   = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  // Apply-tier entitlement for the org in view. Arrives as a prop from the
  // layout, so it changes with the org switcher and never lags behind it.
  const builderAllowed = applyAccess
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
    const isActive = isNavActive(pathname, href)

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
      style={{ background: '#1D3C3E', padding: '20px 12px 12px' }}
    >
      {/* Logo */}
      <div
        className="flex items-center justify-between px-3 pb-[18px] mb-2"
        style={{ borderBottom: `0.5px solid ${SB.divider}` }}
      >
        <Link href="/dashboard" className="no-underline flex items-center gap-1.5">
          <LogoMark size={24} variant="onInk" />
          <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 500, letterSpacing: '-0.01em', textTransform: 'lowercase', color: SB.textBright }}>Shoots</span>
        </Link>
        <button className="md:hidden" style={{ color: SB.icon }} onClick={() => setMobileOpen(false)}>
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Scrollable nav region — keeps the footer (account / sign-out card)
          pinned and always visible even when the admin nav is long. flex-1
          fills the space (footer to the bottom) and scrolls internally when the
          item list overflows; min-h-0 is required for the overflow to engage. */}
      <div
        className="flex-1 min-h-0 overflow-y-auto"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(245,241,232,0.18) transparent' }}
      >
        {/* Dashboard — Briefing (+ Plan) replaces it for Companion-surface users */}
        <div className="mt-1">
          {companionSurface
            ? (
              <>
                {navLink('/dashboard/briefing', 'Briefing', Compass)}
                {navLink('/dashboard/plan', 'Plan', Target)}
                {navLink('/dashboard/research', 'Research', Telescope)}
              </>
            )
            : navLink('/dashboard', 'Dashboard', LayoutDashboard)}
        </div>

        {divider}

        {/* Main nav */}
        <nav className="flex flex-col gap-0.5">
          {MAIN_NAV.map(item => {
            // Pipeline is Apply-tier (cohort only) — hide it from free-tier users
            // (RLS blocks the data regardless; this avoids a dead nav entry).
            if (item.href === '/dashboard/pipeline' && !builderAllowed) return null
            return (
              <React.Fragment key={item.href}>
                {navLink(
                  item.href,
                  item.label,
                  item.Icon,
                  item.href === '/dashboard/profile' ? profileBadge : undefined,
                )}
                {/* Projects + Applications (builder) sit after Pipeline — cohort only */}
                {item.href === '/dashboard/pipeline' && builderAllowed && (
                  <>
                    {navLink('/dashboard/projects', 'Projects', Lightbulb)}
                    {navLink('/dashboard/applications', 'Applications', FilePenLine)}
                  </>
                )}
              </React.Fragment>
            )
          })}
        </nav>

        {/* Admin section */}
        {userEmail === ADMIN_EMAIL && (
          <>
            {divider}
            <nav className="flex flex-col gap-0.5">
              {ADMIN_NAV.map(item => navLink(item.href, item.label, item.Icon))}
              {navLink('/dashboard/admin/feedback', 'Match Feedback', MessageSquare)}
              {navLink('/dashboard/admin/feedback-triage', 'Feedback triage', MessageSquare)}
            </nav>
          </>
        )}
      </div>

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
          className="w-full flex items-center gap-2.5 px-3 py-2.5 sb-account-trigger"
          style={{
            borderRadius: 12,
            background: userMenuOpen ? SB.activeBg : 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-space-grotesk)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = SB.hover }}
          onMouseLeave={e => { if (!userMenuOpen) e.currentTarget.style.background = 'transparent' }}
        >
          <div style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            background: '#9BCA9D', color: '#1D3C3E',
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
            // Was #1E3D06 — the old forest — while the sidebar around it is
            // #1D3C3E. Two different greens stacked on each other, which is
            // what made the popup read as a foreign panel.
            background: '#24494B',
            borderRadius: 14,
            border: `0.5px solid ${SB.divider}`,
            overflow: 'hidden',
            padding: 4,
            boxShadow: '0 -6px 20px -4px rgba(0,0,0,0.45)',
          }}>
            <Link
              href="/dashboard/account"
              onClick={() => { setUserMenuOpen(false); setMobileOpen(false) }}
              className="flex items-center gap-2.5 px-3 py-2.5 no-underline"
              style={{ color: SB.text, fontSize: 13, fontFamily: 'var(--font-space-grotesk)', borderRadius: 10 }}
              onMouseEnter={e => { e.currentTarget.style.background = SB.hover; e.currentTarget.style.color = SB.textBright }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = SB.text }}
            >
              <User style={{ width: 14, height: 14, flexShrink: 0 }} />
              Account
            </Link>
            <div style={{ height: '0.5px', background: SB.divider, margin: '2px 8px' }} />
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-3 py-2.5"
              style={{
                color: SB.text, fontSize: 13, fontFamily: 'var(--font-space-grotesk)',
                background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 10,
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
        style={{ background: '#1D3C3E', color: '#F6F1E7' }}
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

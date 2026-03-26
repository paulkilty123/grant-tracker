'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, Bookmark, ChevronDown, Layers, DollarSign, Rocket, Database, Clock, Building2, SlidersHorizontal, Sparkles, MapPin, Award, GraduationCap, TrendingUp, Users, GitMerge, Gift, Landmark, CalendarDays, RefreshCw, Info, Trophy, HandCoins } from 'lucide-react'
import GrantDetailModal from '@/components/GrantDetailModal'
import { SEED_GRANTS } from '@/lib/grants'
import { formatRange } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { createPipelineItem } from '@/lib/pipeline'
import { getOrganisationByOwner } from '@/lib/organisations'
import { computeMatchScore, scoreColour } from '@/lib/matching'
import type { FeedbackSignals, MatchBreakdown } from '@/lib/matching'
import { computeCorporateMatches, SUPPORT_TYPE_LABELS, APPLICATION_ROUTE_LABELS } from '@/lib/corporate-matching'
import type { CorporatePartner, CorporateMatchResult } from '@/lib/corporate-matching'
import { getInteractions, recordInteraction, removeInteraction } from '@/lib/interactions'
import type { GrantOpportunity, Organisation, FunderType, FundingType, ImpactSector, LegalStructure } from '@/types'
import type { InteractionAction } from '@/lib/interactions'

// Format a YYYY-MM-DD deadline string as "Deadline: 10 July 2026"
// Returns null for non-YYYY-MM-DD strings (e.g. free-text from live search)
function formatDeadline(dateStr: string | null): string | null {
  if (!dateStr) return null
  const parts = dateStr.split('-').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return null
  const [y, m, d] = parts
  const date = new Date(y, m - 1, d)
  if (isNaN(date.getTime())) return null
  const formatted = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  return `Deadline: ${formatted}`
}

// Normalise long or awkward free-text sector names for display on grant cards.
// null = suppress from display (org types, geography, and other non-topic values)
const SECTOR_DISPLAY: Record<string, string | null> = {
  'all sectors':               null,
  'disadvantaged communities': 'Disadvantaged',
  'international development': 'Intl. development',
  'digital preservation':      'Digital pres.',
  'digital inclusion':         'Digital inclusion',
  'financial inclusion':       'Financial incl.',
  'economic inclusion':        'Economic incl.',
  'economic development':      'Economic dev.',
  'economic justice':          'Econ. justice',
  'capacity building':         'Capacity bldg.',
  'community business':        'Comm. business',
  'creative industries':       'Creative ind.',
  'criminal justice':          'Criminal justice',
  'physical activity':         'Physical activity',
  'Welsh language':            'Welsh lang.',
  // Org types — should never appear as sector tags
  'charity':                   null,
  'social enterprise':         null,
  'cic':                       null,
  'ngo':                       null,
  'nonprofit':                 null,
  'not-for-profit':            null,
  'voluntary':                 null,
  // Geography — handled by location filter, not sector tags
  'scotland':                  null,
  'wales':                     null,
  'england':                   null,
  'uk':                        null,
  'international':             null,
  // Org stage / vague terms
  'startup':                   null,
  'scaling':                   null,
  'trading':                   null,
  'impact':                    null,
  'facilities':                null,
  'leadership':                null,
}

function sectorLabel(s: string): string | null {
  if (s in SECTOR_DISPLAY) return SECTOR_DISPLAY[s]
  return s
}

// Eligible org structure labels — maps DB keys to short display names
const STRUCTURE_LABELS: Record<string, string> = {
  cic:                            'CIC',
  charity:                        'Charity',
  registered_charity:             'Charity',
  charitable_incorporated_organisation: 'CIO',
  cio:                            'CIO',
  social_enterprise:              'Social Enterprise',
  community_interest_company:     'CIC',
  ltd_company:                    'Ltd Company',
  company_ltd_guarantee:          'Ltd by Guarantee',
  ltd_guarantee:                  'Ltd by Guarantee',
  community_benefit_society:      'Comm. Benefit Society',
  coop:                           'Co-operative',
  cooperative:                    'Co-operative',
  unincorporated:                 'Unincorporated',
  voluntary_organisation:         'Voluntary Org',
  sole_trader:                    'Sole Trader',
  partnership:                    'Partnership',
  public_sector:                  'Public Sector',
  school:                         'School',
  university:                     'University',
  housing_association:            'Housing Association',
  individual:                     'Individual',
}

// 19-sector taxonomy — used for the filter panel and matching
const IMPACT_SECTOR_FILTERS: { id: ImpactSector; label: string }[] = [
  { id: 'young_people',  label: 'Young People' },
  { id: 'community',     label: 'Community' },
  { id: 'health',        label: 'Health' },
  { id: 'mental_health', label: 'Mental Health' },
  { id: 'housing',       label: 'Housing' },
  { id: 'education',     label: 'Education' },
  { id: 'employment',    label: 'Employment' },
  { id: 'disability',    label: 'Disability' },
  { id: 'older_people',  label: 'Older People' },
  { id: 'environment',   label: 'Environment' },
  { id: 'creative',      label: 'Arts & Culture' },
  { id: 'heritage',      label: 'Heritage' },
  { id: 'sport',         label: 'Sport' },
  { id: 'women',         label: 'Women & Gender' },
  { id: 'justice',       label: 'Justice & Equality' },
  { id: 'tech',          label: 'Technology' },
  { id: 'financial',     label: 'Financial Inclusion' },
  { id: 'food',          label: 'Food' },
  { id: 'international', label: 'International' },
]

const FUNDER_TYPES = [
  { id: 'all',               label: 'All sources' },
  { id: 'local',             label: 'Local' },
  { id: 'lottery',           label: 'Lottery' },
  { id: 'trust_foundation',  label: 'Trust & Foundation' },
  { id: 'corporate',         label: 'Corporate' },
  { id: 'local_authority',   label: 'Local Authority' },
  { id: 'government',        label: 'Government' },
  { id: 'competition',       label: 'Competition' },
  { id: 'loan',              label: 'Social Loan' },
  { id: 'crowdfund_match',   label: 'Crowdfund Match' },
]

// Funder categories from the funders table (our 8-category taxonomy)
const FUNDER_CATEGORIES = [
  { id: 'lottery',              label: '🎱 Lottery',               colour: 'bg-green-50 text-green-700 border-green-200' },
  { id: 'government',           label: '🏛️ Government',            colour: 'bg-red-50 text-red-700 border-red-200' },
  { id: 'major_trust',          label: '🏦 Major Trust',           colour: 'bg-sage/10 text-forest border-sage/20' },
  { id: 'community_foundation', label: '🌱 Community Foundation',  colour: 'bg-teal-50 text-teal-700 border-teal-200' },
  { id: 'corporate',            label: '🏢 Corporate',             colour: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'social_investment',    label: '💰 Social Investment',     colour: 'bg-sky-50 text-sky-700 border-sky-200' },
  { id: 'crowdfunding',         label: '🤝 Crowdfunding',          colour: 'bg-pink-50 text-pink-700 border-pink-200' },
  { id: 'sector_body',          label: '📋 Sector Body',           colour: 'bg-purple-50 text-purple-700 border-purple-200' },
]

// Geographic scope filter options
const GEO_SCOPES = [
  { id: 'uk',               label: 'UK-wide'         },
  { id: 'england',          label: 'England'         },
  { id: 'london',           label: 'London'          },
  { id: 'scotland',         label: 'Scotland'        },
  { id: 'wales',            label: 'Wales'           },
  { id: 'northern_ireland', label: 'Northern Ireland'},
  { id: 'regional',         label: 'Regional'        },
]

const FUNDING_TYPES: { id: FundingType | 'all'; label: string; emoji: string; desc: string }[] = [
  { id: 'all',               label: 'All types',                  emoji: '⚡', desc: 'All funding types' },
  { id: 'grant',             label: 'Grants & Awards',            emoji: '🎯', desc: 'One-off grants from trusts, foundations, Lottery & government' },
  { id: 'social_investment', label: 'Social Investment',          emoji: '💰', desc: 'Repayable finance for social purpose organisations' },
  { id: 'blended_finance',   label: 'Blended Finance',            emoji: '🔗', desc: 'Community shares, matched crowdfunding & CDFIs' },
  { id: 'accelerator',       label: 'Incubators & Accelerators',  emoji: '🚀', desc: 'Business support programmes for early-stage social ventures' },
  { id: 'support_programme', label: 'Fellowships & Support',      emoji: '🎓', desc: 'Fellowships, mentoring, capacity building and training programmes' },
  { id: 'in_kind',           label: 'In-Kind & Pro Bono',         emoji: '🎁', desc: 'Non-cash support: free services, expertise, space or equipment' },
]


interface AIResult {
  grantId: string
  score: number
  reason: string
}

interface DisplayGrant {
  grant: GrantOpportunity
  score: number
  reason: string
  isAiScore: boolean
  breakdown?: MatchBreakdown
}

// ── Match Score Badge (with breakdown tooltip) ────────────────────────────────
function MatchBadge({ score, isAi, breakdown }: { score: number; isAi: boolean; breakdown?: MatchBreakdown }) {
  const { bg, text } = scoreColour(score)
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 cursor-pointer hover:opacity-70 transition-opacity"
        title="Click to see score breakdown"
      >
        <span className={`text-[10px] ${text} transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        <span className={`text-sm font-bold ${text}`}>{score}% match</span>
      </button>

      {open && breakdown && (
        <div
          className="absolute right-0 top-full mt-1.5 z-50 bg-white border border-stone-200 shadow-lg p-3 w-52"
          onMouseLeave={() => setOpen(false)}
        >
          <p className="text-xs font-semibold text-charcoal mb-2">Score breakdown</p>
          {Object.values(breakdown).map(dim => {
            const pct = Math.round((dim.score / dim.max) * 100)
            const { bar } = scoreColour(pct)
            return (
              <div key={dim.label} className="mb-1.5">
                <div className="flex justify-between text-xs text-mid mb-0.5">
                  <span>{dim.label}</span>
                  <span className="font-medium text-charcoal">{dim.score}/{dim.max}</span>
                </div>
                <div className="h-1.5 bg-stone-100 overflow-hidden">
                  <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Staleness badge ───────────────────────────────────────────────────────────
function StalenessBadge({ lastVerifiedAt }: { lastVerifiedAt?: string }) {
  if (!lastVerifiedAt) return null
  const today = new Date().toISOString().split('T')[0]
  const msAgo = new Date(today).getTime() - new Date(lastVerifiedAt).getTime()
  const daysAgo = Math.round(msAgo / (1000 * 60 * 60 * 24))

  if (daysAgo <= 1)  return <span className="text-[10px] text-emerald-600 font-medium">✓ Verified today</span>
  if (daysAgo <= 7)  return <span className="text-[10px] text-emerald-500 font-medium">✓ Verified {daysAgo}d ago</span>
  if (daysAgo <= 14) return <span className="text-[10px] text-amber-500 font-medium">Verified {daysAgo}d ago</span>
  return <span className="text-[10px] text-amber-600 font-medium">⚠ Not verified in {daysAgo}d</span>
}

// ── Grant Card ───────────────────────────────────────────────────────────────
function GrantCard({ item, hasOrg, hasSearch, interactions, onAddToPipeline, onDismiss, onUndismiss, onLike, onDislike, onViewDetail, onSave, onUnsave, savedView }: {
  item: DisplayGrant
  hasOrg: boolean
  hasSearch: boolean
  interactions: Set<InteractionAction>
  onAddToPipeline: (g: GrantOpportunity) => void
  onDismiss: (grantId: string) => void
  onUndismiss: (grantId: string) => void
  onLike: (grantId: string) => void
  onDislike: (grantId: string) => void
  onViewDetail: (grantId: string) => void
  onSave: (grantId: string) => void
  onUnsave: (grantId: string) => void
  savedView?: boolean
}) {
  const { grant, score, reason, isAiScore, breakdown } = item
  const [expanded, setExpanded] = useState(false)
  const [structsExpanded, setStructsExpanded] = useState(false)
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const isDismissed  = interactions.has('dismissed')
  const isLiked      = interactions.has('liked')
  const isDisliked   = interactions.has('disliked')
  const isSaved      = interactions.has('saved')

  const typeColour: Record<string, string> = {
    lottery:             'bg-green-50 text-green-700',
    trust_foundation:    'bg-slate-100 text-slate-600',
    corporate:           'bg-amber-50 text-amber-700',
    local_authority:     'bg-purple-50 text-purple-700',
    housing_association: 'bg-teal-50 text-teal-700',
    government:          'bg-red-50 text-red-700',
    competition:         'bg-yellow-50 text-yellow-700',
    loan:                'bg-sky-50 text-sky-700',
    crowdfund_match:     'bg-pink-50 text-pink-700',
  }

  const { text: scoreText } = scoreColour(score)

  const fundingTypeBadge: Record<string, { Icon: React.ComponentType<{ className?: string }>; label: string; cls: string }> = {
    grant:              { Icon: Award,         label: 'Grant',             cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
    accelerator:        { Icon: Rocket,        label: 'Incubator & Accelerator', cls: 'bg-orange-50 text-orange-700 border border-orange-200' },
    support_programme:  { Icon: GraduationCap, label: 'Fellowship & Support',    cls: 'bg-indigo-50 text-indigo-700 border border-indigo-200' },
    programme:          { Icon: GraduationCap, label: 'Fellowship & Support',    cls: 'bg-indigo-50 text-indigo-700 border border-indigo-200' },
    social_investment:  { Icon: TrendingUp,    label: 'Social Investment', cls: 'bg-cyan-50 text-cyan-700 border border-cyan-200' },
    loan:               { Icon: TrendingUp,    label: 'Loan',              cls: 'bg-cyan-50 text-cyan-700 border border-cyan-200' },
    equity:             { Icon: TrendingUp,    label: 'Equity',            cls: 'bg-cyan-50 text-cyan-700 border border-cyan-200' },
    diversity_fund:     { Icon: Users,         label: 'Diversity Fund',    cls: 'bg-violet-50 text-violet-700 border border-violet-200' },
    blended_finance:    { Icon: GitMerge,      label: 'Blended Finance',   cls: 'bg-teal-50 text-teal-700 border border-teal-200' },
    in_kind:            { Icon: Gift,          label: 'In-Kind Support',   cls: 'bg-rose-50 text-rose-700 border border-rose-200' },
    'in-kind':          { Icon: Gift,          label: 'In-Kind Support',   cls: 'bg-rose-50 text-rose-700 border border-rose-200' },
    'tax-relief':       { Icon: Landmark,      label: 'Tax Relief',        cls: 'bg-stone-100 text-stone-700 border border-stone-300' },
  }
  const effectiveFundingType = grant.fundingType ?? 'grant'
  const ftBadge = fundingTypeBadge[effectiveFundingType] ?? fundingTypeBadge['grant']

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const isNewThisWeek = !!grant.dateAdded && grant.dateAdded >= sevenDaysAgo

  const entryType: 'live' | 'rolling' | 'profile' =
    grant.deadline   ? 'live' :
    grant.isRolling  ? 'rolling' :
                       'profile'

  // Only show entry badge for fixed-deadline grants — rolling and profile handled in amount area
  const entryBadge = entryType === 'live'
    ? { Icon: CalendarDays, label: 'Open grant', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' }
    : null

  // Deadline urgency chip
  const urgencyChip = (() => {
    if (entryType !== 'live' || !grant.deadline) return null
    const parts = grant.deadline.split('-').map(Number)
    if (parts.length !== 3) return null
    const days = Math.ceil((new Date(parts[0], parts[1]-1, parts[2]).getTime() - new Date().setHours(0,0,0,0)) / 86400000)
    if (days > 10) return null
    const cls = days < 0 || days <= 3 ? 'bg-red-100 text-red-600' : days <= 7 ? 'bg-amber-100 text-amber-600' : 'bg-orange-50 text-orange-500'
    return <span className={`text-[9px] font-bold px-1.5 py-0.5 ${cls}`}>{days < 0 ? 'Overdue' : days === 0 ? 'Today!' : `${days}d left`}</span>
  })()

  if (isDismissed) {
    return (
      <div className="bg-warm/50 px-5 py-3 mb-2 border border-warm flex items-center justify-between opacity-60">
        <p className="text-sm text-mid line-through">{grant.title} — {grant.funder}</p>
        <button onClick={() => onUndismiss(grant.id)} className="text-xs text-coral hover:underline ml-4 flex-shrink-0">
          Undo dismiss
        </button>
      </div>
    )
  }

  // Only show funder type badge for known, meaningful values — suppress 'other' and unknown fallbacks
  const DISPLAY_FUNDER_TYPES = new Set([
    'trust_foundation', 'local_authority', 'housing_association',
    'corporate', 'lottery', 'government', 'competition', 'loan', 'crowdfund_match',
  ])
  const funderTypeLabel = DISPLAY_FUNDER_TYPES.has(grant.funderType ?? '')
    ? (FUNDER_TYPES.find(t => t.id === grant.funderType)?.label
       ?? FUNDER_CATEGORIES.find(c => c.id === grant.funderType)?.label?.replace(/^.+?\s/, '')
       ?? grant.funderType?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
    : null

  // Deadline text for top-right display (under amount)
  const deadlineDisplay = entryType === 'live' && grant.deadline
    ? (formatDeadline(grant.deadline) ?? grant.deadline)
    : null

  // "Opens soon" — grant exists but hasn't opened yet
  const todayStr = new Date().toISOString().split('T')[0]
  const opensSoonDate = (grant as EnrichedGrant).nextOpenDateParsed ?? null
  const isOpeningSoon = !!opensSoonDate && opensSoonDate > todayStr

  const structures = (grant as EnrichedGrant).eligibleStructures ?? []
  const visibleStructs = structsExpanded ? structures : structures.slice(0, 3)
  const structPills = visibleStructs.map(s => STRUCTURE_LABELS[s] ?? s.replace(/_/g, ' '))
  const structOverflow = !structsExpanded && structures.length > 3 ? structures.length - 3 : 0

  // Sector tags
  const sectorTags = (grant as EnrichedGrant).impactSectors?.length
    ? (grant as EnrichedGrant).impactSectors!.slice(0, 3).map(s =>
        IMPACT_SECTOR_FILTERS.find(f => f.id === s)?.label ?? s)
    : grant.sectors
        .map(s => ({ raw: s, label: sectorLabel(s) }))
        .filter(({ label }) => label !== null)
        .slice(0, 3)
        .map(({ label }) => label as string)

  const hasPills = structPills.length > 0

  // Location label — grant-level tag takes precedence over funder-level scope
  const GEO_LABELS: Record<string, string> = {
    uk: 'UK-wide', england: 'England', london: 'London',
    scotland: 'Scotland', northern_ireland: 'Northern Ireland',
    wales: 'Wales', regional: 'Regional',
  }
  const enriched = grant as EnrichedGrant
  const locationLabel: string | null =
    enriched.locationTag ??
    (enriched.geoScope?.length
      ? enriched.geoScope.map(s => GEO_LABELS[s] ?? s).join(' & ')
      : null)

  const isClickable = grant.source === 'scraped'

  return (
    <div
      className="bg-white border border-warm/80 mb-3 hover:shadow-lg transition-all overflow-hidden"
      style={{ borderLeft: '3px solid transparent' }}
      onMouseEnter={e => (e.currentTarget.style.borderLeftColor = '#2d8a7a')}
      onMouseLeave={e => (e.currentTarget.style.borderLeftColor = 'transparent')}
    >
      <div className="flex items-stretch">

        {/* ── LEFT: Circular match score ── */}
        {hasOrg && hasSearch && score > 0 && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setBreakdownOpen(v => !v) }}
            className="w-[108px] flex-shrink-0 flex flex-col items-center justify-center border-r border-warm/60 bg-cream/40 p-4 hover:bg-cream/70 transition-colors relative"
            title="Click to see score breakdown"
          >
            <div className="relative w-16 h-16">
              <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                <circle cx="18" cy="18" r="14" fill="none" stroke="#e8ddd0" strokeWidth="3.5" />
                <circle
                  cx="18" cy="18" r="14" fill="none"
                  stroke={score >= 80 ? '#2d8a7a' : score >= 65 ? '#e8a030' : score >= 45 ? '#8fa8a5' : '#f87171'}
                  strokeWidth="3.5"
                  strokeDasharray={`${(score / 100) * 87.96} 87.96`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-sm font-bold leading-none ${scoreText}`}>{score}%</span>
              </div>
            </div>
            <span className="text-[8px] font-bold tracking-widest uppercase text-mid mt-1.5">Match</span>
            {isAiScore && <span className="text-[8px] text-sage font-medium mt-0.5">✦ AI</span>}
            {/* Breakdown popup */}
            {breakdownOpen && breakdown && (
              <div
                className="absolute left-full top-0 ml-2 z-50 bg-white border border-stone-200 shadow-lg p-3 w-52"
                onClick={e => e.stopPropagation()}
              >
                <p className="text-xs font-semibold text-charcoal mb-2">Score breakdown</p>
                {Object.values(breakdown).map(dim => {
                  const pct = Math.round((dim.score / dim.max) * 100)
                  const { bar } = scoreColour(pct)
                  return (
                    <div key={dim.label} className="mb-1.5">
                      <div className="flex justify-between text-xs text-mid mb-0.5">
                        <span>{dim.label}</span>
                        <span className="font-medium text-charcoal">{dim.score}/{dim.max}</span>
                      </div>
                      <div className="h-1.5 bg-stone-100 overflow-hidden">
                        <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </button>
        )}

        {/* ── MIDDLE: Content ── */}
        <div
          className={`flex-1 p-4 sm:p-5 min-w-0 ${isClickable ? 'cursor-pointer' : ''}`}
          onClick={isClickable ? () => onViewDetail(grant.id) : undefined}
        >
          {/* Badge row */}
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 border ${ftBadge.cls}`}>
              <ftBadge.Icon className="w-2.5 h-2.5" />{ftBadge.label}
            </span>
            {entryType === 'live' && grant.deadline && (() => {
              const parts = grant.deadline.split('-').map(Number)
              if (parts.length !== 3) return null
              const days = Math.ceil((new Date(parts[0], parts[1]-1, parts[2]).getTime() - new Date().setHours(0,0,0,0)) / 86400000)
              return (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 bg-warm/60 text-mid border border-warm">
                  <Clock className="w-2.5 h-2.5" />
                  {days < 0 ? 'Overdue' : days === 0 ? 'Closes today' : `Closes in ${days} day${days !== 1 ? 's' : ''}`}
                </span>
              )
            })()}
            {grant.isRolling && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 bg-warm/60 text-mid border border-warm">
                <RefreshCw className="w-2.5 h-2.5" />Rolling Deadline
              </span>
            )}
            {locationLabel && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-2 py-0.5 bg-blue-50 text-blue-700">
                <MapPin className="w-2.5 h-2.5" />{locationLabel}
              </span>
            )}
            {isNewThisWeek && (
              <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5">New this week</span>
            )}
            {grant.isInviteOnly && (
              <span className="bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold px-2 py-0.5">✉ Invite Only</span>
            )}
          </div>

          {/* Title + funder */}
          <h3 className="font-display text-lg font-bold text-charcoal leading-tight mb-0.5">{grant.title}</h3>
          <p className="text-sm text-mid mb-3">{grant.funder}</p>

          {/* Description */}
          <p className="text-[13px] text-mid leading-relaxed mb-4">
            {grant.description.length > 180
              ? `${grant.description.slice(0, 180).trimEnd()}…`
              : grant.description}
          </p>

          {/* Match reason snippet */}
          {hasOrg && hasSearch && reason && (
            <p className="text-[11px] text-charcoal/55 italic mb-3 leading-relaxed border-l-2 border-sage/40 pl-2">
              {reason.replace(/<[^>]*>/g, '').trim().slice(0, 140)}{reason.replace(/<[^>]*>/g, '').trim().length > 140 ? '…' : ''}
            </p>
          )}

          {/* Key data row */}
          <div className="flex flex-wrap gap-6 border-t border-warm/50 pt-3">
            <div>
              <p className="text-[9px] font-bold text-light uppercase tracking-widest mb-0.5">Funding Amount</p>
              {(grant.amountMin || grant.amountMax) ? (
                <p className="text-sm font-bold text-charcoal">{formatRange(grant.amountMin, grant.amountMax)}</p>
              ) : (
                <p className="text-sm text-light italic">TBC</p>
              )}
            </div>
            <div>
              <p className="text-[9px] font-bold text-light uppercase tracking-widest mb-0.5">Project Type</p>
              <p className="text-sm font-semibold text-charcoal">
                {effectiveFundingType === 'grant' ? 'Capital & Revenue' :
                 effectiveFundingType === 'social_investment' ? 'Social Investment' :
                 effectiveFundingType === 'accelerator' ? 'Accelerator / Incubator' :
                 effectiveFundingType === 'support_programme' ? 'Fellowship & Support' :
                 effectiveFundingType === 'in_kind' ? 'In-Kind & Pro Bono' :
                 effectiveFundingType.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
              </p>
            </div>
            {sectorTags.length > 0 && (
              <div>
                <p className="text-[9px] font-bold text-light uppercase tracking-widest mb-0.5">Focus</p>
                <p className="text-sm font-semibold text-charcoal">{sectorTags[0]}{sectorTags.length > 1 ? ` & ${sectorTags.length - 1} more` : ''}</p>
              </div>
            )}
          </div>

        </div>{/* end middle content */}

        {/* ── RIGHT: Action buttons ── */}
        <div className="flex flex-col gap-2 p-4 border-l border-warm/60 justify-center items-stretch flex-shrink-0 w-[132px]">
          {isClickable ? (
            <button
              onClick={() => onViewDetail(grant.id)}
              className="px-3 py-2 text-xs font-semibold text-white text-center transition-opacity hover:opacity-90"
              style={{ background: '#1f5c52' }}
            >
              View Details
            </button>
          ) : grant.applyUrl ? (
            <a
              href={grant.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 text-xs font-semibold text-white text-center block transition-opacity hover:opacity-90"
              style={{ background: '#1f5c52' }}
            >
              Visit website →
            </a>
          ) : null}
          {hasOrg && (
            <button
              onClick={e => { e.stopPropagation(); isSaved ? onUnsave(grant.id) : onSave(grant.id) }}
              className={`px-3 py-2 text-xs font-medium border transition-colors text-center ${
                isSaved
                  ? 'border-coral text-coral bg-coral/5'
                  : 'border-warm text-mid bg-cream/50 hover:border-sage hover:text-sage'
              }`}
            >
              {isSaved ? '✓ Saved' : 'Save for Later'}
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); onAddToPipeline(grant) }}
            className="px-3 py-2 text-xs font-medium border border-warm text-mid bg-cream/30 hover:border-sage hover:text-sage transition-colors text-center"
          >
            + Pipeline
          </button>
        </div>

      </div>{/* end flex row */}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function buildSmartQuery(org: Organisation): string {
  const parts: string[] = []
  if (org.primary_location)      parts.push(org.primary_location)
  if (org.themes?.length)        parts.push(org.themes.slice(0, 3).join(', '))
  if (org.areas_of_work?.length) parts.push(org.areas_of_work.slice(0, 3).join(', '))
  if (org.beneficiaries?.length) parts.push(`for ${org.beneficiaries.slice(0, 2).join(' and ')}`)
  return parts.join(' ')
}

const SIXTY_DAYS_AGO = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
const RECENT_GRANTS  = SEED_GRANTS.filter(g => g.dateAdded && g.dateAdded >= SIXTY_DAYS_AGO).slice(0, 12)

const VALID_FUNDER_TYPES: FunderType[] = [
  'trust_foundation', 'local_authority', 'housing_association',
  'corporate', 'lottery', 'government', 'other',
  'competition', 'loan', 'crowdfund_match',
]

// Extended type to carry funder-table metadata alongside grant fields
interface EnrichedGrant extends GrantOpportunity {
  funderCategory?: string       // funders.funder_type (our 8-category taxonomy)
  geoScope?: string[]           // funders.geographic_scope
  locationTag?: string          // scraped_grants.location_tag (grant-level, e.g. "Lambeth")
}

function normaliseScrapedGrant(row: Record<string, unknown>): EnrichedGrant {
  const rawType = String(row.funder_type ?? 'other')
  const funderType: FunderType = VALID_FUNDER_TYPES.includes(rawType as FunderType)
    ? (rawType as FunderType) : 'other'
  return {
    id:                   String(row.external_id ?? row.id),
    title:                String(row.title ?? ''),
    funder:               String(row.funder ?? 'Unknown funder'),
    funderType,
    description:          String(row.description ?? ''),
    amountMin:            typeof row.amount_min  === 'number' ? row.amount_min  : 0,
    amountMax:            typeof row.amount_max  === 'number' ? row.amount_max  : 0,
    deadline:             row.deadline ? String(row.deadline) : null,
    isRolling:            Boolean(row.is_rolling),
    isLocal:              Boolean(row.is_local),
    sectors:              Array.isArray(row.sectors)              ? (row.sectors as string[])              : [],
    eligibilityCriteria:  Array.isArray(row.eligibility_criteria) ? (row.eligibility_criteria as string[]) : [],
    applyUrl:             row.apply_url ? String(row.apply_url) : null,
    isInviteOnly:         Boolean(row.is_invite_only),
    nextOpenDate:         row.next_open_date        ? String(row.next_open_date)        : null,
    nextOpenDateParsed:   row.next_open_date_parsed ? String(row.next_open_date_parsed) : null,
    fundingType:          (row.funding_type ? String(row.funding_type) : 'grant') as FundingType,
    impactSectors:        Array.isArray(row.impact_sectors)     ? (row.impact_sectors     as ImpactSector[])   : undefined,
    eligibleStructures:   Array.isArray(row.eligible_structures) ? (row.eligible_structures as LegalStructure[]) : undefined,
    source:               'scraped',
    dateAdded:            row.first_seen_at  ? String(row.first_seen_at).split('T')[0]  : undefined,
    lastVerifiedAt:       row.last_seen_at   ? String(row.last_seen_at).split('T')[0]   : undefined,
    // Funder-table enrichment (null for 'manual' source grants)
    funderCategory:       row.funder_category ? String(row.funder_category) : undefined,
    geoScope:             Array.isArray(row.geographic_scope) ? (row.geographic_scope as string[]) : undefined,
    locationTag:          row.location_tag ? String(row.location_tag) : undefined,
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function SearchPage() {
  const searchParams = useSearchParams()

  // Initialise filters from URL params (used by landing page category links)
  const initSector      = searchParams.get('sector')      as ImpactSector | null
  const initFundingType = searchParams.get('fundingType') as FundingType   | null
  const isWelcome       = searchParams.get('welcome') === '1'
  const [welcomeDismissed, setWelcomeDismissed] = useState(false)

  const [query, setQuery]               = useState('')       // committed (drives filter)
  const [inputValue, setInputValue]     = useState('')       // live input value (typing only)
  const [activeType, setActiveType]     = useState('all')
  const [aiResults, setAiResults]       = useState<AIResult[] | null>(null)
  const [aiLoading, setAiLoading]       = useState(false)
  const [aiError, setAiError]           = useState<string | null>(null)
  const [smartMatched, setSmartMatched] = useState(false)
  const [toast, setToast]               = useState<string | null>(null)
  const [org, setOrg]                   = useState<Organisation | null>(null)
  const [userId, setUserId]             = useState('')
  const [sortBy, setSortBy]             = useState<'match' | 'amount' | 'freshest' | 'deadline'>('match')
  const [corporateSortBy, setCorporateSortBy] = useState<'match' | 'recent'>('match')
  const [freshnessFilter, setFreshnessFilter] = useState<'all' | '7d' | '14d' | '30d'>('all')
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [interactions, setInteractions] = useState<Map<string, Set<InteractionAction>>>(new Map())
  const [showDismissed, setShowDismissed] = useState(false)
  const [scrapedGrants, setScrapedGrants] = useState<EnrichedGrant[]>([])
  const [amountMin, setAmountMin]         = useState('')
  const [amountMax, setAmountMax]         = useState('')
  const [deadlineFilter, setDeadlineFilter] = useState<'all' | 'rolling' | 'has_deadline'>('all')
  const [closingSoonFilter, setClosingSoonFilter] = useState(false)
  const [activeSectors, setActiveSectors]         = useState<Set<ImpactSector>>(() =>
    initSector ? new Set([initSector]) : new Set()
  )
  const [activeFundingType, setActiveFundingType] = useState<FundingType | 'all' | 'corporate'>(
    initFundingType ?? 'all'
  )
  // categoryFilter removed — accelerator/support_programme/in_kind are now first-class TYPE_TABS
  const [filtersOpen, setFiltersOpen]             = useState(false)
  const [entryTypeFilter, setEntryTypeFilter]     = useState<'all' | 'live' | 'funders'>('all')
  const [showInviteOnly, setShowInviteOnly]       = useState(true)
  const [expandedGroups, setExpandedGroups]       = useState<Set<string>>(new Set())
  const [activeFunderCategory, setActiveFunderCategory] = useState<string>('all')
  const [activeGeoScope, setActiveGeoScope]             = useState<string>('all')
  const [visibleCount, setVisibleCount]           = useState(30)
  const [searchModeToggle, setSearchModeToggle]   = useState<'profile' | 'browse'>('browse')
  const [profileChipsApplied, setProfileChipsApplied] = useState(false)
  const [pipelineNudge, setPipelineNudge]         = useState<{ name: string; url: string | null } | null>(null)
  const [hasSearched, setHasSearched]             = useState(true)
  const [profileFiltersOpen, setProfileFiltersOpen] = useState(false)
  const [activeView, setActiveView]               = useState<'matches' | 'saved'>('matches')
  const [locationFilter, setLocationFilter]       = useState('')
  const [locationInput, setLocationInput]         = useState('')
  const [detailGrantId, setDetailGrantId]         = useState<string | null>(null)
  const [corporateMatches, setCorporateMatches]   = useState<CorporateMatchResult[]>([])
  const [allCorporatePartners, setAllCorporatePartners] = useState<CorporatePartner[]>([])
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('grantSearch')
      if (saved) {
        const { query: q, aiResults: r, activeType: t, smartMatched: sm } = JSON.parse(saved)
        if (q)   { setQuery(q); setInputValue(q) }
        if (r)   setAiResults(r)
        if (t)   setActiveType(t)
        if (sm)  setSmartMatched(sm)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    try {
      sessionStorage.setItem('grantSearch', JSON.stringify({ query, aiResults, activeType, smartMatched }))
    } catch { /* ignore */ }
  }, [query, aiResults, activeType, smartMatched])

  useEffect(() => {
    async function loadOrg() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const o = await getOrganisationByOwner(user.id)
      setOrg(o)
      if (o) {
        const ix = await getInteractions(o.id)
        setInteractions(ix)
        // My Matches mode: always auto-apply profile and show results
        if (o.primary_location) { setLocationFilter(o.primary_location); setLocationInput(o.primary_location) }
        if (o.impact_sectors?.length) setActiveSectors(new Set(o.impact_sectors as ImpactSector[]))
        setSearchModeToggle('profile')
        setProfileChipsApplied(true)
        setHasSearched(true)
      }
      // Fetch live scraped grants — exclude dead URLs and expired deadlines
      const today = new Date().toISOString().split('T')[0]
      const { data: scraped } = await supabase
        .from('grants_with_funder')
        .select('*')
        .eq('is_active', true)
        .neq('url_status', 'dead')
        .or(`is_rolling.eq.true,deadline.is.null,deadline.gte.${today}`)
        .order('last_seen_at', { ascending: false })
        .limit(1500)
      if (scraped) {
        setScrapedGrants(scraped.map(row => normaliseScrapedGrant(row as Record<string, unknown>)))
      }
    }
    loadOrg()
  }, [])

  // ── Load corporate partners (independent of org load to avoid race conditions) ──
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: corpData } = await supabase
        .from('corporate_partners')
        .select('*')
        .order('created_at', { ascending: false })
      if (corpData && corpData.length > 0) {
        setAllCorporatePartners(corpData as CorporatePartner[])
      }
    })
  }, [])

  // Compute profile-matched corporate partners once org + partners are both loaded
  useEffect(() => {
    if (org && allCorporatePartners.length > 0) {
      setCorporateMatches(computeCorporateMatches(allCorporatePartners, org))
    }
  }, [org, allCorporatePartners])


  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleDismiss(grantId: string) {
    if (!org) return
    await recordInteraction(org.id, grantId, 'dismissed')
    setInteractions(prev => {
      const next = new Map(prev)
      const s = new Set(next.get(grantId) ?? [])
      s.add('dismissed')
      next.set(grantId, s)
      return next
    })
  }

  async function handleUndismiss(grantId: string) {
    if (!org) return
    await removeInteraction(org.id, grantId, 'dismissed')
    setInteractions(prev => {
      const next = new Map(prev)
      const s = new Set(next.get(grantId) ?? [])
      s.delete('dismissed')
      next.set(grantId, s)
      return next
    })
  }

  async function handleLike(grantId: string) {
    if (!org) return
    const current = interactions.get(grantId) ?? new Set()
    if (current.has('liked')) {
      // toggle off
      await removeInteraction(org.id, grantId, 'liked')
      setInteractions(prev => {
        const next = new Map(prev)
        const s = new Set(next.get(grantId) ?? [])
        s.delete('liked')
        next.set(grantId, s)
        return next
      })
    } else {
      await recordInteraction(org.id, grantId, 'liked')
      // clear any existing dislike
      if (current.has('disliked')) await removeInteraction(org.id, grantId, 'disliked')
      setInteractions(prev => {
        const next = new Map(prev)
        const s = new Set(next.get(grantId) ?? [])
        s.add('liked')
        s.delete('disliked')
        next.set(grantId, s)
        return next
      })
      showToast('Got it — we\'ll prioritise grants like this')
    }
  }

  async function handleDislike(grantId: string) {
    if (!org) return
    const current = interactions.get(grantId) ?? new Set()
    if (current.has('disliked')) {
      // toggle off
      await removeInteraction(org.id, grantId, 'disliked')
      setInteractions(prev => {
        const next = new Map(prev)
        const s = new Set(next.get(grantId) ?? [])
        s.delete('disliked')
        next.set(grantId, s)
        return next
      })
    } else {
      await recordInteraction(org.id, grantId, 'disliked')
      // clear any existing like
      if (current.has('liked')) await removeInteraction(org.id, grantId, 'liked')
      setInteractions(prev => {
        const next = new Map(prev)
        const s = new Set(next.get(grantId) ?? [])
        s.add('disliked')
        s.delete('liked')
        next.set(grantId, s)
        return next
      })
      showToast('Noted — we\'ll show fewer grants like this')
    }
  }

  async function handleAddToPipeline(grant: GrantOpportunity) {
    if (!org) { showToast('Complete your profile first to track grants'); return }
    try {
      await createPipelineItem({
        org_id:               org.id,
        grant_name:           grant.title,
        funder_name:          grant.funder,
        funder_type:          grant.funderType,
        amount_min:           grant.amountMin ?? null,
        amount_max:           grant.amountMax ?? null,
        amount_requested:     grant.amountMax ?? null,
        deadline:             grant.isRolling ? null : grant.deadline,
        stage:                'identified',
        notes:                null,
        application_progress: 0,
        is_urgent:            false,
        contact_name:         null,
        contact_email:        null,
        grant_url:            grant.applyUrl ?? null,
        outcome_date:         null,
        outcome_notes:        null,
        created_by:           userId,
      })
      setPipelineNudge({ name: grant.title, url: grant.applyUrl ?? null })
    } catch {
      showToast('Failed to add — please try again')
    }
  }

  async function handleSave(grantId: string) {
    if (!org) return
    await recordInteraction(org.id, grantId, 'saved')
    setInteractions(prev => {
      const next = new Map(prev)
      if (!next.has(grantId)) next.set(grantId, new Set())
      next.get(grantId)!.add('saved')
      return next
    })
  }

  async function handleUnsave(grantId: string) {
    if (!org) return
    await removeInteraction(org.id, grantId, 'saved')
    setInteractions(prev => {
      const next = new Map(prev)
      next.get(grantId)?.delete('saved')
      return next
    })
  }

  // ── Grant pool ───────────────────────────────────────────────────────────
  // Seeds are now promoted to scraped_grants so we use the DB as single source.
  // Fall back to including SEED_GRANTS only if the DB returns very few results
  // (e.g. during initial setup before promote-all-seeds has been run).
  const allGrants = scrapedGrants.length > 50 ? scrapedGrants : [...SEED_GRANTS, ...scrapedGrants]

  // Sector filter now uses the fixed 12-sector taxonomy (IMPACT_SECTOR_FILTERS)
  // rather than a dynamic list derived from free-text grant.sectors[]

  function toggleSector(s: ImpactSector) {
    setActiveSectors(prev => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next
    })
  }

  // All non-corporate funding types shown in tabs
  const ALL_FUNDING_TYPES: FundingType[] = ['grant', 'social_investment', 'blended_finance', 'accelerator', 'support_programme', 'in_kind']

  // Reset visible count when search/filters change so the user starts from the top
  useEffect(() => {
    setVisibleCount(30)
  }, [query, activeType, amountMin, amountMax, deadlineFilter, closingSoonFilter, activeSectors, activeFundingType, entryTypeFilter, freshnessFilter, showInviteOnly, aiResults, activeFunderCategory, activeGeoScope])

  // ── Build display grants ─────────────────────────────────────────────────
  const displayGrants: DisplayGrant[] = (() => {
    const minAmt = amountMin ? Number(amountMin) : null
    const maxAmt = amountMax ? Number(amountMax) : null
    const todayStr = new Date().toISOString().split('T')[0]

    const filtered = allGrants.filter(g => {
      // Always strip expired deadlines — never show grants whose closing date has passed
      if (!g.isRolling && g.deadline && g.deadline < todayStr) return false

      // Closing Soon quick filter — show only grants closing within 21 days
      if (closingSoonFilter) {
        const twentyOneDaysStr2 = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        if (!g.deadline || g.deadline > twentyOneDaysStr2) return false
      }

      const matchesType =
        activeType === 'all'      ? true :
        activeType === 'local'    ? g.isLocal :
        activeType === 'recent'   ? (g.dateAdded != null && g.dateAdded >= SIXTY_DAYS_AGO) :
        activeType === 'scraped'  ? g.source === 'scraped' :
        g.funderType === activeType
      const matchesQuery = !query ||
        g.title.toLowerCase().includes(query.toLowerCase()) ||
        g.funder.toLowerCase().includes(query.toLowerCase()) ||
        g.description.toLowerCase().includes(query.toLowerCase()) ||
        g.sectors.some(s => s.toLowerCase().includes(query.toLowerCase()))
      const matchesAmount =
        (minAmt === null || (g.amountMax ?? 0) >= minAmt) &&
        (maxAmt === null || (g.amountMin ?? 0) <= maxAmt)
      const matchesDeadline =
        deadlineFilter === 'all'          ? true :
        deadlineFilter === 'rolling'      ? g.isRolling :
        /* has_deadline */                  (!g.isRolling && g.deadline != null)
      // Use structured impactSectors when present; fall back to include grant
      // (don't exclude grants that haven't been tagged yet, e.g. seed grants)
      const matchesSectors = activeSectors.size === 0 ||
        !(g as EnrichedGrant).impactSectors?.length ||
        (g as EnrichedGrant).impactSectors!.some(s => activeSectors.has(s))
      const gEntryType = g.deadline ? 'live' : g.isRolling ? 'rolling' : 'profile'
      const matchesEntryType =
        entryTypeFilter === 'all'     ? true :
        entryTypeFilter === 'live'    ? (g.dateAdded != null && g.dateAdded >= SIXTY_DAYS_AGO) :
        /* funders */                   gEntryType === 'rolling' || gEntryType === 'profile'
      // Freshness filter — only show grants verified within the selected window
      const matchesFreshness = (() => {
        if (freshnessFilter === 'all') return true
        if (!g.lastVerifiedAt) return true // no verification date — don't hide
        const daysMap = { '7d': 7, '14d': 14, '30d': 30 } as const
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - daysMap[freshnessFilter])
        return new Date(g.lastVerifiedAt) >= cutoff
      })()
      const matchesInviteOnly = showInviteOnly || !g.isInviteOnly
      const matchesFundingType = activeFundingType === 'all' ||
        (g as GrantOpportunity & { fundingType?: FundingType }).fundingType === activeFundingType ||
        // Fallback: if grant has no fundingType set, treat it as 'grant'
        (!( g as GrantOpportunity & { fundingType?: FundingType }).fundingType && activeFundingType === 'grant')
      // Funder category (from funders table — only applies to non-manual grants with enrichment)
      const ge = g as EnrichedGrant
      const matchesFunderCategory =
        activeFunderCategory === 'all' ||
        ge.funderCategory === activeFunderCategory
      // Geographic scope (from funders table — uk/england/london/scotland/etc.)
      const matchesGeoScope =
        activeGeoScope === 'all' ||
        (ge.geoScope && ge.geoScope.includes(activeGeoScope))
      // Location text filter — soft match against geoScope values (grants with no geo data always pass)
      const matchesLocationText = !locationFilter ||
        !ge.geoScope?.length ||
        ge.geoScope.some(s => s.toLowerCase().includes(locationFilter.toLowerCase()) || locationFilter.toLowerCase().includes(s.toLowerCase()))

      return matchesQuery && matchesType && matchesAmount && matchesDeadline && matchesSectors && matchesEntryType && matchesFreshness && matchesInviteOnly && matchesFundingType && matchesFunderCategory && matchesGeoScope && matchesLocationText
    })

    if (aiResults) {
      return aiResults
        .map(r => {
          const grant = allGrants.find(g => g.id === r.grantId)
          if (!grant) return null
          return { grant, score: r.score, reason: r.reason, isAiScore: true }
        })
        .filter((x): x is DisplayGrant => x !== null)
    }

    // ── Build feedback signals from liked/disliked grant history ──────────
    // Extract which sectors appear in liked vs disliked grants, then boost/
    // penalise future matches for those sectors proportionally.
    const feedbackSignals: FeedbackSignals = (() => {
      const boosts    = new Map<string, number>()
      const penalties = new Map<string, number>()
      for (const [grantId, grantInteractions] of Array.from(interactions.entries())) {
        const likedGrant = allGrants.find(g => g.id === grantId)
        if (!likedGrant) continue
        if (grantInteractions.has('liked')) {
          for (const s of likedGrant.sectors) {
            boosts.set(s, (boosts.get(s) ?? 0) + 3)
          }
        }
        if (grantInteractions.has('disliked')) {
          for (const s of likedGrant.sectors) {
            penalties.set(s, (penalties.get(s) ?? 0) + 2)
          }
        }
      }
      return { sectorBoosts: boosts, sectorPenalties: penalties }
    })()

    const withScores: DisplayGrant[] = filtered.map(grant => {
      if (org) {
        const match = computeMatchScore(grant, org, feedbackSignals)
        const grantInteractions = interactions.get(grant.id) ?? new Set()
        let score = match.score
        if (grantInteractions.has('liked'))    score = Math.min(100, score + 12)
        if (grantInteractions.has('disliked')) score = Math.max(0,   score - 20)
        return { grant, score, reason: match.reason, isAiScore: false, breakdown: match.breakdown }
      }
      return { grant, score: 0, reason: '', isAiScore: false }
    })

    // When "Latest Grants" tab is active and no explicit sort chosen, default to newest-first by dateAdded
    if (entryTypeFilter === 'live' && sortBy === 'match') {
      withScores.sort((a, b) => {
        const aDate = a.grant.dateAdded ?? ''
        const bDate = b.grant.dateAdded ?? ''
        return bDate.localeCompare(aDate)
      })
    } else if (org && sortBy === 'match') {
      // When a query is active, tier results by how closely the query matches
      // the funder/title/description so that e.g. searching "Impact Hub" always
      // surfaces Impact Hub grants before grants that merely mention "impact" in
      // their description.
      if (query) {
        const q = query.toLowerCase()
        const queryTier = (g: GrantOpportunity) => {
          if (g.funder.toLowerCase() === q)              return 4  // exact funder match
          if (g.funder.toLowerCase().includes(q))        return 3  // partial funder match
          if (g.title.toLowerCase().includes(q))         return 2  // title match
          if (g.sectors.some(s => s.toLowerCase().includes(q))) return 1  // sector match
          return 0  // description-only match
        }
        withScores.sort((a, b) => {
          const ta = queryTier(a.grant), tb = queryTier(b.grant)
          if (tb !== ta) return tb - ta
          return b.score - a.score
        })
      } else {
        withScores.sort((a, b) => b.score - a.score)
      }
    } else if (sortBy === 'amount') {
      withScores.sort((a, b) => (b.grant.amountMax ?? 0) - (a.grant.amountMax ?? 0))
    } else if (sortBy === 'freshest') {
      withScores.sort((a, b) => {
        const aDate = a.grant.lastVerifiedAt ?? a.grant.dateAdded ?? ''
        const bDate = b.grant.lastVerifiedAt ?? b.grant.dateAdded ?? ''
        return bDate.localeCompare(aDate)
      })
    } else if (sortBy === 'deadline') {
      withScores.sort((a, b) => {
        const aD = a.grant.isRolling ? '9999-12-31' : (a.grant.deadline ?? '9999-12-31')
        const bD = b.grant.isRolling ? '9999-12-31' : (b.grant.deadline ?? '9999-12-31')
        return aD.localeCompare(bD)
      })
    }

    return withScores
  })()

  async function runAISearch(searchQuery: string, isSmartMatch = false, includeOrgContext = false) {
    setAiLoading(true)
    setAiError(null)
    setSmartMatched(false)

    // ── Pre-filter: only send the most relevant grants to the API ──────────
    // Use a two-pool approach so the user's query always dominates over the
    // org profile. This prevents profile-matched grants from drowning out
    // grants that specifically match what the user typed (e.g. "Cornwall arts").
    //
    // Filter to words > 3 chars to skip trivial stop words ("and", "the", "for")
    // Keep words of 3+ characters (changed from >3 so short but meaningful words
    // like "hub", "art", "law" are included rather than being silently dropped,
    // which previously caused multi-word queries like "Impact Hub" to collapse
    // to just "impact" and match dozens of unrelated grants).
    const queryTerms = searchQuery.toLowerCase().split(/\s+/).filter(t => t.length > 2)

    const scored = allGrants.map(g => {
      const text = `${g.title} ${g.funder} ${g.description} ${g.sectors.join(' ')}`.toLowerCase()
      const hits      = queryTerms.filter(t => text.includes(t)).length
      const matchScore = org ? computeMatchScore(g, org).score : 50
      return { g, hits, matchScore }
    })

    // Pool 1 (25 slots) — keyword-first: primary sort by keyword hits, then
    // profile score as a tiebreaker for grants with the same hit count.
    const pool1 = [...scored]
      .sort((a, b) => b.hits !== a.hits ? b.hits - a.hits : b.matchScore - a.matchScore)
      .slice(0, 25)
      .map(({ g }) => g)

    // Pool 2 (10 slots) — profile fallback: top org-match grants not already
    // in pool 1, ensuring Smart Match and profile-only searches still work.
    const pool1Ids = new Set(pool1.map(g => g.id))
    const pool2 = [...scored]
      .sort((a, b) => b.matchScore - a.matchScore)
      .filter(({ g }) => !pool1Ids.has(g.id))
      .slice(0, 10)
      .map(({ g }) => g)

    const preFiltered = [...pool1, ...pool2]

    const grantsContext = preFiltered.map(g => ({
      id: g.id, title: g.title, funder: g.funder,
      description: g.description, amountMin: g.amountMin, amountMax: g.amountMax,
      sectors: g.sectors, isRolling: g.isRolling, isLocal: g.isLocal,
    }))
    try {
      const response = await fetch('/api/ai-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, grants: grantsContext, org: includeOrgContext ? org : null }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error ?? `Request failed (${response.status})`)
      setAiResults(data as AIResult[])
      if (isSmartMatch) setSmartMatched(true)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI search unavailable — showing keyword results instead')
      setAiResults(null)
    } finally {
      setAiLoading(false)
    }
  }

  async function handleAISearch(searchText?: string) {
    const q = searchText ?? inputValue
    if (!q.trim() && !locationFilter.trim()) return
    setQuery(q)
    setInputValue(q)
    setHasSearched(true)
    const combined = [q.trim(), locationFilter.trim()].filter(Boolean).join(' ')
    await runAISearch(combined, false, true)
  }

  function handleSmartMatch() {
    if (!org) return
    const smartQuery = buildSmartQuery(org)
    if (!smartQuery) return
    setQuery(smartQuery)
    setInputValue(smartQuery)
  }


  const orgIsIncomplete = org && !org.themes?.length && !org.areas_of_work?.length && !org.primary_location

  // Compute match-quality profile score + missing fields for the banner
  const matchQuality = (() => {
    if (!org) return null
    const fields: { label: string; filled: boolean; impact: 'high' | 'medium' }[] = [
      { label: 'Priority themes',   filled: (org.themes?.length        ?? 0) > 0, impact: 'high'   },
      { label: 'Areas of work',     filled: (org.areas_of_work?.length ?? 0) > 0, impact: 'high'   },
      { label: 'Location',          filled: !!org.primary_location,                impact: 'high'   },
      { label: 'Mission statement', filled: !!org.mission,                         impact: 'medium' },
      { label: 'Annual income',     filled: !!org.annual_income_band,              impact: 'medium' },
      { label: 'Beneficiaries',     filled: (org.beneficiaries?.length ?? 0) > 0, impact: 'medium' },
    ]
    const filledCount = fields.filter(f => f.filled).length
    const score = Math.round((filledCount / fields.length) * 100)
    const missing = fields.filter(f => !f.filled)
    return { score, missing }
  })()

  // Count active (non-default) filters for the badge
  const activeFilterCount = [
    activeType !== 'all',
    activeFundingType !== 'all',
    // categoryFilter is now a top-level tab, not counted as a hidden filter
    !!amountMin,
    !!amountMax,
    deadlineFilter !== 'all',
    activeSectors.size > 0,
    entryTypeFilter !== 'all',
    freshnessFilter !== 'all',
    !showInviteOnly,
    sortBy !== 'match',
    activeFunderCategory !== 'all',
    activeGeoScope !== 'all',
    !!locationFilter,
  ].filter(Boolean).length

  function resetAllFilters() {
    setActiveType('all')
    setActiveFundingType('all')
    setAmountMin('')
    setAmountMax('')
    setDeadlineFilter('all')
    setActiveSectors(new Set())
    setLocationFilter(''); setLocationInput('')
    setSortBy('match')
    setEntryTypeFilter('all')
    setFreshnessFilter('all')
    setShowInviteOnly(true)
    setActiveFunderCategory('all')
    setActiveGeoScope('all')
    setClosingSoonFilter(false)
  }

  function toggleGroup(label: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  }

  // All funding types visible — filter panel just mirrors the TYPE_TABS

  // Per-type counts for the top tabs
  const todayStr = new Date().toISOString().split('T')[0]
  const allGrants_raw = allGrants.filter(g => {
    if (!g.isRolling && g.deadline && g.deadline < todayStr) return false
    return true
  })
  // When profile filters are active, count only grants that pass sector + location filters
  // so tab badges reflect what the user will actually see (matching Corporate's behaviour)
  const tabCountPool = allGrants_raw.filter(g => {
    const matchesSectors = activeSectors.size === 0 ||
      !(g as EnrichedGrant).impactSectors?.length ||
      (g as EnrichedGrant).impactSectors!.some(s => activeSectors.has(s))
    const ge = g as EnrichedGrant
    const matchesLocation = !locationFilter ||
      !ge.geoScope?.length ||
      ge.geoScope.some(s =>
        s.toLowerCase().includes(locationFilter.toLowerCase()) ||
        locationFilter.toLowerCase().includes(s.toLowerCase())
      )
    return matchesSectors && matchesLocation
  })
  const typeCounts: Record<string, number> = {}
  for (const ft of ALL_FUNDING_TYPES) {
    typeCounts[ft] = tabCountPool.filter(g =>
      ((g as GrantOpportunity & { fundingType?: FundingType }).fundingType ?? 'grant') === ft
    ).length
  }
  typeCounts['all'] = tabCountPool.filter(g =>
    ALL_FUNDING_TYPES.includes((g as GrantOpportunity & { fundingType?: FundingType }).fundingType ?? 'grant')
  ).length
  const corporateProfileFiltered = activeSectors.size > 0 || !!locationFilter
  typeCounts['corporate'] = corporateProfileFiltered ? corporateMatches.length : allCorporatePartners.length

  const TYPE_TABS: { id: FundingType | 'all' | 'corporate'; label: string; icon: React.ReactNode }[] = [
    { id: 'all',              label: 'All',                       icon: <Layers       size={14} strokeWidth={2} /> },
    { id: 'grant',            label: 'Grants & Awards',           icon: <Award        size={14} strokeWidth={2} /> },
    { id: 'social_investment',label: 'Social Investment',         icon: <TrendingUp   size={14} strokeWidth={2} /> },
    { id: 'blended_finance',  label: 'Blended Finance',           icon: <GitMerge     size={14} strokeWidth={2} /> },
    { id: 'accelerator',      label: 'Incubators & Accelerators', icon: <Rocket       size={14} strokeWidth={2} /> },
    { id: 'support_programme',label: 'Fellowships & Support',     icon: <GraduationCap size={14} strokeWidth={2} /> },
    { id: 'in_kind',          label: 'In-Kind & Pro Bono',        icon: <Gift         size={14} strokeWidth={2} /> },
    { id: 'corporate',        label: 'Corporate Partners',        icon: <Building2    size={14} strokeWidth={2} /> },
  ]

  return (
    <div>
      {/* ── DISCOVERY HUB Hero ── */}
      <div className="mb-6">
        <p className="text-[10px] font-bold tracking-widest text-coral uppercase mb-4">Discovery Hub</p>
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <h2 className="font-display text-3xl font-bold text-charcoal leading-tight max-w-lg">
            <span className="block">Identify high-impact funding</span>
            <span className="block">opportunities tailored to</span>
            <span className="block">your mission.</span>
          </h2>
          {/* View tabs */}
          <div className="flex items-center flex-shrink-0 self-center bg-white border border-warm overflow-hidden">
            {([
              { id: 'matches' as const, label: 'My Matches' },
              { id: 'saved' as const,   label: 'Search' },
            ] as const).map((tab, i) => (
              <button
                key={tab.id}
                onClick={() => { setActiveView(tab.id); setFiltersOpen(false); setProfileFiltersOpen(false) }}
                className={`px-5 py-2.5 text-xs font-semibold transition-colors${i > 0 ? ' border-l border-warm' : ''} ${
                  activeView === tab.id
                    ? 'bg-charcoal text-white'
                    : 'text-mid hover:text-charcoal hover:bg-warm/30'
                }`}
              >
                {tab.label}
              </button>
            ))}
            <button
              className="px-5 py-2.5 text-xs font-semibold text-mid flex items-center gap-1.5 border-l border-warm opacity-60 cursor-default"
              title="Coming soon"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-coral inline-block" />
              Live Search
            </button>
          </div>
        </div>
      </div>

      {/* Welcome banner — shown after first profile save */}
      {isWelcome && !welcomeDismissed && (
        <div className="mb-5 border border-forest/30 bg-forest/5 p-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-forest">🎉 Profile saved — here are your matches</p>
            <p className="text-xs text-mid mt-0.5">Results are filtered to grants you&apos;re eligible for. Use &ldquo;Show all grants&rdquo; below to browse everything.</p>
          </div>
          <button onClick={() => setWelcomeDismissed(true)} className="text-mid hover:text-charcoal text-lg leading-none flex-shrink-0">×</button>
        </div>
      )}

      {/* ── Horizontal Filter Bar ── */}
      <div className="bg-white border border-warm/80 shadow-warm mb-5">
        <div className="p-4">
          {/* Org context line */}
          {activeView === 'matches' && org && (
            <div className="mb-3 flex items-center gap-2 text-xs text-mid flex-wrap">
              <span className="w-1.5 h-1.5 rounded-full bg-sage inline-block flex-shrink-0" />
              Ranked for <strong className="text-charcoal">{org.name ?? 'your organisation'}</strong>
              {org.primary_location && <span>· {org.primary_location}</span>}
              <a href="/dashboard/profile" className="ml-auto text-coral hover:underline font-medium">Edit profile →</a>
            </div>
          )}
          {activeView === 'matches' && !org && (
            <div className="mb-3 text-xs border border-amber-200 bg-amber-50 px-3 py-2">
              <a href="/dashboard/profile" className="font-semibold text-amber-700 underline">Set up your profile</a>
              <span className="text-amber-800"> to see grants ranked for your organisation.</span>
            </div>
          )}

          {/* Inline filter row */}
          {activeView === 'matches' && (
            <div className="flex gap-3 items-end flex-wrap">
              {/* Keywords */}
              <div className="flex-1 min-w-[140px]">
                <p className="text-[9px] font-bold text-light uppercase tracking-widest mb-1.5">Keywords</p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-light" />
                  <input
                    type="text"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key !== 'Enter') return
                      setHasSearched(true)
                      handleAISearch(inputValue)
                    }}
                    className="form-input h-10 pl-9 text-sm w-full"
                    placeholder="Community project..."
                  />
                </div>
              </div>

              {/* Location */}
              <div className="w-44">
                <p className="text-[9px] font-bold text-light uppercase tracking-widest mb-1.5">Location</p>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-light" />
                  <input
                    type="text"
                    value={locationInput}
                    onChange={e => setLocationInput(e.target.value)}
                    onBlur={e => setLocationFilter(e.target.value)}
                    onKeyDown={e => {
                      if (e.key !== 'Enter') return
                      setLocationFilter(locationInput)
                      setHasSearched(true)
                      handleAISearch(inputValue)
                    }}
                    className="form-input h-10 pl-9 text-sm w-full"
                    placeholder="London, UK"
                  />
                </div>
              </div>

              {/* Focus Area */}
              <div className="w-48">
                <p className="text-[9px] font-bold text-light uppercase tracking-widest mb-1.5">Focus Area</p>
                <div className="relative">
                  <select
                    value={activeSectors.size === 1 ? Array.from(activeSectors)[0] : ''}
                    onChange={e => {
                      if (e.target.value) setActiveSectors(new Set([e.target.value as ImpactSector]))
                      else setActiveSectors(new Set())
                    }}
                    className="form-select h-10 text-sm w-full appearance-none"
                  >
                    <option value="">All focus areas</option>
                    {IMPACT_SECTOR_FILTERS.map(s => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-light pointer-events-none" />
                </div>
              </div>

              {/* Funding Size */}
              <div className="w-48">
                <p className="text-[9px] font-bold text-light uppercase tracking-widest mb-1.5">Funding Size</p>
                <div className="relative">
                  <select
                    value={amountMin && amountMax ? `${amountMin}_${amountMax}` : ''}
                    onChange={e => {
                      const presets: Record<string, [string, string]> = {
                        '0_10000':       ['0',      '10000'],
                        '10000_50000':   ['10000',  '50000'],
                        '10000_250000':  ['10000',  '250000'],
                        '50000_500000':  ['50000',  '500000'],
                        '100000_1000000':['100000', '1000000'],
                      }
                      const val = e.target.value
                      if (val && presets[val]) {
                        const [min, max] = presets[val]
                        setAmountMin(min); setAmountMax(max)
                      } else {
                        setAmountMin(''); setAmountMax('')
                      }
                    }}
                    className="form-select h-10 text-sm w-full appearance-none"
                  >
                    <option value="">Any amount</option>
                    <option value="0_10000">Up to £10k</option>
                    <option value="10000_50000">£10k – £50k</option>
                    <option value="10000_250000">£10k – £250k</option>
                    <option value="50000_500000">£50k – £500k</option>
                    <option value="100000_1000000">£100k – £1M</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-light pointer-events-none" />
                </div>
              </div>

              {/* Refine Results */}
              <div>
                <button
                  onClick={() => setFiltersOpen(o => !o)}
                  className="h-10 px-5 text-sm font-semibold flex items-center gap-2 text-white transition-opacity hover:opacity-90"
                  style={{ background: filtersOpen || activeFilterCount > 0 ? '#1a2e2b' : '#1f5c52' }}
                >
                  <SlidersHorizontal size={14} strokeWidth={2} />
                  {activeFilterCount > 0 ? `Refine · ${activeFilterCount}` : 'Refine Results'}
                </button>
              </div>

              {aiResults && (
                <button
                  onClick={() => { setAiResults(null); setSmartMatched(false); setQuery(''); setInputValue('') }}
                  className="h-10 px-4 border border-warm text-xs font-medium text-mid hover:border-coral hover:text-coral transition-all bg-white"
                >
                  Clear AI results
                </button>
              )}
            </div>
          )}

          {/* Active filter chips */}
          {activeView === 'matches' && !filtersOpen && activeFilterCount > 0 && (
            <div className="mt-3 flex items-center gap-1.5 flex-wrap">
              {activeType !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-forest/10 text-forest text-[11px] font-medium">
                  {FUNDER_TYPES.find(f => f.id === activeType)?.label}
                  <button onClick={() => setActiveType('all')} className="ml-0.5 hover:text-coral">×</button>
                </span>
              )}
              {activeFundingType !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-forest/10 text-forest text-[11px] font-medium">
                  {activeFundingType === 'corporate' ? 'Corporate Partners' : FUNDING_TYPES.find(f => f.id === activeFundingType)?.label}
                  <button onClick={() => setActiveFundingType('all')} className="ml-0.5 hover:text-coral">×</button>
                </span>
              )}
              {activeGeoScope !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-forest/10 text-forest text-[11px] font-medium">
                  {GEO_SCOPES.find(g => g.id === activeGeoScope)?.label}
                  <button onClick={() => setActiveGeoScope('all')} className="ml-0.5 hover:text-coral">×</button>
                </span>
              )}
              {(!!amountMin || !!amountMax) && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-forest/10 text-forest text-[11px] font-medium">
                  £{amountMin || '0'} – £{amountMax || '∞'}
                  <button onClick={() => { setAmountMin(''); setAmountMax('') }} className="ml-0.5 hover:text-coral">×</button>
                </span>
              )}
              {closingSoonFilter && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-coral/10 text-coral text-[11px] font-medium">
                  Closing Soon
                  <button onClick={() => setClosingSoonFilter(false)} className="ml-0.5 hover:text-red-600">×</button>
                </span>
              )}
              {deadlineFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-forest/10 text-forest text-[11px] font-medium">
                  {deadlineFilter === 'rolling' ? 'Rolling' : 'Has deadline'}
                  <button onClick={() => setDeadlineFilter('all')} className="ml-0.5 hover:text-coral">×</button>
                </span>
              )}
              {Array.from(activeSectors).map(s => (
                <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 bg-forest/10 text-forest text-[11px] font-medium">
                  {IMPACT_SECTOR_FILTERS.find(f => f.id === s)?.label ?? s}
                  <button onClick={() => toggleSector(s)} className="ml-0.5 hover:text-coral">×</button>
                </span>
              ))}
              {activeFunderCategory !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-forest/10 text-forest text-[11px] font-medium">
                  {FUNDER_CATEGORIES.find(c => c.id === activeFunderCategory)?.label ?? activeFunderCategory}
                  <button onClick={() => setActiveFunderCategory('all')} className="ml-0.5 hover:text-coral">×</button>
                </span>
              )}
              <button onClick={resetAllFilters} className="px-2.5 py-1 text-[11px] font-semibold text-coral hover:text-red-600 transition-colors">
                Clear all
              </button>
            </div>
          )}

          {activeView === 'matches' && aiError && <p className="text-amber-600 text-xs mt-3">⚠ {aiError}</p>}


          {/* ── Collapsible filters panel ── */}
          {filtersOpen && (
          <div className="mt-4 pt-4 border-t border-warm space-y-4">

            {/* Row 1: Funding type + Funder source */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-light uppercase tracking-wider mb-2">Funding type</p>
                <div className="flex gap-1.5 flex-wrap">
                  {FUNDING_TYPES.map(t => (
                    <button key={t.id} onClick={() => setActiveFundingType(t.id as FundingType | 'all')}
                      title={t.desc}
                      className={`px-3 py-1.5 border text-xs font-medium transition-all ${
                        activeFundingType === t.id
                          ? 'bg-charcoal border-charcoal text-white'
                          : 'border-warm text-mid hover:border-coral hover:text-coral'
                      }`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-light uppercase tracking-wider mb-2">Funder type</p>
                <div className="flex gap-1.5 flex-wrap">
                  {(['all', 'local', 'lottery', 'trust_foundation', 'corporate', 'local_authority', 'government'] as const).map(id => {
                    const t = FUNDER_TYPES.find(f => f.id === id)
                    if (!t) return null
                    return (
                      <button key={t.id} onClick={() => setActiveType(t.id)}
                        className={`px-3 py-1.5 border text-xs font-medium transition-all ${
                          activeType === t.id
                            ? 'bg-charcoal border-charcoal text-white'
                            : 'border-warm text-mid hover:border-coral hover:text-coral'
                        }`}>
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Row 2: Geography + Amount + Deadline */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-semibold text-light uppercase tracking-wider mb-2">Location</p>
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    onClick={() => setActiveGeoScope('all')}
                    className={`px-3 py-1.5 border text-xs font-medium transition-all ${
                      activeGeoScope === 'all'
                        ? 'bg-charcoal border-charcoal text-white'
                        : 'border-warm text-mid hover:border-coral hover:text-coral'
                    }`}
                  >
                    Anywhere
                  </button>
                  {GEO_SCOPES.map(scope => (
                    <button
                      key={scope.id}
                      onClick={() => setActiveGeoScope(activeGeoScope === scope.id ? 'all' : scope.id)}
                      className={`px-3 py-1.5 border text-xs font-medium transition-all ${
                        activeGeoScope === scope.id
                          ? 'bg-charcoal border-charcoal text-white'
                          : 'border-warm text-mid hover:border-coral hover:text-coral'
                      }`}
                    >
                      {scope.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-light uppercase tracking-wider mb-2">Amount range</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-light">£</span>
                  <input type="number" value={amountMin} onChange={e => setAmountMin(e.target.value)}
                    className="form-input w-full text-xs py-1.5" placeholder="Min" min={0} />
                  <span className="text-xs text-light">–</span>
                  <span className="text-xs text-light">£</span>
                  <input type="number" value={amountMax} onChange={e => setAmountMax(e.target.value)}
                    className="form-input w-full text-xs py-1.5" placeholder="Max" min={0} />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-light uppercase tracking-wider mb-2">Deadline</p>
                <div className="flex gap-1.5 flex-wrap">
                  {(['all', 'rolling', 'has_deadline'] as const).map(v => (
                    <button key={v} onClick={() => setDeadlineFilter(v)}
                      className={`px-3 py-1.5 border text-xs font-medium transition-all ${
                        deadlineFilter === v
                          ? 'bg-charcoal border-charcoal text-white'
                          : 'border-warm text-mid hover:border-coral hover:text-coral'
                      }`}>
                      {v === 'all' ? 'Any' : v === 'rolling' ? 'Rolling' : 'Has deadline'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 3: Sector — 12-sector taxonomy pills */}
            <div>
              <p className="text-xs font-semibold text-light uppercase tracking-wider mb-2">Sector</p>
              <div className="flex gap-1.5 flex-wrap">
                {IMPACT_SECTOR_FILTERS.map(s => {
                  const isActive = activeSectors.has(s.id)
                  return (
                    <button key={s.id} onClick={() => toggleSector(s.id)}
                      className={`px-3 py-1.5 border text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-charcoal border-charcoal text-white'
                          : 'border-warm text-mid hover:border-coral hover:text-coral'
                      }`}>
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Reset all */}
            {activeFilterCount > 0 && (
              <button
                onClick={resetAllFilters}
                className="text-xs font-semibold text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 transition-all"
              >
                ✕ Reset all filters
              </button>
            )}
          </div>
        )}
        </div>{/* end filter bar inner */}
      </div>{/* end filter bar card */}

      {/* ── Funding type tabs ── */}
      {activeView === 'matches' && (
        <>
        <div className="flex flex-wrap gap-2 mb-2 mt-1">
          {TYPE_TABS.map(tab => {
            const isActive = activeFundingType === tab.id
            const count = typeCounts[tab.id as string]
            return (
              <button
                key={tab.id}
                onClick={() => setActiveFundingType(tab.id as FundingType | 'all' | 'corporate')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border transition-all ${
                  isActive
                    ? 'bg-charcoal text-white border-charcoal'
                    : 'bg-white text-mid border-warm hover:border-stone-300 hover:text-charcoal'
                }`}
              >
                {tab.icon}
                {tab.label}
                {count != null && (
                  <span className={`text-[10px] font-bold ml-0.5 ${isActive ? 'text-white/60' : 'text-stone-400'}`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {(() => {
          const descriptions: Partial<Record<FundingType | 'all' | 'corporate', string>> = {
            grant:             'Grants & Awards are non-repayable funds — you never pay them back. They come from charitable trusts, foundations, the National Lottery, and government bodies. Most require a written application and have specific eligibility criteria around who can apply and what the money can be used for.',
            social_investment: 'Social Investment is repayable finance — this includes loans, equity stakes, and revenue-sharing arrangements — designed for organisations with a clear social mission. Unlike grants, you pay this money back, but it allows you to access larger sums and retain more control over how it\'s used. Best suited to organisations with some earned income or assets.',
            blended_finance:   'Blended Finance combines a grant with a repayable element — for example, part-grant and part-loan — often structured to reduce risk for the investor and make larger or more complex projects viable. Common in housing, community enterprise, and environmental projects where pure grant funding isn\'t sufficient.',
            accelerator:       'Incubators & Accelerators are structured programmes — typically 3–12 months — that provide a combination of funding, mentoring, workspace, and networks to help early-stage social ventures grow. They usually require an application and cohort selection process, and may take a small equity stake or involve a repayable element.',
            support_programme: 'Fellowships & Support programmes offer non-financial or lightly funded development opportunities — including fellowships, leadership programmes, skills training, peer learning networks, and expert mentoring. They are ideal for founders and teams looking to build capability and connections rather than capital.',
            in_kind:           'In-Kind & Pro Bono support means you receive goods, services or expertise rather than cash. Examples include free legal advice, donated office space, discounted software, design support, or professional skills volunteered by corporate partners. It can significantly reduce your operating costs without requiring repayment.',
            corporate:         'Corporate Partners are companies open to working with charities and social organisations — but these are not grants. Opportunities here include sponsorship, in-kind support (free products, services, or expertise), employee volunteering, and matched giving schemes. Approaching a corporate partner is more like a business conversation than a grant application — focus on shared values and mutual benefit.',
          }
          const desc = descriptions[activeFundingType]
          const tabIcon = TYPE_TABS.find(t => t.id === activeFundingType)?.icon
          return desc ? (
            <div className="flex items-start gap-3 mb-4 mt-1 px-4 py-3 bg-cream border-l-2 border-sage">
              {tabIcon && <span className="flex-shrink-0 mt-0.5 text-sage">{tabIcon}</span>}
              <p className="text-sm text-mid leading-relaxed">{desc}</p>
            </div>
          ) : <div className="mb-2" />
        })()}
        </>
      )}

      {/* ── Results header ── */}
      {activeView === 'matches' && hasSearched && activeFundingType !== 'corporate' && (
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center px-3 py-1.5 text-xs font-bold text-white" style={{ background: '#1f5c52' }}>
              {aiResults && smartMatched ? `✦ ${displayGrants.length}` : displayGrants.length} Opportunities
            </span>
            <p className="text-sm text-mid">
              {aiResults && smartMatched ? (
                <>matched for <strong className="text-charcoal">{org?.name}</strong></>
              ) : aiResults ? (
                <>ranked for &ldquo;{query}&rdquo;</>
              ) : (
                <>matched to your profile{query ? ` · &ldquo;${query}&rdquo;` : ''}</>
              )}
            </p>
          </div>
          {!aiResults && (
            <div className="flex items-center gap-2 text-xs text-mid">
              <span className="font-medium">Sort by:</span>
              <div className="flex items-center gap-0 bg-white border border-warm overflow-hidden">
                {([
                  { id: 'match',    label: 'Match to you'   },
                  { id: 'freshest', label: 'Recently Added' },
                  { id: 'deadline', label: 'Closes Soon'    },
                ] as const).map((tab, i) => (
                  <button
                    key={tab.id}
                    onClick={() => setSortBy(tab.id)}
                    className={`px-3 py-1.5 font-medium transition-colors${i > 0 ? ' border-l border-warm' : ''}`}
                    style={sortBy === tab.id
                      ? { backgroundColor: '#1f5c52', color: '#fff' }
                      : { backgroundColor: '#fff', color: '#6b7280' }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}


      {/* ── Match quality banner ── */}
      {hasSearched && matchQuality && matchQuality.score < 80 && !bannerDismissed && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 flex items-start gap-3">
          {/* Quality ring */}
          <div className="flex-shrink-0 mt-0.5">
            <div className="relative w-11 h-11">
              <svg viewBox="0 0 36 36" className="w-11 h-11 -rotate-90">
                <circle cx="18" cy="18" r="14" fill="none" stroke="#fde68a" strokeWidth="4" />
                <circle
                  cx="18" cy="18" r="14" fill="none"
                  stroke={matchQuality.score >= 60 ? '#f59e0b' : '#ef4444'}
                  strokeWidth="4"
                  strokeDasharray={`${(matchQuality.score / 100) * 88} 88`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-amber-700">
                {matchQuality.score}%
              </span>
            </div>
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 mb-0.5">
              Your match quality is {matchQuality.score < 40 ? 'low' : matchQuality.score < 65 ? 'partial' : 'nearly there'}
            </p>
            <p className="text-xs text-amber-800 leading-snug">
              {matchQuality.missing.slice(0, 3).map(f => f.label).join(', ')}{' '}
              {matchQuality.missing.length > 3 ? `and ${matchQuality.missing.length - 3} more` : ''} missing from your profile.{' '}
              Complete it so Grant Tracker can find the grants most relevant to your work.
            </p>
            <a
              href="/dashboard/profile"
              className="inline-block mt-2 text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 px-3 py-1.5 transition-colors"
            >
              Complete profile →
            </a>
          </div>

          {/* Dismiss */}
          <button
            onClick={() => setBannerDismissed(true)}
            className="flex-shrink-0 text-amber-400 hover:text-amber-600 text-lg leading-none mt-0.5"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}


      {/* ── Corporate Partnerships view ── */}
      {activeFundingType === 'corporate' && activeView === 'matches' && (() => {
        // Mirror grant filtering: respect profile filters in My Matches, show all in Search
        const baseItems = corporateProfileFiltered
          ? corporateMatches.map(m => ({ partner: m.partner, score: m.score as number | null, reason: m.reason as string | null }))
          : allCorporatePartners
              .map(p => {
                const match = corporateMatches.find(m => m.partner.id === p.id)
                return { partner: p, score: match?.score ?? null, reason: match?.reason ?? null }
              })
        const items = [...baseItems].sort((a, b) => {
          if (corporateSortBy === 'recent') {
            const aD = a.partner.created_at ?? ''
            const bD = b.partner.created_at ?? ''
            return bD.localeCompare(aD)
          }
          return (b.score ?? 0) - (a.score ?? 0) // 'match'
        })
        return (
          <div className="mb-4">
            <div className="flex items-center justify-between gap-2 mb-4">
              <p className="text-sm text-mid">
                {corporateProfileFiltered
                  ? <><strong className="text-charcoal">{items.length}</strong> Corporate Partners matched to your profile</>
                  : <><strong className="text-charcoal">{items.length}</strong> total Corporate Partners</>
                }
              </p>
              <div className="flex items-center gap-0 border border-warm overflow-hidden text-xs">
                {([
                  { id: 'match'  as const, label: 'Match to you'   },
                  { id: 'recent' as const, label: 'Recently Added' },
                ] as const).map((tab, i) => (
                  <button
                    key={tab.id}
                    onClick={() => setCorporateSortBy(tab.id)}
                    className={`px-3 py-1.5 font-medium transition-colors${i > 0 ? ' border-l border-warm' : ''}`}
                    style={corporateSortBy === tab.id
                      ? { backgroundColor: '#E8725C', color: '#fff' }
                      : { backgroundColor: '#fff', color: '#6b7280' }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {items.map(({ partner, score, reason }) => {
                const amountStr = partner.amount_max
                  ? partner.amount_min && partner.amount_min !== partner.amount_max
                    ? `£${partner.amount_min.toLocaleString()} – £${partner.amount_max.toLocaleString()}`
                    : `Up to £${partner.amount_max.toLocaleString()}`
                  : partner.annual_investment_estimate
                    ? `~£${partner.annual_investment_estimate.toLocaleString()} / yr`
                    : null
                const geoLabel = partner.geographic_focus?.length
                  ? partner.geographic_focus.slice(0, 2).join(' & ')
                  : null
                return (
                  <div key={partner.slug}
                    className="bg-white border border-warm/80 shadow-warm mb-3 hover:shadow-lg transition-all"
                    style={{ borderLeft: '3px solid transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.borderLeftColor = '#2d8a7a')}
                    onMouseLeave={e => (e.currentTarget.style.borderLeftColor = 'transparent')}
                  >
                    <div className="p-4 sm:p-5">
                      <div className="flex items-start gap-3">
                        {/* Company initial icon */}
                        <div className="h-10 w-10 bg-[#f0faf8] flex items-center justify-center text-charcoal font-bold text-sm flex-shrink-0 border border-warm">
                          {partner.company_name[0].toUpperCase()}
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Badge row */}
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 border bg-amber-50 text-amber-700 border-amber-200">
                              <Building2 className="w-2.5 h-2.5" />Corporate Partner
                            </span>
                            {partner.application_route && (
                              <span className="text-[10px] font-medium px-2 py-0.5 bg-warm text-mid border border-warm">
                                {APPLICATION_ROUTE_LABELS[partner.application_route] ?? partner.application_route}
                              </span>
                            )}
                            {geoLabel && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-2 py-0.5 bg-blue-50 text-blue-700">
                                <MapPin className="w-2.5 h-2.5" />{geoLabel}
                              </span>
                            )}
                          </div>

                          {/* Title + amount */}
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-display text-lg font-bold text-charcoal leading-tight">{partner.company_name}</h3>
                              {partner.programme_name && (
                                <p className="text-sm text-mid mt-0.5">{partner.programme_name}</p>
                              )}
                              {!partner.programme_name && partner.industry_sector && (
                                <p className="text-sm text-mid mt-0.5">{partner.industry_sector}</p>
                              )}
                            </div>
                            {amountStr && (
                              <div className="flex-shrink-0 text-right">
                                <p className="text-xl font-bold text-gold leading-tight">{amountStr}</p>
                              </div>
                            )}
                          </div>

                          {/* Description */}
                          {partner.description && (
                            <p className="text-[13px] text-mid leading-relaxed mb-3">
                              {partner.description.length > 160
                                ? `${partner.description.slice(0, 160).trimEnd()}…`
                                : partner.description}
                            </p>
                          )}

                          {/* Match reason box */}
                          {score !== null && reason && (
                            <div className="mb-3 border border-sage/30 bg-sage/5 px-3 py-2.5">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-base font-bold leading-none text-sage">{score}%</span>
                                <span className="text-xs text-charcoal/60">
                                  {score >= 75 ? 'Strong match' : score >= 60 ? 'Good match' : score >= 45 ? 'Partial match' : 'Lower match'}
                                </span>
                              </div>
                              <p className="text-xs text-charcoal/75 leading-relaxed">{reason}</p>
                            </div>
                          )}

                          {/* Support type tags */}
                          {partner.support_types?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {partner.support_types.map(st => (
                                <span key={st} className="tag bg-violet-50 text-violet-600 capitalize">
                                  {SUPPORT_TYPE_LABELS[st] ?? st}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bottom action bar */}
                    <div className="flex items-center justify-end gap-2 px-4 sm:px-5 py-2.5 border-t border-warm/60 bg-cream/40">
                      {(partner.programme_url ?? partner.website) && (
                        <a
                          href={partner.programme_url ?? partner.website ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 text-xs font-medium transition-colors"
                          style={{ background: '#E8725C', color: '#ffffff' }}
                        >
                          Visit website →
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-[10px] text-light mt-4 leading-relaxed">
              Corporate partnership data is curated by Grant Tracker and verified periodically. Always check current programme availability on the company website.
            </p>
          </div>
        )
      })()}

      {/* ── Saved grants view ── */}
      {activeView === 'saved' && (() => {
        const savedGrants: DisplayGrant[] = allGrants
          .filter(g => interactions.get(g.id)?.has('saved'))
          .map(g => ({ grant: g, score: 0, reason: '' as string, isAiScore: false, breakdown: undefined }))
        return (
          <div className="mt-4">
            {savedGrants.length === 0 ? (
              <div className="text-center py-16 text-light">
                <Bookmark className="h-8 w-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No saved grants yet — bookmark grants to review them here.</p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-mid mb-4">
                  <strong className="text-charcoal">{savedGrants.length}</strong> saved grant{savedGrants.length !== 1 ? 's' : ''} — review and add to your pipeline
                </p>
                {savedGrants.map(item => (
                  <GrantCard
                    key={item.grant.id}
                    item={item}
                    hasOrg={!!org}
                    hasSearch={false}
                    interactions={interactions.get(item.grant.id) ?? new Set()}
                    onAddToPipeline={handleAddToPipeline}
                    onDismiss={handleDismiss}
                    onUndismiss={handleUndismiss}
                    onLike={handleLike}
                    onDislike={handleDislike}
                    onViewDetail={setDetailGrantId}
                    onSave={handleSave}
                    onUnsave={handleUnsave}
                    savedView={true}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Database grant list ── */}
      {activeView === 'matches' && activeFundingType !== 'corporate' && hasSearched && (displayGrants.length === 0 ? (
        <div className="text-center py-16 text-light">
          <p className="text-4xl mb-3">🔍</p>
          <p className="mb-3">No grants found — try different keywords or clear the filters.</p>
        </div>
      ) : (
        <>
          {displayGrants.length > 30 && (
            <p className="text-xs text-mid mb-3">Showing {Math.min(visibleCount, displayGrants.length)} of {displayGrants.length} grants</p>
          )}
          {displayGrants.slice(0, visibleCount).map(item => (
            <GrantCard
              key={item.grant.id}
              item={item}
              hasOrg={!!org}
              hasSearch={activeView === 'matches' || query.trim() !== '' || item.isAiScore}
              interactions={interactions.get(item.grant.id) ?? new Set()}
              onAddToPipeline={handleAddToPipeline}
              onDismiss={handleDismiss}
              onUndismiss={handleUndismiss}
              onLike={handleLike}
              onDislike={handleDislike}
              onViewDetail={setDetailGrantId}
              onSave={handleSave}
              onUnsave={handleUnsave}
            />
          ))}
          {visibleCount < displayGrants.length && (
            <div className="text-center py-6">
              <button
                onClick={() => setVisibleCount(v => v + 30)}
                className="btn-outline px-6 py-2.5 text-sm"
              >
                Show more ({displayGrants.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </>
      ))}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-charcoal text-white px-5 py-3.5 shadow-card-lg text-sm z-50">
          ✓ {toast}
        </div>
      )}

      {/* Pipeline nudge modal */}
      {pipelineNudge && (
        <div className="fixed inset-0 bg-charcoal/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white border border-warm w-full max-w-sm p-6" style={{ boxShadow: '0 8px 40px rgba(26,46,43,0.18)' }}>
            <p className="text-sm font-semibold text-charcoal mb-1">✓ Added to your pipeline</p>
            <p className="text-xs text-mid mb-4 leading-relaxed">
              <strong className="text-charcoal">{pipelineNudge.name}</strong> is now in <em>Identified</em>. Head to your pipeline to set a deadline and move it to <em>Applying</em>.
            </p>
            <div className="flex gap-2">
              <a
                href="/dashboard/pipeline"
                className="flex-1 text-center px-3 py-2 bg-coral text-white text-xs font-semibold hover:opacity-90 transition-colors"
              >
                Go to pipeline →
              </a>
              <button
                onClick={() => setPipelineNudge(null)}
                className="flex-1 px-3 py-2 border border-warm text-xs text-mid hover:text-charcoal transition-colors"
              >
                Keep browsing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grant detail modal */}
      <GrantDetailModal
        grantId={detailGrantId}
        onClose={() => setDetailGrantId(null)}
        onAddToPipeline={g => handleAddToPipeline({
          id:                 g.external_id ?? g.id,
          title:              g.title,
          funder:             g.funder,
          funderType:         (g.funder_type ?? 'other') as GrantOpportunity['funderType'],
          fundingType:        (g.funding_type ?? 'grant') as GrantOpportunity['fundingType'],
          description:        g.description ?? '',
          amountMin:          g.amount_min ?? 0,
          amountMax:          g.amount_max ?? 0,
          deadline:           g.deadline,
          isRolling:          g.is_rolling ?? false,
          isLocal:            g.is_local ?? false,
          sectors:            Array.isArray(g.sectors) ? g.sectors : [],
          eligibilityCriteria: Array.isArray(g.eligibility_criteria) ? g.eligibility_criteria : [],
          applyUrl:           g.apply_url ?? null,
          isInviteOnly:       false,
          source:             'scraped',
        })}
      />
    </div>
  )
}

'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, ChevronDown, Layers, DollarSign, Rocket, Building2, SlidersHorizontal, MapPin, GraduationCap, TrendingUp, GitMerge, Gift, Landmark, CalendarDays, RefreshCw, Bookmark, PlusCircle, Activity, Info, Target, Star, CheckCircle2, XCircle, Lightbulb, AlertTriangle, Sparkles, ExternalLink, ClipboardList, EyeOff, Eye } from 'lucide-react'
import { SEED_GRANTS } from '@/lib/grants'
import { formatRange } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { createPipelineItem, deletePipelineItem } from '@/lib/pipeline'
import { getOrganisationByOwner } from '@/lib/organisations'
import { computeMatchScore, scoreColour } from '@/lib/matching'
import type { FeedbackSignals, MatchBreakdown } from '@/lib/matching'
import { getInteractions, recordInteraction, removeInteraction } from '@/lib/interactions'
import { saveSearchHistory, getSearchHistory, deleteSearchHistory, getWeeklySearchCount } from '@/lib/searchHistory'
import type { GrantOpportunity, Organisation, FunderType, FundingType, ImpactSector, LegalStructure } from '@/types'
import { SUBTYPE_LABELS } from '@/lib/funding-subtypes'
import { normaliseScrapedGrant, type EnrichedGrant } from '@/lib/grants-normalise'
import type { InteractionAction } from '@/lib/interactions'
import type { SearchHistoryItem } from '@/lib/searchHistory'

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

// Normalise long or awkward free-text sector names for display on grant cards
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
  'social enterprise':         'Social enterprise',
  'criminal justice':          'Criminal justice',
  'physical activity':         'Physical activity',
  'Welsh language':            'Welsh lang.',
}

function sectorLabel(s: string): string | null {
  if (s in SECTOR_DISPLAY) return SECTOR_DISPLAY[s]
  // Fallback: replace underscores with spaces and title-case each word
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Eligible org structure labels — maps DB keys to short display names
const STRUCTURE_LABELS: Record<string, string> = {
  cic:                            'CIC',
  cic_guarantee:                  'CIC (Guarantee)',
  cic_shares:                     'CIC (Shares)',
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

// 12-sector taxonomy — used for the filter panel and matching
const IMPACT_SECTOR_FILTERS: { id: ImpactSector; label: string }[] = [
  { id: 'community',    label: 'Community' },
  { id: 'health',       label: 'Health' },
  { id: 'education',    label: 'Education' },
  { id: 'employment',   label: 'Employment' },
  { id: 'creative',     label: 'Arts & Culture' },
  { id: 'environment',  label: 'Environment' },
  { id: 'housing',      label: 'Housing' },
  { id: 'food',         label: 'Food' },
  { id: 'justice',      label: 'Justice & Equality' },
  { id: 'tech',         label: 'Technology' },
  { id: 'financial',    label: 'Financial Inclusion' },
  { id: 'international',label: 'International' },
]

const FUNDER_TYPES = [
  { id: 'all',               label: 'All sources' },
  { id: 'local',             label: 'Local' },
  { id: 'lottery',           label: 'Lottery' },
  { id: 'trust_foundation',  label: 'Trust & Foundation' },
  { id: 'capacity_builder',  label: 'Capacity Builder' },
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
  { id: 'major_trust',          label: '🏦 Major Trust',           colour: 'bg-[#F4F9E8] text-[#4A7C10] border-[#C5E88A]' },
  { id: 'community_foundation', label: '🌱 Community Foundation',  colour: 'bg-[#F4F9E8] text-[#4A7C10] border-[#C5E88A]' },
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
  { id: 'all',        label: 'All types',   emoji: '⚡', desc: 'All funding types' },
  { id: 'grant',      label: 'Grants',      emoji: '🎯', desc: 'Non-repayable cash: grants, awards, bursaries & prizes' },
  { id: 'programme',  label: 'Programmes',  emoji: '🚀', desc: 'Accelerators, fellowships, incubators & support programmes' },
  { id: 'investment', label: 'Investment',  emoji: '💰', desc: 'Repayable finance: loans, patient capital & blended finance' },
  { id: 'in_kind',    label: 'In-Kind',     emoji: '🛠️', desc: 'Non-cash: software credits, ad grants, workspace & pro bono' },
]

// ── Live Search (web) types & constants ──────────────────────────────────────
interface LiveGrant {
  title: string
  funder: string
  description: string
  amountRange: string | null
  deadline: string | null
  applyUrl: string
  notes: string
}

interface LiveSearchResponse {
  summary: string
  grants: LiveGrant[]
  _cached?: boolean
}

const LIVE_SECTOR_FILTERS = [
  { id: 'mental health',              label: 'Mental Health' },
  { id: 'youth',                      label: 'Youth' },
  { id: 'elderly',                    label: 'Older People' },
  { id: 'education & training',       label: 'Education' },
  { id: 'housing',                    label: 'Housing' },
  { id: 'disability',                 label: 'Disability' },
  { id: 'arts & culture',             label: 'Arts & Culture' },
  { id: 'sport & physical activity',  label: 'Sport' },
  { id: 'environment',                label: 'Environment' },
  { id: 'food poverty',               label: 'Food Poverty' },
  { id: 'community',                  label: 'Community' },
  { id: 'social enterprise',          label: 'Social Enterprise' },
  { id: 'women & girls',              label: 'Women & Girls' },
]

const LIVE_EXAMPLE_QUERIES = [
  'mental health funding Lewisham',
  'youth sport grants Brighton',
  'community food bank Birmingham',
  'arts and heritage Cornwall',
  'disability support Edinburgh',
  'environmental projects Leeds',
]

// ── Live Grant Card ───────────────────────────────────────────────────────────
function LiveGrantCard({ grant, onAddToPipeline }: {
  grant: LiveGrant
  onAddToPipeline: (g: LiveGrant) => void
}) {
  return (
    <div className="bg-white p-5 shadow-warm mb-3 border border-warm/80 hover:shadow-lg transition-all">
      <div className="flex gap-4">
        {/* Left: main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-3 mb-2">
            <div className="h-10 w-10 bg-[#f5f2ed] flex items-center justify-center text-charcoal font-bold text-sm flex-shrink-0 border border-warm">
              {grant.funder[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <h3 className="font-semibold text-charcoal text-lg leading-snug">{grant.title}</h3>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap flex-shrink-0">🌐 Live</span>
              </div>
              <p className="text-sm text-mid">{grant.funder}</p>
            </div>
          </div>

          <p className="text-sm text-mid leading-relaxed mt-2 mb-3">
            {grant.description.length > 200
              ? `${grant.description.slice(0, 200).trimEnd()}…`
              : grant.description}
          </p>

          {grant.notes && (
            <div className="border px-3.5 py-2.5 mb-3 flex items-start gap-2"
              style={{ backgroundColor: 'rgba(26,122,94,0.06)', borderColor: 'rgba(26,122,94,0.18)' }}>
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#84CC16' }} strokeWidth={2} />
              <p className="text-sm leading-snug" style={{ color: '#525252' }}>{grant.notes}</p>
            </div>
          )}
        </div>

        {/* Right: amount + deadline + actions */}
        <div className="flex flex-col items-end gap-3 min-w-[150px] flex-shrink-0">
          <div className="text-right">
            <p className="text-xl font-bold text-gold">
              {grant.amountRange ?? '—'}
            </p>
            <p className="text-xs text-light mt-0.5">
              {formatDeadline(grant.deadline) ?? (grant.deadline ? grant.deadline : 'No deadline listed')}
            </p>
          </div>

          <div className="flex flex-col gap-1.5 w-full">
            <a href={grant.applyUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium transition-colors w-full"
              style={{ background: '#1A1A1A', color: '#ffffff', border: '1px solid #1A1A1A' }}>
              Visit website →
            </a>
            <button onClick={() => onAddToPipeline(grant)}
              className="px-3 py-2 text-xs font-bold w-full hover:opacity-80 transition-colors rounded-full" style={{ background: '#1A1A1A', color: '#FFFFFF' }}>
              Pipeline
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

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

// ── Score colour gradient ─────────────────────────────────────────────────────
// Returns a hex colour that smoothly interpolates:
//   0 → coral (#e05c3a)  →  44 → gold (#e8a030)  →  70 → sage (#2d8a7a)  →  100 → forest (#1f5c52)
// Used for the badge text so the dot + percentage visually signal match quality
// without hard bucket jumps. The breakdown bars still use Tailwind classes via
// the existing scoreColour() function (no change needed there).
function scoreHex(score: number): string {
  const s = Math.max(0, Math.min(100, score))
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const hex   = (n: number) => Math.round(n).toString(16).padStart(2, '0')
  let r: number, g: number, b: number
  if (s <= 44) {
    const t = s / 44
    r = lerp(0xe0, 0xe8, t); g = lerp(0x5c, 0xa0, t); b = lerp(0x3a, 0x30, t)
  } else if (s <= 70) {
    const t = (s - 44) / 26
    r = lerp(0xe8, 0x2d, t); g = lerp(0xa0, 0x8a, t); b = lerp(0x30, 0x7a, t)
  } else {
    const t = (s - 70) / 30
    r = lerp(0x2d, 0x1f, t); g = lerp(0x8a, 0x5c, t); b = lerp(0x7a, 0x52, t)
  }
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

// ── Match Score Badge (with breakdown tooltip) ────────────────────────────────
function MatchBadge({ score, isAi, breakdown }: { score: number; isAi: boolean; breakdown?: MatchBreakdown }) {
  const colour = scoreHex(score)
  const { bar } = scoreColour(score)  // keep Tailwind bar class for breakdown bars
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 cursor-pointer hover:opacity-70 transition-opacity"
        title="Click to see score breakdown"
      >
        <span className="text-sm" style={{ color: colour }}>{isAi ? '✦' : '●'}</span>
        <span className="text-sm font-bold" style={{ color: colour }}>{score}% match</span>
        {breakdown && <span className="text-xs opacity-40" style={{ color: colour }}>▾</span>}
      </button>

      {open && breakdown && (
        <div
          className="absolute right-0 top-full mt-1.5 z-50 bg-white border border-stone-200 shadow-lg p-3 w-52"
          onMouseLeave={() => setOpen(false)}
        >
          <p className="text-xs font-semibold text-charcoal mb-2">Score breakdown</p>
          {Object.values(breakdown).map(dim => {
            const pct = Math.round((dim.score / dim.max) * 100)
            const dimColour = scoreHex(pct)
            return (
              <div key={dim.label} className="mb-1.5">
                <div className="flex justify-between text-xs text-mid mb-0.5">
                  <span>{dim.label}</span>
                  <span className="font-medium text-charcoal">{dim.score}/{dim.max}</span>
                </div>
                <div className="h-1.5 bg-stone-100 overflow-hidden">
                  <div className="h-full" style={{ width: `${pct}%`, backgroundColor: dimColour }} />
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
function GrantCard({ item, hasOrg, hasSearch, interactions, org, onAddToPipeline, onRemoveFromPipeline, onDismiss, onUndismiss, onLike, onDislike, onSave, onUnsave, showIfDismissed, isInPipeline }: {
  item: DisplayGrant
  hasOrg: boolean
  hasSearch: boolean
  interactions: Set<InteractionAction>
  org?: Organisation | null
  onAddToPipeline: (g: GrantOpportunity) => void
  onRemoveFromPipeline?: (g: GrantOpportunity) => void
  onDismiss: (grantId: string) => void
  onUndismiss: (grantId: string) => void
  onLike: (grantId: string) => void
  onDislike: (grantId: string) => void
  onSave?: (grantId: string) => void
  onUnsave?: (grantId: string) => void
  showIfDismissed?: boolean
  isInPipeline?: boolean
}) {
  const { grant, score, reason, isAiScore, breakdown } = item
  const [expanded, setExpanded] = useState(false)
  const isDismissed  = interactions.has('dismissed')
  const isLiked      = interactions.has('liked')
  const isDisliked   = interactions.has('disliked')
  const isSaved      = interactions.has('saved')


  // "New this week" badge — show if added within last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const isNewThisWeek = !!grant.dateAdded && grant.dateAdded >= sevenDaysAgo

  // Classify the entry so users know what they're looking at
  const entryType: 'live' | 'rolling' | 'profile' =
    grant.deadline   ? 'live' :
    grant.isRolling  ? 'rolling' :
    /* else */         'profile'

  if (isDismissed) {
    if (!showIfDismissed) return null
    return (
      <div className="bg-warm/40 px-5 py-3 mb-2 rounded-lg border border-warm flex items-center justify-between opacity-60">
        <p className="text-sm text-mid line-through">{grant.title} — {grant.funder}</p>
        <button onClick={() => onUndismiss(grant.id)} className="text-xs hover:underline ml-4 flex-shrink-0" style={{ color: '#84CC16' }}>
          Restore
        </button>
      </div>
    )
  }

  // Deadline days remaining
  const daysLeft = (() => {
    if (!grant.deadline || grant.isRolling) return null
    const parts = grant.deadline.split('-').map(Number)
    if (parts.length !== 3) return null
    return Math.ceil((new Date(parts[0], parts[1]-1, parts[2]).getTime() - new Date().setHours(0,0,0,0)) / 86400000)
  })()

  // Sector labels
  const sectorLabels = (grant as EnrichedGrant).impactSectors?.length
    ? (grant as EnrichedGrant).impactSectors!.slice(0, 3).map(s =>
        IMPACT_SECTOR_FILTERS.find(f => f.id === s.toLowerCase())?.label
          ?? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      )
    : grant.sectors.map(s => sectorLabel(s)).filter(Boolean).slice(0, 3) as string[]

  // Eligible structure labels
  const structureLabels = ((grant as EnrichedGrant).eligibleStructures ?? [])
    .slice(0, 3).map(s => STRUCTURE_LABELS[s] ?? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))

  return (
    <div className="bg-white mb-3 border border-[#E8E8EC] hover:shadow-md transition-shadow rounded-xl overflow-hidden">

      {/* ── Top two-column section ── */}
      <div className="flex">

        {/* ── Content ── */}
        <div className="flex-1 min-w-0 p-6">

          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {/* Up to 3 sector pills */}
            {sectorLabels.slice(0, 3).map(label => (
              <span key={label} className="text-[10px] font-bold uppercase tracking-wider px-3 py-1"
                style={{ borderRadius: 9999, backgroundColor: 'rgba(255,183,77,0.20)', color: '#8B5E00' }}>
                {label}
              </span>
            ))}
            {/* Funder type pill */}
            {grant.funderType && grant.funderType !== 'other' && (() => {
              const FUNDER_PILL_LABELS: Record<string, string> = {
                trust_foundation:  'Trust / Foundation',
                community_foundation: 'Community Foundation',
                corporate_foundation: 'Corporate Foundation',
                capacity_builder:  'Capacity Builder',
                local_authority:   'Local Authority',
                housing_association: 'Housing Assoc.',
                corporate:         'Corporate',
                lottery:           'Lottery',
                government:        'Government',
                competition:       'Competition',
                loan:              'Loan',
                crowdfund_match:   'Crowd Match',
              }
              const label = FUNDER_PILL_LABELS[grant.funderType] ?? grant.funderType
              return (
                <span className="text-[10px] font-bold uppercase tracking-wider px-3 py-1"
                  style={{ borderRadius: 9999, backgroundColor: 'rgba(110,110,128,0.10)', color: '#6E6E80' }}>
                  {label}
                </span>
              )
            })()}
            {/* Status badges */}
            {entryType === 'live' && daysLeft !== null && daysLeft >= 0 && (
              <span className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1 ${
                daysLeft <= 7 ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'
              }`} style={{ borderRadius: 9999 }}>
                {daysLeft === 0 ? 'Closes today' : `${daysLeft} days left`}
              </span>
            )}
            {isNewThisWeek && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-3 py-1 bg-emerald-50 text-emerald-700" style={{ borderRadius: 9999 }}>New</span>
            )}
            {grant.isInviteOnly && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-3 py-1 bg-purple-50 text-purple-700" style={{ borderRadius: 9999 }}>Invite Only</span>
            )}
            {/* Location badge */}
            {(() => {
              const loc = grant.locationTag
              const isUKWide = !loc || loc.toLowerCase() === 'uk' || loc.toLowerCase() === 'uk-wide'
              const label = isUKWide ? 'UK-wide' : loc!
              const bg   = isUKWide ? 'rgba(186,230,253,0.55)' : 'rgba(147,197,253,0.45)'
              const color = isUKWide ? '#1E3A5F'               : '#1E3A5F'
              return (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-3 py-1"
                  style={{ borderRadius: 9999, backgroundColor: bg, color }}>
                  <svg width="9" height="11" viewBox="0 0 9 11" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4.5 0C2.015 0 0 2.015 0 4.5c0 3.375 4.5 6.5 4.5 6.5S9 7.875 9 4.5C9 2.015 6.985 0 4.5 0zm0 6.125A1.625 1.625 0 1 1 4.5 2.875a1.625 1.625 0 0 1 0 3.25z"/>
                  </svg>
                  {label}
                </span>
              )
            })()}
          </div>

          {/* Title */}
          <h3 className="text-xl font-bold text-charcoal leading-snug mb-1" style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.01em' }}>{grant.title}</h3>

          {/* Funder */}
          <p className="text-sm font-semibold mb-4" style={{ color: '#525252' }}>{grant.funder}</p>

          {/* Description */}
          <p className="text-sm leading-relaxed mb-6" style={{ color: '#777' }}>
            {grant.description.length > 180 && !expanded
              ? <>
                  {grant.description.slice(0, 180).trimEnd()}…{' '}
                  <button
                    onClick={e => { e.stopPropagation(); setExpanded(true) }}
                    className="font-medium hover:underline whitespace-nowrap" style={{ color: '#84CC16' }}
                  >
                    Show more
                  </button>
                </>
              : grant.description}
          </p>

          {/* Metadata */}
          {(() => {
            const FUNDING_TYPE_STYLE: Record<string, { label: string; bg: string; color: string }> = {
              grant:      { label: 'Grant',      bg: 'rgba(132,204,22,0.12)',  color: '#4A7C10' },
              programme:  { label: 'Programme',  bg: 'rgba(16,185,129,0.13)',  color: '#047857' },
              investment: { label: 'Investment', bg: 'rgba(255,112,67,0.12)',  color: '#D84315' },
              in_kind:    { label: 'In-Kind',    bg: 'rgba(99,102,241,0.12)', color: '#4338CA' },
            }
            const ftStyle = grant.fundingType ? FUNDING_TYPE_STYLE[grant.fundingType] : null
            return (
          <div className="flex gap-10">
            <div>
              <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-1">Amount</p>
              <p className="text-sm font-bold" style={{ color: '#84CC16' }}>{formatRange(grant.amountMin, grant.amountMax)}</p>
            </div>
            <div>
              {(() => {
                const opensDate = grant.nextOpenDateParsed
                const todayStr = new Date().toISOString().split('T')[0]
                const notYetOpen = !grant.deadline && !grant.isRolling && opensDate && opensDate > todayStr
                if (notYetOpen) {
                  const parts = opensDate!.split('-').map(Number)
                  const formatted = new Date(parts[0], parts[1] - 1, parts[2])
                    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                  return (
                    <>
                      <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-1">Opens</p>
                      <p className="text-sm font-semibold text-charcoal">{formatted}</p>
                    </>
                  )
                }
                return (
                  <>
                    <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-1">Deadline</p>
                    <p className="text-sm font-semibold text-charcoal">
                      {grant.isRolling || !grant.deadline
                        ? 'Rolling'
                        : (() => {
                            const parts = grant.deadline!.split('-').map(Number)
                            if (parts.length !== 3 || parts.some(isNaN)) return 'Rolling'
                            return new Date(parts[0], parts[1] - 1, parts[2])
                              .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                          })()
                      }
                    </p>
                  </>
                )
              })()}
            </div>
            <div>
              <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-1">Who&apos;s eligible</p>
              <p className="text-sm font-semibold text-charcoal">{structureLabels.length > 0 ? structureLabels.join(', ') : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-1">Type</p>
              {ftStyle ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold px-2.5 py-1 inline-block"
                    style={{ borderRadius: 9999, backgroundColor: ftStyle.bg, color: ftStyle.color }}>
                    {ftStyle.label}
                  </span>
                  {grant.fundingSubtype && SUBTYPE_LABELS[grant.fundingSubtype] && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 inline-block border"
                      style={{ borderRadius: 9999, borderColor: ftStyle.color, color: ftStyle.color, backgroundColor: 'white' }}>
                      {SUBTYPE_LABELS[grant.fundingSubtype]}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-sm font-semibold text-charcoal">—</p>
              )}
            </div>
          </div>
            )
          })()}
        </div>

        {/* ── Right: actions ── */}
        <div className="flex flex-col justify-center gap-2.5 p-6 flex-shrink-0 w-[152px]">
          {grant.applyUrl && (
            <a href={grant.applyUrl} target="_blank" rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-[#1A1A1A] text-white rounded-full hover:opacity-80 transition-opacity">
              <ExternalLink className="w-3.5 h-3.5" />
              Visit
            </a>
          )}
          <button
            onClick={() => isSaved ? onUnsave?.(grant.id) : onSave?.(grant.id)}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold border rounded-full transition-colors ${
              isSaved
                ? 'bg-[#BAE6FD] text-[#1E3A5F] border-[#7DD3FC]'
                : 'border-[#7DD3FC] text-[#1E3A5F] hover:bg-[#BAE6FD]'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" fill={isSaved ? 'currentColor' : 'none'} />
            {isSaved ? 'Saved' : 'Save'}
          </button>
          <button
            onClick={() => isInPipeline ? onRemoveFromPipeline?.(grant) : onAddToPipeline(grant)}
            className={`w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold border rounded-full transition-colors whitespace-nowrap ${isInPipeline ? 'bg-[#FEF9C3] text-[#4A3800] border-[#4A3800]' : 'border-[#4A3800] text-[#4A3800] bg-transparent hover:bg-[#FEF9C3]'}`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            {isInPipeline ? 'In Pipeline' : 'Pipeline'}
          </button>
        </div>

      </div>

      {/* ── Match Insight (white, part of card body) ── */}
      {hasOrg && hasSearch && reason && (() => {
        const brief = (grant as EnrichedGrant).funderBrief
        return (
          <div className="flex items-center gap-4 px-6 py-4 border-t border-[#E8E8EC]"
            style={{ borderLeft: '3px solid #84CC16' }}>
            <Activity className="w-4 h-4 flex-shrink-0" style={{ color: '#84CC16' }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#84CC16' }}>Match Insight</p>
              <p className="text-sm leading-relaxed" style={{ color: '#333' }}>
                {(() => {
                  const text = reason.replace(/<[^>]*>/g, '').trim()
                  const dotIdx = text.indexOf('.')
                  if (dotIdx > 0 && dotIdx < 60) {
                    return <><strong>{text.slice(0, dotIdx + 1)}</strong>{text.slice(dotIdx + 1)}</>
                  }
                  return text
                })()}
              </p>
            </div>
            {score > 0 && (
              <div className="flex-shrink-0 flex flex-col items-center gap-0.5 ml-2">
                <svg width="68" height="68" viewBox="0 0 68 68">
                  <circle cx="34" cy="34" r="27" fill="none" stroke="#E8E8EC" strokeWidth="5" />
                  <circle cx="34" cy="34" r="27" fill="none" stroke="#84CC16" strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={`${(score / 100) * 169.6} 169.6`}
                    transform="rotate(-90 34 34)" />
                  <text x="34" y="31" textAnchor="middle" dominantBaseline="middle"
                    style={{ fontSize: '13px', fontWeight: '700', fill: '#84CC16', fontFamily: 'inherit' }}>
                    {score}%
                  </text>
                  <text x="34" y="46" textAnchor="middle"
                    style={{ fontSize: '8px', fill: '#888888', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: '600' }}>
                    MATCH
                  </text>
                </svg>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Expand toggle ── */}
      {(!!(grant as EnrichedGrant).funderBrief || grant.eligibilityCriteria?.length > 0 || (grant as EnrichedGrant).impactSectors?.length || grant.sectors?.length) && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 border-t border-[#E8E8EC] text-[11px] font-bold uppercase tracking-widest transition-colors hover:bg-[#F5F5F5]"
          style={{ color: '#6E6E80' }}
        >
          <ChevronDown className="w-3.5 h-3.5 transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }} />
          {expanded ? 'Show less' : (grant as EnrichedGrant).funderBrief ? (
            grant.fundingType === 'investment' ? 'Investor Insights' :
            grant.fundingType === 'in_kind'    ? 'Partner Insights'  :
                                                 'Funder Insights'
          ) : 'Eligibility & details'}
        </button>
      )}

      {/* ── Expanded details panel ── */}
      {expanded && (() => {
        const brief = (grant as EnrichedGrant).funderBrief

        return (
          <div className="border-t border-[#E8E8EC]" style={{ backgroundColor: '#F5F5F7' }}>
            {brief ? (
              /* ── Funder Intelligence brief ── */
              (() => {
                // Truncate to ~130 chars at a word boundary
                const truncate = (text: string, chars = 130) => {
                  if (text.length <= chars) return text
                  const cut = text.slice(0, chars)
                  return cut.slice(0, cut.lastIndexOf(' ')) + '…'
                }
                // No clamping — this is already the expanded view, show everything
                const clamp4: React.CSSProperties = {}
                const clamp3: React.CSSProperties = {}
                const orgTerms = [...(org?.themes ?? []), ...(org?.areas_of_work ?? [])].slice(0, 3)

                // Reusable section block: consistent label + body style throughout
                const Section = ({ icon: Icon, iconColor, label, children, className = '', style }: {
                  icon: React.ElementType, iconColor: string, label: string, children: React.ReactNode, className?: string, style?: React.CSSProperties
                }) => (
                  <div className={className} style={style}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Icon className="w-3 h-3 flex-shrink-0" style={{ color: iconColor }} />
                      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#1A1A1A' }}>{label}</p>
                    </div>
                    {children}
                  </div>
                )

                // Build top-row items so grid cols match actual count
                const topItems = [
                  brief.what_they_fund && (
                    <Section key="fund" icon={CheckCircle2} iconColor="#84CC16" label="What they fund">
                      <p className="text-sm text-[#444] leading-relaxed" style={clamp4}>{brief.what_they_fund}</p>
                    </Section>
                  ),
                  brief.priorities && (
                    <Section key="prio" icon={TrendingUp} iconColor="#F59E0B" label="Current priorities">
                      <p className="text-sm text-[#444] leading-relaxed" style={clamp4}>{brief.priorities}</p>
                    </Section>
                  ),
                  brief.exclusions && (
                    <Section key="excl" icon={AlertTriangle} iconColor="#B45309" label="Exclusions"
                      className="px-3 py-3" style={{ backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.18)' } as React.CSSProperties}>
                      <p className="text-sm leading-relaxed" style={{ ...clamp4, color: '#78350F' }}>{brief.exclusions}</p>
                    </Section>
                  ),
                ].filter(Boolean)

                const topCols = topItems.length === 3 ? 'grid-cols-3' : topItems.length === 2 ? 'grid-cols-2' : 'grid-cols-1'

                const bottomItems = [
                  brief.strong_application && (
                    <Section key="strong" icon={Star} iconColor="#6E6E80" label="Strong application">
                      <p className="text-sm text-[#444] leading-relaxed" style={clamp3}>{brief.strong_application}</p>
                    </Section>
                  ),
                  brief.typical_award && (
                    <Section key="award" icon={DollarSign} iconColor="#6E6E80" label="Typical award">
                      <p className="text-sm text-[#444] leading-relaxed" style={clamp3}>{brief.typical_award}</p>
                    </Section>
                  ),
                  brief.decision_timeline && (
                    <Section key="timeline" icon={CalendarDays} iconColor="#6E6E80" label="Decision timeline">
                      <p className="text-sm text-[#444] leading-relaxed" style={clamp3}>{brief.decision_timeline}</p>
                    </Section>
                  ),
                  brief.funder_tips && (
                    <Section key="tips" icon={Lightbulb} iconColor="#6E6E80" label="Insider tips">
                      <p className="text-sm text-[#444] leading-relaxed" style={clamp3}>{brief.funder_tips}</p>
                    </Section>
                  ),
                ].filter(Boolean)

                return (
                  <div className="px-6 pt-5 pb-6 space-y-5">

                    {brief.last_enriched && (
                      <p className="text-[10px] text-[#9E9EA8] text-right -mb-2">Updated {brief.last_enriched}</p>
                    )}

                    {/* Top row: What they fund | Priorities | Exclusions */}
                    {topItems.length > 0 && (
                      <div className={`grid ${topCols} gap-5 items-start pt-1`}>
                        {topItems}
                      </div>
                    )}

                    {/* Bottom row: 4 supporting fields in 2-col grid */}
                    {bottomItems.length > 0 && (
                      <div className="grid grid-cols-2 gap-x-8 gap-y-5 pt-4 border-t border-[#E8E8EC]">
                        {bottomItems}
                      </div>
                    )}

                    {/* How to apply — full-width footer with Apply button */}
                    {(brief.how_to_apply || grant.applyUrl) && (
                      <div className="flex items-start justify-between gap-6 pt-4 border-t border-[#E8E8EC]">
                        <div className="flex-1 min-w-0">
                          {brief.how_to_apply && (
                            <>
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <ClipboardList className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#6E6E80' }} />
                                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#1A1A1A' }}>How to apply</p>
                              </div>
                              <p className="text-sm text-[#444] leading-relaxed">{brief.how_to_apply}</p>
                            </>
                          )}
                        </div>
                        {grant.applyUrl && (
                          <a href={grant.applyUrl} target="_blank" rel="noopener noreferrer"
                            className="flex-shrink-0 flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-80"
                            style={{ borderRadius: 9999, backgroundColor: '#1A1A1A' }}>
                            Apply
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()
            ) : (
              /* ── Fallback: structured eligibility data ── */
              <div className="px-6 py-5 space-y-4">
                {grant.description.length > 180 && (
                  <div>
                    <p className="text-[10px] font-bold text-[#6E6E80] uppercase tracking-wider mb-2">Full description</p>
                    <p className="text-sm text-[#444] leading-relaxed">{grant.description}</p>
                  </div>
                )}
                {grant.eligibilityCriteria?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-[#6E6E80] uppercase tracking-wider mb-2.5">Eligibility criteria</p>
                    <ul className="space-y-2">
                      {grant.eligibilityCriteria.map((c, i) => (
                        <li key={i} className="flex gap-2.5 text-sm text-[#444]">
                          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#84CC16' }} />
                          <span className="leading-snug">{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(grant as EnrichedGrant).eligibleStructures?.length ? (
                  <div>
                    <p className="text-[10px] font-bold text-[#6E6E80] uppercase tracking-wider mb-2">Eligible organisations</p>
                    <div className="flex flex-wrap gap-1.5">
                      {((grant as EnrichedGrant).eligibleStructures ?? []).map(s => (
                        <span key={s} className="text-[11px] font-semibold px-2.5 py-1"
                          style={{ backgroundColor: 'rgba(132,204,22,0.12)', color: '#4A7C10', borderRadius: 9999 }}>
                          {STRUCTURE_LABELS[s] ?? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-[#9E9EA8]">
                    No funder intelligence yet — an admin can enrich this grant from the Funder Intelligence page.
                  </p>
                  {grant.applyUrl && (
                    <a
                      href={grant.applyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white transition-opacity hover:opacity-80"
                      style={{ borderRadius: 9999, backgroundColor: '#1A1A1A' }}>
                      Apply
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })()}


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

// Category groupings for the top-level toggle (4-type taxonomy). Pulled to
// module scope so their identity is stable across renders (otherwise they'd
// be recreated each render and invalidate downstream memos).
const GRANT_TYPES: (FundingType | 'all')[]      = ['grant', 'investment', 'in_kind']
const PROGRAMME_TYPES: (FundingType | 'all')[]  = ['programme']

// ── Fuzzy text matching ────────────────────────────────────────────────────
// Lightweight typo tolerance for the search box. Exact substring first
// (fast path), then Levenshtein-distance-≤1 against individual words for
// tokens of 4+ characters. Shorter tokens stay strict to avoid silly
// collisions like "cat" fuzzy-matching "bat".

/**
 * True iff `a` and `b` differ by at most one edit, where an edit is
 * insertion / deletion / substitution / adjacent transposition. The last
 * case is handled specially because it's the most common real-world typo
 * ("teh" → "the", "garfeild" → "garfield") and strict Levenshtein treats
 * it as two edits.
 */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true
  const diff = a.length - b.length
  if (Math.abs(diff) > 1) return false
  // Same length: allow one substitution OR one adjacent transposition.
  if (diff === 0) {
    let mismatches = 0
    let firstMismatch = -1
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        mismatches++
        if (mismatches === 1) firstMismatch = i
        if (mismatches > 2)    return false
      }
    }
    if (mismatches <= 1) return true
    // Exactly two mismatches — accept only if they're adjacent and swapped.
    return mismatches === 2
      && firstMismatch >= 0
      && a[firstMismatch]     === b[firstMismatch + 1]
      && a[firstMismatch + 1] === b[firstMismatch]
  }
  // Length differs by one: a single insertion or deletion.
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a]
  let i = 0, j = 0, foundDiff = false
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] !== longer[j]) {
      if (foundDiff) return false
      foundDiff = true
      j++ // skip one char in longer
    } else {
      i++; j++
    }
  }
  return true
}

/** Splits a haystack into word tokens — any non-alphanum counts as a boundary. */
function toWordTokens(text: string): string[] {
  return text.split(/[^a-z0-9]+/).filter(Boolean)
}

/**
 * Check whether a single query token appears in the haystack text.
 * Exact substring match is the fast path; fuzzy (≤1 edit) is attempted
 * only for tokens ≥4 chars, and only against words of similar length.
 */
function tokenMatches(token: string, text: string, wordsCache?: string[]): boolean {
  if (text.includes(token)) return true
  if (token.length < 4)    return false
  const words = wordsCache ?? toWordTokens(text)
  for (const w of words) {
    const lenDiff = Math.abs(w.length - token.length)
    if (lenDiff > 1) continue
    if (withinOneEdit(token, w)) return true
  }
  return false
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function SearchPage() {
  const searchParams = useSearchParams()

  // Initialise filters from URL params (used by landing page category links)
  const initSector      = searchParams.get('sector')      as ImpactSector | null
  const initFundingType = searchParams.get('fundingType') as FundingType   | null
  const isWelcome       = searchParams.get('welcome') === '1'
  // Dashboard cards link here with ?grant=<id> so the clicked grant is
  // pinned to the very top of the results list. Read once at mount — we
  // don't need to react to URL changes within the page.
  const pinnedGrantId   = searchParams.get('grant')
  const [welcomeDismissed, setWelcomeDismissed] = useState(false)

  const [query, setQuery]               = useState('')       // committed AI-search query (subtitle, session restore)
  const [inputValue, setInputValue]     = useState('')       // live input value (typing only)
  const [filterQuery, setFilterQuery]   = useState('')       // debounced mirror of inputValue — drives local text filter
  const [activeType, setActiveType]     = useState('all')
  const [aiResults, setAiResults]       = useState<AIResult[] | null>(null)
  const [aiLoading, setAiLoading]       = useState(false)
  const [aiError, setAiError]           = useState<string | null>(null)
  const [smartMatched, setSmartMatched] = useState(false)
  const [toast, setToast]               = useState<string | null>(null)
  const [org, setOrg]                   = useState<Organisation | null>(null)
  const [userId, setUserId]             = useState('')
  const [sortBy, setSortBy]             = useState<'match' | 'amount' | 'freshest' | 'deadline'>('match')
  const [freshnessFilter, setFreshnessFilter] = useState<'all' | '7d' | '14d' | '30d'>('all')
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [interactions, setInteractions] = useState<Map<string, Set<InteractionAction>>>(new Map())
  const [showDismissed, setShowDismissed] = useState(false)
  const [scrapedGrants, setScrapedGrants] = useState<EnrichedGrant[]>([])
  const [amountMin, setAmountMin]         = useState('')
  const [amountMax, setAmountMax]         = useState('')
  const [deadlineFilter, setDeadlineFilter] = useState<'all' | 'rolling' | 'has_deadline'>('all')
  const [activeSectors, setActiveSectors]         = useState<Set<ImpactSector>>(() =>
    initSector ? new Set([initSector]) : new Set()
  )
  const [activeFundingType, setActiveFundingType] = useState<FundingType | 'all'>(
    initFundingType ?? 'all'
  )
  const [categoryFilter, setCategoryFilter]       = useState<'all' | 'grants' | 'programmes'>('all')
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
  const [pipelinedIds, setPipelinedIds]           = useState<Map<string, string>>(new Map())
  const [hasSearched, setHasSearched]             = useState(false)
  const [profileFiltersOpen, setProfileFiltersOpen] = useState(false)
  const [activeTab, setActiveTab]                 = useState<'grant' | 'programme' | 'investment' | 'in_kind'>('grant')
  const [programmeHasCash, setProgrammeHasCash]   = useState(false)
  const [activeView, setActiveView]               = useState<'matches' | 'saved' | 'latest'>('matches')
  // Explicit profile filter toggle. Previously this was derived from
  // activeSectors/locationFilter, which meant picking a sector inside the
  // filter panel silently flipped it back on. Now the toggle only changes
  // when the user clicks it directly (or when the org first loads).
  const [profileFilterOn, setProfileFilterOn]     = useState(false)

  // ── Live search (web) state ───────────────────────────────────────────────
  const [searchMode, setSearchMode]               = useState<'database' | 'live'>('database')
  const [locationFilter, setLocationFilter]       = useState('')
  const [locationInput, setLocationInput]         = useState('')
  const [liveSelectedSectors, setLiveSelectedSectors] = useState<string[]>([])
  const [liveResults, setLiveResults]             = useState<LiveSearchResponse | null>(null)
  const [liveLoading, setLiveLoading]             = useState(false)
  const [liveError, setLiveError]                 = useState<string | null>(null)
  const [liveSmartMatched, setLiveSmartMatched]   = useState(false)
  const [recentSearchesOpen, setRecentSearchesOpen] = useState(false)
  const [searchHistory, setSearchHistory]         = useState<SearchHistoryItem[]>([])
  const [weeklySearchCount, setWeeklySearchCount] = useState(0)
  const [isAdmin, setIsAdmin]                     = useState(false)
  const WEEKLY_LIMIT = 3
  const ADMIN_EMAIL  = 'paulkilty1@gmail.com'

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('grantSearch')
      if (saved) {
        const { query: q, aiResults: r, activeType: t, smartMatched: sm, liveResults: lr, liveSmartMatched: lsm, activeView: av } = JSON.parse(saved)
        // Only restore query if there are also AI results to go with it
        if (r && q) { setQuery(q); setInputValue(q) }
        if (r)   setAiResults(r)
        if (t)   setActiveType(t)
        if (sm)  setSmartMatched(sm)
        if (lr)  setLiveResults(lr)
        if (lsm) setLiveSmartMatched(lsm)
        if (av)  setActiveView(av)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    try {
      sessionStorage.setItem('grantSearch', JSON.stringify({ query, aiResults, activeType, smartMatched, liveResults, liveSmartMatched, activeView }))
    } catch { /* ignore */ }
  }, [query, aiResults, activeType, smartMatched, liveResults, liveSmartMatched, activeView])

  // Debounce inputValue → filterQuery so local text filtering kicks in
  // ~150ms after the user stops typing. Fast enough to feel live, slow
  // enough that we're not re-running the filter pipeline on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setFilterQuery(inputValue.trim().toLowerCase()), 150)
    return () => clearTimeout(handle)
  }, [inputValue])

  useEffect(() => {
    async function loadOrg() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      setIsAdmin(user.email === ADMIN_EMAIL)
      const o = await getOrganisationByOwner(user.id)
      setOrg(o)
      if (o) {
        const ix = await getInteractions(o.id)
        setInteractions(ix)
        // Load existing pipeline grant names to show button state
        const { data: pipelineRows } = await supabase
          .from('pipeline_items')
          .select('id, grant_name')
          .eq('org_id', o.id)
        if (pipelineRows) {
          setPipelinedIds(new Map(pipelineRows.map((r: { id: string; grant_name: string }) => [r.grant_name, r.id])))
        }
        // My Matches mode: always auto-apply profile and show results
        if (o.primary_location) setLocationFilter(o.primary_location)
        if (o.impact_sectors?.length) setActiveSectors(new Set(o.impact_sectors as ImpactSector[]))
        // Mirror today's behaviour: if the org has profile data worth
        // filtering on, start with the profile filter toggled on.
        if (o.primary_location || o.impact_sectors?.length) setProfileFilterOn(true)
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
      // Load live search history + weekly usage count
      if (o) {
        const [history, weekCount] = await Promise.all([
          getSearchHistory(o.id),
          getWeeklySearchCount(o.id),
        ])
        setSearchHistory(history)
        setWeeklySearchCount(weekCount)
      }
    }
    loadOrg()
  }, [])

  // When the page opens with ?grant=<id> from a dashboard Matched Opportunities
  // card, the clicked grant might be a programme / investment / in-kind type,
  // but activeTab defaults to 'grant'. That means the tab-level filter hides the
  // pinned grant before the lift-to-top logic can surface it. Snap activeTab to
  // the pinned grant's funding type as soon as scraped data is loaded so users
  // always land on a tab where the card is visible.
  useEffect(() => {
    if (!pinnedGrantId || scrapedGrants.length === 0) return
    const pinned = scrapedGrants.find(g => g.id === pinnedGrantId)
    if (!pinned) return
    const ft = pinned.fundingType
    if (ft === 'grant' || ft === 'programme' || ft === 'investment' || ft === 'in_kind') {
      setActiveTab(ft)
    }
  }, [pinnedGrantId, scrapedGrants])

  // ── Live search handler ───────────────────────────────────────────────────
  async function runLiveSearch(searchQuery: string, isSmartMatch = false) {
    if (!searchQuery.trim() && liveSelectedSectors.length === 0 && !locationFilter.trim()) return
    if (!isAdmin && weeklySearchCount >= WEEKLY_LIMIT) return   // enforce limit client-side
    setHasSearched(true)
    setLiveLoading(true)
    setLiveError(null)
    setLiveResults(null)
    setLiveSmartMatched(false)
    try {
      const q = searchQuery.trim() || [...liveSelectedSectors, locationFilter].filter(Boolean).join(', ')
      const response = await fetch('/api/deep-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          org: null,
          sectors: liveSelectedSectors,
          location: locationFilter,
          existingGrantTitles: SEED_GRANTS.map(g => ({ title: g.title, funder: g.funder })),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error ?? `Request failed (${response.status})`)
      setLiveResults(data as LiveSearchResponse)
      if (isSmartMatch) setLiveSmartMatched(true)
      // Save results to localStorage so history items can restore instantly
      try {
        const lsKey = `liveSearch:${q}:${liveSelectedSectors.sort().join('|')}:${locationFilter}`
        localStorage.setItem(lsKey, JSON.stringify(data))
      } catch { /* ignore storage errors */ }
      if (org) {
        await saveSearchHistory({
          orgId: org.id,
          query: q,
          sectors: liveSelectedSectors,
          location: locationFilter,
          resultCount: (data as LiveSearchResponse).grants?.length ?? 0,
        })
        const [history, newCount] = await Promise.all([
          getSearchHistory(org.id),
          getWeeklySearchCount(org.id),
        ])
        setSearchHistory(history)
        setWeeklySearchCount(newCount)
      }
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : 'Live search unavailable — please try again')
    } finally {
      setLiveLoading(false)
    }
  }

  function restoreSearch(item: SearchHistoryItem) {
    if (item.sectors?.length) setLiveSelectedSectors(item.sectors)
    if (item.location)        setLocationFilter(item.location)
    setInputValue(item.query)
    // Try to restore from localStorage instantly — no network call needed
    try {
      const lsKey = `liveSearch:${item.query}:${(item.sectors ?? []).sort().join('|')}:${item.location ?? ''}`
      const saved = localStorage.getItem(lsKey)
      if (saved) {
        setLiveResults(JSON.parse(saved) as LiveSearchResponse)
        setHasSearched(true)
        return
      }
    } catch { /* ignore */ }
    // Fallback: re-run the search (server cache will serve it quickly)
    runLiveSearch(item.query)
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins  = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days  = Math.floor(diff / 86400000)
    if (mins < 60)  return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  async function handleLiveAddToPipeline(grant: LiveGrant) {
    if (!org) { showToast('Complete your profile first to track grants'); return }
    try {
      await createPipelineItem({
        org_id: org.id,
        grant_name: grant.title,
        funder_name: grant.funder,
        funder_type: 'other',
        amount_min: null, amount_max: null, amount_requested: null,
        deadline: null, stage: 'identified', notes: grant.notes || null,
        application_progress: 0, is_urgent: false,
        contact_name: null, contact_email: null,
        grant_url: grant.applyUrl || null,
        outcome_date: null, outcome_notes: null,
        created_by: userId,
      })
      showToast(`"${grant.title}" added to pipeline!`)
    } catch {
      showToast('Failed to add — please try again')
    }
  }

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
    // optimistic update only for now
    setInteractions(prev => {
      const next = new Map(prev)
      next.get(grantId)?.delete('saved')
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
      const added = await createPipelineItem({
        org_id:               org.id,
        grant_name:           grant.title,
        funder_name:          grant.funder,
        funder_type:          (['trust_foundation','local_authority','housing_association','corporate','lottery','government','other'].includes(grant.funderType ?? '') ? grant.funderType as 'trust_foundation'|'local_authority'|'housing_association'|'corporate'|'lottery'|'government'|'other' : 'other'),
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
      setPipelinedIds(prev => new Map(prev).set(grant.title, added.id))
      showToast('Added to your pipeline')
    } catch {
      showToast('Failed to add — please try again')
    }
  }

  async function handleRemoveFromPipeline(grant: GrantOpportunity) {
    const itemId = pipelinedIds.get(grant.title)
    if (!itemId) return
    try {
      await deletePipelineItem(itemId)
      setPipelinedIds(prev => { const m = new Map(prev); m.delete(grant.title); return m })
      showToast('Removed from pipeline')
    } catch {
      showToast('Failed to remove — please try again')
    }
  }

  // ── Grant pool ───────────────────────────────────────────────────────────
  // DB is the single source of truth — all seed grants have been migrated.
  const allGrants = scrapedGrants

  // Sector filter now uses the fixed 12-sector taxonomy (IMPACT_SECTOR_FILTERS)
  // rather than a dynamic list derived from free-text grant.sectors[]

  function toggleSector(s: ImpactSector) {
    setActiveSectors(prev => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next
    })
  }

  // Reset visible count when search/filters change so the user starts from the top
  useEffect(() => {
    setVisibleCount(30)
  }, [query, filterQuery, activeType, amountMin, amountMax, deadlineFilter, activeSectors, activeFundingType, categoryFilter, entryTypeFilter, freshnessFilter, showInviteOnly, aiResults, activeFunderCategory, activeGeoScope])

  // ── Build display grants ─────────────────────────────────────────────────
  // Memoised: computeMatchScore is called once per grant in the catalogue
  // (currently ~300 but targeting 1,500+), so recomputing on every render
  // — which was happening when this was a plain IIFE — is genuinely
  // expensive. The dependency array below lists everything the memo body
  // reads; any input that changes what appears or how it's ranked must be
  // included, otherwise the UI will go stale.
  const displayGrants: DisplayGrant[] = useMemo(() => {
    const minAmt = amountMin ? Number(amountMin) : null
    const maxAmt = amountMax ? Number(amountMax) : null
    const todayStr = new Date().toISOString().split('T')[0]

    // Pre-split the search tokens once for the whole filter pass. ALL tokens
    // must match (AND semantics) so "impact hub" requires both, not either.
    const queryTokens = filterQuery ? filterQuery.split(/\s+/).filter(t => t.length > 0) : []

    const filtered = allGrants.filter(g => {
      // Always strip expired deadlines — never show grants whose closing date has passed
      if (!g.isRolling && g.deadline && g.deadline < todayStr) return false

      // Pinned-from-dashboard escape hatch. When the page was opened with
      // ?grant=<id>, that grant MUST survive the filter gate regardless of
      // which tab / funding type / sector / location is currently selected
      // — otherwise the lift-to-top logic below has nothing to lift. Without
      // this, clicking a "Matched Opportunities" card for a programme or
      // investment grant lands on the search page with the default "Grants"
      // tab active and the grant invisibly filtered out.
      if (pinnedGrantId && g.id === pinnedGrantId) return true

      const matchesType =
        activeType === 'all'      ? true :
        activeType === 'local'    ? g.isLocal :
        activeType === 'recent'   ? (g.dateAdded != null && g.dateAdded >= SIXTY_DAYS_AGO) :
        activeType === 'scraped'  ? g.source === 'scraped' :
        g.funderType === activeType
      // Local text filter with typo tolerance. Matches across title, funder,
      // description and sectors. Empty query → no filtering.
      let matchesQuery = true
      if (queryTokens.length > 0) {
        const haystack = `${g.title} ${g.funder} ${g.description} ${g.sectors.join(' ')}`.toLowerCase()
        // Cache the word-tokenisation of the haystack so tokenMatches doesn't
        // re-split it once per query token.
        const haystackWords = toWordTokens(haystack)
        matchesQuery = queryTokens.every(t => tokenMatches(t, haystack, haystackWords))
      }
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
      const gFundingType = (g as GrantOpportunity & { fundingType?: FundingType }).fundingType ?? 'grant'
      const matchesCategory =
        categoryFilter === 'all' ||
        (categoryFilter === 'grants'      && GRANT_TYPES.includes(gFundingType)) ||
        (categoryFilter === 'programmes'  && PROGRAMME_TYPES.includes(gFundingType))
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
      // UK/England/nationwide grants always pass regardless of location filter
      const BROAD_SCOPES = ['uk', 'uk-wide', 'england', 'nationwide', 'national', 'uk wide', 'all uk']
      const matchesLocationText = !locationFilter ||
        !ge.geoScope?.length ||
        ge.geoScope.some(s => BROAD_SCOPES.includes(s.toLowerCase())) ||
        ge.geoScope.some(s => s.toLowerCase().includes(locationFilter.toLowerCase()) || locationFilter.toLowerCase().includes(s.toLowerCase()))
      // Funding type tab filter — filter by activeTab (gFundingType defaults to 'grant' when unset)
      const matchesTab = gFundingType === activeTab
      // "Includes cash" sub-filter within the Programmes tab
      const matchesProgrammeCash = !programmeHasCash || activeTab !== 'programme' ||
        ((g.amountMin ?? 0) > 0 || (g.amountMax ?? 0) > 0)

      return matchesQuery && matchesType && matchesAmount && matchesDeadline && matchesSectors && matchesEntryType && matchesFreshness && matchesInviteOnly && matchesFundingType && matchesCategory && matchesFunderCategory && matchesGeoScope && matchesLocationText && matchesTab && matchesProgrammeCash
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
      // their description. Uses filterQuery (local live-typed) or the committed
      // AI query, whichever is non-empty.
      const effectiveQuery = filterQuery || query.toLowerCase()
      if (effectiveQuery) {
        const q = effectiveQuery
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
        const aDeadline = a.grant.deadline ?? '9999-12-31'
        const bDeadline = b.grant.deadline ?? '9999-12-31'
        return aDeadline.localeCompare(bDeadline)
      })
    }

    // If the page was opened with ?grant=<id>, lift that grant to the top
    // so users coming from the dashboard Matched Opportunities cards land
    // on it immediately. Falls through silently if the id isn't in the list
    // (e.g. grant has since been filtered out).
    if (pinnedGrantId) {
      const idx = withScores.findIndex(d => d.grant.id === pinnedGrantId)
      if (idx > 0) {
        const [pinned] = withScores.splice(idx, 1)
        withScores.unshift(pinned)
      }
    }

    return withScores
  }, [
    allGrants,
    org,
    interactions,
    aiResults,
    query,
    filterQuery,
    sortBy,
    activeType,
    amountMin,
    amountMax,
    deadlineFilter,
    activeSectors,
    entryTypeFilter,
    freshnessFilter,
    showInviteOnly,
    activeFundingType,
    categoryFilter,
    activeFunderCategory,
    activeGeoScope,
    locationFilter,
    activeTab,
    programmeHasCash,
    pinnedGrantId,
  ])

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
    setLocationFilter('')
    setLocationInput('')
    setSortBy('match')
    setEntryTypeFilter('all')
    setFreshnessFilter('all')
    setShowInviteOnly(true)
    setCategoryFilter('all')
    setActiveFunderCategory('all')
    setActiveGeoScope('all')
    setProfileFilterOn(false)
  }

  function toggleGroup(label: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  }

  // Derived: which funding-type pills to show given the active category
  const visibleFundingTypes = FUNDING_TYPES.filter(t =>
    t.id === 'all' ||
    categoryFilter === 'all' ||
    (categoryFilter === 'grants'      && GRANT_TYPES.includes(t.id)) ||
    (categoryFilter === 'programmes'  && PROGRAMME_TYPES.includes(t.id))
  )

  // Category counts (used for badges on the toggle)
  const allGrants_raw = allGrants.filter(g => {
    if (!g.isRolling && g.deadline && g.deadline < new Date().toISOString().split('T')[0]) return false
    return true
  })
  const grantsCount     = allGrants_raw.filter(g => GRANT_TYPES.includes((g as GrantOpportunity & { fundingType?: FundingType }).fundingType ?? 'grant')).length
  const programmesCount = allGrants_raw.filter(g => PROGRAMME_TYPES.includes((g as GrantOpportunity & { fundingType?: FundingType }).fundingType ?? 'grant')).length

  const ftCount = (type: string) =>
    allGrants_raw.filter(g => ((g as GrantOpportunity & { fundingType?: FundingType }).fundingType ?? 'grant') === type).length

  const TYPE_TABS = [
    { id: 'grant'      as const, label: 'Grants',      icon: <span className="text-[15px] font-bold leading-none">£</span>, count: ftCount('grant') },
    { id: 'programme'  as const, label: 'Programmes',  icon: <Rocket size={17} strokeWidth={2} />,     count: ftCount('programme') },
    { id: 'investment' as const, label: 'Investment',  icon: <TrendingUp size={17} strokeWidth={2} />, count: ftCount('investment') },
    { id: 'in_kind'    as const, label: 'In-Kind',     icon: <Gift size={17} strokeWidth={2} />,       count: ftCount('in_kind') },
  ]

  const TAB_DESCS: Record<string, string> = {
    grant:      'Non-repayable cash from foundations, trusts, Lottery & government. Includes awards, bursaries, prizes and diversity funds.',
    programme:  'Structured support that may include cash: accelerators, fellowships, incubators, cohort programmes and capacity-building schemes.',
    investment: 'Repayable finance for social-purpose organisations — loans, patient capital, blended finance and community shares.',
    in_kind:    'Non-cash support: software credits, ad grants, free workspace, pro bono legal advice and expert services.',
  }

  const CATEGORY_TABS = [
    {
      id:    'all'        as const,
      icon:  <Layers size={15} strokeWidth={2} />,
      label: 'All',
      desc:  'Grants, programmes & support',
      count: allGrants_raw.length,
    },
    {
      id:    'grants'     as const,
      icon:  <DollarSign size={15} strokeWidth={2} />,
      label: 'Funding',
      desc:  'Grants, social investment & funds',
      count: grantsCount,
    },
    {
      id:    'programmes' as const,
      icon:  <Rocket size={15} strokeWidth={2} />,
      label: 'Support & Programmes',
      desc:  'Accelerators, mentoring, pro bono & skills',
      count: programmesCount,
    },
  ]

  const savedCount = Array.from(interactions.values()).filter(s => s.has('saved')).length

  // Match scores + reasons are only meaningful when the profile filter is active
  // OR when an AI search has produced scored results. When profile filter is
  // off and no AI search is active, suppress them so the UI doesn't show match
  // data that isn't actually filtering anything.
  const showMatchInfo = !!org && (profileFilterOn || !!aiResults)

  return (
    <div>
      {/* ── Page heading ── */}
      <div className="mb-2">
        <h2 className="text-4xl font-bold text-charcoal leading-tight" style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.02em' }}>Find Funding</h2>
      </div>

      {/* Welcome banner — shown after first profile save */}
      {isWelcome && !welcomeDismissed && (
        <div className="mb-5 p-4 flex items-start justify-between gap-4 rounded-xl" style={{ border: '1px solid rgba(132,204,22,0.3)', background: 'rgba(132,204,22,0.06)' }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#4A7C10' }}>🎉 Profile saved — here are your matches</p>
            <p className="text-xs text-mid mt-0.5">Results are filtered to grants you&apos;re eligible for. Use &ldquo;Show all grants&rdquo; below to browse everything.</p>
          </div>
          <button onClick={() => setWelcomeDismissed(true)} className="text-mid hover:text-charcoal text-lg leading-none flex-shrink-0">×</button>
        </div>
      )}

      {/* ── Subtitle row: text left, tabs right ── */}
      <div className="flex items-center justify-between mb-3">
        {/* Left: subtitle (conditional) */}
        <div className="flex items-center gap-2 text-sm text-mid">
          {activeView === 'matches' && org && (
            <>
              <span className="w-2 h-2 flex-shrink-0 rounded-full" style={{ backgroundColor: '#84CC16' }} />
              Matched for <strong className="text-charcoal">{org.name ?? 'your organisation'}</strong>
              {org.primary_location && <span className="text-mid">· {org.primary_location}</span>}
            </>
          )}
          {activeView === 'matches' && !org && (
            <div className="text-xs border border-amber-200 bg-amber-50 px-3 py-2">
              <a href="/dashboard/profile" className="font-semibold text-amber-700 underline">Set up your profile</a>
              <span className="text-amber-800"> to see grants matched for your organisation.</span>
            </div>
          )}
        </div>
        {/* Right: tabs always visible */}
        <div className="flex items-center gap-0 bg-white border border-warm/60 shadow-sm overflow-hidden flex-shrink-0" style={{ borderRadius: 9999 }}>
          {(['matches', 'saved', 'latest'] as const).map((v, i) => (
            <>
              {i > 0 && <div key={`sep-${v}`} className="w-px h-5 bg-warm/80" />}
              <button
                key={v}
                onClick={() => setActiveView(v)}
                className={`px-5 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${activeView === v ? 'border-b-2 border-[#84CC16] text-[#1A1A1A] font-bold' : 'border-b-2 border-transparent text-gray-500 hover:text-charcoal'}`}
              >
                {v === 'matches' ? 'My Matches' : v === 'saved' ? 'Saved' : 'Latest'}
                {v === 'saved' && savedCount > 0 && (
                  <span className="text-xs px-1.5 py-0.5 ml-1 font-bold" style={{ borderRadius: 9999, background: '#BAE6FD', color: '#1E3A5F' }}>{savedCount}</span>
                )}
              </button>
            </>
          ))}
        </div>
      </div>

      {/* ── Search card ── */}
      <div className="bg-white shadow-card mb-5 border border-warm/60 rounded-xl overflow-hidden">

        <div className="p-5">

          {/* ── Unified search pill + Search button ── */}
          {activeView === 'matches' && (
            <div className="flex gap-3 items-center">
              {/* Single pill container */}
              <div className="flex-1 flex items-center bg-white border border-gray-200 rounded-full h-12 overflow-hidden"
                style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                {/* Search icon + input */}
                <div className="flex items-center flex-1 min-w-0 px-4">
                  <Search className="h-4 w-4 text-gray-400 flex-shrink-0 mr-2.5" />
                  <input
                    type="text"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key !== 'Enter') return
                      setHasSearched(true)
                      handleAISearch(inputValue)
                    }}
                    className="flex-1 bg-transparent outline-none text-sm text-charcoal placeholder-gray-400 min-w-0"
                    placeholder="Search by grant name, keyword or funder..."
                  />
                </div>
                {/* Divider */}
                <div className="w-px h-6 bg-gray-200 flex-shrink-0" />
                {/* Location */}
                <div className="flex items-center w-36 px-4 flex-shrink-0">
                  <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0 mr-2" />
                  <input
                    type="text"
                    value={locationInput}
                    onChange={e => setLocationInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key !== 'Enter') return
                      setLocationFilter(locationInput)
                      setHasSearched(true)
                      handleAISearch(inputValue)
                    }}
                    onBlur={() => setLocationFilter(locationInput)}
                    className="flex-1 bg-transparent outline-none text-sm text-charcoal placeholder-gray-400 min-w-0"
                    placeholder="Location"
                  />
                </div>
                {/* Divider */}
                <div className="w-px h-6 bg-gray-200 flex-shrink-0" />
                {/* Filters */}
                <button
                  onClick={() => setFiltersOpen(o => !o)}
                  className={`flex items-center gap-1.5 px-4 h-full text-sm font-medium transition-colors flex-shrink-0 ${
                    filtersOpen || activeFilterCount > 0 ? 'text-charcoal' : 'text-gray-500 hover:text-charcoal'
                  }`}
                >
                  <SlidersHorizontal size={14} strokeWidth={2} />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="text-xs bg-charcoal text-white px-1.5 py-0.5 rounded-full leading-none">{activeFilterCount}</span>
                  )}
                  <ChevronDown size={12} strokeWidth={2} className={`transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`} />
                </button>
                {/* Divider */}
                <div className="w-px h-6 bg-gray-200 flex-shrink-0" />
                {/* Profile toggle */}
                {org && (
                  <button
                    onClick={() => {
                      if (profileFilterOn) {
                        setProfileFilterOn(false)
                        setActiveSectors(new Set())
                        setLocationFilter('')
                        setLocationInput('')
                      } else {
                        setProfileFilterOn(true)
                        if (org.primary_location) { setLocationFilter(org.primary_location); setLocationInput(org.primary_location) }
                        if ((org.impact_sectors as string[] | undefined)?.length) setActiveSectors(new Set(org.impact_sectors as ImpactSector[]))
                      }
                    }}
                    className="flex items-center gap-2 px-4 h-full flex-shrink-0 whitespace-nowrap"
                    title={profileFilterOn ? 'Turn off profile filter' : 'Filter by your profile'}
                  >
                    <span className="relative flex-shrink-0" style={{
                      width: 40, height: 22,
                      backgroundColor: profileFilterOn ? '#84CC16' : '#d1d5db',
                      borderRadius: 9999, display: 'inline-flex', alignItems: 'center',
                      transition: 'background-color 0.2s',
                    }}>
                      <span className="absolute bg-white transition-transform duration-200" style={{
                        width: 16, height: 16, borderRadius: 9999, top: 3, left: 3,
                        transform: profileFilterOn ? 'translateX(18px)' : 'translateX(0)',
                      }} />
                    </span>
                    <span className={`text-[11px] font-semibold uppercase tracking-wider ${profileFilterOn ? 'text-gray-600' : 'text-gray-400'}`}>
                      Profile
                    </span>
                  </button>
                )}
              </div>
              {/* Search button — outside the pill */}
              <button
                onClick={() => { setHasSearched(true); handleAISearch(inputValue) }}
                disabled={!inputValue.trim() && !locationFilter.trim()}
                className={`h-12 px-6 text-sm font-bold flex-shrink-0 transition-opacity disabled:opacity-40 flex items-center gap-2 rounded-full ${aiLoading ? 'pointer-events-none' : ''}`}
                style={{ background: '#84CC16', color: '#1A1A1A' }}
              >
                {aiLoading
                  ? <><span className="dot-bounce flex gap-0.5"><span/><span/><span/></span> Searching…</>
                  : <><Search size={14} strokeWidth={2} /> Search</>}
              </button>
            </div>
          )}

          {/* ── Secondary row: clear results + error ── */}
          {activeView === 'matches' && (aiResults || aiError) && (
            <div className="mt-2 flex items-center gap-2">
              {aiResults && (
                <button onClick={() => { setAiResults(null); setSmartMatched(false); setQuery(''); setInputValue('') }} className="px-3 py-1 border border-warm text-xs font-medium text-mid hover:border-[#84CC16] hover:text-[#4A7C10] transition-all bg-white rounded-md">
                  Clear results
                </button>
              )}
              {aiError && <p className="text-amber-600 text-xs">⚠ {aiError}</p>}
            </div>
          )}


          {/* ── Collapsible filters panel ── */}
          {filtersOpen && (
          <div className="mt-4 pt-4 border-t border-warm space-y-4">

            {/* Row 1: Funding type + Funder source */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-light uppercase tracking-wider mb-2">Funding type</p>
                <div className="flex gap-1.5 flex-wrap">
                  {visibleFundingTypes.map(t => (
                    <button key={t.id} onClick={() => setActiveFundingType(t.id as FundingType | 'all')}
                      title={t.desc}
                      className={`px-3 py-1.5 border text-xs font-medium transition-all rounded-md ${
                        activeFundingType === t.id
                          ? 'bg-charcoal border-charcoal text-white'
                          : 'border-warm text-mid hover:border-[#84CC16] hover:text-[#4A7C10]'
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
                        className={`px-3 py-1.5 border text-xs font-medium transition-all rounded-md ${
                          activeType === t.id
                            ? 'bg-charcoal border-charcoal text-white'
                            : 'border-warm text-mid hover:border-[#84CC16] hover:text-[#4A7C10]'
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
                    className={`px-3 py-1.5 border text-xs font-medium transition-all rounded-md ${
                      activeGeoScope === 'all'
                        ? 'bg-charcoal border-charcoal text-white'
                        : 'border-warm text-mid hover:border-[#84CC16] hover:text-[#4A7C10]'
                    }`}
                  >
                    Anywhere
                  </button>
                  {GEO_SCOPES.map(scope => (
                    <button
                      key={scope.id}
                      onClick={() => setActiveGeoScope(activeGeoScope === scope.id ? 'all' : scope.id)}
                      className={`px-3 py-1.5 border text-xs font-medium transition-all rounded-md ${
                        activeGeoScope === scope.id
                          ? 'bg-charcoal border-charcoal text-white'
                          : 'border-warm text-mid hover:border-[#84CC16] hover:text-[#4A7C10]'
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
                      className={`px-3 py-1.5 border text-xs font-medium transition-all rounded-md ${
                        deadlineFilter === v
                          ? 'bg-charcoal border-charcoal text-white'
                          : 'border-warm text-mid hover:border-[#84CC16] hover:text-[#4A7C10]'
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
                      className={`px-3 py-1.5 border text-xs font-medium transition-all rounded-md ${
                        isActive
                          ? 'bg-charcoal border-charcoal text-white'
                          : 'border-warm text-mid hover:border-[#84CC16] hover:text-[#4A7C10]'
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
                className="text-xs font-semibold text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 transition-all rounded-md"
              >
                ✕ Reset all filters
              </button>
            )}
          </div>
        )}
          {/* ── Funding type tabs ── */}
          {activeView === 'matches' && (
            <div className="mt-5 -mx-5 border-t border-[#E8E8EC]">
              <div className="flex">
                {TYPE_TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex flex-1 items-center justify-center gap-2 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-[#84CC16] text-[#1A1A1A] font-bold'
                        : 'border-transparent text-mid hover:text-charcoal'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                    {tab.count > 0 && (
                      <span className={`text-xs font-medium ${activeTab === tab.id ? 'text-[#4A7C10]' : 'text-light'}`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {TAB_DESCS[activeTab] && (
                <div className="mx-5 mb-1 mt-3 px-4 py-3 bg-[#F5F5F7] rounded-lg flex items-start justify-between gap-4">
                  <p className="text-sm text-[#444] leading-relaxed">{TAB_DESCS[activeTab]}</p>
                  {activeTab === 'programme' && (
                    <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
                      <span className="text-xs font-semibold text-mid whitespace-nowrap">Includes cash</span>
                      <button
                        role="switch"
                        aria-checked={programmeHasCash}
                        onClick={() => setProgrammeHasCash(v => !v)}
                        className={`relative inline-flex h-5 w-9 items-center transition-colors flex-shrink-0 ${programmeHasCash ? 'bg-[#84CC16]' : 'bg-[#D1D5DB]'}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 bg-white shadow transform transition-transform ${programmeHasCash ? 'translate-x-4' : 'translate-x-1'}`} />
                      </button>
                    </label>
                  )}
                </div>
              )}
            </div>
          )}
        </div>{/* end p-5 */}
      </div>{/* end search card */}

      {/* ── Results header ── */}
      {activeView === 'matches' && hasSearched && (
        <div className="mb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-mid">
              {(() => {
                const tabNoun = activeTab === 'programme' ? 'programmes' : activeTab === 'investment' ? 'investments' : activeTab === 'in_kind' ? 'in-kind opportunities' : 'grants'
                return aiResults && smartMatched ? (
                  <><strong style={{ color: '#84CC16' }}>✦ {displayGrants.length}</strong> {tabNoun} matched for <strong className="text-charcoal">{org?.name}</strong></>
                ) : aiResults ? (
                  <><strong style={{ color: '#84CC16' }}>✦ {displayGrants.length}</strong> results for &ldquo;{query}&rdquo;</>
                ) : filterQuery ? (
                  <><strong className="text-3xl font-bold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{displayGrants.length} {tabNoun}</strong><span className="text-base text-mid ml-2">matching &ldquo;{filterQuery}&rdquo;</span></>
                ) : (
                  <><strong className="text-3xl font-bold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{displayGrants.length} {tabNoun}</strong>{profileFilterOn && <span className="text-base text-mid ml-2">matched for you</span>}</>
                )
              })()}
            </p>
            {!aiResults && (
              <div className="flex items-center border border-[#E8E8EC] overflow-hidden flex-shrink-0 rounded-lg">
                {/* Sort By label */}
                <span className="px-3 py-2 text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider border-r border-[#E8E8EC] bg-[#F5F5F7] whitespace-nowrap">
                  Sort By
                </span>
                {([
                  { id: 'match',    label: 'Best Match'   },
                  { id: 'freshest', label: 'Newest'       },
                  { id: 'deadline', label: 'Closing Soon' },
                ] as const).map((tab, i) => (
                  <button
                    key={tab.id}
                    onClick={() => setSortBy(tab.id as 'match' | 'freshest' | 'deadline')}
                    className={`px-4 py-2 text-xs font-medium transition-colors whitespace-nowrap${i > 0 ? ' border-l border-[#E8E8EC]' : ''}`}
                    style={sortBy === tab.id
                      ? { backgroundColor: '#F4F9E8', color: '#4A7C10' }
                      : { backgroundColor: '#fff', color: '#6b7280' }}
                  >{tab.label}</button>
                ))}
              </div>
            )}
          </div>
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

      {/* ── Matches view ── */}
      {activeView === 'matches' && hasSearched && (() => {
        const dismissedCount = displayGrants.filter(item => interactions.get(item.grant.id)?.has('dismissed')).length
        const visibleGrants  = showDismissed
          ? displayGrants
          : displayGrants.filter(item => !interactions.get(item.grant.id)?.has('dismissed'))
        return visibleGrants.length === 0 && dismissedCount === 0 ? (
          <div className="text-center py-16 text-light">
            <p className="text-4xl mb-3">🔍</p>
            {filterQuery ? (
              <>
                <p className="mb-3">No grants matched &ldquo;<strong className="text-charcoal">{filterQuery}</strong>&rdquo; in your current filters.</p>
                <button
                  onClick={() => { setInputValue(''); setFilterQuery('') }}
                  className="px-4 py-2 text-xs font-semibold rounded-full transition-colors hover:opacity-80" style={{ color: '#4A7C10', border: '1px solid rgba(132,204,22,0.4)', background: 'rgba(132,204,22,0.06)' }}
                >
                  Clear search
                </button>
              </>
            ) : (
              <p className="mb-3">No grants found — try different keywords or clear the filters.</p>
            )}
          </div>
        ) : (
          <>
            {visibleGrants.slice(0, visibleCount).map(item => (
              <GrantCard
                key={item.grant.id}
                item={item}
                hasOrg={!!org}
                hasSearch={showMatchInfo}
                org={org}
                interactions={interactions.get(item.grant.id) ?? new Set()}
                onAddToPipeline={handleAddToPipeline}
                isInPipeline={pipelinedIds.has(item.grant.title)}
                onRemoveFromPipeline={handleRemoveFromPipeline}
                onDismiss={handleDismiss}
                onUndismiss={handleUndismiss}
                onLike={handleLike}
                onDislike={handleDislike}
                onSave={handleSave}
                onUnsave={handleUnsave}
                showIfDismissed={showDismissed}
              />
            ))}
            {visibleCount < visibleGrants.length && (
              <div className="text-center py-6">
                <button
                  onClick={() => setVisibleCount(v => v + 30)}
                  className="btn-outline px-6 py-2.5 text-sm"
                >
                  Show more ({visibleGrants.length - visibleCount} remaining)
                </button>
              </div>
            )}
            {dismissedCount > 0 && (
              <div className="text-center py-4 border-t border-warm/50 mt-2">
                <button
                  onClick={() => setShowDismissed(v => !v)}
                  className="inline-flex items-center gap-1.5 text-xs text-light hover:text-mid transition-colors"
                >
                  {showDismissed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showDismissed
                    ? `Hide ${dismissedCount} hidden grant${dismissedCount !== 1 ? 's' : ''}`
                    : `${dismissedCount} hidden grant${dismissedCount !== 1 ? 's' : ''} — show`}
                </button>
              </div>
            )}
          </>
        )
      })()}

      {/* ── Saved view ── */}
      {activeView === 'saved' && (() => {
        const savedGrants: DisplayGrant[] = allGrants
          .filter(g => interactions.get(g.id)?.has('saved'))
          .map(g => ({ grant: g, score: 0, reason: '', isAiScore: false, breakdown: undefined }))
        return savedGrants.length === 0 ? (
          <div className="text-center py-16 text-light">
            <Bookmark className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p className="mb-2 font-medium text-charcoal">No saved grants yet</p>
            <p className="text-sm mb-4">Bookmark grants to save them for later. Switch to "My Matches" to start exploring.</p>
          </div>
        ) : (
          <>
            {savedGrants.slice(0, visibleCount).map(item => (
              <GrantCard
                key={item.grant.id}
                item={item}
                hasOrg={!!org}
                hasSearch={false}
                interactions={interactions.get(item.grant.id) ?? new Set()}
                onAddToPipeline={handleAddToPipeline}
                isInPipeline={pipelinedIds.has(item.grant.title)}
                onRemoveFromPipeline={handleRemoveFromPipeline}
                onDismiss={handleDismiss}
                onUndismiss={handleUndismiss}
                onLike={handleLike}
                onDislike={handleDislike}
                  onSave={handleSave}
                onUnsave={handleUnsave}
              />
            ))}
            {visibleCount < savedGrants.length && (
              <div className="text-center py-6">
                <button
                  onClick={() => setVisibleCount(v => v + 30)}
                  className="btn-outline px-6 py-2.5 text-sm"
                >
                  Show more ({savedGrants.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </>
        )
      })()}

      {/* ── Latest tab: chronological feed, no profile filter ── */}
      {activeView === 'latest' && (() => {
        const latestGrants: DisplayGrant[] = [...allGrants]
          .filter(g => !!g.dateAdded)
          .sort((a, b) => (b.dateAdded ?? '').localeCompare(a.dateAdded ?? ''))
          .concat(allGrants.filter(g => !g.dateAdded))
          .map(g => ({ grant: g, score: 0, reason: '', isAiScore: false, breakdown: undefined }))
        return latestGrants.length === 0 ? (
          <div className="text-center py-16 text-light">
            <CalendarDays className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p className="font-medium text-charcoal">No grants loaded yet</p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.02em' }}>{latestGrants.length} opportunities</p>
                <p className="text-sm text-mid mt-0.5">Sorted by date added — newest first. Not filtered by your profile.</p>
              </div>
            </div>
            {latestGrants.slice(0, visibleCount).map(item => (
              <GrantCard
                key={item.grant.id}
                item={item}
                hasOrg={!!org}
                hasSearch={false}
                interactions={interactions.get(item.grant.id) ?? new Set()}
                onAddToPipeline={handleAddToPipeline}
                isInPipeline={pipelinedIds.has(item.grant.title)}
                onRemoveFromPipeline={handleRemoveFromPipeline}
                onDismiss={handleDismiss}
                onUndismiss={handleUndismiss}
                onLike={handleLike}
                onDislike={handleDislike}
                onSave={handleSave}
                onUnsave={handleUnsave}
              />
            ))}
            {visibleCount < latestGrants.length && (
              <div className="text-center py-6">
                <button
                  onClick={() => setVisibleCount(v => v + 30)}
                  className="btn-outline px-6 py-2.5 text-sm"
                >
                  Show more ({latestGrants.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </>
        )
      })()}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-charcoal text-white px-5 py-3.5 shadow-card-lg text-sm z-50">
          ✓ {toast}
        </div>
      )}

    </div>
  )
}

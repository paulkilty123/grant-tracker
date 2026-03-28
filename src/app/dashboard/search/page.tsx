'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, ChevronDown, Layers, DollarSign, Rocket, Building2, SlidersHorizontal, MapPin, GraduationCap, TrendingUp, GitMerge, Gift, Landmark, CalendarDays, RefreshCw, Bookmark, PlusCircle, Activity, Info } from 'lucide-react'
import GrantDetailModal from '@/components/GrantDetailModal'
import { SEED_GRANTS } from '@/lib/grants'
import { formatRange } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { createPipelineItem } from '@/lib/pipeline'
import { getOrganisationByOwner } from '@/lib/organisations'
import { computeMatchScore, scoreColour } from '@/lib/matching'
import type { FeedbackSignals, MatchBreakdown } from '@/lib/matching'
import { getInteractions, recordInteraction, removeInteraction } from '@/lib/interactions'
import { saveSearchHistory, getSearchHistory, deleteSearchHistory, getWeeklySearchCount } from '@/lib/searchHistory'
import type { GrantOpportunity, Organisation, FunderType, FundingType, ImpactSector, LegalStructure } from '@/types'
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
  { id: 'all',               label: 'All types',            emoji: '⚡', desc: 'All funding types' },
  { id: 'grant',             label: 'Grants & Awards',      emoji: '🎯', desc: 'One-off grants from trusts, foundations, Lottery & government' },
  { id: 'accelerator',        label: 'Accelerators',         emoji: '🚀', desc: 'Equity-free programmes: mentoring, workspace & networks' },
  { id: 'support_programme', label: 'Support & Training',  emoji: '🎓', desc: 'Capacity building, fellowships, mentoring, incubators & training programmes' },
  { id: 'social_investment', label: 'Social Investment',    emoji: '💰', desc: 'Repayable finance for social purpose organisations' },
  { id: 'diversity_fund',    label: 'Diversity Funds',      emoji: '🌈', desc: 'BBB Pathways, Women in Innovation, Black Seed & more' },
  { id: 'blended_finance',   label: 'Blended Finance',      emoji: '🔗', desc: 'Community shares, matched crowdfunding & CDFIs' },
  { id: 'in_kind',           label: 'In-Kind & Tax',        emoji: '🛠️', desc: 'Google Ad Grants, AWS credits, SITR, R&D tax credits' },
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
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-forest/70" strokeWidth={2} />
              <p className="text-sm text-forest leading-snug">{grant.notes}</p>
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
              style={{ background: '#1C1C2E', color: '#ffffff', border: '1px solid #1C1C2E' }}>
              Visit website →
            </a>
            <button onClick={() => onAddToPipeline(grant)}
              className="px-3 py-2 bg-coral text-white text-xs font-semibold w-full hover:bg-coral/90 transition-colors">
              + Pipeline
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
        <span className={`text-sm ${text}`}>{isAi ? '✦' : '●'}</span>
        <span className={`text-sm font-bold ${text}`}>{score}% match</span>
        {breakdown && <span className={`text-xs opacity-40 ${text}`}>▾</span>}
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
function GrantCard({ item, hasOrg, hasSearch, interactions, onAddToPipeline, onDismiss, onUndismiss, onLike, onDislike, onViewDetail, onSave, onUnsave }: {
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
  onSave?: (grantId: string) => void
  onUnsave?: (grantId: string) => void
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
    return (
      <div className="bg-warm/50 px-5 py-3 mb-2 border border-warm flex items-center justify-between opacity-60">
        <p className="text-sm text-mid line-through">{grant.title} — {grant.funder}</p>
        <button onClick={() => onUndismiss(grant.id)} className="text-xs text-coral hover:underline ml-4 flex-shrink-0">
          Undo dismiss
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
        IMPACT_SECTOR_FILTERS.find(f => f.id === s)?.label ?? s
      )
    : grant.sectors.map(s => sectorLabel(s)).filter(Boolean).slice(0, 3) as string[]

  // Eligible structure labels
  const structureLabels = ((grant as EnrichedGrant).eligibleStructures ?? [])
    .slice(0, 3).map(s => STRUCTURE_LABELS[s] ?? s.replace(/_/g, ' '))

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
                style={{ borderRadius: 9999, backgroundColor: 'rgba(0,128,128,0.12)', color: '#26A69A' }}>
                {label}
              </span>
            ))}
            {/* Funder type pill */}
            {grant.funderType && grant.funderType !== 'other' && (() => {
              const FUNDER_PILL_LABELS: Record<string, string> = {
                trust_foundation:  'Trust / Foundation',
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
          </div>

          {/* Title */}
          <h3 className="font-lora text-2xl font-bold text-charcoal leading-snug mb-1">{grant.title}</h3>

          {/* Funder */}
          <p className="text-sm font-semibold mb-4" style={{ color: '#26A69A' }}>{grant.funder}</p>

          {/* Description */}
          <p className="text-sm leading-relaxed mb-6" style={{ color: '#777' }}>
            {grant.description.length > 180
              ? `${grant.description.slice(0, 180).trimEnd()}…`
              : grant.description}
          </p>

          {/* Metadata */}
          <div className="flex gap-8">
            <div>
              <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-1">Amount</p>
              <p className="text-sm font-bold" style={{ color: '#26A69A' }}>{formatRange(grant.amountMin, grant.amountMax)}</p>
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
              <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-1">Beneficiary</p>
              <p className="text-sm font-semibold text-charcoal">{structureLabels.length > 0 ? structureLabels.join(', ') : '—'}</p>
            </div>
          </div>
        </div>

        {/* ── Right: buttons top, Add to Pipeline bottom ── */}
        <div className="flex flex-col p-6 flex-shrink-0 w-[180px]">
          {/* View Details + Save at top */}
          <div className="flex flex-col gap-3">
            {grant.source === 'scraped' && (
              <button
                onClick={() => onViewDetail(grant.id)}
                className="w-full px-4 py-3 text-sm font-semibold text-white text-center transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#008080', borderRadius: 9999 }}
              >
                View Details
              </button>
            )}
            <button
              onClick={() => isSaved ? onUnsave?.(grant.id) : onSave?.(grant.id)}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold border transition-colors ${
                isSaved
                  ? 'bg-[#FF7043]/10 text-[#FF7043] border-[#FF7043]/30'
                  : 'border-[#E8E8EC] text-charcoal hover:border-[#FF7043] hover:text-[#FF7043]'
              }`}
              style={{ borderRadius: 9999 }}
            >
              <Bookmark className="w-4 h-4" fill={isSaved ? 'currentColor' : 'none'} />
              {isSaved ? 'Saved' : 'Save'}
            </button>
          </div>
          {/* Spacer */}
          <div className="flex-1" />
          {/* Add to Pipeline at bottom of white area */}
          <button
            onClick={() => onAddToPipeline(grant)}
            className="w-full flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors hover:opacity-70 pb-1"
            style={{ color: '#26A69A' }}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            Add to Pipeline
          </button>
        </div>

      </div>

      {/* ── Full-width Match Insight strip ── */}
      {hasOrg && hasSearch && reason && (
        <div className="flex items-center gap-4 px-6 py-4 border-t border-[#E8E8EC]"
          style={{ backgroundColor: '#FAF8F5', borderLeft: '4px solid #008080' }}>
          {/* Icon + text */}
          <Activity className="w-5 h-5 flex-shrink-0" style={{ color: '#26A69A' }} />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#26A69A' }}>Match Insight</p>
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
          {/* Score ring graphic */}
          {score > 0 && (
            <div className="flex-shrink-0 flex flex-col items-center gap-0.5 ml-2">
              <svg width="68" height="68" viewBox="0 0 68 68">
                {/* Track */}
                <circle cx="34" cy="34" r="27" fill="none" stroke="#E8E8EC" strokeWidth="5" />
                {/* Progress arc — circumference ≈ 169.6 */}
                <circle
                  cx="34" cy="34" r="27"
                  fill="none"
                  stroke="#008080"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={`${(score / 100) * 169.6} 169.6`}
                  transform="rotate(-90 34 34)"
                />
                <text x="34" y="31" textAnchor="middle" dominantBaseline="middle"
                  style={{ fontSize: '13px', fontWeight: '700', fill: '#008080', fontFamily: 'inherit' }}>
                  {score}%
                </text>
                <text x="34" y="46" textAnchor="middle"
                  style={{ fontSize: '8px', fill: '#26A69A', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: '600' }}>
                  MATCH
                </text>
              </svg>
            </div>
          )}
        </div>
      )}

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
    nextOpenDate:         row.next_open_date ? String(row.next_open_date) : null,
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
  const [hasSearched, setHasSearched]             = useState(false)
  const [profileFiltersOpen, setProfileFiltersOpen] = useState(false)
  const [activeTab, setActiveTab]                 = useState<'grant' | 'social_investment' | 'blended_finance' | 'accelerator' | 'support_programme' | 'in_kind' | 'corporate'>('grant')
  const [activeView, setActiveView]               = useState<'matches' | 'saved'>('matches')

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
  const [detailGrantId, setDetailGrantId]           = useState<string | null>(null)
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
        // My Matches mode: always auto-apply profile and show results
        if (o.primary_location) setLocationFilter(o.primary_location)
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

  // Category groupings for the top-level toggle
  const GRANT_TYPES: (FundingType | 'all')[]      = ['grant', 'social_investment', 'diversity_fund', 'blended_finance', 'in_kind']
  const PROGRAMME_TYPES: (FundingType | 'all')[]  = ['accelerator', 'support_programme']

  // Reset visible count when search/filters change so the user starts from the top
  useEffect(() => {
    setVisibleCount(30)
  }, [query, activeType, amountMin, amountMax, deadlineFilter, activeSectors, activeFundingType, categoryFilter, entryTypeFilter, freshnessFilter, showInviteOnly, aiResults, activeFunderCategory, activeGeoScope])

  // ── Build display grants ─────────────────────────────────────────────────
  const displayGrants: DisplayGrant[] = (() => {
    const minAmt = amountMin ? Number(amountMin) : null
    const maxAmt = amountMax ? Number(amountMax) : null
    const todayStr = new Date().toISOString().split('T')[0]

    const filtered = allGrants.filter(g => {
      // Always strip expired deadlines — never show grants whose closing date has passed
      if (!g.isRolling && g.deadline && g.deadline < todayStr) return false

      const matchesType =
        activeType === 'all'      ? true :
        activeType === 'local'    ? g.isLocal :
        activeType === 'recent'   ? (g.dateAdded != null && g.dateAdded >= SIXTY_DAYS_AGO) :
        activeType === 'scraped'  ? g.source === 'scraped' :
        g.funderType === activeType
      // Text query only applies when there are AI results — in My Matches mode
      // the search box triggers AI search, not local text filtering
      const matchesQuery = true
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
      // Funding type tab filter — filter by activeTab
      const matchesTab = activeTab === 'grant'
        ? (['grant', 'diversity_fund'] as string[]).includes(gFundingType ?? 'grant')
        : gFundingType === activeTab

      return matchesQuery && matchesType && matchesAmount && matchesDeadline && matchesSectors && matchesEntryType && matchesFreshness && matchesInviteOnly && matchesFundingType && matchesCategory && matchesFunderCategory && matchesGeoScope && matchesLocationText && matchesTab
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
        const aDeadline = a.grant.deadline ?? '9999-12-31'
        const bDeadline = b.grant.deadline ?? '9999-12-31'
        return aDeadline.localeCompare(bDeadline)
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
    setLocationFilter('')
    setSortBy('match')
    setEntryTypeFilter('all')
    setFreshnessFilter('all')
    setShowInviteOnly(true)
    setCategoryFilter('all')
    setActiveFunderCategory('all')
    setActiveGeoScope('all')
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

  const TYPE_TABS = [
    { id: 'grant'             as const, label: 'Grants',                    icon: <DollarSign size={14} strokeWidth={2} /> },
    { id: 'social_investment' as const, label: 'Social Investment',         icon: <TrendingUp size={14} strokeWidth={2} /> },
    { id: 'blended_finance'   as const, label: 'Blended Finance',           icon: <GitMerge size={14} strokeWidth={2} /> },
    { id: 'accelerator'       as const, label: 'Incubators & Accelerators', icon: <Rocket size={14} strokeWidth={2} /> },
    { id: 'support_programme' as const, label: 'Fellowships & Support',     icon: <GraduationCap size={14} strokeWidth={2} /> },
    { id: 'in_kind'           as const, label: 'In-Kind & Pro Bono',        icon: <Gift size={14} strokeWidth={2} /> },
    { id: 'corporate'         as const, label: 'Corporate Partners',        icon: <Building2 size={14} strokeWidth={2} /> },
  ]

  const TAB_DESCS: Record<string, string> = {
    grant:             'Non-repayable funds from foundations, trusts, and public bodies. Applications required; deadlines are firm.',
    social_investment: 'Repayable finance (loans, bonds, equity) for organisations that generate social impact alongside financial returns.',
    blended_finance:   'Part-grant, part-loan structures for organisations that generate some revenue but need grant support to be viable.',
    accelerator:       'Structured 3–6 month programmes combining funding, mentorship, and expert support. Best for early-stage growth.',
    support_programme: 'Non-financial support: training, mentorship, and networking. Some include a small stipend or grant.',
    in_kind:           'Goods, services, or expertise instead of cash — free legal advice, office space, technology, or pro bono support.',
    corporate:         'Not grants — these are partnership opportunities with businesses. Approach them as a commercial relationship, not a funding application.',
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
  // (sectors/location applied) OR when an AI search has produced scored results.
  // When profile filter is off and no AI search is active, suppress them so the
  // UI doesn't show match data that isn't actually filtering anything.
  const profileFilterOn = activeSectors.size > 0 || !!locationFilter
  const showMatchInfo = !!org && (profileFilterOn || !!aiResults)

  return (
    <div>
      {/* ── Page heading ── */}
      <div className="mb-2">
        <h2 className="font-serif text-5xl font-bold text-charcoal leading-tight">Find Funding</h2>
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

      {/* ── Subtitle row: text left, tabs right ── */}
      <div className="flex items-center justify-between mb-3">
        {/* Left: subtitle (conditional) */}
        <div className="flex items-center gap-2 text-sm text-mid">
          {activeView === 'matches' && org && (
            <>
              <span className="w-2 h-2 flex-shrink-0 rounded-full" style={{ backgroundColor: '#008080' }} />
              Intelligent matches for <strong className="text-charcoal">{org.name ?? 'your organisation'}</strong>
              {org.primary_location && <span className="text-mid">· {org.primary_location}, UK</span>}
            </>
          )}
          {activeView === 'matches' && !org && (
            <div className="text-xs border border-amber-200 bg-amber-50 px-3 py-2">
              <a href="/dashboard/profile" className="font-semibold text-amber-700 underline">Set up your profile</a>
              <span className="text-amber-800"> to see grants ranked for your organisation.</span>
            </div>
          )}
        </div>
        {/* Right: tabs always visible */}
        <div className="flex items-center gap-0 bg-white border border-warm/60 shadow-sm overflow-hidden flex-shrink-0" style={{ borderRadius: 9999 }}>
          {(['matches', 'saved'] as const).map((v, i) => (
            <>
              {i > 0 && <div key="sep" className="w-px h-5 bg-warm/80" />}
              <button
                key={v}
                onClick={() => setActiveView(v)}
                className={`px-5 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${activeView === v ? 'text-coral border-b-2 border-coral' : 'border-b-2 border-transparent text-gray-500 hover:text-charcoal'}`}
              >
                {v === 'matches' ? 'My Matches' : 'Saved'}
                {v === 'saved' && savedCount > 0 && (
                  <span className="text-xs bg-coral text-white px-1.5 py-0.5 ml-1" style={{ borderRadius: 9999 }}>{savedCount}</span>
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
                        setActiveSectors(new Set())
                        setLocationFilter('')
                        setLocationInput('')
                      } else {
                        if (org.primary_location) { setLocationFilter(org.primary_location); setLocationInput(org.primary_location) }
                        if ((org.impact_sectors as string[] | undefined)?.length) setActiveSectors(new Set(org.impact_sectors as ImpactSector[]))
                      }
                    }}
                    className="flex items-center gap-2 px-4 h-full flex-shrink-0 whitespace-nowrap"
                    title={profileFilterOn ? 'Turn off profile filter' : 'Filter by your profile'}
                  >
                    <span className="relative flex-shrink-0" style={{
                      width: 40, height: 22,
                      backgroundColor: profileFilterOn ? '#26A69A' : '#d1d5db',
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
                className={`h-12 px-6 text-white text-sm font-semibold flex-shrink-0 transition-opacity disabled:opacity-40 flex items-center gap-2 rounded-full ${aiLoading ? 'pointer-events-none' : ''}`}
                style={{ backgroundColor: '#008080' }}
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
                <button onClick={() => { setAiResults(null); setSmartMatched(false); setQuery(''); setInputValue('') }} className="px-3 py-1 border border-warm text-xs font-medium text-mid hover:border-coral hover:text-coral transition-all bg-white rounded-md">
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
                        className={`px-3 py-1.5 border text-xs font-medium transition-all rounded-md ${
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
                    className={`px-3 py-1.5 border text-xs font-medium transition-all rounded-md ${
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
                      className={`px-3 py-1.5 border text-xs font-medium transition-all rounded-md ${
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
                      className={`px-3 py-1.5 border text-xs font-medium transition-all rounded-md ${
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
                      className={`px-3 py-1.5 border text-xs font-medium transition-all rounded-md ${
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
              <div className="flex overflow-x-auto">
                {TYPE_TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                      activeTab === tab.id
                        ? 'border-coral text-coral'
                        : 'border-transparent text-mid hover:text-charcoal'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>
              {TAB_DESCS[activeTab] && (
                <div className="mx-5 mb-1 mt-3 px-4 py-3 bg-[#FAF8F5] rounded-lg">
                  <p className="text-sm text-[#444] leading-relaxed">{TAB_DESCS[activeTab]}</p>
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
              {aiResults && smartMatched ? (
                <><strong className="text-coral">✦ {displayGrants.length}</strong> grants matched for <strong className="text-charcoal">{org?.name}</strong></>
              ) : aiResults ? (
                <><strong className="text-coral">✦ {displayGrants.length}</strong> results for &ldquo;{query}&rdquo;</>
              ) : (
                <><strong className="font-serif text-3xl font-bold text-charcoal">{displayGrants.length} grants</strong><span className="text-base text-mid ml-2">ranked for your mission</span></>
              )}
            </p>
            {!aiResults && (
              <div className="flex items-center border border-[#E8E8EC] overflow-hidden flex-shrink-0 rounded-lg">
                {/* Sort By label */}
                <span className="px-3 py-2 text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider border-r border-[#E8E8EC] bg-[#FAF8F5] whitespace-nowrap">
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
                      ? { backgroundColor: '#fff', color: '#FF7043' }
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
      {activeView === 'matches' && hasSearched && (displayGrants.length === 0 ? (
        <div className="text-center py-16 text-light">
          <p className="text-4xl mb-3">🔍</p>
          <p className="mb-3">No grants found — try different keywords or clear the filters.</p>
        </div>
      ) : (
        <>
          {displayGrants.slice(0, visibleCount).map(item => (
            <GrantCard
              key={item.grant.id}
              item={item}
              hasOrg={!!org}
              hasSearch={showMatchInfo}
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
                onDismiss={handleDismiss}
                onUndismiss={handleUndismiss}
                onLike={handleLike}
                onDislike={handleDislike}
                onViewDetail={setDetailGrantId}
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
                className="flex-1 text-center px-3 py-2 bg-forest text-white text-xs font-semibold hover:opacity-90 transition-colors"
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

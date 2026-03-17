'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, ThumbsUp, ThumbsDown, ChevronDown, Layers, DollarSign, Rocket, Database, Globe, Clock, Building2, SlidersHorizontal, Sparkles, MapPin, Award, GraduationCap, TrendingUp, Users, GitMerge, Gift, Landmark, CalendarDays, RefreshCw, Info, Trophy, HandCoins } from 'lucide-react'
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
function formatDeadline(dateStr: string | null): string | null {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
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
        <div className="flex-1">
          <div className="flex items-start gap-3 mb-2">
            <div className="h-10 w-10 bg-[#f5f2ed] flex items-center justify-center text-charcoal font-bold text-sm flex-shrink-0 border border-warm">
              {grant.funder[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-charcoal text-base leading-snug">{grant.title}</h3>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">🌐 Live result</span>
              </div>
              <p className="text-sm text-mid">{grant.funder}</p>
            </div>
          </div>
          <p className="text-sm text-mid leading-relaxed mb-3">{grant.description}</p>
          {grant.notes && (
            <div className="bg-coral/5 border border-coral/20 px-3.5 py-2.5 flex items-start gap-2">
              <span className="text-sage text-sm">💡</span>
              <p className="text-sm text-charcoal">{grant.notes}</p>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-3 w-40 flex-shrink-0">
          {grant.amountRange && (
            <div className="text-right">
              <p className="text-lg font-bold text-gold leading-snug">{grant.amountRange}</p>
              <p className="text-xs text-light mt-0.5">Grant range</p>
            </div>
          )}
          <div className="text-right">
            <p className="text-xs text-mid">Deadline</p>
            <p className="text-sm font-medium text-charcoal">{formatDeadline(grant.deadline) ?? 'Check website'}</p>
          </div>
          <div className="flex flex-col gap-1.5 w-full">
            <a href={grant.applyUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 px-3 py-1.5 border border-warm text-xs font-medium text-mid hover:border-coral hover:text-coral transition-colors w-full">
              Visit website →
            </a>
            <button onClick={() => onAddToPipeline(grant)}
              className="px-3 py-1.5 bg-coral text-white text-xs font-semibold w-full hover:bg-coral/90 transition-colors">
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
        className={`flex items-center gap-1.5 px-2.5 py-1 ${bg} cursor-pointer hover:opacity-80 transition-opacity`}
        title="Click to see score breakdown"
      >
        <span className="text-sm">{isAi ? '✦' : '●'}</span>
        <span className={`text-xs font-bold ${text}`}>{score}% match</span>
        {breakdown && <span className="text-xs opacity-50">▾</span>}
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
function GrantCard({ item, hasOrg, hasSearch, interactions, onAddToPipeline, onDismiss, onUndismiss, onLike, onDislike }: {
  item: DisplayGrant
  hasOrg: boolean
  hasSearch: boolean
  interactions: Set<InteractionAction>
  onAddToPipeline: (g: GrantOpportunity) => void
  onDismiss: (grantId: string) => void
  onUndismiss: (grantId: string) => void
  onLike: (grantId: string) => void
  onDislike: (grantId: string) => void
}) {
  const { grant, score, reason, isAiScore, breakdown } = item
  const [expanded, setExpanded] = useState(false)
  const isDismissed  = interactions.has('dismissed')
  const isLiked      = interactions.has('liked')
  const isDisliked   = interactions.has('disliked')

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

  // Funding type badge — shown on every card so users always know the category
  const fundingTypeBadge: Record<string, { Icon: React.ComponentType<{ className?: string }>; label: string; cls: string }> = {
    grant:              { Icon: Award,         label: 'Grant',             cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
    accelerator:        { Icon: Rocket,        label: 'Accelerator',       cls: 'bg-orange-50 text-orange-700 border border-orange-200' },
    support_programme:  { Icon: GraduationCap, label: 'Support Programme', cls: 'bg-indigo-50 text-indigo-700 border border-indigo-200' },
    programme:          { Icon: GraduationCap, label: 'Support Programme', cls: 'bg-indigo-50 text-indigo-700 border border-indigo-200' },
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

  // "New this week" badge — show if added within last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const isNewThisWeek = !!grant.dateAdded && grant.dateAdded >= sevenDaysAgo

  // Classify the entry so users know what they're looking at
  const entryType: 'live' | 'rolling' | 'profile' =
    grant.deadline   ? 'live' :
    grant.isRolling  ? 'rolling' :
    /* else */         'profile'

  const entryBadge = {
    live:    { Icon: CalendarDays, label: 'Open grant',  cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
    rolling: { Icon: RefreshCw,    label: 'Always open', cls: 'bg-sage/10 text-sage border border-sage/20' },
    profile: { Icon: Info,         label: 'Funder info', cls: 'bg-gray-100 text-gray-500 border border-gray-200' },
  }[entryType]

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

  return (
    <div className="bg-white p-5 shadow-warm mb-3 border border-warm/80 hover:shadow-lg transition-all">
      <div className="flex gap-4">
        {/* Left: main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-3 mb-2">
            <div className="h-10 w-10 bg-[#f5f2ed] flex items-center justify-center text-charcoal font-bold text-sm flex-shrink-0 border border-warm">
              {grant.funder[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <h3 className="font-semibold text-charcoal text-base leading-snug">{grant.title}</h3>
                {isNewThisWeek && (
                  <span className="bg-emerald-100 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0">
                    New
                  </span>
                )}
                {grant.isInviteOnly && (
                  <span className="bg-purple-50 text-purple-700 border border-purple-200 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0" title="This funder only accepts invited applications">
                    ✉ Invite Only
                  </span>
                )}
                {grant.nextOpenDate && (
                  <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0" title={`This grant is not currently open — next expected: ${grant.nextOpenDate}`}>
                    🔔 Opens {grant.nextOpenDate}
                  </span>
                )}
                {ftBadge && (
                  <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0 ${ftBadge.cls}`}>
                    <ftBadge.Icon className="w-2.5 h-2.5" />
                    {ftBadge.label}
                  </span>
                )}
                <span className={`inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 flex-shrink-0 ${entryBadge.cls}`}>
                  <entryBadge.Icon className="w-2.5 h-2.5" />
                  {entryBadge.label}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm text-mid">{grant.funder}</p>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${typeColour[grant.funderType] ?? 'bg-gray-50 text-gray-600'}`}>
                  {FUNDER_TYPES.find(t => t.id === grant.funderType)?.label ?? grant.funderType}
                </span>
                {grant.isLocal && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-50 text-green-700 inline-flex items-center gap-0.5">
                    <MapPin className="w-2.5 h-2.5" />Local
                  </span>
                )}
                {grant.source === 'scraped' && <StalenessBadge lastVerifiedAt={grant.lastVerifiedAt} />}
              </div>
            </div>
          </div>

          <p className="text-sm text-mid leading-relaxed mb-3">
            {grant.description.length > 200
              ? `${grant.description.slice(0, 200).trimEnd()}…`
              : grant.description}
          </p>

          {/* Match reason — only when a search has been performed */}
          {hasOrg && hasSearch && reason && (
            <div className="bg-coral/5 border border-coral/20 px-3.5 py-2.5 mb-3 flex items-start gap-2">
              <span className={`text-sm flex-shrink-0 ${scoreText}`}>{isAiScore ? '✦' : '●'}</span>
              <p className="text-sm text-forest leading-snug">{reason.replace(/<[^>]*>/g, '').trim()}</p>
            </div>
          )}

          {/* Sector tags — topic focus */}
          {(() => {
            const sectorTags = (grant as EnrichedGrant).impactSectors?.length
              ? (grant as EnrichedGrant).impactSectors!.slice(0, 4).map(s => {
                  const lbl = IMPACT_SECTOR_FILTERS.find(f => f.id === s)?.label ?? s
                  return <span key={s} className="tag bg-violet-50 text-violet-700 capitalize">{lbl}</span>
                })
              : grant.sectors
                  .map(s => ({ raw: s, label: sectorLabel(s) }))
                  .filter(({ label }) => label !== null)
                  .slice(0, 3)
                  .map(({ raw, label }) => (
                    <span key={raw} className="tag bg-violet-50 text-violet-700 capitalize">{label}</span>
                  ))
            if (sectorTags.length === 0) return null
            return (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider w-12 flex-shrink-0">Sector</span>
                {sectorTags}
              </div>
            )
          })()}

          {/* Eligible org types — distinct amber pills */}
          {(() => {
            const structures = (grant as EnrichedGrant).eligibleStructures
            if (!structures?.length) return null
            const chips = structures.slice(0, 5).map(s => {
              const lbl = STRUCTURE_LABELS[s] ?? s.replace(/_/g, ' ')
              return <span key={s} className="tag bg-amber-50 text-amber-700 capitalize">{lbl}</span>
            })
            const overflow = structures.length > 5 ? structures.length - 5 : 0
            return (
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider w-12 flex-shrink-0">For</span>
                {chips}
                {overflow > 0 && <span className="tag bg-amber-50 text-amber-500">+{overflow}</span>}
              </div>
            )
          })()}

          {/* Expandable eligibility */}
          {expanded && (
            <div className="mt-3 pt-3 border-t border-warm">
              <p className="text-xs font-semibold text-light uppercase tracking-wider mb-2">Eligibility criteria</p>
              <ul className="space-y-1">
                {grant.eligibilityCriteria.map(c => (
                  <li key={c} className="text-sm text-mid flex gap-2">
                    <span className="text-forest flex-shrink-0">✓</span>{c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-coral font-medium mt-2 hover:underline"
          >
            {expanded ? 'Show less ↑' : 'Eligibility ↓'}
          </button>
        </div>

        {/* Right: score + amount + deadline + actions */}
        <div className="flex flex-col items-end gap-3 min-w-[150px] flex-shrink-0">

          {hasOrg && hasSearch && <MatchBadge score={score} isAi={isAiScore} breakdown={breakdown} />}

          <div className="text-right">
            <p className="text-xl font-bold text-gold">
              {formatRange(grant.amountMin, grant.amountMax)}
            </p>
            <p className="text-xs text-light mt-0.5">
              {entryType === 'live'    ? (formatDeadline(grant.deadline) ?? grant.deadline) :
               entryType === 'rolling' ? 'No deadline' :
               /* profile */            'Typical range'}
            </p>
          </div>

          <div className="flex flex-col gap-1.5 w-full">
            {grant.source === 'scraped' && (
              <a
                href={`/dashboard/grants/${encodeURIComponent(grant.id)}`}
                className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors w-full"
              style={{ background: '#faf7f2', color: '#1f5c52', border: '1px solid #e8ddd0' }}
              >
                View details →
              </a>
            )}
            {grant.applyUrl && (
              <a
                href={grant.applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors w-full"
                style={{ background: '#1a2e2b', color: '#ffffff', border: '1px solid #1a2e2b' }}
              >
                Visit website →
              </a>
            )}
            <button
              onClick={() => onAddToPipeline(grant)}
              className="px-3 py-1.5 bg-coral text-white text-xs font-semibold w-full hover:bg-coral/90 transition-colors"
            >
              + Pipeline
            </button>
            {hasOrg && (
              <div className="pt-1 pb-0.5">
                <p className="text-[9px] text-center text-light mb-1.5 uppercase tracking-wide font-medium">Train your results</p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => onLike(grant.id)}
                    title="Good match — boosts similar grants in your results"
                    className={`transition-all ${isLiked ? 'text-forest scale-110' : 'text-light hover:text-forest'}`}
                  >
                    <ThumbsUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onDislike(grant.id)}
                    title="Not relevant — reduces similar grants in your results"
                    className={`transition-all ${isDisliked ? 'text-red-500 scale-110' : 'text-light hover:text-red-400'}`}
                  >
                    <ThumbsDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
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

  const [query, setQuery]               = useState('')
  const [activeType, setActiveType]     = useState('all')
  const [aiResults, setAiResults]       = useState<AIResult[] | null>(null)
  const [aiLoading, setAiLoading]       = useState(false)
  const [aiError, setAiError]           = useState<string | null>(null)
  const [smartMatched, setSmartMatched] = useState(false)
  const [toast, setToast]               = useState<string | null>(null)
  const [org, setOrg]                   = useState<Organisation | null>(null)
  const [userId, setUserId]             = useState('')
  const [sortBy, setSortBy]             = useState<'match' | 'amount' | 'freshest'>('match')
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
  const [activeMode, setActiveMode]               = useState<'matches' | 'search' | 'live'>('matches')

  // ── Live search (web) state ───────────────────────────────────────────────
  const [searchMode, setSearchMode]               = useState<'database' | 'live'>('database')
  const [locationFilter, setLocationFilter]       = useState('')
  const [liveSelectedSectors, setLiveSelectedSectors] = useState<string[]>([])
  const [liveResults, setLiveResults]             = useState<LiveSearchResponse | null>(null)
  const [liveLoading, setLiveLoading]             = useState(false)
  const [liveError, setLiveError]                 = useState<string | null>(null)
  const [liveSmartMatched, setLiveSmartMatched]   = useState(false)
  const [searchHistory, setSearchHistory]         = useState<SearchHistoryItem[]>([])
  const [weeklySearchCount, setWeeklySearchCount] = useState(0)
  const [isAdmin, setIsAdmin]                     = useState(false)
  const WEEKLY_LIMIT = 3
  const ADMIN_EMAIL  = 'paulkilty1@gmail.com'

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('grantSearch')
      if (saved) {
        const { query: q, aiResults: r, activeType: t, smartMatched: sm } = JSON.parse(saved)
        if (q)  setQuery(q)
        if (r)  setAiResults(r)
        if (t)  setActiveType(t)
        if (sm) setSmartMatched(sm)
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
          org,
          sectors: liveSelectedSectors,
          location: locationFilter,
          existingGrantTitles: SEED_GRANTS.map(g => ({ title: g.title, funder: g.funder })),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error ?? `Request failed (${response.status})`)
      setLiveResults(data as LiveSearchResponse)
      if (isSmartMatch) setLiveSmartMatched(true)
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
      const matchesLocationText = !locationFilter ||
        !ge.geoScope?.length ||
        ge.geoScope.some(s => s.toLowerCase().includes(locationFilter.toLowerCase()) || locationFilter.toLowerCase().includes(s.toLowerCase()))

      return matchesQuery && matchesType && matchesAmount && matchesDeadline && matchesSectors && matchesEntryType && matchesFreshness && matchesInviteOnly && matchesFundingType && matchesCategory && matchesFunderCategory && matchesGeoScope && matchesLocationText
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
    }

    return withScores
  })()

  async function runAISearch(searchQuery: string, isSmartMatch = false) {
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
        body: JSON.stringify({ query: searchQuery, grants: grantsContext, org }),
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

  async function handleAISearch() {
    if (!query.trim() && !locationFilter.trim()) return
    setHasSearched(true)
    const combined = [query.trim(), locationFilter.trim()].filter(Boolean).join(' ')
    await runAISearch(combined)
  }

  function handleSmartMatch() {
    if (!org) return
    const smartQuery = buildSmartQuery(org)
    if (!smartQuery) return
    setQuery(smartQuery)
  }

  function switchMode(mode: 'matches' | 'search' | 'live') {
    setActiveMode(mode)
    setFiltersOpen(false)
    setProfileFiltersOpen(false)
    if (mode === 'matches') {
      setSearchMode('database')
      setLiveResults(null)
      setAiResults(null)
      setQuery('')
      // Re-apply profile filters
      if (org?.primary_location) setLocationFilter(org.primary_location)
      if (org?.impact_sectors?.length) setActiveSectors(new Set(org.impact_sectors as ImpactSector[]))
      setSearchModeToggle('profile')
      setProfileChipsApplied(true)
      setHasSearched(true)
    } else if (mode === 'search') {
      setSearchMode('database')
      setLiveResults(null)
      setAiResults(null)
      setQuery('')
      // Clear all profile-applied filters for a clean slate
      setLocationFilter('')
      setActiveSectors(new Set())
      setSearchModeToggle('browse')
      setProfileChipsApplied(false)
      setHasSearched(false)
    } else {
      setSearchMode('live')
      setAiResults(null)
    }
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

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-charcoal">Find Funding</h2>
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

      {/* ── Search card ── */}
      <div className="bg-white shadow-card mb-5 border border-warm/60">

        {/* ── Mode tabs ── */}
        <div className="flex border-b border-warm">
          {([
            { id: 'matches' as const, icon: <Users size={14} strokeWidth={2} />, label: 'My Matches',    sub: 'Ranked by your profile' },
            { id: 'search'  as const, icon: <Search size={14} strokeWidth={2} />, label: 'Search',        sub: 'Fresh keyword search'   },
            { id: 'live'    as const, icon: <Globe  size={14} strokeWidth={2} />, label: 'Live Search',   sub: 'Real-time web research'  },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => switchMode(tab.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-3.5 px-2 border-b-2 transition-colors ${
                activeMode === tab.id
                  ? 'border-coral text-charcoal'
                  : 'border-transparent text-mid hover:text-charcoal hover:bg-warm/30'
              }`}
            >
              <span className={`flex items-center gap-1.5 text-sm font-semibold ${activeMode === tab.id ? 'text-coral' : ''}`}>
                {tab.icon}{tab.label}
                {tab.id === 'live' && (
                  <span className="text-[9px] font-bold px-1 py-0.5 bg-emerald-100 text-emerald-700 leading-none">NEW</span>
                )}
              </span>
              <span className="text-[11px] text-light hidden sm:block">{tab.sub}</span>
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* Live search usage counter inside tab */}
          {activeMode === 'live' && (
            <div className="mb-3 flex items-center justify-between text-xs text-mid">
              <span>Searches the live web in real time — takes 15–30 seconds</span>
              <span className={`font-semibold ${(!isAdmin && weeklySearchCount >= WEEKLY_LIMIT) ? 'text-red-500' : 'text-charcoal'}`}>
                {isAdmin ? '∞ unlimited' : weeklySearchCount >= WEEKLY_LIMIT ? '⚠ limit reached' : `${WEEKLY_LIMIT - weeklySearchCount}/${WEEKLY_LIMIT} searches left this week`}
              </span>
            </div>
          )}

          {/* My Matches context label */}
          {activeMode === 'matches' && org && (
            <div className="mb-3 flex items-center gap-2 text-xs text-mid">
              <span className="w-1.5 h-1.5 rounded-full bg-forest inline-block" />
              Ranked for <strong className="text-charcoal">{org.name ?? 'your organisation'}</strong>
              {org.primary_location && <span>· {org.primary_location}</span>}
              <a href="/dashboard/profile" className="ml-auto text-coral hover:underline font-medium">Edit profile →</a>
            </div>
          )}
          {activeMode === 'matches' && !org && (
            <div className="mb-3 text-xs border border-amber-200 bg-amber-50 px-3 py-2">
              <a href="/dashboard/profile" className="font-semibold text-amber-700 underline">Set up your profile</a>
              <span className="text-amber-800"> to see grants ranked for your organisation.</span>
            </div>
          )}

          {/* Input row */}
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-light" />
              <input
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); if (searchMode === 'database') setAiResults(null) }}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return
                  setHasSearched(true)
                  searchMode === 'live' ? runLiveSearch(query) : handleAISearch()
                }}
                className="form-input h-12 pl-11 pr-4"
                placeholder={
                  activeMode === 'live'    ? 'e.g. "youth mental health London" or "arts grants Cornwall"' :
                  activeMode === 'matches' ? 'Refine your matches — e.g. "core costs" or "capital project"' :
                                            'Search all grants — e.g. "youth sport Manchester"'
                }
              />
            </div>
            <button
              onClick={() => searchMode === 'live' ? runLiveSearch(query) : handleAISearch()}
              disabled={searchMode === 'live' ? (liveLoading || (!isAdmin && weeklySearchCount >= WEEKLY_LIMIT)) : (aiLoading || (!query.trim() && !locationFilter.trim()))}
              className={`px-5 h-12 text-white text-sm font-semibold whitespace-nowrap transition-colors disabled:opacity-50 ${
                activeMode === 'live' ? 'bg-charcoal hover:bg-charcoal/90' : 'bg-coral hover:bg-coral/90'
              }`}
            >
              {activeMode === 'live'
                ? (liveLoading ? 'Researching…' : <><Globe size={14} className="inline -mt-0.5 mr-1" />Search</>)
                : (aiLoading   ? 'Searching…'   : <><Search size={14} className="inline -mt-0.5 mr-1" />Search</>)}
            </button>
          </div>

          {/* Location row — database modes only */}
          {activeMode !== 'live' && (
            <div className="flex gap-3 mt-2">
              <div className="flex-1 relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-light" />
                <input
                  type="text"
                  value={locationFilter}
                  onChange={e => setLocationFilter(e.target.value)}
                  onKeyDown={e => {
                    if (e.key !== 'Enter') return
                    setHasSearched(true)
                    handleAISearch()
                  }}
                  className="form-input h-10 pl-11 pr-4 text-sm"
                  placeholder='Location — e.g. "London", "Manchester", "rural Wales" (optional)'
                />
              </div>
            </div>
          )}

          {aiResults && (
            <div className="mt-2.5">
              <button onClick={() => { setAiResults(null); setSmartMatched(false); setQuery('') }} className="text-xs text-light hover:text-charcoal underline">
                Clear search results
              </button>
            </div>
          )}
          {liveResults && (
            <div className="mt-2.5">
              <button onClick={() => { setLiveResults(null); setLiveSmartMatched(false); setQuery('') }} className="text-xs text-light hover:text-charcoal underline">
                Clear results
              </button>
            </div>
          )}

          {/* ── Filters (database modes) ── */}
          {activeMode !== 'live' && (
            <>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setFiltersOpen(o => !o)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border text-xs font-semibold transition-all ${
                    filtersOpen || activeFilterCount > 0
                      ? 'bg-charcoal text-white border-charcoal'
                      : 'border-warm text-mid hover:border-coral hover:text-coral bg-white'
                  }`}
                >
                  <SlidersHorizontal size={13} strokeWidth={2} />
                  {activeFilterCount > 0 ? `Filters · ${activeFilterCount} active` : 'Filters'}
                  <ChevronDown size={13} strokeWidth={2} className={`transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`} />
                </button>

              {/* Use profile filters — only shown in Search mode (in Matches mode the profile is always active) */}
              {org && activeMode === 'search' && (
                <div className="relative">
                  <button
                    onClick={() => setProfileFiltersOpen(o => !o)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 border text-xs font-semibold transition-all ${
                      profileFiltersOpen || profileChipsApplied
                        ? 'bg-forest text-white border-forest'
                        : 'border-warm text-mid hover:border-forest hover:text-forest bg-white'
                    }`}
                  >
                    <Users size={13} strokeWidth={2} />
                    Use profile filters
                    <ChevronDown size={13} strokeWidth={2} className={`transition-transform duration-200 ${profileFiltersOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {profileFiltersOpen && (
                    <div className="absolute left-0 top-full mt-1.5 z-40 bg-white border border-warm shadow-lg p-4 w-80">
                      <p className="text-xs font-semibold text-charcoal mb-3">Your profile settings</p>

                      {/* Org name + description preview */}
                      {(org.name || org.mission) && (
                        <div className="bg-[#f5f2ed] border border-warm px-3 py-2 mb-3">
                          {org.name && <p className="text-xs font-semibold text-charcoal">{org.name}</p>}
                          {org.mission && <p className="text-xs text-mid mt-0.5 line-clamp-2">{org.mission}</p>}
                        </div>
                      )}

                      <div className="space-y-2.5">
                        {org.primary_location && (
                          <div>
                            <p className="text-[10px] font-semibold text-light uppercase tracking-wider mb-1">Location</p>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-forest/10 text-forest text-xs font-medium">
                              <MapPin size={10} strokeWidth={2} />{org.primary_location}
                            </span>
                          </div>
                        )}

                        {(org.impact_sectors as string[] | undefined)?.length ? (
                          <div>
                            <p className="text-[10px] font-semibold text-light uppercase tracking-wider mb-1">Sectors</p>
                            <div className="flex flex-wrap gap-1">
                              {(org.impact_sectors as string[]).map((s: string) => (
                                <span key={s} className="px-2 py-0.5 bg-forest/10 text-forest text-xs font-medium">{s}</span>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {org.legal_structure && (
                          <div>
                            <p className="text-[10px] font-semibold text-light uppercase tracking-wider mb-1">Legal structure</p>
                            <span className="inline-flex px-2 py-0.5 bg-forest/10 text-forest text-xs font-medium">
                              {STRUCTURE_LABELS[org.legal_structure] ?? org.legal_structure}
                            </span>
                          </div>
                        )}

                        {!org.primary_location && !(org.impact_sectors as string[] | undefined)?.length && (
                          <p className="text-xs text-mid">Your profile is incomplete — <a href="/dashboard/profile" className="text-coral underline">add location and sectors</a> to use this feature.</p>
                        )}
                      </div>

                      <div className="flex gap-2 mt-4 pt-3 border-t border-warm">
                        <button
                          onClick={() => {
                            if (org.primary_location) setLocationFilter(org.primary_location)
                            if ((org.impact_sectors as string[] | undefined)?.length) {
                              setActiveSectors(new Set(org.impact_sectors as ImpactSector[]))
                            }
                            const smartQ = buildSmartQuery(org)
                            if (smartQ) setQuery(smartQ)
                            setSearchModeToggle('profile')
                            setProfileChipsApplied(true)
                            setProfileFiltersOpen(false)
                            setHasSearched(true)
                          }}
                          className="flex-1 px-3 py-1.5 bg-forest text-white text-xs font-semibold hover:opacity-90 transition-colors"
                        >
                          Apply profile filters
                        </button>
                        <button
                          onClick={() => setProfileFiltersOpen(false)}
                          className="px-3 py-1.5 border border-warm text-xs text-mid hover:text-charcoal transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
              {aiError && <p className="text-amber-600 text-xs mt-3">⚠ {aiError}</p>}
            </>
          )}

          {/* ── LIVE SEARCH MODE: sectors + limit ── */}
          {activeMode === 'live' && (
            <div className="mt-4 space-y-4">

            {/* Limit reached message */}
            {!isAdmin && weeklySearchCount >= WEEKLY_LIMIT && (
              <div className="bg-amber-50 border border-amber-200 px-4 py-3">
                <p className="text-xs font-semibold text-amber-900 mb-1">Weekly limit reached</p>
                <p className="text-xs text-amber-800">
                  You&apos;ve used your {WEEKLY_LIMIT} Live Searches for this week. Your allowance resets every Monday — or switch to our database above for instant results.
                </p>
              </div>
            )}

            {/* Sector pills */}
            <div>
              <p className="text-xs font-semibold text-mid mb-2">Sector <span className="font-normal text-light">(optional)</span></p>
              <div className="flex flex-wrap gap-1.5">
                {LIVE_SECTOR_FILTERS.map(s => (
                  <button key={s.id} onClick={() => setLiveSelectedSectors(prev =>
                    prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id]
                  )}
                    className={`px-3 py-1 border text-xs font-medium transition-all ${
                      liveSelectedSectors.includes(s.id)
                        ? 'bg-charcoal border-charcoal text-white'
                        : 'border-warm text-mid hover:border-coral hover:text-coral'
                    }`}
                  >{s.label}</button>
                ))}
              </div>
            </div>
            {/* Recent searches */}
            {searchHistory.length > 0 && !liveResults && !liveLoading && (
              <div className="pt-3 border-t border-warm">
                <p className="text-xs font-semibold text-light uppercase tracking-wider mb-2">Recent</p>
                <div className="flex flex-wrap gap-2">
                  {searchHistory.map(item => (
                    <div key={item.id} className="flex items-center gap-1 bg-[#f5f2ed] border border-warm pl-3 pr-1 py-1">
                      <button
                        onClick={() => {
                          setQuery(item.query)
                          if (item.location) setLocationFilter(item.location)
                          if (item.sectors.length) setLiveSelectedSectors(item.sectors)
                        }}
                        className="text-xs text-charcoal font-medium hover:text-coral max-w-[200px] truncate"
                      >
                        {item.query}
                        {item.result_count != null && <span className="text-light ml-1">· {item.result_count}</span>}
                      </button>
                      <button
                        onClick={async () => {
                          await deleteSearchHistory(item.id)
                          setSearchHistory(prev => prev.filter(h => h.id !== item.id))
                        }}
                        className="text-light hover:text-charcoal px-1 text-xs ml-1"
                      >✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Example searches (when no history) */}
            {searchHistory.length === 0 && !liveResults && !liveLoading && (
              <div className="pt-3 border-t border-warm">
                <p className="text-xs font-semibold text-light uppercase tracking-wider mb-2">Try an example</p>
                <div className="flex flex-wrap gap-2">
                  {LIVE_EXAMPLE_QUERIES.map(q => (
                    <button key={q} onClick={() => setQuery(q)}
                      className="px-3 py-1 bg-[#f5f2ed] border border-warm text-charcoal text-xs font-medium hover:bg-coral/10 hover:text-coral hover:border-coral transition-all"
                    >{q} →</button>
                  ))}
                </div>
              </div>
            )}
            {liveLoading && (
              <div className="bg-[#f5f2ed] border border-warm px-4 py-3 text-sm text-mid">
                Searching live funding sources, council sites and specialist funders… this takes 15–30 seconds.
              </div>
            )}
            {liveError && <p className="text-red-600 text-xs">⚠ {liveError}</p>}
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
        </div>{/* end p-5 */}
      </div>{/* end search card */}

      {/* ── Results header ── */}
      {activeMode !== 'live' && hasSearched && (
        <div className="flex justify-between items-center mb-3">
          <p className="text-sm text-mid">
            {aiResults && smartMatched ? (
              <><strong className="text-coral">✦ {displayGrants.length}</strong> grants matched for <strong className="text-charcoal">{org?.name}</strong></>
            ) : aiResults ? (
              <><strong className="text-coral">✦ {displayGrants.length}</strong> AI-ranked results for &ldquo;{query}&rdquo;</>
            ) : activeMode === 'matches' ? (
              <><strong className="text-charcoal">{displayGrants.length}</strong> grants ranked for you{query ? ` · refined by "${query}"` : ''}</>
            ) : (
              <><strong className="text-charcoal">{displayGrants.length}</strong> grants{query ? ` matching "${query}"` : ''}</>
            )}
          </p>
        </div>
      )}

      {/* ── Live Search results ── */}
      {searchMode === 'live' && liveResults && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-charcoal text-base flex items-center gap-2">
                {liveSmartMatched ? `Live results for ${org?.name}` : 'Live Research Results'}
                <span className="text-xs font-normal bg-warm text-mid px-2 py-0.5">
                  {liveResults.grants.length} found
                </span>
                {liveResults._cached && (
                  <span className="text-xs font-normal bg-warm text-mid px-2 py-0.5">cached</span>
                )}
              </h3>
              <p className="text-sm text-mid mt-1 max-w-2xl">{liveResults.summary}</p>
            </div>
          </div>
          {liveResults.grants.map((g, i) => (
            <LiveGrantCard key={i} grant={g} onAddToPipeline={handleLiveAddToPipeline} />
          ))}
          <p className="text-xs text-light mt-3">
            🌐 Live results are researched in real time. Always verify details on the funder&apos;s website before applying.
          </p>
        </div>
      )}

      {/* ── Match quality banner (database mode only) ── */}
      {searchMode === 'database' && hasSearched && matchQuality && matchQuality.score < 80 && !bannerDismissed && (
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
              Complete it so Grant Tracker can surface the grants most relevant to your work.
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

      {/* ── Instructions panel (shown before any search in Search mode) ── */}
      {activeMode === 'search' && !hasSearched && (
        <div className="bg-white border border-warm/60 p-6 shadow-card">
          <p className="text-base font-bold text-charcoal mb-5">How to find the right funding</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-9 h-9 bg-coral/10 flex items-center justify-center text-coral font-bold text-base">1</div>
              <div>
                <p className="text-sm font-semibold text-charcoal mb-1">Search by keyword</p>
                <p className="text-sm text-mid leading-relaxed">Type what you&apos;re looking for — e.g. <em>&ldquo;youth sport Manchester&rdquo;</em> or <em>&ldquo;community food project&rdquo;</em> — then hit <strong>Search</strong>. No profile data is applied here — it&apos;s a clean search across all grants.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-9 h-9 bg-coral/10 flex items-center justify-center text-coral font-bold text-base">2</div>
              <div>
                <p className="text-sm font-semibold text-charcoal mb-1">Add location</p>
                <p className="text-sm text-mid leading-relaxed">Use the location box below the search bar to narrow results geographically — e.g. <em>&ldquo;London&rdquo;</em> or <em>&ldquo;rural Wales&rdquo;</em>.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-9 h-9 bg-coral/10 flex items-center justify-center text-coral font-bold text-base">3</div>
              <div>
                <p className="text-sm font-semibold text-charcoal mb-1">Narrow with Filters</p>
                <p className="text-sm text-mid leading-relaxed">Use the <strong>Filters</strong> button to narrow by sector, funding type, grant amount and deadline.</p>
              </div>
            </div>
            <div className="flex gap-4 p-4 border-2 border-charcoal/20 bg-charcoal/[0.03]">
              <div className="flex-shrink-0 w-9 h-9 bg-charcoal flex items-center justify-center text-white">
                <Globe size={17} strokeWidth={2} />
              </div>
              <div>
                <p className="text-sm font-semibold text-charcoal mb-1">
                  Live Search
                  <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 bg-emerald-100 text-emerald-700 align-middle">FEATURED</span>
                </p>
                <p className="text-sm text-mid leading-relaxed">Switch to <strong>Live Search</strong> above to research hyper-local and newly announced grants not yet in our database — searches council sites, community foundations and specialist funders in real time. Takes 15–30 seconds.</p>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-warm flex flex-wrap gap-3">
            <button
              onClick={() => { setHasSearched(true) }}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-coral text-white text-sm font-semibold hover:opacity-90 transition-colors"
            >
              <Search size={14} strokeWidth={2} />
              Browse all grants
            </button>
            {org && (
              <button
                onClick={() => {
                  if (org.primary_location) setLocationFilter(org.primary_location)
                  if ((org.impact_sectors as string[] | undefined)?.length) {
                    setActiveSectors(new Set(org.impact_sectors as ImpactSector[]))
                  }
                  const smartQ = buildSmartQuery(org)
                  if (smartQ) setQuery(smartQ)
                  setSearchModeToggle('profile')
                  setProfileChipsApplied(true)
                  setHasSearched(true)
                }}
                className="flex items-center gap-1.5 px-4 py-2.5 border border-forest text-forest text-sm font-semibold hover:bg-forest/5 transition-colors"
              >
                <Users size={14} strokeWidth={2} />
                Apply my profile filters
              </button>
            )}
            {!org && (
              <a href="/dashboard/profile"
                className="flex items-center gap-1.5 px-4 py-2.5 border border-forest text-forest text-sm font-semibold hover:bg-forest/5 transition-colors"
              >
                Set up profile for personalised results →
              </a>
            )}
          </div>
        </div>
      )}

      {/* ── Database grant list ── */}
      {activeMode !== 'live' && hasSearched && (displayGrants.length === 0 ? (
        <div className="text-center py-16 text-light">
          <p className="text-4xl mb-3">🔍</p>
          <p className="mb-3">No grants found — try different keywords or clear the filters.</p>
          <button
            onClick={() => setSearchMode('live')}
            className="text-forest text-sm hover:underline font-medium"
          >
            Try 🌐 Live Search for live web results →
          </button>
        </div>
      ) : (
        <>
          {displayGrants.slice(0, visibleCount).map(item => (
            <GrantCard
              key={item.grant.id}
              item={item}
              hasOrg={!!org}
              hasSearch={activeMode === 'matches' || query.trim() !== '' || item.isAiScore}
              interactions={interactions.get(item.grant.id) ?? new Set()}
              onAddToPipeline={handleAddToPipeline}
              onDismiss={handleDismiss}
              onUndismiss={handleUndismiss}
              onLike={handleLike}
              onDislike={handleDislike}
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
    </div>
  )
}

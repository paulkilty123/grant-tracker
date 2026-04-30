'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, ChevronDown, Layers, DollarSign, Rocket, Building2, SlidersHorizontal, MapPin, Users, GraduationCap, TrendingUp, GitMerge, Gift, Landmark, CalendarDays, RefreshCw, Bookmark, PlusCircle, Activity, Info, Target, Star, CheckCircle2, XCircle, Lightbulb, AlertTriangle, Sparkles, ExternalLink, ClipboardList, EyeOff, Eye } from 'lucide-react'
import { SEED_GRANTS } from '@/lib/grants'
import { formatRange } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { createPipelineItem, deletePipelineItem } from '@/lib/pipeline'
import { getOrganisationByOwner } from '@/lib/organisations'
import { computeMatchScore, scoreColour } from '@/lib/matching'
import type { FeedbackSignals, MatchBreakdown } from '@/lib/matching'
import { getInteractions, recordInteraction, removeInteraction } from '@/lib/interactions'
import { getMatchFeedback, type StoredFeedback } from '@/lib/matchFeedback'
import {
  LIKE_SCORE_BOOST, DISLIKE_SCORE_PENALTY, LIKE_SECTOR_BOOST, DISLIKE_SECTOR_PENALTY,
  FB_UP_SCORE_BOOST, FB_DOWN_SCORE_PENALTY, FB_UP_SECTOR_BOOST, FB_DOWN_SECTOR_PENALTY,
} from '@/lib/matchWeights'
import { saveSearchHistory, getSearchHistory, deleteSearchHistory, getWeeklySearchCount } from '@/lib/searchHistory'
import type { GrantOpportunity, Organisation, FunderType, FundingType, ImpactSector, LegalStructure } from '@/types'
import { MatchFeedbackBlock } from '@/components/MatchFeedbackBlock'
import { usePlausible } from 'next-plausible'
import { useIsMobile } from '@/hooks/useIsMobile'
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

// 12-sector taxonomy — aligned with Profile's Impact Sectors (single source of truth)
const IMPACT_SECTOR_FILTERS: { id: ImpactSector; label: string }[] = [
  { id: 'sport',         label: 'Sport & Physical Activity' },
  { id: 'heritage',      label: 'Heritage & Culture' },
  { id: 'social_economy',label: 'Co-ops & Community Ownership' },
  { id: 'creative',      label: 'Arts & Creative Industries' },
  { id: 'community',     label: 'Community Development' },
  { id: 'education',     label: 'Education & Skills' },
  { id: 'employment',    label: 'Employment & Livelihoods' },
  { id: 'health',        label: 'Health & Wellbeing' },
  { id: 'mental_health', label: 'Mental Health' },
  { id: 'housing',       label: 'Housing & Homelessness' },
  { id: 'environment',   label: 'Environment & Climate' },
  { id: 'food',          label: 'Food & Agriculture' },
  { id: 'tech',          label: 'Tech for Good' },
  { id: 'justice',       label: 'Justice & Rights' },
]

const FUNDER_TYPES = [
  { id: 'all',               label: 'All' },
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
  { id: 'lottery',              label: '🎱 Lottery',               colour: 'bg-green-pale-1 text-green-text-deep border-green-pale-3' },
  { id: 'government',           label: '🏛️ Government',            colour: 'bg-coral-pale text-coral-deep border-coral-mid' },
  { id: 'major_trust',          label: '🏦 Major Trust',           colour: 'bg-[#F1F7E4] text-[#639922] border-[#C0DD97]' },
  { id: 'community_foundation', label: '🌱 Community Foundation',  colour: 'bg-[#F1F7E4] text-[#639922] border-[#C0DD97]' },
  { id: 'corporate',            label: '🏢 Corporate',             colour: 'bg-amber-pale text-amber-deep border-amber-mid' },
  { id: 'social_investment',    label: '💰 Social Investment',     colour: 'bg-sky-50 text-sky-700 border-sky-200' },
  { id: 'crowdfunding',         label: '🤝 Crowdfunding',          colour: 'bg-coral-pale text-coral-deep border-coral-mid' },
  { id: 'sector_body',          label: '📋 Sector Body',           colour: 'bg-amber-pale text-amber-deep border-amber-mid' },
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
            <div className="h-10 w-10 bg-[#F5F1E8] flex items-center justify-center text-charcoal font-bold text-sm flex-shrink-0 border border-warm">
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
              style={{ backgroundColor: 'rgba(23,52,4,0.06)', borderColor: 'rgba(23,52,4,0.18)' }}>
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#8ECB3C' }} strokeWidth={2} />
              <p className="text-sm leading-snug" style={{ color: '#5F5E5A' }}>{grant.notes}</p>
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
              style={{ background: '#2C2C2A', color: '#ffffff', border: '1px solid #2C2C2A' }}>
              Visit website →
            </a>
            <button onClick={() => onAddToPipeline(grant)}
              className="px-3 py-2 text-xs font-bold w-full hover:opacity-80 transition-colors rounded-full" style={{ background: '#2C2C2A', color: '#FFFFFF' }}>
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
  displayScore: number
  reason: string
  isAiScore: boolean
  breakdown?: MatchBreakdown
  eligibilityStatus?: import('@/lib/matching').EligibilityStatus
  eligibilityReason?: string | null
  positiveReasons?: string[]
  warnReasons?: string[]
}

// ── Score colour gradient ─────────────────────────────────────────────────────
// Returns a hex colour that smoothly interpolates:
//   0 → coral (#D85A30)  →  44 → gold (#BA7517)  →  70 → sage (#639922)  →  100 → forest (#173404)
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
  if (daysAgo <= 14) return <span className="text-[10px] text-amber-saturated font-medium">Verified {daysAgo}d ago</span>
  return <span className="text-[10px] text-amber-saturated font-medium">⚠ Not verified in {daysAgo}d</span>
}

// ── Grant Card ───────────────────────────────────────────────────────────────
function GrantCard({ item, hasOrg, hasSearch, interactions, org, onAddToPipeline, onRemoveFromPipeline, onDismiss, onUndismiss, onLike, onDislike, onSave, onUnsave, showIfDismissed, isInPipeline, pipelineStage }: {
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
  pipelineStage?: string
}) {
  const { grant, score, displayScore, reason, isAiScore, breakdown, eligibilityStatus, eligibilityReason, positiveReasons, warnReasons } = item
  const [descExpanded, setDescExpanded] = useState(false)
  const [insightsExpanded, setInsightsExpanded] = useState(false)
  const [whyExpanded, setWhyExpanded] = useState(false)
  const [matchExpanded, setMatchExpanded] = useState(false)
  const isMobile = useIsMobile()
  const [insightsHover, setInsightsHover] = useState(false)
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
        <button onClick={() => onUndismiss(grant.id)} className="text-xs hover:underline ml-4 flex-shrink-0" style={{ color: '#8ECB3C' }}>
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

  // Eligible structure labels — lead with the user's own structure if they
  // qualify, so the cell answers "is this for me?" at a glance.
  const eligibleRaw = ((grant as EnrichedGrant).eligibleStructures ?? []) as string[]
  const userStructure = org?.legal_structure as string | null | undefined
  const orderedEligible = (userStructure && eligibleRaw.includes(userStructure))
    ? [userStructure, ...eligibleRaw.filter(s => s !== userStructure)]
    : eligibleRaw
  const structureLabels = orderedEligible.map(s =>
    STRUCTURE_LABELS[s] ?? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  )

  // ── Sector pill colours ──
  const SECTOR_PILL: Record<string, { bg: string; color: string }> = {
    // keys match the 14-sector ImpactSector taxonomy IDs
    environment:   { bg: '#EAF3DE', color: '#27500A' },  // pale green deep
    community:     { bg: '#F1F7E4', color: '#3B6D11' },  // pale green lighter
    sport:         { bg: '#EAF3DE', color: '#27500A' },  // green
    heritage:      { bg: '#FAEEDA', color: '#854F0B' },  // amber
    social_economy:{ bg: '#E6F1FB', color: '#0C447C' },  // blue
    justice:       { bg: '#FAECE7', color: '#993C1D' },  // coral
    mental_health: { bg: '#E6F1FB', color: '#0C447C' },  // blue
    health:        { bg: '#D3E8F7', color: '#093F72' },  // blue deep
    tech:          { bg: '#E6F1FB', color: '#0C447C' },  // blue
    creative:      { bg: '#FAEEDA', color: '#854F0B' },  // amber deep
    food:          { bg: '#EAF3DE', color: '#27500A' },  // green (same as env)
    education:     { bg: '#EEEDFE', color: '#3C3489' },  // purple
    housing:       { bg: '#EEEDFE', color: '#3C3489' },  // purple
    employment:    { bg: '#EEEDFE', color: '#3C3489' },  // purple
  }

  // ── Reason strings ──
  const DIMENSION_LABELS: Record<string, string> = {
    themes: 'Sector', grantSize: 'Size', eligibility: 'Eligibility',
    location: 'Location', funderType: 'Funding type',
  }
  const getMatchedDimensions = (bd?: typeof breakdown): string[] => {
    if (!bd) return []
    return (Object.entries(bd) as [string, { score: number; max: number }][])
      .filter(([, v]) => v.max > 0 && v.score >= v.max * 0.45)
      .map(([k]) => DIMENSION_LABELS[k] ?? k.replace(/([A-Z])/g, ' ').replace(/^./, c => c.toUpperCase()))
  }
  const cleanReason = (s: string) => s.replace(/\b([a-z][a-z]*_[a-z][a-z_]*)\b/g,
    w => w.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
  const WARN_RE2 = /check|may |likely|not match|exceed|borough|restricted/i
  const rawPos = (positiveReasons && positiveReasons.length > 0)
    ? positiveReasons.map(cleanReason)
    : reason ? reason.split(/[.,](?=\s[A-Z])|\. /).map(s => cleanReason(s.trim())).filter(s => s && !WARN_RE2.test(s)) : []
  const rawWarns = (warnReasons && warnReasons.length > 0)
    ? warnReasons.map(cleanReason)
    : reason ? reason.split(/[.,](?=\s[A-Z])|\. /).map(s => cleanReason(s.trim())).filter(s => s && WARN_RE2.test(s)) : []

  // Synthesise caveats from breakdown when none come from the matching engine
  const allWarns = (() => {
    if (rawWarns.length > 0 || score >= 80 || !breakdown) return rawWarns
    const brief = (grant as EnrichedGrant).funderBrief
    // Extract first usable sentence from a funder_brief field
    const firstSentence = (text: string | null | undefined): string | null => {
      if (!text) return null
      const s = text.replace(/\s+/g, ' ').trim()
      // Split on sentence boundary
      const match = s.match(/^[^.!?]+[.!?]/)
      const sentence = match ? match[0].trim() : s
      // Reject if too long or starts awkwardly (year, "In 2025", "As of", etc.)
      if (sentence.length > 140) return null
      if (/^(In \d{4}|As of|From \d{4}|Since \d{4}|The \w+ was|We |Our )/i.test(sentence)) return null
      return sentence
    }
    // Use optional chaining on every field — guards against stale localStorage shapes
    const gaps: Array<{ gap: number; msg: string }> = [
      { gap: (breakdown.themes?.max ?? 25)        - (breakdown.themes?.score ?? 0),
        msg: (() => { const s = firstSentence(brief?.what_they_fund); return s ? 'Sector focus: ' + s : 'Sector alignment: thematic overlap with this funder priority areas is limited' })() },
      { gap: (breakdown.beneficiaries?.max ?? 15) - (breakdown.beneficiaries?.score ?? 0),
        msg: (() => { const s = firstSentence(brief?.current_priorities); return s ? 'Beneficiary focus: ' + s : 'Beneficiary group: target beneficiaries may not fully match yours' })() },
      { gap: (breakdown.location?.max ?? 25)      - (breakdown.location?.score ?? 0),
        msg: (() => { const s = firstSentence(brief?.geographic_focus); return s ? 'Geographic focus: ' + s : 'Geographic focus: limited overlap - check whether this funder covers your area' })() },
      { gap: (breakdown.eligibility?.max ?? 15)   - (breakdown.eligibility?.score ?? 0),
        msg: (() => { const s = firstSentence(brief?.who_can_apply); return s ? 'Eligibility: ' + s : 'Eligibility: some requirements may be unclear - review before applying' })() },
    ].filter(d => d.gap > 0).sort((a, b) => b.gap - a.gap)
    const limit = score < 60 ? 2 : 1
    return gaps.slice(0, limit).map(d => d.msg)
  })()

  // ── Match tier ──
  const tier       = score >= 80 ? 'Strong match' : score >= 70 ? 'Good match' : score >= 50 ? 'Partial match' : 'Weak match'
  const tierHue    = score >= 80 ? { ring: '#639922', title: '#3B6D11', panelBg: '#F4F9ED', border: '#639922', barBg: 'rgba(99,153,34,0.15)',    positive: '#639922', caveat: '#639922', caveatText: '#3B6D11' }
                   : score >= 70 ? { ring: '#5A9080', title: '#2D6B5E', panelBg: '#EFF6F4', border: '#5A9080', barBg: 'rgba(90,144,128,0.15)',   positive: '#5A9080', caveat: '#5A9080', caveatText: '#2D6B5E' }
                   : score >= 50 ? { ring: '#BA7517', title: '#7A4E10', panelBg: '#FBF7EE', border: '#BA7517', barBg: 'rgba(186,117,23,0.12)',   positive: '#BA7517', caveat: '#BA7517', caveatText: '#7A4E10' }
                   :               { ring: '#A06060', title: '#7A3030', panelBg: '#FAF1EE', border: '#A06060', barBg: 'rgba(160,96,96,0.12)',    positive: '#A06060', caveat: '#A06060', caveatText: '#7A3030' }
  const moduleTitle = score >= 80 ? 'Why this strongly matches' : score >= 70 ? 'Why this is a good match' : score >= 50 ? 'Why this partially matches' : 'Why this weakly matches'

  // ── Funder type label ──
  const FUNDER_TYPE_LBLS: Record<string, string> = {
    trust_foundation:     'Trust / Foundation',
    community_foundation: 'Community Foundation',
    corporate_foundation: 'Corporate Foundation',
    capacity_builder:     'Capacity Builder',
    local_authority:      'Local Authority',
    housing_association:  'Housing Assoc.',
    corporate:            'Corporate',
    lottery:              'Lottery',
    government:           'Government',
    competition:          'Competition',
    loan:                 'Loan',
    crowdfund_match:      'Crowd Match',
  }
  const funderTypeLbl = grant.funderType && grant.funderType != 'other'
    ? (FUNDER_TYPE_LBLS[grant.funderType] ?? grant.funderType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
    : null

  // ── Funding type pill ──
  const FUNDING_TYPE_PILL: Record<string, { label: string; bg: string; color: string }> = {
    grant:      { label: 'Grant',      bg: '#F1F7E4', color: '#3B6D11' },
    programme:  { label: 'Programme',  bg: '#FAECE7', color: '#993C1D' },
    investment: { label: 'Investment', bg: '#E6F1FB', color: '#0C447C' },
    in_kind:    { label: 'In-Kind',    bg: '#FAEEDA', color: '#854F0B' },
  }
  const ftPill = grant.fundingType ? FUNDING_TYPE_PILL[grant.fundingType] ?? null : null

  // ── Deadline display ──
  // Three-state rendering: a fixed deadline, "Opens [next round]" when the
  // grant is currently between rounds (nextOpenDate set + not rolling +
  // no deadline), or "Rolling" as the fallback when always-open.
  const deadlineDisplay = (!grant.isRolling && !grant.deadline && grant.nextOpenDate)
    ? `Opens ${grant.nextOpenDate}`
    : grant.isRolling || !grant.deadline
      ? 'Rolling'
      : (() => {
          const parts = grant.deadline!.split('-').map(Number)
          if (parts.length != 3 || parts.some(isNaN)) return 'Rolling'
          return new Date(parts[0], parts[1] - 1, parts[2])
            .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        })()

  // ── Qualify check ──
  const qualifies = hasOrg && !!org?.legal_structure && (() => {
    const eligible = grant.eligibleStructures as LegalStructure[] | undefined
    if (!eligible || eligible.length === 0) return true // no restriction = all qualify
    return eligible.includes(org!.legal_structure as LegalStructure)
  })()

  // ── Subtype label for meta Type cell ──
  const subtypeLbl = grant.fundingSubtype && SUBTYPE_LABELS[grant.fundingSubtype]
    ? SUBTYPE_LABELS[grant.fundingSubtype]
    : ftPill?.label ?? null

  // ── Insights strip aria-label ──
  const stripAriaLabel = grant.fundingType === 'investment' ? 'About this impact investor'
    : grant.fundingType === 'programme' ? 'About this programme provider'
    : grant.fundingType === 'in_kind'   ? 'About this in-kind partner'
    : 'About this funder'

  const stripTitle = grant.fundingType === 'investment' ? 'About this impact investor'
    : grant.fundingType === 'programme' ? 'About this programme provider'
    : grant.fundingType === 'in_kind'   ? 'About this in-kind partner'
    : 'About this funder'

  // ── Sector pills (up to 3 + overflow) ──
  const allSectors: string[] = (grant as EnrichedGrant).impactSectors?.length
    ? (grant as EnrichedGrant).impactSectors!.map(s => s.toLowerCase())
    : grant.sectors.map(s => s.toLowerCase())
  const visibleSectors = allSectors.slice(0, 3)
  const overflowCount  = allSectors.length - visibleSectors.length

  return (
    <div className="bg-white mb-3 overflow-hidden" style={{ borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.1)', boxShadow: '0 1px 3px rgba(23,52,4,0.04), 0 4px 12px rgba(23,52,4,0.04)', transition: 'box-shadow 0.15s ease, transform 0.15s ease' }} onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 5px rgba(23,52,4,0.05), 0 8px 20px rgba(23,52,4,0.06)'; e.currentTarget.style.transform = 'translateY(-1px)' }} onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(23,52,4,0.04), 0 4px 12px rgba(23,52,4,0.04)'; e.currentTarget.style.transform = 'translateY(0)' }}>

      {/* ── Card body ── */}
      <div style={{ padding: isMobile ? '12px 14px' : '18px 22px' }}>

        {/* ── Upper: content-col + actions-col ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>

          {/* ── Content column ── */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Pill row: sectors + funder-type + location */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {visibleSectors.map(s => {
                const raw = IMPACT_SECTOR_FILTERS.find(f => f.id === s)?.label
                  ?? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                const lbl = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
                const ps = SECTOR_PILL[s] ?? { bg: '#F5F1E8', color: '#5F5E5A' }
                return (
                  <span key={s} style={{ fontSize: 10, padding: '3px 9px', borderRadius: 9999, fontWeight: 500, whiteSpace: 'nowrap', background: ps.bg, color: ps.color, fontFamily: 'var(--font-dm-sans)' }}>
                    {lbl}
                  </span>
                )
              })}
              {overflowCount > 0 && (
                <span style={{ fontSize: 10, padding: '3px 6px', borderRadius: 9999, fontWeight: 400, color: '#8A8986', fontFamily: 'var(--font-dm-sans)' }}>+{overflowCount} more</span>
              )}
              {funderTypeLbl && (
                <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 9999, fontWeight: 500, whiteSpace: 'nowrap', background: '#F5F1E8', color: '#5F5E5A', fontFamily: 'var(--font-dm-sans)' }}>
                  {funderTypeLbl}
                </span>
              )}
              {(() => {
                const loc = grant.locationTag
                const label = !loc || loc.toLowerCase() === 'uk' || loc.toLowerCase() === 'uk-wide' ? 'UK-wide' : loc
                return (
                  <span style={{ fontSize: 10, padding: '3px 9px 3px 7px', borderRadius: 9999, fontWeight: 500, whiteSpace: 'nowrap', background: '#F1F0EA', color: '#5F5E5A', fontFamily: 'var(--font-dm-sans)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    {label}
                  </span>
                )
              })()}
              {grant.isInviteOnly && (
                <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 9999, fontWeight: 500, whiteSpace: 'nowrap', background: '#F3EDFA', color: '#6B21A8', fontFamily: 'var(--font-dm-sans)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  ✉ Invite only
                </span>
              )}
            </div>

            {/* Title + funder name (suppress funder when it duplicates the title) */}
            {(() => {
              const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
              const tn = norm(grant.title)
              const fn = norm(grant.funder)
              const showFunder = fn.length > 0 && tn.indexOf(fn) === -1 && fn.indexOf(tn) === -1
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: showFunder ? '0 0 2px' : '0 0 10px' }}>
                    <h3 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 17, fontWeight: 500, color: '#2C2C2A', margin: 0, lineHeight: 1.3 }}>{grant.title}</h3>
                    {isNewThisWeek && (
                      <div style={{ border: '2px solid #173404', color: '#173404', fontSize: 12, fontWeight: 500, padding: '5px 14px', borderRadius: 5, letterSpacing: '0.08em', textTransform: 'uppercase', transform: 'rotate(-3deg)', background: '#EAF3DE', flexShrink: 0, fontFamily: 'var(--font-space-grotesk)' }}>
                        New this week
                      </div>
                    )}
                  </div>
                  {showFunder && <div style={{ fontSize: 12, color: '#5F5E5A', fontFamily: 'var(--font-dm-sans)', marginBottom: 10 }}>{grant.funder}</div>}
                </>
              )
            })()}

            {/* Description */}
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 12, color: grant.description ? '#5F5E5A' : '#8A8986', lineHeight: 1.5, margin: '0 0 14px', fontStyle: grant.description ? 'normal' : 'italic' }}>
              {grant.description
                ? (grant.description.length > 160 && !descExpanded
                    ? <>
                        {grant.description.slice(0, 160).trimEnd()}…{''}
                        <button onClick={e => { e.stopPropagation(); setDescExpanded(true) }} style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: '#3B6D11', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Show more</button>
                      </>
                    : grant.description)
                : <>Full details on the funder&apos;s website.{''}{grant.applyUrl && <a href={grant.applyUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#3B6D11', fontWeight: 500, textDecoration: 'none' }}>Visit site ↗</a>}</>
              }
            </p>

            {/* Meta grid: Amount / Deadline / Eligible / Type */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 16, paddingTop: 12, borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
              <div>
                <div style={{ fontSize: 10, color: '#8A8986', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, fontFamily: 'var(--font-dm-sans)' }}>Amount</div>
                <div style={{ fontSize: 13, color: '#3B6D11', fontWeight: 500, fontFamily: 'var(--font-dm-sans)' }}>{formatRange(grant.amountMin, grant.amountMax) || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#8A8986', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, fontFamily: 'var(--font-dm-sans)' }}>Deadline</div>
                <div style={{ fontSize: 13, color: '#2C2C2A', fontFamily: 'var(--font-dm-sans)' }}>{deadlineDisplay}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#8A8986', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, fontFamily: 'var(--font-dm-sans)' }}>Eligible</div>
                <div style={{ fontSize: 13, color: '#2C2C2A', fontFamily: 'var(--font-dm-sans)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  <span>
                    {structureLabels.length > 0 ? structureLabels.slice(0, 2).join(', ') : '—'}
                    {structureLabels.length > 2 && (
                      <span style={{ color: '#8A8986' }}> +{structureLabels.length - 2}</span>
                    )}
                  </span>
                  {qualifies && <span style={{ color: '#639922', fontSize: 11 }}>✓</span>}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#8A8986', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, fontFamily: 'var(--font-dm-sans)' }}>Type</div>
                {subtypeLbl ? (
                  <span style={{ fontSize: 11, background: '#F1F7E4', color: '#3B6D11', padding: '2px 8px', borderRadius: 9999, fontWeight: 500, fontFamily: 'var(--font-dm-sans)', display: 'inline-block' }}>{subtypeLbl}</span>
                ) : (
                  <div style={{ fontSize: 13, color: '#2C2C2A', fontFamily: 'var(--font-dm-sans)' }}>—</div>
                )}
              </div>
            </div>

          </div>{/* end content-col */}

          {/* ── Actions column (170px) ── */}
          {(() => {
            const state: 'pipeline' | 'saved' | 'neutral' =
              isInPipeline ? 'pipeline' : isSaved ? 'saved' : 'neutral'
            const stageLabel = pipelineStage
              ? pipelineStage.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
              : 'Identified'
            return (
              <div style={{ width: isMobile ? '100%' : 170, flexShrink: 0, display: 'flex', flexDirection: isMobile ? 'row' : 'column', flexWrap: 'wrap', gap: 7, paddingTop: isMobile ? 10 : 0, borderTop: isMobile ? '0.5px solid rgba(0,0,0,0.06)' : 'none' }}>

                {/* In pipeline status pill */}
                {state === 'pipeline' && (
                  <div style={{ fontSize: 11, background: '#F1F7E4', color: '#3B6D11', padding: '5px 10px', borderRadius: 9999, fontWeight: 500, textAlign: 'center', fontFamily: 'var(--font-dm-sans)' }}>
                    ✓ In pipeline · {stageLabel}
                  </div>
                )}

                {/* Saved status pill */}
                {state === 'saved' && (
                  <div style={{ fontSize: 11, background: '#F5F1E8', color: '#5F5E5A', padding: '5px 10px', borderRadius: 9999, fontWeight: 500, textAlign: 'center', fontFamily: 'var(--font-dm-sans)' }}>
                    Saved
                  </div>
                )}

                {/* Add to pipeline (neutral + saved) */}
                {state != 'pipeline' && (
                  <button
                    onClick={() => onAddToPipeline(grant)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 10, background: '#8ECB3C', color: '#173404', border: 'none', padding: '7px 14px', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-dm-sans)', whiteSpace: 'nowrap' }}
                  >
                    + Add to pipeline
                  </button>
                )}

                {/* Save (neutral only) */}
                {state === 'neutral' && (
                  <button
                    onClick={() => onSave?.(grant.id)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 10, background: '#fff', color: '#2C2C2A', border: '0.5px solid rgba(0,0,0,0.14)', padding: '7px 14px', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-dm-sans)' }}
                  >
                    Save
                  </button>
                )}

                {/* Visit site */}
                {grant.applyUrl && (
                  <a href={grant.applyUrl} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 10, background: '#fff', color: '#2C2C2A', border: '0.5px solid rgba(0,0,0,0.14)', padding: '7px 14px', fontSize: 11, fontWeight: 500, fontFamily: 'var(--font-dm-sans)', textDecoration: 'none' }}
                  >
                    Visit site ↗
                  </a>
                )}

                {/* Unsave */}
                {state === 'saved' && (
                  <button
                    onClick={() => onUnsave?.(grant.id)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: 'transparent', border: 'none', color: '#5F5E5A', padding: '7px 14px', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-dm-sans)' }}
                  >
                    Unsave
                  </button>
                )}

                {/* Remove from pipeline */}
                {state === 'pipeline' && (
                  <button
                    onClick={() => onRemoveFromPipeline?.(grant)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: '#fff', color: '#993C1D', border: '0.5px solid rgba(0,0,0,0.14)', padding: '7px 14px', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-dm-sans)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#FAECE7' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
                  >
                    Remove from pipeline
                  </button>
                )}

              </div>
            )
          })()}

        </div>{/* end card-upper */}

        {/* ── Match module ── */}
        {hasOrg && hasSearch && reason && breakdown && (() => {
          const isExpanded = matchExpanded
          const toggleExpand = () => setMatchExpanded(e => !e)

          // Per-dimension bars from breakdown
          const DIM_ORDER = [
            { key: 'themes',        label: 'Sector',       hideAt100: false },
            { key: 'location',      label: 'Location',     hideAt100: false },
            { key: 'beneficiaries', label: 'Beneficiaries',hideAt100: false },
            { key: 'eligibility',   label: 'Eligibility',  hideAt100: false },
            { key: 'grantSize',     label: 'Size',         hideAt100: true  },
            { key: 'funderType',    label: 'Funding type', hideAt100: true  },
          ]
          const dimBars = DIM_ORDER
            .filter(d => (breakdown as any)[d.key]?.max > 0)
            .map(d => {
              const dim = (breakdown as any)[d.key]
              const pct = Math.round((dim.score / dim.max) * 100)
              return { label: d.label, pct, hideAt100: d.hideAt100 }
            })
            .filter(d => !(d.hideAt100 && d.pct >= 100))

          const barFill = (pct: number) =>
            pct >= 80 ? '#639922' : pct >= 70 ? '#8ECB3C' : pct >= 50 ? '#BA7517' : '#A06060'
          const barText = (pct: number) =>
            pct >= 80 ? '#3B6D11' : pct >= 70 ? '#3B6D11' : pct >= 50 ? '#7A4E10' : '#7A3030'

          const ChevronIcon = () => (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="2,4 6,8 10,4" />
            </svg>
          )

          return (
            <div style={{ marginTop: 14, background: tierHue.panelBg, borderRadius: 10, borderLeft: `3px solid ${tierHue.border}` }}>
              {/* Header row — identical in both states */}
              <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {/* Score + bar stack */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0, minWidth: 100 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 18, fontWeight: 500, color: tierHue.title, letterSpacing: '-0.01em' }}>{displayScore}%</span>
                    <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 10.5, color: tierHue.title, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500 }}>{displayScore >= 80 ? 'Strong match' : displayScore >= 70 ? 'Good match' : displayScore >= 50 ? 'Partial match' : 'Weak match'}</span>
                  </div>
                  <div style={{ height: 3, background: tierHue.barBg, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: tierHue.ring, borderRadius: 2, width: `${displayScore}%` }} />
                  </div>
                </div>
                {/* Chevron — rotates in place */}
                <button
                  aria-expanded={isExpanded}
                  onClick={toggleExpand}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    border: `0.5px solid ${tierHue.ring}60`,
                    background: 'transparent', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: tierHue.title,
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.25s ease',
                  }}
                >
                  <ChevronIcon />
                </button>
                {/* Spacer */}
                <div style={{ flex: 1 }} />

                {/* Feedback buttons — always in header */}
                {org?.owner_id && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: '#8A8986', fontFamily: 'var(--font-dm-sans)', whiteSpace: 'nowrap' }}>Improve your matches</span>
                    <MatchFeedbackBlock grantId={grant.id} userId={org.owner_id} matchScore={score} compact />
                  </div>
                )}
              </div>

              {/* Expanded: dimension bars */}
              {isExpanded && dimBars.length > 0 && (
                <div style={{ padding: '0 14px 14px' }}>
                  <div style={{ borderTop: `0.5px solid ${tierHue.ring}40`, paddingTop: 12 }}>
                    {dimBars.map(d => (
                      <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <div style={{ width: 100, fontSize: 12, color: '#666', fontFamily: 'var(--font-space-grotesk)', flexShrink: 0 }}>{d.label}</div>
                        <div style={{ flex: 1, height: 5, background: tierHue.barBg, borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${d.pct}%`, background: barFill(d.pct), borderRadius: 3, transition: 'width 0.4s ease' }} />
                        </div>
                        <div style={{ width: 36, fontSize: 12, color: barText(d.pct), textAlign: 'right', fontFamily: 'var(--font-space-grotesk)', fontWeight: 500, flexShrink: 0 }}>{d.pct}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })()}

      </div>{/* end card-body */}

      {/* ── Funder insights strip ── */}
      {!insightsExpanded && (!!(grant as EnrichedGrant).funderBrief || grant.eligibilityCriteria?.length > 0 || (grant as EnrichedGrant).impactSectors?.length || grant.sectors?.length) && (
        <button
          onClick={() => setInsightsExpanded(v => !v)}
          onMouseEnter={() => setInsightsHover(true)}
          onMouseLeave={() => setInsightsHover(false)}
          aria-label={stripAriaLabel}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            padding: '13px 20px 13px 17px',
            background: insightsHover ? '#F1F7E4' : '#fff',
            borderTop: '0.5px solid rgba(0,0,0,0.06)',
            borderLeft: '3px solid #8ECB3C',
            borderRight: 'none', borderBottom: 'none',
            cursor: 'pointer', textAlign: 'left',
            transition: 'background-color 160ms ease',
          }}
        >
          <svg
            style={{ color: insightsHover ? '#639922' : '#173404', flexShrink: 0, transition: 'color 160ms ease' }}
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-dm-sans)', color: '#2C2C2A' }}>
              {stripTitle}
            </div>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-dm-sans)', marginTop: 1, color: '#5F5E5A' }}>
              {(grant as EnrichedGrant).funderBrief ? 'What they fund, who qualifies, tips for applying' : 'Eligibility, who qualifies, and more'}
            </div>
          </div>
          <svg
            style={{ color: '#5F5E5A', flexShrink: 0 }}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      )}

      {/* ── Expanded details panel ── */}
      {insightsExpanded && (() => {
        const brief = (grant as EnrichedGrant).funderBrief
        const typicalAwardText = brief
          ? (brief.typical_award ?? ((grant.amountMin || grant.amountMax) ? formatRange(grant.amountMin, grant.amountMax) : null))
          : null

        const PAL = {
          green: { bg: '#F1F7E4', stroke: '#3B6D11' },
          coral: { bg: '#FAECE7', stroke: '#993C1D' },
          amber: { bg: '#FAEEDA', stroke: '#854F0B' },
        } as const

        const Section = ({ icon: Icon, pal, label, text }: {
          icon: React.ElementType
          pal: keyof typeof PAL
          label: string
          text: string
        }) => (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: PAL[pal].bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon style={{ width: 13, height: 13, color: PAL[pal].stroke }} />
              </div>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#2C2C2A', margin: 0 }}>{label}</p>
            </div>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 13, lineHeight: 1.55, color: '#5F5E5A', margin: 0 }}>{text}</p>
          </div>
        )

        return (
          <div style={{ background: '#fff', borderRadius: '0 0 14px 14px', overflow: 'hidden' }}>

            {/* fi-head — collapse link */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '12px 22px', background: '#F1F7E4', borderBottom: '0.5px dashed rgba(57,109,17,0.2)' }}>
              <button
                onClick={() => setInsightsExpanded(false)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-dm-sans)', fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#3B6D11', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <ChevronDown style={{ width: 12, height: 12, transform: 'rotate(180deg)' }} />
                Hide insights
              </button>
            </div>

            {brief ? (() => {
              const DASH = '0.5px dashed rgba(0,0,0,0.08)'
              const blocks: { Icon: React.ElementType; pal: keyof typeof PAL; label: string; text: string }[] = [
                brief.what_they_fund     ? { Icon: CheckCircle2, pal: 'green' as const, label: 'What they fund',     text: brief.what_they_fund }    : null,
                brief.who_can_apply      ? { Icon: Users,        pal: 'green' as const, label: 'Who can apply',      text: brief.who_can_apply }      : null,
                brief.geographic_focus   ? { Icon: MapPin,       pal: 'amber' as const, label: 'Geographic focus',   text: brief.geographic_focus }   : null,
                brief.priorities         ? { Icon: TrendingUp,   pal: 'coral' as const, label: 'Current priorities', text: brief.priorities }         : null,
                brief.strong_application ? { Icon: Star,         pal: 'green' as const, label: 'Strong application', text: brief.strong_application } : null,
                typicalAwardText         ? { Icon: DollarSign,   pal: 'green' as const, label: 'Typical award',      text: typicalAwardText }         : null,
                brief.decision_timeline  ? { Icon: CalendarDays, pal: 'amber' as const, label: 'Decision timeline',  text: brief.decision_timeline }  : null,
                brief.funder_tips        ? { Icon: Lightbulb,    pal: 'coral' as const, label: 'Insider tips',       text: brief.funder_tips }        : null,
              ].filter((b): b is NonNullable<typeof b> => b !== null)

              const lastRow = Math.floor((blocks.length - 1) / 2) * 2

              return (
                <>
                  {/* 2-col grid — dashed separators */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: '#fff' }}>
                    {blocks.map((b, i) => (
                      <div key={i} style={{
                        padding: '18px 22px',
                        borderBottom: i >= lastRow ? 'none' : DASH,
                        borderRight:  i % 2 === 0  ? DASH  : 'none',
                      }}>
                        <Section icon={b.Icon} pal={b.pal} label={b.label} text={b.text} />
                      </div>
                    ))}
                  </div>

                  {/* Exclusions callout — full-width amber */}
                  {brief.exclusions && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '16px 22px', background: '#FAEEDA', borderTop: '0.5px solid rgba(186,117,23,0.2)' }}>
                      <div style={{ width: 26, height: 26, borderRadius: 7, background: '#FAC775', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <AlertTriangle style={{ width: 13, height: 13, color: '#854F0B' }} />
                      </div>
                      <div>
                        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#412402', margin: '0 0 4px' }}>Exclusions</p>
                        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 13, lineHeight: 1.55, color: '#854F0B', margin: 0 }}>{brief.exclusions}</p>
                      </div>
                    </div>
                  )}

                  {/* Apply CTA bar */}
                  {grant.applyUrl && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '18px 22px', background: '#FAFAF7', borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 12, color: '#5F5E5A', margin: 0 }}>Ready to apply? Opens in a new tab.</p>
                      <a
                        href={grant.applyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 10, background: '#8ECB3C', color: '#173404', fontSize: 13, fontWeight: 600, padding: '10px 18px', border: 'none', whiteSpace: 'nowrap', textDecoration: 'none', flexShrink: 0 }}
                      >
                        Apply at {grant.funder}
                        <ExternalLink style={{ width: 12, height: 12 }} />
                      </a>
                    </div>
                  )}
                </>
              )
            })() : (
              /* fallback: eligibility data */
              <div style={{ padding: '20px 22px' }}>
                {grant.description.length > 180 && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8A8986', margin: '0 0 8px' }}>Full description</p>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 13, lineHeight: 1.55, color: '#5F5E5A', margin: 0 }}>{grant.description}</p>
                  </div>
                )}
                {grant.eligibilityCriteria?.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8A8986', margin: '0 0 10px' }}>Eligibility criteria</p>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {grant.eligibilityCriteria.map((c, i) => (
                        <li key={i} style={{ display: 'flex', gap: 10, fontFamily: 'var(--font-dm-sans)', fontSize: 13, color: '#5F5E5A' }}>
                          <CheckCircle2 style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2, color: '#639922' }} />
                          <span style={{ lineHeight: 1.45 }}>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(grant as EnrichedGrant).eligibleStructures?.length ? (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8A8986', margin: '0 0 8px' }}>Eligible organisations</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {((grant as EnrichedGrant).eligibleStructures ?? []).map(s => (
                        <span key={s} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 9999, background: 'rgba(142,203,60,0.12)', color: '#639922' }}>
                          {STRUCTURE_LABELS[s] ?? s.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 12, color: '#8A8986', margin: 0 }}>No funder intelligence yet.</p>
                  {grant.applyUrl && (
                    <a
                      href={grant.applyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 10, background: '#8ECB3C', color: '#173404', fontSize: 13, fontWeight: 600, padding: '10px 18px', textDecoration: 'none', flexShrink: 0 }}
                    >
                      Apply
                      <ExternalLink style={{ width: 12, height: 12 }} />
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
  const plausible = usePlausible()

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
  const [matchFeedbackMap, setMatchFeedbackMap] = useState<Map<string, StoredFeedback>>(new Map())
  const [showDismissed, setShowDismissed] = useState(false)
  const [scrapedGrants, setScrapedGrants] = useState<EnrichedGrant[]>([])
  const [grantsLoaded, setGrantsLoaded]   = useState(false)
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
  const [pipelinedIds, setPipelinedIds]           = useState<Map<string, { id: string; stage: string }>>(new Map())
  const [hasSearched, setHasSearched]             = useState(false)
  const [profileFiltersOpen, setProfileFiltersOpen] = useState(false)
  const [activeTab, setActiveTab]                 = useState<'grant' | 'programme' | 'investment' | 'in_kind'>('grant')
  const [programmeHasCash, setProgrammeHasCash]   = useState(false)
  const [activeView, setActiveView]               = useState<'browse' | 'saved'>('browse')
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
        if (av)  setActiveView(
          av === 'matches' || av === 'latest' ? 'browse' :
          av === 'saved' ? 'saved' : 'browse'
        )
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
        const mfb = await getMatchFeedback(user.id)
        setMatchFeedbackMap(mfb)
        // Load existing pipeline grant names to show button state
        const { data: pipelineRows } = await supabase
          .from('pipeline_items')
          .select('id, grant_name, stage')
          .eq('org_id', o.id)
        if (pipelineRows) {
          setPipelinedIds(new Map(pipelineRows.map((r: { id: string; grant_name: string; stage: string }) => [r.grant_name, { id: r.id, stage: r.stage ?? 'identified' }])))
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
      setGrantsLoaded(true)
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
    setFilterQuery(item.query.trim().toLowerCase())
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
      plausible('pipeline_added')
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
    plausible('grant_saved')
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
      plausible('pipeline_added')
      setPipelinedIds(prev => new Map(prev).set(grant.title, { id: added.id, stage: 'identified' }))
      // Automatically clear 'saved' when promoted to pipeline
      if (interactions.get(grant.id)?.has('saved')) {
        await removeInteraction(org.id, grant.id, 'saved')
        setInteractions(prev => {
          const next = new Map(prev)
          next.get(grant.id)?.delete('saved')
          return next
        })
      }
      showToast('Added to your pipeline')
    } catch {
      showToast('Failed to add — please try again')
    }
  }

  async function handleRemoveFromPipeline(grant: GrantOpportunity) {
    const entry = pipelinedIds.get(grant.title)
    const itemId = entry?.id
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

  // Sector filter now uses the fixed 14-sector taxonomy (IMPACT_SECTOR_FILTERS)
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
          return { grant, score: r.score, displayScore: r.score, reason: r.reason, isAiScore: true }
        })
        .filter((x): x is DisplayGrant => x !== null)
    }

    // ── Build feedback signals from liked/disliked grant history ──────────
    // Extract which sectors appear in liked vs disliked grants, then boost/
    // penalise future matches for those sectors proportionally.
    const feedbackSignals: FeedbackSignals = (() => {
      const boosts    = new Map<string, number>()
      const penalties = new Map<string, number>()
      // Action-bar like/dislike signals
      for (const [grantId, grantInteractions] of Array.from(interactions.entries())) {
        const g = allGrants.find(g => g.id === grantId)
        if (!g) continue
        if (grantInteractions.has('liked')) {
          for (const s of g.sectors) boosts.set(s, (boosts.get(s) ?? 0) + LIKE_SECTOR_BOOST)
        }
        if (grantInteractions.has('disliked')) {
          for (const s of g.sectors) penalties.set(s, (penalties.get(s) ?? 0) + DISLIKE_SECTOR_PENALTY)
        }
      }
      // Match-block feedback signals (weighted higher — more considered signal)
      for (const [grantId, fb] of Array.from(matchFeedbackMap.entries())) {
        const g = allGrants.find(g => g.id === grantId)
        if (!g) continue
        if (fb.direction === 'up') {
          for (const s of g.sectors) boosts.set(s, (boosts.get(s) ?? 0) + FB_UP_SECTOR_BOOST)
        } else {
          for (const s of g.sectors) penalties.set(s, (penalties.get(s) ?? 0) + FB_DOWN_SECTOR_PENALTY)
        }
      }
      return { sectorBoosts: boosts, sectorPenalties: penalties }
    })()

    const withScores: DisplayGrant[] = filtered.map(grant => {
      if (org) {
        const match = computeMatchScore(grant, org, feedbackSignals)
        const grantInteractions = interactions.get(grant.id) ?? new Set()
        const displayScore = match.score
        let score = match.score
        if (grantInteractions.has('liked'))    score = Math.min(100, score + LIKE_SCORE_BOOST)
        if (grantInteractions.has('disliked')) score = Math.max(0,   score - DISLIKE_SCORE_PENALTY)
        // Match-block feedback — higher weight, more deliberate signal
        const mfb = matchFeedbackMap.get(grant.id)
        if (mfb?.direction === 'up')   score = Math.min(100, score + FB_UP_SCORE_BOOST)
        if (mfb?.direction === 'down') score = Math.max(0,   score - FB_DOWN_SCORE_PENALTY)
        return { grant, score, displayScore, reason: match.reason, isAiScore: false, breakdown: match.breakdown, eligibilityStatus: match.eligibilityStatus, eligibilityReason: match.eligibilityReason, positiveReasons: match.positiveReasons, warnReasons: match.warnReasons }
      }
      return { grant, score: 0, displayScore: 0, reason: '', isAiScore: false }
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
        const aDate = a.grant.dateAdded ?? ''
        const bDate = b.grant.dateAdded ?? ''
        return bDate.localeCompare(aDate)
      })
    } else if (sortBy === 'deadline') {
      withScores.sort((a, b) => {
        // Rolling grants and grants without deadlines go to the bottom
        const aDeadline = (!a.grant.isRolling && a.grant.deadline) ? a.grant.deadline : '9999-12-31'
        const bDeadline = (!b.grant.isRolling && b.grant.deadline) ? b.grant.deadline : '9999-12-31'
        return aDeadline.localeCompare(bDeadline)
      })
    }

    // If the page was opened with ?grant=<id>, lift that grant to the top
    if (profileFilterOn && org?.legal_structure) {
      withScores.splice(0, withScores.length,
        ...withScores.filter(d => {
          const eligible = d.grant.eligibleStructures
          if (eligible && eligible.length > 0) {
            return eligible.includes(org.legal_structure as LegalStructure)
          }
          return true
        }))
    }
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
    setFilterQuery(q.trim().toLowerCase())
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

  const orgIsIncomplete = org && !org.primary_location && !(org.impact_sectors?.length)

  // Compute match-quality profile score + missing fields for the banner
  const matchQuality = (() => {
    if (!org) return null
    const fields: { label: string; filled: boolean; impact: 'high' | 'medium' }[] = [
      { label: 'Impact sector',    filled: (org.impact_sectors?.length     ?? 0) > 0,        impact: 'high'   },
      { label: 'Who you serve',    filled: (org.beneficiary_groups?.length  ?? 0) > 0,        impact: 'high'   },
      { label: 'Location',         filled: !!org.primary_location,                            impact: 'high'   },
      { label: 'Legal structure',  filled: !!org.legal_structure,                             impact: 'high'   },
      { label: 'Annual income',    filled: !!org.annual_income_band,                          impact: 'medium' },
      { label: 'Grant size range', filled: !!(org.min_grant_target || org.max_grant_target),  impact: 'medium' },
      { label: 'Mission statement',filled: !!org.mission,                                     impact: 'medium' },
    ]
    const filledCount = fields.filter(f => f.filled).length
    const score = Math.round((filledCount / fields.length) * 100)
    const missing = fields.filter(f => !f.filled)
    return { score, missing }
  })()

  // Count active (non-default) filters for the badge
  const activeFilterCount = [
    activeType !== 'all',
    // activeFundingType excluded — tabs are navigation, not filters
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
    // Clear search state too
    setInputValue('')
    setFilterQuery('')
    setQuery('')
    setAiResults(null)
    setSmartMatched(false)
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

  // Cross-tab counts: same filter as displayGrants but without the tab discriminator.
  // This means each tab badge reflects the live filter state — sectors, location,
  // eligibility, query — and tells the user "how many results would I see there?"
  const crossTabCounts = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    const qTokens  = filterQuery ? filterQuery.split(/\s+/).filter(t => t.length > 0) : []
    const minAmt   = amountMin ? Number(amountMin) : null
    const maxAmt   = amountMax ? Number(amountMax) : null
    const BROAD    = ['uk', 'uk-wide', 'england', 'nationwide', 'national', 'uk wide', 'all uk']
    const counts: Record<string, number> = { grant: 0, programme: 0, investment: 0, in_kind: 0 }

    allGrants.forEach(g => {
      if (!g.isRolling && g.deadline && g.deadline < todayStr) return

      const gType = (g as GrantOpportunity & { fundingType?: FundingType }).fundingType ?? 'grant'
      if (!(gType in counts)) return

      // Keyword query
      if (qTokens.length > 0) {
        const hay   = `${g.title} ${g.funder} ${g.description} ${g.sectors.join(' ')}`.toLowerCase()
        const words = toWordTokens(hay)
        if (!qTokens.every(t => tokenMatches(t, hay, words))) return
      }

      // Amount range
      if (minAmt !== null && (g.amountMax ?? 0) < minAmt) return
      if (maxAmt !== null && (g.amountMin ?? 0) > maxAmt) return

      const ge = g as EnrichedGrant

      // Sector filter
      if (activeSectors.size > 0 && ge.impactSectors?.length) {
        if (!ge.impactSectors.some(s => activeSectors.has(s))) return
      }

      // Location filter (broad scopes always pass)
      if (locationFilter && ge.geoScope?.length) {
        const loc = locationFilter.toLowerCase()
        if (!ge.geoScope.some(s =>
          BROAD.includes(s.toLowerCase()) ||
          s.toLowerCase().includes(loc) ||
          loc.includes(s.toLowerCase())
        )) return
      }

      // Legal structure eligibility (when profile on)
      if (profileFilterOn && org?.legal_structure) {
        const eligible = (g as GrantOpportunity & { eligibleStructures?: LegalStructure[] }).eligibleStructures
        if (eligible && eligible.length > 0 && !eligible.includes(org.legal_structure as LegalStructure)) return
      }

      counts[gType]++
    })

    return counts
  }, [allGrants, filterQuery, amountMin, amountMax, activeSectors, locationFilter, profileFilterOn, org])

  const TYPE_TABS = [
    { id: 'grant'      as const, label: 'Grants',      icon: <Landmark size={17} strokeWidth={2} />,  count: crossTabCounts.grant ?? 0 },
    { id: 'programme'  as const, label: 'Programmes',  icon: <Rocket size={17} strokeWidth={2} />,     count: crossTabCounts.programme ?? 0 },
    { id: 'investment' as const, label: 'Investment',  icon: <TrendingUp size={17} strokeWidth={2} />, count: crossTabCounts.investment ?? 0 },
    { id: 'in_kind'    as const, label: 'In-Kind',     icon: <Gift size={17} strokeWidth={2} />,       count: crossTabCounts.in_kind ?? 0 },
  ]

  const TAB_DESCS: Record<string, string> = {
    grant:      'Non-repayable cash from foundations, trusts, Lottery & government. Includes awards, bursaries, prizes and diversity funds.',
    programme:  'Structured support that may include cash: accelerators, fellowships, incubators, cohort programmes and capacity-building schemes.',
    investment: 'Repayable finance for social-purpose organisations — loans, patient capital, blended finance and community shares.',
    in_kind:    'Non-cash support: software credits, ad grants, free workspace, pro bono legal advice and expert services.',
  }

  const TAB_ACTIVE_STYLES: Record<string, { bg: string; border: string; text: string; count: string }> = {
    grant:      { bg: '#F1F7E4', border: '#8ECB3C', text: '#173404', count: '#639922' },
    programme:  { bg: '#FAECE7', border: '#993C1D', text: '#993C1D', count: '#993C1D' },
    investment: { bg: '#E6F1FB', border: '#0C447C', text: '#0C447C', count: '#0C447C' },
    in_kind:    { bg: '#FAEEDA', border: '#854F0B', text: '#854F0B', count: '#854F0B' },
  }

  const TAB_INACTIVE_STYLES: Record<string, { bg: string; iconColor: string; countColor: string }> = {
    grant:      { bg: '#F7F9F4', iconColor: '#639922', countColor: '#639922' },
    programme:  { bg: '#FDF6F4', iconColor: '#993C1D', countColor: '#993C1D' },
    investment: { bg: '#F4F8FD', iconColor: '#0C447C', countColor: '#0C447C' },
    in_kind:    { bg: '#FDF8F2', iconColor: '#854F0B', countColor: '#854F0B' },
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
        <div className="mb-5 p-4 flex items-start justify-between gap-4 rounded-xl" style={{ border: '1px solid rgba(142,203,60,0.3)', background: 'rgba(142,203,60,0.06)' }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#639922' }}>🎉 Profile saved — here are your matches</p>
            <p className="text-xs text-mid mt-0.5">Results are filtered to grants you&apos;re eligible for. Use &ldquo;Show all grants&rdquo; below to browse everything.</p>
          </div>
          <button onClick={() => setWelcomeDismissed(true)} className="text-mid hover:text-charcoal text-lg leading-none flex-shrink-0">×</button>
        </div>
      )}

      {/* ── Subtitle row: text left, tabs right ── */}
      <div className="flex flex-col gap-3 mb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        {/* Left: subtitle (conditional) */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-mid min-w-0">
          {activeView === 'browse' && org && (
            <>
              <span className="w-2 h-2 flex-shrink-0 rounded-full" style={{ backgroundColor: '#8ECB3C' }} />
              <span>Matched for <strong className="text-charcoal">{org.name ?? 'your organisation'}</strong>{org.primary_location && <span className="text-mid"> · {org.primary_location}</span>}</span>
            </>
          )}
          {activeView === 'browse' && !org && (
            <div className="text-xs border border-amber-mid bg-amber-pale px-3 py-2">
              <a href="/dashboard/profile" className="font-semibold text-amber-deep underline">Set up your profile</a>
              <span className="text-amber-deepest"> to see grants matched for your organisation.</span>
            </div>
          )}
        </div>
        {/* Right: tabs always visible */}
        <div className="flex items-center gap-0 bg-white border border-warm/60 shadow-sm overflow-hidden flex-shrink-0" style={{ borderRadius: 9999 }}>
          {(['browse', 'saved'] as const).map((v, i) => (
            <>
              {i > 0 && <div key={`sep-${v}`} className="w-px h-5 bg-warm/80" />}
              <button
                key={v}
                onClick={() => setActiveView(v)}
                className={`px-5 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${activeView === v ? 'border-b-2 border-[#8ECB3C] text-[#2C2C2A] font-bold' : 'border-b-2 border-transparent text-gray-500 hover:text-charcoal'}`}
              >
                {v === 'browse' ? 'Browse' : 'Saved'}
                {v === 'saved' && savedCount > 0 && (
                  <span className="text-xs px-1.5 py-0.5 ml-1 font-bold" style={{ borderRadius: 9999, background: '#F1F7E4', color: '#3B6D11' }}>{savedCount}</span>
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
          {activeView === 'browse' && (
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
                  {(inputValue || query || aiResults) && (
                    <button
                      onClick={() => { setInputValue(''); setFilterQuery(''); setQuery(''); setAiResults(null); setSmartMatched(false) }}
                      className="flex-shrink-0 p-1 rounded-full hover:bg-gray-100 transition-colors"
                      title="Clear search"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8A8986" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
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
                    filtersOpen || activeFilterCount > 0 ? 'text-[#173404] font-semibold' : 'text-gray-500 hover:text-charcoal'
                  }`}
                >
                  <SlidersHorizontal size={14} strokeWidth={2} />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="text-xs text-white px-1.5 py-0.5 rounded-full leading-none" style={{ backgroundColor: '#173404' }}>{activeFilterCount}</span>
                  )}
                  <ChevronDown size={12} strokeWidth={2} className={`transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>
              {/* Search button — outside the pill */}
              <button
                onClick={() => { setHasSearched(true); handleAISearch(inputValue) }}
                disabled={!inputValue.trim() && !locationFilter.trim()}
                className={`h-12 px-6 text-sm font-bold flex-shrink-0 transition-opacity disabled:opacity-40 flex items-center gap-2 rounded-full appearance-none ${aiLoading ? 'pointer-events-none' : ''}`}
                style={{ background: '#8ECB3C', color: '#173404', borderRadius: 10 }}
              >
                {aiLoading
                  ? <><span className="dot-bounce flex gap-0.5"><span/><span/><span/></span> Searching…</>
                  : <><Search size={14} strokeWidth={2} /> Search</>}
              </button>
            </div>
          )}

          {/* ── Secondary row: clear results + error ── */}
          {activeView === 'browse' && (aiResults || aiError) && (
            <div className="mt-2 flex items-center gap-2">
              {aiResults && (
                <button onClick={() => { setAiResults(null); setSmartMatched(false); setQuery(''); setInputValue('') }} className="px-3 py-1 border border-warm text-xs font-medium text-mid hover:border-[#8ECB3C] hover:text-[#639922] transition-all bg-white rounded-md">
                  Clear results
                </button>
              )}
              {aiError && <p className="text-amber-saturated text-xs">⚠ {aiError}</p>}
            </div>
          )}


          {/* ── Collapsible filters panel ── */}
          {filtersOpen && (
          <div className="mt-4 pt-4 border-t border-[#E8E0D1] space-y-4">

            {/* Panel header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <p className="text-sm font-bold text-charcoal">Refine your results</p>
                {activeFilterCount > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#F1F7E4', color: '#3B6D11' }}>{activeFilterCount}</span>
                )}
                <span className="text-xs text-light">Results update as you go.</span>
              </div>
              <div className="flex items-center gap-3">
                {activeFilterCount > 0 && (
                  <button onClick={resetAllFilters} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors" style={{ borderRadius: 9999, color: '#5F5E5A', background: 'transparent' }} onMouseEnter={e => { e.currentTarget.style.color = '#993C1D'; e.currentTarget.style.background = '#FAECE7' }} onMouseLeave={e => { e.currentTarget.style.color = '#5F5E5A'; e.currentTarget.style.background = 'transparent' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Reset all</button>
                )}
                <button onClick={() => setFiltersOpen(false)} className="px-3 py-1.5 text-xs font-bold rounded-md appearance-none" style={{ background: '#8ECB3C', color: '#173404' }}>Done</button>
              </div>
            </div>

            {/* Row 1: Funder type only — Funding type removed, tabs handle that */}
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
                          ? 'border-[#173404] bg-[#173404] text-[#EAF3DE]'
                          : 'border-warm text-mid hover:border-[#173404] hover:text-[#173404]'
                      }`}>
                      {t.label}
                    </button>
                  )
                })}
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
                        ? 'border-[#173404] bg-[#173404] text-white'
                        : 'border-warm text-mid hover:border-[#173404] hover:text-[#173404]'
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
                          ? 'border-[#173404] bg-[#173404] text-white'
                          : 'border-warm text-mid hover:border-[#173404] hover:text-[#173404]'
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
                    className="form-input w-full text-xs py-1.5" placeholder="Min" min={0} style={{ border: '0.5px solid rgba(0,0,0,0.14)', borderRadius: 10, background: '#fff' }} />
                  <span className="text-xs text-light">–</span>
                  <span className="text-xs text-light">£</span>
                  <input type="number" value={amountMax} onChange={e => setAmountMax(e.target.value)}
                    className="form-input w-full text-xs py-1.5" placeholder="Max" min={0} style={{ border: '0.5px solid rgba(0,0,0,0.14)', borderRadius: 10, background: '#fff' }} />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-light uppercase tracking-wider mb-2">Deadline</p>
                <div className="flex gap-1.5 flex-wrap">
                  {(['all', 'rolling', 'has_deadline'] as const).map(v => (
                    <button key={v} onClick={() => setDeadlineFilter(v)}
                      className={`px-3 py-1.5 border text-xs font-medium transition-all rounded-md ${
                        deadlineFilter === v
                          ? 'border-[#173404] bg-[#173404] text-white'
                          : 'border-warm text-mid hover:border-[#173404] hover:text-[#173404]'
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
                          ? 'border-[#173404] bg-[#173404] text-[#EAF3DE]'
                          : 'border-warm text-mid hover:border-[#173404] hover:text-[#173404]'
                      }`}>
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>

          </div>
        )}
        </div>{/* end p-5 */}
      </div>{/* end search card */}

      {/* ── Funding type tabs — horizontal: badge LEFT, label+count RIGHT ── */}
      {activeView === 'browse' && (
        <div className="flex gap-2 mb-5">
          {TYPE_TABS.map(tab => {
            const isActive = activeTab === tab.id
            // Active badge: light sage bg + dark icon (matches categorical inactive tint logic)
            const badgeBg = isActive
              ? (tab.id === 'grant' ? '#C0DD97' : tab.id === 'programme' ? '#F5C9BC' : tab.id === 'investment' ? '#B8D4EE' : '#F0D4A8')
              : (tab.id === 'grant' ? '#E4F0D4' : tab.id === 'programme' ? '#FAECE7' : tab.id === 'investment' ? '#E6F1FB' : '#FAEEDA')
            const badgeColor = isActive
              ? (tab.id === 'grant' ? '#173404' : tab.id === 'programme' ? '#6B2010' : tab.id === 'investment' ? '#073060' : '#5C3507')
              : (tab.id === 'grant' ? '#3B6D11' : tab.id === 'programme' ? '#993C1D' : tab.id === 'investment' ? '#0C447C' : '#854F0B')
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 flex flex-row items-center gap-3 px-4 py-3.5 rounded-xl transition-colors outline-none"
                style={isActive ? {
                  background: tab.id === 'grant' ? '#F1F7E4' : tab.id === 'programme' ? '#FAECE7' : tab.id === 'investment' ? '#E6F1FB' : '#FAEEDA',
                  border: `1px solid ${tab.id === 'grant' ? 'rgba(99,153,34,0.35)' : tab.id === 'programme' ? 'rgba(153,60,29,0.3)' : tab.id === 'investment' ? 'rgba(12,68,124,0.3)' : 'rgba(133,79,11,0.3)'}`,
                } : {
                  background: '#fff',
                  border: '1px solid #E8E0D1',
                }}
              >
                {/* 40×40 icon badge */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: badgeBg, color: badgeColor }}>
                  {tab.icon}
                </div>
                <div className="flex flex-col items-start gap-0.5 min-w-0">
                  <span className="text-sm font-semibold leading-tight"
                    style={{ color: isActive
                      ? (tab.id === 'grant' ? '#173404' : tab.id === 'programme' ? '#1A1A18' : tab.id === 'investment' ? '#073060' : '#5C3507')
                      : '#2C2C2A' }}>
                    {tab.label}
                  </span>
                  {tab.count > 0 && (
                    <span className="text-xs font-medium leading-none"
                      style={{ color: isActive
                        ? (tab.id === 'grant' ? '#639922' : tab.id === 'programme' ? '#993C1D' : tab.id === 'investment' ? '#0C447C' : '#854F0B')
                        : '#8A8986' }}>
                      {tab.count} {profileFilterOn
                        ? 'matches'
                        : tab.id === 'programme' ? 'programmes'
                        : tab.id === 'investment' ? 'investments'
                        : tab.id === 'in_kind' ? 'in-kind'
                        : 'grants'}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Profile-off amber nudge ── */}
      {activeView === 'browse' && org && !profileFilterOn && !aiResults && (
        <div className="mb-3 px-4 py-3.5 rounded-xl flex items-center justify-between gap-4" style={{ background: '#F1F7E4', border: '0.5px solid rgba(57,109,17,0.12)' }}>
          <div className="flex items-center gap-3 min-w-0">
            {/* Icon badge — search magnifier, green */}
            <div className="flex-shrink-0 flex items-center justify-center w-8 h-8"
              style={{ background: '#C0DD97', borderRadius: 9, color: '#173404' }}>
              <Search size={15} strokeWidth={2.5} />
            </div>
            {/* Two-line copy */}
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-snug" style={{ color: '#2C2C2A' }}>Searching the full catalogue</p>
              <p className="text-xs leading-snug mt-0.5" style={{ color: '#3B6D11' }}>Use search and filters to explore beyond your profile matches. Results aren&rsquo;t ranked by fit.</p>
            </div>
          </div>
          <button
            onClick={() => {
              setProfileFilterOn(true)
              if (org.primary_location) { setLocationFilter(org.primary_location); setLocationInput(org.primary_location) }
              if ((org.impact_sectors as string[] | undefined)?.length) setActiveSectors(new Set(org.impact_sectors as ImpactSector[]))
            }}
            className="text-sm font-semibold px-4 py-2 flex-shrink-0 rounded-full whitespace-nowrap"
            style={{ background: 'transparent', color: '#173404', border: '0.5px solid rgba(23,52,4,0.2)' }}
          >
            Filter by my profile
          </button>
        </div>
      )}

      {/* ── Results header (hidden when empty — empty-state card owns that space) ── */}
      {activeView === 'browse' && hasSearched && displayGrants.length > 0 && (
        <div className="mb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Count + match status */}
            <div className="flex items-baseline gap-2 flex-wrap">
              {(() => {
                const tabNoun = activeTab === 'programme' ? 'programmes' : activeTab === 'investment' ? 'investments' : activeTab === 'in_kind' ? 'in-kind opportunities' : 'grants'
                const allCount = activeTab === 'grant' ? allGrants_raw.filter(g => g.fundingType === 'grant' || !g.fundingType).length
                  : activeTab === 'programme' ? allGrants_raw.filter(g => g.fundingType === 'programme').length
                  : activeTab === 'investment' ? allGrants_raw.filter(g => g.fundingType === 'investment').length
                  : activeTab === 'in_kind' ? allGrants_raw.filter(g => g.fundingType === 'in_kind').length
                  : allGrants_raw.length
                if (aiResults && smartMatched) return (
                  <>
                    <strong className="text-3xl font-bold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{displayGrants.length}</strong>
                    <span className="text-base text-mid">{tabNoun}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#EAF3DE', color: '#173404' }}>✓ matched for {org?.name}</span>
                  </>
                )
                if (aiResults) return (
                  <>
                    <strong className="text-3xl font-bold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{displayGrants.length}</strong>
                    <span className="text-base text-mid">results for &ldquo;{query}&rdquo;</span>
                  </>
                )
                if (filterQuery) return (
                  <>
                    <strong className="text-3xl font-bold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{displayGrants.length}</strong>
                    <span className="text-base text-mid">{tabNoun} matching &ldquo;{filterQuery}&rdquo;</span>
                  </>
                )
                return (
                  <>
                    <strong className="text-3xl font-bold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{displayGrants.length}</strong>
                    <span className="text-base text-mid">{tabNoun}</span>
                    {profileFilterOn && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#EAF3DE', color: '#173404' }}>✓ matched</span>
                    )}
                    {!profileFilterOn && !filterQuery && !aiResults && (
                      <span className="text-sm" style={{ color: '#9A9895' }}>&middot; all UK funding &middot; unfiltered</span>
                    )}
                    {profileFilterOn && allCount > displayGrants.length && (
                      <button
                        onClick={() => { setProfileFilterOn(false); setSortBy('freshest'); setActiveSectors(new Set()); setLocationFilter(''); setLocationInput('') }}
                        className="text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
                        style={{ background: '#fff', color: '#2C2C2A', border: '1px solid #D0CCC4' }}
                      >
                        Show all {allCount} grants
                      </button>
                    )}
                  </>
                )
              })()}
            </div>
            {!aiResults && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[10px] font-semibold text-[#8A8986] uppercase tracking-wider whitespace-nowrap">
                  Sort by
                </span>
                <div className="flex items-center" style={{ background: '#F1F0EA', borderRadius: 9999, padding: 3, gap: 2 }}>
                  {([
                    { id: 'match',    label: 'Best match'   },
                    { id: 'freshest', label: 'Newest'       },
                    { id: 'deadline', label: 'Closing soon' },
                  ] as const).filter(t => profileFilterOn || t.id !== 'match').map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setSortBy(tab.id as 'match' | 'freshest' | 'deadline')}
                      className="px-3.5 py-1.5 text-xs font-medium transition-all whitespace-nowrap"
                      style={sortBy === tab.id
                        ? { background: '#fff', color: '#1A1A18', borderRadius: 9999, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
                        : { background: 'transparent', color: '#5F5E5A', borderRadius: 9999 }}
                    >{tab.label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Profile completion nudge ── */}
      {hasSearched && matchQuality && matchQuality.score < 80 && !bannerDismissed && (() => {
        // Build field list with medium-weight names
        const missingFields = matchQuality.missing.slice(0, 3)
        const extraCount    = matchQuality.missing.length - missingFields.length
        const fieldNodes    = missingFields.map((f, i) => (
          <span key={f.label}>
            {i > 0 && (i === missingFields.length - 1 && extraCount === 0 ? ' and ' : ', ')}
            <span className="font-medium" style={{ color: '#2C2C2A' }}>{f.label}</span>
          </span>
        ))
        return (
          <div className="mb-4 px-4 py-3.5 rounded-xl flex items-center justify-between gap-4" style={{ background: '#F1F7E4', border: '0.5px solid rgba(57,109,17,0.12)' }}>
            <div className="flex items-center gap-3 min-w-0">
              {/* Icon badge */}
              <div className="flex-shrink-0 flex items-center justify-center w-8 h-8"
                style={{ background: '#8ECB3C', borderRadius: 9, color: '#fff' }}>
                <span className="text-[11px] font-bold leading-none">i</span>
              </div>
              {/* Two-line copy */}
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-snug" style={{ color: '#2C2C2A' }}>
                  Your match quality is {matchQuality.score < 40 ? 'low' : matchQuality.score < 65 ? 'partial' : 'nearly there'}
                </p>
                <p className="text-xs leading-snug mt-0.5" style={{ color: '#3B6D11' }}>
                  {fieldNodes}{extraCount > 0 ? `, and ${extraCount} more` : ''}{' '}are missing from your profile.
                </p>
              </div>
            </div>
            {/* Button + dismiss */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <a
                href="/dashboard/profile"
                className="inline-flex items-center whitespace-nowrap transition-colors"
                style={{ background: 'transparent', color: '#173404', border: '0.5px solid rgba(23,52,4,0.2)', borderRadius: 9999, padding: '9px 16px', fontSize: 13, fontWeight: 500 }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = '#fff'; (e.currentTarget as HTMLAnchorElement).style.borderColor = '#173404' }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(23,52,4,0.2)' }}
              >
                Complete profile
              </a>
              <button
                onClick={() => setBannerDismissed(true)}
                className="flex-shrink-0 text-lg leading-none transition-colors appearance-none"
                style={{ color: '#639922', background: 'none', border: 'none' }}
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        )
      })()}

      {/* ── Matches view ── */}
      {activeView === 'browse' && hasSearched && grantsLoaded && (() => {
        const dismissedCount = displayGrants.filter(item => interactions.get(item.grant.id)?.has('dismissed')).length
        const visibleGrants  = showDismissed
          ? displayGrants
          : displayGrants.filter(item => !interactions.get(item.grant.id)?.has('dismissed'))
        return visibleGrants.length === 0 && dismissedCount === 0 ? (
          (() => {
            // Detection priority: B (search) → C (filters) → A (category empty)
            const emptyCardStyle: React.CSSProperties = {
              background: '#fff', borderRadius: 14, border: '0.5px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 3px rgba(23,52,4,0.04), 0 4px 12px rgba(23,52,4,0.04)', transition: 'box-shadow 0.15s ease, transform 0.15s ease',
              padding: '48px 40px', textAlign: 'center' as const,
            }
            const tabEmptyCfg: Record<string, { bg: string; color: string; icon: React.ReactNode }> = {
              grant:      { bg: '#F1F7E4', color: '#3B6D11', icon: <Landmark    size={24} strokeWidth={1.5} /> },
              programme:  { bg: '#FAECE7', color: '#993C1D', icon: <Rocket      size={24} strokeWidth={1.5} /> },
              investment: { bg: '#E6F1FB', color: '#0C447C', icon: <TrendingUp  size={24} strokeWidth={1.5} /> },
              in_kind:    { bg: '#FAEEDA', color: '#854F0B', icon: <Gift        size={24} strokeWidth={1.5} /> },
            }
            const cfg          = tabEmptyCfg[activeTab] ?? tabEmptyCfg.grant
            const tabNounP     = activeTab === 'programme' ? 'programmes' : activeTab === 'investment' ? 'investments' : activeTab === 'in_kind' ? 'in-kind opportunities' : 'grants'
            const tabNounS     = activeTab === 'programme' ? 'programme'  : activeTab === 'investment' ? 'investment'  : activeTab === 'in_kind' ? 'in-kind opportunity'   : 'grant'
            // Raw catalogue count for this tab (no profile/sector/location filters)
            const rawCatCount  = allGrants_raw.filter(g => ((g as GrantOpportunity & { fundingType?: FundingType }).fundingType ?? 'grant') === activeTab).length
            // Non-sort, non-profile active filters for variant C detection
            const nonSortFilterCount = [
              !!amountMin, !!amountMax, deadlineFilter !== 'all',
              activeSectors.size > 0, entryTypeFilter !== 'all',
              freshnessFilter !== 'all', !showInviteOnly,
              activeFunderCategory !== 'all', activeGeoScope !== 'all', !!locationFilter,
            ].filter(Boolean).length

            // ── B. Search query active ──────────────────────────────
            if (filterQuery) return (
              <div style={emptyCardStyle}>
                <div className="flex justify-center mb-5">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: '#F5F3EF', color: '#888' }}>
                    <Search size={24} strokeWidth={1.5} />
                  </div>
                </div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: '#2C2C2A' }}>
                  No results for &ldquo;{filterQuery}&rdquo;
                </h3>
                <p className="text-sm leading-relaxed mb-6 mx-auto" style={{ color: '#6B6A67', maxWidth: 380 }}>
                  We couldn&rsquo;t find any matches for that search. Try broader terms — e.g. drop specific words, or search for the funder name.
                </p>
                <button
                  onClick={() => { setInputValue(''); setFilterQuery('') }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg appearance-none"
                  style={{ background: '#fff', color: '#2C2C2A', border: '0.5px solid rgba(0,0,0,0.14)' }}
                >
                  <XCircle size={14} strokeWidth={2} /> Clear search
                </button>
              </div>
            )

            // ── C. Non-profile filters active ───────────────────────
            if (nonSortFilterCount > 0) {
              // Build human-readable filter value labels
              const filterValueLabels: string[] = []
              if (activeSectors.size > 0) {
                const sectorNames = Array.from(activeSectors)
                  .map(id => IMPACT_SECTOR_FILTERS.find(f => f.id === id)?.label ?? id)
                filterValueLabels.push(...sectorNames)
              }
              if (locationFilter) filterValueLabels.push(locationFilter)
              if (amountMin && amountMax) filterValueLabels.push(`£${Number(amountMin).toLocaleString()}–£${Number(amountMax).toLocaleString()}`)
              else if (amountMin) filterValueLabels.push(`£${Number(amountMin).toLocaleString()}+`)
              else if (amountMax) filterValueLabels.push(`up to £${Number(amountMax).toLocaleString()}`)
              if (deadlineFilter !== 'all') filterValueLabels.push('deadline filter')
              if (entryTypeFilter !== 'all') filterValueLabels.push('entry type')
              if (activeFunderCategory !== 'all') filterValueLabels.push('funder type')
              if (activeGeoScope !== 'all') filterValueLabels.push('geographic scope')
              return (
                <div style={emptyCardStyle}>
                  <div className="flex justify-center mb-5">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: '#FAEEDA', color: '#854F0B' }}>
                      <SlidersHorizontal size={24} strokeWidth={1.5} />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: '#2C2C2A' }}>
                    No {tabNounP} match your filters
                  </h3>
                  <p className="text-sm leading-relaxed mb-6 mx-auto" style={{ color: '#6B6A67', maxWidth: 400 }}>
                    {filterValueLabels.length > 0
                      ? `${filterValueLabels.join(' · ')} — try removing one, broadening the location, or adjusting the amount range.`
                      : `${nonSortFilterCount} filter${nonSortFilterCount !== 1 ? 's' : ''} active — try removing one or adjusting the amount range.`}
                  </p>
                  <div className="flex items-center justify-center gap-3 flex-wrap">
                    <button
                      onClick={resetAllFilters}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg appearance-none"
                      style={{ background: '#fff', color: '#2C2C2A', border: '0.5px solid rgba(0,0,0,0.14)', boxShadow: 'none' }}
                    >
                      Reset all filters
                    </button>
                    <button
                      onClick={() => setFiltersOpen(true)}
                      className="text-sm font-medium"
                      style={{ color: '#6B6A67' }}
                    >
                      Adjust filters
                    </button>
                  </div>
                </div>
              )
            }

            // ── A. Category empty (profile on / default) ────────────
            return (
              <div style={emptyCardStyle}>
                <div className="flex justify-center mb-5">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: cfg.bg, color: cfg.color }}>
                    {cfg.icon}
                  </div>
                </div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: '#2C2C2A' }}>
                  {profileFilterOn
                    ? `No ${tabNounP} for ${org?.name ?? 'your organisation'} yet`
                    : `No ${tabNounP} found`}
                </h3>
                <p className="text-sm leading-relaxed mb-6 mx-auto" style={{ color: '#6B6A67', maxWidth: 420 }}>
                  {profileFilterOn
                    ? `Your profile doesn’t match any ${tabNounP} right now. That’s common for organisations focused on a specific area. There ${rawCatCount === 1 ? 'is' : 'are'} ${rawCatCount} ${rawCatCount === 1 ? tabNounS : tabNounP} in the full catalogue — you can explore them, or check if your profile could be broader.`
                    : `There are no ${tabNounP} matching your current settings.`}
                </p>
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  {profileFilterOn && rawCatCount > 0 && (
                    <button
                      onClick={() => { setProfileFilterOn(false); setSortBy('freshest'); setActiveSectors(new Set()); setLocationFilter(''); setLocationInput('') }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg appearance-none"
                      style={{ background: '#fff', color: '#2C2C2A', border: '0.5px solid rgba(0,0,0,0.14)' }}
                    >
                      Show all {rawCatCount} {tabNounP}
                    </button>
                  )}
                  <a
                    href="/dashboard/profile"
                    className="inline-flex items-center px-4 py-2 text-sm font-semibold rounded-lg"
                    style={{ background: 'transparent', color: '#2C2C2A', border: '1px solid #D8D4CC' }}
                  >
                    Adjust my profile
                  </a>
                </div>
              </div>
            )
          })()
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
                pipelineStage={pipelinedIds.get(item.grant.title)?.stage}
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
          .map(g => ({ grant: g, score: 0, displayScore: 0, reason: '', isAiScore: false, breakdown: undefined }))
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
                pipelineStage={pipelinedIds.get(item.grant.title)?.stage}
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


      {toast && (
        <div className="fixed bottom-6 right-6 bg-charcoal text-white px-5 py-3.5 shadow-card-lg text-sm z-50">
          ✓ {toast}
        </div>
      )}

    </div>
  )
}

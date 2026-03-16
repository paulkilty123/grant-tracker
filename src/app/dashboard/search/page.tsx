'use client'

import { useState, useEffect } from 'react'
import { Search, ThumbsUp, ThumbsDown, ChevronDown, Layers, DollarSign, Rocket, Database, Globe, Clock, Building2, SlidersHorizontal, Sparkles, MapPin } from 'lucide-react'
import { SEED_GRANTS } from '@/lib/grants'
import { formatRange } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { createPipelineItem } from '@/lib/pipeline'
import { getOrganisationByOwner } from '@/lib/organisations'
import { computeMatchScore, scoreColour } from '@/lib/matching'
import type { FeedbackSignals, MatchBreakdown } from '@/lib/matching'
import { getInteractions, recordInteraction, removeInteraction } from '@/lib/interactions'
import { saveSearchHistory, getSearchHistory, deleteSearchHistory, getWeeklySearchCount } from '@/lib/searchHistory'
import type { GrantOpportunity, Organisation, FunderType, FundingType } from '@/types'
import type { InteractionAction } from '@/lib/interactions'
import type { SearchHistoryItem } from '@/lib/searchHistory'

// Normalise long or awkward sector names for display only
const SECTOR_DISPLAY: Record<string, string | null> = {
  'all sectors':               null,   // meaningless — hide
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

// Themed sector groups for the filter panel
const SECTOR_GROUPS: { label: string; icon: string; sectors: string[] }[] = [
  { label: 'People & Community', icon: '🤝', sectors: [
    'community', 'young people', 'older people', 'women', 'LGBTQ+',
    'disability', 'carers', 'veterans', 'families', 'loneliness',
  ]},
  { label: 'Health & Wellbeing', icon: '🏥', sectors: [
    'health', 'mental health', 'wellbeing', 'addiction', 'cancer',
    'physical activity', 'sport',
  ]},
  { label: 'Social Justice', icon: '⚖️', sectors: [
    'poverty', 'inequality', 'racial equity', 'human rights',
    'criminal justice', 'migration', 'asylum seekers',
    'domestic abuse', 'homelessness', 'equality', 'gender equality',
  ]},
  { label: 'Arts & Culture', icon: '🎭', sectors: [
    'arts', 'culture', 'heritage', 'film', 'documentary', 'screen',
    'television', 'animation', 'music', 'museums', 'libraries',
    'creative industries', 'Welsh language',
  ]},
  { label: 'Education & Employment', icon: '📚', sectors: [
    'education', 'skills', 'employment', 'leadership',
    'vocational training', 'digital skills',
  ]},
  { label: 'Environment & Climate', icon: '🌿', sectors: [
    'environment', 'climate', 'biodiversity', 'conservation',
    'energy', 'farming', 'food',
  ]},
  { label: 'Technology & Digital', icon: '💻', sectors: [
    'technology', 'digital', 'digital inclusion', 'digital preservation',
    'ai', 'open source', 'connectivity', 'online safety', 'innovation',
  ]},
  { label: 'Enterprise & Finance', icon: '💼', sectors: [
    'social enterprise', 'enterprise', 'financial inclusion',
    'economic inclusion', 'economic development', 'economic justice',
    'capacity building', 'community business', 'social change',
  ]},
  { label: 'Place & Housing', icon: '🏘️', sectors: [
    'housing', 'homelessness', 'rural', 'urban', 'regeneration', 'transport',
  ]},
  { label: 'International', icon: '🌍', sectors: [
    'international development', 'peacebuilding', 'open access',
    'disaster relief',
  ]},
  { label: 'Research & Policy', icon: '🔬', sectors: [
    'research', 'social policy', 'advocacy', 'democracy',
    'science', 'humanities', 'journalism',
  ]},
]

const FUNDER_TYPES = [
  { id: 'all',               label: 'All sources' },
  { id: 'local',             label: '📍 Local' },
  { id: 'lottery',           label: 'Lottery' },
  { id: 'trust_foundation',  label: 'Trust & Foundation' },
  { id: 'corporate',         label: 'Corporate' },
  { id: 'local_authority',   label: 'Local Authority' },
  { id: 'government',        label: 'Government' },
  { id: 'competition',       label: '🏆 Competition' },
  { id: 'loan',              label: '🔄 Social Loan' },
  { id: 'crowdfund_match',   label: '🤝 Crowdfund Match' },
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
  { id: 'uk',               label: '🇬🇧 UK-wide'           },
  { id: 'england',          label: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 England'            },
  { id: 'london',           label: '🏙️ London'             },
  { id: 'scotland',         label: '🏴󠁧󠁢󠁳󠁣󠁴󠁿 Scotland'           },
  { id: 'wales',            label: '🏴󠁧󠁢󠁷󠁬󠁳󠁿 Wales'              },
  { id: 'northern_ireland', label: '🍀 Northern Ireland'   },
  { id: 'regional',         label: '📍 Regional'           },
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
  { id: 'mental health',              label: '🧠 Mental Health' },
  { id: 'youth',                      label: '🧒 Youth' },
  { id: 'elderly',                    label: '👴 Older People' },
  { id: 'education & training',       label: '📚 Education' },
  { id: 'housing',                    label: '🏠 Housing' },
  { id: 'disability',                 label: '♿ Disability' },
  { id: 'arts & culture',             label: '🎨 Arts & Culture' },
  { id: 'sport & physical activity',  label: '⚽ Sport' },
  { id: 'environment',                label: '🌿 Environment' },
  { id: 'food poverty',               label: '🍞 Food Poverty' },
  { id: 'community',                  label: '🏘 Community' },
  { id: 'social enterprise',          label: '🌱 Social Enterprise' },
  { id: 'women & girls',              label: '♀ Women & Girls' },
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
            <p className="text-sm font-medium text-charcoal">{grant.deadline ?? 'Check website'}</p>
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
    trust_foundation:    'bg-sage/10 text-forest',
    corporate:           'bg-amber-50 text-amber-700',
    local_authority:     'bg-purple-50 text-purple-700',
    housing_association: 'bg-teal-50 text-teal-700',
    government:          'bg-red-50 text-red-700',
    competition:         'bg-yellow-50 text-yellow-700',
    loan:                'bg-sky-50 text-sky-700',
    crowdfund_match:     'bg-pink-50 text-pink-700',
  }

  const { text: scoreText } = scoreColour(score)

  // Funding type badge — shown for non-grant types so users know what's being offered
  const fundingTypeBadge: Record<string, { label: string; cls: string }> = {
    accelerator:        { label: '🚀 Accelerator',        cls: 'bg-orange-50 text-orange-700 border border-orange-200' },
    support_programme:  { label: '🎓 Support Programme',  cls: 'bg-indigo-50 text-indigo-700 border border-indigo-200' },
    programme:          { label: '🎓 Support Programme',  cls: 'bg-indigo-50 text-indigo-700 border border-indigo-200' },
    social_investment:  { label: '💷 Social Investment',   cls: 'bg-cyan-50 text-cyan-700 border border-cyan-200' },
    loan:               { label: '💷 Loan',                cls: 'bg-cyan-50 text-cyan-700 border border-cyan-200' },
    equity:             { label: '💷 Equity',              cls: 'bg-cyan-50 text-cyan-700 border border-cyan-200' },
    diversity_fund:     { label: '🌍 Diversity Fund',      cls: 'bg-violet-50 text-violet-700 border border-violet-200' },
    blended_finance:    { label: '🔗 Blended Finance',     cls: 'bg-teal-50 text-teal-700 border border-teal-200' },
    in_kind:            { label: '🎁 In-Kind Support',     cls: 'bg-rose-50 text-rose-700 border border-rose-200' },
    'in-kind':          { label: '🎁 In-Kind Support',     cls: 'bg-rose-50 text-rose-700 border border-rose-200' },
    'tax-relief':       { label: '🏛 Tax Relief',           cls: 'bg-stone-100 text-stone-700 border border-stone-300' },
  }
  const ftBadge = grant.fundingType && grant.fundingType !== 'grant'
    ? fundingTypeBadge[grant.fundingType] ?? null
    : null

  // "New this week" badge — show if added within last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const isNewThisWeek = !!grant.dateAdded && grant.dateAdded >= sevenDaysAgo

  // Classify the entry so users know what they're looking at
  const entryType: 'live' | 'rolling' | 'profile' =
    grant.deadline   ? 'live' :
    grant.isRolling  ? 'rolling' :
    /* else */         'profile'

  const entryBadge = {
    live:    { label: '📅 Open grant',   cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
    rolling: { label: '🔄 Always open',  cls: 'bg-sage/10 text-sage border border-sage/20' },
    profile: { label: 'ℹ Funder info',   cls: 'bg-gray-100 text-gray-500 border border-gray-200' },
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
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0 ${ftBadge.cls}`}>
                    {ftBadge.label}
                  </span>
                )}
                <span className={`text-xs font-medium px-2 py-0.5 flex-shrink-0 ${entryBadge.cls}`}>
                  {entryBadge.label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-sm text-mid">{grant.funder}</p>
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

          {/* Tags — condensed */}
          <div className="flex flex-wrap gap-1.5">
            {grant.isLocal && <span className="tag bg-green-50 text-green-700">📍 Local</span>}
            <span className={`tag ${typeColour[grant.funderType] ?? 'bg-gray-50 text-gray-600'}`}>
              {FUNDER_TYPES.find(t => t.id === grant.funderType)?.label ?? grant.funderType}
            </span>
            {grant.sectors
              .map(s => ({ raw: s, label: sectorLabel(s) }))
              .filter(({ label }) => label !== null)
              .slice(0, 2)
              .map(({ raw, label }) => (
                <span key={raw} className="tag bg-purple-50 text-purple-700 capitalize">{label}</span>
              ))}
          </div>

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
              {entryType === 'live'    ? grant.deadline :
               entryType === 'rolling' ? 'No deadline' :
               /* profile */            'Typical range'}
            </p>
          </div>

          <div className="flex flex-col gap-1.5 w-full">
            {grant.source === 'scraped' && (
              <a
                href={`/dashboard/grants/${encodeURIComponent(grant.id)}`}
                className="flex items-center justify-center gap-1 px-3 py-1.5 border border-warm text-xs font-medium text-mid hover:border-coral hover:text-coral transition-colors w-full"
              >
                View details →
              </a>
            )}
            {grant.applyUrl && (
              <a
                href={grant.applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 px-3 py-1.5 border border-warm text-xs font-medium text-mid hover:border-coral hover:text-coral transition-colors w-full"
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
  const [activeSectors, setActiveSectors]         = useState<Set<string>>(new Set())
  const [activeFundingType, setActiveFundingType] = useState<FundingType | 'all'>('all')
  const [categoryFilter, setCategoryFilter]       = useState<'all' | 'grants' | 'programmes'>('all')
  const [filtersOpen, setFiltersOpen]             = useState(false)
  const [entryTypeFilter, setEntryTypeFilter]     = useState<'all' | 'live' | 'funders'>('all')
  const [showInviteOnly, setShowInviteOnly]       = useState(true)
  const [expandedGroups, setExpandedGroups]       = useState<Set<string>>(new Set())
  const [activeFunderCategory, setActiveFunderCategory] = useState<string>('all')
  const [activeGeoScope, setActiveGeoScope]             = useState<string>('all')
  const [visibleCount, setVisibleCount]           = useState(30)

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
      showToast(`"${grant.title}" added to pipeline!`)
    } catch {
      showToast('Failed to add — please try again')
    }
  }

  // ── Grant pool ───────────────────────────────────────────────────────────
  // Seeds are now promoted to scraped_grants so we use the DB as single source.
  // Fall back to including SEED_GRANTS only if the DB returns very few results
  // (e.g. during initial setup before promote-all-seeds has been run).
  const allGrants = scrapedGrants.length > 50 ? scrapedGrants : [...SEED_GRANTS, ...scrapedGrants]

  // ── Available sectors (from all grants) ──────────────────────────────────
  // Filter out scraped verbatim sentences (>30 chars) and meaningless catch-alls
  const availableSectors: string[] = (() => {
    const counts = new Map<string, number>()
    allGrants.forEach(g => g.sectors.forEach(s => counts.set(s, (counts.get(s) ?? 0) + 1)))
    return Array.from(counts.entries())
      .filter(([s]) => s !== 'all sectors' && s.length <= 30)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([s]) => s)
  })()

  function toggleSector(s: string) {
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
      const matchesSectors = activeSectors.size === 0 ||
        g.sectors.some(s => activeSectors.has(s))
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
      return matchesQuery && matchesType && matchesAmount && matchesDeadline && matchesSectors && matchesEntryType && matchesFreshness && matchesInviteOnly && matchesFundingType && matchesCategory && matchesFunderCategory && matchesGeoScope
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
    if (!query.trim()) return
    await runAISearch(query)
  }

  function handleSmartMatch() {
    if (!org) return
    const smartQuery = buildSmartQuery(org)
    if (!smartQuery) return
    setQuery(smartQuery)
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
  ].filter(Boolean).length

  function resetAllFilters() {
    setActiveType('all')
    setActiveFundingType('all')
    setAmountMin('')
    setAmountMax('')
    setDeadlineFilter('all')
    setActiveSectors(new Set())
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
        <h2 className="font-serif text-2xl text-charcoal">Find Funding</h2>
        <p className="text-mid text-sm mt-1">
          {searchMode === 'live'
            ? 'AI researches the live web for hyper-local and newly announced funding not in our database'
            : categoryFilter === 'grants'
            ? `Grants, social investment, diversity funds & more — ${allGrants.length}+ opportunities matched to your structure`
            : categoryFilter === 'programmes'
            ? `Accelerators, support programmes, mentoring & pro bono — ${allGrants.length}+ opportunities`
            : `Grants, accelerators, social investment, diversity funds & more — ${allGrants.length}+ opportunities matched to your structure`
          }
        </p>
      </div>

      {/* ── Category tabs ── */}
      <div className="flex gap-0 border-b border-warm mb-5 -mx-1">
        {CATEGORY_TABS.map(tab => (
          <button
            key={tab.id}
            title={tab.desc}
            onClick={() => { setCategoryFilter(tab.id); setActiveFundingType('all') }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-all ${
              categoryFilter === tab.id
                ? 'border-coral text-coral'
                : 'border-transparent text-mid hover:text-charcoal hover:border-warm'
            }`}
          >
            <span className="flex-shrink-0">{tab.icon}</span>
            <span>{tab.label}</span>
            <span className={`px-1.5 py-0.5 text-[10px] font-semibold ${
              categoryFilter === tab.id ? 'bg-coral/10 text-coral' : 'bg-warm text-light'
            }`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* ── Search bar ── */}
      <div className="bg-white p-5 shadow-card mb-5 border border-warm/60">

        {/* ── Mode toggle ── */}
        <div className="flex items-center justify-between mb-4">
          <div className="inline-flex border border-warm bg-warm p-0.5 gap-0.5">
            {([
              { id: 'database' as const, icon: <Database size={13} strokeWidth={2} />, label: 'Our database' },
              { id: 'live'     as const, icon: <Globe    size={13} strokeWidth={2} />, label: 'Live Search'  },
            ]).map(m => (
              <button
                key={m.id}
                onClick={() => { setSearchMode(m.id); setLiveResults(null); setAiResults(null) }}
                className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold transition-all ${
                  searchMode === m.id
                    ? m.id === 'live'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-charcoal text-white shadow-sm'
                    : 'text-mid hover:text-charcoal'
                }`}
              >
                {m.icon}{m.label}
              </button>
            ))}
          </div>
          {searchMode === 'live' && (
            <p className="text-[11px] text-mid">
              {isAdmin
                ? '∞ Unlimited searches'
                : weeklySearchCount >= WEEKLY_LIMIT
                ? '⚠ Weekly limit reached'
                : `${WEEKLY_LIMIT - weeklySearchCount} of ${WEEKLY_LIMIT} searches left this week`}
            </p>
          )}
        </div>

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
                searchMode === 'live' ? runLiveSearch(query) : handleAISearch()
              }}
              className="form-input h-12 pl-11 pr-4"
              placeholder={searchMode === 'live'
                ? 'e.g. "youth mental health London" or "arts grants Cornwall"'
                : 'e.g. "youth sport funding" or "social enterprise grant Manchester"'}
            />
          </div>
          <button
            onClick={() => searchMode === 'live' ? runLiveSearch(query) : handleAISearch()}
            disabled={searchMode === 'live' ? (liveLoading || (!isAdmin && weeklySearchCount >= WEEKLY_LIMIT)) : (aiLoading || !query.trim())}
            className={`px-5 h-12 text-white text-sm font-semibold whitespace-nowrap transition-colors disabled:opacity-50 ${
              searchMode === 'live'
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-coral hover:bg-coral/90'
            }`}
          >
            {searchMode === 'live'
              ? (liveLoading ? 'Researching…' : <><Globe size={14} className="inline -mt-0.5 mr-1" />Search</>)
              : (aiLoading   ? 'Thinking…'    : <><Sparkles size={14} className="inline -mt-0.5 mr-1" />AI Match</>)}
          </button>
        </div>

        {/* Fill from profile + clear */}
        {org && (
          <div className="mt-2.5 flex items-center gap-3">
            <button
              onClick={() => searchMode === 'live'
                ? (() => {
                    if (org.primary_location) setLocationFilter(org.primary_location)
                    const smartQ = [org.themes?.slice(0,2).join(', '), org.areas_of_work?.slice(0,2).join(', ')].filter(Boolean).join(' ')
                    if (smartQ) setQuery(smartQ)
                  })()
                : handleSmartMatch()
              }
              disabled={searchMode === 'live' ? liveLoading : aiLoading}
              className="flex items-center gap-1.5 text-sm text-coral font-medium hover:underline disabled:opacity-50"
            >
              <Sparkles size={13} />Fill from my profile
            </button>
            {searchMode === 'database' && aiResults && (
              <button
                onClick={() => { setAiResults(null); setSmartMatched(false); setQuery('') }}
                className="text-xs text-light hover:text-charcoal underline"
              >
                Clear results
              </button>
            )}
            {searchMode === 'live' && liveResults && (
              <button
                onClick={() => { setLiveResults(null); setLiveSmartMatched(false); setQuery('') }}
                className="text-xs text-light hover:text-charcoal underline"
              >
                Clear results
              </button>
            )}
          </div>
        )}

        {/* ── DATABASE MODE: entry type pills + filters ── */}
        {searchMode === 'database' && (
          <>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {([
                { key: 'all',     label: 'All',           icon: null,                                    desc: 'Show everything',                                    cls: 'border-warm text-mid bg-white',    active: 'bg-coral border-coral text-white' },
                { key: 'live',    label: 'Latest Grants', icon: <Clock     size={12} strokeWidth={2} />, desc: 'Grants added to the database in the last 60 days',   cls: 'border-warm text-mid bg-white',    active: 'bg-charcoal border-charcoal text-white' },
                { key: 'funders', label: 'Funders',       icon: <Building2 size={12} strokeWidth={2} />, desc: 'Ongoing funders and rolling programmes — apply any time', cls: 'border-warm text-mid bg-white', active: 'bg-charcoal border-charcoal text-white' },
              ] as const).map(({ key, label, icon, desc, cls, active }) => (
                <button key={key} onClick={() => setEntryTypeFilter(key)} title={desc}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border text-xs font-semibold transition-all ${
                    entryTypeFilter === key ? active : `${cls} hover:border-coral hover:text-coral`
                  }`}
                >
                  {icon}{label}
                </button>
              ))}
            </div>

            {/* Filters toggle — renamed to "More filters" */}
            <button
              onClick={() => setFiltersOpen(o => !o)}
              className={`mt-3 flex items-center gap-1.5 px-3 py-1.5 border text-xs font-semibold transition-all ${
                filtersOpen || activeFilterCount > 0
                  ? 'bg-charcoal text-white border-charcoal'
                  : 'border-warm text-mid hover:border-coral hover:text-coral bg-white'
              }`}
            >
              <SlidersHorizontal size={13} strokeWidth={2} />
              {activeFilterCount > 0 ? `Filters · ${activeFilterCount} active` : 'More filters'}
              <ChevronDown size={13} strokeWidth={2} className={`transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`} />
            </button>

            {aiError && <p className="text-amber-600 text-xs mt-3">⚠ {aiError}</p>}
          </>
        )}

        {/* ── LIVE SEARCH MODE: location + sectors ── */}
        {searchMode === 'live' && (
          <div className="mt-4 space-y-4">

            {/* Explainer + usage */}
            <div className="flex items-start justify-between gap-4 bg-emerald-50 border border-emerald-200 px-4 py-3">
              <div className="flex-1">
                <p className="text-xs font-semibold text-emerald-900 mb-0.5">What is Live Search?</p>
                <p className="text-xs text-emerald-800 leading-relaxed">
                  Searches the live web in real time — council sites, community foundations and specialist funders — to find hyper-local and newly announced grants not yet in our database. Takes 15–30 seconds.
                </p>
              </div>
              {/* Usage pill */}
              {isAdmin ? (
                <div className="flex-shrink-0 flex flex-col items-center px-3 py-2 border border-emerald-200 bg-white text-center min-w-[72px]">
                  <p className="text-xl font-bold leading-none text-emerald-700">∞</p>
                  <p className="text-[10px] font-medium mt-0.5 text-emerald-600">unlimited</p>
                </div>
              ) : (
                <div className={`flex-shrink-0 flex flex-col items-center rounded-xl px-3 py-2 border text-center min-w-[72px] ${
                  weeklySearchCount >= WEEKLY_LIMIT
                    ? 'bg-red-50 border-red-200'
                    : weeklySearchCount === WEEKLY_LIMIT - 1
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-white border-emerald-200'
                }`}>
                  <p className={`text-xl font-bold leading-none ${
                    weeklySearchCount >= WEEKLY_LIMIT ? 'text-red-600'
                    : weeklySearchCount === WEEKLY_LIMIT - 1 ? 'text-amber-600'
                    : 'text-emerald-700'
                  }`}>
                    {Math.max(0, WEEKLY_LIMIT - weeklySearchCount)}
                  </p>
                  <p className={`text-[10px] font-medium mt-0.5 ${
                    weeklySearchCount >= WEEKLY_LIMIT ? 'text-red-500' : 'text-emerald-600'
                  }`}>left this week</p>
                </div>
              )}
            </div>

            {/* Limit reached message */}
            {!isAdmin && weeklySearchCount >= WEEKLY_LIMIT && (
              <div className="bg-amber-50 border border-amber-200 px-4 py-3">
                <p className="text-xs font-semibold text-amber-900 mb-1">Weekly limit reached</p>
                <p className="text-xs text-amber-800">
                  You&apos;ve used your {WEEKLY_LIMIT} Live Searches for this week. Your allowance resets every Monday — or switch to our database above for instant results.
                </p>
              </div>
            )}

            {/* Location */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 text-xs font-semibold text-mid whitespace-nowrap"><MapPin size={12} strokeWidth={2} /> Location</label>
              <input
                type="text"
                value={locationFilter}
                onChange={e => setLocationFilter(e.target.value)}
                className="form-input flex-1 text-sm"
                placeholder='e.g. "Manchester", "rural Norfolk", or leave blank for UK-wide'
              />
            </div>
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
                        className="text-xs text-forest font-medium hover:text-charcoal max-w-[200px] truncate"
                      >
                        🕐 {item.query}
                        {item.result_count != null && <span className="text-sage ml-1">· {item.result_count}</span>}
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
                <p className="text-xs text-light mb-2">✦ Try an example</p>
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
              <div className="bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
                Searching live funding sources, council sites and specialist funders… this takes 15–30 seconds.
              </div>
            )}
            {liveError && <p className="text-red-600 text-xs">⚠ {liveError}</p>}
          </div>
        )}


        {/* ── Collapsible filters panel ── */}
        {filtersOpen && (
          <div className="mt-4 pt-4 border-t border-warm space-y-5">

            {/* Funding type — grants vs accelerators vs social investment etc */}
            <div>
              <p className="text-xs font-semibold text-light uppercase tracking-wider mb-2">Funding type</p>
              <div className="flex gap-2 flex-wrap mb-1">
                {visibleFundingTypes.map(t => (
                  <button key={t.id} onClick={() => setActiveFundingType(t.id as FundingType | 'all')}
                    title={t.desc}
                    className={`px-3 py-1.5 border text-xs font-medium transition-all ${
                      activeFundingType === t.id
                        ? 'bg-charcoal border-charcoal text-white'
                        : 'border-warm text-mid hover:border-coral hover:text-coral'
                    }`}>
                    {t.emoji} {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Funder type */}
            <div>
              <p className="text-xs font-semibold text-light uppercase tracking-wider mb-2">Funder source</p>
              <div className="flex gap-2 flex-wrap">
                {FUNDER_TYPES.map(t => (
                  <button key={t.id} onClick={() => setActiveType(t.id)}
                    className={`px-3 py-1.5 border text-xs font-medium transition-all ${
                      activeType === t.id
                        ? 'bg-charcoal border-charcoal text-white'
                        : 'border-warm text-mid hover:border-coral hover:text-coral'
                    }`}>
                    {t.label}
                  </button>
                ))}
                {RECENT_GRANTS.length > 0 && (
                  <button onClick={() => setActiveType('recent')}
                    className={`px-3 py-1.5 border text-xs font-medium transition-all ${
                      activeType === 'recent'
                        ? 'bg-charcoal border-charcoal text-white'
                        : 'border-warm text-mid hover:border-coral hover:text-coral'
                    }`}>
                    Recently Added
                  </button>
                )}
                {scrapedGrants.length > 0 && (
                  <button onClick={() => setActiveType('scraped')}
                    className={`px-3 py-1.5 border text-xs font-medium transition-all ${
                      activeType === 'scraped'
                        ? 'bg-charcoal border-charcoal text-white'
                        : 'border-warm text-mid hover:border-coral hover:text-coral'
                    }`}>
                    Live Grants
                  </button>
                )}
              </div>
            </div>

            {/* Funder category (from funders table taxonomy) */}
            <div>
              <p className="text-xs font-semibold text-light uppercase tracking-wider mb-2">Funder category</p>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setActiveFunderCategory('all')}
                  className={`px-3 py-1.5 border text-xs font-medium transition-all ${
                    activeFunderCategory === 'all'
                      ? 'bg-charcoal border-charcoal text-white'
                      : 'border-warm text-mid hover:border-coral hover:text-coral'
                  }`}
                >
                  All
                </button>
                {FUNDER_CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveFunderCategory(activeFunderCategory === cat.id ? 'all' : cat.id)}
                    className={`px-3 py-1.5 border text-xs font-medium transition-all ${
                      activeFunderCategory === cat.id
                        ? 'bg-charcoal border-charcoal text-white'
                        : `${cat.colour} hover:opacity-80`
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Geographic scope (from funders table) */}
            <div>
              <p className="text-xs font-semibold text-light uppercase tracking-wider mb-2">Geographic scope</p>
              <div className="flex gap-2 flex-wrap">
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
              <p className="text-[10px] text-light mt-1.5">
                Filters by where the funder accepts applications from. Manual/seed grants without a linked funder profile are hidden when a scope is selected.
              </p>
            </div>

            {/* Amount · Deadline · Sort — 3-col grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                <div className="flex gap-2 flex-wrap">
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
              {!aiResults && (
                <div>
                  <p className="text-xs font-semibold text-light uppercase tracking-wider mb-2">Sort</p>
                  <div className="flex gap-2 flex-wrap">
                    {([
                      { v: 'match',   label: 'Best match',     show: !!org },
                      { v: 'amount',  label: 'Largest first',  show: true  },
                      { v: 'freshest',label: '🕐 Freshest',    show: true  },
                    ] as const).filter(x => x.show).map(({ v, label }) => (
                      <button key={v} onClick={() => setSortBy(v)}
                        className={`px-3 py-1.5 border text-xs font-medium transition-all ${
                          sortBy === v ? 'bg-charcoal border-charcoal text-white' : 'border-warm text-mid hover:border-sage'
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Freshness filter */}
              <div>
                <p className="text-xs font-semibold text-light uppercase tracking-wider mb-2">Verified within</p>
                <div className="flex gap-2 flex-wrap">
                  {([
                    { v: 'all', label: 'Any time' },
                    { v: '7d',  label: '7 days'   },
                    { v: '14d', label: '14 days'  },
                    { v: '30d', label: '30 days'  },
                  ] as const).map(({ v, label }) => (
                    <button key={v} onClick={() => setFreshnessFilter(v)}
                      className={`px-3 py-1.5 border text-xs font-medium transition-all ${
                        freshnessFilter === v ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-warm text-mid hover:border-sage'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Invite-only toggle */}
              <div>
                <p className="text-xs font-semibold text-light uppercase tracking-wider mb-2">Invite Only grants</p>
                <button
                  onClick={() => setShowInviteOnly(v => !v)}
                  className={`flex items-center gap-2 px-3 py-1.5 border text-xs font-medium transition-all ${
                    showInviteOnly
                      ? 'bg-purple-600 border-purple-600 text-white'
                      : 'border-warm text-mid hover:border-purple-300'
                  }`}
                >
                  <span>{showInviteOnly ? '✉ Included' : '✉ Hidden'}</span>
                </button>
                <p className="text-[10px] text-light mt-1.5">
                  {showInviteOnly
                    ? 'Showing invite-only funders — they may not accept your application'
                    : 'Invite-only funders are hidden from results'}
                </p>
              </div>

            {/* Sectors — grouped, collapsed by default */}
            {availableSectors.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-light uppercase tracking-wider mb-2">Sector</p>
                {SECTOR_GROUPS.map(group => {
                  const groupSectors = group.sectors.filter(s => availableSectors.includes(s))
                  if (groupSectors.length === 0) return null
                  const hasActive = groupSectors.some(s => activeSectors.has(s))
                  const isOpen = expandedGroups.has(group.label) || hasActive
                  return (
                    <div key={group.label} className="border border-warm overflow-hidden">
                      <button
                        onClick={() => toggleGroup(group.label)}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-warm/40 transition-colors"
                      >
                        <span className="text-xs font-medium text-charcoal flex items-center gap-1.5">
                          {group.icon} {group.label}
                          {hasActive && (
                            <span className="ml-1 bg-purple-600 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                              {groupSectors.filter(s => activeSectors.has(s)).length}
                            </span>
                          )}
                        </span>
                        <span className={`text-xs text-light transition-transform duration-150 inline-block ${isOpen ? 'rotate-180' : ''}`}>▼</span>
                      </button>
                      {isOpen && (
                        <div className="px-3 pb-3 pt-1 flex gap-1.5 flex-wrap border-t border-warm">
                          {groupSectors.map(s => (
                            <button key={s} onClick={() => toggleSector(s)}
                              className={`px-3 py-1 border text-xs font-medium capitalize transition-all ${
                                activeSectors.has(s)
                                  ? 'bg-purple-600 border-purple-600 text-white'
                                  : 'border-purple-200 text-purple-700 hover:bg-purple-50'
                              }`}>
                              {sectorLabel(s) ?? s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
                {/* Any sectors not in a group */}
                {(() => {
                  const grouped = new Set(SECTOR_GROUPS.flatMap(g => g.sectors))
                  const ungrouped = availableSectors.filter(s => !grouped.has(s))
                  if (ungrouped.length === 0) return null
                  const isOpen = expandedGroups.has('Other')
                  return (
                    <div className="border border-warm overflow-hidden">
                      <button
                        onClick={() => toggleGroup('Other')}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-warm/40 transition-colors"
                      >
                        <span className="text-xs font-medium text-charcoal">Other</span>
                        <span className={`text-xs text-light transition-transform duration-150 inline-block ${isOpen ? 'rotate-180' : ''}`}>▼</span>
                      </button>
                      {isOpen && (
                        <div className="px-3 pb-3 pt-1 flex gap-1.5 flex-wrap border-t border-warm">
                          {ungrouped.map(s => (
                            <button key={s} onClick={() => toggleSector(s)}
                              className={`px-3 py-1 border text-xs font-medium capitalize transition-all ${
                                activeSectors.has(s)
                                  ? 'bg-purple-600 border-purple-600 text-white'
                                  : 'border-purple-200 text-purple-700 hover:bg-purple-50'
                              }`}>
                              {sectorLabel(s) ?? s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

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

        {!org && (
          <div className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="text-xs font-semibold text-amber-900 mb-0.5">Unlock personalised matches</p>
            <p className="text-xs text-amber-800 mb-2">Complete your profile to get % match scores and ranked results tailored to your organisation, venture or mission.</p>
            <a href="/dashboard/profile" className="text-xs font-semibold text-amber-700 underline hover:text-amber-900">
              Set up your profile →
            </a>
          </div>
        )}
      </div>

      {/* ── Results header ── */}
      {searchMode === 'database' && (
        <div className="flex justify-between items-center mb-3">
          <p className="text-sm text-mid">
            {aiResults && smartMatched ? (
              <><strong className="text-coral">✦ {displayGrants.length}</strong> grants matched for <strong className="text-charcoal">{org?.name}</strong></>
            ) : aiResults ? (
              <><strong className="text-coral">✦ {displayGrants.length}</strong> AI-ranked results for &ldquo;{query}&rdquo;</>
            ) : (
              <>
                <strong className="text-charcoal">{displayGrants.length}</strong>{' '}
                grants{query ? ` matching "${query}"` : ''}
                {org && !aiResults && <span className="text-coral font-medium"> · sorted by match</span>}
              </>
            )}
          </p>
        </div>
      )}

      {/* ── Live Search results ── */}
      {searchMode === 'live' && liveResults && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-serif text-charcoal text-base flex items-center gap-2">
                {liveSmartMatched ? `Live results for ${org?.name}` : 'Live Research Results'}
                <span className="text-xs font-normal bg-forest/10 text-forest px-2 py-0.5">
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
      {searchMode === 'database' && matchQuality && matchQuality.score < 80 && !bannerDismissed && (
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

      {/* ── Database grant list ── */}
      {searchMode === 'database' && (displayGrants.length === 0 ? (
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
              hasSearch={query.trim() !== '' || item.isAiScore}
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
    </div>
  )
}

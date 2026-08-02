'use client'

import { useEffect, useState } from 'react'
import {
  X, MapPin, RefreshCw, Calendar, AlertTriangle, Bell,
  CheckCircle, ShieldAlert, Award, Rocket, GraduationCap,
  TrendingUp, Users, GitMerge, Gift, Landmark, ExternalLink,
  PlusCircle,
} from 'lucide-react'
import { formatRange, formatNextOpen, locationLabel } from '@/lib/utils'
import { FunderBrief, briefHasContent, leadParagraph } from '@/components/FunderBrief'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScrapedGrant {
  id: string
  external_id: string | null
  title: string
  funder: string
  funder_type: string | null
  funding_type: string | null
  description: string | null
  /** Already stripped to the public fields by /api/grant-detail. */
  funder_brief: Record<string, unknown> | null
  amount_min: number | null
  amount_max: number | null
  deadline: string | null
  is_rolling: boolean | null
  is_local: boolean | null
  location_tag: string | null
  sectors: string[] | null
  impact_sectors: string[] | null
  eligibility_criteria: string[] | null
  eligible_structures: string[] | null
  apply_url: string | null
  next_open_date: string | null
  source: string
  last_seen_at: string | null
  is_active: boolean | null
}

// ── Label maps ────────────────────────────────────────────────────────────────

const FUNDER_LABELS: Record<string, string> = {
  trust_foundation:    'Trust & Foundation',
  community_foundation:'Community Foundation',
  corporate_foundation:'Corporate Foundation',
  capacity_builder:    'Capacity Builder',
  local_authority:     'Local Authority',
  housing_association: 'Housing Association',
  corporate:           'Corporate',
  lottery:             'Lottery',
  government:          'Government',
  foundation:          'Foundation',
  other:               'Other',
}

interface FTBadge {
  Icon: React.ComponentType<{ className?: string }>
  label: string
  bg: string
  color: string
}

const FUNDING_TYPE_BADGES: Record<string, FTBadge> = {
  grant:             { Icon: Award,         label: 'Grant',                   bg: 'rgba(132,204,22,0.12)',  color: '#639922' },
  accelerator:       { Icon: Rocket,        label: 'Incubator / Accelerator', bg: 'rgba(255,112,67,0.12)', color: '#993C1D' },
  support_programme: { Icon: GraduationCap, label: 'Fellowship / Support',    bg: 'rgba(139,92,246,0.12)', color: '#6D28D9' },
  programme:         { Icon: GraduationCap, label: 'Support Programme',       bg: 'rgba(139,92,246,0.12)', color: '#6D28D9' },
  social_investment: { Icon: TrendingUp,    label: 'Social Investment',       bg: 'rgba(255,112,67,0.12)', color: '#993C1D' },
  loan:              { Icon: TrendingUp,    label: 'Loan',                    bg: 'rgba(255,183,77,0.20)', color: '#A06000' },
  equity:            { Icon: TrendingUp,    label: 'Equity',                  bg: 'rgba(255,183,77,0.20)', color: '#A06000' },
  diversity_fund:    { Icon: Users,         label: 'Diversity Fund',          bg: 'rgba(236,72,153,0.12)', color: '#9D174D' },
  blended_finance:   { Icon: GitMerge,      label: 'Blended Finance',         bg: 'rgba(132,204,22,0.12)', color: '#639922' },
  in_kind:           { Icon: Gift,          label: 'In-Kind & Pro Bono',      bg: 'rgba(99,102,241,0.12)', color: '#378ADD' },
  'in-kind':         { Icon: Gift,          label: 'In-Kind & Pro Bono',      bg: 'rgba(99,102,241,0.12)', color: '#378ADD' },
  'tax-relief':      { Icon: Landmark,      label: 'Tax Relief',              bg: 'rgba(110,110,128,0.10)',color: '#5F5E5A' },
}

const STRUCTURE_LABELS: Record<string, string> = {
  cic:                    'CIC',
  cic_guarantee:          'CIC (Ltd by Guarantee)',
  cic_shares:             'CIC (Ltd by Shares)',
  cio:                    'CIO',
  registered_charity:     'Registered Charity',
  charity:                'Charity',
  charitable_incorporated_organisation: 'CIO',
  community_interest_company: 'CIC',
  ltd_guarantee:          'Ltd by Guarantee',
  company_ltd_guarantee:  'Company Ltd by Guarantee',
  ltd_shares:             'Ltd by Shares',
  ltd_company:            'Ltd Company',
  llp:                    'LLP',
  cooperative:            'Co-operative / CBS',
  coop:                   'Co-operative',
  community_benefit_society: 'Comm. Benefit Society',
  unincorporated:         'Unincorporated Association',
  voluntary_organisation: 'Voluntary Org',
  sole_trader:            'Sole Trader / Individual',
  individual:             'Individual',
  not_registered:         'Pre-registration',
  partnership:            'Partnership',
  public_sector:          'Public Sector',
  school:                 'School',
  university:             'University',
  housing_association:    'Housing Association',
}

const IMPACT_SECTOR_LABELS: Record<string, string> = {
  creative:      'Arts & Culture',
  environment:   'Environment',
  health:        'Health',
  mental_health: 'Mental Health',
  education:     'Education',
  tech:          'Technology',
  housing:       'Housing',
  food:          'Food',
  employment:    'Employment',
  community:     'Community',
  justice:       'Justice & Equality',
  financial:     'Financial Inclusion',
  international: 'International',
  young_people:  'Young People',
  women:         'Women & Girls',
  disability:    'Disability',
  older_people:  'Older People',
  heritage:      'Heritage',
  sport:         'Sport & Physical Activity',
}

function sourceLabel(source: string): string {
  if (source.startsWith('gov_uk'))         return 'GOV.UK Find a Grant'
  if (source === 'tnlcf')                  return 'National Lottery Community Fund'
  if (source === 'ukri')                   return 'UKRI'
  if (source === 'gla')                    return 'Greater London Authority'
  if (source === 'arts_council')           return 'Arts Council England'
  if (source === 'sport_england')          return 'Sport England'
  if (source === 'heritage_fund')          return 'National Heritage Fund'
  if (source === 'bbc_cin')                return 'BBC Children in Need'
  if (source === 'paul_hamlyn_foundation') return 'Paul Hamlyn Foundation'
  if (source === 'esmee_fairbairn')        return 'Esmée Fairbairn Foundation'
  if (source === 'henry_smith')            return 'Henry Smith Foundation'
  return source.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  grantId: string | null
  onClose: () => void
  onAddToPipeline?: (grant: ScrapedGrant) => void
}

export default function GrantDetailModal({ grantId, onClose, onAddToPipeline }: Props) {
  const [grant, setGrant]             = useState<ScrapedGrant | null>(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [pipelineMsg, setPipelineMsg] = useState<string | null>(null)

  const isOpen = !!grantId

  useEffect(() => {
    if (!grantId) { setGrant(null); return }
    setLoading(true)
    setError(null)
    setGrant(null)
    fetch(`/api/grant-detail/${encodeURIComponent(grantId)}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: ScrapedGrant) => setGrant(data))
      .catch(() => setError('Could not load grant details.'))
      .finally(() => setLoading(false))
  }, [grantId])

  useEffect(() => {
    if (!grantId) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [grantId, onClose])

  const handleAddToPipeline = () => {
    if (!grant || !onAddToPipeline) return
    onAddToPipeline(grant)
    setPipelineMsg('Added!')
    setTimeout(() => setPipelineMsg(null), 2500)
  }

  const funderType    = grant?.funder_type ?? 'other'
  const typeLabel     = FUNDER_LABELS[funderType] ?? funderType.replace(/_/g, ' ')
  const rawFunding    = grant?.funding_type ?? 'grant'
  const ftBadge       = FUNDING_TYPE_BADGES[rawFunding] ?? FUNDING_TYPE_BADGES['grant']
  const lastSeen      = grant?.last_seen_at ? String(grant.last_seen_at).split('T')[0] : null
  const eligibility   = Array.isArray(grant?.eligibility_criteria) ? grant!.eligibility_criteria : []
  const impactSectors = Array.isArray(grant?.impact_sectors)       ? grant!.impact_sectors       : []
  const structures    = Array.isArray(grant?.eligible_structures)  ? grant!.eligible_structures  : []
  const sectors       = Array.isArray(grant?.sectors)              ? grant!.sectors              : []
  const deadlinePassed = !grant?.is_rolling && grant?.deadline && new Date(grant.deadline) < new Date()
  // Brief first, scraped description only as fallback — see leadParagraph.
  const lead = leadParagraph(grant?.funder_brief, grant?.description)

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          background: 'rgba(28,28,46,0.30)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div
        className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[500px] bg-[#FAFAF7] flex flex-col"
        style={{
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: '-8px 0 48px rgba(28,28,46,0.18)',
        }}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#E8E0D1] flex-shrink-0 bg-[#FAFAF7]">
          <p className="text-[11px] font-bold text-[#5F5E5A] uppercase tracking-widest">Grant Details</p>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[#E8E0D1] transition-colors text-[#5F5E5A] hover:text-[#1C1C2E]"
            style={{ borderRadius: 9999 }}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {loading && (
            <div className="flex items-center justify-center py-24 text-[#5F5E5A] text-sm">
              Loading…
            </div>
          )}

          {error && (
            <div className="text-coral-saturated text-sm text-center py-12">{error}</div>
          )}

          {grant && (
            <>
              {/* ── White card: hero + metrics ── */}
              <div className="mx-4 mt-4 bg-white border border-[#E8E0D1] overflow-hidden" style={{ borderRadius: 16 }}>

                {/* Hero */}
                <div className="px-5 pt-5 pb-4">
                  {/* Funder row */}
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-9 h-9 flex items-center justify-center font-bold text-sm flex-shrink-0"
                      style={{ backgroundColor: 'rgba(132,204,22,0.12)', color: '#639922', border: '1px solid rgba(132,204,22,0.25)', borderRadius: 8 }}
                    >
                      {String(grant.funder ?? '?')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#1C1C2E] truncate">{grant.funder}</p>
                      {FUNDER_LABELS[funderType] && funderType !== 'other' && (
                        <p className="text-xs text-[#5F5E5A]">{typeLabel}</p>
                      )}
                    </div>
                  </div>

                  {/* Title */}
                  <h2 className="text-lg font-bold text-[#1C1C2E] leading-snug mb-3">
                    {grant.title}
                  </h2>

                  {/* Badge row */}
                  <div className="flex flex-wrap gap-1.5">
                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1"
                      style={{ backgroundColor: ftBadge.bg, color: ftBadge.color, borderRadius: 9999 }}
                    >
                      <ftBadge.Icon className="w-3 h-3" />
                      {ftBadge.label}
                    </span>
                    {locationLabel(grant.is_local, grant.location_tag) && (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1"
                        style={{ backgroundColor: 'rgba(186,230,253,0.55)', color: '#0C447C', borderRadius: 9999 }}
                      >
                        <MapPin className="w-3 h-3" />{locationLabel(grant.is_local, grant.location_tag)}
                      </span>
                    )}
                    {grant.next_open_date && (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1"
                        style={{ backgroundColor: 'rgba(59,130,246,0.10)', color: '#1D4ED8', borderRadius: 9999 }}
                      >
                        <Bell className="w-3 h-3" />{formatNextOpen(grant.next_open_date) ?? grant.next_open_date}
                      </span>
                    )}
                  </div>
                </div>

                {/* Metrics row */}
                <div className="grid grid-cols-2 border-t border-[#E8E0D1]">
                  <div className="px-5 py-4 border-r border-[#E8E0D1]">
                    <p className="text-[10px] font-bold text-[#5F5E5A] uppercase tracking-wider mb-1">Amount</p>
                    <p className="text-2xl font-bold" style={{ color: '#FFB74D' }}>
                      {formatRange(grant.amount_min, grant.amount_max)}
                    </p>
                  </div>
                  <div className="px-5 py-4">
                    <p className="text-[10px] font-bold text-[#5F5E5A] uppercase tracking-wider mb-1">Deadline</p>
                    {grant.is_rolling ? (
                      <p className="text-sm font-semibold flex items-center gap-1.5 mt-0.5" style={{ color: '#639922' }}>
                        <RefreshCw className="w-3.5 h-3.5" />Rolling
                      </p>
                    ) : grant.deadline ? (
                      <p className={`text-sm font-semibold flex items-center gap-1.5 mt-0.5 ${deadlinePassed ? 'text-coral-saturated' : 'text-[#1C1C2E]'}`}>
                        {deadlinePassed
                          ? <><AlertTriangle className="w-3.5 h-3.5" />Passed</>
                          : <><Calendar className="w-3.5 h-3.5" />{grant.deadline}</>}
                      </p>
                    ) : (
                      <p className="text-sm text-[#5F5E5A] mt-0.5">Check website</p>
                    )}
                  </div>
                </div>
              </div>

              {/* ── CTA buttons ── */}
              <div className="px-4 pt-4 flex flex-col gap-2.5">
                {grant.apply_url && (
                  <a
                    href={grant.apply_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 px-4 py-3 text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: '#2C2C2A', borderRadius: 9999 }}
                  >
                    <ExternalLink className="w-4 h-4" />
                    Visit Website
                  </a>
                )}
                {onAddToPipeline && (
                  <button
                    onClick={handleAddToPipeline}
                    className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold border border-[#2C2C2A] bg-white hover:bg-[#2C2C2A] hover:text-white transition-colors text-[#1C1C2E]"
                    style={{ borderRadius: 9999 }}
                  >
                    <PlusCircle className="w-4 h-4" />
                    {pipelineMsg ?? 'Add to Pipeline'}
                  </button>
                )}
              </div>

              {/* ── Content sections ── */}
              <div className="px-4 py-4 space-y-3">

                {/* About + the enriched brief. The brief leads; `description` is
                    only the fallback, because that column is where the scraped
                    stubs live ("Grant from X.", "…- deadline soon"). */}
                {(lead || briefHasContent(grant.funder_brief)) && (
                  <div className="bg-white border border-[#E8E0D1] px-5 py-4" style={{ borderRadius: 16 }}>
                    {lead && (
                      <>
                        <p className="text-[10px] font-bold text-[#5F5E5A] uppercase tracking-wider mb-2">About this grant</p>
                        <p className="text-sm text-[#444] leading-relaxed whitespace-pre-line">{lead}</p>
                      </>
                    )}
                    {briefHasContent(grant.funder_brief) && (
                      <div className={lead ? 'mt-4 pt-4 border-t border-[#E8E0D1]' : ''}>
                        <FunderBrief brief={grant.funder_brief} variant="modal" />
                      </div>
                    )}
                  </div>
                )}

                {/* Eligibility criteria */}
                {eligibility.length > 0 && (
                  <div className="bg-white border border-[#E8E0D1] px-5 py-4" style={{ borderRadius: 16 }}>
                    <p className="text-[10px] font-bold text-[#5F5E5A] uppercase tracking-wider mb-3">Eligibility criteria</p>
                    <ul className="space-y-2.5">
                      {eligibility.map((c, i) => (
                        <li key={i} className="flex gap-2.5 text-sm text-[#444]">
                          <span className="flex-shrink-0 font-bold mt-0.5" style={{ color: '#8ECB3C' }}>✓</span>
                          <span className="leading-snug">{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Eligible structures */}
                {structures.length > 0 && (
                  <div className="bg-white border border-[#E8E0D1] px-5 py-4" style={{ borderRadius: 16 }}>
                    <p className="text-[10px] font-bold text-[#5F5E5A] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5" style={{ color: '#8ECB3C' }} />
                      Eligible organisation types
                    </p>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {structures.map(s => (
                        <span
                          key={s}
                          className="text-[11px] font-semibold px-2.5 py-1"
                          style={{ backgroundColor: 'rgba(132,204,22,0.10)', color: '#639922', borderRadius: 9999 }}
                        >
                          {STRUCTURE_LABELS[s] ?? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-[#5F5E5A] flex items-center gap-1 mt-1">
                      <ShieldAlert className="w-3 h-3 flex-shrink-0" />
                      Only these organisation types are eligible to apply.
                    </p>
                  </div>
                )}

                {/* Impact sectors */}
                {impactSectors.length > 0 && (
                  <div className="bg-white border border-[#E8E0D1] px-5 py-4" style={{ borderRadius: 16 }}>
                    <p className="text-[10px] font-bold text-[#5F5E5A] uppercase tracking-wider mb-2.5">Impact sectors</p>
                    <div className="flex flex-wrap gap-1.5">
                      {impactSectors.map(s => (
                        <span
                          key={s}
                          className="text-[11px] font-semibold px-2.5 py-1"
                          style={{ backgroundColor: 'rgba(255,183,77,0.20)', color: '#854F0B', borderRadius: 9999 }}
                        >
                          {IMPACT_SECTOR_LABELS[s.toLowerCase()] ?? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fallback free-text sectors */}
                {impactSectors.length === 0 && sectors.length > 0 && (
                  <div className="bg-white border border-[#E8E0D1] px-5 py-4" style={{ borderRadius: 16 }}>
                    <p className="text-[10px] font-bold text-[#5F5E5A] uppercase tracking-wider mb-2.5">Sectors</p>
                    <div className="flex flex-wrap gap-1.5">
                      {sectors.map(s => (
                        <span
                          key={s}
                          className="text-[11px] font-semibold px-2.5 py-1"
                          style={{ backgroundColor: 'rgba(255,183,77,0.20)', color: '#854F0B', borderRadius: 9999 }}
                        >
                          {s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Source */}
                {lastSeen && (
                  <p className="text-[11px] text-[#8A8986] text-center pb-2">
                    Source: {sourceLabel(grant.source)} · Last checked: {lastSeen}
                    {grant.is_active === false && (
                      <span className="ml-1 text-coral-saturated font-medium">· May be closed</span>
                    )}
                  </p>
                )}

              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

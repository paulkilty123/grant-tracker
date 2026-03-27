'use client'

import { useEffect, useState } from 'react'
import {
  X, MapPin, RefreshCw, Calendar, AlertTriangle, Bell,
  CheckCircle, ShieldAlert, Award, Rocket, GraduationCap,
  TrendingUp, Users, GitMerge, Gift, Landmark, ExternalLink,
  BookmarkPlus,
} from 'lucide-react'
import { formatRange } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScrapedGrant {
  id: string
  external_id: string | null
  title: string
  funder: string
  funder_type: string | null
  funding_type: string | null
  description: string | null
  amount_min: number | null
  amount_max: number | null
  deadline: string | null
  is_rolling: boolean | null
  is_local: boolean | null
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
  cls: string
}

const FUNDING_TYPE_BADGES: Record<string, FTBadge> = {
  grant:             { Icon: Award,         label: 'Grant',             cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  accelerator:       { Icon: Rocket,        label: 'Incubator / Accelerator', cls: 'bg-orange-50 text-orange-700 border border-orange-200' },
  support_programme: { Icon: GraduationCap, label: 'Fellowship / Support', cls: 'bg-indigo-50 text-indigo-700 border border-indigo-200' },
  programme:         { Icon: GraduationCap, label: 'Support Programme', cls: 'bg-indigo-50 text-indigo-700 border border-indigo-200' },
  social_investment: { Icon: TrendingUp,    label: 'Social Investment', cls: 'bg-cyan-50 text-cyan-700 border border-cyan-200' },
  loan:              { Icon: TrendingUp,    label: 'Loan',              cls: 'bg-cyan-50 text-cyan-700 border border-cyan-200' },
  equity:            { Icon: TrendingUp,    label: 'Equity',            cls: 'bg-cyan-50 text-cyan-700 border border-cyan-200' },
  diversity_fund:    { Icon: Users,         label: 'Diversity Fund',    cls: 'bg-violet-50 text-violet-700 border border-violet-200' },
  blended_finance:   { Icon: GitMerge,      label: 'Blended Finance',   cls: 'bg-teal-50 text-teal-700 border border-teal-200' },
  in_kind:           { Icon: Gift,          label: 'In-Kind & Pro Bono', cls: 'bg-rose-50 text-rose-700 border border-rose-200' },
  'in-kind':         { Icon: Gift,          label: 'In-Kind & Pro Bono', cls: 'bg-rose-50 text-rose-700 border border-rose-200' },
  'tax-relief':      { Icon: Landmark,      label: 'Tax Relief',        cls: 'bg-stone-100 text-stone-700 border border-stone-300' },
}

const STRUCTURE_LABELS: Record<string, string> = {
  cic_guarantee:          'CIC (Ltd by Guarantee)',
  cic_shares:             'CIC (Ltd by Shares)',
  cio:                    'CIO',
  registered_charity:     'Registered Charity',
  ltd_guarantee:          'Ltd by Guarantee',
  company_ltd_guarantee:  'Company Ltd by Guarantee',
  ltd_shares:             'Ltd by Shares',
  llp:                    'LLP',
  cooperative:            'Co-operative / CBS',
  unincorporated:         'Unincorporated Association',
  sole_trader:            'Sole Trader / Individual',
  not_registered:         'Pre-registration',
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
    setPipelineMsg('Added to pipeline!')
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

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          background: 'rgba(26,46,43,0.22)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div
        className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[520px] bg-white flex flex-col"
        style={{
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: '-8px 0 48px rgba(26,46,43,0.16)',
        }}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-[#e8ddd0] flex-shrink-0 bg-[#faf7f2]">
          <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider">Grant Details</p>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#e8ddd0] transition-colors text-[#6b7280] hover:text-[#2c3e35]"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {loading && (
            <div className="flex items-center justify-center py-24 text-[#6b7280] text-sm">
              Loading…
            </div>
          )}

          {error && (
            <div className="text-red-500 text-sm text-center py-12">{error}</div>
          )}

          {grant && (
            <>
              {/* Hero section */}
              <div className="px-6 pt-6 pb-5 border-b border-[#e8ddd0]">
                {/* Funder row */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-[#2d8a7a]/10 flex items-center justify-center text-[#2d8a7a] font-bold text-base flex-shrink-0 border border-[#2d8a7a]/20">
                    {String(grant.funder ?? '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#2c3e35]">{grant.funder}</p>
                    {FUNDER_LABELS[funderType] && funderType !== 'other' && (
                      <p className="text-xs text-[#6b7280]">{typeLabel}</p>
                    )}
                  </div>
                </div>

                {/* Title */}
                <h2 className="font-lora text-xl font-semibold text-[#2c3e35] leading-snug mb-3">
                  {grant.title}
                </h2>

                {/* Badge row */}
                <div className="flex flex-wrap gap-1.5">
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 ${ftBadge.cls}`}>
                    <ftBadge.Icon className="w-3 h-3" />
                    {ftBadge.label}
                  </span>
                  {grant.is_local && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
                      <MapPin className="w-3 h-3" />Local
                    </span>
                  )}
                  {grant.next_open_date && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      <Bell className="w-3 h-3" />Opens {grant.next_open_date}
                    </span>
                  )}
                </div>
              </div>

              {/* Key metrics */}
              <div className="grid grid-cols-2 border-b border-[#e8ddd0]">
                <div className="px-6 py-4 border-r border-[#e8ddd0]">
                  <p className="text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1">Grant amount</p>
                  <p className="font-display text-2xl font-bold text-[#e8a030]">
                    {formatRange(grant.amount_min, grant.amount_max)}
                  </p>
                </div>
                <div className="px-6 py-4">
                  <p className="text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-1">Deadline</p>
                  {grant.is_rolling ? (
                    <p className="text-sm font-semibold text-[#2d8a7a] flex items-center gap-1.5 mt-1">
                      <RefreshCw className="w-3.5 h-3.5" />Always open
                    </p>
                  ) : grant.deadline ? (
                    <p className={`text-sm font-semibold flex items-center gap-1.5 mt-1 ${deadlinePassed ? 'text-red-600' : 'text-[#2c3e35]'}`}>
                      {deadlinePassed
                        ? <><AlertTriangle className="w-3.5 h-3.5" />Passed</>
                        : <><Calendar className="w-3.5 h-3.5" />{grant.deadline}</>}
                    </p>
                  ) : (
                    <p className="text-sm text-[#6b7280] mt-1">Check website</p>
                  )}
                </div>
              </div>

              {/* Body content */}
              <div className="px-6 py-5 space-y-6">

                {/* Description */}
                <div>
                  <h3 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-2">About this grant</h3>
                  <p className="text-sm text-[#444] leading-relaxed whitespace-pre-line">{grant.description}</p>
                </div>

                {/* Eligibility criteria */}
                {eligibility.length > 0 && (
                  <div className="pt-5 border-t border-[#e8ddd0]">
                    <h3 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-3">Eligibility criteria</h3>
                    <ul className="space-y-2.5">
                      {eligibility.map((c, i) => (
                        <li key={i} className="flex gap-2.5 text-sm text-[#444]">
                          <span className="text-[#2d8a7a] flex-shrink-0 font-bold mt-0.5">✓</span>
                          <span className="leading-snug">{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Eligible structures */}
                {structures.length > 0 && (
                  <div className="pt-5 border-t border-[#e8ddd0]">
                    <h3 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                      Eligible organisation types
                    </h3>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {structures.map(s => (
                        <span key={s} className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {STRUCTURE_LABELS[s] ?? s}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-[#6b7280] flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3 flex-shrink-0" />
                      Only these organisation types are eligible to apply.
                    </p>
                  </div>
                )}

                {/* Impact sectors */}
                {impactSectors.length > 0 && (
                  <div className="pt-5 border-t border-[#e8ddd0]">
                    <h3 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-2">Impact sectors</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {impactSectors.map(s => (
                        <span key={s} className="text-[11px] font-medium px-2 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200">
                          {IMPACT_SECTOR_LABELS[s] ?? s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fallback free-text sectors */}
                {impactSectors.length === 0 && sectors.length > 0 && (
                  <div className="pt-5 border-t border-[#e8ddd0]">
                    <h3 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-2">Sectors</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {sectors.map(s => (
                        <span key={s} className="text-[11px] font-medium px-2 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 capitalize">{s}</span>
                      ))}
                    </div>
                  </div>
                )}

              </div>

              {/* CTA footer — sticky */}
              <div className="sticky bottom-0 bg-white border-t border-[#e8ddd0] px-6 py-4 flex flex-col gap-2.5">
                {grant.apply_url && (
                  <a
                    href={grant.apply_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 px-4 py-3 text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: '#E8725C' }}
                  >
                    <ExternalLink className="w-4 h-4" />
                    Visit website
                  </a>
                )}
                {onAddToPipeline && (
                  <button
                    onClick={handleAddToPipeline}
                    className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold border border-[#e8ddd0] hover:border-[#2d8a7a] hover:text-[#2d8a7a] transition-colors text-[#444]"
                  >
                    <BookmarkPlus className="w-4 h-4" />
                    {pipelineMsg ?? 'Add to pipeline'}
                  </button>
                )}
                {lastSeen && (
                  <p className="text-[11px] text-[#6b7280] text-center">
                    Source: {sourceLabel(grant.source)} · Last checked: {lastSeen}
                    {grant.is_active === false && (
                      <span className="ml-1 text-red-400 font-medium">· May be closed</span>
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

'use client'

import { useEffect, useState } from 'react'
import {
  X, MapPin, RefreshCw, Calendar, AlertTriangle, Bell,
  CheckCircle, ShieldAlert, Award, Rocket, GraduationCap,
  TrendingUp, Users, GitMerge, Gift, Landmark,
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

const TYPE_COLOURS: Record<string, string> = {
  lottery:             'bg-green-50 text-green-700',
  trust_foundation:    'bg-sage/10 text-forest',
  foundation:          'bg-sage/10 text-forest',
  corporate:           'bg-amber-50 text-amber-700',
  local_authority:     'bg-purple-50 text-purple-700',
  housing_association: 'bg-teal-50 text-teal-700',
  government:          'bg-red-50 text-red-700',
}

interface FTBadge {
  Icon: React.ComponentType<{ className?: string }>
  label: string
  cls: string
}

const FUNDING_TYPE_BADGES: Record<string, FTBadge> = {
  grant:             { Icon: Award,         label: 'Grant',             cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  accelerator:       { Icon: Rocket,        label: 'Accelerator',       cls: 'bg-orange-50 text-orange-700 border border-orange-200' },
  support_programme: { Icon: GraduationCap, label: 'Support Programme', cls: 'bg-indigo-50 text-indigo-700 border border-indigo-200' },
  programme:         { Icon: GraduationCap, label: 'Support Programme', cls: 'bg-indigo-50 text-indigo-700 border border-indigo-200' },
  social_investment: { Icon: TrendingUp,    label: 'Social Investment',  cls: 'bg-cyan-50 text-cyan-700 border border-cyan-200' },
  loan:              { Icon: TrendingUp,    label: 'Loan',               cls: 'bg-cyan-50 text-cyan-700 border border-cyan-200' },
  equity:            { Icon: TrendingUp,    label: 'Equity',             cls: 'bg-cyan-50 text-cyan-700 border border-cyan-200' },
  diversity_fund:    { Icon: Users,         label: 'Diversity Fund',     cls: 'bg-violet-50 text-violet-700 border border-violet-200' },
  blended_finance:   { Icon: GitMerge,      label: 'Blended Finance',    cls: 'bg-teal-50 text-teal-700 border border-teal-200' },
  in_kind:           { Icon: Gift,          label: 'In-Kind Support',    cls: 'bg-rose-50 text-rose-700 border border-rose-200' },
  'in-kind':         { Icon: Gift,          label: 'In-Kind Support',    cls: 'bg-rose-50 text-rose-700 border border-rose-200' },
  'tax-relief':      { Icon: Landmark,      label: 'Tax Relief',         cls: 'bg-stone-100 text-stone-700 border border-stone-300' },
}

const STRUCTURE_LABELS: Record<string, string> = {
  cic_guarantee:      'CIC (Ltd by Guarantee)',
  cic_shares:         'CIC (Ltd by Shares)',
  cio:                'CIO',
  registered_charity: 'Registered Charity',
  ltd_guarantee:              'Ltd by Guarantee',
  company_ltd_guarantee:      'Company Ltd by Guarantee',
  ltd_shares:         'Ltd by Shares',
  llp:                'LLP',
  cooperative:        'Co-operative / CBS',
  unincorporated:     'Unincorporated Association',
  sole_trader:        'Sole Trader / Individual',
  not_registered:     'Pre-registration',
}

const IMPACT_SECTOR_LABELS: Record<string, string> = {
  creative:      'Arts & Culture',
  environment:   'Environment',
  health:        'Health',
  education:     'Education',
  tech:          'Technology',
  housing:       'Housing',
  food:          'Food',
  employment:    'Employment',
  community:     'Community',
  justice:       'Justice & Equality',
  financial:     'Financial Inclusion',
  international: 'International',
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
  const [grant, setGrant]       = useState<ScrapedGrant | null>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [pipelineMsg, setPipelineMsg] = useState<string | null>(null)

  // Fetch when grantId changes
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

  // Close on Escape
  useEffect(() => {
    if (!grantId) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [grantId, onClose])

  // Prevent body scroll while open
  useEffect(() => {
    if (grantId) document.body.style.overflow = 'hidden'
    else         document.body.style.overflow = ''
    return ()  => { document.body.style.overflow = '' }
  }, [grantId])

  if (!grantId) return null

  const handleAddToPipeline = () => {
    if (!grant || !onAddToPipeline) return
    onAddToPipeline(grant)
    setPipelineMsg('Added to pipeline!')
    setTimeout(() => setPipelineMsg(null), 2500)
  }

  // Derived values
  const funderType    = grant?.funder_type ?? 'other'
  const typeLabel     = FUNDER_LABELS[funderType] ?? funderType.replace(/_/g, ' ')
  const typeColour    = TYPE_COLOURS[funderType] ?? 'bg-gray-50 text-gray-600'
  const rawFunding    = grant?.funding_type ?? 'grant'
  const ftBadge       = FUNDING_TYPE_BADGES[rawFunding] ?? FUNDING_TYPE_BADGES['grant']
  const lastSeen      = grant?.last_seen_at ? String(grant.last_seen_at).split('T')[0] : 'Unknown'
  const eligibility   = Array.isArray(grant?.eligibility_criteria) ? grant!.eligibility_criteria : []
  const impactSectors = Array.isArray(grant?.impact_sectors)       ? grant!.impact_sectors       : []
  const structures    = Array.isArray(grant?.eligible_structures)  ? grant!.eligible_structures  : []
  const sectors       = Array.isArray(grant?.sectors)              ? grant!.sectors              : []
  const deadlinePassed = !grant?.is_rolling && grant?.deadline && new Date(grant.deadline) < new Date()
  const deadlineColour = grant?.is_rolling ? 'text-sage' : deadlinePassed ? 'text-red-600' : 'text-charcoal'

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
      {/* Panel */}
      <div
        className="relative z-50 w-full max-w-lg bg-white shadow-2xl flex flex-col rounded-lg overflow-hidden"
        style={{ maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-warm flex-shrink-0"
             style={{ background: '#faf7f2' }}>
          <p className="text-xs font-semibold text-light uppercase tracking-wider">Grant details</p>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-warm/60 transition-colors text-mid hover:text-charcoal"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">

          {loading && (
            <div className="flex items-center justify-center py-20 text-light text-sm">
              Loading…
            </div>
          )}

          {error && (
            <div className="text-red-500 text-sm text-center py-10">{error}</div>
          )}

          {grant && (
            <>
              {/* Funder avatar + title */}
              <div className="flex items-start gap-4 mb-5">
                <div className="w-12 h-12 rounded-xl bg-sage/20 flex items-center justify-center text-sage font-bold text-xl flex-shrink-0">
                  {String(grant.funder ?? '?')[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${typeColour}`}>
                      {typeLabel}
                    </span>
                    {grant.is_local && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-green-50 text-green-700">
                        <MapPin className="w-3 h-3" />Local
                      </span>
                    )}
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${ftBadge.cls}`}>
                      <ftBadge.Icon className="w-3 h-3" />
                      {ftBadge.label}
                    </span>
                  </div>
                  <h2 className="font-display text-xl font-bold text-forest leading-tight">{grant.title}</h2>
                  <p className="text-mid text-sm mt-1">{grant.funder}</p>
                </div>
              </div>

              {/* Key metrics */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-warm/40 rounded-xl mb-5">
                <div>
                  <p className="text-[10px] text-light uppercase tracking-wider font-semibold mb-1">Grant amount</p>
                  <p className="font-display text-2xl font-bold text-gold">
                    {formatRange(grant.amount_min, grant.amount_max)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-light uppercase tracking-wider font-semibold mb-1">Deadline</p>
                  <p className={`text-sm font-semibold mt-1 inline-flex items-center gap-1.5 ${deadlineColour}`}>
                    {grant.is_rolling
                      ? <><RefreshCw className="w-3.5 h-3.5" />Rolling — apply any time</>
                      : grant.deadline
                        ? deadlinePassed
                          ? <><AlertTriangle className="w-3.5 h-3.5" />Deadline passed ({grant.deadline})</>
                          : <><Calendar className="w-3.5 h-3.5" />{grant.deadline}</>
                        : 'Check website for deadline'
                    }
                  </p>
                </div>
              </div>

              {/* Next open date */}
              {grant.next_open_date && (
                <div className="mb-4">
                  <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold px-3 py-1.5 rounded-lg">
                    <Bell className="w-3.5 h-3.5" />Opens {grant.next_open_date}
                  </span>
                </div>
              )}

              {/* Description */}
              <div className="mb-5">
                <h3 className="text-xs font-semibold text-light uppercase tracking-wider mb-2.5">About this grant</h3>
                <p className="text-mid leading-relaxed whitespace-pre-line">{grant.description}</p>
              </div>

              {/* Eligibility */}
              {eligibility.length > 0 && (
                <div className="mb-5 pt-4 border-t border-warm">
                  <h3 className="text-xs font-semibold text-light uppercase tracking-wider mb-2.5">Eligibility criteria</h3>
                  <ul className="space-y-2">
                    {eligibility.map((c, i) => (
                      <li key={i} className="flex gap-2.5 text-sm text-mid">
                        <span className="text-sage flex-shrink-0 mt-0.5 font-bold">✓</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Impact sectors */}
              {impactSectors.length > 0 && (
                <div className="mb-5 pt-4 border-t border-warm">
                  <h3 className="text-xs font-semibold text-light uppercase tracking-wider mb-2.5">Impact sectors</h3>
                  <div className="flex flex-wrap gap-2">
                    {impactSectors.map(s => (
                      <span key={s} className="tag bg-violet-50 text-violet-700 capitalize">
                        {IMPACT_SECTOR_LABELS[s] ?? s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Eligible structures */}
              {structures.length > 0 && (
                <div className="mb-5 pt-4 border-t border-warm">
                  <h3 className="text-xs font-semibold text-light uppercase tracking-wider mb-2.5 inline-flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    Eligible organisation types
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {structures.map(s => (
                      <span key={s} className="tag bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {STRUCTURE_LABELS[s] ?? s}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-light mt-2 inline-flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" />
                    Only the organisation types listed above are eligible to apply.
                  </p>
                </div>
              )}

              {/* Fallback free-text sectors */}
              {impactSectors.length === 0 && sectors.length > 0 && (
                <div className="mb-5 pt-4 border-t border-warm">
                  <h3 className="text-xs font-semibold text-light uppercase tracking-wider mb-2.5">Sectors</h3>
                  <div className="flex flex-wrap gap-2">
                    {sectors.map(s => (
                      <span key={s} className="tag bg-purple-50 text-purple-700 capitalize">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="pt-4 border-t border-warm flex flex-wrap gap-3">
                {grant.apply_url && (
                  <a
                    href={grant.apply_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary"
                  >
                    Apply now →
                  </a>
                )}
                {onAddToPipeline && (
                  <button
                    onClick={handleAddToPipeline}
                    className="px-4 py-2 text-sm font-semibold border border-coral text-coral hover:bg-coral hover:text-white transition-colors rounded"
                  >
                    {pipelineMsg ?? '+ Add to Pipeline'}
                  </button>
                )}
              </div>

              {/* Metadata footer */}
              <p className="text-xs text-light text-center mt-6">
                Source: {sourceLabel(grant.source)} · Last checked: {lastSeen}
                {grant.is_active === false && (
                  <span className="ml-2 text-red-400 font-medium">· May be closed</span>
                )}
              </p>
            </>
          )}
        </div>
      </div>
      </div>
    </>
  )
}

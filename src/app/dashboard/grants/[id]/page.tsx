import React from 'react'
import { createClient } from '@/lib/supabase/server'
import { formatRange } from '@/lib/utils'
import { notFound } from 'next/navigation'
import AddToPipelineButton from './AddToPipelineButton'
import FlagGrantButton from './FlagGrantButton'
import {
  Award, Rocket, GraduationCap, TrendingUp, Users, GitMerge, Gift, Landmark,
  MapPin, Bell, RefreshCw, Calendar, AlertTriangle, CheckCircle, ShieldAlert,
} from 'lucide-react'

// ── Funder-type label map ─────────────────────────────────────────────────────
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

const TYPE_COLOURS: Record<string, string> = {
  lottery:             'bg-green-50 text-green-700',
  trust_foundation:    'bg-sage/10 text-forest',
  community_foundation:'bg-sage/10 text-forest',
  corporate_foundation:'bg-sage/10 text-forest',
  capacity_builder:    'bg-emerald-50 text-emerald-700',
  foundation:          'bg-sage/10 text-forest',
  corporate:           'bg-amber-50 text-amber-700',
  local_authority:     'bg-amber-pale text-amber-deep',
  housing_association: 'bg-teal-50 text-teal-700',
  government:          'bg-coral-pale text-coral-deep',
}

// ── Source display names ──────────────────────────────────────────────────────
function sourceLabel(source: string): string {
  if (source.startsWith('gov_uk'))            return 'GOV.UK Find a Grant'
  if (source === 'tnlcf')                     return 'National Lottery Community Fund'
  if (source === 'ukri')                      return 'UKRI'
  if (source === 'gla')                       return 'Greater London Authority'
  if (source === 'arts_council')              return 'Arts Council England'
  if (source === 'sport_england')             return 'Sport England'
  if (source === 'heritage_fund')             return 'National Heritage Fund'
  if (source === 'bbc_cin')                   return 'BBC Children in Need'
  if (source === 'paul_hamlyn_foundation')    return 'Paul Hamlyn Foundation'
  if (source === 'esmee_fairbairn')           return 'Esmée Fairbairn Foundation'
  if (source === 'henry_smith')               return 'Henry Smith Foundation'
  return source.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function GrantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const externalId = decodeURIComponent(id)

  const supabase = await createClient()

  // Try external_id first, fall back to DB id (UUID) for grants without an external_id
  let { data: grant } = await supabase
    .from('scraped_grants')
    .select('*')
    .eq('external_id', externalId)
    .maybeSingle()

  if (!grant) {
    const { data: byId } = await supabase
      .from('scraped_grants')
      .select('*')
      .eq('id', externalId)
      .maybeSingle()
    grant = byId
  }

  if (!grant) notFound()

  const sectors: string[]     = Array.isArray(grant.sectors)              ? grant.sectors              : []
  const eligibility: string[] = Array.isArray(grant.eligibility_criteria) ? grant.eligibility_criteria : []
  const funderType             = String(grant.funder_type ?? 'other')
  const typeLabel              = FUNDER_LABELS[funderType] ?? funderType.replace(/_/g, ' ')
  const typeColour             = TYPE_COLOURS[funderType] ?? 'bg-gray-50 text-gray-600'
  const lastSeen               = grant.last_seen_at ? String(grant.last_seen_at).split('T')[0] : 'Unknown'

  // Funding type badge — all types including grant
  type FTBadge = { Icon: React.ComponentType<{ className?: string }>; label: string; cls: string }
  const FUNDING_TYPE_BADGES: Record<string, FTBadge> = {
    grant:              { Icon: Award,         label: 'Grant',             cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
    accelerator:        { Icon: Rocket,        label: 'Accelerator',       cls: 'bg-orange-50 text-orange-700 border border-orange-200' },
    support_programme:  { Icon: GraduationCap, label: 'Support Programme', cls: 'bg-blue-pale text-blue-deep border border-blue-mid' },
    programme:          { Icon: GraduationCap, label: 'Support Programme', cls: 'bg-blue-pale text-blue-deep border border-blue-mid' },
    social_investment:  { Icon: TrendingUp,    label: 'Social Investment', cls: 'bg-cyan-50 text-cyan-700 border border-cyan-200' },
    loan:               { Icon: TrendingUp,    label: 'Loan',              cls: 'bg-cyan-50 text-cyan-700 border border-cyan-200' },
    equity:             { Icon: TrendingUp,    label: 'Equity',            cls: 'bg-cyan-50 text-cyan-700 border border-cyan-200' },
    diversity_fund:     { Icon: Users,         label: 'Diversity Fund',    cls: 'bg-violet-50 text-violet-700 border border-violet-200' },
    blended_finance:    { Icon: GitMerge,      label: 'Blended Finance',   cls: 'bg-teal-50 text-teal-700 border border-teal-200' },
    in_kind:            { Icon: Gift,          label: 'In-Kind Support',   cls: 'bg-amber-pale text-amber-deep border border-amber-mid' },
    'in-kind':          { Icon: Gift,          label: 'In-Kind Support',   cls: 'bg-amber-pale text-amber-deep border border-amber-mid' },
    'tax-relief':       { Icon: Landmark,      label: 'Tax Relief',        cls: 'bg-stone-100 text-stone-700 border border-stone-300' },
  }
  const rawFundingType = grant.funding_type ? String(grant.funding_type) : 'grant'
  const fundingTypeBadge: FTBadge = FUNDING_TYPE_BADGES[rawFundingType] ?? FUNDING_TYPE_BADGES['grant']

  // Impact sectors (classified taxonomy)
  const impactSectors: string[] = Array.isArray(grant.impact_sectors) ? grant.impact_sectors : []

  // Eligible structures
  const eligibleStructures: string[] = Array.isArray(grant.eligible_structures) ? grant.eligible_structures : []
  const STRUCTURE_LABELS: Record<string, string> = {
    cic_guarantee:      'CIC (Ltd by Guarantee)',
    cic_shares:         'CIC (Ltd by Shares)',
    cio:                'CIO',
    registered_charity: 'Registered Charity',
    ltd_guarantee:          'Ltd by Guarantee',
    company_ltd_guarantee:  'Company Ltd by Guarantee',
    ltd_shares:         'Ltd by Shares',
    llp:                'LLP',
    cooperative:        'Co-operative / CBS',
    unincorporated:     'Unincorporated Association',
    sole_trader:        'Sole Trader / Individual',
    not_registered:     'Pre-registration',
  }

  const IMPACT_SECTOR_LABELS: Record<string, string> = {
    creative: 'Arts & Culture', environment: 'Environment', health: 'Health',
    education: 'Education', tech: 'Technology', housing: 'Housing',
    food: 'Food', employment: 'Employment', community: 'Community',
    justice: 'Justice & Equality', financial: 'Financial Inclusion', international: 'International',
  }

  // Deadline display
  const deadlinePassed = !grant.is_rolling && grant.deadline && new Date(grant.deadline) < new Date()
  const deadlineColour = grant.is_rolling ? 'text-sage'
    : deadlinePassed ? 'text-coral-saturated'
    : 'text-charcoal'

  return (
    <div className="max-w-2xl">

      {/* Breadcrumb */}
      <div className="mb-5 flex items-center gap-2 text-sm">
        <a href="/dashboard/search" className="text-sage hover:underline">Search Grants</a>
        <span className="text-light">›</span>
        <span className="text-mid truncate max-w-xs">{grant.title}</span>
      </div>

      {/* Main card */}
      <div className="card mb-4">

        {/* Header */}
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
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${fundingTypeBadge.cls}`}>
                <fundingTypeBadge.Icon className="w-3 h-3" />
                {fundingTypeBadge.label}
              </span>
            </div>
            <h1 className="font-display text-2xl font-bold text-forest leading-tight">{grant.title}</h1>
            <p className="text-mid text-base mt-1">{grant.funder}</p>
          </div>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-4 p-4 bg-warm/40 rounded-xl mb-5">
          <div>
            <p className="text-[10px] text-light uppercase tracking-wider font-semibold mb-1">Grant amount</p>
            <p className="font-display text-2xl font-bold text-gold">
              {formatRange(grant.amount_min as number | null, grant.amount_max as number | null, Boolean(grant.amount_undisclosed))}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-light uppercase tracking-wider font-semibold mb-1">Deadline</p>
            <p className={`text-sm font-semibold mt-1 inline-flex items-center gap-1.5 ${deadlineColour}`}>
              {grant.is_rolling
                ? <><RefreshCw className="w-3.5 h-3.5" />Rolling — apply any time</>
                : grant.deadline
                  ? deadlinePassed
                    ? <><AlertTriangle className="w-3.5 h-3.5" />Deadline passed ({String(grant.deadline)})</>
                    : <><Calendar className="w-3.5 h-3.5" />{String(grant.deadline)}</>
                  : 'Check website for deadline'
              }
            </p>
          </div>
        </div>

        {/* Next Open Date badge */}
        {grant.next_open_date && (
          <div className="mb-4">
            <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold px-3 py-1.5 rounded-lg">
              <Bell className="w-3.5 h-3.5" />Opens {String(grant.next_open_date)}
            </span>
          </div>
        )}

        {/* Description */}
        <div className="mb-5">
          <h2 className="text-xs font-semibold text-light uppercase tracking-wider mb-2.5">About this grant</h2>
          <p className="text-mid leading-relaxed whitespace-pre-line">{grant.description}</p>
        </div>

        {/* Eligibility */}
        {eligibility.length > 0 && (
          <div className="mb-5 pt-4 border-t border-warm">
            <h2 className="text-xs font-semibold text-light uppercase tracking-wider mb-2.5">Eligibility criteria</h2>
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

        {/* Impact sectors (classified taxonomy) */}
        {impactSectors.length > 0 && (
          <div className="mb-5 pt-4 border-t border-warm">
            <h2 className="text-xs font-semibold text-light uppercase tracking-wider mb-2.5">Impact sectors</h2>
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
        {eligibleStructures.length > 0 && (
          <div className="mb-5 pt-4 border-t border-warm">
            <h2 className="text-xs font-semibold text-light uppercase tracking-wider mb-2.5 inline-flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              Eligible organisation types
            </h2>
            <div className="flex flex-wrap gap-2">
              {eligibleStructures.map(s => (
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

        {/* Legacy free-text sectors fallback — shown only if no classified sectors */}
        {impactSectors.length === 0 && sectors.length > 0 && (
          <div className="mb-5 pt-4 border-t border-warm">
            <h2 className="text-xs font-semibold text-light uppercase tracking-wider mb-2.5">Sectors</h2>
            <div className="flex flex-wrap gap-2">
              {sectors.map(s => (
                <span key={s} className="tag bg-amber-pale text-amber-deep capitalize">{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="pt-4 border-t border-warm flex flex-wrap gap-3">
          {grant.apply_url && (
            <a
              href={String(grant.apply_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
            >
              Apply now →
            </a>
          )}
          <AddToPipelineButton grant={{
            external_id: externalId,
            title:       String(grant.title ?? ''),
            funder:      String(grant.funder ?? ''),
            funder_type: grant.funder_type ? String(grant.funder_type) : null,
            amount_min:  typeof grant.amount_min  === 'number' ? grant.amount_min  : null,
            amount_max:  typeof grant.amount_max  === 'number' ? grant.amount_max  : null,
            deadline:    grant.deadline ? String(grant.deadline) : null,
            is_rolling:  Boolean(grant.is_rolling),
            apply_url:   grant.apply_url ? String(grant.apply_url) : null,
          }} />
        </div>
      </div>

      {/* Metadata footer */}
      <p className="text-xs text-light text-center">
        Source: {sourceLabel(String(grant.source))} · Last checked: {lastSeen}
        {grant.is_active === false && (
          <span className="ml-2 text-coral-saturated font-medium">· May be closed</span>
        )}
      </p>
      <div className="text-center mt-2">
        <FlagGrantButton grantId={externalId} />
      </div>
    </div>
  )
}

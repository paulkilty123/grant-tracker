import { createClient } from '@/lib/supabase/server'
import { formatRange } from '@/lib/utils'
import { notFound } from 'next/navigation'
import AddToPipelineButton from './AddToPipelineButton'
import FlagGrantButton from './FlagGrantButton'

// ── Funder-type label map ─────────────────────────────────────────────────────
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
  trust_foundation:    'bg-blue-50 text-blue-700',
  foundation:          'bg-blue-50 text-blue-700',
  corporate:           'bg-amber-50 text-amber-700',
  local_authority:     'bg-purple-50 text-purple-700',
  housing_association: 'bg-teal-50 text-teal-700',
  government:          'bg-red-50 text-red-700',
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

  const { data: grant } = await supabase
    .from('scraped_grants')
    .select('*')
    .eq('external_id', externalId)
    .maybeSingle()

  if (!grant) notFound()

  const sectors: string[]     = Array.isArray(grant.sectors)              ? grant.sectors              : []
  const eligibility: string[] = Array.isArray(grant.eligibility_criteria) ? grant.eligibility_criteria : []
  const funderType             = String(grant.funder_type ?? 'other')
  const typeLabel              = FUNDER_LABELS[funderType] ?? funderType.replace(/_/g, ' ')
  const typeColour             = TYPE_COLOURS[funderType] ?? 'bg-gray-50 text-gray-600'
  const lastSeen               = grant.last_seen_at ? String(grant.last_seen_at).split('T')[0] : 'Unknown'

  // Deadline display
  const deadlineDisplay = grant.is_rolling
    ? '🔄 Rolling — apply any time'
    : grant.deadline
      ? new Date(grant.deadline) < new Date()
        ? `⚠ Deadline passed (${grant.deadline})`
        : `📅 ${grant.deadline}`
      : 'Check website for deadline'

  const deadlineColour = grant.is_rolling ? 'text-blue-700'
    : grant.deadline && new Date(grant.deadline) < new Date() ? 'text-red-600'
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
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-green-50 text-green-700">
                  📍 Local
                </span>
              )}
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
              {formatRange(grant.amount_min as number | null, grant.amount_max as number | null)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-light uppercase tracking-wider font-semibold mb-1">Deadline</p>
            <p className={`text-sm font-semibold mt-1 ${deadlineColour}`}>{deadlineDisplay}</p>
          </div>
        </div>

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

        {/* Sectors */}
        {sectors.length > 0 && (
          <div className="mb-5 pt-4 border-t border-warm">
            <h2 className="text-xs font-semibold text-light uppercase tracking-wider mb-2.5">Sectors</h2>
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
          <span className="ml-2 text-red-400 font-medium">· May be closed</span>
        )}
      </p>
      <div className="text-center mt-2">
        <FlagGrantButton grantId={externalId} />
      </div>
    </div>
  )
}

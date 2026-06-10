'use client'

import { useState, useEffect } from 'react'
import { Rocket, GraduationCap, Gift, MapPin, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createPipelineItem } from '@/lib/pipeline'
import { getOrganisationByOwner } from '@/lib/organisations'
import { track } from '@/lib/analytics'
import GrantDetailModal from '@/components/GrantDetailModal'
import { formatRange } from '@/lib/utils'
import type { FunderType } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Programme {
  id: string
  title: string
  funder: string
  funder_type: string | null
  funding_type: string | null
  description: string | null
  amount_min: number | null
  amount_max: number | null
  deadline: string | null
  is_rolling: boolean | null
  sectors: string[] | null
  impact_sectors: string[] | null
  eligibility_criteria: string[] | null
  eligible_structures: string[] | null
  apply_url: string | null
  geographic_scope: string[] | null
  location_tag: string | null
  source: string
}

// ── Filter tabs ───────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'accelerator' | 'support_programme' | 'in_kind'

const TABS: { id: FilterTab; label: string; Icon: React.ComponentType<{ className?: string }>; cls: string }[] = [
  { id: 'all',               label: 'All',                  Icon: ChevronRight,  cls: 'bg-stone-100 text-stone-700' },
  { id: 'accelerator',       label: 'Accelerators',         Icon: Rocket,        cls: 'bg-orange-50 text-orange-700' },
  { id: 'support_programme', label: 'Fellowships & Support', Icon: GraduationCap, cls: 'bg-blue-pale text-blue-deep' },
  { id: 'in_kind',           label: 'In-Kind & Pro Bono',   Icon: Gift,          cls: 'bg-amber-pale text-amber-deep' },
]

// ── Type badge config ─────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, { Icon: React.ComponentType<{ className?: string }>; label: string; cls: string }> = {
  accelerator:       { Icon: Rocket,        label: 'Accelerator',        cls: 'bg-orange-50 text-orange-700 border border-orange-200' },
  support_programme: { Icon: GraduationCap, label: 'Support Programme',  cls: 'bg-blue-pale text-blue-deep border border-blue-mid' },
  in_kind:           { Icon: Gift,          label: 'In-Kind Support',    cls: 'bg-amber-pale text-amber-deep border border-amber-mid' },
}

const GEO_LABELS: Record<string, string> = {
  uk:               'UK-wide',
  england:          'England',
  london:           'London',
  scotland:         'Scotland',
  northern_ireland: 'Northern Ireland',
  wales:            'Wales',
  regional:         'Regional',
}

// ── Programme Card ────────────────────────────────────────────────────────────

function ProgrammeCard({ prog, onViewDetail, onAddToPipeline }: {
  prog: Programme
  onViewDetail: (id: string) => void
  onAddToPipeline: (p: Programme) => void
}) {
  const badge = prog.funding_type ? TYPE_BADGE[prog.funding_type] : null

  // Amount display
  const amount = prog.amount_min != null || prog.amount_max != null
    ? formatRange(prog.amount_min, prog.amount_max)
    : null

  // Deadline display
  let deadlineDisplay: { text: string; style: React.CSSProperties } | null = null
  if (prog.is_rolling) {
    deadlineDisplay = { text: 'Always open', style: { color: '#639922' } }
  } else if (prog.deadline) {
    const parts = prog.deadline.split('-').map(Number)
    if (parts.length === 3 && !parts.some(isNaN)) {
      const [y, m, d] = parts
      const date = new Date(y, m - 1, d)
      if (!isNaN(date.getTime())) {
        const formatted = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        deadlineDisplay = { text: `Closes ${formatted}`, style: { color: '#7a6e64' } }
      }
    }
  }

  // Location label
  const locationLabel: string | null = prog.location_tag
    ?? (prog.geographic_scope?.length
      ? prog.geographic_scope.map(s => GEO_LABELS[s] ?? s).join(' & ')
      : null)

  // Short description
  const desc = prog.description
    ? (prog.description.length > 180 ? prog.description.slice(0, 180).trimEnd() + '…' : prog.description)
    : null

  const initials = prog.funder.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div
      className="bg-white border border-warm/80 shadow-warm hover:shadow-lg transition-all cursor-pointer group"
      onClick={() => onViewDetail(prog.id)}
    >
      {/* Card body */}
      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start gap-3 mb-3">
          {/* Funder avatar */}
          <div className="h-10 w-10 bg-[#F5F1E8] flex items-center justify-center text-charcoal font-bold text-sm flex-shrink-0 border border-warm">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-charcoal text-base leading-snug mb-0.5 group-hover:text-forest transition-colors">
              {prog.title}
            </h3>
            <p className="text-sm text-mid">{prog.funder}</p>
          </div>
          {/* Amount + arrow */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-2">
            {amount && (
              <p className="text-base font-bold text-gold whitespace-nowrap">{amount}</p>
            )}
            {deadlineDisplay && (
              <p className="text-[11px] font-medium" style={deadlineDisplay.style}>
                {deadlineDisplay.text}
              </p>
            )}
            <span className="text-xl leading-none text-stone-300 group-hover:text-stone-400 transition-colors">›</span>
          </div>
        </div>

        {/* Description */}
        {desc && (
          <p className="text-sm text-mid leading-relaxed mb-3">{desc}</p>
        )}

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-1.5">
          {badge && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 ${badge.cls}`}>
              <badge.Icon className="w-3 h-3" />
              {badge.label}
            </span>
          )}
          {locationLabel && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-2 py-0.5 bg-blue-50 text-blue-700">
              <MapPin className="w-2.5 h-2.5" />
              {locationLabel}
            </span>
          )}
          {(prog.impact_sectors ?? []).slice(0, 3).map(s => (
            <span key={s} className="text-[10px] font-medium px-2 py-0.5 bg-stone-100 text-stone-600">
              {s.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      </div>

      {/* Action bar */}
      <div className="border-t border-warm/60 px-5 py-3 flex items-center justify-between">
        <button
          onClick={e => { e.stopPropagation(); onAddToPipeline(prog) }}
          className="px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90"
          style={{ background: '#E8725C' }}
        >
          + Pipeline
        </button>
        {prog.apply_url && (
          <a
            href={prog.apply_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-90"
            style={{ background: '#1a2e2b', color: '#ffffff' }}
          >
            Visit website →
          </a>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProgrammesPage() {
  const [programmes, setProgrammes]   = useState<Programme[]>([])
  const [loading, setLoading]         = useState(true)
  const [activeTab, setActiveTab]     = useState<FilterTab>('all')
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [pipelineMsg, setPipelineMsg] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('grants_with_funder')
      .select('*')
      .eq('is_active', true)
      .in('funding_type', ['accelerator', 'support_programme', 'in_kind'])
      .order('title', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setProgrammes(data as Programme[])
        setLoading(false)
      })
  }, [])

  async function handleAddToPipeline(prog: Programme) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const org = await getOrganisationByOwner(user.id)
    if (!org) { setPipelineMsg('Complete your profile first'); setTimeout(() => setPipelineMsg(null), 2500); return }

    try {
      await createPipelineItem({
        org_id:               org.id,
        grant_name:           prog.title,
        funder_name:          prog.funder,
        funder_type:          (prog.funder_type ?? 'other') as FunderType,
        amount_min:           prog.amount_min ?? null,
        amount_max:           prog.amount_max ?? null,
        amount_requested:     prog.amount_max ?? null,
        deadline:             prog.is_rolling ? null : prog.deadline ?? null,
        stage:                'identified',
        notes:                null,
        application_progress: 0,
        is_urgent:            false,
        contact_name:         null,
        contact_email:        null,
        grant_url:            prog.apply_url ?? null,
        outcome_date:         null,
        outcome_notes:        null,
        created_by:           user.id,
      })
      track('pipeline_added')
      setPipelineMsg('Added to pipeline!')
    } catch {
      setPipelineMsg('Already in pipeline')
    }
    setTimeout(() => setPipelineMsg(null), 2500)
  }

  const filtered = activeTab === 'all'
    ? programmes
    : programmes.filter(p => p.funding_type === activeTab)

  // Count per tab
  const counts: Record<FilterTab, number> = {
    all:               programmes.length,
    accelerator:       programmes.filter(p => p.funding_type === 'accelerator').length,
    support_programme: programmes.filter(p => p.funding_type === 'support_programme').length,
    in_kind:           programmes.filter(p => p.funding_type === 'in_kind').length,
  }

  return (
    <div className="min-h-screen" style={{ background: '#faf7f2' }}>
      {/* Always-rendered detail panel */}
      <GrantDetailModal
        grantId={selectedId}
        onClose={() => setSelectedId(null)}
        onAddToPipeline={() => {}}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="font-serif text-3xl text-charcoal mb-2">Programmes &amp; Support</h1>
          <p className="text-mid text-base leading-relaxed max-w-2xl">
            Structured support for organisations that want to grow. Fellowships, accelerators,
            incubators and intensive programmes — often more valuable than a grant at the right stage.
          </p>
        </div>

        {/* Pipeline toast */}
        {pipelineMsg && (
          <div className="fixed bottom-6 right-6 z-50 px-4 py-3 text-sm font-medium text-white shadow-lg"
            style={{ background: '#1a2e2b' }}>
            {pipelineMsg}
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border transition-all ${
                  isActive
                    ? 'bg-charcoal text-white border-charcoal'
                    : 'bg-white text-mid border-warm hover:border-stone-300 hover:text-charcoal'
                }`}
              >
                <tab.Icon className="w-3.5 h-3.5 flex-shrink-0" />
                {tab.label}
                <span className={`text-[10px] font-bold ml-0.5 ${isActive ? 'text-white/70' : 'text-light'}`}>
                  {counts[tab.id]}
                </span>
              </button>
            )
          })}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-mid text-sm">Loading programmes…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-mid text-sm">No programmes found in this category.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map(prog => (
              <ProgrammeCard
                key={prog.id}
                prog={prog}
                onViewDetail={setSelectedId}
                onAddToPipeline={handleAddToPipeline}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

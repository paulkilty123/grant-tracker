'use client'
// Canonical grant editor for the admin Needs Review / Recent / Category tabs.
// Phase C session 1: replaces the inline renderReviewPanel JSX in
// src/app/dashboard/admin/urls/page.tsx.
//
// Improvements over renderReviewPanel:
//   1. Real chip checkboxes for eligible_structures (JSON string is hidden
//      inside the component, parent's state shape is unchanged).
//   2. Per-field provenance badge — shows source + relative time. Pinned
//      fields are marked.
//   3. Right-rail completeness scorecard — counts populated tracked fields,
//      lists what's missing.
//
// State shape is identical to the previous inline editor so saveGrantEdits
// and publishReviewGrant continue to work unchanged.

import { Sparkles, MapPin, BookOpen, PlusCircle, X, RefreshCw } from 'lucide-react'
import { TRACKED_FIELDS, type FieldProvenance, type ProvenanceEntry } from '@/lib/grant-merge'
import {
  IMPACT_SECTOR_OPTIONS,
  BENEFICIARY_OPTIONS,
  SECTOR_SYNONYMS,
  BENEFICIARY_SYNONYMS,
  buildBriefText,
  suggestTags,
  labelFor,
  type TagOption,
} from '@/lib/tag-suggestions'

// ── Types ─────────────────────────────────────────────────────────────────────

export type GrantEditorGrant = {
  id: string
  title: string
  funder: string | null
  funder_type?: string
  funding_type?: string
  funder_brief?: Record<string, string | null> | null
  description?: string | null
  location_tag?: string | null
  amount_min?: number | null
  amount_max?: number | null
  deadline?: string | null
  is_rolling?: boolean
  is_invite_only: boolean
  eligible_structures?: string[] | null
  impact_sectors?: string[] | null
  target_beneficiaries?: string[] | null
  next_open_date?: string | null
  field_provenance?: FieldProvenance | null
}

export type GrantEditorSource = { label: string; url: string; text: string }

export type GrantEditorProps = {
  grant: GrantEditorGrant
  mode: 'review' | 'edit'   // review = unpublished (Confirm & Publish); edit = published (Save changes)

  // Field state — parent owns
  getVal: (field: string, fallback: string | boolean | number | null) => string | boolean | number | null | undefined
  setVal: (field: string, value: string | boolean | number | null) => void

  // Sources panel
  sources: GrantEditorSource[]
  sourcesOpen: boolean
  onToggleSources: () => void
  onAddSource: () => void
  onUpdateSource: (idx: number, field: 'label' | 'url' | 'text', value: string) => void
  onRemoveSource: (idx: number) => void

  // Detect / populate actions
  onDetectAll:           () => void
  onDetectLocation:      () => void
  onDetectEligibility:   () => void
  onPopulateFromBrief:   () => void

  // Enrichment
  enrichingNow:                boolean
  /** True while Detect all is running the LLM classifier — fills sectors,
   *  niche tags and beneficiaries. Drives the Detect-all button spinner. */
  classifyingNow?:             boolean
  enrichError:                 string | null
  onEnrich:                    () => void
  onEnrichWithSources:         () => void
  onMarkBetweenRoundsAndWatch: () => void

  // Final actions
  publishing: boolean
  onCancel:   () => void
  onSave:     () => void   // mode === 'edit'
  onPublish:  () => void   // mode === 'review'
}

// ── Taxonomies ────────────────────────────────────────────────────────────────
// Co-located with the editor so future Phase C work can split them out into
// a single canonical taxonomy module without changing every consumer.

const STRUCTURE_OPTIONS: { value: string; label: string }[] = [
  { value: 'social_enterprise_broad', label: 'Social Enterprise (broad)' },
  { value: 'registered_charity',      label: 'Registered Charity' },
  { value: 'cio',                     label: 'CIO' },
  { value: 'cic_guarantee',           label: 'CIC (Guarantee)' },
  { value: 'cic_shares',              label: 'CIC (Shares)' },
  { value: 'ltd_guarantee',           label: 'Ltd by Guarantee' },
  { value: 'ltd_shares',              label: 'Ltd by Shares' },
  { value: 'cooperative',             label: 'Co-op / CBS' },
  { value: 'unincorporated',          label: 'Unincorporated' },
  { value: 'sole_trader',             label: 'Sole Trader / Individual' },
  { value: 'llp',                     label: 'LLP' },
]

const FUNDER_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'trust_foundation',     label: 'Trust / Foundation' },
  { value: 'community_foundation', label: 'Community Foundation' },
  { value: 'corporate_foundation', label: 'Corporate Foundation' },
  { value: 'local_authority',      label: 'Local Authority' },
  { value: 'corporate',            label: 'Corporate' },
  { value: 'lottery',              label: 'Lottery' },
  { value: 'government',           label: 'Government' },
  { value: 'capacity_builder',     label: 'Capacity Builder' },
  { value: 'competition',          label: 'Competition' },
  { value: 'loan',                 label: 'Loan' },
  { value: 'other',                label: 'Other' },
]

const FUNDING_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'grant',      label: 'Grant' },
  { value: 'programme',  label: 'Programme' },
  { value: 'investment', label: 'Investment' },
  { value: 'in_kind',    label: 'In-Kind' },
]

// IMPACT_SECTOR_OPTIONS, BENEFICIARY_OPTIONS, SECTOR_SYNONYMS,
// BENEFICIARY_SYNONYMS, suggestTags, buildBriefText, labelFor all live in
// src/lib/tag-suggestions.ts so the server-side audit route can share them.

// ── Tag suggestion display ───────────────────────────────────────────────────
// The matching logic lives in src/lib/tag-suggestions.ts (shared with the
// /api/admin/audit-tag-agreement route). This component just renders the
// missing / extra arrays that suggestTags() returns.

function TagSuggestions({
  options,
  missing,
  extra,
  onAdd,
}: {
  options: TagOption[]
  missing: string[]
  extra:   string[]
  onAdd:   (value: string) => void
}) {
  if (missing.length === 0 && extra.length === 0) return null
  return (
    <div className="mt-1.5 space-y-1">
      {missing.length > 0 && (
        <div className="flex items-baseline gap-1.5 flex-wrap text-[11px]">
          <span className="text-amber-700 font-medium">Brief mentions:</span>
          {missing.map(v => (
            <button
              key={v}
              type="button"
              onClick={() => onAdd(v)}
              className="underline underline-offset-2 text-amber-700 hover:text-amber-900"
              title={`Add ${labelFor(options, v)} (click to tag)`}
            >
              {labelFor(options, v)}
            </button>
          ))}
          <span className="text-light">— click to add</span>
        </div>
      )}
      {extra.length > 0 && (
        <div className="flex items-baseline gap-1.5 flex-wrap text-[11px]">
          <span className="text-mid font-medium">Tagged but not obvious in brief:</span>
          {extra.map(v => (
            <span key={v} className="text-mid italic">{labelFor(options, v)}</span>
          ))}
          <span className="text-light">— verify</span>
        </div>
      )}
    </div>
  )
}

// ── Provenance helpers ───────────────────────────────────────────────────────

function relTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (!then || Number.isNaN(then)) return ''
  const diffMs = Date.now() - then
  if (diffMs < 0) return 'just now'
  const m = Math.floor(diffMs / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 14) return `${d}d ago`
  const w = Math.floor(d / 7)
  if (w < 8) return `${w}w ago`
  return `${Math.floor(d / 30)}mo ago`
}

function sourceLabel(source: string): string {
  // "scraper:gov_uk" → "gov_uk"
  // "admin:foo@bar"  → "admin"
  // "ai_classifier:v3" → "ai classifier"
  const [type, rest] = source.split(':', 2)
  if (type === 'admin')         return 'admin'
  if (type === 'scraper')       return rest ?? 'scraper'
  if (type === '360giving')     return '360giving'
  if (type === 'ai_classifier') return 'AI classifier'
  if (type === 'ai_enrich')     return 'AI enrich'
  if (type === 'ai_detect')     return 'AI detect'
  if (type === 'ai_audit')      return 'AI audit'
  if (type === 'system')        return rest?.replace(/:.*/, '') ?? 'system'
  if (type === 'seed')          return 'seed'
  if (type === 'discovery')     return rest ?? 'discovery'
  return type
}

// Pipeline v1 Phase 5 — confidence colour ramp for citation chips.
// Discrete 3-level scheme keeps the visual hierarchy clear at a glance:
// HIGH (sage)   → glance and accept
// MED  (amber)  → spot-check the snippet
// LOW  (coral)  → must read the snippet + reason before approving
const CONFIDENCE_STYLES = {
  high: { bg: 'var(--state-success-pale)', fg: 'var(--state-success)', border: '#8ECB3C66', label: 'HIGH' },
  med:  { bg: 'var(--state-warning-pale)', fg: 'var(--state-warning)', border: '#EF9F2766', label: 'MED'  },
  low:  { bg: 'var(--state-error-pale)', fg: 'var(--state-error)', border: '#D85A3066', label: 'LOW'  },
} as const

function ConfidenceChip({ citation }: { citation: NonNullable<ProvenanceEntry['citation']> }) {
  const style = CONFIDENCE_STYLES[citation.confidence] ?? CONFIDENCE_STYLES.low
  const titleParts = [`Confidence: ${citation.confidence.toUpperCase()}`]
  if (citation.snippet) titleParts.push(`\nCited source phrase:\n"${citation.snippet}"`)
  if (citation.reason)  titleParts.push(`\nReason: ${citation.reason}`)
  return (
    <span
      className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider cursor-help"
      style={{ background: style.bg, color: style.fg, border: `1px solid ${style.border}` }}
      title={titleParts.join('\n')}
    >
      {style.label}
    </span>
  )
}

function ProvBadge({ entry }: { entry: ProvenanceEntry | undefined }) {
  if (!entry) return null
  const pinned = entry.pinned === true
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {entry.citation && <ConfidenceChip citation={entry.citation} />}
      <span
        className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded"
        style={{
          background:    pinned ? 'var(--state-success-pale)' : 'var(--surface-sunken)',
          color:         pinned ? 'var(--state-success)' : 'var(--text-muted)',
          border:        `1px solid ${pinned ? '#8ECB3C44' : 'var(--border-warm)'}`,
        }}
        title={`Source: ${entry.source}${entry.backfilled ? ' (backfilled)' : ''}\nSet: ${entry.set_at}${pinned ? '\nPinned by admin — survives scraper runs' : ''}`}
      >
        {pinned && '📌 '}
        {sourceLabel(entry.source)}
        <span className="text-light"> · {relTime(entry.set_at)}</span>
      </span>
    </span>
  )
}

// ── Chip multi-select ─────────────────────────────────────────────────────────

function ChipMultiSelect({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[]
  value: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => {
        const active = value.includes(opt.value)
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              const next = active
                ? value.filter(v => v !== opt.value)
                : [...value, opt.value]
              onChange(next)
            }}
            className="text-xs px-2.5 py-1 rounded-full font-medium transition-colors"
            style={{
              background:  active ? '#8ECB3C' : 'var(--surface-card)',
              color:       active ? 'var(--deep)' : 'var(--text-muted)',
              border:      `1px solid ${active ? '#8ECB3C' : 'var(--border-warm)'}`,
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Completeness scorecard ───────────────────────────────────────────────────
// Counts populated tracked fields. Each grant has 18 trackable fields; we
// surface the most user-relevant 11 as the "core" set the admin should fill.

const CORE_FIELDS: { field: string; label: string }[] = [
  { field: 'title',                 label: 'Title' },
  { field: 'funder',                label: 'Funder' },
  { field: 'funder_type',           label: 'Funder type' },
  { field: 'funding_type',          label: 'Funding type' },
  { field: 'apply_url',             label: 'Apply URL' },
  { field: 'description',           label: 'Description' },
  { field: 'amount_max',            label: 'Amount (max)' },
  { field: 'deadline',              label: 'Deadline / rolling' },
  { field: 'location_tag',          label: 'Location tag' },
  { field: 'eligible_structures',   label: 'Eligible structures' },
  { field: 'funder_brief',          label: 'Funder brief' },
]

function isPopulated(grant: GrantEditorGrant, field: string): boolean {
  // is_rolling acts as a substitute for deadline
  if (field === 'deadline') {
    return !!(grant.deadline || grant.is_rolling)
  }
  const v = (grant as unknown as Record<string, unknown>)[field]
  if (v === null || v === undefined) return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'string') return v.trim().length > 0
  if (typeof v === 'object') return Object.keys(v).length > 0
  return true
}

function Completeness({ grant }: { grant: GrantEditorGrant }) {
  const filled  = CORE_FIELDS.filter(f => isPopulated(grant, f.field)).length
  const missing = CORE_FIELDS.filter(f => !isPopulated(grant, f.field))
  const total   = CORE_FIELDS.length
  const pct     = Math.round((filled / total) * 100)
  const colour  = filled === total ? 'var(--state-success)' : filled >= total * 0.7 ? 'var(--text-muted)' : 'var(--state-error)'

  return (
    <div
      className="rounded-lg p-3 text-xs"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border-warm)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-charcoal">Completeness</span>
        <span className="font-bold" style={{ color: colour }}>{filled} / {total}</span>
      </div>
      <div className="h-1 rounded-full mb-2 overflow-hidden" style={{ background: 'var(--surface-sunken)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: colour }} />
      </div>
      {missing.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-mid uppercase tracking-wide mb-1">Missing</p>
          <ul className="space-y-0.5">
            {missing.map(m => (
              <li key={m.field} className="text-[11px] text-mid">· {m.label}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Field row helper ─────────────────────────────────────────────────────────

function FieldLabel({ field, grant, children }: { field: string; grant: GrantEditorGrant; children: React.ReactNode }) {
  const prov = grant.field_provenance?.[field]
  return (
    <div className="flex items-center justify-between mb-0.5 gap-2 flex-wrap">
      <label className="text-mid text-xs">{children}</label>
      {TRACKED_FIELDS.includes(field as typeof TRACKED_FIELDS[number]) && <ProvBadge entry={prov} />}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export function GrantEditor(props: GrantEditorProps) {
  const {
    grant, mode,
    getVal, setVal,
    sources, sourcesOpen,
    onToggleSources, onAddSource, onUpdateSource, onRemoveSource,
    onDetectAll, onDetectLocation, onDetectEligibility, onPopulateFromBrief,
    enrichingNow, classifyingNow, enrichError,
    onEnrich, onEnrichWithSources, onMarkBetweenRoundsAndWatch,
    publishing, onCancel, onSave, onPublish,
  } = props

  // eligible_structures: parent stores as JSON string; we present as array.
  const structuresValue: string[] = (() => {
    const v = getVal('eligible_structures', null)
    if (v != null) {
      try { return JSON.parse(String(v)) as string[] } catch { return [] }
    }
    return grant.eligible_structures ?? []
  })()

  // impact_sectors + target_beneficiaries: same JSON-string pattern.
  const sectorsValue: string[] = (() => {
    const v = getVal('impact_sectors', null)
    if (v != null) {
      try { return JSON.parse(String(v)) as string[] } catch { return [] }
    }
    return grant.impact_sectors ?? []
  })()
  const beneficiariesValue: string[] = (() => {
    const v = getVal('target_beneficiaries', null)
    if (v != null) {
      try { return JSON.parse(String(v)) as string[] } catch { return [] }
    }
    return grant.target_beneficiaries ?? []
  })()

  // Tag-suggestion: cross-check current chip values against brief text.
  // Surfaces classifier misses and over-tags so the admin can verify in seconds.
  const briefText        = buildBriefText(grant)
  const sectorSugg       = suggestTags(IMPACT_SECTOR_OPTIONS, sectorsValue,       briefText, SECTOR_SYNONYMS)
  const beneficiarySugg  = suggestTags(BENEFICIARY_OPTIONS,   beneficiariesValue, briefText, BENEFICIARY_SYNONYMS)

  // Pipeline v1 Phase 5 — row-level confidence summary.
  // Aggregates citations from row-column field_provenance + funder_brief
  // sub-field citations. Gives an at-a-glance read of "how much should I
  // scrutinise this row".
  const confidenceSummary = (() => {
    let high = 0, med = 0, low = 0
    const prov = grant.field_provenance ?? {}
    for (const entry of Object.values(prov)) {
      const c = entry?.citation?.confidence
      if (c === 'high') high++
      else if (c === 'med') med++
      else if (c === 'low') low++
    }
    const briefCitations = (grant.funder_brief as Record<string, unknown> | null | undefined)?._citations as Record<string, { confidence: 'high' | 'med' | 'low' }> | undefined
    if (briefCitations) {
      for (const c of Object.values(briefCitations)) {
        if (c?.confidence === 'high') high++
        else if (c?.confidence === 'med') med++
        else if (c?.confidence === 'low') low++
      }
    }
    return { high, med, low, total: high + med + low }
  })()

  return (
    <div className="mx-3 mb-1 rounded-xl border border-forest/20 bg-surface-page p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-forest">
            {mode === 'review' ? 'Review & edit before publishing' : 'Review & edit fields'}
          </p>
          {confidenceSummary.total > 0 && (
            <div
              className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full"
              style={{ background: 'var(--surface-card)', border: '1px solid var(--border-warm)', color: 'var(--text-muted)' }}
              title={`Citation coverage across ${confidenceSummary.total} AI-written field${confidenceSummary.total === 1 ? '' : 's'}.\nHIGH: AI quoted source verbatim — accept on glance.\nMED: implied, light inference — spot-check.\nLOW: inferred or no source — read snippet + reason before approving.`}
            >
              <span style={{ color: CONFIDENCE_STYLES.high.fg }}>● {confidenceSummary.high} high</span>
              {confidenceSummary.med > 0 && <span style={{ color: CONFIDENCE_STYLES.med.fg }}>● {confidenceSummary.med} med</span>}
              {confidenceSummary.low > 0 && <span style={{ color: CONFIDENCE_STYLES.low.fg }}>● {confidenceSummary.low} low</span>}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onDetectAll}
          disabled={classifyingNow}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full text-white transition-colors disabled:opacity-70"
          style={{ backgroundColor: 'var(--deep)' }}
        >
          {classifyingNow
            ? (<><RefreshCw className="w-3 h-3 animate-spin" /> Classifying…</>)
            : (<><Sparkles className="w-3 h-3" /> Detect all</>)
          }
        </button>
      </div>

      {/* Two-column layout: form on the left, completeness on the right */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4">
        <div>
          {/* Top grid: classification + amounts + deadline */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs mb-3">
            <div>
              <FieldLabel field="funder_type" grant={grant}>Funder type</FieldLabel>
              <select
                value={String(getVal('funder_type', grant.funder_type ?? ''))}
                onChange={e => setVal('funder_type', e.target.value)}
                className="form-select text-xs py-1 w-full"
              >
                {FUNDER_TYPE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>

            <div>
              <FieldLabel field="funding_type" grant={grant}>Funding type</FieldLabel>
              <select
                value={String(getVal('funding_type', grant.funding_type ?? 'grant'))}
                onChange={e => setVal('funding_type', e.target.value)}
                className="form-select text-xs py-1 w-full"
              >
                {FUNDING_TYPE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>

            <div>
              <FieldLabel field="location_tag" grant={grant}>Location tag</FieldLabel>
              <input
                type="text"
                value={String(getVal('location_tag', grant.location_tag ?? ''))}
                onChange={e => setVal('location_tag', e.target.value)}
                className="form-input text-xs py-1 w-full"
                placeholder="e.g. UK, London, Sussex"
              />
            </div>

            <div>
              <FieldLabel field="amount_min" grant={grant}>Amount min (£)</FieldLabel>
              <input
                type="number"
                value={String(getVal('amount_min', grant.amount_min ?? ''))}
                onChange={e => setVal('amount_min', e.target.value)}
                className="form-input text-xs py-1 w-full"
                placeholder="e.g. 5000"
              />
            </div>

            <div>
              <FieldLabel field="amount_max" grant={grant}>Amount max (£)</FieldLabel>
              <input
                type="number"
                value={String(getVal('amount_max', grant.amount_max ?? ''))}
                onChange={e => setVal('amount_max', e.target.value)}
                className="form-input text-xs py-1 w-full"
                placeholder="e.g. 50000"
              />
            </div>

            <div>
              <FieldLabel field="deadline" grant={grant}>Deadline</FieldLabel>
              <input
                type="text"
                value={String(getVal('deadline', grant.deadline ?? ''))}
                onChange={e => {
                  setVal('deadline', e.target.value)
                  // Typing a deadline implies the grant isn't rolling.
                  if (e.target.value.trim()) {
                    setVal('is_rolling', false)
                    setVal('next_open_date', '')
                  }
                }}
                className="form-input text-xs py-1 w-full"
                placeholder="YYYY-MM-DD"
              />
            </div>
          </div>

          {/* Next opens */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs mb-3">
            <div className="sm:col-span-2">
              <FieldLabel field="next_open_date" grant={grant}>Next opens (between rounds)</FieldLabel>
              <input
                type="text"
                value={String(getVal('next_open_date', grant.next_open_date ?? ''))}
                onChange={e => {
                  setVal('next_open_date', e.target.value)
                  if (e.target.value.trim()) {
                    setVal('deadline', '')
                    setVal('is_rolling', false)
                  }
                }}
                className="form-input text-xs py-1 w-full"
                placeholder="e.g. TBC 2026 / September 2026 / Q3 2026"
              />
            </div>
          </div>

          {/* Booleans + detect-location */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`rolling-${mode}-${grant.id}`}
                checked={Boolean(getVal('is_rolling', grant.is_rolling ?? false))}
                onChange={e => {
                  setVal('is_rolling', e.target.checked)
                  if (e.target.checked) setVal('deadline', '')
                }}
                className="h-3.5 w-3.5 accent-forest"
              />
              <label htmlFor={`rolling-${mode}-${grant.id}`} className="text-xs text-mid cursor-pointer">Rolling deadline</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`invite-${mode}-${grant.id}`}
                checked={Boolean(getVal('is_invite_only', grant.is_invite_only))}
                onChange={e => setVal('is_invite_only', e.target.checked)}
                className="h-3.5 w-3.5 accent-forest"
              />
              <label htmlFor={`invite-${mode}-${grant.id}`} className="text-xs text-mid cursor-pointer">Invite only</label>
            </div>
            <button
              type="button"
              onClick={onDetectLocation}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border border-forest/30 text-forest hover:bg-forest/10 transition-colors"
            >
              <MapPin className="w-3 h-3" /> Detect location
            </button>
          </div>

          {/* Eligible structures — chip checkboxes (no more JSON strings in UI) */}
          <div className="mt-3 pt-3 border-t border-forest/10">
            <div className="flex items-center justify-between mb-2">
              <FieldLabel field="eligible_structures" grant={grant}>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-forest">Eligible structures</span>
              </FieldLabel>
              <button
                type="button"
                onClick={onDetectEligibility}
                className="flex items-center gap-1 text-xs font-semibold text-forest hover:text-sage-deep transition-colors"
              >
                <Sparkles className="w-3 h-3" /> Detect
              </button>
            </div>
            <ChipMultiSelect
              options={STRUCTURE_OPTIONS}
              value={structuresValue}
              onChange={next => setVal('eligible_structures', JSON.stringify(next))}
            />
          </div>

          {/* Impact sectors — chip checkboxes + brief-vs-tags disagreement check */}
          <div className="mt-3 pt-3 border-t border-forest/10">
            <FieldLabel field="impact_sectors" grant={grant}>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-forest">Impact sectors</span>
            </FieldLabel>
            <ChipMultiSelect
              options={IMPACT_SECTOR_OPTIONS}
              value={sectorsValue}
              onChange={next => setVal('impact_sectors', JSON.stringify(next))}
            />
            <TagSuggestions
              options={IMPACT_SECTOR_OPTIONS}
              missing={sectorSugg.missing}
              extra={sectorSugg.extra}
              onAdd={v => setVal('impact_sectors', JSON.stringify([...sectorsValue, v]))}
            />
          </div>

          {/* Target beneficiaries — chip checkboxes + disagreement check */}
          <div className="mt-3 pt-3 border-t border-forest/10">
            <FieldLabel field="target_beneficiaries" grant={grant}>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-forest">Target beneficiaries</span>
            </FieldLabel>
            <ChipMultiSelect
              options={BENEFICIARY_OPTIONS}
              value={beneficiariesValue}
              onChange={next => setVal('target_beneficiaries', JSON.stringify(next))}
            />
            <TagSuggestions
              options={BENEFICIARY_OPTIONS}
              missing={beneficiarySugg.missing}
              extra={beneficiarySugg.extra}
              onAdd={v => setVal('target_beneficiaries', JSON.stringify([...beneficiariesValue, v]))}
            />
          </div>
        </div>

        {/* Right rail: completeness scorecard */}
        <div className="lg:sticky lg:top-3 lg:self-start">
          <Completeness grant={grant} />
        </div>
      </div>

      {/* Enrich / sources actions */}
      <div className="flex items-center gap-3 pt-3 mt-3 border-t border-forest/10 flex-wrap">
        <button
          type="button"
          onClick={onEnrich}
          disabled={enrichingNow}
          className="flex items-center gap-1.5 rounded-full border border-forest/40 px-3 py-1.5 text-xs font-semibold text-forest hover:bg-forest/10 transition-colors disabled:opacity-40"
        >
          <Sparkles className="w-3 h-3" />
          {enrichingNow ? 'Enriching…' : grant.funder_brief ? 'Re-enrich' : 'Enrich'}
        </button>
        {grant.funder_brief && (
          <>
            <span className="text-xs text-sage-deep font-medium">✓ Enriched</span>
            <button
              type="button"
              onClick={onPopulateFromBrief}
              className="text-xs font-semibold text-amber-600 hover:text-amber-700 underline underline-offset-2 transition-colors"
            >
              Populate fields
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onMarkBetweenRoundsAndWatch}
          title="Mark as between rounds, clear the deadline, and add the listing page to the watchlist for change detection"
          className="text-xs font-semibold text-mid hover:text-forest underline underline-offset-2 transition-colors"
        >
          Between rounds + watch
        </button>
        {enrichError && <span className="text-xs text-coral-saturated">{enrichError}</span>}
        <button
          type="button"
          onClick={onToggleSources}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border rounded-full transition-colors ml-auto"
          style={{
            borderColor:     sourcesOpen ? 'var(--deep)'                  : 'var(--border-warm)',
            color:           sourcesOpen ? 'var(--deep)'                  : 'var(--text-muted)',
            backgroundColor: sourcesOpen ? 'rgba(31,92,82,0.08)'      : 'white',
          }}
        >
          <BookOpen className="w-3 h-3" />
          {sources.length > 0 ? `${sources.length} source${sources.length > 1 ? 's' : ''}` : 'Sources'}
        </button>
      </div>

      {/* Sources panel */}
      {sourcesOpen && (
        <div className="mt-2 p-3 rounded-lg border border-border-warm bg-surface-page space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-charcoal">Additional sources</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onAddSource}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white rounded-full"
                style={{ backgroundColor: 'var(--deep)' }}
              >
                <PlusCircle className="w-3 h-3" />Add source
              </button>
              {sources.length > 0 && (
                <button
                  type="button"
                  onClick={onEnrichWithSources}
                  disabled={enrichingNow}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full disabled:opacity-40"
                  style={{ backgroundColor: '#8ECB3C', color: 'var(--text-body)' }}
                >
                  <Sparkles className="w-3 h-3" />{enrichingNow ? 'Enriching…' : 'Enrich with sources'}
                </button>
              )}
            </div>
          </div>
          {sources.length === 0 && (
            <p className="text-xs text-light italic">Add a URL or paste content to improve enrichment quality.</p>
          )}
          {sources.map((src, idx) => (
            <div key={idx} className="bg-white border border-border-warm p-2 rounded-lg space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Label (optional)"
                  value={src.label}
                  onChange={e => onUpdateSource(idx, 'label', e.target.value)}
                  className="flex-1 text-xs border border-border-warm rounded px-2 py-1 outline-none focus:border-forest"
                />
                <button
                  type="button"
                  onClick={() => onRemoveSource(idx)}
                  className="text-light hover:text-coral-saturated transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <input
                type="url"
                placeholder="URL (fetched automatically)"
                value={src.url}
                onChange={e => onUpdateSource(idx, 'url', e.target.value)}
                className="w-full text-xs border border-border-warm rounded px-2 py-1 outline-none focus:border-forest"
              />
              <textarea
                placeholder="Or paste content directly…"
                value={src.text}
                onChange={e => onUpdateSource(idx, 'text', e.target.value)}
                rows={2}
                className="w-full text-xs border border-border-warm rounded px-2 py-1 outline-none focus:border-forest resize-none"
              />
            </div>
          ))}
        </div>
      )}

      {/* Funder brief preview */}
      {grant.funder_brief && (() => {
        const brief = grant.funder_brief as Record<string, unknown>
        const LABELS: Record<string, string> = {
          what_they_fund:     'What they fund',
          who_can_apply:      'Who can apply',
          geographic_focus:   'Geographic focus',
          priorities:         'Priorities',
          strong_application: 'Strong application',
          exclusions:         'Exclusions',
          typical_award:      'Typical award',
          decision_timeline:  'Decision timeline',
          funder_tips:        'Tips',
        }
        // Pipeline v1 — per-sub-field citations live INSIDE the brief blob
        // (funder_brief._citations). Surface alongside each sub-field so the
        // admin can spot-check a snippet without leaving the row.
        const briefCitations = (brief._citations as Record<string, NonNullable<ProvenanceEntry['citation']>> | null | undefined) ?? {}
        const entries = Object.entries(LABELS)
          .filter(([k]) => brief[k])
          .map(([k, label]) => ({ key: k, label, value: brief[k] as string, citation: briefCitations[k] }))
        if (entries.length === 0) return null
        return (
          <div className="mt-3 pt-3 border-t border-forest/10 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-forest">Funder intelligence</p>
              <ProvBadge entry={grant.field_provenance?.funder_brief} />
            </div>
            {entries.map(({ key, label, value, citation }) => (
              <div key={key}>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-[10px] font-semibold text-mid uppercase tracking-wide">{label}</p>
                  {citation && <ConfidenceChip citation={citation} />}
                </div>
                <p className="text-xs text-charcoal leading-relaxed">{value}</p>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Final actions */}
      <div className="flex items-center gap-3 pt-3 mt-3 border-t border-forest/10">
        <div className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-warm px-3 py-1.5 text-xs font-semibold text-mid hover:border-charcoal transition-colors"
        >
          Cancel
        </button>
        {mode === 'review' ? (
          <button
            type="button"
            onClick={onPublish}
            disabled={publishing}
            className="rounded-full bg-forest px-4 py-1.5 text-xs font-semibold text-white hover:bg-sage-deep transition-colors disabled:opacity-40"
          >
            {publishing ? 'Publishing…' : '✓ Confirm & Publish'}
          </button>
        ) : (
          <button
            type="button"
            onClick={onSave}
            disabled={publishing}
            className="rounded-full bg-forest px-4 py-1.5 text-xs font-semibold text-white hover:bg-sage-deep transition-colors disabled:opacity-40"
          >
            {publishing ? 'Saving…' : '✓ Save changes'}
          </button>
        )}
      </div>
    </div>
  )
}

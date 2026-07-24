'use client'

import React, { useState, useEffect } from 'react'
import NextLink from 'next/link'
import { PIPELINE_STAGES, formatRange } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { PipelineItem, PipelineStage } from '@/types'
import {
  Search, Pencil, Send, Trophy, XCircle, X as XIcon, Circle, FileText,
  PenLine, RefreshCw, Eye, CheckCircle2, Trash2,
} from 'lucide-react'

// ── Stage icons (also used by the Pipeline kanban) ───────────────────────────

export const STAGE_ICONS: Record<string, React.ReactNode> = {
  identified: <Search size={13} strokeWidth={2.5} />,
  applying:   <Pencil  size={13} strokeWidth={2.5} />,
  submitted:  <Send    size={13} strokeWidth={2.5} />,
  won:        <Trophy  size={13} strokeWidth={2.5} />,
  declined:   <XCircle size={13} strokeWidth={2.5} />,
}

// ── Writing-progress ladder ──────────────────────────────────────────────────

const WRITING_STAGE_ICONS: Record<number, React.ReactNode> = {
  0:   <Circle       size={14} strokeWidth={2} />,
  17:  <Search       size={14} strokeWidth={2} />,
  33:  <FileText     size={14} strokeWidth={2} />,
  50:  <PenLine      size={14} strokeWidth={2} />,
  67:  <RefreshCw    size={14} strokeWidth={2} />,
  83:  <Eye          size={14} strokeWidth={2} />,
  100: <CheckCircle2 size={14} strokeWidth={2} />,
}

const WRITING_STAGES = [
  { label: 'Not started', value: 0,   emoji: '○',  colour: 'text-light' },
  { label: 'Research',    value: 17,  emoji: '🔍', colour: 'text-sage-deep' },
  { label: 'Outline',     value: 33,  emoji: '📝', colour: 'text-amber-500' },
  { label: 'First draft', value: 50,  emoji: '✏️', colour: 'text-amber-saturated' },
  { label: 'Revising',    value: 67,  emoji: '🔄', colour: 'text-orange-500' },
  { label: 'Review',      value: 83,  emoji: '👀', colour: 'text-sage-deep' },
  { label: 'Final',       value: 100, emoji: '✅', colour: 'text-forest' },
] as const

export function getWritingStage(progress: number | null) {
  if (progress == null) return WRITING_STAGES[0]
  return WRITING_STAGES.reduce((best, s) =>
    Math.abs(s.value - progress) < Math.abs(best.value - progress) ? s : best
  )
}

// ── Detail Modal ─────────────────────────────────────────────────────────────

export function PipelineModal({
  item,
  onClose,
  onSave,
  onDelete,
  onMove,
}: {
  item: PipelineItem
  onClose: () => void
  onSave: (id: string, updates: Partial<PipelineItem>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onMove: (id: string, stage: PipelineStage) => void
}) {
  const [localStage, setLocalStage] = useState<PipelineStage>(item.stage)
  const isApplyingOrLater = ['applying', 'submitted', 'won', 'declined'].includes(localStage)

  const [notes, setNotes] = useState(item.notes ?? '')
  const [progress, setProgress] = useState(getWritingStage(item.application_progress).value)
  const [deadline, setDeadline] = useState(item.deadline ?? '')
  const [amountMin, setAmountMin] = useState(item.amount_min != null ? String(item.amount_min) : '')
  const [amountMax, setAmountMax] = useState(item.amount_max != null ? String(item.amount_max) : (item.amount_requested != null ? String(item.amount_requested) : ''))
  const [amountRequested, setAmountRequested] = useState(
    item.amount_requested != null ? String(item.amount_requested) :
    item.amount_max != null      ? String(item.amount_max) : ''
  )
  const [isUrgent, setIsUrgent] = useState(item.is_urgent)
  const [contactName, setContactName] = useState(item.contact_name ?? '')
  const [contactEmail, setContactEmail] = useState(item.contact_email ?? '')
  const [grantUrl, setGrantUrl] = useState(item.grant_url ?? '')
  const [saving, setSaving] = useState(false)

  // Pull a summary from the live catalogue by matching the grant's apply URL.
  // Pipeline rows don't store the catalogue id, so URL is the reliable join;
  // manual adds / delisted grants won't match and fall back gracefully.
  const [catalogue, setCatalogue] = useState<{ pinId: string; isActive: boolean; description: string | null; sectors: string[] } | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoadingSummary(true)
    ;(async () => {
      const supabase = createClient()
      const cols = 'id, external_id, is_active, description, impact_sectors, sectors'
      type Row = { id: string; external_id: string | null; is_active: boolean | null; description: string | null; impact_sectors: string[] | null; sectors: string[] | null }
      let row: Row | undefined
      // Primary: exact title + funder (how pipeline items are created from the
      // catalogue, so this is the reliable join). Active preferred.
      if (item.grant_name && item.funder_name) {
        const { data } = await supabase.from('grants_with_funder').select(cols)
          .eq('title', item.grant_name).eq('funder', item.funder_name)
          .order('is_active', { ascending: false }).limit(1)
        row = data?.[0] as Row | undefined
      }
      // Fallback: match by apply URL (e.g. if the name was edited).
      if (!row && item.grant_url) {
        const { data } = await supabase.from('grants_with_funder').select(cols)
          .eq('apply_url', item.grant_url)
          .order('is_active', { ascending: false }).limit(1)
        row = data?.[0] as Row | undefined
      }
      if (cancelled) return
      if (row) {
        const raw = (row.impact_sectors?.length ? row.impact_sectors : row.sectors) ?? []
        // Pin by the normalised id (external_id ?? id) — that's what the search
        // page keys grants on, so ?grant= lifts the exact grant to the top.
        setCatalogue({ pinId: row.external_id ?? row.id, isActive: !!row.is_active, description: row.description ?? null, sectors: raw.map(s => s.replace(/_/g, ' ')) })
      } else {
        setCatalogue(null)
      }
      setLoadingSummary(false)
    })()
    return () => { cancelled = true }
  }, [item.grant_name, item.funder_name, item.grant_url])

  async function handleSave() {
    setSaving(true)
    if (isApplyingOrLater) {
      await onSave(item.id, {
        notes,
        application_progress: progress,
        deadline: deadline || null,
        amount_requested: amountRequested ? Number(amountRequested) : null,
        amount_min: null,
        amount_max: amountRequested ? Number(amountRequested) : null,
        is_urgent: isUrgent,
        contact_name: contactName || null,
        contact_email: contactEmail || null,
        grant_url: grantUrl || null,
      })
    } else {
      await onSave(item.id, {
        notes,
        application_progress: progress,
        deadline: deadline || null,
        amount_min: amountMin ? Number(amountMin) : null,
        amount_max: amountMax ? Number(amountMax) : null,
        amount_requested: amountMax ? Number(amountMax) : null,
        is_urgent: isUrgent,
        contact_name: contactName || null,
        contact_email: contactEmail || null,
        grant_url: grantUrl || null,
      })
    }
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl" style={{ boxShadow: '0 16px 64px rgba(26,46,43,0.18)' }} onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-[#E8E0D1] flex justify-between items-start" style={{ background: '#FAFAF7' }}>
          <div>
            <h3 className="text-xl font-bold text-charcoal leading-snug" style={{ fontFamily: "var(--font-space-grotesk)" }}>{item.grant_name}</h3>
            <p className="text-sm text-mid mt-0.5">{item.funder_name}</p>
          </div>
          <button onClick={onClose} className="flex-shrink-0 flex items-center justify-center transition-colors" style={{ width: 32, height: 32, color: '#8A8986', background: 'none', border: 'none', cursor: 'pointer', marginTop: 2 }} onMouseEnter={e => e.currentTarget.style.color = '#2C2C2A'} onMouseLeave={e => e.currentTarget.style.color = '#8A8986'}>
            <XIcon size={20} strokeWidth={2} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* About this grant — summary pulled from the live catalogue by URL,
              plus a link to its Find Funding card. Shown for all stages. */}
          <div style={{ background: '#F1F7E4', border: '0.5px solid rgba(57,109,17,0.18)', borderRadius: 10, padding: '12px 14px' }}>
            <div className="flex items-center justify-between gap-3" style={{ marginBottom: 8 }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#3B6D11', margin: 0 }}>About this grant</p>
              {loadingSummary ? null : catalogue ? (
                <NextLink
                  href={`/dashboard/search?grant=${encodeURIComponent(catalogue.pinId)}`}
                  style={{ fontSize: 12, fontWeight: 600, color: '#3B6D11', textDecoration: 'none', whiteSpace: 'nowrap' }}
                >
                  View in Find Funding →
                </NextLink>
              ) : item.grant_url ? (
                <a
                  href={item.grant_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, fontWeight: 600, color: '#3B6D11', textDecoration: 'none', whiteSpace: 'nowrap' }}
                >
                  Visit funder site →
                </a>
              ) : null}
            </div>
            {loadingSummary ? (
              <p className="text-xs" style={{ color: '#8A8986', margin: 0 }}>Loading summary…</p>
            ) : catalogue?.description ? (
              <>
                <p className="text-sm line-clamp-4" style={{ color: '#2C2C2A', lineHeight: 1.5, margin: 0 }}>{catalogue.description}</p>
                {catalogue.sectors.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {catalogue.sectors.slice(0, 4).map(s => (
                      <span key={s} style={{ fontSize: 11, background: '#fff', color: '#3B6D11', border: '0.5px solid rgba(57,109,17,0.2)', borderRadius: 999, padding: '2px 8px', textTransform: 'capitalize' }}>{s}</span>
                    ))}
                  </div>
                )}
                {!catalogue.isActive && (
                  <p className="text-xs" style={{ color: '#8A8986', margin: '8px 0 0' }}>This grant has closed — it&apos;s no longer in the live catalogue. Opening it in Find Funding shows it as no longer open.</p>
                )}
              </>
            ) : (
              <p className="text-xs" style={{ color: '#8A8986', margin: 0 }}>Not in the live catalogue (added manually or no longer listed) — use the funder site link if available.</p>
            )}
          </div>

          {/* Amount & Deadline */}
          {isApplyingOrLater ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider block mb-1" style={{ color: '#5F5E5A' }}>Amount requested</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mid text-sm">£</span>
                  <input type="number" min="0" value={amountRequested} onChange={e => setAmountRequested(e.target.value)}
                    className="form-input text-sm" style={{ paddingTop: 10, paddingBottom: 10, paddingLeft: 24, minHeight: 40 }} placeholder="0" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider block mb-1" style={{ color: '#5F5E5A' }}>Deadline</label>
                <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
                  className="form-input text-sm" style={{ paddingTop: 10, paddingBottom: 10, paddingLeft: 8, minHeight: 40 }} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider block mb-1" style={{ color: '#5F5E5A' }}>Min amount</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mid text-sm">£</span>
                  <input type="number" min="0" value={amountMin} onChange={e => setAmountMin(e.target.value)}
                    className="form-input text-sm" style={{ paddingTop: 10, paddingBottom: 10, paddingLeft: 24, minHeight: 40 }} placeholder="0" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider block mb-1" style={{ color: '#5F5E5A' }}>Max amount</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mid text-sm">£</span>
                  <input type="number" min="0" value={amountMax} onChange={e => setAmountMax(e.target.value)}
                    className="form-input text-sm" style={{ paddingTop: 10, paddingBottom: 10, paddingLeft: 24, minHeight: 40 }} placeholder="0" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider block mb-1" style={{ color: '#5F5E5A' }}>Deadline</label>
                <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
                  className="form-input text-sm" style={{ paddingTop: 10, paddingBottom: 10, paddingLeft: 8, minHeight: 40 }} />
              </div>
            </div>
          )}
          {!isApplyingOrLater && (amountMin || amountMax) && (
            <p className="-mt-2" style={{ fontSize: 14, fontWeight: 500, color: '#3B6D11' }}>
              {formatRange(amountMin ? Number(amountMin) : null, amountMax ? Number(amountMax) : null)}
            </p>
          )}
          {isApplyingOrLater && amountRequested && (
            <p className="-mt-2" style={{ fontSize: 14, fontWeight: 500, color: '#3B6D11' }}>
              £{Number(amountRequested).toLocaleString('en-GB')} requested
            </p>
          )}

          {/* Move stage */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#5F5E5A' }}>Move to stage</p>
            <div className="grid grid-cols-3 gap-2">
              {PIPELINE_STAGES.map(s => {
                const isActive = localStage === s.id
                const tones: Record<string, { bg: string; text: string; restBorder: string; activeBorder: string }> = {
                  identified: { bg: '#F5F1E8', text: '#5F5E5A', restBorder: 'rgba(0,0,0,0.08)', activeBorder: '#8A8986' },
                  applying:   { bg: '#F1F7E4', text: '#3B6D11', restBorder: 'rgba(57,109,17,0.20)', activeBorder: '#3B6D11' },
                  submitted:  { bg: '#DFEDCC', text: '#3B6D11', restBorder: 'rgba(57,109,17,0.20)', activeBorder: '#3B6D11' },
                  won:        { bg: '#EAF3DE', text: '#3B6D11', restBorder: 'rgba(57,109,17,0.20)', activeBorder: '#8ECB3C' },
                  declined:   { bg: '#FAECE7', text: '#993C1D', restBorder: 'rgba(153,60,29,0.20)', activeBorder: '#993C1D' },
                }
                const tone = tones[s.id]
                return (
                  <button key={s.id}
                    onClick={() => { onMove(item.id, s.id); setLocalStage(s.id as PipelineStage) }}
                    style={{
                      background: tone.bg, color: tone.text,
                      border: `${isActive ? '1.5px' : '1px'} solid ${isActive ? tone.activeBorder : tone.restBorder}`,
                      padding: '8px', borderRadius: 8, fontSize: 12,
                      fontWeight: isActive ? 600 : 500,
                      transition: 'all 0.12s', fontFamily: 'inherit', cursor: 'pointer',
                    }}>
                    <span className="flex items-center justify-center gap-1.5">
                      {STAGE_ICONS[s.id]}
                      {s.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Writing progress */}
          <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)', paddingTop: 16 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#5F5E5A', margin: 0 }}>Writing progress</p>
              <span className="flex items-center gap-1.5" style={{ fontSize: 11, color: '#5F5E5A' }}>
                {getWritingStage(progress).label}
                {progress > 0 && <span style={{ color: '#8A8986' }}>· {progress}%</span>}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {WRITING_STAGES.map(s => {
                const isActive = getWritingStage(progress).value === s.value
                return (
                  <button key={s.value} type="button" onClick={() => setProgress(s.value)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '8px 4px',
                      background: isActive ? '#F1F7E4' : '#fff',
                      border: `1px solid ${isActive ? '#639922' : 'rgba(0,0,0,0.08)'}`,
                      borderRadius: 8, cursor: 'pointer', transition: 'all 0.12s', fontFamily: 'inherit',
                    }}>
                    <span style={{ color: isActive ? '#3B6D11' : '#8A8986' }}>
                      {WRITING_STAGE_ICONS[s.value]}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: isActive ? '#3B6D11' : '#5F5E5A', lineHeight: 1.3 }}>
                      {s.label}
                    </span>
                  </button>
                )
              })}
            </div>
            <div style={{ height: 6, background: 'rgba(57,109,17,0.15)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: '#639922', borderRadius: 3, transition: 'width 0.3s ease' }} />
            </div>
          </div>

          {/* Grant URL */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ color: '#5F5E5A' }}>Grant URL</label>
            <input type="url" value={grantUrl} onChange={e => setGrantUrl(e.target.value)}
              className="form-input text-sm" style={{ paddingTop: 10, paddingBottom: 10, minHeight: 40 }}
              placeholder="https://funder.org.uk/apply" />
          </div>

          {/* Contact */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#5F5E5A' }}>Funder contact</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-mid block mb-1">Name</label>
                <input type="text" value={contactName} onChange={e => setContactName(e.target.value)}
                  className="form-input text-sm" style={{ paddingTop: 10, paddingBottom: 10, minHeight: 40 }} placeholder="Jane Smith" />
              </div>
              <div>
                <label className="text-xs text-mid block mb-1">Email</label>
                <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)}
                  className="form-input text-sm" style={{ paddingTop: 10, paddingBottom: 10, minHeight: 40 }} placeholder="jane@funder.org" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ color: '#5F5E5A' }}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              className="form-textarea" placeholder="Add notes, key dates, requirements…"
              style={{ resize: 'vertical' }} />
          </div>

        </div>

        <div className="px-6 py-4 flex justify-between items-center" style={{ borderTop: '0.5px solid rgba(0,0,0,0.07)' }}>
          <button
            onClick={() => { if (confirm('Delete this opportunity?')) { onDelete(item.id); onClose() } }}
            className="flex items-center gap-1.5 text-sm transition-colors"
            style={{ color: '#993C1D', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0', fontFamily: 'inherit' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#7A2E14')}
            onMouseLeave={e => (e.currentTarget.style.color = '#993C1D')}
          >
            <Trash2 size={14} strokeWidth={2} />
            Delete
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} style={{ padding: '9px 16px', fontSize: 13, fontWeight: 500, background: '#fff', color: '#2C2C2A', border: '0.5px solid rgba(0,0,0,0.14)', borderRadius: 9999, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1 }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 18px', fontSize: 13, fontWeight: 600, background: '#8ECB3C', color: '#173404', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

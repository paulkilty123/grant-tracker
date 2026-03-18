'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getPipelineItems,
  updatePipelineStage,
  updatePipelineItem,
  createPipelineItem,
  deletePipelineItem,
} from '@/lib/pipeline'
import { getOrganisationByOwner } from '@/lib/organisations'
import { PIPELINE_STAGES, formatDeadline, formatRange, cn } from '@/lib/utils'
import type { PipelineItem, PipelineStage, Organisation } from '@/types'
import { Search, Pencil, Send, Trophy, XCircle, Sparkles, Loader2, Link, ArrowRight } from 'lucide-react'

const STAGE_ICONS: Record<string, React.ReactNode> = {
  identified: <Search size={13} strokeWidth={2.5} />,
  applying:   <Pencil  size={13} strokeWidth={2.5} />,
  submitted:  <Send    size={13} strokeWidth={2.5} />,
  won:        <Trophy  size={13} strokeWidth={2.5} />,
  declined:   <XCircle size={13} strokeWidth={2.5} />,
}


// ── Grant writing stages ──────────────────────

const WRITING_STAGES = [
  { label: 'Not started', value: 0,   emoji: '○',  colour: 'text-light' },
  { label: 'Research',    value: 17,  emoji: '🔍', colour: 'text-sage' },
  { label: 'Outline',     value: 33,  emoji: '📝', colour: 'text-amber-500' },
  { label: 'First draft', value: 50,  emoji: '✏️', colour: 'text-purple-500' },
  { label: 'Revising',    value: 67,  emoji: '🔄', colour: 'text-orange-500' },
  { label: 'Review',      value: 83,  emoji: '👀', colour: 'text-sage' },
  { label: 'Final',       value: 100, emoji: '✅', colour: 'text-forest' },
] as const

function getWritingStage(progress: number | null) {
  if (progress == null) return WRITING_STAGES[0]
  // Find closest stage
  return WRITING_STAGES.reduce((best, s) =>
    Math.abs(s.value - progress) < Math.abs(best.value - progress) ? s : best
  )
}

// ── Sub-components ────────────────────────────

function PipelineCard({
  item,
  stage,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  item: PipelineItem
  stage: typeof PIPELINE_STAGES[number]
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: (e: React.DragEvent) => void
  onClick: (item: PipelineItem) => void
}) {
  const amountStr = formatRange(item.amount_min, item.amount_max ?? item.amount_requested)
  const deadlineStr = formatDeadline(item.deadline)
  const isWon = stage.id === 'won'
  const isDeclined = stage.id === 'declined'

  const leftBorderColor =
    stage.id === 'identified'  ? '#9ba8a6' :
    stage.id === 'applying'    ? '#fb923c' :
    stage.id === 'submitted'   ? '#f59e0b' :
    stage.id === 'won'         ? '#1f5c52' :
                                 '#f87171'

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, item.id)}
      onDragEnd={onDragEnd}
      onClick={() => onClick(item)}
      className="pipeline-card"
      style={{ borderLeftColor: leftBorderColor }}
    >
      <p className="text-[10px] text-light font-semibold uppercase tracking-wider mb-1">{item.funder_name}</p>
      <p className="text-sm font-semibold text-charcoal leading-snug mb-1.5">{item.grant_name}</p>
      <p className={cn('text-sm font-bold',
        isWon ? 'text-forest' : isDeclined ? 'text-red-400' : 'text-gold'
      )}>
        {amountStr}{isWon ? ' ✓' : isDeclined ? ' ✗' : ''}
      </p>
      <p className={cn('text-[11px] mt-1', item.is_urgent ? 'text-red-500 font-semibold' : 'text-mid')}>
        {item.is_urgent && '⚠ '}{deadlineStr}
      </p>
      {item.application_progress != null && item.application_progress > 0 && (
        <div className="mt-2">
          <p className="text-[10px] text-light mb-0.5">{getWritingStage(item.application_progress).emoji} {getWritingStage(item.application_progress).label}</p>
          <div className="h-1 bg-warm overflow-hidden">
            <div
              className={cn('h-full transition-all', item.application_progress >= 83 ? 'bg-forest' : item.application_progress >= 50 ? 'bg-sage' : 'bg-amber-400')}
              style={{ width: `${item.application_progress}%` }}
            />
          </div>
        </div>
      )}
      {item.notes && (
        <p className="text-[10px] text-light mt-1.5 leading-snug line-clamp-2 italic">
          {item.notes}
        </p>
      )}
      {item.grant_url && (
        <a
          href={item.grant_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="inline-block mt-1.5 text-[10px] text-forest/70 hover:text-forest underline underline-offset-2 transition-colors"
        >
          Apply →
        </a>
      )}
    </div>
  )
}

// ── Detail Modal ──────────────────────────────

function PipelineModal({
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
  // Single "amount requested" used for applying stage and beyond
  const [amountRequested, setAmountRequested] = useState(
    item.amount_requested != null ? String(item.amount_requested) :
    item.amount_max != null      ? String(item.amount_max) : ''
  )
  const [isUrgent, setIsUrgent] = useState(item.is_urgent)
  const [contactName, setContactName] = useState(item.contact_name ?? '')
  const [contactEmail, setContactEmail] = useState(item.contact_email ?? '')
  const [grantUrl, setGrantUrl] = useState(item.grant_url ?? '')
  const [saving, setSaving] = useState(false)

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
      <div className="bg-white w-full max-w-lg max-h-[85vh] overflow-y-auto" style={{ boxShadow: '0 16px 64px rgba(26,46,43,0.18)' }} onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-warm flex justify-between items-start">
          <div>
            <h3 className="font-serif text-lg text-charcoal">{item.grant_name}</h3>
            <p className="text-sm text-mid mt-0.5">{item.funder_name}</p>
          </div>
          <button onClick={onClose} className="text-light hover:text-mid text-xl leading-none">✕</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Amount & Deadline */}
          {isApplyingOrLater ? (
            /* Applying / Submitted / Won / Declined — single amount requested */
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-light uppercase tracking-wider block mb-1">Amount requested (£)</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mid text-sm">£</span>
                  <input
                    type="number"
                    min="0"
                    value={amountRequested}
                    onChange={e => setAmountRequested(e.target.value)}
                    className="form-input text-sm py-1.5 pl-6"
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-light uppercase tracking-wider block mb-1">Deadline</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                  className="form-input text-sm py-1.5 px-2"
                />
              </div>
            </div>
          ) : (
            /* Identified / Researching — funder range */
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-light uppercase tracking-wider block mb-1">Min amount (£)</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mid text-sm">£</span>
                  <input
                    type="number"
                    min="0"
                    value={amountMin}
                    onChange={e => setAmountMin(e.target.value)}
                    className="form-input text-sm py-1.5 pl-6"
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-light uppercase tracking-wider block mb-1">Max amount (£)</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mid text-sm">£</span>
                  <input
                    type="number"
                    min="0"
                    value={amountMax}
                    onChange={e => setAmountMax(e.target.value)}
                    className="form-input text-sm py-1.5 pl-6"
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-light uppercase tracking-wider block mb-1">Deadline</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                  className="form-input text-sm py-1.5 px-2"
                />
              </div>
            </div>
          )}
          {!isApplyingOrLater && (amountMin || amountMax) && (
            <p className="text-xl font-bold text-gold -mt-2">
              {formatRange(amountMin ? Number(amountMin) : null, amountMax ? Number(amountMax) : null)}
            </p>
          )}
          {isApplyingOrLater && amountRequested && (
            <p className="text-xl font-bold text-gold -mt-2">
              £{Number(amountRequested).toLocaleString('en-GB')} requested
            </p>
          )}

          {/* Move stage */}
          <div>
            <p className="text-xs font-semibold text-light uppercase tracking-wider mb-2">Move to stage</p>
            <div className="grid grid-cols-3 gap-2">
              {PIPELINE_STAGES.map(s => (
                <button
                  key={s.id}
                  onClick={() => { onMove(item.id, s.id); setLocalStage(s.id as PipelineStage) }}
                  className={cn(
                    'py-2 px-2 border-2 text-xs font-medium transition-all text-center',
                    localStage === s.id
                      ? 'border-coral bg-coral/10 text-coral font-semibold'
                      : 'border-warm text-mid hover:border-coral hover:text-coral'
                  )}
                >
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Writing stage */}
          <div>
            <p className="text-xs font-semibold text-light uppercase tracking-wider mb-3">Writing progress</p>
            {/* Stage buttons */}
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {WRITING_STAGES.map(s => {
                const isActive = getWritingStage(progress).value === s.value
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setProgress(s.value)}
                    className={cn(
                      'flex flex-col items-center gap-1 py-2 px-1 border-2 text-center transition-all',
                      isActive
                        ? 'border-coral bg-coral/10'
                        : 'border-warm bg-white hover:border-coral/50 hover:bg-coral/5'
                    )}
                  >
                    <span className="text-base leading-none">{s.emoji}</span>
                    <span className={cn('text-[10px] font-semibold leading-tight', isActive ? 'text-forest' : 'text-mid')}>
                      {s.label}
                    </span>
                  </button>
                )
              })}
            </div>
            {/* Progress bar */}
            <div className="h-2 bg-warm overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-300',
                  progress >= 83 ? 'bg-forest' :
                  progress >= 50 ? 'bg-sage' :
                  progress > 0   ? 'bg-amber-400' : 'bg-warm'
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
            {progress > 0 && (
              <p className="text-xs text-mid mt-1.5 text-center">
                {getWritingStage(progress).emoji} {getWritingStage(progress).label} — {progress}% complete
              </p>
            )}
          </div>

          {/* Grant URL */}
          <div>
            <label className="text-xs font-semibold text-light uppercase tracking-wider block mb-2">Grant URL</label>
            <input
              type="url"
              value={grantUrl}
              onChange={e => setGrantUrl(e.target.value)}
              className="form-input text-sm py-1.5"
              placeholder="https://funder.org.uk/apply"
            />
          </div>

          {/* Contact */}
          <div>
            <p className="text-xs font-semibold text-light uppercase tracking-wider mb-2">Funder contact</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-mid block mb-1">Name</label>
                <input
                  type="text"
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  className="form-input text-sm py-1.5"
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className="text-xs text-mid block mb-1">Email</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  className="form-input text-sm py-1.5"
                  placeholder="jane@funder.org"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-light uppercase tracking-wider block mb-2">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="form-textarea"
              placeholder="Add notes, key dates, requirements…"
            />
          </div>

        </div>

        <div className="p-6 pt-0 flex justify-between items-center">
          <button
            onClick={() => { if (confirm('Delete this opportunity?')) { onDelete(item.id); onClose() } }}
            className="text-red-400 hover:text-red-600 text-sm transition-colors"
          >
            Delete
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-outline btn-sm">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary btn-sm">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Add Modal ─────────────────────────────────

function AddModal({
  orgId,
  userId,
  onClose,
  onAdd,
}: {
  orgId: string
  userId: string
  onClose: () => void
  onAdd: (item: PipelineItem) => void
}) {
  const [form, setForm] = useState({
    grant_name: '',
    funder_name: '',
    funder_type: 'trust_foundation',
    amount_max: '',
    deadline: '',
    grant_url: '',
    stage: 'identified' as PipelineStage,
    notes: '',
  })
  const [saving, setSaving]       = useState(false)
  const [urlInput, setUrlInput]   = useState('')
  const [autofilling, setAutofilling] = useState(false)
  const [autofillError, setAutofillError] = useState<string | null>(null)
  const [autofillDone, setAutofillDone]   = useState(false)

  async function handleAutofill() {
    if (!urlInput.trim()) return
    setAutofilling(true)
    setAutofillError(null)
    setAutofillDone(false)
    try {
      const res = await fetch('/api/autofill-grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setAutofillError(data.error ?? 'Auto-fill failed'); return }
      setForm(prev => ({
        ...prev,
        grant_name:  data.grant_name  ?? prev.grant_name,
        funder_name: data.funder_name ?? prev.funder_name,
        funder_type: data.funder_type ?? prev.funder_type,
        amount_max:  data.amount_max != null ? String(data.amount_max) : prev.amount_max,
        deadline:    data.deadline    ?? prev.deadline,
        grant_url:   data.grant_url   ?? urlInput.trim(),
        notes:       data.notes       ?? prev.notes,
      }))
      setAutofillDone(true)
    } catch {
      setAutofillError('Could not reach auto-fill service')
    } finally {
      setAutofilling(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const newItem = await createPipelineItem({
      org_id: orgId,
      grant_name: form.grant_name,
      funder_name: form.funder_name,
      funder_type: form.funder_type as any,
      amount_requested: form.amount_max ? Number(form.amount_max) : null,
      amount_min: null,
      amount_max: form.amount_max ? Number(form.amount_max) : null,
      deadline: form.deadline || null,
      stage: form.stage,
      notes: form.notes || null,
      application_progress: null,
      is_urgent: false,
      contact_name: null,
      contact_email: null,
      grant_url: form.grant_url || null,
      outcome_date: null,
      outcome_notes: null,
      created_by: userId,
    })
    onAdd(newItem)
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg rounded-lg overflow-hidden flex flex-col"
        style={{ boxShadow: '0 16px 64px rgba(26,46,43,0.18)', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-warm flex justify-between items-start flex-shrink-0"
             style={{ background: '#faf7f2' }}>
          <div>
            <h3 className="font-serif text-lg text-charcoal">Add Opportunity</h3>
            <p className="text-sm text-mid mt-0.5">Track a funding opportunity in your pipeline</p>
          </div>
          <button onClick={onClose} className="text-light hover:text-mid text-xl leading-none mt-0.5">✕</button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Tip: add from funding list */}
          <div className="mx-6 mt-5 flex items-start gap-3 px-4 py-3 rounded-lg border border-sage/30 bg-sage/5">
            <Sparkles className="w-4 h-4 text-forest flex-shrink-0 mt-0.5" strokeWidth={2} />
            <div className="text-sm text-forest leading-relaxed">
              The fastest way to add a grant is directly from the{' '}
              <a
                href="/dashboard/search"
                className="underline underline-offset-2 font-semibold hover:text-forest/70 inline-flex items-center gap-0.5"
              >
                funding search <ArrowRight className="w-3 h-3" />
              </a>
              {' '}— just hit <span className="font-semibold">+ Pipeline</span> on any result.
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mx-6 mt-5">
            <div className="flex-1 h-px bg-warm" />
            <span className="text-xs text-light font-medium uppercase tracking-wider">Or add manually</span>
            <div className="flex-1 h-px bg-warm" />
          </div>
          <p className="text-xs text-mid text-center mt-1.5 mx-6">
            Found a grant not in our database? Paste the URL below to auto-fill the details, or fill in the form yourself.
          </p>

          {/* URL auto-fill */}
          <div className="mx-6 mt-4 p-4 border border-warm rounded-lg bg-white">
            <label className="block text-xs font-semibold text-charcoal uppercase tracking-wider mb-2">
              Auto-fill from URL
            </label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 border border-warm rounded px-3 bg-white focus-within:border-forest transition-colors">
                <Link className="w-3.5 h-3.5 text-light flex-shrink-0" />
                <input
                  type="url"
                  value={urlInput}
                  onChange={e => { setUrlInput(e.target.value); setAutofillDone(false); setAutofillError(null) }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAutofill() } }}
                  placeholder="https://www.funder.org.uk/grant-name"
                  className="flex-1 py-2 text-sm outline-none bg-transparent text-charcoal placeholder:text-light"
                />
              </div>
              <button
                type="button"
                onClick={handleAutofill}
                disabled={autofilling || !urlInput.trim()}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white rounded disabled:opacity-40 transition-colors whitespace-nowrap"
                style={{ background: '#1a2e2b' }}
              >
                {autofilling
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Filling…</>
                  : <><Sparkles className="w-3.5 h-3.5" />Auto-fill</>
                }
              </button>
            </div>
            {autofillError && (
              <p className="text-xs text-red-500 mt-1.5">{autofillError}</p>
            )}
            {autofillDone && (
              <p className="text-xs text-forest mt-1.5 font-medium">✓ Fields filled — please review and adjust if needed</p>
            )}
          </div>

          {/* Manual form */}
          <form onSubmit={handleSubmit} className="px-6 pb-6 pt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Grant name *</label>
              <input className="form-input" value={form.grant_name} onChange={e => setForm({...form, grant_name: e.target.value})} required placeholder="e.g. Awards for All" />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Funder name *</label>
              <input className="form-input" value={form.funder_name} onChange={e => setForm({...form, funder_name: e.target.value})} required placeholder="e.g. National Lottery Community Fund" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Max amount (£)</label>
                <input type="number" className="form-input" value={form.amount_max} onChange={e => setForm({...form, amount_max: e.target.value})} placeholder="10000" />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Deadline</label>
                <input type="date" className="form-input" value={form.deadline} onChange={e => setForm({...form, deadline: e.target.value})} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Grant URL</label>
              <input type="url" className="form-input" value={form.grant_url} onChange={e => setForm({...form, grant_url: e.target.value})} placeholder="https://…" />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Stage</label>
              <select className="form-select" value={form.stage} onChange={e => setForm({...form, stage: e.target.value as PipelineStage})}>
                {PIPELINE_STAGES.map(s => <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Notes</label>
              <textarea className="form-textarea" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Any notes…" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={onClose} className="btn-outline btn-sm">Cancel</button>
              <button type="submit" disabled={saving} className="btn-gold btn-sm">
                {saving ? 'Adding…' : 'Add to Pipeline'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────

export default function PipelinePage() {
  const [items, setItems] = useState<PipelineItem[]>([])
  const [org, setOrg] = useState<Organisation | null>(null)
  const [userId, setUserId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<PipelineItem | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const draggingId = useRef<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const o = await getOrganisationByOwner(user.id)
      setOrg(o)
      if (o) {
        const data = await getPipelineItems(o.id)
        setItems(data)
      }
      setLoading(false)
    }
    load()
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function onDragStart(e: React.DragEvent, id: string) {
    draggingId.current = id
    setTimeout(() => {
      const el = document.querySelector(`[data-card-id="${id}"]`)
      el?.classList.add('dragging')
    }, 0)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragEnd(e: React.DragEvent) {
    (e.target as HTMLElement).classList.remove('dragging')
    document.querySelectorAll('.pipeline-col').forEach(el => el.classList.remove('drag-over'))
    draggingId.current = null
  }

  function onColDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const col = (e.currentTarget as HTMLElement)
    col.classList.add('drag-over')
  }

  function onColDragLeave(e: React.DragEvent) {
    const col = e.currentTarget as HTMLElement
    if (!col.contains(e.relatedTarget as Node)) {
      col.classList.remove('drag-over')
    }
  }

  async function onColDrop(e: React.DragEvent, stageId: PipelineStage) {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).classList.remove('drag-over')
    const id = draggingId.current
    if (!id) return
    const item = items.find(i => i.id === id)
    if (!item || item.stage === stageId) return
    // Optimistic update
    setItems(prev => prev.map(i => i.id === id ? { ...i, stage: stageId } : i))
    await updatePipelineStage(id, stageId)
    const stageName = PIPELINE_STAGES.find(s => s.id === stageId)?.label ?? stageId
    showToast(`Moved to ${stageName}`)
  }

  async function handleMove(id: string, stage: PipelineStage) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, stage } : i))
    await updatePipelineStage(id, stage)
    showToast(`Moved to ${PIPELINE_STAGES.find(s => s.id === stage)?.label}`)
  }

  async function handleSave(id: string, updates: Partial<PipelineItem>) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i))
    await updatePipelineItem(id, updates as any)
    showToast('Saved!')
  }

  async function handleDelete(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    await deletePipelineItem(id)
    showToast('Deleted')
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-mid">Loading pipeline…</div>

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-7">
        <div>
          <h2 className="font-serif text-2xl text-charcoal">Funding Pipeline</h2>
          <p className="text-mid text-sm mt-1">Drag cards between columns or click to edit · {items.length} opportunities tracked</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          {items.length > 0 && (() => {
            const activeItems = items.filter(i => !['won', 'declined'].includes(i.stage))
            const activeTotal = activeItems.reduce((s, i) => s + (i.amount_max ?? i.amount_requested ?? 0), 0)
            const wonTotal    = items.filter(i => i.stage === 'won').reduce((s, i) => s + (i.amount_requested ?? i.amount_max ?? 0), 0)
            const fmt = (n: number) => n >= 1000000
              ? `£${(n / 1000000).toFixed(1)}m`
              : n >= 1000
                ? `£${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
                : `£${n.toLocaleString()}`
            return (
              <div className="flex items-center gap-2.5">
                {activeTotal > 0 && (
                  <div className="text-right px-4 py-2.5 border border-warm/80 bg-warm/40 rounded-lg">
                    <p className="text-[10px] font-semibold text-light uppercase tracking-wider mb-0.5">Pipeline value</p>
                    <p className="text-2xl font-bold text-forest leading-none">{fmt(activeTotal)}</p>
                  </div>
                )}
                {wonTotal > 0 && (
                  <div className="text-right px-4 py-2.5 border border-emerald-200 bg-emerald-50 rounded-lg">
                    <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-0.5">Won</p>
                    <p className="text-2xl font-bold text-emerald-700 leading-none">{fmt(wonTotal)}</p>
                  </div>
                )}
              </div>
            )
          })()}
          <button onClick={() => setShowAdd(true)} className="btn-gold">＋ Add Opportunity</button>
        </div>
      </div>

      {/* Board */}
      <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-4">
      <div className="grid grid-cols-5 gap-3.5 min-h-[60vh] min-w-[600px] md:min-w-0">
        {PIPELINE_STAGES.map(stage => {
          const stageItems = items.filter(i => i.stage === stage.id)

          const stageColour =
            stage.id === 'identified'  ? { bg: '#f5f2ed', border: '#9ba8a6', text: '#6b7f7c', badgeBg: '#e8e4de', badgeText: '#6b7f7c' } :
            stage.id === 'applying'    ? { bg: '#fff7ed', border: '#fb923c', text: '#ea580c', badgeBg: '#ffedd5', badgeText: '#c2410c' } :
            stage.id === 'submitted'   ? { bg: '#fff3e0', border: '#f59e0b', text: '#b45309', badgeBg: '#fde68a', badgeText: '#92400e' } :
            stage.id === 'won'         ? { bg: '#e6f0ed', border: '#1f5c52', text: '#1f5c52', badgeBg: '#c8e3dc', badgeText: '#1f5c52' } :
                                         { bg: '#fdf0ee', border: '#f87171', text: '#ef4444', badgeBg: '#fee2e2', badgeText: '#dc2626' }

          return (
            <div
              key={stage.id}
              className="pipeline-col"
              style={{ background: stageColour.bg }}
              onDragOver={onColDragOver}
              onDragLeave={onColDragLeave}
              onDrop={e => onColDrop(e, stage.id as PipelineStage)}
            >
              <div
                className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide mb-1 pb-2.5 border-b-2"
                style={{ borderColor: stageColour.border, color: stageColour.text }}
              >
                <span className="flex items-center gap-1.5">{STAGE_ICONS[stage.id]}{stage.label}</span>
                <span
                  className="px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ background: stageColour.badgeBg, color: stageColour.badgeText }}
                >
                  {stageItems.length}
                </span>
              </div>
              {stageItems.map(item => (
                <div key={item.id} data-card-id={item.id}>
                  <PipelineCard
                    item={item}
                    stage={stage}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onClick={setSelectedItem}
                  />
                </div>
              ))}

              <button
                onClick={() => setShowAdd(true)}
                className="w-full py-3 border-2 border-dashed border-warm text-sm text-light hover:border-coral hover:text-coral transition-colors mt-1"
              >
                + Add
              </button>
            </div>
          )
        })}
      </div>
      </div>

      {/* Modals */}
      {selectedItem && (
        <PipelineModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onSave={handleSave}
          onDelete={handleDelete}
          onMove={handleMove}
        />
      )}

      {showAdd && org && (
        <AddModal
          orgId={org.id}
          userId={userId}
          onClose={() => setShowAdd(false)}
          onAdd={item => setItems(prev => [item, ...prev])}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-charcoal text-white px-5 py-3.5 shadow-lg text-sm flex items-center gap-2 z-50 animate-in slide-in-from-bottom-4">
          ✓ {toast}
        </div>
      )}
    </div>
  )
}

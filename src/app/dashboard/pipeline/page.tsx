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
import { usePlausible } from 'next-plausible'
import { PIPELINE_STAGES, formatDeadline, formatRange, cn } from '@/lib/utils'
import type { PipelineItem, PipelineStage, Organisation } from '@/types'
import { Sparkles, Loader2, Link, ArrowRight, Calendar, AlarmClock, X as XIcon, GripVertical, StickyNote, User as UserIcon, BarChart3 } from 'lucide-react'
import { PipelineModal, STAGE_ICONS, getWritingStage } from '@/components/PipelineModal'

const STAGE_BG_HEX: Record<string, string> = {
  identified: '#F5F1E8',
  applying:   '#F1F7E4',
  submitted:  '#DFEDCC',
  won:        '#EAF3DE',
  declined:   '#FAECE7',
}

const STAGE_VOCAB: Record<string, string> = {
  identified: 'potential',
  applying:   'in progress',
  submitted:  'awaiting',
  won:        'secured',
  declined:   'not won',
}

// ── Sub-components ────────────────────────────

function PipelineCard({
  item,
  stage,
  onDragStart,
  onDragEnd,
  onClick,
  onDelete,
  onMove,
}: {
  item: PipelineItem
  stage: typeof PIPELINE_STAGES[number]
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: (e: React.DragEvent) => void
  onClick: (item: PipelineItem) => void
  onDelete: (id: string) => void
  onMove: (id: string, stage: PipelineStage) => void
}) {
  const amountStr = formatRange(item.amount_min, item.amount_max ?? item.amount_requested)
  const deadlineStr = formatDeadline(item.deadline)
  const isWon = stage.id === 'won'
  const isDeclined = stage.id === 'declined'

  // Compute days remaining for urgency badge
  const daysLeft = (() => {
    if (!item.deadline) return null
    const parts = item.deadline.split('-').map(Number)
    if (parts.length !== 3) return null
    const diff = new Date(parts[0], parts[1] - 1, parts[2]).getTime() - new Date().setHours(0,0,0,0)
    return Math.ceil(diff / 86400000)
  })()

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, item.id)}
      onDragEnd={onDragEnd}
      onClick={() => onClick(item)}
      className="pipeline-card cursor-pointer active:cursor-grabbing"
    >
      {/* Drag handle + badges row */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
        {item.application_progress != null && item.application_progress > 0 && item.application_progress < 100 && (
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#FAEEDA] text-[#993C1D] uppercase tracking-wide">
            {getWritingStage(item.application_progress).label}
          </span>
        )}
        {item.application_progress === 100 && (
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide" style={{ background: "rgba(132,204,22,0.15)", color: "#639922" }}>Final</span>
        )}
        {item.is_urgent && (
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-coral-pale text-coral-saturated uppercase tracking-wide">Urgent</span>
        )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-1">
          <GripVertical size={13} className="text-warm/80 mt-0.5" />
          <button
            onClick={e => { e.stopPropagation(); onDelete(item.id) }}
            className="p-0.5 rounded-full text-[#8A8986] hover:text-coral-saturated hover:bg-coral-pale transition-colors"
            title="Remove from pipeline"
          >
            <XIcon size={12} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Grant name */}
      <p className="text-[15px] font-bold text-charcoal leading-snug mb-1" style={{ fontFamily: "var(--font-space-grotesk)" }}>{item.grant_name}</p>

      {/* Funder name — suppress when it duplicates the grant title */}
      {item.funder_name && item.funder_name.toLowerCase().trim() !== item.grant_name.toLowerCase().trim() && (
        <p className="text-xs text-mid mb-2">{item.funder_name}</p>
      )}

      {/* Amount */}
      {amountStr && (
        <p className={cn('text-base font-bold mb-1',
          isDeclined ? 'text-coral-saturated' : 'text-[#8ECB3C]'
        )}>
          {amountStr}
        </p>
      )}

      {/* Deadline + urgency */}
      {deadlineStr && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="flex items-center gap-1 text-[11px] text-mid">
            <Calendar size={11} strokeWidth={2} className="text-light" />
            {deadlineStr}
          </span>
          {daysLeft !== null && daysLeft <= 7 && (
            <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#FAECE7] text-[#993C1D]">
              <AlarmClock size={9} strokeWidth={2.5} />
              {daysLeft < 0 ? 'Overdue' : daysLeft === 0 ? 'Today' : `${daysLeft}d left`}
            </span>
          )}
        </div>
      )}

      {/* Writing progress bar */}
      {item.application_progress != null && item.application_progress > 0 && (
        <div className="mt-2.5">
          <div className="h-1 bg-warm overflow-hidden rounded-full">
            <div
              className={cn('h-full transition-all', item.application_progress >= 83 ? 'bg-[#8ECB3C]' : item.application_progress >= 50 ? 'bg-[#C0DD97]' : 'bg-[#FAC775]')}
              style={{ width: `${item.application_progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Notes */}
      {item.notes && (
        <p className="text-[10px] text-light mt-2 leading-snug line-clamp-2 italic">{item.notes}</p>
      )}

      {/* Stage-contextual footer */}
      {stage.id === 'identified' && item.grant_url && (
        <a
          href={item.grant_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="inline-block mt-1.5 text-[10px] font-semibold text-[#639922] hover:text-[#8ECB3C] transition-colors"
        >
          Start application →
        </a>
      )}
      {stage.id === 'applying' && (
        <button
          onClick={e => { e.stopPropagation(); onMove(item.id, 'submitted') }}
          className="mt-1.5 text-[10px] font-semibold text-[#639922] hover:text-[#8ECB3C] transition-colors"
        >
          Mark submitted ✓
        </button>
      )}
      {stage.id === 'submitted' && (
        <p className="mt-1.5 text-[10px] text-mid italic">Awaiting decision</p>
      )}
      {stage.id === 'won' && (
        <p className="mt-1.5 text-[10px] font-semibold" style={{ color: '#639922' }}>
          {item.outcome_date
            ? `Awarded ${new Date(item.outcome_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
            : 'Awarded'}
        </p>
      )}
      {stage.id === 'declined' && (
        <p className="mt-1.5 text-[10px]" style={{ color: '#993C1D' }}>
          {item.outcome_date
            ? `Closed ${new Date(item.outcome_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
            : item.deadline
              ? `Closed ${new Date(item.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
              : 'Closed'}
        </p>
      )}

      {/* Details affordance — signals the card is clickable for notes, contact,
          and progress fields. Notes feature was discoverable only by accident
          before this row. Devi feedback. Empty fields get a medium grey icon
          (still readable, signals "add me"). Filled fields get forest-green
          (signals "this is set"). */}
      {(() => {
        const hasNotes    = !!(item.notes && String(item.notes).trim().length > 0)
        const hasContact  = !!(item.contact_name || item.contact_email)
        const hasProgress = item.application_progress != null && item.application_progress > 0
        const anyFilled   = hasNotes || hasContact || hasProgress
        const emptyColor  = '#8A8986'   // light text — visible but subordinate
        const filledColor = '#3B6D11'   // forest green
        return (
          <div
            className="mt-2.5 pt-2 flex items-center justify-between"
            style={{ borderTop: '0.5px dashed rgba(0,0,0,0.10)' }}
          >
            <div className="flex items-center gap-2.5">
              <span title={hasNotes ? 'Notes added' : 'Click card to add notes'} style={{ color: hasNotes ? filledColor : emptyColor, display: 'inline-flex' }}>
                <StickyNote size={12} strokeWidth={hasNotes ? 2.25 : 1.75} />
              </span>
              <span title={hasContact ? 'Contact details added' : 'Click card to add contact'} style={{ color: hasContact ? filledColor : emptyColor, display: 'inline-flex' }}>
                <UserIcon size={12} strokeWidth={hasContact ? 2.25 : 1.75} />
              </span>
              <span title={hasProgress ? `Writing progress: ${item.application_progress}%` : 'Click card to track writing progress'} style={{ color: hasProgress ? filledColor : emptyColor, display: 'inline-flex' }}>
                <BarChart3 size={12} strokeWidth={hasProgress ? 2.25 : 1.75} />
              </span>
            </div>
            <span className="text-[10px] font-medium" style={{ color: anyFilled ? '#3B6D11' : '#5F5E5A' }}>
              {anyFilled ? 'Click to edit' : 'Click to add details'}
            </span>
          </div>
        )
      })()}
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
  const plausible = usePlausible()
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
    plausible('pipeline_added')
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
             style={{ background: '#FAFAF7' }}>
          <div>
            <h3 className="text-lg font-bold text-charcoal" style={{ fontFamily: "var(--font-space-grotesk)" }}>Add Opportunity</h3>
            <p className="text-sm text-mid mt-0.5">Track a funding opportunity in your pipeline</p>
          </div>
          <button onClick={onClose} className="text-light hover:text-mid text-xl leading-none mt-0.5">✕</button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Tip: add from funding list */}
          <div className="mx-6 mt-5 flex items-start gap-3 px-4 py-3 rounded-lg border border-sage/30 bg-sage/5">
            <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#8ECB3C" }} strokeWidth={2} />
            <div className="text-sm text-[#2C2C2A] leading-relaxed">
              The fastest way to add a grant is directly from the{' '}
              <a
                href="/dashboard/search"
                className="underline underline-offset-2 font-semibold inline-flex items-center gap-0.5" style={{ color: "#8ECB3C" }}
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
              <div className="flex-1 flex items-center gap-2 border border-[#E8E0D1] rounded px-3 bg-white focus-within:border-[#8ECB3C] transition-colors">
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
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white rounded-lg disabled:opacity-40 hover:opacity-80 transition-colors whitespace-nowrap" style={{ background: "#2C2C2A" }}
              >
                {autofilling
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Filling…</>
                  : <><Sparkles className="w-3.5 h-3.5" />Auto-fill</>
                }
              </button>
            </div>
            {autofillError && (
              <p className="text-xs text-coral-saturated mt-1.5">{autofillError}</p>
            )}
            {autofillDone && (
              <p className="text-xs mt-1.5 font-medium" style={{ color: "#639922" }}>✓ Fields filled — please review and adjust if needed</p>
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
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <h2 className="text-4xl font-bold text-charcoal leading-tight" style={{ fontFamily: "var(--font-space-grotesk)", letterSpacing: "-0.02em" }}>Pipeline</h2>
          <p className="text-mid text-sm mt-1.5 max-w-md">Manage your active opportunities. Drag between stages to update status.</p>
        </div>
        <div className="flex items-center gap-5 flex-shrink-0">
          {items.length > 0 && (() => {
            const activeItems = items.filter(i => !['won', 'declined'].includes(i.stage))
            const activeTotal = activeItems.reduce((s, i) => s + (i.amount_max ?? i.amount_requested ?? 0), 0)
            const wonTotal    = items.filter(i => i.stage === 'won').reduce((s, i) => s + (i.amount_requested ?? i.amount_max ?? 0), 0)
            const total       = activeTotal + wonTotal
            const fmt = (n: number) => n >= 1000000
              ? `£${(n / 1000000).toFixed(1)}m`
              : n >= 1000
                ? `£${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
                : `£${n.toLocaleString()}`
            return total > 0 ? (
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-light">Total Pipeline</p>
                <p className="text-2xl font-bold leading-tight" style={{ color: "#8ECB3C" }}>{fmt(total)}</p>
              </div>
            ) : null
          })()}
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] border border-[#2C2C2A] text-[#2C2C2A] text-sm font-semibold bg-white hover:bg-[#2C2C2A] hover:text-white transition-colors whitespace-nowrap"
          >
            + Add Opportunity
          </button>
        </div>
      </div>

      {/* Onboarding tip — shown when pipeline is empty */}
      {items.length === 0 && (
        <div className="mb-5 border border-[#E8E0D1] bg-[#FAFAF7] p-5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-charcoal mb-1">Your pipeline tracks grants from discovery to decision</p>
            <p className="text-xs text-mid leading-relaxed">Find a grant in the search, hit <strong>+ Pipeline</strong>, then drag cards between columns as you progress through each stage. Click any card to add notes, deadlines, and track your writing progress.</p>
          </div>
          <a href="/dashboard/search" className="flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold hover:opacity-80 transition-colors whitespace-nowrap" style={{ background: "#2C2C2A", color: "#fff" }}>
            Find your first grant →
          </a>
        </div>
      )}

      {/* Board */}
      <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-4">
      <div className="grid grid-cols-5 gap-3.5 min-h-[60vh] min-w-[850px] md:min-w-0">
        {PIPELINE_STAGES.map(stage => {
          const stageItems = items.filter(i => i.stage === stage.id)

          // Per-column header text tones — the stage bg varies from cream
          // through saturated green to soft coral, so a single grey is
          // unreadable on the Won column. Mapped here, not in STAGE_BG.
          const headerCol =
            stage.id === 'declined'  ? '#993C1D' :
            stage.id === 'identified'? '#5F5E5A' :
                                       '#3B6D11'
          const countCol =
            stage.id === 'declined'  ? '#993C1D' :
            stage.id === 'identified'? '#2C2C2A' :
                                       '#173404'
          const dividerCol =
            stage.id === 'declined'  ? 'rgba(153,60,29,0.20)' :
            stage.id === 'identified'? 'rgba(0,0,0,0.08)' :
                                       'rgba(57,109,17,0.18)'
          return (
            <div
              key={stage.id}
              className="pipeline-col"
              style={{
                background: STAGE_BG_HEX[stage.id],
                ...(stage.id === 'won' ? { borderTop: '3px solid #8ECB3C', paddingTop: 13 } : {}),
              }}
              onDragOver={onColDragOver}
              onDragLeave={onColDragLeave}
              onDrop={e => onColDrop(e, stage.id as PipelineStage)}
            >
              <div
                className="flex items-center justify-between mb-3 pb-2.5"
                style={{
                  borderBottom: `1px solid ${dividerCol}`,
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  background: STAGE_BG_HEX[stage.id],
                  paddingTop: 6,
                  // Negative margins to bleed the sticky header to the column
                  // padding edge while stuck, so the column bg under the
                  // header doesn't peek out at the sides.
                  marginLeft: -14,
                  marginRight: -14,
                  paddingLeft: 14,
                  paddingRight: 14,
                }}
              >
                <span className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: headerCol }}>
                  {STAGE_ICONS[stage.id]}{stage.label}
                </span>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[10px] font-bold leading-none" style={{ color: countCol }}>{stageItems.length}</span>
                  <span className="text-[8px] font-medium uppercase tracking-wide leading-none" style={{ color: countCol, opacity: 0.65 }}>{STAGE_VOCAB[stage.id]}</span>
                </div>
              </div>
              {stageItems.length === 0 && (
                <p className="text-[10px] text-light text-center py-4 leading-relaxed">Drag a grant here</p>
              )}
              {stageItems.map(item => (
                <div key={item.id} data-card-id={item.id}>
                  <PipelineCard
                    item={item}
                    stage={stage}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onClick={setSelectedItem}
                    onDelete={handleDelete}
                    onMove={handleMove}
                  />
                </div>
              ))}


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

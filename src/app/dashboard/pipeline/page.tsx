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

// ── Grant writing stages ──────────────────────

const WRITING_STAGES = [
  { label: 'Not started', value: 0,   emoji: '○',  colour: 'text-light' },
  { label: 'Research',    value: 17,  emoji: '🔍', colour: 'text-blue-500' },
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

  const borderColour =
    stage.id === 'identified'  ? 'border-blue-400' :
    stage.id === 'researching' ? 'border-amber-400' :
    stage.id === 'applying'    ? 'border-purple-400' :
    stage.id === 'submitted'   ? 'border-sage' :
    stage.id === 'won'         ? 'border-forest' :
                                 'border-red-400'

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, item.id)}
      onDragEnd={onDragEnd}
      onClick={() => onClick(item)}
      className={cn('pipeline-card', borderColour)}
    >
      <p className="text-[10px] text-light font-semibold uppercase tracking-wider mb-1">{item.funder_name}</p>
      <p className="text-sm font-semibold text-charcoal leading-snug mb-1.5">{item.grant_name}</p>
      <p className={cn('font-display text-sm font-bold',
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
          <div className="h-1 bg-warm rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', item.application_progress >= 83 ? 'bg-forest' : item.application_progress >= 50 ? 'bg-sage' : 'bg-amber-400')}
              style={{ width: `${item.application_progress}%` }}
            />
          </div>
        </div>
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
  const [notes, setNotes] = useState(item.notes ?? '')
  const [progress, setProgress] = useState(getWritingStage(item.application_progress).value)
  const [deadline, setDeadline] = useState(item.deadline ?? '')
  const [amountMin, setAmountMin] = useState(item.amount_min != null ? String(item.amount_min) : '')
  const [amountMax, setAmountMax] = useState(item.amount_max != null ? String(item.amount_max) : (item.amount_requested != null ? String(item.amount_requested) : ''))
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave(item.id, {
      notes,
      application_progress: progress,
      deadline: deadline || null,
      amount_min: amountMin ? Number(amountMin) : null,
      amount_max: amountMax ? Number(amountMax) : null,
      amount_requested: amountMax ? Number(amountMax) : null,
    })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-warm flex justify-between items-start">
          <div>
            <h3 className="font-display text-lg font-bold text-forest">{item.grant_name}</h3>
            <p className="text-sm text-mid mt-0.5">{item.funder_name}</p>
          </div>
          <button onClick={onClose} className="text-light hover:text-mid text-xl leading-none">✕</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Amount & Deadline */}
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
          {(amountMin || amountMax) && (
            <p className="font-display text-xl font-bold text-gold -mt-2">
              {formatRange(amountMin ? Number(amountMin) : null, amountMax ? Number(amountMax) : null)}
            </p>
          )}

          {/* Move stage */}
          <div>
            <p className="text-xs font-semibold text-light uppercase tracking-wider mb-2">Move to stage</p>
            <div className="grid grid-cols-3 gap-2">
              {PIPELINE_STAGES.map(s => (
                <button
                  key={s.id}
                  onClick={() => { onMove(item.id, s.id); onClose() }}
                  className={cn(
                    'py-2 px-2 rounded-lg border-2 text-xs font-medium transition-all text-center',
                    item.stage === s.id
                      ? 'border-sage bg-green-50 text-forest font-semibold'
                      : 'border-warm text-mid hover:border-sage hover:text-sage'
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
                      'flex flex-col items-center gap-1 py-2 px-1 rounded-xl border-2 text-center transition-all',
                      isActive
                        ? 'border-sage bg-green-50 shadow-sm'
                        : 'border-warm bg-white hover:border-sage/50 hover:bg-green-50/40'
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
            <div className="h-2 bg-warm rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300',
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

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-light uppercase tracking-wider block mb-2">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="form-textarea"
              placeholder="Add notes, contacts, key dates…"
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
    stage: 'identified' as PipelineStage,
    notes: '',
  })
  const [saving, setSaving] = useState(false)

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
      grant_url: null,
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
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-warm flex justify-between items-start">
          <div>
            <h3 className="font-display text-lg font-bold text-forest">Add to Pipeline</h3>
            <p className="text-sm text-mid mt-0.5">Track a new funding opportunity</p>
          </div>
          <button onClick={onClose} className="text-light hover:text-mid text-xl leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
          <h2 className="font-display text-2xl font-bold text-forest">Funding Pipeline</h2>
          <p className="text-mid text-sm mt-1">Drag cards between columns or click to edit · {items.length} opportunities tracked</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-gold">＋ Add Opportunity</button>
      </div>

      {/* Board */}
      <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-4">
      <div className="grid grid-cols-6 gap-3.5 min-h-[60vh] min-w-[720px] md:min-w-0">
        {PIPELINE_STAGES.map(stage => {
          const stageItems = items.filter(i => i.stage === stage.id)
          return (
            <div
              key={stage.id}
              className="pipeline-col"
              onDragOver={onColDragOver}
              onDragLeave={onColDragLeave}
              onDrop={e => onColDrop(e, stage.id as PipelineStage)}
            >
              <div className={cn(
                'flex items-center justify-between text-[11px] font-bold uppercase tracking-wide mb-2 pb-2.5 border-b-2',
                stage.id === 'identified'  ? 'border-blue-400 text-blue-600' :
                stage.id === 'researching' ? 'border-amber-400 text-amber-600' :
                stage.id === 'applying'    ? 'border-purple-400 text-purple-600' :
                stage.id === 'submitted'   ? 'border-sage text-sage' :
                stage.id === 'won'         ? 'border-forest text-forest' :
                                             'border-red-400 text-red-500'
              )}>
                <span>{stage.emoji} {stage.label}</span>
                <span className="bg-white/60 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                  {stageItems.length}
                </span>
              </div>
              <p className="text-[10px] text-light text-center mb-2">drag cards to move</p>

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
                className="w-full py-2 border-2 border-dashed border-black/10 rounded-lg text-xs text-light hover:border-sage hover:text-sage transition-colors mt-1"
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
        <div className="fixed bottom-6 right-6 bg-forest text-white px-5 py-3.5 rounded-xl shadow-card-lg text-sm flex items-center gap-2 z-50 animate-in slide-in-from-bottom-4">
          ✓ {toast}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'
import { CalendarClock, CalendarCheck, ExternalLink, ArrowRight, Calendar, AlarmClock, ChevronDown, ChevronUp, Send, ChevronLeft, ChevronRight, Info, Plus, X as XIcon, Check, Landmark, Rocket, TrendingUp, Gift, Pencil, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getDeadlineAlerts, formatDeadline, formatRange, PIPELINE_STAGES } from '@/lib/utils'
import { updatePipelineStage, updatePipelineItem, createPipelineItem } from '@/lib/pipeline'
import { recordInteraction } from '@/lib/interactions'
import { normaliseScrapedGrant, type EnrichedGrant } from '@/lib/grants-normalise'
import { computeMatchScore } from '@/lib/matching'
import type { DeadlineAlert, PipelineItem, PipelineStage, FundingType, Organisation } from '@/types'

const ACTIVE_STAGES = ['identified', 'applying'] // 'submitted' excluded — those need a decision date, not a deadline

// ── Funding-type dot colours ──────────────────────────────────────────────────
const TYPE_DOT: Record<string, string> = {
  grant:      '#97C459',
  programme:  '#F0997B',
  investment: '#85B7EB',
  in_kind:    '#EF9F27',
}
const TYPE_LABEL: Record<string, string> = {
  grant: 'Grant', programme: 'Programme', investment: 'Investment', in_kind: 'In-Kind',
}
const TYPE_BG: Record<string, string> = {
  grant: '#F1F7E4', programme: '#FAECE7', investment: '#E6F1FB', in_kind: '#FAEEDA',
}
const TYPE_TEXT: Record<string, string> = {
  grant: '#3B6D11', programme: '#993C1D', investment: '#0C447C', in_kind: '#854F0B',
}

// Pipeline items don't carry funding_type directly — default to 'grant' until
// the view is enriched from scraped_grants / saved_grants.
function itemFundingType(_item: PipelineItem): string { return 'grant' }

// ── Calendar helpers ──────────────────────────────────────────────────────────
type CalDay = {
  date: Date
  isCurrentMonth: boolean
  isToday: boolean
  alerts: DeadlineAlert[]
}

function buildCalendarDays(year: number, month: number, alerts: DeadlineAlert[]): CalDay[] {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const map = new Map<string, DeadlineAlert[]>()
  alerts.forEach(a => {
    if (!a.item.deadline) return
    map.set(a.item.deadline, [...(map.get(a.item.deadline) ?? []), a])
  })
  const firstDow = new Date(year, month, 1).getDay()
  const startPad = (firstDow + 6) % 7
  const days: CalDay[] = []
  for (let i = startPad - 1; i >= 0; i--) {
    days.push({ date: new Date(year, month, -i), isCurrentMonth: false, isToday: false, alerts: [] })
  }
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d)
    const isToday = date.getTime() === today.getTime()
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    days.push({ date, isCurrentMonth: true, isToday, alerts: map.get(key) ?? [] })
  }
  const total = Math.ceil(days.length / 7) * 7
  let nd = 1
  while (days.length < total) {
    days.push({ date: new Date(year, month + 1, nd++), isCurrentMonth: false, isToday: false, alerts: [] })
  }
  return days
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const fmtAmt = (n: number) => n >= 1000000 ? `£${(n/1000000).toFixed(1)}m` : n >= 1000 ? `£${Math.round(n/1000)}k` : `£${n}`

// ── Add Deadline Modal ────────────────────────────────────────────────────────

const TYPE_CHIPS: {
  key: string
  label: string
  dot: string
  bg: string
  text: string
  Icon: LucideIcon
}[] = [
  { key: 'grant',      label: 'Grant',      dot: '#97C459', bg: '#F1F7E4', text: '#3B6D11', Icon: Landmark   },
  { key: 'programme',  label: 'Programme',  dot: '#F0997B', bg: '#FAECE7', text: '#993C1D', Icon: Rocket     },
  { key: 'investment', label: 'Investment', dot: '#85B7EB', bg: '#E6F1FB', text: '#0C447C', Icon: TrendingUp  },
  { key: 'in_kind',    label: 'In-Kind',    dot: '#EF9F27', bg: '#FAEEDA', text: '#854F0B', Icon: Gift       },
]

function AddDeadlineModal({ orgId, userId, onClose, onSaved }: {
  orgId: string
  userId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [grantName, setGrantName]         = useState('')
  const [funderName, setFunderName]       = useState('')
  const [deadline, setDeadline]           = useState('')
  const [amount, setAmount]               = useState('')
  const [fundingType, setFundingType]     = useState<string>('grant')
  const [notes, setNotes]                 = useState('')
  const [addToPipeline, setAddToPipeline] = useState(true)
  const [saving, setSaving]               = useState(false)

  async function handleSave() {
    if (!grantName.trim() || !deadline) return
    setSaving(true)
    try {
      const amtNum = amount ? parseInt(amount.replace(/[^0-9]/g, ''), 10) || null : null
      await createPipelineItem({
        org_id: orgId,
        grant_name: grantName.trim(),
        funder_name: funderName.trim() || 'Unknown',
        funder_type: 'trust_foundation',
        amount_requested: amtNum,
        amount_min: null,
        amount_max: amtNum,
        deadline,
        stage: 'identified',
        notes: notes.trim() || null,
        application_progress: null,
        is_urgent: false,
        contact_name: null,
        contact_email: null,
        grant_url: null,
        outcome_date: null,
        outcome_notes: null,
        created_by: userId,
      })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5"
      style={{ background: 'rgba(23,52,4,0.40)' }}
      onClick={onClose}>
      <div className="w-full flex flex-col"
        style={{ maxWidth: 480, background: '#fff', borderRadius: 16, overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(23,52,4,0.25)',
          maxHeight: 'calc(100vh - 60px)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '22px 24px 18px', borderBottom: '0.5px solid rgba(0,0,0,0.08)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 17, fontWeight: 500,
              letterSpacing: '-0.01em', margin: '0 0 4px', color: '#2C2C2A' }}>Add a deadline</h3>
            <p style={{ fontSize: 12, color: '#5F5E5A', margin: 0, lineHeight: 1.5 }}>
              Log an opportunity not already in your pipeline or saved list.
            </p>
          </div>
          <button onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: 8, background: '#F1F0EA', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#5F5E5A', cursor: 'pointer', flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.background = '#E5E2D7' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#F1F0EA' }}>
            <XIcon size={13} strokeWidth={2.5} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ padding: '20px 24px 4px', overflowY: 'auto', flex: 1 }}>

          {/* Opportunity name */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#2C2C2A', marginBottom: 6 }}>
              Opportunity name <span style={{ color: '#D85A30' }}>*</span>
            </label>
            <input type="text" value={grantName} onChange={e => setGrantName(e.target.value)}
              placeholder="e.g. Arts Council Project Grants"
              style={{ width: '100%', height: 40, border: '0.5px solid rgba(0,0,0,0.14)', borderRadius: 10,
                padding: '0 12px', fontFamily: 'inherit', fontSize: 13, color: '#2C2C2A',
                background: '#fff', outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#639922' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.14)' }} />
          </div>

          {/* Funder */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#2C2C2A', marginBottom: 6 }}>
              Funder <span style={{ color: '#8A8986', fontWeight: 400 }}>&middot; optional</span>
            </label>
            <input type="text" value={funderName} onChange={e => setFunderName(e.target.value)}
              placeholder="e.g. Arts Council England"
              style={{ width: '100%', height: 40, border: '0.5px solid rgba(0,0,0,0.14)', borderRadius: 10,
                padding: '0 12px', fontFamily: 'inherit', fontSize: 13, color: '#2C2C2A',
                background: '#fff', outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#639922' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.14)' }} />
          </div>

          {/* Date + Amount row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#2C2C2A', marginBottom: 6 }}>
                Deadline <span style={{ color: '#D85A30' }}>*</span>
              </label>
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
                style={{ width: '100%', height: 40, border: '0.5px solid rgba(0,0,0,0.14)', borderRadius: 10,
                  padding: '0 12px', fontFamily: 'inherit', fontSize: 13, color: '#2C2C2A',
                  background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => { e.currentTarget.style.borderColor = '#639922' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.14)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#2C2C2A', marginBottom: 6 }}>
                Amount <span style={{ color: '#8A8986', fontWeight: 400 }}>&middot; optional</span>
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                  color: '#8A8986', fontSize: 13, pointerEvents: 'none' }}>£</span>
                <input type="text" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="0"
                  style={{ width: '100%', height: 40, border: '0.5px solid rgba(0,0,0,0.14)', borderRadius: 10,
                    padding: '0 12px 0 24px', fontFamily: 'inherit', fontSize: 13, color: '#2C2C2A',
                    background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#639922' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.14)' }} />
              </div>
            </div>
          </div>

          {/* Funding type chips */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#2C2C2A', marginBottom: 6 }}>
              Funding type <span style={{ color: '#D85A30' }}>*</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {TYPE_CHIPS.map(tc => {
                const sel = fundingType === tc.key
                return (
                  <button key={tc.key} type="button" onClick={() => setFundingType(tc.key)}
                    style={{
                      border: sel ? `1.5px solid ${tc.dot}` : '0.5px solid rgba(0,0,0,0.10)',
                      background: sel ? tc.bg : '#fff',
                      borderRadius: 10, padding: '10px 8px', textAlign: 'center',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                    <div style={{ width: 24, height: 24, borderRadius: 8, margin: '0 auto 6px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: sel ? tc.dot : tc.bg }}>
                      <tc.Icon size={12} strokeWidth={sel ? 2.5 : 2}
                        style={{ color: sel ? '#fff' : tc.dot }} />
                    </div>
                    <div style={{ fontSize: 11, fontWeight: sel ? 600 : 500,
                      color: sel ? tc.text : '#5F5E5A' }}>{tc.label}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#2C2C2A', marginBottom: 6 }}>
              Notes <span style={{ color: '#8A8986', fontWeight: 400 }}>&middot; optional</span>
            </label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Link to guidelines, application notes, or anything else you want to remember."
              rows={2}
              style={{ width: '100%', minHeight: 60, border: '0.5px solid rgba(0,0,0,0.14)', borderRadius: 10,
                padding: '10px 12px', fontFamily: 'inherit', fontSize: 13, color: '#2C2C2A',
                background: '#fff', outline: 'none', resize: 'vertical', lineHeight: 1.5,
                boxSizing: 'border-box' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#639922' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.14)' }} />
          </div>

          {/* Also add to pipeline */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
            background: '#F5F1E8', borderRadius: 10, padding: '10px 12px', marginBottom: 20 }}
            onClick={() => setAddToPipeline(v => !v)}>
            <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: addToPipeline ? '#639922' : '#fff',
              border: addToPipeline ? 'none' : '1.5px solid #D9D6CB',
              cursor: 'pointer' }}>
              {addToPipeline && <Check size={9} strokeWidth={3.5} style={{ color: '#fff' }} />}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#2C2C2A' }}>Also add to pipeline</div>
              <div style={{ fontSize: 11, color: '#5F5E5A', marginTop: 2, lineHeight: 1.45 }}>
                Creates a card in the Identified column so you can track progress.
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '0.5px solid rgba(0,0,0,0.08)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#FAFAF7', flexShrink: 0, gap: 12 }}>
          <span style={{ fontSize: 11, color: '#8A8986' }}>
            Manual deadlines show on the calendar with a pencil icon.
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose}
              style={{ fontSize: 12, fontWeight: 500, color: '#5F5E5A', padding: '8px 14px',
                borderRadius: 10, cursor: 'pointer', background: 'transparent', border: 'none', fontFamily: 'inherit' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={!grantName.trim() || !deadline || saving}
              style={{ fontSize: 12, fontWeight: 500, background: '#8ECB3C', color: '#173404',
                padding: '8px 16px', borderRadius: 10, cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                opacity: (!grantName.trim() || !deadline || saving) ? 0.5 : 1 }}>
              {saving ? 'Saving\u2026' : 'Save deadline'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Edit Deadline Modal ───────────────────────────────────────────────────────
function EditDeadlineModal({ item, onClose, onSaved }: {
  item: PipelineItem
  onClose: () => void
  onSaved: () => void
}) {
  const [deadline, setDeadline] = useState(item.deadline ?? '')
  const [saving, setSaving]     = useState(false)

  async function handleSave() {
    if (!deadline) return
    setSaving(true)
    try {
      await updatePipelineItem(item.id, { deadline })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5"
      style={{ background: 'rgba(23,52,4,0.40)' }}
      onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 400, background: '#fff', borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(23,52,4,0.25)' }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '20px 22px 16px', borderBottom: '0.5px solid rgba(0,0,0,0.08)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 15, fontWeight: 500,
              margin: '0 0 3px', color: '#2C2C2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.grant_name}
            </h3>
            <p style={{ fontSize: 12, color: '#5F5E5A', margin: 0 }}>{item.funder_name}</p>
          </div>
          <button onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: 8, background: '#F1F0EA', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#5F5E5A', cursor: 'pointer', flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.background = '#E5E2D7' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#F1F0EA' }}>
            <XIcon size={13} strokeWidth={2.5} />
          </button>
        </div>
        {/* Body */}
        <div style={{ padding: '18px 22px' }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#2C2C2A', marginBottom: 6 }}>
            Deadline <span style={{ color: '#D85A30' }}>*</span>
          </label>
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
            style={{ width: '100%', height: 40, border: '0.5px solid rgba(0,0,0,0.14)', borderRadius: 10,
              padding: '0 12px', fontFamily: 'inherit', fontSize: 13, color: '#2C2C2A',
              background: '#fff', outline: 'none', boxSizing: 'border-box' }}
            onFocus={e => { e.currentTarget.style.borderColor = '#639922' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.14)' }} />
        </div>
        {/* Footer */}
        <div style={{ padding: '12px 22px 18px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose}
            style={{ fontSize: 12, fontWeight: 500, color: '#5F5E5A', padding: '8px 14px',
              borderRadius: 10, cursor: 'pointer', background: 'transparent', border: 'none', fontFamily: 'inherit' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={!deadline || saving}
            style={{ fontSize: 12, fontWeight: 500, background: deadline ? '#8ECB3C' : '#F5F1E8',
              color: deadline ? '#173404' : '#8A8986',
              padding: '8px 16px', borderRadius: 10, cursor: deadline ? 'pointer' : 'not-allowed',
              border: 'none', fontFamily: 'inherit' }}>
            {saving ? 'Saving\u2026' : 'Save deadline'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Day Alerts Sheet (multiple items on same calendar day) ────────────────────
function DayAlertsSheet({ alerts, onSelect, onClose }: {
  alerts: DeadlineAlert[]
  onSelect: (item: PipelineItem) => void
  onClose: () => void
}) {
  const d = alerts[0]?.item.deadline ?? ''
  const dateParts = d.split('-')
  const dateStr = dateParts.length === 3
    ? `${parseInt(dateParts[2])} ${MONTH_NAMES[parseInt(dateParts[1])-1]}`
    : d
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5"
      style={{ background: 'rgba(23,52,4,0.40)' }}
      onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 380, background: '#fff', borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 16px 48px rgba(23,52,4,0.22)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 18px 12px', borderBottom: '0.5px solid rgba(0,0,0,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 14, fontWeight: 500, color: '#2C2C2A' }}>
            {dateStr} — {alerts.length} deadlines
          </span>
          <button onClick={onClose}
            style={{ width: 26, height: 26, borderRadius: 7, background: '#F1F0EA', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5F5E5A', cursor: 'pointer' }}>
            <XIcon size={12} strokeWidth={2.5} />
          </button>
        </div>
        <div style={{ padding: '8px 0' }}>
          {alerts.map((a, i) => {
            const type = itemFundingType(a.item)
            return (
              <button key={i} type="button"
                onClick={() => { onSelect(a.item) }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px',
                  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#FAFAF7' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#2C2C2A', margin: '0 0 2px',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.item.grant_name}</p>
                  <p style={{ fontSize: 11, color: '#5F5E5A', margin: 0 }}>{a.item.funder_name}</p>
                </div>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, fontWeight: 500,
                  background: TYPE_BG[type], color: TYPE_TEXT[type], flexShrink: 0 }}>
                  {TYPE_LABEL[type]}
                </span>
                <Pencil size={13} style={{ color: '#8A8986', flexShrink: 0 }} />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}



// ── Inline date picker ──────────────────────────────────────────────────────
function DatePickerInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen]         = useState(false)
  const [viewYear, setViewYear]   = useState(() => value ? parseInt(value.split('-')[0]) : new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => value ? parseInt(value.split('-')[1]) - 1 : new Date().getMonth())
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const displayStr = value ? (() => {
    const parts = value.split('-').map(Number)
    return `${parts[2]} ${MONTH_NAMES[parts[1] - 1]?.slice(0, 3) ?? ''} ${parts[0]}`
  })() : 'Pick a date'

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1)
  }
  const calDp = buildCalendarDays(viewYear, viewMonth, [])
  const today0 = new Date(); today0.setHours(0,0,0,0)

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width: 120, height: 26, border: `0.5px solid ${open ? '#639922' : 'rgba(0,0,0,0.14)'}`,
          borderRadius: 10, padding: '0 8px', fontSize: 11, fontFamily: 'inherit',
          color: value ? '#2C2C2A' : '#8A8986', background: '#fff', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6, textAlign: 'left', boxSizing: 'border-box' }}>
        <Calendar size={10} strokeWidth={2} style={{ color: '#8A8986', flexShrink: 0 }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayStr}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 300,
          background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 10, width: 196 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <button type="button" onClick={prevMonth}
              style={{ width: 20, height: 20, borderRadius: 6, background: '#F1F0EA', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#5F5E5A' }}>
              <ChevronLeft size={10} strokeWidth={2.5} />
            </button>
            <span style={{ flex: 1, textAlign: 'center', fontFamily: 'var(--font-space-grotesk)',
              fontSize: 12, fontWeight: 500, color: '#2C2C2A' }}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={nextMonth}
              style={{ width: 20, height: 20, borderRadius: 6, background: '#F1F0EA', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#5F5E5A' }}>
              <ChevronRight size={10} strokeWidth={2.5} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
            {['M','T','W','T','F','S','S'].map((d, i) => (
              <div key={i} style={{ textAlign: 'center', color: '#8A8986', fontSize: 9,
                letterSpacing: '0.05em', padding: '2px 0' }}>{d}</div>
            ))}
            {calDp.map((day, i) => {
              const iso   = day.date.toISOString().split('T')[0]
              const isSel = iso === value
              const isToday = day.isToday
              return (
                <button key={i} type="button"
                  onClick={() => { if (!day.isCurrentMonth) return; onChange(iso); setOpen(false) }}
                  style={{ textAlign: 'center', padding: '4px 1px', borderRadius: 6, border: 'none',
                    cursor: day.isCurrentMonth ? 'pointer' : 'default',
                    background: isSel ? '#639922' : isToday ? '#F1F7E4' : 'transparent',
                    color: isSel ? '#fff' : !day.isCurrentMonth ? '#D9D6CB' : isToday ? '#3B6D11' : '#2C2C2A',
                    fontFamily: 'inherit', fontSize: 11, fontWeight: isSel ? 600 : 400 }}>
                  {day.date.getDate()}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Shared pill helpers ───────────────────────────────────────────────────────
const STAGE_STYLE: Record<string, { bg: string; color: string }> = {
  identified: { bg: '#F5F1E8', color: '#5F5E5A' },
  applying:   { bg: '#EAF3DE', color: '#3B6D11' },
  submitted:  { bg: '#C0DD97', color: '#173404' },
  won:        { bg: '#639922', color: '#fff'    },
  declined:   { bg: '#FAECE7', color: '#993C1D' },
}

function StageChip({ stage }: { stage: string }) {
  const s  = PIPELINE_STAGES.find(p => p.id === stage)
  const st = STAGE_STYLE[stage] ?? { bg: '#F5F1E8', color: '#5F5E5A' }
  return (
    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, fontWeight: 500,
      whiteSpace: 'nowrap', background: st.bg, color: st.color, flexShrink: 0 }}>
      {s?.label ?? stage}
    </span>
  )
}

function TypeChip({ type }: { type: string }) {
  return (
    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, fontWeight: 500,
      whiteSpace: 'nowrap', background: TYPE_BG[type] ?? '#F1F7E4',
      color: TYPE_TEXT[type] ?? '#3B6D11', flexShrink: 0 }}>
      {TYPE_LABEL[type] ?? type}
    </span>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DeadlinesPage() {
  const [alerts,           setAlerts]           = useState<DeadlineAlert[]>([])
  const [noDeadlineItems,  setNoDeadlineItems]  = useState<PipelineItem[]>([])
  const [loading,          setLoading]          = useState(true)
  const [error,            setError]            = useState<string | null>(null)
  const [toast,            setToast]            = useState<string | null>(null)
  const [editItem,         setEditItem]         = useState<PipelineItem | null>(null)
  const [dayPickerAlerts,  setDayPickerAlerts]  = useState<DeadlineAlert[] | null>(null)
  const [addOpen,          setAddOpen]          = useState(false)
  const [orgId,            setOrgId]            = useState('')
  const [userId,           setUserId]           = useState('')

  // Date inputs for "Needs a deadline"
  const [deadlineInputs,   setDeadlineInputs]   = useState<Record<string, string>>({})
  const [savingDeadline,   setSavingDeadline]   = useState<string | null>(null)
  const [deadlineSuccesses,setDeadlineSuccesses]= useState<Set<string>>(new Set())

  // Match rows
  const [matchRows,        setMatchRows]        = useState<{ grant: EnrichedGrant; score: number }[]>([])
  const [matchState,       setMatchState]       = useState<Record<string, 'saved' | 'pipeline'>>({})
  const [matchActioning,   setMatchActioning]   = useState<Record<string, 'saving' | 'pipelining' | 'done'>>({})

  // Sources filter
  const [showPipeline,     setShowPipeline]     = useState(true)
  const [showSaved,        setShowSaved]        = useState(true)
  const [showMatches,      setShowMatches]      = useState(true)
  const [savedGrantRows,   setSavedGrantRows]   = useState<EnrichedGrant[]>([])
  const [savedNoDeadline,  setSavedNoDeadline]  = useState<EnrichedGrant[]>([])
  const [savedInputs,      setSavedInputs]      = useState<Record<string,string>>({})
  const [savingSaved,      setSavingSaved]      = useState<string | null>(null)
  const [savedSuccesses,   setSavedSuccesses]   = useState<Set<string>>(new Set())

  // Calendar
  const now = new Date()
  const [calYear,  setCalYear]  = useState(now.getFullYear())
  const [calMonth, setCalMonth] = useState(now.getMonth())

  // Day filter — when a calendar day is clicked, filter Scheduled to that date
  const [dayFilter, setDayFilter] = useState<string | null>(null)

  // ── Data loading ────────────────────────────────────────────────────────────
  async function loadData() {
    try {
      const supabase = createClient()
      const { data: { user }, error: userErr } = await supabase.auth.getUser()
      if (userErr || !user) { setLoading(false); return }
      setUserId(user.id)

      const { data: orgs } = await supabase.from('organisations').select('*').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1)
      const org = orgs?.[0] ?? null
      if (!org) { setLoading(false); return }
      setOrgId(org.id)

      const { data: items, error: itemsErr } = await supabase
        .from('pipeline_items').select('*').eq('org_id', org.id).order('deadline', { ascending: true })
      if (itemsErr) { setError(itemsErr.message); return }
      const allItems: PipelineItem[] = items ?? []
      setAlerts(getDeadlineAlerts(allItems))
      // identified + applying only — submitted = awaiting decision, not deadline-needed
      setNoDeadlineItems(allItems.filter(i => ['identified','applying'].includes(i.stage) && !i.deadline))

      // Match rows with upcoming deadlines
      const today = new Date().toISOString().split('T')[0]
      const { data: grantRows } = await supabase
        .from('grants_with_funder')
        .select('*')
        .eq('is_active', true)
        .neq('url_status', 'dead')
        .not('deadline', 'is', null)
        .gte('deadline', today)
        .order('deadline', { ascending: true })
        .limit(150)

      if (grantRows && grantRows.length > 0) {
        const typedOrg = org as unknown as import('@/types').Organisation
        const scored = grantRows
          .map(row => {
            const g = normaliseScrapedGrant(row as Record<string, unknown>)
            const score = computeMatchScore(g, typedOrg).score
            return { grant: g, score, deadline: g.deadline ?? '' }
          })
          .filter(x => x.score >= 55 && x.deadline)
          .sort((a, b) => (a.deadline < b.deadline ? -1 : 1))
          .slice(0, 20)
        setMatchRows(scored.map(({ grant, score }) => ({ grant, score })))
      } else {
        setMatchRows([])
      }

      // Saved grants with upcoming deadlines
      const { data: savedInteractions } = await supabase
        .from('grant_interactions')
        .select('grant_id')
        .eq('org_id', org.id)
        .eq('action', 'saved')
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const savedIds = Array.from(new Set((savedInteractions ?? []).map((r: { grant_id: string }) => r.grant_id).filter(id => UUID_RE.test(id))))
      if (savedIds.length > 0) {
        const { data: savedRows } = await supabase
          .from('grants_with_funder')
          .select('*')
          .in('id', savedIds)
          .order('deadline', { ascending: true })
        const allSaved = (savedRows ?? []).map(row => normaliseScrapedGrant(row as Record<string, unknown>))
        setSavedGrantRows(allSaved.filter(g => g.deadline && g.deadline >= today))
        setSavedNoDeadline(allSaved.filter(g => !g.deadline))
      } else {
        setSavedGrantRows([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  async function handleSetDeadline(id: string, deadline: string) {
    if (!deadline) return
    setSavingDeadline(id)
    await updatePipelineItem(id, { deadline })
    setSavingDeadline(null)
    setDeadlineSuccesses(prev => new Set(prev).add(id))
    setTimeout(() => {
      setDeadlineSuccesses(prev => { const n = new Set(prev); n.delete(id); return n })
      loadData()
    }, 900)
  }

  async function handleStageChange(id: string, stage: PipelineStage) {
    setAlerts(prev => prev.map(a => a.item.id === id ? { ...a, item: { ...a.item, stage } } : a))
    await updatePipelineStage(id, stage)
    showToast(`Moved to ${PIPELINE_STAGES.find(s => s.id === stage)?.label}`)
  }

  async function handleSetSavedDeadline(grant: EnrichedGrant, deadline: string) {
    if (!deadline) return
    setSavingSaved(grant.id)
    await createPipelineItem({
      org_id: orgId,
      grant_name: grant.title,
      funder_name: grant.funder || 'Unknown',
      funder_type: grant.funderType ?? 'trust_foundation',
      amount_requested: null,
      amount_min: grant.amountMin || null,
      amount_max: grant.amountMax || null,
      deadline,
      stage: 'identified',
      notes: null,
      application_progress: null,
      is_urgent: false,
      contact_name: null,
      contact_email: null,
      grant_url: grant.applyUrl,
      outcome_date: null,
      outcome_notes: null,
      created_by: userId,
    })
    setSavingSaved(null)
    setSavedSuccesses(prev => new Set(prev).add(grant.id))
    setTimeout(() => {
      setSavedSuccesses(prev => { const n = new Set(prev); n.delete(grant.id); return n })
      loadData()
    }, 900)
  }

  async function handleSaveMatch(grantId: string) {
    setMatchActioning(prev => ({ ...prev, [grantId]: 'saving' }))
    await recordInteraction(orgId, grantId, 'saved')
    setMatchActioning(prev => ({ ...prev, [grantId]: 'done' }))
    setTimeout(() => {
      setMatchState(prev => ({ ...prev, [grantId]: 'saved' }))
      setMatchActioning(prev => { const n = { ...prev }; delete n[grantId]; return n })
    }, 900)
  }

  async function handlePipelineMatch(grant: EnrichedGrant) {
    const id = grant.id
    setMatchActioning(prev => ({ ...prev, [id]: 'pipelining' }))
    await createPipelineItem({
      org_id: orgId,
      grant_name: grant.title,
      funder_name: grant.funder,
      funder_type: grant.funderType ?? 'trust_foundation',
      amount_requested: null,
      amount_min: grant.amountMin || null,
      amount_max: grant.amountMax || null,
      deadline: grant.deadline,
      stage: 'identified',
      notes: null,
      application_progress: null,
      is_urgent: false,
      contact_name: null,
      contact_email: null,
      grant_url: grant.applyUrl,
      outcome_date: null,
      outcome_notes: null,
      created_by: userId,
    })
    setMatchActioning(prev => ({ ...prev, [id]: 'done' }))
    setTimeout(() => {
      setMatchState(prev => ({ ...prev, [id]: 'pipeline' }))
      setMatchActioning(prev => { const n = { ...prev }; delete n[id]; return n })
    }, 900)
  }

  // ── Derived data ─────────────────────────────────────────────────────────────
  const overdue     = alerts.filter(a => a.urgency === 'overdue')
  const urgentCount = alerts.filter(a => a.urgency === 'urgent' || a.urgency === 'overdue').length

  const filteredAlerts = showPipeline ? alerts : []
  const calDays        = buildCalendarDays(calYear, calMonth, filteredAlerts)

  // Scheduled = all pipeline alerts with deadline, sorted soonest first
  const scheduledPipeline = [...filteredAlerts]
    .sort((a, b) => ((a.item.deadline ?? '9999') < (b.item.deadline ?? '9999') ? -1 : 1))

  // Visible match rows (exclude already-pipelined)
  const pipelinedUrls = new Set(alerts.map(a => a.item.grant_url).filter(Boolean))
  const visibleMatchRows = showMatches
    ? matchRows.filter(m => !pipelinedUrls.has(m.grant.applyUrl ?? ''))
    : []

  // Merge + sort all scheduled rows together by deadline
  type ScheduledRow =
    | { kind: 'pipeline'; alert: DeadlineAlert }
    | { kind: 'saved';    grant: EnrichedGrant }
    | { kind: 'match';    grant: EnrichedGrant; score: number }

  const visibleSavedRows = showSaved ? savedGrantRows : []

  const allScheduled: ScheduledRow[] = [
    ...scheduledPipeline.map(a => ({ kind: 'pipeline' as const, alert: a })),
    ...visibleSavedRows.map(g => ({ kind: 'saved' as const, grant: g })),
    ...visibleMatchRows.map(m => ({ kind: 'match' as const, grant: m.grant, score: m.score })),
  ].sort((a, b) => {
    const da = a.kind === 'pipeline' ? (a.alert.item.deadline ?? '9999') : (a.grant.deadline ?? '9999')
    const db = b.kind === 'pipeline' ? (b.alert.item.deadline ?? '9999') : (b.grant.deadline ?? '9999')
    return da < db ? -1 : da > db ? 1 : 0
  })

  // Calendar marker map — all three sources for dot rendering
  const calMarkerMap = new Map<string, { types: string[]; hasUrgent: boolean }>()
  function addMarker(date: string | null | undefined, type: string, urgent: boolean) {
    if (!date) return
    const m = calMarkerMap.get(date) ?? { types: [], hasUrgent: false }
    if (!m.types.includes(type)) m.types.push(type)
    if (urgent) m.hasUrgent = true
    calMarkerMap.set(date, m)
  }
  filteredAlerts.forEach(a => {
    const t = itemFundingType(a.item)
    addMarker(a.item.deadline, t, a.urgency === 'urgent' || a.urgency === 'overdue')
  })
  visibleSavedRows.forEach(g => {
    const days = g.deadline ? Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86400000) : null
    addMarker(g.deadline, g.fundingType ?? 'grant', days != null && days <= 7)
  })
  visibleMatchRows.forEach(m => {
    const days = m.grant.deadline ? Math.ceil((new Date(m.grant.deadline).getTime() - Date.now()) / 86400000) : null
    addMarker(m.grant.deadline, m.grant.fundingType ?? 'grant', days != null && days <= 7)
  })

  // Day-filter applied to scheduled list
  const displayedScheduled = dayFilter
    ? allScheduled.filter(r => {
        const d = r.kind === 'pipeline' ? r.alert.item.deadline : r.grant.deadline
        return d === dayFilter
      })
    : allScheduled

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function dateLabel(iso: string | null): string {
    if (!iso) return ''
    const parts = iso.split('-')
    if (parts.length !== 3) return ''
    return `${parseInt(parts[2])} ${MONTH_NAMES[parseInt(parts[1]) - 1]?.slice(0, 3) ?? ''}`
  }

  function dot(label: string): React.ReactNode {
    return <span style={{ color: '#8A8986', margin: '0 2px' }}>&middot;</span>
  }

  // ── Loading / error states ────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64 text-[#5F5E5A] text-sm">Loading deadlines…</div>
  )
  if (error) return (
    <div className="p-8 text-center"><p style={{ color: '#993C1D' }} className="font-medium">{error}</p></div>
  )

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'var(--font-plus-jakarta, Plus Jakarta Sans, sans-serif)' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 36, fontWeight: 700,
            letterSpacing: '-0.02em', margin: '0 0 4px', color: '#2C2C2A', lineHeight: 1.1 }}>Deadlines</h1>
          <p style={{ fontSize: 13, color: '#5F5E5A', margin: 0 }}>
            Every deadline across your pipeline, saved grants and live matches.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          {/* Stat summary */}
          {(noDeadlineItems.length > 0 || allScheduled.length > 0) && (
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#2C2C2A', margin: 0, lineHeight: 1.2 }}>
                {(noDeadlineItems.length > 0 || (showSaved && savedNoDeadline.length > 0)) && (
                  <span style={{ color: '#5F5E5A' }}>{noDeadlineItems.length} need a date</span>
                )}
                {noDeadlineItems.length > 0 && allScheduled.length > 0 && (
                  <span style={{ color: '#C5C3BC', margin: '0 5px' }}>&middot;</span>
                )}
                {allScheduled.length > 0 && (
                  <span style={{ color: '#3B6D11' }}>{allScheduled.length} scheduled</span>
                )}
                {noDeadlineItems.length === 0 && allScheduled.length === 0 && (
                  <span style={{ color: '#8A8986' }}>No deadlines yet</span>
                )}
              </p>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a href="/dashboard/pipeline"
              style={{ fontSize: 12, fontWeight: 500, padding: '7px 14px', border: '0.5px solid rgba(0,0,0,0.14)',
                borderRadius: 10, color: '#2C2C2A', background: '#fff', display: 'inline-flex',
                alignItems: 'center', gap: 6, textDecoration: 'none' }}>
              Pipeline <ArrowRight size={12} />
            </a>
            <button onClick={() => setAddOpen(true)}
              style={{ fontSize: 12, fontWeight: 600, padding: '7px 14px',
                border: '1px solid #2C2C2A', borderRadius: 10,
                background: '#fff', color: '#2C2C2A', display: 'inline-flex', alignItems: 'center',
                gap: 6, cursor: 'pointer', fontFamily: 'inherit' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#2C2C2A'; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#2C2C2A' }}>
              <Plus size={12} /> Add deadline
            </button>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) 240px',
        gap: 20,
      }}
        className="deadlines-layout">

        {/* ── Left column: list ── */}
        <div style={{ minWidth: 0 }}>

          {/* Section 1: Needs a deadline */}
          {noDeadlineItems.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, height: 22 }}>
                <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 15, fontWeight: 600, color: '#2C2C2A' }}>
                  Needs a deadline
                </span>
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, fontWeight: 500,
                  background: '#F5F1E8', color: '#5F5E5A' }}>{noDeadlineItems.length + (showSaved ? savedNoDeadline.length : 0)}</span>
              </div>

              <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.10)', borderRadius: 10,
                marginBottom: 12 }}>
                {noDeadlineItems.map((item, idx) => {
                  const amountStr = formatRange(item.amount_min, item.amount_max ?? item.amount_requested)
                  const type      = itemFundingType(item)
                  const val       = deadlineInputs[item.id] ?? ''
                  const saving    = savingDeadline === item.id
                  const success   = deadlineSuccesses.has(item.id)
                  const funderDiff = item.funder_name && item.funder_name !== item.grant_name
                  return (
                    <div key={item.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', fontSize: 13,
                      borderBottom: idx < noDeadlineItems.length - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none',
                    }}>
                      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 500, color: '#2C2C2A' }}>{item.grant_name}</span>
                        {funderDiff && (
                          <span style={{ color: '#8A8986', fontWeight: 400 }}> &middot; {item.funder_name}</span>
                        )}
                        {amountStr && (
                          <span style={{ color: '#8A8986' }}> &middot; <span style={{ color: '#3B6D11', fontWeight: 500 }}>{amountStr}</span></span>
                        )}
                      </div>
                      <TypeChip type={type} />
                      <StageChip stage={item.stage} />
                      <DatePickerInput
                        value={val}
                        onChange={v => setDeadlineInputs(prev => ({ ...prev, [item.id]: v }))} />
                      {success ? (
                        <span style={{ fontSize: 11, fontWeight: 500, color: '#3B6D11', padding: '4px 10px',
                          background: '#F1F7E4', borderRadius: 6, display: 'inline-flex', alignItems: 'center',
                          gap: 4, flexShrink: 0 }}>
                          <Check size={11} strokeWidth={3} /> Set
                        </span>
                      ) : (
                        <button onClick={() => handleSetDeadline(item.id, val)} disabled={!val || saving}
                          style={{ fontSize: 11, fontWeight: 500, padding: '4px 10px', border: 'none', borderRadius: 6,
                            cursor: val && !saving ? 'pointer' : 'not-allowed', fontFamily: 'inherit', flexShrink: 0,
                            background: val ? '#8ECB3C' : '#F5F1E8',
                            color: val ? '#173404' : '#8A8986' }}>
                          {saving ? '\u2026' : 'Set'}
                        </button>
                      )}
                    </div>
                  )
                })}
                {/* Saved grants needing a self-imposed deadline */}
                {showSaved && savedNoDeadline.map((g, idx) => {
                  const amtStr = g.amountMin || g.amountMax ? formatRange(g.amountMin || null, g.amountMax || null) : ''
                  const type   = g.fundingType ?? 'grant'
                  const val    = savedInputs[g.id] ?? ''
                  const saving = savingSaved === g.id
                  const success = savedSuccesses.has(g.id)
                  const funderDiff = g.funder && g.funder !== g.title
                  const totalRows = noDeadlineItems.length + savedNoDeadline.length
                  const rowIdx = noDeadlineItems.length + idx
                  return (
                    <div key={g.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', fontSize: 13,
                      borderTop: (noDeadlineItems.length > 0 || idx > 0) ? '0.5px solid rgba(0,0,0,0.06)' : 'none',
                    }}>
                      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 500, color: '#2C2C2A' }}>{g.title}</span>
                        {funderDiff && (
                          <span style={{ color: '#8A8986', fontWeight: 400 }}> &middot; {g.funder}</span>
                        )}
                        {amtStr && (
                          <span style={{ color: '#8A8986' }}> &middot; <span style={{ color: '#3B6D11', fontWeight: 500 }}>{amtStr}</span></span>
                        )}
                      </div>
                      <TypeChip type={type} />
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, fontWeight: 500,
                        background: '#F5F1E8', color: '#5F5E5A', flexShrink: 0 }}>Saved</span>
                      <DatePickerInput value={val}
                        onChange={v => setSavedInputs(prev => ({ ...prev, [g.id]: v }))} />
                      {success ? (
                        <span style={{ fontSize: 11, fontWeight: 500, color: '#3B6D11', padding: '4px 10px',
                          background: '#F1F7E4', borderRadius: 6, display: 'inline-flex', alignItems: 'center',
                          gap: 4, flexShrink: 0 }}>
                          <Check size={11} strokeWidth={3} /> Set
                        </span>
                      ) : (
                        <button onClick={() => handleSetSavedDeadline(g, val)} disabled={!val || saving}
                          style={{ fontSize: 11, fontWeight: 500, padding: '4px 10px', border: 'none', borderRadius: 6,
                            cursor: val && !saving ? 'pointer' : 'not-allowed', fontFamily: 'inherit', flexShrink: 0,
                            background: val ? '#8ECB3C' : '#F5F1E8',
                            color: val ? '#173404' : '#8A8986' }}>
                          {saving ? '\u2026' : 'Set'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Section 2: Scheduled */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, height: 22 }}>
            <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 15, fontWeight: 600, color: '#2C2C2A' }}>
              Scheduled
            </span>
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, fontWeight: 500,
              background: '#F1F7E4', color: '#3B6D11' }}>
              {displayedScheduled.length}{urgentCount > 0 && !dayFilter ? ` · ${urgentCount} urgent` : ''}
            </span>
            {dayFilter && (
              <button onClick={() => setDayFilter(null)}
                style={{ fontSize: 10, color: '#639922', background: 'none', border: 'none',
                  cursor: 'pointer', padding: 0, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                × Clear {dateLabel(dayFilter)}
              </button>
            )}
            <span style={{ fontSize: 10, color: '#8A8986', marginLeft: 'auto' }}>Sorted soonest first</span>
          </div>

          <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.10)', borderRadius: 10,
            marginBottom: 12, overflow: 'hidden' }}>

            {displayedScheduled.length === 0 && (
              <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: 12, color: '#8A8986' }}>
                {dayFilter ? `No deadlines on ${dateLabel(dayFilter)}.` : 'No scheduled deadlines yet.'}
              </div>
            )}

            {displayedScheduled.map((row, idx) => {
              const isLast = idx === displayedScheduled.length - 1

              if (row.kind === 'pipeline') {
                const a         = row.alert
                const isUrgent  = a.urgency === 'urgent' || a.urgency === 'overdue'
                const daysUntil = a.daysUntil
                const showPill  = daysUntil != null && daysUntil <= 30
                const type      = itemFundingType(a.item)
                const dl        = dateLabel(a.item.deadline)
                const amtStr    = formatRange(a.item.amount_min, a.item.amount_max ?? a.item.amount_requested)
                const funderDiff = a.item.funder_name && a.item.funder_name !== a.item.grant_name
                return (
                  <div key={a.item.id}
                    onClick={() => setEditItem(a.item)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', fontSize: 13,
                      borderBottom: isLast ? 'none' : '0.5px solid rgba(0,0,0,0.06)',
                      borderLeft: isUrgent ? '3px solid #D85A30' : '3px solid transparent',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#FAFAF7' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
                    {/* Date block */}
                    <div style={{ width: 54, flexShrink: 0, textAlign: 'center' }}>
                      {showPill && (
                        <div style={{ fontSize: 11, fontWeight: 600, padding: '2px 0', borderRadius: 999, marginBottom: 1,
                          background: isUrgent ? '#FAECE7' : '#F1F7E4',
                          color: isUrgent ? '#993C1D' : '#3B6D11' }}>
                          {a.urgency === 'overdue' ? 'Overdue' : `${daysUntil}d`}
                        </div>
                      )}
                      <div style={{ fontSize: showPill ? 11 : 12, color: '#5F5E5A' }}>{dl}</div>
                    </div>
                    {/* Body — single-line title·funder·amount */}
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 500, color: '#2C2C2A' }}>{a.item.grant_name}</span>
                      {funderDiff && (
                        <span style={{ color: '#8A8986', fontWeight: 400 }}> &middot; {a.item.funder_name}</span>
                      )}
                      {amtStr && (
                        <span style={{ color: '#8A8986' }}> &middot; <span style={{ color: '#3B6D11', fontWeight: 500 }}>{amtStr}</span></span>
                      )}
                    </div>
                    <TypeChip type={type} />
                    <StageChip stage={a.item.stage} />
                    <ArrowRight size={12} style={{ color: '#8A8986', flexShrink: 0 }} />
                  </div>
                )
              }

              // Saved row
              if (row.kind === 'saved') {
                const g         = row.grant
                const daysUntil = g.deadline
                  ? Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86400000)
                  : null
                const isUrgent  = daysUntil != null && daysUntil <= 7
                const showPill  = daysUntil != null && daysUntil <= 30
                const dl        = dateLabel(g.deadline)
                const amtStr    = g.amountMin || g.amountMax ? formatRange(g.amountMin || null, g.amountMax || null) : ''
                const type      = g.fundingType ?? 'grant'
                const funderDiff = g.funder && g.funder !== g.title
                return (
                  <div key={g.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', fontSize: 13,
                    borderBottom: isLast ? 'none' : '0.5px solid rgba(0,0,0,0.06)',
                    borderLeft: isUrgent ? '3px solid #D85A30' : '3px solid transparent',
                    background: '#FDFCF8',
                  }}>
                    {/* Date block */}
                    <div style={{ width: 54, flexShrink: 0, textAlign: 'center' }}>
                      {showPill && (
                        <div style={{ fontSize: 11, fontWeight: 600, padding: '2px 0', borderRadius: 999, marginBottom: 1,
                          background: isUrgent ? '#FAECE7' : '#F1F7E4',
                          color: isUrgent ? '#993C1D' : '#3B6D11' }}>
                          {isUrgent ? `${daysUntil}d` : `${daysUntil}d`}
                        </div>
                      )}
                      <div style={{ fontSize: showPill ? 11 : 12, color: '#5F5E5A' }}>{dl}</div>
                    </div>
                    {/* Body */}
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 500, color: '#2C2C2A' }}>{g.title}</span>
                      {funderDiff && (
                        <span style={{ color: '#8A8986', fontWeight: 400 }}> &middot; {g.funder}</span>
                      )}
                      {amtStr && (
                        <span style={{ color: '#8A8986' }}> &middot; <span style={{ color: '#3B6D11', fontWeight: 500 }}>{amtStr}</span></span>
                      )}
                    </div>
                    <TypeChip type={type} />
                    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, fontWeight: 500,
                      background: '#F5F1E8', color: '#5F5E5A', flexShrink: 0 }}>Saved</span>
                    {g.applyUrl && (
                      <a href={g.applyUrl} target="_blank" rel="noopener noreferrer"
                        style={{ color: '#8A8986', display: 'inline-flex', flexShrink: 0 }}
                        onClick={e => e.stopPropagation()}>
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                )
              }

              // Match row
              const { grant: g, score } = row
              const gId       = g.id
              const state     = matchState[gId]
              const actioning = matchActioning[gId]
              const daysUntil = g.deadline
                ? Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86400000)
                : null
              const isUrgent  = daysUntil != null && daysUntil <= 7
              const showPill  = daysUntil != null && daysUntil <= 30
              const dl        = dateLabel(g.deadline)
              const amtStr    = g.amountMin || g.amountMax ? formatRange(g.amountMin || null, g.amountMax || null) : ''
              const type      = g.fundingType ?? 'grant'
              const dotColor  = score >= 70 ? '#97C459' : score >= 50 ? '#C0DD97' : '#D9D6CB'
              const funderDiff = g.funder && g.funder !== g.title
              return (
                <div key={gId} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', fontSize: 13,
                  borderBottom: isLast ? 'none' : '0.5px solid rgba(0,0,0,0.06)',
                  borderLeft: isUrgent ? '3px solid #D85A30' : '3px solid transparent',
                  background: '#FDFCF8',
                }}>
                  {/* Date block */}
                  <div style={{ width: 54, flexShrink: 0, textAlign: 'center' }}>
                    {showPill && (
                      <div style={{ fontSize: 11, fontWeight: 600, padding: '2px 0', borderRadius: 999, marginBottom: 1,
                        background: isUrgent ? '#FAECE7' : '#F1F7E4',
                        color: isUrgent ? '#993C1D' : '#3B6D11' }}>
                        {daysUntil}d
                      </div>
                    )}
                    <div style={{ fontSize: showPill ? 11 : 12, color: '#5F5E5A' }}>{dl}</div>
                  </div>
                  {/* Body */}
                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 500, color: '#2C2C2A' }}>{g.title}</span>
                    {funderDiff && (
                      <span style={{ color: '#8A8986', fontWeight: 400 }}> &middot; {g.funder}</span>
                    )}
                    {amtStr && (
                      <span style={{ color: '#8A8986' }}> &middot; <span style={{ color: '#3B6D11', fontWeight: 500 }}>{amtStr}</span></span>
                    )}
                  </div>
                  {/* Match % — right-aligned, scannable with pills */}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
                    color: score >= 70 ? '#3B6D11' : score >= 50 ? '#5F5E5A' : '#8A8986', flexShrink: 0 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
                    {score}%
                  </span>
                  <TypeChip type={type} />
                  {/* Actions */}
                  {state === 'saved' && (
                    <><span style={{ fontSize: 10, color: '#8A8986' }}>Saved</span><ArrowRight size={12} style={{ color: '#8A8986' }} /></>
                  )}
                  {state === 'pipeline' && (
                    <><StageChip stage="identified" /><ArrowRight size={12} style={{ color: '#8A8986' }} /></>
                  )}
                  {!state && actioning === 'done' && (
                    <span style={{ fontSize: 10, fontWeight: 500, color: '#3B6D11', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <Check size={10} strokeWidth={3} /> Added
                    </span>
                  )}
                  {!state && actioning !== 'done' && (
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button onClick={() => handleSaveMatch(gId)} disabled={!!actioning}
                        style={{ fontSize: 12, fontWeight: 500, color: '#5F5E5A', padding: '4px 8px', borderRadius: 6,
                          border: '0.5px solid rgba(0,0,0,0.14)', background: '#fff', cursor: actioning ? 'not-allowed' : 'pointer',
                          fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        {actioning === 'saving' ? '\u2026' : 'Save'}
                      </button>
                      <button onClick={() => handlePipelineMatch(g)} disabled={!!actioning}
                        style={{ fontSize: 12, fontWeight: 500, padding: '4px 8px', borderRadius: 6, border: 'none',
                          cursor: actioning ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                          background: actioning ? '#F5F1E8' : '#8ECB3C',
                          color: actioning ? '#8A8986' : '#173404',
                          display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        {actioning === 'pipelining' ? '\u2026' : <><Plus size={9} />Pipeline</>}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

        </div>

        {/* ── Right column: calendar + sources ── */}
        <div style={{ minWidth: 0 }} className="deadlines-sidebar">

          {/* Section heading — same height as left heading */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, height: 22 }}>
            <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 13, fontWeight: 500, color: '#2C2C2A' }}>
              Calendar
            </span>
          </div>

          {/* Mini calendar card */}
          <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.10)', borderRadius: 10,
            padding: 12, marginBottom: 12 }}>

            {/* Nav */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <button onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) } else setCalMonth(m => m - 1) }}
                style={{ width: 20, height: 20, borderRadius: 6, background: '#F1F0EA', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5F5E5A', cursor: 'pointer' }}>
                <ChevronLeft size={10} strokeWidth={2.5} />
              </button>
              <span style={{ flex: 1, textAlign: 'center', fontFamily: 'var(--font-space-grotesk)',
                fontSize: 12, fontWeight: 500, color: '#2C2C2A' }}>
                {MONTH_NAMES[calMonth]} {calYear}
              </span>
              <button onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) } else setCalMonth(m => m + 1) }}
                style={{ width: 20, height: 20, borderRadius: 6, background: '#F1F0EA', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5F5E5A', cursor: 'pointer' }}>
                <ChevronRight size={10} strokeWidth={2.5} />
              </button>
            </div>

            {/* Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, fontSize: 10 }}>
              {['M','T','W','T','F','S','S'].map((d, i) => (
                <div key={i} style={{ textAlign: 'center', color: '#8A8986', padding: '3px 0',
                  letterSpacing: '0.05em', fontSize: 9 }}>{d}</div>
              ))}
              {calDays.map((day, i) => {
                const isToday   = day.isToday
                const cellIso   = day.date.toISOString().split('T')[0]
                const markers   = day.isCurrentMonth ? calMarkerMap.get(cellIso) : undefined
                const hasAlerts = !!markers
                const isActive  = dayFilter === cellIso
                const hasUrgent = markers?.hasUrgent ?? false

                // Priority: selected > urgent > has-deadline > today > empty
                let bg = 'transparent'
                let textColor = day.isCurrentMonth ? '#2C2C2A' : '#C5C3BC'
                let border = 'none'
                let fw: number = 400

                if (!day.isCurrentMonth) {
                  // out-of-month: always plain, no fill
                } else if (isActive) {
                  bg = '#8ECB3C'; textColor = '#173404'; fw = 600
                } else if (hasUrgent) {
                  bg = '#FAECE7'; textColor = '#993C1D'; fw = 500
                } else if (hasAlerts) {
                  bg = '#F1F7E4'; textColor = '#3B6D11'; fw = 500
                } else if (isToday) {
                  bg = '#FDFCF8'; textColor = '#3B6D11'; border = '1.5px solid #8ECB3C'; fw = 600
                }

                // Hover: deepen fill slightly for interactive days
                function hoverBg() {
                  if (isActive) return '#7ABD2E'
                  if (hasUrgent) return '#F5DDD8'
                  if (hasAlerts) return '#E5F0D8'
                  if (isToday) return '#F1F7E4'
                  return 'transparent'
                }

                return (
                  <div key={i}
                    onClick={() => {
                      if (!day.isCurrentMonth || !hasAlerts) return
                      setDayFilter(prev => prev === cellIso ? null : cellIso)
                    }}
                    style={{
                      height: 28,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 6, fontSize: 11, userSelect: 'none',
                      color: textColor, background: bg, border, fontWeight: fw,
                      cursor: hasAlerts && day.isCurrentMonth ? 'pointer' : 'default',
                    }}
                    onMouseEnter={e => { if (day.isCurrentMonth) e.currentTarget.style.background = hoverBg() }}
                    onMouseLeave={e => { e.currentTarget.style.background = bg }}>
                    {day.date.getDate()}
                  </div>
                )
              })}
            </div>

            {/* Legend */}
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '0.5px solid rgba(0,0,0,0.06)',
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 6px' }}>
              {[
                { bg: '#F1F7E4', label: 'Has deadline' },
                { bg: '#FAECE7', label: 'Urgent'       },
                { bg: '#FDFCF8', label: 'Today', border: '1.5px solid #8ECB3C' },
                { bg: '#8ECB3C', label: 'Selected'     },
              ].map(({ bg: d, label, border: b }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 4, background: d,
                    border: b ?? 'none', display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: '#5F5E5A' }}>{label}</span>
                </div>
              ))}
            </div>

          </div>

          {/* Sources filter */}
          <div style={{ background: '#F5F1E8', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 11, fontWeight: 500,
              color: '#2C2C2A', marginBottom: 6 }}>Sources</div>
            {[
              { label: 'Pipeline', checked: showPipeline, count: alerts.length,        toggle: () => setShowPipeline(v => !v) },
              { label: 'Saved',    checked: showSaved,    count: savedGrantRows.length + savedNoDeadline.length, toggle: () => setShowSaved(v => !v)    },
              { label: 'Matches',  checked: showMatches,  count: matchRows.length,      toggle: () => setShowMatches(v => !v)  },
            ].map(({ label, checked, count, toggle }) => (
              <label key={label} onClick={toggle}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#2C2C2A',
                  padding: '3px 0', cursor: 'pointer', userSelect: 'none' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  background: checked ? '#639922' : '#fff',
                  border: checked ? 'none' : '1.5px solid #D9D6CB' }}>
                  {checked && <Check size={8} strokeWidth={4} color="#fff" />}
                </span>
                {label}
                <span style={{ color: '#8A8986', marginLeft: 'auto' }}>{count}</span>
              </label>
            ))}
          </div>

        </div>

      </div>

      {/* Responsive style — hide sidebar ≤900px */}
      <style>{`
        @media (max-width: 900px) {
          .deadlines-layout { grid-template-columns: minmax(0,1fr) !important; }
          .deadlines-sidebar { display: none !important; }
        }
        @media (max-width: 680px) {
          .deadlines-layout .row-wrap { flex-wrap: wrap; }
        }
      `}</style>

      {/* Edit deadline modal */}
      {editItem && (
        <EditDeadlineModal item={editItem} onClose={() => setEditItem(null)}
          onSaved={() => { setEditItem(null); loadData(); showToast('Deadline updated!') }} />
      )}

      {/* Day alerts sheet (multiple items on same day) */}
      {dayPickerAlerts && (
        <DayAlertsSheet alerts={dayPickerAlerts} onClose={() => setDayPickerAlerts(null)}
          onSelect={item => { setDayPickerAlerts(null); setEditItem(item) }} />
      )}

      {/* Add deadline modal */}
      {addOpen && (
        <AddDeadlineModal orgId={orgId} userId={userId}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); loadData(); showToast('Deadline added!') }} />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-lg text-sm z-50"
          style={{ background: '#173404', color: '#F1F7E4' }}>
          ✓ {toast}
        </div>
      )}
    </div>
  )
}

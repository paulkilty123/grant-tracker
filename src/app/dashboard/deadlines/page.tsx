'use client'

import { useState, useEffect, useRef } from 'react'
import { CalendarClock, CalendarCheck, ExternalLink, ArrowRight, Calendar, CalendarDays, AlarmClock, ChevronDown, ChevronUp, Send, ChevronLeft, ChevronRight, Info, Plus, X as XIcon, Check, Landmark, Rocket, TrendingUp, Gift, Pencil, CheckCircle2, Users, MapPin, Star, DollarSign, Lightbulb, AlertTriangle, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getDeadlineAlerts, formatDeadline, formatRange, PIPELINE_STAGES } from '@/lib/utils'
import { updatePipelineStage, updatePipelineItem, createPipelineItem, deletePipelineItem } from '@/lib/pipeline'
import { PipelineModal } from '@/app/dashboard/pipeline/page'
import { recordInteraction } from '@/lib/interactions'
import { usePlausible } from 'next-plausible'
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
  const plausible = usePlausible()
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
      plausible('pipeline_added')
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

// ── Eligible-structure label map (mirrors Find Funding) ──────────────────────
const STRUCTURE_LABELS: Record<string, string> = {
  cic: 'CIC', cic_guarantee: 'CIC (Guarantee)', cic_shares: 'CIC (Shares)',
  charity: 'Charity', registered_charity: 'Charity',
  charitable_incorporated_organisation: 'CIO', cio: 'CIO',
  social_enterprise: 'Social Enterprise',
  community_interest_company: 'CIC',
  ltd_company: 'Ltd Company',
  company_ltd_guarantee: 'Ltd by Guarantee', ltd_guarantee: 'Ltd by Guarantee',
  community_benefit_society: 'Comm. Benefit Society',
  coop: 'Co-operative', cooperative: 'Co-operative',
  unincorporated: 'Unincorporated',
  voluntary_organisation: 'Voluntary Org',
  sole_trader: 'Sole Trader',
  partnership: 'Partnership',
  public_sector: 'Public Sector',
  school: 'School',
}

// ── Grant Preview Modal (saved + match rows) ─────────────────────────────────
function GrantPreviewModal({
  grant,
  onClose,
  onAddToPipeline,
  onSetDeadline,
  inPipeline,
  saving,
}: {
  grant: EnrichedGrant
  onClose: () => void
  onAddToPipeline: () => void
  onSetDeadline: (deadline: string) => void
  inPipeline: boolean
  saving: boolean
}) {
  const UI_FONT   = 'var(--font-space-grotesk)'
  const BODY_FONT = 'var(--font-dm-sans, Plus Jakarta Sans, sans-serif)'
  const [deadlineValue, setDeadlineValue] = useState('')
  const [insightsExpanded, setInsightsExpanded] = useState(false)
  const [insightsHover, setInsightsHover] = useState(false)

  const brief = grant.funderBrief ?? null
  const fundingType = grant.fundingType ?? 'grant'
  const amtStr      = formatRange(grant.amountMin || null, grant.amountMax || null) ?? ''
  const dlLabel     = grant.deadline ? formatDeadline(grant.deadline) : null
  const typicalAwardText = brief
    ? (brief.typical_award ?? ((grant.amountMin || grant.amountMax) ? formatRange(grant.amountMin || null, grant.amountMax || null) : null))
    : null
  const stripTitle = fundingType === 'investment' ? 'About this impact investor'
    : fundingType === 'programme' ? 'About this programme'
    : fundingType === 'in_kind'   ? 'About this in-kind partner'
    : 'About this grant'
  const stripSub = brief ? 'What they fund, who qualifies, tips for applying' : 'Eligibility, who qualifies, and more'

  const PAL = {
    green: { bg: '#F1F7E4', stroke: '#3B6D11' },
    coral: { bg: '#FAECE7', stroke: '#993C1D' },
    amber: { bg: '#FAEEDA', stroke: '#854F0B' },
  } as const

  const briefBlocks: { Icon: LucideIcon; pal: keyof typeof PAL; label: string; text: string }[] = brief ? ([
    brief.what_they_fund     ? { Icon: CheckCircle2, pal: 'green' as const, label: 'What they fund',     text: brief.what_they_fund     } : null,
    brief.who_can_apply      ? { Icon: Users,        pal: 'green' as const, label: 'Who can apply',      text: brief.who_can_apply      } : null,
    brief.geographic_focus   ? { Icon: MapPin,       pal: 'amber' as const, label: 'Geographic focus',   text: brief.geographic_focus   } : null,
    brief.priorities         ? { Icon: TrendingUp,   pal: 'coral' as const, label: 'Current priorities', text: brief.priorities         } : null,
    brief.strong_application ? { Icon: Star,         pal: 'green' as const, label: 'Strong application', text: brief.strong_application } : null,
    typicalAwardText         ? { Icon: DollarSign,   pal: 'green' as const, label: 'Typical award',      text: typicalAwardText         } : null,
    brief.decision_timeline  ? { Icon: CalendarDays, pal: 'amber' as const, label: 'Decision timeline',  text: brief.decision_timeline  } : null,
    brief.funder_tips        ? { Icon: Lightbulb,    pal: 'coral' as const, label: 'Insider tips',       text: brief.funder_tips        } : null,
  ].filter((b): b is { Icon: LucideIcon; pal: keyof typeof PAL; label: string; text: string } => b !== null)) : []

  const DASH = '0.5px dashed rgba(0,0,0,0.08)'
  const lastRow = briefBlocks.length > 0 ? Math.floor((briefBlocks.length - 1) / 2) * 2 : 0

  function handleSetDeadlineClick() {
    if (!deadlineValue) return
    onSetDeadline(deadlineValue)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5"
      style={{ background: 'rgba(23,52,4,0.40)', overflowY: 'auto' }}
      onClick={onClose}>
      <div style={{ width: '100%', maxWidth: 640, maxHeight: '90vh', background: '#fff', borderRadius: 16,
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(23,52,4,0.25)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '0.5px solid rgba(0,0,0,0.08)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexShrink: 0 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <TypeChip type={fundingType} />
              {grant.eligibilityStatus === 'eligible' && (
                <span style={{ fontFamily: UI_FONT, fontSize: 11, padding: '2px 8px', borderRadius: 999, fontWeight: 500,
                  background: '#F1F7E4', color: '#3B6D11' }}>Eligible</span>
              )}
              {grant.eligibilityStatus === 'check_required' && (
                <span style={{ fontFamily: UI_FONT, fontSize: 11, padding: '2px 8px', borderRadius: 999, fontWeight: 500,
                  background: '#FAEEDA', color: '#854F0B' }}>Check required</span>
              )}
            </div>
            <h3 style={{ fontFamily: UI_FONT, fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em',
              margin: '0 0 4px', color: '#2C2C2A', lineHeight: 1.25 }}>
              {grant.title}
            </h3>
            {grant.funder && grant.funder !== grant.title && (
              <p style={{ fontFamily: BODY_FONT, fontSize: 13, color: '#5F5E5A', margin: 0 }}>{grant.funder}</p>
            )}
          </div>
          <button onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: 8, background: '#F1F0EA', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#5F5E5A', cursor: 'pointer', flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.background = '#E5E2D7' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#F1F0EA' }}>
            <XIcon size={14} strokeWidth={2.5} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* Amount & deadline strip */}
          {(amtStr || dlLabel) && (
            <div style={{ display: 'grid', gridTemplateColumns: amtStr && dlLabel ? '1fr 1fr' : '1fr',
              padding: '16px 24px', gap: 16, borderBottom: '0.5px solid rgba(0,0,0,0.06)', background: '#FAFAF7' }}>
              {amtStr && (
                <div>
                  <p style={{ fontFamily: UI_FONT, fontSize: 10, fontWeight: 500, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: '#8A8986', margin: '0 0 4px' }}>Grant amount</p>
                  <p style={{ fontFamily: UI_FONT, fontSize: 18, fontWeight: 600, color: '#854F0B', margin: 0 }}>{amtStr}</p>
                </div>
              )}
              {dlLabel && (
                <div>
                  <p style={{ fontFamily: UI_FONT, fontSize: 10, fontWeight: 500, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: '#8A8986', margin: '0 0 4px' }}>Deadline</p>
                  <p style={{ fontFamily: UI_FONT, fontSize: 14, fontWeight: 500, color: '#2C2C2A', margin: 0,
                    display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Calendar size={13} strokeWidth={2} style={{ color: '#5F5E5A' }} />
                    {dlLabel}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* About */}
          {grant.description && (
            <div style={{ padding: '18px 24px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
              <p style={{ fontFamily: UI_FONT, fontSize: 10, fontWeight: 500, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: '#8A8986', margin: '0 0 8px' }}>About this grant</p>
              <p style={{ fontFamily: BODY_FONT, fontSize: 13.5, lineHeight: 1.55, color: '#2C2C2A', margin: 0 }}>
                {grant.description}
              </p>
            </div>
          )}

          {/* Impact sectors */}
          {grant.impactSectors && grant.impactSectors.length > 0 && (
            <div style={{ padding: '16px 24px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
              <p style={{ fontFamily: UI_FONT, fontSize: 10, fontWeight: 500, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: '#8A8986', margin: '0 0 10px' }}>Impact sectors</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {grant.impactSectors.map(s => (
                  <span key={s} style={{ fontFamily: BODY_FONT, fontSize: 12, padding: '4px 10px', borderRadius: 999,
                    background: '#F1F7E4', color: '#3B6D11', fontWeight: 500 }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Set / change deadline */}
          {!inPipeline && (
            <div style={{ padding: '16px 24px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
              <p style={{ fontFamily: UI_FONT, fontSize: 10, fontWeight: 500, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: '#8A8986', margin: '0 0 8px' }}>Add a deadline</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <DatePickerInput value={deadlineValue} onChange={setDeadlineValue} />
                <button onClick={handleSetDeadlineClick} disabled={!deadlineValue || saving}
                  style={{ fontFamily: UI_FONT, fontSize: 12, fontWeight: 500, padding: '7px 14px', border: 'none', borderRadius: 8,
                    cursor: deadlineValue && !saving ? 'pointer' : 'not-allowed',
                    background: deadlineValue ? '#8ECB3C' : '#F0EFEB', color: deadlineValue ? '#173404' : '#8A8986' }}>
                  {saving ? '…' : 'Set date & save to pipeline'}
                </button>
              </div>
              <p style={{ fontFamily: BODY_FONT, fontSize: 11.5, color: '#8A8986', margin: '8px 0 0' }}>
                Setting a deadline saves this opportunity to your pipeline.
              </p>
            </div>
          )}

          {/* More detail — collapsible */}
          {(brief || grant.eligibilityCriteria?.length || grant.eligibleStructures?.length) && (
            <>
              {!insightsExpanded ? (
                <button
                  onClick={() => setInsightsExpanded(true)}
                  onMouseEnter={() => setInsightsHover(true)}
                  onMouseLeave={() => setInsightsHover(false)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 22px 14px 19px',
                    background: insightsHover ? '#F1F7E4' : '#fff',
                    borderLeft: '3px solid #8ECB3C',
                    borderRight: 'none', borderTop: 'none', borderBottom: 'none',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'background-color 160ms ease',
                    fontFamily: BODY_FONT,
                  }}
                >
                  <Info size={16} strokeWidth={2} style={{ color: insightsHover ? '#639922' : '#173404', flexShrink: 0, transition: 'color 160ms ease' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#2C2C2A' }}>{stripTitle}</div>
                    <div style={{ fontSize: 11, marginTop: 1, color: '#5F5E5A' }}>{stripSub}</div>
                  </div>
                  <ChevronDown size={14} strokeWidth={2.5} style={{ color: '#5F5E5A', flexShrink: 0 }} />
                </button>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center',
                    padding: '12px 22px', background: '#F1F7E4', borderBottom: '0.5px dashed rgba(57,109,17,0.2)' }}>
                    <button onClick={() => setInsightsExpanded(false)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: BODY_FONT,
                        fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase',
                        color: '#3B6D11', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                      <ChevronUp size={12} strokeWidth={2.5} />
                      Hide insights
                    </button>
                  </div>

                  {brief && briefBlocks.length > 0 ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: '#fff' }}>
                        {briefBlocks.map((b, i) => {
                          const Icon = b.Icon
                          return (
                            <div key={i} style={{
                              padding: '16px 22px',
                              borderBottom: i >= lastRow ? 'none' : DASH,
                              borderRight: i % 2 === 0 ? DASH : 'none',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <div style={{ width: 26, height: 26, borderRadius: 7, background: PAL[b.pal].bg,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <Icon size={13} style={{ color: PAL[b.pal].stroke }} />
                                </div>
                                <p style={{ fontFamily: BODY_FONT, fontSize: 11, fontWeight: 500, letterSpacing: '0.08em',
                                  textTransform: 'uppercase', color: '#2C2C2A', margin: 0 }}>{b.label}</p>
                              </div>
                              <p style={{ fontFamily: BODY_FONT, fontSize: 13, lineHeight: 1.55, color: '#5F5E5A', margin: 0 }}>{b.text}</p>
                            </div>
                          )
                        })}
                      </div>
                      {brief.exclusions && (
                        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start',
                          padding: '16px 22px', background: '#FAEEDA', borderTop: '0.5px solid rgba(186,117,23,0.2)' }}>
                          <div style={{ width: 26, height: 26, borderRadius: 7, background: '#FAC775',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <AlertTriangle size={13} style={{ color: '#854F0B' }} />
                          </div>
                          <div>
                            <p style={{ fontFamily: BODY_FONT, fontSize: 11, fontWeight: 500, letterSpacing: '0.08em',
                              textTransform: 'uppercase', color: '#412402', margin: '0 0 4px' }}>Exclusions</p>
                            <p style={{ fontFamily: BODY_FONT, fontSize: 13, lineHeight: 1.55, color: '#854F0B', margin: 0 }}>{brief.exclusions}</p>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ padding: '18px 22px' }}>
                      {grant.eligibilityCriteria && grant.eligibilityCriteria.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <p style={{ fontFamily: BODY_FONT, fontSize: 10, fontWeight: 500, letterSpacing: '0.08em',
                            textTransform: 'uppercase', color: '#8A8986', margin: '0 0 10px' }}>Eligibility criteria</p>
                          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {grant.eligibilityCriteria.map((c, i) => (
                              <li key={i} style={{ display: 'flex', gap: 10, fontFamily: BODY_FONT, fontSize: 13, color: '#5F5E5A' }}>
                                <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 2, color: '#639922' }} />
                                <span style={{ lineHeight: 1.45 }}>{c}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {grant.eligibleStructures && grant.eligibleStructures.length > 0 && (
                        <div>
                          <p style={{ fontFamily: BODY_FONT, fontSize: 10, fontWeight: 500, letterSpacing: '0.08em',
                            textTransform: 'uppercase', color: '#8A8986', margin: '0 0 8px' }}>Eligible organisations</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {grant.eligibleStructures.map(s => (
                              <span key={s} style={{ fontFamily: BODY_FONT, fontSize: 11, fontWeight: 500, padding: '4px 10px',
                                borderRadius: 9999, background: 'rgba(142,203,60,0.12)', color: '#639922' }}>
                                {STRUCTURE_LABELS[s] ?? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

        </div>

        {/* Footer actions */}
        <div style={{ padding: '14px 22px', borderTop: '0.5px solid rgba(0,0,0,0.08)', background: '#FAFAF7',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
          <a href={`/dashboard/grants/${grant.id}`}
            style={{ fontFamily: UI_FONT, fontSize: 12.5, fontWeight: 500, color: '#5F5E5A',
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            onMouseEnter={e => { e.currentTarget.style.color = '#173404' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#5F5E5A' }}>
            View full detail →
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {grant.applyUrl && (
              <a href={grant.applyUrl} target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: UI_FONT, fontSize: 12.5, fontWeight: 500,
                  background: '#173404', color: '#F1F7E4', padding: '8px 14px', borderRadius: 8,
                  textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                Apply now <ExternalLink size={11} />
              </a>
            )}
            {!inPipeline && (
              <button onClick={onAddToPipeline} disabled={saving}
                style={{ fontFamily: UI_FONT, fontSize: 12.5, fontWeight: 500,
                  background: saving ? '#F5F1E8' : '#8ECB3C',
                  color: saving ? '#8A8986' : '#173404',
                  padding: '8px 14px', borderRadius: 8, border: 'none',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Plus size={11} /> Add to Pipeline
              </button>
            )}
            {inPipeline && (
              <span style={{ fontFamily: UI_FONT, fontSize: 11.5, fontWeight: 500,
                color: '#3B6D11', background: '#F1F7E4', padding: '6px 10px', borderRadius: 8,
                display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Check size={11} strokeWidth={2.5} /> In pipeline
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DeadlinesPage() {
  const plausible = usePlausible()
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

  // Row-click modal state
  const [previewPipelineItem, setPreviewPipelineItem] = useState<PipelineItem | null>(null)
  const [previewGrant,        setPreviewGrant]        = useState<EnrichedGrant | null>(null)
  const [previewSaving,       setPreviewSaving]       = useState(false)

  // Calendar
  const now = new Date()
  const [calYear,  setCalYear]  = useState(now.getFullYear())
  const [calMonth, setCalMonth] = useState(now.getMonth())

  // Day filter — when a calendar day is clicked, filter Scheduled to that date
  const [dayFilter, setDayFilter] = useState<string | null>(null)
  const [needsDeadlineOpen, setNeedsDeadlineOpen] = useState(false)

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
    plausible('pipeline_added')
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
    plausible('grant_saved')
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
    plausible('pipeline_added')
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

  // ── Render ─────────────────────────────────────────────────────────────────────────────────
  // Split allScheduled into urgency buckets
  function rowDays(row: ScheduledRow): number {
    const dl = row.kind === 'pipeline' ? row.alert.item.deadline : row.grant.deadline
    if (!dl) return 9999
    return Math.ceil((new Date(dl).getTime() - Date.now()) / 86400000)
  }
  const thisWeek  = displayedScheduled.filter(r => rowDays(r) <= 7)
  const thisMonth = displayedScheduled.filter(r => rowDays(r) > 7 && rowDays(r) <= 31)
  const laterRows = displayedScheduled.filter(r => rowDays(r) > 31)

  // "Needs a deadline" drawer contents
  const needsDeadlineAll = [
    ...noDeadlineItems.map(i => ({ kind: 'pipeline' as const, item: i })),
    ...(showSaved ? savedNoDeadline.map(g => ({ kind: 'saved' as const, grant: g })) : []),
  ]

  // "This month" meta: show the date 31 days out
  const date31 = new Date(Date.now() + 31 * 86400000)
  const thisMonthMeta = `Due by ${date31.getDate()} ${MONTH_NAMES[date31.getMonth()]}`

  const UI_FONT   = 'var(--font-space-grotesk)'
  const BODY_FONT = 'var(--font-dm-sans)'

  // Row renderer — new anatomy: 72px countdown pill | body | actions
  function renderScheduledRow(row: ScheduledRow, bucket: 'week' | 'month' | 'later', isLast: boolean, rowKey: string) {
    const days      = rowDays(row)
    const isOverdue = days < 0
    const dayStr    = isOverdue ? 'Overdue' : `${days}d`

    const dl       = row.kind === 'pipeline' ? row.alert.item.deadline : row.grant.deadline
    const dlLabel  = dateLabel(dl ?? null)

    // Countdown pill colours
    const ctBg     = bucket === 'week'  ? '#FAECE7' : bucket === 'month' ? '#F4F9ED' : '#FAFAF7'
    const ctColor  = bucket === 'week'  ? '#993C1D' : bucket === 'month' ? '#639922' : '#5F5E5A'
    const ctBorder = bucket === 'later' ? '1px solid rgba(23,52,4,0.08)' : 'none'

    // Body data
    let title = '', funder = '', amtStr = '', fundingType = 'grant'
    if (row.kind === 'pipeline') {
      const item  = row.alert.item
      title       = item.grant_name
      funder      = item.funder_name && item.funder_name !== item.grant_name ? item.funder_name : ''
      amtStr      = formatRange(item.amount_min, item.amount_max ?? item.amount_requested) ?? ''
      fundingType = itemFundingType(item)
    } else {
      const g     = row.grant
      title       = g.title
      funder      = g.funder && g.funder !== g.title ? g.funder : ''
      amtStr      = g.amountMin || g.amountMax ? (formatRange(g.amountMin || null, g.amountMax || null) ?? '') : ''
      fundingType = g.fundingType ?? 'grant'
    }

    // Actions
    let actions: React.ReactNode = null
    if (row.kind === 'pipeline') {
      const stage = row.alert.item.stage
      actions = (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {stage === 'applying' && (
            <span style={{ fontFamily: UI_FONT, fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
              background: '#EEEDFE', color: '#3C3489', whiteSpace: 'nowrap' }}>Applying</span>
          )}
          {stage === 'submitted' && (
            <span style={{ fontFamily: UI_FONT, fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
              background: '#F4F9ED', color: '#639922', whiteSpace: 'nowrap' }}>Submitted</span>
          )}
          <a href="/dashboard/pipeline"
            style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: '#8A8986', borderRadius: 6, textDecoration: 'none', background: 'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F5F1E8'; e.currentTarget.style.color = '#173404' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8A8986' }}>
            <ArrowRight size={14} />
          </a>
        </div>
      )
    } else if (row.kind === 'saved') {
      actions = (
        <button
          onClick={() => handlePipelineMatch(row.grant)}
          style={{ fontFamily: UI_FONT, fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 6,
            border: 'none', background: '#8ECB3C', color: '#173404', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, whiteSpace: 'nowrap' }}>
          <Plus size={10} />Pipeline
        </button>
      )
    } else {
      const gId       = row.grant.id
      const state     = matchState[gId]
      const actioning = matchActioning[gId]
      if (state === 'saved') {
        actions = (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ fontFamily: UI_FONT, fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
              background: '#FAFAF7', color: '#5F5E5A', border: '1px solid rgba(23,52,4,0.14)', whiteSpace: 'nowrap' }}>Saved</span>
            <button onClick={() => handlePipelineMatch(row.grant)}
              style={{ fontFamily: UI_FONT, fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 6,
                border: 'none', background: '#8ECB3C', color: '#173404', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              <Plus size={10} />Pipeline
            </button>
          </div>
        )
      } else if (state === 'pipeline') {
        actions = (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ fontFamily: UI_FONT, fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
              background: '#F4F9ED', color: '#639922', whiteSpace: 'nowrap' }}>Identified</span>
            <a href="/dashboard/pipeline"
              style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: '#8A8986', borderRadius: 6, textDecoration: 'none' }}>
              <ArrowRight size={14} />
            </a>
          </div>
        )
      } else if (actioning === 'done') {
        actions = (
          <span style={{ fontFamily: UI_FONT, fontSize: 11, fontWeight: 500, color: '#3B6D11',
            display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Check size={10} strokeWidth={3} /> Added
          </span>
        )
      } else {
        actions = (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={() => handleSaveMatch(gId)} disabled={!!actioning}
              style={{ fontFamily: UI_FONT, fontSize: 12, fontWeight: 500, color: '#5F5E5A', padding: '6px 10px',
                borderRadius: 6, border: '0.5px solid rgba(23,52,4,0.14)', background: '#fff',
                cursor: actioning ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
              {actioning === 'saving' ? '…' : 'Save'}
            </button>
            <button onClick={() => handlePipelineMatch(row.grant)} disabled={!!actioning}
              style={{ fontFamily: UI_FONT, fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 6,
                border: 'none', cursor: actioning ? 'not-allowed' : 'pointer',
                background: actioning ? '#F5F1E8' : '#8ECB3C',
                color: actioning ? '#8A8986' : '#173404',
                display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              {actioning === 'pipelining' ? '…' : <><Plus size={10} />Pipeline</>}
            </button>
          </div>
        )
      }
    }

    return (
      <div key={rowKey}
        style={{
          display: 'grid', gridTemplateColumns: '72px 1fr auto', gap: 16, alignItems: 'center',
          padding: '14px 22px',
          borderBottom: isLast ? 'none' : '1px solid rgba(23,52,4,0.08)',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#FAFAF7' }}
        onMouseLeave={e => { e.currentTarget.style.background = '' }}>

        {/* Countdown pill */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '6px 4px', borderRadius: 8, flexShrink: 0,
          background: ctBg, color: ctColor, border: ctBorder,
        }}>
          <div style={{ fontFamily: UI_FONT, fontWeight: 600, fontSize: 14, letterSpacing: '-0.01em', lineHeight: 1 }}>
            {dayStr}
          </div>
          <div style={{ fontFamily: UI_FONT, fontWeight: 500, fontSize: 11, opacity: 0.75, marginTop: 3 }}>
            {dlLabel}
          </div>
        </div>

        {/* Body */}
        <button
          type="button"
          onClick={() => {
            if (row.kind === 'pipeline') setPreviewPipelineItem(row.alert.item)
            else setPreviewGrant(row.grant)
          }}
          style={{ minWidth: 0, color: 'inherit', background: 'transparent', border: 'none', padding: 0,
            textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: UI_FONT, fontWeight: 500, fontSize: 14.5, color: '#2C2C2A', letterSpacing: '-0.005em' }}>
              {title}
            </span>
            <TypeChip type={fundingType} />
          </div>
          <div style={{ fontFamily: BODY_FONT, fontSize: 13, color: '#8A8986', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            {funder && <span style={{ color: '#5F5E5A' }}>{funder}</span>}
            {funder && amtStr && <span style={{ opacity: 0.5 }}>·</span>}
            {amtStr && <span style={{ color: '#639922', fontFamily: UI_FONT, fontWeight: 500, fontSize: 12.5 }}>{amtStr}</span>}
          </div>
        </button>

        {/* Actions */}
        {actions}
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'var(--font-dm-sans, Plus Jakarta Sans, sans-serif)' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: UI_FONT, fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em',
            margin: '0 0 4px', color: '#2C2C2A' }}>Deadlines</h1>
          <p style={{ fontFamily: BODY_FONT, fontSize: 14.5, color: '#5F5E5A', margin: 0 }}>
            What's coming up across your pipeline, saved grants, and live matches.
          </p>
        </div>
        <button onClick={() => setAddOpen(true)}
          style={{ fontFamily: UI_FONT, fontSize: 13.5, fontWeight: 500, background: '#8ECB3C', color: '#173404',
            border: 'none', padding: '9px 16px', borderRadius: 8, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
          onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(0.95)' }}
          onMouseLeave={e => { e.currentTarget.style.filter = 'none' }}>
          <Plus size={14} />
          Add deadline
        </button>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 28, alignItems: 'start' }}
        className="deadlines-layout">

        {/* ── Left column: urgency-led stack ── */}
        <div>

          {/* This week */}
          {thisWeek.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid rgba(23,52,4,0.08)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 22px', borderBottom: '1px solid rgba(23,52,4,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: UI_FONT, fontWeight: 600, fontSize: 15, color: '#2C2C2A', letterSpacing: '-0.01em' }}>This week</span>
                  <span style={{ fontFamily: UI_FONT, fontWeight: 500, fontSize: 12, color: '#993C1D', background: '#FAECE7', padding: '3px 9px', borderRadius: 10 }}>{thisWeek.length}</span>
                </div>
                <span style={{ fontFamily: BODY_FONT, fontSize: 12, color: '#8A8986' }}>Due in the next 7 days</span>
              </div>
              {thisWeek.map((row, i) => renderScheduledRow(row, 'week', i === thisWeek.length - 1,
                row.kind === 'pipeline' ? row.alert.item.id : row.grant.id + '-week-' + i))}
            </div>
          )}

          {/* This month */}
          {thisMonth.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid rgba(23,52,4,0.08)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 22px', borderBottom: '1px solid rgba(23,52,4,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: UI_FONT, fontWeight: 600, fontSize: 15, color: '#2C2C2A', letterSpacing: '-0.01em' }}>This month</span>
                  <span style={{ fontFamily: UI_FONT, fontWeight: 500, fontSize: 12, color: '#8A8986', background: '#FAFAF7', padding: '3px 9px', borderRadius: 10 }}>{thisMonth.length}</span>
                </div>
                <span style={{ fontFamily: BODY_FONT, fontSize: 12, color: '#8A8986' }}>{thisMonthMeta}</span>
              </div>
              {thisMonth.map((row, i) => renderScheduledRow(row, 'month', i === thisMonth.length - 1,
                row.kind === 'pipeline' ? row.alert.item.id : row.grant.id + '-month-' + i))}
            </div>
          )}

          {/* Empty state */}
          {displayedScheduled.length === 0 && (
            <div style={{ background: '#fff', border: '1px solid rgba(23,52,4,0.08)', borderRadius: 12, padding: '32px 22px', textAlign: 'center', marginBottom: 16 }}>
              <p style={{ fontFamily: BODY_FONT, color: '#8A8986', fontSize: 14, margin: 0 }}>
                {dayFilter ? `No deadlines on ${dateLabel(dayFilter)}.` : 'No scheduled deadlines yet. Add one to get started.'}
              </p>
            </div>
          )}


          {/* Needs a deadline */}
          {needsDeadlineAll.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid rgba(23,52,4,0.08)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 22px', borderBottom: '1px solid rgba(23,52,4,0.08)', background: '#FAFAF7' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: UI_FONT, fontWeight: 600, fontSize: 15, color: '#2C2C2A', letterSpacing: '-0.01em' }}>Needs a deadline</span>
                  <span style={{ fontFamily: UI_FONT, fontWeight: 500, fontSize: 12, color: '#8A8986', background: '#F0EFEB', padding: '3px 9px', borderRadius: 10 }}>{needsDeadlineAll.length}</span>
                </div>
                <span style={{ fontFamily: BODY_FONT, fontSize: 12, color: '#8A8986' }}>Pick a date to schedule</span>
              </div>
              <div>
                  {needsDeadlineAll.map((row, idx) => {
                    const isLast = idx === needsDeadlineAll.length - 1
                    if (row.kind === 'pipeline') {
                      const item    = row.item
                      const amtStr  = formatRange(item.amount_min, item.amount_max ?? item.amount_requested) ?? ''
                      const val     = deadlineInputs[item.id] ?? ''
                      const saving  = savingDeadline === item.id
                      const success = deadlineSuccesses.has(item.id)
                      return (
                        <div key={item.id} style={{
                          display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center',
                          padding: '12px 22px', borderBottom: isLast ? 'none' : '1px solid rgba(23,52,4,0.06)',
                        }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#FAFAF7' }}
                          onMouseLeave={e => { e.currentTarget.style.background = '' }}>
                          <button type="button" onClick={() => setPreviewPipelineItem(item)}
                            style={{ color: 'inherit', background: 'transparent', border: 'none', padding: 0,
                              textAlign: 'left', cursor: 'pointer', font: 'inherit', minWidth: 0 }}>
                            <div style={{ fontFamily: UI_FONT, fontWeight: 500, fontSize: 14, color: '#2C2C2A', marginBottom: 2 }}>{item.grant_name}</div>
                            <div style={{ fontFamily: BODY_FONT, fontSize: 12.5, color: '#8A8986' }}>
                              {item.funder_name !== item.grant_name && <span>{item.funder_name} &middot; </span>}
                              {amtStr && <span style={{ color: '#639922', fontFamily: UI_FONT, fontWeight: 500 }}>{amtStr}</span>}
                            </div>
                          </button>
                          <DatePickerInput value={val}
                            onChange={v => setDeadlineInputs(prev => ({ ...prev, [item.id]: v }))} />
                          {success ? (
                            <span style={{ fontFamily: UI_FONT, fontSize: 11, fontWeight: 500, color: '#3B6D11', padding: '4px 10px',
                              background: '#F4F9ED', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Check size={11} strokeWidth={3} /> Set
                            </span>
                          ) : (
                            <button onClick={() => handleSetDeadline(item.id, val)} disabled={!val || saving}
                              style={{ fontFamily: UI_FONT, fontSize: 12, fontWeight: 500, padding: '6px 12px', border: 'none', borderRadius: 6,
                                cursor: val && !saving ? 'pointer' : 'not-allowed',
                                background: val ? '#8ECB3C' : '#F0EFEB', color: val ? '#173404' : '#8A8986' }}>
                              {saving ? '…' : 'Set date'}
                            </button>
                          )}
                        </div>
                      )
                    } else {
                      const g      = row.grant
                      const amtStr = g.amountMin || g.amountMax ? (formatRange(g.amountMin || null, g.amountMax || null) ?? '') : ''
                      const val    = savedInputs[g.id] ?? ''
                      const saving = savingSaved === g.id
                      const success = savedSuccesses.has(g.id)
                      return (
                        <div key={g.id} style={{
                          display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center',
                          padding: '12px 22px', borderBottom: isLast ? 'none' : '1px solid rgba(23,52,4,0.06)',
                        }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#FAFAF7' }}
                          onMouseLeave={e => { e.currentTarget.style.background = '' }}>
                          <button type="button" onClick={() => setPreviewGrant(g)}
                            style={{ color: 'inherit', background: 'transparent', border: 'none', padding: 0,
                              textAlign: 'left', cursor: 'pointer', font: 'inherit', minWidth: 0 }}>
                            <div style={{ fontFamily: UI_FONT, fontWeight: 500, fontSize: 14, color: '#2C2C2A', marginBottom: 2 }}>{g.title}</div>
                            <div style={{ fontFamily: BODY_FONT, fontSize: 12.5, color: '#8A8986' }}>
                              {g.funder && g.funder !== g.title && <span>{g.funder} &middot; </span>}
                              {amtStr && <span style={{ color: '#639922', fontFamily: UI_FONT, fontWeight: 500 }}>{amtStr}</span>}
                            </div>
                          </button>
                          <DatePickerInput value={val}
                            onChange={v => setSavedInputs(prev => ({ ...prev, [g.id]: v }))} />
                          {success ? (
                            <span style={{ fontFamily: UI_FONT, fontSize: 11, fontWeight: 500, color: '#3B6D11', padding: '4px 10px',
                              background: '#F4F9ED', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Check size={11} strokeWidth={3} /> Set
                            </span>
                          ) : (
                            <button onClick={() => handleSetSavedDeadline(g, val)} disabled={!val || saving}
                              style={{ fontFamily: UI_FONT, fontSize: 12, fontWeight: 500, padding: '6px 12px', border: 'none', borderRadius: 6,
                                cursor: val && !saving ? 'pointer' : 'not-allowed',
                                background: val ? '#8ECB3C' : '#F0EFEB', color: val ? '#173404' : '#8A8986' }}>
                              {saving ? '…' : 'Set date'}
                            </button>
                          )}
                        </div>
                      )
                    }
                  })}
              </div>
            </div>
          )}

          {/* Later */}
          {laterRows.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid rgba(23,52,4,0.08)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 22px', borderBottom: '1px solid rgba(23,52,4,0.08)', background: '#FAFAF7' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: UI_FONT, fontWeight: 600, fontSize: 15, color: '#2C2C2A', letterSpacing: '-0.01em' }}>Later</span>
                  <span style={{ fontFamily: UI_FONT, fontWeight: 500, fontSize: 12, color: '#8A8986', background: '#F0EFEB', padding: '3px 9px', borderRadius: 10 }}>{laterRows.length}</span>
                </div>
                <span style={{ fontFamily: BODY_FONT, fontSize: 12, color: '#8A8986' }}>Awareness only</span>
              </div>
              {laterRows.map((row, i) => renderScheduledRow(row, 'later', i === laterRows.length - 1,
                row.kind === 'pipeline' ? row.alert.item.id : row.grant.id + '-later-' + i))}
            </div>
          )}

        </div>

        {/* ── Right sidebar ── */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 24 }} className="deadlines-sidebar">

          {/* Calendar */}
          <div style={{ background: '#fff', border: '1px solid rgba(23,52,4,0.08)', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontFamily: UI_FONT, fontWeight: 600, fontSize: 14, color: '#2C2C2A' }}>Calendar</span>
              <span style={{ fontFamily: UI_FONT, fontSize: 11.5, color: '#8A8986', fontWeight: 500 }}>{MONTH_NAMES[calMonth]} {calYear}</span>
            </div>

            {/* Nav */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <button onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) } else setCalMonth(m => m - 1) }}
                style={{ width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', border: 'none', color: '#5F5E5A', cursor: 'pointer', borderRadius: 6 }}
                onMouseEnter={e => { e.currentTarget.style.background = '#FAFAF7' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontFamily: UI_FONT, fontWeight: 600, fontSize: 13.5, color: '#2C2C2A' }}>
                {MONTH_NAMES[calMonth]} {calYear}
              </span>
              <button onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) } else setCalMonth(m => m + 1) }}
                style={{ width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', border: 'none', color: '#5F5E5A', cursor: 'pointer', borderRadius: 6 }}
                onMouseEnter={e => { e.currentTarget.style.background = '#FAFAF7' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
              {['M','T','W','T','F','S','S'].map((d, i) => (
                <div key={i} style={{ textAlign: 'center', fontFamily: UI_FONT, fontWeight: 500, fontSize: 10.5,
                  color: '#8A8986', padding: '4px 0', letterSpacing: '0.02em' }}>{d}</div>
              ))}
              {calDays.map((day, i) => {
                const cellIso  = day.date.toISOString().split('T')[0]
                const markers  = day.isCurrentMonth ? calMarkerMap.get(cellIso) : undefined
                const hasAlerts= !!markers
                const isActive = dayFilter === cellIso
                const hasUrgent= markers?.hasUrgent ?? false
                let bg = 'transparent', textColor = day.isCurrentMonth ? '#2C2C2A' : '#C5C3BC', border = 'none', fw = 400
                if (day.isCurrentMonth) {
                  if      (isActive)   { bg = '#8ECB3C'; textColor = '#173404'; fw = 600 }
                  else if (hasUrgent)  { bg = '#FAECE7'; textColor = '#993C1D'; fw = 600 }
                  else if (hasAlerts)  { bg = '#F4F9ED'; textColor = '#639922'; fw = 600 }
                  else if (day.isToday){ bg = '#FDFCF8'; border = '1.5px solid #8ECB3C'; textColor = '#639922'; fw = 600 }
                }
                return (
                  <div key={i}
                    onClick={() => { if (!day.isCurrentMonth || !hasAlerts) return; setDayFilter(prev => prev === cellIso ? null : cellIso) }}
                    style={{ height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 6, fontSize: 12, userSelect: 'none' as const, fontFamily: UI_FONT,
                      color: textColor, background: bg, border, fontWeight: fw,
                      cursor: hasAlerts && day.isCurrentMonth ? 'pointer' : 'default' }}
                    onMouseEnter={e => { if (day.isCurrentMonth && (hasAlerts || day.isToday)) e.currentTarget.style.opacity = '0.85' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}>
                    {day.date.getDate()}
                  </div>
                )
              })}
            </div>

            {/* Day filter strip */}
            {dayFilter && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(23,52,4,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontFamily: BODY_FONT, fontSize: 12.5, color: '#5F5E5A' }}>
                  Filtered to <strong style={{ color: '#2C2C2A', fontFamily: UI_FONT }}>{dateLabel(dayFilter)}</strong>{' '}
                  &middot; {displayedScheduled.length} deadline{displayedScheduled.length !== 1 ? 's' : ''}
                </span>
                <button onClick={() => setDayFilter(null)}
                  style={{ fontFamily: UI_FONT, fontSize: 11.5, color: '#5F5E5A', background: 'transparent',
                    border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                  Clear
                </button>
              </div>
            )}

            {/* Legend */}
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(23,52,4,0.08)',
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
              {[
                { bg: '#FAECE7', label: 'Urgent (≤7d)' },
                { bg: '#F4F9ED', label: 'Has deadline' },
                { bg: '#8ECB3C', label: 'Selected' },
                { bg: '#FDFCF8', border: '1.5px solid #8ECB3C', label: 'Today' },
              ].map(({ bg: d, label, border: b }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: d,
                    border: b ?? 'none', display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontFamily: BODY_FONT, fontSize: 11.5, color: '#5F5E5A' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Sources filter */}
          <div style={{ background: '#fff', border: '1px solid rgba(23,52,4,0.08)', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ fontFamily: UI_FONT, fontWeight: 600, fontSize: 14, color: '#2C2C2A', marginBottom: 14 }}>
              Show deadlines from
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                { label: 'Pipeline',     checked: showPipeline, count: alerts.length,        toggle: () => setShowPipeline(v => !v)  },
                { label: 'Saved grants', checked: showSaved,    count: savedGrantRows.length + savedNoDeadline.length, toggle: () => setShowSaved(v => !v) },
                { label: 'Live matches', checked: showMatches,  count: matchRows.length,      toggle: () => setShowMatches(v => !v)   },
              ].map(({ label, checked, count, toggle }) => (
                <div key={label} onClick={toggle}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '7px 10px', margin: '0 -10px', borderRadius: 6, cursor: 'pointer', userSelect: 'none' as const }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#FAFAF7' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: checked ? '#173404' : '#fff',
                      border: checked ? 'none' : '1.5px solid rgba(23,52,4,0.14)' }}>
                      {checked && <Check size={10} strokeWidth={3} style={{ color: '#fff' }} />}
                    </div>
                    <span style={{ fontFamily: UI_FONT, fontSize: 13, color: '#2C2C2A' }}>{label}</span>
                  </div>
                  <span style={{ fontFamily: UI_FONT, fontSize: 11.5, color: '#8A8986' }}>{count}</span>
                </div>
              ))}
            </div>
          </div>

        </aside>

      </div>

      {/* Responsive */}
      <style dangerouslySetInnerHTML={{ __html: '@media (max-width: 1024px) { .deadlines-layout { grid-template-columns: minmax(0,1fr) \!important; } .deadlines-sidebar { position: static \!important; } }' }} />

      {/* Edit deadline modal */}
      {editItem && (
        <EditDeadlineModal item={editItem} onClose={() => setEditItem(null)}
          onSaved={() => { setEditItem(null); loadData(); showToast('Deadline updated!') }} />
      )}

      {/* Day alerts sheet */}
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

      {/* Pipeline-row preview modal (reuses Pipeline page's edit modal) */}
      {previewPipelineItem && (
        <PipelineModal
          item={previewPipelineItem}
          onClose={() => setPreviewPipelineItem(null)}
          onSave={async (id, updates) => {
            await updatePipelineItem(id, updates)
            await loadData()
            showToast('Saved')
          }}
          onDelete={async (id) => {
            await deletePipelineItem(id)
            setPreviewPipelineItem(null)
            await loadData()
            showToast('Deleted')
          }}
          onMove={(id, stage) => { handleStageChange(id, stage) }}
        />
      )}

      {/* Saved/match-row preview modal */}
      {previewGrant && (() => {
        const g = previewGrant
        const inPipeline = matchState[g.id] === 'pipeline'
        return (
          <GrantPreviewModal
            grant={g}
            inPipeline={inPipeline}
            saving={previewSaving}
            onClose={() => setPreviewGrant(null)}
            onAddToPipeline={async () => {
              setPreviewSaving(true)
              try {
                await handlePipelineMatch(g)
                setPreviewGrant(null)
                showToast('Added to pipeline')
              } finally { setPreviewSaving(false) }
            }}
            onSetDeadline={async (dl) => {
              setPreviewSaving(true)
              try {
                await handleSetSavedDeadline(g, dl)
                setPreviewGrant(null)
                showToast('Deadline set & saved to pipeline')
              } finally { setPreviewSaving(false) }
            }}
          />
        )
      })()}

      {toast && (
        <div className="fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-lg text-sm z-50"
          style={{ background: '#173404', color: '#F1F7E4' }}>
          ✓ {toast}
        </div>
      )}
    </div>
  )
}

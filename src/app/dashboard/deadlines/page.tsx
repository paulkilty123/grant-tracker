'use client'

import { useState, useEffect, useRef } from 'react'
import { CalendarClock, CalendarCheck, ExternalLink, ArrowRight, Calendar, CalendarDays, AlarmClock, ChevronDown, ChevronUp, Send, ChevronLeft, ChevronRight, Info, Plus, X as XIcon, Check, Landmark, Rocket, TrendingUp, Gift, Pencil, CheckCircle2, Users, MapPin, Star, DollarSign, Lightbulb, AlertTriangle, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getDeadlineAlerts, formatDeadline, formatRange, formatCurrency, PIPELINE_STAGES } from '@/lib/utils'
import { updatePipelineStage, updatePipelineItem, createPipelineItem, deletePipelineItem } from '@/lib/pipeline'
import { PipelineModal } from '@/components/PipelineModal'
import { recordInteraction } from '@/lib/interactions'
import { emitClientEvent } from '@/lib/events/client'
import { toCatalogueUuid } from '@/lib/events/taxonomy'
import { track } from '@/lib/analytics'
import { normaliseScrapedGrant, type EnrichedGrant } from '@/lib/grants-normalise'
import { computeMatchScore, MATCH_FLOOR } from '@/lib/matching'
import { eligibilityStated, ELIGIBILITY_NOT_STATED } from '@/lib/eligibility-disclosure'
import type { DeadlineAlert, PipelineItem, PipelineStage, FundingType, Organisation } from '@/types'
import { typeColour } from '@/lib/funding-type-colours'

const ACTIVE_STAGES = ['identified', 'applying'] // 'submitted' excluded — those need a decision date, not a deadline

/**
 * Funding type on a pipeline item: we do not know it.
 *
 * This used to return 'grant' unconditionally, described as a placeholder
 * until the view is enriched. In practice it was not a placeholder — it told
 * the user that a programme or an investment sitting in their pipeline was a
 * grant, in a chip that looked authoritative. A missing chip is honest, a
 * wrong one is not, so the callers now render nothing when this returns null.
 */
function itemFundingType(_item: PipelineItem): string | null { return null }

/**
 * The homepage accents, used as SOLID countdown tiles.
 *
 * Solid rather than the obvious pale tints, because every pale tint worth
 * using is already spoken for by a funding-type chip sitting on the same row:
 * amber would be ΔE 0.0 from In-kind, green ΔE 0.0 from Grant, pink 2.4 from
 * Programme. The saturated accents sit ΔE 29-62 from every type chip, so the
 * two systems can never be read as each other — pale tint means what kind of
 * money, solid tile means how long you have.
 *
 * The numeral is --deep at 19px BOLD, and the size is load-bearing. At 15px it
 * is normal text needing 4.5:1, which terracotta's 3.70 fails. At 19px bold it
 * is WCAG large text, the floor drops to 3:1, and --deep clears all four. Same
 * constraint as the How it works circles on Projects.
 *
 * The DATE sits below the tile, not inside it: at 11px it is normal text in
 * every case and would fail on terracotta and teal. On white it is 6.49.
 *
 * Tile edges are low-contrast against a white card (gold 1.54, sage 1.85).
 * That is fine for a filled container whose content carries the contrast, but
 * nothing may depend on the edge — no borders, no two tiles touching.
 */
const COUNTDOWN_TILE = {
  urgent: '#D67558',   // <= 7 days
  soon:   '#EBCE78',   // 8-42 days
  later:  '#9BCA9D',   // beyond
  none:   '#4EAAB4',   // no deadline set — the one state that is not a countdown
} as const

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
// Was a local copy of the old rounding, so it showed £2,500 as "£3k" too.
// One implementation now — see the note on formatCurrency.
const fmtAmt = (n: number) => formatCurrency(n)

// ── Add Deadline Modal ────────────────────────────────────────────────────────

const TYPE_CHIPS: {
  key: string
  label: string
  dot: string
  bg: string
  text: string
  Icon: LucideIcon
}[] = [
  { key: 'grant',      label: 'Grant',      dot: '#97C459', bg: '#E3F0E4', text: '#1B6B3D', Icon: Landmark   },
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
      track('pipeline_added')
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
              onFocus={e => { e.currentTarget.style.borderColor = '#1D3C3E' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.14)' }} />
          </div>

          {/* Funder */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#2C2C2A', marginBottom: 6 }}>
              Funder <span style={{ color: '#74736E', fontWeight: 400 }}>&middot; optional</span>
            </label>
            <input type="text" value={funderName} onChange={e => setFunderName(e.target.value)}
              placeholder="e.g. Arts Council England"
              style={{ width: '100%', height: 40, border: '0.5px solid rgba(0,0,0,0.14)', borderRadius: 10,
                padding: '0 12px', fontFamily: 'inherit', fontSize: 13, color: '#2C2C2A',
                background: '#fff', outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#1D3C3E' }}
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
                onFocus={e => { e.currentTarget.style.borderColor = '#1D3C3E' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.14)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#2C2C2A', marginBottom: 6 }}>
                Amount <span style={{ color: '#74736E', fontWeight: 400 }}>&middot; optional</span>
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                  color: '#74736E', fontSize: 13, pointerEvents: 'none' }}>£</span>
                <input type="text" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="0"
                  style={{ width: '100%', height: 40, border: '0.5px solid rgba(0,0,0,0.14)', borderRadius: 10,
                    padding: '0 12px 0 24px', fontFamily: 'inherit', fontSize: 13, color: '#2C2C2A',
                    background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#1D3C3E' }}
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
              Notes <span style={{ color: '#74736E', fontWeight: 400 }}>&middot; optional</span>
            </label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Link to guidelines, application notes, or anything else you want to remember."
              rows={2}
              style={{ width: '100%', minHeight: 60, border: '0.5px solid rgba(0,0,0,0.14)', borderRadius: 10,
                padding: '10px 12px', fontFamily: 'inherit', fontSize: 13, color: '#2C2C2A',
                background: '#fff', outline: 'none', resize: 'vertical', lineHeight: 1.5,
                boxSizing: 'border-box' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#1D3C3E' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.14)' }} />
          </div>

          {/* Also add to pipeline */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
            background: '#F5F1E8', borderRadius: 10, padding: '10px 12px', marginBottom: 20 }}
            onClick={() => setAddToPipeline(v => !v)}>
            <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: addToPipeline ? '#1D3C3E' : '#fff',
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
          flexShrink: 0, gap: 12 }}>
          <span style={{ fontSize: 11, color: '#74736E' }}>
            Manual deadlines show on the calendar with a pencil icon.
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose}
              style={{ fontSize: 12, fontWeight: 500, color: '#5F5E5A', padding: '8px 14px',
                borderRadius: 999, cursor: 'pointer', background: 'transparent', border: 'none', fontFamily: 'inherit' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={!grantName.trim() || !deadline || saving}
              style={{ fontSize: 12, fontWeight: 500, background: '#1D3C3E', color: '#F6F1E7',
                padding: '9px 18px', borderRadius: 999, cursor: 'pointer', border: 'none', fontFamily: 'inherit',
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
            onFocus={e => { e.currentTarget.style.borderColor = '#1D3C3E' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.14)' }} />
        </div>
        {/* Footer */}
        <div style={{ padding: '12px 22px 18px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose}
            style={{ fontSize: 12, fontWeight: 500, color: '#5F5E5A', padding: '8px 14px',
              borderRadius: 999, cursor: 'pointer', background: 'transparent', border: 'none', fontFamily: 'inherit' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={!deadline || saving}
            style={{ fontSize: 12.5, fontWeight: 600, background: deadline ? '#1D3C3E' : '#F1EDE3',
              color: deadline ? '#F6F1E7' : '#74736E',
              padding: '9px 18px', borderRadius: 999, cursor: deadline ? 'pointer' : 'not-allowed',
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
                <TypeChip type={type} />
                <Pencil size={13} style={{ color: '#74736E', flexShrink: 0 }} />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}



// ── Inline date picker ──────────────────────────────────────────────────────
function DatePickerInput({ value, onChange, popoverSide = 'right' }: { value: string; onChange: (v: string) => void; popoverSide?: 'left' | 'right' }) {
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
        style={{ width: 120, height: 26, border: `0.5px solid ${open ? '#1D3C3E' : 'rgba(0,0,0,0.14)'}`,
          borderRadius: 10, padding: '0 8px', fontSize: 11, fontFamily: 'inherit',
          color: value ? '#2C2C2A' : '#74736E', background: '#fff', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6, textAlign: 'left', boxSizing: 'border-box' }}>
        <Calendar size={10} strokeWidth={2} style={{ color: '#74736E', flexShrink: 0 }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayStr}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', ...(popoverSide === 'left' ? { left: 0 } : { right: 0 }), zIndex: 300,
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
              <div key={i} style={{ textAlign: 'center', color: '#74736E', fontSize: 9,
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
                    background: isSel ? '#1D3C3E' : isToday ? '#F1EDE3' : 'transparent',
                    color: isSel ? '#F6F1E7' : !day.isCurrentMonth ? '#D9D6CB' : isToday ? '#1D3C3E' : '#2C2C2A',
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

/**
 * Every stage chip on this page is ONE neutral, and the label carries the
 * meaning. It replaces a fifth pipeline-stage palette, which was non-monotonic
 * in the same way the Pipeline board's ladder used to be.
 *
 * Only three stages ever reach this page and they are secondary information.
 * Giving them a colour ramp would add a fifth stage palette to the app and
 * collide with the type chips two inches to the left. Same decision already
 * taken on Applications, where "Identified" stays neutral because it describes
 * the pipeline rather than the thing in front of you.
 */
function StageChip({ stage }: { stage: string }) {
  const s = PIPELINE_STAGES.find(p => p.id === stage)
  return (
    <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em',
      textTransform: 'uppercase', padding: '3px 9px', borderRadius: 999,
      whiteSpace: 'nowrap', background: '#F1EDE3', color: '#1D3C3E', flexShrink: 0 }}>
      {s?.label ?? stage}
    </span>
  )
}

/** The validated four-hue set, shared with every other surface. */
function TypeChip({ type }: { type: string | null }) {
  const c = typeColour(type)
  if (!c) return null
  return (
    <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em',
      textTransform: 'uppercase', padding: '3px 9px', borderRadius: 999,
      whiteSpace: 'nowrap', background: c.tint, color: c.fg, flexShrink: 0 }}>
      {c.label}
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
    green: { bg: '#E3F0E4', stroke: '#1B6B3D' },
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
                  background: '#E3F0E4', color: '#1B6B3D' }}>Eligible</span>
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
              padding: '16px 24px', gap: 16, borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
              {amtStr && (
                <div>
                  <p style={{ fontFamily: UI_FONT, fontSize: 10, fontWeight: 500, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: '#74736E', margin: '0 0 4px' }}>Grant amount</p>
                  <p style={{ fontFamily: UI_FONT, fontSize: 18, fontWeight: 600, color: '#1B6B3D', margin: 0 }}>{amtStr}</p>
                </div>
              )}
              {dlLabel && (
                <div>
                  <p style={{ fontFamily: UI_FONT, fontSize: 10, fontWeight: 500, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: '#74736E', margin: '0 0 4px' }}>Deadline</p>
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
                textTransform: 'uppercase', color: '#74736E', margin: '0 0 8px' }}>About this grant</p>
              <p style={{ fontFamily: BODY_FONT, fontSize: 13.5, lineHeight: 1.55, color: '#2C2C2A', margin: 0 }}>
                {grant.description}
              </p>
            </div>
          )}

          {/* Impact sectors */}
          {grant.impactSectors && grant.impactSectors.length > 0 && (
            <div style={{ padding: '16px 24px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
              <p style={{ fontFamily: UI_FONT, fontSize: 10, fontWeight: 500, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: '#74736E', margin: '0 0 10px' }}>Impact sectors</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {grant.impactSectors.map(s => (
                  <span key={s} style={{ fontFamily: BODY_FONT, fontSize: 12, padding: '4px 10px', borderRadius: 999,
                    background: '#E3F0E4', color: '#1B6B3D', fontWeight: 500 }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Add a deadline — only when no fixed funder deadline, or grant is rolling */}
          {(!grant.deadline || grant.isRolling) && (
            <div style={{ padding: '16px 24px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
              <p style={{ fontFamily: UI_FONT, fontSize: 10, fontWeight: 500, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: '#74736E', margin: '0 0 8px' }}>Add a deadline</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <DatePickerInput value={deadlineValue} onChange={setDeadlineValue} popoverSide="left" />
                <button onClick={handleSetDeadlineClick} disabled={!deadlineValue || saving}
                  style={{ fontFamily: UI_FONT, fontSize: 12, fontWeight: 600, padding: '8px 16px', border: 'none', borderRadius: 999,
                    cursor: deadlineValue && !saving ? 'pointer' : 'not-allowed',
                    background: deadlineValue ? '#1D3C3E' : '#F1EDE3', color: deadlineValue ? '#F6F1E7' : '#74736E' }}>
                  {saving ? '…' : inPipeline ? 'Set deadline' : 'Set date & save to pipeline'}
                </button>
              </div>
              <p style={{ fontFamily: BODY_FONT, fontSize: 11.5, color: '#74736E', margin: '8px 0 0' }}>
                {grant.isRolling
                  ? 'This funder accepts rolling applications. Set your own target submission date.'
                  : inPipeline
                    ? 'Pick the date you want to submit by.'
                    : 'Setting a deadline saves this opportunity to your pipeline.'}
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
                    background: insightsHover ? '#E3F0E4' : '#fff',
                    borderLeft: '3px solid #1D3C3E',
                    borderRight: 'none', borderTop: 'none', borderBottom: 'none',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'background-color 160ms ease',
                    fontFamily: BODY_FONT,
                  }}
                >
                  <Info size={16} strokeWidth={2} style={{ color: insightsHover ? '#1D3C3E' : '#1D3C3E', flexShrink: 0, transition: 'color 160ms ease' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#2C2C2A' }}>{stripTitle}</div>
                    <div style={{ fontSize: 11, marginTop: 1, color: '#5F5E5A' }}>{stripSub}</div>
                  </div>
                  <ChevronDown size={14} strokeWidth={2.5} style={{ color: '#5F5E5A', flexShrink: 0 }} />
                </button>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center',
                    padding: '12px 22px', background: '#E3F0E4', borderBottom: '0.5px dashed rgba(57,109,17,0.2)' }}>
                    <button onClick={() => setInsightsExpanded(false)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: BODY_FONT,
                        fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase',
                        color: '#1B6B3D', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
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
                            textTransform: 'uppercase', color: '#74736E', margin: '0 0 10px' }}>Eligibility criteria</p>
                          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {grant.eligibilityCriteria.map((c, i) => (
                              <li key={i} style={{ display: 'flex', gap: 10, fontFamily: BODY_FONT, fontSize: 13, color: '#5F5E5A' }}>
                                <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 2, color: '#1D3C3E' }} />
                                <span style={{ lineHeight: 1.45 }}>{c}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div>
                        <p style={{ fontFamily: BODY_FONT, fontSize: 10, fontWeight: 500, letterSpacing: '0.08em',
                          textTransform: 'uppercase', color: '#74736E', margin: '0 0 8px' }}>Eligible organisations</p>
                        {eligibilityStated(grant.eligibleStructures) ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {grant.eligibleStructures!.map(s => (
                              <span key={s} style={{ fontFamily: BODY_FONT, fontSize: 11, fontWeight: 500, padding: '4px 10px',
                                borderRadius: 9999, background: 'rgba(142,203,60,0.12)', color: '#1D3C3E' }}>
                                {STRUCTURE_LABELS[s] ?? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p style={{ fontFamily: BODY_FONT, fontSize: 12, color: '#5F5E5A', margin: 0 }}>{ELIGIBILITY_NOT_STATED}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

        </div>

        {/* Footer actions */}
        <div style={{ padding: '14px 22px', borderTop: '0.5px solid rgba(0,0,0,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {grant.applyUrl && (
              <a href={grant.applyUrl} target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: UI_FONT, fontSize: 12.5, fontWeight: 500,
                  background: '#1D3C3E', color: '#F6F1E7', padding: '9px 16px', borderRadius: 999,
                  textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                Apply now <ExternalLink size={11} />
              </a>
            )}
            {!inPipeline && (
              <button onClick={onAddToPipeline} disabled={saving}
                style={{ fontFamily: UI_FONT, fontSize: 12.5, fontWeight: 500,
                  background: saving ? '#F1EDE3' : '#1D3C3E',
                  color: saving ? '#74736E' : '#F6F1E7',
                  padding: '9px 16px', borderRadius: 999, border: 'none',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Plus size={11} /> Add to Pipeline
              </button>
            )}
            {inPipeline && (
              <span style={{ fontFamily: UI_FONT, fontSize: 11.5, fontWeight: 500,
                color: '#1B6B3D', background: '#E3F0E4', padding: '6px 10px', borderRadius: 8,
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
  const [previewPipelineItem,        setPreviewPipelineItem]        = useState<PipelineItem | null>(null)  // → full PipelineModal (Scheduled rows)
  const [previewPipelineForDeadline, setPreviewPipelineForDeadline] = useState<{ item: PipelineItem; enriched: EnrichedGrant | null } | null>(null)  // → GrantPreviewModal (Needs-a-deadline rows)
  const [previewGrant,               setPreviewGrant]               = useState<EnrichedGrant | null>(null)
  const [previewSaving,              setPreviewSaving]              = useState(false)

  // Open the rich modal for a Needs-a-deadline pipeline row, kicking off an
  // async catalogue lookup so the description / sectors / funder brief panels
  // can populate. The modal opens immediately with sparse data; enriched
  // fields fade in when the lookup resolves.
  async function openPipelineForDeadline(item: PipelineItem) {
    setPreviewPipelineForDeadline({ item, enriched: null })
    if (!item.grant_url) return
    try {
      const supabase = createClient()
      const candidates = [item.grant_url, item.grant_url.replace(/\/$/, ''), item.grant_url + '/']
      const { data } = await supabase
        .from('grants_with_funder')
        .select('*')
        .in('apply_url', candidates)
        .limit(1)
      if (data && data[0]) {
        const enriched = normaliseScrapedGrant(data[0] as Record<string, unknown>)
        setPreviewPipelineForDeadline(prev => prev && prev.item.id === item.id ? { item: prev.item, enriched } : prev)
      }
    } catch {
      // Lookup is best-effort — sparse modal is fine fallback.
    }
  }

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

      // Load saved + dismissed interactions once. Dismissed grants are excluded from
      // matches & saved rows so a "Not for us" reject sticks across reloads.
      const { data: interactionRows } = await supabase
        .from('grant_interactions')
        .select('grant_id, action, reminder_at')
        .eq('org_id', org.id)
        .in('action', ['saved', 'dismissed'])
      // A dismissed grant is hidden only while it has no resurface date (permanent)
      // or that date is still in the future (snoozed). Past that, it resurfaces.
      const dismissedIds = new Set(
        (interactionRows ?? [])
          .filter((r: { action: string; reminder_at: string | null }) => r.action === 'dismissed' && (!r.reminder_at || r.reminder_at > today))
          .map((r: { grant_id: string }) => r.grant_id)
      )

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
          .filter(x => x.score >= MATCH_FLOOR && x.deadline && !dismissedIds.has(x.grant.id))
          .sort((a, b) => (a.deadline < b.deadline ? -1 : 1))
          .slice(0, 20)
        setMatchRows(scored.map(({ grant, score }) => ({ grant, score })))
      } else {
        setMatchRows([])
      }

      // Saved grants with upcoming deadlines (reuse interactions fetched above; drop dismissed)
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const savedIds = Array.from(new Set(
        (interactionRows ?? [])
          .filter((r: { action: string }) => r.action === 'saved')
          .map((r: { grant_id: string }) => r.grant_id)
          .filter((id: string) => UUID_RE.test(id) && !dismissedIds.has(id))
      ))
      if (savedIds.length > 0) {
        const { data: savedRows } = await supabase
          .from('grants_with_funder')
          .select('*')
          .in('id', savedIds)
          .order('deadline', { ascending: true })
        const allSaved = (savedRows ?? []).map(row => normaliseScrapedGrant(row as Record<string, unknown>))
        setSavedGrantRows(allSaved.filter(g => g.deadline && g.deadline >= today && !dismissedIds.has(g.id)))
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
    const beforeStage = alerts.find(a => a.item.id === id)?.item.stage
    setAlerts(prev => prev.map(a => a.item.id === id ? { ...a, item: { ...a.item, stage } } : a))
    await updatePipelineStage(id, stage)
    if (beforeStage && beforeStage !== stage) {
      emitClientEvent(orgId, 'pipeline_stage_changed', {
        opportunity_id: null, pipeline_item_id: id, from_stage: beforeStage, to_stage: stage,
      })
    }
    showToast(`Moved to ${PIPELINE_STAGES.find(s => s.id === stage)?.label}`)
  }

  async function handleSetSavedDeadline(grant: EnrichedGrant, deadline: string) {
    if (!deadline) return
    setSavingSaved(grant.id)
    const added = await createPipelineItem({
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
    track('pipeline_added')
    emitClientEvent(orgId, 'pipeline_added', {
      opportunity_id: toCatalogueUuid(grant.id, grant.uuid),
      pipeline_item_id: added.id,
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
    const matched = matchRows.find(m => m.grant.id === grantId)?.grant
    const uuid = toCatalogueUuid(grantId, matched?.uuid)
    if (uuid) emitClientEvent(orgId, 'opportunity_saved', { opportunity_id: uuid })
    track('grant_saved')
    setMatchActioning(prev => ({ ...prev, [grantId]: 'done' }))
    setTimeout(() => {
      setMatchState(prev => ({ ...prev, [grantId]: 'saved' }))
      setMatchActioning(prev => { const n = { ...prev }; delete n[grantId]; return n })
    }, 900)
  }

  async function handlePipelineMatch(grant: EnrichedGrant) {
    const id = grant.id
    setMatchActioning(prev => ({ ...prev, [id]: 'pipelining' }))
    const added = await createPipelineItem({
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
    track('pipeline_added')
    emitClientEvent(orgId, 'pipeline_added', {
      opportunity_id: toCatalogueUuid(grant.id, grant.uuid),
      pipeline_item_id: added.id,
    })
    setMatchActioning(prev => ({ ...prev, [id]: 'done' }))
    setTimeout(() => {
      setMatchState(prev => ({ ...prev, [id]: 'pipeline' }))
      setMatchActioning(prev => { const n = { ...prev }; delete n[id]; return n })
    }, 900)
  }

  // "Not for us" — reject a match/saved grant from the deadlines list (Devi 2026-06-24).
  // Mirrors Find Funding's dismiss: records 'dismissed' so it stays hidden on reload.
  async function handleDismissMatch(grant: EnrichedGrant) {
    const id = grant.id
    setMatchRows(prev => prev.filter(m => m.grant.id !== id))
    setSavedGrantRows(prev => prev.filter(g => g.id !== id))
    await recordInteraction(orgId, id, 'dismissed')
    track('grant_dismissed')
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
  function addMarker(date: string | null | undefined, type: string | null, urgent: boolean) {
    if (!date) return
    const m = calMarkerMap.get(date) ?? { types: [], hasUrgent: false }
    if (type && !m.types.includes(type)) m.types.push(type)
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
    return <span style={{ color: '#74736E', margin: '0 2px' }}>&middot;</span>
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
  const thisWeek     = displayedScheduled.filter(r => rowDays(r) <= 7)
  // Actionable window is the next 6 weeks (Devi 2026-06-24: "too soon is too late;
  // the most interesting deadlines are 2–8 weeks out"). Previously capped at 31 days.
  const nextSixWeeks = displayedScheduled.filter(r => rowDays(r) > 7 && rowDays(r) <= 42)
  const laterRows    = displayedScheduled.filter(r => rowDays(r) > 42)

  // "Needs a deadline" drawer contents
  const needsDeadlineAll = [
    ...noDeadlineItems.map(i => ({ kind: 'pipeline' as const, item: i })),
    ...(showSaved ? savedNoDeadline.map(g => ({ kind: 'saved' as const, grant: g })) : []),
  ]

  // "Next 6 weeks" meta: show the date 42 days out
  const date42 = new Date(Date.now() + 42 * 86400000)
  const windowMeta = `Due by ${date42.getDate()} ${MONTH_NAMES[date42.getMonth()]}`

  const UI_FONT   = 'var(--font-space-grotesk)'
  const BODY_FONT = 'var(--font-dm-sans)'

  // Row renderer — new anatomy: 72px countdown pill | body | actions
  function renderScheduledRow(row: ScheduledRow, bucket: 'week' | 'month' | 'later', isLast: boolean, rowKey: string) {
    const days      = rowDays(row)
    const isOverdue = days < 0
    const dayStr    = isOverdue ? 'Overdue' : `${days}d`

    const dl       = row.kind === 'pipeline' ? row.alert.item.deadline : row.grant.deadline
    const dlLabel  = dateLabel(dl ?? null)

    // Countdown tile — see COUNTDOWN_TILE for why these are solid accents
    // rather than the pale tints this used to use. The old month tint pair
    // (#E3F0E4 / #1D3C3E) measured 3.21 and failed outright.
    const ctBg = bucket === 'week' ? COUNTDOWN_TILE.urgent
               : bucket === 'month' ? COUNTDOWN_TILE.soon
               : COUNTDOWN_TILE.later

    // Body data
    let title = '', funder = '', amtStr = ''
    // Null on a pipeline row: we do not know its type, so no chip is rendered.
    let fundingType: string | null = null
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
    /**
     * ONE SHAPE FOR EVERY ROW: a state chip, then a single action.
     *
     * Three action vocabularies used to run down this list depending on which
     * QUERY the row arrived through rather than on what you would do about it
     * — a live match got three buttons, a saved grant got two, and a pipeline
     * item at "identified" got a bare arrow and nothing else, which is why one
     * row looked broken beside its sibling. Worse, a match that was already in
     * the pipeline did get a stage chip, so the same state rendered two ways.
     */
    const ghostBtn: React.CSSProperties = {
      fontFamily: UI_FONT, fontSize: 12, fontWeight: 600, color: '#74736E',
      padding: '7px 10px', borderRadius: 999, border: 'none',
      background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap',
    }
    const outlineBtn: React.CSSProperties = {
      fontFamily: UI_FONT, fontSize: 12, fontWeight: 600, color: '#1D3C3E',
      padding: '7px 14px', borderRadius: 999, border: '1.5px solid rgba(29,60,62,0.24)',
      background: '#fff', cursor: 'pointer', whiteSpace: 'nowrap',
    }
    const fillBtn: React.CSSProperties = {
      fontFamily: UI_FONT, fontSize: 12, fontWeight: 600, color: '#F6F1E7',
      padding: '7px 14px', borderRadius: 999, border: 'none', background: '#1D3C3E',
      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
    }
    const arrowLink = (
      <a href="/dashboard/pipeline"
        style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: '#74736E', borderRadius: 999, textDecoration: 'none', background: 'transparent' }}
        onMouseEnter={e => { e.currentTarget.style.background = '#F1EDE3'; e.currentTarget.style.color = '#1D3C3E' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#74736E' }}>
        <ArrowRight size={14} />
      </a>
    )
    const savedChip = (
      <span style={{ fontFamily: UI_FONT, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em',
        textTransform: 'uppercase', padding: '3px 9px', borderRadius: 999,
        background: '#F1EDE3', color: '#1D3C3E', whiteSpace: 'nowrap' }}>Saved</span>
    )

    let actions: React.ReactNode = null
    if (row.kind === 'pipeline') {
      // In pipeline: stage chip, then the way through to it.
      actions = (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <StageChip stage={row.alert.item.stage} />
          {arrowLink}
        </div>
      )
    } else if (row.kind === 'saved') {
      // Saved: the chip says so, so "Not for us" comes off — the user has
      // already made a judgement about this one.
      actions = (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {savedChip}
          <button onClick={() => handlePipelineMatch(row.grant)} style={fillBtn}>
            <Plus size={11} />Pipeline
          </button>
        </div>
      )
    } else {
      const gId       = row.grant.id
      const state     = matchState[gId]
      const actioning = matchActioning[gId]
      if (state === 'saved') {
        actions = (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {savedChip}
            <button onClick={() => handlePipelineMatch(row.grant)} style={fillBtn}>
              <Plus size={11} />Pipeline
            </button>
          </div>
        )
      } else if (state === 'pipeline') {
        // Same state as a row.kind === 'pipeline' row, so the same rendering.
        actions = (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <StageChip stage="identified" />
            {arrowLink}
          </div>
        )
      } else if (actioning === 'done') {
        actions = (
          <span style={{ fontFamily: UI_FONT, fontSize: 11.5, fontWeight: 600, color: '#1B6B3D',
            display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Check size={11} strokeWidth={3} /> Added
          </span>
        )
      } else {
        actions = (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button onClick={() => handleDismissMatch(row.grant)} disabled={!!actioning}
              style={{ ...ghostBtn, cursor: actioning ? 'not-allowed' : 'pointer' }}
              title="Not for us — hide this grant">
              Not for us
            </button>
            <button onClick={() => handleSaveMatch(gId)} disabled={!!actioning}
              style={{ ...outlineBtn, cursor: actioning ? 'not-allowed' : 'pointer' }}>
              {actioning === 'saving' ? '…' : 'Save'}
            </button>
            <button onClick={() => handlePipelineMatch(row.grant)} disabled={!!actioning}
              style={{ ...fillBtn, cursor: actioning ? 'not-allowed' : 'pointer', opacity: actioning ? 0.5 : 1 }}>
              {actioning === 'pipelining' ? '…' : <><Plus size={11} />Pipeline</>}
            </button>
          </div>
        )
      }
    }

    return (
      <div key={rowKey}
        style={{
          display: 'grid', gridTemplateColumns: '74px 1fr auto', gap: 16, alignItems: 'center',
          padding: '14px 22px',
          borderBottom: isLast ? 'none' : '1px solid rgba(23,52,4,0.08)',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#FAF9F5' }}
        onMouseLeave={e => { e.currentTarget.style.background = '' }}>

        {/* Countdown tile, with the date BELOW it rather than inside. No
            border: nothing may depend on the tile's edge, which is 1.54 on
            gold and 1.85 on sage. The numeral inside carries the contrast. */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 56, height: 46, borderRadius: 12, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: ctBg,
          }}>
            <span style={{ fontFamily: UI_FONT, fontWeight: 700, fontSize: 19, letterSpacing: '-0.01em', color: '#1D3C3E' }}>
              {dayStr}
            </span>
          </div>
          <span style={{ fontFamily: UI_FONT, fontWeight: 500, fontSize: 11, color: '#5F5E5A', whiteSpace: 'nowrap' }}>
            {dlLabel}
          </span>
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
          <div style={{ fontFamily: BODY_FONT, fontSize: 13, color: '#74736E', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            {funder && <span style={{ color: '#5F5E5A' }}>{funder}</span>}
            {funder && amtStr && <span style={{ opacity: 0.5 }}>·</span>}
            {amtStr && <span style={{ color: '#1D3C3E', fontFamily: UI_FONT, fontWeight: 500, fontSize: 12.5 }}>{amtStr}</span>}
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
          <h1 style={{ fontFamily: UI_FONT, fontSize: 31, fontWeight: 600, letterSpacing: '-0.025em',
            margin: '0 0 5px', color: '#1D3C3E' }}>Deadlines</h1>
          <p style={{ fontFamily: BODY_FONT, fontSize: 13.5, color: '#5F5E5A', margin: 0 }}>
            What's coming up across your pipeline, saved grants, and live matches.
          </p>
        </div>
        <button onClick={() => setAddOpen(true)}
          style={{ fontFamily: UI_FONT, fontSize: 13.5, fontWeight: 600, background: '#1D3C3E', color: '#F6F1E7',
            border: 'none', padding: '11px 20px', borderRadius: 999, cursor: 'pointer',
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
                <span style={{ fontFamily: BODY_FONT, fontSize: 12, color: '#74736E' }}>Due in the next 7 days</span>
              </div>
              {thisWeek.map((row, i) => renderScheduledRow(row, 'week', i === thisWeek.length - 1,
                row.kind === 'pipeline' ? row.alert.item.id : row.grant.id + '-week-' + i))}
            </div>
          )}

          {/* Next 6 weeks */}
          {nextSixWeeks.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid rgba(23,52,4,0.08)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 22px', borderBottom: '1px solid rgba(23,52,4,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: UI_FONT, fontWeight: 600, fontSize: 15, color: '#2C2C2A', letterSpacing: '-0.01em' }}>Next 6 weeks</span>
                  <span style={{ fontFamily: UI_FONT, fontWeight: 500, fontSize: 12, color: '#74736E', padding: '3px 9px', borderRadius: 10 }}>{nextSixWeeks.length}</span>
                </div>
                <span style={{ fontFamily: BODY_FONT, fontSize: 12, color: '#74736E' }}>{windowMeta}</span>
              </div>
              {nextSixWeeks.map((row, i) => renderScheduledRow(row, 'month', i === nextSixWeeks.length - 1,
                row.kind === 'pipeline' ? row.alert.item.id : row.grant.id + '-month-' + i))}
            </div>
          )}

          {/* Empty state */}
          {displayedScheduled.length === 0 && (
            <div style={{ background: '#fff', border: '1px solid rgba(23,52,4,0.08)', borderRadius: 12, padding: '32px 22px', textAlign: 'center', marginBottom: 16 }}>
              <p style={{ fontFamily: BODY_FONT, color: '#74736E', fontSize: 14, margin: 0 }}>
                {dayFilter ? `No deadlines on ${dateLabel(dayFilter)}.` : 'No scheduled deadlines yet. Add one to get started.'}
              </p>
            </div>
          )}


          {/* Needs a deadline */}
          {needsDeadlineAll.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid rgba(23,52,4,0.08)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 22px', borderBottom: '1px solid rgba(23,52,4,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: UI_FONT, fontWeight: 600, fontSize: 15, color: '#2C2C2A', letterSpacing: '-0.01em' }}>Needs a deadline</span>
                  <span style={{ fontFamily: UI_FONT, fontWeight: 500, fontSize: 12, color: '#74736E', background: '#F0EFEB', padding: '3px 9px', borderRadius: 10 }}>{needsDeadlineAll.length}</span>
                </div>
                <span style={{ fontFamily: BODY_FONT, fontSize: 12, color: '#74736E' }}>Pick a date to schedule</span>
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
                          display: 'grid', gridTemplateColumns: '74px 1fr auto auto', gap: 12, alignItems: 'center',
                          padding: '12px 22px', borderBottom: isLast ? 'none' : '1px solid rgba(23,52,4,0.06)',
                        }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#FAF9F5' }}
                          onMouseLeave={e => { e.currentTarget.style.background = '' }}>
                          {/* The fourth accent, and the one state that is not a
                              countdown. It also gives these rows the same 74px
                              first column as every other row on the page —
                              without it their titles started at the card edge
                              and nothing lined up down the list. */}
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <div style={{ width: 56, height: 46, borderRadius: 12, flexShrink: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: COUNTDOWN_TILE.none }}>
                              <CalendarDays size={19} style={{ color: '#1D3C3E' }} />
                            </div>
                          </div>
                          <button type="button" onClick={() => openPipelineForDeadline(item)}
                            style={{ color: 'inherit', background: 'transparent', border: 'none', padding: 0,
                              textAlign: 'left', cursor: 'pointer', font: 'inherit', minWidth: 0 }}>
                            <div style={{ fontFamily: UI_FONT, fontWeight: 500, fontSize: 14, color: '#2C2C2A', marginBottom: 2 }}>{item.grant_name}</div>
                            <div style={{ fontFamily: BODY_FONT, fontSize: 12.5, color: '#74736E' }}>
                              {item.funder_name !== item.grant_name && <span>{item.funder_name} &middot; </span>}
                              {amtStr && <span style={{ color: '#1D3C3E', fontFamily: UI_FONT, fontWeight: 500 }}>{amtStr}</span>}
                            </div>
                          </button>
                          <DatePickerInput value={val}
                            onChange={v => setDeadlineInputs(prev => ({ ...prev, [item.id]: v }))} />
                          {success ? (
                            <span style={{ fontFamily: UI_FONT, fontSize: 11, fontWeight: 500, color: '#1B6B3D', padding: '4px 10px',
                              background: '#E3F0E4', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Check size={11} strokeWidth={3} /> Set
                            </span>
                          ) : (
                            <button onClick={() => handleSetDeadline(item.id, val)} disabled={!val || saving}
                              style={{ fontFamily: UI_FONT, fontSize: 12, fontWeight: 600, padding: '7px 14px', border: 'none', borderRadius: 999,
                                cursor: val && !saving ? 'pointer' : 'not-allowed',
                                background: val ? '#1D3C3E' : '#F1EDE3', color: val ? '#F6F1E7' : '#74736E' }}>
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
                          display: 'grid', gridTemplateColumns: '74px 1fr auto auto', gap: 12, alignItems: 'center',
                          padding: '12px 22px', borderBottom: isLast ? 'none' : '1px solid rgba(23,52,4,0.06)',
                        }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#FAF9F5' }}
                          onMouseLeave={e => { e.currentTarget.style.background = '' }}>
                          {/* The fourth accent, and the one state that is not a
                              countdown. It also gives these rows the same 74px
                              first column as every other row on the page —
                              without it their titles started at the card edge
                              and nothing lined up down the list. */}
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <div style={{ width: 56, height: 46, borderRadius: 12, flexShrink: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: COUNTDOWN_TILE.none }}>
                              <CalendarDays size={19} style={{ color: '#1D3C3E' }} />
                            </div>
                          </div>
                          <button type="button" onClick={() => setPreviewGrant(g)}
                            style={{ color: 'inherit', background: 'transparent', border: 'none', padding: 0,
                              textAlign: 'left', cursor: 'pointer', font: 'inherit', minWidth: 0 }}>
                            <div style={{ fontFamily: UI_FONT, fontWeight: 500, fontSize: 14, color: '#2C2C2A', marginBottom: 2 }}>{g.title}</div>
                            <div style={{ fontFamily: BODY_FONT, fontSize: 12.5, color: '#74736E' }}>
                              {g.funder && g.funder !== g.title && <span>{g.funder} &middot; </span>}
                              {amtStr && <span style={{ color: '#1D3C3E', fontFamily: UI_FONT, fontWeight: 500 }}>{amtStr}</span>}
                            </div>
                          </button>
                          <DatePickerInput value={val}
                            onChange={v => setSavedInputs(prev => ({ ...prev, [g.id]: v }))} />
                          {success ? (
                            <span style={{ fontFamily: UI_FONT, fontSize: 11, fontWeight: 500, color: '#1B6B3D', padding: '4px 10px',
                              background: '#E3F0E4', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Check size={11} strokeWidth={3} /> Set
                            </span>
                          ) : (
                            <button onClick={() => handleSetSavedDeadline(g, val)} disabled={!val || saving}
                              style={{ fontFamily: UI_FONT, fontSize: 12, fontWeight: 600, padding: '7px 14px', border: 'none', borderRadius: 999,
                                cursor: val && !saving ? 'pointer' : 'not-allowed',
                                background: val ? '#1D3C3E' : '#F1EDE3', color: val ? '#F6F1E7' : '#74736E' }}>
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 22px', borderBottom: '1px solid rgba(23,52,4,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: UI_FONT, fontWeight: 600, fontSize: 15, color: '#2C2C2A', letterSpacing: '-0.01em' }}>Later</span>
                  <span style={{ fontFamily: UI_FONT, fontWeight: 500, fontSize: 12, color: '#74736E', background: '#F0EFEB', padding: '3px 9px', borderRadius: 10 }}>{laterRows.length}</span>
                </div>
                <span style={{ fontFamily: BODY_FONT, fontSize: 12, color: '#74736E' }}>Awareness only</span>
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
              <span style={{ fontFamily: UI_FONT, fontSize: 11.5, color: '#74736E', fontWeight: 500 }}>{MONTH_NAMES[calMonth]} {calYear}</span>
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
                  color: '#74736E', padding: '4px 0', letterSpacing: '0.02em' }}>{d}</div>
              ))}
              {calDays.map((day, i) => {
                const cellIso  = day.date.toISOString().split('T')[0]
                const markers  = day.isCurrentMonth ? calMarkerMap.get(cellIso) : undefined
                const hasAlerts= !!markers
                const isActive = dayFilter === cellIso
                const hasUrgent= markers?.hasUrgent ?? false
                let bg = 'transparent', textColor = day.isCurrentMonth ? '#2C2C2A' : '#C5C3BC', border = 'none', fw = 400
                /* The marker is a DOT under the numeral rather than a tint
                   behind it. Every tint failed at 10px in the legend — urgent
                   1.15, has-deadline 1.07, today's lime ring 1.95 — so three
                   of the four keys were blank squares, and the numeral inside
                   a has-deadline cell was the same failing 3.21 pair as the
                   old countdown pill.

                   The dots use the DARK red and green, not the §2 accent
                   tiles, even though they mean the same thing: a 5px dot is a
                   non-text UI element carrying its own 3:1 against white, and
                   gold (1.54) and sage (1.85) would vanish at that size. A
                   46px tile has no such problem because its numeral carries
                   the contrast. Same signal, different size, different floor. */
                let dot: string | null = null
                if (day.isCurrentMonth) {
                  if      (isActive)   { bg = '#1D3C3E'; textColor = '#F6F1E7'; fw = 600; dot = hasAlerts ? '#F6F1E7' : null }
                  else if (hasUrgent)  { dot = '#993C1D'; fw = 600 }
                  else if (hasAlerts)  { dot = '#1B6B3D'; fw = 600 }
                  else if (day.isToday){ border = '1.5px solid #1D3C3E'; fw = 600 }
                }
                return (
                  <div key={i}
                    onClick={() => { if (!day.isCurrentMonth || !hasAlerts) return; setDayFilter(prev => prev === cellIso ? null : cellIso) }}
                    style={{ height: 34, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                      borderRadius: 8, fontSize: 12, userSelect: 'none' as const, fontFamily: UI_FONT,
                      color: textColor, background: bg, border, fontWeight: fw,
                      cursor: hasAlerts && day.isCurrentMonth ? 'pointer' : 'default' }}
                    onMouseEnter={e => { if (day.isCurrentMonth && (hasAlerts || day.isToday)) e.currentTarget.style.opacity = '0.85' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}>
                    <span style={{ lineHeight: 1 }}>{day.date.getDate()}</span>
                    {/* Reserved whether or not there is a dot, so numerals sit
                        on one baseline across the whole grid. */}
                    <span style={{ width: 5, height: 5, borderRadius: 999, flexShrink: 0,
                      background: dot ?? 'transparent' }} />
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
              {/* A solid dot reads at 10px where a 7% tint does not. */}
              {[
                { bg: '#993C1D', label: 'Urgent (≤7d)' },
                { bg: '#1B6B3D', label: 'Has deadline' },
                { bg: '#1D3C3E', label: 'Selected', square: true },
                { bg: 'transparent', border: '1.5px solid #1D3C3E', label: 'Today', square: true },
              ].map(({ bg: d, label, border: b, square }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 10, height: 10, borderRadius: square ? 3 : 999, background: d,
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
                      background: checked ? '#1D3C3E' : '#fff',
                      border: checked ? 'none' : '1.5px solid rgba(23,52,4,0.14)' }}>
                      {checked && <Check size={10} strokeWidth={3} style={{ color: '#fff' }} />}
                    </div>
                    <span style={{ fontFamily: UI_FONT, fontSize: 13, color: '#2C2C2A' }}>{label}</span>
                  </div>
                  <span style={{ fontFamily: UI_FONT, fontSize: 11.5, color: '#74736E' }}>{count}</span>
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

      {/* Needs-a-deadline pipeline-row preview modal (rich modal, pipeline-item-backed) */}
      {previewPipelineForDeadline && (() => {
        const { item, enriched } = previewPipelineForDeadline
        // Pipeline-item fields win for id (callback target) and deadline
        // (we want the pipeline's deadline state, not the catalogue's, to
        // drive picker visibility). Enriched catalogue fields fill the
        // descriptive panels when the lookup resolved.
        const adapted: EnrichedGrant = {
          id: item.id,
          title: enriched?.title ?? item.grant_name,
          funder: enriched?.funder ?? item.funder_name,
          funderType: enriched?.funderType ?? item.funder_type,
          fundingType: enriched?.fundingType ?? (itemFundingType(item) as FundingType),
          description: enriched?.description ?? '',
          amountMin: enriched?.amountMin ?? item.amount_min ?? 0,
          amountMax: enriched?.amountMax ?? item.amount_max ?? item.amount_requested ?? 0,
          deadline: item.deadline,
          isRolling: enriched?.isRolling ?? false,
          isLocal: enriched?.isLocal ?? false,
          sectors: enriched?.sectors ?? [],
          impactSectors: enriched?.impactSectors,
          nicheTags: enriched?.nicheTags,
          beneficiaryGroups: enriched?.beneficiaryGroups,
          eligibilityCriteria: enriched?.eligibilityCriteria ?? [],
          eligibleStructures: enriched?.eligibleStructures,
          applyUrl: enriched?.applyUrl ?? item.grant_url,
          isInviteOnly: enriched?.isInviteOnly ?? false,
          source: enriched?.source ?? 'manual',
          funderBrief: enriched?.funderBrief,
          eligibilityStatus: enriched?.eligibilityStatus,
        } as EnrichedGrant
        return (
          <GrantPreviewModal
            grant={adapted}
            inPipeline={true}
            saving={previewSaving}
            onClose={() => setPreviewPipelineForDeadline(null)}
            onAddToPipeline={() => { /* already in pipeline — button hidden */ }}
            onSetDeadline={async (dl) => {
              setPreviewSaving(true)
              try {
                await handleSetDeadline(item.id, dl)
                setPreviewPipelineForDeadline(null)
                showToast(item.deadline ? 'Deadline updated' : 'Deadline set')
              } finally { setPreviewSaving(false) }
            }}
          />
        )
      })()}

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
          style={{ background: '#1D3C3E', color: '#E3F0E4' }}>
          ✓ {toast}
        </div>
      )}
    </div>
  )
}

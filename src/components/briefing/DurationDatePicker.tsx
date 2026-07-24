'use client'

// Target step's deadline control (setup stepper, spec §3.2 step 1): duration
// chips by default (12/18/24 months, or Custom), with an exact calendar date
// as the fallback. No model arithmetic anywhere near dates — this is the
// structural fix for the CGK date-bug class (a model computing a wrong
// end_date from "in 18 months").

import React, { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { COLOR, grotesk } from './ui'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const next = new Date(y, m - 1 + months, d)
  return next.toISOString().slice(0, 10)
}

function addWeeks(iso: string, weeks: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const next = new Date(y, m - 1, d + weeks * 7)
  return next.toISOString().slice(0, 10)
}

interface CalDay { date: Date; isCurrentMonth: boolean; isToday: boolean }

function buildCalendarDays(year: number, month: number): CalDay[] {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const firstDow = new Date(year, month, 1).getDay()
  const startPad = (firstDow + 6) % 7
  const days: CalDay[] = []
  for (let i = startPad - 1; i >= 0; i--) {
    days.push({ date: new Date(year, month, -i), isCurrentMonth: false, isToday: false })
  }
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d)
    days.push({ date, isCurrentMonth: true, isToday: date.getTime() === today.getTime() })
  }
  const total = Math.ceil(days.length / 7) * 7
  let nd = 1
  while (days.length < total) {
    days.push({ date: new Date(year, month + 1, nd++), isCurrentMonth: false, isToday: false })
  }
  return days
}

const DURATION_CHIPS: Array<{ key: string; label: string; months: number }> = [
  { key: '12', label: '12 months', months: 12 },
  { key: '18', label: '18 months', months: 18 },
  { key: '24', label: '24 months', months: 24 },
]

const fmtDate = (iso: string | null) => {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function DurationDatePicker({ value, onChange }: { value: string | null; onChange: (iso: string) => void }) {
  const [mode, setMode] = useState<'chips' | 'calendar'>('chips')
  const [activeChip, setActiveChip] = useState<string | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [customN, setCustomN] = useState('')
  const [customUnit, setCustomUnit] = useState<'weeks' | 'months' | 'years'>('months')

  const [viewYear, setViewYear] = useState(() => (value ? Number(value.split('-')[0]) : new Date().getFullYear()))
  const [viewMonth, setViewMonth] = useState(() => (value ? Number(value.split('-')[1]) - 1 : new Date().getMonth()))
  const calDays = buildCalendarDays(viewYear, viewMonth)

  function pickChip(key: string, months: number) {
    setActiveChip(key)
    setCustomOpen(false)
    onChange(addMonths(todayIso(), months))
  }

  function openCustom() {
    setActiveChip('custom')
    setCustomOpen(true)
  }

  function applyCustom() {
    const n = parseInt(customN, 10)
    if (!n || n <= 0) return
    const iso = customUnit === 'months' ? addMonths(todayIso(), n)
      : customUnit === 'years' ? addMonths(todayIso(), n * 12)
      : addWeeks(todayIso(), n)
    onChange(iso)
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1)
  }

  return (
    <div>
      {mode === 'chips' ? (
        <>
          <div className="flex gap-2 flex-wrap">
            {DURATION_CHIPS.map(c => {
              const sel = activeChip === c.key
              return (
                <button key={c.key} type="button" onClick={() => pickChip(c.key, c.months)}
                  className="text-sm px-3 py-1.5 rounded-lg"
                  style={{
                    ...grotesk,
                    border: sel ? `1.5px solid ${COLOR.sage}` : `1px solid ${COLOR.hair}`,
                    background: sel ? COLOR.pale : 'var(--surface-card)',
                    color: sel ? COLOR.sage : COLOR.ink,
                  }}>
                  {c.label}
                </button>
              )
            })}
            <button type="button" onClick={openCustom}
              className="text-sm px-3 py-1.5 rounded-lg"
              style={{
                ...grotesk,
                border: activeChip === 'custom' ? `1.5px solid ${COLOR.sage}` : `1px solid ${COLOR.hair}`,
                background: activeChip === 'custom' ? COLOR.pale : 'var(--surface-card)',
                color: activeChip === 'custom' ? COLOR.sage : COLOR.ink,
              }}>
              Custom
            </button>
          </div>

          {customOpen && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text" inputMode="numeric" value={customN}
                onChange={e => setCustomN(e.target.value.replace(/\D/g, ''))}
                placeholder="18"
                className="text-sm px-2 py-1.5 rounded-lg outline-none"
                style={{ width: 64, border: `1px solid ${COLOR.hair}`, color: COLOR.ink }}
              />
              <select value={customUnit} onChange={e => setCustomUnit(e.target.value as 'weeks' | 'months' | 'years')}
                className="text-sm px-2 py-1.5 rounded-lg outline-none"
                style={{ border: `1px solid ${COLOR.hair}`, color: COLOR.ink, background: 'var(--surface-card)' }}>
                <option value="weeks">weeks</option>
                <option value="months">months</option>
                <option value="years">years</option>
              </select>
              <button type="button" onClick={applyCustom}
                className="text-sm font-semibold px-3 py-1.5 rounded-lg"
                style={{ ...grotesk, background: COLOR.forest, color: COLOR.pale }}>
                Set
              </button>
            </div>
          )}

          <button type="button" onClick={() => setMode('calendar')}
            className="mt-2 text-xs underline block" style={{ color: COLOR.sage }}>
            Pick an exact date instead
          </button>
        </>
      ) : (
        <div style={{ maxWidth: 240 }}>
          <div className="flex items-center gap-2 mb-2">
            <button type="button" onClick={prevMonth}
              className="flex items-center justify-center rounded-md"
              style={{ width: 22, height: 22, background: COLOR.cream, border: 'none', color: COLOR.mid }}>
              <ChevronLeft size={11} strokeWidth={2.5} />
            </button>
            <span className="flex-1 text-center text-sm font-semibold" style={{ ...grotesk, color: COLOR.ink }}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={nextMonth}
              className="flex items-center justify-center rounded-md"
              style={{ width: 22, height: 22, background: COLOR.cream, border: 'none', color: COLOR.mid }}>
              <ChevronRight size={11} strokeWidth={2.5} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <div key={i} className="text-center text-[9px]" style={{ color: COLOR.faint, letterSpacing: '0.05em', padding: '2px 0' }}>{d}</div>
            ))}
            {calDays.map((day, i) => {
              const iso = day.date.toISOString().split('T')[0]
              const isSel = iso === value
              return (
                <button key={i} type="button"
                  onClick={() => { if (!day.isCurrentMonth) return; setActiveChip(null); onChange(iso) }}
                  className="text-center rounded-md"
                  style={{
                    padding: '5px 1px', border: 'none',
                    cursor: day.isCurrentMonth ? 'pointer' : 'default',
                    background: isSel ? COLOR.secured : day.isToday ? COLOR.pale : 'transparent',
                    color: isSel ? 'var(--surface-card)' : !day.isCurrentMonth ? 'var(--border-warm)' : day.isToday ? COLOR.sage : COLOR.ink,
                    fontFamily: 'inherit', fontSize: 12, fontWeight: isSel ? 600 : 400,
                  }}>
                  {day.date.getDate()}
                </button>
              )
            })}
          </div>
          <button type="button" onClick={() => setMode('chips')}
            className="mt-2 text-xs underline block" style={{ color: COLOR.sage }}>
            Use a duration instead
          </button>
        </div>
      )}

      {value && (
        <p className="mt-2 text-xs" style={{ color: COLOR.faint }}>
          <Calendar size={10} strokeWidth={2} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
          Deadline: {fmtDate(value)}
        </p>
      )}
    </div>
  )
}

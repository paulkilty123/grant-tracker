'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, CalendarClock, CalendarCheck, ExternalLink, ArrowRight, Calendar, AlarmClock, ChevronDown, ChevronUp, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getDeadlineAlerts, formatDeadline, formatRange, PIPELINE_STAGES } from '@/lib/utils'
import { updatePipelineStage, updatePipelineItem } from '@/lib/pipeline'
import type { DeadlineAlert, PipelineItem, PipelineStage } from '@/types'

const ACTIVE_STAGES = ['identified', 'applying', 'submitted']

// ── Deadline Card ─────────────────────────────────────────────────────────────

function DeadlineCard({ alert, onStageChange, onDeadlineChange, featured = false }: {
  alert: DeadlineAlert
  onStageChange: (id: string, stage: PipelineStage) => void
  onDeadlineChange?: (id: string, deadline: string) => void
  featured?: boolean
}) {
  const stage = PIPELINE_STAGES.find(s => s.id === alert.item.stage)
  const amountStr = formatRange(alert.item.amount_min, alert.item.amount_max ?? alert.item.amount_requested)
  const isOverdue = alert.urgency === 'overdue'
  const isUrgent  = alert.urgency === 'urgent'

  const cardBg   = isOverdue ? '#ffdad6' : isUrgent ? '#FDE8A3' : alert.urgency === 'soon' ? '#BAE6FD' : '#D9F99D'
  const labelCol = isOverdue ? '#93000a' : isUrgent ? '#4A3800' : alert.urgency === 'soon' ? '#1E3A5F' : '#4D7C0F'
  const badgeBg  = isOverdue ? '#ba1a1a' : isUrgent ? '#B45309' : alert.urgency === 'soon' ? '#1E3A5F' : '#4D7C0F'

  return (
    <div
      className={featured ? 'p-5 rounded-[2rem]' : 'p-4 rounded-[1.5rem] mb-3'}
      style={{ backgroundColor: cardBg }}
    >
      {/* Top row */}
      <div className={'flex items-start justify-between gap-4 ' + (featured ? 'mb-3' : 'mb-2')}>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest text-white"
            style={{ backgroundColor: badgeBg }}
          >
            {isOverdue ? 'Overdue' : isUrgent ? `${alert.daysUntil}d left` : alert.urgency === 'soon' ? 'Coming up' : 'On track'}
          </span>
          {stage && (
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(0,0,0,0.4)' }}>
              {stage.label}
            </span>
          )}
        </div>
        {amountStr && (
          <p className={'font-black shrink-0 ' + (featured ? 'text-lg' : 'text-base')} style={{ fontFamily: 'var(--font-space-grotesk)', color: labelCol }}>
            {amountStr}
          </p>
        )}
      </div>

      {/* Grant name */}
      <h3
        className={'font-bold leading-tight ' + (featured ? 'text-lg mb-1' : 'text-sm mb-0.5')}
        style={{ fontFamily: 'var(--font-space-grotesk)', color: '#1b1b1b' }}
      >
        {alert.item.grant_name}
      </h3>
      <p className={'mb-2 ' + (featured ? 'text-xs' : 'text-xs')} style={{ color: 'rgba(0,0,0,0.5)' }}>
        {alert.item.funder_name}
      </p>

      {/* Deadline + edit */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Calendar size={12} strokeWidth={2} style={{ color: labelCol }} />
          <span className="text-sm font-semibold" style={{ color: labelCol }}>
            {formatDeadline(alert.item.deadline)}
          </span>
        </div>
        {onDeadlineChange && (
          <input
            type="date"
            defaultValue={alert.item.deadline ?? ''}
            onChange={e => onDeadlineChange(alert.item.id, e.target.value)}
            className="text-xs border-0 rounded-lg px-2 py-1 outline-none focus:ring-1 transition-all"
            style={{ background: "rgba(0,0,0,0.08)", color: labelCol }}
            title="Change deadline"
          />
        )}
      </div>

      {/* Progress bar */}
      {alert.item.application_progress != null && alert.item.application_progress > 0 && (
        <div className="mb-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(0,0,0,0.4)' }}>Writing progress</span>
            <span className="text-xs font-black" style={{ color: labelCol }}>{alert.item.application_progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-black/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${alert.item.application_progress}%`, backgroundColor: labelCol }}
            />
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {alert.item.stage === 'applying' && (
          <button
            onClick={() => onStageChange(alert.item.id, 'submitted')}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full bg-black/10 hover:bg-black/20 transition-colors"
            style={{ color: 'rgba(0,0,0,0.65)' }}
          >
            <Send size={11} strokeWidth={2.5} /> Mark submitted
          </button>
        )}
        {alert.item.stage === 'submitted' && (
          <button
            onClick={() => onStageChange(alert.item.id, 'won')}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full bg-black/10 hover:bg-black/20 transition-colors"
            style={{ color: 'rgba(0,0,0,0.65)' }}
          >
            Mark won
          </button>
        )}
        {alert.item.grant_url && (
          <a
            href={alert.item.grant_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full bg-black/10 hover:bg-black/20 transition-colors"
            style={{ color: 'rgba(0,0,0,0.65)' }}
          >
            <ExternalLink size={11} strokeWidth={2.5} /> Visit grant
          </a>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DeadlinesPage() {
  const [alerts, setAlerts] = useState<DeadlineAlert[]>([])
  const [noDeadlineItems, setNoDeadlineItems] = useState<PipelineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [okExpanded, setOkExpanded] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [deadlineInputs, setDeadlineInputs] = useState<Record<string, string>>({})
  const [savingDeadline, setSavingDeadline] = useState<string | null>(null)

  async function loadData() {
    try {
      const supabase = createClient()
      const { data: { user }, error: userErr } = await supabase.auth.getUser()
      if (userErr || !user) { setLoading(false); return }
      const { data: org } = await supabase.from('organisations').select('id').eq('owner_id', user.id).maybeSingle()
      if (!org) { setLoading(false); return }
      const { data: items, error: itemsErr } = await supabase
        .from('pipeline_items').select('*').eq('org_id', org.id).order('deadline', { ascending: true })
      if (itemsErr) { setError(itemsErr.message); return }
      const allItems: PipelineItem[] = items ?? []
      setAlerts(getDeadlineAlerts(allItems))
      setNoDeadlineItems(allItems.filter(i => ACTIVE_STAGES.includes(i.stage) && !i.deadline))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleSetDeadline(id: string, deadline: string) {
    if (!deadline) return
    setSavingDeadline(id)
    await updatePipelineItem(id, { deadline })
    showToast('Deadline set!')
    setSavingDeadline(null)
    await loadData()
  }

  async function handleDeadlineChange(id: string, deadline: string) {
    if (!deadline) return
    await updatePipelineItem(id, { deadline })
    showToast('Deadline updated')
    await loadData()
  }

  async function handleStageChange(id: string, stage: PipelineStage) {
    setAlerts(prev => prev.map(a => a.item.id === id ? { ...a, item: { ...a.item, stage } } : a))
    await updatePipelineStage(id, stage)
    showToast(`Moved to \${PIPELINE_STAGES.find(s => s.id === stage)?.label}`)
  }

  const overdue        = alerts.filter(a => a.urgency === 'overdue')
  const urgent         = alerts.filter(a => a.urgency === 'urgent')
  const soon           = alerts.filter(a => a.urgency === 'soon')
  const ok             = alerts.filter(a => a.urgency === 'ok')
  const needsAttention = [...overdue, ...urgent]
  const heroAlert      = needsAttention[0] ?? soon[0] ?? ok[0] ?? null
  const restAttention  = needsAttention.slice(1)

  const atRisk = needsAttention.reduce((s, a) => s + (a.item.amount_max ?? a.item.amount_requested ?? 0), 0)
  const fmt = (n: number) => n >= 1000000 ? `£${(n/1000000).toFixed(1)}m` : n >= 1000 ? `£${(n/1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `£${n.toLocaleString()}`

  if (loading) return <div className="flex items-center justify-center h-64 text-[#6E6E80] text-sm">Loading deadlines…</div>
  if (error)   return <div className="p-8 text-center"><p className="text-red-500 font-medium">{error}</p></div>

  return (
    <div style={{ fontFamily: 'Plus Jakarta Sans, var(--font-dm-sans), sans-serif' }}>


      <header className="mb-10">
        <div className="flex items-start justify-between gap-4 mb-4">
          <h1 className="text-5xl font-bold tracking-tight text-[#1b1b1b]" style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.03em' }}>
            Deadlines
          </h1>
          <a
            href="/dashboard/pipeline"
            className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#1b1b1b] text-[#1b1b1b] text-sm font-bold bg-white hover:bg-[#1b1b1b] hover:text-white transition-colors whitespace-nowrap mt-1"
          >
            Manage Pipeline <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>

      </header>

      {/* ── Fully empty state ── */}
      {alerts.length === 0 && noDeadlineItems.length === 0 && (
        <div className="bg-white p-16 rounded-[2rem] text-center">
          <Calendar className="h-12 w-12 mx-auto mb-5" style={{ color: '#9E9EA8' }} strokeWidth={1.5} />
          <h3 className="text-2xl font-bold text-[#1b1b1b] mb-2" style={{ fontFamily: 'var(--font-space-grotesk)' }}>No deadlines yet</h3>
          <p className="text-sm mb-6 max-w-sm mx-auto" style={{ color: '#6E6E80' }}>
            Add grants to your pipeline and set deadline dates to track them here.
          </p>
          <a href="/dashboard/search" className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-white text-sm font-bold hover:opacity-80 transition-colors" style={{ background: '#1b1b1b' }}>
            Find Funding <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      )}

      {/* ── No alerts but grants exist without deadlines ── */}
      {alerts.length === 0 && noDeadlineItems.length > 0 && (
        <div>
          {/* Why it matters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            {[
              { icon: AlarmClock, title: "Never miss a window", body: "Deadline alerts surface 10 days before each closing date so you always have time to submit.", bg: "#FDE8A3", col: "#4A3800" },
              { icon: AlertTriangle, title: "Spot what's at risk", body: "The at-risk total shows how much funding could slip - a clear signal of where to focus effort.", bg: "#BAE6FD", col: "#1E3A5F" },
              { icon: CalendarCheck, title: "Track writing progress", body: "Log your application progress on each grant so you know exactly where every submission stands.", bg: "#D9F99D", col: "#4D7C0F" },
            ].map(({ icon: Icon, title, body, bg, col }) => (
              <div key={title} className="p-6 rounded-[2rem]" style={{ backgroundColor: bg }}>
                <Icon size={20} className="mb-3" style={{ color: col }} />
                <h4 className="font-bold text-sm mb-1" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#1b1b1b' }}>{title}</h4>
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(0,0,0,0.55)' }}>{body}</p>
              </div>
            ))}
          </div>

          {/* Set deadlines inline */}
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-bold text-[#1b1b1b]" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
              Set deadlines for your pipeline grants
            </h3>
            <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: '#FDE8A3', color: '#4A3800' }}>
              {noDeadlineItems.length} to do
            </span>
          </div>
          <div className="space-y-3">
            {noDeadlineItems.map(item => {
              const amountStr = formatRange(item.amount_min, item.amount_max ?? item.amount_requested)
              const stage = PIPELINE_STAGES.find(s => s.id === item.stage)
              const val = deadlineInputs[item.id] ?? ''
              const saving = savingDeadline === item.id
              return (
                <div key={item.id} className="bg-white p-5 rounded-[1.5rem] flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#1b1b1b] truncate" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{item.grant_name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <p className="text-sm truncate" style={{ color: '#6E6E80' }}>{item.funder_name}</p>
                      {amountStr && <span className="text-sm font-bold" style={{ color: '#84CC16' }}>{amountStr}</span>}
                      {stage && <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#9E9EA8' }}>{stage.label}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="date"
                      value={val}
                      onChange={e => setDeadlineInputs(prev => ({ ...prev, [item.id]: e.target.value }))}
                      className="text-sm border border-[#E8E8EC] rounded-xl px-3 py-2 outline-none focus:border-[#84CC16] transition-colors"
                      style={{ color: '#1b1b1b' }}
                    />
                    <button
                      onClick={() => handleSetDeadline(item.id, val)}
                      disabled={!val || saving}
                      className="px-4 py-2 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-40"
                      style={{ background: '#1b1b1b' }}
                    >
                      {saving ? 'Saving…' : 'Set'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left: all grants in one consistent list */}
          <div className="lg:col-span-8 flex flex-col gap-3">

            {/* Needs Attention */}
            {needsAttention.length > 0 && (
              <p className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 mb-1" style={{ color: '#93000a' }}>
                <AlertTriangle size={10} />
                Needs Attention
                <span className="font-semibold normal-case tracking-normal" style={{ color: 'rgba(0,0,0,0.4)' }}>
                  {needsAttention.length} {needsAttention.length === 1 ? 'grant' : 'grants'}{atRisk > 0 ? ` · \${fmt(atRisk)} at risk` : ''}
                </span>
              </p>
            )}
            {needsAttention.map(a => (
              <DeadlineCard key={a.item.id} alert={a} onStageChange={handleStageChange} onDeadlineChange={handleDeadlineChange} />
            ))}

            {/* Coming Up */}
            {soon.length > 0 && (
              <>
                <p className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 mt-3 mb-1" style={{ color: '#1E3A5F' }}>
                  <CalendarClock size={10} />
                  Coming Up
                  <span className="font-semibold normal-case tracking-normal" style={{ color: 'rgba(0,0,0,0.4)' }}>{soon.length} {soon.length === 1 ? 'grant' : 'grants'}</span>
                </p>
                {soon.map(a => <DeadlineCard key={a.item.id} alert={a} onStageChange={handleStageChange} onDeadlineChange={handleDeadlineChange} />)}
              </>
            )}

            {/* On Track */}
            {ok.length > 0 && (
              <>
                <button onClick={() => setOkExpanded(v => !v)} className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 mt-3 mb-1">
                  <CalendarCheck size={10} style={{ color: '#4D7C0F' }} />
                  <span style={{ color: '#4D7C0F' }}>On Track</span>
                  <span className="font-semibold normal-case tracking-normal" style={{ color: 'rgba(0,0,0,0.4)' }}>{ok.length} {ok.length === 1 ? 'grant' : 'grants'}</span>
                  {okExpanded ? <ChevronUp size={10} style={{ color: '#6E6E80' }} /> : <ChevronDown size={10} style={{ color: '#6E6E80' }} />}
                </button>
                {okExpanded && ok.map(a => <DeadlineCard key={a.item.id} alert={a} onStageChange={handleStageChange} onDeadlineChange={handleDeadlineChange} />)}
              </>
            )}

            {/* Set Deadlines */}
            {noDeadlineItems.length > 0 && (
              <>
                <p className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 mt-3 mb-1" style={{ color: 'rgba(0,0,0,0.4)' }}>
                  <Calendar size={10} />
                  Set Deadlines
                  <span className="font-semibold normal-case tracking-normal">{noDeadlineItems.length} to do</span>
                </p>
                {noDeadlineItems.map(item => {
                  const amountStr = formatRange(item.amount_min, item.amount_max ?? item.amount_requested)
                  const stage = PIPELINE_STAGES.find(s => s.id === item.stage)
                  const val = deadlineInputs[item.id] ?? ''
                  const saving = savingDeadline === item.id
                  return (
                    <div key={item.id} className="bg-white p-4 rounded-[1.5rem] flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[#1b1b1b] truncate" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{item.grant_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs truncate" style={{ color: '#6E6E80' }}>{item.funder_name}</p>
                          {amountStr && <span className="text-xs font-bold" style={{ color: '#84CC16' }}>{amountStr}</span>}
                          {stage && <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: '#9E9EA8' }}>{stage.label}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="date"
                          value={val}
                          onChange={e => setDeadlineInputs(prev => ({ ...prev, [item.id]: e.target.value }))}
                          className="text-xs border border-[#E8E8EC] rounded-xl px-3 py-1.5 outline-none focus:border-[#84CC16] transition-colors"
                          style={{ color: '#1b1b1b' }}
                        />
                        <button
                          onClick={() => handleSetDeadline(item.id, val)}
                          disabled={!val || saving}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold text-white disabled:opacity-40"
                          style={{ background: '#1b1b1b' }}
                        >
                          {saving ? '...' : 'Set'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>

          {/* Right: 4 stat cards vertical */}
          <div className="lg:col-span-4 flex flex-col gap-3">
            {[
              { label: 'Overdue',   count: overdue.length, bg: '#ffdad6', col: '#93000a', Icon: AlertTriangle },
              { label: 'This Week', count: urgent.length,  bg: '#FDE8A3', col: '#4A3800', Icon: AlarmClock },
              { label: 'Coming Up', count: soon.length,    bg: '#BAE6FD', col: '#1E3A5F', Icon: CalendarClock },
              { label: 'On Track',  count: ok.length,      bg: '#D9F99D', col: '#4D7C0F', Icon: CalendarCheck },
            ].map(({ label, count, bg, col, Icon }) => (
              <div key={label} className="flex items-center justify-between px-6 py-5 rounded-[1.5rem]" style={{ backgroundColor: bg }}>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(0,0,0,0.4)' }}>{label}</p>
                  <p className="text-4xl font-black leading-none" style={{ fontFamily: 'var(--font-space-grotesk)', color: col }}>
                    {count > 0 ? String(count).padStart(2, '0') : '–'}
                  </p>
                </div>
                <Icon size={32} style={{ color: col, opacity: 0.2 }} />
              </div>
            ))}
          </div>
        </div>
      )}



      {toast && (
        <div className="fixed bottom-6 right-6 bg-[#1b1b1b] text-white px-5 py-3.5 rounded-2xl shadow-lg text-sm z-50">
          ✓ {toast}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, CalendarClock, CalendarCheck, ExternalLink, ArrowRight, Calendar, AlarmClock, ChevronDown, ChevronUp, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getDeadlineAlerts, formatDeadline, formatRange, PIPELINE_STAGES } from '@/lib/utils'
import { updatePipelineStage, updatePipelineItem } from '@/lib/pipeline'
import type { DeadlineAlert, PipelineItem, PipelineStage } from '@/types'

const URGENCY_CONFIG = {
  overdue: {
    label: 'Overdue', icon: AlertTriangle,
    accent: 'text-red-700', border: 'border-[#FECACA]', cardBg: '#FEE2E2',
    badgeBg: 'bg-red-500', badgeText: 'text-white',
    statAccent: 'text-red-700', statBg: '#FEE2E2', statBorder: 'border-[#FECACA]',
  },
  urgent: {
    label: 'This week', icon: AlarmClock,
    accent: 'text-[#4A3800]', border: 'border-[#F59E0B]/30', cardBg: '#FDE8A3',
    badgeBg: 'bg-amber-500', badgeText: 'text-white',
    statAccent: 'text-[#4A3800]', statBg: '#FDE8A3', statBorder: 'border-[#F59E0B]/30',
  },
  soon: {
    label: 'Coming up', icon: CalendarClock,
    accent: 'text-[#1E3A5F]', border: 'border-[#7DD3FC]/40', cardBg: '#BAE6FD',
    badgeBg: 'bg-[#BAE6FD]', badgeText: 'text-[#1E3A5F]',
    statAccent: 'text-[#1E3A5F]', statBg: '#BAE6FD', statBorder: 'border-[#7DD3FC]/40',
  },
  ok: {
    label: 'On track', icon: CalendarCheck,
    accent: 'text-[#4D7C0F]', border: 'border-[#84CC16]/30', cardBg: '#D9F99D',
    badgeBg: 'bg-[#D9F99D]', badgeText: 'text-[#4D7C0F]',
    statAccent: 'text-[#4D7C0F]', statBg: '#D9F99D', statBorder: 'border-[#84CC16]/30',
  },
  rolling: {
    label: 'Rolling', icon: CalendarCheck,
    accent: 'text-[#6E6E80]', border: 'border-[#E8E8EC]', cardBg: '#F5F5F7',
    badgeBg: 'bg-[#F5F5F7]', badgeText: 'text-[#6E6E80]',
    statAccent: 'text-[#6E6E80]', statBg: '#F5F5F7', statBorder: 'border-[#E8E8EC]',
  },
}

const ACTIVE_STAGES = ['identified', 'applying', 'submitted']

function DeadlineCard({ alert, onStageChange }: {
  alert: DeadlineAlert
  onStageChange: (id: string, stage: PipelineStage) => void
}) {
  const cfg = URGENCY_CONFIG[alert.urgency]
  const stage = PIPELINE_STAGES.find(s => s.id === alert.item.stage)
  const amountStr = formatRange(alert.item.amount_min, alert.item.amount_max ?? alert.item.amount_requested)
  const isOverdueOrUrgent = alert.urgency === 'overdue' || alert.urgency === 'urgent'

  return (
    <div
      className={`border rounded-xl p-5 mb-3 ${cfg.border}`}
      style={{ backgroundColor: cfg.cardBg, boxShadow: '0 2px 12px rgba(26,46,43,0.06)' }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Badges */}
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full ${cfg.badgeBg} ${cfg.badgeText} uppercase tracking-wide`}>
              {isOverdueOrUrgent && <AlarmClock size={9} strokeWidth={2.5} />}
              {alert.urgency === 'overdue' ? 'Overdue' : `${alert.daysUntil}d left`}
            </span>
            {stage && (
              <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(0,0,0,0.4)' }}>{stage.label}</span>
            )}
          </div>

          {/* Grant name */}
          <h3 className="text-base font-bold text-[#1A1A1A] leading-snug mb-0.5" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            {alert.item.grant_name}
          </h3>
          <p className="text-sm mb-2" style={{ color: 'rgba(0,0,0,0.5)' }}>{alert.item.funder_name}</p>

          {/* Notes */}
          {alert.item.notes && (
            <p className="text-xs line-clamp-2 mb-2" style={{ color: 'rgba(0,0,0,0.45)' }}>{alert.item.notes}</p>
          )}

          {/* Quick actions */}
          <div className="flex items-center gap-2 flex-wrap mt-1">
            {alert.item.stage === 'applying' && (
              <button
                onClick={() => onStageChange(alert.item.id, 'submitted')}
                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-black/10 hover:bg-black/20 transition-colors"
                style={{ color: 'rgba(0,0,0,0.65)' }}
              >
                <Send size={10} strokeWidth={2.5} />
                Mark submitted
              </button>
            )}
            {alert.item.stage === 'submitted' && (
              <button
                onClick={() => onStageChange(alert.item.id, 'won')}
                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-black/10 hover:bg-black/20 transition-colors"
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
                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-black/10 hover:bg-black/20 transition-colors"
                style={{ color: 'rgba(0,0,0,0.65)' }}
              >
                <ExternalLink size={10} strokeWidth={2.5} />
                Visit grant
              </a>
            )}
          </div>
        </div>

        {/* Right: amount + deadline */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0 text-right">
          {amountStr && (
            <p className="text-lg font-bold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#1A1A1A' }}>
              {amountStr}
            </p>
          )}
          <div className={`flex items-center gap-1 text-sm font-semibold ${cfg.accent}`}>
            <Calendar size={12} strokeWidth={2} />
            {formatDeadline(alert.item.deadline)}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {alert.item.application_progress != null && alert.item.application_progress > 0 && (
        <div className="mt-3 pt-3 border-t border-black/10">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(0,0,0,0.4)' }}>Writing progress</span>
            <span className="text-xs font-bold" style={{ color: 'rgba(0,0,0,0.6)' }}>{alert.item.application_progress}%</span>
          </div>
          <div className="h-1.5 bg-black/10 overflow-hidden rounded-full">
            <div
              className="h-full transition-all rounded-full"
              style={{
                width: `${alert.item.application_progress}%`,
                backgroundColor: alert.item.application_progress >= 75 ? '#84CC16' : '#A3E635'
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default function DeadlinesPage() {
  const [alerts, setAlerts] = useState<DeadlineAlert[]>([])
  const [noDeadlineItems, setNoDeadlineItems] = useState<PipelineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [okExpanded, setOkExpanded] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
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
    load()
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleStageChange(id: string, stage: PipelineStage) {
    setAlerts(prev => prev.map(a =>
      a.item.id === id ? { ...a, item: { ...a.item, stage } } : a
    ))
    await updatePipelineStage(id, stage)
    showToast(`Moved to ${PIPELINE_STAGES.find(s => s.id === stage)?.label}`)
  }

  const overdue  = alerts.filter(a => a.urgency === 'overdue')
  const urgent   = alerts.filter(a => a.urgency === 'urgent')
  const soon     = alerts.filter(a => a.urgency === 'soon')
  const ok       = alerts.filter(a => a.urgency === 'ok')
  const needsAttention = [...overdue, ...urgent]

  // Value at risk: sum of overdue + urgent amounts
  const atRisk = needsAttention.reduce((sum, a) =>
    sum + (a.item.amount_max ?? a.item.amount_requested ?? 0), 0
  )
  const fmtAmount = (n: number) =>
    n >= 1000000 ? `£${(n / 1000000).toFixed(1)}m`
    : n >= 1000  ? `£${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
    : `£${n.toLocaleString()}`

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-[#6E6E80] text-sm">Loading deadlines…</div>
  )

  if (error) return (
    <div className="bg-white border border-[#E8E8EC] rounded-xl p-8 text-center">
      <p className="text-red-500 font-medium mb-2">Something went wrong</p>
      <p className="text-sm text-[#6E6E80]">{error}</p>
    </div>
  )

  return (
    <div>
      {/* ── No deadline warning banner ── */}
      {noDeadlineItems.length > 0 && (
        <div className="flex items-center justify-between gap-4 px-5 py-3.5 rounded-xl mb-6 border border-[#F59E0B]/30" style={{ background: '#FDE8A3' }}>
          <div className="flex items-center gap-2.5">
            <AlarmClock className="w-4 h-4 flex-shrink-0" style={{ color: '#4A3800' }} />
            <p className="text-sm font-semibold" style={{ color: '#4A3800' }}>
              {noDeadlineItems.length} grant{noDeadlineItems.length !== 1 ? 's' : ''} in your pipeline {noDeadlineItems.length !== 1 ? 'have' : 'has'} no deadline set — add dates to track them here
            </p>
          </div>
          <a href="/dashboard/pipeline" className="flex-shrink-0 flex items-center gap-1 text-xs font-bold whitespace-nowrap" style={{ color: '#4A3800' }}>
            Set deadlines <ArrowRight size={12} />
          </a>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <h2 className="text-4xl font-bold text-[#1A1A1A] leading-tight" style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.02em' }}>Deadlines</h2>
          <p className="text-sm mt-1.5" style={{ color: '#6E6E80' }}>
            {alerts.length > 0
              ? `${needsAttention.length} need${needsAttention.length !== 1 ? '' : 's'} attention · ${alerts.length} tracked total`
              : 'Never miss an application window'}
          </p>
        </div>
        <div className="flex items-center gap-5 flex-shrink-0">
          {atRisk > 0 && (
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#6E6E80' }}>At risk</p>
              <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#DC2626' }}>{fmtAmount(atRisk)}</p>
            </div>
          )}
          <a href="/dashboard/pipeline" className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#1A1A1A] text-[#1A1A1A] text-sm font-semibold bg-white hover:bg-[#1A1A1A] hover:text-white transition-colors whitespace-nowrap">
            Manage Pipeline <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* ── Empty state ── */}
      {alerts.length === 0 && noDeadlineItems.length === 0 && (
        <div className="bg-white border border-[#E8E8EC] rounded-xl p-16 text-center">
          <Calendar className="h-10 w-10 mx-auto mb-4" style={{ color: '#9E9EA8' }} strokeWidth={1.5} />
          <h3 className="text-xl font-bold text-[#1A1A1A] mb-2" style={{ fontFamily: 'var(--font-space-grotesk)' }}>No deadlines to track yet</h3>
          <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: '#6E6E80' }}>
            Add grants to your pipeline from Search, then set deadline dates to see them tracked here.
          </p>
          <a href="/dashboard/search" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-sm font-semibold hover:opacity-80 transition-colors" style={{ background: '#1A1A1A' }}>
            Find Funding <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      )}

      {alerts.length > 0 && (
        <>
          {/* ── Needs Attention (overdue + urgent combined) ── */}
          {needsAttention.length > 0 && (
            <section className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <h3 className="text-lg font-bold text-[#1A1A1A]" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Needs Attention</h3>
                </div>
                <span className="text-[9px] font-bold text-white bg-red-500 px-2 py-0.5 rounded-full uppercase tracking-wide">{needsAttention.length}</span>
                <div className="flex items-center gap-2 ml-2">
                  {overdue.length > 0 && (
                    <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">{overdue.length} overdue</span>
                  )}
                  {urgent.length > 0 && (
                    <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">{urgent.length} this week</span>
                  )}
                </div>
              </div>
              {needsAttention.map(a => <DeadlineCard key={a.item.id} alert={a} onStageChange={handleStageChange} />)}
            </section>
          )}

          {/* ── Coming Up ── */}
          {soon.length > 0 && (
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <CalendarClock className="h-4 w-4 text-[#1E3A5F]" />
                <h3 className="text-lg font-bold text-[#1A1A1A]" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Coming Up</h3>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide" style={{ background: '#BAE6FD', color: '#1E3A5F' }}>{soon.length}</span>
              </div>
              {soon.map(a => <DeadlineCard key={a.item.id} alert={a} onStageChange={handleStageChange} />)}
            </section>
          )}

          {/* ── On Track (collapsible) ── */}
          {ok.length > 0 && (
            <section className="mb-8">
              <button
                onClick={() => setOkExpanded(v => !v)}
                className="flex items-center gap-2 mb-4 group"
              >
                <CalendarCheck className="h-4 w-4 text-[#84CC16]" />
                <h3 className="text-lg font-bold text-[#1A1A1A] group-hover:text-[#4D7C0F] transition-colors" style={{ fontFamily: 'var(--font-space-grotesk)' }}>On Track</h3>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide" style={{ background: '#D9F99D', color: '#4D7C0F' }}>{ok.length}</span>
                {okExpanded
                  ? <ChevronUp size={14} className="text-[#6E6E80] ml-1" />
                  : <ChevronDown size={14} className="text-[#6E6E80] ml-1" />
                }
              </button>
              {okExpanded && ok.map(a => <DeadlineCard key={a.item.id} alert={a} onStageChange={handleStageChange} />)}
              {!okExpanded && (
                <p className="text-xs" style={{ color: '#6E6E80' }}>
                  {ok.length} grant{ok.length !== 1 ? 's' : ''} with plenty of time — click to expand
                </p>
              )}
            </section>
          )}

          {/* ── Summary strip ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-6 border-t border-[#E8E8EC]">
            {[
              { label: 'Overdue',   count: overdue.length, cfg: URGENCY_CONFIG.overdue },
              { label: 'This Week', count: urgent.length,  cfg: URGENCY_CONFIG.urgent  },
              { label: 'Coming Up', count: soon.length,    cfg: URGENCY_CONFIG.soon    },
              { label: 'On Track',  count: ok.length,      cfg: URGENCY_CONFIG.ok      },
            ].map(s => (
              <div key={s.label} className={`border rounded-xl p-4 ${s.cfg.statBorder}`} style={{ backgroundColor: s.cfg.statBg }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'rgba(0,0,0,0.4)' }}>{s.label}</p>
                <p className={`text-2xl font-bold ${s.cfg.statAccent}`} style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.02em' }}>{s.count}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-[#1A1A1A] text-white px-5 py-3.5 rounded-xl shadow-lg text-sm z-50">
          ✓ {toast}
        </div>
      )}
    </div>
  )
}

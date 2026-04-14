'use client'

import { useState, useEffect } from 'react'
import { Clock, AlertTriangle, CalendarClock, CalendarCheck, ExternalLink, ArrowRight, Calendar, AlarmClock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getDeadlineAlerts, formatDeadline, formatRange, PIPELINE_STAGES } from '@/lib/utils'
import type { DeadlineAlert, PipelineItem } from '@/types'

/* ────────────────────────────────────────────
   Urgency configuration — uses the site palette
   ──────────────────────────────────────────── */

const URGENCY_CONFIG = {
  overdue: {
    label: 'Overdue',
    icon: AlertTriangle,
    accent: 'text-[#991B1B]',
    border: 'border-[#FECACA]',
    cardBg: '#FEE2E2',
    badgeBg: 'bg-red-500',
    badgeText: 'text-white',
    statAccent: 'text-red-500',
    statBorder: 'border-l-4 border-l-red-400',
  },
  urgent: {
    label: 'This week',
    icon: AlarmClock,
    accent: 'text-[#4A3800]',
    border: 'border-[#F59E0B]/30',
    cardBg: '#FDE8A3',
    badgeBg: 'bg-amber-500',
    badgeText: 'text-white',
    statAccent: 'text-amber-600',
    statBorder: 'border-l-4 border-l-amber-400',
  },
  soon: {
    label: 'Coming up',
    icon: CalendarClock,
    accent: 'text-[#1E3A5F]',
    border: 'border-[#7DD3FC]/40',
    cardBg: '#BAE6FD',
    badgeBg: 'bg-[#BAE6FD]',
    badgeText: 'text-[#1E3A5F]',
    statAccent: 'text-[#1E3A5F]',
    statBorder: 'border-l-4 border-l-[#7DD3FC]',
  },
  ok: {
    label: 'On track',
    icon: CalendarCheck,
    accent: 'text-[#4D7C0F]',
    border: 'border-[#84CC16]/30',
    cardBg: '#D9F99D',
    badgeBg: 'bg-[#D9F99D]',
    badgeText: 'text-[#4D7C0F]',
    statAccent: 'text-[#4D7C0F]',
    statBorder: 'border-l-4 border-l-[#84CC16]',
  },
  rolling: {
    label: 'Rolling',
    icon: CalendarCheck,
    accent: 'text-[#6E6E80]',
    border: 'border-[#E8E8EC]',
    cardBg: '#F5F5F7',
    badgeBg: 'bg-[#F5F5F7]',
    badgeText: 'text-[#6E6E80]',
    statAccent: 'text-[#6E6E80]',
    statBorder: 'border-l-4 border-l-[#E8E8EC]',
  },
}

const ACTIVE_STAGES = ['identified', 'applying', 'submitted']

/* ────────────────────────────────────────────
   Deadline card
   ──────────────────────────────────────────── */

function DeadlineCard({ alert }: { alert: DeadlineAlert }) {
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
          {/* Badges row */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full ${cfg.badgeBg} ${cfg.badgeText} uppercase tracking-wide`}>
              {isOverdueOrUrgent && <AlarmClock size={9} strokeWidth={2.5} />}
              {alert.urgency === 'overdue' ? 'Overdue' : `${alert.daysUntil}d left`}
            </span>
            {stage && (
              <span className="text-[10px] font-medium text-mid uppercase tracking-widest">{stage.label}</span>
            )}
          </div>
          {/* Grant name */}
          <h3 className="text-base font-bold text-charcoal leading-snug" style={{ fontFamily: "var(--font-space-grotesk)" }}>
            {alert.item.grant_name}
          </h3>
          <p className="text-sm text-mid mt-0.5">{alert.item.funder_name}</p>
          {alert.item.notes && (
            <p className="text-xs text-light mt-2 line-clamp-2">{alert.item.notes}</p>
          )}
        </div>

        {/* Right column: amount + date + link */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {amountStr && (
            <p className="text-lg font-bold" style={{ fontFamily: "var(--font-space-grotesk)", color: "#84CC16" }}>{amountStr}</p>
          )}
          <p className={`flex items-center gap-1 text-sm font-semibold ${cfg.accent}`}>
            <Calendar size={12} strokeWidth={2} />
            {formatDeadline(alert.item.deadline)}
          </p>
          {alert.item.grant_url && (
            <a
              href={alert.item.grant_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-medium transition-colors mt-0.5" style={{ color: "#4D7C0F" }}
            >
              <ExternalLink className="h-3 w-3" />
              Visit
            </a>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {alert.item.application_progress != null && alert.item.application_progress > 0 && (
        <div className="mt-3 pt-3 border-t border-warm/60">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-light uppercase tracking-widest">Writing progress</span>
            <span className="text-xs font-bold text-charcoal">{alert.item.application_progress}%</span>
          </div>
          <div className="h-1.5 bg-black/10 overflow-hidden rounded-full">
            <div
              className={`h-full transition-all rounded-full ${
                alert.item.application_progress >= 75 ? 'bg-[#84CC16]' : 'bg-[#A3E635]'
              }`}
              style={{ width: `${alert.item.application_progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════ */

export default function DeadlinesPage() {
  const [alerts, setAlerts] = useState<DeadlineAlert[]>([])
  const [noDeadlineItems, setNoDeadlineItems] = useState<PipelineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data: { user }, error: userErr } = await supabase.auth.getUser()
        if (userErr || !user) { setLoading(false); return }

        const { data: org } = await supabase
          .from('organisations')
          .select('id')
          .eq('owner_id', user.id)
          .maybeSingle()

        if (!org) { setLoading(false); return }

        const { data: items, error: itemsErr } = await supabase
          .from('pipeline_items')
          .select('*')
          .eq('org_id', org.id)
          .order('created_at', { ascending: false })

        if (itemsErr) {
          setError(`Could not load pipeline items: ${itemsErr.message}`)
          return
        }

        const allItems: PipelineItem[] = items ?? []
        setAlerts(getDeadlineAlerts(allItems))
        setNoDeadlineItems(allItems.filter(i => ACTIVE_STAGES.includes(i.stage) && !i.deadline))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load deadlines')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const overdue = alerts.filter(a => a.urgency === 'overdue')
  const urgent  = alerts.filter(a => a.urgency === 'urgent')
  const soon    = alerts.filter(a => a.urgency === 'soon')
  const ok      = alerts.filter(a => a.urgency === 'ok')
  const totalTracked = alerts.length

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <h2 className="text-4xl font-bold text-charcoal leading-tight" style={{ fontFamily: "var(--font-space-grotesk)", letterSpacing: "-0.02em" }}>Deadlines</h2>
          <p className="text-mid text-sm mt-1.5">
            {totalTracked > 0
              ? `${overdue.length + urgent.length} need${overdue.length + urgent.length !== 1 ? '' : 's'} attention · ${totalTracked} tracked total`
              : 'Never miss an application window'
            }
          </p>
        </div>
        <a
          href="/dashboard/pipeline"
          className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#1A1A1A] text-[#1A1A1A] text-sm font-semibold bg-white hover:bg-[#1A1A1A] hover:text-white transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          Manage Pipeline
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-mid text-sm">
          Loading deadlines…
        </div>
      ) : error ? (
        <div className="bg-white border border-warm/60 rounded-xl p-8 text-center" style={{ boxShadow: '0 2px 12px rgba(26,46,43,0.07)' }}>
          <p className="text-red-500 font-medium mb-2">Something went wrong</p>
          <p className="text-sm text-mid">{error}</p>
        </div>
      ) : alerts.length === 0 && noDeadlineItems.length === 0 ? (
        <div className="bg-white border border-warm/60 rounded-xl p-16 text-center" style={{ boxShadow: '0 2px 12px rgba(26,46,43,0.07)' }}>
          <Calendar className="h-10 w-10 text-light mx-auto mb-4" strokeWidth={1.5} />
          <h3 className="text-xl font-bold text-charcoal mb-2" style={{ fontFamily: "var(--font-space-grotesk)" }}>No deadlines to track yet</h3>
          <p className="text-mid text-sm mb-6 max-w-md mx-auto">
            Add grants to your pipeline from Search, then set deadline dates to see them tracked here.
          </p>
          <a href="/dashboard/search" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-sm font-semibold hover:opacity-80 transition-colors" style={{ background: "#1A1A1A" }}>
            Find Funding
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      ) : (
        <>
          {/* ── Summary stat cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Overdue',   count: overdue.length, cfg: URGENCY_CONFIG.overdue },
              { label: 'This Week', count: urgent.length,  cfg: URGENCY_CONFIG.urgent  },
              { label: 'Coming Up', count: soon.length,    cfg: URGENCY_CONFIG.soon    },
              { label: 'On Track',  count: ok.length,      cfg: URGENCY_CONFIG.ok      },
            ].map(s => (
              <div
                key={s.label}
                className={`bg-white border border-warm/60 rounded-xl p-5 ${s.cfg.statBorder}`}
                style={{ boxShadow: '0 2px 12px rgba(26,46,43,0.07)' }}
              >
                <p className="text-[10px] font-semibold text-light uppercase tracking-widest mb-2">{s.label}</p>
                <p className={`text-3xl font-bold ${s.cfg.statAccent}`} style={{ fontFamily: "var(--font-space-grotesk)", letterSpacing: "-0.02em" }}>{s.count}</p>
                <p className="text-xs text-mid mt-1.5">
                  {s.count === 1 ? 'deadline' : 'deadlines'}
                </p>
              </div>
            ))}
          </div>

          {/* ── Overdue section ── */}
          {overdue.length > 0 && (
            <section className="mb-7">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <h3 className="text-lg font-bold text-red-500" style={{ fontFamily: "var(--font-space-grotesk)" }}>Overdue</h3>
                <span className="text-[9px] font-bold text-white bg-red-500 px-2 py-0.5 rounded-full uppercase tracking-wide">
                  {overdue.length}
                </span>
              </div>
              {overdue.map(a => <DeadlineCard key={a.item.id} alert={a} />)}
            </section>
          )}

          {/* ── Urgent section ── */}
          {urgent.length > 0 && (
            <section className="mb-7">
              <div className="flex items-center gap-2 mb-4">
                <AlarmClock className="h-4 w-4 text-amber-500" />
                <h3 className="text-lg font-bold text-charcoal" style={{ fontFamily: "var(--font-space-grotesk)" }}>Due within 10 days</h3>
                <span className="text-[9px] font-bold text-white bg-amber-500 px-2 py-0.5 rounded-full uppercase tracking-wide">
                  {urgent.length}
                </span>
              </div>
              {urgent.map(a => <DeadlineCard key={a.item.id} alert={a} />)}
            </section>
          )}

          {/* ── Coming up section ── */}
          {soon.length > 0 && (
            <section className="mb-7">
              <div className="flex items-center gap-2 mb-4">
                <CalendarClock className="h-4 w-4 text-mid" />
                <h3 className="text-lg font-bold text-charcoal" style={{ fontFamily: "var(--font-space-grotesk)" }}>Coming up</h3>
                <span className="text-[9px] font-bold text-mid bg-warm px-2 py-0.5 rounded-full uppercase tracking-wide">
                  {soon.length}
                </span>
              </div>
              {soon.map(a => <DeadlineCard key={a.item.id} alert={a} />)}
            </section>
          )}

          {/* ── On track section ── */}
          {ok.length > 0 && (
            <section className="mb-7">
              <div className="flex items-center gap-2 mb-4">
                <CalendarCheck className="h-4 w-4 text-[#84CC16]" />
                <h3 className="text-lg font-bold text-charcoal" style={{ fontFamily: "var(--font-space-grotesk)" }}>On track</h3>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide" style={{ color: "#4D7C0F", background: "#D9F99D" }}>
                  {ok.length}
                </span>
              </div>
              {ok.map(a => <DeadlineCard key={a.item.id} alert={a} />)}
            </section>
          )}

          {/* ── No deadline set ── */}
          {noDeadlineItems.length > 0 && (
            <section className="mb-7">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-bold text-charcoal" style={{ fontFamily: "var(--font-space-grotesk)" }}>No deadline set</h3>
                <span className="text-[9px] font-bold text-mid bg-warm px-2 py-0.5 rounded-full uppercase tracking-wide">
                  {noDeadlineItems.length}
                </span>
              </div>
              <p className="text-xs text-mid mb-4">
                Open these in the pipeline and add a deadline to start tracking them here.
              </p>
              {noDeadlineItems.map(item => {
                const stage = PIPELINE_STAGES.find(s => s.id === item.stage)
                const amountStr = formatRange(item.amount_min, item.amount_max ?? item.amount_requested)
                return (
                  <a
                    key={item.id}
                    href="/dashboard/pipeline"
                    className="bg-white border border-[#E8E8EC] rounded-xl p-4 mb-2 flex items-center justify-between gap-4 hover:bg-[#F5F5F7] transition-colors"
                    style={{ boxShadow: '0 1px 8px rgba(26,46,43,0.05)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-charcoal truncate" style={{ fontFamily: "var(--font-space-grotesk)" }}>{item.grant_name}</p>
                      <p className="text-xs text-mid mt-0.5">{item.funder_name}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {amountStr && <p className="text-sm font-bold" style={{ fontFamily: "var(--font-space-grotesk)", color: "#84CC16" }}>{amountStr}</p>}
                      {stage && (
                        <span className="text-[10px] font-medium text-mid uppercase tracking-widest">{stage.label}</span>
                      )}
                      <span className="flex items-center gap-1 text-xs font-medium whitespace-nowrap" style={{ color: "#4D7C0F" }}>
                        Set deadline
                        <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </a>
                )
              })}
            </section>
          )}
        </>
      )}
    </div>
  )
}

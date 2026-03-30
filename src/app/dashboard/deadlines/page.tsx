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
    accent: 'text-coral',
    border: 'border-l-coral',
    badgeBg: 'bg-red-500',
    badgeText: 'text-white',
    statAccent: 'text-coral',
    statBorder: 'border-l-4 border-l-coral',
  },
  urgent: {
    label: 'This week',
    icon: AlarmClock,
    accent: 'text-amber-600',
    border: 'border-l-amber-400',
    badgeBg: 'bg-amber-500',
    badgeText: 'text-white',
    statAccent: 'text-amber-600',
    statBorder: 'border-l-4 border-l-amber-400',
  },
  soon: {
    label: 'Coming up',
    icon: CalendarClock,
    accent: 'text-mid',
    border: 'border-l-warm',
    badgeBg: 'bg-warm',
    badgeText: 'text-mid',
    statAccent: 'text-mid',
    statBorder: 'border-l-4 border-l-warm',
  },
  ok: {
    label: 'On track',
    icon: CalendarCheck,
    accent: 'text-forest',
    border: 'border-l-forest',
    badgeBg: 'bg-forest/10',
    badgeText: 'text-forest',
    statAccent: 'text-forest',
    statBorder: 'border-l-4 border-l-forest',
  },
  rolling: {
    label: 'Rolling',
    icon: CalendarCheck,
    accent: 'text-mid',
    border: 'border-l-warm',
    badgeBg: 'bg-warm',
    badgeText: 'text-mid',
    statAccent: 'text-mid',
    statBorder: 'border-l-4 border-l-warm',
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
      className={`bg-white border border-warm/60 rounded-xl p-5 mb-3 border-l-4 ${cfg.border}`}
      style={{ boxShadow: '0 2px 12px rgba(26,46,43,0.07)' }}
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
          <h3 className="font-serif text-base font-bold text-charcoal leading-snug">
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
            <p className="font-serif text-lg font-bold text-forest">{amountStr}</p>
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
              className="flex items-center gap-1 text-xs font-medium text-forest/70 hover:text-forest transition-colors mt-0.5"
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
          <div className="h-1.5 bg-warm overflow-hidden rounded-full">
            <div
              className={`h-full transition-all rounded-full ${
                alert.item.application_progress >= 75 ? 'bg-forest' : 'bg-sage'
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
          <h2 className="font-serif text-4xl font-bold text-charcoal leading-tight">Deadlines</h2>
          <p className="text-mid text-sm mt-1.5">
            {totalTracked > 0
              ? `${overdue.length + urgent.length} need${overdue.length + urgent.length !== 1 ? '' : 's'} attention · ${totalTracked} tracked total`
              : 'Never miss an application window'
            }
          </p>
        </div>
        <a
          href="/dashboard/pipeline"
          className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-forest/30 text-forest text-sm font-medium bg-white hover:bg-forest/5 transition-colors whitespace-nowrap self-start sm:self-auto"
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
          <p className="text-coral font-medium mb-2">Something went wrong</p>
          <p className="text-sm text-mid">{error}</p>
        </div>
      ) : alerts.length === 0 && noDeadlineItems.length === 0 ? (
        <div className="bg-white border border-warm/60 rounded-xl p-16 text-center" style={{ boxShadow: '0 2px 12px rgba(26,46,43,0.07)' }}>
          <Calendar className="h-10 w-10 text-light mx-auto mb-4" strokeWidth={1.5} />
          <h3 className="font-serif text-xl font-bold text-charcoal mb-2">No deadlines to track yet</h3>
          <p className="text-mid text-sm mb-6 max-w-md mx-auto">
            Add grants to your pipeline from Search, then set deadline dates to see them tracked here.
          </p>
          <a href="/dashboard/search" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-forest text-white text-sm font-medium hover:opacity-90 transition-colors">
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
                <p className={`font-serif text-3xl font-bold ${s.cfg.statAccent}`}>{s.count}</p>
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
                <AlertTriangle className="h-4 w-4 text-coral" />
                <h3 className="font-serif text-lg font-bold text-coral">Overdue</h3>
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
                <h3 className="font-serif text-lg font-bold text-charcoal">Due within 10 days</h3>
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
                <h3 className="font-serif text-lg font-bold text-charcoal">Coming up</h3>
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
                <CalendarCheck className="h-4 w-4 text-forest" />
                <h3 className="font-serif text-lg font-bold text-charcoal">On track</h3>
                <span className="text-[9px] font-bold text-forest bg-forest/10 px-2 py-0.5 rounded-full uppercase tracking-wide">
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
                <h3 className="font-serif text-lg font-bold text-charcoal">No deadline set</h3>
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
                    className="bg-white border border-warm/60 rounded-xl p-4 mb-2 flex items-center justify-between gap-4 hover:bg-[#faf7f2] transition-colors"
                    style={{ boxShadow: '0 1px 8px rgba(26,46,43,0.05)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-serif text-sm font-bold text-charcoal truncate">{item.grant_name}</p>
                      <p className="text-xs text-mid mt-0.5">{item.funder_name}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {amountStr && <p className="font-serif text-sm font-bold text-forest">{amountStr}</p>}
                      {stage && (
                        <span className="text-[10px] font-medium text-mid uppercase tracking-widest">{stage.label}</span>
                      )}
                      <span className="flex items-center gap-1 text-xs font-medium text-forest whitespace-nowrap">
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

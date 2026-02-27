'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getDeadlineAlerts, formatDeadline, formatRange, PIPELINE_STAGES } from '@/lib/utils'
import type { DeadlineAlert, PipelineItem } from '@/types'

const URGENCY_CONFIG = {
  overdue: { label: 'Overdue',    bg: 'bg-red-50',    text: 'text-red-600',    border: 'border-red-200',    badge: 'bg-red-100 text-red-600'      },
  urgent:  { label: 'This week',  bg: 'bg-amber-50',  text: 'text-amber-600',  border: 'border-amber-200',  badge: 'bg-amber-100 text-amber-600'  },
  soon:    { label: 'Coming up',  bg: 'bg-blue-50',   text: 'text-blue-600',   border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-600'    },
  ok:      { label: 'On track',   bg: 'bg-green-50',  text: 'text-sage',       border: 'border-green-200',  badge: 'bg-green-100 text-sage'       },
  rolling: { label: 'Rolling',    bg: 'bg-gray-50',   text: 'text-gray-500',   border: 'border-gray-200',   badge: 'bg-gray-100 text-gray-500'    },
}

const ACTIVE_STAGES = ['identified', 'researching', 'applying', 'submitted']

function DeadlineCard({ alert }: { alert: DeadlineAlert }) {
  const cfg = URGENCY_CONFIG[alert.urgency]
  const stage = PIPELINE_STAGES.find(s => s.id === alert.item.stage)
  const amountStr = formatRange(alert.item.amount_min, alert.item.amount_max ?? alert.item.amount_requested)

  return (
    <div className={`bg-white rounded-xl p-5 shadow-card mb-3 border-l-4 ${cfg.border}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${cfg.badge}`}>
              {alert.urgency === 'overdue' ? '⚠ Overdue' : `${alert.daysUntil}d left`}
            </span>
            {stage && (
              <span className="text-xs text-mid">{stage.emoji} {stage.label}</span>
            )}
          </div>
          <h3 className="font-display font-bold text-forest text-base leading-snug truncate">
            {alert.item.grant_name}
          </h3>
          <p className="text-sm text-mid mt-0.5">{alert.item.funder_name}</p>
          {alert.item.notes && (
            <p className="text-xs text-light mt-2 line-clamp-2">{alert.item.notes}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <p className="font-display text-xl font-bold text-gold">{amountStr}</p>
          <p className={`text-sm font-semibold ${cfg.text}`}>
            {formatDeadline(alert.item.deadline)}
          </p>
          {alert.item.grant_url && (
            <a href={alert.item.grant_url} target="_blank" rel="noopener noreferrer"
              className="btn-outline btn-sm text-xs">
              Visit website →
            </a>
          )}
        </div>
      </div>
      {alert.item.application_progress != null && (
        <div className="mt-3 pt-3 border-t border-warm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-light">Application progress</span>
            <span className="text-xs font-semibold text-mid">{alert.item.application_progress}%</span>
          </div>
          <div className="h-1.5 bg-warm rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                alert.item.application_progress >= 75 ? 'bg-amber-400' : 'bg-sage'
              }`}
              style={{ width: `${alert.item.application_progress}%` }}
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

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()

        // Get user
        const { data: { user }, error: userErr } = await supabase.auth.getUser()
        if (userErr || !user) { setLoading(false); return }

        // Get org — query directly so we don't depend on throwing lib functions
        const { data: org } = await supabase
          .from('organisations')
          .select('id')
          .eq('owner_id', user.id)
          .maybeSingle()

        if (!org) { setLoading(false); return }

        // Get pipeline items — query directly with try/catch
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

  return (
    <div>
      <div className="flex items-start justify-between mb-7">
        <div>
          <h2 className="font-display text-2xl font-bold text-forest">Deadlines</h2>
          <p className="text-mid text-sm mt-1">Never miss an application window</p>
        </div>
        <a href="/dashboard/pipeline" className="btn-outline btn-sm">
          Manage Pipeline →
        </a>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-mid text-sm">
          Loading deadlines…
        </div>
      ) : error ? (
        <div className="card text-center py-12">
          <p className="text-4xl mb-3">⚠️</p>
          <p className="text-red-500 font-medium mb-2">Something went wrong</p>
          <p className="text-sm text-mid">{error}</p>
        </div>
      ) : alerts.length === 0 && noDeadlineItems.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">📅</div>
          <h3 className="font-display text-lg font-bold text-forest mb-2">No pipeline items yet</h3>
          <p className="text-mid text-sm mb-5">
            Add grants to your pipeline from Search or Deep Search, then set deadlines to track them here.
          </p>
          <a href="/dashboard/search" className="btn-primary inline-block">
            Find Grants →
          </a>
        </div>
      ) : (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-4 gap-3 mb-7">
            {[
              { label: 'Overdue',   count: overdue.length, bg: 'bg-red-50',    text: 'text-red-600',   border: 'border-red-200'   },
              { label: 'This week', count: urgent.length,  bg: 'bg-amber-50',  text: 'text-amber-600', border: 'border-amber-200' },
              { label: 'Coming up', count: soon.length,    bg: 'bg-blue-50',   text: 'text-blue-600',  border: 'border-blue-200'  },
              { label: 'On track',  count: ok.length,      bg: 'bg-green-50',  text: 'text-sage',      border: 'border-green-200' },
            ].map(s => (
              <div key={s.label} className={`rounded-xl p-4 border ${s.bg} ${s.border}`}>
                <p className={`font-display text-3xl font-bold ${s.text}`}>{s.count}</p>
                <p className="text-xs text-mid mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Urgency-grouped deadline cards */}
          {overdue.length > 0 && (
            <section className="mb-6">
              <h3 className="font-display text-sm font-semibold text-red-600 uppercase tracking-wider mb-3">
                ⚠ Overdue — {overdue.length}
              </h3>
              {overdue.map(a => <DeadlineCard key={a.item.id} alert={a} />)}
            </section>
          )}
          {urgent.length > 0 && (
            <section className="mb-6">
              <h3 className="font-display text-sm font-semibold text-amber-600 uppercase tracking-wider mb-3">
                🔥 Due within 10 days — {urgent.length}
              </h3>
              {urgent.map(a => <DeadlineCard key={a.item.id} alert={a} />)}
            </section>
          )}
          {soon.length > 0 && (
            <section className="mb-6">
              <h3 className="font-display text-sm font-semibold text-blue-600 uppercase tracking-wider mb-3">
                📆 Coming up (11–21 days) — {soon.length}
              </h3>
              {soon.map(a => <DeadlineCard key={a.item.id} alert={a} />)}
            </section>
          )}
          {ok.length > 0 && (
            <section className="mb-6">
              <h3 className="font-display text-sm font-semibold text-sage uppercase tracking-wider mb-3">
                ✓ On track (22+ days) — {ok.length}
              </h3>
              {ok.map(a => <DeadlineCard key={a.item.id} alert={a} />)}
            </section>
          )}

          {/* Items with no deadline set */}
          {noDeadlineItems.length > 0 && (
            <section className="mb-6">
              <h3 className="font-display text-sm font-semibold text-light uppercase tracking-wider mb-1">
                📋 No deadline set — {noDeadlineItems.length}
              </h3>
              <p className="text-xs text-light mb-3">
                Click any item in the pipeline and add a deadline date to start tracking it here.
              </p>
              {noDeadlineItems.map(item => {
                const stage = PIPELINE_STAGES.find(s => s.id === item.stage)
                const amountStr = formatRange(item.amount_min, item.amount_max ?? item.amount_requested)
                return (
                  <div key={item.id}
                    className="bg-white rounded-xl p-4 shadow-card mb-2 border border-warm flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-charcoal truncate">{item.grant_name}</p>
                      <p className="text-xs text-mid mt-0.5">{item.funder_name}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <p className="text-sm font-bold text-gold">{amountStr}</p>
                      {stage && <span className="text-xs text-mid">{stage.emoji} {stage.label}</span>}
                      <a href="/dashboard/pipeline"
                        className="text-xs font-medium text-sage hover:underline whitespace-nowrap">
                        Set deadline →
                      </a>
                    </div>
                  </div>
                )
              })}
            </section>
          )}
        </>
      )}
    </div>
  )
}

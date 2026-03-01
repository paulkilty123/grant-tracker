import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDeadlineAlerts, formatCurrency, formatDeadline } from '@/lib/utils'
import { PIPELINE_STAGES } from '@/lib/utils'
import type { PipelineItem } from '@/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // ── Use the server client directly so RLS sees the authenticated session ──
  const { data: org } = user
    ? await supabase.from('organisations').select('*').eq('owner_id', user.id).maybeSingle()
    : { data: null }

  // New users (no org name set) go straight to profile setup
  if (!org?.name) redirect('/dashboard/profile')

  const { data: rawItems } = org
    ? await supabase.from('pipeline_items').select('*').eq('org_id', org.id).order('created_at', { ascending: false })
    : { data: [] }

  const items: PipelineItem[] = rawItems ?? []

  // ── Compute stats inline ───────────────────────────────────────────────
  const active  = items.filter(i => !['won', 'declined'].includes(i.stage))
  const won     = items.filter(i => i.stage === 'won')
  const stats = {
    totalPipelineValue: active.reduce((s, i) => s + (i.amount_max ?? i.amount_requested ?? 0), 0),
    totalWon:           won.reduce((s, i) => s + (i.amount_requested ?? 0), 0),
    wonCount:           won.length,
    activeCount:        active.length,
    submittedCount:     items.filter(i => i.stage === 'submitted').length,
    byStageCounts:      Object.fromEntries(
      ['identified','researching','applying','submitted','won','declined'].map(s => [
        s, items.filter(i => i.stage === s).length,
      ])
    ),
  }

  const alerts = getDeadlineAlerts(items).slice(0, 5)
  const urgentCount = alerts.filter(a => ['urgent','overdue'].includes(a.urgency)).length

  const orgName = org?.name ?? 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div>
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-7">
        <div>
          <h2 className="font-display text-2xl font-bold text-forest">
            {greeting}, {orgName} 🌿
          </h2>
          <p className="text-mid text-sm mt-1">
            {urgentCount} urgent deadline{urgentCount !== 1 ? 's' : ''}
            · {stats.activeCount} active opportunit{stats.activeCount !== 1 ? 'ies' : 'y'}
          </p>
        </div>
        <a href="/dashboard/search" className="btn-gold">Find New Grants</a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-7">
        <div className="stat-card border-sage">
          <p className="text-[10px] font-semibold text-light uppercase tracking-wider mb-2">Total Pipeline</p>
          <p className="font-display text-3xl font-bold text-forest">
            {formatCurrency(stats.totalPipelineValue)}
          </p>
          <p className="text-xs text-mid mt-1.5">{stats.activeCount} active opportunities</p>
        </div>
        <div className="stat-card border-gold">
          <p className="text-[10px] font-semibold text-light uppercase tracking-wider mb-2">Won This Year</p>
          <p className="font-display text-3xl font-bold text-forest">
            {formatCurrency(stats.totalWon)}
          </p>
          <p className="text-xs text-mid mt-1.5">{stats.wonCount} grants secured</p>
        </div>
        <div className="stat-card border-blue-400">
          <p className="text-[10px] font-semibold text-light uppercase tracking-wider mb-2">Submitted</p>
          <p className="font-display text-3xl font-bold text-forest">{stats.submittedCount}</p>
          <p className="text-xs text-mid mt-1.5">awaiting decision</p>
        </div>
        <div className="stat-card border-red-400">
          <p className="text-[10px] font-semibold text-light uppercase tracking-wider mb-2">Urgent Deadlines</p>
          <p className="font-display text-3xl font-bold text-forest">{urgentCount}</p>
          <p className="text-xs text-mid mt-1.5">in the next 10 days</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Pipeline mini */}
        <div className="md:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-base font-semibold text-forest">Pipeline Overview</h3>
            <a href="/dashboard/pipeline" className="text-xs text-sage hover:underline">View full pipeline →</a>
          </div>
          {items.length === 0 ? (
            <div className="text-center py-8 text-light">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-sm mb-3">No opportunities in your pipeline yet</p>
              <a href="/dashboard/search" className="text-sage text-sm hover:underline">Search for grants to add →</a>
            </div>
          ) : (
            <>
              <div className="flex gap-2 mb-4">
                {PIPELINE_STAGES.map(s => (
                  <a
                    key={s.id}
                    href="/dashboard/pipeline"
                    className="flex-1 text-center py-2 px-1 rounded-lg text-xs font-medium transition-colors hover:opacity-80"
                    style={{
                      background: s.id === 'won' ? '#d4f0dc' : s.id === 'declined' ? '#ffe8e8' :
                        s.id === 'identified' ? '#e8f4ff' : s.id === 'researching' ? '#fff4e0' :
                        s.id === 'applying' ? '#f0e8ff' : '#e8ffe8',
                      color: s.id === 'won' ? '#1a3c2e' : s.id === 'declined' ? '#c94a4a' :
                        s.id === 'identified' ? '#3a6bc9' : s.id === 'researching' ? '#c97a3a' :
                        s.id === 'applying' ? '#7a4ac9' : '#4a7c59',
                    }}
                  >
                    <span className="block font-display text-xl font-bold">
                      {stats.byStageCounts[s.id] ?? 0}
                    </span>
                    {s.label}
                  </a>
                ))}
              </div>
              {/* Recent pipeline items */}
              {active.slice(0, 3).length > 0 && (
                <div className="space-y-0 border-t border-warm pt-3">
                  {active.slice(0, 3).map(item => {
                    const stage = PIPELINE_STAGES.find(s => s.id === item.stage)
                    const stageColour = item.stage === 'won' ? '#4a7c59' : item.stage === 'declined' ? '#c94a4a' :
                      item.stage === 'identified' ? '#3a6bc9' : item.stage === 'researching' ? '#c97a3a' :
                      item.stage === 'applying' ? '#7a4ac9' : '#4a7c59'
                    return (
                      <a key={item.id} href="/dashboard/pipeline"
                        className="flex items-center justify-between py-2.5 border-b border-warm last:border-0 hover:bg-warm/30 -mx-1 px-1 rounded transition-colors">
                        <div className="flex-1 min-w-0 mr-3">
                          <p className="text-sm font-medium text-charcoal truncate">{item.grant_name}</p>
                          <p className="text-xs text-mid truncate">{item.funder_name}</p>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: `${stageColour}18`, color: stageColour }}>
                          {stage?.label ?? item.stage}
                        </span>
                      </a>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Deadlines */}
        <div className="card">
          <h3 className="font-display text-base font-semibold text-forest mb-4">Upcoming Deadlines ⚠️</h3>
          {alerts.length === 0 ? (
            <div className="text-center py-6 text-light">
              <p className="text-sm">No upcoming deadlines</p>
              <p className="text-xs mt-1">Open a pipeline item and set a deadline to track it here</p>
            </div>
          ) : (
            <div className="space-y-0">
              {alerts.map(alert => (
                <div key={alert.item.id} className="flex items-center justify-between py-3 border-b border-warm last:border-0">
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-sm font-medium text-charcoal truncate">{alert.item.grant_name}</p>
                    <p className="text-xs text-mid mt-0.5 truncate">{alert.item.funder_name}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${
                    alert.urgency === 'urgent' || alert.urgency === 'overdue'
                      ? 'bg-red-50 text-red-500'
                      : alert.urgency === 'soon'
                      ? 'bg-amber-50 text-amber-600'
                      : 'bg-green-50 text-sage'
                  }`}>
                    {formatDeadline(alert.item.deadline)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4">
            <a href="/dashboard/deadlines" className="btn-outline btn-sm inline-block">
              View all deadlines →
            </a>
          </div>
        </div>
      </div>

    </div>
  )
}

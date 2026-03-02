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

  // ── New grants this week ───────────────────────────────────────────────
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: newGrants, count: newGrantsCount } = await supabase
    .from('scraped_grants')
    .select('id, title, funder, amount_min, amount_max, deadline, external_id', { count: 'exact' })
    .eq('is_active', true)
    .gte('first_seen_at', sevenDaysAgo)
    .order('first_seen_at', { ascending: false })
    .limit(4)

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
        <div className="bg-white rounded-xl shadow-warm border border-warm border-l-4 border-l-sage p-5">
          <p className="text-[10px] font-semibold text-light uppercase tracking-wider mb-2">Total Pipeline</p>
          <p className="font-display text-3xl font-bold text-forest">
            {formatCurrency(stats.totalPipelineValue)}
          </p>
          <p className="text-xs text-mid mt-1.5">{stats.activeCount} active opportunities</p>
        </div>
        <div className="bg-white rounded-xl shadow-warm border border-warm border-l-4 border-l-gold p-5">
          <p className="text-[10px] font-semibold text-light uppercase tracking-wider mb-2">Won This Year</p>
          <p className="font-display text-3xl font-bold text-forest">
            {formatCurrency(stats.totalWon)}
          </p>
          <p className="text-xs text-mid mt-1.5">{stats.wonCount} grants secured</p>
        </div>
        <div className="bg-white rounded-xl shadow-warm border border-warm border-l-4 border-l-mid p-5">
          <p className="text-[10px] font-semibold text-light uppercase tracking-wider mb-2">Submitted</p>
          <p className="font-display text-3xl font-bold text-forest">{stats.submittedCount}</p>
          <p className="text-xs text-mid mt-1.5">awaiting decision</p>
        </div>
        <div className="bg-white rounded-xl shadow-warm border border-warm border-l-4 border-l-red-400 p-5">
          <p className="text-[10px] font-semibold text-light uppercase tracking-wider mb-2">Urgent Deadlines</p>
          <p className="font-display text-3xl font-bold text-forest">{urgentCount}</p>
          <p className="text-xs text-mid mt-1.5">in the next 10 days</p>
        </div>
      </div>

      {/* New This Week */}
      {(newGrantsCount ?? 0) > 0 && (
        <div className="card mb-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-semibold text-forest">New This Week</h3>
              <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                {newGrantsCount} new
              </span>
            </div>
            <a href="/dashboard/search" className="text-xs text-sage hover:underline">Search all grants →</a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(newGrants ?? []).map(g => (
              <a key={g.id} href={`/dashboard/grants/${g.external_id}`}
                className="flex flex-col gap-0.5 p-3 rounded-lg border border-warm bg-cream/50 hover:bg-warm transition-colors group">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-charcoal group-hover:text-forest leading-snug line-clamp-2">{g.title}</p>
                  <span className="bg-emerald-100 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0 mt-0.5">New</span>
                </div>
                <p className="text-xs text-mid truncate">{g.funder ?? 'Unknown funder'}</p>
                {(g.amount_min || g.amount_max) && (
                  <p className="text-xs text-sage font-medium mt-0.5">
                    {g.amount_min && g.amount_max && g.amount_min !== g.amount_max
                      ? `${formatCurrency(g.amount_min)} – ${formatCurrency(g.amount_max)}`
                      : formatCurrency(g.amount_max ?? g.amount_min ?? 0)}
                  </p>
                )}
              </a>
            ))}
          </div>
          {(newGrantsCount ?? 0) > 4 && (
            <p className="text-xs text-mid mt-3 text-center">
              + {(newGrantsCount ?? 0) - 4} more new grants ·{' '}
              <a href="/dashboard/search" className="text-sage hover:underline">search to see all →</a>
            </p>
          )}
        </div>
      )}

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
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
                {[
                  { id: 'identified',  label: 'Identified',  cls: 'bg-warm/60 text-mid' },
                  { id: 'researching', label: 'Researching', cls: 'bg-gold/10 text-gold' },
                  { id: 'applying',    label: 'Applying',    cls: 'bg-sage/10 text-sage' },
                  { id: 'submitted',   label: 'Submitted',   cls: 'bg-forest/10 text-forest' },
                  { id: 'won',         label: 'Won',         cls: 'bg-emerald-50 text-emerald-700' },
                  { id: 'declined',    label: 'Declined',    cls: 'bg-red-50 text-red-500' },
                ].map(s => (
                  <a key={s.id} href="/dashboard/pipeline"
                    className={`rounded-xl p-3 text-center transition-opacity hover:opacity-80 ${s.cls}`}>
                    <span className="block font-display text-2xl font-bold">
                      {stats.byStageCounts[s.id] ?? 0}
                    </span>
                    <span className="text-[10px] font-medium mt-0.5 block">{s.label}</span>
                  </a>
                ))}
              </div>
              {/* Recent pipeline items */}
              {active.slice(0, 3).length > 0 && (
                <div className="border-t border-warm pt-3">
                  {active.slice(0, 3).map(item => {
                    const stage = PIPELINE_STAGES.find(s => s.id === item.stage)
                    const stageCls =
                      item.stage === 'won'         ? 'bg-emerald-50 text-emerald-700' :
                      item.stage === 'declined'    ? 'bg-red-50 text-red-500' :
                      item.stage === 'identified'  ? 'bg-warm/60 text-mid' :
                      item.stage === 'researching' ? 'bg-gold/10 text-gold' :
                      item.stage === 'applying'    ? 'bg-sage/10 text-sage' :
                      'bg-forest/10 text-forest'
                    return (
                      <a key={item.id} href="/dashboard/pipeline"
                        className="flex items-center justify-between py-2.5 border-b border-warm last:border-0 hover:bg-warm/30 -mx-1 px-1 rounded transition-colors">
                        <div className="flex-1 min-w-0 mr-3">
                          <p className="text-sm font-medium text-charcoal truncate">{item.grant_name}</p>
                          <p className="text-xs text-mid truncate">{item.funder_name}</p>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${stageCls}`}>
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

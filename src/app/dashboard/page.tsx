import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDeadlineAlerts, formatCurrency, formatDeadline } from '@/lib/utils'
import { PIPELINE_STAGES } from '@/lib/utils'
import type { PipelineItem } from '@/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: org } = user
    ? await supabase.from('organisations').select('*').eq('owner_id', user.id).maybeSingle()
    : { data: null }

  // No longer hard-block on profile — show dashboard with setup banner instead

  const { data: rawItems } = org
    ? await supabase.from('pipeline_items').select('*').eq('org_id', org.id).order('created_at', { ascending: false })
    : { data: [] }

  const items: PipelineItem[] = rawItems ?? []

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: newGrants, count: newGrantsCount } = await supabase
    .from('scraped_grants')
    .select('id, title, funder, amount_min, amount_max, deadline, external_id', { count: 'exact' })
    .eq('is_active', true)
    .gte('first_seen_at', sevenDaysAgo)
    .order('first_seen_at', { ascending: false })
    .limit(4)

  const active  = items.filter(i => !['won', 'declined'].includes(i.stage))
  const won     = items.filter(i => i.stage === 'won')
  const stats = {
    totalPipelineValue: active.reduce((s, i) => s + (i.amount_max ?? i.amount_requested ?? 0), 0),
    totalWon:           won.reduce((s, i) => s + (i.amount_requested ?? 0), 0),
    wonCount:           won.length,
    activeCount:        active.length,
    submittedCount:     items.filter(i => i.stage === 'submitted').length,
    byStageCounts:      Object.fromEntries(
      ['identified','applying','submitted','won','declined'].map(s => [
        s, items.filter(i => i.stage === s).length,
      ])
    ),
  }

  const alerts = getDeadlineAlerts(items).slice(0, 5)
  const urgentCount = alerts.filter(a => ['urgent','overdue'].includes(a.urgency)).length

  const orgName = org?.name ?? 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const profileIncomplete = !org?.name

  return (
    <div>
      {/* Setup banner — shown until profile is saved */}
      {profileIncomplete && (
        <div className="mb-6 border border-amber-200 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-amber-800">Complete your profile to unlock matched grants</p>
            <p className="text-xs text-amber-700 mt-0.5">Takes about 3 minutes — tells us your sector, location and legal structure so we can filter results for you.</p>
          </div>
          <a href="/dashboard/profile" className="flex-shrink-0 px-4 py-2 bg-amber-600 text-white text-xs font-semibold hover:opacity-90 transition-colors whitespace-nowrap">Set up profile →</a>
        </div>
      )}

      {/* Top bar */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-7">
        <div>
          <h2 className="font-serif text-2xl text-charcoal">
            {greeting}, {profileIncomplete ? 'there' : orgName}
          </h2>
          <p className="text-mid text-sm mt-1">
            {profileIncomplete
              ? 'Welcome to GrantTracker — your funding dashboard'
              : `${urgentCount} urgent deadline${urgentCount !== 1 ? 's' : ''} · ${stats.activeCount} active opportunit${stats.activeCount !== 1 ? 'ies' : 'y'}`
            }
          </p>
        </div>
        <a href="/dashboard/search" className="btn-primary">Find New Grants</a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-7">
        {[
          { label: 'Total Pipeline', value: formatCurrency(stats.totalPipelineValue), sub: `${stats.activeCount} active opportunities`, accent: true },
          { label: 'Won This Year',  value: formatCurrency(stats.totalWon),            sub: `${stats.wonCount} grants secured` },
          { label: 'Submitted',      value: String(stats.submittedCount),              sub: 'awaiting decision' },
          { label: 'Urgent Deadlines', value: String(urgentCount),                     sub: 'in the next 10 days', urgent: urgentCount > 0 },
        ].map(s => (
          <div key={s.label} className="bg-white border border-warm/80 p-5" style={{ boxShadow: '0 2px 16px rgba(26,46,43,0.06)' }}>
            <p className="text-[10px] font-semibold text-mid uppercase tracking-wider mb-2">{s.label}</p>
            <p className={`font-serif text-3xl ${s.accent ? 'text-forest' : s.urgent ? 'text-coral' : 'text-charcoal'}`}>
              {s.value}
            </p>
            <p className="text-xs text-mid mt-1.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* New This Week */}
      {(newGrantsCount ?? 0) > 0 && (
        <div className="card mb-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-base text-charcoal">New This Week</h3>
              <span className="bg-forest/10 text-forest text-[10px] font-bold px-2 py-0.5 uppercase tracking-wide">
                {newGrantsCount} new
              </span>
            </div>
            <a href="/dashboard/search" className="text-xs text-coral hover:underline">Search all grants →</a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(newGrants ?? []).map(g => (
              <a key={g.id} href={`/dashboard/grants/${g.external_id}`}
                className="flex flex-col gap-0.5 p-3 border border-warm bg-[#f5f2ed] hover:bg-warm transition-colors group">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-charcoal group-hover:text-forest leading-snug line-clamp-2">{g.title}</p>
                  <span className="bg-forest/10 text-forest text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-wide flex-shrink-0 mt-0.5">New</span>
                </div>
                <p className="text-xs text-mid truncate">{g.funder ?? 'Unknown funder'}</p>
                {(g.amount_min || g.amount_max) && (
                  <p className="text-xs text-forest font-medium mt-0.5">
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
              <a href="/dashboard/search" className="text-coral hover:underline">search to see all →</a>
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Pipeline mini */}
        <div className="md:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif text-base text-charcoal">Pipeline Overview</h3>
            <a href="/dashboard/pipeline" className="text-xs text-coral hover:underline">View full pipeline →</a>
          </div>
          {items.length === 0 ? (
            <div className="text-center py-10 text-mid">
              <p className="text-2xl mb-3">🔍</p>
              <p className="text-sm font-medium text-charcoal mb-1">No grants tracked yet</p>
              <p className="text-xs mb-4">Find a grant and hit <strong>+ Pipeline</strong> to start tracking your applications here.</p>
              <a href="/dashboard/search" className="inline-flex items-center gap-1.5 px-4 py-2 bg-forest text-white text-xs font-semibold hover:opacity-90 transition-colors">Find your first grant →</a>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
                {[
                  { id: 'identified',  label: 'Identified',  cls: 'bg-[#f5f2ed] text-mid' },
                  { id: 'applying',    label: 'Applying',    cls: 'bg-coral/10 text-coral' },
                  { id: 'submitted',   label: 'Submitted',   cls: 'bg-forest/10 text-forest' },
                  { id: 'won',         label: 'Won',         cls: 'bg-forest/20 text-forest' },
                  { id: 'declined',    label: 'Declined',    cls: 'bg-warm text-mid' },
                ].map(s => (
                  <a key={s.id} href="/dashboard/pipeline"
                    className={`p-3 text-center transition-opacity hover:opacity-80 ${s.cls}`}>
                    <span className="block font-serif text-2xl">
                      {stats.byStageCounts[s.id] ?? 0}
                    </span>
                    <span className="text-[10px] font-medium mt-0.5 block">{s.label}</span>
                  </a>
                ))}
              </div>
              {active.slice(0, 3).length > 0 && (
                <div className="border-t border-warm pt-3">
                  {active.slice(0, 3).map(item => {
                    const stage = PIPELINE_STAGES.find(s => s.id === item.stage)
                    const stageCls =
                      item.stage === 'won'         ? 'bg-forest/15 text-forest' :
                      item.stage === 'declined'    ? 'bg-warm text-mid' :
                      item.stage === 'identified'  ? 'bg-[#f5f2ed] text-mid' :
                      item.stage === 'applying'    ? 'bg-coral/10 text-coral' :
                      'bg-forest/10 text-forest'
                    return (
                      <a key={item.id} href="/dashboard/pipeline"
                        className="flex items-center justify-between py-2.5 border-b border-warm last:border-0 hover:bg-[#f5f2ed] -mx-1 px-1 transition-colors">
                        <div className="flex-1 min-w-0 mr-3">
                          <p className="text-sm font-medium text-charcoal truncate">{item.grant_name}</p>
                          <p className="text-xs text-mid truncate">{item.funder_name}</p>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 flex-shrink-0 ${stageCls}`}>
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
          <h3 className="font-serif text-base text-charcoal mb-4">Upcoming Deadlines</h3>
          {alerts.length === 0 ? (
            <div className="text-center py-6 text-mid">
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
                  <span className={`text-xs font-semibold px-2.5 py-1 whitespace-nowrap flex-shrink-0 ${
                    alert.urgency === 'urgent' || alert.urgency === 'overdue'
                      ? 'bg-coral text-white'
                      : alert.urgency === 'soon'
                      ? 'bg-amber-50 text-amber-600'
                      : 'bg-forest/10 text-forest'
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

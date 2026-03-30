import { createClient } from '@/lib/supabase/server'
import { getDeadlineAlerts, formatCurrency } from '@/lib/utils'
import { PIPELINE_STAGES } from '@/lib/utils'
import type { PipelineItem } from '@/types'
import { Award, TrendingUp, Users, Rocket, GraduationCap, Gift, ArrowRight, CalendarDays, AlarmClock, Clock } from 'lucide-react'

function formatDeadlineDate(deadline: string | null): { month: string; day: string } | null {
  if (!deadline) return null
  const parts = deadline.split('-').map(Number)
  if (parts.length !== 3) return null
  const date = new Date(parts[0], parts[1] - 1, parts[2])
  return {
    month: date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase(),
    day:   String(parts[2]).padStart(2, '0'),
  }
}

// Pick a lucide icon for a grant based on its title keywords
function grantIcon(title: string) {
  const t = title.toLowerCase()
  if (t.includes('invest') || t.includes('loan') || t.includes('finance')) return TrendingUp
  if (t.includes('women') || t.includes('diversity') || t.includes('inclusion')) return Users
  if (t.includes('accelerat') || t.includes('incubat') || t.includes('startup')) return Rocket
  if (t.includes('fellowship') || t.includes('training') || t.includes('education')) return GraduationCap
  if (t.includes('in-kind') || t.includes('pro bono') || t.includes('support')) return Gift
  return Award
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: org } = user
    ? await supabase.from('organisations').select('*').eq('owner_id', user.id).maybeSingle()
    : { data: null }

  const { data: rawItems } = org
    ? await supabase.from('pipeline_items').select('*').eq('org_id', org.id).order('created_at', { ascending: false })
    : { data: [] }

  const items: PipelineItem[] = rawItems ?? []

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: newGrants, count: newGrantsCount } = await supabase
    .from('scraped_grants')
    .select('id, title, funder, description, amount_min, amount_max, deadline, external_id, funding_type', { count: 'exact' })
    .eq('is_active', true)
    .gte('first_seen_at', sevenDaysAgo)
    .order('first_seen_at', { ascending: false })
    .limit(3)

  const active    = items.filter(i => !['won', 'declined'].includes(i.stage))
  const won       = items.filter(i => i.stage === 'won')
  const submitted = items.filter(i => i.stage === 'submitted')

  // Stage pipeline values
  const stageData = [
    { id: 'identified', label: 'Identified', sublabel: 'Leads',    bg: '#B2DFDB', labelCol: '#008080', valCol: '#008080', dot: '#80CBC4' },
    { id: 'applying',   label: 'Applying',   sublabel: 'Active',   bg: '#80CBC4', labelCol: '#00695C', valCol: '#00695C', dot: '#80CBC4' },
    { id: 'submitted',  label: 'Submitted',  sublabel: 'Pending',  bg: '#26A69A', labelCol: '#fff',    valCol: '#E0F2F1', dot: '#26A69A' },
    { id: 'won',        label: 'Won',        sublabel: 'Wins',     bg: '#008080', labelCol: '#fff',    valCol: '#fff',    dot: '#008080' },
    { id: 'declined',   label: 'Declined',   sublabel: 'Archived', bg: '#E8E8EC', labelCol: '#6E6E80', valCol: '#3D3D4E', dot: '#bbb'    },
  ]
  const stageValues = stageData.map(s => ({
    ...s,
    count: items.filter(i => i.stage === s.id).length,
    value: items.filter(i => i.stage === s.id).reduce((sum, i) => sum + (i.amount_max ?? i.amount_requested ?? 0), 0),
  }))
  const totalValue = stageValues.reduce((sum, s) => sum + s.value, 0)

  const stats = {
    totalPipelineValue: active.reduce((s, i) => s + (i.amount_max ?? i.amount_requested ?? 0), 0),
    totalWon:           won.reduce((s, i) => s + (i.amount_requested ?? 0), 0),
    wonCount:           won.length,
    activeCount:        active.length,
    submittedCount:     submitted.length,
  }

  const alerts = getDeadlineAlerts(items).slice(0, 4)
  const urgentCount = alerts.filter(a => ['urgent','overdue'].includes(a.urgency)).length

  // Derive full display name
  const rawName: string =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    (user?.email ?? '')
  const displayName = rawName.includes('@')
    ? (() => { const p = rawName.split('@')[0].replace(/\d+$/, '').replace(/\./g, ' '); return p ? p.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'there' })()
    : (rawName.trim() || 'there')

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const profileIncomplete = !org?.name

  return (
    <div>
      {/* Setup banner */}
      {profileIncomplete && (
        <div className="mb-6 border border-amber-200 bg-amber-50 p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-amber-800">Complete your profile to unlock matched grants</p>
            <p className="text-xs text-amber-700 mt-0.5">Takes about 3 minutes — tells us your sector, location and legal structure.</p>
          </div>
          <a href="/dashboard/profile" className="flex-shrink-0 px-4 py-2 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-colors whitespace-nowrap">Set up profile →</a>
        </div>
      )}

      {/* Greeting */}
      <div className="mb-7">
        <h2 className="font-display text-3xl font-bold text-charcoal mb-1.5">
          {greeting}, {displayName}
        </h2>
        <div className="flex items-center flex-wrap gap-2 text-sm text-mid">
          {!profileIncomplete && (
            <>
              <span>{urgentCount} urgent deadline{urgentCount !== 1 ? 's' : ''}</span>
              <span className="text-warm">•</span>
              <span>{stats.activeCount} active opportunit{stats.activeCount !== 1 ? 'ies' : 'y'}</span>
              {urgentCount > 0 && (
                <>
                  <span className="text-warm">•</span>
                  <a href="/dashboard/deadlines"
                    className="text-coral text-xs font-bold uppercase tracking-wider hover:underline">
                    Action Required
                  </a>
                </>
              )}
            </>
          )}
          {profileIncomplete && <span>Welcome to GrantTracker — your funding dashboard</span>}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {/* Card 1 — Total Pipeline (forest bg) */}
        <div className="p-5 rounded-xl text-white col-span-1" style={{ background: '#008080', boxShadow: '0 4px 20px rgba(0,128,128,0.25)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-3 text-white/60">Total Pipeline</p>
          <p className="font-serif text-3xl font-bold text-white leading-none mb-2">
            {formatCurrency(stats.totalPipelineValue)}
          </p>
          <p className="text-xs text-white/60">{stats.activeCount} active opportunit{stats.activeCount !== 1 ? 'ies' : 'y'}</p>
        </div>

        {/* Card 2 — Won This Year */}
        <div className="p-5 rounded-xl bg-white border border-warm/80" style={{ boxShadow: '0 2px 16px rgba(26,46,43,0.06)' }}>
          <p className="text-[10px] font-semibold text-mid uppercase tracking-wider mb-3">Won This Year</p>
          <p className="font-serif text-3xl text-charcoal leading-none mb-2">{formatCurrency(stats.totalWon)}</p>
          <p className="text-xs text-mid">{stats.wonCount} grant{stats.wonCount !== 1 ? 's' : ''} secured</p>
        </div>

        {/* Card 3 — Submitted */}
        <div className="p-5 rounded-xl bg-white border border-warm/80" style={{ boxShadow: '0 2px 16px rgba(26,46,43,0.06)' }}>
          <p className="text-[10px] font-semibold text-mid uppercase tracking-wider mb-3">Submitted</p>
          <p className="font-serif text-3xl text-charcoal leading-none mb-2">{stats.submittedCount}</p>
          <p className="text-xs text-mid">Application{stats.submittedCount !== 1 ? 's' : ''} awaiting decision</p>
        </div>

        {/* Card 4 — Urgent Deadlines */}
        <div className="p-5 rounded-xl bg-white border border-warm/80" style={{ boxShadow: '0 2px 16px rgba(26,46,43,0.06)' }}>
          <p className="text-[10px] font-semibold text-mid uppercase tracking-wider mb-3">Urgent Deadlines</p>
          <div className="flex items-center gap-3 mb-2">
            <p className={`font-serif text-3xl leading-none ${urgentCount > 0 ? 'text-coral' : 'text-charcoal'}`}>{urgentCount}</p>
            <span className="flex items-center justify-center w-10 h-10 rounded-full" style={{ backgroundColor: '#fde8e4' }}>
              <AlarmClock className="w-5 h-5" style={{ color: '#9b1c1c' }} />
            </span>
          </div>
          <p className="text-xs text-mid">In the next 10 days</p>
        </div>
      </div>

      {/* New This Week */}
      {(newGrantsCount ?? 0) > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-xl font-bold text-charcoal">New This Week</h3>
            <a href="/dashboard/search" className="text-xs font-semibold text-coral uppercase tracking-wider hover:underline">
              View All Opportunities →
            </a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(newGrants ?? []).map(g => {
              const Icon = grantIcon(g.title ?? '')
              const amountStr = g.amount_min || g.amount_max
                ? (g.amount_min && g.amount_max && g.amount_min !== g.amount_max
                    ? `${formatCurrency(g.amount_min)} – ${formatCurrency(g.amount_max)}`
                    : formatCurrency(g.amount_max ?? g.amount_min ?? 0))
                : 'Amount TBC'
              return (
                <a key={g.id}
                  href={`/dashboard/grants/${encodeURIComponent(g.external_id ?? g.id)}`}
                  className="bg-white border border-warm/80 rounded-xl p-5 flex flex-col hover:border-sage/40 hover:-translate-y-0.5 transition-all group"
                  style={{ boxShadow: '0 2px 16px rgba(26,46,43,0.06)' }}>
                  {/* Icon + NEW badge */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-11 h-11 rounded-xl bg-coral/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-coral" />
                    </div>
                    <span className="text-[9px] font-bold text-forest bg-forest/10 px-2 py-0.5 rounded uppercase tracking-wide">New</span>
                  </div>
                  {/* Title + description */}
                  <h4 className="font-display text-base font-bold text-charcoal leading-snug mb-1.5 group-hover:text-forest transition-colors line-clamp-2">
                    {g.title}
                  </h4>
                  <p className="text-xs text-mid leading-relaxed line-clamp-2 mb-4 flex-1">
                    {g.description ?? ''}
                  </p>
                  {/* Amount + Funder */}
                  <div className="border-t border-warm pt-3 flex gap-6">
                    <div>
                      <p className="text-[9px] font-semibold text-mid uppercase tracking-wider mb-0.5">Amount</p>
                      <p className="text-sm font-bold text-charcoal">{amountStr}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-semibold text-mid uppercase tracking-wider mb-0.5">Funder</p>
                      <p className="text-sm font-medium text-charcoal truncate">{g.funder ?? 'Unknown'}</p>
                    </div>
                  </div>
                </a>
              )
            })}
          </div>
        </div>
      )}

      {/* Pipeline + Deadlines */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

        {/* Pipeline Overview */}
        <div className="md:col-span-2 card">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display text-xl font-bold text-charcoal">Pipeline Overview</h3>
            <a href="/dashboard/pipeline" className="text-xs font-semibold text-coral uppercase tracking-wider hover:underline">View Pipeline →</a>
          </div>

          {items.length === 0 ? (
            <div className="text-center py-10 text-mid">
              <p className="text-2xl mb-3">🔍</p>
              <p className="text-sm font-medium text-charcoal mb-1">No grants tracked yet</p>
              <p className="text-xs mb-4">Find a grant and hit <strong>+ Pipeline</strong> to start tracking.</p>
              <a href="/dashboard/search" className="inline-flex items-center gap-1.5 px-4 py-2 bg-forest text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-colors">
                Find your first grant →
              </a>
            </div>
          ) : (
            <>
              {/* Tall proportional bar with rounded corners */}
              <a href="/dashboard/pipeline" className="flex rounded-2xl overflow-hidden mb-6 hover:opacity-95 transition-opacity" style={{ height: 140 }}>
                {stageValues.map(s => {
                  const grow = totalValue > 0 ? (s.value > 0 ? s.value : 0) : 1
                  if (grow === 0) return null
                  return (
                    <div key={s.id} className="flex flex-col justify-center px-4"
                      style={{ flexGrow: grow, flexBasis: 0, background: s.bg, minWidth: 0 }}>
                      <span className="text-[10px] font-bold uppercase tracking-widest mb-2 truncate"
                        style={{ color: s.labelCol }}>
                        {s.label}
                      </span>
                      <span className="font-display font-bold leading-none truncate"
                        style={{ color: s.valCol, fontSize: 'clamp(18px, 2.2vw, 32px)' }}>
                        {formatCurrency(s.value)}
                      </span>
                    </div>
                  )
                })}
              </a>
              {/* Count row — evenly spaced with coloured dot */}
              <div className="grid grid-cols-5">
                {stageValues.map(s => (
                  <div key={s.id} className="flex flex-col items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.dot }} />
                    <span className="text-lg font-bold text-charcoal leading-none">{s.count}</span>
                    <span className="text-[9px] font-semibold text-mid uppercase tracking-widest">{s.sublabel}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Deadlines */}
        <div className="card">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display text-xl font-bold text-charcoal">Deadlines</h3>
            <CalendarDays className="w-4 h-4 text-mid" />
          </div>

          {alerts.length === 0 ? (
            <div className="text-center py-6 text-mid">
              <p className="text-sm">No upcoming deadlines</p>
              <p className="text-xs mt-1">Add deadlines in the pipeline to track them here</p>
            </div>
          ) : (
            <div className="space-y-1">
              {alerts.map(alert => {
                const dateObj = formatDeadlineDate(alert.item.deadline)
                const urgencyBadge =
                  alert.urgency === 'overdue' ? { label: 'Overdue',  cls: 'bg-coral text-white' } :
                  alert.urgency === 'urgent'  ? { label: 'Tomorrow', cls: 'bg-gold/20 text-gold font-bold' } :
                  alert.urgency === 'soon'    ? { label: `In ${alert.daysUntil}d`, cls: 'bg-forest/10 text-forest' } :
                                                { label: `${alert.daysUntil}d`,    cls: 'bg-forest/10 text-forest' }
                const amountStr = alert.item.amount_max ?? alert.item.amount_requested
                  ? formatCurrency(alert.item.amount_max ?? alert.item.amount_requested ?? 0)
                  : null

                return (
                  <a key={alert.item.id} href="/dashboard/deadlines"
                    className="flex items-center gap-3 py-2.5 border-b border-warm last:border-0 hover:bg-[#FAF8F5] -mx-2 px-2 rounded transition-colors">
                    {/* Date column */}
                    {dateObj ? (
                      <div className="flex flex-col items-center flex-shrink-0 w-9 text-center">
                        <span className="text-[9px] font-bold text-mid uppercase">{dateObj.month}</span>
                        <span className="text-lg font-bold text-charcoal leading-none">{dateObj.day}</span>
                      </div>
                    ) : (
                      <div className="w-9 flex-shrink-0" />
                    )}
                    {/* Name + badge */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-charcoal truncate">{alert.item.grant_name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${urgencyBadge.cls}`}>
                          {urgencyBadge.label}
                        </span>
                        {amountStr && <span className="text-[10px] text-mid">{amountStr}</span>}
                      </div>
                    </div>
                  </a>
                )
              })}
            </div>
          )}

          <div className="mt-4">
            <a href="/dashboard/deadlines"
              className="flex items-center justify-center gap-1.5 w-full py-2 text-xs font-semibold text-mid uppercase tracking-wider rounded-lg border border-warm hover:border-charcoal/30 transition-colors">
              Calendar View
              <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        </div>

      </div>
    </div>
  )
}

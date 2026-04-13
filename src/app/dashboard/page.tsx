import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDeadlineAlerts, formatCurrency } from '@/lib/utils'
import { PIPELINE_STAGES } from '@/lib/utils'
import type { PipelineItem, Organisation } from '@/types'
import { Award, TrendingUp, Users, Rocket, GraduationCap, Gift, ArrowRight, CalendarDays, AlarmClock, Clock } from 'lucide-react'
import { computeMatchScore } from '@/lib/matching'
import { normaliseScrapedGrant } from '@/lib/grants-normalise'

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

// Small string hash used to seed the daily shuffle. Deterministic so the same
// (userId, date) pair always produces the same ordering — means the user sees
// the same three cards all day and refreshes don't cause flicker.
function hashSeed(str: string): number {
  let h = 2166136261 >>> 0 // FNV-1a offset basis
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h || 1
}

// Fisher–Yates shuffle seeded with a linear congruential generator. Pure
// function: same input → same output. Never mutates the input array.
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = arr.slice()
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: org } = user
    ? await supabase.from('organisations').select('*').eq('owner_id', user.id).maybeSingle()
    : { data: null }

  // New users without an org profile → send them to set one up
  if (user && !org) {
    redirect('/dashboard/profile')
  }

  const { data: rawItems } = org
    ? await supabase.from('pipeline_items').select('*').eq('org_id', org.id).order('created_at', { ascending: false })
    : { data: [] }

  const items: PipelineItem[] = rawItems ?? []

  // ── Matched Opportunities ────────────────────────────────────────────────
  // Pull a pool of active, non-expired grants from the funder-joined view,
  // score each against the user's org, keep the top 30, then deterministically
  // shuffle using a (user × date) seed so a different slice of 3 surfaces each
  // day. Refreshing the page on the same day shows the same three cards —
  // stability matters more than novelty within a single session.
  const today = new Date().toISOString().split('T')[0]
  const typedOrg = org as Organisation | null
  const matchedGrants: Array<{
    id: string
    title: string
    funder: string
    description: string
    amountStr: string
    searchHref: string
  }> = []
  if (typedOrg) {
    const { data: grantRows } = await supabase
      .from('grants_with_funder')
      .select('*')
      .eq('is_active', true)
      .neq('url_status', 'dead')
      .or(`is_rolling.eq.true,deadline.is.null,deadline.gte.${today}`)
      .order('last_seen_at', { ascending: false })
      .limit(500)

    if (grantRows && grantRows.length > 0) {
      const scored = grantRows
        .map(row => {
          const grant = normaliseScrapedGrant(row as Record<string, unknown>)
          const match = computeMatchScore(grant, typedOrg)
          return { grant, score: match.score }
        })
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 30)

      // Deterministic daily rotation seeded by (userId, YYYY-MM-DD). The top
      // 30 is a stable universe — only the which-3-we-show changes day to day.
      const seed   = hashSeed(`${user?.id ?? 'anon'}-${today}`)
      const picked = seededShuffle(scored, seed).slice(0, 3)

      for (const p of picked) {
        const g = p.grant
        const amountStr = g.amountMin || g.amountMax
          ? (g.amountMin && g.amountMax && g.amountMin !== g.amountMax
              ? `${formatCurrency(g.amountMin)} – ${formatCurrency(g.amountMax)}`
              : formatCurrency(g.amountMax || g.amountMin || 0))
          : 'Amount on application'
        matchedGrants.push({
          id: g.id,
          title: g.title,
          funder: g.funder,
          description: g.description,
          amountStr,
          searchHref: `/dashboard/search?grant=${encodeURIComponent(g.id)}`,
        })
      }
    }
  }
  const matchedCount = matchedGrants.length

  const active    = items.filter(i => !['won', 'declined'].includes(i.stage))
  const won       = items.filter(i => i.stage === 'won')
  const submitted = items.filter(i => i.stage === 'submitted')

  // Stage pipeline values
  const stageData = [
    { id: 'identified', label: 'Identified', sublabel: 'Leads',    bg: '#F4F9E8', labelCol: '#4A7C10', valCol: '#2A5000', dot: '#84CC16' },
    { id: 'applying',   label: 'Applying',   sublabel: 'Active',   bg: '#E8F5E9', labelCol: '#2E7D32', valCol: '#1B5E20', dot: '#66BB6A' },
    { id: 'submitted',  label: 'Submitted',  sublabel: 'Pending',  bg: '#E3F2FD', labelCol: '#1565C0', valCol: '#0D47A1', dot: '#42A5F5' },
    { id: 'won',        label: 'Won',        sublabel: 'Wins',     bg: '#1A1A1A', labelCol: '#84CC16', valCol: '#FFFFFF', dot: '#84CC16' },
    { id: 'declined',   label: 'Declined',   sublabel: 'Archived', bg: '#F5F5F5', labelCol: '#6E6E80', valCol: '#3D3D4E', dot: '#CCCCCC' },
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

  // Derive first name only — surname is intentionally stripped so the greeting
  // reads naturally ("Good morning, Paul" not "Good morning, Paul Kilty").
  const rawName: string =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    (user?.email ?? '')
  const displayName = (() => {
    const cleaned = rawName.includes('@')
      ? rawName.split('@')[0].replace(/\d+$/, '').replace(/\./g, ' ')
      : rawName.trim()
    if (!cleaned) return 'there'
    const first = cleaned.split(/\s+/)[0]
    return first.charAt(0).toUpperCase() + first.slice(1)
  })()

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
          <a href="/dashboard/profile" className="flex-shrink-0 px-4 py-2 text-xs font-semibold rounded-full hover:opacity-90 transition-colors whitespace-nowrap" style={{ background: '#1A1A1A', color: '#FFFFFF', fontFamily: 'var(--font-space-grotesk)' }}>Set up profile →</a>
        </div>
      )}

      {/* Greeting */}
      <div className="mb-7">
        <h2 className="text-3xl font-bold text-charcoal mb-1.5" style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.02em' }}>
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
                    className="text-xs font-bold uppercase tracking-wider hover:underline" style={{ color: '#84CC16' }}>
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
        {/* Card 1 — Total Pipeline (blue) */}
        <div className="p-5 rounded-xl col-span-1" style={{ background: '#BAE6FD', boxShadow: '0 2px 16px rgba(56,189,248,0.18)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: '#1E3A5F', opacity: 0.6 }}>Total Pipeline</p>
          <p className="text-3xl font-bold leading-none mb-2" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#1E3A5F', letterSpacing: '-0.02em' }}>
            {formatCurrency(stats.totalPipelineValue)}
          </p>
          <p className="text-xs" style={{ color: '#1E3A5F', opacity: 0.6 }}>{stats.activeCount} active opportunit{stats.activeCount !== 1 ? 'ies' : 'y'}</p>
        </div>

        {/* Card 2 — Won This Year (lime green) */}
        <div className="p-5 rounded-xl" style={{ background: '#84CC16', boxShadow: '0 2px 16px rgba(132,204,22,0.25)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.70)' }}>Won This Year</p>
          <p className="text-3xl font-bold leading-none mb-2" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#ffffff', letterSpacing: '-0.02em' }}>{formatCurrency(stats.totalWon)}</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.70)' }}>{stats.wonCount} grant{stats.wonCount !== 1 ? 's' : ''} secured</p>
        </div>

        {/* Card 3 — Submitted (amber) */}
        <div className="p-5 rounded-xl" style={{ background: '#FEF9C3', boxShadow: '0 2px 16px rgba(245,158,11,0.10)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: '#5C4A00' }}>Submitted</p>
          <p className="text-3xl font-bold leading-none mb-2" style={{ fontFamily: 'var(--font-space-grotesk)', color: '#4A3800', letterSpacing: '-0.02em' }}>{stats.submittedCount}</p>
          <p className="text-xs" style={{ color: '#5C4A00' }}>Application{stats.submittedCount !== 1 ? 's' : ''} awaiting decision</p>
        </div>

        {/* Card 4 — Urgent Deadlines (grey) */}
        <div className="p-5 rounded-xl" style={{ background: '#EBEBEB', boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: '#6B7280' }}>Urgent Deadlines</p>
          <div className="flex items-center gap-3 mb-2">
            <p className="text-3xl font-bold leading-none" style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.02em', color: urgentCount > 0 ? '#ea580c' : '#374151' }}>{urgentCount}</p>
            <span className="flex items-center justify-center w-10 h-10 rounded-full" style={{ backgroundColor: 'rgba(234,88,12,0.12)' }}>
              <AlarmClock className="w-5 h-5" style={{ color: '#ea580c' }} />
            </span>
          </div>
          <p className="text-xs" style={{ color: '#6B7280' }}>In the next 10 days</p>
        </div>
      </div>

      {/* Matched Opportunities — deterministic daily rotation over top 30 matches */}
      {matchedCount > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Matched Opportunities</h3>
            <a href="/dashboard/search" className="text-xs font-semibold uppercase tracking-wider hover:underline" style={{ color: "#84CC16" }}>
              View All Opportunities →
            </a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {matchedGrants.map(g => {
              const Icon = grantIcon(g.title)
              return (
                <a key={g.id}
                  href={g.searchHref}
                  className="bg-white border border-warm/80 rounded-xl p-5 flex flex-col hover:border-sage/40 hover:-translate-y-0.5 transition-all group"
                  style={{ boxShadow: '0 2px 16px rgba(26,46,43,0.06)' }}>
                  {/* Icon + Matched badge */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(132,204,22,0.12)' }}>
                      <Icon className="w-5 h-5" style={{ color: '#84CC16' }} />
                    </div>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide" style={{ background: 'rgba(132,204,22,0.15)', color: '#4A7C10' }}>Matched</span>
                  </div>
                  {/* Title + description */}
                  <h4 className="text-base font-bold text-charcoal leading-snug mb-1.5 transition-colors line-clamp-2" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                    {g.title}
                  </h4>
                  <p className="text-xs text-mid leading-relaxed line-clamp-2 mb-4 flex-1">
                    {g.description}
                  </p>
                  {/* Amount + Funder */}
                  <div className="border-t border-warm pt-3 flex gap-6">
                    <div>
                      <p className="text-[9px] font-semibold text-mid uppercase tracking-wider mb-0.5">Amount</p>
                      <p className="text-sm font-bold text-charcoal">{g.amountStr}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-semibold text-mid uppercase tracking-wider mb-0.5">Funder</p>
                      <p className="text-sm font-medium text-charcoal truncate">{g.funder}</p>
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
            <h3 className="text-xl font-bold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Pipeline Overview</h3>
            <a href="/dashboard/pipeline" className="text-xs font-semibold uppercase tracking-wider hover:underline" style={{ color: '#84CC16' }}>View Pipeline →</a>
          </div>

          {items.length === 0 ? (
            <div className="text-center py-10 text-mid">
              <p className="text-2xl mb-3">🔍</p>
              <p className="text-sm font-medium text-charcoal mb-1">No grants tracked yet</p>
              <p className="text-xs mb-4">Find a grant and hit <strong>+ Pipeline</strong> to start tracking.</p>
              <a href="/dashboard/search" className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full hover:opacity-90 transition-colors" style={{ background: '#84CC16', color: '#1A1A1A', fontFamily: 'var(--font-space-grotesk)' }}>
                Find your first grant →
              </a>
            </div>
          ) : (
            <>
              {/* Pipeline bar — semi-proportional layout.
                  Every non-zero stage gets a guaranteed base width (flex-basis)
                  so its £ amount stays legible even when one stage dwarfs the
                  others. Any extra space is distributed proportionally to each
                  stage's value via flex-grow. Without this, a £960k Identified
                  column squeezes everything else into "£…" placeholders. */}
              <a href="/dashboard/pipeline" className="flex rounded-2xl overflow-hidden mb-6 hover:opacity-95 transition-opacity" style={{ height: 140 }}>
                {stageValues.map(s => {
                  const grow = totalValue > 0 ? (s.value > 0 ? s.value : 0) : 1
                  if (grow === 0) return null
                  return (
                    <div key={s.id} className="flex flex-col justify-center px-4"
                      style={{ flexGrow: grow, flexShrink: 0, flexBasis: 110, background: s.bg, minWidth: 110 }}>
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
            <h3 className="text-xl font-bold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Deadlines</h3>
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
                  alert.urgency === 'overdue' ? { label: 'Overdue',  cls: 'bg-red-500 text-white' } :
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
              className="flex items-center justify-center gap-1.5 w-full py-2 text-xs font-semibold uppercase tracking-wider rounded-full border transition-colors" style={{ color: '#525252', borderColor: '#E0E0E0', fontFamily: 'var(--font-space-grotesk)' }}>
              Calendar View
              <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        </div>

      </div>
    </div>
  )
}

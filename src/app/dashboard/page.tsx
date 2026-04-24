import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDeadlineAlerts, formatCurrency } from '@/lib/utils'
import type { PipelineItem, Organisation } from '@/types'
import { Award, TrendingUp, Users, Rocket, GraduationCap, Gift, ArrowRight, CalendarDays, Check, Sparkles, Bookmark, ListChecks, UserPlus } from 'lucide-react'
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

// Deterministic daily rotation — same (userId, date) seed gives the same 3
// cards all day so refreshes don't flicker. FNV-1a hash + LCG shuffle.
function hashSeed(str: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h || 1
}
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
  // Layout gate guarantees user + completed onboarding before we get here —
  // no null checks needed for redirect paths.

  const { data: org } = user
    ? await supabase.from('organisations').select('*').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1).then(r => ({ data: r.data?.[0] ?? null }))
    : { data: null }
  const typedOrg = org as Organisation | null

  const { data: rawItems } = typedOrg
    ? await supabase.from('pipeline_items').select('*').eq('org_id', typedOrg.id).order('created_at', { ascending: false })
    : { data: [] }
  const items: PipelineItem[] = rawItems ?? []

  // Saved-grant count feeds the empty/populated split alongside pipeline count.
  // A user who's saved grants but not yet moved any to pipeline still counts
  // as "active" — they've engaged with matches.
  let savedCount = 0
  if (typedOrg) {
    const { count } = await supabase
      .from('grant_interactions')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', typedOrg.id)
      .eq('action', 'saved')
    savedCount = count ?? 0
  }

  // ── Matched Opportunities (used in both states) ──────────────────────────
  const today = new Date().toISOString().split('T')[0]
  type ScoredGrant = { grant: ReturnType<typeof normaliseScrapedGrant>; score: number; lastSeenAt: string | null }
  let scoredAll: ScoredGrant[] = []
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
      scoredAll = grantRows
        .map(row => {
          const g = normaliseScrapedGrant(row as Record<string, unknown>)
          const score = computeMatchScore(g, typedOrg).score
          if (score <= 0) return null
          return {
            grant: g,
            score,
            lastSeenAt: (row as Record<string, unknown>).last_seen_at as string | null,
          }
        })
        .filter((x): x is ScoredGrant => x !== null)
        .sort((a, b) => b.score - a.score)
    }
  }
  const totalMatchCount = scoredAll.length

  // Daily rotation: take top-30 universe, seeded-shuffle, slice 3.
  const topPool = scoredAll.slice(0, 30)
  const seed    = hashSeed(`${user?.id ?? 'anon'}-${today}`)
  const picked  = seededShuffle(topPool, seed).slice(0, 3)
  const matchedGrants = picked.map(p => {
    const g = p.grant
    const amountStr = g.amountMin || g.amountMax
      ? (g.amountMin && g.amountMax && g.amountMin !== g.amountMax
          ? `${formatCurrency(g.amountMin)} – ${formatCurrency(g.amountMax)}`
          : formatCurrency(g.amountMax || g.amountMin || 0))
      : 'Amount on application'
    return {
      id: g.id,
      title: g.title,
      funder: g.funder,
      description: g.description,
      amountStr,
      fundingType: g.fundingType ?? 'grant',
      scorePct: Math.round(p.score),
      searchHref: `/dashboard/search?grant=${encodeURIComponent(g.id)}`,
    }
  })

  // ── Week-scoped counters (for populated-state subtitle) ──────────────────
  // Monday-midnight local — week runs Mon→Sun. "New matches since Monday"
  // uses last_seen_at ≥ monday as a proxy for "recently surfaced".
  const now = new Date()
  const dow = now.getDay() // 0=Sun..6=Sat
  const daysFromMonday = (dow + 6) % 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - daysFromMonday)
  monday.setHours(0, 0, 0, 0)
  const mondayISO = monday.toISOString()

  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)

  const deadlinesThisWeek = items.filter(i => {
    if (!i.deadline) return false
    const d = new Date(i.deadline)
    return d >= now && d <= sunday
  }).length
  const inProgressCount = items.filter(i => ['applying', 'submitted'].includes(i.stage)).length
  const newMatchesThisWeek = scoredAll.filter(x => x.lastSeenAt && x.lastSeenAt >= mondayISO).length

  // ── Pipeline tonal ladder — spec §1.4 + §8.2 ────────────────────────────
  // Identified cream → Applying pale green → Submitted mid green → Won
  // saturated green (cream text) → Declined soft coral (deep coral text).
  // Break to coral at Declined is intentional per spec: not the next rung
  // up, a different kind of outcome.
  const stageData = [
    { id: 'identified', label: 'Identified', bg: '#F5F1E8', labelCol: '#5F5E5A',            valCol: '#2C2C2A',            countCol: '#5F5E5A' },
    { id: 'applying',   label: 'Applying',   bg: '#EAF3DE', labelCol: '#3F6814',            valCol: '#173404',            countCol: '#3F6814' },
    { id: 'submitted',  label: 'Submitted',  bg: '#C0DD97', labelCol: '#3F6814',            valCol: '#173404',            countCol: '#3F6814' },
    { id: 'won',        label: 'Won',        bg: '#639922', labelCol: 'rgba(250,247,242,0.78)', valCol: '#FAF7F2',        countCol: 'rgba(250,247,242,0.78)' },
    { id: 'declined',   label: 'Declined',   bg: '#FAECE7', labelCol: '#993C1D',            valCol: '#993C1D',            countCol: '#993C1D' },
  ]
  const stageValues = stageData.map(s => ({
    ...s,
    count: items.filter(i => i.stage === s.id).length,
    value: items.filter(i => i.stage === s.id).reduce((sum, i) => sum + (i.amount_max ?? i.amount_requested ?? 0), 0),
  }))
  const totalValue = stageValues.reduce((sum, s) => sum + s.value, 0)

  // ── Upcoming deadlines (pipeline + catalogue, next 3) ───────────────
  type DlRow = { id: string; name: string; deadline: string; daysUntil: number; amountStr: string | null; href: string }
  function parseDaysUntil(dl: string): number {
    const parts = dl.split('-').map(Number)
    const d = new Date(parts[0], parts[1] - 1, parts[2])
    return Math.round((d.getTime() - Date.now()) / 86400000)
  }

  const pipelineRows: DlRow[] = items
    .filter(i => !!i.deadline)
    .map(i => ({
      id: `pl-${i.id}`,
      name: i.grant_name,
      deadline: i.deadline as string,
      daysUntil: parseDaysUntil(i.deadline as string),
      amountStr: (i.amount_max ?? i.amount_requested)
        ? formatCurrency(i.amount_max ?? i.amount_requested ?? 0)
        : null,
      href: '/dashboard/deadlines',
    }))
    .sort((a, b) => a.daysUntil - b.daysUntil)

  const catalogueRows: DlRow[] = scoredAll
    .filter(x => {
      if (!x.grant.deadline) return false
      const du = parseDaysUntil(x.grant.deadline)
      return du >= 0
    })
    .filter(x => !pipelineRows.some(p => p.name.toLowerCase() === x.grant.title.toLowerCase()))
    .slice(0, 6)
    .map(x => {
      const g = x.grant
      const du = parseDaysUntil(g.deadline as string)
      const amt = g.amountMin || g.amountMax
        ? formatCurrency(g.amountMax || g.amountMin || 0)
        : null
      return {
        id: `cat-${g.id}`,
        name: g.title,
        deadline: g.deadline as string,
        daysUntil: du,
        amountStr: amt,
        href: `/dashboard/search?grant=${encodeURIComponent(g.id)}`,
      }
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)

  const alerts: DlRow[] = [...pipelineRows, ...catalogueRows]
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 3)

  // ── Greeting ─────────────────────────────────────────────────────────────
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
  const hour = now.getHours()
  const greetingTime = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  // State split: zero pipeline AND zero saved = empty; anything else = populated.
  const hasActivity = items.length > 0 || savedCount > 0

  // ══════════════════════════════════════════════════════════════════════════
  // EMPTY STATE (Day 1) — welcome banner, 5-item checklist, preview tiles
  // ══════════════════════════════════════════════════════════════════════════
  if (!hasActivity) {
    return (
      <div>
        {/* Greeting */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-charcoal mb-1.5" style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.02em' }}>
            Welcome to Grant Tracker, {displayName}.
          </h2>
          <p className="text-sm text-mid">
            Your profile's complete — time to find some funding.
          </p>
        </div>

        {/* Welcome banner — pale-green → neutral gradient */}
        <div
          className="relative overflow-hidden rounded-xl p-8 md:p-10 mb-8 border"
          style={{
            background: 'linear-gradient(135deg, #EAF3DE 0%, #F1F8E4 50%, #FAFAF7 100%)',
            borderColor: '#E4E2DA',
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <span
              className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-md"
              style={{ background: 'rgba(132,204,22,0.20)', color: '#3F6814' }}
            >
              <Sparkles className="w-3 h-3" />
              {totalMatchCount} matches ready
            </span>
          </div>
          <h3 className="text-2xl md:text-3xl font-bold text-charcoal leading-tight mb-2" style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.02em' }}>
            We've found funding that fits your profile.
          </h3>
          <p className="text-sm md:text-base text-mid mb-6 max-w-2xl leading-relaxed">
            Browse your matches, save the ones worth a closer look, and move them into your pipeline when you're ready to apply. Everything you do here feeds the matching — the more you engage, the sharper it gets.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="/dashboard/search"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
              style={{ background: '#8ECB3C', color: '#173404', fontFamily: 'var(--font-space-grotesk)', boxShadow: '0 2px 8px rgba(132,204,22,0.25)' }}
            >
              See my matches
              <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href="/dashboard/search?tour=1"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg border hover:bg-white/60 transition-colors"
              style={{ borderColor: '#2C2C2A', color: '#2C2C2A', background: 'rgba(255,255,255,0.40)', fontFamily: 'var(--font-space-grotesk)' }}
            >
              Give me a tour
            </a>
          </div>
        </div>

        {/* Getting started — 5 items */}
        <div className="mb-8">
          <h3 className="text-xl font-bold text-charcoal mb-4" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Getting started
          </h3>
          <div className="bg-white rounded-xl border border-warm overflow-hidden" style={{ boxShadow: '0 2px 16px rgba(26,46,43,0.04)' }}>
            {/* 1. Complete profile — done */}
            <div className="flex items-center gap-4 p-5 border-b border-warm">
              <div className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#8ECB3C' }}>
                <Check className="w-5 h-5 text-white" strokeWidth={3} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-charcoal line-through decoration-charcoal/30" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  Complete your profile
                </p>
                <p className="text-xs text-mid mt-0.5">Nice work — matches are running against your org now.</p>
              </div>
            </div>

            {/* 2. Browse first matches — next (pale-green row + green ring on number) */}
            <div className="flex items-center gap-4 p-5 border-b border-warm" style={{ background: '#EAF3DE' }}>
              <div
                className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                style={{
                  background: '#FFFFFF',
                  border: '2px solid #8ECB3C',
                  color: '#3F6814',
                  fontFamily: 'var(--font-space-grotesk)',
                  boxShadow: '0 0 0 4px rgba(142,203,60,0.15)',
                }}
              >
                2
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  Browse your first matches
                </p>
                <p className="text-xs text-mid mt-0.5">{totalMatchCount} opportunities scored against your profile.</p>
              </div>
              <a
                href="/dashboard/search"
                className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity"
                style={{ background: '#173404', color: '#FAF7F2', fontFamily: 'var(--font-space-grotesk)' }}
              >
                Start
                <ArrowRight className="w-3 h-3" />
              </a>
            </div>

            {/* 3. Save first opportunity — todo */}
            <div className="flex items-center gap-4 p-5 border-b border-warm">
              <div
                className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ background: '#FFFFFF', border: '1.5px solid #E4E2DA', color: '#9A978E', fontFamily: 'var(--font-space-grotesk)' }}
              >
                3
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  Save your first opportunity
                </p>
                <p className="text-xs text-mid mt-0.5">Bookmark anything worth a closer look.</p>
              </div>
              <Bookmark className="w-4 h-4 text-mid flex-shrink-0" />
            </div>

            {/* 4. Add to pipeline — todo */}
            <div className="flex items-center gap-4 p-5 border-b border-warm">
              <div
                className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ background: '#FFFFFF', border: '1.5px solid #E4E2DA', color: '#9A978E', fontFamily: 'var(--font-space-grotesk)' }}
              >
                4
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  Add your first grant to the pipeline
                </p>
                <p className="text-xs text-mid mt-0.5">Track deadlines and application progress in one place.</p>
              </div>
              <ListChecks className="w-4 h-4 text-mid flex-shrink-0" />
            </div>

            {/* 5. Enrich profile — todo + Later skip */}
            <div className="flex items-center gap-4 p-5">
              <div
                className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ background: '#FFFFFF', border: '1.5px solid #E4E2DA', color: '#9A978E', fontFamily: 'var(--font-space-grotesk)' }}
              >
                5
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  Enrich your profile for sharper matches
                </p>
                <p className="text-xs text-mid mt-0.5">
                  Add beneficiaries, past grants, and funding priorities.{' '}
                  <a href="/dashboard/profile" className="underline underline-offset-2 hover:text-charcoal">Later</a>
                </p>
              </div>
              <UserPlus className="w-4 h-4 text-mid flex-shrink-0" />
            </div>
          </div>
        </div>

        {/* "What you'll see here soon" — preview tiles */}
        <div className="rounded-xl p-6 md:p-8 border" style={{ background: '#FAF7F2', borderColor: '#E4E2DA' }}>
          <h3 className="text-sm font-bold uppercase tracking-wider text-mid mb-5" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            What you'll see here soon
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ opacity: 0.75 }}>
            {/* Upcoming deadlines */}
            <div className="bg-white rounded-lg p-5 border border-warm">
              <div className="flex items-center gap-2 mb-3">
                <CalendarDays className="w-4 h-4" style={{ color: '#5F5E5A' }} />
                <p className="text-xs font-semibold uppercase tracking-wider text-mid">Upcoming deadlines</p>
              </div>
              <div className="space-y-2">
                <div className="h-3 rounded bg-warm/60 w-3/4" />
                <div className="h-3 rounded bg-warm/40 w-1/2" />
                <div className="h-3 rounded bg-warm/40 w-2/3" />
              </div>
            </div>
            {/* Pipeline at a glance */}
            <div className="bg-white rounded-lg p-5 border border-warm">
              <div className="flex items-center gap-2 mb-3">
                <ListChecks className="w-4 h-4" style={{ color: '#5F5E5A' }} />
                <p className="text-xs font-semibold uppercase tracking-wider text-mid">Pipeline at a glance</p>
              </div>
              <div className="flex gap-1 h-10">
                <div className="flex-1 rounded" style={{ background: '#EAF3DE' }} />
                <div className="flex-1 rounded" style={{ background: '#F1F7E4' }} />
                <div className="flex-1 rounded" style={{ background: '#E6F1FB' }} />
              </div>
            </div>
            {/* New matches */}
            <div className="bg-white rounded-lg p-5 border border-warm">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4" style={{ color: '#5F5E5A' }} />
                <p className="text-xs font-semibold uppercase tracking-wider text-mid">New matches</p>
              </div>
              <div className="space-y-2">
                <div className="h-3 rounded bg-warm/60 w-full" />
                <div className="h-3 rounded bg-warm/40 w-4/5" />
                <div className="h-3 rounded bg-warm/40 w-3/5" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // POPULATED STATE (Week 2+) — dynamic subtitle, deadlines, pipeline, matches
  // ══════════════════════════════════════════════════════════════════════════
  const subtitleParts: string[] = []
  if (deadlinesThisWeek > 0) subtitleParts.push(`${deadlinesThisWeek} deadline${deadlinesThisWeek === 1 ? '' : 's'} this week`)
  if (inProgressCount > 0)   subtitleParts.push(`${inProgressCount} application${inProgressCount === 1 ? '' : 's'} in progress`)
  if (newMatchesThisWeek > 0) subtitleParts.push(`${newMatchesThisWeek} new match${newMatchesThisWeek === 1 ? '' : 'es'} since Monday`)
  if (subtitleParts.length === 0) subtitleParts.push(`${totalMatchCount} opportunities waiting for you`)

  return (
    <div>
      {/* Greeting */}
      <div className="mb-7">
        <h2 className="text-3xl font-bold text-charcoal mb-1.5" style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.02em' }}>
          {greetingTime}, {displayName}.
        </h2>
        <p className="text-sm text-mid">
          {subtitleParts.join(' · ')}
        </p>
      </div>

      {/* This week's deadlines + Pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">

        {/* Pipeline Overview */}
        <div className="md:col-span-2 card rounded-xl">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-xl font-bold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Pipeline</h3>
            <a href="/dashboard/pipeline" className="text-xs font-semibold hover:underline" style={{ color: '#8ECB3C', fontFamily: 'var(--font-space-grotesk)' }}>View pipeline →</a>
          </div>

          {/* Tonal ladder — each tile carries label + amount + count in one.
              The earlier separate count row had mismatched vocab (Leads /
              Pending / Archived) that didn't map to the stage names;
              consolidating inside the tile also matches the spec §7.2
              Pipeline card pattern and mirrors the Pipeline full-page view. */}
          <a href="/dashboard/pipeline" className="flex rounded-xl overflow-hidden hover:opacity-95 transition-opacity" style={{ height: 210 }}>
            {stageValues.map(s => {
              const maxVal = Math.max(...stageValues.map(x => x.value).filter(v => v > 0), 100000)
              const FLOOR = maxVal / 12
              const grow = Math.max(s.value, FLOOR)
              return (
                <div key={s.id} className="flex flex-col justify-between px-4 py-3.5"
                  style={{ flexGrow: grow, flexShrink: 0, flexBasis: 110, background: s.bg, minWidth: 110, overflow: 'hidden' }}>
                  <span className="text-[10px] font-bold uppercase tracking-widest truncate"
                    style={{ color: s.labelCol }}>
                    {s.label}
                  </span>
                  <div>
                    <span className="block font-display font-bold leading-none truncate"
                      style={{ color: s.valCol, fontSize: 'clamp(18px, 2.2vw, 30px)' }}>
                      {s.value > 0 ? formatCurrency(s.value) : (s.count > 0 ? s.count : '—')}
                    </span>
                    <span className="block text-[10px] font-semibold mt-1.5 truncate"
                      style={{ color: s.countCol }}>
                      {s.count > 0 ? (s.count === 1 ? '1 opportunity' : s.count + ' opportunities') : 'None yet'}
                    </span>
                  </div>
                </div>
              )
            })}
          </a>
        </div>

        {/* This week's deadlines */}
        <div className="card rounded-xl">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-xl font-bold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Upcoming deadlines</h3>
          </div>

          {alerts.length === 0 ? (
            <div className="text-center py-6 text-mid">
              <p className="text-sm">No upcoming deadlines</p>
              <p className="text-xs mt-1">Save a grant to start tracking</p>
            </div>
          ) : (
            <div className="space-y-1">
              {alerts.map(row => {
                const dateObj = formatDeadlineDate(row.deadline)
                const d = row.daysUntil
                const pillLabel = d < 0 ? 'Overdue' : d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `${d}d`
                const pillCls   = d <= 7
                  ? 'bg-[#FAECE7] text-[#993C1D]'
                  : 'bg-transparent text-[#5F5E5A] border border-[rgba(23,52,4,0.20)]'
                return (
                  <a key={row.id} href={row.href}
                    className="flex items-center gap-3 py-2.5 border-b border-warm last:border-0 hover:bg-[#FAFAF7] -mx-2 px-2 rounded-md transition-colors">
                    {dateObj ? (
                      <div className="flex flex-col items-center flex-shrink-0 w-9 text-center">
                        <span className="text-[9px] font-bold text-mid uppercase">{dateObj.month}</span>
                        <span className="text-lg font-bold text-charcoal leading-none">{dateObj.day}</span>
                      </div>
                    ) : (
                      <div className="w-9 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-charcoal truncate">{row.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide ${pillCls}`}>
                          {pillLabel}
                        </span>
                        {row.amountStr && <span className="text-[10px] text-mid">{row.amountStr}</span>}
                      </div>
                    </div>
                  </a>
                )
              })}
            </div>
          )}

          <div className="mt-4 pt-3" style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
            <a href="/dashboard/deadlines"
              className="text-xs font-semibold hover:underline" style={{ color: '#8ECB3C', fontFamily: 'var(--font-space-grotesk)' }}>
              View all deadlines →
            </a>
          </div>
        </div>
      </div>

      {/* New matches */}
      {matchedGrants.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>New matches</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {matchedGrants.map(g => {
              const typeConfig: Record<string, { label: string; bg: string; fg: string }> = {
                grant:      { label: 'Grant',      bg: '#F1F7E4', fg: '#3B6D11' },
                programme:  { label: 'Programme',  bg: '#FAECE7', fg: '#993C1D' },
                investment: { label: 'Investment', bg: '#E6F1FB', fg: '#0C447C' },
                in_kind:    { label: 'In-Kind',    bg: '#FAEEDA', fg: '#854F0B' },
              }
              const t = typeConfig[g.fundingType] ?? typeConfig.grant
              return (
                <a key={g.id}
                  href={g.searchHref}
                  className="bg-white rounded-xl p-5 flex flex-col hover:-translate-y-0.5 transition-all group"
                  style={{ border: '1px solid rgba(23,52,4,0.08)', boxShadow: '0 2px 10px rgba(26,46,43,0.04)' }}>
                  <div className="mb-3">
                    <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider"
                      style={{ background: t.bg, color: t.fg }}>
                      {t.label}
                    </span>
                  </div>
                  {/* Name */}
                  <h4 className="text-[15px] font-semibold text-charcoal leading-snug mb-0.5 line-clamp-2" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                    {g.title}
                  </h4>
                  {/* Funder — always shown */}
                  <p className="text-xs mb-3 truncate" style={{ color: '#5F5E5A' }}>{g.funder || '\u00a0'}</p>
                  {/* Amount */}
                  <p className="text-[13px] font-semibold text-charcoal mb-3" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{g.amountStr}</p>
                  {/* Match score + bar */}
                  <div className="mt-auto pt-3" style={{ borderTop: '1px solid rgba(23,52,4,0.06)' }}>
                    {(() => {
                      const isStrong = g.scorePct >= 85
                      const isPartial = g.scorePct >= 60
                      const barColour = isStrong ? '#8ECB3C' : isPartial ? '#5A9080' : '#9A9A9A'
                      const pctColour = isStrong ? '#3F6814' : isPartial ? '#2D6B5E' : '#5F5E5A'
                      const label = isStrong ? 'Strong match' : isPartial ? 'Good match' : 'Partial match'
                      return (
                        <>
                          <div className="flex items-baseline justify-between mb-1.5">
                            <span className="text-[11px]" style={{ color: '#5F5E5A' }}>{label}</span>
                            <span className="text-sm font-bold" style={{ color: pctColour, fontFamily: 'var(--font-space-grotesk)' }}>{g.scorePct}%</span>
                          </div>
                          <div className="h-[5px] rounded-sm overflow-hidden" style={{ background: 'rgba(23,52,4,0.06)' }}>
                            <div className="h-full" style={{ width: `${g.scorePct}%`, background: barColour, borderRadius: 3 }} />
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </a>
              )
            })}
            {/* View-all card — 4th slot */}
            <a href="/dashboard/search"
              className="flex flex-col items-center justify-center text-center gap-3 rounded-xl p-6 hover:-translate-y-0.5 transition-all"
              style={{ border: '1.5px dashed rgba(99,153,34,0.45)', background: 'transparent', minHeight: 220 }}>
              <div className="flex items-center justify-center w-12 h-12 rounded-xl" style={{ background: '#F5F1E8' }}>
                <ArrowRight className="w-5 h-5" style={{ color: '#173404' }} />
              </div>
              <div>
                <p className="text-base font-semibold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.005em' }}>See all matches</p>
                <p className="text-sm mt-1" style={{ color: '#5F5E5A' }}>Browse your full list →</p>
              </div>
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

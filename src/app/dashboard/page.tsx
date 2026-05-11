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

  // ── Matched Opportunities — definition aligned with Find Funding's
  // crossTabCounts (src/app/dashboard/search/page.tsx:2108). A "match" is
  // a pure FILTER, not a scored result. Same row that surfaces in Find
  // Funding surfaces here. Score is then computed within the matched set
  // for the top-4 sort and the strong/good/partial/weak bucketing.
  //
  // Filter rules (mirror Find Funding):
  //   - Active row, URL not dead, deadline rolling/null/future
  //   - Funding type ∈ { grant, programme, investment, in_kind }
  //     (accelerator + blended_finance excluded — too low-volume to be
  //     useful on the dashboard, would clutter the per-type bars)
  //   - Structure eligibility: pass if eligible_structures is empty OR
  //     contains the user's legal_structure (literal .includes match)
  //
  // Earlier iteration mistakenly used `score > 0` as the membership test,
  // which returned every row in the catalogue (the matching engine scores
  // everything) and bucketed catalogue noise as "weak" matches. Headline
  // count was 580 vs Find Funding's 345 — fixed by aligning definitions.
  const CANONICAL_TYPES = new Set(['grant', 'programme', 'investment', 'in_kind'])
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
      .limit(1000)

    if (grantRows && grantRows.length > 0) {
      const orgStructure = typedOrg.legal_structure
      // Mirror Find Funding's profile prefill (search/page.tsx:1336-1340):
      // when the org has impact_sectors / primary_location set, those become
      // active filters by default. The dashboard headline must apply the
      // same filters or it'll over-count (we saw 523 vs Find Funding's 345
      // because sector + location filters weren't being applied here).
      const orgSectors = new Set((typedOrg.impact_sectors ?? []) as string[])
      const orgLocation = (typedOrg.primary_location ?? '').toLowerCase().trim()
      // UK-wide / nation-wide scopes always pass the location check (a
      // London charity should still see UK-wide funders). Mirrors
      // search/page.tsx:2113.
      const BROAD_LOCATION = new Set(['uk', 'uk-wide', 'england', 'nationwide', 'national', 'uk wide', 'all uk'])

      scoredAll = grantRows
        .map(row => {
          const g = normaliseScrapedGrant(row as Record<string, unknown>)
          const ge = g as ReturnType<typeof normaliseScrapedGrant> & { impactSectors?: string[]; geoScope?: string[] }
          const ft = (g.fundingType ?? 'grant') as string
          if (!CANONICAL_TYPES.has(ft)) return null

          // Structure eligibility — literal .includes on eligible_structures
          const es = g.eligibleStructures
          if (orgStructure && es && es.length > 0 && !es.includes(orgStructure)) return null

          // Sector intersection — only fires when both sides have sectors set
          if (orgSectors.size > 0 && ge.impactSectors && ge.impactSectors.length > 0) {
            if (!ge.impactSectors.some((s: string) => orgSectors.has(s))) return null
          }

          // Location — only fires when both sides have location set; broad
          // scopes (UK-wide etc.) always pass
          if (orgLocation && ge.geoScope && ge.geoScope.length > 0) {
            const passes = ge.geoScope.some((s: string) => {
              const sl = s.toLowerCase()
              return BROAD_LOCATION.has(sl) || sl.includes(orgLocation) || orgLocation.includes(sl)
            })
            if (!passes) return null
          }

          // Score within the matched set (used for top-4 + quality buckets)
          const result = computeMatchScore(g, typedOrg)
          return {
            grant: g,
            score: result.score,
            lastSeenAt: (row as Record<string, unknown>).last_seen_at as string | null,
          }
        })
        .filter((x): x is ScoredGrant => x !== null)
        .sort((a, b) => b.score - a.score)
    }
  }
  const totalMatchCount = scoredAll.length

  // ── Quality buckets — Strong ≥80, Good 70–79, Partial 50–69, Weak <50.
  // Aligned with Find Funding's tier labels (search/page.tsx:522).
  // The dashboard surfaces strong+good+partial as "Worth your attention"
  // (the actionable subset) while keeping Weak in the wider browse pool.
  function qualityBucket(score: number): 'strong' | 'good' | 'partial' | 'weak' {
    if (score >= 80) return 'strong'
    if (score >= 70) return 'good'
    if (score >= 50) return 'partial'
    return 'weak'
  }
  const qualityCounts = { strong: 0, good: 0, partial: 0, weak: 0 }
  for (const m of scoredAll) qualityCounts[qualityBucket(m.score)]++
  // "Worth your attention" — strong+good+partial. Excludes weak (still in
  // the wider 345 total but pushed to "Browse all" rather than promoted).
  const actionableCount = qualityCounts.strong + qualityCounts.good + qualityCounts.partial

  // ── By funding type — counts the ACTIONABLE subset (score ≥ 50).
  // Per-type bars need to mirror what's actually surfaced as worth-attention,
  // not the wider 345 total. The 4 bars sum to actionableCount.
  const typeCounts: Record<string, number> = {}
  for (const m of scoredAll) {
    if (m.score < 50) continue
    const ft = m.grant.fundingType ?? 'grant'
    typeCounts[ft] = (typeCounts[ft] ?? 0) + 1
  }

  // Top 4 matches for the right column (replaces the old daily-rotation 3)
  const topMatches = scoredAll.slice(0, 4)

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
    (user?.user_metadata?.first_name as string | undefined) ??
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

  // Profile-complete signal: the wizard guarantees both an impact_sector and a
  // legal_structure on finish. If either is missing the user is in a "Set up
  // later" / cleared state and the dashboard should prompt them to onboard
  // rather than celebrate matches.
  const profileComplete = !!(typedOrg && (typedOrg.impact_sectors?.length ?? 0) > 0 && typedOrg.legal_structure)

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
            {profileComplete
              ? "Your profile's complete — time to find some funding."
              : 'Tell us about your organisation so we can match you to the right funding.'}
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
              {profileComplete ? `${totalMatchCount} matches ready` : 'Profile incomplete'}
            </span>
          </div>
          <h3 className="text-2xl md:text-3xl font-bold text-charcoal leading-tight mb-2" style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.02em' }}>
            {profileComplete
              ? "We've found funding that fits your profile."
              : 'Set up your profile to unlock matches.'}
          </h3>
          <p className="text-sm md:text-base text-mid mb-6 max-w-2xl leading-relaxed">
            {profileComplete
              ? "Browse your matches, save the ones worth a closer look, and move them into your pipeline when you're ready to apply. Everything you do here feeds the matching — the more you engage, the sharper it gets."
              : 'Takes about 2 minutes. Tell us your org type, where you work, who you serve and what you do — and we’ll score every UK funder against you.'}
          </p>
          <div className="flex flex-wrap gap-3">
            {profileComplete ? (
              <>
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
              </>
            ) : (
              <a
                href="/onboarding/wizard"
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
                style={{ background: '#8ECB3C', color: '#173404', fontFamily: 'var(--font-space-grotesk)', boxShadow: '0 2px 8px rgba(132,204,22,0.25)' }}
              >
                Complete your profile
                <ArrowRight className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>

        {/* Getting started — 5 items */}
        <div className="mb-8">
          <h3 className="text-xl font-bold text-charcoal mb-4" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Getting started
          </h3>
          <div className="bg-white rounded-xl border border-warm overflow-hidden" style={{ boxShadow: '0 2px 16px rgba(26,46,43,0.04)' }}>
            {/* 1. Complete profile — done if onboarded, active otherwise */}
            <div className="flex items-center gap-4 p-5 border-b border-warm" style={profileComplete ? undefined : { background: '#EAF3DE' }}>
              {profileComplete ? (
                <div className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#8ECB3C' }}>
                  <Check className="w-5 h-5 text-white" strokeWidth={3} />
                </div>
              ) : (
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
                  1
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold text-charcoal ${profileComplete ? 'line-through decoration-charcoal/30' : ''}`} style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  Complete your profile
                </p>
                <p className="text-xs text-mid mt-0.5">
                  {profileComplete
                    ? 'Nice work — matches are running against your org now.'
                    : 'Tell us your org type, location, and who you serve so we can score funders for you.'}
                </p>
              </div>
              {!profileComplete && (
                <a
                  href="/onboarding/wizard"
                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity"
                  style={{ background: '#173404', color: '#FAF7F2', fontFamily: 'var(--font-space-grotesk)' }}
                >
                  Start
                  <ArrowRight className="w-3 h-3" />
                </a>
              )}
            </div>

            {/* 2. Browse first matches — only "active" once profile is done */}
            <div className="flex items-center gap-4 p-5 border-b border-warm" style={profileComplete ? { background: '#EAF3DE' } : undefined}>
              <div
                className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                style={profileComplete ? {
                  background: '#FFFFFF',
                  border: '2px solid #8ECB3C',
                  color: '#3F6814',
                  fontFamily: 'var(--font-space-grotesk)',
                  boxShadow: '0 0 0 4px rgba(142,203,60,0.15)',
                } : {
                  background: '#FFFFFF',
                  border: '1.5px solid #E4E2DA',
                  color: '#8A8986',
                  fontFamily: 'var(--font-space-grotesk)',
                }}
              >
                2
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  Browse your first matches
                </p>
                <p className="text-xs text-mid mt-0.5">
                  {profileComplete
                    ? `${totalMatchCount} opportunities scored against your profile.`
                    : 'Unlocks once your profile is set up.'}
                </p>
              </div>
              {profileComplete && (
                <a
                  href="/dashboard/search"
                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity"
                  style={{ background: '#173404', color: '#FAF7F2', fontFamily: 'var(--font-space-grotesk)' }}
                >
                  Start
                  <ArrowRight className="w-3 h-3" />
                </a>
              )}
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
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-charcoal mb-1.5" style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.02em' }}>
          {greetingTime}, {displayName}.
        </h2>
        <p className="text-sm text-mid">
          {subtitleParts.join(' · ')}
        </p>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          Your matches summary + Top matches for you
          Two-column hero. Left column shows the catalogue scoped to the user
          (total + quality breakdown + per-type bars). Right column shows the
          four highest-scoring matches as a vertical list. Funding-type colour
          mapping per CLAUDE.md palette: lime grants, gold in-kind, coral
          programmes, blue investment.
          ──────────────────────────────────────────────────────────────────── */}
      {totalMatchCount > 0 && (() => {
        // Three-bucket breakdown of the actionable subset (Worth your attention).
        // "Worth exploring" is the renamed Partial — same 50–69 score band,
        // friendlier label that frames it as a deliberate choice rather than a
        // weakness. Weak (<50) is excluded from the breakdown but counted in
        // the wider 345 total accessible via "Browse all".
        const qualityCols = [
          { key: 'strong',  label: 'Strong',          count: qualityCounts.strong,  colour: '#639922' },
          { key: 'good',    label: 'Good',            count: qualityCounts.good,    colour: '#8ECB3C' },
          { key: 'partial', label: 'Worth exploring', count: qualityCounts.partial, colour: '#C0DD97' },
        ]
        const TYPE_BAR: Record<string, { label: string; colour: string; pillBg: string; pillFg: string }> = {
          grant:           { label: 'Grants',      colour: '#639922', pillBg: '#F1F7E4', pillFg: '#3B6D11' },
          in_kind:         { label: 'In-kind',     colour: '#EF9F27', pillBg: '#FAEEDA', pillFg: '#854F0B' },
          programme:       { label: 'Programmes',  colour: '#D85A30', pillBg: '#FAECE7', pillFg: '#993C1D' },
          investment:      { label: 'Investment',  colour: '#85B7EB', pillBg: '#E6F1FB', pillFg: '#0C447C' },
          accelerator:     { label: 'Accelerator', colour: '#D85A30', pillBg: '#FAECE7', pillFg: '#993C1D' },
          blended_finance: { label: 'Blended',     colour: '#85B7EB', pillBg: '#E6F1FB', pillFg: '#0C447C' },
        }
        const typeBars = Object.entries(typeCounts)
          .map(([key, count]) => ({ key, count, ...(TYPE_BAR[key] ?? TYPE_BAR.grant) }))
          .sort((a, b) => b.count - a.count)
        const maxTypeCount = Math.max(1, ...typeBars.map(t => t.count))

        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-8">
            {/* LEFT — Worth your attention */}
            <div className="lg:col-span-5 card rounded-xl p-6">
              {/* Stat block — single label/number/qualifier unit instead of
                  the previous separate context line + dash-and-number h3.
                  The "of N total matches" qualifier sits inline next to the
                  number on a shared baseline so the eye reads
                  actionable→total in one sweep. */}
              <div className="rounded-lg mb-5" style={{ background: '#F0EDE2', padding: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.5px', color: '#5F5E5A', textTransform: 'uppercase', fontFamily: 'var(--font-space-grotesk)', marginBottom: 6 }}>
                  Worth your attention
                </p>
                <div className="flex items-baseline" style={{ gap: 12 }}>
                  <span style={{ fontSize: 36, fontWeight: 500, color: '#2C2C2A', fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.02em', lineHeight: 1 }}>
                    {actionableCount}
                  </span>
                  <span style={{ fontSize: 13, color: '#5F5E5A', fontFamily: 'var(--font-space-grotesk)' }}>
                    of {totalMatchCount} total matches
                  </span>
                </div>
              </div>

              {/* Quality breakdown — 3 columns + stacked bar (Weak excluded) */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                {qualityCols.map(q => (
                  <div key={q.key}>
                    <p className="text-xs" style={{ color: '#5F5E5A' }}>{q.label}</p>
                    <p className="text-xl font-bold text-charcoal mt-0.5" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                      {q.count}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex h-2 rounded-full overflow-hidden mb-4" style={{ background: '#F0EDE2' }}>
                {qualityCols.filter(q => q.count > 0).map(q => (
                  <div key={q.key} style={{ flexGrow: q.count, background: q.colour }} />
                ))}
              </div>

              {/* Browse-all link — discoverable but not styled as a primary CTA.
                  No URL params: takes the user to the unfiltered Find Funding
                  view so the totals on both pages match exactly. */}
              <a href="/dashboard/search" className="text-xs underline mb-6 inline-block hover:text-charcoal transition-colors" style={{ color: '#5F5E5A', fontFamily: 'var(--font-space-grotesk)' }}>
                Browse all {totalMatchCount} matches →
              </a>

              {/* By funding type — actionable subset (score ≥ 50) only */}
              <p className="text-[10px] font-bold uppercase tracking-widest text-mid mb-3" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                By funding type
              </p>
              <div className="space-y-3">
                {typeBars.map(t => (
                  <div key={t.key} className="flex items-center gap-3">
                    <span className="flex-shrink-0" style={{ color: '#2C2C2A', width: 100, fontSize: 13 }}>{t.label}</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#F0EDE2' }}>
                      <div className="h-full rounded-full" style={{ width: `${(t.count / maxTypeCount) * 100}%`, background: t.colour }} />
                    </div>
                    <span className="font-semibold text-charcoal flex-shrink-0 text-right" style={{ fontFamily: 'var(--font-space-grotesk)', width: 40, fontSize: 13 }}>
                      {t.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT — Top matches for you */}
            <div className="lg:col-span-7 card rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  Top matches for you
                </h3>
                <a href="/dashboard/search?actionable=1" className="text-xs font-semibold hover:underline" style={{ color: '#3B6D11', fontFamily: 'var(--font-space-grotesk)' }}>
                  See all {actionableCount} →
                </a>
              </div>
              <div className="space-y-2">
                {topMatches.map(m => {
                  const ft = m.grant.fundingType ?? 'grant'
                  const cfg = TYPE_BAR[ft] ?? TYPE_BAR.grant
                  const pct = Math.round(m.score)
                  const amt = m.grant.amountMin || m.grant.amountMax
                    ? (m.grant.amountMin && m.grant.amountMax && m.grant.amountMin !== m.grant.amountMax
                        ? `${formatCurrency(m.grant.amountMin)}–${formatCurrency(m.grant.amountMax)}`
                        : formatCurrency(m.grant.amountMax || m.grant.amountMin || 0))
                    : 'Amount on application'
                  return (
                    <a key={m.grant.id} href={`/dashboard/search?grant=${encodeURIComponent(m.grant.id)}`}
                      className="relative flex items-center gap-3 rounded-lg pl-5 pr-4 py-3.5 hover:bg-[#F5F1E8] transition-colors overflow-hidden group"
                      style={{ background: '#FAFAF7' }}>
                      <div className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r" style={{ background: cfg.colour }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-semibold text-charcoal truncate" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                          {m.grant.title}
                        </p>
                        <p className="text-xs mt-0.5 truncate" style={{ color: '#5F5E5A' }}>
                          {m.grant.funder} · {amt}
                        </p>
                      </div>
                      <span className="flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: cfg.pillBg, color: cfg.pillFg, fontFamily: 'var(--font-space-grotesk)' }}>
                        {pct}%
                      </span>
                    </a>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Pipeline + Upcoming deadlines (moved below matches per dashboard reorder 2026-05-11)
          Custom grid (2fr / 1.1fr) gives deadlines a bit more width so funder
          names like "Company of Actuaries Charitable Trust" render in full. */}
      <div className="grid grid-cols-1 gap-5 mb-8" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1.1fr)' }}>

        {/* Pipeline Overview — 4 active stages + Declined as footer line.
            Declined is closed state, not active state; reduced visual weight
            so it doesn't compete with the active workflow tiles for attention.
            Won standardised to currency (with "—" fallback when value=0)
            so all four active tiles use the same metric format. */}
        <div className="card rounded-xl">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-xl font-bold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Pipeline</h3>
            <a href="/dashboard/pipeline" className="text-xs font-semibold hover:underline" style={{ color: '#8ECB3C', fontFamily: 'var(--font-space-grotesk)' }}>View pipeline →</a>
          </div>

          {(() => {
            const activeStages = stageValues.filter(s => s.id !== 'declined')
            const declined = stageValues.find(s => s.id === 'declined')
            const totalActiveValue = activeStages.reduce((sum, s) => sum + s.value, 0)
            const hasAnyActivity = activeStages.some(s => s.count > 0) || (declined?.count ?? 0) > 0

            // Empty state: zero activity across all stages → CTA back to Find
            // Funding rather than five empty £0 tiles (which felt broken on
            // day-one for new cohort members).
            if (!hasAnyActivity) {
              return (
                <a href="/dashboard/search"
                  className="flex flex-col items-center justify-center text-center gap-2 rounded-xl px-6 py-10 hover:bg-[#F5F1E8] transition-colors"
                  style={{ background: '#FAFAF7', border: '1.5px dashed rgba(99,153,34,0.35)', minHeight: 160 }}>
                  <p className="text-base font-semibold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                    Nothing in your pipeline yet
                  </p>
                  <p className="text-sm" style={{ color: '#5F5E5A' }}>
                    Save a match to start tracking applications.
                  </p>
                  <span className="mt-2 text-xs font-semibold inline-flex items-center gap-1.5" style={{ color: '#3B6D11', fontFamily: 'var(--font-space-grotesk)' }}>
                    Find your first match <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </a>
              )
            }

            return (
              <>
                <a href="/dashboard/pipeline" className="flex rounded-xl overflow-hidden hover:opacity-95 transition-opacity" style={{ height: 160 }}>
                  {activeStages.map(s => {
                    const maxVal = Math.max(...activeStages.map(x => x.value).filter(v => v > 0), 100000)
                    const FLOOR = maxVal / 12
                    const grow = Math.max(s.value, FLOOR)
                    return (
                      <div key={s.id} className="flex flex-col justify-between px-4 py-3.5"
                        style={{ flexGrow: grow, flexShrink: 0, flexBasis: 110, background: s.bg, minWidth: 110, overflow: 'hidden' }}>
                        <span className="text-[10px] font-bold uppercase tracking-widest truncate" style={{ color: s.labelCol }}>
                          {s.label}
                        </span>
                        <div>
                          <span className="block font-display font-bold leading-none truncate"
                            style={{ color: s.valCol, fontSize: 'clamp(18px, 2.2vw, 30px)' }}>
                            {s.value > 0 ? formatCurrency(s.value) : '—'}
                          </span>
                          <span className="block text-[10px] font-semibold mt-1.5 truncate" style={{ color: s.countCol }}>
                            {s.count > 0 ? (s.count === 1 ? '1 opportunity' : s.count + ' opportunities') : 'None yet'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </a>

                {/* Footer line — total active + declined (when present) */}
                <div className="mt-3 pt-3 flex items-center justify-between flex-wrap gap-2 text-xs" style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)', color: '#5F5E5A' }}>
                  <span style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                    Total in pipeline: <span className="font-semibold text-charcoal">{totalActiveValue > 0 ? formatCurrency(totalActiveValue) : '—'}</span>
                  </span>
                  {declined && declined.count > 0 && (
                    <span style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                      <span className="font-semibold" style={{ color: '#993C1D' }}>{declined.value > 0 ? formatCurrency(declined.value) : declined.count}</span> declined
                      <span className="ml-1">· {declined.count === 1 ? '1 opportunity' : `${declined.count} opportunities`}</span>
                    </span>
                  )}
                </div>
              </>
            )
          })()}
        </div>

        {/* This week's deadlines */}
        <div className="card rounded-xl">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-xl font-bold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Upcoming deadlines</h3>
          </div>

          {alerts.length === 0 ? (
            <div className="text-center py-6 text-mid">
              <p className="text-sm">No deadlines yet.</p>
              <p className="text-xs mt-1">They&rsquo;ll appear here as you save opportunities.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {alerts.map(row => {
                const dateObj = formatDeadlineDate(row.deadline)
                const d = row.daysUntil
                // Urgency styling: anything within 30 days reads red on both
                // the date numerals and the pill. Beyond 30d stays neutral
                // grey so the eye lands first on the imminent items.
                const isUrgent = d <= 30
                const pillLabel = d < 0 ? 'Overdue' : d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `${d}d`
                const pillCls = isUrgent
                  ? 'bg-[#FAECE7] text-[#993C1D]'
                  : 'bg-transparent text-[#5F5E5A] border border-[rgba(23,52,4,0.20)]'
                const dayCol   = isUrgent ? '#993C1D' : '#2C2C2A'
                const monthCol = isUrgent ? '#993C1D' : '#5F5E5A'
                return (
                  <a key={row.id} href={row.href}
                    className="flex items-center gap-3 py-2.5 border-b border-warm last:border-0 hover:bg-[#FAFAF7] -mx-2 px-2 rounded-md transition-colors">
                    {dateObj ? (
                      <div className="flex flex-col items-center flex-shrink-0 w-9 text-center">
                        <span className="text-[9px] font-bold uppercase" style={{ color: monthCol }}>{dateObj.month}</span>
                        <span className="text-lg font-bold leading-none" style={{ color: dayCol }}>{dateObj.day}</span>
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

    </div>
  )
}

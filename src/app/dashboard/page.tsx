import { redirect } from 'next/navigation'
import MatchesCard, { type MatchScope, type MatchRow, type TypeKey, type ScopeKey } from './MatchesCard'
import { CARD_LINK } from './card-link'
import { hueForIndex, hueMap } from '@/lib/project-hues'
import { FUNDING_TYPE_COLOUR } from '@/lib/funding-type-colours'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getDeadlineAlerts, formatCurrency, formatNextOpen } from '@/lib/utils'
import type { PipelineItem, Organisation } from '@/types'
import { Award, TrendingUp, Users, Rocket, GraduationCap, Gift, ArrowRight, CalendarDays, Check, Sparkles, Bookmark, ListChecks, UserPlus, FilePenLine, Lightbulb, CircleCheck } from 'lucide-react'
import { computeMatchScore, MATCH_TIER, MATCH_FLOOR, MATCH_TIER_STRONG, MATCH_TIER_GOOD } from '@/lib/matching'
import { normaliseScrapedGrant } from '@/lib/grants-normalise'
import { getBuilderUser } from '@/lib/builder/access'
import { agentEnabledForOrg } from '@/lib/agent/orchestrator/config'
import { tierForOrgFlags } from '@/lib/mcp-entitlement'

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

  // Honour the active-org selection (profile switcher cookie); fall back to
  // the oldest. Server-readable so the dashboard follows the same org the
  // profile/applications/projects do.
  const activeOrgId = cookies().get('gt_active_org_id')?.value ?? null
  const { data: allOrgs } = user
    ? await supabase.from('organisations').select('*').eq('owner_id', user.id).order('created_at', { ascending: true })
    : { data: null }
  const org = (() => {
    const list = (allOrgs ?? []) as Organisation[]
    if (list.length === 0) return null
    if (activeOrgId) { const m = list.find(o => o.id === activeOrgId); if (m) return m }
    return list[0]
  })()
  const typedOrg = org as Organisation | null

  // Companion-surface users get the briefing as their home (design spec §1:
  // the swap itself is part of what the tier visibly buys). No-op while
  // AGENT_ENABLED is off — this page stays byte-identical for everyone else.
  if (typedOrg && agentEnabledForOrg(typedOrg.id) && tierForOrgFlags(typedOrg as { apply_access?: boolean | null; companion_access?: boolean | null }) === 'companion') {
    redirect('/dashboard/briefing')
  }

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
  // UK-wide / nation-wide scopes always pass the location check.
  const BROAD_LOCATION = new Set(['uk', 'uk-wide', 'england', 'nationwide', 'national', 'uk wide', 'all uk'])
  let scoredAll: ScoredGrant[] = []
  let grantPoolRaw: Record<string, unknown>[] = []  // reused for per-project "funders fit"
  if (typedOrg) {
    const { data: grantRows } = await supabase
      .from('grants_with_funder')
      .select('*')
      .eq('is_active', true)
      .neq('url_status', 'dead')
      .or(`is_rolling.eq.true,deadline.is.null,deadline.gte.${today},next_open_date_parsed.gte.${today}`)
      .order('last_seen_at', { ascending: false })
      .limit(1000)

    grantPoolRaw = (grantRows ?? []) as Record<string, unknown>[]
    if (grantRows && grantRows.length > 0) {
      const orgStructure = typedOrg.legal_structure
      // Mirror Find Funding's profile prefill (search/page.tsx:1336-1340):
      // when the org has impact_sectors / primary_location set, those become
      // active filters by default. The dashboard headline must apply the
      // same filters or it'll over-count (we saw 523 vs Find Funding's 345
      // because sector + location filters weren't being applied here).
      const orgSectors = new Set((typedOrg.impact_sectors ?? []) as string[])
      const orgLocation = (typedOrg.primary_location ?? '').toLowerCase().trim()

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

  // ── "Your work" band (cohort/builder only) — in-progress applications +
  // projects. Fully gated: non-builder users get the byte-identical dashboard.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  type WorkApp = { id: string; title: string; funder: string | null; updatedAt: string | null; createdAt: string | null; projectId: string | null; answered: number; total: number; pill: { label: string; coral: boolean } }
  type WorkProject = { id: string; name: string; ready: boolean; budget: number | null; fitCount: number | null; createdAt: string | null }
  let builderAllowed = false
  let workApps: WorkApp[] = []
  let workProjects: WorkProject[] = []
  if (typedOrg) {
    const builderUser = await getBuilderUser()
    builderAllowed = !!builderUser
    if (builderAllowed) {
      const { data: apps } = await supabase
        .from('applications')
        // project_id is selected but currently null on every row: the creation
        // flow has no picker, only a ?project= parameter, so it only ever
        // arrives if the user came from a project page. See
        // docs/application-project-picker-missing-2026-08-24.md. Selected now so
        // the second line fills in on the day a picker ships, without a query
        // change. updated_at/created_at are what disambiguate rows meanwhile.
        .select('id, grant_name, funder_name, status, questions, opportunity_id, project_id, updated_at, created_at')
        .eq('org_id', typedOrg.id)
        .neq('status', 'complete')
        .order('updated_at', { ascending: false })
      const appRows = (apps ?? []) as {
        id: string; grant_name: string | null; funder_name: string | null
        questions: { user_answer?: string | null }[] | null; opportunity_id: string | null
        project_id: string | null; updated_at: string | null; created_at: string | null
      }[]
      // Deadlines live on the linked opportunity, not the application.
      const oppIds = Array.from(new Set(appRows.map(a => a.opportunity_id).filter((id): id is string => !!id && UUID_RE.test(id))))
      const deadlineMap: Record<string, string> = {}
      if (oppIds.length > 0) {
        const { data: gr } = await supabase.from('grants_with_funder').select('id, deadline').in('id', oppIds)
        for (const g of (gr ?? []) as { id: string; deadline: string | null }[]) if (g.deadline) deadlineMap[String(g.id)] = g.deadline
      }
      workApps = appRows
        .slice()
        .sort((x, y) => (y.updated_at ?? y.created_at ?? '').localeCompare(x.updated_at ?? x.created_at ?? ''))
        .map(a => {
        const dl = a.opportunity_id ? deadlineMap[a.opportunity_id] ?? null : null
        const days = dl ? Math.ceil((new Date(dl).getTime() - new Date(today).getTime()) / 86400000) : null
        const pill = days !== null && days < 0 ? { label: 'Overdue', coral: true }
          : days !== null && days <= 14 ? { label: `Closes ${days}d`, coral: true }
          : { label: 'In progress', coral: false }
        return {
          id: a.id,
          title: a.grant_name || a.funder_name || 'Untitled application',
          // Only when it differs from the title — otherwise the second line
          // would repeat the first.
          funder: a.grant_name && a.funder_name ? a.funder_name : null,
          updatedAt: a.updated_at,
          createdAt: a.created_at,
          projectId: a.project_id,
          answered: (a.questions ?? []).filter(q => q.user_answer?.trim()).length,
          total: (a.questions ?? []).length,
          pill,
        }
      })
      const { data: projs } = await supabase
        .from('projects')
        .select('id, name, sectors, budget_amount, what_it_will_do, created_at')
        .eq('org_id', typedOrg.id)
        .order('updated_at', { ascending: false })
      const projList = (projs ?? []) as { id: string; name: string; sectors: string[] | null; budget_amount: number | null; what_it_will_do: string | null; created_at: string | null }[]
      // Normalise the already-fetched pool once; per-project "funders fit"
      // filters cheaply then scores only the survivors. Computed for the
      // displayed rows only (first 4) to keep the home page fast.
      const poolNorm = grantPoolRaw.map(r => normaliseScrapedGrant(r))
      const orgStructure = typedOrg.legal_structure
      const orgLoc = (typedOrg.primary_location ?? '').toLowerCase().trim()
      workProjects = projList.map((p, idx) => {
        const ready = !!p.what_it_will_do?.trim() && (p.sectors?.length ?? 0) > 0 && (p.budget_amount ?? 0) > 0
        let fitCount: number | null = null
        if (idx < 4 && ready && typedOrg) {
          const projectSectors = new Set(p.sectors ?? [])
          const synthetic = { ...typedOrg, impact_sectors: p.sectors ?? [], min_grant_target: typedOrg.min_grant_target ?? (p.budget_amount ? Math.round(p.budget_amount * 0.1) : null) } as Organisation
          let n = 0
          for (const g of poolNorm) {
            const ge = g as ReturnType<typeof normaliseScrapedGrant> & { impactSectors?: string[]; geoScope?: string[] }
            if (!CANONICAL_TYPES.has((g.fundingType ?? 'grant') as string)) continue
            const es = g.eligibleStructures
            if (orgStructure && es && es.length > 0 && !es.includes(orgStructure)) continue
            if (orgLoc && ge.geoScope && ge.geoScope.length > 0) {
              if (!ge.geoScope.some(s => { const sl = s.toLowerCase(); return BROAD_LOCATION.has(sl) || sl.includes(orgLoc) || orgLoc.includes(sl) })) continue
            }
            if (projectSectors.size > 0 && ge.impactSectors && ge.impactSectors.length > 0) {
              if (!ge.impactSectors.some(s => projectSectors.has(s))) continue
            }
            if (computeMatchScore(g, synthetic).score >= MATCH_FLOOR) n++
          }
          fitCount = n
        }
        return { id: p.id, name: p.name, ready, budget: p.budget_amount ?? null, fitCount, createdAt: p.created_at ?? null }
      })
    }
  }
  const projectsReady = workProjects.filter(p => p.ready).length
  const hasWork = workApps.length > 0 || workProjects.length > 0

  // ── Quality buckets. The boundaries live in matching.ts so this and the
  // Find Funding card cannot disagree — they used to be two hand-copied
  // ternaries, and a line-number citation that had gone stale.
  // The dashboard surfaces strong+good+partial as "Worth your attention"
  // (the actionable subset) while keeping Weak in the wider browse pool.
  function qualityBucket(score: number): 'strong' | 'good' | 'partial' | 'weak' {
    if (score >= MATCH_TIER_STRONG) return 'strong'
    if (score >= MATCH_TIER_GOOD)   return 'good'
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

  /**
   * Per-type tiers, from the walk that already buckets by quality.
   *
   * The filter needs the distribution scoped to each type, not just the total,
   * or flipping to Grants would show a grants count above an all-types
   * sub-line.
   */
  const tiersByType: Record<string, { strong: number; good: number; partial: number; weak: number }> = {}
  for (const m of scoredAll) {
    const ft = (m.grant.fundingType ?? 'grant') as string
    tiersByType[ft] ??= { strong: 0, good: 0, partial: 0, weak: 0 }
    tiersByType[ft][qualityBucket(m.score)]++
  }

  // Top 3 matches for the right column — three cards with full breathing room
  const topMatches = scoredAll.slice(0, 3)

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

  // ── Pipeline tonal ladder ────────────────────────────────────────────────
  // Warm neutral → sage tint → sage → deep, with Declined breaking to the
  // danger tint because it is a different kind of outcome, not the next rung.
  //
  // The property that matters is that it darkens MONOTONICALLY toward Won, so
  // it still reads as advancement in greyscale rather than leaning on hue:
  // luminance runs 0.848 → 0.832 → 0.516 → 0.038, with Declined at 0.882
  // deliberately outside the run. Every pair below was measured, not picked:
  // 5.55, 9.98, 6.41, 10.55 and 4.81.
  //
  // NOT SHARED WITH THE PIPELINE PAGE. dashboard/pipeline/page.tsx carries its
  // own STAGE_BG_HEX, and the two had ALREADY diverged before this change —
  // the Pipeline's ladder is much paler and its Won (#EAF3DE) is nearly the
  // lightest rung rather than the darkest, so it does not carry the greyscale
  // property at all. Unifying them means reworking that page's header, count
  // and divider tones, which are derived from assumptions about these
  // backgrounds. That is its own pass, not something to absorb into this one.
  const stageData = [
    { id: 'identified', label: 'Identified', bg: '#F1EDE3', labelCol: '#5F5E5A',            valCol: '#2E2E2E',            countCol: '#5F5E5A' },
    { id: 'applying',   label: 'Applying',   bg: '#E1EFE2', labelCol: '#1D3C3E',            valCol: '#1D3C3E',            countCol: '#1D3C3E' },
    { id: 'submitted',  label: 'Submitted',  bg: '#9BCA9D', labelCol: '#1D3C3E',            valCol: '#1D3C3E',            countCol: '#1D3C3E' },
    { id: 'won',        label: 'Won',        bg: '#1D3C3E', labelCol: 'rgba(246,241,231,0.80)', valCol: '#F6F1E7',        countCol: 'rgba(246,241,231,0.80)' },
    { id: 'declined',   label: 'Declined',   bg: '#FBEFEA', labelCol: '#B4472A',            valCol: '#B4472A',            countCol: '#B4472A' },
  ]
  const stageValues = stageData.map(s => ({
    ...s,
    count: items.filter(i => i.stage === s.id).length,
    value: items.filter(i => i.stage === s.id).reduce((sum, i) => sum + (i.amount_max ?? i.amount_requested ?? 0), 0),
  }))
  const totalValue = stageValues.reduce((sum, s) => sum + s.value, 0)

  /**
   * Project hues, in a fixed order.
   *
   * Assigned by the project's position in the list rather than hashed from its
   * id, so the colours stay put between visits and the first project is always
   * sage. A hash would reshuffle every time a project was added.
   *
   * The glyph on each tile is --deep, which measures 6.4 / 7.7 / 7.1 / 4.4 / 5.9
   * against these grounds — all clear of the 3:1 non-text floor.
   *
   * The same hue is meant to appear on every application belonging to the
   * project. That half is dormant: project_id is null on every application
   * because the creation flow has no picker (see
   * docs/application-project-picker-missing-2026-08-24.md), so projectHue()
   * returns null for all of them today and the tile stays neutral. The lookup
   * is wired, so it lights up the day a picker ships.
   */
  const hueByProjectId = hueMap(workProjects.map(pr => ({ id: pr.id, created_at: pr.createdAt })))
  const projectHue = (id: string | null) => (id ? hueByProjectId.get(id) ?? null : null)
  const projectName = new Map(workProjects.map(pr => [pr.id, pr.name]))

  /** The same four hues every other surface uses. One definition, no drift. */
  const TYPE_RAIL: Record<TypeKey, string> = {
    grant:      FUNDING_TYPE_COLOUR.grant.rail,
    programme:  FUNDING_TYPE_COLOUR.programme.rail,
    investment: FUNDING_TYPE_COLOUR.investment.rail,
    in_kind:    FUNDING_TYPE_COLOUR.in_kind.rail,
  }

  // ── Upcoming deadlines (pipeline + catalogue) ───────────────────────
  const DEADLINE_ROWS_SHOWN = 6
  type DlRow = { id: string; name: string; deadline: string; daysUntil: number; amountStr: string | null; href: string; fundingType: TypeKey | null }
  function parseDaysUntil(dl: string): number {
    const parts = dl.split('-').map(Number)
    const d = new Date(parts[0], parts[1] - 1, parts[2])
    return Math.round((d.getTime() - Date.now()) / 86400000)
  }

  /**
   * Funding type by title, for the deadline rails.
   *
   * A pipeline item carries `funder_type` (trust, corporate, …), which is a
   * different axis from funding type and would colour the rail by the wrong
   * thing. The catalogue does hold the funding type, and the rows are already
   * matched to it by lowercased title in the dedup below, so this reuses that
   * same join rather than inventing a second one. Unmatched rows get a neutral
   * rail rather than a guessed colour.
   */
  const typeByTitle = new Map<string, TypeKey>()
  for (const x of scoredAll) {
    const ft = x.grant.fundingType
    if (ft && CANONICAL_TYPES.has(ft)) typeByTitle.set(x.grant.title.toLowerCase(), ft as TypeKey)
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
      fundingType: typeByTitle.get(i.grant_name.toLowerCase()) ?? null,
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
        fundingType: (g.fundingType && CANONICAL_TYPES.has(g.fundingType) ? g.fundingType : null) as TypeKey | null,
      }
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)

  // Scrollable deadlines list — show up to 15 in the 108px panel. Pipeline
  // items rank first (they're the user's own commitments), catalogue rows
  // fill remaining slots. Two visible at a time, rest scrolls.
  const alerts: DlRow[] = [...pipelineRows, ...catalogueRows]
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 15)

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
  /**
   * Whether the matcher has enough to run: a sector and a legal structure, its
   * two hard gates. NOT a measure of profile completeness.
   *
   * It was called profileComplete, and the page said "Your profile's complete"
   * on the strength of it. The sidebar's badge is matchProfileScore, seven
   * fields — so an org could read "complete" here and 29% there. Measured
   * against real data: 40 of 41 orgs pass this test, and the lowest of them
   * shows 57% in the sidebar.
   *
   * Renamed rather than unified, deliberately. Making the two the same number
   * would flip 40 orgs out of the "matches ready" state to fix a sentence.
   * The gate keeps the two-field test; the COPY below uses the seven-field
   * score, so the page stops claiming more than it checked.
   */
  const canRunMatching = !!(typedOrg && (typedOrg.impact_sectors?.length ?? 0) > 0 && typedOrg.legal_structure)

  /** The sidebar's measure, so the greeting can speak to the real gap. */
  const profileScore = (() => {
    if (!typedOrg) return 0
    const fields = [
      (typedOrg.impact_sectors?.length     ?? 0) > 0,
      (typedOrg.beneficiary_groups?.length ?? 0) > 0,
      !!typedOrg.primary_location,
      !!typedOrg.legal_structure,
      !!typedOrg.annual_income_band,
      !!(typedOrg.min_grant_target || typedOrg.max_grant_target),
      !!typedOrg.mission,
    ]
    return Math.round((fields.filter(Boolean).length / fields.length) * 100)
  })()

  // ══════════════════════════════════════════════════════════════════════════
  // EMPTY STATE (Day 1) — welcome banner, 5-item checklist, preview tiles
  // ══════════════════════════════════════════════════════════════════════════
  if (!hasActivity) {
    return (
      <div>
        {/* Greeting */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-1.5" style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.025em', color: '#1D3C3E' }}>
            Welcome to Shoots, {displayName}.
          </h2>
          <p className="text-sm text-mid">
            {canRunMatching
              ? "Your profile's complete — time to find some funding."
              : 'Tell us about your organisation so we can match you to the right funding.'}
          </p>
        </div>

        {/* Hero — option A, the deep panel.
            The panel is a --deep fill that is NOT a button, which weakens
            "deep = the thing to click". So the CTA inside it inverts to a
            --cream fill: within the panel the button stays the lightest,
            highest-contrast thing. A deep button on a deep panel is the
            failure mode this avoids. */}
        <div
          className="relative overflow-hidden mb-8"
          style={{ background: '#1D3C3E', borderRadius: 20, padding: '32px 34px' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <span
              className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider"
              style={{ background: 'rgba(246,241,231,0.13)', color: '#F6F1E7', borderRadius: 999, padding: '6px 13px', letterSpacing: '0.11em' }}
            >
              <Sparkles className="w-3 h-3" />
              {canRunMatching ? `${totalMatchCount} matches ready` : 'Profile incomplete'}
            </span>
          </div>
          <h3 className="text-2xl md:text-3xl font-bold leading-tight mb-2" style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.025em', color: '#F6F1E7' }}>
            {canRunMatching
              ? "We've found funding that fits your profile."
              : 'Set up your profile to unlock matches.'}
          </h3>
          <p className="text-sm md:text-base mb-6 max-w-2xl leading-relaxed" style={{ color: 'rgba(246,241,231,0.76)' }}>
            {canRunMatching
              ? "Browse your matches, save the ones worth a closer look, and move them into your pipeline when you're ready to apply. Everything you do here feeds the matching — the more you engage, the sharper it gets."
              : 'Takes about 2 minutes. Tell us your org type, where you work, who you serve and what you do — and we’ll score every UK funder against you.'}
          </p>
          <div className="flex flex-wrap gap-3">
            {canRunMatching ? (
              <>
                <a
                  href="/dashboard/search"
                  className="inline-flex items-center gap-2 text-sm font-semibold hover:opacity-90 transition-opacity"
                  style={{ background: '#F6F1E7', color: '#1D3C3E', fontFamily: 'var(--font-space-grotesk)', borderRadius: 999, padding: '12px 26px' }}
                >
                  See my matches
                  <ArrowRight className="w-4 h-4" />
                </a>
              </>
            ) : (
              <a
                href="/onboarding/wizard"
                className="inline-flex items-center gap-2 text-sm font-semibold hover:opacity-90 transition-opacity"
                style={{ background: '#F6F1E7', color: '#1D3C3E', fontFamily: 'var(--font-space-grotesk)', borderRadius: 999, padding: '12px 26px' }}
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
            <div className="flex items-center gap-4 p-5 border-b border-warm" style={canRunMatching ? undefined : { background: '#E1EFE2' }}>
              {canRunMatching ? (
                <div className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#1D3C3E' }}>
                  <Check className="w-5 h-5 text-white" strokeWidth={3} />
                </div>
              ) : (
                <div
                  className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{
                    background: '#FFFFFF',
                    border: '2px solid #1D3C3E',
                    color: '#1D3C3E',
                    fontFamily: 'var(--font-space-grotesk)',
                    boxShadow: '0 0 0 4px rgba(29,60,62,0.12)',
                  }}
                >
                  1
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold text-charcoal ${canRunMatching ? 'line-through decoration-charcoal/30' : ''}`} style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  Complete your profile
                </p>
                <p className="text-xs text-mid mt-0.5">
                  {canRunMatching
                    ? 'Nice work — matches are running against your org now.'
                    : 'Tell us your org type, location, and who you serve so we can score funders for you.'}
                </p>
              </div>
              {!canRunMatching && (
                <a
                  href="/onboarding/wizard"
                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity"
                  style={{ background: '#1D3C3E', color: '#F6F1E7', fontFamily: 'var(--font-space-grotesk)', borderRadius: 999 }}
                >
                  Start
                  <ArrowRight className="w-3 h-3" />
                </a>
              )}
            </div>

            {/* 2. Browse first matches — only "active" once profile is done */}
            <div className="flex items-center gap-4 p-5 border-b border-warm" style={canRunMatching ? { background: '#E1EFE2' } : undefined}>
              <div
                className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                style={canRunMatching ? {
                  background: '#FFFFFF',
                  border: '2px solid #1D3C3E',
                  color: '#1D3C3E',
                  fontFamily: 'var(--font-space-grotesk)',
                  boxShadow: '0 0 0 4px rgba(29,60,62,0.12)',
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
                  {canRunMatching
                    ? `${totalMatchCount} opportunities scored against your profile.`
                    : 'Unlocks once your profile is set up.'}
                </p>
              </div>
              {canRunMatching && (
                <a
                  href="/dashboard/search"
                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity"
                  style={{ background: '#1D3C3E', color: '#F6F1E7', fontFamily: 'var(--font-space-grotesk)', borderRadius: 999 }}
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
                <div className="flex-1 rounded" style={{ background: '#E7F0DC' }} />
                <div className="flex-1 rounded" style={{ background: '#D3E5BC' }} />
                <div className="flex-1 rounded" style={{ background: '#B4D496' }} />
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

  /**
   * Relative under a week, absolute beyond.
   *
   * "Edited 2 days ago" beats a date when it is recent; "started 9 Aug" beats
   * "16 days ago" when it is not. These timestamps are doing real work here —
   * with no project name available they are what tells three applications to
   * the same funder apart.
   */
  function whenLabel(iso: string | null, verb: 'Edited' | 'Started'): string | null {
    if (!iso) return null
    const then = new Date(iso).getTime()
    if (Number.isNaN(then)) return null
    const days = Math.floor((Date.now() - then) / 86400000)
    if (days <= 0) return `${verb} today`
    if (days === 1) return `${verb} yesterday`
    if (days < 7) return `${verb} ${days} days ago`
    return `${verb} ${new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
  }

  // ══════════════════════════════════════════════════════════════════════════
  // POPULATED STATE (Week 2+) — dynamic subtitle, deadlines, pipeline, matches
  // ══════════════════════════════════════════════════════════════════════════
  /**
   * The greeting used to assemble five fragments — projects ready, deadlines
   * this week, applications in progress, new matches — every one of which the
   * act-now strip now states directly underneath it. Repeating them made the
   * first thing on the page a summary of the second.
   *
   * What it says instead is what the score claims, and it never claims
   * completeness. At 57% the matching genuinely is running, just on less than
   * it could be, so the low-score line is an offer rather than a warning.
   */
  const subtitleParts: string[] = []
  if (!canRunMatching) {
    subtitleParts.push('Tell us about your organisation so we can match you to the right funding.')
  } else if (profileScore < 70) {
    subtitleParts.push(`${totalMatchCount} opportunities scored so far. Filling in the rest of your profile will sharpen them.`)
  } else {
    subtitleParts.push(`${totalMatchCount} opportunities scored against your profile.`)
    if (newMatchesThisWeek > 0) {
      subtitleParts.push(`${newMatchesThisWeek} new since Monday`)
    }
  }

  /**
   * Pipeline, variant A.
   *
   * Assembled here rather than inline because it renders in two places: in the
   * right-hand column beside applications when there is builder work to show,
   * and full width when there is not. Same card either way.
   *
   * WHAT CHANGED FROM THE FOUR-EQUAL-TILES VERSION. The total was the largest
   * number on the card rendered as the smallest thing on it — 12px grey text in
   * a footer. It is now the headline. Declined comes up beside it: it is an
   * outcome, not a footnote.
   *
   * And the tiles alone were misleading by construction. Four equal boxes give
   * £500k and £15k identical visual weight, so the card could not tell you the
   * one thing it should: that most of the money is sitting in Identified, which
   * is the stage where nothing has been done about it yet. The proportion bar
   * is the fix — it is the same numbers, drawn to scale.
   */
  const pipelineCard = (() => {
    const activeStages = stageValues.filter(s => s.id !== 'declined')
    const declined = stageValues.find(s => s.id === 'declined')
    const totalActiveValue = activeStages.reduce((sum, s) => sum + s.value, 0)
    const totalActiveCount = activeStages.reduce((sum, s) => sum + s.count, 0)
    const hasAnyActivity = activeStages.some(s => s.count > 0) || (declined?.count ?? 0) > 0

    /**
     * The ladder's own tones, monotonic in darkness so the bar reads as
     * progress left to right. No lime (#8ECB3C) anywhere: §7 rules it off this
     * page, and at this size it would out-shout the headline.
     */
    const BAR: Record<string, string> = {
      identified: '#D8D3C8',
      applying:   '#C0DD97',
      submitted:  '#22874C',
      won:        '#1D3C3E',
    }

    return (
      <div className="card rounded-xl flex flex-col">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h3 className="text-xl font-bold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Pipeline</h3>
          <a href="/dashboard/pipeline" style={CARD_LINK}>View pipeline →</a>
        </div>
        {builderAllowed && <p className="text-mid mb-4" style={{ fontSize: 12.5 }}>Where each opportunity sits by stage and value, not the answer-writing.</p>}

        {!hasAnyActivity ? (
          <a href="/dashboard/search"
            className="flex flex-col items-center justify-center text-center gap-2 rounded-xl px-6 py-10 mt-4 hover:bg-[#F5F1E8] transition-colors"
            style={{ background: '#FAFAF7', border: '1.5px dashed rgba(29,60,62,0.28)', minHeight: 160 }}>
            <p className="text-base font-semibold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
              Nothing in your pipeline yet
            </p>
            <p className="text-sm" style={{ color: '#5F5E5A' }}>
              Save a match to start tracking applications.
            </p>
            <span className="mt-2 text-xs font-semibold inline-flex items-center gap-1.5" style={{ color: '#1D3C3E', fontFamily: 'var(--font-space-grotesk)' }}>
              Find your first match <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </a>
        ) : (
          <>
            {/* The headline. Zero reads "£0", not a dash: nothing in play is a
                fact about the pipeline, a dash is the absence of one. */}
            <div className="flex items-baseline gap-2.5 flex-wrap mb-3">
              <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 38, fontWeight: 600, color: '#1D3C3E', letterSpacing: '-0.03em', lineHeight: 1 }}>
                {formatCurrency(totalActiveValue)}
              </span>
              <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 14, fontWeight: 600, color: '#1D3C3E' }}>in play</span>
              <span className="ml-auto flex items-center gap-2" style={{ fontSize: 11.8, color: '#5F5E5A' }}>
                <span>across {totalActiveCount === 1 ? '1 opportunity' : `${totalActiveCount} opportunities`}</span>
                {declined && declined.count > 0 && (
                  <>
                    <span className="inline-block flex-shrink-0" style={{ width: 9, height: 9, background: '#993C1D', borderRadius: 2 }} />
                    <span>{formatCurrency(declined.value)} declined</span>
                  </>
                )}
              </span>
            </div>

            {/* Proportion bar. Hidden when every stage is £0 — a bar with no
                width to divide would render as an empty rule and imply the
                card had failed to load rather than that nothing has a value. */}
            {totalActiveValue > 0 && (
              <div className="flex gap-0.5 mb-3.5 overflow-hidden" style={{ height: 8, borderRadius: 999 }}>
                {activeStages.filter(st => st.value > 0).map(st => (
                  <span key={st.id} style={{ width: `${(st.value / totalActiveValue) * 100}%`, background: BAR[st.id] ?? '#D8D3C8' }} />
                ))}
              </div>
            )}

            {/* Tiles are secondary now, so they fit at half width. The value is
                pinned to the bottom with mt-auto so all four numbers sit on one
                baseline however long the label wraps. */}
            <a href="/dashboard/pipeline" className="grid grid-cols-4 gap-2.5 hover:opacity-95 transition-opacity">
              {activeStages.map(st => (
                <div key={st.id} className="flex flex-col px-3 py-3 rounded-xl" style={{ background: st.bg, minHeight: 104, overflow: 'hidden' }}>
                  <span className="text-[9px] font-bold uppercase tracking-widest truncate" style={{ color: st.labelCol, fontFamily: 'var(--font-space-grotesk)' }}>
                    {st.label}
                  </span>
                  <span className="block font-display font-semibold leading-none truncate mt-auto"
                    style={{ color: st.valCol, fontSize: 'clamp(17px, 1.9vw, 25px)', letterSpacing: '-0.02em' }}>
                    {st.value > 0 ? formatCurrency(st.value) : '—'}
                  </span>
                  <span className="block text-[10.6px] mt-1.5 truncate" style={{ color: st.countCol }}>
                    {st.count > 0 ? (st.count === 1 ? '1 opportunity' : st.count + ' opportunities') : 'None yet'}
                  </span>
                </div>
              ))}
            </a>
          </>
        )}
      </div>
    )
  })()


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

      {/* ── Act-now strip ──────────────────────────────────────────────────
          Deliberately empty. The strip is the only genuinely new component on
          this page and the piece with the widest gap between specced and known
          good, so it is built last and kept separable: if the date gets tight
          it can slip a week without holding the four finished cards back.
          Slot reserved here so adding it does not move anything again. */}

      {/* What is out there — matches beside the deadlines they run against. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8 items-start">
        <div>
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
          { key: 'strong',  label: 'Strong',          count: qualityCounts.strong,  colour: MATCH_TIER.strong.dot },
          { key: 'good',    label: 'Good',            count: qualityCounts.good,    colour: MATCH_TIER.good.dot },
          { key: 'partial', label: 'Worth exploring', count: qualityCounts.partial, colour: MATCH_TIER.partial.dot },
        ]
        /**
         * Five scopes, pre-scored here on the server.
         *
         * Everything the filter needs is handed to the client component as
         * props, so flipping a tab is synchronous and offline — no fetch, no
         * spinner, no loading state to design.
         *
         * The old TYPE_BAR lived here and is gone with the chart it fed. Its
         * `accelerator` and `blended_finance` entries were unreachable anyway:
         * the pool is filtered by CANONICAL_TYPES before scoring, so neither
         * ever arrives. The validated palette now lives in MatchesCard.
         */
        const TYPE_KEYS = ['grant', 'programme', 'investment', 'in_kind'] as const

        const shapeRow = (m: typeof scoredAll[number]): MatchRow => {
          const amt = m.grant.amountMin || m.grant.amountMax
            ? (m.grant.amountMin && m.grant.amountMax && m.grant.amountMin !== m.grant.amountMax
                ? `${formatCurrency(m.grant.amountMin)}–${formatCurrency(m.grant.amountMax)}`
                : formatCurrency(m.grant.amountMax || m.grant.amountMin || 0))
            : 'Amount on application'

          let deadlineLabel: string | null = null
          let deadlineTone: 'urgent' | 'plain' | 'quiet' | null = null
          if (m.grant.isRolling) {
            deadlineLabel = 'Rolling'; deadlineTone = 'plain'
          } else if (m.grant.deadline) {
            const parts = m.grant.deadline.split('-').map(Number)
            if (parts.length === 3) {
              const due  = new Date(parts[0], parts[1] - 1, parts[2])
              const days = Math.round((due.getTime() - Date.now()) / 86400000)
              deadlineLabel = days < 0 ? 'Overdue' : days === 0 ? 'Today' : days === 1 ? 'Tomorrow'
                : days <= 30 ? `${days}d left`
                : due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
              deadlineTone = days <= 30 ? 'urgent' : 'plain'
            }
          }
          if (!deadlineLabel) {
            // A shut fund expected back. Without this the slot rendered blank
            // and a closed fund looked entirely live.
            const reopens = formatNextOpen(m.grant.nextOpenDate)
            if (reopens) { deadlineLabel = reopens; deadlineTone = 'quiet' }
          }

          return {
            id: m.grant.id,
            title: m.grant.title,
            meta: `${m.grant.funder} · ${amt}`,
            score: m.score,
            fundingType: ((m.grant.fundingType ?? 'grant') as TypeKey),
            deadlineLabel,
            deadlineTone,
            isInviteOnly: !!m.grant.isInviteOnly,
          }
        }

        const emptyTiers = { strong: 0, good: 0, partial: 0, weak: 0 }
        const matchScopes: MatchScope[] = [
          { key: 'all' as ScopeKey, actionable: actionableCount, tiers: qualityCounts, top: scoredAll.slice(0, 3).map(shapeRow) },
          ...TYPE_KEYS.map(k => ({
            key: k as ScopeKey,
            actionable: typeCounts[k] ?? 0,
            tiers: tiersByType[k] ?? emptyTiers,
            top: scoredAll.filter(m => (m.grant.fundingType ?? 'grant') === k).slice(0, 3).map(shapeRow),
          })),
        ]

        return (
          <MatchesCard scopes={matchScopes} totalScored={totalMatchCount} />
        )
      })()}

        </div>
        <div>
        {/* Upcoming deadlines. Height is matched to the matches card beside
            it and the list runs to fill it.

            It used to cap the list at 170px and scroll inside it, which showed
            three rows while 400px of card sat empty below — a scrollbar in a
            card with room to spare. It also put the whole 30-day urgency line
            off the bottom: with three rows everything was red and the signal
            did no work, because you could not see where urgent stopped.

            NO min-height, deliberately. Six rows lands near the matches card's
            394px on its own, and forcing it there when a user has two deadlines
            would put a hole INSIDE a white card — the same bug that moved
            pipeline out of row 2. The row grid is items-start, so a short card
            leaves page background instead. */}
        <div className="card rounded-xl flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Upcoming deadlines</h3>
              {alerts.length > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{ background: '#F0EDE2', color: '#5F5E5A', fontFamily: 'var(--font-space-grotesk)' }}>
                  {alerts.length}
                </span>
              )}
            </div>
            {/* No count on this link, deliberately. `alerts` is a window, not
                a total: catalogue rows are capped at 6 and the merged list at
                15, so "View all 7" would state a figure that is really the cap
                we happened to stop at. The badge counts what this card holds,
                which is what a badge on a card means; the link makes no claim
                about what the deadlines page will show. */}
            <a href="/dashboard/deadlines" style={CARD_LINK}>
              View all deadlines →
            </a>
          </div>

          {alerts.length === 0 ? (
            <div className="text-center py-6 text-mid">
              <p className="text-sm">No deadlines yet.</p>
              <p className="text-xs mt-1">They&rsquo;ll appear here as you save opportunities.</p>
            </div>
          ) : (
            <>
              {/* Six rows, measured against the 394px card: header, six rows at
                  ~51px and the footer come to ~406px, so the card fills without
                  the last row being clipped. The header link carries the rest.
                  Fewer than six is fine — the row grid is items-start, so the
                  space below is page background rather than a hole in a card. */}
              <div>
                {alerts.slice(0, DEADLINE_ROWS_SHOWN).map(row => {
                  const dateObj = formatDeadlineDate(row.deadline)
                  const d = row.daysUntil
                  /**
                   * Two channels, two different things.
                   *
                   * The RAIL carries funding type — categorical, so it takes a
                   * hue straight from the validated set.
                   *
                   * The DATE TILE carries urgency — sequential, which colour can
                   * only do in a few large steps, so it gets three: solid inside
                   * a week, tint to thirty days, warm neutral beyond.
                   *
                   * The row itself is NOT tinted the way a match row is. The
                   * pale countdown pill composites to 1.00–1.04:1 over a funding
                   * type tint, which is invisible, so the pill would have to go
                   * solid to survive it. And these rows are nearly all grants,
                   * so tinting them would produce six near-identical green rows:
                   * more colour, less information.
                   */
                  const hot  = d <= 7
                  const soon = d > 7 && d <= 30
                  const rail = row.fundingType ? TYPE_RAIL[row.fundingType] : 'rgba(29,60,62,0.16)'
                  const pillLabel = d < 0 ? 'Overdue' : d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `${d}d`
                  const tileBg  = hot ? '#993C1D' : soon ? '#FAECE7' : '#F1EDE3'
                  const dayCol  = hot ? '#FDF6F3' : soon ? '#993C1D' : '#2C2C2A'
                  const monCol  = hot ? 'rgba(253,246,243,0.82)' : soon ? '#993C1D' : '#5F5E5A'
                  const pillSty = hot
                    ? { color: '#993C1D', border: '1px solid rgba(153,60,29,0.45)', background: 'transparent' }
                    : soon
                      ? { color: '#993C1D', border: '1px solid transparent', background: '#FAECE7' }
                      : { color: '#5F5E5A', border: '1px solid rgba(29,60,62,0.20)', background: 'transparent' }
                  return (
                    <a key={row.id} href={row.href}
                      className="flex items-center gap-3 mb-1.5 last:mb-0 hover:bg-[#F7F5EF] transition-colors"
                      style={{ padding: '7px 11px', borderRadius: 10, borderLeft: `5px solid ${rail}`, background: '#FAF9F5' }}>
                      {dateObj ? (
                        <div className="flex-shrink-0 text-center" style={{ width: 40, borderRadius: 9, padding: '5px 0 6px', background: tileBg }}>
                          <span className="block text-[8.5px] font-bold uppercase" style={{ color: monCol, letterSpacing: '0.08em', fontFamily: 'var(--font-space-grotesk)' }}>{dateObj.month}</span>
                          <span className="block text-[17px] font-bold" style={{ color: dayCol, lineHeight: 1.05, fontFamily: 'var(--font-space-grotesk)' }}>{dateObj.day}</span>
                        </div>
                      ) : (
                        <div className="flex-shrink-0" style={{ width: 40 }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-charcoal truncate">{row.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide" style={pillSty}>
                            {pillLabel}
                          </span>
                          {row.amountStr && <span className="text-[11px]" style={{ color: '#74736E' }}>{row.amountStr}</span>}
                        </div>
                      </div>
                    </a>
                  )
                })}
              </div>
              {/* Says where these came from. Without it the card looks like a
                  list of things the user entered, and they entered none of them. */}
              <p className="mt-auto pt-3" style={{ fontSize: 11.8, color: '#74736E', borderTop: '1px solid rgba(29,60,62,0.10)' }}>
                From your matches. Deadlines you add to your pipeline appear here too.
              </p>
            </>
          )}
        </div>
        </div>
      </div>

      {/* ── Your work band (cohort/builder only): resume in-flight work before
          scanning new matches. Empty state steers to the project route. ── */}
      {builderAllowed && !hasWork && (
        <div className="card rounded-xl mb-8" style={{ padding: 28, display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 28, alignItems: 'center' }}>
          <div>
            <div style={{ width: 46, height: 46, borderRadius: 999, background: '#E3F0E4', color: '#1B6B3D', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Lightbulb size={23} />
            </div>
            <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 22, fontWeight: 600, color: '#1D3C3E', letterSpacing: '-0.02em', marginBottom: 8 }}>Start your first project</div>
            <p className="text-mid" style={{ fontSize: 14.5, lineHeight: 1.6, marginBottom: 20, maxWidth: 420 }}>
              Describe what you need funded once. We&apos;ll match it against the{' '}
              <span style={{ color: '#2C2C2A', fontWeight: 500 }}>{totalMatchCount} funders that already fit your organisation</span>,
              then help you build a tailored application for each one you choose.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
              <a href="/dashboard/projects/new" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#1D3C3E', color: '#F6F1E7', fontFamily: 'var(--font-space-grotesk)', fontSize: 14.5, fontWeight: 600, padding: '12px 22px', borderRadius: 999, textDecoration: 'none' }}>
                <Lightbulb size={16} /> Describe a project
              </a>
              <a href="/dashboard/applications/new" style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 14, fontWeight: 600, color: '#1D3C3E', borderBottom: '1.5px solid rgba(29,60,62,0.24)', paddingBottom: 1, textDecoration: 'none' }}>
                Know which funder to apply to? Start a direct application →
              </a>
            </div>
          </div>
          {/* Deep circles with a cream numeral rather than the four homepage
              accents used on Projects and Connect. Those carry a size floor —
              the numeral has to be 19px bold on a 44px circle to clear 3:1 on
              terracotta — and this list is a compact aside inside a band, with
              no room for it. Deep on cream passes at any size, so the compact
              shape stays honest instead of shrinking a treatment that would
              then fail. */}
          <div style={{ background: '#FAF9F5', border: '1px solid rgba(29,60,62,0.10)', borderRadius: 16, padding: 22 }}>
            {[
              { t: 'Describe it once', b: 'A few sentences or paste an old plan.' },
              { t: 'See who fits', b: 'We rank funders against your project.' },
              { t: 'Apply to each', b: 'Build a tailored application per funder.' },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: i < 2 ? 16 : 0 }}>
                <span style={{ width: 26, height: 26, borderRadius: 999, background: '#1D3C3E', color: '#F6F1E7', fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                <div>
                  <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 13.5, fontWeight: 600, color: '#1D3C3E' }}>{s.t}</div>
                  <div className="text-mid" style={{ fontSize: 12 }}>{s.b}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Row 2. Pipeline sits in the right column under projects rather than in
          a full-width row of its own.

          Projects cannot fill half a row on its own — two projects against four
          applications leaves a hole INSIDE a white card, which reads as broken
          rather than as spacing, and no honest amount of content fixes it.
          Stacking pipeline under it makes the two columns run to roughly the
          same length and loses the page a row.

          This reverses the pass-1 call that pipeline needed full width. That was
          true of the four-equal-tiles version, which had four tiles plus a footer
          carrying the total. Variant A promotes the total to a headline and pulls
          declined up beside it, so the tiles are secondary and fit at half width.

          items-start so neither column stretches to the other: leftover space
          becomes page background, never a gap inside a card. */}
      {builderAllowed && hasWork ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8 items-start">
          {/* Your applications */}
          <div className="card rounded-xl p-6">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 700, color: '#1D3C3E' }}>Your applications</span>
              <a href="/dashboard/applications" style={CARD_LINK}>
                View all{workApps.length > 4 ? ` ${workApps.length}` : ''} →
              </a>
            </div>
            <p className="text-mid" style={{ fontSize: 12.5, marginBottom: 12 }}>Newest first.</p>
            {workApps.length === 0 ? (
              <p className="text-mid" style={{ fontSize: 13.5, lineHeight: 1.55 }}>No applications yet. Pick a funder from a project to start one.</p>
            ) : (() => {
              /* Grouped, because "Continue writing" was wrong for the half of
                 them sitting at 0 of 8 — never opened, nothing to continue.
                 Started rows keep the progress bar; not-started show the
                 question count, which is the only useful number they have.

                 The second line is funder plus timestamp rather than the
                 project name the design called for: project_id is null on
                 every application because the creation flow has no picker.
                 The slot and geometry are the designed ones, so the day that
                 changes, the project name and colour drop straight in and
                 nothing moves. It deliberately says NOTHING about the missing
                 project — a label that fires on every row for every user, about
                 a gap they cannot close, is chrome rather than a warning. */
              const shown     = workApps.slice(0, 4)
              const started   = shown.filter(a => a.answered > 0)
              const notStarted = shown.filter(a => a.answered === 0)
              const groups: { label: string; rows: WorkApp[] }[] = [
                { label: 'In progress', rows: started },
                { label: 'Not started', rows: notStarted },
              ].filter(g => g.rows.length > 0)

              return groups.map(group => (
                <div key={group.label} style={{ marginTop: 4 }}>
                  <p style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 11, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#5F5E5A', margin: '10px 0 2px' }}>
                    {group.label}
                  </p>
                  {group.rows.map(a => {
                    const mono = (a.funder || a.title).trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
                    const pct  = a.total > 0 ? Math.round((a.answered / a.total) * 100) : 0
                    const when = a.answered > 0
                      ? whenLabel(a.updatedAt ?? a.createdAt, 'Edited')
                      : whenLabel(a.createdAt ?? a.updatedAt, 'Started')
                    const hue    = projectHue(a.projectId)
                    const pName  = a.projectId ? projectName.get(a.projectId) ?? null : null
                    const second = [pName, a.funder, when].filter(Boolean).join(' · ')
                    return (
                      <a key={a.id} href={`/dashboard/applications/${a.id}`} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: '1px solid rgba(29,60,62,0.08)', textDecoration: 'none' }}>
                        {/* The project's hue when it has one, neutral when it
                            does not. Every row is neutral today — see the note
                            on PROJECT_HUES. */}
                        <span style={{ width: 40, height: 40, borderRadius: 11, background: hue ?? '#F1EDE3', color: '#1D3C3E', fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{mono}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 15, fontWeight: 500, color: '#1D3C3E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
                          {second && (
                            <div className="text-mid" style={{ fontSize: 12.5, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              {hue && <span style={{ width: 8, height: 8, borderRadius: 2, background: hue, flexShrink: 0 }} />}
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{second}</span>
                            </div>
                          )}
                          {a.answered > 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                              <span style={{ height: 6, flex: 1, maxWidth: 150, background: 'rgba(29,60,62,0.15)', borderRadius: 999, overflow: 'hidden' }}>
                                <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: '#1D3C3E' }} />
                              </span>
                              <span className="text-mid" style={{ fontSize: 12 }}>{a.answered} of {a.total}</span>
                            </div>
                          ) : (
                            <div className="text-mid" style={{ fontSize: 12, marginTop: 5 }}>{a.total} question{a.total === 1 ? '' : 's'}</div>
                          )}
                        </div>
                      </a>
                    )
                  })}
                </div>
              ))
            })()}
          </div>

          <div className="flex flex-col gap-5">
          {/* Your projects */}
          <div className="card rounded-xl p-6">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 700, color: '#2C2C2A' }}>Your projects</span>
              <a href="/dashboard/projects" style={CARD_LINK}>View all →</a>
            </div>
            {workProjects.length === 0 ? (
              <p className="text-mid" style={{ fontSize: 13.5, lineHeight: 1.55, marginBottom: 12 }}>Describe a project to match more funders than your organisation profile alone.</p>
            ) : workProjects.slice(0, 4).map((p, i, arr) => (
              <a key={p.id} href={`/dashboard/projects/${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(23,52,4,0.06)' : 'none', textDecoration: 'none' }}>
                {/* The project's own hue. This is the live half of the pair:
                    projects have ids, so the colour is real here even while the
                    applications side waits for a picker. */}
                <span style={{ width: 40, height: 40, borderRadius: 11, background: projectHue(p.id) ?? '#F1EDE3', color: '#1D3C3E', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Lightbulb size={19} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 15, fontWeight: 500, color: '#2C2C2A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, fontSize: 12.5 }}>
                    {p.ready
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#1B6B3D', fontWeight: 600 }}><CircleCheck size={13} /> Ready to match</span>
                      : <span className="text-mid">Needs a few more details</span>}
                    {p.fitCount != null && p.fitCount > 0 ? <span className="text-mid">· {p.fitCount} funders fit</span> : null}
                    {p.budget ? <span className="text-mid">· £{p.budget.toLocaleString('en-GB')}</span> : null}
                    {(() => {
                      // Zero is not printed: with no picker every project has
                      // zero applications, and "0 applications" on every row
                      // states a gap the user has no way to close.
                      const n = workApps.filter(a => a.projectId === p.id).length
                      return n > 0 ? <span className="text-mid">· {n} application{n === 1 ? '' : 's'}</span> : null
                    })()}
                  </div>
                </div>
                {/* "19 funders fit" was a number with nothing to do about it
                    from here. The row has always linked to the project page,
                    where the live matching runs; this makes that visible. */}
                <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 11.6, fontWeight: 600, color: '#1D3C3E', border: '1.5px solid rgba(29,60,62,0.26)', borderRadius: 999, padding: '6px 12px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {p.ready ? 'Find funders →' : 'Finish setup →'}
                </span>
              </a>
            ))}
            {/* A dashed row rather than a bare text link. It was the only
                unadorned link on the page and read as an afterthought next to
                the rows it sits under. */}
            <a href="/dashboard/projects/new"
              className="flex items-center gap-3 mt-3 hover:bg-[#FAFAF7] transition-colors"
              style={{ padding: 12, border: '1.5px dashed rgba(29,60,62,0.22)', borderRadius: 12, textDecoration: 'none', fontFamily: 'var(--font-space-grotesk)', fontSize: 13, fontWeight: 600, color: '#1D3C3E' }}>
              <span style={{ width: 26, height: 26, borderRadius: 8, background: '#F1EDE3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>+</span>
              New project
            </a>
          </div>
          {pipelineCard}
          </div>
        </div>
      ) : (
        /* No builder work to show, so pipeline keeps the full-width row it had. */
        <div className="mb-8">{pipelineCard}</div>
      )}




    </div>
  )
}

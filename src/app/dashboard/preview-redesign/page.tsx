// PREVIEW — proposed dashboard reorder for review on 2026-05-11.
// Same data as /dashboard, different layout shape:
//   1. Compact greeting (one line)
//   2. Breadth panel (one strip, "Your funding landscape")
//   3. New matches (4 cards in a single row, header link with dynamic count)
//   4. Pipeline + Upcoming deadlines (existing two-column layout, moved below)
//
// Goal: get matches above the fold for desktop users; pipeline + deadlines
// stay accessible but framed as workflow state, not primary content.
//
// Delete this file once we've decided whether to ship the reorder to the
// main /dashboard route.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'
import type { PipelineItem, Organisation, FundingType, LegalStructure } from '@/types'
import { ArrowRight } from 'lucide-react'
import { computeMatchScore } from '@/lib/matching'
import { normaliseScrapedGrant } from '@/lib/grants-normalise'

function formatDeadlineDate(deadline: string | null): { month: string; day: string } | null {
  if (!deadline) return null
  const parts = deadline.split('-').map(Number)
  if (parts.length !== 3) return null
  return {
    month: new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString('en-GB', { month: 'short' }).toUpperCase(),
    day:   String(parts[2]).padStart(2, '0'),
  }
}

// Mirror of the matching engine's structure-token expansion so the breadth
// panel reflects what the eligibility engine would actually pass.
const STRUCTURE_TOKEN_MAP: Record<string, string[]> = {
  cic_guarantee:      ['cic', 'cic_guarantee', 'community_interest_company'],
  cic_shares:         ['cic', 'cic_shares', 'community_interest_company'],
  cio:                ['cio', 'charity', 'registered_charity', 'charitable_incorporated_organisation'],
  registered_charity: ['charity', 'registered_charity'],
  ltd_guarantee:      ['ltd', 'company_limited_by_guarantee', 'social_enterprise'],
  ltd_shares:         ['ltd', 'social_enterprise', 'company_limited_by_shares'],
  llp:                ['llp', 'partnership'],
  cooperative:        ['coop', 'cooperative', 'community_benefit_society'],
  unincorporated:     ['unincorporated', 'community_group', 'voluntary_group'],
  sole_trader:        ['sole_trader', 'individual'],
  not_registered:     ['not_registered', 'idea_stage'],
}
function structureMatches(orgStructure: string, allowed: string[]): boolean {
  if (!allowed || allowed.length === 0) return true
  const orgTokens = new Set(STRUCTURE_TOKEN_MAP[orgStructure] ?? [orgStructure])
  return allowed.some(s => (STRUCTURE_TOKEN_MAP[s] ?? [s]).some(t => orgTokens.has(t)))
}

const TYPE_LABEL: Record<string, string> = {
  grant: 'grants', programme: 'programmes', investment: 'investment',
  in_kind: 'in-kind', accelerator: 'accelerators', blended_finance: 'blended finance',
}
const TYPE_CHIP: Record<string, { bg: string; fg: string }> = {
  grant:      { bg: '#F1F7E4', fg: '#3B6D11' },
  programme:  { bg: '#FAECE7', fg: '#993C1D' },
  investment: { bg: '#E6F1FB', fg: '#0C447C' },
  in_kind:    { bg: '#FAEEDA', fg: '#854F0B' },
  accelerator:    { bg: '#F1F7E4', fg: '#3B6D11' },
  blended_finance:{ bg: '#E6F1FB', fg: '#0C447C' },
}

export default async function DashboardPreviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: org } = await supabase
    .from('organisations').select('*').eq('owner_id', user.id)
    .order('created_at', { ascending: true }).limit(1)
    .then(r => ({ data: r.data?.[0] ?? null }))
  const typedOrg = org as Organisation | null
  if (!typedOrg) redirect('/onboarding/welcome')

  const { data: rawItems } = await supabase
    .from('pipeline_items').select('*').eq('org_id', typedOrg.id)
    .order('created_at', { ascending: false })
  const items: PipelineItem[] = rawItems ?? []

  // ── Matched opportunities (same query as production) ─────────────────────
  const today = new Date().toISOString().split('T')[0]
  const { data: grantRows } = await supabase
    .from('grants_with_funder').select('*')
    .eq('is_active', true).neq('url_status', 'dead')
    .or(`is_rolling.eq.true,deadline.is.null,deadline.gte.${today}`)
    .order('last_seen_at', { ascending: false }).limit(500)

  type ScoredGrant = { grant: ReturnType<typeof normaliseScrapedGrant>; score: number; eligibleStructures: string[] | null; fundingType: string }
  const scoredAll: ScoredGrant[] = (grantRows ?? [])
    .map(row => {
      const g = normaliseScrapedGrant(row as Record<string, unknown>)
      const score = computeMatchScore(g, typedOrg).score
      if (score <= 0) return null
      return {
        grant: g,
        score,
        eligibleStructures: g.eligibleStructures as string[] | null,
        fundingType: (g.fundingType ?? 'grant') as string,
      }
    })
    .filter((x): x is ScoredGrant => x !== null)
    .sort((a, b) => b.score - a.score)

  const totalMatchCount = scoredAll.length

  // ── Breadth panel: count opportunities accessible to this org's structure
  // by funding type. Uses the same structure-matching logic the eligibility
  // engine uses so the numbers reflect what they could actually apply to.
  const orgStructure = (typedOrg.legal_structure ?? '') as string
  const accessibleByType = new Map<string, number>()
  let accessibleTotal = 0
  for (const row of grantRows ?? []) {
    const r = row as Record<string, unknown>
    if (r.is_active !== true) continue
    const es = r.eligible_structures as string[] | null
    if (orgStructure && es && es.length > 0 && !structureMatches(orgStructure, es)) continue
    const ft = (r.funding_type as string) ?? 'grant'
    accessibleByType.set(ft, (accessibleByType.get(ft) ?? 0) + 1)
    accessibleTotal += 1
  }
  const breadthChips: Array<{ type: string; label: string; count: number }> =
    Array.from(accessibleByType.entries())
      .filter(([, n]) => n > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([type, count]) => ({ type, count, label: TYPE_LABEL[type] ?? type }))

  // ── Top 4 matches (was 3 in production — preview shows 4 to test layout) ─
  const matchedGrants = scoredAll.slice(0, 4).map(p => {
    const g = p.grant
    const amountStr = g.amountMin || g.amountMax
      ? (g.amountMin && g.amountMax && g.amountMin !== g.amountMax
          ? `${formatCurrency(g.amountMin)} – ${formatCurrency(g.amountMax)}`
          : formatCurrency(g.amountMax || g.amountMin || 0))
      : 'Amount on application'
    return {
      id: g.id, title: g.title, funder: g.funder,
      amountStr, fundingType: g.fundingType ?? 'grant',
      scorePct: Math.round(p.score),
      searchHref: `/dashboard/search?grant=${encodeURIComponent(g.id)}`,
    }
  })

  // ── Pipeline tonal ladder (unchanged from production) ────────────────────
  const stageData = [
    { id: 'identified', label: 'Identified', bg: '#F5F1E8', labelCol: '#5F5E5A',                valCol: '#2C2C2A',     countCol: '#5F5E5A' },
    { id: 'applying',   label: 'Applying',   bg: '#EAF3DE', labelCol: '#3F6814',                valCol: '#173404',     countCol: '#3F6814' },
    { id: 'submitted',  label: 'Submitted',  bg: '#C0DD97', labelCol: '#3F6814',                valCol: '#173404',     countCol: '#3F6814' },
    { id: 'won',        label: 'Won',        bg: '#639922', labelCol: 'rgba(250,247,242,0.78)', valCol: '#FAF7F2',     countCol: 'rgba(250,247,242,0.78)' },
    { id: 'declined',   label: 'Declined',   bg: '#FAECE7', labelCol: '#993C1D',                valCol: '#993C1D',     countCol: '#993C1D' },
  ]
  const stageValues = stageData.map(s => ({
    ...s,
    count: items.filter(i => i.stage === s.id).length,
    value: items.filter(i => i.stage === s.id).reduce((sum, i) => sum + (i.amount_max ?? i.amount_requested ?? 0), 0),
  }))

  // ── Upcoming deadlines (next 3) — same logic as production ───────────────
  type DlRow = { id: string; name: string; deadline: string; daysUntil: number; amountStr: string | null; href: string }
  function parseDaysUntil(dl: string): number {
    const parts = dl.split('-').map(Number)
    return Math.round((new Date(parts[0], parts[1] - 1, parts[2]).getTime() - Date.now()) / 86400000)
  }
  const pipelineRows: DlRow[] = items.filter(i => !!i.deadline).map(i => ({
    id: `pl-${i.id}`, name: i.grant_name, deadline: i.deadline as string,
    daysUntil: parseDaysUntil(i.deadline as string),
    amountStr: (i.amount_max ?? i.amount_requested) ? formatCurrency(i.amount_max ?? i.amount_requested ?? 0) : null,
    href: '/dashboard/deadlines',
  })).sort((a, b) => a.daysUntil - b.daysUntil)
  const catalogueRows: DlRow[] = scoredAll
    .filter(x => x.grant.deadline && parseDaysUntil(x.grant.deadline) >= 0)
    .filter(x => !pipelineRows.some(p => p.name.toLowerCase() === x.grant.title.toLowerCase()))
    .slice(0, 6)
    .map(x => {
      const g = x.grant
      return {
        id: `cat-${g.id}`, name: g.title, deadline: g.deadline as string,
        daysUntil: parseDaysUntil(g.deadline as string),
        amountStr: g.amountMin || g.amountMax ? formatCurrency(g.amountMax || g.amountMin || 0) : null,
        href: `/dashboard/search?grant=${encodeURIComponent(g.id)}`,
      }
    })
  const alerts: DlRow[] = [...pipelineRows, ...catalogueRows].sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 3)

  // ── Greeting ─────────────────────────────────────────────────────────────
  const rawName: string =
    (user.user_metadata?.first_name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ?? user.email ?? ''
  const displayName = (() => {
    const cleaned = rawName.includes('@')
      ? rawName.split('@')[0].replace(/\d+$/, '').replace(/\./g, ' ')
      : rawName.trim()
    if (!cleaned) return 'there'
    const first = cleaned.split(/\s+/)[0]
    return first.charAt(0).toUpperCase() + first.slice(1)
  })()
  const hour = new Date().getHours()
  const greetingTime = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const inProgressCount = items.filter(i => ['applying', 'submitted'].includes(i.stage)).length

  // Structure label for the breadth-panel headline
  const structureLabel: Record<string, string> = {
    cic_guarantee: 'CIC',
    cic_shares: 'CIC',
    cio: 'CIO',
    registered_charity: 'registered charity',
    ltd_guarantee: 'limited company',
    ltd_shares: 'social enterprise',
    cooperative: 'co-operative',
    unincorporated: 'unincorporated group',
    sole_trader: 'sole trader',
    llp: 'LLP',
    not_registered: 'organisation',
  }
  const orgStructureLabel = structureLabel[orgStructure] ?? 'organisation'

  return (
    <div>
      {/* Preview banner */}
      <div className="mb-4 px-3 py-2 rounded-md text-xs" style={{ background: '#FFF7E0', border: '1px solid #E8D384', color: '#7A5A0A', fontFamily: 'var(--font-space-grotesk)' }}>
        <strong>Preview layout</strong> — proposed reorder for review. Live dashboard at <a href="/dashboard" className="underline">/dashboard</a>.
      </div>

      {/* 1. COMPACT GREETING */}
      <div className="mb-5 flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.02em' }}>
          {greetingTime}, {displayName}.
        </h2>
        <p className="text-xs text-mid">
          {inProgressCount > 0 && `${inProgressCount} application${inProgressCount === 1 ? '' : 's'} in progress · `}
          {totalMatchCount} live matches
        </p>
      </div>

      {/* 2. BREADTH PANEL */}
      <div className="mb-6 rounded-xl px-5 py-4" style={{ background: 'linear-gradient(135deg, #F1F8E4 0%, #FAFAF7 100%)', border: '1px solid #E4E2DA' }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#5F5E5A', fontFamily: 'var(--font-space-grotesk)' }}>
              Your funding landscape
            </span>
            <span className="text-2xl font-bold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)', letterSpacing: '-0.02em' }}>
              {accessibleTotal}
            </span>
            <span className="text-sm" style={{ color: '#5F5E5A' }}>
              opportunities open to your {orgStructureLabel}
            </span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {breadthChips.map(c => {
            const chip = TYPE_CHIP[c.type] ?? TYPE_CHIP.grant
            return (
              <span key={c.type}
                className="inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-md text-xs"
                style={{ background: chip.bg, color: chip.fg, fontFamily: 'var(--font-space-grotesk)' }}>
                <span className="font-bold">{c.count}</span>
                <span className="font-medium">{c.label}</span>
              </span>
            )
          })}
        </div>
      </div>

      {/* 3. NEW MATCHES — 4 cards in a single row */}
      {matchedGrants.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
              New matches
            </h3>
            <a href="/dashboard/search" className="text-xs font-semibold hover:underline" style={{ color: '#3B6D11', fontFamily: 'var(--font-space-grotesk)' }}>
              See all {totalMatchCount} matches →
            </a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {matchedGrants.map(g => {
              const t = TYPE_CHIP[g.fundingType] ?? TYPE_CHIP.grant
              const tLabel = (TYPE_LABEL[g.fundingType] ?? g.fundingType).replace(/s$/, '')
              return (
                <a key={g.id} href={g.searchHref}
                  className="bg-white rounded-xl p-5 flex flex-col hover:-translate-y-0.5 transition-all group"
                  style={{ border: '1px solid rgba(23,52,4,0.08)', boxShadow: '0 2px 10px rgba(26,46,43,0.04)' }}>
                  <div className="mb-3">
                    <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider"
                      style={{ background: t.bg, color: t.fg }}>
                      {tLabel}
                    </span>
                  </div>
                  <h4 className="text-[15px] font-semibold text-charcoal leading-snug mb-0.5 line-clamp-2" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                    {g.title}
                  </h4>
                  <p className="text-xs mb-3 truncate" style={{ color: '#5F5E5A' }}>{g.funder || ' '}</p>
                  <p className="text-[13px] font-semibold text-charcoal mb-3" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{g.amountStr}</p>
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
          </div>
        </div>
      )}

      {/* 4. PIPELINE + DEADLINES (unchanged from production, moved below matches) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Pipeline */}
        <div className="md:col-span-2 card rounded-xl">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-xl font-bold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Pipeline</h3>
            <a href="/dashboard/pipeline" className="text-xs font-semibold hover:underline" style={{ color: '#8ECB3C', fontFamily: 'var(--font-space-grotesk)' }}>View pipeline →</a>
          </div>
          <a href="/dashboard/pipeline" className="flex rounded-xl overflow-hidden hover:opacity-95 transition-opacity" style={{ height: 160 }}>
            {stageValues.map(s => {
              const maxVal = Math.max(...stageValues.map(x => x.value).filter(v => v > 0), 100000)
              const FLOOR = maxVal / 12
              const grow = Math.max(s.value, FLOOR)
              return (
                <div key={s.id} className="flex flex-col justify-between px-4 py-3.5"
                  style={{ flexGrow: grow, flexShrink: 0, flexBasis: 110, background: s.bg, minWidth: 110, overflow: 'hidden' }}>
                  <span className="text-[10px] font-bold uppercase tracking-widest truncate" style={{ color: s.labelCol }}>{s.label}</span>
                  <div>
                    <span className="block font-display font-bold leading-none truncate"
                      style={{ color: s.valCol, fontSize: 'clamp(18px, 2.2vw, 30px)' }}>
                      {s.value > 0 ? formatCurrency(s.value) : (s.count > 0 ? s.count : '—')}
                    </span>
                    <span className="block text-[10px] font-semibold mt-1.5 truncate" style={{ color: s.countCol }}>
                      {s.count > 0 ? (s.count === 1 ? '1 opportunity' : s.count + ' opportunities') : 'None yet'}
                    </span>
                  </div>
                </div>
              )
            })}
          </a>
        </div>

        {/* Upcoming deadlines */}
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
                const pillCls = d <= 7 ? 'bg-[#FAECE7] text-[#993C1D]' : 'bg-transparent text-[#5F5E5A] border border-[rgba(23,52,4,0.20)]'
                return (
                  <a key={row.id} href={row.href}
                    className="flex items-center gap-3 py-2.5 border-b border-warm last:border-0 hover:bg-[#FAFAF7] -mx-2 px-2 rounded-md transition-colors">
                    {dateObj ? (
                      <div className="flex flex-col items-center flex-shrink-0 w-9 text-center">
                        <span className="text-[9px] font-bold text-mid uppercase">{dateObj.month}</span>
                        <span className="text-lg font-bold text-charcoal leading-none">{dateObj.day}</span>
                      </div>
                    ) : (<div className="w-9 flex-shrink-0" />)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-charcoal truncate">{row.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide ${pillCls}`}>{pillLabel}</span>
                        {row.amountStr && <span className="text-[10px] text-mid">{row.amountStr}</span>}
                      </div>
                    </div>
                  </a>
                )
              })}
            </div>
          )}
          <div className="mt-4 pt-3" style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
            <a href="/dashboard/deadlines" className="text-xs font-semibold hover:underline" style={{ color: '#8ECB3C', fontFamily: 'var(--font-space-grotesk)' }}>
              View all deadlines →
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

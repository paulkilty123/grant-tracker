'use client'

// Briefing page (redesign §2, v3, amendment §2/§3) — a DETERMINISTIC render of
// tool payloads. Load-bearing numbers come from get_plan_state / get_briefing /
// get_pipeline; the authored "My read" + agenda come from the guidance layer.
// Layout: wide (≥1100px) is a two-column grid — a flexing main column (hero +
// moves) and a sticky adviser rail (My read + ask). Below 1100px it folds to the
// v3 stacked order (hero → read → ask → moves) with the overlay drawer. Design
// grammar (ui.tsx): one hero number; two lime accents (move 1 + the rail/ask
// bar); the ti-bulb marks adviser judgment; one funding-character colour system.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { BriefingPayload, PlanStatePayload } from '@/lib/agent/tools/plan'
import type { GetPipelinePayload } from '@/lib/agent/tools/pipeline'
import { buildConsiderations, topDeadlineChip, type Move } from '@/lib/agent/considerations'
import { openCompanion } from './CompanionOpenLink'
import { grotesk, gbp, fmtDate, COLOR, HeroNumber, SectionLabel, InfoDot, AmberPill, CompanionMark, mixColor, cap } from './ui'
import CompanionAskBar from './CompanionAskBar'
import CompanionDrawer from './CompanionDrawer'
import AdviserRail from './AdviserRail'

const todayIso = () => new Date().toISOString().slice(0, 10)

type FitCard = Extract<BriefingPayload, { has_goal: true }>['top_candidates'][number]

function amountLine(c: { amount_min: number | null; amount_max: number | null; amount_undisclosed: boolean }): string {
  if (c.amount_undisclosed) return 'amount not disclosed'
  if (c.amount_min && c.amount_max && c.amount_min !== c.amount_max) return `${gbp(c.amount_min)} to ${gbp(c.amount_max)}`
  if (c.amount_max) return `up to ${gbp(c.amount_max)}`
  if (c.amount_min) return `from ${gbp(c.amount_min)}`
  return 'amount unspecified'
}
function timingLine(c: { deadline: string | null; is_rolling: boolean; open_status: string | null; next_open_date: string | null }): string {
  if (c.open_status === 'between_rounds') return c.next_open_date ? `between rounds, next opens ${fmtDate(c.next_open_date)}` : 'between rounds'
  if (c.deadline) return `closes ${fmtDate(c.deadline)}`
  if (c.is_rolling) return 'rolling, paced by your plan'
  return 'no deadline stated'
}

// Funding-character tag for a move (colour comes from the shared MIX_COLOR).
function candidateChar(fundingType: string): string {
  if (fundingType === 'investment') return 'investment'
  if (fundingType === 'in_kind') return 'in_kind'
  return 'project' // grants and programmes are project cash by default
}
function candidateAmountLabel(c: FitCard): string {
  if (c.amount_undisclosed) return 'amount TBC'
  const rk = (n: number) => Math.round(n / 1000)
  if (c.amount_max != null && c.amount_max > 0 && c.amount_max <= 20000) return 'quick win'
  if (c.amount_min && c.amount_max) return `£${rk(c.amount_min)}–${rk(c.amount_max)}k`
  if (c.amount_max) return `up to £${rk(c.amount_max)}k`
  if (c.amount_min) return `from £${rk(c.amount_min)}k`
  return 'amount TBC'
}
function deriveTag(cand: FitCard | null, kind: string | null, mixTarget: Record<string, number> | null, target: number): { char: string; label: string } | null {
  if (cand) return { char: candidateChar(cand.funding_type), label: candidateAmountLabel(cand) }
  if (kind === 'unrestricted_track') {
    const pct = mixTarget?.unrestricted ?? 0
    return { char: 'unrestricted', label: pct > 0 ? gbp(Math.round((pct / 100) * target)) : 'your hardest slice' }
  }
  return null // add_amounts / match_funding / deadline_pressure carry no character
}

function sinceLabel(since: string | null | undefined): string {
  if (!since) return 'you last looked'
  const t = Date.parse(since)
  if (Number.isNaN(t)) return 'you last looked'
  const days = Math.floor((Date.now() - t) / 86_400_000)
  if (days <= 0) return 'earlier today'
  if (days === 1) return 'yesterday'
  if (days < 7) return new Date(t).toLocaleDateString('en-GB', { weekday: 'long' })
  return fmtDate(since) ?? 'you last looked'
}

// Ghost hatch of a character colour — the "planned but not yet raised" state.
const hatch = (c: string) => `repeating-linear-gradient(45deg, ${c}24, ${c}24 3px, ${c}0d 3px, ${c}0d 6px)`

// An action button: forest fill so lime stays reserved for the two page accents.
function ActionButton({ action, primary }: { action: Move['action']; primary?: boolean }) {
  const cls = 'text-[12.5px] font-semibold px-3 py-1.5 rounded-lg shrink-0'
  const style = primary
    ? { ...grotesk, background: COLOR.forest, color: COLOR.pale }
    : { ...grotesk, border: `1px solid ${COLOR.ink}`, color: COLOR.ink, background: '#fff' }
  if (action.mode === 'link' && action.href) {
    return <Link href={action.href} className={`${cls} no-underline`} style={style}>{action.label}</Link>
  }
  return <button onClick={() => openCompanion(action.prompt)} className={cls} style={style}>{action.label}</button>
}

// ── main view ────────────────────────────────────────────────────────────────

export default function BriefingView({ briefing, plan, pipeline, displayName, since = null }: {
  briefing: BriefingPayload
  plan: PlanStatePayload
  pipeline: GetPipelinePayload
  displayName: string
  since?: string | null
}) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  // Wide (≥1100px) → the adviser rail docks on the right; below that the page is
  // the v3 stacked layout with the overlay drawer. First render is narrow (SSR-
  // safe: server and first client render agree), then the effect promotes to
  // wide after mount, so there is no hydration mismatch.
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1100px)')
    const on = () => setWide(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  // Defensive: the page routes no-goal orgs to the setup experience, so this
  // branch is a fallback only.
  if (!briefing.has_goal || !plan.has_goal) {
    const ob = !briefing.has_goal ? briefing.onboarding : null
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold" style={{ ...grotesk, color: COLOR.ink }}>{greeting}, {displayName}.</h1>
        <p className="mt-1 text-[13px]" style={{ color: COLOR.mid }}>Your adviser is ready. It needs a goal to hold a plan with you.</p>
        <div className="mt-6 rounded-xl p-6" style={{ background: COLOR.pale, border: '1px solid #DCE8C8' }}>
          <p className="text-[15px] leading-relaxed" style={{ color: COLOR.ink }}>{ob?.message}</p>
        </div>
      </div>
    )
  }

  const a = plan.arithmetic
  const goal = plan.goal
  const target = a.target || 1
  const missingAmounts = pipeline.items.filter(i => i.stage !== 'declined' && i.amount_requested == null).length
  const changes = briefing.changes_since

  // ── deterministic moves ─────────────────────────────────────────────────────
  const cInput = {
    asOf: todayIso(),
    goalEndDate: goal.end_date,
    mixTarget: a.mixTarget,
    arithmetic: { gap: a.gap, inPipelineWeighted: a.inPipelineWeighted, target: a.target || 1 },
    pipelineItems: pipeline.items,
    recentWin: briefing.considerations.some(c => c.kind === 'match_funding'),
  }
  const considerations = buildConsiderations(cInput)
  const deadlineChip = topDeadlineChip(cInput)

  const topC = briefing.top_candidates[0]
  const oppMove: Move | null = topC ? {
    kind: 'opportunity', rank: 100,
    headline: topC.title,
    sentence: topC.size_note
      ? `${topC.funder} could add ${amountLine(topC)} and ${timingLine(topC)}, but ${topC.size_note.charAt(0).toLowerCase()}${topC.size_note.slice(1)} Weigh whether the fit is worth pursuing.`
      : `${topC.funder} could add ${amountLine(topC)} and ${timingLine(topC)}. It clears your eligibility checks, so it is worth a serious look this week.`,
    action: { label: 'See the full match', mode: 'link', href: `/dashboard/search?grant=${encodeURIComponent(topC.opportunity_id)}` },
    meta: { candidate: topC },
  } : null
  const moves = [...considerations, ...(oppMove ? [oppMove] : [])].sort((x, y) => x.rank - y.rank)

  // ── authored guidance → one ordered, tagged move list (v3) ───────────────────
  type RM = { key: string; title: string; reason: string; action: Move['action']; secondary?: Move['action']; candidate: FitCard | null; tag: { char: string; label: string } | null }
  const guided = briefing.guidance && briefing.guidance.agenda.length > 0 ? briefing.guidance : null
  const renderMoves: RM[] = (guided
    ? [
        ...moves.filter(m => m.kind === 'deadline_pressure').map((m, i): RM => ({ key: `dl-${i}`, title: m.headline, reason: m.sentence, action: m.action, secondary: m.secondary, candidate: null, tag: null })),
        ...guided.agenda.map((it, i): RM | null => {
          if (it.ref.startsWith('cand:')) {
            const id = it.ref.slice(5)
            const cand = briefing.top_candidates.find(c => c.opportunity_id === id) ?? null
            return { key: `g-${i}`, title: it.title, reason: it.reason, action: { label: 'See the full match', mode: 'link', href: `/dashboard/search?grant=${encodeURIComponent(id)}` }, candidate: cand, tag: deriveTag(cand, null, a.mixTarget, target) }
          }
          const kind = it.ref.replace(/^consideration:/, '')
          const dm = moves.find(m => m.kind === kind)
          if (!dm) return null
          return { key: `g-${i}`, title: it.title, reason: it.reason, action: dm.action, secondary: dm.secondary, candidate: null, tag: deriveTag(null, kind, a.mixTarget, target) }
        }).filter((x): x is RM => x !== null),
      ]
    : moves.map((m, i): RM => {
        const cand = m.kind === 'opportunity' ? (m.meta?.candidate as FitCard) : null
        return { key: `${m.kind}-${i}`, title: m.headline, reason: m.sentence, action: m.action, secondary: m.secondary, candidate: cand, tag: deriveTag(cand, cand ? null : m.kind, a.mixTarget, target) }
      })
  ).slice(0, 5)

  // ── header summary ───────────────────────────────────────────────────────────
  const worthCount = renderMoves.length
  const changeCount = changes ? changes.added + changes.stage_changes + changes.removed : 0
  const summaryLine = worthCount === 0
    ? 'Nothing else needs you today.'
    : `${worthCount} thing${worthCount === 1 ? '' : 's'} worth your time${changeCount > 0 ? ` · ${changeCount} change${changeCount === 1 ? '' : 's'} to your plan since you last looked` : ''}`

  // ── hero progress: target-mix ghost segments that fill as value lands ─────────
  const securedPct = Math.min(100, (a.secured / target) * 100)
  const weightedPct = Math.min(100 - securedPct, Math.max(0, ((a.inPipelineWeighted - a.secured) / target) * 100))
  const mix = plan.mix
  const attributable = !!mix && mix.attributable
  const overallRatio = Math.min(100, (a.inPipelineWeighted / target) * 100)
  const mixEntries = mix
    ? mix.slices.filter(s => s.target_pct > 0).map(s => ({ char: s.character, pct: s.target_pct, targetAmt: s.target_amount, inPipe: s.in_pipeline }))
    : Object.entries((a.mixTarget ?? {}) as Record<string, number>).filter(([, v]) => v > 0).map(([char, v]) => ({ char, pct: v, targetAmt: Math.round((v / 100) * target), inPipe: 0 }))
  const totalPct = mixEntries.reduce((s, e) => s + e.pct, 0) || 1
  const heroSegments = mixEntries.map(e => ({
    char: e.char,
    width: (e.pct / totalPct) * 100,
    fillPct: attributable && e.targetAmt > 0 ? Math.min(100, (e.inPipe / e.targetAmt) * 100) : overallRatio,
  }))

  // ── contextual ask chips: interrogate the reasoning + teach the outcome loop ──
  const firstChar = renderMoves[0]?.tag?.char
  const askChips = [
    firstChar ? `Why ${firstChar.replace(/_/g, ' ')} first?` : 'Why this order?',
    'We just won a grant',
    'Which funders back core costs?',
  ]
  const askExample = 'What should I focus on this week?'
  const hasDeltas = !!changes && (changes.events.length > 0 || !!briefing.selection_note)

  // ── section pieces (reused by both the wide grid and the narrow stack) ────────
  const header = (
    <>
      <h1 className="text-2xl font-bold" style={{ ...grotesk, color: COLOR.ink }}>{greeting}, {displayName}.</h1>
      <p className="mt-1 text-[13px]" style={{ color: COLOR.ink }}>{summaryLine}</p>
    </>
  )

  const heroCard = (
    <div className="bg-white rounded-xl p-5 mt-6" style={{ border: `1px solid ${COLOR.hair}` }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <SectionLabel>Still to find</SectionLabel>
          <HeroNumber>{gbp(a.gap)}</HeroNumber>
          {a.secured === 0 && a.inPipelineUnweighted === 0 && (
            <p className="text-[13px] mt-1.5 max-w-md" style={{ color: COLOR.mid }}>
              This is normal at day one. The plan below is how that changes.
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          {deadlineChip && <div className="mb-1.5"><AmberPill>{deadlineChip}</AmberPill></div>}
          <div className="text-[13px] font-semibold" style={{ ...grotesk, color: COLOR.ink }}>{gbp(a.requiredRunRateMonthly)}/month</div>
          <div className="text-[12px]" style={{ color: COLOR.faint }}>{a.monthsRemaining} months to {fmtDate(goal.end_date)}</div>
        </div>
      </div>

      {heroSegments.length > 0 ? (
        <>
          <div className="mt-4 h-3.5 rounded-full overflow-hidden flex" style={{ background: COLOR.cream }}>
            {heroSegments.map(s => (
              <div key={s.char} className="relative h-full" style={{ width: `${s.width}%` }} title={`${cap(s.char)} target`}>
                <div className="absolute inset-0" style={{ background: hatch(mixColor(s.char)) }} />
                <div className="absolute inset-y-0 left-0" style={{ width: `${s.fillPct}%`, background: mixColor(s.char) }} />
              </div>
            ))}
          </div>
          <div className="mt-1.5 text-[11px]" style={{ color: COLOR.faint }}>the shape of what you&rsquo;re raising</div>
        </>
      ) : (
        <div className="mt-4 h-3 rounded-full overflow-hidden flex" style={{ background: COLOR.cream }}>
          <div style={{ width: `${securedPct}%`, background: COLOR.secured }} />
          <div style={{ width: `${weightedPct}%`, background: COLOR.weighted }} />
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12.5px]" style={{ color: COLOR.faint }}>
        <span>
          secured {gbp(a.secured)} · weighted pipeline {gbp(a.inPipelineWeighted)} <InfoDot caption={`${plan.weighted_formula}. The gap is target minus secured; weighted pipeline does not reduce the gap until it is won.`} />
        </span>
        <Link href="/dashboard/plan" className="underline" style={{ color: COLOR.sage }}>Full plan</Link>
      </div>
      {missingAmounts > 0 && (
        <div className="mt-2.5 text-[12.5px]" style={{ color: COLOR.amberInk }}>
          The gap excludes {missingAmounts} pipeline item{missingAmounts === 1 ? '' : 's'} with no amount set.{' '}
          <Link href="/dashboard/pipeline" className="underline" style={{ color: COLOR.sage }}>Add amounts</Link>
        </div>
      )}
    </div>
  )

  const myReadBlock = guided ? (
    <div className="mt-8">
      <div className="flex items-center gap-2">
        <CompanionMark size={32} />
        <SectionLabel>My read</SectionLabel>
      </div>
      <p className="mt-2 text-[14px] leading-relaxed" style={{ color: COLOR.ink }}>{guided.my_read}</p>
    </div>
  ) : null

  const movesSection = (
    <div className="mt-8">
      <SectionLabel>Recommended moves · in order</SectionLabel>
      {renderMoves.length === 0 ? (
        <div className="bg-white rounded-xl p-4 mt-3 text-[13px]" style={{ border: `1px solid ${COLOR.hair}`, color: COLOR.mid }}>
          Nothing new moves your goal today. An honest quiet day beats noise.
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {renderMoves.map((m, i) => {
            const first = i === 0
            const cand = m.candidate
            const checked = cand && cand.record_check.status === 'checked'
            return (
              <div key={m.key} className="bg-white rounded-xl p-4 flex gap-3" style={{ border: first ? `2px solid ${COLOR.lime}` : `1px solid ${COLOR.hair}` }}>
                <span className="shrink-0 inline-flex items-center justify-center text-[12px] font-semibold mt-0.5" style={{ width: 24, height: 24, borderRadius: 999, ...grotesk, ...(first ? { background: COLOR.lime, color: COLOR.forest } : { border: `1px solid ${COLOR.hair}`, color: COLOR.mid }) }}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    {cand ? (
                      <Link href={`/dashboard/search?grant=${encodeURIComponent(cand.opportunity_id)}`} className="text-[14px] font-semibold no-underline hover:underline" style={{ ...grotesk, color: COLOR.ink }}>{m.title}</Link>
                    ) : (
                      <span className="text-[14px] font-semibold" style={{ ...grotesk, color: COLOR.ink }}>{m.title}</span>
                    )}
                    {m.tag && <span className="text-[11px] font-semibold shrink-0" style={{ color: mixColor(m.tag.char) }}>{cap(m.tag.char)} · {m.tag.label}</span>}
                  </div>
                  <p className="text-[13px] mt-1 leading-relaxed" style={{ color: COLOR.ink }}>
                    {m.reason}
                    {checked && <span className="text-[11px]" style={{ color: COLOR.faint }}> · checked against funder site {fmtDate(cand!.record_check.checked_at)}</span>}
                    {cand && cand.warning_codes.length > 0 && <span className="text-[11px]" style={{ color: COLOR.faint }}> · worth confirming: {cand.warning_codes.join(', ')}</span>}
                  </p>
                  <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                    <ActionButton action={m.action} primary={first} />
                    {m.secondary && <ActionButton action={m.secondary} />}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const coverageNote = briefing.coverage.thin ? (
    <p className="mt-3 text-[12px]" style={{ color: COLOR.amberInk }}>
      Coverage is thin here: {briefing.coverage.note ?? 'few eligible catalogue matches for this profile.'} Showing what clears the bar rather than padding the list.
    </p>
  ) : null

  const sinceSection = hasDeltas ? (
    <div className="mt-8">
      <SectionLabel>Since you last looked</SectionLabel>
      <div className="bg-white rounded-xl p-3 mt-2" style={{ border: `1px solid ${COLOR.hair}` }}>
        <ul className="space-y-1.5">
          {changes!.events.slice(0, 5).map((e, i) => (
            <li key={i} className="text-[12.5px] flex justify-between gap-3" style={{ color: COLOR.ink }}>
              <span>
                {e.type === 'pipeline_added' && 'You added an opportunity to your pipeline'}
                {e.type === 'pipeline_stage_changed' && `Moved from ${String(e.payload.from_stage ?? '?')} to ${String(e.payload.to_stage ?? '?')}`}
                {e.type === 'pipeline_removed' && 'You removed an opportunity'}
                {e.surface === 'mcp' && <span className="ml-1.5 text-[11px]" style={{ color: COLOR.faint }}>via Claude</span>}
              </span>
              <span className="text-[11px] shrink-0" style={{ color: COLOR.faint }}>{fmtDate(e.at)}</span>
            </li>
          ))}
          {briefing.selection_note && (
            <li className="text-[13px]" style={{ color: COLOR.ink }}>{briefing.selection_note}</li>
          )}
        </ul>
      </div>
    </div>
  ) : (
    <p className="mt-8 text-[12px]" style={{ color: COLOR.faint }}>
      {changes ? `Nothing has moved since ${sinceLabel(since)}.` : 'This is your first look. Changes to your plan will appear here from now on.'}
    </p>
  )

  // ── wide: main column (hero + moves) | sticky adviser rail ────────────────────
  if (wide) {
    return (
      <div className="max-w-[1240px] mx-auto">
        {header}
        <div className="grid gap-6 items-start" style={{ gridTemplateColumns: 'minmax(0, 1fr) 400px' }}>
          <div className="min-w-0">
            {heroCard}
            {movesSection}
            {coverageNote}
            {sinceSection}
          </div>
          <div className="sticky top-6 mt-6">
            <AdviserRail myRead={guided ? guided.my_read : null} suggestions={askChips} examplePrompt={askExample} />
          </div>
        </div>
      </div>
    )
  }

  // ── narrow: v3 stacked order + overlay drawer ─────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto">
      {header}
      {heroCard}
      {myReadBlock}
      <CompanionAskBar examplePrompt={askExample} suggestions={askChips} />
      {movesSection}
      {coverageNote}
      {sinceSection}
      <CompanionDrawer examplePrompt={askExample} />
    </div>
  )
}

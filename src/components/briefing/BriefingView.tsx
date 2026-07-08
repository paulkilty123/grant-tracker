'use client'

// Briefing page (redesign §2) — a DETERMINISTIC render of tool payloads. Every
// load-bearing number comes from get_plan_state / get_briefing / get_pipeline;
// every reasoning sentence is a deterministic template (considerations.ts), not
// model prose. Design grammar (ui.tsx): one hero number; exactly two lime
// accents (the single top "your next move" card + the ask bar); warnings quiet;
// amber only for action-needed. House copy: sentence case, no em dashes.

import Link from 'next/link'
import type { BriefingPayload, PlanStatePayload } from '@/lib/agent/tools/plan'
import type { GetPipelinePayload } from '@/lib/agent/tools/pipeline'
import { buildConsiderations, topDeadlineChip, type Move } from '@/lib/agent/considerations'
import { openCompanion } from './CompanionOpenLink'
import { grotesk, gbp, fmtDate, COLOR, HeroNumber, SectionLabel, InfoDot, AmberPill } from './ui'

const todayIso = () => new Date().toISOString().slice(0, 10)

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

export default function BriefingView({ briefing, plan, pipeline, displayName }: {
  briefing: BriefingPayload
  plan: PlanStatePayload
  pipeline: GetPipelinePayload
  displayName: string
}) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  // Defensive: the page routes no-goal orgs to the setup experience, so this
  // branch is a fallback only.
  if (!briefing.has_goal || !plan.has_goal) {
    const ob = !briefing.has_goal ? briefing.onboarding : null
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold" style={{ ...grotesk, color: COLOR.ink }}>{greeting}, {displayName}.</h1>
        <p className="mt-1 text-[13px]" style={{ color: COLOR.mid }}>Your Companion is ready. It needs a goal to hold a plan with you.</p>
        <div className="mt-6 rounded-xl p-6" style={{ background: COLOR.pale, border: '1px solid #DCE8C8' }}>
          <p className="text-[15px] leading-relaxed" style={{ color: COLOR.ink }}>{ob?.message}</p>
        </div>
      </div>
    )
  }

  const a = plan.arithmetic
  const goal = plan.goal
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

  // The top catalogue candidate becomes an "opportunity" move (rank 100), so a
  // fresh opportunity slots between an urgent deadline and the strategic nudges.
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
  const primary = moves[0] ?? null
  const alsoWorth = moves.slice(1, 3)

  // Judgment summary line: consequences, never match counts. Quiet day is a
  // confident render, never "the rest is handled".
  const worthCount = moves.length
  const changeCount = changes ? changes.added + changes.stage_changes + changes.removed : 0
  const summaryLine = worthCount === 0
    ? 'Nothing else needs you today.'
    : `${worthCount} thing${worthCount === 1 ? '' : 's'} worth your time${changeCount > 0 ? ` · ${changeCount} change${changeCount === 1 ? '' : 's'} to your plan since you last looked` : ''}`

  const mixSummary = Object.entries((a.mixTarget ?? {}) as Record<string, number>).map(([k, v]) => `${k} ${v}%`).join(' · ')
  const target = a.target || 1
  const securedPct = Math.min(100, (a.secured / target) * 100)
  const weightedPct = Math.min(100 - securedPct, Math.max(0, ((a.inPipelineWeighted - a.secured) / target) * 100))

  const topCandidate = primary?.kind === 'opportunity' ? (primary.meta?.candidate as typeof topC) : null

  return (
    <div className="max-w-3xl">
      {/* header — greeting + judgment summary (consequences, not counts) */}
      <h1 className="text-2xl font-bold" style={{ ...grotesk, color: COLOR.ink }}>{greeting}, {displayName}.</h1>
      <p className="mt-1 text-[13px]" style={{ color: COLOR.ink }}>{summaryLine}</p>

      {/* hero card — one number: still to find */}
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

        <div className="mt-4 h-3 rounded-full overflow-hidden flex" style={{ background: COLOR.cream }}>
          <div style={{ width: `${securedPct}%`, background: COLOR.secured }} />
          <div style={{ width: `${weightedPct}%`, background: COLOR.weighted }} />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12.5px]" style={{ color: COLOR.faint }}>
          <span>
            secured {gbp(a.secured)} · weighted pipeline {gbp(a.inPipelineWeighted)} <InfoDot caption={`${plan.weighted_formula}. The gap is target minus secured; weighted pipeline does not reduce the gap until it is won.`} />
          </span>
          <span>
            {mixSummary && <span className="mr-2">{mixSummary}</span>}
            <Link href="/dashboard/plan" className="underline" style={{ color: COLOR.sage }}>Full plan</Link>
          </span>
        </div>
        {missingAmounts > 0 && (
          <div className="mt-2.5 text-[12.5px]" style={{ color: COLOR.amberInk }}>
            The gap excludes {missingAmounts} pipeline item{missingAmounts === 1 ? '' : 's'} with no amount set.{' '}
            <Link href="/dashboard/pipeline" className="underline" style={{ color: COLOR.sage }}>Add amounts</Link>
          </div>
        )}
      </div>

      {/* your next move — the single lime-accented card */}
      <div className="mt-8">
        <SectionLabel>Your next move</SectionLabel>
        {!primary ? (
          <div className="bg-white rounded-xl p-4 mt-2 text-[13px]" style={{ border: `1px solid ${COLOR.hair}`, color: COLOR.mid }}>
            Nothing new moves your goal today. An honest quiet day beats noise.
          </div>
        ) : (
          <div className="bg-white rounded-xl p-4 mt-2" style={{ border: `2px solid ${COLOR.lime}` }}>
            <div className="flex items-baseline justify-between gap-3">
              {topCandidate ? (
                <Link href={`/dashboard/search?grant=${encodeURIComponent(topCandidate.opportunity_id)}`} className="text-[15px] font-semibold no-underline hover:underline" style={{ ...grotesk, color: COLOR.ink }}>{primary.headline}</Link>
              ) : (
                <span className="text-[15px] font-semibold" style={{ ...grotesk, color: COLOR.ink }}>{primary.headline}</span>
              )}
              {topCandidate && <span className="text-[12px] shrink-0" style={{ color: COLOR.mid }}>{amountLine(topCandidate)}</span>}
            </div>
            {topCandidate && <div className="text-[12px] mt-0.5" style={{ color: COLOR.faint }}>{topCandidate.funder} · {timingLine(topCandidate)}</div>}
            <p className="text-[13px] mt-2 leading-relaxed" style={{ color: COLOR.ink }}>{primary.sentence}</p>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <ActionButton action={primary.action} primary />
              {primary.secondary && <ActionButton action={primary.secondary} />}
            </div>
            {topCandidate && (
              <div className="mt-2 text-[11px]" style={{ color: COLOR.faint }}>
                {topCandidate.record_check.status === 'checked'
                  ? <>checked against funder site · {fmtDate(topCandidate.record_check.checked_at)}</>
                  : <>record not yet re-checked</>}
                {topCandidate.warning_codes.length > 0 && <span className="ml-2">· worth confirming: {topCandidate.warning_codes.join(', ')}</span>}
              </div>
            )}
          </div>
        )}
      </div>

      {briefing.coverage.thin && (
        <p className="mt-2 text-[12px]" style={{ color: COLOR.amberInk }}>
          Coverage is thin here: {briefing.coverage.note ?? 'few eligible catalogue matches for this profile.'} Showing what clears the bar rather than padding the list.
        </p>
      )}

      {/* two-column row: also worth a look · since you last looked */}
      <div className="grid md:grid-cols-2 gap-4 mt-8">
        <div>
          <SectionLabel>Also worth a look</SectionLabel>
          <div className="mt-2 space-y-2">
            {alsoWorth.length === 0 ? (
              <div className="text-[12.5px]" style={{ color: COLOR.faint }}>Nothing else is pressing right now.</div>
            ) : alsoWorth.map((m, i) => {
              const cand = m.kind === 'opportunity' ? (m.meta?.candidate as typeof topC) : null
              return (
                <div key={`${m.kind}-${i}`} className="bg-white rounded-xl p-3" style={{ border: `1px solid ${COLOR.hair}` }}>
                  <div className="text-[13px] font-semibold" style={{ ...grotesk, color: COLOR.ink }}>{m.headline}</div>
                  <p className="text-[13px] mt-0.5 leading-relaxed" style={{ color: COLOR.ink }}>{m.sentence}</p>
                  <div className="mt-2"><ActionButton action={m.action} /></div>
                  {cand && cand.warning_codes.length > 0 && <div className="text-[11px] mt-1.5" style={{ color: COLOR.faint }}>worth confirming: {cand.warning_codes.join(', ')}</div>}
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <SectionLabel>Since you last looked</SectionLabel>
          <div className="bg-white rounded-xl p-3 mt-2" style={{ border: `1px solid ${COLOR.hair}` }}>
            {!changes ? (
              <p className="text-[12.5px]" style={{ color: COLOR.mid }}>This is your first look. Changes to your plan will appear here from now on.</p>
            ) : changes.events.length === 0 && !briefing.selection_note ? (
              <p className="text-[12.5px]" style={{ color: COLOR.mid }}>Nothing has changed since you last looked.</p>
            ) : (
              <ul className="space-y-1.5">
                {changes.events.slice(0, 5).map((e, i) => (
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
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

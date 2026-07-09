// Plan page (design spec §3.3, redesign §5) — the analytical depth one click
// from the briefing, rendered DETERMINISTICALLY from get_plan_state /
// get_pipeline. The plan's identity is COMPOSITION (the funding mix), not the
// gap, so the mix is the single accented hero and the secured/gap bar (the
// briefing's identity) is not duplicated here. The only non-deterministic
// element is the authored plan_read line, from the same cached guidance
// generation as the briefing (author.ts); everything else is a tool payload.
// The model enters only through the Companion drawer.

import Link from 'next/link'
import type { PlanStatePayload } from '@/lib/agent/tools/plan'
import type { GetPipelinePayload } from '@/lib/agent/tools/pipeline'
import { STAGE_WEIGHTS } from '@/lib/agent/context'
import { MIX_CHARACTERS } from '@/lib/agent/tools/mix'
import { grotesk, gbp, fmtDate, COLOR, SectionLabel, InfoDot, AmberPill, mixColor, cap } from './ui'
import CompanionOpenLink from './CompanionOpenLink'

type ActivePlan = Extract<PlanStatePayload, { has_goal: true }>

// Pipeline stage palette (design system, locked)
const STAGE_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  identified: { bg: '#F5F1E8', color: '#5F5E5A', label: 'Identified' },
  applying: { bg: '#EAF3DE', color: '#3B6D11', label: 'Applying' },
  submitted: { bg: '#C0DD97', color: '#173404', label: 'Submitted' },
  won: { bg: '#639922', color: '#fff', label: 'Won' },
  declined: { bg: '#FAECE7', color: '#993C1D', label: 'Declined' },
}
const STAGE_ORDER = ['identified', 'applying', 'submitted', 'won', 'declined']

const dayDiff = (fromIso: string, toIso: string) =>
  Math.round((new Date(`${toIso.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${fromIso.slice(0, 10)}T00:00:00Z`).getTime()) / 86_400_000)

/** Declined reason, if one was recorded — the search page's dismiss flow writes
 *  "Decline reasons: …" into notes; agent outcomes land in outcome_notes. */
function declineReason(item: { notes: string | null; outcome_notes: string | null }): string | null {
  const source = item.notes ?? item.outcome_notes
  if (!source) return null
  const firstLine = source.split('\n')[0].trim()
  return firstLine.replace(/^Decline reasons:\s*/i, '') || null
}

export default function PlanView({ plan, pipeline, planRead = null }: {
  plan: ActivePlan
  pipeline: GetPipelinePayload
  planRead?: string | null
}) {
  const a = plan.arithmetic
  const goal = plan.goal
  const target = a.target || 1

  const items = pipeline.items
  const missingAmounts = items.filter(i => i.stage !== 'declined' && i.amount_requested == null).length
  const weightsCaption = STAGE_ORDER
    .filter(s => s !== 'declined')
    .map(s => `${s} ${Math.round((STAGE_WEIGHTS[s] ?? 0) * 100)}%`)
    .join(' · ')

  // Mix composition — bar widths are shares of total active pipeline value
  // (attributed + unattributed), ticks at the target percentages.
  const mix = plan.mix
  const mixTotal = mix ? mix.slices.reduce((s, x) => s + x.in_pipeline, 0) + mix.unattributed : 0
  const knownCharacter = (c: string) => (MIX_CHARACTERS as readonly string[]).includes(c)
  const targetSlices = mix ? mix.slices.filter(s => s.target_pct > 0) : []

  // Pipeline by stage
  const byStage = STAGE_ORDER.map(stage => {
    const rows = items.filter(i => i.stage === stage)
    return { stage, count: rows.length, value: rows.reduce((s, r) => s + (r.amount_requested ?? 0), 0) }
  })
  const declinedItems = items.filter(i => i.stage === 'declined')

  // Deadlines ahead — fixed deadlines only, today to the goal date.
  const todayIso = new Date().toISOString().slice(0, 10)
  const horizonDays = Math.max(1, dayDiff(todayIso, goal.end_date))
  const openStages = ['identified', 'applying', 'submitted']
  const withDeadline = items
    .filter(i => openStages.includes(i.stage) && i.deadline)
    .sort((x, y) => String(x.deadline).localeCompare(String(y.deadline)))
  const overdue = withDeadline.filter(i => dayDiff(todayIso, String(i.deadline)) < 0)
  const plotted = withDeadline.filter(i => {
    const d = dayDiff(todayIso, String(i.deadline))
    return d >= 0 && d <= horizonDays
  })
  const beyond = withDeadline.filter(i => dayDiff(todayIso, String(i.deadline)) > horizonDays)
  const noDeadlineCount = items.filter(i => openStages.includes(i.stage) && !i.deadline).length

  return (
    <div className="max-w-3xl mx-auto">
      {/* header */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold" style={{ ...grotesk, color: COLOR.ink }}>Your plan</h1>
        <CompanionOpenLink className="text-xs underline" style={{ color: COLOR.sage }}>
          Adjust your goal
        </CompanionOpenLink>
      </div>
      <p className="mt-1 text-[13px]" style={{ color: COLOR.ink }}>
        {goal.title}
        <span style={{ color: COLOR.faint }}>. Adjustments are a conversation; your Companion confirms the impact before anything changes.</span>
      </p>
      {/* gap context as metadata — the number lives on the briefing, not here as a bar */}
      <p className="mt-1.5 text-[12.5px]" style={{ color: COLOR.faint }}>
        {gbp(a.secured)} secured of {gbp(a.target)} · gap {gbp(a.gap)} · needs {gbp(a.requiredRunRateMonthly)}/month · {a.daysRemaining} days{' '}
        <InfoDot caption={`${plan.weighted_formula}. Stage weights: ${weightsCaption}.`} />
      </p>
      {missingAmounts > 0 && (
        <p className="mt-1.5 text-[12.5px]" style={{ color: COLOR.amberInk }}>
          The gap excludes {missingAmounts} pipeline item{missingAmounts === 1 ? '' : 's'} with no amount set.{' '}
          <Link href="/dashboard/pipeline" className="underline" style={{ color: COLOR.sage }}>Add amounts</Link>
        </p>
      )}

      {/* authored plan-shape line (guidance layer §5); absent = skipped */}
      {planRead && (
        <p className="mt-4 text-[14px] leading-relaxed" style={{ color: COLOR.ink }}>{planRead}</p>
      )}

      {/* MIX — the single accented card, the plan's identity */}
      <div className="rounded-xl p-5 mt-6" style={{ border: `2px solid ${COLOR.lime}` }}>
        <SectionLabel>Your funding mix</SectionLabel>
        {!mix ? (
          <p className="mt-2 text-[13px]" style={{ color: COLOR.mid }}>
            This goal has no confirmed funding mix yet. Tell your Companion what the money is for and it will recommend one; the recommendation never becomes the plan until you confirm it.
          </p>
        ) : (
          <>
            {/* target composition — the shape you are aiming for */}
            <div className="mt-3 h-5 rounded-full overflow-hidden flex" style={{ background: COLOR.cream }}>
              {targetSlices.map(s => (
                <div key={s.character} style={{ width: `${s.target_pct}%`, background: mixColor(s.character) }} title={`${cap(s.character)} ${s.target_pct}%`} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
              {targetSlices.map(s => (
                <span key={s.character} style={{ color: COLOR.mid }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: mixColor(s.character), marginRight: 5, verticalAlign: 'middle' }} />
                  {cap(s.character)} {s.target_pct}% · {gbp(s.target_amount)}
                </span>
              ))}
            </div>

            {/* progress against each slice — pipeline share vs the target tick */}
            <div className="mt-5 space-y-3">
              {mix.slices.map(slice => {
                const actualPct = mixTotal > 0 ? (slice.in_pipeline / mixTotal) * 100 : 0
                return (
                  <div key={slice.character}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12.5px]">
                      <span className="font-semibold" style={{ ...grotesk, color: COLOR.ink }}>{cap(slice.character)}</span>
                      <span style={{ color: COLOR.faint }}>{gbp(slice.in_pipeline)} in pipeline · target {slice.target_pct}% ({gbp(slice.target_amount)})</span>
                    </div>
                    <div className="relative mt-1 h-2.5 rounded-full" style={{ background: COLOR.cream }}>
                      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, actualPct)}%`, background: mixColor(slice.character) }} />
                      <div className="absolute top-[-2px] bottom-[-2px]" style={{ left: `${Math.min(100, slice.target_pct)}%`, width: 2, background: COLOR.ink }} />
                    </div>
                    {mix.attributable && knownCharacter(slice.character) && slice.target_pct > 0 && slice.in_pipeline === 0 && (
                      <div className="mt-1.5"><AmberPill>Nothing yet addresses the {gbp(slice.target_amount)} {slice.character} slice</AmberPill></div>
                    )}
                  </div>
                )
              })}
            </div>
            {mix.unattributed > 0 && (
              <p className="mt-3 text-[12px]" style={{ color: COLOR.amberInk }}>
                {gbp(mix.unattributed)} of pipeline value is not assigned to a purpose, so it is not counted in any slice yet.
              </p>
            )}
            {!mix.attributable && (
              <p className="mt-3 text-[12px]" style={{ color: COLOR.amberInk }}>
                Composition cannot be shown yet, because pipeline items are not assigned to purposes. The targets above still hold.
              </p>
            )}
            <p className="mt-3 text-[11px]" style={{ color: COLOR.faint }}>Bars show each slice&rsquo;s share of pipeline value; the dark tick marks its target share.</p>
          </>
        )}
      </div>

      {/* progress by purpose — compact rows */}
      {plan.purposes && plan.purposes.items.length > 0 && (
        <>
          <SectionLabel className="mt-8">Progress by purpose</SectionLabel>
          <div className="bg-white rounded-xl p-4 mt-2" style={{ border: `1px solid ${COLOR.hair}` }}>
            <div className="space-y-3">
              {plan.purposes.items.map(p => {
                const approx = p.approx_amount
                const securedW = approx ? Math.min(100, (p.secured / approx) * 100) : 0
                const openW = approx ? Math.min(100 - securedW, Math.max(0, ((p.weighted - p.secured) / approx) * 100)) : 0
                return (
                  <div key={p.purpose_id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12.5px]">
                      <span className="font-semibold" style={{ ...grotesk, color: COLOR.ink }}>
                        {p.label || cap(p.category)}
                        <span className="ml-2 text-[11px] font-normal px-2 py-0.5" style={{ background: COLOR.cream, color: COLOR.mid, borderRadius: 999 }}>{cap(p.category)}</span>
                      </span>
                      <span style={{ color: COLOR.faint }}>
                        {approx
                          ? <>secured {gbp(p.secured)} · weighted {gbp(p.weighted)} of ~{gbp(approx)}</>
                          : <>secured {gbp(p.secured)} · weighted {gbp(p.weighted)}, no amount stated</>}
                      </span>
                    </div>
                    {approx ? (
                      <div className="mt-1 h-2.5 rounded-full overflow-hidden flex" style={{ background: COLOR.cream }}>
                        <div style={{ width: `${securedW}%`, background: COLOR.secured }} />
                        <div style={{ width: `${openW}%`, background: COLOR.weighted }} />
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
            {(plan.purposes.unassigned.secured > 0 || plan.purposes.unassigned.weighted > 0) && (
              <p className="mt-3 text-[12px]" style={{ color: COLOR.faint }}>
                Unassigned items, secured {gbp(plan.purposes.unassigned.secured)} · weighted {gbp(plan.purposes.unassigned.weighted)}, count toward the goal overall.
              </p>
            )}
          </div>
        </>
      )}

      {/* pipeline by stage */}
      <SectionLabel className="mt-8">Pipeline by stage</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-2">
        {byStage.map(({ stage, count, value }) => {
          const s = STAGE_STYLE[stage]
          return (
            <div key={stage} className="rounded-xl p-3" style={{ background: s.bg }}>
              <div className="text-[11px] uppercase tracking-wide" style={{ color: s.color }}>{s.label}</div>
              <div className="text-lg font-bold mt-0.5" style={{ ...grotesk, color: s.color }}>{gbp(value)}</div>
              <div className="text-[11px]" style={{ color: s.color }}>{count} item{count === 1 ? '' : 's'}</div>
            </div>
          )
        })}
      </div>
      {declinedItems.length > 0 && (
        <div className="bg-white rounded-xl p-4 mt-3" style={{ border: `1px solid ${COLOR.hair}` }}>
          <div className="text-xs font-semibold" style={{ ...grotesk, color: '#993C1D' }}>Ruled out, and why</div>
          <ul className="mt-2 space-y-1.5">
            {declinedItems.map(i => {
              const reason = declineReason(i)
              return (
                <li key={i.pipeline_item_id} className="text-[13px]" style={{ color: COLOR.mid }}>
                  <span style={{ color: COLOR.ink }}>{i.grant_name}</span>
                  {i.funder_name ? ` — ${i.funder_name}` : ''}
                  {' · '}
                  {reason ?? 'no reason recorded'}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* deadlines ahead */}
      <SectionLabel className="mt-8">Deadlines ahead</SectionLabel>
      <div className="bg-white rounded-xl p-4 mt-2" style={{ border: `1px solid ${COLOR.hair}` }}>
        {plotted.length === 0 ? (
          <p className="text-[13px]" style={{ color: COLOR.mid }}>No fixed deadlines between today and your goal date.</p>
        ) : (
          <>
            <div className="relative h-3 rounded-full" style={{ background: COLOR.cream }}>
              {plotted.map(i => {
                const pct = Math.min(100, Math.max(0, (dayDiff(todayIso, String(i.deadline)) / horizonDays) * 100))
                const urgent = dayDiff(todayIso, String(i.deadline)) <= 7
                return (
                  <div
                    key={i.pipeline_item_id}
                    className="absolute top-1/2 -translate-y-1/2 rounded-full"
                    style={{ left: `calc(${pct}% - 5px)`, width: 10, height: 10, background: urgent ? '#D85A30' : COLOR.secured, border: '2px solid #fff' }}
                    title={`${i.grant_name} · ${fmtDate(i.deadline)}`}
                  />
                )
              })}
            </div>
            <div className="mt-1.5 flex justify-between text-[11px]" style={{ color: COLOR.faint }}>
              <span>today</span>
              <span>{fmtDate(goal.end_date)} · goal date</span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {plotted.map(i => {
                const urgent = dayDiff(todayIso, String(i.deadline)) <= 7
                const s = STAGE_STYLE[i.stage] ?? STAGE_STYLE.identified
                return (
                  <li key={i.pipeline_item_id} className="text-[13px] flex flex-wrap items-baseline gap-x-2" style={{ color: COLOR.ink }}>
                    <span className="text-xs tabular-nums" style={{ color: urgent ? '#D85A30' : COLOR.faint }}>{fmtDate(i.deadline)}</span>
                    <span>{i.grant_name}</span>
                    <span className="text-[11px] px-2 py-0.5" style={{ background: s.bg, color: s.color, borderRadius: 999 }}>{s.label}</span>
                    {i.amount_requested != null && <span className="text-xs" style={{ color: COLOR.mid }}>{gbp(i.amount_requested)}</span>}
                  </li>
                )
              })}
            </ul>
          </>
        )}
        {overdue.length > 0 && (
          <p className="mt-3 text-xs" style={{ color: '#D85A30' }}>
            {overdue.length} deadline{overdue.length === 1 ? ' has' : 's have'} passed with the item still open: {overdue.map(i => i.grant_name).join(', ')}.
          </p>
        )}
        {beyond.length > 0 && (
          <p className="mt-2 text-xs" style={{ color: COLOR.faint }}>
            Beyond your goal date: {beyond.map(i => `${i.grant_name} (${fmtDate(i.deadline)})`).join(', ')}.
          </p>
        )}
        <p className="mt-3 text-[11px]" style={{ color: COLOR.faint }}>
          {noDeadlineCount > 0 ? `${noDeadlineCount} open item${noDeadlineCount === 1 ? '' : 's'} without a fixed deadline. ` : ''}
          Rolling funds are paced by your plan, not a deadline.
        </p>
      </div>
    </div>
  )
}

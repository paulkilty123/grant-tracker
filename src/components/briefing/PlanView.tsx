// Plan page sections (design spec §3.3) — the analytical depth one click from
// the briefing, rendered DETERMINISTICALLY from get_plan_state / get_pipeline.
// Same principle as BriefingView: every load-bearing number comes from tool
// payloads; the model enters only through the Companion drawer. Any computed
// number the user might distrust carries its formula (provenance applied to
// arithmetic).

import Link from 'next/link'
import type { PlanStatePayload } from '@/lib/agent/tools/plan'
import type { GetPipelinePayload } from '@/lib/agent/tools/pipeline'
import { STAGE_WEIGHTS } from '@/lib/agent/context'
import { MIX_CHARACTERS } from '@/lib/agent/tools/mix'
import CompanionOpenLink from './CompanionOpenLink'

type ActivePlan = Extract<PlanStatePayload, { has_goal: true }>

const grotesk = { fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }
const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`
const fmtDate = (iso: string | null) => {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')

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

export default function PlanView({ plan, pipeline }: {
  plan: ActivePlan
  pipeline: GetPipelinePayload
}) {
  const a = plan.arithmetic
  const goal = plan.goal
  const target = a.target || 1

  // Goal bar segments. inPipelineWeighted INCLUDES won at weight 1.0, so the
  // open-pipeline segment is weighted MINUS secured — stacking the full
  // weighted figure next to secured would double-count wins, and the gap must
  // never flatter.
  const securedPct = Math.min(100, (a.secured / target) * 100)
  const openWeightedPct = Math.min(100 - securedPct, Math.max(0, ((a.inPipelineWeighted - a.secured) / target) * 100))
  const weightsCaption = STAGE_ORDER
    .filter(s => s !== 'declined')
    .map(s => `${s} ${Math.round((STAGE_WEIGHTS[s] ?? 0) * 100)}%`)
    .join(' · ')

  const items = pipeline.items
  const missingAmounts = items.filter(i => i.stage !== 'declined' && i.amount_requested == null).length
  const mixChips = Object.entries((a.mixTarget ?? {}) as Record<string, number>)

  // Mix composition — bar widths are shares of total active pipeline value
  // (attributed + unattributed), ticks at the target percentages.
  const mix = plan.mix
  const mixTotal = mix ? mix.slices.reduce((s, x) => s + x.in_pipeline, 0) + mix.unattributed : 0
  const knownCharacter = (c: string) => (MIX_CHARACTERS as readonly string[]).includes(c)

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
    <div className="max-w-3xl">
      {/* header */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold" style={{ ...grotesk, color: '#2C2C2A' }}>Your plan</h1>
        <CompanionOpenLink className="text-xs underline" style={{ color: '#3B6D11' }}>
          Adjust your goal
        </CompanionOpenLink>
      </div>
      <p className="mt-1 text-sm" style={{ color: '#5F5E5A' }}>
        {goal.title}: {gbp(goal.target_amount)} by {fmtDate(goal.end_date)} · adjustments are a conversation — your Companion confirms the impact before anything changes.
      </p>

      {/* goal bar, full size */}
      <div className="bg-white rounded-xl p-5 mt-6" style={{ border: '1px solid #E9E6DD' }}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-sm font-semibold" style={{ ...grotesk, color: '#2C2C2A' }}>
            {gbp(a.secured)} secured of {gbp(a.target)} · gap {gbp(a.gap)}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {mixChips.map(([k, v]) => (
              <span key={k} className="text-[11px] px-2 py-0.5" style={{ background: '#F1F7E4', color: '#3B6D11', borderRadius: 999 }}>{k} {v}%</span>
            ))}
          </div>
        </div>
        <div className="mt-3 h-4 rounded-full overflow-hidden flex" style={{ background: '#F5F1E8' }}>
          <div style={{ width: `${securedPct}%`, background: '#639922' }} />
          <div style={{ width: `${openWeightedPct}%`, background: '#C0DD97' }} />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]" style={{ color: '#8A8986' }}>
          <span>
            <span style={{ color: '#3B6D11' }}>■</span> secured {gbp(a.secured)} · <span style={{ color: '#94b96a' }}>■</span> weighted pipeline {gbp(a.inPipelineWeighted)} · gap {gbp(a.gap)}
          </span>
          <span>{a.daysRemaining} days · needs {gbp(a.requiredRunRateMonthly)}/month</span>
        </div>
        <div className="mt-2 text-[11px]" style={{ color: '#8A8986' }}>
          {plan.weighted_formula} · {weightsCaption}
        </div>
        {missingAmounts > 0 && (
          <div className="mt-2 text-xs" style={{ color: '#854F0B' }}>
            The gap excludes {missingAmounts} pipeline item{missingAmounts === 1 ? '' : 's'} with no amount set.{' '}
            <Link href="/dashboard/pipeline" className="underline" style={{ color: '#3B6D11' }}>Add amounts</Link>
          </div>
        )}
      </div>

      {/* mix: pipeline versus target */}
      <h2 className="text-base font-semibold mt-8" style={{ ...grotesk, color: '#2C2C2A' }}>Mix: pipeline versus target</h2>
      {!mix ? (
        <div className="bg-white rounded-xl p-4 mt-3 text-sm" style={{ border: '1px solid #E9E6DD', color: '#5F5E5A' }}>
          This goal has no confirmed funding mix yet. Tell your Companion what the money is for and it will recommend one — the recommendation never becomes the plan until you confirm it.
        </div>
      ) : (
        <div className="bg-white rounded-xl p-4 mt-3" style={{ border: '1px solid #E9E6DD' }}>
          <div className="space-y-4">
            {mix.slices.map(slice => {
              const actualPct = mixTotal > 0 ? (slice.in_pipeline / mixTotal) * 100 : 0
              return (
                <div key={slice.character}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm" style={{ color: '#2C2C2A' }}>
                    <span className="font-semibold" style={grotesk}>{cap(slice.character)}</span>
                    <span className="text-xs" style={{ color: '#5F5E5A' }}>
                      {gbp(slice.in_pipeline)} in pipeline · target {slice.target_pct}% ({gbp(slice.target_amount)})
                    </span>
                  </div>
                  <div className="relative mt-1.5 h-3 rounded-full" style={{ background: '#F5F1E8' }}>
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, actualPct)}%`, background: '#8ECB3C' }} />
                    {/* dark tick at the target share */}
                    <div className="absolute top-[-2px] bottom-[-2px]" style={{ left: `${Math.min(100, slice.target_pct)}%`, width: 2, background: '#2C2C2A' }} />
                  </div>
                  {mix.attributable && knownCharacter(slice.character) && slice.target_pct > 0 && slice.in_pipeline === 0 && (
                    <div className="inline-block text-[11px] mt-1.5 px-2 py-0.5" style={{ background: '#FAEEDA', color: '#854F0B', borderRadius: 999 }}>
                      Nothing yet addresses the {gbp(slice.target_amount)} {slice.character} slice
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {mix.unattributed > 0 && (
            <p className="mt-4 text-xs" style={{ color: '#854F0B' }}>
              {gbp(mix.unattributed)} of pipeline value is not assigned to a purpose, so it is not counted in any slice yet.
            </p>
          )}
          {!mix.attributable && (
            <p className="mt-4 text-xs" style={{ color: '#854F0B' }}>
              Composition cannot be shown yet — pipeline items are not assigned to purposes. The targets above still hold.
            </p>
          )}
          <p className="mt-2 text-[11px]" style={{ color: '#8A8986' }}>{mix.basis} Bars show each slice&rsquo;s share of pipeline value; the dark tick marks its target share.</p>
        </div>
      )}

      {/* progress by purpose */}
      {plan.purposes && plan.purposes.items.length > 0 && (
        <>
          <h2 className="text-base font-semibold mt-8" style={{ ...grotesk, color: '#2C2C2A' }}>Progress by purpose</h2>
          <div className="bg-white rounded-xl p-4 mt-3" style={{ border: '1px solid #E9E6DD' }}>
            <div className="space-y-4">
              {plan.purposes.items.map(p => {
                const approx = p.approx_amount
                const securedW = approx ? Math.min(100, (p.secured / approx) * 100) : 0
                const openW = approx ? Math.min(100 - securedW, Math.max(0, ((p.weighted - p.secured) / approx) * 100)) : 0
                return (
                  <div key={p.purpose_id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm" style={{ color: '#2C2C2A' }}>
                      <span className="font-semibold" style={grotesk}>
                        {p.label || cap(p.category)}
                        <span className="ml-2 text-[11px] font-normal px-2 py-0.5" style={{ background: '#F5F1E8', color: '#5F5E5A', borderRadius: 999 }}>{cap(p.category)}</span>
                      </span>
                      <span className="text-xs" style={{ color: '#5F5E5A' }}>
                        {approx
                          ? <>secured {gbp(p.secured)} · weighted {gbp(p.weighted)} of ~{gbp(approx)}</>
                          : <>secured {gbp(p.secured)} · weighted {gbp(p.weighted)} — no amount stated</>}
                      </span>
                    </div>
                    {approx ? (
                      <div className="mt-1.5 h-3 rounded-full overflow-hidden flex" style={{ background: '#F5F1E8' }}>
                        <div style={{ width: `${securedW}%`, background: '#639922' }} />
                        <div style={{ width: `${openW}%`, background: '#C0DD97' }} />
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
            {(plan.purposes.unassigned.secured > 0 || plan.purposes.unassigned.weighted > 0) && (
              <p className="mt-4 text-xs" style={{ color: '#8A8986' }}>
                Unassigned items — secured {gbp(plan.purposes.unassigned.secured)} · weighted {gbp(plan.purposes.unassigned.weighted)} — count toward the goal overall.
              </p>
            )}
          </div>
        </>
      )}

      {/* pipeline by stage */}
      <h2 className="text-base font-semibold mt-8" style={{ ...grotesk, color: '#2C2C2A' }}>Pipeline by stage</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
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
        <div className="bg-white rounded-xl p-4 mt-3" style={{ border: '1px solid #E9E6DD' }}>
          <div className="text-xs font-semibold" style={{ ...grotesk, color: '#993C1D' }}>Ruled out, and why</div>
          <ul className="mt-2 space-y-1.5">
            {declinedItems.map(i => {
              const reason = declineReason(i)
              return (
                <li key={i.pipeline_item_id} className="text-sm" style={{ color: '#5F5E5A' }}>
                  <span style={{ color: '#2C2C2A' }}>{i.grant_name}</span>
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
      <h2 className="text-base font-semibold mt-8" style={{ ...grotesk, color: '#2C2C2A' }}>Deadlines ahead</h2>
      <div className="bg-white rounded-xl p-4 mt-3" style={{ border: '1px solid #E9E6DD' }}>
        {plotted.length === 0 ? (
          <p className="text-sm" style={{ color: '#5F5E5A' }}>No fixed deadlines between today and your goal date.</p>
        ) : (
          <>
            <div className="relative h-3 rounded-full" style={{ background: '#F5F1E8' }}>
              {plotted.map(i => {
                const pct = Math.min(100, Math.max(0, (dayDiff(todayIso, String(i.deadline)) / horizonDays) * 100))
                const urgent = dayDiff(todayIso, String(i.deadline)) <= 7
                return (
                  <div
                    key={i.pipeline_item_id}
                    className="absolute top-1/2 -translate-y-1/2 rounded-full"
                    style={{ left: `calc(${pct}% - 5px)`, width: 10, height: 10, background: urgent ? '#D85A30' : '#639922', border: '2px solid #fff' }}
                    title={`${i.grant_name} · ${fmtDate(i.deadline)}`}
                  />
                )
              })}
            </div>
            <div className="mt-1.5 flex justify-between text-[11px]" style={{ color: '#8A8986' }}>
              <span>today</span>
              <span>{fmtDate(goal.end_date)} · goal date</span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {plotted.map(i => {
                const urgent = dayDiff(todayIso, String(i.deadline)) <= 7
                const s = STAGE_STYLE[i.stage] ?? STAGE_STYLE.identified
                return (
                  <li key={i.pipeline_item_id} className="text-sm flex flex-wrap items-baseline gap-x-2" style={{ color: '#2C2C2A' }}>
                    <span className="text-xs tabular-nums" style={{ color: urgent ? '#D85A30' : '#8A8986' }}>{fmtDate(i.deadline)}</span>
                    <span>{i.grant_name}</span>
                    <span className="text-[11px] px-2 py-0.5" style={{ background: s.bg, color: s.color, borderRadius: 999 }}>{s.label}</span>
                    {i.amount_requested != null && <span className="text-xs" style={{ color: '#5F5E5A' }}>{gbp(i.amount_requested)}</span>}
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
          <p className="mt-2 text-xs" style={{ color: '#8A8986' }}>
            Beyond your goal date: {beyond.map(i => `${i.grant_name} (${fmtDate(i.deadline)})`).join(', ')}.
          </p>
        )}
        <p className="mt-3 text-[11px]" style={{ color: '#8A8986' }}>
          {noDeadlineCount > 0 ? `${noDeadlineCount} open item${noDeadlineCount === 1 ? '' : 's'} without a fixed deadline. ` : ''}
          Rolling funds are paced by your plan, not a deadline.
        </p>
      </div>
    </div>
  )
}

// Briefing page sections (design spec §3.1) — a DETERMINISTIC render of tool
// results. Stated principle (build-spec §14): every load-bearing number on
// this surface comes from get_plan_state / get_briefing / get_pipeline
// payloads directly; model prose never carries arithmetic. The model enters
// only through the Companion drawer.
//
// Three registers, top to bottom: numbers, direction, judgment.

import Link from 'next/link'
import type { BriefingPayload, PlanStatePayload } from '@/lib/agent/tools/plan'
import type { GetPipelinePayload } from '@/lib/agent/tools/pipeline'

const grotesk = { fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }
const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`
const fmtDate = (iso: string | null) => {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function amountLine(c: { amount_min: number | null; amount_max: number | null; amount_undisclosed: boolean }): string {
  if (c.amount_undisclosed) return 'amount not disclosed'
  if (c.amount_min && c.amount_max && c.amount_min !== c.amount_max) return `${gbp(c.amount_min)}–${gbp(c.amount_max)}`
  if (c.amount_max) return `up to ${gbp(c.amount_max)}`
  if (c.amount_min) return `from ${gbp(c.amount_min)}`
  return 'amount unspecified'
}
function timingLine(c: { deadline: string | null; is_rolling: boolean; open_status: string | null; next_open_date: string | null }): string {
  if (c.open_status === 'between_rounds') return c.next_open_date ? `between rounds · next opens ${fmtDate(c.next_open_date)}` : 'between rounds'
  if (c.deadline) return `closes ${fmtDate(c.deadline)}`
  if (c.is_rolling) return 'rolling — paced by your plan, not a deadline'
  return 'no deadline stated'
}

// ── section: headline strip (exactly four cards — hard rule) ────────────────

function MetricCard({ label, value, sub, subTone }: { label: string; value: string; sub?: string | null; subTone?: 'amber' | 'plain' }) {
  return (
    <div className="bg-white rounded-xl p-4" style={{ border: '1px solid #E9E6DD' }}>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: '#8A8986' }}>{label}</div>
      <div className="text-2xl font-bold mt-1" style={{ ...grotesk, color: '#2C2C2A' }}>{value}</div>
      {sub && subTone === 'amber' ? (
        <div className="inline-block text-[11px] mt-1.5 px-2 py-0.5" style={{ background: '#FAEEDA', color: '#854F0B', borderRadius: 999 }}>{sub}</div>
      ) : sub ? (
        <div className="text-xs mt-1.5" style={{ color: '#8A8986' }}>{sub}</div>
      ) : null}
    </div>
  )
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

  // ── no-goal state: the degraded payload is the content spec (§8) ──────────
  if (!briefing.has_goal || !plan.has_goal) {
    const ob = !briefing.has_goal ? briefing.onboarding : null
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold" style={{ ...grotesk, color: '#2C2C2A' }}>{greeting}, {displayName}.</h1>
        <p className="mt-1 text-sm" style={{ color: '#5F5E5A' }}>Your Companion is ready — it needs a goal to hold a plan with you.</p>
        <div className="mt-6 rounded-xl p-6" style={{ background: '#F1F7E4', border: '1px solid #DCE8C8' }}>
          <p className="text-[15px] leading-relaxed" style={{ color: '#2C2C2A' }}>{ob?.message}</p>
          <ul className="mt-4 space-y-1.5">
            {(ob?.to_build_your_plan ?? []).map(item => (
              <li key={item} className="text-sm flex gap-2" style={{ color: '#3B6D11' }}><span>·</span><span>{item}</span></li>
            ))}
          </ul>
          {ob && (
            <p className="mt-4 text-xs" style={{ color: '#5F5E5A' }}>
              Already visible from your account: {ob.what_i_can_already_see.pipeline_items} pipeline item{ob.what_i_can_already_see.pipeline_items === 1 ? '' : 's'}
              {ob.what_i_can_already_see.pipeline_value > 0 ? ` worth ${gbp(ob.what_i_can_already_see.pipeline_value)}` : ''}.
            </p>
          )}
        </div>
        <p className="mt-3 text-xs" style={{ color: '#8A8986' }}>Tell your Companion below — a target and a deadline is enough to start.</p>
      </div>
    )
  }

  const a = plan.arithmetic
  const goal = plan.goal
  const missingAmounts = pipeline.items.filter(i => i.stage !== 'declined' && i.amount_requested == null).length

  // ── worth your time: candidates + deterministic considerations, max 3 ─────
  const worth: Array<
    | { kind: 'opportunity'; c: (typeof briefing.top_candidates)[number] }
    | { kind: 'action'; title: string; detail: string }
  > = [
    ...briefing.top_candidates.slice(0, 2).map(c => ({ kind: 'opportunity' as const, c })),
    ...briefing.considerations.map(x => ({
      kind: 'action' as const,
      title: x.kind === 'match_funding' ? 'Consider match funding' : x.kind,
      detail: x.detail,
    })),
  ].slice(0, 3)

  const changes = briefing.changes_since

  // Mix chips from the goal's confirmed targets (arithmetic carries them)
  const mixChips = Object.entries((a.mixTarget ?? {}) as Record<string, number>)

  const target = a.target || 1
  const securedPct = Math.min(100, (a.secured / target) * 100)
  // inPipelineWeighted includes won at weight 1.0 — the segment stacked next to
  // secured is weighted MINUS secured, or the bar double-counts wins and the
  // gap flatters.
  const weightedPct = Math.min(100 - securedPct, Math.max(0, ((a.inPipelineWeighted - a.secured) / target) * 100))

  return (
    <div className="max-w-3xl">
      {/* greeting + judgment summary line (never match counts) */}
      <h1 className="text-2xl font-bold" style={{ ...grotesk, color: '#2C2C2A' }}>{greeting}, {displayName}.</h1>
      <p className="mt-1 text-sm" style={{ color: '#5F5E5A' }}>
        {worth.length} thing{worth.length === 1 ? '' : 's'} worth your time today
        {changes ? ` · ${changes.added + changes.stage_changes + changes.removed} change${changes.added + changes.stage_changes + changes.removed === 1 ? '' : 's'} to your plan since you last looked` : ''}
      </p>

      {/* headline strip — exactly four cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        <MetricCard label="Secured" value={gbp(a.secured)} />
        <MetricCard
          label="In pipeline" value={gbp(a.inPipelineUnweighted)}
          sub={missingAmounts > 0 ? `${missingAmounts} amount${missingAmounts === 1 ? '' : 's'} not set` : null}
          subTone="amber"
        />
        <MetricCard label="Gap" value={gbp(a.gap)} sub={`${a.monthsRemaining} months left`} />
        <MetricCard label="Needed per month" value={gbp(a.requiredRunRateMonthly)} />
      </div>

      {/* goal bar */}
      <div className="bg-white rounded-xl p-4 mt-3" style={{ border: '1px solid #E9E6DD' }}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-sm font-semibold" style={{ ...grotesk, color: '#2C2C2A' }}>
            {goal.title}: {gbp(goal.target_amount)} by {fmtDate(goal.end_date)}
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <div className="flex gap-1.5 flex-wrap">
              {mixChips.map(([k, v]) => (
                <span key={k} className="text-[11px] px-2 py-0.5" style={{ background: '#F1F7E4', color: '#3B6D11', borderRadius: 999 }}>{k} {v}%</span>
              ))}
            </div>
            <Link href="/dashboard/plan" className="text-[11px] underline shrink-0" style={{ color: '#3B6D11' }}>Full plan detail</Link>
          </div>
        </div>
        <div className="mt-3 h-3 rounded-full overflow-hidden flex" style={{ background: '#F5F1E8' }}>
          <div style={{ width: `${securedPct}%`, background: '#639922' }} />
          <div style={{ width: `${weightedPct}%`, background: '#C0DD97' }} />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]" style={{ color: '#8A8986' }}>
          <span>
            <span style={{ color: '#3B6D11' }}>■</span> secured {gbp(a.secured)} · <span style={{ color: '#94b96a' }}>■</span> weighted pipeline {gbp(a.inPipelineWeighted)} · gap {gbp(a.gap)}
          </span>
          <span>{plan.weighted_formula}</span>
        </div>
        {missingAmounts > 0 && (
          <div className="mt-2 text-xs" style={{ color: '#854F0B' }}>
            The gap excludes {missingAmounts} pipeline item{missingAmounts === 1 ? '' : 's'} with no amount set.{' '}
            <Link href="/dashboard/pipeline" className="underline" style={{ color: '#3B6D11' }}>Add amounts</Link>
          </div>
        )}
      </div>

      {/* worth your time */}
      <h2 className="text-base font-semibold mt-8" style={{ ...grotesk, color: '#2C2C2A' }}>Worth your time</h2>
      {briefing.coverage.thin && (
        <p className="mt-1 text-xs" style={{ color: '#854F0B' }}>
          Coverage is thin here: {briefing.coverage.note ?? 'few eligible catalogue matches for this profile.'} Showing what clears the bar rather than padding the list.
        </p>
      )}
      <div className="mt-3 space-y-3">
        {worth.length === 0 && (
          <div className="bg-white rounded-xl p-4 text-sm" style={{ border: '1px solid #E9E6DD', color: '#5F5E5A' }}>
            Nothing new moves your goal today — an honest quiet day beats noise.
          </div>
        )}
        {worth.map((item, i) => (
          <div
            key={item.kind === 'opportunity' ? item.c.opportunity_id : `action-${i}`}
            className="bg-white rounded-xl p-4"
            style={{ border: i === 0 ? '2px solid #8ECB3C' : '1px solid #E9E6DD' }}
          >
            {item.kind === 'opportunity' ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <Link
                    href={`/dashboard/search?grant=${encodeURIComponent(item.c.opportunity_id)}`}
                    className="text-sm font-semibold no-underline hover:underline"
                    style={{ ...grotesk, color: '#2C2C2A' }}
                  >
                    {item.c.title}
                  </Link>
                  <span className="text-xs shrink-0" style={{ color: '#5F5E5A' }}>{amountLine(item.c)}</span>
                </div>
                <div className="text-xs mt-0.5" style={{ color: '#5F5E5A' }}>{item.c.funder} · {timingLine(item.c)}</div>
                {item.c.match_reasons.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {item.c.match_reasons.slice(0, 2).map(r => (
                      <span key={r} className="text-[11px] px-2 py-0.5" style={{ background: '#F1F7E4', color: '#3B6D11', borderRadius: 999 }}>{r}</span>
                    ))}
                  </div>
                )}
                <div className="mt-2 text-[11px]" style={{ color: '#8A8986' }}>
                  {item.c.record_check.status === 'checked'
                    ? <>✓ checked against funder site · {fmtDate(item.c.record_check.checked_at)}</>
                    : <span className="px-2 py-0.5" style={{ background: '#FAEEDA', color: '#854F0B', borderRadius: 999 }}>unverified record — confirm before you invest time</span>}
                  {item.c.warning_codes.length > 0 && (
                    <span className="ml-2" style={{ color: '#993C1D' }}>check: {item.c.warning_codes.join(', ')}</span>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="text-sm font-semibold" style={{ ...grotesk, color: '#2C2C2A' }}>{item.title}</div>
                <div className="text-xs mt-1 leading-relaxed" style={{ color: '#5F5E5A' }}>{item.detail}</div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* since you last looked */}
      <h2 className="text-base font-semibold mt-8" style={{ ...grotesk, color: '#2C2C2A' }}>Since you last looked</h2>
      <div className="bg-white rounded-xl p-4 mt-3" style={{ border: '1px solid #E9E6DD' }}>
        {!changes ? (
          <p className="text-sm" style={{ color: '#5F5E5A' }}>This is your first look — changes to your plan will appear here from now on.</p>
        ) : changes.events.length === 0 ? (
          <p className="text-sm" style={{ color: '#5F5E5A' }}>Nothing has changed since you last looked.</p>
        ) : (
          <ul className="space-y-2">
            {changes.events.slice(0, 6).map((e, i) => (
              <li key={i} className="text-sm flex justify-between gap-3" style={{ color: '#2C2C2A' }}>
                <span>
                  {e.type === 'pipeline_added' && 'Added to your pipeline'}
                  {e.type === 'pipeline_stage_changed' && `Pipeline stage: ${String(e.payload.from_stage ?? '?')} → ${String(e.payload.to_stage ?? '?')}`}
                  {e.type === 'pipeline_removed' && 'Removed from your pipeline'}
                  {e.surface === 'mcp' && <span className="ml-1.5 text-[11px]" style={{ color: '#8A8986' }}>· via Claude</span>}
                </span>
                <span className="text-xs shrink-0" style={{ color: '#8A8986' }}>{fmtDate(e.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

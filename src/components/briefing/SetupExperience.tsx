'use client'

// Goal setup, the first run (design spec §3.2/§4): a conversation, not a form,
// with the plan visibly assembling in a right-hand panel as the user answers.
//
// The panel renders ONLY from streamed tool results (recommend_mix,
// set_funding_goal, get_plan_state, get_briefing) — the same
// numbers-from-tools principle as the briefing page. Rows sit at "—" until a
// tool has produced them; the recommended mix carries an awaiting-confirm
// state until the goal is written (a recommendation never silently becomes
// the plan).

import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAgentChat, TOOL_LABELS } from './useAgentChat'
import Markdown from './Markdown'

const grotesk = { fontFamily: 'var(--font-space-grotesk), Space Grotesk, sans-serif' }
const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`
const approx = (n: number | null) => (n == null ? '' : `~${gbp(n)}`)
const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

interface MixData {
  recommended_mix: Record<string, number> | null
  purposes_total: number | null
  components: Array<{ category: string; label: string; approx_amount: number | null; off_rulebook: boolean; clarify: string | null }>
}
interface PanelState {
  mix?: MixData
  goal?: { title: string; target_amount: number; end_date: string; mix_targets?: Record<string, number> | null }
  purposes?: Array<{ label: string; approx_amount: number | null }>
  arithmetic?: { requiredRunRateMonthly: number; gap: number; monthsRemaining: number }
  candidateCount?: number
  goalWritten: boolean
}

export interface OrgSummary {
  name: string
  structure: string | null
  sectors: string[]
  incomeBand: string | null
  location: string | null
}

export default function SetupExperience({ org }: { org: OrgSummary }) {
  const router = useRouter()
  const [panel, setPanel] = useState<PanelState>({ goalWritten: false })
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const { messages, loaded, busy, loadThread, send } = useAgentChat({
    onToolData: (name, data) => {
      setPanel(prev => {
        const next = { ...prev }
        if (name === 'recommend_mix') next.mix = data as MixData
        if (name === 'set_funding_goal') {
          const r = data as { goal?: PanelState['goal']; purposes?: PanelState['purposes'] }
          next.goal = r.goal
          next.purposes = r.purposes
          next.goalWritten = true
        }
        if (name === 'get_plan_state') {
          const r = data as { arithmetic?: PanelState['arithmetic'] | null }
          if (r.arithmetic) next.arithmetic = r.arithmetic
        }
        if (name === 'get_briefing') {
          const r = data as { candidate_count?: number }
          if (typeof r.candidate_count === 'number') next.candidateCount = r.candidate_count
        }
        return next
      })
    },
  })

  useEffect(() => { loadThread() }, [loadThread])
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }) }, [messages])

  function submit(text?: string) {
    const t = (text ?? input).trim()
    if (!t) return
    setInput('')
    void send(t)
  }

  // Finding A: a recommend_mix result is provisional while any component still
  // carries an open clarify question — the split shown then uses default
  // mappings (e.g. staffing 50/50) and will change once the user answers. Hold
  // the mix chips AND the confirm chips until every refinement is resolved
  // (clarify null on re-derive) or the goal is written. Display timing only —
  // the update path is unchanged.
  const hasOpenRefinement = !panel.goalWritten && (panel.mix?.components ?? []).some(c => c.clarify)
  const awaitingConfirm = !!panel.mix && !panel.goalWritten && !hasOpenRefinement
  const purposeRows = panel.purposes?.length
    ? panel.purposes.map(p => ({ label: p.label, amount: p.approx_amount }))
    : (panel.mix?.components ?? []).map(c => ({ label: c.label, amount: c.approx_amount }))

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold" style={{ ...grotesk, color: 'var(--text-body)' }}>Let’s build your funding plan.</h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>A two-minute conversation. Your plan assembles on the right as you answer.</p>

      <div className="mt-6 grid md:grid-cols-[58%_1fr] gap-4 items-start">
        {/* conversation column */}
        <div className="bg-white rounded-xl flex flex-col" style={{ border: '1px solid var(--border-warm)', minHeight: 420 }}>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: 480 }}>
            {!loaded && <div className="text-xs" style={{ color: 'var(--text-subtle)' }}>One moment…</div>}
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={`max-w-[90%] rounded-xl px-3 py-2 text-sm leading-relaxed ${m.role === 'user' ? 'whitespace-pre-wrap' : ''}`}
                  style={m.role === 'user'
                    ? { background: 'var(--surface-sunken)', color: 'var(--text-body)' }
                    : { background: 'var(--surface-card)', border: '1px solid var(--border-warm)', color: 'var(--text-body)' }}
                >
                  {m.tool_names.length > 0 && (
                    <div className="text-[11px] mb-1" style={{ color: 'var(--text-subtle)' }}>
                      {m.tool_names.map(t => TOOL_LABELS[t] ?? t).join(' · ')}
                    </div>
                  )}
                  {m.role === 'assistant' && m.text
                    ? <Markdown>{m.text}</Markdown>
                    : (m.text || (m.role === 'assistant' && busy && i === messages.length - 1 ? '…' : ''))}
                </div>
              </div>
            ))}
          </div>

          {/* confirm chips — the recommendation turn's three jobs (spec §4) */}
          {awaitingConfirm && !busy && (
            <div className="px-4 pb-2 flex gap-2 flex-wrap">
              <button onClick={() => submit('Sounds right — set it up.')}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ ...grotesk, background: '#8ECB3C', color: 'var(--deep)' }}>Sounds right</button>
              <button onClick={() => submit('I’d like to adjust the mix.')}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white"
                style={{ ...grotesk, border: '1px solid var(--text-body)', color: 'var(--text-body)' }}>Adjust the mix</button>
              <button onClick={() => submit('Why unrestricted?')}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ color: 'var(--state-success)' }}>Why unrestricted?</button>
            </div>
          )}

          <div className="p-3 flex gap-2" style={{ borderTop: '1px solid var(--border-warm)' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
              placeholder="Type your answer…"
              className="flex-1 text-sm px-3 py-2 rounded-lg outline-none"
              style={{ border: '1px solid var(--border-warm)', color: 'var(--text-body)' }}
              disabled={busy}
            />
            <button
              onClick={() => submit()}
              disabled={busy || !input.trim()}
              className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
              style={{ ...grotesk, background: 'var(--deep)', color: 'var(--state-success-pale)' }}
            >
              {busy ? '…' : 'Send'}
            </button>
          </div>
        </div>

        {/* the plan, assembling */}
        <div className="rounded-xl p-4" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-warm)' }}>
          <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>Your plan, assembling</div>
          <div className="text-sm font-semibold mt-1" style={{ ...grotesk, color: 'var(--text-body)' }}>
            {org.name}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {[org.structure, org.sectors.slice(0, 3).join(', '), org.incomeBand, org.location].filter(Boolean).join(' · ')}
          </div>

          <div className="mt-4 space-y-2 text-sm" style={{ color: 'var(--text-body)' }}>
            <div className="flex justify-between gap-2">
              <span style={{ color: 'var(--text-muted)' }}>Target</span>
              <span className="font-semibold" style={grotesk}>{panel.goal ? gbp(panel.goal.target_amount) : '—'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span style={{ color: 'var(--text-muted)' }}>Deadline</span>
              <span className="font-semibold" style={grotesk}>{panel.goal ? fmtDate(panel.goal.end_date) : '—'}</span>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>What the money is for</div>
            {purposeRows.length === 0 ? (
              <div className="text-sm mt-1" style={{ color: 'var(--text-subtle)' }}>—</div>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {purposeRows.map((p, i) => (
                  <li key={i} className="text-sm flex justify-between gap-2" style={{ color: 'var(--text-body)' }}>
                    <span>{p.label}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{approx(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4">
            <div className="flex items-center gap-2">
              <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>Recommended mix</div>
              {awaitingConfirm && (
                <span className="text-[10px] px-2 py-0.5" style={{ background: 'var(--state-warning-pale)', color: 'var(--state-warning)', borderRadius: 999 }}>awaiting your confirm</span>
              )}
              {panel.goalWritten && panel.goal?.mix_targets && (
                <span className="text-[10px] px-2 py-0.5" style={{ background: 'var(--state-success-pale)', color: 'var(--state-success)', borderRadius: 999 }}>confirmed</span>
              )}
            </div>
            {(() => {
              // Hold the chips while a refinement is open — the pre-answer split
              // is provisional and would flash a number that then changes.
              if (hasOpenRefinement) {
                return <div className="text-xs mt-1" style={{ color: 'var(--text-subtle)' }}>one detail to confirm first…</div>
              }
              const mix = panel.goalWritten ? panel.goal?.mix_targets : panel.mix?.recommended_mix
              const entries = Object.entries((mix ?? {}) as Record<string, number>)
              return entries.length === 0
                ? <div className="text-sm mt-1" style={{ color: 'var(--text-subtle)' }}>—</div>
                : (
                  <div className="flex gap-1.5 flex-wrap mt-1.5">
                    {entries.map(([k, v]) => (
                      <span key={k} className="text-[11px] px-2 py-0.5 bg-white" style={{ color: 'var(--state-success)', borderRadius: 999, border: '1px solid var(--border-warm)' }}>{k} {v}%</span>
                    ))}
                  </div>
                )
            })()}
          </div>

          {/* the closing "This means" card */}
          {panel.goalWritten && panel.arithmetic && (
            <div className="mt-4 bg-white rounded-xl p-3" style={{ border: '1px solid var(--border-warm)' }}>
              <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>This means</div>
              <div className="text-lg font-bold mt-1" style={{ ...grotesk, color: 'var(--text-body)' }}>{gbp(panel.arithmetic.requiredRunRateMonthly)} per month</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>to close the {gbp(panel.arithmetic.gap)} gap in {panel.arithmetic.monthsRemaining} months</div>
              {typeof panel.candidateCount === 'number' && (
                <div className="text-xs mt-1.5" style={{ color: 'var(--state-success)' }}>{panel.candidateCount} eligibility-checked matches, re-ranked for this mix</div>
              )}
              <button
                onClick={() => router.refresh()}
                className="mt-3 w-full text-sm font-semibold px-4 py-2 rounded-lg"
                style={{ ...grotesk, background: '#8ECB3C', color: 'var(--deep)' }}
              >
                See your briefing
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

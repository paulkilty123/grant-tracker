'use client'

// Application workspace — builder v0 steps 3-6 (spec B3).
// Eligibility gate before effort → streamed scaffold generation → per-question
// workspace (scaffold + your content mapped in | your answer, in your voice)
// → bank finished answers into the content library.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Sparkles, AlertTriangle, CheckCircle2, ChevronDown,
  BookmarkPlus, Check, X as XIcon, FolderKanban, Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createPipelineItem } from '@/lib/pipeline'
import { emitClientEvent } from '@/lib/events/client'
import { T, UI, BODY, inputStyle, primaryBtn, ghostBtn } from '@/components/builder/tokens'
import {
  BLOCK_TYPES, BLOCK_TYPE_LABELS,
  type ApplicationQuestion, type ApplicationRecord, type BlockType, type EligibilitySnapshot,
} from '@/lib/builder/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function wordCount(s: string): number {
  const t = s.trim()
  return t ? t.split(/\s+/).length : 0
}

interface StreamedQuestion {
  question_text?: string
  scaffold?: { heading: string; guidance: string; suggested_order: number }[]
  mapped_content?: { block_id: string; block_type: string; excerpt: string; relevance_note: string }[]
  gaps?: { gap_type: string; description: string; severity: 'blocking' | 'weakens' }[]
}

/** Incrementally extract COMPLETE question objects from the streaming JSON,
 *  so cards fill in one by one while the model is still generating. */
function extractStreamedQuestions(buffer: string): StreamedQuestion[] {
  const start = buffer.indexOf('"questions"')
  if (start === -1) return []
  const arrayStart = buffer.indexOf('[', start)
  if (arrayStart === -1) return []
  const out: StreamedQuestion[] = []
  let depth = 0
  let inString = false
  let escaped = false
  let objStart = -1
  for (let i = arrayStart; i < buffer.length; i++) {
    const ch = buffer[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{') { if (depth === 0) objStart = i; depth++ }
    else if (ch === '}') {
      depth--
      if (depth === 0 && objStart !== -1) {
        try { out.push(JSON.parse(buffer.slice(objStart, i + 1)) as StreamedQuestion) }
        catch { /* incomplete or malformed segment — skip */ }
        objStart = -1
      }
    }
  }
  return out
}

const STATUS_LABELS: Record<string, string> = {
  likely_eligible: 'Looks eligible',
  eligible:        'Eligible',
  check_required:  'Some things to check',
  ineligible:      'Eligibility problems found',
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ApplicationWorkspacePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const appId = params.id

  const [app, setApp] = useState<ApplicationRecord | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [notAllowed, setNotAllowed] = useState(false)

  // Eligibility gate
  const [gateLoading, setGateLoading] = useState(false)

  // Generation
  const [generating, setGenerating] = useState(false)
  const [streamedCount, setStreamedCount] = useState(0)
  const [genError, setGenError] = useState<string | null>(null)

  // Banking
  const [bankingFor, setBankingFor] = useState<ApplicationQuestion | null>(null)
  const [bankType, setBankType] = useState<BlockType>('other')
  const [bankTitle, setBankTitle] = useState('')
  const [bankSaving, setBankSaving] = useState(false)

  // Pipeline link
  const [pipelining, setPipelining] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2600)
  }

  // ── Load ──
  useEffect(() => {
    async function load() {
      const access = await fetch('/api/builder/access').then(r => r.json()).catch(() => ({ allowed: false }))
      if (!access?.allowed) { setNotAllowed(true); setLoaded(true); return }
      const supabase = createClient()
      const { data } = await supabase.from('applications').select('*').eq('id', appId).maybeSingle()
      if (!data) { router.push('/dashboard/applications'); return }
      setApp(data as ApplicationRecord)
      setLoaded(true)
    }
    load()
  }, [appId, router])

  // ── Eligibility gate: auto-run when an opportunity is linked and unchecked ──
  useEffect(() => {
    if (!app || !app.opportunity_id || app.eligibility_result || gateLoading) return
    setGateLoading(true)
    fetch('/api/builder/eligibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_id: app.id }),
    })
      .then(r => r.json())
      .then((snap: EligibilitySnapshot | { error?: string }) => {
        if ('overall_status' in snap) {
          setApp(prev => (prev ? { ...prev, eligibility_result: snap } : prev))
        }
      })
      .catch(() => {})
      .finally(() => setGateLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id, app?.opportunity_id, app?.eligibility_result])

  async function proceedAnyway() {
    if (!app) return
    const res = await fetch('/api/builder/eligibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_id: app.id, proceed: true }),
    })
    const snap = await res.json()
    if (res.ok) setApp(prev => (prev ? { ...prev, eligibility_result: snap } : prev))
  }

  // ── Persist question edits (debounced) ──
  const persistQuestions = useCallback((questions: ApplicationQuestion[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const supabase = createClient()
      await supabase
        .from('applications')
        .update({ questions, updated_at: new Date().toISOString() })
        .eq('id', appId)
    }, 900)
  }, [appId])

  function updateQuestion(qid: string, patch: Partial<ApplicationQuestion>) {
    setApp(prev => {
      if (!prev) return prev
      const questions = prev.questions.map(q => (q.id === qid ? { ...q, ...patch } : q))
      persistQuestions(questions)
      return { ...prev, questions }
    })
  }

  // ── Generation (streamed) ──
  async function generate() {
    if (!app || generating) return
    setGenerating(true)
    setGenError(null)
    setStreamedCount(0)
    try {
      const res = await fetch('/api/builder/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: app.id }),
      })
      if (!res.ok || !res.body) {
        const err = await res.text()
        let message = 'Generation failed'
        try { message = (JSON.parse(err.split('\n')[0]) as { message?: string }).message ?? message } catch { /* keep */ }
        setGenError(message)
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let lineBuffer = ''
      let modelText = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        lineBuffer += decoder.decode(value, { stream: true })
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          let evt: { t: string; text?: string; message?: string; questions?: ApplicationQuestion[] }
          try { evt = JSON.parse(line) } catch { continue }
          if (evt.t === 'delta' && evt.text) {
            modelText += evt.text
            // Progressive render: merge each COMPLETED question's scaffold
            // onto its card the moment it finishes streaming — the first
            // card is readable while the rest are still generating.
            const completed = extractStreamedQuestions(modelText)
            if (completed.length > 0) {
              setStreamedCount(completed.length)
              setApp(prev => {
                if (!prev) return prev
                const questions = prev.questions.map((q, i) => {
                  const gen = completed[i]
                  if (!gen || !gen.scaffold || q.scaffold) return q
                  return {
                    ...q,
                    scaffold: gen.scaffold,
                    mapped_content: gen.mapped_content ?? [],
                    gaps: (gen.gaps ?? []).map(g => ({ ...g, dismissed: false })),
                  }
                })
                return { ...prev, questions }
              })
            }
          } else if (evt.t === 'done' && evt.questions) {
            setApp(prev => (prev ? { ...prev, questions: evt.questions!, status: 'in_progress' } : prev))
          } else if (evt.t === 'error') {
            setGenError(evt.message ?? 'Generation failed')
          }
        }
      }
    } catch {
      setGenError('Generation failed, please try again')
    } finally {
      setGenerating(false)
      setStreamedCount(0)
    }
  }

  // ── Banking ──
  function openBank(q: ApplicationQuestion) {
    setBankingFor(q)
    setBankType('other')
    setBankTitle(q.question_text.slice(0, 60))
  }
  async function bankAnswer() {
    if (!bankingFor || !app) return
    setBankSaving(true)
    try {
      const res = await fetch('/api/builder/bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: app.id,
          question_id: bankingFor.id,
          block_type: bankType,
          title: bankTitle,
        }),
      })
      if (res.ok) {
        setApp(prev => prev ? {
          ...prev,
          questions: prev.questions.map(q => q.id === bankingFor.id ? { ...q, answer_banked: true } : q),
        } : prev)
        showToast('Banked. It will be mapped into your next application')
      }
    } finally {
      setBankSaving(false)
      setBankingFor(null)
    }
  }

  // ── Pipeline link ──
  async function trackInPipeline() {
    if (!app || app.pipeline_item_id || pipelining) return
    setPipelining(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const item = await createPipelineItem({
        org_id: app.org_id,
        grant_name: app.grant_name || app.funder_name || 'Application',
        funder_name: app.funder_name || 'Unknown',
        funder_type: 'trust_foundation',
        amount_requested: null, amount_min: null, amount_max: null,
        deadline: null, stage: 'applying', notes: null,
        application_progress: null, is_urgent: false,
        contact_name: null, contact_email: null, grant_url: null,
        outcome_date: null, outcome_notes: null,
        created_by: user?.id ?? null,
      } as Parameters<typeof createPipelineItem>[0])
      await supabase
        .from('applications')
        .update({ pipeline_item_id: item.id, updated_at: new Date().toISOString() })
        .eq('id', app.id)
      emitClientEvent(app.org_id, 'pipeline_added', {
        opportunity_id: app.opportunity_id, pipeline_item_id: item.id,
      })
      setApp(prev => (prev ? { ...prev, pipeline_item_id: item.id } : prev))
      showToast('Tracking in your pipeline')
    } catch {
      showToast('Could not add to pipeline')
    } finally {
      setPipelining(false)
    }
  }

  async function markComplete() {
    if (!app) return
    const supabase = createClient()
    await supabase
      .from('applications')
      .update({ status: 'complete', updated_at: new Date().toISOString() })
      .eq('id', app.id)
    setApp(prev => (prev ? { ...prev, status: 'complete' } : prev))
    showToast('Marked complete')
  }

  // ── Derived ──
  const hasScaffolds = useMemo(
    () => (app?.questions ?? []).some(q => q.scaffold && q.scaffold.length > 0),
    [app?.questions],
  )
  const gate = app?.eligibility_result ?? null
  const blockers = (gate?.issues ?? []).filter(i => i.severity === 'blocker')
  const warnings = (gate?.issues ?? []).filter(i => i.severity === 'warning')
  const gateBlocksGeneration = blockers.length > 0 && !gate?.proceeded_anyway
  const answeredCount = (app?.questions ?? []).filter(q => q.user_answer.trim()).length

  if (notAllowed) {
    return (
      <div style={{ maxWidth: 660 }}>
        <div style={{ background: T.cream, borderRadius: 12, padding: '20px 24px' }}>
          <p style={{ fontFamily: BODY, fontSize: 14, color: T.textSecondary, margin: 0 }}>
            The application builder is currently available to founding cohort members.
          </p>
        </div>
      </div>
    )
  }
  if (!loaded || !app) {
    return <div style={{ fontFamily: BODY, color: T.textSecondary, padding: 40 }}>Loading…</div>
  }

  return (
    <div style={{ maxWidth: 980 }}>
      {/* Header */}
      <Link href="/dashboard/applications" style={{
        fontFamily: UI, fontWeight: 500, fontSize: 13, color: T.textSecondary,
        textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14,
      }}>
        <ArrowLeft size={14} /> Applications
      </Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontFamily: UI, fontWeight: 600, fontSize: 23, color: T.textPrimary, letterSpacing: '-0.01em', margin: 0 }}>
            {app.grant_name || app.funder_name || 'Application'}
          </h1>
          <p style={{ fontFamily: BODY, fontSize: 13.5, color: T.textSecondary, margin: '4px 0 0' }}>
            {app.funder_name && app.grant_name ? `${app.funder_name} · ` : ''}
            {app.questions.length} questions · {answeredCount} answered
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {!app.pipeline_item_id && (
            <button onClick={trackInPipeline} disabled={pipelining} style={{
              fontFamily: UI, fontWeight: 600, fontSize: 13, color: T.textPrimary,
              background: T.white, border: `1px solid ${T.textPrimary}`, padding: '8px 14px',
              borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <FolderKanban size={14} /> {pipelining ? 'Adding…' : 'Track in pipeline'}
            </button>
          )}
          {hasScaffolds && app.status !== 'complete' && (
            <button onClick={markComplete} style={{
              fontFamily: UI, fontWeight: 600, fontSize: 13, color: '#F1F7E4',
              background: T.greenDeep, border: 'none', padding: '8px 14px',
              borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <Check size={14} /> Mark complete
            </button>
          )}
        </div>
      </div>

      {/* ── Eligibility gate ── */}
      {app.opportunity_id && (
        <div style={{ marginBottom: 16 }}>
          {gateLoading && (
            <div style={{ background: T.cream, borderRadius: 12, padding: '14px 18px', fontFamily: BODY, fontSize: 13.5, color: T.textSecondary, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Loader2 size={14} className="animate-spin" /> Checking your eligibility before you spend any time writing…
            </div>
          )}
          {gate && blockers.length > 0 && (
            <div style={{ background: T.coralBg, border: `1px solid rgba(216,90,48,0.25)`, borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <AlertTriangle size={16} color={T.coral} />
                <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 14.5, color: T.coralText }}>
                  Check this before you write a word
                </span>
              </div>
              <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
                {blockers.map((b, i) => (
                  <li key={i} style={{ fontFamily: BODY, fontSize: 13.5, color: T.coralText, lineHeight: 1.6 }}>
                    {b.message} <span style={{ fontFamily: UI, fontSize: 11, color: 'rgba(153,60,29,0.7)' }}>(from the verified catalogue entry)</span>
                  </li>
                ))}
              </ul>
              {!gate.proceeded_anyway ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: BODY, fontSize: 12.5, color: T.coralText }}>
                    Applications that miss requirements like this are usually rejected in days.
                  </span>
                  <button onClick={proceedAnyway} style={{
                    fontFamily: UI, fontWeight: 600, fontSize: 12.5, color: T.coralText,
                    background: 'transparent', border: `1px solid rgba(153,60,29,0.35)`,
                    padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                  }}>
                    I understand, continue anyway
                  </button>
                </div>
              ) : (
                <span style={{ fontFamily: UI, fontSize: 12, color: T.coralText }}>
                  Continuing with the warning acknowledged. It stays visible here.
                </span>
              )}
            </div>
          )}
          {gate && blockers.length === 0 && (
            <div style={{ background: T.paleGreen, borderRadius: 12, padding: '13px 18px', display: 'flex', alignItems: 'flex-start', gap: 9 }}>
              <CheckCircle2 size={16} color={T.greenMid} style={{ marginTop: 1, flexShrink: 0 }} />
              <div>
                <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 13.5, color: T.sage }}>
                  {STATUS_LABELS[gate.overall_status] ?? gate.overall_status}
                </span>
                {warnings.length > 0 && (
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {warnings.map((w, i) => (
                      <li key={i} style={{ fontFamily: BODY, fontSize: 12.5, color: T.textSecondary, lineHeight: 1.55 }}>{w.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Generate CTA / progress ── */}
      {(!hasScaffolds || generating) && (
        <div style={{
          background: `linear-gradient(135deg, ${T.white} 0%, #FBFDF7 100%)`,
          border: `1px solid ${T.border}`, borderRadius: 12, padding: '26px 28px', marginBottom: 18,
          textAlign: 'center',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, background: T.paleGreen, color: T.greenMid,
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
          }}>
            <Sparkles size={20} />
          </div>
          <h2 style={{ fontFamily: UI, fontWeight: 600, fontSize: 17, color: T.textPrimary, margin: '0 0 6px' }}>
            {generating ? 'Building your scaffolds' : 'Ready to build your scaffolds'}
          </h2>
          <p style={{ fontFamily: BODY, fontSize: 13.5, color: T.textSecondary, margin: '0 auto 16px', lineHeight: 1.6, maxWidth: 460 }}>
            {generating
              ? streamedCount > 0
                ? `${streamedCount} of ${app.questions.length} done. Finished cards are ready below while the rest build.`
                : 'Reading your profile, your content blocks and the funder context. The first card lands in a few seconds.'
              : 'For each question: what a strong answer covers, your own content mapped in, and what is missing. You write the answers, in your voice.'}
          </p>
          {genError && (
            <p style={{ fontFamily: BODY, fontSize: 13, color: T.coralText, margin: '0 0 12px' }}>{genError}</p>
          )}
          {!generating && (
            <button
              onClick={generate}
              disabled={gateBlocksGeneration}
              style={primaryBtn(gateBlocksGeneration)}
              title={gateBlocksGeneration ? 'Resolve or acknowledge the eligibility warning first' : undefined}
            >
              Build the scaffolds
            </button>
          )}
          {generating && (
            <div style={{ height: 5, background: T.cream, borderRadius: 999, overflow: 'hidden', maxWidth: 320, margin: '0 auto' }}>
              <div style={{
                height: '100%',
                width: `${Math.max(8, Math.round((streamedCount / Math.max(1, app.questions.length)) * 100))}%`,
                background: T.lime, borderRadius: 999, transition: 'width 400ms ease',
              }} />
            </div>
          )}
        </div>
      )}

      {/* ── Question cards ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {app.questions.map((q, idx) => (
          <QuestionCard
            key={q.id}
            index={idx}
            question={q}
            onAnswerChange={text => updateQuestion(q.id, { user_answer: text })}
            onToggleGap={gapIdx => {
              const gaps = q.gaps.map((g, i) => (i === gapIdx ? { ...g, dismissed: !g.dismissed } : g))
              updateQuestion(q.id, { gaps })
            }}
            onBank={() => openBank(q)}
          />
        ))}
      </div>

      {hasScaffolds && (
        <div style={{ marginTop: 18 }}>
          <button onClick={generate} disabled={generating} style={ghostBtn()}>
            {generating ? 'Rebuilding…' : 'Rebuild the scaffolds'}
          </button>
        </div>
      )}

      {/* ── Bank modal ── */}
      {bankingFor && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setBankingFor(null)}
        >
          <div
            style={{ background: T.white, borderRadius: 12, padding: '22px 24px', width: '100%', maxWidth: 460, boxShadow: '0 16px 64px rgba(26,46,43,0.18)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <h3 style={{ fontFamily: UI, fontWeight: 600, fontSize: 16.5, color: T.textPrimary, margin: 0 }}>
                Bank this answer
              </h3>
              <button onClick={() => setBankingFor(null)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textTertiary }}>
                <XIcon size={16} />
              </button>
            </div>
            <p style={{ fontFamily: BODY, fontSize: 13, color: T.textSecondary, margin: '0 0 14px', lineHeight: 1.55 }}>
              Saves it to your reusable content, so the builder can map it into your next application.
            </p>
            <label style={{ fontFamily: UI, fontSize: 12.5, fontWeight: 600, color: T.textSecondary, display: 'block', marginBottom: 6 }}>Type</label>
            <select value={bankType} onChange={e => setBankType(e.target.value as BlockType)} style={{ ...inputStyle(), cursor: 'pointer', marginBottom: 12 }}>
              {BLOCK_TYPES.map(t => <option key={t} value={t}>{BLOCK_TYPE_LABELS[t]}</option>)}
            </select>
            <label style={{ fontFamily: UI, fontSize: 12.5, fontWeight: 600, color: T.textSecondary, display: 'block', marginBottom: 6 }}>Title</label>
            <input value={bankTitle} onChange={e => setBankTitle(e.target.value)} style={{ ...inputStyle(), marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={bankAnswer} disabled={bankSaving} style={primaryBtn(bankSaving)}>
                {bankSaving ? 'Banking…' : 'Bank it'}
              </button>
              <button onClick={() => setBankingFor(null)} style={ghostBtn()}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: T.greenDeep, color: '#F1F7E4', fontFamily: UI, fontWeight: 500, fontSize: 13.5,
          padding: '11px 20px', borderRadius: 10, zIndex: 60, boxShadow: '0 8px 32px rgba(23,52,4,0.3)',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}

// ── Question card ────────────────────────────────────────────────────────────

function QuestionCard({ index, question: q, onAnswerChange, onToggleGap, onBank }: {
  index: number
  question: ApplicationQuestion
  onAnswerChange: (text: string) => void
  onToggleGap: (gapIdx: number) => void
  onBank: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const words = wordCount(q.user_answer)
  const limit = q.word_limit
  const overLimit = limit !== null && words > limit
  const nearLimit = limit !== null && !overLimit && words > limit * 0.9
  const countColor = overLimit ? T.coral : nearLimit ? T.amberText : T.textTertiary
  const openGaps = q.gaps.filter(g => !g.dismissed)
  const hasScaffold = !!q.scaffold && q.scaffold.length > 0

  return (
    <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
      {/* Question header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '16px 20px', background: 'transparent', border: 'none', cursor: 'pointer',
        }}
        aria-expanded={!collapsed}
      >
        <span style={{
          fontFamily: UI, fontWeight: 700, fontSize: 12, color: T.sage, background: T.paleGreen,
          width: 26, height: 26, borderRadius: 999, display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexShrink: 0, marginTop: 1,
        }}>
          {index + 1}
        </span>
        <span style={{ flex: 1, fontFamily: UI, fontWeight: 600, fontSize: 15, color: T.textPrimary, lineHeight: 1.45 }}>
          {q.question_text}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {q.answer_banked && (
            <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 10.5, color: T.greenText, background: T.greenBg, padding: '3px 9px', borderRadius: 999 }}>
              Banked
            </span>
          )}
          {limit !== null && (
            <span style={{ fontFamily: UI, fontWeight: 500, fontSize: 11.5, color: countColor }}>
              {words}/{limit}
            </span>
          )}
          <ChevronDown size={15} color={T.textTertiary}
            style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 160ms ease' }} />
        </span>
      </button>

      {!collapsed && (
        <div style={{
          display: 'grid', gap: 0,
          gridTemplateColumns: hasScaffold ? 'minmax(0, 5fr) minmax(0, 6fr)' : '1fr',
          borderTop: `1px solid ${T.border}`,
        }}>
          {/* Left: scaffold + mapped + gaps */}
          {hasScaffold && (
            <div style={{ padding: '16px 20px', borderRight: `1px solid ${T.border}`, background: '#FBFDF7' }}>
              <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.greenMid, marginBottom: 10 }}>
                What a strong answer covers
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {q.scaffold!.slice().sort((a, b) => a.suggested_order - b.suggested_order).map((s, i) => (
                  <li key={i} style={{ fontFamily: BODY, fontSize: 13, color: T.textPrimary, lineHeight: 1.5 }}>
                    <span style={{ fontFamily: UI, fontWeight: 600 }}>{s.heading}.</span>{' '}
                    <span style={{ color: T.textSecondary }}>{s.guidance}</span>
                  </li>
                ))}
              </ol>

              {q.mapped_content.length > 0 && (
                <>
                  <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.greenMid, margin: '16px 0 8px' }}>
                    Your content, ready to use
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {q.mapped_content.map((m, i) => (
                      <div key={i} style={{ background: T.paleGreen, borderRadius: 8, padding: '10px 12px' }}>
                        <p style={{ fontFamily: BODY, fontSize: 12.5, color: T.textPrimary, margin: '0 0 4px', lineHeight: 1.5, fontStyle: 'italic' }}>
                          &ldquo;{m.excerpt}&rdquo;
                        </p>
                        <span style={{ fontFamily: UI, fontSize: 11, color: T.sage }}>{m.relevance_note}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {q.gaps.length > 0 && (
                <>
                  <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: openGaps.some(g => g.severity === 'blocking') ? T.coral : T.amberText, margin: '16px 0 8px' }}>
                    What&apos;s missing
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {q.gaps.map((g, i) => (
                      <button
                        key={i}
                        onClick={() => onToggleGap(i)}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 8, textAlign: 'left',
                          background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0',
                          opacity: g.dismissed ? 0.45 : 1,
                        }}
                        title={g.dismissed ? 'Restore' : 'Tick off'}
                      >
                        <span style={{
                          width: 15, height: 15, borderRadius: 4, flexShrink: 0, marginTop: 2,
                          border: `1.5px solid ${g.severity === 'blocking' ? T.coral : T.amberText}`,
                          background: g.dismissed ? (g.severity === 'blocking' ? T.coral : T.amberText) : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {g.dismissed && <Check size={11} color="#fff" />}
                        </span>
                        <span style={{
                          fontFamily: BODY, fontSize: 12.5, lineHeight: 1.5,
                          color: g.severity === 'blocking' ? T.coralText : T.textSecondary,
                          textDecoration: g.dismissed ? 'line-through' : 'none',
                        }}>
                          {g.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Right: the user's answer */}
          <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontFamily: UI, fontWeight: 700, fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.textSecondary }}>
                Your answer
              </span>
              <span style={{ fontFamily: UI, fontWeight: 500, fontSize: 11.5, color: countColor }}>
                {words} {words === 1 ? 'word' : 'words'}{limit !== null ? ` of ${limit}` : ''}
                {overLimit ? ', over the limit' : ''}
              </span>
            </div>
            <textarea
              value={q.user_answer}
              onChange={e => onAnswerChange(e.target.value)}
              rows={hasScaffold ? 12 : 5}
              placeholder={hasScaffold ? 'Write in your own voice. The scaffold on the left is your map.' : 'Build the scaffolds first, or just start writing.'}
              style={{
                fontFamily: BODY, fontSize: 14, color: T.textPrimary, width: '100%',
                padding: '10px 12px', borderRadius: 8, border: `1px solid ${T.border}`,
                background: '#FDFDFB', outline: 'none', resize: 'vertical', lineHeight: 1.65,
              }}
            />
            {q.user_answer.trim() && !q.answer_banked && (
              <button
                onClick={onBank}
                style={{
                  ...ghostBtn(), display: 'inline-flex', alignItems: 'center', gap: 6,
                  paddingLeft: 0, marginTop: 6, color: T.sage,
                }}
              >
                <BookmarkPlus size={14} /> Bank this as reusable content
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

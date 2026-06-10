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
  BookmarkPlus, Check, X as XIcon, FolderKanban, Loader2, PenLine, FileText,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createPipelineItem } from '@/lib/pipeline'
import { emitClientEvent } from '@/lib/events/client'
import ImportApplicationModal from '@/components/builder/ImportApplicationModal'
import { T, UI, BODY, inputStyle, primaryBtn, ghostBtn } from '@/components/builder/tokens'
import {
  BLOCK_TYPES, BLOCK_TYPE_LABELS, answerHash,
  type ApplicationQuestion, type ApplicationRecord, type AnswerReview, type BlockType, type EligibilitySnapshot,
} from '@/lib/builder/types'
import { useIsMobile } from '@/hooks/useIsMobile'

// ── Helpers ──────────────────────────────────────────────────────────────────

function wordCount(s: string): number {
  const t = s.trim()
  return t ? t.split(/\s+/).length : 0
}

function placeholderCount(s: string): number {
  return (s.match(/\[ADD:[^\]]*\]/gi) ?? []).length
}

/** Rows needed to show the whole answer (no inner scrollbar: avoids the
 *  wheel scroll-trap, sliced last lines, and oversized empty boxes). */
function answerRows(text: string, min: number): number {
  const lines = text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 90)), 0)
  return Math.min(40, Math.max(min, lines + 1))
}

/** Gap labels: "no_consultation_evidence" -> "Missing: consultation evidence";
 *  informational *_unavailable types and unclear-comparison types get their
 *  own patterns. */
function gapLabel(t: string): string {
  const s = t.replace(/_/g, ' ').trim().toLowerCase().replace(/\bco design\b/g, 'co-design')
  if (!s) return 'Gap'
  if (/^new vs existing/.test(s)) return 'Unclear: new or existing activity?'
  if (/unavailable$/.test(s)) return s.charAt(0).toUpperCase() + s.slice(1)
  if (/^(no|missing) /.test(s)) return `Missing: ${s.replace(/^(no|missing) /, '')}`
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Informational gaps (not the user's fault) are styled grey, not red/amber. */
function gapIsInformational(t: string): boolean {
  return /unavailable$/.test(t)
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

// Funder-brief fields surfaced in the "what Grant Tracker knows" panel,
// in reading order, with user-facing labels.
const BRIEF_FIELD_ORDER = [
  'what_they_fund', 'priorities', 'exclusions', 'strong_application', 'funder_tips', 'how_to_apply',
] as const
const BRIEF_FIELD_LABELS: Record<string, string> = {
  what_they_fund:     'What they fund',
  priorities:         'Their priorities',
  exclusions:         'What they will not fund',
  strong_application: 'What makes a strong application',
  funder_tips:        'Tips from the funder',
  how_to_apply:       'How to apply',
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

  // Guided drafts (one at a time) + per-question voice prompts (session-only)
  const [draftingQid, setDraftingQid] = useState<string | null>(null)
  const [voicePrompts, setVoicePrompts] = useState<Record<string, string[]>>({})
  // Answers replaced by a draft, recoverable until the user edits again
  const [replacedAnswers, setReplacedAnswers] = useState<Record<string, string>>({})

  // Eligibility gate failure state (the gate must never vanish silently)
  const [gateError, setGateError] = useState<string | null>(null)
  const [proceeding, setProceeding] = useState(false)

  // Per-answer checks (score + tips)
  const [reviewingQid, setReviewingQid] = useState<string | null>(null)

  // Library grew after scaffolds were built → suggest a rebuild
  const [importedSinceBuild, setImportedSinceBuild] = useState(false)

  // Import a past application — same modal as the profile content bank
  const [importOpen, setImportOpen] = useState(false)
  const [blockCount, setBlockCount] = useState<number | null>(null)

  // Header: action menus + sticky condensed bar + linked deadline
  const [menuOpen, setMenuOpen] = useState<'word' | 'more' | null>(null)
  const [stuck, setStuck] = useState(false)
  const [oppDeadline, setOppDeadline] = useState<string | null>(null)

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 170)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Funder context: what the catalogue actually holds, shown not counted
  const [briefData, setBriefData] = useState<Record<string, string> | null>(null)
  const [contextOpen, setContextOpen] = useState(false)
  const [guidelinesOpen, setGuidelinesOpen] = useState(false)
  const [guidelinesText, setGuidelinesText] = useState('')
  const [guidelinesUrl, setGuidelinesUrl] = useState('')
  const [guidelinesBusy, setGuidelinesBusy] = useState(false)
  const [guidelinesError, setGuidelinesError] = useState<string | null>(null)

  // Pipeline link
  const [pipelining, setPipelining] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Autosave evidence: idle -> saving -> saved (fades back to idle)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const savedFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Edit questions after creation (the parse is correctable at any time)
  const [editQsOpen, setEditQsOpen] = useState(false)
  const [editDrafts, setEditDrafts] = useState<{ id: string; question_text: string; word_limit: number | null }[]>([])
  const [editSaving, setEditSaving] = useState(false)

  // Supplied guidelines: view + remove
  const [guidelinesViewOpen, setGuidelinesViewOpen] = useState(false)

  // Bring back a working document edited outside the app
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnText, setReturnText] = useState('')
  const [returnBusy, setReturnBusy] = useState(false)
  const [returnError, setReturnError] = useState<string | null>(null)
  const [returnMapped, setReturnMapped] = useState<{ question_id: string; answer: string; apply: boolean }[] | null>(null)

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
      document.title = `${(data as ApplicationRecord).grant_name || (data as ApplicationRecord).funder_name || 'Application'} · Grant Tracker`
      setLoaded(true)
    }
    load()
  }, [appId, router])

  // ── Eligibility gate: auto-run when an opportunity is linked and unchecked.
  // A failed check must never vanish silently: it sets gateError + retry. ──
  const runGate = useCallback((applicationId: string) => {
    setGateLoading(true)
    setGateError(null)
    fetch('/api/builder/eligibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_id: applicationId }),
    })
      .then(async r => {
        const snap = await r.json() as EligibilitySnapshot & { error?: string }
        if (r.ok && 'overall_status' in snap) {
          setApp(prev => (prev ? { ...prev, eligibility_result: snap } : prev))
        } else {
          setGateError(snap?.error ?? 'The eligibility check did not complete')
        }
      })
      .catch(() => setGateError('The eligibility check did not complete'))
      .finally(() => setGateLoading(false))
  }, [])

  useEffect(() => {
    if (!app || !app.opportunity_id || app.eligibility_result || gateLoading || gateError) return
    runGate(app.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id, app?.opportunity_id, app?.eligibility_result])

  // ── Leaving mid-stream cancels the work: warn first ──
  const streamActive = generating || draftingQid !== null
  useEffect(() => {
    if (!streamActive) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [streamActive])

  // ── Content-library size: drives the import nudge ──
  useEffect(() => {
    if (!app?.org_id) return
    const supabase = createClient()
    supabase
      .from('org_core_content')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', app.org_id)
      .then(({ count }) => setBlockCount(count ?? 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.org_id])

  // ── Funder context: load the actual brief content (shown, not counted) ──
  useEffect(() => {
    if (!app?.opportunity_id) return
    const supabase = createClient()
    supabase
      .from('grants_with_funder')
      .select('funder_brief, deadline, is_rolling')
      .eq('id', app.opportunity_id)
      .maybeSingle()
      .then(({ data }) => {
        const fb = (data?.funder_brief ?? {}) as Record<string, unknown>
        const held: Record<string, string> = {}
        for (const k of BRIEF_FIELD_ORDER) {
          if (typeof fb[k] === 'string' && (fb[k] as string).trim().length > 0) held[k] = (fb[k] as string).trim()
        }
        setBriefData(held)
        setOppDeadline(!data?.is_rolling && data?.deadline ? String(data.deadline) : null)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.opportunity_id])

  async function submitGuidelines() {
    if (!app) return
    setGuidelinesBusy(true); setGuidelinesError(null)
    try {
      const res = await fetch('/api/builder/guidelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: app.id,
          text: guidelinesText.trim() || undefined,
          url: guidelinesText.trim() ? undefined : (guidelinesUrl.trim() || undefined),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setGuidelinesError(data?.error ?? 'Could not add the guidance'); return }
      // Hold the real stored text locally so View shows what is actually used.
      if (guidelinesText.trim()) {
        setApp(prev => (prev ? { ...prev, supplied_guidelines: guidelinesText.trim() } : prev))
      } else {
        const supabase = createClient()
        const { data: row } = await supabase
          .from('applications')
          .select('supplied_guidelines')
          .eq('id', app.id)
          .maybeSingle()
        setApp(prev => (prev ? { ...prev, supplied_guidelines: row?.supplied_guidelines ?? 'added' } : prev))
      }
      setGuidelinesOpen(false)
      setGuidelinesText('')
      setGuidelinesUrl('')
      showToast('Guidance added. Guides and drafts will use it')
    } catch {
      setGuidelinesError('Could not add the guidance, please try again')
    } finally {
      setGuidelinesBusy(false)
    }
  }

  // ── Bring back a working doc: map -> review -> apply ──
  async function mapReturnedDoc() {
    if (!app || returnBusy) return
    setReturnBusy(true); setReturnError(null)
    try {
      const res = await fetch('/api/builder/return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: app.id, raw_text: returnText }),
      })
      const data = await res.json()
      if (!res.ok) { setReturnError(data?.error ?? 'Could not read the document'); return }
      const mapped = (data.answers as { question_id: string; answer: string }[]).map(a => {
        const current = app.questions.find(q => q.id === a.question_id)?.user_answer.trim() ?? ''
        return { ...a, apply: a.answer.trim() !== current }
      })
      setReturnMapped(mapped)
    } catch {
      setReturnError('Could not read the document, please try again')
    } finally {
      setReturnBusy(false)
    }
  }

  async function applyReturnedAnswers() {
    if (!app || !returnMapped) return
    const toApply = returnMapped.filter(a => a.apply)
    if (toApply.length === 0) { setReturnError('Tick at least one answer to apply'); return }
    setApp(prev => {
      if (!prev) return prev
      const replaced: Record<string, string> = {}
      const questions = prev.questions.map(q => {
        const incoming = toApply.find(a => a.question_id === q.id)
        if (!incoming) return q
        if (q.user_answer.trim() && q.user_answer.trim() !== incoming.answer.trim()) {
          replaced[q.id] = q.user_answer
        }
        return { ...q, user_answer: incoming.answer }
      })
      if (Object.keys(replaced).length > 0) {
        setReplacedAnswers(prevMap => ({ ...prevMap, ...replaced }))
      }
      persistQuestions(questions)
      return { ...prev, questions }
    })
    // Record the round trip (best effort).
    fetch('/api/builder/return', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application_id: app.id,
        matched_count: returnMapped.length,
        applied_count: toApply.length,
      }),
    }).catch(() => {})
    setReturnOpen(false)
    setReturnMapped(null)
    setReturnText('')
    showToast(`${toApply.length} ${toApply.length === 1 ? 'answer' : 'answers'} updated. Previous versions are restorable per question`)
  }

  // ── Edit questions after creation: fix the parse at any time ──
  function openEditQuestions() {
    if (!app) return
    setEditDrafts(app.questions.map(q => ({ id: q.id, question_text: q.question_text, word_limit: q.word_limit })))
    setEditQsOpen(true)
  }

  async function saveEditedQuestions() {
    if (!app || editSaving) return
    const kept = editDrafts.filter(d => d.question_text.trim())
    if (kept.length === 0) { showToast('Keep at least one question'); return }
    const removedWithAnswers = app.questions.filter(
      q => q.user_answer.trim() && !kept.some(d => d.id === q.id),
    )
    if (removedWithAnswers.length > 0 &&
        !window.confirm(`${removedWithAnswers.length} removed ${removedWithAnswers.length === 1 ? 'question has' : 'questions have'} written answers that will be deleted. Continue?`)) {
      return
    }
    setEditSaving(true)
    try {
      const byId = new Map(app.questions.map(q => [q.id, q]))
      const updated: ApplicationQuestion[] = kept.map(d => {
        const existing = byId.get(d.id)
        if (existing) {
          return {
            ...existing,
            question_text: d.question_text.trim(),
            word_limit: d.word_limit && d.word_limit > 0 ? Math.round(d.word_limit) : null,
          }
        }
        return {
          id: d.id,
          question_text: d.question_text.trim(),
          word_limit: d.word_limit && d.word_limit > 0 ? Math.round(d.word_limit) : null,
          scaffold: null,
          mapped_content: [],
          gaps: [],
          user_answer: '',
          answer_banked: false,
        }
      })
      const supabase = createClient()
      const { error } = await supabase
        .from('applications')
        .update({ questions: updated, updated_at: new Date().toISOString() })
        .eq('id', app.id)
      if (error) { showToast('Could not save the questions'); return }
      setApp(prev => (prev ? { ...prev, questions: updated } : prev))
      setEditQsOpen(false)
      showToast('Questions updated. Rebuild the guides to cover new or reworded ones')
    } finally {
      setEditSaving(false)
    }
  }

  // ── Per-answer check: score out of 10 + tips to improve ──
  async function reviewAnswer(q: ApplicationQuestion) {
    if (!app || reviewingQid) return
    if (!q.user_answer.trim()) { showToast('Write the answer first'); return }
    setReviewingQid(q.id)
    try {
      const res = await fetch('/api/builder/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: app.id, question_id: q.id }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data?.error ?? 'Check failed, please try again'); return }
      updateQuestion(q.id, { review: data as AnswerReview })
    } catch {
      showToast('Check failed, please try again')
    } finally {
      setReviewingQid(null)
    }
  }

  // ── Guided draft: composition from their blocks, streamed into the editor ──
  async function draftAnswer(q: ApplicationQuestion) {
    if (!app || draftingQid) return
    const previousAnswer = q.user_answer.trim()
    if (previousAnswer && !window.confirm('Replace your current answer with a fresh starting draft? You can restore the previous answer afterwards.')) return
    if (previousAnswer) {
      // Keep the replaced answer recoverable: the debounced save would
      // otherwise overwrite it within a second of the draft starting.
      setReplacedAnswers(prev => ({ ...prev, [q.id]: previousAnswer }))
    }
    setDraftingQid(q.id)
    try {
      const res = await fetch('/api/builder/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: app.id, question_id: q.id }),
      })
      if (!res.ok || !res.body) {
        showToast('Draft failed, please try again')
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let lineBuffer = ''
      let draftText = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        lineBuffer += decoder.decode(value, { stream: true })
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          let evt: { t: string; text?: string; draft?: string; voice_prompts?: string[]; message?: string }
          try { evt = JSON.parse(line) } catch { continue }
          if (evt.t === 'delta' && evt.text) {
            draftText += evt.text
            // Show the draft as it streams; keep the voice tail out of the editor.
            const visible = draftText.split('---VOICE---')[0]
            updateQuestion(q.id, { user_answer: visible })
          } else if (evt.t === 'done') {
            updateQuestion(q.id, { user_answer: (evt.draft ?? draftText.split('---VOICE---')[0]).trim() })
            if (evt.voice_prompts?.length) {
              setVoicePrompts(prev => ({ ...prev, [q.id]: evt.voice_prompts! }))
            }
          } else if (evt.t === 'error') {
            showToast(evt.message ?? 'Draft failed')
          }
        }
      }
    } catch {
      showToast('Draft failed, please try again')
    } finally {
      setDraftingQid(null)
    }
  }

  async function proceedAnyway() {
    if (!app || proceeding) return
    setProceeding(true)
    try {
      const res = await fetch('/api/builder/eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: app.id, proceed: true }),
      })
      const snap = await res.json()
      if (res.ok) {
        setApp(prev => (prev ? { ...prev, eligibility_result: snap } : prev))
      } else {
        showToast(snap?.error ?? 'Could not record that, please try again')
      }
    } catch {
      showToast('Could not record that, please try again')
    } finally {
      setProceeding(false)
    }
  }

  // ── Persist question edits (debounced, with visible save state) ──
  const persistQuestions = useCallback((questions: ApplicationQuestion[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (savedFadeTimer.current) clearTimeout(savedFadeTimer.current)
    setSaveState('saving')
    saveTimer.current = setTimeout(async () => {
      const supabase = createClient()
      // Merge-on-write: server routes (generate, review, bank) may have
      // written newer scaffold/review/banked fields since this client state
      // loaded. Re-read and keep the server-owned fields; the client owns
      // user_answer, question text, word limits, and gap dismissals.
      const { data: freshRow } = await supabase
        .from('applications')
        .select('questions')
        .eq('id', appId)
        .maybeSingle()
      const fresh = (freshRow?.questions ?? []) as ApplicationQuestion[]
      const freshById = new Map(fresh.map(q => [q.id, q]))
      const next = questions.map(q => {
        const f = freshById.get(q.id)
        if (!f) return q
        return {
          ...q,
          scaffold: f.scaffold ?? q.scaffold,
          mapped_content: (f.mapped_content?.length ? f.mapped_content : q.mapped_content),
          gaps: (!q.scaffold && f.scaffold) ? f.gaps : q.gaps,
          review: f.review ?? q.review,
          answer_banked: f.answer_banked || q.answer_banked,
        }
      })
      const { error } = await supabase
        .from('applications')
        .update({ questions: next, updated_at: new Date().toISOString() })
        .eq('id', appId)
      if (error) {
        setSaveState('idle')
        return
      }
      setSaveState('saved')
      savedFadeTimer.current = setTimeout(() => setSaveState('idle'), 2000)
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
    setImportedSinceBuild(false)
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
      // Chunked parallel generation: deltas are tagged with a chunk index;
      // the plan event gives each chunk's question count so chunk-local
      // positions map to global ones.
      const chunkBuffers: string[] = ['']
      let chunkOffsets: number[] = [0]
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        lineBuffer += decoder.decode(value, { stream: true })
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          let evt: { t: string; c?: number; chunks?: number[]; text?: string; message?: string; questions?: ApplicationQuestion[] }
          try { evt = JSON.parse(line) } catch { continue }
          if (evt.t === 'plan' && Array.isArray(evt.chunks)) {
            chunkOffsets = []
            let acc = 0
            for (const n of evt.chunks) { chunkOffsets.push(acc); acc += n }
            while (chunkBuffers.length < evt.chunks.length) chunkBuffers.push('')
          } else if (evt.t === 'delta' && evt.text) {
            const c = evt.c ?? 0
            while (chunkBuffers.length <= c) chunkBuffers.push('')
            chunkBuffers[c] += evt.text
            // Progressive render: merge each COMPLETED question's scaffold
            // onto its card the moment it finishes streaming, regardless of
            // which parallel chunk it came from.
            const completedByGlobal = new Map<number, StreamedQuestion>()
            chunkBuffers.forEach((buf, ci) => {
              const completed = extractStreamedQuestions(buf)
              completed.forEach((gen, qi) => {
                completedByGlobal.set((chunkOffsets[ci] ?? 0) + qi, gen)
              })
            })
            if (completedByGlobal.size > 0) {
              setStreamedCount(completedByGlobal.size)
              setApp(prev => {
                if (!prev) return prev
                const questions = prev.questions.map((q, i) => {
                  const gen = completedByGlobal.get(i)
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
            // Keep anything typed locally during generation: local
            // user_answer wins over the server's final snapshot.
            setApp(prev => {
              if (!prev) return prev
              const localById = new Map(prev.questions.map(q => [q.id, q]))
              const questions = evt.questions!.map(q => {
                const local = localById.get(q.id)
                return local && local.user_answer.trim() !== q.user_answer.trim()
                  ? { ...q, user_answer: local.user_answer }
                  : q
              })
              return { ...prev, questions, status: 'in_progress' }
            })
          } else if (evt.t === 'warning') {
            showToast(evt.message ?? 'Some questions did not build')
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
        showToast('Saved to your material. It will be mapped into your next application')
        setBankingFor(null)
      } else {
        // Keep the modal open so nothing is lost; surface the reason.
        const data = await res.json().catch(() => ({})) as { error?: string }
        showToast(data?.error ?? 'Could not bank the answer, please try again')
      }
    } catch {
      showToast('Could not bank the answer, please try again')
    } finally {
      setBankSaving(false)
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

  const completeWarnedRef = useRef(false)
  async function markComplete() {
    if (!app) return
    const remaining = app.questions.reduce((n, q) => n + placeholderCount(q.user_answer), 0)
    if (remaining > 0 && !completeWarnedRef.current) {
      completeWarnedRef.current = true
      showToast(`${remaining} [ADD: ...] ${remaining === 1 ? 'placeholder' : 'placeholders'} still to fill. Click again to complete anyway`)
      return
    }
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

  // Header actions: six buttons condensed to three controls (spec §3.2).
  function HeaderActions({ compact }: { compact?: boolean }) {
    const btn: React.CSSProperties = {
      fontFamily: UI, fontWeight: 600, fontSize: compact ? 12.5 : 13, color: T.textPrimary,
      background: T.white, border: `1px solid ${T.textPrimary}`, padding: compact ? '6px 11px' : '8px 14px',
      borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
    }
    const item: React.CSSProperties = {
      display: 'block', width: '100%', textAlign: 'left', fontFamily: UI, fontWeight: 500,
      fontSize: 13, color: T.textPrimary, background: 'transparent', border: 'none',
      padding: '9px 14px', cursor: 'pointer', textDecoration: 'none',
    }
    const menu: React.CSSProperties = {
      position: 'absolute', top: '100%', right: 0, zIndex: 60, marginTop: 4, minWidth: 230,
      background: T.white, border: `1px solid ${T.borderStrong}`, borderRadius: 10,
      boxShadow: '0 10px 32px rgba(26,46,43,0.14)', overflow: 'hidden', padding: '4px 0',
    }
    return (
      <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
        {menuOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setMenuOpen(null)} />
        )}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(m => (m === 'word' ? null : 'word'))} style={btn} aria-haspopup="menu" aria-expanded={menuOpen === 'word'}>
            <FileText size={14} /> Work in Word <ChevronDown size={12} />
          </button>
          {menuOpen === 'word' && (
            <div style={menu} role="menu">
              <a
                href={`/api/builder/export?application_id=${app?.id}`}
                download
                style={item}
                onClick={() => setMenuOpen(null)}
              >
                Download draft as Word doc
              </a>
              <button style={item} onClick={() => { setMenuOpen(null); setReturnOpen(true); setReturnError(null) }}>
                Upload your edited draft
              </button>
            </div>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(m => (m === 'more' ? null : 'more'))}
            style={{ ...btn, paddingLeft: compact ? 9 : 12, paddingRight: compact ? 9 : 12 }}
            aria-label="More actions" aria-haspopup="menu" aria-expanded={menuOpen === 'more'}
          >
            &#8943;
          </button>
          {menuOpen === 'more' && (
            <div style={menu} role="menu">
              <button style={item} onClick={() => { setMenuOpen(null); setImportOpen(true) }}>
                Import a past application
              </button>
              <button style={item} onClick={() => { setMenuOpen(null); openEditQuestions() }}>
                Edit the question list
              </button>
              {!app?.pipeline_item_id && (
                <button style={item} disabled={pipelining} onClick={() => { setMenuOpen(null); trackInPipeline() }}>
                  {pipelining ? 'Adding to pipeline…' : 'Track in pipeline'}
                </button>
              )}
            </div>
          )}
        </div>
        {hasScaffolds && app?.status !== 'complete' && (
          <button onClick={markComplete} style={{
            fontFamily: UI, fontWeight: 600, fontSize: compact ? 12.5 : 13, color: '#F1F7E4',
            background: T.greenDeep, border: 'none', padding: compact ? '6px 12px' : '8px 14px',
            borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <Check size={14} /> Mark complete
          </button>
        )}
      </div>
    )
  }

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
      <Link
        href="/dashboard/applications"
        onClick={e => {
          if (streamActive && !window.confirm('Still building. Leave now and the work in progress stops?')) {
            e.preventDefault()
          }
        }}
        style={{
          fontFamily: UI, fontWeight: 500, fontSize: 13, color: T.textSecondary,
          textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14,
        }}
      >
        <ArrowLeft size={14} /> Applications
      </Link>

      {/* Sticky condensed bar */}
      {stuck && (
        <div style={{
          position: 'sticky', top: 8, zIndex: 40,
          background: T.white, border: `1px solid ${T.border}`, borderRadius: 12,
          padding: '9px 16px', marginBottom: 12, boxShadow: '0 6px 24px rgba(26,46,43,0.10)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 14, color: T.textPrimary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {app.grant_name || app.funder_name || 'Application'}
          </span>
          <span style={{ fontFamily: UI, fontSize: 12, color: T.textSecondary, whiteSpace: 'nowrap' }}>
            {answeredCount} of {app.questions.length} written{saveState === 'saving' ? ' · saving…' : ' · autosaved'}
          </span>
          <HeaderActions compact />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontFamily: UI, fontWeight: 600, fontSize: 23, color: T.textPrimary, letterSpacing: '-0.01em', margin: 0 }}>
            {app.grant_name || app.funder_name || 'Application'}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            {app.funder_name && app.grant_name && (
              <span style={{ fontFamily: BODY, fontSize: 13.5, color: T.textSecondary }}>{app.funder_name}</span>
            )}
            {gate && blockers.length === 0 && (
              <span
                title="Based on your profile and this funder's criteria. Always confirm on the funder's site."
                style={{
                  fontFamily: UI, fontWeight: 600, fontSize: 11.5, color: T.greenText,
                  background: T.greenBg, padding: '3px 10px', borderRadius: 999,
                  display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'help',
                }}
              >
                <Check size={11} /> {STATUS_LABELS[gate.overall_status] ?? 'Looks eligible'}
              </span>
            )}
            {oppDeadline && (
              <span style={{
                fontFamily: UI, fontWeight: 600, fontSize: 11.5, color: T.textSecondary,
                background: T.cream, padding: '3px 10px', borderRadius: 999,
              }}>
                Deadline: {oppDeadline}
              </span>
            )}
          </div>
        </div>
        <HeaderActions />
      </div>

      {/* Progress row */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
          <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 12.5, color: T.textSecondary }}>
            {answeredCount} of {app.questions.length} questions written
          </span>
          {saveState !== 'idle' && (
            <span style={{ fontFamily: UI, fontSize: 11.5, color: saveState === 'saved' ? T.greenMid : T.textTertiary }}>
              {saveState === 'saving' ? 'Saving…' : 'Saved'}
            </span>
          )}
        </div>
        <div style={{ height: 6, background: T.cream, borderRadius: 999, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${app.questions.length ? Math.round((answeredCount / app.questions.length) * 100) : 0}%`,
            background: T.lime, borderRadius: 999, transition: 'width 300ms ease',
          }} />
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
          {gateError && !gateLoading && (
            <div style={{ background: T.amberBg, borderRadius: 12, padding: '13px 18px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <AlertTriangle size={15} color={T.amberText} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontFamily: BODY, fontSize: 13, color: T.amberText, minWidth: 200 }}>
                {gateError}. You can still build, but check the funder&apos;s criteria yourself.
              </span>
              <button onClick={() => runGate(app.id)} style={{
                fontFamily: UI, fontWeight: 600, fontSize: 12.5, color: T.amberText,
                background: 'transparent', border: `1px solid rgba(133,79,11,0.35)`,
                padding: '6px 13px', borderRadius: 8, cursor: 'pointer',
              }}>
                Try again
              </button>
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
                  <button onClick={proceedAnyway} disabled={proceeding} style={{
                    fontFamily: UI, fontWeight: 600, fontSize: 12.5, color: T.coralText,
                    background: 'transparent', border: `1px solid rgba(153,60,29,0.35)`,
                    padding: '6px 12px', borderRadius: 8,
                    cursor: proceeding ? 'wait' : 'pointer', opacity: proceeding ? 0.6 : 1,
                  }}>
                    {proceeding ? 'Recording…' : 'I understand, continue anyway'}
                  </button>
                </div>
              ) : (
                <span style={{ fontFamily: UI, fontSize: 12, color: T.coralText }}>
                  Continuing with the warning acknowledged. It stays visible here.
                </span>
              )}
            </div>
          )}
          {gate && blockers.length === 0 && warnings.length > 0 && (
            <div style={{ background: T.paleGreen, borderRadius: 12, padding: '13px 18px', display: 'flex', alignItems: 'flex-start', gap: 9 }}>
              <CheckCircle2 size={16} color={T.greenMid} style={{ marginTop: 1, flexShrink: 0 }} />
              <div>
                <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 13.5, color: T.sage }}>
                  {STATUS_LABELS[gate.overall_status] ?? gate.overall_status}
                </span>
                <span style={{ display: 'block', fontFamily: BODY, fontSize: 11.5, color: T.textSecondary, marginTop: 2 }}>
                  Based on your profile and this funder&apos;s criteria. Always confirm on the funder&apos;s site.
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

      {/* ── No funder linked: say so honestly ── */}
      {!app.opportunity_id && (
        <div style={{ background: T.cream, borderRadius: 12, padding: '11px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 9 }}>
          <FileText size={14} color={T.textTertiary} style={{ flexShrink: 0 }} />
          <span style={{ fontFamily: BODY, fontSize: 12.5, color: T.textSecondary }}>
            No funder linked. Guides build from your profile and library only, and there is no
            eligibility check, so read the funder&apos;s criteria yourself.
          </span>
        </div>
      )}

      {/* ── What Grant Tracker knows about this funder (shown, not counted) ── */}
      {app.opportunity_id && briefData !== null && !app.supplied_guidelines && (() => {
        const heldKeys = BRIEF_FIELD_ORDER.filter(k => briefData[k])
        const missingKeys = BRIEF_FIELD_ORDER.filter(k => !briefData[k])
        const thin = heldKeys.length < 3
        return (
        <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
          {/* Header: expand to read the actual content */}
          <button
            onClick={() => setContextOpen(o => !o)}
            aria-expanded={contextOpen}
            style={{
              width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
              padding: '13px 18px', background: 'transparent', border: 'none', cursor: 'pointer',
            }}
          >
            <FileText size={15} color={thin ? T.amberText : T.greenMid} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 13.5, color: T.textPrimary }}>
                What Grant Tracker knows about this funder
              </span>
              <span style={{ display: 'block', fontFamily: BODY, fontSize: 12, color: T.textSecondary, marginTop: 2 }}>
                {thin
                  ? heldKeys.length === 0
                    ? 'Nothing held yet. Guides and drafts will be generic for this funder unless you add their guidance.'
                    : `Limited: ${heldKeys.map(k => BRIEF_FIELD_LABELS[k].toLowerCase()).join(', ')}. Adding their guidance will sharpen guides and drafts.`
                  : 'Guides are based on our summary of this funder. Check it against the funder’s site.'}
              </span>
            </span>
            {thin && !guidelinesOpen && (
              <span
                onClick={e => { e.stopPropagation(); setGuidelinesOpen(true); setContextOpen(true) }}
                role="button"
                style={{
                  fontFamily: UI, fontWeight: 600, fontSize: 12.5, color: T.textPrimary,
                  background: T.white, border: `1px solid ${T.textPrimary}`, padding: '6px 13px',
                  borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                Add their guidance
              </span>
            )}
            <ChevronDown size={15} color={T.textTertiary}
              style={{ flexShrink: 0, transform: contextOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 160ms ease' }} />
          </button>

          {/* Expanded: the actual brief content, field by field */}
          {contextOpen && (
            <div style={{ borderTop: `1px solid ${T.border}`, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {heldKeys.map(k => (
                <div key={k}>
                  <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.greenMid, marginBottom: 3 }}>
                    {BRIEF_FIELD_LABELS[k]}
                  </div>
                  <p style={{ fontFamily: BODY, fontSize: 13, color: T.textPrimary, margin: 0, lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                    {briefData[k]}
                  </p>
                </div>
              ))}
              {missingKeys.length > 0 && (
                <p style={{ fontFamily: BODY, fontSize: 12, color: T.textTertiary, margin: 0, lineHeight: 1.5 }}>
                  Not held yet: {missingKeys.map(k => BRIEF_FIELD_LABELS[k].toLowerCase()).join(', ')}.
                </p>
              )}
              {!guidelinesOpen && (
                <button
                  onClick={() => setGuidelinesOpen(true)}
                  style={{
                    ...ghostBtn(), paddingLeft: 0, textAlign: 'left',
                    color: T.sage, fontSize: 12.5, alignSelf: 'flex-start',
                  }}
                >
                  Seen something on the funder&apos;s site that&apos;s missing here? Add their guidance
                </button>
              )}
            </div>
          )}
          {guidelinesOpen && (
            <div style={{ borderTop: `1px solid ${T.border}`, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <textarea
                value={guidelinesText}
                onChange={e => setGuidelinesText(e.target.value)}
                rows={5}
                placeholder="Paste the funder's application guidance here…"
                style={{
                  fontFamily: BODY, fontSize: 13, color: T.textPrimary, width: '100%',
                  padding: '9px 12px', borderRadius: 8, border: `1px solid ${T.borderStrong}`,
                  background: T.white, outline: 'none', resize: 'vertical', lineHeight: 1.55,
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: UI, fontSize: 12, color: T.textTertiary }}>or fetch from</span>
                <input
                  value={guidelinesUrl}
                  onChange={e => setGuidelinesUrl(e.target.value)}
                  placeholder="https://funder.org.uk/how-to-apply"
                  style={{
                    fontFamily: BODY, fontSize: 13, color: T.textPrimary, flex: 1, minWidth: 220,
                    padding: '7px 11px', borderRadius: 8, border: `1px solid ${T.borderStrong}`,
                    background: T.white, outline: 'none',
                  }}
                />
              </div>
              {guidelinesError && <p style={{ fontFamily: BODY, fontSize: 12.5, color: T.coralText, margin: 0 }}>{guidelinesError}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={submitGuidelines} disabled={guidelinesBusy} style={{
                  fontFamily: UI, fontWeight: 600, fontSize: 13, color: '#F1F7E4',
                  background: T.greenDeep, border: 'none', padding: '8px 16px', borderRadius: 8,
                  cursor: guidelinesBusy ? 'wait' : 'pointer', opacity: guidelinesBusy ? 0.7 : 1,
                }}>
                  {guidelinesBusy ? 'Adding…' : 'Add guidance'}
                </button>
                <button onClick={() => setGuidelinesOpen(false)} style={ghostBtn()}>Cancel</button>
              </div>
              <p style={{ fontFamily: BODY, fontSize: 11.5, color: T.textTertiary, margin: 0, lineHeight: 1.5 }}>
                Used only to shape this application. It is treated as your supplied guidance, separate
                from the verified catalogue entry.
              </p>
            </div>
          )}
        </div>
        )
      })()}
      {app.supplied_guidelines && (
        <div style={{ background: T.paleGreen, borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ padding: '11px 18px', display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <FileText size={14} color={T.greenMid} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, fontFamily: BODY, fontSize: 12.5, color: T.sage, minWidth: 180 }}>
              The funder&apos;s guidance you supplied is being used to shape guides and drafts.
            </span>
            <button
              onClick={() => setGuidelinesViewOpen(o => !o)}
              style={{ fontFamily: UI, fontWeight: 600, fontSize: 12, color: T.sage, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
            >
              {guidelinesViewOpen ? 'Hide' : 'View'}
            </button>
            <button
              onClick={async () => {
                const supabase = createClient()
                const { error } = await supabase
                  .from('applications')
                  .update({ supplied_guidelines: null, supplied_guidelines_source: null, updated_at: new Date().toISOString() })
                  .eq('id', app.id)
                if (error) { showToast('Could not remove the guidance'); return }
                setApp(prev => (prev ? { ...prev, supplied_guidelines: null, supplied_guidelines_source: null } : prev))
                setGuidelinesViewOpen(false)
                showToast('Guidance removed')
              }}
              style={{ fontFamily: UI, fontWeight: 600, fontSize: 12, color: T.textSecondary, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
            >
              Remove
            </button>
          </div>
          {guidelinesViewOpen && (
            <div style={{ borderTop: '1px solid rgba(59,109,17,0.15)', padding: '12px 18px', maxHeight: 260, overflowY: 'auto' }}>
              <p style={{ fontFamily: BODY, fontSize: 12.5, color: T.textPrimary, margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {app.supplied_guidelines}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Generate CTA / progress ── */}
      {(!hasScaffolds || generating) && (
        <div style={{
          background: `linear-gradient(135deg, ${T.white} 0%, ${T.softGreen} 100%)`,
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
            {generating ? 'Building your guides' : 'Ready to build your guides'}
          </h2>
          <p style={{ fontFamily: BODY, fontSize: 13.5, color: T.textSecondary, margin: '0 auto 16px', lineHeight: 1.6, maxWidth: 460 }}>
            {generating
              ? streamedCount > 0
                ? `${streamedCount} of ${app.questions.length} done. Finished cards are ready below while the rest build.`
                : 'Reading your profile, your content blocks and the funder context. The first card lands in a few seconds.'
              : blockCount === 0
                ? 'You have no saved material yet, so guides and drafts will be mostly gaps. Import a past application first (button above) and the builder works from your real material.'
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
              Build the guides
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

      {/* ── Rebuild nudge: library grew after scaffolds were built ── */}
      {importedSinceBuild && hasScaffolds && !generating && (
        <div style={{ background: T.paleGreen, borderRadius: 12, padding: '12px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Sparkles size={15} color={T.greenMid} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, fontFamily: BODY, fontSize: 13, color: T.sage, minWidth: 200 }}>
            Your material grew since these guides were built. Rebuild them to map your new material in.
          </span>
          <button onClick={generate} style={{
            fontFamily: UI, fontWeight: 600, fontSize: 12.5, color: T.greenDeep,
            background: T.lime, border: 'none', padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
          }}>
            Regenerate question guides
          </button>
        </div>
      )}

      {/* ── Question cards ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {app.questions.map((q, idx) => (
          <QuestionCard
            key={q.id}
            index={idx}
            question={q}
            drafting={draftingQid === q.id}
            draftDisabled={draftingQid !== null}
            reviewing={reviewingQid === q.id}
            voicePrompts={voicePrompts[q.id] ?? []}
            replacedAnswer={replacedAnswers[q.id] ?? null}
            onRestoreAnswer={() => {
              const prev = replacedAnswers[q.id]
              if (!prev) return
              updateQuestion(q.id, { user_answer: prev })
              setReplacedAnswers(map => {
                const next = { ...map }
                delete next[q.id]
                return next
              })
              showToast('Previous answer restored')
            }}
            onAnswerChange={text => updateQuestion(q.id, { user_answer: text })}
            onToggleGap={gapIdx => {
              const gaps = q.gaps.map((g, i) => (i === gapIdx ? { ...g, dismissed: !g.dismissed } : g))
              updateQuestion(q.id, { gaps })
            }}
            onBank={() => openBank(q)}
            onDraft={() => draftAnswer(q)}
            onReview={() => reviewAnswer(q)}
          />
        ))}
      </div>

      {hasScaffolds && (
        <div style={{ marginTop: 18 }}>
          <button onClick={generate} disabled={generating} style={{
            fontFamily: UI, fontWeight: 600, fontSize: 13, color: T.textPrimary,
            background: T.white, border: `1px solid ${T.textPrimary}`, padding: '8px 16px',
            borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 6,
            cursor: generating ? 'wait' : 'pointer', opacity: generating ? 0.6 : 1,
          }}>
            <Sparkles size={14} /> {generating ? 'Regenerating…' : 'Regenerate question guides, your answers won’t change'}
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
                Save to your material
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
                {bankSaving ? 'Saving…' : 'Save it'}
              </button>
              <button onClick={() => setBankingFor(null)} style={ghostBtn()}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bring back edits modal ── */}
      {returnOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => { setReturnOpen(false); setReturnMapped(null) }}
        >
          <div
            style={{
              background: T.white, borderRadius: 12, padding: '22px 24px', width: '100%', maxWidth: 640,
              maxHeight: '86vh', overflowY: 'auto', boxShadow: '0 16px 64px rgba(26,46,43,0.18)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <h3 style={{ fontFamily: UI, fontWeight: 600, fontSize: 16.5, color: T.textPrimary, margin: 0 }}>
                Bring back edits
              </h3>
              <button onClick={() => { setReturnOpen(false); setReturnMapped(null) }} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textTertiary }}>
                <XIcon size={16} />
              </button>
            </div>

            {!returnMapped ? (
              <>
                <p style={{ fontFamily: BODY, fontSize: 13, color: T.textSecondary, margin: '0 0 14px', lineHeight: 1.55 }}>
                  Paste the working document you edited in Word or Google Docs, the whole thing is
                  fine. Each answer is matched back to its question and you choose what to apply
                  before anything changes.
                </p>
                <textarea
                  value={returnText}
                  onChange={e => setReturnText(e.target.value)}
                  rows={10}
                  placeholder="Paste the edited document here…"
                  style={{ ...inputStyle(), resize: 'vertical', lineHeight: 1.6, fontSize: 13.5, marginBottom: 12 }}
                />
                {returnError && <p style={{ fontFamily: BODY, fontSize: 13, color: T.coralText, margin: '0 0 10px' }}>{returnError}</p>}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={mapReturnedDoc} disabled={returnBusy} style={{
                    fontFamily: UI, fontWeight: 600, fontSize: 13.5, color: '#F1F7E4',
                    background: T.greenDeep, border: 'none', padding: '9px 18px', borderRadius: 8,
                    cursor: returnBusy ? 'wait' : 'pointer', opacity: returnBusy ? 0.7 : 1,
                  }}>
                    {returnBusy ? 'Matching answers…' : 'Continue'}
                  </button>
                  <button onClick={() => setReturnOpen(false)} style={ghostBtn()}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontFamily: UI, fontWeight: 600, fontSize: 14, color: T.textPrimary, margin: '0 0 10px' }}>
                  {returnMapped.filter(a => a.apply).length} of {returnMapped.length} answers selected to apply
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {returnMapped.map((a, i) => {
                    const q = app.questions.find(x => x.id === a.question_id)
                    if (!q) return null
                    const unchanged = q.user_answer.trim() === a.answer.trim()
                    return (
                      <div key={a.question_id} style={{
                        background: T.paleGreen, borderRadius: 8, padding: '11px 13px',
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                        opacity: a.apply ? 1 : 0.5,
                      }}>
                        <button
                          onClick={() => setReturnMapped(ms => ms!.map((m, j) => (j === i ? { ...m, apply: !m.apply } : m)))}
                          aria-label={a.apply ? 'Skip this answer' : 'Apply this answer'}
                          style={{
                            width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 2,
                            border: `1.5px solid ${T.greenMid}`,
                            background: a.apply ? T.greenMid : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                          }}
                        >
                          {a.apply && <Check size={13} color="#fff" />}
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                            <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 13, color: T.textPrimary }}>
                              {q.question_text.slice(0, 70)}{q.question_text.length > 70 ? '…' : ''}
                            </span>
                            {unchanged && (
                              <span style={{ fontFamily: UI, fontWeight: 500, fontSize: 10.5, color: T.textTertiary, background: T.cream, padding: '2px 8px', borderRadius: 999 }}>
                                No change
                              </span>
                            )}
                          </div>
                          <p style={{
                            fontFamily: BODY, fontSize: 12.5, color: T.textSecondary, margin: 0, lineHeight: 1.5,
                            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                          }}>
                            {a.answer}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {returnError && <p style={{ fontFamily: BODY, fontSize: 13, color: T.coralText, margin: '0 0 10px' }}>{returnError}</p>}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={applyReturnedAnswers} style={primaryBtn()}>
                    Apply {returnMapped.filter(a => a.apply).length} {returnMapped.filter(a => a.apply).length === 1 ? 'answer' : 'answers'}
                  </button>
                  <button onClick={() => setReturnMapped(null)} style={ghostBtn()}>Back</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Edit questions modal ── */}
      {editQsOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setEditQsOpen(false)}
        >
          <div
            style={{
              background: T.white, borderRadius: 12, padding: '22px 24px', width: '100%', maxWidth: 640,
              maxHeight: '86vh', overflowY: 'auto', boxShadow: '0 16px 64px rgba(26,46,43,0.18)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <h3 style={{ fontFamily: UI, fontWeight: 600, fontSize: 16.5, color: T.textPrimary, margin: 0 }}>
                Edit questions
              </h3>
              <button onClick={() => setEditQsOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textTertiary }}>
                <XIcon size={16} />
              </button>
            </div>
            <p style={{ fontFamily: BODY, fontSize: 13, color: T.textSecondary, margin: '0 0 14px', lineHeight: 1.55 }}>
              Fix the wording, word limits, add or remove questions. Answers stay with their
              questions; reworded questions keep their current guide until you rebuild.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
              {editDrafts.map((d, i) => (
                <div key={d.id} style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: '11px 13px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{
                    fontFamily: UI, fontWeight: 700, fontSize: 12, color: T.sage, background: T.paleGreen,
                    width: 24, height: 24, borderRadius: 999, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', flexShrink: 0, marginTop: 4,
                  }}>
                    {i + 1}
                  </span>
                  <textarea
                    value={d.question_text}
                    onChange={e => setEditDrafts(ds => ds.map((x, j) => (j === i ? { ...x, question_text: e.target.value } : x)))}
                    rows={Math.min(4, Math.max(1, Math.ceil(d.question_text.length / 80)))}
                    style={{
                      flex: 1, fontFamily: BODY, fontSize: 14, color: T.textPrimary, border: 'none',
                      padding: '4px 0', resize: 'vertical', lineHeight: 1.5, outline: 'none', background: 'transparent',
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <input
                      type="number"
                      value={d.word_limit ?? ''}
                      onChange={e => setEditDrafts(ds => ds.map((x, j) => (j === i ? { ...x, word_limit: e.target.value ? Number(e.target.value) : null } : x)))}
                      placeholder="none"
                      aria-label="Word limit"
                      style={{ ...inputStyle(), width: 72, padding: '6px 8px', fontSize: 13, textAlign: 'center' }}
                    />
                    <span style={{ fontFamily: UI, fontSize: 11.5, color: T.textTertiary }}>words</span>
                    <button
                      onClick={() => setEditDrafts(ds => ds.filter((_, j) => j !== i))}
                      aria-label="Remove question"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: T.textTertiary, padding: 4 }}
                    >
                      <XIcon size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setEditDrafts(ds => [...ds, { id: crypto.randomUUID(), question_text: '', word_limit: null }])}
              style={{ ...ghostBtn(), paddingLeft: 0, marginBottom: 14 }}
            >
              + Add a question
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={saveEditedQuestions} disabled={editSaving} style={primaryBtn(editSaving)}>
                {editSaving ? 'Saving…' : 'Save questions'}
              </button>
              <button onClick={() => setEditQsOpen(false)} style={ghostBtn()}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Import past application modal */}
      {importOpen && app && (
        <ImportApplicationModal
          orgId={app.org_id}
          onClose={() => setImportOpen(false)}
          onImported={count => {
            setBlockCount(prev => (prev ?? 0) + count)
            if (hasScaffolds) setImportedSinceBuild(true)
            showToast(`${count} ${count === 1 ? 'block' : 'blocks'} added to your material`)
          }}
        />
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

// Score ring: 0-10 visual, colour-coded, dimmed when the answer changed
// since it was checked.
function ScoreRing({ score, stale }: { score: number | null; stale: boolean }) {
  const r = 20
  const circ = 2 * Math.PI * r
  const frac = score === null ? 0 : Math.max(0, Math.min(1, score / 10))
  const colour = score === null ? 'rgba(0,0,0,0.1)'
    : score < 5 ? T.coral
    : score < 7 ? T.amber
    : score < 8.5 ? T.greenMid
    : T.lime
  return (
    <svg width={52} height={52} viewBox="0 0 52 52" style={{ opacity: stale ? 0.45 : 1, flexShrink: 0 }}>
      <circle cx={26} cy={26} r={r} fill="none" stroke={T.cream} strokeWidth={5} />
      <circle
        cx={26} cy={26} r={r} fill="none" stroke={colour} strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={`${circ * frac} ${circ}`}
        transform="rotate(-90 26 26)"
        style={{ transition: 'stroke-dasharray 500ms ease' }}
      />
      <text x={26} y={27} textAnchor="middle" dominantBaseline="middle"
        style={{ fontFamily: UI, fontWeight: 700, fontSize: score === null ? 15 : 13.5, fill: score === null ? T.textTertiary : T.textPrimary }}>
        {score === null ? '?' : score % 1 === 0 ? score : score.toFixed(1)}
      </text>
    </svg>
  )
}

function QuestionCard({ index, question: q, drafting, draftDisabled, reviewing, voicePrompts, replacedAnswer, onAnswerChange, onToggleGap, onBank, onDraft, onReview, onRestoreAnswer }: {
  index: number
  question: ApplicationQuestion
  drafting: boolean
  draftDisabled: boolean
  reviewing: boolean
  voicePrompts: string[]
  replacedAnswer: string | null
  onAnswerChange: (text: string) => void
  onToggleGap: (gapIdx: number) => void
  onBank: () => void
  onDraft: () => void
  onReview: () => void
  onRestoreAnswer: () => void
}) {
  const isMobile = useIsMobile()
  const [collapsed, setCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<'guide' | 'material'>('guide')
  const [expandedStep, setExpandedStep] = useState<number | null>(0)
  const [expandedTip, setExpandedTip] = useState<number | null>(null)
  const [expandedGap, setExpandedGap] = useState<number | null>(null)
  const words = wordCount(q.user_answer)
  const limit = q.word_limit
  const overLimit = limit !== null && words > limit
  const nearLimit = limit !== null && !overLimit && words > limit * 0.9
  const countColor = overLimit ? T.coral : nearLimit ? T.amberText : T.textTertiary
  const openGaps = q.gaps.filter(g => !g.dismissed)
  const hasScaffold = !!q.scaffold && q.scaffold.length > 0
  const placeholders = placeholderCount(q.user_answer)
  const sortedScaffold = hasScaffold
    ? q.scaffold!.slice().sort((a, b) => a.suggested_order - b.suggested_order)
    : []
  const review = q.review ?? null
  const reviewStale = !!review && answerHash(q.user_answer) !== review.answer_hash
  const showRail = hasScaffold || q.gaps.length > 0 || !!review

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
              In your material
            </span>
          )}
          {limit !== null && collapsed && (
            <span style={{ fontFamily: UI, fontWeight: 500, fontSize: 11.5, color: countColor }}>
              {words}/{limit}
            </span>
          )}
          <ChevronDown size={15} color={T.textTertiary}
            style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 160ms ease' }} />
        </span>
      </button>

      {!collapsed && (
        <div style={{ borderTop: `1px solid ${T.border}` }}>
          {/* Answer first: the editor is the hero; tips to improve sit beside it */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: showRail && !isMobile ? 'minmax(0, 2fr) minmax(230px, 1fr)' : '1fr',
            gap: 0,
            alignItems: 'start',
          }}>
          <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: UI, fontWeight: 700, fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.textSecondary }}>
                Your answer
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {placeholders > 0 && (
                  <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 11, color: T.amberText, background: T.amberBg, padding: '2px 9px', borderRadius: 999 }}>
                    {placeholders} {placeholders === 1 ? 'placeholder' : 'placeholders'} to fill
                  </span>
                )}
                <span style={{ fontFamily: UI, fontWeight: 500, fontSize: 11.5, color: countColor }}>
                  {limit !== null
                    ? overLimit
                      ? `${words - limit} ${words - limit === 1 ? 'word' : 'words'} over the ${limit} limit`
                      : `${words} of ${limit} words`
                    : `${words} ${words === 1 ? 'word' : 'words'}`}
                </span>
              </span>
            </div>
            <textarea
              value={q.user_answer}
              onChange={e => onAnswerChange(e.target.value)}
              rows={answerRows(q.user_answer, hasScaffold ? (q.user_answer.trim() ? 10 : 6) : 5)}
              readOnly={drafting}
              placeholder={hasScaffold ? 'Write in your own voice, or draft a starting version below.' : 'Build the guides first, or just start writing.'}
              style={{
                fontFamily: BODY, fontSize: 14, color: T.textPrimary, width: '100%',
                padding: '10px 12px', borderRadius: 8, border: `1px solid ${drafting ? T.lime : T.border}`,
                background: T.editorBg, outline: 'none', resize: 'vertical', lineHeight: 1.65,
              }}
            />
            {hasScaffold && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                <button
                  onClick={onDraft}
                  disabled={draftDisabled}
                  title="Assembles a starting draft from your own content blocks, with placeholders where your material runs out"
                  style={{
                    ...ghostBtn(), display: 'inline-flex', alignItems: 'center', gap: 6,
                    paddingLeft: 0, color: draftDisabled && !drafting ? T.textTertiary : T.greenMid,
                    cursor: draftDisabled ? 'wait' : 'pointer',
                  }}
                >
                  <PenLine size={14} /> {drafting ? 'Assembling from your content…' : 'Draft a starting version'}
                </button>
                {replacedAnswer && !drafting && (
                  <button
                    onClick={onRestoreAnswer}
                    title="Bring back the answer that was here before the draft"
                    style={{
                      ...ghostBtn(), display: 'inline-flex', alignItems: 'center', gap: 6,
                      color: T.textSecondary,
                    }}
                  >
                    Restore previous answer
                  </button>
                )}
                {q.user_answer.trim() && !q.answer_banked && !drafting && (
                  <button
                    onClick={onBank}
                    style={{
                      ...ghostBtn(), display: 'inline-flex', alignItems: 'center', gap: 6,
                      color: T.sage,
                    }}
                  >
                    <BookmarkPlus size={14} /> Save to your material
                  </button>
                )}
              </div>
            )}
            {!hasScaffold && q.user_answer.trim() && !q.answer_banked && (
              <button
                onClick={onBank}
                style={{
                  ...ghostBtn(), display: 'inline-flex', alignItems: 'center', gap: 6,
                  paddingLeft: 0, marginTop: 6, color: T.sage,
                }}
              >
                <BookmarkPlus size={14} /> Save to your material
              </button>
            )}
            {voicePrompts.length > 0 && (
              <div style={{ background: T.paleGreen, borderRadius: 8, padding: '10px 13px', marginTop: 8 }}>
                <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.sage, marginBottom: 5 }}>
                  Make it yours
                </div>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {voicePrompts.map((p, i) => (
                    <li key={i} style={{ fontFamily: BODY, fontSize: 12.5, color: T.textSecondary, lineHeight: 1.55 }}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Tips to improve rail: score + tips + gaps in one place. Scroll
              backstop keeps the rail from ever stretching past the editor. */}
          {showRail && (
            <div style={{
              padding: '16px 18px',
              borderLeft: isMobile ? 'none' : `1px solid ${T.border}`,
              borderTop: isMobile ? `1px solid ${T.border}` : 'none',
              background: T.softGreen,
              maxHeight: isMobile ? undefined : 560,
              overflowY: isMobile ? undefined : 'auto',
            }}>
              <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.greenMid, marginBottom: 10 }}>
                Tips to improve
              </div>

              {/* Score + check action */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <ScoreRing score={review ? review.score : null} stale={reviewStale} />
                <div style={{ minWidth: 0 }}>
                  {review && !reviewStale && (
                    <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 12, color: T.textSecondary, display: 'block' }}>
                      out of 10
                    </span>
                  )}
                  {reviewStale && (
                    <span style={{ fontFamily: BODY, fontSize: 11.5, color: T.textTertiary, display: 'block', lineHeight: 1.4 }}>
                      Answer changed since this check
                    </span>
                  )}
                  <button
                    onClick={onReview}
                    disabled={reviewing || !q.user_answer.trim()}
                    style={{
                      fontFamily: UI, fontWeight: 600, fontSize: 12, marginTop: 3,
                      color: !q.user_answer.trim() ? T.textTertiary : T.sage,
                      background: 'transparent', border: 'none', padding: 0,
                      cursor: reviewing || !q.user_answer.trim() ? 'default' : 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    {reviewing ? 'Checking…' : review ? 'Check again' : 'Check this answer'}
                  </button>
                </div>
              </div>

              {/* Strengths: one line each */}
              {review && review.strengths.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {review.strengths.map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 4 }}>
                      <CheckCircle2 size={13} color={T.greenMid} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span style={{
                        fontFamily: BODY, fontSize: 12, color: T.sage, lineHeight: 1.45,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {s}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Tips: headline rows, detail expands on tap (one at a time) */}
              {review && review.tips.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: q.gaps.length > 0 ? 14 : 0 }}>
                  {review.tips.map((tip, i) => {
                    const structured = typeof tip !== 'string'
                    // Legacy string tips (pre-structured reviews): first few
                    // words become the headline rather than a blank "Tip N".
                    const headline = structured
                      ? tip.headline
                      : `${tip.split(/\s+/).slice(0, 8).join(' ')}${tip.split(/\s+/).length > 8 ? '…' : ''}`
                    const detail = structured ? tip.detail : tip
                    const open = expandedTip === i
                    return (
                      <div key={i}>
                        <button
                          onClick={() => setExpandedTip(open ? null : i)}
                          aria-expanded={open}
                          style={{
                            width: '100%', display: 'flex', gap: 7, alignItems: 'flex-start', textAlign: 'left',
                            background: 'transparent', border: 'none', cursor: 'pointer', padding: '3px 0',
                          }}
                        >
                          <span style={{
                            fontFamily: UI, fontWeight: 700, fontSize: 9.5, color: T.amberText,
                            background: T.amberBg, width: 16, height: 16, borderRadius: 999,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
                          }}>
                            {i + 1}
                          </span>
                          <span style={{ flex: 1, fontFamily: UI, fontWeight: 600, fontSize: 12, color: T.textPrimary, lineHeight: 1.45 }}>
                            {headline}
                          </span>
                          <ChevronDown size={12} color={T.textTertiary}
                            style={{ flexShrink: 0, marginTop: 3, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 140ms ease' }} />
                        </button>
                        {open && (
                          <p style={{ fontFamily: BODY, fontSize: 12, color: T.textSecondary, margin: '1px 0 6px 23px', lineHeight: 1.5 }}>
                            {detail}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              {!review && (
                <p style={{ fontFamily: BODY, fontSize: 11.5, color: T.textTertiary, margin: '0 0 12px', lineHeight: 1.5 }}>
                  Scores your answer against this funder&apos;s priorities and tells you exactly
                  what to change.
                </p>
              )}

              {/* Open gaps, tickable */}
              {q.gaps.length > 0 && (
                <>
                  <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: openGaps.some(g => g.severity === 'blocking') ? T.coral : T.amberText, marginBottom: 3 }}>
                    Gaps
                  </div>
                  <p style={{ fontFamily: BODY, fontSize: 10.5, color: T.textTertiary, margin: '0 0 7px', lineHeight: 1.4 }}>
                    Spotted when the guides were built. Tick off anything your answer now covers.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {q.gaps.map((g, i) => {
                      const open = expandedGap === i
                      const info = gapIsInformational(g.gap_type)
                      const sevColor = info ? T.textTertiary : g.severity === 'blocking' ? T.coral : T.amberText
                      return (
                        <div key={i} style={{ opacity: g.dismissed ? 0.45 : 1 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                            <button
                              onClick={() => onToggleGap(i)}
                              aria-label={g.dismissed ? 'Restore gap' : 'Tick off gap'}
                              title={g.dismissed ? 'Restore' : 'Tick off'}
                              style={{
                                width: 14, height: 14, borderRadius: 5, flexShrink: 0, marginTop: 3,
                                border: `1.5px solid ${sevColor}`,
                                background: g.dismissed ? sevColor : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', padding: 0,
                              }}
                            >
                              {g.dismissed && <Check size={10} color="#fff" />}
                            </button>
                            <button
                              onClick={() => setExpandedGap(open ? null : i)}
                              aria-expanded={open}
                              style={{
                                flex: 1, display: 'flex', alignItems: 'flex-start', gap: 6, textAlign: 'left',
                                background: 'transparent', border: 'none', cursor: 'pointer', padding: '1px 0',
                              }}
                            >
                              <span style={{
                                flex: 1, fontFamily: UI, fontWeight: 600, fontSize: 11.5, lineHeight: 1.45,
                                color: info ? T.textTertiary : g.severity === 'blocking' ? T.coralText : T.textSecondary,
                                textDecoration: g.dismissed ? 'line-through' : 'none',
                              }}>
                                {!info && (
                                  <span style={{
                                    fontFamily: UI, fontWeight: 700, fontSize: 9.5, letterSpacing: '0.04em',
                                    textTransform: 'uppercase', marginRight: 6, padding: '1px 6px', borderRadius: 999,
                                    color: g.severity === 'blocking' ? T.coralText : T.amberText,
                                    background: g.severity === 'blocking' ? T.coralBg : T.amberBg,
                                  }}>
                                    {g.severity === 'blocking' ? 'Fix' : 'Strengthen'}
                                  </span>
                                )}
                                {gapLabel(g.gap_type)}
                              </span>
                              <ChevronDown size={11} color={T.textTertiary}
                                style={{ flexShrink: 0, marginTop: 3, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 140ms ease' }} />
                            </button>
                          </div>
                          {open && (
                            <p style={{ fontFamily: BODY, fontSize: 11.5, color: T.textSecondary, margin: '1px 0 5px 21px', lineHeight: 1.5 }}>
                              {g.description}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
          </div>

          {/* Guidance below the writing: Guide / Your material / Gaps tabs */}
          {hasScaffold && (
            <div style={{ borderTop: `1px solid ${T.border}`, background: T.softGreen }}>
              <div style={{ display: 'flex', gap: 2, padding: '10px 20px 0' }}>
                {([
                  { key: 'guide' as const,    label: 'Guide',         count: null },
                  { key: 'material' as const, label: 'Your material', count: q.mapped_content.length || null },
                ]).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    style={{
                      fontFamily: UI, fontWeight: 600, fontSize: 12.5,
                      color: activeTab === tab.key ? T.greenDeep : T.textTertiary,
                      background: activeTab === tab.key ? T.white : 'transparent',
                      border: activeTab === tab.key ? `1px solid ${T.border}` : '1px solid transparent',
                      borderBottom: activeTab === tab.key ? `1px solid ${T.white}` : '1px solid transparent',
                      borderRadius: '8px 8px 0 0', padding: '7px 14px', cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: -1,
                    }}
                  >
                    {tab.label}
                    {tab.count !== null && (
                      <span style={{
                        fontFamily: UI, fontWeight: 700, fontSize: 10,
                        color: T.greenText, background: T.greenBg,
                        padding: '1px 7px', borderRadius: 999,
                      }}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div style={{ background: T.white, borderTop: `1px solid ${T.border}`, padding: '14px 20px 16px' }}>

                {activeTab === 'guide' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {sortedScaffold.map((s, i) => (
                      <div key={i}>
                        <button
                          onClick={() => setExpandedStep(expandedStep === i ? null : i)}
                          aria-expanded={expandedStep === i}
                          style={{
                            width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 9,
                            background: 'transparent', border: 'none', cursor: 'pointer', padding: '5px 0',
                          }}
                        >
                          <span style={{
                            fontFamily: UI, fontWeight: 700, fontSize: 11, color: T.sage,
                            background: T.paleGreen, width: 20, height: 20, borderRadius: 999,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            {i + 1}
                          </span>
                          <span style={{ flex: 1, fontFamily: UI, fontWeight: 600, fontSize: 13, color: T.textPrimary }}>
                            {s.heading}
                          </span>
                          <ChevronDown size={13} color={T.textTertiary}
                            style={{ transform: expandedStep === i ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 140ms ease' }} />
                        </button>
                        {expandedStep === i && (
                          <p style={{ fontFamily: BODY, fontSize: 12.5, color: T.textSecondary, margin: '2px 0 6px 29px', lineHeight: 1.55 }}>
                            {s.guidance}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'material' && (
                  q.mapped_content.length > 0 ? (
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
                  ) : (
                    <p style={{ fontFamily: BODY, fontSize: 12.5, color: T.textTertiary, margin: 0 }}>
                      Nothing from your material maps to this question yet. Import a past application
                      or add blocks to your reusable content, then rebuild the scaffolds.
                    </p>
                  )
                )}

              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

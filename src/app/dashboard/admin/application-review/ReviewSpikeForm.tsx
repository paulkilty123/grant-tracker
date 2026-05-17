'use client'

import { useState, useEffect } from 'react'
import {
  type FundingType, type ReviewQuestion, type ReviewRequest, type ReviewResult,
  type OrgContext, type DraftRequest, type DraftResult, type PipelineGrantOption,
  type ExtractedApplication, type DraftSnapshot, type SavedDraft,
  FUNDING_TYPE_LABELS,
} from './types'
import ReviewResults from './ReviewResults'

const EMPTY_QUESTION: ReviewQuestion = { question: '', wordLimit: null, draftAnswer: '' }

const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-mid mb-1.5'
const inputCls = 'w-full rounded-lg border border-warm bg-white px-3 py-2 text-sm text-charcoal focus:outline-none focus:border-[#8ECB3C]'

export default function ReviewSpikeForm(
  { org, pipelineGrants }: { org: OrgContext | null; pipelineGrants: PipelineGrantOption[] },
) {
  const [grantName, setGrantName]     = useState('')
  const [funder, setFunder]           = useState('')
  const [fundingType, setFundingType] = useState<FundingType>('grant')
  const [criteria, setCriteria]       = useState('')
  const [questions, setQuestions]     = useState<ReviewQuestion[]>([{ ...EMPTY_QUESTION }])

  // Pipeline grant picker.
  const [pickedId, setPickedId] = useState('')
  const [grantUrl, setGrantUrl] = useState<string | null>(null)

  // Application-guidelines URL extractor.
  const [guidelinesUrl, setGuidelinesUrl] = useState('')
  const [fetchingUrl, setFetchingUrl]     = useState(false)
  const [fetchNote, setFetchNote]         = useState<string | null>(null)

  function applyExtracted(ex: ExtractedApplication) {
    setFetchNote(ex.note)
    if (ex.questions.length > 0) {
      setQuestions(ex.questions.map(q => ({
        question: q.question, wordLimit: q.wordLimit, draftAnswer: '',
      })))
    }
    if (ex.assessmentCriteria) setCriteria(ex.assessmentCriteria)
  }

  async function fetchGuidelines() {
    if (!guidelinesUrl.trim()) return
    setFetchingUrl(true)
    setFetchNote(null)
    try {
      const res = await fetch('/api/admin/extract-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: guidelinesUrl.trim() }),
      })
      const json = await res.json()
      if (!res.ok) setFetchNote(json.error ?? `Request failed (${res.status})`)
      else applyExtracted(json as ExtractedApplication)
    } catch (err) {
      setFetchNote(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setFetchingUrl(false)
    }
  }

  async function uploadApplicationPdf(file: File) {
    setFetchingUrl(true)
    setFetchNote(null)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload  = () => resolve(String(reader.result).split(',')[1] ?? '')
        reader.onerror = () => reject(new Error('Could not read the file'))
        reader.readAsDataURL(file)
      })
      const res = await fetch('/api/admin/extract-application-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64: base64, fileName: file.name }),
      })
      const json = await res.json()
      if (!res.ok) setFetchNote(json.error ?? `Upload failed (${res.status})`)
      else applyExtracted(json as ExtractedApplication)
    } catch (err) {
      setFetchNote(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setFetchingUrl(false)
    }
  }

  function pickGrant(id: string) {
    setPickedId(id)
    const item = pipelineGrants.find(p => p.id === id)
    if (item) {
      setGrantName(item.grantName)
      setFunder(item.funderName)
      setGrantUrl(item.grantUrl)
    } else {
      setGrantUrl(null)
    }
  }

  // ── Saved drafts ────────────────────────────────────────────────────────────
  async function loadDraftsList() {
    try {
      const res = await fetch('/api/admin/application-drafts')
      if (res.ok) setSavedDrafts(((await res.json()).drafts ?? []) as SavedDraft[])
    } catch { /* non-fatal */ }
  }

  useEffect(() => { loadDraftsList() }, [])

  async function saveDraft() {
    setSavingDraft(true)
    setDraftSaved(false)
    const snapshot: DraftSnapshot = {
      grantName, funder, fundingType, criteria, guidelinesUrl, grantUrl, pickedId,
      questions, personalise, strengthSummary, result,
    }
    try {
      const res = await fetch('/api/admin/application-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draftId, title: grantName.trim() || 'Untitled draft', state: snapshot }),
      })
      const json = await res.json()
      if (res.ok && json.id) {
        setDraftId(json.id)
        setDraftSaved(true)
        setTimeout(() => setDraftSaved(false), 2500)
        loadDraftsList()
      }
    } finally {
      setSavingDraft(false)
    }
  }

  function openDraft(id: string) {
    const d = savedDrafts.find(x => x.id === id)
    if (!d) return
    const s = d.state
    setGrantName(s.grantName ?? '')
    setFunder(s.funder ?? '')
    setFundingType(s.fundingType ?? 'grant')
    setCriteria(s.criteria ?? '')
    setGuidelinesUrl(s.guidelinesUrl ?? '')
    setGrantUrl(s.grantUrl ?? null)
    setPickedId(s.pickedId ?? '')
    setQuestions(s.questions?.length ? s.questions : [{ ...EMPTY_QUESTION }])
    setPersonalise(s.personalise ?? {})
    setStrengthSummary(s.strengthSummary ?? null)
    setResult(s.result ?? null)
    setDraftId(id)
  }

  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [result, setResult]         = useState<ReviewResult | null>(null)

  // Saved drafts.
  const [draftId, setDraftId]         = useState<string | null>(null)
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>([])
  const [savingDraft, setSavingDraft] = useState(false)
  const [draftSaved, setDraftSaved]   = useState(false)

  // Org enrichment ("About your organisation") — evidence-bank-lite.
  const [evidenceNotes, setEvidenceNotes] = useState(org?.evidenceNotes ?? '')
  const [savingNotes, setSavingNotes]     = useState(false)
  const [notesSaved, setNotesSaved]       = useState(false)

  // Draft generation.
  const [generating, setGenerating]           = useState(false)
  const [draftError, setDraftError]           = useState<string | null>(null)
  const [strengthSummary, setStrengthSummary] = useState<string[] | null>(null)
  const [personalise, setPersonalise]         = useState<Record<number, string>>({})

  async function saveEvidenceNotes() {
    if (!org) return
    setSavingNotes(true)
    setNotesSaved(false)
    try {
      const res = await fetch('/api/admin/save-evidence-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: org.id, evidenceNotes }),
      })
      if (res.ok) {
        setNotesSaved(true)
        setTimeout(() => setNotesSaved(false), 2500)
      }
    } finally {
      setSavingNotes(false)
    }
  }

  async function generateDraft() {
    if (!org) return
    const entries = questions
      .map((q, i) => ({ q, i }))
      .filter(x => x.q.question.trim())
    // No questions is allowed when a grant is picked — the engine then drafts a
    // proposal against standard sections from the catalogue data.
    const proposalMode = entries.length === 0
    if (proposalMode && !grantUrl) return
    setGenerating(true)
    setDraftError(null)
    setStrengthSummary(null)
    setResult(null)
    const payload: DraftRequest = {
      grantName: grantName.trim(),
      funder: funder.trim(),
      fundingType,
      assessmentCriteria: criteria.trim(),
      orgId: org.id,
      evidenceNotes,
      grantUrl,
      questions: entries.map(x => ({ question: x.q.question.trim(), wordLimit: x.q.wordLimit })),
    }
    try {
      const res = await fetch('/api/admin/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        setDraftError(json.error ?? `Request failed (${res.status})`)
        return
      }
      const draft = json as DraftResult
      const notes: Record<number, string> = {}
      if (proposalMode) {
        // The engine substituted standard proposal sections — rebuild the list.
        const rebuilt = draft.answers.map(a => ({
          question: a.question, wordLimit: null as number | null, draftAnswer: a.draftAnswer,
        }))
        draft.answers.forEach((a, i) => { notes[i] = a.toPersonalise })
        if (rebuilt.length > 0) setQuestions(rebuilt)
      } else {
        const newQuestions = questions.map((q, i) => {
          const slot = entries.findIndex(e => e.i === i)
          return slot >= 0 && draft.answers[slot]
            ? { ...q, draftAnswer: draft.answers[slot].draftAnswer }
            : q
        })
        entries.forEach((e, slot) => {
          if (draft.answers[slot]) notes[e.i] = draft.answers[slot].toPersonalise
        })
        setQuestions(newQuestions)
      }
      setPersonalise(notes)
      setStrengthSummary(draft.strengthSummary)
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setGenerating(false)
    }
  }

  function updateQuestion(idx: number, patch: Partial<ReviewQuestion>) {
    setQuestions(qs => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)))
  }
  function addQuestion()  { setQuestions(qs => [...qs, { ...EMPTY_QUESTION }]) }
  function removeQuestion(idx: number) {
    setQuestions(qs => (qs.length === 1 ? qs : qs.filter((_, i) => i !== idx)))
  }

  const readyQuestions = questions.filter(q => q.question.trim() && q.draftAnswer.trim())
  const canSubmit = readyQuestions.length > 0 && !submitting
  const canGenerate = !!org && (questions.some(q => q.question.trim()) || !!grantUrl) && !generating

  async function submit() {
    setSubmitting(true)
    setError(null)
    setResult(null)
    const payload: ReviewRequest = {
      grantName: grantName.trim(),
      funder: funder.trim(),
      fundingType,
      assessmentCriteria: criteria.trim(),
      grantUrl,
      questions: readyQuestions.map(q => ({
        question: q.question.trim(),
        wordLimit: q.wordLimit,
        draftAnswer: q.draftAnswer.trim(),
      })),
    }
    try {
      const res = await fetch('/api/admin/review-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? `Request failed (${res.status})`)
      } else {
        setResult(json as ReviewResult)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-charcoal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
        Application review
      </h1>
      <p className="text-sm text-mid mt-1 mb-5">
        Spike — admin only. Paste an application&apos;s questions, generate a draft from your org
        profile, then review it. Part of the application-builder Phase 0 test.
      </p>

      {/* Saved drafts */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select
          className={inputCls + ' max-w-xs'}
          value={draftId ?? ''}
          onChange={e => { if (e.target.value) openDraft(e.target.value) }}
        >
          <option value="">Open a saved draft…</option>
          {savedDrafts.map(d => (
            <option key={d.id} value={d.id}>{d.title}</option>
          ))}
        </select>
        <button
          onClick={saveDraft}
          disabled={savingDraft}
          className="rounded-lg border border-charcoal/30 bg-white px-4 py-2 text-sm font-medium text-charcoal disabled:opacity-40"
        >
          {savingDraft ? 'Saving…' : draftId ? 'Save draft' : 'Save as new draft'}
        </button>
        {draftSaved && <span className="text-xs text-sage">Saved</span>}
      </div>

      {/* Your organisation */}
      <div className="rounded-xl border border-warm bg-cream/40 p-4 mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-mid mb-2">Your organisation</p>
        {org ? (
          <>
            <p className="text-sm font-medium text-charcoal">{org.name || '(unnamed)'}</p>
            <p className="text-xs text-mid mt-0.5">
              {[
                org.primaryLocation,
                org.legalStructure?.replace(/_/g, ' '),
                org.impactSectors.map(s => s.replace(/_/g, ' ')).join(', '),
              ].filter(Boolean).join(' · ')}
            </p>
            {org.mission && <p className="text-xs text-mid mt-1 leading-relaxed">{org.mission}</p>}
            <label className={labelCls + ' mt-3'}>About your organisation</label>
            <p className="text-xs text-light mb-1.5">
              The structured profile above is thin for drafting. Add programmes, outcomes,
              track record, partnerships — anything a strong application would draw on. Saved
              to your profile and reused across reviews.
            </p>
            <textarea
              className={inputCls + ' min-h-[120px]'}
              value={evidenceNotes}
              onChange={e => setEvidenceNotes(e.target.value)}
              placeholder="e.g. We run a weekly dads-and-kids club reaching 60 families a year in Lewisham. In 2025, 84% of attendees reported improved confidence. We partner with two local primary schools…"
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={saveEvidenceNotes}
                disabled={savingNotes}
                className="rounded-lg border border-charcoal/30 bg-white px-3 py-1.5 text-xs font-medium text-charcoal disabled:opacity-40"
              >
                {savingNotes ? 'Saving…' : 'Save org notes'}
              </button>
              {notesSaved && <span className="text-xs text-sage">Saved</span>}
            </div>
          </>
        ) : (
          <p className="text-sm text-mid">
            No organisation profile found for your account. Draft generation needs an org —
            complete onboarding first, or use review-only below.
          </p>
        )}
      </div>

      {/* Pipeline grant picker */}
      {pipelineGrants.length > 0 && (
        <div className="mb-4">
          <label className={labelCls}>Choose a grant from your pipeline</label>
          <select className={inputCls} value={pickedId} onChange={e => pickGrant(e.target.value)}>
            <option value="">— enter manually —</option>
            {pipelineGrants.map(p => (
              <option key={p.id} value={p.id}>
                {p.grantName}{p.funderName ? ` — ${p.funderName}` : ''}
              </option>
            ))}
          </select>
          <p className="text-xs text-light mt-1">
            Picking a grant fills the name and funder below, and lets the draft draw on its
            catalogue data. You can still edit the fields by hand.
          </p>
        </div>
      )}

      {/* Context */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div>
          <label className={labelCls}>Grant name</label>
          <input className={inputCls} value={grantName} onChange={e => setGrantName(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label className={labelCls}>Funder</label>
          <input className={inputCls} value={funder} onChange={e => setFunder(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label className={labelCls}>Funding type</label>
          <select className={inputCls} value={fundingType} onChange={e => setFundingType(e.target.value as FundingType)}>
            {(Object.keys(FUNDING_TYPE_LABELS) as FundingType[]).map(ft => (
              <option key={ft} value={ft}>{FUNDING_TYPE_LABELS[ft]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Application questions — fetch from URL, upload a PDF, or add manually */}
      <div className="mb-5">
        <label className={labelCls}>Application questions</label>
        <p className="text-xs text-light mb-2">
          Fetch from a URL, upload the application form as a PDF, or add them manually below.
        </p>
        <div className="flex gap-2">
          <input
            className={inputCls}
            value={guidelinesUrl}
            onChange={e => setGuidelinesUrl(e.target.value)}
            placeholder="https://… the page with the application questions"
          />
          <button
            onClick={fetchGuidelines}
            disabled={fetchingUrl || !guidelinesUrl.trim()}
            className="rounded-lg border border-charcoal/30 bg-white px-4 py-2 text-sm font-medium text-charcoal whitespace-nowrap disabled:opacity-40"
          >
            {fetchingUrl ? 'Working…' : 'Fetch'}
          </button>
        </div>
        <label className="mt-2 inline-flex items-center gap-2 cursor-pointer">
          <span className="rounded-lg border border-charcoal/30 bg-white px-3 py-1.5 text-sm font-medium text-charcoal">
            Upload file
          </span>
          <span className="text-xs text-light">Upload the application form as a PDF or Word .docx</span>
          <input
            type="file"
            accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            disabled={fetchingUrl}
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadApplicationPdf(f); e.target.value = '' }}
          />
        </label>
        {fetchNote && <p className="text-xs text-mid mt-2">{fetchNote}</p>}
      </div>

      {/* Assessment criteria */}
      <div className="mb-6">
        <label className={labelCls}>Assessment criteria</label>
        <textarea
          className={inputCls + ' min-h-[80px]'}
          value={criteria}
          onChange={e => setCriteria(e.target.value)}
          placeholder="Paste the funder's published assessment criteria if available. Leave blank to use funder-type heuristics (the score is then labelled 'estimated')."
        />
      </div>

      {/* What makes this a strong application — shown after draft generation */}
      {strengthSummary && strengthSummary.length > 0 && (
        <div className="rounded-xl border border-warm bg-green-pale-1 p-5 mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-sage mb-2">
            What makes this a strong application
          </p>
          <ul className="list-disc list-inside space-y-1">
            {strengthSummary.map((angle, i) => (
              <li key={i} className="text-sm text-charcoal leading-relaxed">{angle}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Questions */}
      <div className="space-y-4">
        {questions.map((q, idx) => (
          <div key={idx} className="rounded-xl border border-warm bg-cream/40 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-mid">Question {idx + 1}</span>
              {questions.length > 1 && (
                <button onClick={() => removeQuestion(idx)} className="text-xs text-coral hover:underline">Remove</button>
              )}
            </div>
            <textarea
              className={inputCls + ' min-h-[56px] mb-2'}
              value={q.question}
              onChange={e => updateQuestion(idx, { question: e.target.value })}
              placeholder="The funder's question, exactly as written"
            />
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs text-mid">Word limit</label>
              <input
                type="number"
                className={inputCls + ' w-28'}
                value={q.wordLimit ?? ''}
                onChange={e => updateQuestion(idx, { wordLimit: e.target.value ? Number(e.target.value) : null })}
                placeholder="None"
              />
            </div>
            <textarea
              className={inputCls + ' min-h-[120px]'}
              value={q.draftAnswer}
              onChange={e => updateQuestion(idx, { draftAnswer: e.target.value })}
              placeholder="Your draft answer — or generate one below, then edit it here"
            />
            {personalise[idx] && (
              <p className="mt-2 rounded-lg bg-amber-pale px-3 py-2 text-xs text-[#854F0B] leading-relaxed">
                <span className="font-semibold">To personalise: </span>{personalise[idx]}
              </p>
            )}
          </div>
        ))}
      </div>

      <button onClick={addQuestion} className="mt-3 text-sm text-sage font-medium hover:underline">
        + Add question
      </button>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={generateDraft}
          disabled={!canGenerate}
          className="rounded-lg border border-[#173404] bg-white px-5 py-2.5 text-sm font-semibold text-[#173404] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ fontFamily: 'var(--font-space-grotesk)' }}
        >
          {generating ? 'Generating…' : 'Generate draft answers'}
        </button>
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-lg bg-[#8ECB3C] px-5 py-2.5 text-sm font-semibold text-[#173404] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ fontFamily: 'var(--font-space-grotesk)' }}
        >
          {submitting ? 'Reviewing…' : 'Review draft'}
        </button>
        {!org && (
          <span className="text-xs text-light">Draft generation needs an org profile.</span>
        )}
      </div>
      <p className="mt-2 text-xs text-light">
        Generate a first draft from your org profile, edit each answer, then review it.
        With no questions added, picking a pipeline grant generates a proposal-style draft
        from the grant&apos;s catalogue data alone.
      </p>

      {draftError && (
        <div className="mt-5 rounded-lg border border-[#F0997B] bg-[#FAECE7] px-4 py-3 text-sm text-[#993C1D]">
          {draftError}
        </div>
      )}
      {error && (
        <div className="mt-5 rounded-lg border border-[#F0997B] bg-[#FAECE7] px-4 py-3 text-sm text-[#993C1D]">
          {error}
        </div>
      )}

      {result && <ReviewResults result={result} questions={questions} />}
    </div>
  )
}

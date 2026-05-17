'use client'

import { useState } from 'react'
import {
  type FundingType, type ReviewQuestion, type ReviewRequest, type ReviewResult,
  type OrgContext,
  FUNDING_TYPE_LABELS,
} from './types'
import ReviewResults from './ReviewResults'

const EMPTY_QUESTION: ReviewQuestion = { question: '', wordLimit: null, draftAnswer: '' }

const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-mid mb-1.5'
const inputCls = 'w-full rounded-lg border border-warm bg-white px-3 py-2 text-sm text-charcoal focus:outline-none focus:border-[#8ECB3C]'

export default function ReviewSpikeForm({ org }: { org: OrgContext | null }) {
  const [grantName, setGrantName]     = useState('')
  const [funder, setFunder]           = useState('')
  const [fundingType, setFundingType] = useState<FundingType>('grant')
  const [criteria, setCriteria]       = useState('')
  const [questions, setQuestions]     = useState<ReviewQuestion[]>([{ ...EMPTY_QUESTION }])

  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [result, setResult]         = useState<ReviewResult | null>(null)

  // Org enrichment ("About your organisation") — evidence-bank-lite.
  const [evidenceNotes, setEvidenceNotes] = useState(org?.evidenceNotes ?? '')
  const [savingNotes, setSavingNotes]     = useState(false)
  const [notesSaved, setNotesSaved]       = useState(false)

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

  function updateQuestion(idx: number, patch: Partial<ReviewQuestion>) {
    setQuestions(qs => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)))
  }
  function addQuestion()  { setQuestions(qs => [...qs, { ...EMPTY_QUESTION }]) }
  function removeQuestion(idx: number) {
    setQuestions(qs => (qs.length === 1 ? qs : qs.filter((_, i) => i !== idx)))
  }

  const readyQuestions = questions.filter(q => q.question.trim() && q.draftAnswer.trim())
  const canSubmit = readyQuestions.length > 0 && !submitting

  async function submit() {
    setSubmitting(true)
    setError(null)
    setResult(null)
    const payload: ReviewRequest = {
      grantName: grantName.trim(),
      funder: funder.trim(),
      fundingType,
      assessmentCriteria: criteria.trim(),
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
      <p className="text-sm text-mid mt-1 mb-6">
        Spike — admin only. Paste an application&apos;s questions, generate a draft from your org
        profile, then review it. Part of the application-builder Phase 0 test.
      </p>

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
              placeholder="Your draft answer to this question"
            />
          </div>
        ))}
      </div>

      <button onClick={addQuestion} className="mt-3 text-sm text-sage font-medium hover:underline">
        + Add question
      </button>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-lg bg-[#8ECB3C] px-5 py-2.5 text-sm font-semibold text-[#173404] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ fontFamily: 'var(--font-space-grotesk)' }}
        >
          {submitting ? 'Reviewing…' : 'Review draft'}
        </button>
        {readyQuestions.length === 0 && (
          <span className="text-xs text-light">Add at least one question with a draft answer.</span>
        )}
      </div>

      {error && (
        <div className="mt-5 rounded-lg border border-[#F0997B] bg-[#FAECE7] px-4 py-3 text-sm text-[#993C1D]">
          {error}
        </div>
      )}

      {result && <ReviewResults result={result} />}
    </div>
  )
}

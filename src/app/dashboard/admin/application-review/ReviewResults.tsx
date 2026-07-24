'use client'

import type { ReviewResult, ReviewQuestion } from './types'

// Application-review spike (Phase 0, tasks 3 + 15) — renders the review as a
// single readable document: per question, the question, the draft answer, and
// the recommendations underneath. Exports the same content as an editable .doc.

export default function ReviewResults(
  { result, questions }: { result: ReviewResult; questions: ReviewQuestion[] },
) {
  const { overallScore, scoreEstimated, strengthSummary } = result
  const ready = questions.filter(q => q.question.trim() && q.draftAnswer.trim())

  const answerFor = (questionText: string, i: number): string => {
    const byText = ready.find(r => r.question.trim() === questionText.trim())
    return (byText ?? ready[i])?.draftAnswer ?? ''
  }

  function exportDoc() {
    const esc  = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const para = (s: string) => esc(s).split(/\n+/).filter(Boolean).map(p => `<p>${p}</p>`).join('') || '<p></p>'

    const sections = result.questions.map((qf, i) => `
      <h2 style="color:#173404;">${esc(qf.question || `Question ${i + 1}`)}</h2>
      ${para(answerFor(qf.question, i))}
      <div style="background:#f3f1ea;padding:10px 16px;margin:6px 0 22px;">
        <p><strong>What's working:</strong> ${esc(qf.whatsWorking)}</p>
        <p><strong>What to strengthen:</strong> ${esc(qf.whatToStrengthen)}</p>
        ${qf.criteriaNotes ? `<p><strong>Against the criteria:</strong> ${esc(qf.criteriaNotes)}</p>` : ''}
        ${qf.wordCountNote ? `<p><em>${esc(qf.wordCountNote)}</em></p>` : ''}
      </div>`).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Application draft</title></head>
<body style="font-family:Calibri,Arial,sans-serif;color:#2C2C2A;">
<h1>Application draft</h1>
<h3>Priority improvements</h3>
<ul>${strengthSummary.priorityImprovements.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
${strengthSummary.strongestSections ? `<p><strong>Strongest so far:</strong> ${esc(strengthSummary.strongestSections)}</p>` : ''}
<hr/>
${sections}
</body></html>`

    const blob = new Blob([html], { type: 'application/msword' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = 'application-draft.doc'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mt-6">

      {/* Header — score + export */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-sage-deep" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          Review
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-mid">
            {scoreEstimated ? 'Estimated coverage' : 'Coverage'}: <span className="font-semibold text-charcoal">{overallScore}%</span>
          </span>
          <button
            onClick={exportDoc}
            className="rounded-lg border border-charcoal/30 bg-white px-3 py-1.5 text-xs font-medium text-charcoal"
          >
            Export as .doc
          </button>
        </div>
      </div>

      {/* Strength summary */}
      <div className="rounded-xl border border-warm bg-green-pale-1 p-5 mb-4">
        {strengthSummary.priorityImprovements.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-mid mb-1.5">Priority improvements</p>
            <ol className="list-decimal list-inside space-y-1">
              {strengthSummary.priorityImprovements.map((imp, i) => (
                <li key={i} className="text-sm text-charcoal leading-relaxed">{imp}</li>
              ))}
            </ol>
          </div>
        )}
        {strengthSummary.strongestSections && (
          <p className="text-sm text-mid leading-relaxed">
            <span className="font-semibold text-charcoal">Strongest so far: </span>
            {strengthSummary.strongestSections}
          </p>
        )}
        {scoreEstimated && (
          <p className="mt-3 text-xs text-light">
            No published assessment criteria were supplied, so the score is an estimate against
            funder-type norms. It reflects coverage of the funder&apos;s requirements, not the
            likelihood of success.
          </p>
        )}
      </div>

      {/* The document — question, draft answer, recommendations underneath */}
      <div className="rounded-xl border border-warm bg-white p-6">
        {result.questions.map((q, i) => (
          <div key={i} className={i > 0 ? 'mt-7 pt-7 border-t border-warm' : ''}>
            <p className="text-xs font-semibold uppercase tracking-wide text-mid mb-1">Question {i + 1}</p>
            <p className="text-sm font-semibold text-charcoal mb-2 leading-relaxed">{q.question}</p>

            <p className="text-sm text-charcoal leading-relaxed whitespace-pre-wrap mb-3">
              {answerFor(q.question, i) || <span className="text-light italic">No draft answer.</span>}
            </p>

            <div className="rounded-lg bg-surface-page/60 px-4 py-3 space-y-2">
              {q.whatsWorking && (
                <p className="text-xs text-charcoal leading-relaxed">
                  <span className="font-semibold text-sage-deep uppercase tracking-wide">What&apos;s working — </span>
                  {q.whatsWorking}
                </p>
              )}
              {q.whatToStrengthen && (
                <p className="text-xs text-charcoal leading-relaxed">
                  <span className="font-semibold text-[#854F0B] uppercase tracking-wide">What to strengthen — </span>
                  {q.whatToStrengthen}
                </p>
              )}
              {q.criteriaNotes && (
                <p className="text-xs text-mid leading-relaxed">
                  <span className="font-semibold uppercase tracking-wide">Against the criteria — </span>
                  {q.criteriaNotes}
                </p>
              )}
              {q.wordCountNote && <p className="text-xs text-light">{q.wordCountNote}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

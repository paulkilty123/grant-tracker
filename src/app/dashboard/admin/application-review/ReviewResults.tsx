'use client'

import type { ReviewResult } from './types'

// Application-review spike (Phase 0, task 3) — renders the engine's ReviewResult.
// UX intent (per spec): the score is supportive context, not the headline. The
// priority improvements are the headline. Tone is a colleague's notes, not a
// grading report.

export default function ReviewResults({ result }: { result: ReviewResult }) {
  const { overallScore, scoreEstimated, strengthSummary, questions } = result

  return (
    <div className="mt-6 space-y-4">

      {/* Strength summary — priority improvements lead, score is a small chip */}
      <div className="rounded-xl border border-warm bg-green-pale-1 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-sage" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Review
          </h2>
          <span className="text-xs text-mid">
            {scoreEstimated ? 'Estimated coverage' : 'Coverage'}: <span className="font-semibold text-charcoal">{overallScore}%</span>
          </span>
        </div>

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
            funder-type norms. It reflects how well the draft covers what the funder asks for, not
            the likelihood of success.
          </p>
        )}
      </div>

      {/* Per-question feedback */}
      {questions.map((q, i) => (
        <div key={i} className="rounded-xl border border-warm bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-mid mb-1">Question {i + 1}</p>
          <p className="text-sm font-medium text-charcoal mb-3 leading-relaxed">{q.question}</p>

          {q.whatsWorking && (
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-sage mb-1">What&apos;s working</p>
              <p className="text-sm text-charcoal leading-relaxed">{q.whatsWorking}</p>
            </div>
          )}

          {q.whatToStrengthen && (
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#854F0B] mb-1">What to strengthen</p>
              <p className="text-sm text-charcoal leading-relaxed">{q.whatToStrengthen}</p>
            </div>
          )}

          {q.criteriaNotes && (
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-mid mb-1">Against the criteria</p>
              <p className="text-sm text-mid leading-relaxed">{q.criteriaNotes}</p>
            </div>
          )}

          {q.wordCountNote && (
            <p className="text-xs text-light mt-2">{q.wordCountNote}</p>
          )}
        </div>
      ))}
    </div>
  )
}

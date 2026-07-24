'use client'

import { useState } from 'react'

interface FillResult {
  dry_run: boolean
  filled: number
  skipped: number
  updates?: Array<{ title: string; funder: string; amount_min?: number; amount_max?: number }>
}

export default function FillAmountsPanel() {
  const [dryRun, setDryRun]     = useState(true)
  const [running, setRunning]   = useState(false)
  const [result, setResult]     = useState<FillResult | null>(null)
  const [error, setError]       = useState<string | null>(null)

  async function run() {
    setRunning(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/fill-amounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: dryRun }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setResult(data as FillResult)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setRunning(false)
    }
  }

  const fmt = (n: number) => `£${n.toLocaleString()}`

  return (
    <div className="mt-6 bg-white rounded-xl shadow-card p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-display text-lg font-bold text-forest">Fill Missing Amounts</h3>
          <p className="text-xs text-mid mt-0.5">
            Parses grant amounts from funder intelligence text for grants missing min/max values. No AI calls.
          </p>
        </div>
      </div>

      {/* Dry run toggle */}
      <div className="flex items-center gap-2 mb-5">
        <button
          onClick={() => setDryRun(v => !v)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${dryRun ? 'bg-gold' : 'bg-sage-deep'}`}
        >
          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${dryRun ? 'translate-x-1' : 'translate-x-4.5'}`} />
        </button>
        <span className="text-sm text-charcoal">
          {dryRun ? 'Dry run (preview only)' : 'Live run (writes to DB)'}
        </span>
      </div>

      <button
        onClick={run}
        disabled={running}
        className="bg-forest text-surface-page text-sm font-semibold rounded-lg px-5 py-2 hover:bg-sage-deep transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {running ? 'Running…' : dryRun ? 'Preview' : 'Fill amounts'}
      </button>

      {error && (
        <div className="mt-4 bg-coral-pale border border-coral-mid rounded-lg px-4 py-3 text-sm text-coral-deep">
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div className="mt-5 space-y-3">
          <div className={`rounded-lg px-4 py-3 text-sm font-medium ${result.dry_run ? 'bg-gold/10 text-amber-800 border border-gold/30' : 'bg-green-50 text-green-800 border border-green-200'}`}>
            {result.dry_run
              ? `✓ Preview — ${result.filled} grants would be updated, ${result.skipped} skipped`
              : `✓ Done — ${result.filled} grants updated, ${result.skipped} skipped`}
          </div>

          {result.updates && result.updates.length > 0 && (
            <div className="border border-warm rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-warm/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-mid">Grant</th>
                    <th className="px-3 py-2 text-left font-semibold text-mid">Funder</th>
                    <th className="px-3 py-2 text-right font-semibold text-mid">Min</th>
                    <th className="px-3 py-2 text-right font-semibold text-mid">Max</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm/60">
                  {result.updates.map((u, i) => (
                    <tr key={i} className="hover:bg-warm/20">
                      <td className="px-3 py-2 text-charcoal font-medium truncate max-w-[180px]">{u.title}</td>
                      <td className="px-3 py-2 text-mid truncate max-w-[140px]">{u.funder}</td>
                      <td className="px-3 py-2 text-right text-forest">{u.amount_min ? fmt(u.amount_min) : '—'}</td>
                      <td className="px-3 py-2 text-right text-forest">{u.amount_max ? fmt(u.amount_max) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

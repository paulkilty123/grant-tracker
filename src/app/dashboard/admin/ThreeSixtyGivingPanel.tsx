'use client'

import { useState } from 'react'

interface IngestResult {
  dry_run: boolean
  mode: string
  datasets_fetched: number
  grants_analysed: number
  funders_enriched: number
  new_entries_created: number
  skipped: number
  errors: string[]
}

export default function ThreeSixtyGivingPanel() {
  const [mode, setMode]       = useState<'enrich' | 'discover' | 'both'>('both')
  const [dryRun, setDryRun]   = useState(true)
  const [running, setRunning] = useState(false)
  const [result, setResult]   = useState<IngestResult | null>(null)
  const [error, setError]     = useState<string | null>(null)

  async function run() {
    setRunning(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/ingest-360giving', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, dry_run: dryRun, max_datasets: 50 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setResult(data as IngestResult)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="mt-6 bg-white rounded-xl shadow-card p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-display text-lg font-bold text-forest">360Giving Ingest</h3>
          <p className="text-xs text-mid mt-0.5">
            Pulls open awards data from 200+ UK funders to enrich funder intelligence and surface new catalogue entries.
          </p>
        </div>
        <span className="text-[10px] font-semibold bg-sage-deep/10 text-sage-deep rounded-full px-2.5 py-1 uppercase tracking-wider">
          24 priority funders
        </span>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 mb-5">

        {/* Mode */}
        <div>
          <p className="text-[11px] font-semibold text-mid uppercase tracking-wider mb-1.5">Mode</p>
          <div className="flex rounded-lg overflow-hidden border border-warm text-sm">
            {(['enrich', 'discover', 'both'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 font-medium transition-colors capitalize
                  ${mode === m
                    ? 'bg-forest text-surface-page'
                    : 'bg-white text-mid hover:bg-warm/50'
                  }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Dry run toggle */}
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => setDryRun(v => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors
              ${dryRun ? 'bg-gold-deep' : 'bg-sage-deep'}`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform
              ${dryRun ? 'translate-x-1' : 'translate-x-4.5'}`} />
          </button>
          <span className="text-sm text-charcoal">
            {dryRun ? 'Dry run (preview only)' : 'Live run (writes to DB)'}
          </span>
        </div>
      </div>

      {/* Mode descriptions */}
      <div className="text-xs text-mid bg-warm/40 rounded-lg px-4 py-3 mb-5 space-y-1">
        {mode === 'enrich' && <p><strong>Enrich:</strong> Updates funder_brief on existing grants with real award history (typical size, years active, locations).</p>}
        {mode === 'discover' && <p><strong>Discover:</strong> Creates new inactive entries in Needs Review for funders not yet in the catalogue.</p>}
        {mode === 'both' && <p><strong>Both:</strong> Enriches existing grants with award history, and surfaces new funders into Needs Review.</p>}
        {dryRun && <p className="text-gold-deep font-medium">⚠ Dry run — no changes will be written. Toggle off to run for real.</p>}
      </div>

      {/* Run button */}
      <button
        onClick={run}
        disabled={running}
        className="bg-forest text-surface-page text-sm font-semibold rounded-lg px-5 py-2 hover:bg-sage-deep transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {running ? 'Running…' : dryRun ? 'Preview run' : 'Run ingest'}
      </button>

      {/* Error */}
      {error && (
        <div className="mt-4 bg-coral-pale border border-coral-mid rounded-lg px-4 py-3 text-sm text-coral-deep">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="mt-5 space-y-3">
          <div className={`rounded-lg px-4 py-3 text-sm font-medium ${result.dry_run ? 'bg-gold-deep/10 text-amber-800 border border-gold-deep/30' : 'bg-green-50 text-green-800 border border-green-200'}`}>
            {result.dry_run ? '✓ Dry run complete — no changes written' : '✓ Ingest complete'}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Datasets processed', value: result.datasets_fetched },
              { label: 'Grants analysed',    value: result.grants_analysed.toLocaleString() },
              { label: 'Funders enriched',   value: result.funders_enriched },
              { label: 'New entries',        value: result.new_entries_created },
            ].map(stat => (
              <div key={stat.label} className="bg-warm/40 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-forest">{stat.value}</p>
                <p className="text-[11px] text-mid mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>

          {result.errors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <p className="text-xs font-semibold text-amber-800 mb-2">Errors ({result.errors.length})</p>
              <ul className="space-y-1">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-xs text-amber-700 font-mono">{e}</li>
                ))}
              </ul>
            </div>
          )}

          {result.new_entries_created > 0 && !result.dry_run && (
            <p className="text-xs text-mid">
              {result.new_entries_created} new entries added to Needs Review — check the{' '}
              <a href="/dashboard/admin/urls" className="text-forest underline">Grant Manager</a> to review and activate them.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

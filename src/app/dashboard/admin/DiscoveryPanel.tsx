'use client'

import { useState, useEffect } from 'react'
import { DEFAULT_QUERIES } from '@/lib/discovery-queries'

interface QueueStats {
  total: number
  pending: number
  processed: number
  duplicate: number
  rejected: number
}

interface QueryResult {
  query: string
  fundingType: string
  found: number
  queued: number
  skipped: string[]
  error?: string
}

interface ProcessResult {
  ok: boolean
  processed: number
  imported: number
  duplicates: number
  failed: number
  results: { id: string; title: string; status: string; reason?: string }[]
}

type FundingType = 'corporate' | 'social_investment' | 'programme'

const FUNDING_TYPES: { key: FundingType; label: string; description: string }[] = [
  { key: 'corporate',         label: 'Corporate Funding',    description: 'CSR programmes, corporate foundations, company community funds' },
  { key: 'social_investment', label: 'Social Investment',    description: 'Patient capital, blended finance, CDFI loans, impact investment' },
  { key: 'programme',         label: 'Programmes & Support', description: 'Accelerators, incubators, fellowships, capacity building' },
]

// Delay between sequential Gemini calls (ms) — respects free-tier rate limits
const INTER_QUERY_DELAY = 12_000

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export default function DiscoveryPanel() {
  const [selectedTypes, setSelectedTypes] = useState<Set<FundingType>>(new Set<FundingType>(['corporate', 'social_investment', 'programme']))
  const [discovering, setDiscovering] = useState(false)
  const [processing, setProcessing]   = useState(false)
  const [queryResults, setQueryResults] = useState<QueryResult[]>([])
  const [processResult, setProcessResult] = useState<ProcessResult | null>(null)
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number; label: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [processLimit, setProcessLimit] = useState(10)

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    try {
      const res = await fetch('/api/admin/process-discovery-queue')
      if (res.ok) setQueueStats(await res.json() as QueueStats)
    } catch { /* non-critical */ }
  }

  function toggleType(t: FundingType) {
    setSelectedTypes(prev => {
      const next = new Set(prev)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })
  }

  async function runDiscovery() {
    if (selectedTypes.size === 0) return
    setDiscovering(true)
    setQueryResults([])
    setProcessResult(null)
    setError(null)

    // Build the full list of (query, type) pairs to run
    const queue: { query: string; fundingType: FundingType }[] = []
    for (const ft of Array.from(selectedTypes)) {
      for (const q of DEFAULT_QUERIES[ft]) {
        queue.push({ query: q, fundingType: ft })
      }
    }

    setProgress({ current: 0, total: queue.length, label: 'Starting…' })

    for (let i = 0; i < queue.length; i++) {
      const { query, fundingType } = queue[i]
      setProgress({ current: i + 1, total: queue.length, label: query })

      try {
        const res = await fetch('/api/admin/discover-grants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, fundingType }),
        })

        let data: { ok?: boolean; queued?: number; found?: number; skipped?: string[]; error?: string }
        try {
          data = await res.json()
        } catch {
          data = { error: `Server returned non-JSON (status ${res.status})` }
        }

        setQueryResults(prev => [...prev, {
          query, fundingType,
          found:   data.found   ?? 0,
          queued:  data.queued  ?? 0,
          skipped: data.skipped ?? [],
          error:   data.error,
        }])
      } catch (e) {
        setQueryResults(prev => [...prev, {
          query, fundingType, found: 0, queued: 0, skipped: [],
          error: e instanceof Error ? e.message : 'Network error',
        }])
      }

      // Rate-limit delay between queries (skip after last one)
      if (i < queue.length - 1) await sleep(INTER_QUERY_DELAY)
    }

    setProgress(null)
    setDiscovering(false)
    await loadStats()
  }

  async function runProcess() {
    setProcessing(true)
    setProcessResult(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/process-discovery-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: processLimit }),
      })
      let data: ProcessResult
      try {
        data = await res.json() as ProcessResult
      } catch {
        throw new Error(`Server returned non-JSON (status ${res.status})`)
      }
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
      setProcessResult(data)
      await loadStats()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setProcessing(false)
    }
  }

  const totalQueued = queryResults.reduce((n, r) => n + r.queued, 0)
  const totalFound  = queryResults.reduce((n, r) => n + r.found,  0)
  const queriesWithErrors = queryResults.filter(r => r.error)
  const queriesPerType = Array.from(selectedTypes).reduce((n, t) => n + DEFAULT_QUERIES[t].length, 0)
  const estimatedMins = Math.ceil((queriesPerType * INTER_QUERY_DELAY / 1000 + queriesPerType * 20) / 60)

  return (
    <div className="mt-6 bg-white rounded-xl shadow-card p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-display text-lg font-bold text-forest">Automated Discovery Pipeline</h3>
          <p className="text-xs text-mid mt-0.5">
            Finds corporate programmes, social investment, and support schemes via Gemini web search. Runs one query at a time to avoid timeouts.
          </p>
        </div>
        {queueStats && (
          <div className="flex gap-2 flex-shrink-0">
            <span className="text-[10px] font-semibold bg-gold/15 text-amber-700 rounded-full px-2.5 py-1 uppercase tracking-wider">
              {queueStats.pending} pending
            </span>
            {queueStats.total > 0 && (
              <span className="text-[10px] font-semibold bg-sage/10 text-sage rounded-full px-2.5 py-1 uppercase tracking-wider">
                {queueStats.total} total
              </span>
            )}
          </div>
        )}
      </div>

      {/* Queue stats */}
      {queueStats && queueStats.total > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-5">
          {[
            { label: 'Pending',    value: queueStats.pending,   colour: 'text-amber-700 bg-gold/10'  },
            { label: 'Processed',  value: queueStats.processed, colour: 'text-green-700 bg-green-50' },
            { label: 'Duplicates', value: queueStats.duplicate, colour: 'text-mid bg-warm/40'         },
            { label: 'Rejected',   value: queueStats.rejected,  colour: 'text-red-600 bg-red-50'     },
          ].map(s => (
            <div key={s.label} className={`rounded-lg p-3 text-center ${s.colour}`}>
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-[11px] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Step 1 */}
      <div className="border border-warm rounded-xl p-4 mb-4">
        <p className="text-sm font-semibold text-charcoal mb-3">Step 1 — Discover new opportunities</p>

        <div className="flex flex-wrap gap-2 mb-4">
          {FUNDING_TYPES.map(({ key, label, description }) => (
            <button key={key} onClick={() => toggleType(key)}
              className={`text-left border rounded-lg px-3 py-2 transition-colors text-sm ${
                selectedTypes.has(key)
                  ? 'bg-forest text-cream border-forest'
                  : 'bg-white text-charcoal border-warm hover:border-sage hover:text-forest'
              }`}>
              <span className="font-semibold block">{label}</span>
              <span className="text-[11px] opacity-70">{description}</span>
            </button>
          ))}
        </div>

        <div className="text-xs text-mid bg-warm/40 rounded-lg px-4 py-3 mb-4">
          Runs <strong>{queriesPerType} searches</strong> (5 per category), one at a time.
          {' '}<span className="text-amber-700 font-medium">Estimated: ~{estimatedMins} minutes. Keep this tab open.</span>
        </div>

        {/* Progress bar */}
        {progress && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-mid mb-1.5">
              <span>Query {progress.current} of {progress.total}</span>
              <span>{Math.round((progress.current / progress.total) * 100)}%</span>
            </div>
            <div className="h-2 bg-warm rounded-full overflow-hidden">
              <div
                className="h-full bg-forest rounded-full transition-all duration-500"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
            <p className="text-[11px] text-mid mt-1.5 truncate" title={progress.label}>{progress.label}</p>
          </div>
        )}

        <button onClick={runDiscovery} disabled={discovering || selectedTypes.size === 0}
          className="bg-forest text-cream text-sm font-semibold rounded-lg px-5 py-2 hover:bg-sage transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          {discovering ? 'Discovering…' : 'Run discovery'}
        </button>
      </div>

      {/* Step 2 */}
      <div className="border border-warm rounded-xl p-4 mb-4">
        <p className="text-sm font-semibold text-charcoal mb-3">Step 2 — Enrich &amp; import to Needs Review</p>
        <div className="flex items-center gap-3 mb-4">
          <label className="text-xs text-mid">Process</label>
          <select value={processLimit} onChange={e => setProcessLimit(Number(e.target.value))}
            className="border border-warm rounded-lg text-sm px-3 py-1.5 text-charcoal bg-white">
            {[5, 10, 20, 50].map(n => <option key={n} value={n}>{n} items</option>)}
          </select>
          <span className="text-xs text-mid">from queue</span>
        </div>
        <div className="text-xs text-mid bg-warm/40 rounded-lg px-4 py-3 mb-4">
          Classifies each queued item (impact sectors, funder type, amounts) and imports into <strong>Needs Review</strong>. Deduplicates automatically.
        </div>
        <button onClick={runProcess} disabled={processing || (queueStats?.pending ?? 0) === 0}
          className="bg-sage text-cream text-sm font-semibold rounded-lg px-5 py-2 hover:bg-forest transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          {processing ? 'Processing…' : `Process ${Math.min(processLimit, queueStats?.pending ?? 0)} pending`}
        </button>
      </div>

      {/* Global error */}
      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Per-query errors */}
      {queriesWithErrors.length > 0 && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-sm font-semibold text-red-700 mb-2">{queriesWithErrors.length} queries failed</p>
          {queriesWithErrors.map((r, i) => (
            <p key={i} className="text-xs text-red-600 mt-0.5">{r.query}: {r.error}</p>
          ))}
        </div>
      )}

      {/* Discovery results summary */}
      {queryResults.length > 0 && !discovering && (
        <div className="mt-4 space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm font-medium text-green-800">
            ✓ Discovery complete — {totalFound} found · <strong>{totalQueued} new opportunities queued</strong>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {queryResults.map((r, i) => (
              <div key={i} className={`rounded-lg px-4 py-3 ${r.error ? 'bg-red-50 border border-red-100' : 'bg-warm/30'}`}>
                <div className="flex justify-between items-start">
                  <p className="text-xs text-charcoal font-medium truncate max-w-[65%]" title={r.query}>{r.query}</p>
                  <span className="text-xs text-mid ml-2 flex-shrink-0">
                    {r.error
                      ? <span className="text-red-600">error</span>
                      : <>found {r.found} · queued <strong className="text-forest">{r.queued}</strong></>
                    }
                  </span>
                </div>
                {r.skipped.length > 0 && (
                  <p className="text-[11px] text-mid mt-0.5">{r.skipped.length} skipped (duplicates / no URL)</p>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-mid">
            Click <strong>Process pending</strong> above to enrich and import into{' '}
            <a href="/dashboard/admin/urls" className="text-forest underline">Needs Review</a>.
          </p>
        </div>
      )}

      {/* Process results */}
      {processResult && (
        <div className="mt-4 space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
            <span className="font-medium">✓ Processing complete</span>
            {' — '}
            {processResult.imported} imported · {processResult.duplicates} duplicates · {processResult.failed} failed
          </div>
          {processResult.results.length > 0 && (
            <div className="max-h-48 overflow-y-auto border border-warm rounded-lg divide-y divide-warm">
              {processResult.results.map((r, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs text-charcoal truncate max-w-[70%]">{r.title}</span>
                  <span className={`text-[11px] font-semibold ml-2 flex-shrink-0 ${
                    r.status === 'imported' ? 'text-green-600' : r.status === 'duplicate' ? 'text-mid' : 'text-red-500'
                  }`}>
                    {r.status === 'imported' ? '✓ imported' : r.status === 'duplicate' ? '≈ duplicate' : '✗ failed'}
                  </span>
                </div>
              ))}
            </div>
          )}
          {processResult.imported > 0 && (
            <p className="text-xs text-mid">
              {processResult.imported} entries added to{' '}
              <a href="/dashboard/admin/urls" className="text-forest underline">Needs Review</a> — review and activate from there.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

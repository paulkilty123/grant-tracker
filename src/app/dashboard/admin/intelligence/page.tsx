'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Sparkles, ExternalLink, RefreshCw, CheckCircle, Clock, AlertTriangle, Zap, PlusCircle, X, BookOpen, Link, Search, Pencil, Check, Brain } from 'lucide-react'
import NextLink from 'next/link'

type GrantRow = {
  id: string
  title: string
  funder: string | null
  funder_type: string | null
  funding_type: string | null
  apply_url: string | null
  funder_brief: Record<string, string | null> | null
  last_seen_at: string | null
  url_quality_score: number | null
  url_quality_issues: string[] | null
  amount_min: number | null
  amount_max: number | null
  deadline: string | null
  is_rolling: boolean | null
  location_tag: string | null
  impact_sectors: string[] | null
  eligible_structures: string[] | null
}

type EnrichStatus = 'idle' | 'loading' | 'done' | 'error'
type Source = { label: string; url: string; text: string }

export default function FunderIntelligencePage() {
  const searchParams = useSearchParams()
  const highlightId = searchParams.get('highlight')
  const highlightRef = useRef<HTMLDivElement | null>(null)

  const [grants, setGrants] = useState<GrantRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'enriched' | 'unenriched'>(highlightId ? 'all' : 'unenriched')
  const [enrichStatus, setEnrichStatus] = useState<Record<string, EnrichStatus>>({})
  const [enrichMsg, setEnrichMsg] = useState<Record<string, string>>({})
  const [brief, setBrief] = useState<Record<string, Record<string, string | null>>>({})
  const [bulkRunning, setBulkRunning] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
  const [reclassifyOpen, setReclassifyOpen] = useState(false)
  const [reclassifyText, setReclassifyText] = useState('')
  const [reclassifyRunning, setReclassifyRunning] = useState(false)
  const [reclassifyProgress, setReclassifyProgress] = useState<{ batch: number; total: number; classified: number; failed: number } | null>(null)
  const [reclassifyLog, setReclassifyLog] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [editingUrl, setEditingUrl] = useState<Record<string, string | null>>({}) // grantId → draft URL or null
  const [savingUrl, setSavingUrl] = useState<Record<string, boolean>>({})
  const [editingTitle, setEditingTitle] = useState<Record<string, string | null>>({}) // grantId → draft title or null
  const [savingTitle, setSavingTitle] = useState<Record<string, boolean>>({})
  // Multi-source state
  const [sourcesOpen, setSourcesOpen] = useState<Record<string, boolean>>({})
  const [sources, setSources] = useState<Record<string, Source[]>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await createClient()
      .from('scraped_grants')
      .select('id, title, funder, funder_type, funding_type, apply_url, funder_brief, last_seen_at, url_quality_score, url_quality_issues, amount_min, amount_max, deadline, is_rolling, location_tag, impact_sectors, eligible_structures')
      .or('is_active.eq.true,url_status.eq.reviewing')
      .not('apply_url', 'is', null)
      .order('last_seen_at', { ascending: false })
    setGrants((data as GrantRow[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const addSource = (grantId: string) => {
    setSources(s => ({ ...s, [grantId]: [...(s[grantId] ?? []), { label: '', url: '', text: '' }] }))
  }

  const updateSource = (grantId: string, idx: number, field: keyof Source, value: string) => {
    setSources(s => {
      const updated = [...(s[grantId] ?? [])]
      updated[idx] = { ...updated[idx], [field]: value }
      return { ...s, [grantId]: updated }
    })
  }

  const removeSource = (grantId: string, idx: number) => {
    setSources(s => {
      const updated = [...(s[grantId] ?? [])]
      updated.splice(idx, 1)
      return { ...s, [grantId]: updated }
    })
  }

  const saveUrl = async (grantId: string) => {
    const newUrl = (editingUrl[grantId] ?? '').trim()
    setSavingUrl(s => ({ ...s, [grantId]: true }))
    const { error } = await createClient()
      .from('scraped_grants')
      .update({ apply_url: newUrl || null })
      .eq('id', grantId)
    setSavingUrl(s => ({ ...s, [grantId]: false }))
    if (!error) {
      setGrants(gs => gs.map(g => g.id === grantId ? { ...g, apply_url: newUrl || null } : g))
      setEditingUrl(e => ({ ...e, [grantId]: null }))
    }
  }

  const saveTitle = async (grantId: string) => {
    const newTitle = (editingTitle[grantId] ?? '').trim()
    if (!newTitle) return
    setSavingTitle(s => ({ ...s, [grantId]: true }))
    const { error } = await createClient()
      .from('scraped_grants')
      .update({ title: newTitle })
      .eq('id', grantId)
    setSavingTitle(s => ({ ...s, [grantId]: false }))
    if (!error) {
      setGrants(gs => gs.map(g => g.id === grantId ? { ...g, title: newTitle } : g))
      setEditingTitle(e => ({ ...e, [grantId]: null }))
    }
  }

  const enrichSingle = async (grant: GrantRow): Promise<boolean> => {
    setEnrichStatus(s => ({ ...s, [grant.id]: 'loading' }))
    setEnrichMsg(s => ({ ...s, [grant.id]: '' }))
    const grantSources = sources[grant.id] ?? []
    const controller = new AbortController()
    const clientTimeout = setTimeout(() => controller.abort(), 50000) // 50s client-side safety net
    try {
      const res = await fetch('/api/admin/enrich-grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grantId: grant.id,
          additionalSources: grantSources.filter(s => s.text.trim().length > 50 || s.url.trim().length > 5),
        }),
        signal: controller.signal,
      })
      clearTimeout(clientTimeout)
      const json = await res.json()
      if (!res.ok) {
        setEnrichStatus(s => ({ ...s, [grant.id]: 'error' }))
        setEnrichMsg(s => ({ ...s, [grant.id]: json.error ?? 'Failed' }))
        return false
      } else {
        setEnrichStatus(s => ({ ...s, [grant.id]: 'done' }))
        setBrief(b => ({ ...b, [grant.id]: json.brief }))
        setGrants(gs => gs.map(g => g.id === grant.id ? { ...g, funder_brief: json.brief } : g))
        setSourcesOpen(o => ({ ...o, [grant.id]: false }))
        return true
      }
    } catch (err) {
      clearTimeout(clientTimeout)
      const isTimeout = err instanceof Error && err.name === 'AbortError'
      setEnrichStatus(s => ({ ...s, [grant.id]: 'error' }))
      setEnrichMsg(s => ({ ...s, [grant.id]: isTimeout ? 'Request timed out — try pasting the page text via Sources' : 'Network error' }))
      return false
    }
  }

  const enrichAll = async () => {
    // Skip grants that already have AI-enriched text fields (what_they_fund or priorities).
    // Grants with only 360Giving award_history data (but no AI text) should still be enriched.
    // knowledge_fallback briefs are treated as un-enriched — they have content
    // populated from Claude's general knowledge (not from the funder's actual page),
    // so re-running enrichment can upgrade them to live_fetch if the URL is now reachable.
    const hasAiContent = (fb: Record<string, unknown> | null) =>
      fb && fb.source !== 'knowledge_fallback' &&
      (fb.what_they_fund || fb.priorities || fb.focuses_on || fb.strong_application)
    const unenriched = grants.filter(g => !hasAiContent(g.funder_brief as Record<string, unknown> | null) && enrichStatus[g.id] !== 'done')
    if (unenriched.length === 0) return
    setBulkRunning(true)
    setBulkProgress({ done: 0, total: unenriched.length })
    let done = 0
    for (const grant of unenriched) {
      await enrichSingle(grant)
      done++
      setBulkProgress({ done, total: unenriched.length })
      await new Promise(r => setTimeout(r, 500))
    }
    setBulkRunning(false)
    setBulkProgress(null)
  }

  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
  const parsedIds = Array.from(new Set((reclassifyText.match(UUID_RE) ?? []).map(s => s.toLowerCase())))

  const runReclassify = async () => {
    if (parsedIds.length === 0 || reclassifyRunning) return
    setReclassifyRunning(true)
    setReclassifyLog([])
    const BATCH = 50
    const batches: string[][] = []
    for (let i = 0; i < parsedIds.length; i += BATCH) batches.push(parsedIds.slice(i, i + BATCH))
    let totalClassified = 0
    let totalFailed = 0
    for (let i = 0; i < batches.length; i++) {
      setReclassifyProgress({ batch: i + 1, total: batches.length, classified: totalClassified, failed: totalFailed })
      try {
        const res = await fetch('/api/admin/classify-grants', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ grant_ids: batches[i], limit: 15 }),
        })
        const json = await res.json()
        totalClassified += json.classified ?? 0
        totalFailed     += json.failed ?? 0
        setReclassifyLog(l => [...l, `batch ${i + 1}/${batches.length}: classified=${json.classified ?? 0} failed=${json.failed ?? 0} elapsed=${json.elapsed_ms ?? '?'}ms`])
      } catch (err) {
        setReclassifyLog(l => [...l, `batch ${i + 1}/${batches.length}: ERROR ${(err as Error).message}`])
      }
    }
    setReclassifyProgress({ batch: batches.length, total: batches.length, classified: totalClassified, failed: totalFailed })
    setReclassifyRunning(false)
  }

  // Scroll to highlighted grant when loaded from needs review approval
  useEffect(() => {
    if (highlightId && !loading && highlightRef.current) {
      setTimeout(() => highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)
    }
  }, [highlightId, loading])

  const [editState, setEditState] = useState<Record<string, Record<string, string | boolean | number | null>>>({})
  const [editSaving, setEditSaving] = useState<Record<string, boolean>>({})
  const [publishSaving, setPublishSaving] = useState<Record<string, boolean>>({})

  function getEditVal(grantId: string, field: string, fallback: string | boolean | number | null) {
    return editState[grantId]?.[field] !== undefined ? editState[grantId][field] : fallback
  }
  function setEditField(grantId: string, field: string, value: string | boolean | number | null) {
    setEditState(s => ({ ...s, [grantId]: { ...(s[grantId] ?? {}), [field]: value } }))
  }
  // Server-side update helper — routes through /api/admin/update-grant so writes
  // go through mergeGrantUpdate (field provenance + pipeline_state transition).
  // Direct supabase .update() calls were causing publish/edit actions to skip
  // the pipeline_state auto-transition, leaving rows stuck in 'tagged' state
  // (Needs Review count didn't decrement after publish — bug fixed 2026-05-26).
  async function patchGrant(id: string, fields: Record<string, unknown>): Promise<boolean> {
    const res = await fetch('/api/admin/update-grant', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, fields }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      console.error('patchGrant error:', json.error ?? `HTTP ${res.status}`)
      return false
    }
    return true
  }

  async function saveEdits(grant: GrantRow) {
    const edits = editState[grant.id] ?? {}
    if (Object.keys(edits).length === 0) return
    setEditSaving(s => ({ ...s, [grant.id]: true }))
    const fields: Record<string, unknown> = {}
    if (edits.funder_type    !== undefined) fields.funder_type    = edits.funder_type
    if (edits.funding_type   !== undefined) fields.funding_type   = edits.funding_type
    if (edits.amount_min     !== undefined) fields.amount_min     = edits.amount_min ? parseInt(String(edits.amount_min).replace(/[^0-9]/g,'')) : null
    if (edits.amount_max     !== undefined) fields.amount_max     = edits.amount_max ? parseInt(String(edits.amount_max).replace(/[^0-9]/g,'')) : null
    if (edits.deadline       !== undefined) fields.deadline       = edits.deadline || null
    if (edits.is_rolling     !== undefined) fields.is_rolling     = edits.is_rolling
    if (edits.location_tag   !== undefined) fields.location_tag   = edits.location_tag || null
    await patchGrant(grant.id, fields)
    setGrants(gs => gs.map(g => g.id === grant.id ? { ...g, ...fields } as GrantRow : g))
    setEditState(s => ({ ...s, [grant.id]: {} }))
    setEditSaving(s => ({ ...s, [grant.id]: false }))
  }
  async function publishGrant(grant: GrantRow) {
    await saveEdits(grant)
    setPublishSaving(s => ({ ...s, [grant.id]: true }))
    await patchGrant(grant.id, { is_active: true, url_status: 'ok' })
    setGrants(gs => gs.map(g => g.id === grant.id ? { ...g, is_active: true, url_status: 'ok' } as unknown as GrantRow : g))
    setPublishSaving(s => ({ ...s, [grant.id]: false }))
    // Dismiss highlight by clearing URL param
    window.history.replaceState({}, '', '/dashboard/admin/intelligence')
  }

  const searchLower = search.trim().toLowerCase()
  const filtered = grants.filter(g => {
    const matchesFilter =
      filter === 'all' ? true :
      filter === 'enriched' ? !!g.funder_brief :
      !g.funder_brief
    if (!matchesFilter) return false
    if (!searchLower) return true
    return (
      g.title.toLowerCase().includes(searchLower) ||
      (g.funder ?? '').toLowerCase().includes(searchLower)
    )
  })

  const enrichedCount = grants.filter(g => !!g.funder_brief).length

  const BRIEF_LABELS: Record<string, string> = {
    what_they_fund:     'What they fund',
    who_can_apply:      'Who can apply',
    geographic_focus:   'Geographic focus',
    priorities:         'Priorities',
    strong_application: 'Strong application',
    exclusions:         'Exclusions',
    typical_award:      'Typical award',
    decision_timeline:  'Decision timeline',
    how_to_apply:       'How to apply',
    funder_tips:        'Tips',
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header + Tabs */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-5 h-5" style={{ color: 'var(--teal)' }} />
              <h1 className="text-2xl font-bold text-text-body">Funder Intelligence</h1>
            </div>
            <p className="text-sm text-text-muted">
              Enrich grants with AI-generated summaries. Add extra source pages to fill in any gaps.
            </p>
          </div>
          <button
            onClick={enrichAll}
            disabled={bulkRunning || loading}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-bold text-white transition-opacity disabled:opacity-60"
            style={{ borderRadius: 9999, backgroundColor: 'var(--terra)' }}>
            <Zap className="w-4 h-4" />
            {bulkRunning && bulkProgress
              ? `Enriching ${bulkProgress.done}/${bulkProgress.total}…`
              : 'Enrich All'}
          </button>
        </div>
        <div className="flex gap-1 border-b border-border-warm">
          <NextLink href="/dashboard/admin/intelligence"
            className="px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors"
            style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
            Enrichment
          </NextLink>
          <NextLink href="/dashboard/admin/watchlist"
            className="px-4 py-2.5 text-sm font-semibold border-b-2 border-transparent text-text-muted hover:text-text-body transition-colors">
            Watchlist
          </NextLink>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-border-warm p-4" style={{ borderRadius: 12 }}>
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Total with URL</p>
          <p className="text-2xl font-bold text-text-body">{grants.length}</p>
        </div>
        <div className="bg-white border border-border-warm p-4" style={{ borderRadius: 12 }}>
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Enriched</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--teal)' }}>{enrichedCount}</p>
        </div>
        <div className="bg-white border border-border-warm p-4" style={{ borderRadius: 12 }}>
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Needs enrichment</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--terra)' }}>{grants.length - enrichedCount}</p>
        </div>
      </div>

      {/* Re-classify by ID list — collapsed by default */}
      <div className="mb-5 bg-white border border-border-warm" style={{ borderRadius: 12 }}>
        <button
          onClick={() => setReclassifyOpen(o => !o)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-text-body hover:bg-surface-sunken transition-colors"
          style={{ borderRadius: 12 }}>
          <span className="flex items-center gap-2">
            <Brain className="w-4 h-4" style={{ color: 'var(--teal)' }} />
            Re-classify by ID list
          </span>
          <span className="text-xs font-normal text-text-muted">
            {reclassifyOpen ? 'hide' : 'show'}
          </span>
        </button>
        {reclassifyOpen && (
          <div className="px-4 pb-4 pt-1 border-t border-border-warm">
            <p className="text-xs text-text-muted mb-2">
              Paste grant IDs (UUIDs) — any format: newline, comma, JSON array. Runs the AI classifier on each ID and overwrites sectors / structures / beneficiaries / niche / funding type. Empty arrays from the classifier will clear stale broad tags.
            </p>
            <textarea
              value={reclassifyText}
              onChange={e => setReclassifyText(e.target.value)}
              placeholder="007e7f00-876d-4a11-ab7f-79bd6e159bf0&#10;011655cc-3391-43d4-8fdb-bbdfda4479ab&#10;..."
              rows={6}
              className="w-full px-3 py-2 text-xs font-mono border border-border-warm bg-surface-page outline-none focus:border-teal transition-colors"
              style={{ borderRadius: 8 }}
              disabled={reclassifyRunning}
            />
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={runReclassify}
                disabled={reclassifyRunning || parsedIds.length === 0}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white transition-opacity disabled:opacity-50"
                style={{ borderRadius: 9999, backgroundColor: 'var(--teal)' }}>
                <Zap className="w-3.5 h-3.5" />
                {reclassifyRunning && reclassifyProgress
                  ? `Re-classifying ${reclassifyProgress.batch}/${reclassifyProgress.total}…`
                  : `Re-classify ${parsedIds.length || 0} ID${parsedIds.length === 1 ? '' : 's'}`}
              </button>
              {reclassifyProgress && !reclassifyRunning && (
                <span className="text-xs text-text-muted">
                  Done — classified {reclassifyProgress.classified}, failed {reclassifyProgress.failed}
                </span>
              )}
            </div>
            {reclassifyLog.length > 0 && (
              <pre className="mt-3 px-3 py-2 text-[11px] font-mono text-text-muted bg-surface-page border border-border-warm overflow-x-auto" style={{ borderRadius: 8 }}>
                {reclassifyLog.join('\n')}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Filter tabs + search */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex gap-2">
          {(['unenriched', 'enriched', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-4 py-2 text-sm font-semibold border transition-colors"
              style={{
                borderRadius: 9999,
                backgroundColor: filter === f ? 'var(--teal)' : 'white',
                color: filter === f ? 'white' : 'var(--text-muted)',
                borderColor: filter === f ? 'var(--teal)' : 'var(--border-warm)',
              }}>
              {f === 'unenriched' ? 'Needs enrichment' : f === 'enriched' ? 'Enriched' : 'All'}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-subtle pointer-events-none" />
          <input
            type="text"
            placeholder="Search by grant title or funder…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-border-warm bg-white outline-none focus:border-teal transition-colors"
            style={{ borderRadius: 9999 }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text-muted transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-text-muted">Loading grants…</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(grant => {
            const status = enrichStatus[grant.id] ?? 'idle'
            const existingBrief = brief[grant.id] ?? grant.funder_brief
            const isEnriched = !!existingBrief
            const grantSources = sources[grant.id] ?? []
            const isSourcesOpen = sourcesOpen[grant.id] ?? false
            const hasFilledSources = grantSources.some(s => s.text.trim().length > 50 || s.url.trim().length > 5)

            const isHighlighted = grant.id === highlightId
            return (
              <div
                key={grant.id}
                ref={isHighlighted ? highlightRef : null}
                className="bg-white border overflow-hidden transition-all"
                style={{ borderRadius: 12, borderColor: isHighlighted ? 'var(--teal)' : 'var(--border-warm)', boxShadow: isHighlighted ? '0 0 0 3px rgba(0,128,128,0.15)' : undefined }}
              >
                {isHighlighted && (
                  <div className="flex items-center gap-2 px-4 py-2 text-xs font-semibold" style={{ background: 'var(--surface-page)', color: 'var(--teal)', borderBottom: '1px solid var(--type-programme-pale)' }}>
                    <Sparkles className="w-3.5 h-3.5" /> Just approved — verify the details below then enrich
                  </div>
                )}
                {isHighlighted && (
                  <div className="px-4 py-3 border-b border-border-warm bg-surface-page">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-text-subtle mb-2">Grant details — verify before enriching</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                      {/* Funder type */}
                      <div><label className="text-text-subtle block mb-0.5">Funder type</label>
                        <select value={String(getEditVal(grant.id,'funder_type',grant.funder_type) ?? '')} onChange={e=>setEditField(grant.id,'funder_type',e.target.value)}
                          className="form-select text-xs py-1 w-full">
                          {['trust_foundation','community_foundation','corporate_foundation','local_authority','corporate','lottery','government','capacity_builder','competition','loan','other'].map(v=><option key={v} value={v}>{v.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>)}
                        </select></div>
                      {/* Funding type */}
                      <div><label className="text-text-subtle block mb-0.5">Funding type</label>
                        <select value={String(getEditVal(grant.id,'funding_type',grant.funding_type) ?? 'grant')} onChange={e=>setEditField(grant.id,'funding_type',e.target.value)}
                          className="form-select text-xs py-1 w-full">
                          {['grant','programme','investment','in_kind'].map(v=><option key={v} value={v}>{v.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>)}
                        </select></div>
                      {/* Amount min */}
                      <div><label className="text-text-subtle block mb-0.5">Amount min (£)</label>
                        <input type="number" value={String(getEditVal(grant.id,'amount_min',grant.amount_min) ?? '')} onChange={e=>setEditField(grant.id,'amount_min',e.target.value)}
                          className="form-input text-xs py-1 w-full" placeholder="e.g. 5000" /></div>
                      {/* Amount max */}
                      <div><label className="text-text-subtle block mb-0.5">Amount max (£)</label>
                        <input type="number" value={String(getEditVal(grant.id,'amount_max',grant.amount_max) ?? '')} onChange={e=>setEditField(grant.id,'amount_max',e.target.value)}
                          className="form-input text-xs py-1 w-full" placeholder="e.g. 50000" /></div>
                      {/* Deadline */}
                      <div><label className="text-text-subtle block mb-0.5">Deadline</label>
                        <input type="text" value={String(getEditVal(grant.id,'deadline',grant.deadline) ?? '')} onChange={e=>setEditField(grant.id,'deadline',e.target.value)}
                          disabled={Boolean(getEditVal(grant.id,'is_rolling',grant.is_rolling))}
                          className="form-input text-xs py-1 w-full" placeholder="YYYY-MM-DD" /></div>
                      {/* Location */}
                      <div><label className="text-text-subtle block mb-0.5">Location tag</label>
                        <input type="text" value={String(getEditVal(grant.id,'location_tag',grant.location_tag) ?? '')} onChange={e=>setEditField(grant.id,'location_tag',e.target.value)}
                          className="form-input text-xs py-1 w-full" placeholder="e.g. UK, London, Sussex" /></div>
                    </div>
                    {/* Rolling toggle */}
                    <div className="flex items-center gap-2 mt-2">
                      <input type="checkbox" id={`rolling-${grant.id}`} checked={Boolean(getEditVal(grant.id,'is_rolling',grant.is_rolling))} onChange={e=>setEditField(grant.id,'is_rolling',e.target.checked)} className="h-3.5 w-3.5 accent-forest" />
                      <label htmlFor={`rolling-${grant.id}`} className="text-xs text-mid cursor-pointer">Rolling deadline (no fixed close date)</label>
                    </div>
                    {/* Read-only fields */}
                    <div className="mt-2 text-xs text-mid">
                      <span className="mr-4"><span className="text-text-subtle">Sectors: </span>{grant.impact_sectors?.slice(0,3).map(s=>s.replace(/_/g,' ')).join(', ') ?? '—'}</span>
                      <span><span className="text-text-subtle">Eligible: </span>{grant.eligible_structures?.slice(0,3).map(s=>s.replace(/_/g,' ')).join(', ') ?? '—'}</span>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border-warm">
                      {grant.apply_url && <a href={grant.apply_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-forest underline"><ExternalLink className="w-3 h-3" />Verify on funder site</a>}
                      <div className="flex-1" />
                      <button onClick={()=>saveEdits(grant)} disabled={editSaving[grant.id] || Object.keys(editState[grant.id]??{}).length===0}
                        className="rounded-full border border-forest px-3 py-1 text-xs font-semibold text-forest hover:bg-forest hover:text-white transition-colors disabled:opacity-40">
                        {editSaving[grant.id] ? 'Saving…' : 'Save changes'}
                      </button>
                      <button onClick={()=>publishGrant(grant)} disabled={publishSaving[grant.id]}
                        className="rounded-full bg-forest px-4 py-1 text-xs font-semibold text-white hover:bg-sage-deep transition-colors disabled:opacity-40 flex items-center gap-1">
                        {publishSaving[grant.id] ? 'Publishing…' : '✓ Confirm & publish'}
                      </button>
                    </div>
                  </div>
                )}
                {/* Grant row */}
                <div className="flex items-start gap-4 p-4">
                  {/* Status icon */}
                  <div className="flex-shrink-0 mt-1">
                    {isEnriched
                      ? <CheckCircle className="w-4 h-4" style={{ color: 'var(--teal)' }} />
                      : status === 'loading'
                        ? <RefreshCw className="w-4 h-4 animate-spin text-text-muted" />
                        : status === 'error'
                          ? <AlertTriangle className="w-4 h-4 text-coral-saturated" />
                          : <Clock className="w-4 h-4 text-text-subtle" />
                    }
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    {/* Title — editable */}
                    {editingTitle[grant.id] !== undefined && editingTitle[grant.id] !== null ? (
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <input
                          type="text"
                          autoFocus
                          value={editingTitle[grant.id] ?? ''}
                          onChange={e => setEditingTitle(t => ({ ...t, [grant.id]: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveTitle(grant.id)
                            if (e.key === 'Escape') setEditingTitle(t => ({ ...t, [grant.id]: null }))
                          }}
                          className="flex-1 text-sm font-semibold border border-teal px-2 py-0.5 outline-none min-w-0"
                          style={{ borderRadius: 6 }}
                        />
                        <button
                          onClick={() => saveTitle(grant.id)}
                          disabled={savingTitle[grant.id]}
                          className="p-1 text-white flex-shrink-0 disabled:opacity-50"
                          style={{ backgroundColor: 'var(--teal)', borderRadius: 6 }}
                          title="Save title">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingTitle(t => ({ ...t, [grant.id]: null }))}
                          className="p-1 text-text-subtle hover:text-text-muted flex-shrink-0"
                          style={{ borderRadius: 6 }}
                          title="Cancel">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 group">
                        <p className="text-sm font-semibold text-text-body truncate">{grant.title}</p>
                        <button
                          onClick={() => setEditingTitle(t => ({ ...t, [grant.id]: grant.title }))}
                          className="p-0.5 text-text-subtle hover:text-teal transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                          title="Edit title">
                          <Pencil className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-text-muted">{grant.funder}</p>

                    {/* URL row — show/edit apply_url */}
                    {editingUrl[grant.id] !== undefined && editingUrl[grant.id] !== null ? (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <input
                          type="url"
                          autoFocus
                          value={editingUrl[grant.id] ?? ''}
                          onChange={e => setEditingUrl(u => ({ ...u, [grant.id]: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveUrl(grant.id)
                            if (e.key === 'Escape') setEditingUrl(u => ({ ...u, [grant.id]: null }))
                          }}
                          placeholder="https://…"
                          className="flex-1 text-xs border border-teal px-2 py-1 outline-none min-w-0"
                          style={{ borderRadius: 6 }}
                        />
                        <button
                          onClick={() => saveUrl(grant.id)}
                          disabled={savingUrl[grant.id]}
                          className="p-1 text-white flex-shrink-0 disabled:opacity-50"
                          style={{ backgroundColor: 'var(--teal)', borderRadius: 6 }}
                          title="Save URL">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingUrl(u => ({ ...u, [grant.id]: null }))}
                          className="p-1 text-text-subtle hover:text-text-muted flex-shrink-0"
                          style={{ borderRadius: 6 }}
                          title="Cancel">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 mt-1">
                        {grant.apply_url
                          ? <span className="text-xs text-text-subtle truncate max-w-xs">{grant.apply_url}</span>
                          : <span className="text-xs text-terra italic">No URL set</span>
                        }
                        <button
                          onClick={() => setEditingUrl(u => ({ ...u, [grant.id]: grant.apply_url ?? '' }))}
                          className="p-0.5 text-text-subtle hover:text-teal transition-colors flex-shrink-0"
                          title="Edit URL">
                          <Pencil className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    {/* URL quality warning — links to Grant Manager to fix */}
                    {grant.url_quality_score !== null && grant.url_quality_score < 60 && (
                      <NextLink
                        href="/dashboard/admin/urls"
                        className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-amber-600 hover:text-amber-800 transition-colors"
                        title="URL has quality issues — click to fix in Grant Manager">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                        Suspicious URL · fix in Grant Manager
                      </NextLink>
                    )}
                    {enrichMsg[grant.id] && (
                      <p className="text-xs text-coral-saturated mt-1">{enrichMsg[grant.id]}</p>
                    )}
                    {isEnriched && (
                      <p className="text-xs mt-1" style={{ color: 'var(--teal)' }}>
                        Enriched {existingBrief.last_enriched ?? ''}
                        {grantSources.length > 0 && ` · ${grantSources.length} extra source${grantSources.length > 1 ? 's' : ''} added`}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {grant.apply_url && (
                      <a href={grant.apply_url} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 text-text-muted hover:text-text-body transition-colors"
                        title="Open primary URL">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    {/* Sources toggle — always available */}
                    <button
                      onClick={() => setSourcesOpen(o => ({ ...o, [grant.id]: !o[grant.id] }))}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold border transition-colors"
                      style={{
                        borderRadius: 9999,
                        borderColor: isSourcesOpen ? 'var(--teal)' : 'var(--border-warm)',
                        color: isSourcesOpen ? 'var(--teal)' : 'var(--text-muted)',
                        backgroundColor: isSourcesOpen ? 'rgba(0,128,128,0.08)' : 'white',
                      }}
                      title="Add extra source pages">
                      <BookOpen className="w-3 h-3" />
                      {grantSources.length > 0 ? `${grantSources.length} source${grantSources.length > 1 ? 's' : ''}` : 'Sources'}
                    </button>
                    <button
                      onClick={() => enrichSingle(grant)}
                      disabled={status === 'loading'}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50"
                      style={{
                        borderRadius: 9999,
                        backgroundColor: isEnriched ? 'rgba(0,128,128,0.10)' : 'var(--teal)',
                        color: isEnriched ? 'var(--teal)' : 'white',
                      }}>
                      <Sparkles className="w-3 h-3" />
                      {status === 'loading' ? 'Enriching…' : isEnriched ? 'Re-enrich' : 'Enrich'}
                    </button>
                  </div>
                </div>

                {/* Sources panel */}
                {isSourcesOpen && (
                  <div className="border-t border-border-warm px-4 py-4 space-y-3" style={{ backgroundColor: 'var(--surface-page)' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-text-body">Additional sources</p>
                        <p className="text-[11px] text-text-muted mt-0.5">
                          Add extra pages to fill in any gaps. Provide a URL (fetched automatically) or paste the text directly. Claude combines all sources.
                        </p>
                      </div>
                      <button
                        onClick={() => addSource(grant.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white flex-shrink-0"
                        style={{ borderRadius: 9999, backgroundColor: 'var(--teal)' }}>
                        <PlusCircle className="w-3 h-3" />
                        Add source
                      </button>
                    </div>

                    {grantSources.length === 0 && (
                      <p className="text-xs text-text-subtle italic">
                        No extra sources yet. Click &quot;Add source&quot; to add a URL or paste content from another page.
                      </p>
                    )}

                    {grantSources.map((src, idx) => (
                      <div key={idx} className="bg-white border border-border-warm p-3 space-y-2" style={{ borderRadius: 8 }}>
                        {/* Label + remove */}
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Label (optional) — e.g. How to apply, Guidelines, Criteria…"
                            value={src.label}
                            onChange={e => updateSource(grant.id, idx, 'label', e.target.value)}
                            className="flex-1 text-xs border border-border-warm px-2.5 py-1.5 outline-none focus:border-teal"
                            style={{ borderRadius: 6, fontFamily: 'inherit' }}
                          />
                          <button
                            onClick={() => removeSource(grant.id, idx)}
                            className="p-1 text-text-subtle hover:text-coral-saturated transition-colors flex-shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {/* URL input */}
                        <div className="flex items-center gap-2">
                          <Link className="w-3 h-3 flex-shrink-0 text-text-subtle" />
                          <input
                            type="url"
                            placeholder="Page URL (optional) — fetched automatically during enrichment"
                            value={src.url}
                            onChange={e => updateSource(grant.id, idx, 'url', e.target.value)}
                            className="flex-1 text-xs border border-border-warm px-2.5 py-1.5 outline-none focus:border-teal"
                            style={{ borderRadius: 6, fontFamily: 'inherit' }}
                          />
                          {src.url.trim().length > 0 && (
                            <a href={src.url} target="_blank" rel="noopener noreferrer"
                              className="p-1 text-text-subtle hover:text-teal transition-colors flex-shrink-0"
                              title="Open URL">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                        {/* Divider with "or paste below" label */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 border-t border-border-warm" />
                          <span className="text-[10px] text-text-subtle">or paste text</span>
                          <div className="flex-1 border-t border-border-warm" />
                        </div>
                        <textarea
                          rows={4}
                          placeholder="Select all text on the page (Cmd+A / Ctrl+A), copy and paste here…"
                          value={src.text}
                          onChange={e => updateSource(grant.id, idx, 'text', e.target.value)}
                          className="w-full text-xs border border-border-warm p-2.5 resize-y outline-none focus:border-teal"
                          style={{ borderRadius: 6, fontFamily: 'inherit' }}
                        />
                        {src.text.trim().length > 0 && (
                          <p className="text-[10px] text-text-subtle">{src.text.trim().length.toLocaleString()} characters</p>
                        )}
                      </div>
                    ))}

                    {grantSources.length > 0 && (
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => enrichSingle(grant)}
                          disabled={status === 'loading' || !hasFilledSources}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white disabled:opacity-40 transition-opacity"
                          style={{ borderRadius: 9999, backgroundColor: 'var(--teal)' }}>
                          <Sparkles className="w-3 h-3" />
                          {status === 'loading' ? 'Enriching…' : isEnriched ? 'Re-enrich with sources' : 'Enrich with sources'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Brief preview */}
                {existingBrief && !isSourcesOpen && (
                  <div className="border-t border-border-warm px-4 py-4 grid grid-cols-2 gap-x-6 gap-y-3" style={{ backgroundColor: 'var(--surface-page)' }}>
                    {Object.entries(BRIEF_LABELS).map(([key, label]) => {
                      const val = existingBrief[key]
                      if (!val) return (
                        <div key={key} className="opacity-40">
                          <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-0.5">{label}</p>
                          <p className="text-xs text-text-subtle italic">Not found — add a source to fill this in</p>
                        </div>
                      )
                      return (
                        <div key={key}>
                          <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-0.5">{label}</p>
                          <p className="text-xs text-text-body leading-relaxed">{val}</p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="text-center py-16 text-text-muted text-sm">
              {searchLower
                ? `No grants matching "${search}"`
                : filter === 'enriched' ? 'No enriched grants yet — start enriching!' : 'All grants have been enriched 🎉'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

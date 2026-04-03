'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Sparkles, ExternalLink, RefreshCw, CheckCircle, Clock, AlertTriangle, Zap, PlusCircle, X, BookOpen, Link, Search, Pencil, Check, Brain } from 'lucide-react'
import NextLink from 'next/link'

type GrantRow = {
  id: string
  title: string
  funder: string | null
  apply_url: string | null
  funder_brief: Record<string, string | null> | null
  last_seen_at: string | null
  url_quality_score: number | null
  url_quality_issues: string[] | null
}

type EnrichStatus = 'idle' | 'loading' | 'done' | 'error'
type Source = { label: string; url: string; text: string }

export default function FunderIntelligencePage() {
  const [grants, setGrants] = useState<GrantRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'enriched' | 'unenriched'>('unenriched')
  const [enrichStatus, setEnrichStatus] = useState<Record<string, EnrichStatus>>({})
  const [enrichMsg, setEnrichMsg] = useState<Record<string, string>>({})
  const [brief, setBrief] = useState<Record<string, Record<string, string | null>>>({})
  const [bulkRunning, setBulkRunning] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
  const [search, setSearch] = useState('')
  const [editingUrl, setEditingUrl] = useState<Record<string, string | null>>({}) // grantId → draft URL or null
  const [savingUrl, setSavingUrl] = useState<Record<string, boolean>>({})
  // Multi-source state
  const [sourcesOpen, setSourcesOpen] = useState<Record<string, boolean>>({})
  const [sources, setSources] = useState<Record<string, Source[]>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await createClient()
      .from('scraped_grants')
      .select('id, title, funder, apply_url, funder_brief, last_seen_at, url_quality_score, url_quality_issues')
      .eq('is_active', true)
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
    const hasAiContent = (fb: Record<string, unknown> | null) =>
      fb && (fb.what_they_fund || fb.priorities || fb.focuses_on || fb.strong_application)
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
              <Sparkles className="w-5 h-5" style={{ color: '#008080' }} />
              <h1 className="text-2xl font-bold text-[#1C1C2E]">Funder Intelligence</h1>
            </div>
            <p className="text-sm text-[#6E6E80]">
              Enrich grants with AI-generated summaries. Add extra source pages to fill in any gaps.
            </p>
          </div>
          <button
            onClick={enrichAll}
            disabled={bulkRunning || loading}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-bold text-white transition-opacity disabled:opacity-60"
            style={{ borderRadius: 9999, backgroundColor: '#FF7043' }}>
            <Zap className="w-4 h-4" />
            {bulkRunning && bulkProgress
              ? `Enriching ${bulkProgress.done}/${bulkProgress.total}…`
              : 'Enrich All'}
          </button>
        </div>
        <div className="flex gap-1 border-b border-[#E8E8EC]">
          <NextLink href="/dashboard/admin/intelligence"
            className="px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors"
            style={{ borderColor: '#008080', color: '#008080' }}>
            Enrichment
          </NextLink>
          <NextLink href="/dashboard/admin/watchlist"
            className="px-4 py-2.5 text-sm font-semibold border-b-2 border-transparent text-[#6E6E80] hover:text-[#1C1C2E] transition-colors">
            Watchlist
          </NextLink>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-[#E8E8EC] p-4" style={{ borderRadius: 12 }}>
          <p className="text-[10px] font-bold text-[#6E6E80] uppercase tracking-wider mb-1">Total with URL</p>
          <p className="text-2xl font-bold text-[#1C1C2E]">{grants.length}</p>
        </div>
        <div className="bg-white border border-[#E8E8EC] p-4" style={{ borderRadius: 12 }}>
          <p className="text-[10px] font-bold text-[#6E6E80] uppercase tracking-wider mb-1">Enriched</p>
          <p className="text-2xl font-bold" style={{ color: '#008080' }}>{enrichedCount}</p>
        </div>
        <div className="bg-white border border-[#E8E8EC] p-4" style={{ borderRadius: 12 }}>
          <p className="text-[10px] font-bold text-[#6E6E80] uppercase tracking-wider mb-1">Needs enrichment</p>
          <p className="text-2xl font-bold" style={{ color: '#FF7043' }}>{grants.length - enrichedCount}</p>
        </div>
      </div>

      {/* Filter tabs + search */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex gap-2">
          {(['unenriched', 'enriched', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-4 py-2 text-sm font-semibold border transition-colors"
              style={{
                borderRadius: 9999,
                backgroundColor: filter === f ? '#008080' : 'white',
                color: filter === f ? 'white' : '#6E6E80',
                borderColor: filter === f ? '#008080' : '#E8E8EC',
              }}>
              {f === 'unenriched' ? 'Needs enrichment' : f === 'enriched' ? 'Enriched' : 'All'}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9E9EA8] pointer-events-none" />
          <input
            type="text"
            placeholder="Search by grant title or funder…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-[#E8E8EC] bg-white outline-none focus:border-[#008080] transition-colors"
            style={{ borderRadius: 9999 }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9E9EA8] hover:text-[#6E6E80] transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-[#6E6E80]">Loading grants…</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(grant => {
            const status = enrichStatus[grant.id] ?? 'idle'
            const existingBrief = brief[grant.id] ?? grant.funder_brief
            const isEnriched = !!existingBrief
            const grantSources = sources[grant.id] ?? []
            const isSourcesOpen = sourcesOpen[grant.id] ?? false
            const hasFilledSources = grantSources.some(s => s.text.trim().length > 50 || s.url.trim().length > 5)

            return (
              <div key={grant.id} className="bg-white border border-[#E8E8EC] overflow-hidden" style={{ borderRadius: 12 }}>
                {/* Grant row */}
                <div className="flex items-start gap-4 p-4">
                  {/* Status icon */}
                  <div className="flex-shrink-0 mt-1">
                    {isEnriched
                      ? <CheckCircle className="w-4 h-4" style={{ color: '#008080' }} />
                      : status === 'loading'
                        ? <RefreshCw className="w-4 h-4 animate-spin text-[#6E6E80]" />
                        : status === 'error'
                          ? <AlertTriangle className="w-4 h-4 text-red-500" />
                          : <Clock className="w-4 h-4 text-[#9E9EA8]" />
                    }
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1C1C2E] truncate">{grant.title}</p>
                    <p className="text-xs text-[#6E6E80]">{grant.funder}</p>

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
                          className="flex-1 text-xs border border-[#008080] px-2 py-1 outline-none min-w-0"
                          style={{ borderRadius: 6 }}
                        />
                        <button
                          onClick={() => saveUrl(grant.id)}
                          disabled={savingUrl[grant.id]}
                          className="p-1 text-white flex-shrink-0 disabled:opacity-50"
                          style={{ backgroundColor: '#008080', borderRadius: 6 }}
                          title="Save URL">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingUrl(u => ({ ...u, [grant.id]: null }))}
                          className="p-1 text-[#9E9EA8] hover:text-[#6E6E80] flex-shrink-0"
                          style={{ borderRadius: 6 }}
                          title="Cancel">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 mt-1">
                        {grant.apply_url
                          ? <span className="text-xs text-[#9E9EA8] truncate max-w-xs">{grant.apply_url}</span>
                          : <span className="text-xs text-[#FF7043] italic">No URL set</span>
                        }
                        <button
                          onClick={() => setEditingUrl(u => ({ ...u, [grant.id]: grant.apply_url ?? '' }))}
                          className="p-0.5 text-[#9E9EA8] hover:text-[#008080] transition-colors flex-shrink-0"
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
                      <p className="text-xs text-red-500 mt-1">{enrichMsg[grant.id]}</p>
                    )}
                    {isEnriched && (
                      <p className="text-xs mt-1" style={{ color: '#008080' }}>
                        Enriched {existingBrief.last_enriched ?? ''}
                        {grantSources.length > 0 && ` · ${grantSources.length} extra source${grantSources.length > 1 ? 's' : ''} added`}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {grant.apply_url && (
                      <a href={grant.apply_url} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 text-[#6E6E80] hover:text-[#1C1C2E] transition-colors"
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
                        borderColor: isSourcesOpen ? '#008080' : '#E8E8EC',
                        color: isSourcesOpen ? '#008080' : '#6E6E80',
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
                        backgroundColor: isEnriched ? 'rgba(0,128,128,0.10)' : '#008080',
                        color: isEnriched ? '#008080' : 'white',
                      }}>
                      <Sparkles className="w-3 h-3" />
                      {status === 'loading' ? 'Enriching…' : isEnriched ? 'Re-enrich' : 'Enrich'}
                    </button>
                  </div>
                </div>

                {/* Sources panel */}
                {isSourcesOpen && (
                  <div className="border-t border-[#E8E8EC] px-4 py-4 space-y-3" style={{ backgroundColor: '#FAF8F5' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-[#1C1C2E]">Additional sources</p>
                        <p className="text-[11px] text-[#6E6E80] mt-0.5">
                          Add extra pages to fill in any gaps. Provide a URL (fetched automatically) or paste the text directly. Claude combines all sources.
                        </p>
                      </div>
                      <button
                        onClick={() => addSource(grant.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white flex-shrink-0"
                        style={{ borderRadius: 9999, backgroundColor: '#008080' }}>
                        <PlusCircle className="w-3 h-3" />
                        Add source
                      </button>
                    </div>

                    {grantSources.length === 0 && (
                      <p className="text-xs text-[#9E9EA8] italic">
                        No extra sources yet. Click &quot;Add source&quot; to add a URL or paste content from another page.
                      </p>
                    )}

                    {grantSources.map((src, idx) => (
                      <div key={idx} className="bg-white border border-[#E8E8EC] p-3 space-y-2" style={{ borderRadius: 8 }}>
                        {/* Label + remove */}
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Label (optional) — e.g. How to apply, Guidelines, Criteria…"
                            value={src.label}
                            onChange={e => updateSource(grant.id, idx, 'label', e.target.value)}
                            className="flex-1 text-xs border border-[#E8E8EC] px-2.5 py-1.5 outline-none focus:border-[#008080]"
                            style={{ borderRadius: 6, fontFamily: 'inherit' }}
                          />
                          <button
                            onClick={() => removeSource(grant.id, idx)}
                            className="p-1 text-[#9E9EA8] hover:text-red-400 transition-colors flex-shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {/* URL input */}
                        <div className="flex items-center gap-2">
                          <Link className="w-3 h-3 flex-shrink-0 text-[#9E9EA8]" />
                          <input
                            type="url"
                            placeholder="Page URL (optional) — fetched automatically during enrichment"
                            value={src.url}
                            onChange={e => updateSource(grant.id, idx, 'url', e.target.value)}
                            className="flex-1 text-xs border border-[#E8E8EC] px-2.5 py-1.5 outline-none focus:border-[#008080]"
                            style={{ borderRadius: 6, fontFamily: 'inherit' }}
                          />
                          {src.url.trim().length > 0 && (
                            <a href={src.url} target="_blank" rel="noopener noreferrer"
                              className="p-1 text-[#9E9EA8] hover:text-[#008080] transition-colors flex-shrink-0"
                              title="Open URL">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                        {/* Divider with "or paste below" label */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 border-t border-[#E8E8EC]" />
                          <span className="text-[10px] text-[#9E9EA8]">or paste text</span>
                          <div className="flex-1 border-t border-[#E8E8EC]" />
                        </div>
                        <textarea
                          rows={4}
                          placeholder="Select all text on the page (Cmd+A / Ctrl+A), copy and paste here…"
                          value={src.text}
                          onChange={e => updateSource(grant.id, idx, 'text', e.target.value)}
                          className="w-full text-xs border border-[#E8E8EC] p-2.5 resize-y outline-none focus:border-[#008080]"
                          style={{ borderRadius: 6, fontFamily: 'inherit' }}
                        />
                        {src.text.trim().length > 0 && (
                          <p className="text-[10px] text-[#9E9EA8]">{src.text.trim().length.toLocaleString()} characters</p>
                        )}
                      </div>
                    ))}

                    {grantSources.length > 0 && (
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => enrichSingle(grant)}
                          disabled={status === 'loading' || !hasFilledSources}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white disabled:opacity-40 transition-opacity"
                          style={{ borderRadius: 9999, backgroundColor: '#008080' }}>
                          <Sparkles className="w-3 h-3" />
                          {status === 'loading' ? 'Enriching…' : isEnriched ? 'Re-enrich with sources' : 'Enrich with sources'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Brief preview */}
                {existingBrief && !isSourcesOpen && (
                  <div className="border-t border-[#E8E8EC] px-4 py-4 grid grid-cols-2 gap-x-6 gap-y-3" style={{ backgroundColor: '#FAF8F5' }}>
                    {Object.entries(BRIEF_LABELS).map(([key, label]) => {
                      const val = existingBrief[key]
                      if (!val) return (
                        <div key={key} className="opacity-40">
                          <p className="text-[10px] font-bold text-[#6E6E80] uppercase tracking-wider mb-0.5">{label}</p>
                          <p className="text-xs text-[#9E9EA8] italic">Not found — add a source to fill this in</p>
                        </div>
                      )
                      return (
                        <div key={key}>
                          <p className="text-[10px] font-bold text-[#6E6E80] uppercase tracking-wider mb-0.5">{label}</p>
                          <p className="text-xs text-[#444] leading-relaxed">{val}</p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="text-center py-16 text-[#6E6E80] text-sm">
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

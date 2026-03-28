'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Sparkles, ExternalLink, RefreshCw, CheckCircle, Clock, AlertTriangle } from 'lucide-react'

type GrantRow = {
  id: string
  title: string
  funder: string | null
  apply_url: string | null
  funder_brief: Record<string, string | null> | null
  last_seen_at: string | null
}

type EnrichStatus = 'idle' | 'loading' | 'done' | 'error'

export default function FunderIntelligencePage() {
  const [grants, setGrants] = useState<GrantRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'enriched' | 'unenriched'>('unenriched')
  const [enrichStatus, setEnrichStatus] = useState<Record<string, EnrichStatus>>({})
  const [enrichMsg, setEnrichMsg] = useState<Record<string, string>>({})
  const [brief, setBrief] = useState<Record<string, Record<string, string | null>>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await createClient()
      .from('scraped_grants')
      .select('id, title, funder, apply_url, funder_brief, last_seen_at')
      .eq('is_active', true)
      .not('apply_url', 'is', null)
      .order('last_seen_at', { ascending: false })
      .limit(200)
    setGrants((data as GrantRow[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const enrich = async (grant: GrantRow) => {
    setEnrichStatus(s => ({ ...s, [grant.id]: 'loading' }))
    setEnrichMsg(s => ({ ...s, [grant.id]: '' }))
    try {
      const res = await fetch('/api/admin/enrich-grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grantId: grant.id }),
      })
      const json = await res.json()
      if (!res.ok) {
        setEnrichStatus(s => ({ ...s, [grant.id]: 'error' }))
        setEnrichMsg(s => ({ ...s, [grant.id]: json.error ?? 'Failed' }))
      } else {
        setEnrichStatus(s => ({ ...s, [grant.id]: 'done' }))
        setBrief(b => ({ ...b, [grant.id]: json.brief }))
        setGrants(gs => gs.map(g => g.id === grant.id ? { ...g, funder_brief: json.brief } : g))
      }
    } catch {
      setEnrichStatus(s => ({ ...s, [grant.id]: 'error' }))
      setEnrichMsg(s => ({ ...s, [grant.id]: 'Network error' }))
    }
  }

  const filtered = grants.filter(g =>
    filter === 'all' ? true :
    filter === 'enriched' ? !!g.funder_brief :
    !g.funder_brief
  )

  const enrichedCount = grants.filter(g => !!g.funder_brief).length

  const BRIEF_LABELS: Record<string, string> = {
    what_they_fund:    'What they fund',
    priorities:        'Priorities',
    strong_application:'Strong application',
    exclusions:        'Exclusions',
    typical_award:     'Typical award',
    decision_timeline: 'Decision timeline',
    how_to_apply:      'How to apply',
    funder_tips:       'Tips',
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-5 h-5" style={{ color: '#008080' }} />
          <h1 className="text-2xl font-bold text-[#1C1C2E]">Funder Intelligence</h1>
        </div>
        <p className="text-sm text-[#6E6E80]">
          Enrich grants with AI-generated summaries scraped from funder websites. Summaries are stored in Supabase and shown to users in the grant card.
        </p>
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

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
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

      {loading ? (
        <div className="text-center py-16 text-[#6E6E80]">Loading grants…</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(grant => {
            const status = enrichStatus[grant.id] ?? 'idle'
            const existingBrief = brief[grant.id] ?? grant.funder_brief
            const isEnriched = !!existingBrief
            return (
              <div key={grant.id} className="bg-white border border-[#E8E8EC] overflow-hidden" style={{ borderRadius: 12 }}>
                {/* Grant row */}
                <div className="flex items-start gap-4 p-4">
                  {/* Status dot */}
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
                    {enrichMsg[grant.id] && (
                      <p className="text-xs text-red-500 mt-1">{enrichMsg[grant.id]}</p>
                    )}
                    {isEnriched && (
                      <p className="text-xs mt-1" style={{ color: '#008080' }}>
                        Enriched {existingBrief.last_enriched ?? ''}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {grant.apply_url && (
                      <a href={grant.apply_url} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 text-[#6E6E80] hover:text-[#1C1C2E] transition-colors">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    <button
                      onClick={() => enrich(grant)}
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

                {/* Brief preview */}
                {existingBrief && (
                  <div className="border-t border-[#E8E8EC] px-4 py-4 grid grid-cols-2 gap-x-6 gap-y-3" style={{ backgroundColor: '#FAF8F5' }}>
                    {Object.entries(BRIEF_LABELS).map(([key, label]) => {
                      const val = existingBrief[key]
                      if (!val) return null
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
              {filter === 'enriched' ? 'No enriched grants yet — start enriching!' : 'All grants have been enriched 🎉'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

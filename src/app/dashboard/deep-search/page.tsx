'use client'

import { useState, useEffect } from 'react'
import { SEED_GRANTS } from '@/lib/grants'
import { createClient } from '@/lib/supabase/client'
import { createPipelineItem } from '@/lib/pipeline'
import { getOrganisationByOwner } from '@/lib/organisations'
import type { Organisation } from '@/types'

interface DeepGrant {
  title: string
  funder: string
  description: string
  amountRange: string | null
  deadline: string | null
  applyUrl: string
  notes: string
}

interface DeepSearchResponse {
  summary: string
  grants: DeepGrant[]
  _cached?: boolean
}

const SECTOR_FILTERS = [
  { id: 'mental health',        label: '🧠 Mental Health' },
  { id: 'youth',                label: '🧒 Youth' },
  { id: 'elderly',              label: '👴 Elderly & Older People' },
  { id: 'education & training', label: '📚 Education & Training' },
  { id: 'housing',              label: '🏠 Housing' },
  { id: 'disability',           label: '♿ Disability' },
  { id: 'arts & culture',       label: '🎨 Arts & Culture' },
  { id: 'sport & physical activity', label: '⚽ Sport' },
  { id: 'environment',          label: '🌿 Environment' },
  { id: 'food poverty',         label: '🍞 Food Poverty' },
  { id: 'domestic abuse',       label: '🤝 Domestic Abuse' },
  { id: 'criminal justice',     label: '⚖️ Criminal Justice' },
  { id: 'digital inclusion',    label: '💻 Digital Inclusion' },
  { id: 'community',            label: '🏘 Community' },
  { id: 'social enterprise',    label: '🌱 Social Enterprise' },
  { id: 'women & girls',        label: '♀ Women & Girls' },
]

const EXAMPLE_QUERIES = [
  'mental health funding Lewisham',
  'youth sport grants Brighton',
  'community food bank Birmingham',
  'arts and heritage Cornwall',
  'disability support services Edinburgh',
  'environmental projects Leeds',
]

function DeepGrantCard({ grant, onAddToPipeline }: {
  grant: DeepGrant
  onAddToPipeline: (g: DeepGrant) => void
}) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-card mb-3 border border-indigo-100 hover:border-indigo-300 transition-all">
      <div className="flex gap-4">
        <div className="flex-1">
          <div className="flex items-start gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-sm flex-shrink-0">
              {grant.funder[0]}
            </div>
            <div className="flex-1">
              <h3 className="font-display font-bold text-forest text-base leading-snug">{grant.title}</h3>
              <p className="text-sm text-mid">{grant.funder}</p>
            </div>
          </div>
          <p className="text-sm text-mid leading-relaxed mb-3">{grant.description}</p>
          {grant.notes && (
            <div className="bg-indigo-50 rounded-lg px-3.5 py-2.5 flex items-start gap-2">
              <span className="text-indigo-400 text-sm">💡</span>
              <p className="text-sm text-indigo-800">{grant.notes}</p>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-3 w-44 flex-shrink-0">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">🔬 Live result</span>
          {grant.amountRange && (
            <div className="text-right w-full">
              <p className="font-display text-lg font-bold text-gold leading-snug break-words">{grant.amountRange}</p>
              <p className="text-xs text-light mt-0.5">Grant range</p>
            </div>
          )}
          <div className="text-right">
            <p className="text-xs text-mid">Deadline</p>
            <p className="text-sm font-medium text-charcoal">{grant.deadline ?? 'Check website'}</p>
          </div>
          <div className="flex flex-col gap-1.5 w-full">
            {grant.applyUrl && (
              <a href={grant.applyUrl} target="_blank" rel="noopener noreferrer"
                className="btn-outline btn-sm w-full text-center text-xs">
                Visit website →
              </a>
            )}
            <button onClick={() => onAddToPipeline(grant)} className="btn-gold btn-sm w-full text-center">
              + Pipeline
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function buildSmartQuery(org: Organisation): string {
  const parts: string[] = []
  if (org.name)             parts.push(`grant funding for ${org.name}`)
  if (org.org_type)         parts.push(`a ${org.org_type.replace(/_/g, ' ')}`)
  if (org.areas_of_work?.length) parts.push(`providing ${org.areas_of_work.slice(0, 3).join(', ')}`)
  if (org.themes?.length)        parts.push(org.themes.slice(0, 3).join(', '))
  if (org.beneficiaries?.length) parts.push(`for ${org.beneficiaries.slice(0, 2).join(' and ')}`)
  return parts.join(' — ')
}

export default function AdvancedSearchPage() {
  const [query, setQuery] = useState('')
  const [selectedSectors, setSelectedSectors] = useState<string[]>([])
  const [locationFilter, setLocationFilter] = useState('')
  const [results, setResults] = useState<DeepSearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [smartMatched, setSmartMatched] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [org, setOrg] = useState<Organisation | null>(null)
  const [userId, setUserId] = useState('')
  const [optionsOpen, setOptionsOpen] = useState(false)

  // ── Restore search state from sessionStorage on mount ──────────────────
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('deepSearch')
      if (saved) {
        const { query: q, results: r, smartMatched: sm, selectedSectors: ss, locationFilter: lf } = JSON.parse(saved)
        if (q)  setQuery(q)
        if (r)  setResults(r)
        if (sm) setSmartMatched(sm)
        if (ss) setSelectedSectors(ss)
        if (lf) setLocationFilter(lf)
      }
    } catch { /* ignore parse errors */ }
  }, [])

  // ── Persist search state to sessionStorage whenever it changes ──────────
  useEffect(() => {
    try {
      sessionStorage.setItem('deepSearch', JSON.stringify({ query, results, smartMatched, selectedSectors, locationFilter }))
    } catch { /* ignore storage errors */ }
  }, [query, results, smartMatched, selectedSectors, locationFilter])

  useEffect(() => {
    async function loadOrg() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const o = await getOrganisationByOwner(user.id)
      setOrg(o)
    }
    loadOrg()
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function toggleSector(id: string) {
    setSelectedSectors(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  // Build the list of existing grants to exclude from advanced search results
  const existingGrantTitles = SEED_GRANTS.map(g => ({ title: g.title, funder: g.funder }))

  async function runSearch(searchQuery: string, isSmartMatch = false) {
    setLoading(true)
    setError(null)
    setResults(null)
    setSmartMatched(false)
    try {
      const response = await fetch('/api/deep-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          org,
          sectors: selectedSectors,
          location: locationFilter,
          existingGrantTitles,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error ?? `Request failed (${response.status})`)
      setResults(data as DeepSearchResponse)
      if (isSmartMatch) setSmartMatched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Advanced search unavailable — please try again')
    } finally {
      setLoading(false)
    }
  }

  async function handleSearch() {
    if (!query.trim() && selectedSectors.length === 0 && !locationFilter.trim()) return
    const q = query.trim() || [...selectedSectors, locationFilter].filter(Boolean).join(', ')
    await runSearch(q)
  }

  function handleSmartMatch() {
    if (!org) return
    const smartQuery = buildSmartQuery(org)
    if (!smartQuery) return
    setQuery(smartQuery)
    if (org.primary_location) {
      setLocationFilter(org.primary_location)
      setOptionsOpen(true)
    }
    setResults(null)
    setError(null)
  }

  async function handleAddToPipeline(grant: DeepGrant) {
    if (!org) {
      showToast('Complete your profile first to track grants')
      return
    }
    try {
      await createPipelineItem({
        org_id: org.id,
        grant_name: grant.title,
        funder_name: grant.funder,
        funder_type: 'other',
        amount_min: null,
        amount_max: null,
        amount_requested: null,
        deadline: null,
        stage: 'identified',
        notes: grant.notes || null,
        application_progress: 0,
        is_urgent: false,
        contact_name: null,
        contact_email: null,
        grant_url: grant.applyUrl || null,
        outcome_date: null,
        outcome_notes: null,
        created_by: userId,
      })
      showToast(`"${grant.title}" added to pipeline!`)
    } catch {
      showToast('Failed to add — please try again')
    }
  }

  const canSearch = query.trim() || selectedSectors.length > 0 || locationFilter.trim()

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold text-forest">Live Search</h2>
      </div>

      {/* Explainer banner */}
      <div className="bg-indigo-600 rounded-2xl px-6 py-5 mb-6 text-white">
        <p className="text-lg font-bold mb-1">Dig deeper beyond our database — search live funds tailored to your organisation.</p>
        <p className="text-sm text-indigo-200 leading-relaxed mb-4">
          AI researches the live web in real time — council sites, NHS pages, community foundations and specialist funders — identifying hyper-local and newly announced funding that isn&apos;t in our main database yet.
        </p>
        <div className="flex flex-wrap gap-3">
          {[
            { icon: '🌐', label: 'Searches the live web' },
            { icon: '📍', label: 'Hyper-local results' },
            { icon: '✦',  label: 'Unique finds only' },
            { icon: '⏱',  label: '~15–30 seconds' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1.5 text-xs font-medium">
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Search box + filters */}
      <div className="bg-white rounded-xl p-5 shadow-card mb-6">

        {/* Keyword input */}
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400">🔬</span>
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setResults(null); setError(null) }}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="form-input pl-10"
              placeholder='Describe what you need, e.g. "youth mental health London"'
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !canSearch}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {loading ? '⏳ Researching…' : '🔬 Live Search'}
          </button>
        </div>

        {org && (
          <div className="mt-2.5">
            <button
              onClick={handleSmartMatch}
              disabled={loading}
              className="text-sm text-sage font-medium hover:underline disabled:opacity-50"
            >
              ✦ Fill from my org profile
            </button>
          </div>
        )}

        {!org && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">
            <strong>Tip:</strong> Complete your <a href="/dashboard/profile" className="underline hover:text-amber-900">organisation profile</a> to unlock ✦ Fill from my org profile.
          </p>
        )}

        {/* Search Options toggle */}
        <button
          onClick={() => setOptionsOpen(o => !o)}
          className={`mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border font-semibold text-sm transition-all ${
            optionsOpen || selectedSectors.length > 0 || locationFilter.trim()
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
              : 'border-warm text-mid hover:border-indigo-400 hover:text-indigo-600 bg-white'
          }`}
        >
          <span>🔧</span>
          {selectedSectors.length > 0 || locationFilter.trim()
            ? `Search Options · ${[selectedSectors.length > 0 && `${selectedSectors.length} sector${selectedSectors.length > 1 ? 's' : ''}`, locationFilter.trim() && 'location'].filter(Boolean).join(', ')}`
            : 'Search Options (Location & Sectors)'}
          <span className={`text-xs transition-transform duration-200 inline-block ${optionsOpen ? 'rotate-180' : ''}`}>▼</span>
        </button>

        {/* Collapsible options panel */}
        {optionsOpen && (
          <div className="mt-4 pt-4 border-t border-warm space-y-4">

            {/* Location filter */}
            <div>
              <label className="text-xs font-semibold text-light uppercase tracking-wider block mb-2">
                📍 Location <span className="font-normal normal-case text-mid">(optional — leave blank for UK-wide)</span>
              </label>
              <input
                type="text"
                value={locationFilter}
                onChange={e => setLocationFilter(e.target.value)}
                className="form-input max-w-xs text-sm"
                placeholder='e.g. "Manchester" or "rural Norfolk"'
              />
            </div>

            {/* Sector filter pills */}
            <div>
              <label className="text-xs font-semibold text-light uppercase tracking-wider block mb-2">
                🏷 Sectors <span className="font-normal normal-case text-mid">(select any that apply)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {SECTOR_FILTERS.map(s => (
                  <button
                    key={s.id}
                    onClick={() => toggleSector(s.id)}
                    className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                      selectedSectors.includes(s.id)
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'border-indigo-200 text-indigo-700 hover:bg-indigo-50'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reset */}
            {(selectedSectors.length > 0 || locationFilter.trim()) && (
              <button
                onClick={() => { setSelectedSectors([]); setLocationFilter('') }}
                className="text-xs font-semibold text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded-lg px-3 py-1.5 transition-all"
              >
                ✕ Reset options
              </button>
            )}
          </div>
        )}

        {loading && (
          <div className="mt-4 bg-indigo-50 rounded-lg px-4 py-3 text-sm text-indigo-700">
            🔬 Searching live funding sources, local council programmes and specialist funders… this takes 15–30 seconds.
          </div>
        )}
        {error && (
          <p className="text-red-600 text-xs mt-3">⚠ {error}</p>
        )}
      </div>

      {/* Results */}
      {results && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-bold text-forest text-base flex items-center gap-2">
                {smartMatched ? `Live results for ${org?.name}` : 'Live Research Results'}
                <span className="text-xs font-normal bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                  {results.grants.length} found
                </span>
                {results._cached && (
                  <span className="text-xs font-normal bg-warm text-mid px-2 py-0.5 rounded-full">
                    cached
                  </span>
                )}
              </h3>
              <p className="text-sm text-mid mt-1 max-w-2xl">{results.summary}</p>
            </div>
            <button onClick={() => { setResults(null); setSmartMatched(false); setQuery('') }} className="text-xs text-mid hover:text-charcoal underline flex-shrink-0 ml-4">
              Clear
            </button>
          </div>
          {results.grants.map((g, i) => (
            <DeepGrantCard key={i} grant={g} onAddToPipeline={handleAddToPipeline} />
          ))}
          <p className="text-xs text-light mt-3">
            🔬 Live results are researched in real time. Always verify details on the funder&apos;s website before applying.
          </p>
        </div>
      )}

      {/* Empty / intro state */}
      {!results && !loading && (
        <div>
          {/* How it works cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[
              {
                emoji: '🌐',
                title: 'Searches the live web',
                desc: 'Looks across council websites, NHS commissioning pages, community foundation portals and funder sites — updated in real time.',
                accent: 'from-indigo-500 to-violet-500',
                bg: 'bg-indigo-50',
                border: 'border-indigo-100',
                text: 'text-indigo-900',
                sub: 'text-indigo-700',
              },
              {
                emoji: '📍',
                title: 'Hyper-local results',
                desc: "Finds borough-level programmes, local trust rounds and specialist funders that don't appear in national grant databases.",
                accent: 'from-emerald-500 to-teal-500',
                bg: 'bg-emerald-50',
                border: 'border-emerald-100',
                text: 'text-emerald-900',
                sub: 'text-emerald-700',
              },
              {
                emoji: '✦',
                title: 'Unique results only',
                desc: "Skips grants already in our curated database — every result is a fresh opportunity you won't find in the standard search.",
                accent: 'from-amber-400 to-orange-500',
                bg: 'bg-amber-50',
                border: 'border-amber-100',
                text: 'text-amber-900',
                sub: 'text-amber-700',
              },
            ].map(item => (
              <div key={item.title} className={`${item.bg} border ${item.border} rounded-2xl p-6 flex flex-col gap-4`}>
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${item.accent} flex items-center justify-center text-3xl shadow-md`}>
                  {item.emoji}
                </div>
                <div>
                  <p className={`text-base font-bold ${item.text} mb-2`}>{item.title}</p>
                  <p className={`text-sm ${item.sub} leading-relaxed`}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Example searches */}
          <div className="bg-white rounded-2xl p-5 shadow-card">
            <p className="text-xs font-semibold text-light uppercase tracking-wider mb-3">✦ Try an example search</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_QUERIES.map(q => (
                <button
                  key={q}
                  onClick={() => { setQuery(q); setResults(null) }}
                  className="px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-medium hover:bg-indigo-100 hover:border-indigo-300 transition-all"
                >
                  {q} →
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-forest text-white px-5 py-3.5 rounded-xl shadow-card-lg text-sm z-50 animate-in slide-in-from-bottom-4">
          ✓ {toast}
        </div>
      )}
    </div>
  )
}

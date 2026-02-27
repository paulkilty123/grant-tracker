'use client'

import { useState, useEffect } from 'react'
import { SEED_GRANTS } from '@/lib/grants'
import { formatRange } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { createPipelineItem } from '@/lib/pipeline'
import { getOrganisationByOwner } from '@/lib/organisations'
import { computeMatchScore, scoreColour } from '@/lib/matching'
import { getInteractions, recordInteraction, removeInteraction } from '@/lib/interactions'
import type { GrantOpportunity, Organisation, FunderType } from '@/types'
import type { InteractionAction } from '@/lib/interactions'

const FUNDER_TYPES = [
  { id: 'all',               label: 'All' },
  { id: 'local',             label: '📍 Local' },
  { id: 'lottery',           label: 'Lottery' },
  { id: 'trust_foundation',  label: 'Trust & Foundation' },
  { id: 'corporate',         label: 'Corporate' },
  { id: 'local_authority',   label: 'Local Authority' },
  { id: 'government',        label: 'Government' },
]

interface AIResult {
  grantId: string
  score: number
  reason: string
}

interface DisplayGrant {
  grant: GrantOpportunity
  score: number
  reason: string
  isAiScore: boolean
}

// ── Match Score Badge ────────────────────────────────────────────────────────
function MatchBadge({ score, isAi }: { score: number; isAi: boolean }) {
  const { bg, text } = scoreColour(score)
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${bg}`}>
      <span className="text-sm">{isAi ? '✦' : '●'}</span>
      <span className={`text-xs font-bold ${text}`}>{score}% match</span>
    </div>
  )
}

// ── Score Bar ────────────────────────────────────────────────────────────────
function ScoreBar({ score }: { score: number }) {
  const { bar } = scoreColour(score)
  return (
    <div className="w-full bg-warm rounded-full h-1 mt-1">
      <div
        className={`h-1 rounded-full transition-all duration-500 ${bar}`}
        style={{ width: `${score}%` }}
      />
    </div>
  )
}

// ── Grant Card ───────────────────────────────────────────────────────────────
function GrantCard({ item, hasOrg, interactions, onAddToPipeline, onDismiss, onUndismiss }: {
  item: DisplayGrant
  hasOrg: boolean
  interactions: Set<InteractionAction>
  onAddToPipeline: (g: GrantOpportunity) => void
  onDismiss: (grantId: string) => void
  onUndismiss: (grantId: string) => void
}) {
  const { grant, score, reason, isAiScore } = item
  const [expanded, setExpanded] = useState(false)
  const isDismissed = interactions.has('dismissed')

  const typeColour: Record<string, string> = {
    lottery:             'bg-green-50 text-green-700',
    trust_foundation:    'bg-blue-50 text-blue-700',
    corporate:           'bg-amber-50 text-amber-700',
    local_authority:     'bg-purple-50 text-purple-700',
    housing_association: 'bg-teal-50 text-teal-700',
    government:          'bg-red-50 text-red-700',
  }

  const { text: scoreText } = scoreColour(score)

  if (isDismissed) {
    return (
      <div className="bg-warm/50 rounded-xl px-5 py-3 mb-2 border border-warm flex items-center justify-between opacity-60">
        <p className="text-sm text-mid line-through">{grant.title} — {grant.funder}</p>
        <button onClick={() => onUndismiss(grant.id)} className="text-xs text-sage hover:underline ml-4 flex-shrink-0">
          Undo dismiss
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl p-5 shadow-card mb-3 border border-transparent hover:border-mint transition-all">
      <div className="flex gap-4">
        {/* Left: main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-sage/20 flex items-center justify-center text-sage font-bold text-sm flex-shrink-0">
              {grant.funder[0]}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-bold text-forest text-base leading-snug">{grant.title}</h3>
              <p className="text-sm text-mid">{grant.funder}</p>
            </div>
            {hasOrg && (
              <button
                onClick={() => onDismiss(grant.id)}
                className="text-xs text-light hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
                title="Not relevant — hide this grant"
              >
                ✕ Not relevant
              </button>
            )}
          </div>

          <p className="text-sm text-mid leading-relaxed mb-3">{grant.description}</p>

          {/* Match reason */}
          {hasOrg && reason && (
            <div className="bg-sage/8 border border-sage/20 rounded-lg px-3.5 py-2.5 mb-3 flex items-start gap-2">
              <span className={`text-sm flex-shrink-0 ${scoreText}`}>{isAiScore ? '✦' : '●'}</span>
              <p className="text-sm text-forest leading-snug">{reason}</p>
            </div>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-2">
            {grant.isLocal   && <span className="tag bg-green-50 text-green-700">📍 Local</span>}
            {grant.isRolling && <span className="tag bg-blue-50 text-blue-700">♻ Rolling</span>}
            <span className={`tag ${typeColour[grant.funderType] ?? 'bg-gray-50 text-gray-600'}`}>
              {FUNDER_TYPES.find(t => t.id === grant.funderType)?.label ?? grant.funderType}
            </span>
            {grant.source === 'scraped' && (
              <span className="tag bg-teal-50 text-teal-700">
                {grant.id.startsWith('gov_uk_')   ? '🏛 GOV.UK'
                 : grant.id.startsWith('ukri_')   ? '🔬 UKRI'
                 : grant.id.startsWith('360')      ? '📊 360Giving'
                 : '🌐 Live'}
              </span>
            )}
            {grant.sectors.slice(0, 3).map(s => (
              <span key={s} className="tag bg-purple-50 text-purple-700 capitalize">{s}</span>
            ))}
          </div>

          {/* Expandable eligibility */}
          {expanded && (
            <div className="mt-3 pt-3 border-t border-warm">
              <p className="text-xs font-semibold text-light uppercase tracking-wider mb-2">Eligibility criteria</p>
              <ul className="space-y-1">
                {grant.eligibilityCriteria.map(c => (
                  <li key={c} className="text-sm text-mid flex gap-2">
                    <span className="text-sage flex-shrink-0">✓</span>{c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-sage font-medium mt-2 hover:underline"
          >
            {expanded ? 'Show less ↑' : 'Eligibility criteria ↓'}
          </button>
        </div>

        {/* Right: score + amount + deadline + actions */}
        <div className="flex flex-col items-end gap-3 min-w-[160px] flex-shrink-0">

          {hasOrg && (
            <div className="w-full">
              <MatchBadge score={score} isAi={isAiScore} />
              <ScoreBar score={score} />
            </div>
          )}

          <div className="text-right">
            <p className="font-display text-xl font-bold text-gold">
              {formatRange(grant.amountMin, grant.amountMax)}
            </p>
            <p className="text-xs text-light mt-0.5">Grant range</p>
          </div>

          <div className="text-right">
            <p className="text-xs text-mid">Deadline</p>
            <p className="text-sm font-medium text-charcoal">
              {grant.isRolling ? 'Rolling' : grant.deadline ?? 'Check website'}
            </p>
          </div>

          <div className="flex flex-col gap-1.5 w-full">
            {grant.applyUrl && (
              <a
                href={grant.applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline btn-sm w-full text-center text-xs"
              >
                Visit website →
              </a>
            )}
            <button
              onClick={() => onAddToPipeline(grant)}
              className="btn-gold btn-sm w-full text-center"
            >
              + Pipeline
            </button>
            {hasOrg && (
              <button
                onClick={() => onDismiss(grant.id)}
                className="text-xs text-light hover:text-red-400 transition-colors text-center w-full py-1"
              >
                ✕ Not relevant
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function buildSmartQuery(org: Organisation): string {
  const parts: string[] = []
  if (org.primary_location)      parts.push(org.primary_location)
  if (org.themes?.length)        parts.push(org.themes.slice(0, 3).join(', '))
  if (org.areas_of_work?.length) parts.push(org.areas_of_work.slice(0, 3).join(', '))
  if (org.beneficiaries?.length) parts.push(`for ${org.beneficiaries.slice(0, 2).join(' and ')}`)
  return parts.join(' ')
}

const SIXTY_DAYS_AGO = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
const RECENT_GRANTS  = SEED_GRANTS.filter(g => g.dateAdded && g.dateAdded >= SIXTY_DAYS_AGO).slice(0, 12)

const VALID_FUNDER_TYPES: FunderType[] = [
  'trust_foundation', 'local_authority', 'housing_association',
  'corporate', 'lottery', 'government', 'other',
]

function normaliseScrapedGrant(row: Record<string, unknown>): GrantOpportunity {
  const rawType = String(row.funder_type ?? 'other')
  const funderType: FunderType = VALID_FUNDER_TYPES.includes(rawType as FunderType)
    ? (rawType as FunderType) : 'other'
  return {
    id:                   String(row.external_id ?? row.id),
    title:                String(row.title ?? ''),
    funder:               String(row.funder ?? 'Unknown funder'),
    funderType,
    description:          String(row.description ?? ''),
    amountMin:            typeof row.amount_min  === 'number' ? row.amount_min  : 0,
    amountMax:            typeof row.amount_max  === 'number' ? row.amount_max  : 0,
    deadline:             row.deadline ? String(row.deadline) : null,
    isRolling:            Boolean(row.is_rolling),
    isLocal:              Boolean(row.is_local),
    sectors:              Array.isArray(row.sectors)              ? (row.sectors as string[])              : [],
    eligibilityCriteria:  Array.isArray(row.eligibility_criteria) ? (row.eligibility_criteria as string[]) : [],
    applyUrl:             row.apply_url ? String(row.apply_url) : null,
    source:               'scraped',
    dateAdded:            row.first_seen_at ? String(row.first_seen_at).split('T')[0] : undefined,
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function SearchPage() {
  const [query, setQuery]               = useState('')
  const [activeType, setActiveType]     = useState('all')
  const [aiResults, setAiResults]       = useState<AIResult[] | null>(null)
  const [aiLoading, setAiLoading]       = useState(false)
  const [aiError, setAiError]           = useState<string | null>(null)
  const [smartMatched, setSmartMatched] = useState(false)
  const [toast, setToast]               = useState<string | null>(null)
  const [org, setOrg]                   = useState<Organisation | null>(null)
  const [userId, setUserId]             = useState('')
  const [sortBy, setSortBy]             = useState<'match' | 'amount'>('match')
  const [interactions, setInteractions] = useState<Map<string, Set<InteractionAction>>>(new Map())
  const [showDismissed, setShowDismissed] = useState(false)
  const [scrapedGrants, setScrapedGrants] = useState<GrantOpportunity[]>([])

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('grantSearch')
      if (saved) {
        const { query: q, aiResults: r, activeType: t, smartMatched: sm } = JSON.parse(saved)
        if (q)  setQuery(q)
        if (r)  setAiResults(r)
        if (t)  setActiveType(t)
        if (sm) setSmartMatched(sm)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    try {
      sessionStorage.setItem('grantSearch', JSON.stringify({ query, aiResults, activeType, smartMatched }))
    } catch { /* ignore */ }
  }, [query, aiResults, activeType, smartMatched])

  useEffect(() => {
    async function loadOrg() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const o = await getOrganisationByOwner(user.id)
      setOrg(o)
      if (o) {
        const ix = await getInteractions(o.id)
        setInteractions(ix)
      }
      // Fetch live scraped grants (runs for all users, no auth needed)
      const { data: scraped } = await supabase
        .from('scraped_grants')
        .select('*')
        .eq('is_active', true)
        .order('last_seen_at', { ascending: false })
        .limit(300)
      if (scraped) {
        setScrapedGrants(scraped.map(row => normaliseScrapedGrant(row as Record<string, unknown>)))
      }
    }
    loadOrg()
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleDismiss(grantId: string) {
    if (!org) return
    await recordInteraction(org.id, grantId, 'dismissed')
    setInteractions(prev => {
      const next = new Map(prev)
      const s = new Set(next.get(grantId) ?? [])
      s.add('dismissed')
      next.set(grantId, s)
      return next
    })
  }

  async function handleUndismiss(grantId: string) {
    if (!org) return
    await removeInteraction(org.id, grantId, 'dismissed')
    setInteractions(prev => {
      const next = new Map(prev)
      const s = new Set(next.get(grantId) ?? [])
      s.delete('dismissed')
      next.set(grantId, s)
      return next
    })
  }

  async function handleAddToPipeline(grant: GrantOpportunity) {
    if (!org) { showToast('Complete your profile first to track grants'); return }
    try {
      await createPipelineItem({
        org_id:               org.id,
        grant_name:           grant.title,
        funder_name:          grant.funder,
        funder_type:          grant.funderType,
        amount_min:           grant.amountMin ?? null,
        amount_max:           grant.amountMax ?? null,
        amount_requested:     grant.amountMax ?? null,
        deadline:             grant.isRolling ? null : grant.deadline,
        stage:                'identified',
        notes:                null,
        application_progress: 0,
        is_urgent:            false,
        contact_name:         null,
        contact_email:        null,
        grant_url:            grant.applyUrl ?? null,
        outcome_date:         null,
        outcome_notes:        null,
        created_by:           userId,
      })
      showToast(`"${grant.title}" added to pipeline!`)
    } catch {
      showToast('Failed to add — please try again')
    }
  }

  // ── Merged grant pool ────────────────────────────────────────────────────
  const allGrants = [...SEED_GRANTS, ...scrapedGrants]

  // ── Build display grants ─────────────────────────────────────────────────
  const displayGrants: DisplayGrant[] = (() => {
    const filtered = allGrants.filter(g => {
      const matchesType =
        activeType === 'all'      ? true :
        activeType === 'local'    ? g.isLocal :
        activeType === 'recent'   ? (g.dateAdded != null && g.dateAdded >= SIXTY_DAYS_AGO) :
        activeType === 'scraped'  ? g.source === 'scraped' :
        g.funderType === activeType
      const matchesQuery = !query ||
        g.title.toLowerCase().includes(query.toLowerCase()) ||
        g.funder.toLowerCase().includes(query.toLowerCase()) ||
        g.description.toLowerCase().includes(query.toLowerCase()) ||
        g.sectors.some(s => s.toLowerCase().includes(query.toLowerCase()))
      return matchesQuery && matchesType
    })

    if (aiResults) {
      return aiResults
        .map(r => {
          const grant = allGrants.find(g => g.id === r.grantId)
          if (!grant) return null
          return { grant, score: r.score, reason: r.reason, isAiScore: true }
        })
        .filter((x): x is DisplayGrant => x !== null)
    }

    const withScores: DisplayGrant[] = filtered.map(grant => {
      if (org) {
        const match = computeMatchScore(grant, org)
        return { grant, score: match.score, reason: match.reason, isAiScore: false }
      }
      return { grant, score: 0, reason: '', isAiScore: false }
    })

    if (org && sortBy === 'match') {
      withScores.sort((a, b) => b.score - a.score)
    } else if (sortBy === 'amount') {
      withScores.sort((a, b) => (b.grant.amountMax ?? 0) - (a.grant.amountMax ?? 0))
    }

    return withScores
  })()

  async function runAISearch(searchQuery: string, isSmartMatch = false) {
    setAiLoading(true)
    setAiError(null)
    setSmartMatched(false)

    // ── Pre-filter: only send the most relevant grants to the API ──────────
    // Step 1: keyword match on query terms
    const queryTerms = searchQuery.toLowerCase().split(/\s+/).filter(t => t.length > 2)
    const keywordScored = allGrants.map(g => {
      const text = `${g.title} ${g.funder} ${g.description} ${g.sectors.join(' ')}`.toLowerCase()
      const hits = queryTerms.filter(t => text.includes(t)).length
      return { g, hits }
    })

    // Step 2: combine keyword hits with client-side match score (if org exists)
    const ranked = keywordScored.map(({ g, hits }) => {
      const matchScore = org ? computeMatchScore(g, org).score : 50
      // Weight: keyword hit = 3pts each, match score out of 100
      const combined = hits * 3 + matchScore
      return { g, combined }
    })

    // Step 3: sort by combined score, take top 35
    ranked.sort((a, b) => b.combined - a.combined)
    const preFiltered = ranked.slice(0, 35).map(({ g }) => g)

    const grantsContext = preFiltered.map(g => ({
      id: g.id, title: g.title, funder: g.funder,
      description: g.description, amountMin: g.amountMin, amountMax: g.amountMax,
      sectors: g.sectors, isRolling: g.isRolling, isLocal: g.isLocal,
    }))
    try {
      const response = await fetch('/api/ai-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, grants: grantsContext, org }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error ?? `Request failed (${response.status})`)
      setAiResults(data as AIResult[])
      if (isSmartMatch) setSmartMatched(true)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI search unavailable — showing keyword results instead')
      setAiResults(null)
    } finally {
      setAiLoading(false)
    }
  }

  async function handleAISearch() {
    if (!query.trim()) return
    await runAISearch(query)
  }

  async function handleSmartMatch() {
    if (!org) return
    const smartQuery = buildSmartQuery(org)
    if (!smartQuery) return
    setQuery(smartQuery)
    await runAISearch(smartQuery, true)
  }

  const orgIsIncomplete = org && !org.themes?.length && !org.areas_of_work?.length && !org.primary_location

  return (
    <div>
      <div className="mb-7">
        <h2 className="font-display text-2xl font-bold text-forest">Search Grants</h2>
        <p className="text-mid text-sm mt-1">
          {allGrants.length}+ UK grants{scrapedGrants.length > 0 ? ` · ${scrapedGrants.length} live` : ''} · AI-powered matching ·{' '}
          <a href="/dashboard/deep-search" className="text-indigo-600 hover:underline">
            🔬 Try Advanced Search
          </a>
        </p>
      </div>

      {/* ── Search bar ── */}
      <div className="bg-white rounded-xl p-5 shadow-card mb-5">
        <div className="flex gap-3 mb-4">
          <div className="flex-1 relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-light">🔍</span>
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setAiResults(null) }}
              onKeyDown={e => e.key === 'Enter' && handleAISearch()}
              className="form-input pl-10 pr-36"
              placeholder='e.g. "youth sport funding Manchester"'
            />
            <button
              onClick={handleAISearch}
              disabled={aiLoading || !query.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 btn-primary btn-sm disabled:opacity-50"
            >
              {aiLoading ? '⏳ Thinking…' : '✦ AI Search'}
            </button>
          </div>
          {org && (
            <button
              onClick={handleSmartMatch}
              disabled={aiLoading}
              className="btn-primary btn-sm whitespace-nowrap disabled:opacity-50 flex-shrink-0"
              title={`Match grants tailored to ${org.name}`}
            >
              {aiLoading ? '⏳ Matching…' : '✦ Match my org'}
            </button>
          )}
        </div>

        {/* Filters + sort */}
        <div className="flex gap-2 flex-wrap items-center justify-between">
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs text-mid font-medium">Filter:</span>
            {FUNDER_TYPES.map(t => (
              <button key={t.id} onClick={() => setActiveType(t.id)}
                className={`px-3.5 py-1.5 rounded-full border text-xs font-medium transition-all ${
                  activeType === t.id
                    ? 'bg-forest border-forest text-white'
                    : 'border-warm text-mid hover:border-sage hover:text-sage'
                }`}>
                {t.label}
              </button>
            ))}
            {RECENT_GRANTS.length > 0 && (
              <button onClick={() => setActiveType('recent')}
                className={`px-3.5 py-1.5 rounded-full border text-xs font-medium transition-all ${
                  activeType === 'recent'
                    ? 'bg-green-600 border-green-600 text-white'
                    : 'border-green-300 text-green-700 hover:bg-green-50'
                }`}>
                🆕 Recently Added
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${activeType === 'recent' ? 'bg-white/20' : 'bg-green-100'}`}>
                  {RECENT_GRANTS.length}
                </span>
              </button>
            )}
            {scrapedGrants.length > 0 && (
              <button onClick={() => setActiveType('scraped')}
                className={`px-3.5 py-1.5 rounded-full border text-xs font-medium transition-all ${
                  activeType === 'scraped'
                    ? 'bg-teal-600 border-teal-600 text-white'
                    : 'border-teal-300 text-teal-700 hover:bg-teal-50'
                }`}>
                🌐 Live Grants
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${activeType === 'scraped' ? 'bg-white/20' : 'bg-teal-100'}`}>
                  {scrapedGrants.length}
                </span>
              </button>
            )}
          </div>

          {org && !aiResults && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs text-mid font-medium">Sort:</span>
              <button
                onClick={() => setSortBy('match')}
                className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                  sortBy === 'match' ? 'bg-forest border-forest text-white' : 'border-warm text-mid hover:border-sage'
                }`}
              >
                Best match
              </button>
              <button
                onClick={() => setSortBy('amount')}
                className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                  sortBy === 'amount' ? 'bg-forest border-forest text-white' : 'border-warm text-mid hover:border-sage'
                }`}
              >
                Largest first
              </button>
            </div>
          )}
        </div>

        {!org && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">
            <strong>Tip:</strong> Complete your{' '}
            <a href="/dashboard/profile" className="underline hover:text-amber-900">organisation profile</a>{' '}
            to unlock match scores and the ✦ Match my org button.
          </p>
        )}
        {orgIsIncomplete && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">
            <strong>Tip:</strong> Your profile is missing themes, location or areas of work —{' '}
            <a href="/dashboard/profile" className="underline hover:text-amber-900">add more detail</a>{' '}
            to improve your match scores.
          </p>
        )}
        {aiError && <p className="text-amber-600 text-xs mt-3">⚠ {aiError}</p>}
      </div>

      {/* ── GOV.UK banner ── */}
      <div className="bg-forest/5 border border-forest/20 rounded-xl px-5 py-3.5 mb-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-forest">🏛 Looking for government grants?</p>
          <p className="text-xs text-mid mt-0.5">GOV.UK Find a Grant lists 100+ open government funding programmes</p>
        </div>
        <a
          href="https://www.find-government-grants.service.gov.uk/grants"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-outline btn-sm whitespace-nowrap"
        >
          Search GOV.UK →
        </a>
      </div>

      {/* ── Results header ── */}
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm text-mid">
          {aiResults && smartMatched ? (
            <><strong className="text-forest">✦ {displayGrants.length}</strong> grants matched for <strong className="text-forest">{org?.name}</strong></>
          ) : aiResults ? (
            <><strong className="text-forest">✦ {displayGrants.length}</strong> AI-ranked results for &ldquo;{query}&rdquo;</>
          ) : (
            <>
              Showing <strong className="text-forest">{displayGrants.length}</strong>{' '}
              {activeType === 'recent' ? 'recently added grants' : `grants${query ? ` matching "${query}"` : ''}`}
              {org && !aiResults && <span className="text-sage font-medium"> · sorted by match score</span>}
            </>
          )}
        </p>
        {aiResults && (
          <button
            onClick={() => { setAiResults(null); setSmartMatched(false); setQuery('') }}
            className="text-xs text-mid hover:text-charcoal underline"
          >
            Clear AI results
          </button>
        )}
      </div>

      {/* ── Grant list ── */}
      {(() => {
        const dismissedCount = displayGrants.filter(d => interactions.get(d.grant.id)?.has('dismissed')).length
        const visibleGrants = showDismissed ? displayGrants : displayGrants.filter(d => !interactions.get(d.grant.id)?.has('dismissed'))

        if (visibleGrants.length === 0 && dismissedCount === 0) return (
          <div className="text-center py-16 text-light">
            <p className="text-4xl mb-3">🔍</p>
            <p className="mb-3">No grants found — try different keywords or clear the filter.</p>
            <a href="/dashboard/deep-search" className="text-indigo-600 text-sm hover:underline">
              Try 🔬 Advanced Search for live opportunities →
            </a>
          </div>
        )

        return (
          <>
            {visibleGrants.map(item => (
              <GrantCard
                key={item.grant.id}
                item={item}
                hasOrg={!!org}
                interactions={interactions.get(item.grant.id) ?? new Set()}
                onAddToPipeline={handleAddToPipeline}
                onDismiss={handleDismiss}
                onUndismiss={handleUndismiss}
              />
            ))}
            {dismissedCount > 0 && (
              <button
                onClick={() => setShowDismissed(p => !p)}
                className="w-full text-xs text-mid hover:text-charcoal py-3 border border-dashed border-warm rounded-xl mt-2 transition-colors"
              >
                {showDismissed
                  ? `Hide ${dismissedCount} dismissed grant${dismissedCount === 1 ? '' : 's'} ↑`
                  : `Show ${dismissedCount} dismissed grant${dismissedCount === 1 ? '' : 's'} ↓`}
              </button>
            )}
          </>
        )
      })()}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-forest text-white px-5 py-3.5 rounded-xl shadow-card-lg text-sm z-50">
          ✓ {toast}
        </div>
      )}
    </div>
  )
}

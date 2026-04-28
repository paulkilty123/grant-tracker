'use client'
import React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  RefreshCw, ExternalLink, Pencil, Check, X,
  AlertTriangle, CheckCircle, Clock, Database, Trash2, Mail, Search,
  ChevronDown, ChevronRight, Plus, Tag, Link, Sparkles, Brain, BookOpen, PlusCircle, MapPin,
} from 'lucide-react'
import { SEED_GRANTS } from '@/lib/grants'
import { parseOpenDate } from '@/lib/parse-open-date'
import { SUBTYPES_BY_FUNDING_TYPE, SUBTYPE_LABELS } from '@/lib/funding-subtypes'
import type { FundingType } from '@/types'

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

// ── Types ──────────────────────────────────────────────────────────────────────

type Grant = {
  id: string
  title: string
  funder: string | null
  apply_url: string | null
  url_status: 'unchecked' | 'ok' | 'dead'
  url_last_checked: string | null
  source: string
  is_invite_only: boolean
  funder_type?: string
  funding_type?: string
  funder_brief?: Record<string, string | null> | null
  grant_sources?: Array<{ label: string; url?: string; text?: string }> | null
  description?: string | null
  location_tag?: string | null
  amount_min?: number | null
  amount_max?: number | null
  deadline?: string | null
  is_rolling?: boolean
  eligible_structures?: string[] | null
}

type CategoryGrant = Grant & {
  funder_type: string
  is_seed: boolean
}

type Stats = { total: number; withUrl: number; ok: number; dead: number; unchecked: number; noUrl: number; seedTotal?: number; newCount?: number; reviewCount?: number; suspiciousCount?: number }
type Filter = 'dead' | 'unchecked' | 'no_url' | 'all' | 'seed' | 'new' | 'category' | 'review' | 'suspicious' | 'url_issues' | 'saved' | 'recent'
type SuspiciousGrant = Grant & { url_quality_score: number | null; url_quality_issues: string[] }
type DeadSeedGrant = { id: string; title: string; funder: string; url: string }
type NewGrant = Grant & { first_seen_at: string }

type AddGrantForm = {
  title: string
  funder: string
  funder_type: string
  funding_type: string
  funding_subtype: string
  apply_url: string
  description: string
  amount_min: string
  amount_max: string
  deadline: string
  is_rolling: boolean
  is_invite_only: boolean
  next_open_date: string
  sectors: string
  location_tag: string
  is_local: boolean
}

// ── Category label/colour map ──────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; colour: string; bg: string; border: string }> = {
  trust_foundation:  { label: 'Trusts & Foundations', colour: 'text-forest',    bg: 'bg-forest/5',    border: 'border-forest/20'    },
  capacity_builder:  { label: 'Capacity Builders',    colour: 'text-emerald-700',bg: 'bg-emerald-50', border: 'border-emerald-200'  },
  corporate:         { label: 'Corporate',            colour: 'text-blue-600',  bg: 'bg-blue-50',     border: 'border-blue-200'     },
  government:        { label: 'Government',           colour: 'text-amber-deep',bg: 'bg-amber-pale',   border: 'border-amber-mid'   },
  lottery:           { label: 'Lottery',              colour: 'text-amber-600', bg: 'bg-amber-50',    border: 'border-amber-200'    },
  housing_association:{ label: 'Housing Associations',colour: 'text-teal-600',  bg: 'bg-teal-50',     border: 'border-teal-200'     },
  local_authority:   { label: 'Local Authorities',   colour: 'text-orange-600',bg: 'bg-orange-50',   border: 'border-orange-200'   },
  competition:       { label: 'Competitions & Awards',colour: 'text-coral-deep',  bg: 'bg-coral-pale',     border: 'border-coral-mid'     },
  loan:              { label: 'Loans & Social Finance',colour:'text-blue-deep',bg: 'bg-blue-pale',   border: 'border-blue-mid'   },
  crowdfund_match:   { label: 'Crowdfund Match',      colour: 'text-amber-deep',  bg: 'bg-amber-pale',     border: 'border-amber-mid'     },
  other:             { label: 'Other',                colour: 'text-mid',       bg: 'bg-warm/30',     border: 'border-warm'         },
}

const CATEGORY_ORDER = ['trust_foundation','capacity_builder','corporate','government','lottery','housing_association','local_authority','competition','loan','crowdfund_match','other']

const FUNDER_TYPE_OPTIONS = [
  { value: 'trust_foundation',    label: 'Trust / Foundation' },
  { value: 'community_foundation',label: 'Community Foundation' },
  { value: 'corporate_foundation',label: 'Corporate Foundation' },
  { value: 'capacity_builder',    label: 'Capacity Builder' },
  { value: 'corporate',           label: 'Corporate' },
  { value: 'government',          label: 'Government' },
  { value: 'lottery',             label: 'Lottery' },
  { value: 'housing_association', label: 'Housing Association' },
  { value: 'local_authority',     label: 'Local Authority' },
  { value: 'competition',         label: 'Competition / Award' },
  { value: 'loan',                label: 'Loan / Social Finance' },
  { value: 'crowdfund_match',     label: 'Crowdfund Match' },
  { value: 'other',               label: 'Other' },
]

const FUNDING_TYPE_OPTIONS = [
  { value: 'grant',      label: 'Grant' },
  { value: 'programme',  label: 'Programme' },
  { value: 'investment', label: 'Investment' },
  { value: 'in_kind',    label: 'In-Kind' },
]

const BLANK_FORM: AddGrantForm = {
  title: '', funder: '', funder_type: 'trust_foundation', funding_type: 'grant', funding_subtype: '', apply_url: '',
  description: '', amount_min: '', amount_max: '', deadline: '',
  is_rolling: true, is_invite_only: false, next_open_date: '', sectors: '',
  location_tag: '', is_local: false,
}

// ── Component ──────────────────────────────────────────────────────────────────


function SavedForLaterTab() {
  const [grants, setGrants] = useState<(Grant & { description?: string; funding_type?: string })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    createClient()
      .from('scraped_grants')
      .select('id, title, funder, apply_url, url_status, url_last_checked, source, is_invite_only, funder_brief, grant_sources, description, funder_type, funding_type')
      .eq('is_active', false)
      .eq('saved_for_later', true)
      .order('title')
      .then(({ data }) => { setGrants((data ?? []) as (Grant & { description?: string; funding_type?: string })[]); setLoading(false) })
  }, [])

  const FT_STYLE: Record<string, { bg: string; color: string; label: string }> = {
    grant:      { bg: 'rgba(132,204,22,0.15)', color: '#639922', label: 'Grant' },
    programme:  { bg: 'rgba(251,146,60,0.15)', color: '#993C1D', label: 'Programme' },
    investment: { bg: 'rgba(96,165,250,0.15)', color: '#0C447C', label: 'Investment' },
    in_kind:    { bg: 'rgba(167,139,250,0.15)', color: '#BA7517', label: 'In-Kind' },
  }

  if (loading) return <div className="py-12 text-center text-sm text-mid">Loading…</div>
  if (grants.length === 0) return (
    <div className="py-16 text-center">
      <p className="text-mid text-sm">Nothing saved for later yet.</p>
      <p className="text-xs text-light mt-1">Use "Save for later" in the Needs Review tab to add entries here.</p>
    </div>
  )

  return (
    <div className="overflow-x-auto">
      <p className="text-xs text-mid px-5 py-3 bg-amber-50 border-b border-amber-100">
        <strong>{grants.length} saved</strong> — funders or opportunities to revisit when they open a new round.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-warm bg-warm/30 text-left text-xs font-semibold text-mid uppercase tracking-wider">
            <th className="px-5 py-3">Grant / Funder</th>
            <th className="px-5 py-3">Description</th>
            <th className="px-5 py-3">URL</th>
            <th className="px-5 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-warm/60">
          {grants.map(grant => {
            const ft = grant.funding_type
            const ftStyle = ft ? (FT_STYLE[ft] ?? { bg: '#f3f4f6', color: '#5F5E5A', label: ft }) : null
            return (
              <tr key={grant.id} id={`grant-row-${grant.id}`} className="hover:bg-cream/50 transition-colors">
                <td className="px-5 py-3 max-w-[200px]">
                  <p className="font-medium text-charcoal leading-snug line-clamp-2">{grant.title}</p>
                  <p className="text-xs text-mid mt-0.5">{grant.funder}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <span className="rounded-full bg-warm px-2 py-0.5 text-[10px] text-mid">{grant.source}</span>
                    {ftStyle && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: ftStyle.bg, color: ftStyle.color }}>{ftStyle.label}</span>}
                  </div>
                </td>
                <td className="px-5 py-3 max-w-[280px]">
                  <p className="text-xs text-mid line-clamp-3">{grant.description ?? ''}</p>
                </td>
                <td className="px-5 py-3 max-w-[200px]">
                  {grant.apply_url
                    ? <a href={grant.apply_url} target="_blank" rel="noopener noreferrer" className="text-xs text-forest underline break-all line-clamp-2">{grant.apply_url}</a>
                    : <span className="text-xs italic text-light">No URL</span>}
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-2 flex-wrap">
                    <button onClick={async () => { await fetch('/api/admin/update-grant', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: grant.id, fields: { saved_for_later: false } }) }); setGrants(prev => prev.filter(g => g.id !== grant.id)) }}
                      className="rounded-full border border-warm px-3 py-1 text-xs font-semibold text-mid hover:border-forest hover:text-forest transition-colors whitespace-nowrap">
                      Back to review
                    </button>
                    <button onClick={async () => { await fetch('/api/admin/update-grant', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: grant.id, fields: { is_active: true, url_status: 'ok', saved_for_later: false } }) }); setGrants(prev => prev.filter(g => g.id !== grant.id)) }}
                      className="rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest hover:bg-forest hover:text-white transition-colors">
                      Approve
                    </button>
                    <button onClick={async () => { await fetch('/api/admin/update-grant', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: grant.id, fields: { url_status: 'dead', saved_for_later: false } }) }); setGrants(prev => prev.filter(g => g.id !== grant.id)) }}
                      className="rounded-full bg-coral-pale px-3 py-1 text-xs font-semibold text-coral-saturated hover:bg-coral-pale0 hover:text-white transition-colors">
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function UrlAdminPage() {
  const router = useRouter()
  const [authorised, setAuthorised] = useState<boolean | null>(null)
  const [stats, setStats]           = useState<Stats | null>(null)
  const [grants, setGrants]         = useState<Grant[]>([])
  const searchParams                = useSearchParams()
  const focusId                     = searchParams.get('focus')
  const [filter, setFilter]         = useState<Filter>(focusId ? 'recent' : 'dead')
  const [running, setRunning]       = useState(false)
  const [runResult, setRunResult]   = useState<{ ok: number; dead: number; deadSeedGrants: DeadSeedGrant[] } | null>(null)
  const [validationProgress, setValidationProgress] = useState<{ checked: number; total: number; ok: number; dead: number } | null>(null)
  const [promotingSeeds, setPromotingSeeds]   = useState(false)
  const [promoteResult, setPromoteResult]     = useState<{ inserted: number; skipped: number; message: string } | null>(null)
  const [promotedKeys, setPromotedKeys]       = useState<Set<string>>(new Set())
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [editUrl, setEditUrl]       = useState('')
  const [saving, setSaving]         = useState(false)
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null)
  const [editTitleValue, setEditTitleValue] = useState('')
  const [savingTitle, setSavingTitle]       = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds]         = useState<Set<string>>(new Set())
  const [batchDeleting, setBatchDeleting]     = useState(false)
  const [search, setSearch]                   = useState('')
  const [loadError, setLoadError]             = useState<string | null>(null)
  const [newGrants, setNewGrants]             = useState<NewGrant[]>([])
  const [newSources, setNewSources]           = useState<Set<string>>(new Set())
  const [reviewGrants, setReviewGrants]       = useState<Grant[]>([])
  const [recentGrants, setRecentGrants]       = useState<Grant[]>([])
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null)
  const [reviewEdits, setReviewEdits]           = useState<Record<string, Record<string, string | boolean | number | null>>>({})
  const [reviewPublishing, setReviewPublishing] = useState<Record<string, boolean>>({})
  const [reviewEnrichError, setReviewEnrichError] = useState<Record<string, string>>({})
  const [reviewSources, setReviewSources]       = useState<Record<string, {label:string;url:string;text:string}[]>>({})
  const [reviewSourcesOpen, setReviewSourcesOpen] = useState<Record<string, boolean>>({})
  const [approvingAll, setApprovingAll]       = useState(false)

  // Category view state
  const [categoryGrants, setCategoryGrants]       = useState<CategoryGrant[]>([])
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [categorySearch, setCategorySearch]         = useState('')
  const [promotingId, setPromotingId]               = useState<string | null>(null)

  // Suspicious / audit state
  const [suspiciousGrants, setSuspiciousGrants] = useState<SuspiciousGrant[]>([])
  const [auditing, setAuditing]                 = useState(false)
  const [auditProgress, setAuditProgress]       = useState<{ checked: number; total: number; avgScore: number; dead: number; closed: number } | null>(null)

  // Classify state
  const [classifying, setClassifying]           = useState(false)
  const [classifyProgress, setClassifyProgress] = useState<{ classified: number; total: number; failed: number } | null>(null)
  const [classifyResult, setClassifyResult]     = useState<{ classified: number; failed: number } | null>(null)

  // Funding type sub-tab (visible when filter === 'all')
  const [fundingTypeTab, setFundingTypeTab] = useState<'all' | 'grant' | 'programme' | 'investment' | 'in_kind'>('all')
  const [fundingTypeCounts, setFundingTypeCounts] = useState<Record<string, number>>({})

  // Add grant modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm]           = useState<AddGrantForm>(BLANK_FORM)
  const [addSaving, setAddSaving]       = useState(false)
  const [addError, setAddError]         = useState<string | null>(null)

  // URL-populate state (Add modal)
  const [fetchUrl, setFetchUrl]         = useState('')
  const [fetching, setFetching]         = useState(false)
  const [fetchError, setFetchError]     = useState<string | null>(null)
  const [fetchedFrom, setFetchedFrom]   = useState<string | null>(null)

  // Refresh grant info state
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [refreshModal, setRefreshModal] = useState<{
    grantId: string
    grantTitle: string
    grantUrl: string
    urlImproved?: boolean
    urlWasDead?: boolean
    form: AddGrantForm
  } | null>(null)
  const [refreshSaving, setRefreshSaving]           = useState(false)
  const [refreshError, setRefreshError]             = useState<string | null>(null)
  const [populatingFromUrl, setPopulatingFromUrl]   = useState(false)
  const [populateMsg, setPopulateMsg]               = useState<string | null>(null)

  // Funder intelligence enrichment (inline, from Grant Manager)
  const [enrichingId, setEnrichingId] = useState<string | null>(null)

  // Bulk enrichment
  const [bulkEnriching, setBulkEnriching]     = useState(false)
  const [bulkEnrichDone, setBulkEnrichDone]   = useState(0)
  const [bulkEnrichTotal, setBulkEnrichTotal] = useState(0)
  const [bulkEnrichLog, setBulkEnrichLog]     = useState<string[]>([])

  // ── Auth check ───────────────────────────────────────────────────────────────
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      setAuthorised(data.user?.email === ADMIN_EMAIL)
    })
  }, [])

  // ── Load stats ───────────────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const [{ data }, { count: newCount }, { count: reviewCount }, { count: suspiciousCount }, { data: ftData }] = await Promise.all([
      createClient().from('scraped_grants').select('url_status, apply_url').eq('is_active', true),
      createClient().from('scraped_grants').select('id', { count: 'exact', head: true }).eq('is_active', true).gte('first_seen_at', sevenDaysAgo),
      createClient().from('scraped_grants').select('id', { count: 'exact', head: true }).eq('is_active', false).neq('url_status', 'dead').not('saved_for_later', 'is', 'true'),
      createClient().from('scraped_grants').select('id', { count: 'exact', head: true }).eq('is_active', true).not('url_quality_score', 'is', null).lt('url_quality_score', 60),
      createClient().from('scraped_grants').select('funding_type').eq('is_active', true),
    ])
    if (!data) return
    // Tally funding type counts from the raw rows
    const ftCounts: Record<string, number> = {}
    for (const row of (ftData ?? [])) {
      const t = (row.funding_type as string) ?? 'grant'
      ftCounts[t] = (ftCounts[t] ?? 0) + 1
    }
    setFundingTypeCounts(ftCounts)
    setStats({
      total:       data.length,
      withUrl:     data.filter(g => g.apply_url).length,
      ok:          data.filter(g => g.url_status === 'ok').length,
      dead:        data.filter(g => g.url_status === 'dead').length,
      unchecked:   data.filter(g => g.url_status === 'unchecked' && g.apply_url).length,
      noUrl:       data.filter(g => !g.apply_url).length,
      seedTotal:   0,
      newCount:    newCount ?? 0,
      reviewCount: reviewCount ?? 0,
      suspiciousCount: suspiciousCount ?? 0,
    })
  }, [])

  // ── Load set of seed grants that already exist in the DB (promoted) ─────────
  const loadPromotedKeys = useCallback(async () => {
    const { data } = await createClient()
      .from('scraped_grants')
      .select('title, funder')
      .limit(10000)
    setPromotedKeys(new Set((data ?? []).map(g => `${g.title}||${g.funder}`)))
  }, [])

  // ── Load scraped grants (URL health views) ───────────────────────────────────
  const loadGrants = useCallback(async () => {
    if (filter === 'seed' || filter === 'new' || filter === 'category' || filter === 'review' || filter === 'suspicious') return
    // url_issues = dead + unchecked + no_url combined
    if (filter === 'url_issues') {
      const { data, error } = await createClient()
        .from('scraped_grants')
        .select('id, title, funder, apply_url, url_status, url_last_checked, source, is_invite_only, funding_type, funder_type, funder_brief, grant_sources, description, location_tag, amount_min, amount_max, deadline, is_rolling, eligible_structures')
        .eq('is_active', true)
        .or('url_status.eq.dead,and(url_status.eq.unchecked,apply_url.not.is.null),apply_url.is.null')
        .order('url_status', { ascending: true })
        .limit(2000)
      if (error) { setLoadError(`Query failed: ${error.message}`); setGrants([]); return }
      setLoadError(null); setGrants((data ?? []) as Grant[])
      return
    }

    let query = createClient()
      .from('scraped_grants')
      .select('id, title, funder, apply_url, url_status, url_last_checked, source, is_invite_only, funding_type, funder_type, funder_brief, grant_sources, description, location_tag, amount_min, amount_max, deadline, is_rolling, eligible_structures')
      .eq('is_active', true)
      .order('url_last_checked', { ascending: true, nullsFirst: true })
      .limit(2000)

    if (filter === 'dead')      query = query.eq('url_status', 'dead')
    if (filter === 'unchecked') query = query.eq('url_status', 'unchecked').not('apply_url', 'is', null)
    if (filter === 'no_url')    query = query.is('apply_url', null)
    if (filter === 'all' && fundingTypeTab !== 'all') query = query.eq('funding_type', fundingTypeTab)

    if (search.trim()) {
      query = query.or(`title.ilike.%${search.trim()}%,funder.ilike.%${search.trim()}%`)
    }

    const { data, error } = await query
    if (error) {
      console.error('loadGrants error:', error)
      setLoadError(`Query failed: ${error.message}`)
      setGrants([])
      return
    }
    setLoadError(null)
    setGrants((data ?? []) as Grant[])
  }, [filter, search, fundingTypeTab])

  // ── Load new grants (last 7 days) ────────────────────────────────────────────
  const loadNewGrants = useCallback(async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data } = await createClient()
      .from('scraped_grants')
      .select('id, title, funder, apply_url, url_status, url_last_checked, source, is_invite_only, funder_brief, grant_sources, first_seen_at')
      .eq('is_active', true)
      .gte('first_seen_at', sevenDaysAgo)
      .order('first_seen_at', { ascending: false })
      .limit(500)

    if (!data || data.length === 0) { setNewGrants([]); setNewSources(new Set()); return }

    const uniqueSources = Array.from(new Set(data.map(g => g.source).filter(Boolean)))
    const { data: knownSourceRows } = await createClient()
      .from('scraped_grants')
      .select('source')
      .lt('first_seen_at', sevenDaysAgo)
      .in('source', uniqueSources)

    const knownSources = new Set((knownSourceRows ?? []).map(r => r.source))
    const brandNewSources = new Set(uniqueSources.filter(s => !knownSources.has(s)))

    setNewGrants(data as NewGrant[])
    setNewSources(brandNewSources)
  }, [])

  // ── Load review queue (inactive grants awaiting approval) ─────────────────────
  const loadReviewGrants = useCallback(async () => {
    if (filter !== 'review') return
    const { data } = await createClient()
      .from('scraped_grants')
      .select('id, title, funder, apply_url, url_status, url_last_checked, source, is_invite_only, funder_brief, grant_sources, description, funder_type, funding_type')
      .eq('is_active', false)
      .neq('url_status', 'dead').not('saved_for_later', 'is', 'true')  // exclude hidden and saved-for-later
      .order('last_seen_at', { ascending: false })
      .limit(500)
    const grants = (data ?? []) as Grant[]
    setReviewGrants(grants)
    // Pre-populate sources panel from any previously saved grant_sources
    setReviewSources(prev => {
      const next = { ...prev }
      for (const g of grants) {
        if (g.grant_sources && g.grant_sources.length > 0 && !next[g.id]) {
          next[g.id] = g.grant_sources.map(s => ({
            label: s.label ?? '',
            url: s.url ?? '',
            text: s.text ?? '',
          }))
        }
      }
      return next
    })
  }, [filter])

  // ── Load recently-activated grants (last 21 days, for review sweep) ─────────
  // Surfaced as the "Recently activated" tab so the admin can spot-check
  // grants that may have lost manual edits to the historical publish bug.
  const loadRecentGrants = useCallback(async () => {
    if (filter !== 'recent') return
    const since = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()
    const { data } = await createClient()
      .from('scraped_grants')
      .select('id, title, funder, apply_url, url_status, url_last_checked, source, is_invite_only, funder_brief, grant_sources, description, location_tag, amount_min, amount_max, deadline, is_rolling, eligible_structures, funder_type, funding_type, first_seen_at, impact_sectors, target_beneficiaries')
      .eq('is_active', true)
      .gte('first_seen_at', since)
      .order('first_seen_at', { ascending: false })
      .limit(300)
    setRecentGrants((data ?? []) as Grant[])
  }, [filter])

  // ── Load suspicious grants (low quality score) ───────────────────────────────
  const loadSuspiciousGrants = useCallback(async () => {
    if (filter !== 'suspicious') return
    const { data } = await createClient()
      .from('scraped_grants')
      .select('id, title, funder, apply_url, url_status, url_last_checked, source, is_invite_only, funder_brief, grant_sources, url_quality_score, url_quality_issues')
      .eq('is_active', true)
      .not('url_quality_score', 'is', null)
      .lt('url_quality_score', 60)
      .order('url_quality_score', { ascending: true })
      .limit(500)
    setSuspiciousGrants((data ?? []) as SuspiciousGrant[])
  }, [filter])

  // ── Approve all pending review grants ─────────────────────────────────────────
  async function approveAllReview() {
    if (!confirm(`Approve all ${reviewGrants.length} pending grants and make them live?`)) return
    setApprovingAll(true)
    try {
      // Batch approve in groups of 50 to avoid URL length limits
      const ids = reviewGrants.map(g => g.id)
      for (let i = 0; i < ids.length; i += 50) {
        await fetch('/api/admin/update-grant', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: ids.slice(i, i + 50), fields: { is_active: true } }),
        })
      }
      setReviewGrants([])
      await loadStats()
    } finally {
      setApprovingAll(false)
    }
  }

  // ── Approve a single review grant ─────────────────────────────────────────────
  async function approveGrant(id: string) {
    await fetch('/api/admin/update-grant', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, fields: { is_active: true } }),
    })
    setReviewGrants(prev => prev.filter(g => g.id !== id))
    await loadStats()

  }


  function getReviewVal(id: string, field: string, fallback: string | boolean | number | null) {
    return reviewEdits[id]?.[field] !== undefined ? reviewEdits[id][field] : fallback
  }
  function setReviewField(id: string, field: string, value: string | boolean | number | null) {
    setReviewEdits(s => ({ ...s, [id]: { ...(s[id] ?? {}), [field]: value } }))
  }
  function addReviewSource(id: string) {
    setReviewSources(s => ({ ...s, [id]: [...(s[id] ?? []), { label: '', url: '', text: '' }] }))
  }
  function updateReviewSource(id: string, idx: number, field: 'label'|'url'|'text', value: string) {
    setReviewSources(s => { const a = [...(s[id] ?? [])]; a[idx] = { ...a[idx], [field]: value }; return { ...s, [id]: a } })
  }
  function removeReviewSource(id: string, idx: number) {
    setReviewSources(s => { const a = [...(s[id] ?? [])]; a.splice(idx,1); return { ...s, [id]: a } })
  }

  // Save edits for an already-approved grant (no approval flip)
  async function saveGrantEdits(grant: Grant) {
    const edits = reviewEdits[grant.id] ?? {}
    if (Object.keys(edits).length === 0) { setExpandedReviewId(null); return }
    setReviewPublishing(s => ({ ...s, [grant.id]: true }))
    const fields: Record<string, unknown> = {}
    if (edits.funder_type  !== undefined) fields.funder_type  = edits.funder_type
    if (edits.funding_type !== undefined) fields.funding_type = edits.funding_type
    if (edits.amount_min   !== undefined) fields.amount_min   = edits.amount_min ? parseInt(String(edits.amount_min).replace(/[^0-9]/g,'')) : null
    if (edits.amount_max   !== undefined) fields.amount_max   = edits.amount_max ? parseInt(String(edits.amount_max).replace(/[^0-9]/g,'')) : null
    if (edits.deadline     !== undefined) fields.deadline     = edits.deadline || null
    if (edits.is_rolling   !== undefined) fields.is_rolling   = edits.is_rolling
    if (edits.location_tag !== undefined) fields.location_tag = edits.location_tag || null
    if (edits.is_invite_only !== undefined) fields.is_invite_only = edits.is_invite_only
    if (edits.description  !== undefined) fields.description  = edits.description || null
    if (edits.eligible_structures !== undefined) {
      try {
        let structs: string[] = JSON.parse(String(edits.eligible_structures))
        if (structs.includes('social_enterprise_broad')) {
          structs = structs.filter(s => s !== 'social_enterprise_broad')
          const se = ['cic_guarantee','cic_shares','ltd_guarantee','ltd_shares','cooperative']
          se.forEach(s => { if (!structs.includes(s)) structs.push(s) })
        }
        fields.eligible_structures = structs
      } catch { /* ignore */ }
    }
    if (Object.keys(fields).length > 0) {
      // Browser anon client is blocked by RLS — go through the admin API
      // (service-role key) so the update actually lands.
      const res = await fetch('/api/admin/update-grant', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: grant.id, fields }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error('saveGrantEdits failed:', err)
        setReviewPublishing(s => ({ ...s, [grant.id]: false }))
        alert(`Save failed: ${err.error ?? res.statusText}`)
        return
      }
      // Reflect edits in every list-state that might hold this grant so the
      // row visually updates regardless of which tab the user saved from.
      const merge = (g: Grant) => g.id === grant.id ? { ...g, ...fields } as Grant : g
      setGrants(prev => prev.map(merge))
      setRecentGrants(prev => prev.map(merge))
      setCategoryGrants(prev => prev.map(g => g.id === grant.id ? { ...g, ...fields } as CategoryGrant : g))
      setReviewGrants(prev => prev.map(merge))
      setReviewEdits(s => { const n = { ...s }; delete n[grant.id]; return n })
    }
    setReviewPublishing(s => ({ ...s, [grant.id]: false }))
    setExpandedReviewId(null)
  }

  async function publishReviewGrant(grant: Grant) {
    setReviewPublishing(s => ({ ...s, [grant.id]: true }))
    // Save any edits first
    const edits = reviewEdits[grant.id] ?? {}
    if (Object.keys(edits).length > 0) {
      const fields: Record<string, unknown> = {}
      if (edits.funder_type    !== undefined) fields.funder_type     = edits.funder_type
      if (edits.funding_type   !== undefined) fields.funding_type    = edits.funding_type
      if (edits.amount_min     !== undefined) fields.amount_min      = edits.amount_min ? parseInt(String(edits.amount_min).replace(/[^0-9]/g,'')) : null
      if (edits.amount_max     !== undefined) fields.amount_max      = edits.amount_max ? parseInt(String(edits.amount_max).replace(/[^0-9]/g,'')) : null
      if (edits.deadline       !== undefined) fields.deadline        = edits.deadline || null
      if (edits.is_rolling     !== undefined) fields.is_rolling      = edits.is_rolling
      if (edits.location_tag   !== undefined) fields.location_tag    = edits.location_tag || null
      if (edits.is_invite_only !== undefined) fields.is_invite_only  = edits.is_invite_only
      if (edits.description    !== undefined) fields.description     = edits.description || null
      if (edits.eligible_structures !== undefined) {
        try {
          let structs: string[] = JSON.parse(String(edits.eligible_structures))
          if (structs.includes('social_enterprise_broad')) {
            structs = structs.filter(s => s !== 'social_enterprise_broad')
            const se = ['cic_guarantee','cic_shares','ltd_guarantee','ltd_shares','cooperative']
            se.forEach(s => { if (!structs.includes(s)) structs.push(s) })
          }
          fields.eligible_structures = structs
        } catch { /* ignore */ }
      }
      if (edits.impact_sectors       !== undefined) { try { fields.impact_sectors       = JSON.parse(String(edits.impact_sectors))       } catch { /* ignore */ } }
      if (edits.target_beneficiaries !== undefined) { try { fields.target_beneficiaries = JSON.parse(String(edits.target_beneficiaries)) } catch { /* ignore */ } }
      if (Object.keys(fields).length > 0) {
        // Browser anon client is blocked by RLS — go through the admin API.
        const res = await fetch('/api/admin/update-grant', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: grant.id, fields }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          console.error('publishReviewGrant edits failed:', err)
          setReviewPublishing(s => ({ ...s, [grant.id]: false }))
          alert(`Save failed: ${err.error ?? res.statusText}`)
          return
        }
        const merge = (g: Grant) => g.id === grant.id ? { ...g, ...fields } as Grant : g
        setGrants(prev => prev.map(merge))
        setRecentGrants(prev => prev.map(merge))
        setCategoryGrants(prev => prev.map(g => g.id === grant.id ? { ...g, ...fields } as CategoryGrant : g))
        setReviewGrants(prev => prev.map(merge))
        setReviewEdits(s => { const n = { ...s }; delete n[grant.id]; return n })
      }
    }
    // Activate
    await approveGrant(grant.id)
    setReviewPublishing(s => ({ ...s, [grant.id]: false }))
    setExpandedReviewId(null)
  }

  // ── Load category grants (all grants, grouped by funder type) ────────────────
  const loadCategoryGrants = useCallback(async () => {
    if (filter !== 'category') return

    // Load active grants for display, plus ALL grants (inc. inactive) for deduplication
    const [{ data, error }, { data: allData }] = await Promise.all([
      createClient()
        .from('scraped_grants')
        .select('id, title, funder, apply_url, url_status, url_last_checked, source, is_invite_only, funder_type, funding_type, funder_brief, grant_sources, description, location_tag, amount_min, amount_max, deadline, is_rolling, eligible_structures')
        .eq('is_active', true)
        .order('funder', { ascending: true, nullsFirst: false })
        .limit(5000),
      createClient()
        .from('scraped_grants')
        .select('title, funder')
        .limit(10000),
    ])

    if (error) {
      console.error('loadCategoryGrants error:', error)
      setLoadError(`Query failed: ${error.message}`)
      return
    }
    setLoadError(null)

    // Scraped grants (active only — shown in UI)
    const scraped: CategoryGrant[] = (data ?? []).map(g => ({
      ...g,
      funder_type: (g.funder_type as string) ?? 'other',
      is_seed: false,
    }))

    // Seed grants
    const seeded: CategoryGrant[] = SEED_GRANTS.map(g => ({
      id: g.id,
      title: g.title,
      funder: g.funder,
      apply_url: g.applyUrl ?? null,
      url_status: 'unchecked' as const,
      url_last_checked: null,
      source: 'seed',
      is_invite_only: g.isInviteOnly ?? false,
      funder_type: g.funderType,
      is_seed: true,
    }))

    // Deduplicate against ALL scraped rows (inc. inactive/deleted) so that
    // deleted seed grants don't reappear after being promoted then removed.
    const allScrapedKeys = new Set((allData ?? []).map(g => `${g.title}||${g.funder}`))
    const uniqueSeeds = seeded.filter(g => !allScrapedKeys.has(`${g.title}||${g.funder}`))

    setCategoryGrants([...scraped, ...uniqueSeeds])
  }, [filter])

  useEffect(() => {
    if (authorised) { loadStats(); loadGrants(); loadNewGrants(); loadPromotedKeys() }
  }, [authorised, loadStats, loadGrants, loadNewGrants, loadPromotedKeys])

  useEffect(() => {
    if (authorised && filter === 'category') loadCategoryGrants()
  }, [authorised, filter, loadCategoryGrants])

  useEffect(() => {
    if (authorised && filter === 'review') loadReviewGrants()
  }, [authorised, filter, loadReviewGrants])

  useEffect(() => {
    if (authorised && filter === 'recent') loadRecentGrants()
  }, [authorised, filter, loadRecentGrants])

  useEffect(() => {
    if (authorised && filter === 'suspicious') loadSuspiciousGrants()
  }, [authorised, filter, loadSuspiciousGrants])

  // ── Clear selection when switching tabs ──────────────────────────────────────
  useEffect(() => { setSelectedIds(new Set()) }, [filter])

  // ── Deep-link: ?focus=<id> targets the Recently activated tab ────────────
  // Once data has loaded for the active tab (recent or category), expand the
  // targeted grant and scroll it into view.
  useEffect(() => {
    if (!focusId) return
    if (recentGrants.length === 0 && categoryGrants.length === 0) return
    setExpandedReviewId(focusId)
    const t = setTimeout(() => {
      const el = document.getElementById(`grant-row-${focusId}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)
    return () => clearTimeout(t)
  }, [focusId, recentGrants.length, categoryGrants.length])

  // ── Filtered seed grants (client-side, seed tab) ─────────────────────────────
  const filteredSeedGrants = useMemo(() => {
    if (filter !== 'seed') return []
    // Filter out seeds that have been promoted to the DB
    const unpromoted = SEED_GRANTS.filter(g => !promotedKeys.has(`${g.title}||${g.funder}`))
    const q = search.trim().toLowerCase()
    if (!q) return unpromoted
    return unpromoted.filter(g =>
      g.title.toLowerCase().includes(q) ||
      g.funder.toLowerCase().includes(q)
    )
  }, [filter, search, promotedKeys])

  // ── Category grouped data (client-side filtering + grouping) ─────────────────
  const categoryGrouped = useMemo(() => {
    if (filter !== 'category') return {}
    const q = categorySearch.trim().toLowerCase()
    const filtered = q
      ? categoryGrants.filter(g =>
          g.title.toLowerCase().includes(q) ||
          (g.funder ?? '').toLowerCase().includes(q)
        )
      : categoryGrants

    const groups: Record<string, CategoryGrant[]> = {}
    for (const g of filtered) {
      const type = g.funder_type || 'other'
      if (!groups[type]) groups[type] = []
      groups[type].push(g)
    }
    return groups
  }, [filter, categoryGrants, categorySearch])

  // ── Bulk-promote all seed grants to scraped_grants ────────────────────────────
  async function promoteAllSeeds() {
    setPromotingSeeds(true)
    setPromoteResult(null)
    try {
      const res = await fetch('/api/admin/promote-all-seeds', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Unknown error')
      setPromoteResult(data)
      await Promise.all([loadStats(), loadPromotedKeys()])
      if (filter === 'category') await loadCategoryGrants()
    } catch (err) {
      setPromoteResult({ inserted: 0, skipped: 0, message: `Error: ${err instanceof Error ? err.message : 'Unknown'}` })
    } finally {
      setPromotingSeeds(false)
    }
  }

  // ── Run full validation (paginated to avoid 60s Vercel timeout) ──────────────
  async function runValidation() {
    setRunning(true)
    setRunResult(null)
    setValidationProgress(null)

    let offset   = 0
    let totalOk  = 0
    let totalDead = 0
    let grandTotal = 0

    try {
      while (true) {
        const res = await fetch('/api/admin/validate-urls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offset, limit: 50 }),
        })
        if (!res.ok) {
          let detail = `HTTP ${res.status}`
          try { const b = await res.json(); detail += `: ${b.error ?? JSON.stringify(b)}` } catch { /* ignore */ }
          throw new Error(detail)
        }
        const data = await res.json()

        totalOk   += data.ok   ?? 0
        totalDead += data.dead ?? 0
        offset     = data.nextOffset ?? (offset + 50)
        if (offset === 50) grandTotal = data.total ?? 0  // captured on first call

        setValidationProgress({ checked: offset, total: grandTotal, ok: totalOk, dead: totalDead })

        if (data.done) break
      }

      setRunResult({ ok: totalOk, dead: totalDead, deadSeedGrants: [] })
      await loadStats()
      await loadGrants()
    } catch (err) {
      alert(`Validation failed — ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRunning(false)
      setValidationProgress(null)
    }
  }

  // ── Run deep URL audit (paginated, same pattern as validation) ──────────────
  async function runAudit() {
    setAuditing(true)
    setAuditProgress(null)

    let offset = 0
    let grandTotal = 0
    let totalChecked = 0
    let totalDead = 0
    let totalClosed = 0
    let scoreSum = 0

    try {
      while (true) {
        const res = await fetch('/api/admin/audit-url-quality', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offset, limit: 30 }),
        })
        if (!res.ok) {
          let detail = `HTTP ${res.status}`
          try { const b = await res.json(); detail += `: ${b.error ?? JSON.stringify(b)}` } catch { /* ignore */ }
          throw new Error(detail)
        }
        const data = await res.json()

        totalChecked += data.checked ?? 0
        totalDead    += data.dead ?? 0
        totalClosed  += data.closed ?? 0
        scoreSum     += (data.avgScore ?? 0) * (data.checked ?? 0)
        offset        = data.nextOffset ?? (offset + 30)
        if (totalChecked <= 30) grandTotal = data.total ?? 0

        setAuditProgress({
          checked:  totalChecked,
          total:    grandTotal,
          avgScore: totalChecked > 0 ? Math.round(scoreSum / totalChecked) : 0,
          dead:     totalDead,
          closed:   totalClosed,
        })

        if (data.done) break
      }

      await loadStats()
      if (filter === 'suspicious') await loadSuspiciousGrants()
      await loadGrants()
    } catch (err) {
      alert(`Audit failed — ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setAuditing(false)
    }
  }

  // ── Run AI classification pass (paginated, same pattern as validation) ──────
  async function runClassify(force = false) {
    setClassifying(true)
    setClassifyResult(null)
    setClassifyProgress(null)

    let offset = 0
    let totalClassified = 0
    let totalFailed = 0

    try {
      while (true) {
        const res = await fetch('/api/admin/classify-grants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offset, limit: 20, force }),
        })
        if (!res.ok) {
          let detail = `HTTP ${res.status}`
          try { const b = await res.json(); detail += `: ${b.error ?? JSON.stringify(b)}` } catch { /* ignore */ }
          throw new Error(detail)
        }
        const data = await res.json()

        totalClassified += data.classified ?? 0
        totalFailed     += data.failed ?? 0
        offset           = data.nextOffset ?? (offset + 20)

        setClassifyProgress({ classified: totalClassified, total: offset, failed: totalFailed })

        if (data.done) break
      }

      setClassifyResult({ classified: totalClassified, failed: totalFailed })
    } catch (err) {
      alert(`Classification failed — ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setClassifying(false)
      setClassifyProgress(null)
    }
  }

  // ── Server-side update helper (bypasses RLS via service role) ────────────────
  async function updateGrant(id: string, fields: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch('/api/admin/update-grant', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, fields }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      const msg = json.error ?? `HTTP ${res.status}`
      console.error('updateGrant error:', msg)
      return { ok: false, error: msg }
    }
    return { ok: true }
  }

  // ── Save edited URL ──────────────────────────────────────────────────────────
  async function saveUrl(id: string) {
    setSaving(true)
    // Clear quality score when URL changes — old score no longer applies to new URL
    await updateGrant(id, { apply_url: editUrl || null, url_status: 'unchecked', url_last_checked: null, url_quality_score: null, url_quality_issues: [] })
    const updateInList = (g: Grant) =>
      g.id === id ? { ...g, apply_url: editUrl || null, url_status: 'unchecked' as const, url_last_checked: null } : g
    setGrants(prev => prev.map(updateInList))
    setCategoryGrants(prev => prev.map(g =>
      g.id === id ? { ...g, apply_url: editUrl || null, url_status: 'unchecked' as const, url_last_checked: null } : g
    ))
    setReviewGrants(prev => prev.map(updateInList))
    setSuspiciousGrants(prev => prev.filter(g => g.id !== id))
    setEditingId(null)
    setSaving(false)
    await loadStats()
  }

  // ── Save edited title ─────────────────────────────────────────────────────────
  async function saveTitle(id: string) {
    const val = editTitleValue.trim()
    if (!val) return
    setSavingTitle(true)
    await updateGrant(id, { title: val })
    setGrants(prev => prev.map(g => g.id === id ? { ...g, title: val } : g))
    setCategoryGrants(prev => prev.map(g => g.id === id ? { ...g, title: val } : g))
    setNewGrants(prev => prev.map(g => g.id === id ? { ...g, title: val } : g))
    setReviewGrants(prev => prev.map(g => g.id === id ? { ...g, title: val } : g))
    setSuspiciousGrants(prev => prev.map(g => g.id === id ? { ...g, title: val } : g))
    setEditingTitleId(null)
    setSavingTitle(false)
  }

  // ── Mark dead manually ────────────────────────────────────────────────────────
  async function markDead(id: string) {
    await updateGrant(id, { url_status: 'dead', url_last_checked: new Date().toISOString() })
    const update = (g: Grant) => g.id === id ? { ...g, url_status: 'dead' as const } : g
    setGrants(prev => prev.map(update))
    setCategoryGrants(prev => prev.map(g => g.id === id ? { ...g, url_status: 'dead' as const } : g))
    setSuspiciousGrants(prev => prev.filter(g => g.id !== id))
    await loadStats()
  }

  // ── Mark ok manually ─────────────────────────────────────────────────────────
  async function markOk(id: string) {
    // Clear url_quality_score so it no longer matches the suspicious filter (score < 60)
    await updateGrant(id, { url_status: 'ok', url_last_checked: new Date().toISOString(), url_quality_score: null, url_quality_issues: [] })
    const patchOk = (g: Grant) => g.id === id ? { ...g, url_status: 'ok' as const, url_last_checked: new Date().toISOString() } : g
    // For dead/unchecked filter views, remove from list; for others, update in place
    if (filter === 'dead' || filter === 'unchecked') {
      setGrants(prev => prev.filter(g => g.id !== id))
    } else {
      setGrants(prev => prev.map(patchOk))
    }
    setNewGrants(prev => prev.map(g => g.id === id ? { ...g, url_status: 'ok' as const, url_last_checked: new Date().toISOString() } : g))
    setCategoryGrants(prev => prev.map(g => g.id === id ? { ...g, url_status: 'ok' as const } : g))
    setSuspiciousGrants(prev => prev.filter(g => g.id !== id))
    await loadStats()
  }

  // ── Toggle invite-only ────────────────────────────────────────────────────────
  async function toggleInviteOnly(id: string, current: boolean) {
    await updateGrant(id, { is_invite_only: !current })
    const update = (g: Grant) => g.id === id ? { ...g, is_invite_only: !current } : g
    setGrants(prev => prev.map(update))
    setCategoryGrants(prev => prev.map(g => g.id === id ? { ...g, is_invite_only: !current } : g))
  }

  // ── Soft delete ───────────────────────────────────────────────────────────────
  // mode 'dead'   → url_status='dead' + is_active=false → permanent hide (won't resurface in Needs Review)
  // mode 'review' → is_active=false only → moves grant to Needs Review for re-triage
  // Review-tab 'Hide' always implies 'dead' so the row doesn't come back next load.
  async function removeGrant(id: string, mode: 'dead' | 'review' = 'dead') {
    if (filter === 'review' || mode === 'dead') {
      await updateGrant(id, { url_status: 'dead', is_active: false })
    } else {
      await updateGrant(id, { is_active: false })
    }
    setReviewGrants(prev => prev.filter(g => g.id !== id))
    setGrants(prev => prev.filter(g => g.id !== id))
    setNewGrants(prev => prev.filter(g => g.id !== id))
    setCategoryGrants(prev => prev.filter(g => g.id !== id))
    setSuspiciousGrants(prev => prev.filter(g => g.id !== id))
    setConfirmDeleteId(null)
    await loadStats()
  }

  // ── Batch select / delete ─────────────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll(visibleIds: string[]) {
    setSelectedIds(prev =>
      prev.size === visibleIds.length && visibleIds.every(id => prev.has(id))
        ? new Set()
        : new Set(visibleIds)
    )
  }

  async function batchDelete() {
    if (selectedIds.size === 0 || batchDeleting) return
    setBatchDeleting(true)
    try {
      const ids = Array.from(selectedIds)
      // Review grants are already is_active: false — mark them as url_status: 'dead'
      // so they don't reappear in the review queue on next load.
      const fields = filter === 'review'
        ? { url_status: 'dead' }
        : { is_active: false }
      await fetch('/api/admin/update-grant', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, fields }),
      })
      setGrants(prev => prev.filter(g => !selectedIds.has(g.id)))
      setNewGrants(prev => prev.filter(g => !selectedIds.has(g.id)))
      setReviewGrants(prev => prev.filter(g => !selectedIds.has(g.id)))
      setSuspiciousGrants(prev => prev.filter(g => !selectedIds.has(g.id)))
      setSelectedIds(new Set())
      await loadStats()
    } finally {
      setBatchDeleting(false)
    }
  }

  // ── Promote seed grant → scraped_grants DB row ───────────────────────────────
  // Uses a server-side API route so the service role key can bypass RLS.
  async function promoteSeedGrant(grant: CategoryGrant): Promise<string | null> {
    const res = await fetch('/api/admin/promote-grant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seedId:         grant.id,
        title:          grant.title,
        funder:         grant.funder,
        funder_type:    grant.funder_type,
        apply_url:      grant.apply_url,
        is_invite_only: grant.is_invite_only,
      }),
    })
    const json = await res.json()
    if (!res.ok) { console.error('promoteSeedGrant error:', json); return null }
    return json.id as string
  }

  // ── Handle any action on a seed grant (promotes first, then runs action) ──────
  async function handleSeedAction(
    grant: CategoryGrant,
    action: (newId: string) => void | Promise<void>,
  ) {
    setPromotingId(grant.id)
    try {
      const newId = await promoteSeedGrant(grant)
      if (!newId) { alert('Could not promote seed grant — check console'); return }
      // Replace seed entry in local state with the new DB row
      setCategoryGrants(prev => prev.map(g =>
        (g.id === grant.id && g.is_seed)
          ? { ...g, id: newId, is_seed: false, source: 'manual', url_status: 'unchecked' as const }
          : g
      ))
      await action(newId)
    } finally {
      setPromotingId(null)
    }
  }

  // ── Search for grant info → open refresh modal ───────────────────────────────
  // Uses AI-powered URL discovery to find the specific grant page, not just the
  // funder homepage. Passes any existing URL as a hint to help navigation.
  async function fetchGrantInfo(grant: Grant | CategoryGrant) {
    setRefreshingId(grant.id)
    setRefreshError(null)
    setPopulateMsg(null)
    try {
      // Fetch location + subtype fields directly from DB (not exposed on Grant type)
      const { data: locRow } = await createClient()
        .from('scraped_grants')
        .select('location_tag, is_local, funding_subtype')
        .eq('id', grant.id)
        .single()

      const res = await fetch('/api/admin/search-grant-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:       grant.title,
          funder:      grant.funder ?? '',
          existingUrl: grant.apply_url ?? '',
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        alert(`Could not find grant info: ${json.error ?? `Error ${res.status}`}`)
        return
      }
      const d = json.data
      // If existing URL was dead and no replacement found, clear it so user must enter manually
      const discoveredUrl: string = json.sourceUrl ?? (json.urlWasDead ? '' : (grant.apply_url ?? ''))
      setRefreshModal({
        grantId:     grant.id,
        grantTitle:  grant.title,
        grantUrl:    discoveredUrl,
        urlImproved: json.urlImproved ?? false,
        urlWasDead:  json.urlWasDead ?? false,
        form: {
          title:         d.title        ?? grant.title,
          funder:        d.funder       ?? (grant.funder ?? ''),
          funder_type:   d.funder_type  ?? (grant.funder_type ?? 'trust_foundation'),
          funding_type:  d.funding_type ?? 'grant',
          apply_url:     discoveredUrl,
          description:   d.description  ?? '',
          amount_min:    d.amount_min   != null ? String(d.amount_min) : '',
          amount_max:    d.amount_max   != null ? String(d.amount_max) : '',
          is_rolling:    d.is_rolling   ?? true,
          deadline:      d.deadline     ?? '',
          sectors:       Array.isArray(d.sectors) && d.sectors.length > 0 ? d.sectors.join(', ') : '',
          is_invite_only: d.is_invite_only ?? grant.is_invite_only,
          next_open_date: d.next_open_date ?? '',
          location_tag:  locRow?.location_tag ?? '',
          is_local:      locRow?.is_local ?? false,
          funding_subtype: locRow?.funding_subtype ?? '',
        },
      })
    } catch (err) {
      alert(`Search failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRefreshingId(null)
    }
  }

  // ── Re-populate modal fields from a manually entered URL ─────────────────────
  // Called when the user types a new URL and clicks "Populate". Uses the same
  // search-grant-info endpoint but passes the new URL as existingUrl so the
  // pipeline skips the URL-search steps and goes straight to crawling the page.
  async function repopulateModalFromUrl() {
    if (!refreshModal) return
    const url = refreshModal.form.apply_url.trim()
    if (!url) return
    setPopulatingFromUrl(true)
    setRefreshError(null)
    setPopulateMsg(null)
    try {
      const res = await fetch('/api/admin/search-grant-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:       refreshModal.form.title || refreshModal.grantTitle,
          funder:      refreshModal.form.funder ?? '',
          existingUrl: url,
          // Hint: treat the entered URL as confirmed so the pipeline crawls it
          // directly without trying to find a "better" URL first.
          skipUrlSearch: true,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setRefreshError(`Could not fetch info from URL: ${json.error ?? `Error ${res.status}`}`)
        return
      }
      const d = json.data
      // Merge fetched data into form — keep the URL the user typed
      setRefreshModal(m => m ? {
        ...m,
        grantUrl: url,
        urlImproved: false,
        urlWasDead: false,
        form: {
          ...m.form,
          title:          d.title        || m.form.title,
          funder:         d.funder       || m.form.funder,
          funder_type:    d.funder_type  || m.form.funder_type,
          description:    d.description  || m.form.description,
          amount_min:     d.amount_min   != null ? String(d.amount_min) : m.form.amount_min,
          amount_max:     d.amount_max   != null ? String(d.amount_max) : m.form.amount_max,
          is_rolling:     d.is_rolling   ?? m.form.is_rolling,
          deadline:       d.deadline     ?? m.form.deadline,
          sectors:        Array.isArray(d.sectors) && d.sectors.length > 0 ? d.sectors.join(', ') : m.form.sectors,
          is_invite_only: d.is_invite_only ?? m.form.is_invite_only,
          next_open_date: d.next_open_date ?? m.form.next_open_date,
        },
      } : m)
      // Friendly feedback: let the user know what happened
      const pageCrawled = json.urlWasDead === false  // API crawled the URL successfully
      setPopulateMsg(pageCrawled
        ? '✓ Page scanned — fields updated below'
        : '✓ Used AI knowledge — page could not be crawled directly')
    } catch (err) {
      setRefreshError(`Populate failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setPopulatingFromUrl(false)
    }
  }

  // ── Redirect warning state ──────────────────────────────────────────────────
  const [redirectWarning, setRedirectWarning] = useState<{
    inputUrl: string; finalUrl: string
  } | null>(null)

  // ── Save refreshed info back to DB ────────────────────────────────────────────
  async function saveRefreshedInfo(overrideUrl?: string) {
    if (!refreshModal) return
    setRefreshSaving(true)
    setRefreshError(null)
    setPopulateMsg(null)
    setRedirectWarning(null)
    const { grantId, form } = refreshModal
    const sectors = form.sectors
      ? form.sectors.split(',').map(s => s.trim()).filter(Boolean)
      : []
    let savedUrl = overrideUrl ?? (form.apply_url.trim() || null)

    // ── Redirect detection: silently follow to the final URL ─────────────────
    // If the URL redirects, use the final destination rather than the redirect
    // source — no user action needed. Skip when overrideUrl is already set
    // (user has already chosen) or when there's no URL to check.
    if (savedUrl && !overrideUrl) {
      try {
        const checkRes = await fetch('/api/admin/check-redirect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: savedUrl }),
        })
        const checkJson = await checkRes.json()
        if (checkJson.ok && checkJson.redirected && checkJson.finalUrl) {
          // Silently update to the final destination URL
          savedUrl = checkJson.finalUrl
        }
      } catch {
        // If redirect check fails, proceed with the original URL
      }
    }

    // When saving from the Needs Review tab, also approve the grant (set is_active: true)
    // so it goes live immediately — the user has reviewed & confirmed the details.
    const isReviewApproval = filter === 'review'
    const result = await updateGrant(grantId, {
      title:            form.title.trim(),
      funder:           form.funder.trim(),
      funder_type:      form.funder_type,
      funding_type:     form.funding_type,
      funding_subtype:  form.funding_subtype || null,
      apply_url:        savedUrl,
      description:      form.description.trim() || null,
      amount_min:       form.amount_min ? parseInt(form.amount_min, 10) : null,
      amount_max:       form.amount_max ? parseInt(form.amount_max, 10) : null,
      is_rolling:       form.is_rolling,
      deadline:         (!form.is_rolling && form.deadline) ? form.deadline : null,
      sectors,
      is_invite_only:   form.is_invite_only,
      next_open_date:        form.next_open_date.trim() || null,
      next_open_date_parsed: parseOpenDate(form.next_open_date.trim() || null),
      location_tag:     form.location_tag.trim() || null,
      is_local:         form.is_local,
      // Sparkles confirmed this URL exists — mark it ok so it doesn't
      // sit in the Unchecked queue waiting for the next validation run
      url_status:       savedUrl ? 'ok' : null,
      url_last_checked: savedUrl ? new Date().toISOString() : null,
      // Auto-approve when editing from the Needs Review tab
      ...(isReviewApproval ? { is_active: true } : {}),
    })

    if (!result.ok) {
      setRefreshError(result.error ?? 'Save failed — check console for details')
      setRefreshSaving(false)
      return
    }
    setRefreshSaving(false)
    setRefreshModal(null)
    // Optimistically update badge in all local lists immediately so the user
    // sees the new status as soon as the modal closes (don't wait for reloads)
    const okStatus = savedUrl ? 'ok' as const : undefined
    const nowIso   = new Date().toISOString()
    if (okStatus) {
      const patch = <T extends { id: string }>(g: T): T =>
        g.id === grantId ? { ...g, apply_url: savedUrl, title: form.title.trim(), funder: form.funder.trim(), url_status: okStatus, url_last_checked: nowIso } : g
      setGrants(prev         => prev.map(patch))
      setNewGrants(prev      => prev.map(patch))
      setCategoryGrants(prev => prev.map(patch))
      // If we just approved from Needs Review, remove from the review list
      if (isReviewApproval) {
        setReviewGrants(prev => prev.filter(g => g.id !== grantId))
      } else {
        setReviewGrants(prev => prev.map(patch))
      }
    }
    // Reload the current view so the grant disappears from filtered lists
    // (e.g. it should vanish from Dead/Unchecked once marked ok)
    await loadStats()
    await loadGrants()
    if (filter === 'category') await loadCategoryGrants()
    if (filter === 'review')     await loadReviewGrants()
    if (filter === 'new')        await loadNewGrants()
    if (filter === 'suspicious') await loadSuspiciousGrants()
  }

  // ── Populate form from URL ────────────────────────────────────────────────────
  async function populateFromUrl() {
    const url = fetchUrl.trim()
    if (!url) return
    setFetching(true)
    setFetchError(null)
    try {
      const res = await fetch('/api/admin/fetch-grant-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setFetchError(json.error ?? `Error ${res.status}`)
        return
      }
      const d = json.data
      setAddForm(prev => ({
        ...prev,
        title:          d.title        ?? prev.title,
        funder:         d.funder       ?? prev.funder,
        funder_type:    d.funder_type  ?? prev.funder_type,
        funding_type:   d.funding_type ?? prev.funding_type,
        description:    d.description  ?? prev.description,
        amount_min:     d.amount_min != null ? String(d.amount_min) : prev.amount_min,
        amount_max:     d.amount_max != null ? String(d.amount_max) : prev.amount_max,
        is_rolling:     d.is_rolling  ?? prev.is_rolling,
        deadline:       d.deadline     ?? prev.deadline,
        sectors:        Array.isArray(d.sectors) && d.sectors.length > 0
                          ? d.sectors.join(', ')
                          : prev.sectors,
        is_invite_only: d.is_invite_only ?? prev.is_invite_only,
        next_open_date: d.next_open_date ?? prev.next_open_date,
        apply_url:      prev.apply_url || url,   // prefill URL if not already set
      }))
      setFetchedFrom(json.fetchedFromPage
        ? url
        : `${url} (page blocked — filled from AI knowledge)`
      )
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setFetching(false)
    }
  }

  // ── Add new grant (manual) ────────────────────────────────────────────────────
  async function addGrant() {
    if (!addForm.title.trim() || !addForm.funder.trim()) {
      setAddError('Title and Funder are required.')
      return
    }
    setAddSaving(true)
    setAddError(null)

    const sectors = addForm.sectors
      ? addForm.sectors.split(',').map(s => s.trim()).filter(Boolean)
      : []

    const addRes = await fetch('/api/admin/promote-grant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manual:         true,
        title:          addForm.title.trim(),
        funder:         addForm.funder.trim(),
        funder_type:    addForm.funder_type,
        funding_type:   addForm.funding_type,
        apply_url:      addForm.apply_url.trim() || null,
        description:    addForm.description.trim() || null,
        amount_min:     addForm.amount_min ? parseInt(addForm.amount_min, 10) : null,
        amount_max:     addForm.amount_max ? parseInt(addForm.amount_max, 10) : null,
        deadline:       (!addForm.is_rolling && addForm.deadline) ? addForm.deadline : null,
        is_rolling:     addForm.is_rolling,
        is_invite_only: addForm.is_invite_only,
        next_open_date:        addForm.next_open_date.trim() || null,
        next_open_date_parsed: parseOpenDate(addForm.next_open_date.trim() || null),
        sectors,
      }),
    })
    const addJson = await addRes.json()

    if (!addRes.ok) {
      setAddError(`Failed to save: ${addJson.error ?? 'Unknown error'}`)
      setAddSaving(false)
      return
    }

    setAddSaving(false)
    setShowAddModal(false)
    setAddForm(BLANK_FORM)
    setSearch('')
    // Switch to "All grants" so the new entry is immediately visible
    // (useEffect on filter change will call loadGrants automatically)
    setFilter('all')
    await loadStats()
  }

  // ── Toggle category accordion ─────────────────────────────────────────────────
  function toggleCategory(type: string) {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  // ── Guards ────────────────────────────────────────────────────────────────────
  if (authorised === null) return (
    <div className="flex h-64 items-center justify-center text-mid text-sm">Checking access…</div>
  )
  if (!authorised) return (
    <div className="flex h-64 items-center justify-center">
      <div className="rounded-2xl border border-warm bg-white p-10 text-center shadow-warm">
        <AlertTriangle className="mx-auto mb-4 h-8 w-8 text-gold" />
        <p className="font-serif text-lg text-charcoal">Admin access only</p>
      </div>
    </div>
  )

  // ── Funder intelligence enrichment (inline) ──────────────────────────────────
  async function enrichGrantFromManager(grant: Grant) {
    if (enrichingId) return
    setEnrichingId(grant.id)
    const controller = new AbortController()
    const clientTimeout = setTimeout(() => controller.abort(), 50000)
    try {
      const res = await fetch('/api/admin/enrich-grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grantId: grant.id }),
        signal: controller.signal,
      })
      clearTimeout(clientTimeout)
      if (res.ok) {
        const { brief } = await res.json()
        const patch = (g: Grant) => g.id === grant.id ? { ...g, funder_brief: brief } : g
        setGrants(prev => prev.map(patch))
        setNewGrants(prev => prev.map(g => g.id === grant.id ? { ...g, funder_brief: brief } : g))
        setReviewGrants(prev => prev.map(g => g.id === grant.id ? { ...g, funder_brief: brief } : g))
        setSuspiciousGrants(prev => prev.map(g => g.id === grant.id ? { ...g, funder_brief: brief } : g))
        setRecentGrants(prev => prev.map(patch))
        setCategoryGrants(prev => prev.map(g => g.id === grant.id ? { ...g, funder_brief: brief } : g))
      }
    } catch { /* silent — network or timeout */ } finally {
      clearTimeout(clientTimeout)
      setEnrichingId(null)
    }
  }


  function populateFromBrief(grant: Grant) {
    const brief = grant.funder_brief as Record<string, string | null> | null
    if (!brief) return
    const awardText   = (brief.typical_award    ?? '').toLowerCase()
    const timelineText = (brief.decision_timeline ?? '').toLowerCase()
    const updates: Record<string, string | boolean | number | null> = {}

    // ── Extract amounts ───────────────────────────────────────────────────────
    // Matches: £10,000 | £10k | £1m | up to £50,000 | $50,000
    const amountRe = /[£$][\d,]+(?:\.?\d+)?(?:\s*[km](?:illion)?)?/g
    const amountMatches = awardText.match(amountRe) ?? []
    const parseAmt = (s: string): number | null => {
      const clean = s.replace(/[£$,]/g, '').trim()
      const m = clean.match(/([\d.]+)\s*([km])?/)
      if (!m) return null
      let val = parseFloat(m[1])
      if (m[2] === 'k') val *= 1_000
      if (m[2] === 'm') val *= 1_000_000
      if (isNaN(val) || val > 50_000_000) return null  // sanity cap
      return Math.round(val)
    }
    const amounts = amountMatches.map(parseAmt).filter((v): v is number => v !== null)
    if (amounts.length === 1) {
      if (!getReviewVal(grant.id,'amount_max',null)) updates.amount_max = amounts[0]
    } else if (amounts.length >= 2) {
      const sorted = [...amounts].sort((a,b) => a - b)
      if (!getReviewVal(grant.id,'amount_min',null)) updates.amount_min = sorted[0]
      if (!getReviewVal(grant.id,'amount_max',null)) updates.amount_max = sorted[sorted.length-1]
    }

    // ── Extract deadline ──────────────────────────────────────────────────────
    // Handles ordinal suffixes (1st, 2nd, 3rd, 4th etc.) + bare date fallback
    // (safe to use bare dates since this field is specifically about the decision timeline)
    if (!getReviewVal(grant.id,'deadline',null)) {
      const months: Record<string,string> = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' }
      const todayISO = new Date().toISOString().slice(0,10)
      const candidates: string[] = []

      // Multi-round list: e.g. '2026 deadlines are: 27 February, 1 May, 6 July...'
      // Collects every round in the list and flags the grant as rolling.
      const deadlineListRe = /(\d{4})\s+deadlines?\s*(?:are|for)?[^:]*:\s*([\d\w\s,]+)/i
      const mList = timelineText.match(deadlineListRe)
      if (mList) {
        const yr = mList[1]
        const listPart = mList[2]
        for (const e of Array.from(listPart.matchAll(/(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*/gi))) {
          const day = e[1].padStart(2,'0')
          const mon = months[e[2].toLowerCase().slice(0,3)]
          if (mon) candidates.push(`${yr}-${mon}-${day}`)
        }
        if (candidates.length > 0) updates.is_rolling = true
      }

      // Bare DD Month YYYY (with optional ordinal suffix) anywhere in the
      // decision-timeline text. Safe to be permissive here since the field is
      // specifically about deadline / decision dates.
      for (const m of Array.from(timelineText.matchAll(/(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{4})/gi))) {
        const day = m[1].padStart(2,'0')
        const mon = months[m[2].toLowerCase().slice(0,3)]
        if (mon) candidates.push(`${m[3]}-${mon}-${day}`)
      }
      // Bare Month DD YYYY (US style)
      for (const m of Array.from(timelineText.matchAll(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})/gi))) {
        const mon = months[m[1].toLowerCase().slice(0,3)]
        const day = m[2].padStart(2,'0')
        if (mon) candidates.push(`${m[3]}-${mon}-${day}`)
      }
      // Month YYYY only (no day) — e.g. "September 2026" — coerce to last day
      // of the month so it doesn't accidentally land on the 1st. Only used as
      // a fallback if no full date was found.
      if (candidates.length === 0) {
        for (const m of Array.from(timelineText.matchAll(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{4})/gi))) {
          const mon = months[m[1].toLowerCase().slice(0,3)]
          if (!mon) continue
          const yr = m[2]
          const lastDay = new Date(parseInt(yr), parseInt(mon), 0).getDate()
          candidates.push(`${yr}-${mon}-${String(lastDay).padStart(2,'0')}`)
        }
      }

      // Dedupe + sort. Pick the earliest date that's today-or-future. If
      // every candidate is in the past, fall back to the latest past date so
      // we surface *some* signal rather than nothing — but flag it implicitly
      // by leaving is_rolling unchanged so the user can sanity-check.
      const unique = Array.from(new Set(candidates)).sort()
      const future = unique.filter(d => d >= todayISO)
      if (future.length > 0) {
        updates.deadline = future[0]
        // If we picked a future date but the multi-round flag was set above,
        // keep is_rolling=true; otherwise we're a one-shot deadline.
        if (updates.is_rolling === undefined) updates.is_rolling = false
      } else if (unique.length > 0) {
        updates.deadline = unique[unique.length - 1]
        if (updates.is_rolling === undefined) updates.is_rolling = false
      }
    }
    if (Object.keys(updates).length > 0) {
      setReviewEdits(s => ({ ...s, [grant.id]: { ...(s[grant.id] ?? {}), ...updates } }))
    }
  }


  function detectLocation(grant: Grant) {
    const brief = grant.funder_brief as Record<string, string | null> | null
    // Prefer geographic_focus from brief (most accurate), then fall back to raw text fields
    const text = [
      brief?.geographic_focus ?? '',
      grant.title,
      (grant as Grant & { description?: string }).description ?? '',
      grant.apply_url ?? '',
    ].join(' ').toLowerCase()

    // eslint-disable-next-line no-console
    console.warn('[detectLocation] v3-boroughs', { id: grant.id, title: grant.title, text: text.slice(0, 400), hasBrief: !!brief, geographicFocus: brief?.geographic_focus })

    // UK-wide signals — check FIRST so a brief that mentions individual
    // nations as examples (e.g. "UK-wide, delivered across England, Wales
    // and Scotland") doesn't get tagged as the last-mentioned nation.
    if (/\buk[-\s]?wide\b|\bukwide\b|\bunited\s+kingdom\b|\bnationwide\b|\bnational\s+(?:programme|fund|scheme|charity)\b|\bacross\s+the\s+uk\b|\bthroughout\s+the\s+uk\b/.test(text)) {
      setReviewField(grant.id, 'location_tag', 'UK'); return
    }

    // Multiple UK nations mentioned together — also treat as UK-wide.
    const nationMatches = [
      /\bscotland\b|\bscottish\b/.test(text),
      /\bwales\b|\bwelsh\b|\bcymru\b/.test(text),
      /\bnorthern\s+ireland\b/.test(text),
      /\bengland\b|\benglish\b/.test(text),
    ].filter(Boolean).length
    if (nationMatches >= 2) {
      setReviewField(grant.id, 'location_tag', 'UK'); return
    }

    // Single-nation matches
    if (/\bscotland\b|\bscottish\b/.test(text)) { setReviewField(grant.id, 'location_tag', 'Scotland'); return }
    if (/\bwales\b|\bwelsh\b|\bcymru\b/.test(text)) { setReviewField(grant.id, 'location_tag', 'Wales'); return }
    if (/\bnorthern\s+ireland\b/.test(text)) { setReviewField(grant.id, 'location_tag', 'Northern Ireland'); return }
    if (/\bengland\b|\benglish\b/.test(text)) { setReviewField(grant.id, 'location_tag', 'England'); return }

    // London boroughs — check BEFORE generic 'London' so a Camden-specific
    // grant tags as 'Camden', not 'London'. Match whole words / borough phrases
    // ("London Borough of Camden", "in Camden", "Camden residents only" etc).
    const LONDON_BOROUGHS: [RegExp, string][] = [
      [/\bbarking\s*(?:&|and)\s*dagenham\b|\bbarking\b|\bdagenham\b/, 'Barking & Dagenham'],
      [/\bbarnet\b/, 'Barnet'],
      [/\bbexley\b/, 'Bexley'],
      [/\bbrent\b/, 'Brent'],
      [/\bbromley\b/, 'Bromley'],
      [/\bcamden\b/, 'Camden'],
      [/\bcroydon\b/, 'Croydon'],
      [/\bealing\b/, 'Ealing'],
      [/\benfield\b/, 'Enfield'],
      [/\bgreenwich\b/, 'Greenwich'],
      [/\bhackney\b/, 'Hackney'],
      [/\bhammersmith\s*(?:&|and)\s*fulham\b|\bhammersmith\b|\bfulham\b/, 'Hammersmith & Fulham'],
      [/\bharingey\b/, 'Haringey'],
      [/\bharrow\b/, 'Harrow'],
      [/\bhavering\b/, 'Havering'],
      [/\bhillingdon\b/, 'Hillingdon'],
      [/\bhounslow\b/, 'Hounslow'],
      [/\bislington\b/, 'Islington'],
      [/\bkensington\s*(?:&|and)\s*chelsea\b|\brbkc\b|\bkensington\b|\bchelsea\b/, 'Kensington & Chelsea'],
      [/\bkingston\s+upon\s+thames\b|\bkingston\b/, 'Kingston upon Thames'],
      [/\blambeth\b/, 'Lambeth'],
      [/\blewisham\b/, 'Lewisham'],
      [/\bmerton\b/, 'Merton'],
      [/\bnewham\b/, 'Newham'],
      [/\bredbridge\b/, 'Redbridge'],
      [/\brichmond\s+upon\s+thames\b|\brichmond\b/, 'Richmond upon Thames'],
      [/\bsouthwark\b/, 'Southwark'],
      [/\bsutton\b/, 'Sutton'],
      [/\btower\s+hamlets\b/, 'Tower Hamlets'],
      [/\bwaltham\s+forest\b/, 'Waltham Forest'],
      [/\bwandsworth\b/, 'Wandsworth'],
      [/\bwestminster\b/, 'Westminster'],
      [/\bcity\s+of\s+london\b/, 'City of London'],
    ]
    for (const [re, label] of LONDON_BOROUGHS) {
      if (re.test(text)) {
        // eslint-disable-next-line no-console
        console.warn('[detectLocation] matched borough', label, 're:', re.toString())
        setReviewField(grant.id, 'location_tag', label); return
      }
    }

    // Major UK cities / regions
    const REGIONS: [RegExp, string][] = [
      [/\blondon\b/, 'London'],
      [/\bmanchester\b/, 'Manchester'],
      [/\bbirmingham\b/, 'Birmingham'],
      [/\bbristol\b/, 'Bristol'],
      [/\bleeds\b/, 'Leeds'],
      [/\bliverpool\b/, 'Liverpool'],
      [/\bnewcastle\b/, 'Newcastle'],
      [/\bsheffield\b/, 'Sheffield'],
      [/\bnottingham\b/, 'Nottingham'],
      [/\bbrighton\b|\bsussex\b/, 'Sussex'],
      [/\bstockport\b|\bbolton\b|\boldham\b|\bwigan\b|\bsalford\b|\btrafford\b|\bbury\b/, 'Greater Manchester'],
      [/\bcoventry\b/, 'Coventry'],
      [/\bexeter\b/, 'Exeter'],
      [/\bbradford\b|\bhuddersfield\b|\bwakefield\b/, 'Yorkshire'],
      [/\bplymouth\b/, 'South West England'],
      [/\bnorwich\b/, 'East of England'],
      [/\bportsmouth\b|\bsouthampton\b/, 'South East England'],
      [/\bleicester\b/, 'Midlands'],
      [/\bwolverhampton\b|\bwalsall\b|\bsandwell\b/, 'West Midlands'],
      [/\bedinburgh\b|\bglasgow\b/, 'Scotland'],
      [/\bcardiff\b|\bswansea\b/, 'Wales'],
      [/\bnorth east\b|\btyne\b|\bwear\b|\bnorthumberland\b/, 'North East England'],
      [/\bnorth west\b|\blancashire\b|\bcheshire\b/, 'North West England'],
      [/\byorkshire\b/, 'Yorkshire'],
      [/\bmidlands\b|\bwest midlands\b|\beast midlands\b/, 'Midlands'],
      [/\bsouth east\b|\bkent\b|\bsurrey\b|\bessex\b|\boxfordshire\b/, 'South East England'],
      [/\bsouth west\b|\bcornwall\b|\bdevon\b|\bsomerset\b/, 'South West England'],
    ]
    for (const [re, label] of REGIONS) {
      if (re.test(text)) {
        // eslint-disable-next-line no-console
        console.warn('[detectLocation] matched region', label, 're:', re.toString())
        setReviewField(grant.id, 'location_tag', label); return
      }
    }

    // Final UK-wide fallback: a bare \buk\b mention. Kept last so a single
    // "UK" reference doesn't beat a clear regional / borough signal above.
    if (/\buk\b/.test(text)) {
      setReviewField(grant.id, 'location_tag', 'UK'); return
    }

    // Couldn't detect — leave blank
  }


  const STRUCTURE_OPTIONS = [
    { value: 'social_enterprise_broad', label: 'Social Enterprise (broad catch-all)' },
    { value: 'registered_charity', label: 'Registered Charity' },
    { value: 'cio',                label: 'CIO' },
    { value: 'cic_guarantee',      label: 'CIC (Guarantee)' },
    { value: 'cic_shares',         label: 'CIC (Shares)' },
    { value: 'ltd_guarantee',      label: 'Ltd by Guarantee' },
    { value: 'ltd_shares',         label: 'Ltd by Shares' },
    { value: 'cooperative',        label: 'Co-operative / CBS' },
    { value: 'unincorporated',     label: 'Unincorporated' },
    { value: 'sole_trader',        label: 'Sole Trader / Individual' },
    { value: 'llp',                label: 'LLP' },
  ]

   function detectEligibility(grant: Grant) {
    // Split inclusion vs exclusion text. Earlier version mashed everything
    // together so an "Exclusions: CICs cannot apply" line still ticked CIC
    // because the matcher saw "CIC" in the blob.
    const brief = grant.funder_brief as Record<string, string | null> | null
    // Include every brief section likely to mention applicant types — not just
    // what_they_fund/who_can_apply/priorities. NFP / structure cues often
    // surface in how_to_apply, strong_application or funder_tips too.
    const inclusionText = [
      brief?.what_they_fund, brief?.who_can_apply, brief?.priorities,
      brief?.how_to_apply, brief?.strong_application, brief?.funder_tips,
    ].filter(Boolean).join(' ').toLowerCase()
    const exclusionText = (brief?.exclusions ?? '').toLowerCase()
    const fallbackText = [
      (grant as Grant & { description?: string }).description ?? '',
      grant.title ?? '',
    ].join(' ').toLowerCase()
    const text = inclusionText.length > 30 ? inclusionText : fallbackText

    // Phrases that mean "no formal structure required" — these should not
    // flip the charity flag on via the raw "registered charity" match below.
    const openToAnyone = /no (?:requirement|need)\s+to\s+be\s+(?:a\s+)?(?:registered\s+)?(?:charity|formal|incorporated|organisation|organi[sz]ation|company)|not\s+required\s+to\s+be\s+(?:a\s+)?(?:registered\s+)?(?:charity|formal|incorporated|organisation|organi[sz]ation|company)|don'?t\s+(?:have\s+to\s+|need\s+to\s+)?be\s+(?:a\s+)?(?:registered\s+)?(?:charity|formal|organisation|organi[sz]ation)|any(?:one|\s+type\s+of|\s+kind\s+of)|individuals?\s+(?:and|or)\s+(?:informal|community|groups|organisations)|informal\s+groups?\s+can\s+apply/.test(text)

    const structs = new Set<string>()
    // Charities — most common, check first (but suppress if 'no requirement to be a registered charity')
    if (/\bcharit(y|ies|able)\b|registered charit|charities only|charity only/.test(text) && !openToAnyone) {
      structs.add('registered_charity'); structs.add('cio')
    }
    // CIO — explicit. Catches grants targeting CIOs without the word "charity".
    if (/\bcios?\b|charitable\s+incorporated\s+organisation/.test(text)) {
      structs.add('cio'); structs.add('registered_charity')
    }
    // Not-for-profit / non-profit phrasing — opens the charity-shaped + SE
    // set including ltd_guarantee (the most common NFP company structure).
    // Trailing s? handles plurals like "non-profits" / "not-for-profits".
    if (/\bnot[-\s]?for[-\s]?profits?\b|\bnon[-\s]?profits?\b|\bnonprofits?\b/.test(text)) {
      structs.add('registered_charity'); structs.add('cio')
      structs.add('cic_guarantee'); structs.add('cic_shares')
      structs.add('ltd_guarantee'); structs.add('cooperative')
      structs.add('unincorporated')
    }
    // VCSE umbrella term (voluntary, community, social enterprise).
    if (/\bvcse\b|voluntary,?\s+community(?:\s+and)?\s+social\s+enterprise/.test(text)) {
      structs.add('registered_charity'); structs.add('cio')
      structs.add('cic_guarantee'); structs.add('cic_shares')
      structs.add('ltd_guarantee'); structs.add('cooperative')
      structs.add('unincorporated')
    }
    // Community / voluntary groups → unincorporated (not CIC).
    if (/community\s+group|voluntary\s+group|voluntary\s+organi|informal\s+group|resident.led\s+group|voluntary\s+sector/.test(text)) {
      structs.add('unincorporated')
    }
    // Faith / religious groups → typically charity-shaped or unincorporated.
    if (/faith\s+(?:group|based|organi)|religious\s+(?:group|organi)|church(?:es)?|mosque|synagogue|gurdwara|temple/.test(text)) {
      structs.add('registered_charity'); structs.add('cio'); structs.add('unincorporated')
    }
    // CICs — only when explicitly named
    if (/\bcics?\b|community\s+interest\s+compan/.test(text)) {
      structs.add('cic_guarantee'); structs.add('cic_shares')
    }
    // Social enterprises — handle singular and plural
    if (/\bsocial\s+enterprise(s)?\b/.test(text)) {
      structs.add('cic_guarantee'); structs.add('cic_shares')
      structs.add('ltd_guarantee'); structs.add('ltd_shares'); structs.add('cooperative')
    }
    // Co-operatives
    if (/co.operative|community\s+benefit\s+society|\bcbs\b/.test(text)) {
      structs.add('cooperative')
    }
    // Ltd companies — only when explicit
    if (/ltd\s+company|limited\s+company|ltd\s+by\s+shares|trading\s+company/.test(text)) {
      structs.add('ltd_shares'); structs.add('ltd_guarantee')
    }
    // Individuals (singular OR plural)
    if (/\bindividuals?\b|sole\s+trader|freelance|\bpractitioner\b/.test(text)) {
      structs.add('sole_trader')
    }
    // 'No requirement to be a registered charity / formal organisation' →
    // ticks the open set (charity, CIO, SE variants, unincorporated, sole_trader)
    if (openToAnyone) {
      ;['registered_charity','cio','cic_guarantee','cic_shares','ltd_guarantee','ltd_shares','cooperative','unincorporated','sole_trader']
        .forEach(s => structs.add(s))
    }
    // Open to all (existing fallback)
    if (structs.size === 0 && /open\s+to\s+all|any\s+organi|any\s+registered|all\s+organi/.test(text)) {
      ;['registered_charity','cio','cic_guarantee','cic_shares','ltd_guarantee','ltd_shares','cooperative','unincorporated']
        .forEach(s => structs.add(s))
    }

    // Exclusion pass — remove structures explicitly excluded.
    // Examples: "CICs are not eligible", "no individuals", "for-profit
    // companies cannot apply".
    if (exclusionText.length > 0) {
      if (/\bcics?\b|community\s+interest\s+compan/.test(exclusionText)) {
        structs.delete('cic_guarantee'); structs.delete('cic_shares')
      }
      if (/\bindividuals?\b|sole\s+trader|freelance/.test(exclusionText)) {
        structs.delete('sole_trader')
      }
      if (/for[-\s]?profit|commercial\s+(?:companies|organisations|business)|private\s+(?:companies|business)|ltd\s+by\s+shares|limited\s+by\s+shares/.test(exclusionText)) {
        structs.delete('ltd_shares')
      }
      if (/unincorporated|informal\s+group/.test(exclusionText)) {
        structs.delete('unincorporated')
      }
      if (/\bcios?\b|charitable\s+incorporated\s+organisation/.test(exclusionText)) {
        structs.delete('cio')
      }
      if (/co.operative|\bcbs\b|community\s+benefit\s+society/.test(exclusionText)) {
        structs.delete('cooperative')
      }
    }

    if (structs.size > 0) {
      setReviewField(grant.id, 'eligible_structures', JSON.stringify(Array.from(structs)))
    }
  }



  function detectAll(grant: Grant) {
    detectEligibility(grant)
    detectLocation(grant)
    if (grant.funder_brief) populateFromBrief(grant)
  }

  const IMPACT_SECTOR_OPTIONS = [
    { value: 'community', label: 'Community' }, { value: 'young_people', label: 'Young People' },
    { value: 'health', label: 'Health' }, { value: 'mental_health', label: 'Mental Health' },
    { value: 'education', label: 'Education' }, { value: 'employment', label: 'Employment' },
    { value: 'creative', label: 'Arts & Culture' }, { value: 'environment', label: 'Environment' },
    { value: 'housing', label: 'Housing' }, { value: 'food', label: 'Food' },
    { value: 'sport', label: 'Sport' }, { value: 'heritage', label: 'Heritage' },
    { value: 'disability', label: 'Disability' }, { value: 'older_people', label: 'Older People' },
    { value: 'women', label: 'Women & Gender' }, { value: 'justice', label: 'Justice & Rights' },
    { value: 'tech', label: 'Technology' }, { value: 'financial', label: 'Financial Inclusion' },
    { value: 'international', label: 'International' },
    { value: 'social_economy', label: 'Social Economy' }, { value: 'social_innovation', label: 'Social Innovation' },
  ]
  const BENEFICIARY_OPTIONS = [
    { value: 'children', label: 'Children (under 16)' }, { value: 'young_people', label: 'Young People (16-25)' },
    { value: 'older_people', label: 'Older People (65+)' }, { value: 'families', label: 'Families' },
    { value: 'women_girls', label: 'Women & Girls' }, { value: 'men_boys', label: 'Men & Boys' },
    { value: 'lgbtq', label: 'LGBTQ+' }, { value: 'ethnic_minorities', label: 'Ethnic Minorities' },
    { value: 'refugees_migrants', label: 'Refugees & Migrants' }, { value: 'disabled_people', label: 'Disabled People' },
    { value: 'mental_health', label: 'Mental Health' }, { value: 'homeless', label: 'Homeless People' },
    { value: 'veterans', label: 'Veterans' }, { value: 'ex_offenders', label: 'Ex-Offenders' },
    { value: 'people_in_poverty', label: 'People in Poverty' }, { value: 'rural_communities', label: 'Rural Communities' },
    { value: 'general_public', label: 'General Public' },
  ]

  async function enrichGrantFromManagerWithSources(grant: Grant, sources: {label:string;url:string;text:string}[]) {
    if (enrichingId) return
    setEnrichingId(grant.id)
    setReviewEnrichError(e => ({ ...e, [grant.id]: '' }))
    const controller = new AbortController()
    const clientTimeout = setTimeout(() => controller.abort(), 55000)
    try {
      const filteredSources = sources.filter(s => s.text.trim().length > 50 || s.url.trim().length > 5)
      const res = await fetch('/api/admin/enrich-grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grantId: grant.id, additionalSources: filteredSources }),
        signal: controller.signal,
      })
      clearTimeout(clientTimeout)
      const json = await res.json()
      if (res.ok && json.brief) {
        const patch = (g: Grant) => g.id === grant.id ? { ...g, funder_brief: json.brief } : g
        setReviewGrants(prev => prev.map(patch))
        setGrants(prev => prev.map(patch))
        setRecentGrants(prev => prev.map(patch))
        setCategoryGrants(prev => prev.map(g => g.id === grant.id ? { ...g, funder_brief: json.brief } : g))
      } else {
        setReviewEnrichError(e => ({ ...e, [grant.id]: json.error ?? `Error ${res.status}` }))
      }
    } catch (err) {
      const msg = err instanceof Error && err.name === 'AbortError' ? 'Timed out — try pasting the page content directly' : 'Network error'
      setReviewEnrichError(e => ({ ...e, [grant.id]: msg }))
    } finally {
      clearTimeout(clientTimeout)
      setEnrichingId(null)
    }
  }

  // ── Bulk enrichment ──────────────────────────────────────────────────────────
  async function bulkEnrich() {
    if (bulkEnriching) return
    setBulkEnriching(true)
    setBulkEnrichDone(0)
    setBulkEnrichLog([])

    // Fetch all active grants then filter client-side for missing who_can_apply
    // (JSONB field filtering inside PostgREST .or() is unreliable for nested keys)
    const supabase = createClient()
    const { data: rawData } = await supabase
      .from('scraped_grants')
      .select('id, title, funder, apply_url, url_status, funder_brief, grant_sources, source, url_last_checked, is_invite_only')
      .eq('is_active', true)
      .not('apply_url', 'is', null)
    const targets = (rawData ?? []).filter(g =>
      !g.funder_brief || !(g.funder_brief as Record<string, unknown>).who_can_apply
    )

    if (targets.length === 0) {
      setBulkEnrichLog(['Nothing to enrich — all active grants already have up-to-date briefs.'])
      setBulkEnriching(false)
      return
    }

    setBulkEnrichTotal(targets.length)

    let done = 0
    for (const grant of targets) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 50000)
        const res = await fetch('/api/admin/enrich-grant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grantId: grant.id,
            // Pass saved sources so bulk re-enrich benefits from previously added context
            ...(grant.grant_sources && grant.grant_sources.length > 0
              ? { additionalSources: grant.grant_sources }
              : {}),
          }),
          signal: controller.signal,
        })
        clearTimeout(timeout)
        if (res.ok) {
          const { brief } = await res.json()
          const patch = (g: Grant) => g.id === grant.id ? { ...g, funder_brief: brief } : g
          setGrants(prev => prev.map(patch))
          setNewGrants(prev => prev.map(g => g.id === grant.id ? { ...g, funder_brief: brief } : g))
          setReviewGrants(prev => prev.map(g => g.id === grant.id ? { ...g, funder_brief: brief } : g))
          setSuspiciousGrants(prev => prev.map(g => g.id === grant.id ? { ...g, funder_brief: brief } : g))
          setBulkEnrichLog(prev => [...prev, `✓ ${grant.funder ?? ''} — ${grant.title}`])
        } else {
          const body = await res.json().catch(() => ({}))
          setBulkEnrichLog(prev => [...prev, `✗ ${grant.title}: ${body.error ?? res.status}`])
        }
      } catch {
        setBulkEnrichLog(prev => [...prev, `✗ ${grant.title}: timeout or network error`])
      }
      done++
      setBulkEnrichDone(done)
      // Small delay between requests to avoid hammering external sites
      await new Promise(r => setTimeout(r, 800))
    }

    setBulkEnriching(false)
  }

  // ── Reusable row actions (scraped grants only) ─────────────────────────────────
  function RowActions({ grant }: { grant: Grant }) {
    return confirmDeleteId === grant.id ? (
      <div className="flex items-center justify-end gap-1.5">
        <span className="text-xs text-coral-saturated font-medium mr-1">Remove?</span>
        <button onClick={() => removeGrant(grant.id, 'dead')} title="Remove completely (permanent)"
          className="rounded-full bg-coral-pale0 p-1.5 text-white hover:bg-coral-deep transition-colors">
          <Trash2 className="h-3 w-3" />
        </button>
        <button onClick={() => removeGrant(grant.id, 'review')} title="Send back to Needs Review"
          className="rounded-full bg-amber-500 p-1.5 text-white hover:bg-amber-600 transition-colors">
          <Clock className="h-3 w-3" />
        </button>
        <button onClick={() => setConfirmDeleteId(null)} title="Cancel"
          className="rounded-full border border-warm p-1.5 text-mid hover:border-forest hover:text-forest transition-colors">
          <X className="h-3 w-3" />
        </button>
      </div>
    ) : (
      <div className="flex items-center justify-end gap-1.5">
        {/* Funder intelligence enrichment — Brain icon, teal if enriched */}
        <button
          onClick={() => !grant.funder_brief && enrichGrantFromManager(grant)}
          disabled={enrichingId === grant.id}
          title={grant.funder_brief ? 'Funder brief enriched ✓' : 'Enrich with funder intelligence'}
          className={`rounded-full border p-1.5 transition-colors disabled:opacity-40 ${
            grant.funder_brief
              ? 'border-[#008080]/30 bg-[#008080]/10 text-[#008080] cursor-default'
              : 'border-warm text-mid hover:border-[#008080] hover:text-[#008080]'
          }`}
        >
          {enrichingId === grant.id
            ? <RefreshCw className="h-3 w-3 animate-spin" />
            : <Brain className="h-3 w-3" />
          }
        </button>
        <button
          onClick={() => fetchGrantInfo(grant)}
          disabled={refreshingId === grant.id}
          title="Search web for latest grant info"
          className="rounded-full border border-warm p-1.5 text-mid hover:border-forest hover:text-forest transition-colors disabled:opacity-40"
        >
          {refreshingId === grant.id
            ? <RefreshCw className="h-3 w-3 animate-spin" />
            : <Search className="h-3 w-3" />
          }
        </button>
        <button
          onClick={() => toggleInviteOnly(grant.id, grant.is_invite_only)}
          title={grant.is_invite_only ? 'Mark as open application' : 'Mark as invite-only'}
          className={`rounded-full border p-1.5 transition-colors ${
            grant.is_invite_only
              ? 'border-amber-mid bg-amber-pale text-amber-deep hover:bg-amber-pale'
              : 'border-warm text-mid hover:border-amber-mid hover:text-amber-deep'
          }`}
        >
          <Mail className="h-3 w-3" />
        </button>
        <button
          onClick={() => { setEditingId(grant.id); setEditUrl(grant.apply_url ?? '') }}
          title="Edit URL"
          className="rounded-full border border-warm p-1.5 text-mid hover:border-forest hover:text-forest transition-colors"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={() => {
            if (expandedReviewId === grant.id) {
              // Closing while open: persist any pending edits, otherwise just collapse.
              if (Object.keys(reviewEdits[grant.id] ?? {}).length > 0) saveGrantEdits(grant)
              else setExpandedReviewId(null)
            } else {
              setExpandedReviewId(grant.id)
            }
          }}
          title="Review & edit fields (location, amounts, eligibility…)"
          className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${expandedReviewId === grant.id ? 'bg-forest text-white' : 'bg-forest/10 text-forest hover:bg-forest hover:text-white'}`}
        >
          {expandedReviewId === grant.id ? 'Close' : 'Review'}
        </button>
        {grant.url_status !== 'ok' && (
          <button onClick={() => markOk(grant.id)} title="Approve — mark URL as ok"
            className="rounded-full border border-warm p-1.5 text-mid hover:border-sage hover:text-sage transition-colors">
            <Check className="h-3 w-3" />
          </button>
        )}
        {grant.url_status !== 'dead' && (
          <button onClick={() => markDead(grant.id)} title="Flag as dead manually"
            className="rounded-full border border-warm p-1.5 text-mid hover:border-coral-mid hover:text-coral-saturated transition-colors">
            <X className="h-3 w-3" />
          </button>
        )}
        <button onClick={() => setConfirmDeleteId(grant.id)} title="Remove from database"
          className="rounded-full border border-warm p-1.5 text-mid hover:border-coral-mid hover:text-coral-saturated transition-colors">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    )
  }

  // ── Seed row actions (promotes on first edit, then runs normal action) ────────
  function SeedRowActions({ grant }: { grant: CategoryGrant }) {
    const isPromoting = promotingId === grant.id

    if (isPromoting) {
      return (
        <div className="flex items-center justify-end gap-2 text-xs text-mid">
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-forest" />
          <span>Saving…</span>
        </div>
      )
    }

    return (
      <div className="flex items-center justify-end gap-1.5">
        <button
          onClick={() => handleSeedAction(grant, newId => {
            // After promotion, find the promoted grant and search for its info
            const promotedGrant: Grant = {
              id: newId, title: grant.title, funder: grant.funder,
              apply_url: grant.apply_url, url_status: 'unchecked',
              url_last_checked: null, source: 'manual',
              is_invite_only: grant.is_invite_only,
            }
            fetchGrantInfo(promotedGrant)
          })}
          title="Search web for latest grant info"
          className="rounded-full border border-warm p-1.5 text-mid hover:border-forest hover:text-forest transition-colors"
        >
          <Sparkles className="h-3 w-3" />
        </button>
        <button
          onClick={() => handleSeedAction(grant, newId => toggleInviteOnly(newId, grant.is_invite_only))}
          title={grant.is_invite_only ? 'Mark as open application' : 'Mark as invite-only'}
          className={`rounded-full border p-1.5 transition-colors ${
            grant.is_invite_only
              ? 'border-amber-mid bg-amber-pale text-amber-deep hover:bg-amber-pale'
              : 'border-warm text-mid hover:border-amber-mid hover:text-amber-deep'
          }`}
        >
          <Mail className="h-3 w-3" />
        </button>
        <button
          onClick={() => handleSeedAction(grant, newId => {
            setEditingId(newId)
            setEditUrl(grant.apply_url ?? '')
          })}
          title="Edit URL"
          className="rounded-full border border-warm p-1.5 text-mid hover:border-forest hover:text-forest transition-colors"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={() => handleSeedAction(grant, newId => markDead(newId))}
          title="Flag as dead manually"
          className="rounded-full border border-warm p-1.5 text-mid hover:border-coral-mid hover:text-coral-saturated transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
        <button
          onClick={() => handleSeedAction(grant, newId => setConfirmDeleteId(newId))}
          title="Remove from database"
          className="rounded-full border border-warm p-1.5 text-mid hover:border-coral-mid hover:text-coral-saturated transition-colors"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    )
  }

  // ── URL cell (editable for scraped, link-only for seed) ───────────────────────
  function UrlCell({ grant, isSeed = false }: { grant: Grant; isSeed?: boolean }) {
    if (!isSeed && editingId === grant.id) {
      return (
        <div className="flex items-center gap-2">
          <input autoFocus type="url" value={editUrl} onChange={e => setEditUrl(e.target.value)}
            className="flex-1 min-w-0 rounded-lg border border-warm px-2 py-1 text-xs focus:border-forest focus:outline-none"
            placeholder="https://funder.org/apply" />
          <button onClick={() => saveUrl(grant.id)} disabled={saving}
            className="flex-shrink-0 rounded-full bg-forest p-1.5 text-white disabled:opacity-50">
            <Check className="h-3 w-3" />
          </button>
          <button onClick={() => setEditingId(null)}
            className="flex-shrink-0 rounded-full border border-warm p-1.5 text-mid">
            <X className="h-3 w-3" />
          </button>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-1.5">
        {grant.apply_url ? (
          <>
            <a href={grant.apply_url} target="_blank" rel="noopener noreferrer"
              className="truncate text-xs text-forest hover:underline max-w-[230px] block">
              {grant.apply_url}
            </a>
            <a href={grant.apply_url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
              <ExternalLink className="h-3 w-3 text-light hover:text-forest transition-colors" />
            </a>
          </>
        ) : (
          <span className="text-xs text-light italic">No URL set</span>
        )}
      </div>
    )
  }

  // ── Status badge ──────────────────────────────────────────────────────────────
  function StatusBadge({ status }: { status: 'ok' | 'dead' | 'unchecked' }) {
    if (status === 'ok') return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sage/10 px-2 py-0.5 text-[10px] font-semibold text-sage">
        <CheckCircle className="h-2.5 w-2.5" /> ok
      </span>
    )
    if (status === 'dead') return (
      <span className="inline-flex items-center gap-1 rounded-full bg-coral-pale px-2 py-0.5 text-[10px] font-semibold text-coral-saturated">
        <AlertTriangle className="h-2.5 w-2.5" /> dead
      </span>
    )
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-semibold text-gold">
        <Clock className="h-2.5 w-2.5" /> unchecked
      </span>
    )
  }

  // Shared Review & Edit panel — used in Needs Review tab AND inline on approved grants
  function renderReviewPanel(grant: Grant, mode: 'review' | 'approved') {
    return (
      <div className="mx-3 mb-1 rounded-xl border border-forest/20 bg-[#f0fdf9] p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-forest">
            {mode === 'review' ? 'Review & edit before publishing' : 'Review & edit fields'}
          </p>
          <button onClick={() => detectAll(grant)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full text-white transition-colors" style={{ backgroundColor: '#173404' }}>
            <Sparkles className="w-3 h-3" /> Detect all
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs mb-3">
          <div><label className="text-mid block mb-0.5">Funder type</label>
            <select value={String(getReviewVal(grant.id,'funder_type',grant.funder_type??'') )} onChange={e=>setReviewField(grant.id,'funder_type',e.target.value)} className="form-select text-xs py-1 w-full">
              {['trust_foundation','community_foundation','corporate_foundation','local_authority','corporate','lottery','government','capacity_builder','competition','loan','other'].map(v=><option key={v} value={v}>{v.replace(/_/g,' ').replace(/\w/g,c=>c.toUpperCase())}</option>)}
            </select></div>
          <div><label className="text-mid block mb-0.5">Funding type</label>
            <select value={String(getReviewVal(grant.id,'funding_type',grant.funding_type??'grant'))} onChange={e=>setReviewField(grant.id,'funding_type',e.target.value)} className="form-select text-xs py-1 w-full">
              {['grant','programme','investment','in_kind'].map(v=><option key={v} value={v}>{v.replace(/_/g,' ').replace(/\w/g,c=>c.toUpperCase())}</option>)}
            </select></div>
          <div><label className="text-mid block mb-0.5">Location tag</label>
            <input type="text" value={String(getReviewVal(grant.id,'location_tag',grant.location_tag ?? ''))} onChange={e=>setReviewField(grant.id,'location_tag',e.target.value)} className="form-input text-xs py-1 w-full" placeholder="e.g. UK, London, Sussex" /></div>
          <div><label className="text-mid block mb-0.5">Amount min (£)</label>
            <input type="number" value={String(getReviewVal(grant.id,'amount_min',grant.amount_min ?? ''))} onChange={e=>setReviewField(grant.id,'amount_min',e.target.value)} className="form-input text-xs py-1 w-full" placeholder="e.g. 5000" /></div>
          <div><label className="text-mid block mb-0.5">Amount max (£)</label>
            <input type="number" value={String(getReviewVal(grant.id,'amount_max',grant.amount_max ?? ''))} onChange={e=>setReviewField(grant.id,'amount_max',e.target.value)} className="form-input text-xs py-1 w-full" placeholder="e.g. 50000" /></div>
          <div><label className="text-mid block mb-0.5">Deadline</label>
            <input
              type="text"
              value={String(getReviewVal(grant.id,'deadline',grant.deadline ?? ''))}
              onChange={e=>{
                setReviewField(grant.id,'deadline',e.target.value)
                // Typing a deadline implies the grant isn't rolling — clear the
                // rolling flag automatically so the two states stay consistent.
                if (e.target.value.trim()) {
                  setReviewField(grant.id,'is_rolling',false)
                }
              }}
              className="form-input text-xs py-1 w-full"
              placeholder="YYYY-MM-DD"
            /></div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`rolling-${mode}-${grant.id}`}
              checked={Boolean(getReviewVal(grant.id,'is_rolling',grant.is_rolling ?? false))}
              onChange={e=>{
                setReviewField(grant.id,'is_rolling',e.target.checked)
                // Marking as rolling implies no deadline — clear it so
                // the two states stay consistent.
                if (e.target.checked) {
                  setReviewField(grant.id,'deadline','')
                }
              }}
              className="h-3.5 w-3.5 accent-forest"
            />
            <label htmlFor={`rolling-${mode}-${grant.id}`} className="text-xs text-mid cursor-pointer">Rolling deadline</label>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id={`invite-${mode}-${grant.id}`} checked={Boolean(getReviewVal(grant.id,'is_invite_only',grant.is_invite_only))} onChange={e=>setReviewField(grant.id,'is_invite_only',e.target.checked)} className="h-3.5 w-3.5 accent-forest" />
            <label htmlFor={`invite-${mode}-${grant.id}`} className="text-xs text-mid cursor-pointer">Invite only</label>
          </div>
          <button onClick={() => detectLocation(grant)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border border-forest/30 text-forest hover:bg-forest/10 transition-colors">
            <MapPin className="w-3 h-3" /> Detect location
          </button>
        </div>

        {/* Eligibility — who can apply */}
        <div className="mt-3 pt-3 border-t border-forest/10">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-forest">Eligible structures</p>
            <button onClick={() => detectEligibility(grant)}
              className="flex items-center gap-1 text-xs font-semibold text-forest hover:text-sage transition-colors">
              <Sparkles className="w-3 h-3" /> Detect
            </button>
          </div>
          {(() => {
            const current: string[] = (() => { const v = getReviewVal(grant.id,'eligible_structures',null); if(v){try{return JSON.parse(String(v))}catch{return[]}} return grant.eligible_structures??[] })()
            return (
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {STRUCTURE_OPTIONS.map(opt => (
                  <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={current.includes(opt.value)} className="h-3.5 w-3.5 accent-forest"
                      onChange={e => { const next = e.target.checked ? [...current.filter(s=>s!==opt.value),opt.value] : current.filter(s=>s!==opt.value); setReviewField(grant.id,'eligible_structures',JSON.stringify(next)) }} />
                    <span className="text-xs text-mid">{opt.label}</span>
                  </label>
                ))}
              </div>
            )
          })()}
        </div>
        <div className="flex items-center gap-3 pt-3 border-t border-forest/10">
          <button onClick={() => enrichGrantFromManager(grant)} disabled={!!enrichingId}
            className="flex items-center gap-1.5 rounded-full border border-forest/40 px-3 py-1.5 text-xs font-semibold text-forest hover:bg-forest/10 transition-colors disabled:opacity-40">
            <Sparkles className="w-3 h-3" />{enrichingId === grant.id ? 'Enriching…' : grant.funder_brief ? 'Re-enrich' : 'Enrich'}
          </button>
          {grant.funder_brief && (
            <>
              <span className="text-xs text-sage font-medium">✓ Enriched</span>
              <button onClick={() => populateFromBrief(grant)}
                className="text-xs font-semibold text-amber-600 hover:text-amber-700 underline underline-offset-2 transition-colors">
                Populate fields
              </button>
            </>
          )}
          {reviewEnrichError[grant.id] && (
            <span className="text-xs text-coral-saturated">{reviewEnrichError[grant.id]}</span>
          )}
          <button onClick={() => setReviewSourcesOpen(o => ({ ...o, [grant.id]: !o[grant.id] }))}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border rounded-full transition-colors"
            style={{ borderColor: reviewSourcesOpen[grant.id] ? '#173404' : '#E8E0D1', color: reviewSourcesOpen[grant.id] ? '#173404' : '#5F5E5A', backgroundColor: reviewSourcesOpen[grant.id] ? 'rgba(31,92,82,0.08)' : 'white' }}>
            <BookOpen className="w-3 h-3" />
            {(reviewSources[grant.id]?.length ?? 0) > 0 ? `${reviewSources[grant.id].length} source${reviewSources[grant.id].length > 1 ? 's' : ''}` : 'Sources'}
          </button>
        </div>
        {reviewSourcesOpen[grant.id] && (
          <div className="mt-2 p-3 rounded-lg border border-[#E8E0D1] bg-[#faf8f5] space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-charcoal">Additional sources</p>
              <div className="flex items-center gap-2">
                <button onClick={() => addReviewSource(grant.id)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white rounded-full" style={{ backgroundColor: '#173404' }}>
                  <PlusCircle className="w-3 h-3" />Add source
                </button>
                {(reviewSources[grant.id]?.length ?? 0) > 0 && (
                  <button onClick={() => enrichGrantFromManagerWithSources(grant, reviewSources[grant.id] ?? [])} disabled={!!enrichingId}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white rounded-full disabled:opacity-40" style={{ backgroundColor: '#8ECB3C', color: '#2C2C2A' }}>
                    <Sparkles className="w-3 h-3" />{enrichingId === grant.id ? 'Enriching…' : 'Enrich with sources'}
                  </button>
                )}
              </div>
            </div>
            {(reviewSources[grant.id] ?? []).length === 0 && <p className="text-xs text-light italic">Add a URL or paste content to improve enrichment quality.</p>}
            {(reviewSources[grant.id] ?? []).map((src, idx) => (
              <div key={idx} className="bg-white border border-[#E8E0D1] p-2 rounded-lg space-y-1.5">
                <div className="flex items-center gap-2">
                  <input type="text" placeholder="Label (optional)" value={src.label} onChange={e=>updateReviewSource(grant.id,idx,'label',e.target.value)}
                    className="flex-1 text-xs border border-[#E8E0D1] rounded px-2 py-1 outline-none focus:border-forest" />
                  <button onClick={()=>removeReviewSource(grant.id,idx)} className="text-light hover:text-coral-saturated transition-colors"><X className="w-3 h-3" /></button>
                </div>
                <input type="url" placeholder="URL (fetched automatically)" value={src.url} onChange={e=>updateReviewSource(grant.id,idx,'url',e.target.value)}
                  className="w-full text-xs border border-[#E8E0D1] rounded px-2 py-1 outline-none focus:border-forest" />
                <textarea placeholder="Or paste content directly…" value={src.text} onChange={e=>updateReviewSource(grant.id,idx,'text',e.target.value)} rows={2}
                  className="w-full text-xs border border-[#E8E0D1] rounded px-2 py-1 outline-none focus:border-forest resize-none" />
              </div>
            ))}
          </div>
        )}
        {/* Funder brief preview */}
        {grant.funder_brief && (() => {
          const brief = grant.funder_brief as Record<string, string | null>
          const LABELS: Record<string, string> = {
            what_they_fund: 'What they fund',
            who_can_apply: 'Who can apply',
            geographic_focus: 'Geographic focus',
            priorities: 'Priorities',
            strong_application: 'Strong application',
            exclusions: 'Exclusions',
            typical_award: 'Typical award',
            decision_timeline: 'Decision timeline',
            funder_tips: 'Tips',
          }
          const entries = Object.entries(LABELS)
            .filter(([k]) => brief[k])
            .map(([k, label]) => ({ label, value: brief[k]! }))
          if (entries.length === 0) return null
          return (
            <div className="mt-3 pt-3 border-t border-forest/10 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-forest">Funder intelligence</p>
              {entries.map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[10px] font-semibold text-mid uppercase tracking-wide">{label}</p>
                  <p className="text-xs text-charcoal leading-relaxed">{value}</p>
                </div>
              ))}
            </div>
          )
        })()}
        <div className="flex items-center gap-3 pt-3 border-t border-forest/10">
          <div className="flex-1" />
          <button onClick={() => { setReviewEdits(s => { const n = { ...s }; delete n[grant.id]; return n }); setExpandedReviewId(null) }} className="rounded-full border border-warm px-3 py-1.5 text-xs font-semibold text-mid hover:border-charcoal transition-colors">Cancel</button>
          {mode === 'review' ? (
            <button onClick={() => publishReviewGrant(grant)} disabled={reviewPublishing[grant.id]}
              className="rounded-full bg-forest px-4 py-1.5 text-xs font-semibold text-white hover:bg-sage transition-colors disabled:opacity-40">
              {reviewPublishing[grant.id] ? 'Publishing…' : '✓ Confirm & Publish'}
            </button>
          ) : (
            <button onClick={() => saveGrantEdits(grant)} disabled={reviewPublishing[grant.id]}
              className="rounded-full bg-forest px-4 py-1.5 text-xs font-semibold text-white hover:bg-sage transition-colors disabled:opacity-40">
              {reviewPublishing[grant.id] ? 'Saving…' : '✓ Save changes'}
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-forest">Grant Manager</h2>
          <p className="mt-1 text-sm text-mid">Review, classify, validate and manage your grant database</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowAddModal(true); setAddForm(BLANK_FORM); setAddError(null); setFetchUrl(''); setFetchError(null); setFetchedFrom(null) }}
            className="flex items-center gap-2 rounded-full border border-forest px-4 py-2.5 text-sm font-semibold text-forest hover:bg-forest/5 transition-colors whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Add funder
          </button>
          <button
            onClick={runValidation}
            disabled={running || auditing || classifying}
            className="flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 hover:bg-forest/90 transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Checking all URLs…' : 'Run validation'}
          </button>
          <button
            onClick={runAudit}
            disabled={running || auditing || classifying}
            className="flex items-center gap-2 rounded-full border-2 border-amber-500 bg-amber-50 px-5 py-2.5 text-sm font-semibold text-amber-700 disabled:opacity-60 hover:bg-amber-100 transition-colors whitespace-nowrap"
          >
            <Search className={`h-4 w-4 ${auditing ? 'animate-pulse' : ''}`} />
            {auditing ? 'Deep auditing…' : 'Run deep audit'}
          </button>
        </div>
      </div>

      {/* Audit progress banner */}
      {auditing && (
        <div className="mb-6 rounded-xl border border-amber-300/40 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-2">
          <div className="flex items-center justify-between">
            <span>
              {auditProgress
                ? `Deep auditing… ${auditProgress.checked} / ${auditProgress.total || '?'} · avg score ${auditProgress.avgScore} · ${auditProgress.dead} dead · ${auditProgress.closed} closed`
                : 'Starting deep URL audit…'}
            </span>
            <span className="text-xs text-amber-600">
              {auditProgress && auditProgress.total
                ? `${Math.round((auditProgress.checked / auditProgress.total) * 100)}%`
                : ''}
            </span>
          </div>
          {auditProgress && auditProgress.total > 0 && (
            <div className="h-1.5 w-full rounded-full bg-amber-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-500 transition-all duration-300"
                style={{ width: `${Math.min(100, Math.round((auditProgress.checked / auditProgress.total) * 100))}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Classify progress banner */}
      {classifying && (
        <div className="mb-6 rounded border border-charcoal/20 bg-charcoal/5 px-4 py-3 text-sm text-charcoal space-y-2">
          <div className="flex items-center justify-between">
            <span>
              {classifyProgress
                ? `Classifying… ${classifyProgress.classified} classified · ${classifyProgress.failed} failed · ${classifyProgress.total} processed`
                : 'Starting AI classification…'}
            </span>
            <span className="text-xs text-charcoal/60">running</span>
          </div>
          <div className="h-1.5 w-full rounded bg-charcoal/10 overflow-hidden">
            <div className="h-full rounded bg-charcoal animate-pulse" style={{ width: '100%' }} />
          </div>
        </div>
      )}

      {/* Classify result banner */}
      {classifyResult && !classifying && (
        <div className="mb-6 rounded border border-charcoal/20 bg-charcoal/5 px-4 py-3 text-sm text-charcoal">
          Classification complete — {classifyResult.classified} grants tagged
          {classifyResult.failed > 0 && ` · ${classifyResult.failed} failed`}
        </div>
      )}

      {/* Run result banners */}
      {running && (
        <div className="mb-6 rounded-xl border border-forest/20 bg-forest/5 px-4 py-3 text-sm text-forest space-y-2">
          <div className="flex items-center justify-between">
            <span>
              {validationProgress
                ? `Checking URLs… ${validationProgress.checked} / ${validationProgress.total || '?'} checked · ${validationProgress.ok} ok · ${validationProgress.dead} dead`
                : 'Starting URL validation…'}
            </span>
            <span className="text-xs text-forest/60">
              {validationProgress && validationProgress.total
                ? `${Math.round((validationProgress.checked / validationProgress.total) * 100)}%`
                : ''}
            </span>
          </div>
          {validationProgress && validationProgress.total > 0 && (
            <div className="h-1.5 w-full rounded-full bg-forest/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-forest transition-all duration-300"
                style={{ width: `${Math.min(100, Math.round((validationProgress.checked / validationProgress.total) * 100))}%` }}
              />
            </div>
          )}
        </div>
      )}
      {runResult && (
        <div className="mb-6 space-y-3">
          <div className="rounded-xl border border-sage/20 bg-sage/10 px-4 py-3 text-sm text-forest">
            ✓ Validation complete — {runResult.ok} ok, {runResult.dead} scraped grants flagged as dead
            {runResult.deadSeedGrants.length === 0 && ' · all seed grant links ok'}
          </div>
          {runResult.deadSeedGrants.length > 0 && (
            <div className="rounded-xl border border-coral-mid bg-coral-pale px-4 py-3 text-sm">
              <p className="font-semibold text-coral-deep mb-2">
                ⚠ {runResult.deadSeedGrants.length} seed grant{runResult.deadSeedGrants.length !== 1 ? 's' : ''} with dead links — update URLs in <code className="text-xs bg-coral-pale px-1 py-0.5 rounded">src/lib/grants.ts</code>
              </p>
              <ul className="space-y-1">
                {runResult.deadSeedGrants.map(g => (
                  <li key={g.id} className="flex items-start gap-2">
                    <span className="text-coral-saturated mt-0.5 flex-shrink-0">•</span>
                    <div className="min-w-0">
                      <span className="text-coral-deepest font-medium">{g.title}</span>
                      <span className="text-coral-saturated mx-1">·</span>
                      <span className="text-coral-saturated text-xs">{g.funder}</span>
                      <a href={g.url} target="_blank" rel="noopener noreferrer"
                        className="ml-2 text-xs text-coral-saturated hover:text-coral-saturated underline truncate">
                        {g.url}
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {promoteResult && (
        <div className={`mb-6 rounded-xl border px-4 py-3 text-sm ${promoteResult.message.startsWith('Error') ? 'border-coral-mid bg-coral-pale text-coral-deep' : 'border-sage/20 bg-sage/10 text-forest'}`}>
          {promoteResult.message.startsWith('Error') ? '✗' : '✓'} {promoteResult.message}
          {!promoteResult.message.startsWith('Error') && promoteResult.inserted > 0 && (
            <span className="ml-2 text-mid">Run URL validation now to check their links.</span>
          )}
        </div>
      )}

      {/* Stats strip */}
      {stats && (
        <div className="mb-7 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Total grants',   value: stats.total,         Icon: Database,      colour: 'text-charcoal', bg: 'bg-white',   border: 'border-warm'    },
            { label: 'Links verified', value: stats.ok,            Icon: CheckCircle,   colour: 'text-sage',     bg: 'bg-sage/5',  border: 'border-sage/20' },
            { label: 'Dead links',     value: stats.dead,          Icon: AlertTriangle, colour: 'text-coral-saturated',  bg: 'bg-coral-pale',  border: 'border-coral-mid' },
            { label: 'New this week',  value: stats.newCount ?? 0, Icon: Clock,         colour: 'text-gold',     bg: 'bg-gold/5',  border: 'border-gold/20' },
          ].map(s => (
            <div key={s.label} className={`rounded-2xl border ${s.border} ${s.bg} p-5 shadow-warm`}>
              <s.Icon className={`mb-2 h-5 w-5 ${s.colour}`} />
              <p className={`font-display text-3xl font-bold ${s.colour}`}>{s.value}</p>
              <p className="mt-1 text-xs text-mid">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Bulk enrichment panel */}
      <div className="mb-6 rounded-xl border border-warm bg-white p-4 shadow-warm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-charcoal flex items-center gap-1.5">
              <Brain className="h-4 w-4 text-[#008080]" />
              Bulk funder intelligence enrichment
            </p>
            <p className="mt-0.5 text-xs text-mid">
              {bulkEnriching
                ? `Enriching ${bulkEnrichDone} / ${bulkEnrichTotal}…`
                : bulkEnrichTotal > 0 && !bulkEnriching
                  ? `Done — processed ${bulkEnrichTotal} grants`
                  : 'Runs Claude on every active grant missing a funder brief'}
            </p>
          </div>
          <button
            onClick={bulkEnrich}
            disabled={bulkEnriching}
            className="flex items-center gap-2 rounded-lg bg-[#008080] px-4 py-2 text-sm font-medium text-white hover:bg-[#006666] disabled:opacity-50 transition-colors"
          >
            {bulkEnriching
              ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Enriching…</>
              : <><Brain className="h-3.5 w-3.5" /> Enrich all unenriched</>}
          </button>
        </div>
        {bulkEnriching && bulkEnrichTotal > 0 && (
          <div className="mt-3">
            <div className="h-1.5 w-full rounded-full bg-warm overflow-hidden">
              <div
                className="h-full rounded-full bg-[#008080] transition-all duration-300"
                style={{ width: `${Math.round((bulkEnrichDone / bulkEnrichTotal) * 100)}%` }}
              />
            </div>
          </div>
        )}
        {bulkEnrichLog.length > 0 && (
          <div className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-warm/40 p-3">
            {bulkEnrichLog.map((line, i) => (
              <p key={i} className={`text-xs font-mono ${line.startsWith('✓') ? 'text-forest' : 'text-coral-saturated'}`}>{line}</p>
            ))}
          </div>
        )}
      </div>

      {/* Filter tabs + search */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {([
          { key: 'review',     label: `Needs Review${stats?.reviewCount ? ` (${stats.reviewCount})` : ''}`, urgent: (stats?.reviewCount ?? 0) > 0 },
          { key: 'saved',      label: 'Saved for Later', urgent: false },
          { key: 'all',        label: 'All grants' },
          { key: 'recent',     label: 'Recently activated' },
          { key: 'new',        label: `New this week${stats ? ` (${stats.newCount ?? 0})` : ''}` },
          { key: 'category',   label: 'By Category' },
          { key: 'url_issues', label: `URL Issues${stats ? ` (${(stats.dead ?? 0) + (stats.unchecked ?? 0) + (stats.noUrl ?? 0)})` : ''}` },
        ] as const).map(tab => (
          <button key={tab.key}
            onClick={() => { setFilter(tab.key); setSearch(''); setCategorySearch(''); setFundingTypeTab('all') }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === tab.key
                ? 'bg-forest text-white'
                : ('urgent' in tab && tab.urgent)
                  ? 'border border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100'
                  : 'border border-warm bg-white text-mid hover:border-forest/30 hover:text-charcoal'
            }`}
          >
            {tab.key === 'category' && <Tag className="inline h-3 w-3 mr-1.5 -mt-0.5" />}
            {tab.label}
          </button>
        ))}

        {/* Funding type sub-tabs — only shown in All Grants */}
        {filter === 'all' && (
          <div className="w-full flex items-center gap-1.5 pt-1">
            {([
              { key: 'all',        label: 'All types',   count: Object.values(fundingTypeCounts).reduce((a, b) => a + b, 0) },
              { key: 'grant',      label: 'Grants',      count: fundingTypeCounts['grant'] ?? 0 },
              { key: 'programme',  label: 'Programmes',  count: fundingTypeCounts['programme'] ?? 0 },
              { key: 'investment', label: 'Investment',  count: fundingTypeCounts['investment'] ?? 0 },
              { key: 'in_kind',    label: 'In-Kind',     count: fundingTypeCounts['in_kind'] ?? 0 },
            ] as const).map(t => (
              <button key={t.key}
                onClick={() => { setFundingTypeTab(t.key); setSearch('') }}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  fundingTypeTab === t.key
                    ? 'bg-sage text-white'
                    : 'border border-warm bg-white text-mid hover:border-sage/50 hover:text-charcoal'
                }`}>
                {t.label}{t.count > 0 ? ` (${t.count})` : ''}
              </button>
            ))}
          </div>
        )}

        {/* Search — hidden for category (uses its own) */}
        {filter !== 'category' && (
          <div className="relative ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-light pointer-events-none" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or funder…"
              className="rounded-full border border-warm bg-white py-1.5 pl-8 pr-4 text-sm text-charcoal placeholder:text-light focus:border-forest focus:outline-none w-64" />
          </div>
        )}
      </div>

      {/* Query error */}
      {loadError && (
        <div className="mb-4 rounded-xl border border-coral-mid bg-coral-pale px-4 py-3 text-sm text-coral-deep">
          <strong>Database error:</strong> {loadError}
        </div>
      )}

      {/* ── BY CATEGORY view ──────────────────────────────────────────────────── */}
      {filter === 'category' && (
        <div className="space-y-3">
          {/* Category search */}
          <div className="relative mb-5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-light pointer-events-none" />
            <input type="text" value={categorySearch} onChange={e => setCategorySearch(e.target.value)}
              placeholder="Search across all categories…"
              className="w-full rounded-full border border-warm bg-white py-2 pl-8 pr-4 text-sm text-charcoal placeholder:text-light focus:border-forest focus:outline-none" />
          </div>

          {/* Accordion per category */}
          {CATEGORY_ORDER.map(type => {
            const grants = categoryGrouped[type] ?? []
            if (grants.length === 0 && !categorySearch) return null
            if (grants.length === 0) return null
            const meta = CATEGORY_META[type] ?? CATEGORY_META.other
            const isOpen = expandedCategories.has(type)
            const deadCount = grants.filter(g => !g.is_seed && g.url_status === 'dead').length

            return (
              <div key={type} className={`rounded-xl border ${meta.border} overflow-hidden shadow-warm`}>
                {/* Category header */}
                <button
                  onClick={() => toggleCategory(type)}
                  className={`w-full flex items-center justify-between px-5 py-4 ${meta.bg} hover:opacity-90 transition-opacity`}
                >
                  <div className="flex items-center gap-3">
                    {isOpen
                      ? <ChevronDown className={`h-4 w-4 ${meta.colour}`} />
                      : <ChevronRight className={`h-4 w-4 ${meta.colour}`} />
                    }
                    <span className={`font-semibold text-sm ${meta.colour}`}>{meta.label}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.bg} ${meta.colour} border ${meta.border}`}>
                      {grants.length}
                    </span>
                    {deadCount > 0 && (
                      <span className="rounded-full bg-coral-pale border border-coral-mid px-2.5 py-0.5 text-xs font-semibold text-coral-saturated">
                        {deadCount} dead
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-mid">
                    <span>{grants.filter(g => g.is_seed).length} seed</span>
                    <span className="text-light">·</span>
                    <span>{grants.filter(g => !g.is_seed).length} scraped</span>
                  </div>
                </button>

                {/* Grants table (when expanded) */}
                {isOpen && (
                  <div className="overflow-x-auto border-t border-warm/60 bg-white">
                    {grants.length === 0 ? (
                      <p className="py-8 text-center text-sm text-mid">No grants in this category</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-warm bg-warm/20 text-left text-xs font-semibold text-mid uppercase tracking-wider">
                            <th className="px-5 py-3">Grant / Funder</th>
                            <th className="px-5 py-3">URL</th>
                            <th className="px-5 py-3 text-center">Status</th>
                            <th className="px-5 py-3 text-center">Checked</th>
                            <th className="px-5 py-3" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-warm/60">
                          {grants.map(grant => (
                            <React.Fragment key={`${grant.is_seed ? 'seed' : 'db'}-${grant.id}`}>
                            <tr className="hover:bg-cream/50 transition-colors">

                              {/* Title + funder + source badge */}
                              <td className="px-5 py-3 max-w-[220px]">
                                {editingTitleId === grant.id ? (
                                  <div className="flex items-center gap-1 mb-0.5">
                                    <input
                                      autoFocus
                                      type="text"
                                      value={editTitleValue}
                                      onChange={e => setEditTitleValue(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') saveTitle(grant.id)
                                        if (e.key === 'Escape') setEditingTitleId(null)
                                      }}
                                      className="flex-1 min-w-0 rounded-lg border border-sage px-2 py-1 text-xs font-medium focus:border-forest focus:outline-none"
                                    />
                                    <button onClick={() => saveTitle(grant.id)} disabled={savingTitle}
                                      className="flex-shrink-0 rounded-full bg-forest p-1 text-white disabled:opacity-50">
                                      <Check className="h-3 w-3" />
                                    </button>
                                    <button onClick={() => setEditingTitleId(null)}
                                      className="flex-shrink-0 rounded-full border border-warm p-1 text-mid hover:text-charcoal">
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-start gap-1 group">
                                    <p className="font-medium text-charcoal leading-snug line-clamp-2 flex-1">{grant.title}</p>
                                    <button
                                      onClick={() => { setEditingTitleId(grant.id); setEditTitleValue(grant.title) }}
                                      className="flex-shrink-0 mt-0.5 p-0.5 text-mid opacity-0 group-hover:opacity-100 hover:text-forest transition-all"
                                      title="Edit title">
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
                                <p className="text-xs text-mid mt-0.5">{grant.funder ?? '—'}</p>
                                <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  grant.is_seed
                                    ? 'bg-forest/10 text-forest'
                                    : 'bg-blue-50 text-blue-600'
                                }`}>
                                  {grant.is_seed ? 'seed' : grant.source}
                                </span>
                              </td>

                              {/* URL */}
                              <td className="px-5 py-3 max-w-[280px]">
                                <UrlCell grant={grant} isSeed={grant.is_seed} />
                              </td>

                              {/* Status */}
                              <td className="px-5 py-3 text-center">
                                {grant.is_seed && !grant.apply_url
                                  ? <span className="text-xs text-light italic">—</span>
                                  : <StatusBadge status={grant.url_status} />
                                }
                              </td>

                              {/* Last checked */}
                              <td className="px-5 py-3 text-center text-xs text-light whitespace-nowrap">
                                {grant.url_last_checked
                                  ? new Date(grant.url_last_checked).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                                  : '—'}
                              </td>

                              {/* Actions */}
                              <td className="px-5 py-3">
                                {grant.is_seed ? (
                                  <SeedRowActions grant={grant} />
                                ) : (
                                  <RowActions grant={grant} />
                                )}
                              </td>
                            </tr>
                            {!grant.is_seed && expandedReviewId === grant.id && (
                              <tr>
                                <td colSpan={5} className="px-0 pb-2">
                                  {renderReviewPanel(grant, 'approved')}
                                </td>
                              </tr>
                            )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          <p className="mt-2 text-xs text-light text-center">
            {categoryGrants.length} total grants across {Object.keys(categoryGrouped).length} categories
            {categorySearch && ` · filtered to "${categorySearch}"`}
          </p>
        </div>
      )}

      {/* ── Batch actions bar ────────────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="sticky top-4 z-20 flex items-center justify-between rounded-xl border border-coral-mid bg-coral-pale px-5 py-3 shadow-lg">
          <p className="text-sm font-semibold text-coral-deep">
            {selectedIds.size} grant{selectedIds.size !== 1 ? 's' : ''} selected
          </p>
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedIds(new Set())}
              className="text-xs text-coral-saturated hover:text-coral-saturated transition-colors">
              Clear
            </button>
            <button onClick={batchDelete} disabled={batchDeleting}
              className="rounded-full bg-coral-pale0 px-4 py-1.5 text-xs font-semibold text-white hover:bg-coral-deep transition-colors disabled:opacity-50">
              {batchDeleting ? 'Hiding…' : `Hide ${selectedIds.size} selected`}
            </button>
          </div>
        </div>
      )}

      {/* ── New grants table ──────────────────────────────────────────────────── */}
      {filter === 'new' && (() => {
        const q = search.trim().toLowerCase()
        const filtered = newGrants.filter(g =>
          !q || g.title.toLowerCase().includes(q) || (g.funder ?? '').toLowerCase().includes(q) || g.source.toLowerCase().includes(q)
        )
        const filteredIds = filtered.map(g => g.id)
        const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.has(id))
        return (
          <div className="rounded-xl border border-warm bg-white overflow-hidden shadow-card">
            {filtered.length === 0 ? (
              <div className="py-16 text-center">
                <CheckCircle className="mx-auto mb-3 h-8 w-8 text-sage" />
                <p className="text-mid text-sm">{q ? `No new grants matching "${q}"` : 'No new grants in the last 7 days'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-warm bg-warm/30 text-left text-xs font-semibold text-mid uppercase tracking-wider">
                      <th className="px-3 py-3 w-8">
                        <input type="checkbox" checked={allSelected} onChange={() => toggleSelectAll(filteredIds)}
                          className="h-3.5 w-3.5 rounded accent-forest cursor-pointer" />
                      </th>
                      <th className="px-5 py-3">Grant / Funder</th>
                      <th className="px-5 py-3">Source</th>
                      <th className="px-5 py-3">URL</th>
                      <th className="px-5 py-3 text-center">Status</th>
                      <th className="px-5 py-3 text-center">Added</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm/60">
                    {filtered.map(grant => (
                      <tr className={`hover:bg-cream/50 transition-colors ${selectedIds.has(grant.id) ? 'bg-coral-pale' : ''}`}>
                        <td className="px-3 py-3 w-8">
                          <input type="checkbox" checked={selectedIds.has(grant.id)} onChange={() => toggleSelect(grant.id)}
                            className="h-3.5 w-3.5 rounded accent-forest cursor-pointer" />
                        </td>
                        <td className="px-5 py-3 max-w-[200px]">
                          <p className="font-medium text-charcoal leading-snug line-clamp-2">{grant.title}</p>
                          <p className="text-xs text-mid mt-0.5">{grant.funder ?? '—'}</p>
                        </td>
                        <td className="px-5 py-3 max-w-[160px]">
                          <p className="text-xs text-charcoal truncate">{grant.source}</p>
                          {newSources.has(grant.source) && (
                            <span className="inline-block mt-1 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              ✦ New source
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 max-w-[260px]">
                          <UrlCell grant={grant} />
                        </td>
                        <td className="px-5 py-3 text-center">
                          <StatusBadge status={grant.url_status} />
                        </td>
                        <td className="px-5 py-3 text-center text-xs text-light whitespace-nowrap">
                          {new Date((grant as NewGrant).first_seen_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </td>
                        <td className="px-5 py-3">
                          <RowActions grant={grant} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Seed grants table ─────────────────────────────────────────────────── */}
      {filter === 'seed' && (
        <div className="rounded-xl border border-warm bg-white overflow-hidden shadow-card">
          {filteredSeedGrants.length === 0 ? (
            <div className="py-16 text-center">
              <Search className="mx-auto mb-3 h-8 w-8 text-light" />
              <p className="text-mid text-sm">No seed grants match &ldquo;{search}&rdquo;</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-warm bg-warm/30 text-left text-xs font-semibold text-mid uppercase tracking-wider">
                    <th className="px-5 py-3">Grant / Funder</th>
                    <th className="px-5 py-3">URL</th>
                    <th className="px-5 py-3 text-center">Amount</th>
                    <th className="px-5 py-3 text-center">Rolling</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm/60">
                  {filteredSeedGrants.map(grant => (
                    <tr key={grant.id} id={`grant-row-${grant.id}`} className="hover:bg-cream/50 transition-colors">
                      <td className="px-5 py-3 max-w-[220px]">
                        <p className="font-medium text-charcoal leading-snug line-clamp-2">{grant.title}</p>
                        <p className="text-xs text-mid mt-0.5">{grant.funder}</p>
                        <span className="inline-block mt-1 rounded-full bg-forest/10 px-2 py-0.5 text-[10px] font-semibold text-forest">
                          {grant.id}
                        </span>
                      </td>
                      <td className="px-5 py-3 max-w-[320px]">
                        {grant.applyUrl ? (
                          <div className="flex items-center gap-1.5">
                            <a href={grant.applyUrl} target="_blank" rel="noopener noreferrer"
                              className="truncate text-xs text-forest hover:underline max-w-[270px] block">
                              {grant.applyUrl}
                            </a>
                            <a href={grant.applyUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                              <ExternalLink className="h-3 w-3 text-light hover:text-forest transition-colors" />
                            </a>
                          </div>
                        ) : (
                          <span className="text-xs text-light italic">No URL set</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center text-xs text-mid whitespace-nowrap">
                        {grant.amountMin || grant.amountMax
                          ? `£${(grant.amountMin ?? 0).toLocaleString()} – £${(grant.amountMax ?? 0).toLocaleString()}`
                          : '—'}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {grant.isRolling ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-sage/10 px-2 py-0.5 text-[10px] font-semibold text-sage">
                            <CheckCircle className="h-2.5 w-2.5" /> rolling
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-semibold text-gold">
                            <Clock className="h-2.5 w-2.5" /> deadline
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Review queue ──────────────────────────────────────────────────────── */}
      {filter === 'saved' && (
        <SavedForLaterTab />
      )}

      {filter === 'review' && (
        <div className="rounded-xl border border-warm bg-white overflow-hidden shadow-card">
          {/* Header with bulk actions */}
          <div className="flex items-center justify-between border-b border-warm bg-amber-50 px-5 py-3">
            <div>
              <p className="text-sm font-semibold text-amber-800">
                {reviewGrants.length} grant{reviewGrants.length !== 1 ? 's' : ''} pending review
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                These were scraped automatically and are not yet visible to users. Approve the ones that look legitimate.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={approveAllReview} disabled={approvingAll || reviewGrants.length === 0}
                className="rounded-full bg-forest px-4 py-1.5 text-xs font-semibold text-white hover:bg-forest/80 transition-colors disabled:opacity-50">
                {approvingAll ? 'Approving…' : `Approve all ${reviewGrants.length}`}
              </button>
            </div>
          </div>
          {reviewGrants.length === 0 ? (
            <div className="py-16 text-center">
              <CheckCircle className="mx-auto mb-3 h-8 w-8 text-sage" />
              <p className="text-mid text-sm">No grants pending review — all clear!</p>
            </div>
          ) : (() => {
            const reviewIds = reviewGrants.map(g => g.id)
            const allReviewSelected = reviewIds.length > 0 && reviewIds.every(id => selectedIds.has(id))
            return (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-warm bg-warm/30 text-left text-xs font-semibold text-mid uppercase tracking-wider">
                    <th className="px-3 py-3 w-8">
                      <input type="checkbox" checked={allReviewSelected} onChange={() => toggleSelectAll(reviewIds)}
                        className="h-3.5 w-3.5 rounded accent-forest cursor-pointer" />
                    </th>
                    <th className="px-5 py-3">Grant / Funder</th>
                    <th className="px-5 py-3">Description</th>
                    <th className="px-5 py-3">URL</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm/60">
                  {reviewGrants.map(grant => (
                    <React.Fragment key={grant.id}>
                    <tr className={`hover:bg-cream/50 transition-colors ${selectedIds.has(grant.id) ? 'bg-coral-pale' : ''}`}>
                      <td className="px-3 py-3 w-8">
                        <input type="checkbox" checked={selectedIds.has(grant.id)} onChange={() => toggleSelect(grant.id)}
                          className="h-3.5 w-3.5 rounded accent-forest cursor-pointer" />
                      </td>
                      <td className="px-5 py-3 max-w-[200px]">
                        <p className="font-medium text-charcoal leading-snug line-clamp-2">{grant.title}</p>
                        <p className="text-xs text-mid mt-0.5">{grant.funder}</p>
                        <span className="inline-block mt-1 rounded-full bg-warm px-2 py-0.5 text-[10px] text-mid">{grant.source}</span>
                        {(grant as Grant & { funding_type?: string }).funding_type && (() => {
                          const ft = (grant as Grant & { funding_type?: string }).funding_type!
                          const FT_STYLE: Record<string, { bg: string; color: string; label: string }> = {
                            grant:      { bg: 'rgba(132,204,22,0.15)', color: '#639922', label: 'Grant' },
                            programme:  { bg: 'rgba(251,146,60,0.15)', color: '#993C1D', label: 'Programme' },
                            investment: { bg: 'rgba(96,165,250,0.15)', color: '#0C447C', label: 'Investment' },
                            in_kind:    { bg: 'rgba(167,139,250,0.15)', color: '#BA7517', label: 'In-Kind' },
                          }
                          const s = FT_STYLE[ft] ?? { bg: '#f3f4f6', color: '#5F5E5A', label: ft }
                          return <span className="inline-block ml-1 mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span>
                        })()}
                        {grant.funder_type && grant.funder_type !== 'other' && (() => {
                          const FT_LABELS: Record<string, string> = {
                            trust_foundation: 'Trust', community_foundation: 'Community Fdn',
                            corporate: 'Corporate', lottery: 'Lottery', government: 'Government',
                            local_authority: 'Local Auth', capacity_builder: 'Capacity Bldr',
                          }
                          const label = FT_LABELS[grant.funder_type] ?? grant.funder_type
                          return <span className="inline-block ml-1 mt-1 rounded-full bg-[#f0f9ff] px-2 py-0.5 text-[10px] font-semibold text-[#0369a1]">{label}</span>
                        })()}
                      </td>
                      <td className="px-5 py-3 max-w-[280px]">
                        <p className="text-xs text-mid line-clamp-3">
                          {(grant as Grant & { description?: string }).description ?? <span className="italic text-light">No description</span>}
                        </p>
                      </td>
                      <td className="px-5 py-3 max-w-[220px]">
                        <UrlCell grant={grant} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => fetchGrantInfo(grant)} disabled={refreshingId === grant.id} title="Search for info & better URL"
                            className="rounded-full border border-warm p-1.5 text-mid hover:border-forest hover:text-forest transition-colors disabled:opacity-40">
                            {refreshingId === grant.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                          </button>
                          <button onClick={() => { setEditingId(grant.id); setEditUrl(grant.apply_url ?? '') }} title="Edit URL"
                            className="rounded-full border border-warm p-1.5 text-mid hover:border-forest hover:text-forest transition-colors">
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button onClick={() => {
                            if (expandedReviewId === grant.id) {
                              if (Object.keys(reviewEdits[grant.id] ?? {}).length > 0) saveGrantEdits(grant)
                              else setExpandedReviewId(null)
                            } else {
                              setExpandedReviewId(grant.id)
                            }
                          }}
                            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${expandedReviewId === grant.id ? 'bg-forest text-white' : 'bg-forest/10 text-forest hover:bg-forest hover:text-white'}`}>
                            {expandedReviewId === grant.id ? 'Close' : 'Review'}
                          </button>
                          <button onClick={async () => {
                            await fetch('/api/admin/update-grant', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: grant.id, fields: { saved_for_later: true } }) })
                            setReviewGrants(prev => prev.filter(g => g.id !== grant.id))
                          }}
                            className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-600 hover:bg-amber-500 hover:text-white transition-colors">
                            Save for later
                          </button>
                          <button onClick={() => removeGrant(grant.id)}
                            className="rounded-full bg-coral-pale px-3 py-1 text-xs font-semibold text-coral-saturated hover:bg-coral-pale0 hover:text-white transition-colors">
                            Hide
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedReviewId === grant.id && (
                      <tr>
                        <td colSpan={5} className="px-0 pb-2">
                          {renderReviewPanel(grant, 'review')}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            )
          })()}
        </div>
      )}

      {/* ── Recently activated tab (review-sweep) ──────────────────────────── */}
      {filter === 'recent' && (
        <div className="rounded-xl border border-warm bg-white overflow-hidden shadow-card">
          <div className="border-b border-warm bg-amber-50 px-5 py-3">
            <p className="text-sm font-semibold text-amber-800">
              {recentGrants.length} grant{recentGrants.length !== 1 ? 's' : ''} activated in the last 21 days
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Spot-check edits to <strong>eligible structures, beneficiaries, sectors, description</strong> and <strong>invite-only</strong> — fields the historical Confirm &amp; Publish bug used to drop. Rows tinted amber are missing one of those fields. Click <em>Review</em> to edit inline.
            </p>
          </div>
          {recentGrants.length === 0 ? (
            <div className="py-16 text-center">
              <CheckCircle className="mx-auto mb-3 h-8 w-8 text-sage" />
              <p className="text-mid text-sm">Nothing activated in the last 21 days.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-warm bg-warm/30 text-left text-xs font-semibold text-mid uppercase tracking-wider">
                    <th className="px-5 py-3">Grant / Funder</th>
                    <th className="px-3 py-3">First seen</th>
                    <th className="px-3 py-3">Eligible structures</th>
                    <th className="px-3 py-3">Beneficiaries</th>
                    <th className="px-3 py-3">Sectors</th>
                    <th className="px-3 py-3 text-center">Invite</th>
                    <th className="px-3 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm/60">
                  {recentGrants.map(grant => {
                    const g = grant as Grant & {
                      eligible_structures?: string[] | null
                      target_beneficiaries?: string[] | null
                      impact_sectors?: string[] | null
                      first_seen_at?: string | null
                    }
                    const flagged =
                      !g.eligible_structures || g.eligible_structures.length === 0 ||
                      !g.target_beneficiaries || g.target_beneficiaries.length === 0 ||
                      !g.impact_sectors || g.impact_sectors.length === 0 ||
                      !g.description || g.description.trim().length === 0
                    const arrSummary = (arr?: string[] | null) =>
                      arr && arr.length > 0
                        ? (arr.length > 3 ? `${arr.slice(0, 3).join(', ')} +${arr.length - 3}` : arr.join(', '))
                        : '—'
                    return (
                      <React.Fragment key={grant.id}>
                        <tr id={`grant-row-${grant.id}`} className={flagged ? 'bg-amber-50/40' : 'hover:bg-cream/50 transition-colors'}>
                          <td className="px-5 py-3 max-w-[260px]">
                            <p className="font-medium text-charcoal leading-snug line-clamp-2">{grant.title}</p>
                            <p className="text-xs text-mid mt-0.5">{grant.funder ?? '—'}</p>
                            {grant.apply_url && (
                              <a href={grant.apply_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-forest underline mt-1 inline-block break-all">
                                {grant.apply_url.replace(/^https?:\/\//, '').slice(0, 50)}
                              </a>
                            )}
                          </td>
                          <td className="px-3 py-3 text-xs text-mid whitespace-nowrap align-top">
                            {g.first_seen_at ? new Date(g.first_seen_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                          </td>
                          <td className="px-3 py-3 text-xs text-charcoal max-w-[200px] align-top">{arrSummary(g.eligible_structures)}</td>
                          <td className="px-3 py-3 text-xs text-charcoal max-w-[180px] align-top">{arrSummary(g.target_beneficiaries)}</td>
                          <td className="px-3 py-3 text-xs text-charcoal max-w-[180px] align-top">{arrSummary(g.impact_sectors)}</td>
                          <td className="px-3 py-3 text-center align-top">
                            {grant.is_invite_only ? <span className="text-xs text-coral-deep font-semibold">YES</span> : <span className="text-xs text-light">—</span>}
                          </td>
                          <td className="px-3 py-3 text-right align-top whitespace-nowrap">
                            <button onClick={() => {
                              if (expandedReviewId === grant.id) {
                                if (Object.keys(reviewEdits[grant.id] ?? {}).length > 0) saveGrantEdits(grant)
                                else setExpandedReviewId(null)
                              } else {
                                setExpandedReviewId(grant.id)
                              }
                            }}
                              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${expandedReviewId === grant.id ? 'bg-forest text-white' : 'bg-forest/10 text-forest hover:bg-forest hover:text-white'}`}>
                              {expandedReviewId === grant.id ? 'Close' : 'Review'}
                            </button>
                          </td>
                        </tr>
                        {expandedReviewId === grant.id && (
                          <tr>
                            <td colSpan={7} className="px-0 pb-2">
                              {renderReviewPanel(grant, 'approved')}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Suspicious grants table ──────────────────────────────────────────── */}
      {filter === 'suspicious' && (
        <div className="rounded-xl border border-warm bg-white overflow-hidden shadow-card">
          {suspiciousGrants.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-light text-sm">{stats?.suspiciousCount === 0 ? 'No suspicious URLs found — run a deep audit first.' : 'Loading…'}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-warm bg-neutral-50/60 text-left text-xs uppercase tracking-wide text-mid">
                <tr>
                  <th className="px-5 py-3 w-8"></th>
                  <th className="px-5 py-3 font-semibold">Grant</th>
                  <th className="px-5 py-3 font-semibold max-w-[260px]">URL</th>
                  <th className="px-5 py-3 font-semibold text-center">Score</th>
                  <th className="px-5 py-3 font-semibold">Issues</th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm/60">
                {suspiciousGrants.map(grant => (
                  <tr key={grant.id} id={`grant-row-${grant.id}`} className="group hover:bg-cream/40 transition-colors">
                    <td className="px-5 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(grant.id)}
                        onChange={() => setSelectedIds(prev => { const n = new Set(prev); n.has(grant.id) ? n.delete(grant.id) : n.add(grant.id); return n })}
                        className="rounded border-warm"
                      />
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-charcoal line-clamp-1">{grant.title}</p>
                      <p className="text-xs text-light">{grant.funder}</p>
                    </td>
                    <td className="px-5 py-3 max-w-[260px]">
                      <UrlCell grant={grant} />
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
                        (grant.url_quality_score ?? 0) < 30 ? 'bg-coral-pale text-coral-deep'
                        : (grant.url_quality_score ?? 0) < 60 ? 'bg-amber-100 text-amber-700'
                        : 'bg-green-100 text-green-700'
                      }`}>
                        {grant.url_quality_score ?? '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(grant.url_quality_issues ?? []).map(issue => (
                          <span key={issue} className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
                            {issue.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {confirmDeleteId === grant.id ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-xs text-coral-saturated font-medium mr-1">Remove?</span>
                          <button onClick={() => removeGrant(grant.id, 'dead')} title="Remove completely (permanent)"
                            className="rounded-full bg-coral-pale0 p-1.5 text-white hover:bg-coral-deep transition-colors">
                            <Trash2 className="h-3 w-3" />
                          </button>
                          <button onClick={() => removeGrant(grant.id, 'review')} title="Send back to Needs Review"
                            className="rounded-full bg-amber-500 p-1.5 text-white hover:bg-amber-600 transition-colors">
                            <Clock className="h-3 w-3" />
                          </button>
                          <button onClick={() => setConfirmDeleteId(null)} title="Cancel"
                            className="rounded-full border border-warm p-1.5 text-mid hover:border-forest hover:text-forest transition-colors">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => fetchGrantInfo(grant)} disabled={refreshingId === grant.id} title="Search for better info"
                            className="rounded-full border border-warm p-1.5 text-mid hover:border-forest hover:text-forest transition-colors disabled:opacity-40">
                            {refreshingId === grant.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                          </button>
                          <button onClick={() => { setEditingId(grant.id); setEditUrl(grant.apply_url ?? '') }} title="Edit URL"
                            className="rounded-full border border-warm p-1.5 text-mid hover:border-forest hover:text-forest transition-colors">
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button onClick={() => markOk(grant.id)} title="Mark as OK — clear suspicious flag"
                            className="rounded-full border border-warm p-1.5 text-mid hover:border-sage hover:text-sage transition-colors">
                            <Check className="h-3 w-3" />
                          </button>
                          <button onClick={() => markDead(grant.id)} title="Flag as dead"
                            className="rounded-full border border-warm p-1.5 text-mid hover:border-coral-mid hover:text-coral-saturated transition-colors">
                            <X className="h-3 w-3" />
                          </button>
                          <button onClick={() => setConfirmDeleteId(grant.id)} title="Remove from database"
                            className="rounded-full border border-warm p-1.5 text-mid hover:border-coral-mid hover:text-coral-saturated transition-colors">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="px-5 py-3 text-xs text-light text-center border-t border-warm/40">
            {suspiciousGrants.length} suspicious URL{suspiciousGrants.length !== 1 ? 's' : ''} (quality score &lt; 60) — worst first
          </p>
        </div>
      )}

      {/* ── Scraped grants table (dead / unchecked / all) ──────────────────────── */}
      {filter !== 'seed' && filter !== 'new' && filter !== 'category' && filter !== 'review' && filter !== 'suspicious' && (
        <div className="rounded-xl border border-warm bg-white overflow-hidden shadow-card">
          {grants.length === 0 ? (
            <div className="py-16 text-center">
              <CheckCircle className="mx-auto mb-3 h-8 w-8 text-sage" />
              <p className="text-mid text-sm">
                {filter === 'dead' ? 'No dead links found — run validation to check' : 'No results for this filter'}
              </p>
            </div>
          ) : (() => {
            const grantIds = grants.map(g => g.id)
            const allGrantsSelected = grantIds.length > 0 && grantIds.every(id => selectedIds.has(id))
            return (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-warm bg-warm/30 text-left text-xs font-semibold text-mid uppercase tracking-wider">
                    <th className="px-3 py-3 w-8">
                      <input type="checkbox" checked={allGrantsSelected} onChange={() => toggleSelectAll(grantIds)}
                        className="h-3.5 w-3.5 rounded accent-forest cursor-pointer" />
                    </th>
                    <th className="px-5 py-3">Grant / Funder</th>
                    <th className="px-5 py-3">URL</th>
                    <th className="px-5 py-3 text-center">Status</th>
                    <th className="px-5 py-3 text-center">Checked</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm/60">
                  {grants.map(grant => (
                    <React.Fragment key={grant.id}>
                    <tr className={`hover:bg-cream/50 transition-colors ${selectedIds.has(grant.id) ? 'bg-coral-pale' : ''}`}>
                      <td className="px-3 py-3 w-8">
                        <input type="checkbox" checked={selectedIds.has(grant.id)} onChange={() => toggleSelect(grant.id)}
                          className="h-3.5 w-3.5 rounded accent-forest cursor-pointer" />
                      </td>
                      <td className="px-5 py-3 max-w-[220px]">
                        <div className="flex items-start gap-1.5">
                          <p className="font-medium text-charcoal leading-snug line-clamp-2 flex-1">{grant.title}</p>
                          {grant.funding_type && grant.funding_type !== 'grant' && (
                            <span className={`shrink-0 mt-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                              grant.funding_type === 'programme'  ? 'bg-emerald-50 text-emerald-700' :
                              grant.funding_type === 'investment' ? 'bg-sky-50 text-sky-700' :
                              grant.funding_type === 'in_kind'    ? 'bg-violet-50 text-violet-700' :
                              'bg-warm text-mid'
                            }`}>{grant.funding_type === 'in_kind' ? 'In-Kind' : grant.funding_type}</span>
                          )}
                        </div>
                        <p className="text-xs text-mid mt-0.5">{grant.funder ?? '—'}</p>
                      </td>
                      <td className="px-5 py-3 max-w-[300px]">
                        <UrlCell grant={grant} />
                      </td>
                      <td className="px-5 py-3 text-center">
                        <StatusBadge status={grant.url_status} />
                      </td>
                      <td className="px-5 py-3 text-center text-xs text-light whitespace-nowrap">
                        {grant.url_last_checked
                          ? new Date(grant.url_last_checked).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                          : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <RowActions grant={grant} />
                      </td>
                    </tr>
                    {expandedReviewId === grant.id && (
                      <tr>
                        <td colSpan={6} className="px-0 pb-2">
                          {renderReviewPanel(grant, 'approved')}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            )
          })()}
        </div>
      )}

      {/* Footer hint */}
      {filter !== 'category' && (
        <p className="mt-4 text-xs text-light text-center">
          {filter === 'seed'
            ? `${filteredSeedGrants.length} seed grant${filteredSeedGrants.length !== 1 ? 's' : ''}${search ? ` matching "${search}"` : ''} · Edit URLs in src/lib/grants.ts`
            : filter === 'new'
            ? `${newGrants.length} new grant${newGrants.length !== 1 ? 's' : ''} in the last 7 days · ${newSources.size} new source${newSources.size !== 1 ? 's' : ''}`
            : filter === 'no_url'
            ? `${grants.length} grant${grants.length !== 1 ? 's' : ''} with no URL set — use Sparkles to find one`
            : `${grants.length} result${grants.length !== 1 ? 's' : ''}${search ? ` for "${search}"` : ''} · Sorted by oldest check first`
          }
        </p>
      )}

      {/* ── Refresh Info Modal ───────────────────────────────────────────────────── */}
      {refreshModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-warm">

            {/* Header */}
            <div className="sticky top-0 flex items-center justify-between border-b border-warm bg-white px-6 py-4 z-10">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-forest" />
                  <h3 className="font-display text-lg font-bold text-charcoal">Refresh Grant Info</h3>
                  {refreshModal.urlImproved && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Better URL found ✓</span>
                  )}
                  {refreshModal.urlWasDead && !refreshModal.urlImproved && (
                    <span className="rounded-full bg-coral-pale px-2 py-0.5 text-xs font-medium text-coral-deep">Old URL was dead</span>
                  )}
                </div>
                <p className="text-xs text-mid mt-0.5 truncate max-w-[420px]">
                  {refreshModal.grantUrl
                    ? <>AI-extracted from <a href={refreshModal.grantUrl} target="_blank" rel="noopener noreferrer" className="text-forest hover:underline">{refreshModal.grantUrl}</a></>
                    : <span className="text-coral-saturated">No URL found — please enter one manually below</span>
                  }
                </p>
              </div>
              <button onClick={() => setRefreshModal(null)}
                className="rounded-full border border-warm p-2 text-mid hover:border-forest hover:text-forest transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="rounded-xl border border-forest/20 bg-forest/5 px-4 py-3 text-xs text-forest">
                Review the fields below — edit anything that looks wrong before saving.
              </div>

              {refreshError && (
                <div className="rounded-xl border border-coral-mid bg-coral-pale px-4 py-3 text-sm text-coral-deep">{refreshError}</div>
              )}

              {/* Apply URL */}
              <div>
                <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">Apply URL</label>
                <div className="flex items-center gap-2">
                  <input type="url" value={refreshModal.form.apply_url}
                    onChange={e => setRefreshModal(m => m ? { ...m, form: { ...m.form, apply_url: e.target.value } } : m)}
                    placeholder="https://…"
                    className="flex-1 rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal placeholder:text-light focus:border-forest focus:outline-none" />
                  {/* Populate: fetch grant info from the entered URL */}
                  <button
                    onClick={repopulateModalFromUrl}
                    disabled={populatingFromUrl || !refreshModal.form.apply_url.trim()}
                    title="Fetch grant info from this URL"
                    className="flex-shrink-0 flex items-center gap-1.5 rounded-xl border border-forest bg-forest px-3 py-2.5 text-xs font-semibold text-white hover:bg-forest/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    {populatingFromUrl
                      ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      : <Sparkles className="h-3.5 w-3.5" />}
                    {populatingFromUrl ? 'Fetching…' : 'Populate'}
                  </button>
                  {refreshModal.form.apply_url && (
                    <a href={refreshModal.form.apply_url} target="_blank" rel="noopener noreferrer"
                      className="flex-shrink-0 rounded-xl border border-warm p-2.5 text-mid hover:border-forest hover:text-forest transition-colors">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
                {populateMsg
                  ? <p className="mt-1 text-xs text-forest font-medium">{populateMsg}</p>
                  : <p className="mt-1 text-xs text-light">Enter a URL then click Populate to auto-fill the fields below from that page.</p>
                }
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">Grant Title</label>
                <input type="text" value={refreshModal.form.title}
                  onChange={e => setRefreshModal(m => m ? { ...m, form: { ...m.form, title: e.target.value } } : m)}
                  className="w-full rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal focus:border-forest focus:outline-none" />
              </div>

              {/* Funder + Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">Funder Name</label>
                  <input type="text" value={refreshModal.form.funder}
                    onChange={e => setRefreshModal(m => m ? { ...m, form: { ...m.form, funder: e.target.value } } : m)}
                    className="w-full rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal focus:border-forest focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">Funder Type</label>
                  <select value={refreshModal.form.funder_type}
                    onChange={e => setRefreshModal(m => m ? { ...m, form: { ...m.form, funder_type: e.target.value } } : m)}
                    className="w-full rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal focus:border-forest focus:outline-none bg-white">
                    {FUNDER_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Funding Type + Subtype */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">Funding Type</label>
                  <select value={refreshModal.form.funding_type}
                    onChange={e => {
                      const newFt = e.target.value as FundingType
                      setRefreshModal(m => {
                        if (!m) return m
                        // Reset subtype if it's no longer valid for the new funding type
                        const validSubs = SUBTYPES_BY_FUNDING_TYPE[newFt] ?? []
                        const keepSub = m.form.funding_subtype && validSubs.includes(m.form.funding_subtype as never)
                          ? m.form.funding_subtype
                          : ''
                        return { ...m, form: { ...m.form, funding_type: newFt, funding_subtype: keepSub } }
                      })
                    }}
                    className="w-full rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal focus:border-forest focus:outline-none bg-white">
                    {FUNDING_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">Subtype</label>
                  <select value={refreshModal.form.funding_subtype}
                    onChange={e => setRefreshModal(m => m ? { ...m, form: { ...m.form, funding_subtype: e.target.value } } : m)}
                    className="w-full rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal focus:border-forest focus:outline-none bg-white">
                    <option value="">— None —</option>
                    {(SUBTYPES_BY_FUNDING_TYPE[refreshModal.form.funding_type as FundingType] ?? []).map(sub => (
                      <option key={sub} value={sub}>{SUBTYPE_LABELS[sub]}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Amount */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">Min Amount (£)</label>
                  <input type="number" value={refreshModal.form.amount_min}
                    onChange={e => setRefreshModal(m => m ? { ...m, form: { ...m.form, amount_min: e.target.value } } : m)}
                    placeholder="e.g. 1000"
                    className="w-full rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal placeholder:text-light focus:border-forest focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">Max Amount (£)</label>
                  <input type="number" value={refreshModal.form.amount_max}
                    onChange={e => setRefreshModal(m => m ? { ...m, form: { ...m.form, amount_max: e.target.value } } : m)}
                    placeholder="e.g. 10000"
                    className="w-full rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal placeholder:text-light focus:border-forest focus:outline-none" />
                </div>
              </div>

              {/* Deadline */}
              <div>
                <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-2">Deadline</label>
                <div className="flex items-center gap-3">
                  <button type="button"
                    onClick={() => setRefreshModal(m => m ? { ...m, form: { ...m.form, is_rolling: true, deadline: '' } } : m)}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                      refreshModal.form.is_rolling ? 'bg-forest text-white' : 'border border-warm text-mid hover:border-forest hover:text-charcoal'
                    }`}>
                    Rolling
                  </button>
                  <button type="button"
                    onClick={() => setRefreshModal(m => m ? { ...m, form: { ...m.form, is_rolling: false } } : m)}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                      !refreshModal.form.is_rolling ? 'bg-forest text-white' : 'border border-warm text-mid hover:border-forest hover:text-charcoal'
                    }`}>
                    Fixed deadline
                  </button>
                </div>
                {!refreshModal.form.is_rolling && (
                  <input type="date" value={refreshModal.form.deadline}
                    onChange={e => setRefreshModal(m => m ? { ...m, form: { ...m.form, deadline: e.target.value } } : m)}
                    className="mt-2 rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal focus:border-forest focus:outline-none" />
                )}
              </div>

              {/* Location */}
              <div>
                <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">Location</label>
                <input type="text" value={refreshModal.form.location_tag}
                  onChange={e => setRefreshModal(m => m ? { ...m, form: { ...m.form, location_tag: e.target.value } } : m)}
                  placeholder="e.g. UK, England, Scotland, North East England & Glasgow, London"
                  className="w-full rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal placeholder:text-light focus:border-forest focus:outline-none" />
                <label className="mt-2 flex items-center gap-3 cursor-pointer">
                  <div className={`relative w-10 h-6 rounded-full transition-colors ${refreshModal.form.is_local ? 'bg-forest' : 'bg-warm'}`}
                    onClick={() => setRefreshModal(m => m ? { ...m, form: { ...m.form, is_local: !m.form.is_local } } : m)}>
                    <div className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${refreshModal.form.is_local ? 'left-5' : 'left-1'}`} />
                  </div>
                  <span className="text-sm text-charcoal">Regional / local — restricted to a specific area (not UK-wide)</span>
                </label>
                <p className="mt-1 text-xs text-light">Leave blank and toggle off for UK-wide grants.</p>
              </div>

              {/* Sectors */}
              <div>
                <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">
                  Sectors <span className="font-normal normal-case text-light">(comma-separated)</span>
                </label>
                <input type="text" value={refreshModal.form.sectors}
                  onChange={e => setRefreshModal(m => m ? { ...m, form: { ...m.form, sectors: e.target.value } } : m)}
                  placeholder="e.g. community, young people, health"
                  className="w-full rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal placeholder:text-light focus:border-forest focus:outline-none" />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">Description</label>
                <textarea rows={4} value={refreshModal.form.description}
                  onChange={e => setRefreshModal(m => m ? { ...m, form: { ...m.form, description: e.target.value } } : m)}
                  className="w-full rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal placeholder:text-light focus:border-forest focus:outline-none resize-none" />
              </div>

              {/* Next open date */}
              <div>
                <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">Next Opens</label>
                <input type="text" value={refreshModal.form.next_open_date}
                  onChange={e => setRefreshModal(m => m ? { ...m, form: { ...m.form, next_open_date: e.target.value } } : m)}
                  placeholder="e.g. July 2026, Q3 2026, Spring 2026"
                  className="w-full rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal placeholder:text-light focus:border-forest focus:outline-none" />
                <p className="mt-1 text-xs text-light">If the grant isn&apos;t currently open, when does it next open? Leave blank if open now or unknown.</p>
              </div>

              {/* Invite-only */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div className={`relative w-10 h-6 rounded-full transition-colors ${refreshModal.form.is_invite_only ? 'bg-amber-pale0' : 'bg-warm'}`}
                  onClick={() => setRefreshModal(m => m ? { ...m, form: { ...m.form, is_invite_only: !m.form.is_invite_only } } : m)}>
                  <div className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${refreshModal.form.is_invite_only ? 'left-5' : 'left-1'}`} />
                </div>
                <span className="text-sm text-charcoal">Invite-only / not open to unsolicited applications</span>
              </label>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-warm bg-white px-6 py-4">
              <button onClick={() => setRefreshModal(null)}
                className="rounded-full border border-warm px-5 py-2 text-sm font-medium text-mid hover:border-charcoal hover:text-charcoal transition-colors">
                Cancel
              </button>
              <button onClick={() => saveRefreshedInfo()} disabled={refreshSaving}
                className="flex items-center gap-2 rounded-full bg-forest px-6 py-2 text-sm font-semibold text-white disabled:opacity-60 hover:bg-forest/90 transition-colors">
                {refreshSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {refreshSaving ? 'Saving…' : 'Save updates'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Grant Modal ──────────────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-warm">

            {/* Modal header */}
            <div className="sticky top-0 flex items-center justify-between border-b border-warm bg-white px-6 py-4 z-10">
              <div>
                <h3 className="font-display text-lg font-bold text-charcoal">Add New Funder</h3>
                <p className="text-xs text-mid mt-0.5">Manually add a grant to the database</p>
              </div>
              <button onClick={() => { setShowAddModal(false); setFetchUrl(''); setFetchError(null); setFetchedFrom(null) }}
                className="rounded-full border border-warm p-2 text-mid hover:border-forest hover:text-forest transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal form */}
            <div className="px-6 py-5 space-y-4">

                {/* ── Populate from URL ───────────────────────────────────── */}
              <div className="rounded-xl border border-forest/20 bg-forest/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-forest flex-shrink-0" />
                  <span className="text-sm font-semibold text-forest">Auto-populate from a URL</span>
                  <span className="text-xs text-mid ml-1">— paste the grant page link and we'll fill in the details</span>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-mid pointer-events-none" />
                    <input
                      type="url"
                      value={fetchUrl}
                      onChange={e => { setFetchUrl(e.target.value); setFetchError(null) }}
                      onKeyDown={e => e.key === 'Enter' && populateFromUrl()}
                      placeholder="https://funder.org/grants/open-programme"
                      className="w-full rounded-xl border border-forest/20 bg-white pl-8 pr-3 py-2.5 text-sm text-charcoal placeholder:text-light focus:border-forest focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={populateFromUrl}
                    disabled={fetching || !fetchUrl.trim()}
                    className="flex items-center gap-2 rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:bg-forest/90 transition-colors whitespace-nowrap"
                  >
                    {fetching
                      ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Fetching…</>
                      : <><Sparkles className="h-3.5 w-3.5" /> Populate</>
                    }
                  </button>
                </div>
                {fetchError && (
                  <div className="flex items-start gap-2 rounded-lg border border-coral-mid bg-coral-pale px-3 py-2 text-xs text-coral-deep">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    <span>{fetchError}</span>
                  </div>
                )}
                {fetchedFrom && !fetchError && (
                  <div className="flex items-center gap-2 text-xs text-sage">
                    <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>Fields populated from <span className="font-medium truncate max-w-[280px] inline-block align-bottom">{fetchedFrom}</span> — review and edit below</span>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 text-xs text-light">
                <div className="flex-1 h-px bg-warm" />
                <span>or fill in manually</span>
                <div className="flex-1 h-px bg-warm" />
              </div>

              {/* Error banner */}
              {addError && (
                <div className="rounded-xl border border-coral-mid bg-coral-pale px-4 py-3 text-sm text-coral-deep">
                  {addError}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">
                  Grant Title <span className="text-coral-saturated">*</span>
                </label>
                <input type="text" value={addForm.title}
                  onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Community Resilience Fund"
                  className="w-full rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal placeholder:text-light focus:border-forest focus:outline-none" />
              </div>

              {/* Funder + Type (side by side) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">
                    Funder Name <span className="text-coral-saturated">*</span>
                  </label>
                  <input type="text" value={addForm.funder}
                    onChange={e => setAddForm(f => ({ ...f, funder: e.target.value }))}
                    placeholder="e.g. Greggs Foundation"
                    className="w-full rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal placeholder:text-light focus:border-forest focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">
                    Funder Type
                  </label>
                  <select value={addForm.funder_type}
                    onChange={e => setAddForm(f => ({ ...f, funder_type: e.target.value }))}
                    className="w-full rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal focus:border-forest focus:outline-none bg-white">
                    {FUNDER_TYPE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Funding Type */}
              <div>
                <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">
                  Funding Type
                </label>
                <select value={addForm.funding_type}
                  onChange={e => setAddForm(f => ({ ...f, funding_type: e.target.value }))}
                  className="w-full rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal focus:border-forest focus:outline-none bg-white">
                  {FUNDING_TYPE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Apply URL */}
              <div>
                <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">
                  Apply / Info URL
                </label>
                <input type="url" value={addForm.apply_url}
                  onChange={e => setAddForm(f => ({ ...f, apply_url: e.target.value }))}
                  placeholder="https://funder.org/grants"
                  className="w-full rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal placeholder:text-light focus:border-forest focus:outline-none" />
              </div>

              {/* Amount min/max */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">
                    Min Amount (£)
                  </label>
                  <input type="number" value={addForm.amount_min}
                    onChange={e => setAddForm(f => ({ ...f, amount_min: e.target.value }))}
                    placeholder="e.g. 1000"
                    className="w-full rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal placeholder:text-light focus:border-forest focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">
                    Max Amount (£)
                  </label>
                  <input type="number" value={addForm.amount_max}
                    onChange={e => setAddForm(f => ({ ...f, amount_max: e.target.value }))}
                    placeholder="e.g. 10000"
                    className="w-full rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal placeholder:text-light focus:border-forest focus:outline-none" />
                </div>
              </div>

              {/* Rolling / deadline toggle */}
              <div>
                <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-2">
                  Deadline
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setAddForm(f => ({ ...f, is_rolling: true, deadline: '' }))}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                      addForm.is_rolling ? 'bg-forest text-white' : 'border border-warm text-mid hover:border-forest hover:text-charcoal'
                    }`}
                  >
                    Rolling (no deadline)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddForm(f => ({ ...f, is_rolling: false }))}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                      !addForm.is_rolling ? 'bg-forest text-white' : 'border border-warm text-mid hover:border-forest hover:text-charcoal'
                    }`}
                  >
                    Fixed deadline
                  </button>
                </div>
                {!addForm.is_rolling && (
                  <input type="date" value={addForm.deadline}
                    onChange={e => setAddForm(f => ({ ...f, deadline: e.target.value }))}
                    className="mt-2 rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal focus:border-forest focus:outline-none" />
                )}
              </div>

              {/* Sectors */}
              <div>
                <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">
                  Sectors <span className="font-normal normal-case text-light">(comma-separated)</span>
                </label>
                <input type="text" value={addForm.sectors}
                  onChange={e => setAddForm(f => ({ ...f, sectors: e.target.value }))}
                  placeholder="e.g. community, young people, health"
                  className="w-full rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal placeholder:text-light focus:border-forest focus:outline-none" />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">
                  Description
                </label>
                <textarea rows={3} value={addForm.description}
                  onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description of what this funder funds…"
                  className="w-full rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal placeholder:text-light focus:border-forest focus:outline-none resize-none" />
              </div>

              {/* Next open date */}
              <div>
                <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">Next Opens</label>
                <input type="text" value={addForm.next_open_date}
                  onChange={e => setAddForm(f => ({ ...f, next_open_date: e.target.value }))}
                  placeholder="e.g. July 2026, Q3 2026"
                  className="w-full rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal placeholder:text-light focus:border-forest focus:outline-none" />
              </div>

              {/* Invite-only toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div className={`relative w-10 h-6 rounded-full transition-colors ${addForm.is_invite_only ? 'bg-amber-pale0' : 'bg-warm'}`}
                  onClick={() => setAddForm(f => ({ ...f, is_invite_only: !f.is_invite_only }))}>
                  <div className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${addForm.is_invite_only ? 'left-5' : 'left-1'}`} />
                </div>
                <span className="text-sm text-charcoal">Invite-only / not open to unsolicited applications</span>
              </label>
            </div>

            {/* Modal footer */}
            <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-warm bg-white px-6 py-4">
              <button onClick={() => { setShowAddModal(false); setFetchUrl(''); setFetchError(null); setFetchedFrom(null) }}
                className="rounded-full border border-warm px-5 py-2 text-sm font-medium text-mid hover:border-charcoal hover:text-charcoal transition-colors">
                Cancel
              </button>
              <button onClick={addGrant} disabled={addSaving}
                className="flex items-center gap-2 rounded-full bg-forest px-6 py-2 text-sm font-semibold text-white disabled:opacity-60 hover:bg-forest/90 transition-colors">
                {addSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {addSaving ? 'Saving…' : 'Add to database'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}

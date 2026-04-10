'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  RefreshCw, ExternalLink, Pencil, Check, X,
  AlertTriangle, CheckCircle, Clock, Database, Trash2, Mail, Search,
  ChevronDown, ChevronRight, Plus, Tag, Link, Sparkles, Brain,
} from 'lucide-react'
import { SEED_GRANTS } from '@/lib/grants'
import { parseOpenDate } from '@/lib/parse-open-date'

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
}

type CategoryGrant = Grant & {
  funder_type: string
  is_seed: boolean
}

type Stats = { total: number; withUrl: number; ok: number; dead: number; unchecked: number; noUrl: number; seedTotal?: number; newCount?: number; reviewCount?: number; suspiciousCount?: number }
type Filter = 'dead' | 'unchecked' | 'no_url' | 'all' | 'seed' | 'new' | 'category' | 'review' | 'suspicious' | 'url_issues'
type SuspiciousGrant = Grant & { url_quality_score: number | null; url_quality_issues: string[] }
type DeadSeedGrant = { id: string; title: string; funder: string; url: string }
type NewGrant = Grant & { first_seen_at: string }

type AddGrantForm = {
  title: string
  funder: string
  funder_type: string
  funding_type: string
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
  government:        { label: 'Government',           colour: 'text-purple-600',bg: 'bg-purple-50',   border: 'border-purple-200'   },
  lottery:           { label: 'Lottery',              colour: 'text-amber-600', bg: 'bg-amber-50',    border: 'border-amber-200'    },
  housing_association:{ label: 'Housing Associations',colour: 'text-teal-600',  bg: 'bg-teal-50',     border: 'border-teal-200'     },
  local_authority:   { label: 'Local Authorities',   colour: 'text-orange-600',bg: 'bg-orange-50',   border: 'border-orange-200'   },
  competition:       { label: 'Competitions & Awards',colour: 'text-pink-600',  bg: 'bg-pink-50',     border: 'border-pink-200'     },
  loan:              { label: 'Loans & Social Finance',colour:'text-indigo-600',bg: 'bg-indigo-50',   border: 'border-indigo-200'   },
  crowdfund_match:   { label: 'Crowdfund Match',      colour: 'text-rose-600',  bg: 'bg-rose-50',     border: 'border-rose-200'     },
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
  title: '', funder: '', funder_type: 'trust_foundation', funding_type: 'grant', apply_url: '',
  description: '', amount_min: '', amount_max: '', deadline: '',
  is_rolling: true, is_invite_only: false, next_open_date: '', sectors: '',
  location_tag: '', is_local: false,
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function UrlAdminPage() {
  const [authorised, setAuthorised] = useState<boolean | null>(null)
  const [stats, setStats]           = useState<Stats | null>(null)
  const [grants, setGrants]         = useState<Grant[]>([])
  const [filter, setFilter]         = useState<Filter>('dead')
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
      createClient().from('scraped_grants').select('id', { count: 'exact', head: true }).eq('is_active', false).neq('url_status', 'dead'),
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
        .select('id, title, funder, apply_url, url_status, url_last_checked, source, is_invite_only, funding_type, funder_brief')
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
      .select('id, title, funder, apply_url, url_status, url_last_checked, source, is_invite_only, funding_type, funder_brief')
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
      .select('id, title, funder, apply_url, url_status, url_last_checked, source, is_invite_only, funder_brief, first_seen_at')
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
      .select('id, title, funder, apply_url, url_status, url_last_checked, source, is_invite_only, funder_brief, description, funder_type')
      .eq('is_active', false)
      .neq('url_status', 'dead')  // exclude grants that were explicitly hidden/rejected
      .order('last_seen_at', { ascending: false })
      .limit(500)
    setReviewGrants((data ?? []) as Grant[])
  }, [filter])

  // ── Load suspicious grants (low quality score) ───────────────────────────────
  const loadSuspiciousGrants = useCallback(async () => {
    if (filter !== 'suspicious') return
    const { data } = await createClient()
      .from('scraped_grants')
      .select('id, title, funder, apply_url, url_status, url_last_checked, source, is_invite_only, funder_brief, url_quality_score, url_quality_issues')
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

  // ── Load category grants (all grants, grouped by funder type) ────────────────
  const loadCategoryGrants = useCallback(async () => {
    if (filter !== 'category') return

    // Load active grants for display, plus ALL grants (inc. inactive) for deduplication
    const [{ data, error }, { data: allData }] = await Promise.all([
      createClient()
        .from('scraped_grants')
        .select('id, title, funder, apply_url, url_status, url_last_checked, source, is_invite_only, funder_type')
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
    if (authorised && filter === 'suspicious') loadSuspiciousGrants()
  }, [authorised, filter, loadSuspiciousGrants])

  // ── Clear selection when switching tabs ──────────────────────────────────────
  useEffect(() => { setSelectedIds(new Set()) }, [filter])

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
  async function removeGrant(id: string) {
    // For review grants (already is_active: false), set url_status to 'dead'
    // so they don't reappear in the review queue next time
    if (filter === 'review') {
      await updateGrant(id, { url_status: 'dead' })
      setReviewGrants(prev => prev.filter(g => g.id !== id))
    } else {
      await updateGrant(id, { is_active: false })
      setGrants(prev => prev.filter(g => g.id !== id))
      setNewGrants(prev => prev.filter(g => g.id !== id))
      setCategoryGrants(prev => prev.filter(g => g.id !== id))
      setSuspiciousGrants(prev => prev.filter(g => g.id !== id))
    }
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
      // Fetch location fields directly from DB (not exposed on Grant type)
      const { data: locRow } = await createClient()
        .from('scraped_grants')
        .select('location_tag, is_local')
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
      }
    } catch { /* silent — network or timeout */ } finally {
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

    // Fetch all active grants without a funder_brief
    const supabase = createClient()
    const { data: targets } = await supabase
      .from('scraped_grants')
      .select('id, title, funder, apply_url, url_status, funder_brief, source, url_last_checked, is_invite_only')
      .eq('is_active', true)
      .is('funder_brief', null)
      .not('apply_url', 'is', null)

    if (!targets || targets.length === 0) {
      setBulkEnrichLog(['Nothing to enrich — all active grants already have a funder brief.'])
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
          body: JSON.stringify({ grantId: grant.id }),
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
        <span className="text-xs text-red-500 font-medium mr-1">Remove?</span>
        <button onClick={() => removeGrant(grant.id)} className="rounded-full bg-red-500 p-1.5 text-white hover:bg-red-600 transition-colors">
          <Check className="h-3 w-3" />
        </button>
        <button onClick={() => setConfirmDeleteId(null)} className="rounded-full border border-warm p-1.5 text-mid hover:border-forest hover:text-forest transition-colors">
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
              ? 'border-purple-300 bg-purple-50 text-purple-600 hover:bg-purple-100'
              : 'border-warm text-mid hover:border-purple-300 hover:text-purple-600'
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
        {grant.url_status !== 'ok' && (
          <button onClick={() => markOk(grant.id)} title="Approve — mark URL as ok"
            className="rounded-full border border-warm p-1.5 text-mid hover:border-sage hover:text-sage transition-colors">
            <Check className="h-3 w-3" />
          </button>
        )}
        {grant.url_status !== 'dead' && (
          <button onClick={() => markDead(grant.id)} title="Flag as dead manually"
            className="rounded-full border border-warm p-1.5 text-mid hover:border-red-300 hover:text-red-500 transition-colors">
            <X className="h-3 w-3" />
          </button>
        )}
        <button onClick={() => setConfirmDeleteId(grant.id)} title="Remove from database"
          className="rounded-full border border-warm p-1.5 text-mid hover:border-red-300 hover:text-red-500 transition-colors">
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
              ? 'border-purple-300 bg-purple-50 text-purple-600 hover:bg-purple-100'
              : 'border-warm text-mid hover:border-purple-300 hover:text-purple-600'
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
          className="rounded-full border border-warm p-1.5 text-mid hover:border-red-300 hover:text-red-500 transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
        <button
          onClick={() => handleSeedAction(grant, newId => setConfirmDeleteId(newId))}
          title="Remove from database"
          className="rounded-full border border-warm p-1.5 text-mid hover:border-red-300 hover:text-red-500 transition-colors"
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
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-500">
        <AlertTriangle className="h-2.5 w-2.5" /> dead
      </span>
    )
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-semibold text-gold">
        <Clock className="h-2.5 w-2.5" /> unchecked
      </span>
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
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm">
              <p className="font-semibold text-red-700 mb-2">
                ⚠ {runResult.deadSeedGrants.length} seed grant{runResult.deadSeedGrants.length !== 1 ? 's' : ''} with dead links — update URLs in <code className="text-xs bg-red-100 px-1 py-0.5 rounded">src/lib/grants.ts</code>
              </p>
              <ul className="space-y-1">
                {runResult.deadSeedGrants.map(g => (
                  <li key={g.id} className="flex items-start gap-2">
                    <span className="text-red-400 mt-0.5 flex-shrink-0">•</span>
                    <div className="min-w-0">
                      <span className="text-red-800 font-medium">{g.title}</span>
                      <span className="text-red-500 mx-1">·</span>
                      <span className="text-red-600 text-xs">{g.funder}</span>
                      <a href={g.url} target="_blank" rel="noopener noreferrer"
                        className="ml-2 text-xs text-red-400 hover:text-red-600 underline truncate">
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
        <div className={`mb-6 rounded-xl border px-4 py-3 text-sm ${promoteResult.message.startsWith('Error') ? 'border-red-200 bg-red-50 text-red-700' : 'border-sage/20 bg-sage/10 text-forest'}`}>
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
            { label: 'Dead links',     value: stats.dead,          Icon: AlertTriangle, colour: 'text-red-500',  bg: 'bg-red-50',  border: 'border-red-200' },
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
              <p key={i} className={`text-xs font-mono ${line.startsWith('✓') ? 'text-forest' : 'text-red-500'}`}>{line}</p>
            ))}
          </div>
        )}
      </div>

      {/* Filter tabs + search */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {([
          { key: 'review',     label: `Needs Review${stats?.reviewCount ? ` (${stats.reviewCount})` : ''}`, urgent: (stats?.reviewCount ?? 0) > 0 },
          { key: 'all',        label: 'All grants' },
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
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
                      <span className="rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-xs font-semibold text-red-500">
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
                            <tr key={`${grant.is_seed ? 'seed' : 'db'}-${grant.id}`}
                              className="hover:bg-cream/50 transition-colors">

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
        <div className="sticky top-4 z-20 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-5 py-3 shadow-lg">
          <p className="text-sm font-semibold text-red-700">
            {selectedIds.size} grant{selectedIds.size !== 1 ? 's' : ''} selected
          </p>
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedIds(new Set())}
              className="text-xs text-red-400 hover:text-red-600 transition-colors">
              Clear
            </button>
            <button onClick={batchDelete} disabled={batchDeleting}
              className="rounded-full bg-red-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-50">
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
                      <tr key={grant.id} className={`hover:bg-cream/50 transition-colors ${selectedIds.has(grant.id) ? 'bg-red-50' : ''}`}>
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
                    <tr key={grant.id} className="hover:bg-cream/50 transition-colors">
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
                    <tr key={grant.id} className={`hover:bg-cream/50 transition-colors ${selectedIds.has(grant.id) ? 'bg-red-50' : ''}`}>
                      <td className="px-3 py-3 w-8">
                        <input type="checkbox" checked={selectedIds.has(grant.id)} onChange={() => toggleSelect(grant.id)}
                          className="h-3.5 w-3.5 rounded accent-forest cursor-pointer" />
                      </td>
                      <td className="px-5 py-3 max-w-[200px]">
                        <p className="font-medium text-charcoal leading-snug line-clamp-2">{grant.title}</p>
                        <p className="text-xs text-mid mt-0.5">{grant.funder}</p>
                        <span className="inline-block mt-1 rounded-full bg-warm px-2 py-0.5 text-[10px] text-mid">{grant.source}</span>
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
                          <button onClick={() => approveGrant(grant.id)}
                            className="rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest hover:bg-forest hover:text-white transition-colors">
                            Approve
                          </button>
                          <button onClick={() => removeGrant(grant.id)}
                            className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-500 hover:bg-red-500 hover:text-white transition-colors">
                            Hide
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )
          })()}
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
                  <tr key={grant.id} className="group hover:bg-cream/40 transition-colors">
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
                        (grant.url_quality_score ?? 0) < 30 ? 'bg-red-100 text-red-700'
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
                          <span className="text-xs text-red-500 font-medium mr-1">Remove?</span>
                          <button onClick={() => removeGrant(grant.id)} className="rounded-full bg-red-500 p-1.5 text-white hover:bg-red-600 transition-colors">
                            <Check className="h-3 w-3" />
                          </button>
                          <button onClick={() => setConfirmDeleteId(null)} className="rounded-full border border-warm p-1.5 text-mid hover:border-forest hover:text-forest transition-colors">
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
                            className="rounded-full border border-warm p-1.5 text-mid hover:border-red-300 hover:text-red-500 transition-colors">
                            <X className="h-3 w-3" />
                          </button>
                          <button onClick={() => setConfirmDeleteId(grant.id)} title="Remove from database"
                            className="rounded-full border border-warm p-1.5 text-mid hover:border-red-300 hover:text-red-500 transition-colors">
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
                    <tr key={grant.id} className={`hover:bg-cream/50 transition-colors ${selectedIds.has(grant.id) ? 'bg-red-50' : ''}`}>
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
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Old URL was dead</span>
                  )}
                </div>
                <p className="text-xs text-mid mt-0.5 truncate max-w-[420px]">
                  {refreshModal.grantUrl
                    ? <>AI-extracted from <a href={refreshModal.grantUrl} target="_blank" rel="noopener noreferrer" className="text-forest hover:underline">{refreshModal.grantUrl}</a></>
                    : <span className="text-red-500">No URL found — please enter one manually below</span>
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
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{refreshError}</div>
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

              {/* Funding Type */}
              <div>
                <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">Funding Type</label>
                <select value={refreshModal.form.funding_type}
                  onChange={e => setRefreshModal(m => m ? { ...m, form: { ...m.form, funding_type: e.target.value } } : m)}
                  className="w-full rounded-xl border border-warm px-3 py-2.5 text-sm text-charcoal focus:border-forest focus:outline-none bg-white">
                  {FUNDING_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
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
                <div className={`relative w-10 h-6 rounded-full transition-colors ${refreshModal.form.is_invite_only ? 'bg-purple-500' : 'bg-warm'}`}
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
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
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
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {addError}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">
                  Grant Title <span className="text-red-400">*</span>
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
                    Funder Name <span className="text-red-400">*</span>
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
                <div className={`relative w-10 h-6 rounded-full transition-colors ${addForm.is_invite_only ? 'bg-purple-500' : 'bg-warm'}`}
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

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  RefreshCw, ExternalLink, Pencil, Check, X,
  AlertTriangle, CheckCircle, Clock, Database, Trash2, Mail, Search,
  ChevronDown, ChevronRight, Plus, Tag, Link, Sparkles,
} from 'lucide-react'
import { SEED_GRANTS } from '@/lib/grants'

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
}

type CategoryGrant = Grant & {
  funder_type: string
  is_seed: boolean
}

type Stats = { total: number; withUrl: number; ok: number; dead: number; unchecked: number; seedTotal?: number; newCount?: number }
type Filter = 'dead' | 'unchecked' | 'all' | 'seed' | 'new' | 'category'
type DeadSeedGrant = { id: string; title: string; funder: string; url: string }
type NewGrant = Grant & { first_seen_at: string }

type AddGrantForm = {
  title: string
  funder: string
  funder_type: string
  apply_url: string
  description: string
  amount_min: string
  amount_max: string
  deadline: string
  is_rolling: boolean
  is_invite_only: boolean
  sectors: string
}

// ── Category label/colour map ──────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; colour: string; bg: string; border: string }> = {
  trust_foundation:  { label: 'Trusts & Foundations', colour: 'text-forest',    bg: 'bg-forest/5',    border: 'border-forest/20'    },
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

const CATEGORY_ORDER = ['trust_foundation','corporate','government','lottery','housing_association','local_authority','competition','loan','crowdfund_match','other']

const FUNDER_TYPE_OPTIONS = [
  { value: 'trust_foundation',   label: 'Trust / Foundation' },
  { value: 'corporate',          label: 'Corporate' },
  { value: 'government',         label: 'Government' },
  { value: 'lottery',            label: 'Lottery' },
  { value: 'housing_association',label: 'Housing Association' },
  { value: 'local_authority',    label: 'Local Authority' },
  { value: 'competition',        label: 'Competition / Award' },
  { value: 'loan',               label: 'Loan / Social Finance' },
  { value: 'crowdfund_match',    label: 'Crowdfund Match' },
  { value: 'other',              label: 'Other' },
]

const BLANK_FORM: AddGrantForm = {
  title: '', funder: '', funder_type: 'trust_foundation', apply_url: '',
  description: '', amount_min: '', amount_max: '', deadline: '',
  is_rolling: true, is_invite_only: false, sectors: '',
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
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [editUrl, setEditUrl]       = useState('')
  const [saving, setSaving]         = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [search, setSearch]                   = useState('')
  const [loadError, setLoadError]             = useState<string | null>(null)
  const [newGrants, setNewGrants]             = useState<NewGrant[]>([])
  const [newSources, setNewSources]           = useState<Set<string>>(new Set())

  // Category view state
  const [categoryGrants, setCategoryGrants]       = useState<CategoryGrant[]>([])
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [categorySearch, setCategorySearch]         = useState('')
  const [promotingId, setPromotingId]               = useState<string | null>(null)

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
    form: AddGrantForm
  } | null>(null)
  const [refreshSaving, setRefreshSaving] = useState(false)
  const [refreshError, setRefreshError]   = useState<string | null>(null)

  // ── Auth check ───────────────────────────────────────────────────────────────
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      setAuthorised(data.user?.email === ADMIN_EMAIL)
    })
  }, [])

  // ── Load stats ───────────────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const [{ data }, { count: newCount }] = await Promise.all([
      createClient().from('scraped_grants').select('url_status, apply_url').eq('is_active', true),
      createClient().from('scraped_grants').select('id', { count: 'exact', head: true }).eq('is_active', true).gte('first_seen_at', sevenDaysAgo),
    ])
    if (!data) return
    setStats({
      total:     data.length,
      withUrl:   data.filter(g => g.apply_url).length,
      ok:        data.filter(g => g.url_status === 'ok').length,
      dead:      data.filter(g => g.url_status === 'dead').length,
      unchecked: data.filter(g => g.url_status === 'unchecked').length,
      seedTotal: SEED_GRANTS.filter(g => g.applyUrl).length,
      newCount:  newCount ?? 0,
    })
  }, [])

  // ── Load scraped grants (URL health views) ───────────────────────────────────
  const loadGrants = useCallback(async () => {
    if (filter === 'seed' || filter === 'new' || filter === 'category') return

    let query = createClient()
      .from('scraped_grants')
      .select('id, title, funder, apply_url, url_status, url_last_checked, source, is_invite_only')
      .eq('is_active', true)
      .order('url_last_checked', { ascending: true, nullsFirst: true })
      .limit(2000)

    if (filter === 'dead')      query = query.eq('url_status', 'dead')
    if (filter === 'unchecked') query = query.eq('url_status', 'unchecked').not('apply_url', 'is', null)

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
  }, [filter, search])

  // ── Load new grants (last 7 days) ────────────────────────────────────────────
  const loadNewGrants = useCallback(async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data } = await createClient()
      .from('scraped_grants')
      .select('id, title, funder, apply_url, url_status, url_last_checked, source, is_invite_only, first_seen_at')
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
    if (authorised) { loadStats(); loadGrants(); loadNewGrants() }
  }, [authorised, loadStats, loadGrants, loadNewGrants])

  useEffect(() => {
    if (authorised && filter === 'category') loadCategoryGrants()
  }, [authorised, filter, loadCategoryGrants])

  // ── Filtered seed grants (client-side, seed tab) ─────────────────────────────
  const filteredSeedGrants = useMemo(() => {
    if (filter !== 'seed') return []
    const q = search.trim().toLowerCase()
    if (!q) return SEED_GRANTS
    return SEED_GRANTS.filter(g =>
      g.title.toLowerCase().includes(q) ||
      g.funder.toLowerCase().includes(q)
    )
  }, [filter, search])

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
      await loadStats()
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

  // ── Server-side update helper (bypasses RLS via service role) ────────────────
  async function updateGrant(id: string, fields: Record<string, unknown>): Promise<boolean> {
    const res = await fetch('/api/admin/update-grant', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, fields }),
    })
    if (!res.ok) console.error('updateGrant error:', await res.json())
    return res.ok
  }

  // ── Save edited URL ──────────────────────────────────────────────────────────
  async function saveUrl(id: string) {
    setSaving(true)
    await updateGrant(id, { apply_url: editUrl || null, url_status: 'unchecked', url_last_checked: null })
    const updateInList = (g: Grant) =>
      g.id === id ? { ...g, apply_url: editUrl || null, url_status: 'unchecked' as const, url_last_checked: null } : g
    setGrants(prev => prev.map(updateInList))
    setCategoryGrants(prev => prev.map(g =>
      g.id === id ? { ...g, apply_url: editUrl || null, url_status: 'unchecked' as const, url_last_checked: null } : g
    ))
    setEditingId(null)
    setSaving(false)
    await loadStats()
  }

  // ── Mark dead manually ────────────────────────────────────────────────────────
  async function markDead(id: string) {
    await updateGrant(id, { url_status: 'dead', url_last_checked: new Date().toISOString() })
    const update = (g: Grant) => g.id === id ? { ...g, url_status: 'dead' as const } : g
    setGrants(prev => prev.map(update))
    setCategoryGrants(prev => prev.map(g => g.id === id ? { ...g, url_status: 'dead' as const } : g))
    await loadStats()
  }

  // ── Mark ok manually ─────────────────────────────────────────────────────────
  async function markOk(id: string) {
    await updateGrant(id, { url_status: 'ok', url_last_checked: new Date().toISOString() })
    setGrants(prev => prev.filter(g => g.id !== id))
    setCategoryGrants(prev => prev.map(g => g.id === id ? { ...g, url_status: 'ok' as const } : g))
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
    await updateGrant(id, { is_active: false })
    setGrants(prev => prev.filter(g => g.id !== id))
    setNewGrants(prev => prev.filter(g => g.id !== id))
    setCategoryGrants(prev => prev.filter(g => g.id !== id))
    setConfirmDeleteId(null)
    await loadStats()
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
    try {
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
      const discoveredUrl: string = json.sourceUrl ?? grant.apply_url ?? ''
      setRefreshModal({
        grantId:    grant.id,
        grantTitle: grant.title,
        grantUrl:   discoveredUrl,
        form: {
          title:         d.title        ?? grant.title,
          funder:        d.funder       ?? (grant.funder ?? ''),
          funder_type:   d.funder_type  ?? (grant.funder_type ?? 'trust_foundation'),
          apply_url:     discoveredUrl,
          description:   d.description  ?? '',
          amount_min:    d.amount_min   != null ? String(d.amount_min) : '',
          amount_max:    d.amount_max   != null ? String(d.amount_max) : '',
          is_rolling:    d.is_rolling   ?? true,
          deadline:      d.deadline     ?? '',
          sectors:       Array.isArray(d.sectors) && d.sectors.length > 0 ? d.sectors.join(', ') : '',
          is_invite_only: d.is_invite_only ?? grant.is_invite_only,
        },
      })
    } catch (err) {
      alert(`Search failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRefreshingId(null)
    }
  }

  // ── Save refreshed info back to DB ────────────────────────────────────────────
  async function saveRefreshedInfo() {
    if (!refreshModal) return
    setRefreshSaving(true)
    setRefreshError(null)
    const { grantId, form } = refreshModal
    const sectors = form.sectors
      ? form.sectors.split(',').map(s => s.trim()).filter(Boolean)
      : []
    const ok = await updateGrant(grantId, {
      title:          form.title.trim(),
      funder:         form.funder.trim(),
      funder_type:    form.funder_type,
      apply_url:      form.apply_url.trim() || null,
      description:    form.description.trim() || null,
      amount_min:     form.amount_min ? parseInt(form.amount_min, 10) : null,
      amount_max:     form.amount_max ? parseInt(form.amount_max, 10) : null,
      is_rolling:     form.is_rolling,
      deadline:       (!form.is_rolling && form.deadline) ? form.deadline : null,
      sectors,
      is_invite_only: form.is_invite_only,
    })

    if (!ok) {
      setRefreshError('Save failed — check console for details')
      setRefreshSaving(false)
      return
    }
    // Update local state
    const updatedUrl = form.apply_url.trim() || null
    const updater = (g: CategoryGrant) =>
      g.id === grantId
        ? { ...g, title: form.title.trim(), funder: form.funder.trim(), apply_url: updatedUrl, is_invite_only: form.is_invite_only }
        : g
    setCategoryGrants(prev => prev.map(updater))
    setGrants(prev => prev.map(g =>
      g.id === grantId ? { ...g, title: form.title.trim(), funder: form.funder.trim(), apply_url: updatedUrl, is_invite_only: form.is_invite_only } : g
    ))
    setRefreshSaving(false)
    setRefreshModal(null)
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
        description:    d.description  ?? prev.description,
        amount_min:     d.amount_min != null ? String(d.amount_min) : prev.amount_min,
        amount_max:     d.amount_max != null ? String(d.amount_max) : prev.amount_max,
        is_rolling:     d.is_rolling  ?? prev.is_rolling,
        deadline:       d.deadline     ?? prev.deadline,
        sectors:        Array.isArray(d.sectors) && d.sectors.length > 0
                          ? d.sectors.join(', ')
                          : prev.sectors,
        is_invite_only: d.is_invite_only ?? prev.is_invite_only,
        apply_url:      prev.apply_url || url,   // prefill URL if not already set
      }))
      setFetchedFrom(url)
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
        apply_url:      addForm.apply_url.trim() || null,
        description:    addForm.description.trim() || null,
        amount_min:     addForm.amount_min ? parseInt(addForm.amount_min, 10) : null,
        amount_max:     addForm.amount_max ? parseInt(addForm.amount_max, 10) : null,
        deadline:       (!addForm.is_rolling && addForm.deadline) ? addForm.deadline : null,
        is_rolling:     addForm.is_rolling,
        is_invite_only: addForm.is_invite_only,
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
    // Reload relevant views
    await loadStats()
    if (filter === 'category') await loadCategoryGrants()
    if (filter === 'all') await loadGrants()
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
        <button
          onClick={() => fetchGrantInfo(grant)}
          disabled={refreshingId === grant.id}
          title="Search web for latest grant info"
          className="rounded-full border border-warm p-1.5 text-mid hover:border-forest hover:text-forest transition-colors disabled:opacity-40"
        >
          {refreshingId === grant.id
            ? <RefreshCw className="h-3 w-3 animate-spin" />
            : <Sparkles className="h-3 w-3" />
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
        {grant.url_status === 'dead' && (
          <button onClick={() => markOk(grant.id)} title="Clear flag — mark as ok"
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
          <h2 className="font-display text-2xl font-bold text-forest">URL Health</h2>
          <p className="mt-1 text-sm text-mid">Find and fix dead grant links · browse by category · add new funders</p>
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
            onClick={promoteAllSeeds}
            disabled={promotingSeeds}
            title="Copy all seed grants into the database so their URLs can be validated"
            className="flex items-center gap-2 rounded-full border border-forest px-4 py-2.5 text-sm font-semibold text-forest hover:bg-forest/5 disabled:opacity-60 transition-colors whitespace-nowrap"
          >
            <Database className={`h-4 w-4 ${promotingSeeds ? 'animate-pulse' : ''}`} />
            {promotingSeeds ? 'Promoting seeds…' : 'Promote all seeds'}
          </button>
          <button
            onClick={runValidation}
            disabled={running}
            className="flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 hover:bg-forest/90 transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Checking all URLs…' : 'Run validation now'}
          </button>
        </div>
      </div>

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

      {/* Filter tabs + search */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {([
          { key: 'category',  label: `By Category` },
          { key: 'new',       label: `New this week${stats ? ` (${stats.newCount ?? 0})` : ''}` },
          { key: 'dead',      label: `Dead links${stats ? ` (${stats.dead})` : ''}` },
          { key: 'unchecked', label: `No URL${stats ? ` (${stats.unchecked})` : ''}` },
          { key: 'all',       label: 'All grants' },
          { key: 'seed',      label: `Seed grants (${SEED_GRANTS.length})` },
        ] as const).map(tab => (
          <button key={tab.key}
            onClick={() => { setFilter(tab.key); setSearch(''); setCategorySearch('') }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === tab.key
                ? 'bg-forest text-white'
                : 'border border-warm bg-white text-mid hover:border-forest/30 hover:text-charcoal'
            }`}
          >
            {tab.key === 'category' && <Tag className="inline h-3 w-3 mr-1.5 -mt-0.5" />}
            {tab.label}
          </button>
        ))}

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
                                <p className="font-medium text-charcoal leading-snug line-clamp-2">{grant.title}</p>
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

      {/* ── New grants table ──────────────────────────────────────────────────── */}
      {filter === 'new' && (() => {
        const q = search.trim().toLowerCase()
        const filtered = newGrants.filter(g =>
          !q || g.title.toLowerCase().includes(q) || (g.funder ?? '').toLowerCase().includes(q) || g.source.toLowerCase().includes(q)
        )
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
                      <tr key={grant.id} className="hover:bg-cream/50 transition-colors">
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

      {/* ── Scraped grants table (dead / unchecked / all) ──────────────────────── */}
      {filter !== 'seed' && filter !== 'new' && filter !== 'category' && (
        <div className="rounded-xl border border-warm bg-white overflow-hidden shadow-card">
          {grants.length === 0 ? (
            <div className="py-16 text-center">
              <CheckCircle className="mx-auto mb-3 h-8 w-8 text-sage" />
              <p className="text-mid text-sm">
                {filter === 'dead' ? 'No dead links found — run validation to check' : 'No results for this filter'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-warm bg-warm/30 text-left text-xs font-semibold text-mid uppercase tracking-wider">
                    <th className="px-5 py-3">Grant / Funder</th>
                    <th className="px-5 py-3">URL</th>
                    <th className="px-5 py-3 text-center">Status</th>
                    <th className="px-5 py-3 text-center">Checked</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm/60">
                  {grants.map(grant => (
                    <tr key={grant.id} className="hover:bg-cream/50 transition-colors">
                      <td className="px-5 py-3 max-w-[220px]">
                        <p className="font-medium text-charcoal leading-snug line-clamp-2">{grant.title}</p>
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
          )}
        </div>
      )}

      {/* Footer hint */}
      {filter !== 'category' && (
        <p className="mt-4 text-xs text-light text-center">
          {filter === 'seed'
            ? `${filteredSeedGrants.length} seed grant${filteredSeedGrants.length !== 1 ? 's' : ''}${search ? ` matching "${search}"` : ''} · Edit URLs in src/lib/grants.ts`
            : filter === 'new'
            ? `${newGrants.length} new grant${newGrants.length !== 1 ? 's' : ''} in the last 7 days · ${newSources.size} new source${newSources.size !== 1 ? 's' : ''}`
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
                </div>
                <p className="text-xs text-mid mt-0.5 truncate max-w-[420px]">
                  AI-extracted from <a href={refreshModal.grantUrl} target="_blank" rel="noopener noreferrer" className="text-forest hover:underline">{refreshModal.grantUrl}</a>
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
              <button onClick={saveRefreshedInfo} disabled={refreshSaving}
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

'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  RefreshCw, ExternalLink, Pencil, Check, X,
  AlertTriangle, CheckCircle, Clock, Database, Trash2, Mail,
} from 'lucide-react'

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

type Grant = {
  id: string
  title: string
  funder: string | null
  apply_url: string | null
  url_status: 'unchecked' | 'ok' | 'dead'
  url_last_checked: string | null
  source: string
  is_invite_only: boolean
}

type Stats = { total: number; withUrl: number; ok: number; dead: number; unchecked: number }
type Filter = 'dead' | 'unchecked' | 'all'

export default function UrlAdminPage() {
  const [authorised, setAuthorised] = useState<boolean | null>(null)
  const [stats, setStats]           = useState<Stats | null>(null)
  const [grants, setGrants]         = useState<Grant[]>([])
  const [filter, setFilter]         = useState<Filter>('dead')
  const [running, setRunning]       = useState(false)
  const [runResult, setRunResult]   = useState<{ ok: number; dead: number } | null>(null)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [editUrl, setEditUrl]       = useState('')
  const [saving, setSaving]         = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // ── Auth check ──────────────────────────────────────────────────────────────
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      setAuthorised(data.user?.email === ADMIN_EMAIL)
    })
  }, [])

  // ── Load stats ──────────────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    const { data } = await createClient()
      .from('scraped_grants')
      .select('url_status, apply_url')
      .eq('is_active', true)
    if (!data) return
    setStats({
      total:     data.length,
      withUrl:   data.filter(g => g.apply_url).length,
      ok:        data.filter(g => g.url_status === 'ok').length,
      dead:      data.filter(g => g.url_status === 'dead').length,
      unchecked: data.filter(g => g.url_status === 'unchecked').length,
    })
  }, [])

  // ── Load grants ─────────────────────────────────────────────────────────────
  const loadGrants = useCallback(async () => {
    let query = createClient()
      .from('scraped_grants')
      .select('id, title, funder, apply_url, url_status, url_last_checked, source, is_invite_only')
      .eq('is_active', true)
      .order('url_last_checked', { ascending: true, nullsFirst: true })
      .limit(200)

    if (filter === 'dead')      query = query.eq('url_status', 'dead')
    if (filter === 'unchecked') query = query.eq('url_status', 'unchecked').not('apply_url', 'is', null)

    const { data } = await query
    setGrants((data ?? []) as Grant[])
  }, [filter])

  useEffect(() => {
    if (authorised) { loadStats(); loadGrants() }
  }, [authorised, loadStats, loadGrants])

  // ── Run full validation ─────────────────────────────────────────────────────
  async function runValidation() {
    setRunning(true)
    setRunResult(null)
    try {
      // Auth is handled server-side via Supabase session
      const res = await fetch('/api/admin/validate-urls', { method: 'POST' })
      if (!res.ok) throw new Error('Request failed')
      const data = await res.json()
      setRunResult({ ok: data.ok, dead: data.dead })
      await loadStats()
      await loadGrants()
    } catch {
      alert('Validation failed — check NEXT_PUBLIC_ADMIN_SECRET env var is set.')
    } finally {
      setRunning(false)
    }
  }

  // ── Save edited URL ─────────────────────────────────────────────────────────
  async function saveUrl(id: string) {
    setSaving(true)
    await createClient()
      .from('scraped_grants')
      .update({ apply_url: editUrl || null, url_status: 'unchecked', url_last_checked: null })
      .eq('id', id)
    setGrants(prev => prev.map(g =>
      g.id === id ? { ...g, apply_url: editUrl || null, url_status: 'unchecked', url_last_checked: null } : g
    ))
    setEditingId(null)
    setSaving(false)
    await loadStats()
  }

  // ── Mark dead manually ──────────────────────────────────────────────────────
  async function markDead(id: string) {
    await createClient()
      .from('scraped_grants')
      .update({ url_status: 'dead', url_last_checked: new Date().toISOString() })
      .eq('id', id)
    setGrants(prev => prev.map(g => g.id === id ? { ...g, url_status: 'dead' } : g))
    await loadStats()
  }

  // ── Mark ok manually (clear flag) ──────────────────────────────────────────
  async function markOk(id: string) {
    await createClient()
      .from('scraped_grants')
      .update({ url_status: 'ok', url_last_checked: new Date().toISOString() })
      .eq('id', id)
    setGrants(prev => prev.filter(g => g.id !== id))
    await loadStats()
  }

  // ── Toggle invite-only flag ─────────────────────────────────────────────────
  async function toggleInviteOnly(id: string, current: boolean) {
    await createClient()
      .from('scraped_grants')
      .update({ is_invite_only: !current })
      .eq('id', id)
    setGrants(prev => prev.map(g =>
      g.id === id ? { ...g, is_invite_only: !current } : g
    ))
  }

  // ── Remove from database (soft delete) ─────────────────────────────────────
  async function removeGrant(id: string) {
    await createClient()
      .from('scraped_grants')
      .update({ is_active: false })
      .eq('id', id)
    setGrants(prev => prev.filter(g => g.id !== id))
    setConfirmDeleteId(null)
    await loadStats()
  }

  // ── Guards ──────────────────────────────────────────────────────────────────
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

  return (
    <div>
      {/* Header */}
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-forest">URL Health</h2>
          <p className="mt-1 text-sm text-mid">Find and fix dead grant links in the database</p>
        </div>
        <button
          onClick={runValidation}
          disabled={running}
          className="flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 hover:bg-forest/90 transition-colors whitespace-nowrap"
        >
          <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Checking all URLs…' : 'Run validation now'}
        </button>
      </div>

      {/* Run result */}
      {running && (
        <div className="mb-6 rounded-xl border border-forest/20 bg-forest/5 px-4 py-3 text-sm text-forest">
          Checking URLs in batches of 20 — this takes 2–3 minutes for 800+ grants…
        </div>
      )}
      {runResult && (
        <div className="mb-6 rounded-xl border border-sage/20 bg-sage/10 px-4 py-3 text-sm text-forest">
          ✓ Validation complete — {runResult.ok} ok, {runResult.dead} flagged as dead
        </div>
      )}

      {/* Stats strip */}
      {stats && (
        <div className="mb-7 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Total grants',   value: stats.total,     Icon: Database,      colour: 'text-charcoal', bg: 'bg-white',   border: 'border-warm'      },
            { label: 'Links verified', value: stats.ok,        Icon: CheckCircle,   colour: 'text-sage',     bg: 'bg-sage/5',  border: 'border-sage/20'   },
            { label: 'Dead links',     value: stats.dead,      Icon: AlertTriangle, colour: 'text-red-500',  bg: 'bg-red-50',  border: 'border-red-200'   },
            { label: 'Never checked',  value: stats.unchecked, Icon: Clock,         colour: 'text-gold',     bg: 'bg-gold/5',  border: 'border-gold/20'   },
          ].map(s => (
            <div key={s.label} className={`rounded-2xl border ${s.border} ${s.bg} p-5 shadow-warm`}>
              <s.Icon className={`mb-2 h-5 w-5 ${s.colour}`} />
              <p className={`font-display text-3xl font-bold ${s.colour}`}>{s.value}</p>
              <p className="mt-1 text-xs text-mid">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="mb-5 flex gap-2 flex-wrap">
        {([
          { key: 'dead',      label: `Dead links${stats ? ` (${stats.dead})` : ''}` },
          { key: 'unchecked', label: `Never checked${stats ? ` (${stats.unchecked})` : ''}` },
          { key: 'all',       label: 'All grants' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === tab.key
                ? 'bg-forest text-white'
                : 'border border-warm bg-white text-mid hover:border-forest/30 hover:text-charcoal'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Grant table */}
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

                    {/* Title + funder */}
                    <td className="px-5 py-3 max-w-[220px]">
                      <p className="font-medium text-charcoal leading-snug line-clamp-2">{grant.title}</p>
                      <p className="text-xs text-mid mt-0.5">{grant.funder ?? '—'}</p>
                    </td>

                    {/* URL (editable) */}
                    <td className="px-5 py-3 max-w-[300px]">
                      {editingId === grant.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            type="url"
                            value={editUrl}
                            onChange={e => setEditUrl(e.target.value)}
                            className="flex-1 min-w-0 rounded-lg border border-warm px-2 py-1 text-xs focus:border-forest focus:outline-none"
                            placeholder="https://funder.org/apply"
                          />
                          <button
                            onClick={() => saveUrl(grant.id)}
                            disabled={saving}
                            className="flex-shrink-0 rounded-full bg-forest p-1.5 text-white disabled:opacity-50"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="flex-shrink-0 rounded-full border border-warm p-1.5 text-mid"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {grant.apply_url ? (
                            <a
                              href={grant.apply_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="truncate text-xs text-forest hover:underline max-w-[250px] block"
                            >
                              {grant.apply_url}
                            </a>
                          ) : (
                            <span className="text-xs text-light italic">No URL set</span>
                          )}
                          {grant.apply_url && (
                            <a href={grant.apply_url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                              <ExternalLink className="h-3 w-3 text-light hover:text-forest transition-colors" />
                            </a>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Status badge */}
                    <td className="px-5 py-3 text-center">
                      {grant.url_status === 'ok' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sage/10 px-2 py-0.5 text-[10px] font-semibold text-sage">
                          <CheckCircle className="h-2.5 w-2.5" /> ok
                        </span>
                      )}
                      {grant.url_status === 'dead' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-500">
                          <AlertTriangle className="h-2.5 w-2.5" /> dead
                        </span>
                      )}
                      {grant.url_status === 'unchecked' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-semibold text-gold">
                          <Clock className="h-2.5 w-2.5" /> unchecked
                        </span>
                      )}
                    </td>

                    {/* Last checked date */}
                    <td className="px-5 py-3 text-center text-xs text-light whitespace-nowrap">
                      {grant.url_last_checked
                        ? new Date(grant.url_last_checked).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                        : '—'}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3">
                      {confirmDeleteId === grant.id ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-xs text-red-500 font-medium mr-1">Remove?</span>
                          <button
                            onClick={() => removeGrant(grant.id)}
                            title="Confirm remove"
                            className="rounded-full bg-red-500 p-1.5 text-white hover:bg-red-600 transition-colors"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            title="Cancel"
                            className="rounded-full border border-warm p-1.5 text-mid hover:border-forest hover:text-forest transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
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
                            <button
                              onClick={() => markOk(grant.id)}
                              title="Clear flag — mark as ok"
                              className="rounded-full border border-warm p-1.5 text-mid hover:border-sage hover:text-sage transition-colors"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                          )}
                          {grant.url_status !== 'dead' && (
                            <button
                              onClick={() => markDead(grant.id)}
                              title="Flag as dead manually"
                              className="rounded-full border border-warm p-1.5 text-mid hover:border-red-300 hover:text-red-500 transition-colors"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            onClick={() => setConfirmDeleteId(grant.id)}
                            title="Remove from database"
                            className="rounded-full border border-warm p-1.5 text-mid hover:border-red-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-light text-center">
        Showing up to 200 results · Sorted by oldest check first
      </p>
    </div>
  )
}

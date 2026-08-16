'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  RefreshCw, ExternalLink, Bell, BellOff, CheckCircle,
  AlertTriangle, Plus, Trash2, Pause, Play, X, Sparkles,
} from 'lucide-react'
import NextLink from 'next/link'

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

type WatchlistEntry = {
  id: string
  name: string
  listing_url: string
  region: string
  funder_type: string
  last_checked: string | null
  last_count: number
  status: 'active' | 'paused'
  last_error: string | null
  notes: string | null
  unresolved_alerts: number
  latest_alert: { id: string; alert_type: string; detected_at: string } | null
}

type Alert = {
  id: string
  watchlist_id: string
  alert_type: string
  detected_at: string
  snapshot_before: string | null
  snapshot_after: string | null
  resolved: boolean
  /** What the diff means, from classify-alerts. Report-only: nothing acts on it
   *  until the first week has been hand-sampled. */
  classification: string | null
  classification_quote: string | null
}

/** Label and tint for a classification chip. Neutral for cosmetic, because the
 *  point of the chip is to make the OTHER two findable in a long list. */
const CLASSIFICATION_CHIP: Record<string, { label: string; className: string }> = {
  funding_change: { label: 'Funding change', className: 'bg-emerald-50 text-forest' },
  page_gone:      { label: 'Page gone',      className: 'bg-coral-pale text-coral-deep' },
  cosmetic:       { label: 'Cosmetic',       className: 'bg-stone-100 text-mid' },
  unclear:        { label: 'Unclear',        className: 'bg-stone-100 text-light' },
}

const REGION_COLOURS: Record<string, string> = {
  'Scotland':         'bg-blue-50  text-blue-700',
  'Wales':            'bg-green-50 text-green-700',
  'Northern Ireland': 'bg-orange-50 text-orange-700',
  'London':           'bg-amber-pale text-amber-deep',
  'national':         'bg-gray-100  text-gray-600',
}

function regionBadge(region: string) {
  return REGION_COLOURS[region] ?? 'bg-stone-100 text-stone-600'
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const d  = Math.floor(ms / 86400000)
  const h  = Math.floor(ms /  3600000)
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  return 'just now'
}

export default function WatchlistAdminPage() {
  const [authorised, setAuthorised]   = useState<boolean | null>(null)
  const [entries, setEntries]         = useState<WatchlistEntry[]>([])
  const [selectedEntry, setSelected]  = useState<WatchlistEntry | null>(null)
  const [alerts, setAlerts]           = useState<Alert[]>([])
  const [loadingAlerts, setLoadingAlerts] = useState(false)
  const [running, setRunning]         = useState(false)
  const [runResult, setRunResult]     = useState<{ changed: number; errors: number } | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm]         = useState({ name: '', listing_url: '', region: '', funder_type: 'trust_foundation', notes: '' })
  const [saving, setSaving]           = useState(false)
  const [toast, setToast]             = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      setAuthorised(data.user?.email === ADMIN_EMAIL)
    })
  }, [])

  // ── Load entries ────────────────────────────────────────────────────────────
  const loadEntries = useCallback(async () => {
    const res = await fetch('/api/admin/watchlist')
    if (!res.ok) return
    const { entries: data } = await res.json()
    setEntries(data ?? [])
  }, [])

  useEffect(() => { loadEntries() }, [loadEntries])

  // ── Load alerts for selected entry ──────────────────────────────────────────
  async function loadAlerts(entry: WatchlistEntry) {
    setSelected(entry)
    setLoadingAlerts(true)
    const res = await fetch(`/api/admin/watchlist/alerts?watchlist_id=${entry.id}`)
    const { alerts: data } = await res.json()
    setAlerts(data ?? [])
    setLoadingAlerts(false)
  }

  // ── Resolve alert ───────────────────────────────────────────────────────────
  async function resolveAlert(alertId: string) {
    await fetch('/api/admin/watchlist/alerts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: alertId }),
    })
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, resolved: true } : a))
    await loadEntries()
    showToast('Alert marked as reviewed')
  }

  // ── Pause / resume entry ────────────────────────────────────────────────────
  async function toggleStatus(entry: WatchlistEntry) {
    const newStatus = entry.status === 'active' ? 'paused' : 'active'
    await fetch('/api/admin/watchlist', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entry.id, status: newStatus }),
    })
    await loadEntries()
    showToast(newStatus === 'paused' ? 'Watching paused' : 'Watching resumed')
  }

  // ── Delete entry ────────────────────────────────────────────────────────────
  async function deleteEntry(id: string) {
    if (!confirm('Remove this funder from the watchlist?')) return
    await fetch('/api/admin/watchlist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (selectedEntry?.id === id) setSelected(null)
    await loadEntries()
    showToast('Funder removed from watchlist')
  }

  // ── Add new entry ───────────────────────────────────────────────────────────
  async function handleAdd() {
    if (!addForm.name.trim() || !addForm.listing_url.trim()) return
    setSaving(true)
    const res = await fetch('/api/admin/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    })
    setSaving(false)
    if (res.ok) {
      setShowAddForm(false)
      setAddForm({ name: '', listing_url: '', region: '', funder_type: 'trust_foundation', notes: '' })
      await loadEntries()
      showToast('Funder added to watchlist')
    } else {
      const { error } = await res.json()
      showToast(`Error: ${error}`)
    }
  }

  // ── Trigger manual check ────────────────────────────────────────────────────
  async function runCheck() {
    setRunning(true)
    setRunResult(null)
    const cronSecret = process.env.NEXT_PUBLIC_CRON_SECRET ?? ''
    const res = await fetch('/api/cron/check-watchlist', {
      headers: { Authorization: `Bearer ${cronSecret}` },
    })
    const data = await res.json()
    setRunning(false)
    setRunResult({ changed: data.changed ?? 0, errors: data.errors ?? 0 })
    await loadEntries()
    showToast(`Check complete — ${data.changed} changes, ${data.errors} errors`)
  }

  // ── Derived stats ───────────────────────────────────────────────────────────
  const totalAlerts   = entries.reduce((n, e) => n + e.unresolved_alerts, 0)
  const activeCount   = entries.filter(e => e.status === 'active').length
  const errorCount    = entries.filter(e => e.last_error).length
  const neverChecked  = entries.filter(e => !e.last_checked).length

  if (authorised === null) return <p className="p-8 text-mid">Checking access…</p>
  if (!authorised) return (
    <div className="p-8 text-center">
      <p className="text-coral-saturated font-semibold">Admin access required</p>
    </div>
  )

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
            <p className="text-sm text-[#5F5E5A]">
              Monitor funder listing pages — alerts when grant programmes are added or removed.
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => setShowAddForm(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-white transition-opacity hover:opacity-80"
              style={{ borderRadius: 9999, backgroundColor: '#008080' }}>
              <Plus className="h-4 w-4" />Add funder
            </button>
            <button
              onClick={runCheck}
              disabled={running}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold border transition-colors disabled:opacity-50"
              style={{ borderRadius: 9999, borderColor: '#E8E0D1', color: '#5F5E5A' }}>
              <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
              {running ? 'Checking…' : 'Run check now'}
            </button>
          </div>
        </div>
        <div className="flex gap-1 border-b border-[#E8E0D1]">
          <NextLink href="/dashboard/admin/intelligence"
            className="px-4 py-2.5 text-sm font-semibold border-b-2 border-transparent text-[#5F5E5A] hover:text-[#1C1C2E] transition-colors">
            Enrichment
          </NextLink>
          <NextLink href="/dashboard/admin/watchlist"
            className="px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors"
            style={{ borderColor: '#008080', color: '#008080' }}>
            Watchlist
          </NextLink>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Watching', value: activeCount,  colour: 'text-forest' },
          { label: 'Unresolved alerts', value: totalAlerts, colour: totalAlerts > 0 ? 'text-amber-600' : 'text-mid' },
          { label: 'Errors', value: errorCount, colour: errorCount > 0 ? 'text-coral-saturated' : 'text-mid' },
          { label: 'Never checked', value: neverChecked, colour: neverChecked > 0 ? 'text-amber-500' : 'text-mid' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl p-4 shadow-warm border border-warm">
            <p className={`font-display text-3xl font-bold ${s.colour}`}>{s.value}</p>
            <p className="text-xs text-light mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Run result banner ── */}
      {runResult && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${
          runResult.changed > 0 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
        }`}>
          {runResult.changed > 0
            ? `⚠ ${runResult.changed} funder page(s) have changed — check alerts below`
            : `✓ All pages unchanged${runResult.errors > 0 ? ` (${runResult.errors} errors)` : ''}`}
        </div>
      )}

      {/* ── Add form ── */}
      {showAddForm && (
        <div className="bg-white rounded-xl border border-warm shadow-warm p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <p className="font-semibold text-charcoal">Add funder to watchlist</p>
            <button onClick={() => setShowAddForm(false)} className="text-light hover:text-charcoal"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-light block mb-1">Funder name *</label>
              <input
                className="form-input w-full text-sm"
                placeholder="e.g. Cornwall Community Foundation"
                value={addForm.name}
                onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-light block mb-1">Listing page URL *</label>
              <input
                className="form-input w-full text-sm"
                placeholder="https://..."
                value={addForm.listing_url}
                onChange={e => setAddForm(p => ({ ...p, listing_url: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-light block mb-1">Region</label>
              <input
                className="form-input w-full text-sm"
                placeholder="e.g. Cornwall, national"
                value={addForm.region}
                onChange={e => setAddForm(p => ({ ...p, region: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-light block mb-1">Funder type</label>
              <select
                className="form-input w-full text-sm"
                value={addForm.funder_type}
                onChange={e => setAddForm(p => ({ ...p, funder_type: e.target.value }))}
              >
                <option value="trust_foundation">Trust & Foundation</option>
                <option value="capacity_builder">Capacity Builder</option>
                <option value="lottery">Lottery</option>
                <option value="corporate">Corporate</option>
                <option value="government">Government</option>
                <option value="local_authority">Local Authority</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-light block mb-1">Notes (optional)</label>
              <input
                className="form-input w-full text-sm"
                placeholder="e.g. Check quarterly, not weekly"
                value={addForm.notes}
                onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving || !addForm.name || !addForm.listing_url}
              className="px-4 py-2 bg-forest text-white text-sm font-semibold rounded-lg hover:bg-forest/90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Add to watchlist'}
            </button>
            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-sm text-mid hover:text-charcoal">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* ── Funder list ── */}
        <div className="lg:col-span-3 space-y-2">
          {entries.map(entry => (
            <div
              key={entry.id}
              onClick={() => loadAlerts(entry)}
              className={`bg-white rounded-xl border p-4 cursor-pointer hover:shadow-md transition-all ${
                selectedEntry?.id === entry.id ? 'border-forest shadow-md' : 'border-warm shadow-warm'
              } ${entry.status === 'paused' ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-semibold text-charcoal text-sm">{entry.name}</p>
                    {entry.unresolved_alerts > 0 && (
                      <span className="bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                        {entry.unresolved_alerts} alert{entry.unresolved_alerts > 1 ? 's' : ''}
                      </span>
                    )}
                    {entry.status === 'paused' && (
                      <span className="bg-gray-100 text-gray-500 text-[9px] font-bold px-1.5 py-0.5 rounded">PAUSED</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${regionBadge(entry.region)}`}>
                      {entry.region}
                    </span>
                    {entry.last_error ? (
                      <span className="text-[10px] text-coral-saturated font-medium flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />Error
                      </span>
                    ) : entry.last_checked ? (
                      <span className="text-[10px] text-light">
                        ✓ Checked {relativeTime(entry.last_checked)} · {entry.last_count} items
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-600 font-medium">Not yet checked</span>
                    )}
                  </div>
                  {entry.last_error && (
                    <p className="text-[10px] text-coral-saturated mt-0.5 truncate">{entry.last_error}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <a
                    href={entry.listing_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-light hover:text-forest"
                    title="Open listing page"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    onClick={e => { e.stopPropagation(); toggleStatus(entry) }}
                    className="text-light hover:text-charcoal"
                    title={entry.status === 'active' ? 'Pause watching' : 'Resume watching'}
                  >
                    {entry.status === 'active' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); deleteEntry(entry.id) }}
                    className="text-light hover:text-coral-saturated"
                    title="Remove from watchlist"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {entries.length === 0 && (
            <div className="text-center py-12 text-light">
              <Bell className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p>No funders in the watchlist yet</p>
            </div>
          )}
        </div>

        {/* ── Alert detail panel ── */}
        <div className="lg:col-span-2">
          {selectedEntry ? (
            <div className="bg-white rounded-xl border border-warm shadow-warm p-5 sticky top-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-semibold text-charcoal text-sm">{selectedEntry.name}</p>
                  <a
                    href={selectedEntry.listing_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-sage hover:underline truncate block"
                  >
                    {selectedEntry.listing_url}
                  </a>
                </div>
                <button onClick={() => setSelected(null)} className="text-light hover:text-charcoal">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {loadingAlerts ? (
                <p className="text-xs text-light py-4 text-center">Loading alerts…</p>
              ) : alerts.length === 0 ? (
                <div className="text-center py-8 text-light">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
                  <p className="text-xs">No alerts — listing page is stable</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {alerts.map(alert => (
                    <div
                      key={alert.id}
                      className={`rounded-lg border p-3 text-xs ${
                        alert.resolved
                          ? 'border-warm bg-stone-50 opacity-60'
                          : alert.alert_type === 'page_down' || alert.alert_type === 'listing_collapsed'
                          ? 'border-coral-mid bg-coral-pale'
                          : 'border-amber-200 bg-amber-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5">
                          {alert.alert_type === 'page_down' || alert.alert_type === 'listing_collapsed'
                            ? <AlertTriangle className="h-3.5 w-3.5 text-coral-saturated flex-shrink-0" />
                            : <Bell className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                          }
                          {/* A collapse is a takedown, a wall or a redesign, never a
                              copy edit. Calling it "Listing changed" alongside a
                              reordered news carousel is what let the one alert
                              worth acting on sit unread with the other 386. */}
                          <span className="font-semibold text-charcoal">
                            {alert.alert_type === 'page_down'        ? 'Page down'
                              : alert.alert_type === 'listing_collapsed' ? 'Listing emptied'
                              : 'Listing changed'}
                          </span>
                          <span className="text-light">· {relativeTime(alert.detected_at)}</span>
                          {/* What the diff actually means. The one line that
                              turns 387 unread alerts into a list you can scan:
                              without it, a reordered news carousel and a closed
                              fund look identical from here. */}
                          {alert.classification && CLASSIFICATION_CHIP[alert.classification] && (
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${CLASSIFICATION_CHIP[alert.classification].className}`}
                              title={alert.classification_quote ?? undefined}
                            >
                              {CLASSIFICATION_CHIP[alert.classification].label}
                            </span>
                          )}
                        </div>
                        {!alert.resolved && (
                          <button
                            onClick={() => resolveAlert(alert.id)}
                            className="flex items-center gap-1 text-emerald-600 hover:text-emerald-800 font-medium flex-shrink-0"
                            title="Mark as reviewed"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />Reviewed
                          </button>
                        )}
                      </div>

                      {(alert.alert_type === 'listing_changed' || alert.alert_type === 'listing_collapsed')
                        && alert.snapshot_before && (
                        <div className="space-y-1.5">
                          <div>
                            <p className="text-[10px] font-semibold text-light uppercase mb-1">Before</p>
                            <p className="text-[10px] text-mid bg-white rounded p-1.5 border border-warm leading-relaxed line-clamp-4">
                              {alert.snapshot_before.replace(/ \|\| /g, ' · ')}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold text-light uppercase mb-1">After</p>
                            <p className="text-[10px] text-mid bg-white rounded p-1.5 border border-warm leading-relaxed line-clamp-4">
                              {alert.snapshot_after?.replace(/ \|\| /g, ' · ')}
                            </p>
                          </div>
                        </div>
                      )}
                      {alert.alert_type === 'page_down' && (
                        <p className="text-[10px] text-coral-deep">{alert.snapshot_after}</p>
                      )}
                      {alert.classification_quote && (
                        <p className="text-[10px] text-mid mt-1.5 italic">
                          &ldquo;{alert.classification_quote}&rdquo;
                        </p>
                      )}
                      {alert.resolved && (
                        <p className="text-[10px] text-light mt-1 italic">Marked as reviewed</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-warm shadow-warm p-8 text-center text-light sticky top-4">
              <BellOff className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Click a funder to view its alerts</p>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-forest text-white px-5 py-3.5 rounded-xl shadow-lg text-sm z-50">
          ✓ {toast}
        </div>
      )}
    </div>
  )
}

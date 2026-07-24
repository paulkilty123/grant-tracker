'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

interface UserRow {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  full_name: string | null
  created_at: string
  email_confirmed_at: string | null
  last_sign_in_at: string | null
  org_name: string | null
  org_id: string | null
  has_legal_structure: boolean
  has_impact_sectors: boolean
  onboarding_complete: boolean
  pipeline_count: number
  saved_count: number
}

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
function displayName(u: UserRow): string {
  if (u.first_name && u.last_name) return `${u.first_name} ${u.last_name}`
  if (u.first_name) return u.first_name
  if (u.full_name) return u.full_name
  if (u.email) return u.email.split('@')[0]
  return '—'
}

export default function AdminUsersPage() {
  const router = useRouter()
  const [rows, setRows] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'unconfirmed' | 'onboarded' | 'not_onboarded' | 'active'>('all')

  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => {
        if (r.status === 403) { setDenied(true); setLoading(false); return null }
        return r.json()
      })
      .then(data => {
        if (!data) return
        if (data.error) { setError(data.error); setLoading(false); return }
        setRows(data.rows ?? [])
        setLoading(false)
      })
      .catch(e => { setError(e instanceof Error ? e.message : 'Load failed'); setLoading(false) })
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(u => {
      if (filter === 'confirmed' && !u.email_confirmed_at) return false
      if (filter === 'unconfirmed' && u.email_confirmed_at) return false
      if (filter === 'onboarded' && !u.onboarding_complete) return false
      if (filter === 'not_onboarded' && u.onboarding_complete) return false
      if (filter === 'active' && u.pipeline_count === 0 && u.saved_count === 0) return false
      if (q && !(
        (u.email ?? '').toLowerCase().includes(q)
        || (u.org_name ?? '').toLowerCase().includes(q)
        || displayName(u).toLowerCase().includes(q)
      )) return false
      return true
    })
  }, [rows, search, filter])

  // Today / this-week counts (local time)
  const today = new Date(); today.setHours(0,0,0,0)
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7)
  const signupsToday = rows.filter(u => new Date(u.created_at) >= today).length
  const signupsWeek = rows.filter(u => new Date(u.created_at) >= weekAgo).length
  const onboardedCount = rows.filter(u => u.onboarding_complete).length
  const activeCount = rows.filter(u => u.pipeline_count > 0 || u.saved_count > 0).length

  if (loading) return <div className="p-12 text-sm text-mid">Loading users…</div>
  if (denied) return <div className="p-12 text-sm text-coral-deep">Access denied — admin only.</div>
  if (error) return <div className="p-12 text-sm text-coral-deep">Error: {error}</div>

  // Exclude the admin's own account from main list display? Keep it but flag.
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <div className="mb-7">
        <h2 className="font-display text-2xl font-bold text-charcoal">Users</h2>
        <p className="text-mid text-sm mt-1">{rows.length} total accounts on the platform</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-7">
        {[
          { label: 'Total accounts',  value: rows.length,    colour: 'text-forest' },
          { label: 'Today',           value: signupsToday,   colour: 'text-forest' },
          { label: 'Last 7 days',     value: signupsWeek,    colour: 'text-forest' },
          { label: 'Onboarded',       value: `${onboardedCount}/${rows.length}`, colour: 'text-sage-deep' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl p-5 shadow-card text-center" style={{ border: '0.5px solid rgba(23,52,4,0.08)' }}>
            <p className={`font-display text-3xl font-bold ${kpi.colour}`}>{kpi.value}</p>
            <p className="text-xs text-mid mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by email, name or org…"
          className="flex-1 min-w-[240px] rounded-full border border-warm bg-white px-4 py-2 text-sm text-charcoal placeholder:text-light focus:border-forest focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          {([
            { key: 'all',           label: `All (${rows.length})` },
            { key: 'confirmed',     label: `Confirmed (${rows.filter(u => u.email_confirmed_at).length})` },
            { key: 'unconfirmed',   label: `Unconfirmed (${rows.filter(u => !u.email_confirmed_at).length})` },
            { key: 'onboarded',     label: `Onboarded (${onboardedCount})` },
            { key: 'not_onboarded', label: `Not onboarded (${rows.length - onboardedCount})` },
            { key: 'active',        label: `Active (${activeCount})` },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === t.key ? 'bg-forest text-white' : 'border border-warm bg-white text-mid hover:border-forest/30 hover:text-charcoal'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-card overflow-hidden" style={{ border: '0.5px solid rgba(23,52,4,0.08)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-warm bg-warm/20 text-left text-xs font-semibold text-mid uppercase tracking-wider">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Organisation</th>
                <th className="px-4 py-3">Signed up</th>
                <th className="px-4 py-3">Last seen</th>
                <th className="px-3 py-3 text-center">Confirmed</th>
                <th className="px-3 py-3 text-center">Onboarded</th>
                <th className="px-3 py-3 text-right">Pipeline</th>
                <th className="px-3 py-3 text-right">Saved</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm/40">
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-mid">No users match.</td></tr>
              ) : filtered.map(u => {
                const isAdmin = u.email === ADMIN_EMAIL
                return (
                  <tr
                    key={u.id}
                    onClick={() => router.push(`/dashboard/admin/users/${u.id}`)}
                    className={`hover:bg-warm/20 transition-colors cursor-pointer ${isAdmin ? 'bg-amber-50/30' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-charcoal">{displayName(u)}</p>
                      {isAdmin && <p className="text-[10px] text-amber-700 font-semibold uppercase tracking-wider mt-0.5">Admin</p>}
                    </td>
                    <td className="px-4 py-3 text-mid">{u.email ?? '—'}</td>
                    <td className="px-4 py-3">
                      <p className="text-charcoal">{u.org_name || <span className="text-light italic">no org</span>}</p>
                    </td>
                    <td className="px-4 py-3 text-mid whitespace-nowrap text-xs">{fmtDate(u.created_at)}</td>
                    <td className="px-4 py-3 text-mid whitespace-nowrap text-xs">{fmtDateTime(u.last_sign_in_at)}</td>
                    <td className="px-3 py-3 text-center">
                      {u.email_confirmed_at
                        ? <span className="text-sage-deep">✓</span>
                        : <span className="text-coral-deep text-xs font-semibold">No</span>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {u.onboarding_complete
                        ? <span className="text-sage-deep">✓</span>
                        : <span className="text-light text-xs">{u.org_id ? 'Partial' : 'No org'}</span>}
                    </td>
                    <td className="px-3 py-3 text-right text-charcoal font-medium">{u.pipeline_count || <span className="text-light">—</span>}</td>
                    <td className="px-3 py-3 text-right text-charcoal font-medium">{u.saved_count || <span className="text-light">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

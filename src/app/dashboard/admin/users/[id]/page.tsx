'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'

interface Org {
  id: string
  name: string | null
  legal_structure: string | null
  org_type: string | null
  org_stage: string | null
  annual_income_band: string | null
  primary_location: string | null
  geographic_reach: string | null
  mission: string | null
  website_url: string | null
  impact_sectors: string[] | null
  beneficiary_groups: string[] | null
  niche_tags: string[] | null
  funding_type_preferences: string[] | null
  min_grant_target: number | null
  max_grant_target: number | null
  created_at: string
  updated_at: string
}

interface PipelineItem {
  id: string
  grant_name: string
  funder_name: string | null
  funder_type: string | null
  stage: string
  deadline: string | null
  is_urgent: boolean
  amount_min: number | null
  amount_max: number | null
  amount_requested: number | null
  application_progress: number | null
  grant_url: string | null
  notes: string | null
  outcome_date: string | null
  outcome_notes: string | null
  created_at: string
  updated_at: string
}

interface SavedRow {
  grant_id: string
  saved_at: string
  grant: {
    id?: string
    title?: string
    funder?: string
    deadline?: string | null
    is_rolling?: boolean
    amount_max?: number | null
    apply_url?: string | null
  } | null
}

interface Detail {
  user: {
    id: string
    email: string | null
    first_name: string | null
    last_name: string | null
    full_name: string | null
    org_name: string | null
    created_at: string
    email_confirmed_at: string | null
    last_sign_in_at: string | null
  }
  org: Org | null
  pipeline: PipelineItem[]
  saved: SavedRow[]
  interactions_summary: Record<string, number>
}

const STAGE_COLOURS: Record<string, { bg: string; text: string }> = {
  identified: { bg: '#F5F1E8', text: '#5F5E5A' },
  applying:   { bg: '#EAF3DE', text: '#3B6D11' },
  submitted:  { bg: '#C0DD97', text: '#173404' },
  won:        { bg: '#639922', text: '#ffffff' },
  declined:   { bg: '#FAECE7', text: '#993C1D' },
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
function fmtMoney(v: number | null | undefined): string {
  if (v == null) return '—'
  return '£' + v.toLocaleString('en-GB')
}
function displayName(u: Detail['user']): string {
  if (u.first_name && u.last_name) return `${u.first_name} ${u.last_name}`
  if (u.first_name) return u.first_name
  if (u.full_name) return u.full_name
  if (u.email) return u.email.split('@')[0]
  return '—'
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!params?.id) return
    fetch(`/api/admin/users/${params.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setLoading(false); return }
        setDetail(data); setLoading(false)
      })
      .catch(e => { setError(e instanceof Error ? e.message : 'Load failed'); setLoading(false) })
  }, [params?.id])

  if (loading) return <div className="p-12 text-sm text-mid">Loading…</div>
  if (error)   return <div className="p-12 text-sm text-coral-deep">Error: {error}</div>
  if (!detail) return null

  const { user, org, pipeline, saved, interactions_summary } = detail

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <Link href="/dashboard/admin/users" className="inline-flex items-center gap-1.5 text-sm text-mid hover:text-charcoal mb-5 no-underline">
        <ArrowLeft size={14} /> Back to users
      </Link>

      {/* Identity */}
      <div className="mb-7">
        <h2 className="font-display text-2xl font-bold text-charcoal">{displayName(user)}</h2>
        <p className="text-mid text-sm mt-1">{user.email}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-mid">
          <span>Signed up <strong className="text-charcoal">{fmtDate(user.created_at)}</strong></span>
          <span>Last seen <strong className="text-charcoal">{fmtDateTime(user.last_sign_in_at)}</strong></span>
          <span>{user.email_confirmed_at ? <span className="text-sage font-semibold">Confirmed ✓</span> : <span className="text-coral-deep font-semibold">Unconfirmed</span>}</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-7">
        {[
          { label: 'Pipeline items',  value: pipeline.length },
          { label: 'Saved grants',    value: saved.length },
          { label: 'Liked',           value: interactions_summary.liked    ?? 0 },
          { label: 'Dismissed',       value: interactions_summary.dismissed ?? 0 },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl p-5 shadow-card text-center" style={{ border: '0.5px solid rgba(23,52,4,0.08)' }}>
            <p className="font-display text-3xl font-bold text-forest">{kpi.value}</p>
            <p className="text-xs text-mid mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Org profile */}
      <section className="mb-8">
        <h3 className="font-display text-lg font-bold text-charcoal mb-3">Organisation profile</h3>
        {org ? (
          <div className="bg-white rounded-xl p-5 shadow-card" style={{ border: '0.5px solid rgba(23,52,4,0.08)' }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field label="Name"               value={org.name} />
              <Field label="Legal structure"    value={org.legal_structure} />
              <Field label="Org type"           value={org.org_type} />
              <Field label="Stage"              value={org.org_stage} />
              <Field label="Annual income band" value={org.annual_income_band} />
              <Field label="Primary location"   value={org.primary_location} />
              <Field label="Geographic reach"   value={org.geographic_reach} />
              <Field label="Website"            value={org.website_url} link />
              <Field label="Grant target"       value={org.min_grant_target != null || org.max_grant_target != null ? `${fmtMoney(org.min_grant_target)} – ${fmtMoney(org.max_grant_target)}` : null} />
              <Field label="Profile updated"    value={fmtDateTime(org.updated_at)} />
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <ChipField label="Impact sectors"     items={org.impact_sectors} />
              <ChipField label="Beneficiaries"      items={org.beneficiary_groups} />
              <ChipField label="Sub-tags"           items={org.niche_tags} />
              <ChipField label="Funding preferences" items={org.funding_type_preferences} />
            </div>
            {org.mission && (
              <div className="mt-4 pt-4 border-t border-warm/40">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-mid mb-1">Mission</p>
                <p className="text-sm text-charcoal leading-relaxed">{org.mission}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl p-8 shadow-card text-center text-mid italic" style={{ border: '0.5px solid rgba(23,52,4,0.08)' }}>
            No organisation row yet — user hasn't started the onboarding wizard.
          </div>
        )}
      </section>

      {/* Pipeline */}
      <section className="mb-8">
        <h3 className="font-display text-lg font-bold text-charcoal mb-3">Pipeline ({pipeline.length})</h3>
        {pipeline.length === 0 ? (
          <div className="bg-white rounded-xl p-8 shadow-card text-center text-mid italic" style={{ border: '0.5px solid rgba(23,52,4,0.08)' }}>
            No grants in pipeline yet.
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-card overflow-hidden" style={{ border: '0.5px solid rgba(23,52,4,0.08)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-warm bg-warm/20 text-left text-xs font-semibold text-mid uppercase tracking-wider">
                    <th className="px-4 py-3">Grant</th>
                    <th className="px-3 py-3">Stage</th>
                    <th className="px-3 py-3">Deadline</th>
                    <th className="px-3 py-3 text-right">Amount</th>
                    <th className="px-3 py-3">Added</th>
                    <th className="px-3 py-3 text-center">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm/40">
                  {pipeline.map(p => {
                    const stage = STAGE_COLOURS[p.stage] ?? { bg: '#F5F1E8', text: '#5F5E5A' }
                    return (
                      <tr key={p.id} className="hover:bg-warm/20 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-charcoal">{p.grant_name}</p>
                          {p.funder_name && <p className="text-xs text-mid mt-0.5">{p.funder_name}</p>}
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold capitalize" style={{ background: stage.bg, color: stage.text }}>
                            {p.stage}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-mid whitespace-nowrap text-xs">
                          {p.deadline ? fmtDate(p.deadline) : <span className="text-light italic">no date</span>}
                          {p.is_urgent && <span className="ml-1.5 text-coral-deep font-semibold">⚠</span>}
                        </td>
                        <td className="px-3 py-3 text-right text-charcoal text-xs">
                          {fmtMoney(p.amount_requested ?? p.amount_max ?? p.amount_min)}
                        </td>
                        <td className="px-3 py-3 text-mid whitespace-nowrap text-xs">{fmtDate(p.created_at)}</td>
                        <td className="px-3 py-3 text-center">
                          {p.grant_url
                            ? <a href={p.grant_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-forest hover:text-sage"><ExternalLink size={13} /></a>
                            : <span className="text-light">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Saved */}
      <section className="mb-8">
        <h3 className="font-display text-lg font-bold text-charcoal mb-3">Saved grants ({saved.length})</h3>
        {saved.length === 0 ? (
          <div className="bg-white rounded-xl p-8 shadow-card text-center text-mid italic" style={{ border: '0.5px solid rgba(23,52,4,0.08)' }}>
            No saved grants.
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-card overflow-hidden" style={{ border: '0.5px solid rgba(23,52,4,0.08)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-warm bg-warm/20 text-left text-xs font-semibold text-mid uppercase tracking-wider">
                    <th className="px-4 py-3">Grant</th>
                    <th className="px-3 py-3">Deadline</th>
                    <th className="px-3 py-3 text-right">Max amount</th>
                    <th className="px-3 py-3">Saved</th>
                    <th className="px-3 py-3 text-center">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm/40">
                  {saved.map(s => (
                    <tr key={s.grant_id} className="hover:bg-warm/20 transition-colors">
                      <td className="px-4 py-3">
                        {s.grant ? (
                          <>
                            <p className="font-medium text-charcoal">{s.grant.title}</p>
                            {s.grant.funder && <p className="text-xs text-mid mt-0.5">{s.grant.funder}</p>}
                          </>
                        ) : (
                          <p className="text-light italic">Grant no longer in catalogue ({s.grant_id})</p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-mid whitespace-nowrap text-xs">
                        {s.grant?.is_rolling ? 'Rolling' : (s.grant?.deadline ? fmtDate(s.grant.deadline) : <span className="text-light italic">—</span>)}
                      </td>
                      <td className="px-3 py-3 text-right text-charcoal text-xs">{fmtMoney(s.grant?.amount_max ?? null)}</td>
                      <td className="px-3 py-3 text-mid whitespace-nowrap text-xs">{fmtDate(s.saved_at)}</td>
                      <td className="px-3 py-3 text-center">
                        {s.grant?.apply_url
                          ? <a href={s.grant.apply_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-forest hover:text-sage"><ExternalLink size={13} /></a>
                          : <span className="text-light">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function Field({ label, value, link }: { label: string; value: string | null | undefined; link?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-mid">{label}</p>
      {value
        ? (link
            ? <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer" className="text-sm text-forest hover:underline break-all">{value}</a>
            : <p className="text-sm text-charcoal">{value}</p>)
        : <p className="text-sm text-light italic">—</p>}
    </div>
  )
}

function ChipField({ label, items }: { label: string; items: string[] | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-mid mb-1">{label}</p>
      {items && items.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map(t => (
            <span key={t} className="inline-block px-2 py-0.5 rounded-md text-xs" style={{ background: '#F1F7E4', color: '#3B6D11' }}>
              {t.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      ) : <p className="text-sm text-light italic">—</p>}
    </div>
  )
}

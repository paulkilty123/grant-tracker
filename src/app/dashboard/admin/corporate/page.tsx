'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Search, Plus, Edit2, ToggleLeft, ToggleRight, X, Save, Loader2, Building2,
  ChevronDown, ChevronUp,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type BriefCategory = 'structured_programme' | 'relationship_giving' | 'non_cash_support' | 'innovation_commissioning'

interface PartnerBrief {
  category: BriefCategory
  when_to_apply?: string
  how_competitive?: string
  what_they_fund?: string
  what_they_dont_fund?: string
  strategic_approach?: string
  typical_timeline?: string
  key_facts?: string[]
  // relationship_giving extras
  relationship_entry_point?: string
  evidence_of_giving?: string
  // innovation_commissioning extras
  problems_they_solve?: string
}

interface CorporatePartner {
  id: string
  company_name: string
  slug: string
  industry_sector: string | null
  logo_url: string | null
  website: string | null
  programme_name: string | null
  programme_url: string | null
  support_types: string[]
  csr_themes: string[]
  impact_sectors: string[]
  geographic_focus: string[]
  amount_min: number | null
  amount_max: number | null
  annual_investment_estimate: number | null
  application_route: string | null
  description: string | null
  example_recipients: string[]
  contact_role: string | null
  contact_url: string | null
  is_active: boolean
  last_verified_at: string | null
  created_at: string
  partner_brief: PartnerBrief | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SUPPORT_TYPE_LABELS: Record<string, string> = {
  cash_grant: 'Cash Grant', in_kind: 'In-Kind', volunteering: 'Volunteering',
  pro_bono: 'Pro Bono', tech_product: 'Tech / Product', matched_giving: 'Matched Giving',
  sponsorship: 'Sponsorship', accelerator: 'Accelerator',
}

const ROUTE_LABELS: Record<string, string> = {
  open_application: 'Open', invitation_only: 'Invite Only',
  relationship_based: 'Relationship', community_fund: 'Community Fund',
  unknown: 'Unknown',
}

const BRIEF_CATEGORY_LABELS: Record<BriefCategory, string> = {
  structured_programme:    '🏛 Structured Programme',
  relationship_giving:     '🤝 Relationship Giving',
  non_cash_support:        '🛠 Non-Cash Support',
  innovation_commissioning:'🚀 Innovation / Commissioning',
}

const IMPACT_SECTORS = [
  'young_people','community','health','mental_health','housing','education',
  'employment','disability','older_people','environment','creative','heritage',
  'sport','women','justice','tech','financial_inclusion','food','international',
]

const SUPPORT_TYPES = Object.keys(SUPPORT_TYPE_LABELS)
const GEO_OPTIONS = ['England','Scotland','Wales','Northern Ireland','London','UK-wide','International']

const EMPTY_BRIEF: PartnerBrief = { category: 'structured_programme' }

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function fmtAmount(min: number | null, max: number | null) {
  if (!min && !max) return '—'
  if (min && max && min !== max) return `£${(min/1000).toFixed(0)}k–£${(max/1000).toFixed(0)}k`
  if (max) return `Up to £${(max/1000).toFixed(0)}k`
  if (min) return `From £${(min/1000).toFixed(0)}k`
  return '—'
}

// ── PartnerBrief editor ───────────────────────────────────────────────────────

function BriefEditor({ brief, onChange }: { brief: PartnerBrief; onChange: (b: PartnerBrief) => void }) {
  const set = <K extends keyof PartnerBrief>(key: K, val: PartnerBrief[K]) =>
    onChange({ ...brief, [key]: val })

  const briefField = (label: string, key: keyof PartnerBrief, placeholder?: string) => (
    <div key={key}>
      <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1">{label}</label>
      <textarea
        rows={2}
        value={(brief[key] as string | undefined) ?? ''}
        onChange={e => set(key, e.target.value as never)}
        placeholder={placeholder}
        className="w-full text-sm border border-warm rounded-lg px-3 py-2 text-charcoal resize-none focus:outline-none focus:border-sage-deep placeholder:text-light"
      />
    </div>
  )

  return (
    <div className="space-y-4 pt-1">
      {/* Category */}
      <div>
        <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">Category</label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(BRIEF_CATEGORY_LABELS) as BriefCategory[]).map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => set('category', cat)}
              className={`text-xs px-3 py-2 rounded-lg border text-left transition-colors ${
                brief.category === cat
                  ? 'bg-forest text-surface-page border-forest font-medium'
                  : 'bg-white text-charcoal border-warm hover:border-sage-deep'
              }`}
            >
              {BRIEF_CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* Common fields */}
      {briefField('When to Apply', 'when_to_apply', 'e.g. Applications open Feb–Apr each year')}
      {briefField('What They Fund', 'what_they_fund', 'e.g. Projects tackling food insecurity in deprived communities')}
      {briefField('What They Don\'t Fund', 'what_they_dont_fund', 'e.g. Individuals, statutory bodies, national organisations only')}
      {briefField('How Competitive', 'how_competitive', 'e.g. Very competitive — typically 8% success rate, ~120 applicants per round')}
      {briefField('Strategic Approach', 'strategic_approach', 'e.g. Focus on systems change; prefers multi-year relationships over one-off grants')}
      {briefField('Typical Timeline', 'typical_timeline', 'e.g. 12 weeks from submission to decision; funding released within 4 weeks of offer')}

      {/* Key facts */}
      <div>
        <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1">
          Key Facts <span className="text-light font-normal normal-case">(one per line)</span>
        </label>
        <textarea
          rows={3}
          value={(brief.key_facts ?? []).join('\n')}
          onChange={e => set('key_facts', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
          placeholder={'£75k average award\nFunded 42 orgs in 2024\nNo statutory bodies'}
          className="w-full text-sm border border-warm rounded-lg px-3 py-2 text-charcoal resize-none focus:outline-none focus:border-sage-deep placeholder:text-light font-mono"
        />
      </div>

      {/* Conditional: relationship_giving */}
      {brief.category === 'relationship_giving' && (
        <>
          {briefField('Relationship Entry Point', 'relationship_entry_point', 'e.g. Via employee volunteering scheme or warm intro from a trustee')}
          {briefField('Evidence of Giving', 'evidence_of_giving', 'e.g. Funded Shelter and Crisis — both housing orgs with <£1m income')}
        </>
      )}

      {/* Conditional: innovation_commissioning */}
      {brief.category === 'innovation_commissioning' && (
        briefField('Problems They\'re Trying to Solve', 'problems_they_solve', 'e.g. Reducing re-offending in their supply chain regions; seeking ventures with proven models')
      )}
    </div>
  )
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function EditModal({
  partner,
  onClose,
  onSaved,
}: {
  partner: CorporatePartner | null
  onClose: () => void
  onSaved: (p: CorporatePartner) => void
}) {
  const isNew = !partner
  const [form, setForm] = useState<Partial<CorporatePartner>>(partner ?? {
    company_name: '', slug: '', industry_sector: '', website: '', programme_name: '',
    programme_url: '', support_types: [], csr_themes: [], impact_sectors: [],
    geographic_focus: [], amount_min: null, amount_max: null,
    annual_investment_estimate: null, application_route: 'open_application',
    description: '', example_recipients: [], contact_role: '', contact_url: '',
    is_active: true, logo_url: '', partner_brief: null,
  })
  const [brief, setBrief] = useState<PartnerBrief>(partner?.partner_brief ?? EMPTY_BRIEF)
  const [showBrief, setShowBrief] = useState(!!partner?.partner_brief)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function setField<K extends keyof CorporatePartner>(key: K, val: CorporatePartner[K]) {
    setForm(f => {
      const updated = { ...f, [key]: val }
      if (key === 'company_name' && isNew) updated.slug = slugify(String(val))
      return updated
    })
  }

  function toggleArray(key: 'support_types' | 'impact_sectors' | 'geographic_focus' | 'csr_themes', val: string) {
    const arr = (form[key] ?? []) as string[]
    setField(key, (arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]) as never)
  }

  async function save() {
    if (!form.company_name?.trim()) { setError('Company name is required'); return }
    setSaving(true)
    setError('')
    const supabase = createClient()
    const payload = {
      ...form,
      slug: form.slug || slugify(form.company_name ?? ''),
      partner_brief: showBrief ? brief : null,
    }
    let result
    if (isNew) {
      result = await supabase.from('corporate_partners').insert(payload).select().single()
    } else {
      result = await supabase.from('corporate_partners').update(payload).eq('id', partner!.id).select().single()
    }
    if (result.error) { setError(result.error.message); setSaving(false); return }
    onSaved(result.data as CorporatePartner)
  }

  const chips = (items: string[], key: 'support_types' | 'impact_sectors' | 'geographic_focus' | 'csr_themes', labels?: Record<string, string>) => (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {items.map(item => {
        const selected = ((form[key] ?? []) as string[]).includes(item)
        return (
          <button key={item} type="button" onClick={() => toggleArray(key, item)}
            className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
              selected ? 'bg-forest text-surface-page border-forest' : 'bg-white text-charcoal border-warm hover:border-sage-deep'
            }`}>
            {labels?.[item] ?? item.replace(/_/g, ' ')}
          </button>
        )
      })}
    </div>
  )

  const field = (label: string, key: keyof CorporatePartner, type: 'text' | 'number' | 'textarea' | 'url' = 'text') => (
    <div>
      <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1">{label}</label>
      {type === 'textarea' ? (
        <textarea rows={3} value={(form[key] ?? '') as string}
          onChange={e => setField(key, e.target.value as never)}
          className="w-full text-sm border border-warm rounded-lg px-3 py-2 text-charcoal resize-none focus:outline-none focus:border-sage-deep" />
      ) : (
        <input type={type} value={(form[key] ?? '') as string | number}
          onChange={e => setField(key, (type === 'number' ? (e.target.value ? Number(e.target.value) : null) : e.target.value) as never)}
          className="w-full text-sm border border-warm rounded-lg px-3 py-2 text-charcoal focus:outline-none focus:border-sage-deep" />
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8">
      <div className="bg-surface-page rounded-xl shadow-2xl w-full max-w-2xl mx-4 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-warm">
          <h2 className="font-display text-xl font-bold text-forest">
            {isNew ? 'Add Corporate Partner' : `Edit — ${partner!.company_name}`}
          </h2>
          <button onClick={onClose} className="text-mid hover:text-charcoal"><X className="h-5 w-5" /></button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[76vh] overflow-y-auto">
          {error && (
            <div className="bg-coral-pale border border-coral-mid rounded-lg px-4 py-2.5 text-sm text-coral-deep">{error}</div>
          )}

          {/* Core fields */}
          <div className="grid grid-cols-2 gap-4">
            {field('Company Name', 'company_name')}
            {field('Industry Sector', 'industry_sector')}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {field('Slug', 'slug')}
            {field('Website', 'website', 'url')}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {field('Programme Name', 'programme_name')}
            {field('Programme URL', 'programme_url', 'url')}
          </div>
          {field('Description', 'description', 'textarea')}
          <div className="grid grid-cols-3 gap-4">
            {field('Amount Min (£)', 'amount_min', 'number')}
            {field('Amount Max (£)', 'amount_max', 'number')}
            {field('Annual Investment Est. (£)', 'annual_investment_estimate', 'number')}
          </div>
          <div>
            <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1">Application Route</label>
            <select value={form.application_route ?? 'open_application'}
              onChange={e => setField('application_route', e.target.value as never)}
              className="w-full text-sm border border-warm rounded-lg px-3 py-2 text-charcoal focus:outline-none focus:border-sage-deep">
              {Object.entries(ROUTE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">Support Types</label>
            {chips(SUPPORT_TYPES, 'support_types', SUPPORT_TYPE_LABELS)}
          </div>
          <div>
            <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">Impact Sectors</label>
            {chips(IMPACT_SECTORS, 'impact_sectors')}
          </div>
          <div>
            <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1.5">Geographic Focus</label>
            {chips(GEO_OPTIONS, 'geographic_focus')}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {field('Contact Role', 'contact_role')}
            {field('Contact URL', 'contact_url', 'url')}
          </div>
          <div>
            <label className="block text-xs font-semibold text-mid uppercase tracking-wider mb-1">Example Recipients (comma-separated)</label>
            <input type="text"
              value={(form.example_recipients ?? []).join(', ')}
              onChange={e => setField('example_recipients', e.target.value.split(',').map(s => s.trim()).filter(Boolean) as never)}
              className="w-full text-sm border border-warm rounded-lg px-3 py-2 text-charcoal focus:outline-none focus:border-sage-deep"
              placeholder="Org A, Org B, Org C" />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-semibold text-charcoal">Active</label>
            <button type="button" onClick={() => setField('is_active', !form.is_active as never)}
              className={`transition-colors ${form.is_active ? 'text-forest' : 'text-mid'}`}>
              {form.is_active ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
            </button>
            <span className="text-xs text-mid">{form.is_active ? 'Visible to users' : 'Hidden'}</span>
          </div>

          {/* ── Partner Brief (Intel) ── */}
          <div className="border border-warm rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowBrief(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-warm/40 hover:bg-warm/70 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-forest">Partner Intel Brief</span>
                {brief.category && showBrief && (
                  <span className="text-[10px] bg-forest/10 text-forest border border-forest/20 rounded-full px-2 py-0.5 font-medium">
                    {BRIEF_CATEGORY_LABELS[brief.category]}
                  </span>
                )}
                {!showBrief && (
                  <span className="text-xs text-mid">Drives match scoring &amp; competitive intel cards</span>
                )}
              </div>
              {showBrief ? <ChevronUp className="h-4 w-4 text-mid" /> : <ChevronDown className="h-4 w-4 text-mid" />}
            </button>

            {showBrief && (
              <div className="px-4 py-4 bg-white border-t border-warm">
                <BriefEditor brief={brief} onChange={setBrief} />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-warm">
          <button onClick={onClose}
            className="text-sm px-4 py-2 rounded-lg border border-warm text-mid hover:text-charcoal transition-colors">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 text-sm px-5 py-2 rounded-lg bg-forest text-surface-page hover:bg-sage-deep transition-colors disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminCorporatePage() {
  const router = useRouter()
  const [partners, setPartners] = useState<CorporatePartner[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [editTarget, setEditTarget]   = useState<CorporatePartner | 'new' | null>(null)
  const [togglingId, setTogglingId]   = useState<string | null>(null)
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      const { data } = await supabase.from('corporate_partners').select('*').order('company_name')
      setPartners((data ?? []) as CorporatePartner[])
      setLoading(false)
    }
    load()
  }, [router])

  async function toggleActive(partner: CorporatePartner) {
    setTogglingId(partner.id)
    const supabase = createClient()
    const newVal = !partner.is_active
    const { error } = await supabase.from('corporate_partners').update({ is_active: newVal }).eq('id', partner.id)
    if (!error) setPartners(prev => prev.map(p => p.id === partner.id ? { ...p, is_active: newVal } : p))
    setTogglingId(null)
  }

  function handleSaved(updated: CorporatePartner) {
    setPartners(prev => {
      const idx = prev.findIndex(p => p.id === updated.id)
      if (idx === -1) return [...prev, updated].sort((a, b) => a.company_name.localeCompare(b.company_name))
      const next = [...prev]; next[idx] = updated; return next
    })
    setEditTarget(null)
  }

  const filtered = useMemo(() => {
    let list = partners
    if (filterActive === 'active')   list = list.filter(p => p.is_active)
    if (filterActive === 'inactive') list = list.filter(p => !p.is_active)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p =>
        p.company_name.toLowerCase().includes(q) ||
        p.programme_name?.toLowerCase().includes(q) ||
        p.industry_sector?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
      )
    }
    return list
  }, [partners, search, filterActive])

  const totalActive   = partners.filter(p => p.is_active).length
  const totalInactive = partners.filter(p => !p.is_active).length
  const hasBrief      = partners.filter(p => p.partner_brief).length

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-mid">
      <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
    </div>
  )

  return (
    <div>
      {editTarget !== null && (
        <EditModal
          partner={editTarget === 'new' ? null : editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <h2 className="font-display text-2xl font-bold text-forest">Corporate Partners</h2>
          <p className="text-mid text-sm mt-1">
            {totalActive} active · {totalInactive} inactive · {hasBrief} with intel brief
          </p>
        </div>
        <button onClick={() => setEditTarget('new')}
          className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg bg-forest text-surface-page hover:bg-sage-deep transition-colors">
          <Plus className="h-4 w-4" /> Add Partner
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Partners', value: partners.length,  colour: 'text-forest'      },
          { label: 'Active',         value: totalActive,       colour: 'text-green-700'   },
          { label: 'Inactive',       value: totalInactive,     colour: totalInactive > 0 ? 'text-amber-700' : 'text-forest' },
          { label: 'Intel Briefs',   value: hasBrief,          colour: hasBrief < totalActive ? 'text-amber-700' : 'text-green-700' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl p-5 shadow-card text-center">
            <p className={`font-display text-3xl font-bold ${k.colour}`}>{k.value}</p>
            <p className="text-xs text-mid mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {hasBrief < totalActive && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3.5 mb-5 text-sm text-amber-800">
          <strong>{totalActive - hasBrief} partners</strong> are missing an intel brief — add one via Edit to improve match scoring quality.
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-mid" />
          <input type="text" placeholder="Search partners…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-warm rounded-lg focus:outline-none focus:border-sage-deep bg-white text-charcoal" />
        </div>
        {(['all', 'active', 'inactive'] as const).map(f => (
          <button key={f} onClick={() => setFilterActive(f)}
            className={`text-xs px-3.5 py-2 rounded-lg border font-medium transition-colors capitalize ${
              filterActive === f ? 'bg-forest text-surface-page border-forest' : 'bg-white text-mid border-warm hover:border-sage-deep'
            }`}>
            {f}
          </button>
        ))}
        <p className="text-xs text-mid ml-auto">{filtered.length} shown</p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-warm bg-warm/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-mid uppercase tracking-wider">Company</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-mid uppercase tracking-wider">Programme</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-mid uppercase tracking-wider">Support</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-mid uppercase tracking-wider">Amount</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-mid uppercase tracking-wider">Route</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-mid uppercase tracking-wider">Brief</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-mid uppercase tracking-wider">Active</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-mid uppercase tracking-wider">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm/50">
              {filtered.map(p => (
                <tr key={p.id} className={`hover:bg-warm/20 transition-colors ${!p.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-forest/10 flex items-center justify-center flex-shrink-0">
                        <Building2 className="h-3.5 w-3.5 text-forest" />
                      </div>
                      <div>
                        <p className="font-medium text-charcoal leading-tight">{p.company_name}</p>
                        {p.industry_sector && <p className="text-[11px] text-light">{p.industry_sector}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-charcoal">{p.programme_name ?? '—'}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(p.support_types ?? []).slice(0, 3).map(s => (
                        <span key={s} className="text-[10px] px-2 py-0.5 bg-forest/8 text-forest border border-forest/20 rounded-md font-medium">
                          {SUPPORT_TYPE_LABELS[s] ?? s}
                        </span>
                      ))}
                      {(p.support_types ?? []).length > 3 && (
                        <span className="text-[10px] text-mid">+{p.support_types.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-mid whitespace-nowrap">
                    {fmtAmount(p.amount_min, p.amount_max)}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="text-[10px] px-2 py-0.5 bg-warm text-mid rounded-md font-medium">
                      {ROUTE_LABELS[p.application_route ?? 'unknown'] ?? p.application_route ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    {p.partner_brief ? (
                      <span className="text-[10px] px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-md font-medium">
                        ✓ {BRIEF_CATEGORY_LABELS[p.partner_brief.category]?.split(' ').slice(1).join(' ') ?? 'Yes'}
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md font-medium">Missing</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button onClick={() => toggleActive(p)} disabled={togglingId === p.id}
                      className={`transition-colors disabled:opacity-50 ${p.is_active ? 'text-forest hover:text-sage-deep' : 'text-mid hover:text-charcoal'}`}
                      title={p.is_active ? 'Deactivate' : 'Activate'}>
                      {togglingId === p.id
                        ? <Loader2 className="h-5 w-5 animate-spin" />
                        : p.is_active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button onClick={() => setEditTarget(p)}
                      className="p-1.5 rounded-lg text-mid hover:text-forest hover:bg-forest/8 transition-colors"
                      title="Edit partner">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-mid text-sm">
                    No partners match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

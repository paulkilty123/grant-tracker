'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getOrganisationByOwner, createOrganisation, updateOrganisation } from '@/lib/organisations'
import type { Organisation, OrgType, FunderType } from '@/types'

const ORG_TYPE_OPTIONS: { value: OrgType; label: string }[] = [
  { value: 'registered_charity', label: 'Charity (registered)' },
  { value: 'community_group',    label: 'Community Group' },
  { value: 'social_enterprise',  label: 'Social Enterprise' },
  { value: 'cic',                label: 'Community Interest Company (CIC)' },
  { value: 'other',              label: 'Impact Founder / Sole Trader' },
  { value: 'other',              label: 'Underserved Venture' },
  { value: 'other',              label: 'Other' },
]

const INCOME_BANDS = [
  'Under £10,000',
  '£10,000–£50,000',
  '£50,000–£100,000',
  '£100,000–£500,000',
  'Over £500,000',
]

const FUNDER_TYPE_OPTIONS: { value: FunderType; label: string; emoji: string }[] = [
  { value: 'trust_foundation',   label: 'Trusts & Foundations',    emoji: '🏛️' },
  { value: 'lottery',            label: 'National Lottery',         emoji: '🎰' },
  { value: 'local_authority',    label: 'Local Authority',          emoji: '🏙️' },
  { value: 'government',         label: 'Central Government',       emoji: '🏛' },
  { value: 'corporate',          label: 'Corporate / CSR',          emoji: '🏢' },
  { value: 'housing_association',label: 'Housing Associations',     emoji: '🏠' },
  { value: 'other',              label: 'Other',                    emoji: '🔹' },
]

interface FormState {
  // Basic
  name: string
  charityNumber: string
  orgType: OrgType
  annualIncome: string
  // Location & focus
  primaryLocation: string
  geographicReach: string
  themes: string
  areasOfWork: string
  beneficiaries: string
  // Impact
  yearsOperating: string
  peoplePerYear: string
  volunteers: string
  projectsRunning: string
  keyOutcomes: string
  // Grant preferences
  minGrantTarget: string
  maxGrantTarget: string
  funderTypePreferences: FunderType[]
  // Mission
  mission: string
  // Alert preferences
  alertsEnabled: boolean
  alertFrequency: string
  alertMinScore: string
}

const EMPTY_FORM: FormState = {
  name: '',
  charityNumber: '',
  orgType: 'registered_charity',
  annualIncome: INCOME_BANDS[0],
  primaryLocation: '',
  geographicReach: 'local',
  themes: '',
  areasOfWork: '',
  beneficiaries: '',
  yearsOperating: '',
  peoplePerYear: '',
  volunteers: '',
  projectsRunning: '',
  keyOutcomes: '',
  minGrantTarget: '',
  maxGrantTarget: '',
  funderTypePreferences: [],
  mission: '',
  alertsEnabled: false,
  alertFrequency: 'weekly',
  alertMinScore: '70',
}

function orgToForm(org: Organisation): FormState {
  return {
    name:                  org.name ?? '',
    charityNumber:         org.charity_number ?? org.cic_number ?? '',
    orgType:               org.org_type ?? 'registered_charity',
    annualIncome:          org.annual_income_band ?? INCOME_BANDS[0],
    primaryLocation:       org.primary_location ?? '',
    geographicReach:       'local',
    themes:                (org.themes ?? []).join(', '),
    areasOfWork:           (org.areas_of_work ?? []).join(', '),
    beneficiaries:         (org.beneficiaries ?? []).join(', '),
    yearsOperating:        org.years_operating != null ? String(org.years_operating) : '',
    peoplePerYear:         org.people_per_year != null ? String(org.people_per_year) : '',
    volunteers:            org.volunteers != null ? String(org.volunteers) : '',
    projectsRunning:       org.projects_running != null ? String(org.projects_running) : '',
    keyOutcomes:           (org.key_outcomes ?? []).join('\n'),
    minGrantTarget:        org.min_grant_target != null ? String(org.min_grant_target) : '',
    maxGrantTarget:        org.max_grant_target != null ? String(org.max_grant_target) : '',
    funderTypePreferences: org.funder_type_preferences ?? [],
    mission:               org.mission ?? '',
    alertsEnabled:         (org as Organisation & { alerts_enabled?: boolean }).alerts_enabled ?? false,
    alertFrequency:        (org as Organisation & { alert_frequency?: string }).alert_frequency ?? 'weekly',
    alertMinScore:         String((org as Organisation & { alert_min_score?: number }).alert_min_score ?? 70),
  }
}

// Score how complete the profile is (0–100)
function completenessScore(form: FormState): { score: number; missing: string[] } {
  const checks: { label: string; filled: boolean }[] = [
    { label: 'Name',                  filled: !!form.name.trim() },
    { label: 'Type',                  filled: !!form.orgType },
    { label: 'Annual income',         filled: !!form.annualIncome },
    { label: 'Primary location',      filled: !!form.primaryLocation.trim() },
    { label: 'Priority themes',       filled: !!form.themes.trim() },
    { label: 'Areas of work',         filled: !!form.areasOfWork.trim() },
    { label: 'Beneficiaries',         filled: !!form.beneficiaries.trim() },
    { label: 'Mission statement',     filled: !!form.mission.trim() },
    { label: 'Years operating',       filled: !!form.yearsOperating },
    { label: 'People served/year',    filled: !!form.peoplePerYear },
    { label: 'Grant size preference', filled: !!form.minGrantTarget || !!form.maxGrantTarget },
    { label: 'Funder preferences',    filled: form.funderTypePreferences.length > 0 },
    { label: 'Key outcomes',          filled: !!form.keyOutcomes.trim() },
  ]
  const filled = checks.filter(c => c.filled).length
  const missing = checks.filter(c => !c.filled).map(c => c.label)
  return { score: Math.round((filled / checks.length) * 100), missing }
}

export default function ProfilePage() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  // Auto-fill state
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [autoFilling, setAutoFilling] = useState(false)
  const [autoFillError, setAutoFillError] = useState<string | null>(null)
  const [autoFillSuccess, setAutoFillSuccess] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const org = await getOrganisationByOwner(user.id)
      if (org) {
        setOrgId(org.id)
        setForm(orgToForm(org))
      }
      setLoading(false)
    }
    load()
  }, [])

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  function toggleFunderType(type: FunderType) {
    setForm(prev => ({
      ...prev,
      funderTypePreferences: prev.funderTypePreferences.includes(type)
        ? prev.funderTypePreferences.filter(t => t !== type)
        : [...prev.funderTypePreferences, type],
    }))
  }

  async function handleAutoFill() {
    if (!websiteUrl.trim()) return
    setAutoFilling(true)
    setAutoFillError(null)
    setAutoFillSuccess(false)
    try {
      const res = await fetch('/api/org-autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: websiteUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Auto-fill failed')
      setForm(prev => ({
        ...prev,
        name:            data.name            || prev.name,
        charityNumber:   data.charityNumber   || prev.charityNumber,
        orgType:         data.orgType         || prev.orgType,
        annualIncome:    data.annualIncome     || prev.annualIncome,
        primaryLocation: data.primaryLocation || prev.primaryLocation,
        themes:          Array.isArray(data.themes)        ? data.themes.join(', ')        : prev.themes,
        areasOfWork:     Array.isArray(data.areasOfWork)   ? data.areasOfWork.join(', ')   : prev.areasOfWork,
        beneficiaries:   Array.isArray(data.beneficiaries) ? data.beneficiaries.join(', ') : prev.beneficiaries,
        mission:         data.mission         || prev.mission,
      }))
      setAutoFillSuccess(true)
    } catch (err) {
      setAutoFillError(err instanceof Error ? err.message : 'Auto-fill failed — please try again')
    } finally {
      setAutoFilling(false)
    }
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    setSaveStatus('idle')

    const payload: Omit<Organisation, 'id' | 'created_at'> & { alerts_enabled: boolean; alert_frequency: string; alert_min_score: number } = {
      name:                    form.name.trim(),
      charity_number:          form.charityNumber.trim() || null,
      cic_number:              null,
      org_type:                form.orgType,
      annual_income_band:      form.annualIncome,
      primary_location:        form.primaryLocation.trim() || null,
      themes:                  form.themes.split(',').map(s => s.trim()).filter(Boolean),
      areas_of_work:           form.areasOfWork.split(',').map(s => s.trim()).filter(Boolean),
      beneficiaries:           form.beneficiaries.split(',').map(s => s.trim()).filter(Boolean),
      mission:                 form.mission.trim() || null,
      years_operating:         form.yearsOperating ? parseInt(form.yearsOperating) : null,
      people_per_year:         form.peoplePerYear ? parseInt(form.peoplePerYear) : null,
      volunteers:              form.volunteers ? parseInt(form.volunteers) : null,
      projects_running:        form.projectsRunning ? parseInt(form.projectsRunning) : null,
      key_outcomes:            form.keyOutcomes.split('\n').map(s => s.trim()).filter(Boolean),
      min_grant_target:        form.minGrantTarget ? parseInt(form.minGrantTarget.replace(/,/g, '')) : null,
      max_grant_target:        form.maxGrantTarget ? parseInt(form.maxGrantTarget.replace(/,/g, '')) : null,
      funder_type_preferences: form.funderTypePreferences,
      owner_id:                userId,
      alerts_enabled:          form.alertsEnabled,
      alert_frequency:         form.alertFrequency,
      alert_min_score:         parseInt(form.alertMinScore) || 70,
    }

    try {
      if (orgId) {
        await updateOrganisation(orgId, payload)
      } else {
        const created = await createOrganisation(payload)
        setOrgId(created.id)
      }
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch {
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-mid text-sm">
        Loading profile…
      </div>
    )
  }

  const { score, missing } = completenessScore(form)
  const scoreColor = score >= 80 ? 'bg-sage' : score >= 50 ? 'bg-gold' : 'bg-red-400'
  const scoreLabel = score >= 80 ? 'Strong profile' : score >= 50 ? 'Getting there' : 'Needs more detail'

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-forest">Your Profile</h2>
          <p className="text-mid text-sm mt-1">A complete profile means better grant matches and more relevant alerts</p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === 'error' && (
            <p className="text-xs text-red-500">Save failed — please try again</p>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved!' : 'Save Profile'}
          </button>
        </div>
      </div>

      {/* ── Profile completeness bar ── */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-forest">{scoreLabel}</span>
            <span className="text-xs text-mid">— {score}% complete</span>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full text-white ${scoreColor}`}>
            {score}%
          </span>
        </div>
        <div className="w-full bg-warm rounded-full h-2 mb-3">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${scoreColor}`}
            style={{ width: `${score}%` }}
          />
        </div>
        {missing.length > 0 && (
          <p className="text-xs text-mid">
            <span className="font-medium">Still to fill in:</span>{' '}
            {missing.join(' · ')}
          </p>
        )}
        {score === 100 && (
          <p className="text-xs text-sage font-medium">✓ Your profile is fully complete — grant matching is working at full power</p>
        )}
      </div>

      {/* ── Auto-fill ── */}
      <div className="card mb-6">
        <div className="flex items-start gap-3 mb-3">
          <span className="text-2xl">✨</span>
          <div>
            <h3 className="font-display text-sm font-semibold text-forest">Auto-fill from your website</h3>
            <p className="text-xs text-mid mt-0.5">
              Enter your website and AI will read it and fill in your profile automatically.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <input
            type="url"
            className="form-input flex-1"
            placeholder="https://yourwebsite.co.uk"
            value={websiteUrl}
            onChange={e => { setWebsiteUrl(e.target.value); setAutoFillError(null); setAutoFillSuccess(false) }}
            onKeyDown={e => e.key === 'Enter' && handleAutoFill()}
          />
          <button
            onClick={handleAutoFill}
            disabled={autoFilling || !websiteUrl.trim()}
            className="btn-primary disabled:opacity-50 whitespace-nowrap"
          >
            {autoFilling ? '⏳ Reading…' : '✨ Auto-fill'}
          </button>
        </div>
        {autoFillSuccess && (
          <p className="text-xs text-sage mt-2 font-medium">✓ Fields filled from your website — review below and save when ready.</p>
        )}
        {autoFillError && (
          <p className="text-xs text-red-500 mt-2">⚠ {autoFillError}</p>
        )}
      </div>

      <div className="space-y-5">

        {/* ── Section 1: Organisation Details ── */}
        <div className="card">
          <h3 className="font-display text-sm font-semibold text-forest mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-forest/10 text-forest text-xs flex items-center justify-center font-bold">1</span>
            About You
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-charcoal mb-1.5">
                Organisation or venture name <span className="text-red-400">*</span>
              </label>
              <input
                className="form-input"
                placeholder="e.g. Green Communities CIC or The Makers Project"
                value={form.name}
                onChange={set('name')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Organisation type</label>
              <select className="form-select" value={form.orgType} onChange={set('orgType')}>
                {ORG_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Charity / CIC / Company number <span className="text-light font-normal">(if applicable)</span></label>
              <input
                className="form-input"
                placeholder="e.g. 1234567"
                value={form.charityNumber}
                onChange={set('charityNumber')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Annual income / turnover</label>
              <select className="form-select" value={form.annualIncome} onChange={set('annualIncome')}>
                {INCOME_BANDS.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Years operating</label>
              <input
                type="number"
                min="0"
                max="200"
                className="form-input"
                placeholder="e.g. 5"
                value={form.yearsOperating}
                onChange={set('yearsOperating')}
              />
              <p className="text-xs text-light mt-1">Some funders require a minimum trading history</p>
            </div>
          </div>
        </div>

        {/* ── Section 2: Location & Focus ── */}
        <div className="card">
          <h3 className="font-display text-sm font-semibold text-forest mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-forest/10 text-forest text-xs flex items-center justify-center font-bold">2</span>
            Location & Focus
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Primary location</label>
              <input
                className="form-input"
                placeholder="e.g. Southall, London Borough of Ealing"
                value={form.primaryLocation}
                onChange={set('primaryLocation')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Geographic reach</label>
              <select className="form-select" value={form.geographicReach} onChange={set('geographicReach')}>
                <option value="hyper_local">Hyper-local (single neighbourhood)</option>
                <option value="local">Local (town / borough)</option>
                <option value="regional">Regional (county / region)</option>
                <option value="national">National (England / UK-wide)</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-charcoal mb-1.5">Priority themes</label>
              <input
                className="form-input"
                placeholder="e.g. Domestic abuse, Mental health, Employment"
                value={form.themes}
                onChange={set('themes')}
              />
              <p className="text-xs text-light mt-1">Broad topic areas, comma-separated</p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-charcoal mb-1.5">Areas of work</label>
              <input
                className="form-input"
                placeholder="e.g. English classes, Counselling, Food bank, CV workshops"
                value={form.areasOfWork}
                onChange={set('areasOfWork')}
              />
              <p className="text-xs text-light mt-1">Specific programmes and activities, comma-separated</p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-charcoal mb-1.5">Beneficiaries</label>
              <input
                className="form-input"
                placeholder="e.g. BAME women, Refugees, Young people 16–25"
                value={form.beneficiaries}
                onChange={set('beneficiaries')}
              />
              <p className="text-xs text-light mt-1">Who you serve, comma-separated</p>
            </div>
          </div>
        </div>

        {/* ── Section 3: Impact & Scale ── */}
        <div className="card">
          <h3 className="font-display text-sm font-semibold text-forest mb-1 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-forest/10 text-forest text-xs flex items-center justify-center font-bold">3</span>
            Impact & Scale
          </h3>
          <p className="text-xs text-mid mb-4 ml-8">Funders use this to understand the size and reach of your work</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">People served / year</label>
              <input
                type="number"
                min="0"
                className="form-input"
                placeholder="e.g. 250"
                value={form.peoplePerYear}
                onChange={set('peoplePerYear')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Volunteers</label>
              <input
                type="number"
                min="0"
                className="form-input"
                placeholder="e.g. 12"
                value={form.volunteers}
                onChange={set('volunteers')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Active projects</label>
              <input
                type="number"
                min="0"
                className="form-input"
                placeholder="e.g. 4"
                value={form.projectsRunning}
                onChange={set('projectsRunning')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Years operating</label>
              <input
                type="number"
                min="0"
                className="form-input"
                placeholder="e.g. 5"
                value={form.yearsOperating}
                onChange={set('yearsOperating')}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Key outcomes</label>
            <textarea
              className="form-textarea"
              style={{ minHeight: 90 }}
              placeholder={"e.g. 80% of participants gained employment within 6 months\nReduced A&E attendances by 30% among programme participants\n120 families moved into stable housing"}
              value={form.keyOutcomes}
              onChange={set('keyOutcomes')}
            />
            <p className="text-xs text-light mt-1">One outcome per line — use numbers and evidence where you can</p>
          </div>
        </div>

        {/* ── Section 4: Grant Preferences ── */}
        <div className="card">
          <h3 className="font-display text-sm font-semibold text-forest mb-1 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-forest/10 text-forest text-xs flex items-center justify-center font-bold">4</span>
            Grant Preferences
          </h3>
          <p className="text-xs text-mid mb-4 ml-8">Tells the search engine which grants to prioritise for you</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Minimum grant size (£)</label>
              <input
                type="number"
                min="0"
                className="form-input"
                placeholder="e.g. 5000"
                value={form.minGrantTarget}
                onChange={set('minGrantTarget')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Maximum grant size (£)</label>
              <input
                type="number"
                min="0"
                className="form-input"
                placeholder="e.g. 50000"
                value={form.maxGrantTarget}
                onChange={set('maxGrantTarget')}
              />
              <p className="text-xs text-light mt-1">Leave blank to see all sizes</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal mb-2">Preferred funder types</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {FUNDER_TYPE_OPTIONS.map(ft => {
                const selected = form.funderTypePreferences.includes(ft.value)
                return (
                  <button
                    key={ft.value}
                    type="button"
                    onClick={() => toggleFunderType(ft.value)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all text-left ${
                      selected
                        ? 'bg-forest text-white border-forest'
                        : 'bg-white text-charcoal border-warm hover:border-sage hover:bg-sage/5'
                    }`}
                  >
                    <span>{ft.emoji}</span>
                    <span>{ft.label}</span>
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-light mt-2">Select all that apply — or none to see everything</p>
          </div>
        </div>

        {/* ── Section 5: Mission ── */}
        <div className="card">
          <h3 className="font-display text-sm font-semibold text-forest mb-1 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-forest/10 text-forest text-xs flex items-center justify-center font-bold">5</span>
            Mission Statement
          </h3>
          <p className="text-xs text-mid mb-3 ml-8">Used by AI search to find the most relevant grants for your work</p>
          <textarea
            className="form-textarea"
            style={{ minHeight: 120 }}
            placeholder="Describe what your organisation or venture does, who you serve, and the difference you make…"
            value={form.mission}
            onChange={set('mission')}
          />
          <p className="text-xs text-light mt-2">
            The more specific you are, the better the grant matching. Include your location, who you help, and your approach.
          </p>
        </div>

        {/* ── Section 6: Email Alerts ── */}
        <div className="card">
          <h3 className="font-display text-sm font-semibold text-forest mb-1 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-forest/10 text-forest text-xs flex items-center justify-center font-bold">6</span>
            Email Alerts
          </h3>
          <p className="text-xs text-mid mb-4 ml-8">Get notified by email when new grants match your organisation</p>

          <div className="flex items-center justify-between mb-4 p-4 bg-sage/5 rounded-xl border border-sage/20">
            <div>
              <p className="text-sm font-semibold text-forest">Grant match alerts</p>
              <p className="text-xs text-mid mt-0.5">
                {form.alertsEnabled
                  ? 'You\'ll receive emails when new matching grants are found'
                  : 'Enable to get emailed when new matching grants open'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setForm(prev => ({ ...prev, alertsEnabled: !prev.alertsEnabled }))}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                form.alertsEnabled ? 'bg-forest' : 'bg-warm'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  form.alertsEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {form.alertsEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Alert frequency</label>
                <select className="form-select" value={form.alertFrequency}
                  onChange={e => setForm(prev => ({ ...prev, alertFrequency: e.target.value }))}>
                  <option value="weekly">Weekly digest</option>
                  <option value="instant">As soon as found</option>
                </select>
                <p className="text-xs text-light mt-1">Weekly sends every Monday morning</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">
                  Minimum match score to alert on
                </label>
                <select className="form-select" value={form.alertMinScore}
                  onChange={e => setForm(prev => ({ ...prev, alertMinScore: e.target.value }))}>
                  <option value="60">60% — catch more grants</option>
                  <option value="70">70% — balanced (recommended)</option>
                  <option value="80">80% — strong matches only</option>
                  <option value="90">90% — best matches only</option>
                </select>
                <p className="text-xs text-light mt-1">Higher = fewer but better-matched alerts</p>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── Sticky save footer ── */}
      <div className="sticky bottom-0 mt-6 -mx-6 px-6 py-4 bg-cream/95 backdrop-blur border-t border-warm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-24 bg-warm rounded-full h-1.5">
            <div className={`h-1.5 rounded-full ${scoreColor}`} style={{ width: `${score}%` }} />
          </div>
          <span className="text-xs text-mid">{score}% complete</span>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === 'error' && <p className="text-xs text-red-500">Save failed</p>}
          {saveStatus === 'saved' && <p className="text-xs text-sage font-medium">✓ Saved!</p>}
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </div>
    </div>
  )
}

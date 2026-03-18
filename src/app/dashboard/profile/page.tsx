'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getOrganisationByOwner, createOrganisation, updateOrganisation } from '@/lib/organisations'
import type { Organisation, OrgType, LegalStructure, OrgStage, ImpactSector, FunderType, FundingType } from '@/types'

const LEGAL_STRUCTURE_OPTIONS: { value: LegalStructure; label: string; hint?: string }[] = [
  { value: 'cic_guarantee',    label: 'CIC — Limited by Guarantee',         hint: 'Most common CIC structure' },
  { value: 'cic_shares',       label: 'CIC — Limited by Shares',            hint: 'CIC with shareholder model' },
  { value: 'cio',              label: 'Charitable Incorporated Organisation (CIO)' },
  { value: 'registered_charity', label: 'Registered Charity (Ltd by Guarantee)' },
  { value: 'ltd_guarantee',    label: 'Ltd by Guarantee (non-charity, non-CIC)' },
  { value: 'ltd_shares',       label: 'Ltd by Shares (trading social enterprise)',  hint: 'Social mission required for soft matching' },
  { value: 'llp',              label: 'Limited Liability Partnership (LLP)' },
  { value: 'cooperative',      label: 'Co-operative / Community Benefit Society' },
  { value: 'unincorporated',   label: 'Unincorporated Association / Community Group' },
  { value: 'sole_trader',      label: 'Sole Trader / Individual Practitioner' },
  { value: 'not_registered',   label: 'Not yet registered (idea / pre-registration)' },
]

const ORG_STAGE_OPTIONS: { value: OrgStage; label: string; desc: string }[] = [
  { value: 'idea',        label: 'Idea Stage',    desc: 'Not yet trading or registered' },
  { value: 'pre_revenue', label: 'Pre-Revenue',   desc: 'Registered but no trading income yet' },
  { value: 'early',       label: 'Early Stage',   desc: 'Up to 2 years trading or £50k income' },
  { value: 'growth',      label: 'Growth',        desc: '2–5 years or £50k–£250k income' },
  { value: 'established', label: 'Established',   desc: '5+ years or over £250k income' },
]

const IMPACT_SECTOR_OPTIONS: { value: ImpactSector; label: string }[] = [
  { value: 'creative',      label: 'Creative Industries'        },
  { value: 'environment',   label: 'Environment & Climate'      },
  { value: 'health',        label: 'Health & Wellbeing'         },
  { value: 'education',     label: 'Education & Skills'         },
  { value: 'tech',          label: 'Tech for Good'              },
  { value: 'housing',       label: 'Housing & Homelessness'     },
  { value: 'food',          label: 'Food & Agriculture'         },
  { value: 'employment',    label: 'Employment & Livelihoods'   },
  { value: 'community',     label: 'Community Dev & Spaces'     },
  { value: 'justice',       label: 'Justice, Rights & Democracy'},
  { value: 'financial',     label: 'Financial Inclusion'        },
  { value: 'international', label: 'International & Fair Trade' },
]

const FUNDING_TYPE_OPTIONS: { value: FundingType; label: string; desc: string }[] = [
  { value: 'grant',              label: 'Grants & Awards',       desc: 'One-off or multi-year cash grants, bursaries, prizes' },
  { value: 'accelerator',        label: 'Accelerators',          desc: 'Structured cohort programmes with mentoring & network' },
  { value: 'support_programme',  label: 'Support Programmes',    desc: 'Fellowships, capacity building, training, incubators' },
  { value: 'social_investment',  label: 'Social Investment',     desc: 'Repayable loans and patient capital' },
  { value: 'diversity_fund',     label: 'Diversity Funds',       desc: 'Funds explicitly targeting underrepresented groups' },
  { value: 'blended_finance',    label: 'Blended Finance',       desc: 'Part-grant part-loan, matched trading, community shares' },
  { value: 'in_kind',            label: 'In-Kind Support',       desc: 'Software credits, ad grants, free workspace, pro bono' },
]

// Structures where "social mission declared" soft-match is relevant
const SOFT_MATCH_STRUCTURES: LegalStructure[] = ['ltd_guarantee', 'ltd_shares', 'llp', 'sole_trader', 'unincorporated']

const INCOME_BANDS = [
  'Under £10,000',
  '£10,000–£50,000',
  '£50,000–£100,000',
  '£100,000–£500,000',
  'Over £500,000',
]

const FUNDER_TYPE_OPTIONS: { value: FunderType; label: string }[] = [
  { value: 'trust_foundation',   label: 'Trusts & Foundations'    },
  { value: 'lottery',            label: 'National Lottery'         },
  { value: 'local_authority',    label: 'Local Authority'          },
  { value: 'government',         label: 'Central Government'       },
  { value: 'corporate',          label: 'Corporate / CSR'          },
  { value: 'housing_association',label: 'Housing Associations'     },
  { value: 'other',              label: 'Other'                    },
]

interface FormState {
  // Basic
  name: string
  charityNumber: string
  /** Legacy field — kept for backward compat with existing data */
  orgType: OrgType
  /** New primary structure field */
  legalStructure: LegalStructure | ''
  orgStage: OrgStage | ''
  annualIncome: string
  // Social mission flags (relevant for Ltd/LLP/sole trader soft matching)
  socialMissionDeclared: boolean
  articlesRestrictProfit: boolean
  // Individual practitioner (creative sector)
  alsoIndividualPractitioner: boolean
  // Impact sectors (1–3 from 12-sector taxonomy)
  impactSectors: ImpactSector[]
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
  fundingTypePreferences: FundingType[]
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
  legalStructure: '',
  orgStage: '',
  annualIncome: INCOME_BANDS[0],
  socialMissionDeclared: false,
  articlesRestrictProfit: false,
  alsoIndividualPractitioner: false,
  impactSectors: [],
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
  fundingTypePreferences: [],
  mission: '',
  alertsEnabled: false,
  alertFrequency: 'weekly',
  alertMinScore: '70',
}

function orgToForm(org: Organisation): FormState {
  return {
    name:                       org.name ?? '',
    charityNumber:              org.charity_number ?? org.cic_number ?? '',
    orgType:                    org.org_type ?? 'registered_charity',
    legalStructure:             org.legal_structure ?? '',
    orgStage:                   org.org_stage ?? '',
    annualIncome:               org.annual_income_band ?? INCOME_BANDS[0],
    socialMissionDeclared:      org.social_mission_declared ?? false,
    articlesRestrictProfit:     org.articles_restrict_profit ?? false,
    alsoIndividualPractitioner: org.also_individual_practitioner ?? false,
    impactSectors:              (org.impact_sectors ?? []) as ImpactSector[],
    primaryLocation:            org.primary_location ?? '',
    geographicReach:            'local',
    themes:                     (org.themes ?? []).join(', '),
    areasOfWork:                (org.areas_of_work ?? []).join(', '),
    beneficiaries:              (org.beneficiaries ?? []).join(', '),
    yearsOperating:             org.years_operating != null ? String(org.years_operating) : '',
    peoplePerYear:              org.people_per_year != null ? String(org.people_per_year) : '',
    volunteers:                 org.volunteers != null ? String(org.volunteers) : '',
    projectsRunning:            org.projects_running != null ? String(org.projects_running) : '',
    keyOutcomes:                (org.key_outcomes ?? []).join('\n'),
    minGrantTarget:             org.min_grant_target != null ? String(org.min_grant_target) : '',
    maxGrantTarget:             org.max_grant_target != null ? String(org.max_grant_target) : '',
    funderTypePreferences:      org.funder_type_preferences ?? [],
    fundingTypePreferences:     (org.funding_type_preferences ?? []) as FundingType[],
    mission:                    org.mission ?? '',
    alertsEnabled:              (org as Organisation & { alerts_enabled?: boolean }).alerts_enabled ?? false,
    alertFrequency:             (org as Organisation & { alert_frequency?: string }).alert_frequency ?? 'weekly',
    alertMinScore:              String((org as Organisation & { alert_min_score?: number }).alert_min_score ?? 70),
  }
}

// Score how complete the profile is (0–100)
function completenessScore(form: FormState): { score: number; missing: string[] } {
  const checks: { label: string; filled: boolean }[] = [
    { label: 'Name',                  filled: !!form.name.trim() },
    { label: 'Legal structure',       filled: !!form.legalStructure },
    { label: 'Organisation stage',    filled: !!form.orgStage },
    { label: 'Impact sectors',        filled: form.impactSectors.length > 0 },
    { label: 'Annual income',         filled: !!form.annualIncome },
    { label: 'Primary location',      filled: !!form.primaryLocation.trim() },
    { label: 'Mission statement',     filled: !!form.mission.trim() },
    { label: 'Areas of work',         filled: !!form.areasOfWork.trim() },
    { label: 'Years operating',       filled: !!form.yearsOperating },
  ]
  const filled = checks.filter(c => c.filled).length
  const missing = checks.filter(c => !c.filled).map(c => c.label)
  return { score: Math.round((filled / checks.length) * 100), missing }
}

export default function ProfilePage() {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [isFirstSave, setIsFirstSave] = useState(false)
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
      } else {
        setIsFirstSave(true)
        // Pre-populate from signup metadata so new users see their name & org type already filled in
        const meta = user.user_metadata ?? {}
        if (meta.org_name || meta.org_type) {
          setForm(prev => ({
            ...prev,
            ...(meta.org_name ? { name: meta.org_name as string } : {}),
            ...(meta.org_type ? { orgType: meta.org_type as OrgType } : {}),
          }))
        }
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

  function toggleFundingType(type: FundingType) {
    setForm(prev => ({
      ...prev,
      fundingTypePreferences: prev.fundingTypePreferences.includes(type)
        ? prev.fundingTypePreferences.filter(t => t !== type)
        : [...prev.fundingTypePreferences, type],
    }))
  }

  function toggleImpactSector(sector: ImpactSector) {
    setForm(prev => {
      const current = prev.impactSectors
      if (current.includes(sector)) {
        return { ...prev, impactSectors: current.filter(s => s !== sector) }
      }
      // Max 3 sectors
      if (current.length >= 3) return prev
      return { ...prev, impactSectors: [...current, sector] }
    })
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
      name:                         form.name.trim(),
      charity_number:               form.charityNumber.trim() || null,
      cic_number:                   null,
      org_type:                     form.orgType,
      legal_structure:              form.legalStructure || null,
      org_stage:                    form.orgStage || null,
      social_mission_declared:      form.socialMissionDeclared,
      articles_restrict_profit:     form.articlesRestrictProfit,
      also_individual_practitioner: form.alsoIndividualPractitioner,
      impact_sectors:               form.impactSectors,
      annual_income_band:           form.annualIncome,
      primary_location:             form.primaryLocation.trim() || null,
      themes:                       form.themes.split(',').map(s => s.trim()).filter(Boolean),
      areas_of_work:                form.areasOfWork.split(',').map(s => s.trim()).filter(Boolean),
      beneficiaries:                form.beneficiaries.split(',').map(s => s.trim()).filter(Boolean),
      mission:                      form.mission.trim() || null,
      years_operating:              form.yearsOperating ? parseInt(form.yearsOperating) : null,
      people_per_year:              form.peoplePerYear ? parseInt(form.peoplePerYear) : null,
      volunteers:                   form.volunteers ? parseInt(form.volunteers) : null,
      projects_running:             form.projectsRunning ? parseInt(form.projectsRunning) : null,
      key_outcomes:                 form.keyOutcomes.split('\n').map(s => s.trim()).filter(Boolean),
      min_grant_target:             form.minGrantTarget ? parseInt(form.minGrantTarget.replace(/,/g, '')) : null,
      max_grant_target:             form.maxGrantTarget ? parseInt(form.maxGrantTarget.replace(/,/g, '')) : null,
      funder_type_preferences:      form.funderTypePreferences,
      funding_type_preferences:     form.fundingTypePreferences,
      owner_id:                     userId,
      alerts_enabled:               form.alertsEnabled,
      alert_frequency:              form.alertFrequency,
      alert_min_score:              parseInt(form.alertMinScore) || 70,
    }

    try {
      if (orgId) {
        await updateOrganisation(orgId, payload)
      } else {
        const created = await createOrganisation(payload)
        setOrgId(created.id)
      }
      setSaveStatus('saved')
      if (isFirstSave) {
        setTimeout(() => router.push('/dashboard/search?welcome=1'), 800)
      } else {
        setTimeout(() => setSaveStatus('idle'), 3000)
      }
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
  const scoreColor = score >= 80 ? 'bg-charcoal' : score >= 50 ? 'bg-gold' : 'bg-red-400'
  const scoreLabel = score >= 80 ? 'Strong profile' : score >= 50 ? 'Getting there' : 'Needs more detail'

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-charcoal">Your Profile</h2>
          <p className="text-mid text-sm mt-1">A complete profile means better grant matches and more relevant alerts</p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === 'error' && (
            <p className="text-xs text-red-500">Save failed — please try again</p>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            className="px-5 py-2.5 bg-coral text-white text-sm font-semibold hover:opacity-90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved!' : 'Save Profile'}
          </button>
        </div>
      </div>

      {/* ── Profile completeness bar ── */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-display text-base font-bold text-charcoal">{scoreLabel}</span>
            <span className="text-xs text-mid">— {score}% complete</span>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded text-white ${scoreColor}`}>
            {score}%
          </span>
        </div>
        <div className="w-full bg-warm rounded h-2 mb-3">
          <div
            className={`h-2 rounded transition-all duration-500 ${scoreColor}`}
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
          <p className="text-xs text-mid font-medium">✓ Your profile is fully complete — grant matching is working at full power</p>
        )}
      </div>

      {/* ── Auto-fill ── */}
      <div className="card mb-6">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-8 h-8 bg-gold/10 flex items-center justify-center flex-shrink-0">
            <Sparkles className="h-4 w-4 text-gold" />
          </div>
          <div>
            <h3 className="font-display text-base font-bold text-charcoal">Auto-fill from your website</h3>
            <p className="text-xs text-mid mt-0.5">
              Enter your website and Grant Tracker will read it and fill in your profile automatically.
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
            className="px-4 py-2 bg-coral text-white text-sm font-medium flex items-center gap-2 hover:opacity-90 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {autoFilling ? 'Reading…' : 'Auto-fill'}
          </button>
        </div>
        {autoFillSuccess && (
          <p className="text-xs text-charcoal mt-2 font-medium">✓ Fields filled from your website — review below and save when ready.</p>
        )}
        {autoFillError && (
          <p className="text-xs text-red-500 mt-2">{autoFillError}</p>
        )}
      </div>

      <div className="space-y-5">

        {/* ── Section 1: Organisation Details ── */}
        <div className="card">
          <h3 className="font-display text-base font-bold text-charcoal mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-charcoal/10 text-charcoal text-xs flex items-center justify-center font-bold">1</span>
            About Your Organisation
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
              <label className="block text-sm font-medium text-charcoal mb-1.5">
                Legal structure <span className="text-red-400">*</span>
              </label>
              <select className="form-select" value={form.legalStructure}
                onChange={e => setForm(prev => ({ ...prev, legalStructure: e.target.value as LegalStructure }))}>
                <option value="">Select your legal structure…</option>
                {LEGAL_STRUCTURE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p className="text-xs text-light mt-1">This drives eligibility matching — pick the most accurate option</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Organisation stage</label>
              <select className="form-select" value={form.orgStage}
                onChange={e => setForm(prev => ({ ...prev, orgStage: e.target.value as OrgStage }))}>
                <option value="">Select your stage…</option>
                {ORG_STAGE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label} — {o.desc}</option>
                ))}
              </select>
              <p className="text-xs text-light mt-1">Some programmes are stage-gated (e.g. pre-revenue only)</p>
            </div>

            {/* Social mission soft-match flags — shown for non-charity/CIC structures */}
            {form.legalStructure && SOFT_MATCH_STRUCTURES.includes(form.legalStructure as LegalStructure) && (
              <div className="md:col-span-2 rounded border border-gold/30 bg-gold/5 p-4 space-y-3">
                <p className="text-xs font-semibold text-charcoal">
                  Social mission flags — help us soft-match you to funders who accept &ldquo;social enterprises&rdquo;
                </p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-charcoal font-medium">We self-identify as mission-driven / a social enterprise</p>
                    <p className="text-xs text-mid mt-0.5">Unlocks &ldquo;likely eligible&rdquo; matching for funders who accept social enterprises</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, socialMissionDeclared: !prev.socialMissionDeclared }))}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                      form.socialMissionDeclared ? 'bg-charcoal' : 'bg-warm'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      form.socialMissionDeclared ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-charcoal font-medium">Our articles of association restrict profit distribution or state a social purpose</p>
                    <p className="text-xs text-mid mt-0.5">Relevant for funders who specify &ldquo;not-for-profit&rdquo; eligibility</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, articlesRestrictProfit: !prev.articlesRestrictProfit }))}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                      form.articlesRestrictProfit ? 'bg-charcoal' : 'bg-warm'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      form.articlesRestrictProfit ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              </div>
            )}

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

            {/* Individual practitioner toggle — creative sector */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between p-3 bg-warm rounded border border-warm">
                <div>
                  <p className="text-sm text-charcoal font-medium">I am also an individual practitioner (e.g. artist, filmmaker, musician)</p>
                  <p className="text-xs text-mid mt-0.5">Shows both organisational and individual grants — e.g. Arts Council DYCP, PRS Foundation</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, alsoIndividualPractitioner: !prev.alsoIndividualPractitioner }))}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                    form.alsoIndividualPractitioner ? 'bg-charcoal' : 'bg-warm'
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    form.alsoIndividualPractitioner ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Section 2: Impact Sectors ── */}
        <div className="card">
          <h3 className="font-display text-base font-bold text-charcoal mb-1 flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-charcoal/10 text-charcoal text-xs flex items-center justify-center font-bold">2</span>
            Impact Sectors
            <span className="text-xs text-light font-normal ml-1">— choose 1 to 3</span>
          </h3>
          <p className="text-xs text-mid mb-4 ml-8">
            Your sector selection drives which funding pools you&apos;re matched against. More specific = better matches.
            {form.impactSectors.length >= 3 && (
              <span className="text-gold font-medium"> Maximum 3 sectors reached.</span>
            )}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {IMPACT_SECTOR_OPTIONS.map(s => {
              const selected = form.impactSectors.includes(s.value)
              const atMax = !selected && form.impactSectors.length >= 3
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => toggleImpactSector(s.value)}
                  disabled={atMax}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded border text-sm font-medium transition-all text-left ${
                    selected
                      ? 'border-charcoal bg-charcoal/10 text-charcoal'
                      : atMax
                        ? 'border-warm text-mid opacity-40 cursor-not-allowed'
                        : 'border-warm text-mid hover:border-coral hover:text-coral'
                  }`}
                >
                  <span className="text-xs">{s.label}</span>
                  {selected && <span className="ml-auto text-charcoal text-xs font-bold">✓</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Section 3: Location & Focus ── */}
        <div className="card">
          <h3 className="font-display text-base font-bold text-charcoal mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-charcoal/10 text-charcoal text-xs flex items-center justify-center font-bold">3</span>
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

        {/* ── Section 4: Mission ── */}
        <div className="card">
          <h3 className="font-display text-base font-bold text-charcoal mb-1 flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-charcoal/10 text-charcoal text-xs flex items-center justify-center font-bold">4</span>
            Mission Statement
          </h3>
          <p className="text-xs text-mid mb-3 ml-8">Used to find the most relevant grants for your work</p>
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

        {/* ── Section 5: Grant Preferences ── */}
        <div className="card">
          <h3 className="font-display text-base font-bold text-charcoal mb-1 flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-charcoal/10 text-charcoal text-xs flex items-center justify-center font-bold">5</span>
            Grant Preferences
          </h3>
          <p className="text-xs text-mid mb-4 ml-8">Tell us what kinds of funding you&apos;re interested in — improves your match scores</p>

          {/* Funding type preferences */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-charcoal mb-1.5">
              Funding types I&apos;m interested in
              <span className="text-light font-normal ml-1">(select all that apply)</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FUNDING_TYPE_OPTIONS.map(opt => {
                const selected = form.fundingTypePreferences.includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleFundingType(opt.value)}
                    className={`flex flex-col items-start px-3 py-2.5 rounded border text-left transition-all ${
                      selected
                        ? 'border-charcoal bg-charcoal/10 text-charcoal'
                        : 'border-warm text-mid hover:border-coral hover:text-coral'
                    }`}
                  >
                    <span className="text-xs font-semibold">{opt.label}</span>
                    <span className="text-xs opacity-70 mt-0.5">{opt.desc}</span>
                    {selected && <span className="text-charcoal text-xs font-bold mt-1">✓ Selected</span>}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-light mt-2">Leave blank to see all funding types</p>
          </div>

          {/* Funder type preferences */}
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">
              Preferred funder types
              <span className="text-light font-normal ml-1">(select all that apply)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {FUNDER_TYPE_OPTIONS.map(opt => {
                const selected = form.funderTypePreferences.includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleFunderType(opt.value)}
                    className={`px-3 py-1.5 rounded border text-xs font-medium transition-all ${
                      selected
                        ? 'border-charcoal bg-charcoal/10 text-charcoal'
                        : 'border-warm text-mid hover:border-coral hover:text-coral'
                    }`}
                  >
                    {opt.label}
                    {selected && <span className="ml-1 font-bold">✓</span>}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-light mt-2">Leave blank to see all funder types</p>
          </div>
        </div>

        {/* ── Section 6: Email Alerts ── */}
        <div className="card">
          <h3 className="font-display text-base font-bold text-charcoal mb-1 flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-charcoal/10 text-charcoal text-xs flex items-center justify-center font-bold">6</span>
            Email Alerts
          </h3>
          <p className="text-xs text-mid mb-4 ml-8">Get notified by email when new grants match your organisation</p>

          <div className="flex items-center justify-between mb-4 p-4 bg-warm rounded border border-warm">
            <div>
              <p className="font-display text-base font-bold text-charcoal">Grant match alerts</p>
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
                form.alertsEnabled ? 'bg-charcoal' : 'bg-warm'
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
          <div className="w-24 bg-warm rounded h-1.5">
            <div className={`h-1.5 rounded ${scoreColor}`} style={{ width: `${score}%` }} />
          </div>
          <span className="text-xs text-mid">{score}% complete</span>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === 'error' && <p className="text-xs text-red-500">Save failed</p>}
          {saveStatus === 'saved' && <p className="text-xs text-mid font-medium">✓ Saved!</p>}
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

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Globe, ArrowRight, ArrowLeft, ChevronRight, SkipForward, CheckCircle2, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getOrganisationByOwner, createOrganisation, updateOrganisation } from '@/lib/organisations'
import type { Organisation, OrgType, LegalStructure, OrgStage, ImpactSector, FunderType, FundingType, BeneficiaryGroup } from '@/types'

/* ────────────────────────────────────────────
   Option data
   ──────────────────────────────────────────── */

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
  { value: 'early',       label: 'Early Stage',   desc: 'Under 3 years operating or under £100k income' },
  { value: 'growth',      label: 'Growth',        desc: '3–10 years, building income and impact' },
  { value: 'established', label: 'Established',   desc: 'Over 5 years — any size, from local charity to major institution' },
]

const IMPACT_SECTOR_OPTIONS: { value: ImpactSector; label: string }[] = [
  { value: 'young_people',  label: 'Young People & Youth'       },
  { value: 'community',     label: 'Community Dev & Spaces'     },
  { value: 'health',        label: 'Health & Wellbeing'         },
  { value: 'mental_health', label: 'Mental Health'              },
  { value: 'housing',       label: 'Housing & Homelessness'     },
  { value: 'education',     label: 'Education & Skills'         },
  { value: 'employment',    label: 'Employment & Livelihoods'   },
  { value: 'disability',    label: 'Disability'                 },
  { value: 'older_people',  label: 'Older People'               },
  { value: 'environment',   label: 'Environment & Climate'      },
  { value: 'creative',      label: 'Arts & Creative Industries' },
  { value: 'heritage',      label: 'Heritage & Conservation'    },
  { value: 'sport',         label: 'Sport & Physical Activity'  },
  { value: 'women',         label: 'Women & Gender Equality'    },
  { value: 'justice',       label: 'Justice, Rights & Democracy'},
  { value: 'tech',          label: 'Tech for Good'              },
  { value: 'financial',     label: 'Financial Inclusion'        },
  { value: 'food',          label: 'Food & Agriculture'         },
  { value: 'international', label: 'International & Fair Trade' },
]

const BENEFICIARY_OPTIONS: { value: BeneficiaryGroup; label: string }[] = [
  { value: 'children',          label: 'Children (under 16)'            },
  { value: 'young_people',      label: 'Young people (16-25)'          },
  { value: 'older_people',      label: 'Older people (65+)'            },
  { value: 'families',          label: 'Families & parents'             },
  { value: 'women_girls',       label: 'Women & girls'                  },
  { value: 'men_boys',          label: 'Men & boys'                     },
  { value: 'lgbtq',             label: 'LGBTQ+ communities'             },
  { value: 'ethnic_minorities', label: 'Ethnic minorities & BAME'       },
  { value: 'refugees_migrants', label: 'Refugees & migrants'            },
  { value: 'disabled_people',   label: 'Disabled people'                },
  { value: 'mental_health',     label: 'People with mental health needs'},
  { value: 'carers',            label: 'Carers & care leavers'          },
  { value: 'veterans',          label: 'Veterans & armed forces'        },
  { value: 'ex_offenders',      label: 'Ex-offenders'                   },
  { value: 'homeless',          label: 'Homeless & rough sleepers'      },
  { value: 'people_in_poverty', label: 'People in poverty'              },
  { value: 'rural_communities', label: 'Rural & isolated communities'   },
  { value: 'general_public',    label: 'General public (no specific group)' },
]

const FUNDING_TYPE_OPTIONS: { value: FundingType; label: string; desc: string }[] = [
  { value: 'grant',      label: 'Grants & Awards',    desc: 'Non-repayable cash: grants, bursaries, prizes, diversity funds' },
  { value: 'programme',  label: 'Programmes',         desc: 'Accelerators, fellowships, incubators & support programmes' },
  { value: 'investment', label: 'Social Investment',  desc: 'Repayable finance: loans, patient capital, blended finance' },
  { value: 'in_kind',    label: 'In-Kind Support',    desc: 'Non-cash: software credits, ad grants, workspace, pro bono' },
]

const SOFT_MATCH_STRUCTURES: LegalStructure[] = ['ltd_guarantee', 'ltd_shares', 'llp', 'sole_trader', 'unincorporated']

const INCOME_BANDS = [
  'Under £10,000',
  '£10,000–£50,000',
  '£50,000–£100,000',
  '£100,000–£250,000',
  '£250,000–£500,000',
  '£500,000–£1 million',
  '£1 million–£5 million',
  'Over £5 million',
]

const FUNDER_TYPE_OPTIONS: { value: FunderType; label: string }[] = [
  { value: 'trust_foundation',    label: 'Trusts & Foundations'         },
  { value: 'community_foundation',label: 'Community Foundations'        },
  { value: 'corporate_foundation',label: 'Corporate Foundations'        },
  { value: 'capacity_builder',    label: 'Capacity Builders'            },
  { value: 'lottery',             label: 'National Lottery'             },
  { value: 'local_authority',     label: 'Local Authority'              },
  { value: 'government',          label: 'Central Government'           },
  { value: 'corporate',           label: 'Corporate / CSR'              },
  { value: 'housing_association', label: 'Housing Associations'         },
  { value: 'competition',         label: 'Competitions & Awards'        },
  { value: 'loan',                label: 'Social Lending'               },
  { value: 'crowdfund_match',     label: 'Matched Crowdfunding'         },
  { value: 'other',               label: 'Other'                        },
]

/* ────────────────────────────────────────────
   Form state type & helpers
   ──────────────────────────────────────────── */

interface FormState {
  name: string
  charityNumber: string
  orgType: OrgType
  legalStructure: LegalStructure | ''
  orgStage: OrgStage | ''
  annualIncome: string
  socialMissionDeclared: boolean
  articlesRestrictProfit: boolean
  alsoIndividualPractitioner: boolean
  impactSectors: ImpactSector[]
  beneficiaryGroups: BeneficiaryGroup[]
  primaryLocation: string
  geographicReach: string
  themes: string
  areasOfWork: string
  beneficiaries: string
  yearsOperating: string
  peoplePerYear: string
  volunteers: string
  projectsRunning: string
  keyOutcomes: string
  minGrantTarget: string
  maxGrantTarget: string
  funderTypePreferences: FunderType[]
  fundingTypePreferences: FundingType[]
  mission: string
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
  beneficiaryGroups: [],
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
    beneficiaryGroups:          (org.beneficiary_groups ?? []) as BeneficiaryGroup[],
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

function completenessScore(form: FormState): { score: number; missing: string[] } {
  const checks: { label: string; filled: boolean }[] = [
    { label: 'Name',                  filled: !!form.name.trim() },
    { label: 'Legal structure',       filled: !!form.legalStructure },
    { label: 'Organisation stage',    filled: !!form.orgStage },
    { label: 'Impact sectors',        filled: form.impactSectors.length > 0 },
    { label: 'Beneficiary groups',   filled: form.beneficiaryGroups.length > 0 },
    { label: 'Annual income',         filled: !!form.annualIncome },
    { label: 'Primary location',      filled: !!form.primaryLocation.trim() },
    { label: 'Mission statement',     filled: !!form.mission.trim() },
    { label: 'Areas of work',         filled: !!form.areasOfWork.trim() },
    { label: 'Years operating',       filled: !!form.yearsOperating },
    // Grant size targets are the primary input for size matching — prompt users to fill these in
    { label: 'Grant size range',      filled: !!form.maxGrantTarget },
  ]
  const filled = checks.filter(c => c.filled).length
  const missing = checks.filter(c => !c.filled).map(c => c.label)
  return { score: Math.round((filled / checks.length) * 100), missing }
}

/* ────────────────────────────────────────────
   Onboarding step definitions
   ──────────────────────────────────────────── */

const ONBOARDING_STEPS = [
  { id: 1, title: 'About Your Organisation',   short: 'Organisation' },
  { id: 2, title: 'Impact Sectors',            short: 'Sectors' },
  { id: 3, title: 'Who You Serve',             short: 'Beneficiaries' },
  { id: 4, title: 'Location & Focus',          short: 'Location' },
  { id: 5, title: 'Mission Statement',         short: 'Mission' },
  { id: 6, title: 'Grant Preferences',         short: 'Preferences' },
  { id: 7, title: 'Email Alerts',              short: 'Alerts' },
]

/* ────────────────────────────────────────────
   Toggle switch component
   ──────────────────────────────────────────── */

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        enabled ? 'bg-charcoal' : 'bg-warm'
      }`}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
        enabled ? 'translate-x-5' : 'translate-x-0'
      }`} />
    </button>
  )
}

/* ════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════ */

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

  // Track unsaved changes — set true after auto-fill or manual edits, cleared on save
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Onboarding state: 'welcome' | 'url-review' | number (1-6) | null (full form for returning users)
  const [onboardingPhase, setOnboardingPhase] = useState<'welcome' | 'url-review' | number | null>(null)

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
        setOnboardingPhase(null) // existing user → full form
      } else {
        setIsFirstSave(true)
        setOnboardingPhase('welcome') // new user → onboarding
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

  /* ── Form helpers ── */

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
      if (current.length >= 5) return prev
      return { ...prev, impactSectors: [...current, sector] }
    })
  }

  function moveImpactSector(sector: ImpactSector, direction: 'up' | 'down') {
    setForm(prev => {
      const arr = [...prev.impactSectors]
      const idx = arr.indexOf(sector)
      if (idx < 0) return prev
      const newIdx = direction === 'up' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= arr.length) return prev
      ;[arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]]
      return { ...prev, impactSectors: arr }
    })
  }

  function toggleBeneficiaryGroup(group: BeneficiaryGroup) {
    setForm(prev => {
      const current = prev.beneficiaryGroups
      if (current.includes(group)) {
        return { ...prev, beneficiaryGroups: current.filter(g => g !== group) }
      }
      if (current.length >= 5) return prev
      return { ...prev, beneficiaryGroups: [...current, group] }
    })
  }

  function moveBeneficiaryGroup(group: BeneficiaryGroup, direction: 'up' | 'down') {
    setForm(prev => {
      const arr = [...prev.beneficiaryGroups]
      const idx = arr.indexOf(group)
      if (idx < 0) return prev
      const newIdx = direction === 'up' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= arr.length) return prev
      ;[arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]]
      return { ...prev, beneficiaryGroups: arr }
    })
  }

  /* ── Auto-fill ── */

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
      // Validate annual income against known bands
      const validIncome = INCOME_BANDS.includes(data.annualIncome)
        ? data.annualIncome
        : null

      // Validate structured arrays against known taxonomy values
      const validSectors = new Set(IMPACT_SECTOR_OPTIONS.map(o => o.value))
      const validBeneficiaries = new Set(BENEFICIARY_OPTIONS.map(o => o.value))
      const newSectors = Array.isArray(data.impactSectors)
        ? (data.impactSectors as string[]).filter(s => validSectors.has(s as ImpactSector)).slice(0, 5) as ImpactSector[]
        : []
      const newBeneficiaries = Array.isArray(data.beneficiaryGroups)
        ? (data.beneficiaryGroups as string[]).filter(b => validBeneficiaries.has(b as BeneficiaryGroup)).slice(0, 5) as BeneficiaryGroup[]
        : []

      setForm(prev => ({
        ...prev,
        name:              data.name            || prev.name,
        charityNumber:     data.charityNumber   || prev.charityNumber,
        orgType:           data.orgType         || prev.orgType,
        annualIncome:      validIncome            || prev.annualIncome,
        primaryLocation:   data.primaryLocation || prev.primaryLocation,
        themes:            Array.isArray(data.themes)        ? data.themes.join(', ')        : prev.themes,
        areasOfWork:       Array.isArray(data.areasOfWork)   ? data.areasOfWork.join(', ')   : prev.areasOfWork,
        beneficiaries:     Array.isArray(data.beneficiaries) ? data.beneficiaries.join(', ') : prev.beneficiaries,
        mission:           data.mission         || prev.mission,
        impactSectors:     newSectors.length > 0     ? newSectors       : prev.impactSectors,
        beneficiaryGroups: newBeneficiaries.length > 0 ? newBeneficiaries : prev.beneficiaryGroups,
      }))
      setAutoFillSuccess(true)
      setHasUnsavedChanges(true)
      // If in onboarding, move to review phase
      if (onboardingPhase === 'welcome') {
        setOnboardingPhase('url-review')
      }
    } catch (err) {
      setAutoFillError(err instanceof Error ? err.message : 'Auto-fill failed — please try again')
    } finally {
      setAutoFilling(false)
    }
  }

  /* ── Save ── */

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
      beneficiary_groups:           form.beneficiaryGroups,
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
      setHasUnsavedChanges(false)
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

  /* ── Loading state ── */

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

  /* ════════════════════════════════════════════
     ONBOARDING: Welcome screen
     ════════════════════════════════════════════ */

  if (onboardingPhase === 'welcome') {
    return (
      <div className="max-w-xl mx-auto py-8">
        {/* Welcome header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-coral/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Zap className="h-7 w-7 text-coral" />
          </div>
          <h2 className="font-serif text-3xl font-bold text-charcoal mb-2">
            Let&apos;s set up your profile
          </h2>
          <p className="text-mid text-sm leading-relaxed max-w-md mx-auto">
            Your profile tells us about your organisation so we can match you with relevant grants, accelerators and funding programmes. The more complete it is, the better your matches.
          </p>
        </div>

        {/* Option 1: Auto-fill from URL */}
        <div className="card mb-4">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 bg-gold/10 flex items-center justify-center flex-shrink-0">
              <Sparkles className="h-4 w-4 text-gold" />
            </div>
            <div>
              <h3 className="font-serif text-base font-bold text-charcoal">
                Fastest way: paste your website URL
              </h3>
              <p className="text-xs text-mid mt-0.5">
                We&apos;ll read your website and fill in your profile automatically. Takes about 10 seconds.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <input
              type="url"
              className="form-input flex-1"
              placeholder="https://yourorganisation.co.uk"
              value={websiteUrl}
              onChange={e => { setWebsiteUrl(e.target.value); setAutoFillError(null); setAutoFillSuccess(false) }}
              onKeyDown={e => e.key === 'Enter' && handleAutoFill()}
            />
            <button
              onClick={handleAutoFill}
              disabled={autoFilling || !websiteUrl.trim()}
              className="px-5 py-2.5 bg-forest text-white text-sm font-semibold rounded-lg flex items-center gap-2 hover:opacity-90 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {autoFilling ? 'Reading…' : 'Auto-fill'}
            </button>
          </div>
          {autoFillError && (
            <p className="text-xs text-red-500 mt-2">{autoFillError}</p>
          )}
          {autoFilling && (
            <div className="mt-3 flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-coral border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-mid">Reading your website and extracting organisation details…</p>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-warm" />
          <span className="text-xs text-mid font-medium">or</span>
          <div className="flex-1 h-px bg-warm" />
        </div>

        {/* Option 2: Step-by-step */}
        <button
          onClick={() => setOnboardingPhase(1)}
          className="w-full card hover:border-coral/40 transition-colors cursor-pointer text-left flex items-center gap-4 group mb-4"
        >
          <div className="w-8 h-8 bg-forest/10 flex items-center justify-center flex-shrink-0">
            <ArrowRight className="h-4 w-4 text-forest" />
          </div>
          <div className="flex-1">
            <h3 className="font-serif text-base font-bold text-charcoal group-hover:text-coral transition-colors">
              Fill it in step by step
            </h3>
            <p className="text-xs text-mid mt-0.5">
              Six short sections — takes about 3 minutes. We&apos;ll walk you through one at a time.
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-mid group-hover:text-coral transition-colors flex-shrink-0" />
        </button>

        {/* Option 3: Skip */}
        <button
          onClick={() => router.push('/dashboard/search')}
          className="w-full flex items-center justify-center gap-2 py-3 text-sm text-mid hover:text-charcoal transition-colors group"
        >
          <SkipForward className="h-3.5 w-3.5" />
          <span>Skip for now — browse all grants without matching</span>
        </button>
        <p className="text-center text-xs text-light mt-1">
          You can set up your profile any time from the sidebar
        </p>
      </div>
    )
  }

  /* ════════════════════════════════════════════
     ONBOARDING: URL review (auto-fill done)
     ════════════════════════════════════════════ */

  if (onboardingPhase === 'url-review') {
    const filledFields = [
      form.name && 'Organisation name',
      form.mission && 'Mission',
      form.primaryLocation && 'Location',
      form.areasOfWork && 'Areas of work',
      form.themes && 'Themes',
      form.beneficiaries && 'Beneficiaries',
    ].filter(Boolean)

    return (
      <div className="max-w-2xl mx-auto py-8">
        {/* Success header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-forest/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-7 w-7 text-forest" />
          </div>
          <h2 className="font-serif text-3xl font-bold text-charcoal mb-2">
            Profile populated from your website
          </h2>
          <p className="text-mid text-sm">
            We filled in {filledFields.length} field{filledFields.length !== 1 ? 's' : ''} automatically. Review below, tweak anything that needs changing, and save when you&apos;re happy.
          </p>
        </div>

        {/* Completeness nudge */}
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="font-serif text-sm font-bold text-charcoal">{scoreLabel} — {score}% complete</span>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full text-white ${scoreColor}`}>{score}%</span>
          </div>
          <div className="w-full bg-warm rounded-full h-2 mb-2">
            <div className={`h-2 rounded-full transition-all duration-500 ${scoreColor}`} style={{ width: `${score}%` }} />
          </div>
          {missing.length > 0 && (
            <p className="text-xs text-mid">
              <span className="font-medium">Still needs:</span> {missing.join(' · ')}
            </p>
          )}
        </div>

        {/* Show the full form for review */}
        {renderFullForm()}

        {/* Action buttons */}
        <div className="sticky bottom-0 mt-6 -mx-6 px-6 py-4 bg-cream/95 backdrop-blur border-t border-warm flex items-center justify-between">
          <button
            onClick={() => setOnboardingPhase('welcome')}
            className="flex items-center gap-1.5 text-sm text-mid hover:text-charcoal transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <div className="flex items-center gap-3">
            {saveStatus === 'error' && <p className="text-xs text-red-500">Save failed</p>}
            {saveStatus === 'saved' && <p className="text-xs text-mid font-medium">Saved!</p>}
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className="btn-primary disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save & Find Grants'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ════════════════════════════════════════════
     ONBOARDING: Step-by-step wizard (steps 1–6)
     ════════════════════════════════════════════ */

  if (typeof onboardingPhase === 'number') {
    const currentStep = onboardingPhase
    const stepInfo = ONBOARDING_STEPS[currentStep - 1]
    const isLast = currentStep === ONBOARDING_STEPS.length

    return (
      <div className="max-w-xl mx-auto py-8">
        {/* Step indicator */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-mid font-medium">Step {currentStep} of {ONBOARDING_STEPS.length}</p>
            <button
              onClick={() => router.push('/dashboard/search')}
              className="text-xs text-mid hover:text-charcoal transition-colors flex items-center gap-1"
            >
              <SkipForward className="h-3 w-3" />
              Skip setup
            </button>
          </div>
          {/* Progress dots */}
          <div className="flex gap-1.5">
            {ONBOARDING_STEPS.map((s) => (
              <div
                key={s.id}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  s.id < currentStep ? 'bg-forest' : s.id === currentStep ? 'bg-coral' : 'bg-warm'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step title */}
        <h2 className="font-serif text-2xl font-bold text-charcoal mb-1">{stepInfo.title}</h2>
        <p className="text-xs text-mid mb-5">
          {currentStep === 1 && 'The basics about your organisation — name, legal structure, and stage.'}
          {currentStep === 2 && 'Select 1 to 5 impact sectors that describe your work. This drives which funding pools you match against.'}
          {currentStep === 3 && 'Who does your organisation primarily serve? Pick a primary beneficiary group and optional secondaries.'}
          {currentStep === 4 && 'Where you\'re based and what your work focuses on.'}
          {currentStep === 5 && 'A short description of what you do, who you serve, and the difference you make.'}
          {currentStep === 6 && 'What kinds of funding are you looking for?'}
          {currentStep === 7 && 'Get notified when new grants match your profile.'}
        </p>

        {/* Step content */}
        <div className="card mb-6">
          {currentStep === 1 && renderSection1()}
          {currentStep === 2 && renderSection2()}
          {currentStep === 3 && renderBeneficiarySection()}
          {currentStep === 4 && renderSection3()}
          {currentStep === 5 && renderSection4()}
          {currentStep === 6 && renderSection5()}
          {currentStep === 7 && renderSection6()}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setOnboardingPhase(currentStep === 1 ? 'welcome' : currentStep - 1)}
            className="flex items-center gap-1.5 text-sm text-mid hover:text-charcoal transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {currentStep === 1 ? 'Back to start' : 'Previous'}
          </button>

          {isLast ? (
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className="btn-primary disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? 'Saving…' : 'Save & Find Grants'}
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => setOnboardingPhase(currentStep + 1)}
              className="btn-primary flex items-center gap-2"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    )
  }

  /* ════════════════════════════════════════════
     FULL FORM (returning users / url-review)
     ════════════════════════════════════════════ */

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <h2 className="font-serif text-4xl font-bold text-charcoal leading-tight">Your Profile</h2>
          <p className="text-mid text-sm mt-1.5">A complete profile means better grant matches and more relevant alerts</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {saveStatus === 'error' && (
            <p className="text-xs text-red-500">Save failed — please try again</p>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            className={`px-5 py-2.5 text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-colors disabled:opacity-50 ${
              hasUnsavedChanges ? 'bg-coral animate-pulse' : 'bg-forest'
            }`}
          >
            {saving ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved!' : hasUnsavedChanges ? 'Save Changes' : 'Save Profile'}
          </button>
        </div>
      </div>

      {/* Unsaved changes banner */}
      {hasUnsavedChanges && (
        <div className="flex items-center gap-3 bg-coral/10 border border-coral/30 rounded-xl px-4 py-3 mb-6">
          <svg className="h-4 w-4 text-coral flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-xs text-charcoal font-medium flex-1">
            You have unsaved changes. Click <strong>Save Changes</strong> above to keep this profile — refreshing the page will lose your edits.
          </p>
          <button onClick={handleSave} className="px-3 py-1.5 bg-coral text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-colors whitespace-nowrap">
            Save now
          </button>
        </div>
      )}

      {/* Profile completeness bar */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-serif text-base font-bold text-charcoal">{scoreLabel}</span>
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
          <p className="text-xs text-mid font-medium">Your profile is fully complete — grant matching is working at full power</p>
        )}
      </div>

      {/* Auto-fill card */}
      <div className="card mb-6">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-8 h-8 bg-gold/10 flex items-center justify-center flex-shrink-0">
            <Sparkles className="h-4 w-4 text-gold" />
          </div>
          <div>
            <h3 className="font-serif text-base font-bold text-charcoal">Auto-fill from your website</h3>
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
            className="px-4 py-2 bg-forest text-white text-sm font-medium rounded-lg flex items-center gap-2 hover:opacity-90 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {autoFilling ? 'Reading…' : 'Auto-fill'}
          </button>
        </div>
        {autoFillSuccess && (
          <p className="text-xs text-charcoal mt-2 font-medium">Fields filled from your website — review below and save when ready.</p>
        )}
        {autoFillError && (
          <p className="text-xs text-red-500 mt-2">{autoFillError}</p>
        )}
      </div>

      {renderFullForm()}

      {/* Sticky save footer */}
      <div className="sticky bottom-0 mt-6 -mx-6 px-6 py-4 bg-cream/95 backdrop-blur border-t border-warm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-24 bg-warm rounded-full h-1.5">
            <div className={`h-1.5 rounded-full ${scoreColor}`} style={{ width: `${score}%` }} />
          </div>
          <span className="text-xs text-mid">{score}% complete</span>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === 'error' && <p className="text-xs text-red-500">Save failed</p>}
          {saveStatus === 'saved' && <p className="text-xs text-mid font-medium">Saved!</p>}
          {hasUnsavedChanges && saveStatus === 'idle' && <p className="text-xs text-coral font-medium">Unsaved changes</p>}
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            className={`btn-primary disabled:opacity-50 ${hasUnsavedChanges ? '!bg-coral' : ''}`}
          >
            {saving ? 'Saving…' : hasUnsavedChanges ? 'Save Changes' : 'Save Profile'}
          </button>
        </div>
      </div>
    </div>
  )

  /* ════════════════════════════════════════════
     SECTION RENDERERS (shared by wizard + full form)
     ════════════════════════════════════════════ */

  function renderSection1() {
    return (
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

        {/* Social mission flags */}
        {form.legalStructure && SOFT_MATCH_STRUCTURES.includes(form.legalStructure as LegalStructure) && (
          <div className="md:col-span-2 border border-gold/30 bg-gold/5 p-4 space-y-3 rounded-xl">
            <p className="text-xs font-semibold text-charcoal">
              Social mission flags — help us soft-match you to funders who accept &ldquo;social enterprises&rdquo;
            </p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-charcoal font-medium">We self-identify as mission-driven / a social enterprise</p>
                <p className="text-xs text-mid mt-0.5">Unlocks &ldquo;likely eligible&rdquo; matching for funders who accept social enterprises</p>
              </div>
              <Toggle enabled={form.socialMissionDeclared} onToggle={() => setForm(prev => ({ ...prev, socialMissionDeclared: !prev.socialMissionDeclared }))} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-charcoal font-medium">Our articles of association restrict profit distribution or state a social purpose</p>
                <p className="text-xs text-mid mt-0.5">Relevant for funders who specify &ldquo;not-for-profit&rdquo; eligibility</p>
              </div>
              <Toggle enabled={form.articlesRestrictProfit} onToggle={() => setForm(prev => ({ ...prev, articlesRestrictProfit: !prev.articlesRestrictProfit }))} />
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
          <p className="text-xs text-light mt-1">Used to check income caps on grants — select the most accurate band</p>
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

        {/* Individual practitioner toggle */}
        <div className="md:col-span-2">
          <div className="flex items-center justify-between p-3 bg-warm border border-warm rounded-xl">
            <div>
              <p className="text-sm text-charcoal font-medium">I am also an individual practitioner (e.g. artist, filmmaker, musician)</p>
              <p className="text-xs text-mid mt-0.5">Shows both organisational and individual grants — e.g. Arts Council DYCP, PRS Foundation</p>
            </div>
            <Toggle enabled={form.alsoIndividualPractitioner} onToggle={() => setForm(prev => ({ ...prev, alsoIndividualPractitioner: !prev.alsoIndividualPractitioner }))} />
          </div>
        </div>
      </div>
    )
  }

  function renderSection2() {
    const RANK_LABELS = ['Primary', 'Secondary', 'Tertiary'] as const
    const RANK_COLORS = [
      'bg-forest text-white',
      'bg-sage/80 text-white',
      'bg-sage/40 text-charcoal',
    ]
    return (
      <div>
        {form.impactSectors.length < 2 && (
          <div className="flex items-start gap-3 bg-gold/10 border border-gold/30 rounded-xl p-3.5 mb-4">
            <svg className="h-4 w-4 text-gold flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <p className="text-xs font-semibold text-charcoal">Impact sectors improve your match quality</p>
              <p className="text-xs text-mid mt-0.5">
                Select at least 2 sectors that describe your work. Grants are scored partly based on how well their sectors align with yours — without this, your matches will be less precise.
              </p>
            </div>
          </div>
        )}
        <p className="text-xs text-mid mb-4">
          Select up to 5 sectors in priority order. The first sector you pick is your <span className="font-semibold text-forest">primary</span> focus and carries the most weight in matching.
          {form.impactSectors.length >= 5 && (
            <span className="text-gold font-medium"> Maximum 5 sectors reached.</span>
          )}
        </p>

        {/* ── Selected sectors with rank badges and reorder controls ── */}
        {form.impactSectors.length > 0 && (
          <div className="mb-4 space-y-1.5">
            {form.impactSectors.map((sec, idx) => {
              const opt = IMPACT_SECTOR_OPTIONS.find(o => o.value === sec)
              const label = opt?.label ?? sec
              const rankLabel = idx < 3 ? RANK_LABELS[idx] : `#${idx + 1}`
              const rankColor = idx < 3 ? RANK_COLORS[idx] : 'bg-warm text-mid'
              return (
                <div key={sec} className="flex items-center gap-2 px-3 py-2 border border-forest/30 bg-forest/5 rounded-lg">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${rankColor}`}>
                    {rankLabel}
                  </span>
                  <span className="text-xs font-medium text-charcoal flex-1">{label}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveImpactSector(sec, 'up')}
                      disabled={idx === 0}
                      className="p-0.5 text-mid hover:text-forest disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                      title="Move up"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => moveImpactSector(sec, 'down')}
                      disabled={idx === form.impactSectors.length - 1}
                      className="p-0.5 text-mid hover:text-forest disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                      title="Move down"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleImpactSector(sec)}
                      className="p-0.5 ml-1 text-mid hover:text-red-600 transition-colors"
                      title="Remove"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Sector picker grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {IMPACT_SECTOR_OPTIONS.map(s => {
            const selected = form.impactSectors.includes(s.value)
            const atMax = !selected && form.impactSectors.length >= 5
            if (selected) return null  // already shown in ranked list above
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => toggleImpactSector(s.value)}
                disabled={atMax}
                className={`flex items-center gap-2 px-3 py-2.5 border text-sm font-medium transition-all text-left rounded-lg ${
                  atMax
                    ? 'border-warm text-mid opacity-40 cursor-not-allowed'
                    : 'border-warm text-mid hover:border-forest hover:text-forest'
                }`}
              >
                <span className="text-xs">{s.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  function renderBeneficiarySection() {
    return (
      <div>
        <p className="text-xs text-mid mb-4">
          Select up to 5 groups. The first group you pick is your <span className="font-semibold text-forest">primary</span> beneficiary — all others are equally weighted secondaries.
          {form.beneficiaryGroups.length >= 5 && (
            <span className="text-gold font-medium"> Maximum 5 groups reached.</span>
          )}
        </p>

        {/* ── Selected beneficiaries with rank badges and reorder controls ── */}
        {form.beneficiaryGroups.length > 0 && (
          <div className="mb-4 space-y-1.5">
            {form.beneficiaryGroups.map((grp, idx) => {
              const opt = BENEFICIARY_OPTIONS.find(o => o.value === grp)
              const label = opt?.label ?? grp
              const isPrimary = idx === 0
              return (
                <div key={grp} className="flex items-center gap-2 px-3 py-2 border border-forest/30 bg-forest/5 rounded-lg">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                    isPrimary ? 'bg-forest text-white' : 'bg-sage/40 text-charcoal'
                  }`}>
                    {isPrimary ? 'Primary' : 'Secondary'}
                  </span>
                  <span className="text-xs font-medium text-charcoal flex-1">{label}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveBeneficiaryGroup(grp, 'up')}
                      disabled={idx === 0}
                      className="p-0.5 text-mid hover:text-forest disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                      title="Move up"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => moveBeneficiaryGroup(grp, 'down')}
                      disabled={idx === form.beneficiaryGroups.length - 1}
                      className="p-0.5 text-mid hover:text-forest disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                      title="Move down"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleBeneficiaryGroup(grp)}
                      className="p-0.5 ml-1 text-mid hover:text-red-600 transition-colors"
                      title="Remove"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Beneficiary picker grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {BENEFICIARY_OPTIONS.map(o => {
            const selected = form.beneficiaryGroups.includes(o.value)
            const atMax = !selected && form.beneficiaryGroups.length >= 5
            if (selected) return null
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggleBeneficiaryGroup(o.value)}
                disabled={atMax}
                className={`flex items-center gap-2 px-3 py-2.5 border text-sm font-medium transition-all text-left rounded-lg ${
                  atMax
                    ? 'border-warm text-mid opacity-40 cursor-not-allowed'
                    : 'border-warm text-mid hover:border-forest hover:text-forest'
                }`}
              >
                <span className="text-xs">{o.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  function renderSection3() {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-charcoal mb-1.5">Primary location</label>
          <input
            className="form-input"
            placeholder="e.g. Southwark, London  or  Bristol, England"
            value={form.primaryLocation}
            onChange={set('primaryLocation')}
          />
          <p className="text-xs text-light mt-1">For London orgs, include your borough first for precise matching — e.g. &ldquo;Hackney, London&rdquo; not just &ldquo;London&rdquo;</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-charcoal mb-1.5">Geographic reach</label>
          <div className="form-input bg-warm/50 text-mid text-sm cursor-default">
            Based on your primary location — local &amp; national grants both shown
          </div>
          <p className="text-xs text-light mt-1">Local grants in your area score highest; national grants apply to all</p>
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
    )
  }

  function renderSection4() {
    return (
      <div>
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
    )
  }

  function renderSection5() {
    return (
      <div>
        {/* Grant size targets — most impactful matching signal */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-charcoal mb-1">
            Target grant size range
          </label>
          <p className="text-xs text-mid mb-3">
            What size grants are you typically applying for? This is the most important field for size matching — grants outside your range will score lower.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-mid mb-1">Minimum (£)</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. 5000"
                value={form.minGrantTarget}
                onChange={set('minGrantTarget')}
              />
            </div>
            <div>
              <label className="block text-xs text-mid mb-1">Maximum (£)</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. 100000"
                value={form.maxGrantTarget}
                onChange={set('maxGrantTarget')}
              />
            </div>
          </div>
          <p className="text-xs text-light mt-2">Leave blank to see all grant sizes without size filtering</p>
        </div>

        <div className="border-t border-warm pt-5 mb-5">
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
                  className={`flex flex-col items-start px-3 py-2.5 border text-left transition-all rounded-lg ${
                    selected
                      ? 'border-forest bg-forest/10 text-forest'
                      : 'border-warm text-mid hover:border-forest hover:text-forest'
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
                  className={`px-3 py-1.5 border text-xs font-medium transition-all rounded-full ${
                    selected
                      ? 'border-forest bg-forest/10 text-forest'
                      : 'border-warm text-mid hover:border-forest hover:text-forest'
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
      </div>
    )
  }

  function renderSection6() {
    return (
      <div>
        <div className="flex items-center justify-between mb-4 p-4 bg-warm border border-warm rounded-xl">
          <div>
            <p className="font-serif text-base font-bold text-charcoal">Grant match alerts</p>
            <p className="text-xs text-mid mt-0.5">
              {form.alertsEnabled
                ? 'You\'ll receive emails when new matching grants are found'
                : 'Enable to get emailed when new matching grants open'}
            </p>
          </div>
          <Toggle enabled={form.alertsEnabled} onToggle={() => setForm(prev => ({ ...prev, alertsEnabled: !prev.alertsEnabled }))} />
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
    )
  }

  /* ── Full form (all sections together) ── */

  function renderFullForm() {
    return (
      <div className="space-y-5">
        {/* Section 1 */}
        <div className="card">
          <h3 className="font-serif text-base font-bold text-charcoal mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-charcoal/10 text-charcoal text-xs flex items-center justify-center font-bold rounded-full">1</span>
            About Your Organisation
          </h3>
          {renderSection1()}
        </div>

        {/* Section 2 */}
        <div className="card">
          <h3 className="font-serif text-base font-bold text-charcoal mb-1 flex items-center gap-2">
            <span className="w-6 h-6 bg-charcoal/10 text-charcoal text-xs flex items-center justify-center font-bold rounded-full">2</span>
            Impact Sectors
            <span className="text-xs text-light font-normal ml-1">— choose 1 to 5</span>
          </h3>
          {renderSection2()}
        </div>

        {/* Section 3 — Beneficiaries */}
        <div className="card">
          <h3 className="font-serif text-base font-bold text-charcoal mb-1 flex items-center gap-2">
            <span className="w-6 h-6 bg-charcoal/10 text-charcoal text-xs flex items-center justify-center font-bold rounded-full">3</span>
            Who You Serve
          </h3>
          <p className="text-xs text-mid mb-3 ml-8">Pick your primary beneficiary group first, then any secondary groups</p>
          {renderBeneficiarySection()}
        </div>

        {/* Section 4 */}
        <div className="card">
          <h3 className="font-serif text-base font-bold text-charcoal mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-charcoal/10 text-charcoal text-xs flex items-center justify-center font-bold rounded-full">4</span>
            Location & Focus
          </h3>
          {renderSection3()}
        </div>

        {/* Section 5 */}
        <div className="card">
          <h3 className="font-serif text-base font-bold text-charcoal mb-1 flex items-center gap-2">
            <span className="w-6 h-6 bg-charcoal/10 text-charcoal text-xs flex items-center justify-center font-bold rounded-full">5</span>
            Mission Statement
          </h3>
          <p className="text-xs text-mid mb-3 ml-8">Used to find the most relevant grants for your work</p>
          {renderSection4()}
        </div>

        {/* Section 6 */}
        <div className="card">
          <h3 className="font-serif text-base font-bold text-charcoal mb-1 flex items-center gap-2">
            <span className="w-6 h-6 bg-charcoal/10 text-charcoal text-xs flex items-center justify-center font-bold rounded-full">6</span>
            Grant Preferences
          </h3>
          <p className="text-xs text-mid mb-4 ml-8">Tell us what kinds of funding you&apos;re interested in — improves your match scores</p>
          {renderSection5()}
        </div>

        {/* Section 7 */}
        <div className="card">
          <h3 className="font-serif text-base font-bold text-charcoal mb-1 flex items-center gap-2">
            <span className="w-6 h-6 bg-charcoal/10 text-charcoal text-xs flex items-center justify-center font-bold rounded-full">7</span>
            Email Alerts
          </h3>
          <p className="text-xs text-mid mb-4 ml-8">Get notified by email when new grants match your organisation</p>
          {renderSection6()}
        </div>
      </div>
    )
  }
}

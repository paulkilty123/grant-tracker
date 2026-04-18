'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Sparkles, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getOrganisationByOwner, createOrganisation, updateOrganisation } from '@/lib/organisations'
import { ONBOARDING_PREFILL_KEY, type OnboardingPrefill } from '@/lib/onboarding'
import type {
  Organisation, OrgType, LegalStructure, ImpactSector, BeneficiaryGroup, FundingType,
} from '@/types'

/* ═══════════════════════════════════════════════
   Option data — curated subset for the 3-step wizard.
   Full taxonomy lives in /dashboard/profile.
   ═══════════════════════════════════════════════ */

const LEGAL_STRUCTURE_OPTIONS: { value: LegalStructure; label: string; hint?: string }[] = [
  { value: 'cic_guarantee',      label: 'CIC (Limited by Guarantee)'                                  },
  { value: 'cic_shares',         label: 'CIC (Limited by Shares)'                                     },
  { value: 'cio',                label: 'Charitable Incorporated Organisation (CIO)'                  },
  { value: 'registered_charity', label: 'Registered Charity'                                          },
  { value: 'ltd_guarantee',      label: 'Ltd by Guarantee (non-charity)'                              },
  { value: 'ltd_shares',         label: 'Ltd by Shares (social enterprise)'                           },
  { value: 'llp',                label: 'Limited Liability Partnership (LLP)'                         },
  { value: 'cooperative',        label: 'Co-operative / Community Benefit Society'                    },
  { value: 'unincorporated',     label: 'Unincorporated Association / Community Group'                },
  { value: 'sole_trader',        label: 'Sole Trader / Individual Practitioner'                       },
  { value: 'not_registered',     label: 'Not yet registered'                                          },
]

/**
 * Primary sector — 12 curated options from the full 19-sector taxonomy.
 * Users can refine secondaries later in /dashboard/profile.
 */
const PRIMARY_SECTORS: { value: ImpactSector; label: string }[] = [
  { value: 'young_people',  label: 'Young People & Youth'       },
  { value: 'community',     label: 'Community Dev & Spaces'     },
  { value: 'health',        label: 'Health & Wellbeing'         },
  { value: 'mental_health', label: 'Mental Health'              },
  { value: 'housing',       label: 'Housing & Homelessness'     },
  { value: 'education',     label: 'Education & Skills'         },
  { value: 'environment',   label: 'Environment & Climate'      },
  { value: 'creative',      label: 'Arts & Creative Industries' },
  { value: 'sport',         label: 'Sport & Physical Activity'  },
  { value: 'employment',    label: 'Employment & Livelihoods'   },
  { value: 'disability',    label: 'Disability'                 },
  { value: 'women',         label: 'Women & Gender Equality'    },
]

/**
 * Primary beneficiary — 10 curated options from the full taxonomy.
 */
const PRIMARY_BENEFICIARIES: { value: BeneficiaryGroup; label: string }[] = [
  { value: 'children',          label: 'Children (under 16)'        },
  { value: 'young_people',      label: 'Young people (16-25)'       },
  { value: 'older_people',      label: 'Older people (65+)'         },
  { value: 'families',          label: 'Families & parents'         },
  { value: 'women_girls',       label: 'Women & girls'              },
  { value: 'disabled_people',   label: 'Disabled people'            },
  { value: 'people_in_poverty', label: 'People in poverty'          },
  { value: 'refugees_migrants', label: 'Refugees & migrants'        },
  { value: 'mental_health',     label: 'People w/ mental health needs' },
  { value: 'general_public',    label: 'General public'             },
]

const FUNDING_TYPES: { value: FundingType; label: string; desc: string; bg: string; fg: string; accent: string }[] = [
  { value: 'grant',      label: 'Grants',            desc: 'Non-repayable cash',            bg: '#F1F8E4', fg: '#173404', accent: '#8ECB3C' },
  { value: 'programme',  label: 'Programmes',        desc: 'Accelerators & support',        bg: '#FAECE7', fg: '#7A2A1A', accent: '#D85A30' },
  { value: 'investment', label: 'Social Investment', desc: 'Loans & repayable finance',     bg: '#E6F1FB', fg: '#0C447C', accent: '#378ADD' },
  { value: 'in_kind',    label: 'In-Kind',           desc: 'Software, space, pro bono',     bg: '#FDF3DC', fg: '#854F0B', accent: '#BA7517' },
]

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

/* ═══════════════════════════════════════════════
   Wizard state
   ═══════════════════════════════════════════════ */

interface WizardState {
  // Step 1
  name: string
  legalStructure: LegalStructure | ''
  primaryLocation: string
  charityNumber: string
  // Step 2
  mission: string
  primarySector: ImpactSector | ''
  primaryBeneficiary: BeneficiaryGroup | ''
  // Step 3
  minGrantTarget: string
  maxGrantTarget: string
  fundingTypes: FundingType[]
  alertsEnabled: boolean
}

const EMPTY: WizardState = {
  name: '',
  legalStructure: '',
  primaryLocation: '',
  charityNumber: '',
  mission: '',
  primarySector: '',
  primaryBeneficiary: '',
  minGrantTarget: '',
  maxGrantTarget: '',
  fundingTypes: ['grant', 'programme', 'investment', 'in_kind'], // all 4 selected by default
  alertsEnabled: true,
}

function legalStructureToOrgType(s: LegalStructure | ''): OrgType {
  if (s === 'cic_guarantee' || s === 'cic_shares') return 'cic'
  if (s === 'registered_charity' || s === 'cio')    return 'registered_charity'
  if (s === 'unincorporated' || s === 'not_registered') return 'community_group'
  if (s === 'sole_trader')                          return 'other'
  return 'social_enterprise'
}

/* ═══════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════ */

export default function OnboardingWizardPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [state, setState] = useState<WizardState>(EMPTY)
  const [prefilledFields, setPrefilledFields] = useState<Set<string>>(new Set())
  const [userId, setUserId] = useState('')
  const [orgId, setOrgId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Load existing org (if any) + pre-fill data from sessionStorage
  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUserId(user.id)

      const org = await getOrganisationByOwner(user.id)
      if (org) {
        setOrgId(org.id)
        setState(prev => ({
          ...prev,
          name:               org.name ?? '',
          legalStructure:     org.legal_structure ?? '',
          primaryLocation:    org.primary_location ?? '',
          charityNumber:      org.charity_number ?? '',
          mission:            org.mission ?? '',
          primarySector:      (org.impact_sectors?.[0] as ImpactSector) ?? '',
          primaryBeneficiary: (org.beneficiary_groups?.[0] as BeneficiaryGroup) ?? '',
          minGrantTarget:     org.min_grant_target != null ? String(org.min_grant_target) : '',
          maxGrantTarget:     org.max_grant_target != null ? String(org.max_grant_target) : '',
          fundingTypes:       (org.funding_type_preferences as FundingType[])?.length
                                ? (org.funding_type_preferences as FundingType[])
                                : ['grant', 'programme', 'investment', 'in_kind'],
        }))
      }

      // Pull sessionStorage pre-fill from /onboarding/start
      if (typeof window !== 'undefined') {
        const raw = sessionStorage.getItem(ONBOARDING_PREFILL_KEY)
        if (raw) {
          try {
            const prefill = JSON.parse(raw) as OnboardingPrefill
            setState(prev => ({
              ...prev,
              name:               prefill.name            || prev.name,
              legalStructure:     (prefill.legalStructure as LegalStructure) || prev.legalStructure,
              primaryLocation:    prefill.primaryLocation || prev.primaryLocation,
              charityNumber:      prefill.charityNumber   || prev.charityNumber,
              mission:            prefill.mission         || prev.mission,
              primarySector:      (prefill.impactSectors?.[0] as ImpactSector) || prev.primarySector,
              primaryBeneficiary: (prefill.beneficiaryGroups?.[0] as BeneficiaryGroup) || prev.primaryBeneficiary,
            }))
            const fields = new Set<string>(prefill.prefilledFields ?? [])
            if (prefill.impactSectors?.[0])      fields.add('primarySector')
            if (prefill.beneficiaryGroups?.[0])  fields.add('primaryBeneficiary')
            setPrefilledFields(fields)
          } catch { /* ignore malformed prefill */ }
        }
      }
      setLoading(false)
    }
    load()
  }, [router])

  function update<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setState(prev => ({ ...prev, [key]: value }))
    // Once the user touches a pre-filled field, drop the badge
    if (prefilledFields.has(key as string)) {
      setPrefilledFields(prev => {
        const next = new Set(prev)
        next.delete(key as string)
        return next
      })
    }
  }

  function toggleFundingType(t: FundingType) {
    setState(prev => ({
      ...prev,
      fundingTypes: prev.fundingTypes.includes(t)
        ? prev.fundingTypes.filter(x => x !== t)
        : [...prev.fundingTypes, t],
    }))
  }

  function step1Valid(): boolean {
    return !!(state.name.trim() && state.legalStructure && state.primaryLocation.trim())
  }
  function step2Valid(): boolean {
    return !!(state.mission.trim() && state.primarySector && state.primaryBeneficiary)
  }
  function step3Valid(): boolean {
    return state.fundingTypes.length > 0
  }

  async function handleFinish() {
    setSaving(true)
    setSaveError(null)
    try {
      const payload: Omit<Organisation, 'id' | 'created_at'> & {
        alerts_enabled: boolean; alert_frequency: string; alert_min_score: number
      } = {
        name:                         state.name.trim(),
        charity_number:               state.charityNumber.trim() || null,
        cic_number:                   null,
        org_type:                     legalStructureToOrgType(state.legalStructure),
        legal_structure:              state.legalStructure || null,
        org_stage:                    null,
        social_mission_declared:      false,
        articles_restrict_profit:     false,
        also_individual_practitioner: false,
        impact_sectors:               state.primarySector ? [state.primarySector] : [],
        beneficiary_groups:           state.primaryBeneficiary ? [state.primaryBeneficiary] : [],
        annual_income_band:           INCOME_BANDS[0],
        primary_location:             state.primaryLocation.trim() || null,
        themes:                       [],
        areas_of_work:                [],
        beneficiaries:                [],
        mission:                      state.mission.trim() || null,
        years_operating:              null,
        people_per_year:              null,
        volunteers:                   null,
        projects_running:             null,
        key_outcomes:                 [],
        min_grant_target:             state.minGrantTarget ? parseInt(state.minGrantTarget.replace(/[^\d]/g, '')) : null,
        max_grant_target:             state.maxGrantTarget ? parseInt(state.maxGrantTarget.replace(/[^\d]/g, '')) : null,
        funder_type_preferences:      [],
        funding_type_preferences:     state.fundingTypes,
        funding_subtype_preferences:  [],
        niche_tags:                   [],
        has_asset_lock:               null,
        years_trading:                null,
        owner_id:                     userId,
        alerts_enabled:               state.alertsEnabled,
        alert_frequency:              'weekly',
        alert_min_score:              70,
      }

      if (orgId) {
        await updateOrganisation(orgId, payload)
      } else {
        await createOrganisation(payload)
      }
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(ONBOARDING_PREFILL_KEY)
      }
      router.push('/dashboard/search?welcome=1')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save. Please try again.')
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-sm" style={{ color: '#8A8986' }}>Loading…</div>
  }

  const canAdvance =
    step === 1 ? step1Valid() :
    step === 2 ? step2Valid() :
    step3Valid()

  return (
    <div className="flex-1 flex items-start justify-center px-6 py-10 md:py-14">
      <div className="w-full max-w-xl">
        {/* Progress + Skip row */}
        <div className="flex items-center justify-between mb-4">
          <p
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: '#8A8986', fontFamily: 'var(--font-space-grotesk)' }}
          >
            Step {step} of 3
          </p>
          {step !== 3 && (
            <Link
              href="/dashboard/search"
              className="text-xs hover:underline"
              style={{ color: '#5F5E5A', fontFamily: 'var(--font-space-grotesk)' }}
            >
              Skip setup
            </Link>
          )}
        </div>
        {/* Progress dots */}
        <div className="flex gap-1.5 mb-8">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="h-1.5 flex-1"
              style={{
                background: i < step ? '#8ECB3C' : i === step ? '#173404' : '#E8E0D1',
                borderRadius: 999,
                transition: 'background 0.2s',
              }}
            />
          ))}
        </div>

        {/* Step 1 — Who you are */}
        {step === 1 && (
          <>
            <h1
              className="leading-tight mb-1"
              style={{
                fontFamily: 'var(--font-space-grotesk)',
                fontWeight: 700,
                fontSize: 'clamp(24px, 3.2vw, 30px)',
                color: '#2C2C2A',
                letterSpacing: '-0.02em',
              }}
            >
              Who you are
            </h1>
            <p className="text-sm mb-6" style={{ color: '#5F5E5A' }}>
              About 30 seconds &mdash; the basics on your organisation.
            </p>

            <div className="space-y-5">
              <FieldLabel label="Organisation name" required />
              <FieldInput
                value={state.name}
                onChange={v => update('name', v)}
                placeholder="e.g. Brighton Community CIC"
                prefilled={prefilledFields.has('name')}
              />

              <FieldLabel label="Legal structure" required />
              <FieldSelect
                value={state.legalStructure}
                onChange={v => update('legalStructure', v as LegalStructure | '')}
                options={LEGAL_STRUCTURE_OPTIONS}
                placeholder="Select a structure…"
                prefilled={prefilledFields.has('legalStructure')}
              />

              <FieldLabel label="Where you're based" required />
              <FieldInput
                value={state.primaryLocation}
                onChange={v => update('primaryLocation', v)}
                placeholder="e.g. Brighton, East Sussex"
                prefilled={prefilledFields.has('primaryLocation')}
              />

              <FieldLabel label="Charity number" hint="Optional — leave blank if not registered" />
              <FieldInput
                value={state.charityNumber}
                onChange={v => update('charityNumber', v)}
                placeholder="e.g. 1234567"
                prefilled={prefilledFields.has('charityNumber')}
              />
            </div>
          </>
        )}

        {/* Step 2 — What you do */}
        {step === 2 && (
          <>
            <h1
              className="leading-tight mb-1"
              style={{
                fontFamily: 'var(--font-space-grotesk)',
                fontWeight: 700,
                fontSize: 'clamp(24px, 3.2vw, 30px)',
                color: '#2C2C2A',
                letterSpacing: '-0.02em',
              }}
            >
              What you do
            </h1>
            <p className="text-sm mb-6" style={{ color: '#5F5E5A' }}>
              In your own words &mdash; the mission matters most. You can add secondary sectors later.
            </p>

            <div className="space-y-5">
              <FieldLabel label="What's your mission?" required />
              <FieldTextarea
                value={state.mission}
                onChange={v => update('mission', v)}
                placeholder="One or two sentences on what your organisation does and the difference it makes."
                prefilled={prefilledFields.has('mission')}
                rows={4}
              />

              <div>
                <FieldLabel label="Primary sector you work in" required />
                <p className="text-xs mt-0.5 mb-3" style={{ color: '#8A8986' }}>
                  Pick one. Secondary sectors can be added later from your profile.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {PRIMARY_SECTORS.map(opt => {
                    const active = state.primarySector === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => update('primarySector', opt.value)}
                        className="px-3 py-2.5 text-sm text-left transition-colors"
                        style={{
                          background: active ? '#F1F8E4' : '#FFFFFF',
                          color: active ? '#173404' : '#2C2C2A',
                          border: active ? '1.5px solid #8ECB3C' : '1px solid #E8E0D1',
                          borderRadius: 10,
                          fontWeight: active ? 600 : 500,
                          fontFamily: 'var(--font-space-grotesk)',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
                {prefilledFields.has('primarySector') && <PrefilledBadge />}
              </div>

              <div>
                <FieldLabel label="Who you primarily serve" required />
                <p className="text-xs mt-0.5 mb-3" style={{ color: '#8A8986' }}>
                  Pick one primary beneficiary group.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {PRIMARY_BENEFICIARIES.map(opt => {
                    const active = state.primaryBeneficiary === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => update('primaryBeneficiary', opt.value)}
                        className="px-3 py-2.5 text-sm text-left transition-colors"
                        style={{
                          background: active ? '#F1F8E4' : '#FFFFFF',
                          color: active ? '#173404' : '#2C2C2A',
                          border: active ? '1.5px solid #8ECB3C' : '1px solid #E8E0D1',
                          borderRadius: 10,
                          fontWeight: active ? 600 : 500,
                          fontFamily: 'var(--font-space-grotesk)',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
                {prefilledFields.has('primaryBeneficiary') && <PrefilledBadge />}
              </div>
            </div>
          </>
        )}

        {/* Step 3 — What you're looking for */}
        {step === 3 && (
          <>
            <h1
              className="leading-tight mb-1"
              style={{
                fontFamily: 'var(--font-space-grotesk)',
                fontWeight: 700,
                fontSize: 'clamp(24px, 3.2vw, 30px)',
                color: '#2C2C2A',
                letterSpacing: '-0.02em',
              }}
            >
              What you&rsquo;re looking for
            </h1>
            <p className="text-sm mb-6" style={{ color: '#5F5E5A' }}>
              We&rsquo;ll filter matches to the sizes and types you actually want.
            </p>

            <div className="space-y-6">
              <div>
                <FieldLabel label="Grant size range" hint="Optional — leave blank to see all sizes" />
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#8A8986' }}>£</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={state.minGrantTarget}
                      onChange={e => update('minGrantTarget', e.target.value.replace(/[^\d,]/g, ''))}
                      placeholder="5,000"
                      className="w-full pl-7 pr-3 py-2.5 text-sm outline-none"
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #E8E0D1',
                        borderRadius: 10,
                        color: '#2C2C2A',
                        fontFamily: 'var(--font-space-grotesk)',
                      }}
                    />
                  </div>
                  <span className="text-sm" style={{ color: '#8A8986' }}>to</span>
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#8A8986' }}>£</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={state.maxGrantTarget}
                      onChange={e => update('maxGrantTarget', e.target.value.replace(/[^\d,]/g, ''))}
                      placeholder="50,000"
                      className="w-full pl-7 pr-3 py-2.5 text-sm outline-none"
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #E8E0D1',
                        borderRadius: 10,
                        color: '#2C2C2A',
                        fontFamily: 'var(--font-space-grotesk)',
                      }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <FieldLabel label="What kinds of funding interest you?" />
                <p className="text-xs mt-0.5 mb-3" style={{ color: '#8A8986' }}>
                  All four are selected by default &mdash; untick anything that isn&rsquo;t relevant.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {FUNDING_TYPES.map(t => {
                    const active = state.fundingTypes.includes(t.value)
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => toggleFundingType(t.value)}
                        className="p-3.5 text-left transition-colors"
                        style={{
                          background: active ? t.bg : '#FFFFFF',
                          border: active ? `1.5px solid ${t.accent}` : '1px solid #E8E0D1',
                          borderRadius: 14,
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p
                              className="text-sm font-bold"
                              style={{ fontFamily: 'var(--font-space-grotesk)', color: active ? t.fg : '#2C2C2A' }}
                            >
                              {t.label}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: active ? t.fg : '#5F5E5A', opacity: active ? 0.75 : 1 }}>
                              {t.desc}
                            </p>
                          </div>
                          {active && (
                            <div
                              className="w-5 h-5 flex items-center justify-center flex-shrink-0"
                              style={{ background: t.accent, borderRadius: 999 }}
                            >
                              <Check size={12} color="#FFFFFF" strokeWidth={3} />
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div
                className="flex items-center justify-between gap-4 p-4"
                style={{ background: '#FFFFFF', border: '1px solid #E8E0D1', borderRadius: 14 }}
              >
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-semibold"
                    style={{ fontFamily: 'var(--font-space-grotesk)', color: '#2C2C2A' }}
                  >
                    Email me when new matches appear
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#5F5E5A' }}>
                    A weekly digest of high-scoring grants. You can change cadence in settings.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => update('alertsEnabled', !state.alertsEnabled)}
                  className="relative flex-shrink-0 transition-colors"
                  style={{
                    width: 44,
                    height: 24,
                    background: state.alertsEnabled ? '#8ECB3C' : '#E8E0D1',
                    borderRadius: 999,
                  }}
                  aria-pressed={state.alertsEnabled}
                  aria-label="Toggle email alerts"
                >
                  <span
                    className="absolute top-0.5 left-0.5 bg-white transition-transform"
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 999,
                      transform: state.alertsEnabled ? 'translateX(20px)' : 'translateX(0)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    }}
                  />
                </button>
              </div>
            </div>
          </>
        )}

        {/* Save error */}
        {saveError && (
          <div
            className="mt-6 px-4 py-3 text-sm"
            style={{ background: '#FAECE7', color: '#7A2A1A', border: '1px solid #E8B8A6', borderRadius: 10 }}
          >
            {saveError}
          </div>
        )}

        {/* Navigation */}
        <div className="mt-10 flex items-center justify-between">
          {step === 1 ? (
            <Link
              href="/onboarding/start"
              className="inline-flex items-center gap-1.5 text-sm hover:underline"
              style={{ color: '#5F5E5A', fontFamily: 'var(--font-space-grotesk)' }}
            >
              <ArrowLeft size={14} />
              Back
            </Link>
          ) : (
            <button
              onClick={() => setStep(s => (s - 1) as 1 | 2 | 3)}
              className="inline-flex items-center gap-1.5 text-sm hover:underline"
              style={{ color: '#5F5E5A', fontFamily: 'var(--font-space-grotesk)' }}
            >
              <ArrowLeft size={14} />
              Previous
            </button>
          )}

          {step < 3 ? (
            <button
              onClick={() => setStep(s => (s + 1) as 1 | 2 | 3)}
              disabled={!canAdvance}
              className="inline-flex items-center gap-2 px-5 py-3 text-sm font-bold transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                fontFamily: 'var(--font-space-grotesk)',
                background: '#173404',
                color: '#FFFFFF',
                borderRadius: 999,
              }}
            >
              Continue
              <ArrowRight size={14} strokeWidth={2.5} />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={saving || !canAdvance}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-bold transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                fontFamily: 'var(--font-space-grotesk)',
                background: '#8ECB3C',
                color: '#173404',
                borderRadius: 999,
              }}
            >
              {saving ? 'Saving…' : 'Finish & see my matches'}
              {!saving && <ArrowRight size={14} strokeWidth={2.5} />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Shared field primitives
   ═══════════════════════════════════════════════ */

function FieldLabel({ label, required, hint }: { label: string; required?: boolean; hint?: string }) {
  return (
    <div>
      <label
        className="text-sm font-semibold"
        style={{ color: '#2C2C2A', fontFamily: 'var(--font-space-grotesk)' }}
      >
        {label}
        {required && <span style={{ color: '#D85A30' }}> *</span>}
      </label>
      {hint && <p className="text-xs mt-0.5" style={{ color: '#8A8986' }}>{hint}</p>}
    </div>
  )
}

function PrefilledBadge() {
  return (
    <div className="mt-2 inline-flex items-center gap-1.5">
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
        style={{
          fontFamily: 'var(--font-space-grotesk)',
          background: '#F1F8E4',
          color: '#173404',
          border: '1px solid #C7E09A',
          borderRadius: 999,
        }}
      >
        <Sparkles size={9} strokeWidth={2.5} />
        Pre-filled
      </span>
    </div>
  )
}

function FieldInput({
  value, onChange, placeholder, prefilled,
}: { value: string; onChange: (v: string) => void; placeholder: string; prefilled?: boolean }) {
  return (
    <div>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 text-sm outline-none"
        style={{
          background: prefilled ? '#F1F8E4' : '#FFFFFF',
          border: prefilled ? '1.5px solid #C7E09A' : '1px solid #E8E0D1',
          borderRadius: 10,
          color: '#2C2C2A',
          fontFamily: 'var(--font-space-grotesk)',
          transition: 'background 0.15s, border-color 0.15s',
        }}
      />
      {prefilled && <PrefilledBadge />}
    </div>
  )
}

function FieldTextarea({
  value, onChange, placeholder, prefilled, rows = 3,
}: { value: string; onChange: (v: string) => void; placeholder: string; prefilled?: boolean; rows?: number }) {
  return (
    <div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2.5 text-sm outline-none resize-y"
        style={{
          background: prefilled ? '#F1F8E4' : '#FFFFFF',
          border: prefilled ? '1.5px solid #C7E09A' : '1px solid #E8E0D1',
          borderRadius: 10,
          color: '#2C2C2A',
          fontFamily: 'var(--font-space-grotesk)',
          lineHeight: 1.5,
          transition: 'background 0.15s, border-color 0.15s',
        }}
      />
      {prefilled && <PrefilledBadge />}
    </div>
  )
}

function FieldSelect({
  value, onChange, options, placeholder, prefilled,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string; hint?: string }[]
  placeholder: string
  prefilled?: boolean
}) {
  return (
    <div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2.5 text-sm outline-none appearance-none"
        style={{
          background: prefilled ? '#F1F8E4' : '#FFFFFF',
          border: prefilled ? '1.5px solid #C7E09A' : '1px solid #E8E0D1',
          borderRadius: 10,
          color: value ? '#2C2C2A' : '#8A8986',
          fontFamily: 'var(--font-space-grotesk)',
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'10\' height=\'6\' viewBox=\'0 0 10 6\' fill=\'none\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M1 1L5 5L9 1\' stroke=\'%238A8986\' stroke-width=\'1.5\'/%3E%3C/svg%3E")',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 14px center',
          paddingRight: 36,
        }}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {prefilled && <PrefilledBadge />}
    </div>
  )
}

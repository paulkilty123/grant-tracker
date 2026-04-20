'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, Globe, Star, ChevronRight, Pencil, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getOrganisationByOwner, createOrganisation, updateOrganisation } from '@/lib/organisations'
import { computeMatchScore } from '@/lib/matching'
import { normaliseScrapedGrant } from '@/lib/grants-normalise'
import type { LegalStructure, ImpactSector, BeneficiaryGroup, FundingType } from '@/types'

/* ═══════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════ */

const INCOME_BANDS = [
  'Under £10,000',
  '£10,000-£50,000',
  '£50,000-£100,000',
  '£100,000-£250,000',
  '£250,000-£500,000',
  '£500,000-£1 million',
  '£1 million-£5 million',
  'Over £5 million',
]

const GEOGRAPHIC_REACH_OPTIONS = [
  { value: 'local',         label: 'Local only',             hint: 'One town, borough, or district' },
  { value: 'regional',      label: 'Regional + national',    hint: 'County, region, or UK-wide' },
  { value: 'national',      label: 'National only',          hint: 'UK-wide programmes' },
  { value: 'international', label: 'UK-wide + international', hint: 'Includes overseas work' },
]

const LEGAL_STRUCTURE_OPTIONS: { value: LegalStructure; label: string }[] = [
  { value: 'cic_guarantee',      label: 'CIC (Limited by Guarantee)' },
  { value: 'cic_shares',         label: 'CIC (Limited by Shares)' },
  { value: 'cio',                label: 'Charitable Incorporated Organisation (CIO)' },
  { value: 'registered_charity', label: 'Registered Charity' },
  { value: 'ltd_guarantee',      label: 'Ltd by Guarantee (non-charity)' },
  { value: 'ltd_shares',         label: 'Ltd by Shares (social enterprise)' },
  { value: 'llp',                label: 'Limited Liability Partnership (LLP)' },
  { value: 'cooperative',        label: 'Co-operative / Community Benefit Society' },
  { value: 'unincorporated',     label: 'Unincorporated Association / Community Group' },
  { value: 'sole_trader',        label: 'Sole Trader / Individual Practitioner' },
  { value: 'not_registered',     label: 'Not yet registered' },
]

const IMPACT_SECTORS: { value: ImpactSector; label: string }[] = [
  { value: 'young_people',  label: 'Young People & Youth' },
  { value: 'community',     label: 'Community Dev & Spaces' },
  { value: 'health',        label: 'Health & Wellbeing' },
  { value: 'mental_health', label: 'Mental Health' },
  { value: 'housing',       label: 'Housing & Homelessness' },
  { value: 'education',     label: 'Education & Skills' },
  { value: 'environment',   label: 'Environment & Climate' },
  { value: 'creative',      label: 'Arts & Creative Industries' },
  { value: 'sport',         label: 'Sport & Physical Activity' },
  { value: 'employment',    label: 'Employment & Livelihoods' },
  { value: 'disability',    label: 'Disability' },
  { value: 'women',         label: 'Women & Gender Equality' },
  { value: 'heritage',      label: 'Heritage & Conservation' },
  { value: 'food',          label: 'Food & Agriculture' },
  { value: 'tech',          label: 'Tech for Good' },
  { value: 'justice',       label: 'Justice, Rights & Democracy' },
  { value: 'financial',     label: 'Financial Inclusion' },
  { value: 'international', label: 'International & Fair Trade' },
]

const BENEFICIARY_GROUPS: { value: BeneficiaryGroup; label: string }[] = [
  { value: 'children',          label: 'Children (under 16)' },
  { value: 'young_people',      label: 'Young people (16-25)' },
  { value: 'older_people',      label: 'Older people (65+)' },
  { value: 'families',          label: 'Families & parents' },
  { value: 'women_girls',       label: 'Women & girls' },
  { value: 'disabled_people',   label: 'Disabled people' },
  { value: 'people_in_poverty', label: 'People in poverty' },
  { value: 'refugees_migrants', label: 'Refugees & migrants' },
  { value: 'mental_health',     label: 'People w/ mental health needs' },
  { value: 'ethnic_minorities', label: 'Ethnic minority communities' },
  { value: 'lgbtq',             label: 'LGBTQ+ communities' },
  { value: 'homeless',          label: 'People experiencing homelessness' },
  { value: 'ex_offenders',      label: 'People with criminal records' },
  { value: 'carers',            label: 'Carers' },
  { value: 'veterans',          label: 'Veterans' },
  { value: 'rural_communities', label: 'Rural communities' },
  { value: 'general_public',    label: 'General public' },
]

const FUNDING_TYPES: { value: FundingType; label: string; desc: string; bg: string; fg: string; accent: string }[] = [
  { value: 'grant',      label: 'Grants',             desc: 'Non-repayable cash',          bg: '#F1F8E4', fg: '#173404', accent: '#8ECB3C' },
  { value: 'programme',  label: 'Programmes',         desc: 'Accelerators & support',      bg: '#FAECE7', fg: '#7A2A1A', accent: '#D85A30' },
  { value: 'investment', label: 'Social investment',  desc: 'Loans & repayable finance',   bg: '#E6F1FB', fg: '#0C447C', accent: '#378ADD' },
  { value: 'in_kind',    label: 'In-kind support',    desc: 'Software, space, pro bono',   bg: '#FDF3DC', fg: '#854F0B', accent: '#BA7517' },
]

function legalStructureToOrgType(s: LegalStructure | '') {
  if (s === 'cic_guarantee' || s === 'cic_shares') return 'cic'
  if (s === 'registered_charity' || s === 'cio')    return 'registered_charity'
  if (s === 'unincorporated' || s === 'not_registered') return 'community_group'
  if (s === 'sole_trader') return 'other'
  return 'social_enterprise'
}

/* ═══════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════ */

type WizardStep = 'entry' | 'review' | 'manual' | 'sectors' | 'location' | 'reveal'

const STEP_DOT: Record<WizardStep, number> = {
  entry: 1, review: 2, manual: 2, sectors: 3, location: 4, reveal: 5,
}

// Visual state for a review field based on confidence
type FieldState = 'confident' | 'uncertain' | 'missing'

function fieldState(confidence: number | undefined | null): FieldState {
  if (confidence == null || confidence < 0.4) return 'missing'
  if (confidence < 0.8) return 'uncertain'
  return 'confident'
}

interface ExtractedData {
  url: string
  name:              string | null
  legalStructure:    string | null
  primaryLocation:   string | null
  annualIncomeBand:  string | null
  mission:           string | null
  impactSectors:     ImpactSector[]
  beneficiaryGroups: BeneficiaryGroup[]
  confidence: {
    name?:             number
    legalStructure?:   number
    primaryLocation?:  number
    annualIncomeBand?: number
    mission?:          number
    impactSectors?:    number
    beneficiaryGroups?: number
  }
}

interface RevealMatch {
  id: string
  title: string
  funderName: string
  score: number
  minAmount: number | null
  maxAmount: number | null
  isRolling: boolean
  deadline: string | null
}

interface WizardState {
  name: string
  legalStructure: LegalStructure | ''
  primaryLocation: string
  annualIncomeBand: string
  geographicReach: string
  mission: string
  impactSectors: ImpactSector[]       // index 0 = primary
  beneficiaryGroups: BeneficiaryGroup[] // index 0 = primary
  minGrantTarget: string
  maxGrantTarget: string
  fundingTypes: FundingType[]
}

const EMPTY_STATE: WizardState = {
  name: '', legalStructure: '', primaryLocation: '',
  annualIncomeBand: '', geographicReach: '', mission: '',
  impactSectors: [], beneficiaryGroups: [],
  minGrantTarget: '', maxGrantTarget: '',
  fundingTypes: ['grant', 'programme', 'investment', 'in_kind'],
}

/* ═══════════════════════════════════════════════
   Main component
   ═══════════════════════════════════════════════ */

export default function OnboardingWizardPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep]           = useState<WizardStep>('entry')
  const [state, setState]         = useState<WizardState>(EMPTY_STATE)
  const [extracted, setExtracted] = useState<ExtractedData | null>(null)
  const [userId, setUserId]       = useState('')
  const [orgId, setOrgId]         = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)

  // Entry step
  const [url, setUrl]           = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Review step - track which uncertain fields have been confirmed
  const [confirmed, setConfirmed]       = useState<Set<string>>(new Set())
  const [editingField, setEditingField] = useState<string | null>(null)

  // Location/save step
  const [saving, setSaving]     = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Reveal
  const [revealMatches, setRevealMatches] = useState<RevealMatch[] | null>(null)
  const [revealCount, setRevealCount]     = useState<number | null>(null)
  const matchFetchRef = useRef<Promise<void> | null>(null)

  // Load existing org on mount
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUserId(user.id)
      const org = await getOrganisationByOwner(user.id)
      if (org) {
        setOrgId(org.id)
        setState({
          name:             org.name ?? '',
          legalStructure:   (org.legal_structure as LegalStructure) ?? '',
          primaryLocation:  org.primary_location ?? '',
          annualIncomeBand: org.annual_income_band ?? '',
          geographicReach:  org.geographic_reach ?? '',
          mission:          org.mission ?? '',
          impactSectors:    (org.impact_sectors as ImpactSector[]) ?? [],
          beneficiaryGroups:(org.beneficiary_groups as BeneficiaryGroup[]) ?? [],
          minGrantTarget:   org.min_grant_target != null ? String(org.min_grant_target) : '',
          maxGrantTarget:   org.max_grant_target != null ? String(org.max_grant_target) : '',
          fundingTypes:     (org.funding_type_preferences as FundingType[])?.length
                              ? (org.funding_type_preferences as FundingType[])
                              : ['grant', 'programme', 'investment', 'in_kind'],
        })
      }
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Handlers ──────────────────────────────── */

  function update<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setState(prev => ({ ...prev, [key]: value }))
  }

  async function handleAutoFill() {
    if (!url.trim()) return
    setFetching(true)
    setFetchError(null)
    try {
      const res  = await fetch('/api/org-autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Auto-fill failed')

      const conf = data._confidence ?? {}

      // Derive legal_structure from orgType
      let derivedLegal: LegalStructure | '' = ''
      if (data.orgType === 'registered_charity') derivedLegal = 'registered_charity'
      else if (data.orgType === 'cic')           derivedLegal = 'cic_guarantee'
      else if (data.orgType === 'social_enterprise') derivedLegal = 'ltd_guarantee'
      else if (data.orgType === 'community_group')   derivedLegal = 'unincorporated'

      const ext: ExtractedData = {
        url: url.trim(),
        name:              data.name ?? null,
        legalStructure:    derivedLegal || null,
        primaryLocation:   data.primaryLocation ?? null,
        annualIncomeBand:  data.annualIncome ?? null,
        mission:           data.mission ?? null,
        impactSectors:     Array.isArray(data.impactSectors) ? data.impactSectors.slice(0, 5) : [],
        beneficiaryGroups: Array.isArray(data.beneficiaryGroups) ? data.beneficiaryGroups.slice(0, 5) : [],
        confidence: {
          name:             conf.name,
          legalStructure:   conf.orgType,  // confidence for the derived field
          primaryLocation:  conf.primaryLocation,
          annualIncomeBand: conf.annualIncome,
          mission:          conf.mission,
          impactSectors:    conf.impactSectors,
          beneficiaryGroups: conf.beneficiaryGroups,
        },
      }
      setExtracted(ext)

      // Pre-populate wizard state from extraction
      setState(prev => ({
        ...prev,
        name:             ext.name ?? prev.name,
        legalStructure:   (ext.legalStructure as LegalStructure) ?? prev.legalStructure,
        primaryLocation:  ext.primaryLocation ?? prev.primaryLocation,
        annualIncomeBand: ext.annualIncomeBand ?? prev.annualIncomeBand,
        mission:          ext.mission ?? prev.mission,
        impactSectors:    ext.impactSectors.length > 0 ? ext.impactSectors : prev.impactSectors,
        beneficiaryGroups: ext.beneficiaryGroups.length > 0 ? ext.beneficiaryGroups : prev.beneficiaryGroups,
      }))

      // Auto-confirm all high-confidence fields
      const autoConfirmed = new Set<string>()
      const fields: Array<keyof ExtractedData['confidence']> = [
        'name','legalStructure','primaryLocation','annualIncomeBand','mission','impactSectors','beneficiaryGroups'
      ]
      fields.forEach(f => {
        if ((conf[f] ?? 0) >= 0.8) autoConfirmed.add(f)
      })
      setConfirmed(autoConfirmed)
      setStep('review')
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Auto-fill failed - please try again')
    } finally {
      setFetching(false)
    }
  }

  function handleManualPath() {
    setExtracted(null)
    setStep('manual')
  }

  // Called when user edits a review field value
  function confirmField(field: string, value?: string) {
    if (value !== undefined) {
      // Update the underlying wizard state
      const key = field as keyof WizardState
      if (key in EMPTY_STATE) setState(prev => ({ ...prev, [key]: value }))
    }
    setConfirmed(prev => { const n = new Set(prev); n.add(field); return n })
    setEditingField(null)
  }

  // Are all uncertain review fields confirmed?
  function reviewCanContinue(): boolean {
    if (!extracted) return true
    const uncertainFields = Object.entries(extracted.confidence)
      .filter(([, c]) => fieldState(c) === 'uncertain')
      .map(([k]) => k)
    return uncertainFields.every(f => confirmed.has(f))
  }

  // Sector/beneficiary chip interactions
  function toggleSector(s: ImpactSector) {
    setState(prev => {
      const cur = [...prev.impactSectors]
      const idx = cur.indexOf(s)
      if (idx === -1) {
        if (cur.length >= 4) return prev
        return { ...prev, impactSectors: [...cur, s] }
      }
      return { ...prev, impactSectors: cur.filter(x => x !== s) }
    })
  }
  function makePrimarySector(s: ImpactSector) {
    setState(prev => ({ ...prev, impactSectors: [s, ...prev.impactSectors.filter(x => x !== s)] }))
  }

  function toggleBeneficiary(b: BeneficiaryGroup) {
    setState(prev => {
      const cur = [...prev.beneficiaryGroups]
      const idx = cur.indexOf(b)
      if (idx === -1) {
        if (cur.length >= 4) return prev
        return { ...prev, beneficiaryGroups: [...cur, b] }
      }
      return { ...prev, beneficiaryGroups: cur.filter(x => x !== b) }
    })
  }
  function makePrimaryBeneficiary(b: BeneficiaryGroup) {
    setState(prev => ({ ...prev, beneficiaryGroups: [b, ...prev.beneficiaryGroups.filter(x => x !== b)] }))
  }

  function toggleFundingType(t: FundingType) {
    setState(prev => ({
      ...prev,
      fundingTypes: prev.fundingTypes.includes(t)
        ? prev.fundingTypes.filter(x => x !== t)
        : [...prev.fundingTypes, t],
    }))
  }

  /* ── Save + reveal ─────────────────────────── */

  async function handleFinish() {
    setSaving(true)
    setSaveError(null)
    try {
      const today = new Date().toISOString().split('T')[0]

      const payload = {
        name:                       state.name.trim() || 'My Organisation',
        charity_number:             null,
        cic_number:                 null,
        org_type:                   legalStructureToOrgType(state.legalStructure) as 'cic' | 'registered_charity' | 'social_enterprise' | 'community_group' | 'other',
        legal_structure:            state.legalStructure || null,
        org_stage:                  null,
        social_mission_declared:    false,
        articles_restrict_profit:   false,
        also_individual_practitioner: false,
        impact_sectors:             state.impactSectors,
        beneficiary_groups:         state.beneficiaryGroups,
        annual_income_band:         state.annualIncomeBand || null,
        primary_location:           state.primaryLocation.trim() || null,
        geographic_reach:           state.geographicReach || null,
        themes:                     [],
        areas_of_work:              [],
        beneficiaries:              [],
        mission:                    state.mission.trim() || null,
        years_operating:            null,
        people_per_year:            null,
        volunteers:                 null,
        projects_running:           null,
        key_outcomes:               [],
        min_grant_target:           state.minGrantTarget ? parseInt(state.minGrantTarget.replace(/[^\d]/g, '')) : null,
        max_grant_target:           state.maxGrantTarget ? parseInt(state.maxGrantTarget.replace(/[^\d]/g, '')) : null,
        funder_type_preferences:    [],
        funding_type_preferences:   state.fundingTypes,
        funding_subtype_preferences: [],
        niche_tags:                 [],
        has_asset_lock:             null,
        years_trading:              null,
        owner_id:                   userId,
        alerts_enabled:             true,
        alert_frequency:            'weekly',
        alert_min_score:            70,
      }

      let savedOrgId = orgId
      if (orgId) {
        await updateOrganisation(orgId, payload)
      } else {
        const created = await createOrganisation(payload as Parameters<typeof createOrganisation>[0])
        savedOrgId = created.id
        setOrgId(created.id)
      }

      // Kick off parallel match fetch while we transition to reveal
      matchFetchRef.current = (async () => {
        try {
          const { data: scraped } = await supabase
            .from('grants_with_funder')
            .select('*')
            .eq('is_active', true)
            .neq('url_status', 'dead')
            .or(`is_rolling.eq.true,deadline.is.null,deadline.gte.${today}`)
            .limit(1500)

          if (!scraped) return

          // Fetch full saved org to pass to matching engine
          const savedOrg = await getOrganisationByOwner(userId)
          if (!savedOrg) return

          const scored = scraped
            .map(row => {
              const grant = normaliseScrapedGrant(row as Record<string, unknown>)
              const result = computeMatchScore(grant, savedOrg)
              return { grant, score: result.score }
            })
            .filter(x => x.score > 20)
            .sort((a, b) => b.score - a.score)

          setRevealCount(scored.length)
          setRevealMatches(
            scored.slice(0, 3).map(({ grant, score }) => ({
              id:         grant.id,
              title:      grant.title,
              funderName: grant.funder ?? '',
              score,
              minAmount:  grant.amountMin > 0 ? grant.amountMin : null,
              maxAmount:  grant.amountMax > 0 ? grant.amountMax : null,
              isRolling:  grant.isRolling ?? false,
              deadline:   grant.deadline ?? null,
            }))
          )
        } catch {
          // non-fatal - reveal will show 0
          setRevealCount(0)
          setRevealMatches([])
        }
      })()

      setStep('reveal')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  /* ── Derived UI state ──────────────────────── */

  const sectorsValid = state.impactSectors.length > 0 && state.beneficiaryGroups.length > 0
  const locationValid = !!(state.name.trim() && state.legalStructure)

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p style={{ color: '#8A8986', fontFamily: 'var(--font-space-grotesk)', fontSize: 14 }}>Loading…</p>
      </div>
    )
  }


  // ── Full-page hero for Step 1 ──
  if (step === 'entry') {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 24px 40px',
        minHeight: 620,
        width: '100%',
        background: 'linear-gradient(180deg, #F4F9ED 0%, #fff 100%)',
      }}>
        {/* Top bar: step dots only, right-aligned */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: 60 }}>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{
                height: 6,
                width: i === 1 ? 18 : 6,
                borderRadius: 999,
                background: i === 1 ? '#639922' : 'rgba(0,0,0,0.1)',
                transition: 'all 250ms ease',
              }} />
            ))}
          </div>
        </div>

        {/* Hero content — upper-third anchor */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          textAlign: 'center',
          maxWidth: 560,
          margin: '0 auto',
          width: '100%',
          paddingTop: 140,
        }}>
          <StepEntry
            url={url}
            setUrl={setUrl}
            fetching={fetching}
            error={fetchError}
            onAutoFill={handleAutoFill}
            onManual={handleManualPath}
          />
        </div>

        {/* Skip link */}
        <div style={{ textAlign: 'center' }}>
          <Link
            href="/dashboard/search"
            style={{
              fontFamily: 'var(--font-space-grotesk)',
              fontSize: 13,
              color: '#8A8986',
              textDecoration: 'none',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#5F5E5A')}
            onMouseLeave={e => (e.currentTarget.style.color = '#8A8986')}
          >
            Skip setup for now
          </Link>
        </div>
      </div>
    )
  }

  const dotPos = STEP_DOT[step]

  return (
    <div className="flex-1 flex items-start justify-center px-4 py-8 md:py-12">
      <div className="w-full max-w-[600px]">

        {/* ── Card ──────────────────────────── */}
        <div style={{
          background: '#fff',
          border: '0.5px solid rgba(0,0,0,0.1)',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          {/* Card header */}
          <div style={{
            padding: '20px 32px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{
              fontFamily: 'var(--font-space-grotesk)',
              fontWeight: 700,
              fontSize: 18,
              color: '#2C2C2A',
              letterSpacing: '-0.02em',
            }}>
              GrantTracker
            </span>
            {/* Step dots */}
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              {[1,2,3,4,5].map(i => (
                <div key={i} style={{
                  height: 6,
                  width: i === dotPos ? 18 : 6,
                  borderRadius: 999,
                  background: i < dotPos ? '#97C459' : i === dotPos ? '#639922' : 'rgba(0,0,0,0.1)',
                  transition: 'all 250ms ease',
                }} />
              ))}
            </div>
          </div>

          {/* Card body */}
          <div style={{ padding: '28px 32px 32px' }}>

            {/* ══ STEP 1: ENTRY ══════════════ */}

            {/* ══ STEP 2A: REVIEW ═══════════ */}
            {step === 'review' && extracted && (
              <StepReview
                extracted={extracted}
                state={state}
                confirmed={confirmed}
                editingField={editingField}
                setEditingField={setEditingField}
                confirmField={confirmField}
                canContinue={reviewCanContinue()}
                onBack={() => setStep('entry')}
                onSkip={() => setStep('sectors')}
                onContinue={() => setStep('sectors')}
              />
            )}

            {/* ══ STEP 2B: MANUAL ═══════════ */}
            {step === 'manual' && (
              <StepManual
                state={state}
                update={update}
                onBack={() => setStep('entry')}
                onContinue={() => setStep('sectors')}
              />
            )}

            {/* ══ STEP 3: SECTORS ═══════════ */}
            {step === 'sectors' && (
              <StepSectors
                impactSectors={state.impactSectors}
                beneficiaryGroups={state.beneficiaryGroups}
                toggleSector={toggleSector}
                makePrimarySector={makePrimarySector}
                toggleBeneficiary={toggleBeneficiary}
                makePrimaryBeneficiary={makePrimaryBeneficiary}
                onBack={() => setStep(extracted ? 'review' : 'manual')}
                onContinue={() => setStep('location')}
                canContinue={sectorsValid}
              />
            )}

            {/* ══ STEP 4: LOCATION ══════════ */}
            {step === 'location' && (
              <StepLocation
                state={state}
                update={update}
                toggleFundingType={toggleFundingType}
                saving={saving}
                saveError={saveError}
                canContinue={locationValid}
                onBack={() => setStep('sectors')}
                onFinish={handleFinish}
              />
            )}

            {/* ══ STEP 5: REVEAL ════════════ */}
            {step === 'reveal' && (
              <StepReveal
                matchCount={revealCount}
                topMatches={revealMatches}
                onExplore={() => router.push('/dashboard/search?welcome=1')}
              />
            )}

          </div>
        </div>

        {/* Skip link - not shown on reveal */}
        {step !== 'reveal' && (
          <div className="text-center mt-5">
            <Link
              href="/dashboard/search"
              style={{
                fontFamily: 'var(--font-space-grotesk)',
                fontSize: 13,
                color: '#8A8986',
                textDecoration: 'none',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#5F5E5A')}
              onMouseLeave={e => (e.currentTarget.style.color = '#8A8986')}
            >
              Skip setup for now
            </Link>
          </div>
        )}

      </div>
    </div>
  )
}

function StepEntry({
  url, setUrl, fetching, error, onAutoFill, onManual,
}: {
  url: string
  setUrl: (v: string) => void
  fetching: boolean
  error: string | null
  onAutoFill: () => void
  onManual: () => void
}) {
  const [manualHover, setManualHover] = useState(false)
  const isDisabled = fetching || !url.trim()

  return (
    <>
      <h1 style={{
        fontFamily: 'var(--font-space-grotesk)',
        fontSize: 40,
        fontWeight: 600,
        letterSpacing: '-0.02em',
        color: '#2C2C2A',
        marginBottom: 12,
        lineHeight: 1.15,
      }}>
        Let&rsquo;s build your profile
      </h1>
      <p style={{
        fontFamily: 'var(--font-dm-sans)',
        fontSize: 16,
        color: '#5F5E5A',
        marginBottom: 32,
        lineHeight: 1.6,
        maxWidth: 460,
      }}>
        Drop in your website and we&rsquo;ll do the heavy lifting. You can review and refine everything in the next step.
      </p>

      <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 520 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Globe
            size={14}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8A8986', pointerEvents: 'none' }}
          />
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !fetching && onAutoFill()}
            placeholder="https://yourorganisation.org.uk"
            style={{
              ...INPUT_STYLE,
              fontSize: 15,
              padding: '13px 14px 13px 34px',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <button
          onClick={onAutoFill}
          disabled={isDisabled}
          style={{
            ...BTN_PRIMARY,
            background: '#8ECB3C',
            color: '#173404',
            padding: '13px 20px',
            opacity: isDisabled ? 0.5 : 1,
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {fetching ? 'Reading...' : 'Auto-fill profile'}
        </button>
      </div>

      {error && (
        <p style={{ fontSize: 13, color: '#B03A1A', marginTop: 8 }}>{error}</p>
      )}

      <button
        onClick={onManual}
        onMouseEnter={() => setManualHover(true)}
        onMouseLeave={() => setManualHover(false)}
        style={{
          background: 'transparent',
          border: 'none',
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 14,
          color: '#5F5E5A',
          cursor: 'pointer',
          textDecoration: manualHover ? 'underline' : 'none',
          textUnderlineOffset: 3,
          marginTop: 20,
        }}
      >
        No website? Fill in manually
      </button>
    </>
  )
}

function StepReview({
  extracted, state, confirmed, editingField, setEditingField, confirmField,
  canContinue, onBack, onSkip, onContinue,
}: {
  extracted: ExtractedData
  state: { name: string; legalStructure: string; primaryLocation: string; annualIncomeBand: string }
  confirmed: Set<string>
  editingField: string | null
  setEditingField: (f: string | null) => void
  confirmField: (field: string, value?: string) => void
  canContinue: boolean
  onBack: () => void
  onSkip: () => void
  onContinue: () => void
}) {
  const hostname = (() => {
    try { return new URL(extracted.url.startsWith('http') ? extracted.url : `https://${extracted.url}`).hostname }
    catch { return extracted.url }
  })()

  const fields: Array<{
    key: keyof typeof extracted.confidence
    label: string
    value: string | null
    stateKey?: string
    type?: 'text' | 'select'
    options?: { value: string; label: string }[]
  }> = [
    { key: 'name',             label: 'Organisation name',  value: extracted.name,           stateKey: 'name',            type: 'text' },
    { key: 'legalStructure',   label: 'Legal structure',    value: LEGAL_STRUCTURE_OPTIONS.find(o => o.value === extracted.legalStructure)?.label ?? extracted.legalStructure, stateKey: 'legalStructure', type: 'select', options: LEGAL_STRUCTURE_OPTIONS },
    { key: 'primaryLocation',  label: 'Primary location',   value: extracted.primaryLocation, stateKey: 'primaryLocation', type: 'text' },
    { key: 'impactSectors',    label: 'Primary sector',     value: extracted.impactSectors.slice(0,2).map(s => IMPACT_SECTORS.find(o => o.value === s)?.label ?? s).join(' · ') || null },
    { key: 'beneficiaryGroups',label: 'Who you serve',      value: extracted.beneficiaryGroups.slice(0,2).map(b => BENEFICIARY_GROUPS.find(o => o.value === b)?.label ?? b).join(' · ') || null },
    { key: 'annualIncomeBand', label: 'Annual income',      value: extracted.annualIncomeBand, stateKey: 'annualIncomeBand', type: 'select', options: INCOME_BANDS.map(b => ({ value: b, label: b })) },
  ]

  const foundCount = fields.filter(f => f.value).length

  return (
    <>
      <BackButton onClick={onBack} />

      <h1 style={H1}>Here&rsquo;s what we found</h1>
      <p style={SUBTITLE}>Review and tweak what&rsquo;s not quite right. We&rsquo;re confident about the green ones.</p>

      {/* Summary banner */}
      <div style={{ background: '#F5F1E8', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#2C2C2A', fontFamily: 'var(--font-dm-sans)' }}>
        <strong style={{ fontWeight: 500 }}>Found {foundCount} of {fields.length} fields</strong> from <span style={{ color: '#5F5E5A' }}>{hostname}</span>
        {foundCount < fields.length && `. ${fields.length - foundCount} couldn't be inferred - you can add ${fields.length - foundCount === 1 ? 'it' : 'them'} in later steps.`}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {fields.map(field => {
          const confidence = extracted.confidence[field.key]
          const state_val  = fieldState(confidence)
          const isEditing  = editingField === field.key
          const isConfirmed = confirmed.has(field.key)

          return (
            <ReviewField
              key={field.key}
              fieldKey={field.key}
              label={field.label}
              value={field.value}
              fieldState={state_val}
              isEditing={isEditing}
              isConfirmed={isConfirmed}
              type={field.type}
              options={field.options}
              onEdit={() => setEditingField(field.key)}
              onConfirm={(val) => confirmField(field.key, val)}
              onCancel={() => setEditingField(null)}
            />
          )
        })}
      </div>

      <div style={ACTIONS}>
        <button onClick={onSkip} style={SKIP_BTN}>I&rsquo;ll refine these later</button>
        <button
          onClick={onContinue}
          disabled={!canContinue}
          style={{ ...BTN_PRIMARY, opacity: canContinue ? 1 : 0.45, cursor: canContinue ? 'pointer' : 'not-allowed' }}
        >
          Continue <ArrowRight size={14} />
        </button>
      </div>
    </>
  )
}

function ReviewField({
  fieldKey, label, value, fieldState: fState, isEditing, isConfirmed, type, options,
  onEdit, onConfirm, onCancel,
}: {
  fieldKey: string
  label: string
  value: string | null
  fieldState: FieldState
  isEditing: boolean
  isConfirmed: boolean
  type?: 'text' | 'select'
  options?: { value: string; label: string }[]
  onEdit: () => void
  onConfirm: (val?: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => { setDraft(value ?? '') }, [value])

  const bg = fState === 'confident' ? '#F4FBE8'
           : fState === 'uncertain' ? '#FDFBF5'
           : '#FAFAF7'
  const borderColor = fState === 'confident' ? 'rgba(99,153,34,0.25)'
                    : fState === 'uncertain' ? 'rgba(186,117,23,0.25)'
                    : 'rgba(0,0,0,0.08)'
  const borderStyle = fState === 'missing' ? 'dashed' : 'solid'
  const iconBg = fState === 'confident' ? '#639922'
               : fState === 'uncertain' ? '#BA7517'
               : 'transparent'
  const iconColor = fState === 'missing' ? '#8A8986' : '#fff'
  const iconChar  = fState === 'confident' ? '✓'
                  : fState === 'uncertain' ? '?'
                  : '+'

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '12px 14px',
      background: isConfirmed && fState !== 'confident' ? '#F4FBE8' : bg,
      borderRadius: 10,
      border: `0.5px ${borderStyle} ${isConfirmed && fState !== 'confident' ? 'rgba(99,153,34,0.25)' : borderColor}`,
      transition: 'background 150ms, border-color 150ms',
    }}>
      {/* Icon */}
      <div style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
        background: isConfirmed && fState !== 'confident' ? '#639922' : iconBg,
        border: fState === 'missing' && !isConfirmed ? '1px dashed #8A8986' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, color: isConfirmed && fState !== 'confident' ? '#fff' : iconColor,
        fontWeight: 600,
      }}>
        {isConfirmed && fState !== 'confident' ? '✓' : iconChar}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 500, color: '#8A8986', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, fontFamily: 'var(--font-space-grotesk)' }}>
          {label}
          {fState === 'uncertain' && !isConfirmed && (
            <span style={{ marginLeft: 6, color: '#BA7517' }}>· please confirm</span>
          )}
        </div>

        {isEditing && type ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
            {type === 'select' && options ? (
              <select
                value={draft}
                onChange={e => setDraft(e.target.value)}
                autoFocus
                style={{ ...INPUT_STYLE, flex: 1, fontSize: 13, padding: '6px 10px' }}
              >
                <option value="">Select…</option>
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input
                type="text"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                autoFocus
                style={{ ...INPUT_STYLE, flex: 1, fontSize: 13, padding: '6px 10px' }}
              />
            )}
            <button onClick={() => onConfirm(draft)} style={{ ...BTN_PRIMARY, padding: '6px 12px', fontSize: 12 }}>
              <Check size={12} /> Save
            </button>
            <button onClick={onCancel} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#8A8986', padding: '4px' }}>
              <X size={14} />
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 14, color: value ? '#2C2C2A' : '#8A8986', fontWeight: value ? 500 : 400, fontStyle: value ? 'normal' : 'italic', fontFamily: 'var(--font-dm-sans)' }}>
            {value ?? 'Couldn\'t find this - add manually'}
          </div>
        )}
      </div>

      {/* Actions - only for non-sector/beneficiary fields with type */}
      {!isEditing && type && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'flex-start', marginTop: 1 }}>
          {fState === 'uncertain' && !isConfirmed && (
            <button
              onClick={() => onConfirm()}
              style={{ fontSize: 11, color: '#BA7517', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-space-grotesk)', padding: '2px 6px', whiteSpace: 'nowrap' }}
            >
              Looks right ✓
            </button>
          )}
          <button
            onClick={onEdit}
            style={{ fontSize: 11, color: '#8A8986', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-space-grotesk)', padding: '2px 4px' }}
          >
            <Pencil size={11} />
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Manual step ── */

function StepManual({ state, update, onBack, onContinue }: {
  state: WizardState
  update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void
  onBack: () => void
  onContinue: () => void
}) {
  const valid = !!(state.name.trim() && state.legalStructure)
  return (
    <>
      <BackButton onClick={onBack} />
      <h1 style={H1}>Tell us about your organisation</h1>
      <p style={SUBTITLE}>We use this to check eligibility on the funders we match you with.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 24 }}>
        <Field label="What are you called?" required>
          <input
            type="text"
            value={state.name}
            onChange={e => update('name', e.target.value)}
            placeholder="e.g. AudioActive"
            style={INPUT_STYLE}
          />
        </Field>

        <Field label="What kind of organisation are you?" required hint="Drives which funders you're eligible for">
          <Select
            value={state.legalStructure}
            onChange={v => update('legalStructure', v as LegalStructure | '')}
            options={LEGAL_STRUCTURE_OPTIONS}
            placeholder="Select your legal structure…"
          />
        </Field>

        <Field label="Annual income" hint="Approximate band is fine - many funders have income caps">
          <Select
            value={state.annualIncomeBand}
            onChange={v => update('annualIncomeBand', v)}
            options={INCOME_BANDS.map(b => ({ value: b, label: b }))}
            placeholder="Select a band…"
          />
        </Field>
      </div>

      <div style={ACTIONS}>
        <div />
        <button
          onClick={onContinue}
          disabled={!valid}
          style={{ ...BTN_PRIMARY, opacity: valid ? 1 : 0.45, cursor: valid ? 'pointer' : 'not-allowed' }}
        >
          Continue <ArrowRight size={14} />
        </button>
      </div>
    </>
  )
}

/* ── Sectors step ── */

function StepSectors({ impactSectors, beneficiaryGroups, toggleSector, makePrimarySector, toggleBeneficiary, makePrimaryBeneficiary, onBack, onContinue, canContinue }: {
  impactSectors: ImpactSector[]
  beneficiaryGroups: BeneficiaryGroup[]
  toggleSector: (s: ImpactSector) => void
  makePrimarySector: (s: ImpactSector) => void
  toggleBeneficiary: (b: BeneficiaryGroup) => void
  makePrimaryBeneficiary: (b: BeneficiaryGroup) => void
  onBack: () => void
  onContinue: () => void
  canContinue: boolean
}) {
  const [hoveredSector, setHoveredSector]         = useState<string | null>(null)
  const [hoveredBeneficiary, setHoveredBeneficiary] = useState<string | null>(null)
  const sectorMax     = impactSectors.length >= 4
  const beneficiaryMax = beneficiaryGroups.length >= 4

  return (
    <>
      <BackButton onClick={onBack} />
      <h1 style={H1}>What do you focus on?</h1>
      <p style={SUBTITLE}>Pick your primary focus first - that&rsquo;s what we&rsquo;ll weight most in matching.</p>

      {/* Sectors */}
      <PickerSection
        label="Your impact sector"
        hint="Pick 1 primary + up to 3 secondary"
        selected={impactSectors}
      />
      <div style={PICKER_GRID}>
        {IMPACT_SECTORS.map(opt => {
          const idx         = impactSectors.indexOf(opt.value)
          const isPrimary   = idx === 0
          const isSecondary = idx > 0
          const isUnselected = idx === -1
          const isHov       = hoveredSector === opt.value
          const dimmed      = sectorMax && isUnselected
          return (
            <div key={opt.value} style={{ position: 'relative' }}>
              <button
                onClick={() => toggleSector(opt.value)}
                onMouseEnter={() => setHoveredSector(opt.value)}
                onMouseLeave={() => setHoveredSector(null)}
                style={{ ...chipStyle(isPrimary, isSecondary), opacity: dimmed ? 0.38 : 1, pointerEvents: dimmed ? 'none' : 'auto' }}
              >
                {isPrimary && <Star size={10} style={{ marginRight: 4, flexShrink: 0 }} fill="currentColor" />}
                {opt.label}
              </button>
              {isSecondary && isHov && (
                <button
                  onClick={e => { e.stopPropagation(); makePrimarySector(opt.value) }}
                  onMouseEnter={() => setHoveredSector(opt.value)}
                  onMouseLeave={() => setHoveredSector(null)}
                  title="Make primary"
                  style={MAKE_PRIMARY_BTN}
                >
                  <Star size={9} fill="currentColor" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Beneficiaries */}
      <PickerSection
        label="Who you serve"
        hint="Pick 1 primary + up to 3 secondary"
        selected={beneficiaryGroups}
        style={{ marginTop: 8 }}
      />
      <div style={PICKER_GRID}>
        {BENEFICIARY_GROUPS.map(opt => {
          const idx         = beneficiaryGroups.indexOf(opt.value)
          const isPrimary   = idx === 0
          const isSecondary = idx > 0
          const isUnselected = idx === -1
          const isHov       = hoveredBeneficiary === opt.value
          const dimmed      = beneficiaryMax && isUnselected
          return (
            <div key={opt.value} style={{ position: 'relative' }}>
              <button
                onClick={() => toggleBeneficiary(opt.value)}
                onMouseEnter={() => setHoveredBeneficiary(opt.value)}
                onMouseLeave={() => setHoveredBeneficiary(null)}
                style={{ ...chipStyle(isPrimary, isSecondary), opacity: dimmed ? 0.38 : 1, pointerEvents: dimmed ? 'none' : 'auto' }}
              >
                {isPrimary && <Star size={10} style={{ marginRight: 4, flexShrink: 0 }} fill="currentColor" />}
                {opt.label}
              </button>
              {isSecondary && isHov && (
                <button
                  onClick={e => { e.stopPropagation(); makePrimaryBeneficiary(opt.value) }}
                  onMouseEnter={() => setHoveredBeneficiary(opt.value)}
                  onMouseLeave={() => setHoveredBeneficiary(null)}
                  title="Make primary"
                  style={MAKE_PRIMARY_BTN}
                >
                  <Star size={9} fill="currentColor" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Summary */}
      {(impactSectors.length > 0 || beneficiaryGroups.length > 0) && (
        <div style={{ background: '#FAFAF7', padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 12, color: '#5F5E5A', fontFamily: 'var(--font-dm-sans)' }}>
          {impactSectors.length > 0 && (
            <span><strong style={{ color: '#2C2C2A', fontWeight: 500 }}>Sector:</strong> {IMPACT_SECTORS.find(o => o.value === impactSectors[0])?.label}{impactSectors.length > 1 ? ` + ${impactSectors.length - 1} more` : ''}</span>
          )}
          {impactSectors.length > 0 && beneficiaryGroups.length > 0 && <span style={{ margin: '0 8px', color: '#C9C5BC' }}>·</span>}
          {beneficiaryGroups.length > 0 && (
            <span><strong style={{ color: '#2C2C2A', fontWeight: 500 }}>For:</strong> {BENEFICIARY_GROUPS.find(o => o.value === beneficiaryGroups[0])?.label}{beneficiaryGroups.length > 1 ? ` + ${beneficiaryGroups.length - 1} more` : ''}</span>
          )}
        </div>
      )}

      <div style={ACTIONS}>
        <BackButton onClick={onBack} inline />
        <button
          onClick={onContinue}
          disabled={!canContinue}
          style={{ ...BTN_PRIMARY, opacity: canContinue ? 1 : 0.45, cursor: canContinue ? 'pointer' : 'not-allowed' }}
        >
          Continue <ArrowRight size={14} />
        </button>
      </div>
    </>
  )
}

/* ── Location step ── */

function StepLocation({ state, update, toggleFundingType, saving, saveError, canContinue, onBack, onFinish }: {
  state: WizardState
  update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void
  toggleFundingType: (t: FundingType) => void
  saving: boolean
  saveError: string | null
  canContinue: boolean
  onBack: () => void
  onFinish: () => void
}) {
  return (
    <>
      <BackButton onClick={onBack} />
      <h1 style={H1}>Location and funding</h1>
      <p style={SUBTITLE}>Last stretch. These help us filter out what isn&rsquo;t relevant to where and how you work.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 8 }}>

        {/* Name (if not set earlier) */}
        {!state.name.trim() && (
          <Field label="Organisation name" required>
            <input
              type="text"
              value={state.name}
              onChange={e => update('name', e.target.value)}
              placeholder="e.g. AudioActive"
              style={INPUT_STYLE}
            />
          </Field>
        )}

        {/* Legal structure (if not set earlier) */}
        {!state.legalStructure && (
          <Field label="Legal structure" required>
            <Select
              value={state.legalStructure}
              onChange={v => update('legalStructure', v as LegalStructure | '')}
              options={LEGAL_STRUCTURE_OPTIONS}
              placeholder="Select your structure…"
            />
          </Field>
        )}

        {/* Location row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Where are you based?" hint="For London orgs, include borough">
            <input
              type="text"
              value={state.primaryLocation}
              onChange={e => update('primaryLocation', e.target.value)}
              placeholder="e.g. Brighton, Sussex"
              style={INPUT_STYLE}
            />
          </Field>
          <Field label="Geographic reach">
            <Select
              value={state.geographicReach}
              onChange={v => update('geographicReach', v)}
              options={GEOGRAPHIC_REACH_OPTIONS}
              placeholder="Select reach…"
            />
          </Field>
        </div>

        {/* Grant size */}
        <Field label="Grant size range" hint="Optional - leave blank to see all">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8A8986', fontSize: 14 }}>£</span>
              <input
                type="text"
                inputMode="numeric"
                value={state.minGrantTarget ? Number(state.minGrantTarget.replace(/[^\d]/g, '') || '0').toLocaleString('en-GB') : ''}
                onChange={e => update('minGrantTarget', e.target.value.replace(/[^\d]/g, ''))}
                placeholder="10,000"
                style={{ ...INPUT_STYLE, paddingLeft: 24 }}
              />
            </div>
            <span style={{ color: '#8A8986', fontSize: 13, flexShrink: 0 }}>to</span>
            <div style={{ flex: 1, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8A8986', fontSize: 14 }}>£</span>
              <input
                type="text"
                inputMode="numeric"
                value={state.maxGrantTarget ? Number(state.maxGrantTarget.replace(/[^\d]/g, '') || '0').toLocaleString('en-GB') : ''}
                onChange={e => update('maxGrantTarget', e.target.value.replace(/[^\d]/g, ''))}
                placeholder="250,000"
                style={{ ...INPUT_STYLE, paddingLeft: 24 }}
              />
            </div>
          </div>
        </Field>

        {/* Funding types */}
        <Field label="Funding types you're open to" hint="You can adjust this per-search on the Find Funding page">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
            {FUNDING_TYPES.map(t => {
              const active = state.fundingTypes.includes(t.value)
              return (
                <button
                  key={t.value}
                  onClick={() => toggleFundingType(t.value)}
                  style={{
                    padding: '12px 14px',
                    textAlign: 'left',
                    background: active ? '#EAF3DE' : '#fff',
                    border: `${active ? '1.5px' : '0.5px'} solid ${active ? '#8ECB3C' : 'rgba(0,0,0,0.14)'}`,
                    borderRadius: 12,
                    cursor: 'pointer',
                    transition: 'all 120ms',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div>
                      <p style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 13, fontWeight: 600, color: active ? '#3B6D11' : '#2C2C2A', margin: 0 }}>{t.label}</p>
                      <p style={{ fontSize: 11, color: active ? '#3B6D11' : '#5F5E5A', opacity: active ? 0.85 : 1, margin: '2px 0 0', fontFamily: 'var(--font-dm-sans)' }}>{t.desc}</p>
                    </div>
                    {active && (
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#8ECB3C', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Check size={10} color="#173404" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </Field>
      </div>

      {saveError && (
        <div style={{ background: '#FAECE7', color: '#7A2A1A', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginTop: 12, marginBottom: 4 }}>
          {saveError}
        </div>
      )}

      <div style={{ ...ACTIONS, marginTop: 24 }}>
        <BackButton onClick={onBack} inline />
        <button
          onClick={onFinish}
          disabled={saving || !canContinue}
          style={{
            ...BTN_PRIMARY,
            background: '#8ECB3C',
            color: '#173404',
            opacity: (saving || !canContinue) ? 0.5 : 1,
            cursor: (saving || !canContinue) ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : 'Show me my matches'} {!saving && <ArrowRight size={14} />}
        </button>
      </div>
    </>
  )
}

/* ── Reveal step ── */

function StepReveal({ matchCount, topMatches, onExplore }: {
  matchCount: number | null
  topMatches: RevealMatch[] | null
  onExplore: () => void
}) {
  const loading = matchCount === null

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0' }}>
        <div style={{ fontSize: 13, color: '#5F5E5A', fontFamily: 'var(--font-dm-sans)', marginBottom: 6 }}>Finding your matches…</div>
        <LoadingDots />
      </div>
    )
  }

  if (matchCount === 0) {
    return (
      <>
        <div style={{ textAlign: 'center', padding: '24px 0 16px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🌱</div>
          <h1 style={{ ...H1, fontSize: 22 }}>Your profile is saved</h1>
          <p style={{ ...SUBTITLE, marginBottom: 0 }}>
            We&rsquo;ll email you when matching grants appear. In the meantime, you can browse the full catalogue.
          </p>
        </div>
        <div style={{ ...ACTIONS, justifyContent: 'center', marginTop: 24 }}>
          <button onClick={onExplore} style={{ ...BTN_PRIMARY, background: '#8ECB3C', color: '#173404', padding: '14px 28px', fontSize: 15 }}>
            Browse all grants <ArrowRight size={15} />
          </button>
        </div>
      </>
    )
  }

  const isFew = matchCount <= 5
  const countLabel = isFew ? `Your ${matchCount} best-fit matches` : `${matchCount} grants match your profile`

  return (
    <>
      {/* Hero number */}
      <div style={{ textAlign: 'center', padding: '8px 0 24px' }}>
        <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 60, fontWeight: 500, color: '#3B6D11', lineHeight: 1, marginBottom: 8 }}>
          {isFew ? matchCount : matchCount}
        </div>
        <div style={{ fontSize: 14, color: '#5F5E5A', fontFamily: 'var(--font-dm-sans)' }}>{countLabel}</div>
      </div>

      {/* Top 3 */}
      {topMatches && topMatches.length > 0 && (
        <>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#2C2C2A', fontFamily: 'var(--font-space-grotesk)', marginBottom: 10 }}>
            Your top {Math.min(topMatches.length, 3)} matches
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {topMatches.map(m => (
              <Link
                key={m.id}
                href={`/dashboard/grants/${m.id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px',
                  background: '#FAFAF7',
                  border: '0.5px solid rgba(0,0,0,0.06)',
                  borderRadius: 10,
                  textDecoration: 'none',
                  transition: 'background 120ms',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#F5F1E8')}
                onMouseLeave={e => (e.currentTarget.style.background = '#FAFAF7')}
              >
                {/* Score circle */}
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: '#EAF3DE',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 13, fontWeight: 700, color: '#3B6D11' }}>
                    {m.score}%
                  </span>
                </div>
                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#2C2C2A', marginBottom: 2, fontFamily: 'var(--font-space-grotesk)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#5F5E5A', fontFamily: 'var(--font-dm-sans)' }}>
                    {m.funderName}{m.isRolling ? ' · Rolling deadline' : m.deadline ? ` · Deadline ${formatDeadline(m.deadline)}` : ''}
                    {(m.minAmount || m.maxAmount) && ` · ${formatRange(m.minAmount, m.maxAmount)}`}
                  </div>
                </div>
                <ChevronRight size={14} style={{ color: '#C9C5BC', flexShrink: 0 }} />
              </Link>
            ))}
          </div>
        </>
      )}

      <div style={{ ...ACTIONS, justifyContent: 'center' }}>
        <button
          onClick={onExplore}
          style={{ ...BTN_PRIMARY, background: '#8ECB3C', color: '#173404', padding: '14px 28px', fontSize: 15 }}
        >
          Explore all {matchCount} matches <ArrowRight size={15} />
        </button>
      </div>
    </>
  )
}

/* ═══════════════════════════════════════════════
   Shared primitives
   ═══════════════════════════════════════════════ */

function BackButton({ onClick, inline }: { onClick: () => void; inline?: boolean }) {
  if (inline) {
    return (
      <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: '#5F5E5A', fontSize: 13, fontFamily: 'var(--font-space-grotesk)' }}>
        <ArrowLeft size={13} /> Back
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: '#5F5E5A', fontSize: 13, marginBottom: 20, fontFamily: 'var(--font-space-grotesk)', padding: '4px 8px 4px 0' }}
    >
      <ArrowLeft size={13} /> Back
    </button>
  )
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#2C2C2A', marginBottom: hint ? 2 : 6, fontFamily: 'var(--font-space-grotesk)' }}>
        {label}{required && <span style={{ color: '#D85A30', marginLeft: 2 }}>*</span>}
      </label>
      {hint && <p style={{ fontSize: 12, color: '#8A8986', fontFamily: 'var(--font-dm-sans)', margin: '0 0 6px', fontWeight: 400 }}>{hint}</p>}
      {children}
    </div>
  )
}

function Select({ value, onChange, options, placeholder }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder: string
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        ...INPUT_STYLE,
        appearance: 'none',
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%238A8986' stroke-width='1.5'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 14px center',
        paddingRight: 36,
        color: value ? '#2C2C2A' : '#8A8986',
      }}
    >
      <option value="" disabled>{placeholder}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function PickerSection({ label, hint, selected, style: extraStyle }: { label: string; hint: string; selected: unknown[]; style?: React.CSSProperties }) {
  return (
    <div style={{ marginBottom: 10, ...extraStyle }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: '#2C2C2A', fontFamily: 'var(--font-space-grotesk)' }}>{label}</span>
      <span style={{ fontSize: 12, color: '#8A8986', marginLeft: 6, fontFamily: 'var(--font-dm-sans)' }}>· {hint}</span>
      {selected.length > 0 && selected.length >= 4 && (
        <span style={{ fontSize: 11, color: '#8A8986', marginLeft: 8, fontFamily: 'var(--font-space-grotesk)' }}>Max reached</span>
      )}
    </div>
  )
}

function LoadingDots() {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 8 }}>
      {[0,1,2].map(i => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: '50%', background: '#8ECB3C',
          animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
      <style>{`@keyframes bounce { 0%,80%,100%{transform:scale(0.7);opacity:0.5} 40%{transform:scale(1.1);opacity:1} }`}</style>
    </div>
  )
}

function formatDeadline(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  } catch { return dateStr }
}

function formatRange(min: number | null, max: number | null): string {
  const fmt = (n: number) => {
    if (n >= 1_000_000) return `£${Math.round(n / 1_000_000)}m`
    if (n >= 1000)      return `£${Math.round(n / 1000)}k`
    return `£${n}`
  }
  if (min && max) return `${fmt(min)}–${fmt(max)}`
  if (min) return `From ${fmt(min)}`
  if (max) return `Up to ${fmt(max)}`
  return ''
}

function chipStyle(isPrimary: boolean, isSecondary: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '9px 11px',
    border: isPrimary
      ? '1.5px solid #173404'
      : isSecondary
        ? '1.5px solid #8ECB3C'
        : '0.5px solid rgba(0,0,0,0.14)',
    borderRadius: 8,
    background: isPrimary ? '#173404' : isSecondary ? '#EAF3DE' : '#fff',
    color: isPrimary ? '#fff' : isSecondary ? '#3B6D11' : '#2C2C2A',
    fontSize: 12,
    fontWeight: isPrimary || isSecondary ? 500 : 400,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 120ms',
    display: 'flex',
    alignItems: 'center',
    fontFamily: 'var(--font-dm-sans)',
    lineHeight: 1.3,
  }
}

/* ── Style constants ── */

const H1: React.CSSProperties = {
  fontFamily: 'var(--font-space-grotesk)',
  fontWeight: 500,
  fontSize: 26,
  color: '#2C2C2A',
  margin: '0 0 8px',
  lineHeight: 1.2,
  letterSpacing: '-0.01em',
}

const SUBTITLE: React.CSSProperties = {
  fontSize: 15,
  color: '#5F5E5A',
  margin: '0 0 24px',
  lineHeight: 1.5,
  fontFamily: 'var(--font-dm-sans)',
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  border: '0.5px solid rgba(0,0,0,0.14)',
  borderRadius: 10,
  fontFamily: 'var(--font-dm-sans)',
  fontSize: 14,
  color: '#2C2C2A',
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
}

const BTN_PRIMARY: React.CSSProperties = {
  fontFamily: 'var(--font-space-grotesk)',
  fontSize: 14,
  fontWeight: 500,
  padding: '11px 20px',
  borderRadius: 10,
  cursor: 'pointer',
  border: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  background: '#8ECB3C',
  color: '#173404',
  transition: 'opacity 120ms',
}

const ACTIONS: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: 28,
  paddingTop: 20,
  borderTop: '0.5px solid rgba(0,0,0,0.06)',
}

const SKIP_BTN: React.CSSProperties = {
  fontSize: 13,
  color: '#5F5E5A',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'var(--font-space-grotesk)',
  padding: '8px 0',
}

const PICKER_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 6,
  marginBottom: 16,
}

const MAKE_PRIMARY_BTN: React.CSSProperties = {
  position: 'absolute',
  top: -7,
  right: -7,
  width: 18,
  height: 18,
  borderRadius: '50%',
  background: '#173404',
  color: '#8ECB3C',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1,
}

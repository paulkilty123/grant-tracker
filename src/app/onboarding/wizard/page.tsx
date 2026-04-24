'use client'

import { useEffect, useState, useRef } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, ChevronRight, Check, Globe, Pencil, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getOrganisationByOwner, createOrganisation, updateOrganisation } from '@/lib/organisations'
import { computeMatchScore } from '@/lib/matching'
import { normaliseScrapedGrant } from '@/lib/grants-normalise'
import type { LegalStructure, ImpactSector, BeneficiaryGroup, FundingType } from '@/types'
import Button from '@/components/ui/Button'

/* ═══════════════════════════════════════════════
   Design tokens — 1:1 from reference HTML :root
   ═══════════════════════════════════════════════ */

const T = {
  lime:          '#8ECB3C',
  greenMid:      '#639922',
  greenDeep:     '#173404',
  greenTextDeep: '#3B6D11',
  greenSoft:     '#97C459',
  greenCream:    '#EAF3DE',
  cream1:        '#F5F1E8',
  creamHover:    '#EAE5D7',
  pageBg:        '#FAFAF7',
  amberMid:      '#BA7517',
  amberBgSoft:   '#FDFBF5',
  coralBg:       '#FAECE7',
  coralText:     '#993C1D',
  borderLight:   'rgba(0,0,0,0.06)',
  borderMid:     'rgba(0,0,0,0.1)',
  borderInput:   'rgba(0,0,0,0.14)',
  textPrimary:   '#2C2C2A',
  textSecondary: '#5F5E5A',
  textTertiary:  '#8A8986',
} as const

/* ═══════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════ */

const INCOME_BANDS = [
  'Under £10,000', '£10,000–£50,000', '£50,000–£100,000',
  '£100,000–£250,000', '£250,000–£500,000', '£500,000–£1 million',
  '£1 million–£5 million', 'Over £5 million',
]

const GEOGRAPHIC_REACH_OPTIONS = [
  { value: 'local',         label: 'Local only',              hint: 'One town, borough, or district' },
  { value: 'regional',      label: 'Regional + national',     hint: 'County, region, or UK-wide' },
  { value: 'national',      label: 'National only',           hint: 'UK-wide programmes' },
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
  { value: 'young_people',      label: 'Young people (16–25)' },
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

// Funding types: label + short desc only — NO per-type colours.
// The chip uses the same neutral→selected style as sector chips.
const FUNDING_TYPES: { value: FundingType; label: string; desc: string }[] = [
  { value: 'grant',      label: 'Grants & awards',           desc: 'Non-repayable cash funding' },
  { value: 'programme',  label: 'Programmes & accelerators', desc: 'Structured support + cash' },
  { value: 'investment', label: 'Social investment',         desc: 'Loans & repayable finance' },
  { value: 'in_kind',    label: 'In-kind support',           desc: 'Software, space, pro bono' },
]

/* ═══════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════ */

type WizardStep = 'entry' | 'review' | 'manual' | 'sectors' | 'beneficiaries' | 'location' | 'reveal'

const STEP_DOT_POS: Record<WizardStep, number> = {
  entry: 1, review: 2, manual: 2, sectors: 3, beneficiaries: 4, location: 5, reveal: 6,
}

type FieldConfidence = 'confident' | 'uncertain' | 'missing'

function fieldConf(c: number | undefined | null, hasValue = false): FieldConfidence {
  if (c == null || c < 0.4) return hasValue ? 'uncertain' : 'missing'
  if (c < 0.8)              return 'uncertain'
  return 'confident'
}

interface ExtractedData {
  url:               string
  name:              string | null
  legalStructure:    string | null
  primaryLocation:   string | null
  annualIncomeBand:  string | null
  mission:           string | null
  impactSectors:     ImpactSector[]
  beneficiaryGroups: BeneficiaryGroup[]
  confidence: {
    name?:              number
    legalStructure?:    number
    primaryLocation?:   number
    annualIncomeBand?:  number
    mission?:           number
    impactSectors?:     number
    beneficiaryGroups?: number
  }
}

interface RevealMatch {
  id:         string
  title:      string
  funderName: string
  score:      number
  minAmount:  number | null
  maxAmount:  number | null
  isRolling:  boolean
  deadline:   string | null
}

interface WizardState {
  name:             string
  legalStructure:   LegalStructure | ''
  primaryLocation:  string
  annualIncomeBand: string
  geographicReach:  string
  mission:          string
  impactSectors:    ImpactSector[]
  beneficiaryGroups: BeneficiaryGroup[]
  minGrantTarget:   string   // raw digit string, formatted on display
  maxGrantTarget:   string
  fundingTypes:     FundingType[]
  nicheTags:        string[]
}

const EMPTY_STATE: WizardState = {
  name: '', legalStructure: '', primaryLocation: '',
  annualIncomeBand: '', geographicReach: '', mission: '',
  impactSectors: [], beneficiaryGroups: [],
  minGrantTarget: '', maxGrantTarget: '',
  fundingTypes: ['grant', 'programme', 'investment', 'in_kind'],
  nicheTags: [],
}

/* ═══════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════ */

function legalStructureToOrgType(s: LegalStructure | '') {
  if (s === 'cic_guarantee' || s === 'cic_shares') return 'cic'
  if (s === 'registered_charity' || s === 'cio')    return 'registered_charity'
  if (s === 'unincorporated' || s === 'not_registered') return 'community_group'
  if (s === 'sole_trader') return 'other'
  return 'social_enterprise'
}

function formatDeadline(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  } catch { return dateStr }
}

/** £20k not £20000k, £2m not £2000k */
function formatAmount(min: number | null, max: number | null): string {
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

/** Format a raw digit string with thousand separators for display */
function fmtThousands(raw: string): string {
  const n = raw.replace(/[^\d]/g, '')
  return n ? Number(n).toLocaleString('en-GB') : ''
}

/* ═══════════════════════════════════════════════
   Shared UI primitives
   ═══════════════════════════════════════════════ */

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  border: `0.5px solid ${T.borderInput}`,
  borderRadius: 10,
  fontFamily: 'var(--font-dm-sans)',
  fontSize: 14,
  color: T.textPrimary,
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
}

const H1_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-space-grotesk)',
  fontWeight: 500,
  fontSize: 28,
  color: T.textPrimary,
  margin: '0 0 8px',
  lineHeight: 1.2,
  letterSpacing: '-0.01em',
}

const SUBTITLE_STYLE: React.CSSProperties = {
  fontSize: 15,
  color: T.textSecondary,
  margin: '0 0 28px',
  lineHeight: 1.5,
  fontFamily: 'var(--font-dm-sans)',
}

const ACTIONS_STYLE: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: 32,
  paddingTop: 20,
  borderTop: `0.5px solid ${T.borderLight}`,
}

function StepDots({ active, total = 6 }: { active: number; total?: number }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {Array.from({ length: total }, (_, i) => {
        const pos = i + 1
        return (
          <div key={i} style={{
            height: 6,
            width: pos === active ? 18 : 6,
            borderRadius: 999,
            background: pos < active ? T.greenSoft : pos === active ? T.greenMid : 'rgba(0,0,0,0.1)',
            transition: 'all 250ms ease',
          }} />
        )
      })}
    </div>
  )
}

function BackLink({ onClick }: { onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: hov ? T.textPrimary : T.textSecondary,
        fontSize: 13, fontFamily: 'var(--font-space-grotesk)',
        padding: '4px 8px 4px 0', marginBottom: 20,
      }}
    >
      <ArrowLeft size={12} /> Back
    </button>
  )
}

function SkipAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        fontSize: 13,
        color: hov ? T.textPrimary : T.textSecondary,
        background: 'transparent', border: 'none', cursor: 'pointer',
        fontFamily: 'var(--font-space-grotesk)', padding: '8px 0',
        textDecoration: hov ? 'underline' : 'none',
      }}
    >
      {children}
    </button>
  )
}

/**
 * Field wrapper — label, optional inline hint, children input, optional help text below.
 * The hint and help are separate elements so the asterisk never wraps near a select arrow.
 */
function Field({
  label, required, hint, help, children,
}: {
  label: string
  required?: boolean
  hint?: string      // short grey text on same line as label (e.g. "approximate band is fine")
  help?: string      // block help text below the input
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: T.textPrimary, fontFamily: 'var(--font-space-grotesk)' }}>
        {label}
        {required && <span style={{ color: T.coralText, marginLeft: 2 }}>*</span>}
        {hint && <span style={{ fontWeight: 400, color: T.textTertiary, fontSize: 12, marginLeft: 6 }}>{hint}</span>}
      </label>
      {children}
      {help && (
        <p style={{ fontSize: 12, color: T.textTertiary, margin: 0, lineHeight: 1.4, fontFamily: 'var(--font-dm-sans)' }}>
          {help}
        </p>
      )}
    </div>
  )
}

function SelectInput({
  value, onChange, options, placeholder,
}: {
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
        appearance: 'none' as const,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235F5E5A' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 14px center',
        paddingRight: 36,
        color: value ? T.textPrimary : T.textTertiary,
      }}
    >
      <option value="" disabled>{placeholder}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

/** Chip button — three states matching the HTML spec exactly */
function PickerChip({
  label, chipState, onClick, onMakePrimary, showMakePrimary, dimmed,
}: {
  label: string
  chipState: 'unselected' | 'secondary' | 'primary'
  onClick: () => void
  onMakePrimary?: () => void
  showMakePrimary?: boolean
  dimmed?: boolean
}) {
  const [hov, setHov] = useState(false)
  const isPrimary   = chipState === 'primary'
  const isSecondary = chipState === 'secondary'
  const showHover   = hov && !dimmed && chipState === 'unselected'

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => !dimmed && onClick()}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          width: '100%',
          padding: '9px 12px',
          border: `0.5px solid ${isPrimary ? T.greenDeep : isSecondary ? T.greenMid : showHover ? T.greenMid : T.borderInput}`,
          borderRadius: 8,
          background: isPrimary ? T.greenDeep : isSecondary || showHover ? T.greenCream : '#fff',
          color: isPrimary ? '#fff' : isSecondary || showHover ? T.greenTextDeep : T.textPrimary,
          fontSize: 12,
          fontWeight: isPrimary || isSecondary ? 500 : 400,
          cursor: dimmed ? 'default' : 'pointer',
          textAlign: 'center' as const,
          fontFamily: 'var(--font-dm-sans)',
          lineHeight: 1.3,
          transition: 'all 120ms ease',
          opacity: dimmed ? 0.38 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        }}
      >
        {isPrimary && <span style={{ color: T.lime, fontSize: 11 }}>★</span>}
        {label}
      </button>
      {showMakePrimary && isSecondary && hov && (
        <button
          onClick={e => { e.stopPropagation(); onMakePrimary?.() }}
          onMouseEnter={() => setHov(true)}
          onMouseLeave={() => setHov(false)}
          style={{
            position: 'absolute', top: -9, right: -2,
            padding: '2px 7px', borderRadius: 99,
            background: T.greenDeep, color: T.lime,
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 3, zIndex: 1, fontSize: 10, fontWeight: 600,
            fontFamily: 'var(--font-space-grotesk)',
            whiteSpace: 'nowrap' as const,
          }}
        >
          <span style={{ fontSize: 9 }}>★</span> Set as primary
        </button>
      )}
    </div>
  )
}

/** Card wrapper for steps 2–5 */
function CardShell({
  step, showSkip = true, children,
}: {
  step: number
  showSkip?: boolean
  children: React.ReactNode
}) {
  const isMobile = useIsMobile()
  return (
    <div className="flex-1 flex items-start justify-center px-4 py-8 md:py-12">
      <div className="w-full max-w-[720px]">
        <div style={{
          background: '#fff',
          border: `0.5px solid ${T.borderMid}`,
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
        }}>
          {/* Card header */}
          <div style={{ padding: isMobile ? '16px 20px 0' : '20px 32px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 20, color: T.textPrimary, letterSpacing: '-0.02em' }}>
              GrantTracker
            </span>
            <StepDots active={step} />
          </div>
          {/* Card body */}
          <div style={{ padding: isMobile ? '20px 18px 24px' : '28px 32px 32px' }}>
            {children}
          </div>
        </div>
        {showSkip && (
          <div style={{ textAlign: 'center', marginTop: 4 }}>
            <Link
              href="/dashboard/profile"
              style={{ fontSize: 13, color: T.textTertiary, fontFamily: 'var(--font-space-grotesk)', padding: '12px 16px', display: 'inline-block', textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.color = T.textSecondary)}
              onMouseLeave={e => (e.currentTarget.style.color = T.textTertiary)}
            >
              Skip setup for now
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

function LoadingDots() {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 8 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: '50%', background: T.lime,
          animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
      <style>{'@keyframes bounce{0%,80%,100%{transform:scale(0.7);opacity:0.5}40%{transform:scale(1.1);opacity:1}}'}</style>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Main component
   ═══════════════════════════════════════════════ */

export default function OnboardingWizardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isNewOrg = searchParams.get('new') === '1'
  const supabase = createClient()

  const [step, setStep]           = useState<WizardStep>('entry')
  const [state, setState]         = useState<WizardState>(EMPTY_STATE)
  const [extracted, setExtracted] = useState<ExtractedData | null>(null)
  const [userId, setUserId]       = useState('')
  const [orgId, setOrgId]         = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)

  const [url, setUrl]               = useState('')
  const [fetching, setFetching]     = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [confirmed, setConfirmed]       = useState<Set<string>>(new Set())
  const [editingField, setEditingField] = useState<string | null>(null)

  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [revealMatches, setRevealMatches] = useState<RevealMatch[] | null>(null)
  const [revealCount, setRevealCount]     = useState<number | null>(null)
  const matchFetchRef = useRef<Promise<void> | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUserId(user.id)
      const org = isNewOrg ? null : await getOrganisationByOwner(user.id)
      if (org) {
        setOrgId(org.id)
        setState({
          name:             org.name ?? '',
          legalStructure:   (org.legal_structure as LegalStructure) ?? '',
          primaryLocation:  org.primary_location ?? '',
          annualIncomeBand: org.annual_income_band ?? '',
          geographicReach:  org.geographic_reach ?? '',
          mission:          org.mission ?? '',
          impactSectors:    ((org.impact_sectors as ImpactSector[]) ?? []).slice(0, 4),
          beneficiaryGroups: (org.beneficiary_groups as BeneficiaryGroup[]) ?? [],
          // Store raw digits; fmtThousands() formats on display
          minGrantTarget:   org.min_grant_target != null ? String(org.min_grant_target) : '',
          maxGrantTarget:   org.max_grant_target != null ? String(org.max_grant_target) : '',
          fundingTypes:     (org.funding_type_preferences as FundingType[])?.length
                              ? (org.funding_type_preferences as FundingType[])
                              : ['grant', 'programme', 'investment', 'in_kind'],
          nicheTags:        (org.niche_tags as string[]) ?? [],
        })
      }
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function update<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setState(prev => ({ ...prev, [key]: value }))
  }

  async function handleAutoFill() {
    if (!url.trim()) return
    setFetching(true); setFetchError(null)
    try {
      const res  = await fetch('/api/org-autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Auto-fill failed')
      const conf = data._confidence ?? {}

      let derivedLegal: LegalStructure | '' = ''
      if (data.orgType === 'registered_charity')   derivedLegal = 'registered_charity'
      else if (data.orgType === 'cic')              derivedLegal = 'cic_guarantee'
      else if (data.orgType === 'social_enterprise') derivedLegal = 'ltd_guarantee'
      else if (data.orgType === 'community_group')  derivedLegal = 'unincorporated'

      const ext: ExtractedData = {
        url: url.trim(),
        name:              data.name ?? null,
        legalStructure:    derivedLegal || null,
        primaryLocation:   data.primaryLocation ?? null,
        annualIncomeBand:  data.annualIncome ?? null,
        mission:           data.mission ?? null,
        impactSectors:     Array.isArray(data.impactSectors) ? data.impactSectors.slice(0, 4) : [],
        beneficiaryGroups: Array.isArray(data.beneficiaryGroups) ? data.beneficiaryGroups.slice(0, 5) : [],
        confidence: {
          name:              conf.name,
          legalStructure:    conf.orgType,
          primaryLocation:   conf.primaryLocation,
          annualIncomeBand:  conf.annualIncome,
          mission:           conf.mission,
          impactSectors:     conf.impactSectors,
          beneficiaryGroups: conf.beneficiaryGroups,
        },
      }
      setExtracted(ext)
      setState(prev => ({
        ...prev,
        name:              ext.name ?? prev.name,
        legalStructure:    (ext.legalStructure as LegalStructure) ?? prev.legalStructure,
        primaryLocation:   ext.primaryLocation ?? prev.primaryLocation,
        annualIncomeBand:  ext.annualIncomeBand ?? prev.annualIncomeBand,
        mission:           ext.mission ?? prev.mission,
        impactSectors:     ext.impactSectors.length > 0 ? ext.impactSectors : prev.impactSectors,
        beneficiaryGroups: ext.beneficiaryGroups.length > 0 ? ext.beneficiaryGroups : prev.beneficiaryGroups,
      }))
      const autoConfirmed = new Set<string>()
      ;(Object.keys(conf) as Array<keyof ExtractedData['confidence']>).forEach(f => {
        if ((conf[f] ?? 0) >= 0.8) autoConfirmed.add(f)
      })
      setConfirmed(autoConfirmed)
      setStep('review')
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Auto-fill failed — please try again')
    } finally {
      setFetching(false)
    }
  }

  function reviewCanContinue(): boolean {
    if (!extracted) return true
    return Object.entries(extracted.confidence)
      .filter(([, c]) => fieldConf(c) === 'uncertain')
      .map(([k]) => k)
      .every(f => confirmed.has(f))
  }

  function confirmField(field: string, value?: string) {
    if (value !== undefined) {
      const key = field as keyof WizardState
      if (key in EMPTY_STATE) setState(prev => ({ ...prev, [key]: value }))
    }
    setConfirmed(prev => { const n = new Set(prev); n.add(field); return n })
    setEditingField(null)
  }

  function toggleSector(s: ImpactSector) {
    setState(prev => {
      const cur = [...prev.impactSectors]
      const idx = cur.indexOf(s)
      if (idx === -1) { if (cur.length >= 4) return prev; return { ...prev, impactSectors: [...cur, s] } }
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
      if (idx === -1) { if (cur.length >= 4) return prev; return { ...prev, beneficiaryGroups: [...cur, b] } }
      return { ...prev, beneficiaryGroups: cur.filter(x => x !== b) }
    })
  }
  function makePrimaryBeneficiary(b: BeneficiaryGroup) {
    setState(prev => ({ ...prev, beneficiaryGroups: [b, ...prev.beneficiaryGroups.filter(x => x !== b)] }))
  }
  function toggleNicheTag(tag: string) {
    setState(prev => {
      const cur = prev.nicheTags
      if (cur.includes(tag)) return { ...prev, nicheTags: cur.filter(x => x !== tag) }
      return { ...prev, nicheTags: [...cur, tag] }
    })
  }
  function toggleFundingType(t: FundingType) {
    setState(prev => ({
      ...prev,
      fundingTypes: prev.fundingTypes.includes(t)
        ? prev.fundingTypes.filter(x => x !== t)
        : [...prev.fundingTypes, t],
    }))
  }

  async function handleFinish() {
    setSaving(true); setSaveError(null)
    try {
      const today = new Date().toISOString().split('T')[0]
      const payload = {
        name:                         state.name.trim() || 'My Organisation',
        charity_number:               null,
        cic_number:                   null,
        org_type:                     legalStructureToOrgType(state.legalStructure) as 'cic' | 'registered_charity' | 'social_enterprise' | 'community_group' | 'other',
        legal_structure:              state.legalStructure || null,
        org_stage:                    null,
        social_mission_declared:      false,
        articles_restrict_profit:     false,
        also_individual_practitioner: false,
        impact_sectors:               state.impactSectors,
        beneficiary_groups:           state.beneficiaryGroups,
        niche_tags:                   state.nicheTags,
        annual_income_band:           state.annualIncomeBand || null,
        primary_location:             state.primaryLocation.trim() || null,
        geographic_reach:             state.geographicReach || null,
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
        has_asset_lock:               null,
        years_trading:                null,
        owner_id:                     userId,
        alerts_enabled:               true,
        alert_frequency:              'weekly',
        alert_min_score:              70,
        website_url:                  url.trim() ? (url.trim().startsWith('http') ? url.trim() : 'https://' + url.trim()) : null,
      }

      let currentOrgId = orgId
      if (orgId) {
        await updateOrganisation(orgId, payload)
      } else {
        const created = await createOrganisation(payload as Parameters<typeof createOrganisation>[0])
        currentOrgId = created.id
        setOrgId(created.id)
      }
      // Build org for matching directly — avoids read-after-write race condition
      const orgForMatching = { ...payload, id: currentOrgId ?? '', created_at: new Date().toISOString() }

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



          const scored = scraped
            .map(row => {
              const grant  = normaliseScrapedGrant(row as Record<string, unknown>)
              const result = computeMatchScore(grant, orgForMatching as Parameters<typeof computeMatchScore>[1])
              return { grant, score: result.score }
            })
            .filter(x => x.score >= 40 && (x.grant.fundingType === 'grant' || !x.grant.fundingType))
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
          setRevealCount(0)
          setRevealMatches([])
        }
      })()

      setStep('reveal')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save — please try again.')
    } finally {
      setSaving(false)
    }
  }

  const sectorsValid      = state.impactSectors.length > 0
  const beneficiariesValid = state.beneficiaryGroups.length > 0
  const locationValid = !!(state.name.trim() && state.legalStructure)

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p style={{ color: T.textTertiary, fontFamily: 'var(--font-space-grotesk)', fontSize: 14 }}>Loading…</p>
      </div>
    )
  }

  /* ── Step 1: full-page hero — no card ── */
  if (step === 'entry') {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 24px 40px',
        minHeight: 620,
        width: '100%',
        // Gradient per design spec (not in HTML .hero-page, but explicit in text requirements)
        background: '#fff',
      }}>
        {/* Top-right step dots */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: 60 }}>
          <StepDots active={1} />
        </div>

        {/* Hero content — upper-third anchor per text spec (HTML uses center) */}
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
          paddingTop: 80,
        }}>
          <StepEntry
            url={url}
            setUrl={setUrl}
            fetching={fetching}
            error={fetchError}
            onAutoFill={handleAutoFill}
            onManual={() => { setExtracted(null); setStep('manual') }}
          />
        </div>

        {/* Bottom skip */}
        <div style={{ textAlign: 'center' }}>
          <Link
            href="/dashboard/profile"
            style={{ fontSize: 13, color: T.textTertiary, fontFamily: 'var(--font-space-grotesk)', padding: '12px 16px', display: 'inline-block', textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.color = T.textSecondary)}
            onMouseLeave={e => (e.currentTarget.style.color = T.textTertiary)}
          >
            Skip setup for now
          </Link>
        </div>
      </div>
    )
  }

  /* ── Steps 2–5: card layout ── */
  const cardStep = STEP_DOT_POS[step]

  return (
    <CardShell step={cardStep} showSkip={step !== 'reveal'}>

      {step === 'review' && extracted && (
        <StepReview
          extracted={extracted}
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

      {step === 'manual' && (
        <StepManual
          state={state}
          update={update}
          onBack={() => setStep('entry')}
          onContinue={() => setStep('sectors')}
        />
      )}

      {step === 'sectors' && (
        <StepSectors
          impactSectors={state.impactSectors}
          nicheTags={state.nicheTags}
          toggleSector={toggleSector}
          makePrimarySector={makePrimarySector}
          toggleNicheTag={toggleNicheTag}
          onBack={() => setStep(extracted ? 'review' : 'manual')}
          onContinue={() => setStep('beneficiaries')}
          canContinue={sectorsValid}
        />
      )}

      {step === 'beneficiaries' && (
        <StepBeneficiaries
          beneficiaryGroups={state.beneficiaryGroups}
          toggleBeneficiary={toggleBeneficiary}
          makePrimaryBeneficiary={makePrimaryBeneficiary}
          onBack={() => setStep('sectors')}
          onContinue={() => setStep('location')}
          canContinue={beneficiariesValid}
        />
      )}

      {step === 'location' && (
        <StepLocation
          state={state}
          update={update}
          toggleFundingType={toggleFundingType}
          saving={saving}
          saveError={saveError}
          canContinue={locationValid}
          onBack={() => setStep('beneficiaries')}
          onFinish={handleFinish}
        />
      )}

      {step === 'reveal' && (
        <StepReveal
          matchCount={revealCount}
          topMatches={revealMatches}
          hasMission={!!state.mission.trim()}
          onExplore={() => router.push('/dashboard/profile')}
          onAddMission={() => router.push('/dashboard/profile?section=mission')}
        />
      )}

    </CardShell>
  )
}

/* ═══════════════════════════════════════════════
   Step 1 — Entry (rendered inside hero page)
   ═══════════════════════════════════════════════ */

function StepEntry({ url, setUrl, fetching, error, onAutoFill, onManual }: {
  url: string; setUrl: (v: string) => void
  fetching: boolean; error: string | null
  onAutoFill: () => void; onManual: () => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <>
      <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 40, fontWeight: 600, color: T.textPrimary, margin: '0 0 14px', lineHeight: 1.15, letterSpacing: '-0.02em' }}>
        Let&rsquo;s build your profile
      </h1>
      <p style={{ fontSize: 16, color: T.textSecondary, lineHeight: 1.5, margin: '0 0 36px', maxWidth: 460, fontFamily: 'var(--font-dm-sans)' }}>
        Drop in your website and we&rsquo;ll do the heavy lifting. You can review and refine everything in the next step.
      </p>

      {/* URL input + CTA */}
      <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 520 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Globe size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.textTertiary, pointerEvents: 'none' }} />
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !fetching && url.trim() && onAutoFill()}
            placeholder="https://yourorganisation.co.uk"
            style={{ ...INPUT_STYLE, fontSize: 15, padding: '14px 14px 14px 34px', boxSizing: 'border-box' }}
          />
        </div>
        <Button variant="primary" size="lg" onClick={onAutoFill} disabled={fetching}>
          {fetching ? 'Reading…' : 'Auto-fill profile'}
        </Button>
      </div>

      {error && <p style={{ fontSize: 13, color: T.coralText, marginTop: 8 }}>{error}</p>}

      {/* Manual alternative */}
      <div style={{ paddingTop: 24 }}>
        <button
          onClick={onManual}
          onMouseEnter={() => setHov(true)}
          onMouseLeave={() => setHov(false)}
          style={{
            background: 'transparent', border: 'none', color: hov ? T.textPrimary : T.textSecondary,
            fontFamily: 'var(--font-dm-sans)', fontSize: 13, cursor: 'pointer',
            textDecoration: 'underline',
            textDecorationColor: 'rgba(95,94,90,0.3)',
            textUnderlineOffset: 3,
            padding: '8px 12px',
          }}
        >
          No website? Fill in manually
        </button>
      </div>
    </>
  )
}

/* ═══════════════════════════════════════════════
   Step 2A — Review extracted data
   ═══════════════════════════════════════════════ */

function StepReview({ extracted, confirmed, editingField, setEditingField, confirmField, canContinue, onBack, onSkip, onContinue }: {
  extracted: ExtractedData
  confirmed: Set<string>
  editingField: string | null
  setEditingField: (f: string | null) => void
  confirmField: (field: string, value?: string) => void
  canContinue: boolean
  onBack: () => void; onSkip: () => void; onContinue: () => void
}) {
  const hostname = (() => {
    try { return new URL(extracted.url.startsWith('http') ? extracted.url : `https://${extracted.url}`).hostname }
    catch { return extracted.url }
  })()

  const fields: Array<{
    key: keyof typeof extracted.confidence
    label: string; value: string | null
    stateKey?: string; type?: 'text' | 'select'
    options?: { value: string; label: string }[]
  }> = [
    { key: 'name',              label: 'Organisation name', value: extracted.name,            stateKey: 'name',            type: 'text' },
    { key: 'legalStructure',    label: 'Legal structure',   value: LEGAL_STRUCTURE_OPTIONS.find(o => o.value === extracted.legalStructure)?.label ?? extracted.legalStructure, stateKey: 'legalStructure', type: 'select', options: LEGAL_STRUCTURE_OPTIONS },
    { key: 'primaryLocation',   label: 'Primary location',  value: extracted.primaryLocation,  stateKey: 'primaryLocation', type: 'text' },
    { key: 'impactSectors',     label: 'Primary sector',    value: extracted.impactSectors.slice(0,2).map(s => IMPACT_SECTORS.find(o => o.value === s)?.label ?? s).join(' · ') || null },
    { key: 'beneficiaryGroups', label: 'Who you serve',     value: extracted.beneficiaryGroups.slice(0,2).map(b => BENEFICIARY_GROUPS.find(o => o.value === b)?.label ?? b).join(' · ') || null },
    { key: 'annualIncomeBand',  label: 'Annual income',     value: extracted.annualIncomeBand, stateKey: 'annualIncomeBand', type: 'select', options: INCOME_BANDS.map(b => ({ value: b, label: b })) },
  ]
  const foundCount = fields.filter(f => f.value).length

  return (
    <>
      <BackLink onClick={onBack} />
      <h1 style={H1_STYLE}>Here&rsquo;s what we found</h1>
      <p style={SUBTITLE_STYLE}>Review and tweak what&rsquo;s not quite right. We&rsquo;re confident about the green ones.</p>

      {/* Extract summary */}
      <div style={{ background: T.cream1, borderRadius: 10, padding: '14px 18px', marginBottom: 20, fontSize: 13, color: T.textPrimary, fontFamily: 'var(--font-dm-sans)', lineHeight: 1.5 }}>
        <strong style={{ fontWeight: 500 }}>We found {foundCount} of {fields.length} fields</strong> from <span style={{ color: T.textSecondary }}>{hostname}</span>
        {foundCount < fields.length && `. ${fields.length - foundCount} couldn't be inferred — you'll add ${fields.length - foundCount === 1 ? 'it' : 'them'} in a moment.`}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {fields.map(field => (
          <ReviewField
            key={field.key}
            label={field.label}
            value={field.value}
            fieldState={fieldConf(extracted.confidence[field.key], !!field.value)}
            isConfirmed={confirmed.has(field.key)}
            isEditing={editingField === field.key}
            type={field.type}
            options={field.options}
            onEdit={() => setEditingField(field.key)}
            onConfirm={val => confirmField(field.key, val)}
            onCancel={() => setEditingField(null)}
          />
        ))}
      </div>

      <div style={ACTIONS_STYLE}>
        <SkipAction onClick={onSkip}>I&rsquo;ll refine these later</SkipAction>
        <Button variant="primary" onClick={onContinue} disabled={!canContinue}>
          Continue <ArrowRight size={14} />
        </Button>
      </div>
    </>
  )
}

function ReviewField({ label, value, fieldState: fState, isConfirmed, isEditing, type, options, onEdit, onConfirm, onCancel }: {
  label: string; value: string | null
  fieldState: FieldConfidence; isConfirmed: boolean; isEditing: boolean
  type?: 'text' | 'select'; options?: { value: string; label: string }[]
  onEdit: () => void; onConfirm: (val?: string) => void; onCancel: () => void
}) {
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => { setDraft(value ?? '') }, [value])

  const effective = isConfirmed && fState !== 'confident' ? 'confident' : fState

  const bg = effective === 'confident' ? T.greenCream
           : effective === 'uncertain' ? T.amberBgSoft : T.pageBg
  const borderColor = effective === 'confident' ? 'rgba(99,153,34,0.2)'
                    : effective === 'uncertain' ? 'rgba(186,117,23,0.2)' : T.borderLight
  const borderStyle = fState === 'missing' && !isConfirmed ? 'dashed' : 'solid'

  const iconBg  = effective === 'confident' ? T.greenMid
                : effective === 'uncertain' ? T.amberMid : 'transparent'
  const iconChar = effective === 'confident' ? '✓' : effective === 'uncertain' ? '?' : '+'
  const iconColor = (fState === 'missing' && !isConfirmed) ? T.textTertiary : '#fff'

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', background: bg, borderRadius: 10, border: `0.5px ${borderStyle} ${borderColor}`, transition: 'background 120ms ease' }}>
      {/* State icon */}
      <div style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
        background: iconBg,
        border: fState === 'missing' && !isConfirmed ? `1px dashed ${T.textTertiary}` : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, color: iconColor, fontWeight: 600,
      }}>
        {iconChar}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: T.textTertiary, textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 2, fontFamily: 'var(--font-space-grotesk)' }}>
          {label}
          {fState === 'uncertain' && !isConfirmed && <span style={{ marginLeft: 6, color: T.amberMid }}> · please confirm</span>}
        </div>
        {isEditing && type ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
            {type === 'select' && options ? (
              <select
                value={draft}
                onChange={e => setDraft(e.target.value)}
                autoFocus
                style={{
                  ...INPUT_STYLE, flex: 1, fontSize: 13, padding: '6px 32px 6px 10px',
                  appearance: 'none' as const,
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235F5E5A' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
                }}
              >
                <option value="">Select…</option>
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input type="text" value={draft} onChange={e => setDraft(e.target.value)} autoFocus style={{ ...INPUT_STYLE, flex: 1, fontSize: 13, padding: '6px 10px' }} />
            )}
            <Button variant="primary" size="sm" onClick={() => onConfirm(draft)}>
              <Check size={11} /> Save
            </Button>
            <button onClick={onCancel} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: T.textTertiary, padding: '4px' }}>
              <X size={14} />
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 14, color: value ? T.textPrimary : T.textTertiary, fontWeight: value ? 500 : 400, fontStyle: value ? 'normal' : 'italic', fontFamily: 'var(--font-dm-sans)' }}>
            {value ?? "We couldn't find this — add manually"}
          </div>
        )}
      </div>

      {/* Edit / confirm actions */}
      {!isEditing && !type && fState === 'uncertain' && !isConfirmed && (
        <button onClick={() => onConfirm()} style={{ fontSize: 11, color: T.amberMid, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-space-grotesk)', padding: '2px 8px', whiteSpace: 'nowrap' as const, flexShrink: 0, alignSelf: 'flex-start', marginTop: 1 }}>Looks right ✓</button>
      )}
      {!isEditing && type && (
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginTop: 1 }}>
          {fState === 'uncertain' && !isConfirmed && (
            <button onClick={() => onConfirm()} style={{ fontSize: 11, color: T.amberMid, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-space-grotesk)', padding: '2px 8px', whiteSpace: 'nowrap' as const }}>
              Looks right ✓
            </button>
          )}
          <button onClick={onEdit} style={{ fontSize: 11, color: T.textTertiary, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-space-grotesk)', padding: '2px 8px' }}>
            <Pencil size={11} />
          </button>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Step 2B — Manual entry
   ═══════════════════════════════════════════════ */

function StepManual({ state, update, onBack, onContinue }: {
  state: WizardState
  update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void
  onBack: () => void; onContinue: () => void
}) {
  const valid = !!(state.name.trim() && state.legalStructure)
  return (
    <>
      <BackLink onClick={onBack} />
      <h1 style={H1_STYLE}>Tell us about your organisation</h1>
      <p style={SUBTITLE_STYLE}>We use this to check eligibility on the funders we match you with.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 24 }}>
        <Field label="What are you called?" required>
          <input type="text" value={state.name} onChange={e => update('name', e.target.value)} placeholder="e.g. AudioActive" style={INPUT_STYLE} />
        </Field>

        <Field label="What kind of organisation are you?" required help="Drives which funders you're eligible for.">
          <SelectInput value={state.legalStructure} onChange={v => update('legalStructure', v as LegalStructure | '')} options={LEGAL_STRUCTURE_OPTIONS} placeholder="Select your legal structure…" />
        </Field>

        <Field label="Annual income" hint="approximate band is fine" help="Many funders have income caps — we use this to filter those out.">
          <SelectInput value={state.annualIncomeBand} onChange={v => update('annualIncomeBand', v)} options={INCOME_BANDS.map(b => ({ value: b, label: b }))} placeholder="Select a band…" />
        </Field>
      </div>

      <div style={ACTIONS_STYLE}>
        <SkipAction onClick={onBack}>← Back</SkipAction>
        <Button variant="primary" onClick={onContinue} disabled={!valid}>
          Continue <ArrowRight size={14} />
        </Button>
      </div>
    </>
  )
}

/* ═══════════════════════════════════════════════
   Sub-tags by sector (Step 3a)
   ═══════════════════════════════════════════════ */

const NICHE_TAGS_BY_SECTOR: Partial<Record<ImpactSector, { value: string; label: string }[]>> = {
  creative: [
    { value: 'music',           label: 'Music' },
    { value: 'theatre',         label: 'Theatre & Drama' },
    { value: 'dance',           label: 'Dance' },
    { value: 'visual_arts',     label: 'Visual Arts' },
    { value: 'film_media',      label: 'Film & Media' },
    { value: 'literature',      label: 'Literature & Writing' },
    { value: 'crafts',          label: 'Crafts & Making' },
    { value: 'circus_street',   label: 'Circus & Street Arts' },
  ],
  sport: [
    { value: 'football',        label: 'Football' },
    { value: 'cricket',         label: 'Cricket' },
    { value: 'rugby',           label: 'Rugby' },
    { value: 'basketball',      label: 'Basketball' },
    { value: 'swimming',        label: 'Swimming' },
    { value: 'athletics',       label: 'Athletics' },
    { value: 'tennis',          label: 'Tennis' },
    { value: 'cycling',         label: 'Cycling' },
    { value: 'martial_arts',    label: 'Martial Arts & Boxing' },
    { value: 'disability_sport',label: 'Disability Sport' },
    { value: 'women_in_sport',  label: 'Women in Sport' },
  ],
  heritage: [
    { value: 'built_heritage',      label: 'Historic Buildings' },
    { value: 'industrial_heritage', label: 'Industrial Heritage' },
    { value: 'natural_heritage',    label: 'Natural Heritage' },
    { value: 'museums_archives',    label: 'Museums & Archives' },
  ],
  environment: [
    { value: 'climate',          label: 'Climate & Net Zero' },
    { value: 'biodiversity',     label: 'Biodiversity & Wildlife' },
    { value: 'urban_greening',   label: 'Urban Greening' },
    { value: 'marine',           label: 'Marine & Coastal' },
    { value: 'energy',           label: 'Renewable Energy' },
    { value: 'circular_economy', label: 'Circular Economy & Zero Waste' },
  ],
  social_economy: [
    { value: 'worker_cooperative',  label: 'Worker Co-operative' },
    { value: 'community_shares',    label: 'Community Shares' },
    { value: 'social_franchise',    label: 'Social Franchise' },
    { value: 'community_ownership', label: 'Community Ownership' },
  ],
  social_innovation: [
    { value: 'tech_for_good',      label: 'Tech for Good' },
    { value: 'impact_measurement', label: 'Impact Measurement' },
    { value: 'systems_change',     label: 'Systems Change' },
  ],
  education: [
    { value: 'early_years',       label: 'Early Years' },
    { value: 'stem',              label: 'STEM' },
    { value: 'literacy_numeracy', label: 'Literacy & Numeracy' },
    { value: 'higher_education',  label: 'Higher Education' },
    { value: 'vocational',        label: 'Vocational & Apprenticeships' },
    { value: 'digital_literacy',  label: 'Digital Literacy' },
  ],
}

/* ═══════════════════════════════════════════════
   Step 3a — Sectors + sub-tags
   ═══════════════════════════════════════════════ */

function StepSectors({ impactSectors, nicheTags, toggleSector, makePrimarySector, toggleNicheTag, onBack, onContinue, canContinue }: {
  impactSectors: ImpactSector[]
  nicheTags: string[]
  toggleSector: (s: ImpactSector) => void
  makePrimarySector: (s: ImpactSector) => void
  toggleNicheTag: (tag: string) => void
  onBack: () => void; onContinue: () => void; canContinue: boolean
}) {
  const sectorMax = impactSectors.length >= 4

  function chipStateFor(arr: string[], val: string): 'unselected' | 'secondary' | 'primary' {
    const idx = arr.indexOf(val)
    if (idx === 0) return 'primary'
    if (idx > 0)   return 'secondary'
    return 'unselected'
  }

  // Which sectors have sub-tags and are currently selected
  const nicheSectors = impactSectors.filter(s => NICHE_TAGS_BY_SECTOR[s])

  return (
    <>
      <BackLink onClick={onBack} />
      <h1 style={H1_STYLE}>What do you focus on?</h1>
      <p style={SUBTITLE_STYLE}>Pick your primary focus first — that&rsquo;s what we&rsquo;ll weight most in matching.</p>

      {/* Impact sectors */}
      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: T.textPrimary, fontFamily: 'var(--font-space-grotesk)' }}>Your impact sector</span>
        <span style={{ fontSize: 13, color: T.textTertiary, marginLeft: 6, fontFamily: 'var(--font-dm-sans)' }}>· pick 1 primary + up to 3 others</span>
        {sectorMax && <span style={{ fontSize: 11, color: T.textTertiary, marginLeft: 8, fontFamily: 'var(--font-space-grotesk)' }}>Max reached</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 20 }}>
        {IMPACT_SECTORS.map(opt => {
          const cs = chipStateFor(impactSectors, opt.value)
          return (
            <PickerChip
              key={opt.value}
              label={opt.label}
              chipState={cs}
              dimmed={sectorMax && cs === 'unselected'}
              onClick={() => toggleSector(opt.value)}
              showMakePrimary={cs === 'secondary'}
              onMakePrimary={() => makePrimarySector(opt.value)}
            />
          )
        })}
      </div>

      {/* Sub-tag panel — shown when any selected sector has sub-tags */}
      {nicheSectors.length > 0 && (
        <div style={{
          background: '#F5F1E8',
          borderLeft: '3px solid #8ECB3C',
          borderRadius: 8,
          padding: '12px 14px',
          marginBottom: 20,
        }}>
          {nicheSectors.map(sector => {
            const opts = NICHE_TAGS_BY_SECTOR[sector]!
            const label = IMPACT_SECTORS.find(o => o.value === sector)?.label ?? sector
            return (
              <div key={sector} style={{ marginBottom: nicheSectors.indexOf(sector) < nicheSectors.length - 1 ? 14 : 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.textSecondary, fontFamily: 'var(--font-space-grotesk)', marginBottom: 8, letterSpacing: '0.03em' }}>
                  Specialisms in {label} <span style={{ fontWeight: 400, color: T.textTertiary }}>(optional)</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                  {opts.map(opt => {
                    const selected = nicheTags.includes(opt.value)
                    return (
                      <button
                        key={opt.value}
                        onClick={() => toggleNicheTag(opt.value)}
                        style={{
                          fontSize: 11,
                          fontFamily: 'var(--font-dm-sans)',
                          padding: '5px 8px',
                          borderRadius: 6,
                          border: selected ? '1.5px solid #8ECB3C' : '1.5px solid #D9D4C7',
                          background: selected ? '#EEF8D8' : '#FEFCF8',
                          color: selected ? '#3A6B0E' : T.textSecondary,
                          cursor: 'pointer',
                          fontWeight: selected ? 600 : 400,
                          transition: 'all 0.12s',
                          textAlign: 'left' as const,
                          lineHeight: 1.3,
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={ACTIONS_STYLE}>
        <BackLink onClick={onBack} />
        <Button variant="primary" onClick={onContinue} disabled={!canContinue}>
          Continue <ArrowRight size={14} />
        </Button>
      </div>
    </>
  )
}

/* ═══════════════════════════════════════════════
   Step 3b — Beneficiaries
   ═══════════════════════════════════════════════ */

function StepBeneficiaries({ beneficiaryGroups, toggleBeneficiary, makePrimaryBeneficiary, onBack, onContinue, canContinue }: {
  beneficiaryGroups: BeneficiaryGroup[]
  toggleBeneficiary: (b: BeneficiaryGroup) => void
  makePrimaryBeneficiary: (b: BeneficiaryGroup) => void
  onBack: () => void; onContinue: () => void; canContinue: boolean
}) {
  const beneficiaryMax = beneficiaryGroups.length >= 4

  function chipStateFor(arr: string[], val: string): 'unselected' | 'secondary' | 'primary' {
    const idx = arr.indexOf(val)
    if (idx === 0) return 'primary'
    if (idx > 0)   return 'secondary'
    return 'unselected'
  }

  return (
    <>
      <BackLink onClick={onBack} />
      <h1 style={H1_STYLE}>Who do you serve?</h1>
      <p style={SUBTITLE_STYLE}>Pick your primary beneficiary group first — we&rsquo;ll weight it most in matching.</p>

      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: T.textPrimary, fontFamily: 'var(--font-space-grotesk)' }}>Who you serve</span>
        <span style={{ fontSize: 13, color: T.textTertiary, marginLeft: 6, fontFamily: 'var(--font-dm-sans)' }}>· pick 1 primary + up to 3 others</span>
        {beneficiaryMax && <span style={{ fontSize: 11, color: T.textTertiary, marginLeft: 8, fontFamily: 'var(--font-space-grotesk)' }}>Max reached</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 16 }}>
        {BENEFICIARY_GROUPS.map(opt => {
          const cs = chipStateFor(beneficiaryGroups, opt.value)
          return (
            <PickerChip
              key={opt.value}
              label={opt.label}
              chipState={cs}
              dimmed={beneficiaryMax && cs === 'unselected'}
              onClick={() => toggleBeneficiary(opt.value)}
              showMakePrimary={cs === 'secondary'}
              onMakePrimary={() => makePrimaryBeneficiary(opt.value)}
            />
          )
        })}
      </div>

      {beneficiaryGroups.length > 0 && (
        <div style={{ background: T.pageBg, padding: '12px 14px', borderRadius: 10, marginBottom: 16, fontSize: 12, color: T.textSecondary, fontFamily: 'var(--font-dm-sans)' }}>
          <strong style={{ color: T.textPrimary, fontWeight: 500 }}>For:</strong>{'  '}
          {BENEFICIARY_GROUPS.find(o => o.value === beneficiaryGroups[0])?.label}
          {beneficiaryGroups.length > 1 && ` + ${beneficiaryGroups.length - 1} more`}
        </div>
      )}

      <div style={ACTIONS_STYLE}>
        <BackLink onClick={onBack} />
        <Button variant="primary" onClick={onContinue} disabled={!canContinue}>
          Continue <ArrowRight size={14} />
        </Button>
      </div>
    </>
  )
}

/* ═══════════════════════════════════════════════
   Step 4 — Location, size, funding types
   ═══════════════════════════════════════════════ */

function StepLocation({ state, update, toggleFundingType, saving, saveError, canContinue, onBack, onFinish }: {
  state: WizardState
  update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void
  toggleFundingType: (t: FundingType) => void
  saving: boolean; saveError: string | null; canContinue: boolean
  onBack: () => void; onFinish: () => void
}) {
  return (
    <>
      <BackLink onClick={onBack} />
      <h1 style={H1_STYLE}>Location and funding</h1>
      <p style={SUBTITLE_STYLE}>Last stretch. These help us filter out what isn&rsquo;t relevant to where and how you work.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 8 }}>

        {/* Only show name/structure if not already captured */}
        {!state.name.trim() && (
          <Field label="Organisation name" required>
            <input type="text" value={state.name} onChange={e => update('name', e.target.value)} placeholder="e.g. AudioActive" style={INPUT_STYLE} />
          </Field>
        )}
        {!state.legalStructure && (
          <Field label="Legal structure" required>
            <SelectInput value={state.legalStructure} onChange={v => update('legalStructure', v as LegalStructure | '')} options={LEGAL_STRUCTURE_OPTIONS} placeholder="Select your structure…" />
          </Field>
        )}

        {/* Location row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Where are you based?" help='For London orgs, include borough — e.g. "Hackney, London"'>
            <input type="text" value={state.primaryLocation} onChange={e => update('primaryLocation', e.target.value)} placeholder="e.g. Brighton, Sussex" style={INPUT_STYLE} />
          </Field>
          <Field label="Geographic reach" help="We'll score local grants highest if you're place-based.">
            <SelectInput value={state.geographicReach} onChange={v => update('geographicReach', v)} options={GEOGRAPHIC_REACH_OPTIONS} placeholder="Select reach…" />
          </Field>
        </div>

        {/* Grant size — thousand-separator formatting on display */}
        <Field label="Grant size range" hint="optional — leave blank to see all" help="The most important field for size matching — grants outside this range will score lower.">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.textTertiary, fontSize: 14, pointerEvents: 'none' }}>£</span>
              <input
                type="text" inputMode="numeric"
                value={fmtThousands(state.minGrantTarget)}
                onChange={e => update('minGrantTarget', e.target.value.replace(/[^\d]/g, ''))}
                placeholder="10,000"
                style={{ ...INPUT_STYLE, paddingLeft: 24 }}
              />
            </div>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.textTertiary, fontSize: 14, pointerEvents: 'none' }}>£</span>
              <input
                type="text" inputMode="numeric"
                value={fmtThousands(state.maxGrantTarget)}
                onChange={e => update('maxGrantTarget', e.target.value.replace(/[^\d]/g, ''))}
                placeholder="250,000"
                style={{ ...INPUT_STYLE, paddingLeft: 24 }}
              />
            </div>
          </div>
        </Field>

        {/* Funding types — neutral picker-chips, same style as sector chips */}
        <Field label="Funding types you're open to" help="You can adjust this per-search later on the Find Funding page.">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
            {FUNDING_TYPES.map(t => {
              const active = state.fundingTypes.includes(t.value)
              return <FundingTypeChip key={t.value} label={t.label} desc={t.desc} active={active} onClick={() => toggleFundingType(t.value)} />
            })}
          </div>
        </Field>
      </div>

      {saveError && (
        <div style={{ background: T.coralBg, color: T.coralText, padding: '10px 14px', borderRadius: 10, fontSize: 13, marginTop: 8, marginBottom: 4, fontFamily: 'var(--font-dm-sans)' }}>
          {saveError}
        </div>
      )}

      <div style={{ ...ACTIONS_STYLE, marginTop: 24 }}>
        <BackLink onClick={onBack} />
        <Button variant="primary" onClick={onFinish} disabled={saving || !canContinue}>
          {saving ? 'Saving…' : <><span>Show me my matches</span> <ArrowRight size={14} /></>}
        </Button>
      </div>
    </>
  )
}

/** Funding type chip — neutral selector, same visual logic as PickerChip secondary state */
function FundingTypeChip({ label, desc, active, onClick }: { label: string; desc: string; active: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '10px 12px',
        textAlign: 'left' as const,
        background: active || hov ? T.greenCream : '#fff',
        border: `${active ? '1.5px' : '0.5px'} solid ${active || hov ? T.greenMid : T.borderInput}`,
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'all 120ms ease',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8,
      }}
    >
      <div>
        <p style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 12, fontWeight: 500, color: active ? T.greenTextDeep : T.textPrimary, margin: 0 }}>{label}</p>
        <p style={{ fontSize: 11, color: active ? T.greenTextDeep : T.textSecondary, margin: '2px 0 0', fontFamily: 'var(--font-dm-sans)', opacity: 0.85 }}>{desc}</p>
      </div>
      {active && (
        <div style={{ width: 16, height: 16, borderRadius: '50%', background: T.lime, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
          <Check size={9} color={T.greenDeep} strokeWidth={3} />
        </div>
      )}
    </button>
  )
}

/* ═══════════════════════════════════════════════
   Step 5 — The reveal
   ═══════════════════════════════════════════════ */

function StepReveal({ matchCount, topMatches, hasMission, onExplore, onAddMission }: {
  matchCount: number | null; topMatches: RevealMatch[] | null
  hasMission: boolean; onExplore: () => void; onAddMission: () => void
}) {
  if (matchCount === null) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0' }}>
        <div style={{ fontSize: 13, color: T.textSecondary, fontFamily: 'var(--font-dm-sans)', marginBottom: 8 }}>Finding your matches…</div>
        <LoadingDots />
      </div>
    )
  }

  if (matchCount === 0) {
    return (
      <>
        <div style={{ textAlign: 'center', padding: '24px 0 16px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🌱</div>
          <h1 style={{ ...H1_STYLE, fontSize: 22 }}>Your profile is saved</h1>
          <p style={{ ...SUBTITLE_STYLE, marginBottom: 0 }}>
            We&rsquo;ll email you when matching grants appear. In the meantime, browse the full catalogue.
          </p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
          <Button variant="primary" size="lg" onClick={onExplore}>Browse all grants <ArrowRight size={15} /></Button>
        </div>
      </>
    )
  }

  return (
    <>
      {/* Hero headline */}
      <div style={{ textAlign: 'center', padding: '16px 0 8px', marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 40, fontWeight: 500, color: T.greenTextDeep, lineHeight: 1.1, marginBottom: 8 }}>
          Your matches are ready
        </div>
        <div style={{ fontSize: 14, color: T.textSecondary, fontFamily: 'var(--font-dm-sans)' }}>
          Here are your strongest fits — explore the full list to find more.
        </div>
      </div>

      {/* Top 3 matches */}
      {topMatches && topMatches.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 500, color: T.textPrimary, fontFamily: 'var(--font-space-grotesk)', marginBottom: 10 }}>
            Your top {Math.min(topMatches.length, 3)} matches
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {topMatches.map(m => (
              <Link
                key={m.id}
                href="/dashboard/profile"
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: T.pageBg, border: `0.5px solid ${T.borderLight}`, borderRadius: 10, textDecoration: 'none', cursor: 'pointer', transition: 'background 120ms ease' }}
                onMouseEnter={e => (e.currentTarget.style.background = T.cream1)}
                onMouseLeave={e => (e.currentTarget.style.background = T.pageBg)}
              >
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: T.greenCream, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 13, fontWeight: 600, color: T.greenTextDeep }}>{m.score}%</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: T.textPrimary, marginBottom: 2, fontFamily: 'var(--font-space-grotesk)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.title}
                  </div>
                  <div style={{ fontSize: 12, color: T.textSecondary, fontFamily: 'var(--font-dm-sans)' }}>
                    {m.funderName}
                    {m.isRolling ? ' · Rolling deadline' : m.deadline ? ` · Deadline ${formatDeadline(m.deadline)}` : ''}
                    {(m.minAmount || m.maxAmount) && ` · ${formatAmount(m.minAmount, m.maxAmount)}`}
                  </div>
                </div>
                <ChevronRight size={14} style={{ color: T.textTertiary, flexShrink: 0 }} />
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Nudge card — shown when mission is not set (from HTML spec) */}
      {!hasMission && (
        <NudgeCard
          title="Add a mission statement to improve matching"
          subtitle="Takes 2 minutes, can unlock 10–15 more precise matches"
          onAction={onAddMission}
          actionLabel="Add now"
        />
      )}

      {/* CTA */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
        <Button variant="primary" size="lg" onClick={onExplore}>
          Explore your matches <ArrowRight size={15} />
        </Button>
      </div>
    </>
  )
}

function NudgeCard({ title, subtitle, onAction, actionLabel }: { title: string; subtitle: string; onAction: () => void; actionLabel: string }) {
  const [hov, setHov] = useState(false)
  return (
    <div style={{ marginBottom: 8, padding: '16px 18px', background: T.cream1, borderRadius: 10, borderLeft: `3px solid ${T.lime}`, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ flexShrink: 0, width: 24, height: 24, background: T.greenDeep, color: T.lime, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>+</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: T.textPrimary, marginBottom: 2, fontFamily: 'var(--font-space-grotesk)' }}>{title}</div>
        <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.4, fontFamily: 'var(--font-dm-sans)' }}>{subtitle}</div>
      </div>
      <button
        onClick={onAction}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{ background: hov ? '#fff' : 'transparent', border: `0.5px solid ${T.borderInput}`, padding: '6px 12px', borderRadius: 8, fontSize: 12, fontFamily: 'var(--font-space-grotesk)', color: T.textPrimary, cursor: 'pointer', alignSelf: 'center', fontWeight: 500, whiteSpace: 'nowrap' as const, transition: 'background 120ms ease' }}
      >
        {actionLabel}
      </button>
    </div>
  )
}

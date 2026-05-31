'use client'

import { useEffect, useState, useRef } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, ChevronRight, Check, Globe, Pencil, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getOrganisationByOwner, createOrganisation, updateOrganisation } from '@/lib/organisations'
import { usePlausible } from 'next-plausible'
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
  { value: 'community',         label: 'Community Dev & Spaces' },
  { value: 'health',            label: 'Health & Wellbeing' },
  { value: 'mental_health',     label: 'Mental Health' },
  { value: 'housing',           label: 'Housing & Homelessness' },
  { value: 'education',         label: 'Education & Skills' },
  { value: 'employment',        label: 'Employment & Livelihoods' },
  { value: 'disability',        label: 'Disability' },
  { value: 'older_people',      label: 'Older People' },
  { value: 'environment',       label: 'Environment & Climate' },
  { value: 'creative',          label: 'Arts & Creative Industries' },
  { value: 'heritage',          label: 'Heritage & Conservation' },
  { value: 'sport',             label: 'Sport & Physical Activity' },
  { value: 'women',             label: 'Women & Gender Equality' },
  { value: 'justice',           label: 'Justice, Rights & Democracy' },
  { value: 'tech',              label: 'Tech for Good' },
  { value: 'financial',         label: 'Financial Inclusion' },
  { value: 'food',              label: 'Food & Agriculture' },
  { value: 'international',     label: 'International & Fair Trade' },
  { value: 'social_economy',    label: 'Co-ops & Community Ownership' },
  { value: 'social_innovation', label: 'Social Innovation & Systems Change' },
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
  excludedNicheTags: string[]
}

const EMPTY_STATE: WizardState = {
  name: '', legalStructure: '', primaryLocation: '',
  annualIncomeBand: '', geographicReach: '', mission: '',
  impactSectors: [], beneficiaryGroups: [],
  minGrantTarget: '', maxGrantTarget: '',
  fundingTypes: ['grant', 'programme', 'investment', 'in_kind'],
  nicheTags: [],
  excludedNicheTags: [],
}

/** Derive the three boolean eligibility flags from the legal structure.
 *  The wizard previously hardcoded these to false/null, which made every
 *  charity and CIC look like they had no asset lock and hadn't declared a
 *  social mission — confusing the eligibility engine. This function fills
 *  the obvious cases; ambiguous structures fall back to null/false. */
function deriveEligibilityFlags(s: LegalStructure | ''): {
  has_asset_lock:           boolean | null
  social_mission_declared:  boolean
  articles_restrict_profit: boolean
} {
  switch (s) {
    case 'registered_charity':
    case 'cio':
      return { has_asset_lock: true,  social_mission_declared: true,  articles_restrict_profit: true  }
    case 'cic_guarantee':
      return { has_asset_lock: true,  social_mission_declared: true,  articles_restrict_profit: true  }
    case 'cic_shares':
      return { has_asset_lock: true,  social_mission_declared: true,  articles_restrict_profit: false }
    case 'cooperative':
      return { has_asset_lock: true,  social_mission_declared: true,  articles_restrict_profit: true  }
    case 'ltd_guarantee':
      // Ltd-by-guarantee orgs on Grant Tracker are overwhelmingly social
      // enterprises with mission-locked articles (often charities-in-waiting
      // or CIC-equivalents structurally). Default to all three true so they
      // aren't silently excluded from non-charity funding; user can untick
      // if their articles don't include these locks.
      return { has_asset_lock: true,  social_mission_declared: true,  articles_restrict_profit: true  }
    default:
      return { has_asset_lock: null,  social_mission_declared: false, articles_restrict_profit: false }
  }
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
  const showSecondaryStar = isSecondary && showMakePrimary && !!onMakePrimary

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: 'relative',
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
        gap: 6,
      }}
      onClick={() => { if (!dimmed) onClick() }}
      role="button"
      tabIndex={dimmed ? -1 : 0}
      onKeyDown={e => { if (!dimmed && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick() } }}
    >
      {isPrimary && <span aria-label="primary" style={{ color: T.lime, fontSize: 11 }}>★</span>}
      {showSecondaryStar && (
        <button
          type="button"
          aria-label={`Make ${label} primary`}
          title="Make primary"
          onClick={e => { e.stopPropagation(); onMakePrimary?.() }}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            margin: 0,
            cursor: 'pointer',
            color: T.greenMid,
            fontSize: 13,
            lineHeight: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: hov ? 1 : 0.55,
            transition: 'opacity 120ms ease',
          }}
        >
          ☆
        </button>
      )}
      <span>{label}</span>
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
              Set up later
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
  const plausible = usePlausible()
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
          impactSectors:    ((org.impact_sectors as ImpactSector[]) ?? []).filter(s => IMPACT_SECTORS.some(o => o.value === s)).slice(0, 4),
          beneficiaryGroups: (org.beneficiary_groups as BeneficiaryGroup[]) ?? [],
          // Store raw digits; fmtThousands() formats on display
          minGrantTarget:   org.min_grant_target != null ? String(org.min_grant_target) : '',
          maxGrantTarget:   org.max_grant_target != null ? String(org.max_grant_target) : '',
          fundingTypes:     (org.funding_type_preferences as FundingType[])?.length
                              ? (org.funding_type_preferences as FundingType[])
                              : ['grant', 'programme', 'investment', 'in_kind'],
          nicheTags:        (() => {
            const sectors = ((org.impact_sectors as ImpactSector[]) ?? []).slice(0, 4)
            const valid = validNicheTagsFor(sectors)
            return ((org.niche_tags as string[]) ?? []).filter(t => valid.has(t))
          })(),
          excludedNicheTags: (() => {
            const sectors = ((org.impact_sectors as ImpactSector[]) ?? []).slice(0, 4)
            const valid = validNicheTagsFor(sectors)
            return ((org.excluded_niche_tags as string[]) ?? []).filter(t => valid.has(t))
          })(),
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
    const raw = url.trim()
    if (!raw) return
    // Basic URL sanity check before hitting the API: must look like a domain
    // (contains a dot, no whitespace). Catches users typing free-text into
    // the URL field, which would otherwise produce a Review screen of empty
    // rows with a URL-encoded "host" like "legal%20structure".
    const stripped = raw.replace(/^https?:\/\//i, '').replace(/\/$/, '')
    if (/\s/.test(stripped) || !stripped.includes('.')) {
      setFetchError('That doesn’t look like a website address. Try something like yourorganisation.co.uk.')
      return
    }
    setFetching(true); setFetchError(null)
    try {
      const res  = await fetch('/api/org-autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: raw }),
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
        url: raw,
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
      // Count what was actually extracted. If we got nothing useful, skip the
      // empty Review screen and drop the user into manual entry instead.
      const foundCount = [
        ext.name, ext.legalStructure, ext.primaryLocation,
        ext.annualIncomeBand, ext.mission,
      ].filter(Boolean).length + (ext.impactSectors.length > 0 ? 1 : 0) + (ext.beneficiaryGroups.length > 0 ? 1 : 0)
      if (foundCount === 0) {
        setFetchError('We couldn’t pick anything up from that site. Fill the details in below.')
        setStep('manual')
        return
      }
      setExtracted(ext)
      setState(prev => ({
        ...prev,
        name:              ext.name ?? prev.name,
        legalStructure:    (ext.legalStructure as LegalStructure) ?? prev.legalStructure,
        primaryLocation:   ext.primaryLocation ?? prev.primaryLocation,
        annualIncomeBand:  ext.annualIncomeBand ?? prev.annualIncomeBand,
        mission:           ext.mission ?? prev.mission,
        impactSectors:     ext.impactSectors.length > 0 ? ext.impactSectors.filter(s => IMPACT_SECTORS.some(o => o.value === s)).slice(0, 4) : prev.impactSectors,
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
      // StepReview renders field values from `extracted`, so mirror the edit
      // there too — otherwise the row visually reverts to the auto-fill value
      // even though wizard state is updated correctly.
      setExtracted(prev => prev ? ({ ...prev, [field]: value } as ExtractedData) : prev)
    }
    setConfirmed(prev => { const n = new Set(prev); n.add(field); return n })
    setEditingField(null)
  }

  function toggleSector(s: ImpactSector) {
    setState(prev => {
      const cur = [...prev.impactSectors]
      const idx = cur.indexOf(s)
      if (idx === -1) { if (cur.length >= 4) return prev; return { ...prev, impactSectors: [...cur, s] } }
      // Removing a sector — clear both its included AND excluded niche tags.
      const removedTags = (NICHE_TAGS_BY_SECTOR[s] ?? []).map(t => t.value)
      return {
        ...prev,
        impactSectors:     cur.filter(x => x !== s),
        nicheTags:         prev.nicheTags.filter(t => !removedTags.includes(t)),
        excludedNicheTags: prev.excludedNicheTags.filter(t => !removedTags.includes(t)),
      }
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
  // Tri-state cycle on click: neutral → include → exclude → neutral.
  // include and exclude are mutually exclusive — one tag can't be both.
  // Mirrors the profile editor so the onboarding experience matches.
  function cycleNicheTag(tag: string) {
    setState(prev => {
      const isIncluded = prev.nicheTags.includes(tag)
      const isExcluded = prev.excludedNicheTags.includes(tag)
      if (!isIncluded && !isExcluded) {
        return { ...prev, nicheTags: [...prev.nicheTags, tag] }
      }
      if (isIncluded) {
        return {
          ...prev,
          nicheTags:         prev.nicheTags.filter(t => t !== tag),
          excludedNicheTags: [...prev.excludedNicheTags, tag],
        }
      }
      return { ...prev, excludedNicheTags: prev.excludedNicheTags.filter(t => t !== tag) }
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
      // Derive the eligibility flags from the legal structure rather than
      // hardcoding to false/null. Charities and CICs were being saved with
      // has_asset_lock=null + social_mission_declared=false, which made the
      // eligibility engine treat them more cautiously than the legal form
      // implies. deriveEligibilityFlags() returns sensible defaults per
      // structure; users can still override on the profile editor.
      const eligibilityFlags = deriveEligibilityFlags(state.legalStructure)
      const validNiche = validNicheTagsFor(state.impactSectors)
      const payload = {
        name:                         state.name.trim() || 'My Organisation',
        charity_number:               null,
        cic_number:                   null,
        org_type:                     legalStructureToOrgType(state.legalStructure) as 'cic' | 'registered_charity' | 'social_enterprise' | 'community_group' | 'other',
        legal_structure:              state.legalStructure || null,
        org_stage:                    null,
        social_mission_declared:      eligibilityFlags.social_mission_declared,
        articles_restrict_profit:     eligibilityFlags.articles_restrict_profit,
        also_individual_practitioner: false,
        impact_sectors:               state.impactSectors,
        beneficiary_groups:           state.beneficiaryGroups,
        niche_tags:                   state.nicheTags.filter(t => validNiche.has(t)),
        excluded_niche_tags:          state.excludedNicheTags.filter(t => validNiche.has(t)),
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
        has_asset_lock:               eligibilityFlags.has_asset_lock,
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

      plausible('profile_completed')
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
            Set up later
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
          wizardState={state}
          toggleSector={toggleSector}
          makePrimarySector={makePrimarySector}
          toggleBeneficiary={toggleBeneficiary}
          makePrimaryBeneficiary={makePrimaryBeneficiary}
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
          excludedNicheTags={state.excludedNicheTags}
          toggleSector={toggleSector}
          makePrimarySector={makePrimarySector}
          cycleNicheTag={cycleNicheTag}
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
          {fetching ? (
            <span className="inline-flex items-center gap-2">
              <span className="dot-bounce inline-flex gap-0.5"><span/><span/><span/></span>
              Reading…
            </span>
          ) : 'Auto-fill profile'}
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

function StepReview({ extracted, confirmed, editingField, setEditingField, confirmField, canContinue, onBack, onSkip, onContinue, wizardState, toggleSector, makePrimarySector, toggleBeneficiary, makePrimaryBeneficiary }: {
  extracted: ExtractedData
  confirmed: Set<string>
  editingField: string | null
  setEditingField: (f: string | null) => void
  confirmField: (field: string, value?: string) => void
  canContinue: boolean
  onBack: () => void; onSkip: () => void; onContinue: () => void
  wizardState: WizardState
  toggleSector: (s: ImpactSector) => void
  makePrimarySector: (s: ImpactSector) => void
  toggleBeneficiary: (b: BeneficiaryGroup) => void
  makePrimaryBeneficiary: (b: BeneficiaryGroup) => void
}) {
  const hostname = (() => {
    try { return new URL(extracted.url.startsWith('http') ? extracted.url : `https://${extracted.url}`).hostname }
    catch { return extracted.url }
  })()

  const fields: Array<{
    key: keyof typeof extracted.confidence
    label: string; value: string | null
    stateKey?: string; type?: 'text' | 'select' | 'chips'
    options?: { value: string; label: string }[]
    chipOptions?: { value: string; label: string }[]
    selectedChips?: string[]
    maxChips?: number
    onToggleChip?: (val: string) => void
    onMakePrimaryChip?: (val: string) => void
  }> = [
    { key: 'name',              label: 'Organisation name', value: extracted.name,            stateKey: 'name',            type: 'text' },
    { key: 'legalStructure',    label: 'Legal structure',   value: LEGAL_STRUCTURE_OPTIONS.find(o => o.value === extracted.legalStructure)?.label ?? extracted.legalStructure, stateKey: 'legalStructure', type: 'select', options: LEGAL_STRUCTURE_OPTIONS },
    { key: 'primaryLocation',   label: 'Primary location',  value: extracted.primaryLocation,  stateKey: 'primaryLocation', type: 'text' },
    { key: 'impactSectors',     label: 'Primary sector',    value: wizardState.impactSectors.slice(0,2).map(s => IMPACT_SECTORS.find(o => o.value === s)?.label ?? s).join(' · ') || null, type: 'chips' as const, chipOptions: IMPACT_SECTORS, selectedChips: wizardState.impactSectors, maxChips: 4, onToggleChip: (v) => toggleSector(v as ImpactSector), onMakePrimaryChip: (v) => makePrimarySector(v as ImpactSector) },
    { key: 'beneficiaryGroups', label: 'Who you serve',     value: wizardState.beneficiaryGroups.slice(0,2).map(b => BENEFICIARY_GROUPS.find(o => o.value === b)?.label ?? b).join(' · ') || null, type: 'chips' as const, chipOptions: BENEFICIARY_GROUPS, selectedChips: wizardState.beneficiaryGroups, maxChips: 4, onToggleChip: (v) => toggleBeneficiary(v as BeneficiaryGroup), onMakePrimaryChip: (v) => makePrimaryBeneficiary(v as BeneficiaryGroup) },
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
            chipOptions={field.chipOptions}
            selectedChips={field.selectedChips}
            maxChips={field.maxChips}
            onToggleChip={field.onToggleChip}
            onMakePrimaryChip={field.onMakePrimaryChip}
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

function ReviewField({ label, value, fieldState: fState, isConfirmed, isEditing, type, options, chipOptions, selectedChips, maxChips, onToggleChip, onMakePrimaryChip, onEdit, onConfirm, onCancel }: {
  label: string; value: string | null
  fieldState: FieldConfidence; isConfirmed: boolean; isEditing: boolean
  type?: 'text' | 'select' | 'chips'; options?: { value: string; label: string }[]
  chipOptions?: { value: string; label: string }[]
  selectedChips?: string[]
  maxChips?: number
  onToggleChip?: (val: string) => void
  onMakePrimaryChip?: (val: string) => void
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
        {isEditing && type === 'chips' && chipOptions ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 10 }}>
              {chipOptions.map(opt => {
                const sel = selectedChips?.includes(opt.value) ?? false
                const isPrimary = sel && selectedChips?.[0] === opt.value
                const atMax = (selectedChips?.length ?? 0) >= (maxChips ?? 4)
                const dimmed = !sel && atMax
                return (
                  <button
                    key={opt.value}
                    onClick={() => { if (!dimmed) onToggleChip?.(opt.value) }}
                    style={{
                      padding: '5px 10px', borderRadius: 6, fontSize: 12,
                      fontFamily: 'var(--font-space-grotesk)', cursor: dimmed ? 'not-allowed' : 'pointer',
                      opacity: dimmed ? 0.4 : 1, transition: 'all 120ms ease',
                      background: isPrimary ? T.greenDeep : sel ? T.greenCream : '#fff',
                      color: isPrimary ? '#fff' : sel ? T.greenTextDeep : T.textSecondary,
                      border: `1px solid ${isPrimary ? T.greenDeep : sel ? T.greenMid : T.borderInput}`,
                      fontWeight: sel ? 500 : 400,
                    }}
                  >
                    {isPrimary && <span style={{ marginRight: 4, fontSize: 10 }}>★</span>}
                    {opt.label}
                    {sel && !isPrimary && (
                      <span
                        onClick={e => { e.stopPropagation(); onMakePrimaryChip?.(opt.value) }}
                        title="Set as primary"
                        style={{ marginLeft: 5, fontSize: 9, opacity: 0.6, cursor: 'pointer' }}
                      >★</span>
                    )}
                  </button>
                )
              })}
            </div>
            {(selectedChips?.length ?? 0) >= (maxChips ?? 4) && (
              <p style={{ fontSize: 11, color: T.textTertiary, margin: '0 0 8px', fontFamily: 'var(--font-space-grotesk)' }}>Max {maxChips} selected</p>
            )}
            <Button variant="primary" size="sm" onClick={() => onConfirm()}>Done</Button>
          </div>
        ) : isEditing && type ? (
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
  community: [
    { value: 'place_based',         label: 'Place-Based' },
    { value: 'bame_community',      label: 'BAME / Global Majority Communities' },
    { value: 'faith_community',     label: 'Faith Communities' },
    { value: 'lgbtq_community',     label: 'LGBTQ+ Communities' },
    { value: 'intergenerational',   label: 'Intergenerational' },
    { value: 'neighbourhood',       label: 'Neighbourhood & Hyperlocal' },
  ],
  health: [
    { value: 'chronic_illness',     label: 'Chronic Illness' },
    { value: 'preventive_health',   label: 'Preventive Health' },
    { value: 'public_health',       label: 'Public Health' },
    { value: 'end_of_life',         label: 'End-of-Life Care' },
    { value: 'health_research',     label: 'Health Research' },
    { value: 'patient_advocacy',    label: 'Patient Advocacy' },
  ],
  mental_health: [
    { value: 'youth_mh',            label: 'Youth Mental Health' },
    { value: 'adult_mh',            label: 'Adult Mental Health' },
    { value: 'crisis_response',     label: 'Crisis Response' },
    { value: 'peer_support',        label: 'Peer Support' },
    { value: 'suicide_prevention',  label: 'Suicide Prevention' },
    { value: 'trauma_recovery',     label: 'Trauma Recovery' },
  ],
  housing: [
    { value: 'rough_sleeping',          label: 'Rough Sleeping' },
    { value: 'supported_housing',       label: 'Supported Housing' },
    { value: 'social_housing',          label: 'Social Housing' },
    { value: 'homelessness_prevention', label: 'Homelessness Prevention' },
    { value: 'housing_advice',          label: 'Housing Advice' },
    { value: 'refugee_housing',         label: 'Refugee & Migrant Housing' },
  ],
  employment: [
    { value: 'skills_training',         label: 'Skills Training' },
    { value: 'careers_advice',          label: 'Careers Advice' },
    { value: 'supported_employment',    label: 'Supported Employment' },
    { value: 'returning_to_work',       label: 'Returning to Work' },
    { value: 'entrepreneurship',        label: 'Entrepreneurship' },
    { value: 'workplace_inclusion',     label: 'Workplace Inclusion' },
  ],
  disability: [
    { value: 'learning_disability',     label: 'Learning Disability' },
    { value: 'physical_disability',     label: 'Physical Disability' },
    { value: 'sensory_impairment',      label: 'Sensory Impairment' },
    { value: 'autism',                  label: 'Autism' },
    { value: 'neurodiversity',          label: 'Neurodiversity' },
    { value: 'accessibility',           label: 'Accessibility & Inclusion' },
  ],
  older_people: [
    { value: 'social_isolation',        label: 'Social Isolation' },
    { value: 'dementia',                label: 'Dementia' },
    { value: 'end_of_life_care',        label: 'End-of-Life Care' },
    { value: 'age_friendly',            label: 'Age-Friendly Communities' },
    { value: 'intergenerational',       label: 'Intergenerational' },
    { value: 'falls_prevention',        label: 'Falls Prevention' },
  ],
  women: [
    { value: 'vawg',                    label: 'Violence Against Women & Girls' },
    { value: 'women_in_leadership',     label: 'Women in Leadership' },
    { value: 'reproductive_health',     label: 'Reproductive Health' },
    { value: 'girls_empowerment',       label: 'Girls Empowerment' },
    { value: 'women_at_work',           label: 'Women in the Workplace' },
  ],
  justice: [
    { value: 'criminal_justice',        label: 'Criminal Justice Reform' },
    { value: 'civil_liberties',         label: 'Civil Liberties' },
    { value: 'refugee_rights',          label: 'Refugee Rights' },
    { value: 'prisoner_support',        label: 'Prisoner & Family Support' },
    { value: 'voter_engagement',        label: 'Voter Engagement' },
    { value: 'advocacy',                label: 'Advocacy & Legal Aid' },
  ],
  tech: [
    { value: 'digital_inclusion',       label: 'Digital Inclusion' },
    { value: 'civic_tech',              label: 'Civic Tech' },
    { value: 'ai_responsibility',       label: 'AI & Responsibility' },
    { value: 'data_for_good',           label: 'Data for Good' },
    { value: 'edtech',                  label: 'EdTech' },
    { value: 'healthtech',              label: 'HealthTech' },
  ],
  financial: [
    { value: 'debt_advice',             label: 'Debt Advice' },
    { value: 'financial_education',     label: 'Financial Education' },
    { value: 'credit_unions',           label: 'Credit Unions' },
    { value: 'fuel_poverty',            label: 'Fuel Poverty' },
    { value: 'savings_promotion',       label: 'Savings Promotion' },
  ],
  food: [
    { value: 'food_poverty',            label: 'Food Poverty' },
    { value: 'sustainable_food',        label: 'Sustainable Food' },
    { value: 'community_kitchens',      label: 'Community Kitchens' },
    { value: 'food_growing',            label: 'Community Food Growing' },
    { value: 'food_systems',            label: 'Food Systems' },
  ],
  international: [
    { value: 'humanitarian',            label: 'Humanitarian Response' },
    { value: 'development_aid',         label: 'Development Aid' },
    { value: 'fair_trade',              label: 'Fair Trade' },
    { value: 'migration_displacement',  label: 'Migration & Displacement' },
    { value: 'climate_justice',         label: 'Climate Justice' },
  ],
}

function validNicheTagsFor(sectors: ImpactSector[]): Set<string> {
  return new Set(sectors.flatMap(s => (NICHE_TAGS_BY_SECTOR[s] ?? []).map(t => t.value)))
}

/* ═══════════════════════════════════════════════
   Step 3a — Sectors + sub-tags
   ═══════════════════════════════════════════════ */

function StepSectors({ impactSectors, nicheTags, excludedNicheTags, toggleSector, makePrimarySector, cycleNicheTag, onBack, onContinue, canContinue }: {
  impactSectors: ImpactSector[]
  nicheTags: string[]
  excludedNicheTags: string[]
  toggleSector: (s: ImpactSector) => void
  makePrimarySector: (s: ImpactSector) => void
  cycleNicheTag: (tag: string) => void
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
      <p style={SUBTITLE_STYLE}>Pick your primary focus first. That&rsquo;s what we&rsquo;ll weight most in matching.</p>

      {/* Impact sectors */}
      <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' as const }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: T.textPrimary, fontFamily: 'var(--font-space-grotesk)' }}>Your impact sector</span>
        {sectorMax && <span style={{ fontSize: 11, color: T.textTertiary, fontFamily: 'var(--font-space-grotesk)', letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>Max reached</span>}
      </div>
      <div style={{ marginBottom: 12, fontSize: 12.5, color: T.textSecondary, fontFamily: 'var(--font-dm-sans)', lineHeight: 1.55, display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
          Pick 1
          <span aria-label="primary" style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: T.greenDeep, color: '#fff',
            padding: '2px 8px', borderRadius: 99,
            fontSize: 11, fontWeight: 500,
            fontFamily: 'var(--font-space-grotesk)',
            lineHeight: 1.2,
          }}>
            <span style={{ color: T.lime, fontSize: 10 }}>★</span>
            primary
          </span>
          plus up to 3 others. Tap a
          <span style={{ color: T.greenMid, fontSize: 13, lineHeight: 1 }}>☆</span>
          on a chip to change which is primary.
        </span>
        <span style={{ color: T.textTertiary, fontSize: 12 }}>
          Not sure between two similar sectors? Pick the closest fit. You can always change it later.
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
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
      {impactSectors.includes('mental_health') && impactSectors.includes('health') && (
        <div style={{
          background: T.amberBgSoft,
          border: `0.5px solid rgba(186,117,23,0.25)`,
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 20,
          fontSize: 12.5,
          color: T.amberMid,
          fontFamily: 'var(--font-dm-sans)',
          lineHeight: 1.5,
        }}>
          Most orgs fit one of Mental Health or Health &amp; Wellbeing, not both. They target different funder pools, so picking just the closest match usually gives stronger results.
        </div>
      )}

      {/* Sub-tag panel — tri-state chips, mirrors the profile editor.
          Click cycles: neutral → include (green) → exclude (coral strikethrough) → neutral */}
      {nicheSectors.length > 0 && (
        <div style={{
          background: '#F5F1E8',
          borderLeft: '3px solid #8ECB3C',
          borderRadius: 8,
          padding: '12px 14px',
          marginBottom: 20,
        }}>
          {/* Tip callout — explains the tri-state cycle */}
          <div style={{
            fontFamily: 'var(--font-space-grotesk)',
            fontSize: 12.5,
            fontWeight: 500,
            color: T.textPrimary,
            marginBottom: 14,
            padding: '10px 12px',
            background: 'rgba(255,255,255,0.75)',
            borderLeft: '3px solid #639922',
            borderRadius: 4,
            lineHeight: 1.5,
          }}>
            <strong style={{ color: '#3B6D11', fontWeight: 700, letterSpacing: '0.01em' }}>Tip</strong>
            <span style={{ color: '#3B6D11' }}> · </span>
            Click once to mark as a specialism. Click again to <strong>exclude</strong> (we won&apos;t show grants targeting it). Click a third time to reset.
          </div>
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
                    const isIncluded = nicheTags.includes(opt.value)
                    const isExcluded = excludedNicheTags.includes(opt.value)
                    const borderCol = isIncluded ? '#8ECB3C' : isExcluded ? '#D85A30' : '#D9D4C7'
                    const bgCol     = isIncluded ? '#EEF8D8' : isExcluded ? '#FAECE7' : '#FEFCF8'
                    const txtCol    = isIncluded ? '#3A6B0E' : isExcluded ? '#993C1D' : T.textSecondary
                    return (
                      <button
                        key={opt.value}
                        onClick={() => cycleNicheTag(opt.value)}
                        title={isIncluded ? 'Specialism — click to exclude' : isExcluded ? 'Excluded — click to reset' : 'Click to mark as specialism'}
                        style={{
                          fontSize: 11,
                          fontFamily: 'var(--font-dm-sans)',
                          padding: '5px 8px',
                          borderRadius: 6,
                          border: `1.5px solid ${borderCol}`,
                          background: bgCol,
                          color: txtCol,
                          cursor: 'pointer',
                          fontWeight: (isIncluded || isExcluded) ? 600 : 400,
                          transition: 'all 0.12s',
                          textAlign: 'left' as const,
                          lineHeight: 1.3,
                          textDecoration: isExcluded ? 'line-through' : 'none',
                        }}
                      >
                        {isExcluded && <span style={{ marginRight: 4 }}>✕</span>}
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
      <p style={SUBTITLE_STYLE}>Pick your primary beneficiary group first. That&rsquo;s what we&rsquo;ll weight most in matching.</p>

      <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' as const }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: T.textPrimary, fontFamily: 'var(--font-space-grotesk)' }}>Who you serve</span>
        {beneficiaryMax && <span style={{ fontSize: 11, color: T.textTertiary, fontFamily: 'var(--font-space-grotesk)', letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>Max reached</span>}
      </div>
      <div style={{ marginBottom: 12, fontSize: 12.5, color: T.textSecondary, fontFamily: 'var(--font-dm-sans)', lineHeight: 1.55, display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
          Pick 1
          <span aria-label="primary" style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: T.greenDeep, color: '#fff',
            padding: '2px 8px', borderRadius: 99,
            fontSize: 11, fontWeight: 500,
            fontFamily: 'var(--font-space-grotesk)',
            lineHeight: 1.2,
          }}>
            <span style={{ color: T.lime, fontSize: 10 }}>★</span>
            primary
          </span>
          plus up to 3 others. Tap a
          <span style={{ color: T.greenMid, fontSize: 13, lineHeight: 1 }}>☆</span>
          on a chip to change which is primary.
        </span>
        <span style={{ color: T.textTertiary, fontSize: 12 }}>
          Pick the closest fit. You can always add or change groups later.
        </span>
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

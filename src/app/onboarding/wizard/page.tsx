'use client'

import { useEffect, useState, useRef } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, ChevronRight, Check, Globe, Pencil, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getOrganisationByOwner, createOrganisation, updateOrganisation, writeActiveOrgCookie } from '@/lib/organisations'
import { track } from '@/lib/analytics'
import { computeMatchScore, MATCH_FLOOR } from '@/lib/matching'
import { columnFor, normaliseNumber, detectRegister, registerLabel, isRecognisedNumber, expectedRegisterFor } from '@/lib/registered-number'
import { normaliseScrapedGrant } from '@/lib/grants-normalise'
import type { LegalStructure, ImpactSector, BeneficiaryGroup, FundingType, SpendNeed } from '@/types'
import Button from '@/components/ui/Button'
import LogoMark from '@/components/icons/LogoMark'

/* ═══════════════════════════════════════════════
   Design tokens — 1:1 from reference HTML :root
   ═══════════════════════════════════════════════ */

/* Retargeted to the band A tokens. The KEY NAMES are historical and no longer
   describe their colours: this file has ~100 `T.` call sites and renaming them
   all would be a large diff over working code for no behavioural gain. What
   matters is that each key kept its ROLE. Values resolve as CSS variables
   against the `.shoots-a` scope declared on onboarding/layout.tsx.

   Three keys changed role rather than just value, and their call sites were
   edited to match rather than remapped blindly:
     lime      was an accent AND text-on-dark. Text-on-dark is now `onDeep`.
     greenDeep was the primary chip fill. The primary chip is now sage-tint.
     greenMid  was the selected chip border. Selected is now a deep fill. */
const T = {
  lime:          'var(--deep)',
  greenMid:      'var(--deep)',
  greenDeep:     'var(--deep)',
  greenTextDeep: 'var(--deep)',
  greenSoft:     'var(--sage)',
  greenCream:    'var(--sage-tint)',
  cream1:        'var(--cream)',
  creamHover:    'var(--cream)',
  pageBg:        'var(--field-missing-bg)',
  amberMid:      'var(--amber-deep)',
  amberBgSoft:   'var(--gold-tint)',
  coralBg:       'var(--danger-tint)',
  coralText:     'var(--danger)',
  borderLight:   'var(--border-hair)',
  borderMid:     'rgba(29,60,62,0.15)',
  borderInput:   'var(--border-input)',
  textPrimary:   'var(--charcoal)',
  textSecondary: 'var(--ink-muted)',
  textTertiary:  'var(--ink-placeholder)',
  /* Anything sitting ON a deep fill: button labels, tick glyphs, badge text. */
  onDeep:        'var(--cream)',
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
  { value: 'scio',               label: 'Scottish Charitable Incorporated Organisation (SCIO)' },
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
  { value: 'justice',           label: 'Human Rights, Justice & Democracy' },
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
  { value: 'social_impact_orgs', label: 'Social impact organisations' },
  { value: 'general_public',    label: 'General public' },
]

// Funding types: label + short desc only — NO per-type colours.
// The chip uses the same neutral→selected style as sector chips.
// Deliberately NOT defaulted to all three. Selecting everything expresses no
// preference, which is why the one org that ever had sub-type values (all four
// of them) produced no usable signal. Empty means "no preference", and the
// matcher skips the dimension entirely rather than penalising anything.
const SPEND_RESTRICTIONS: { value: SpendNeed; label: string; desc: string }[] = [
  { value: 'restricted',   label: 'Project funding',  desc: 'For a specific project or activity' },
  { value: 'unrestricted', label: 'Core / running costs', desc: 'Salaries, overheads, spend as you see fit' },
  { value: 'capital',      label: 'Capital',          desc: 'Equipment, building work, one-off costs' },
]

const FUNDING_TYPES: { value: FundingType; label: string; desc: string }[] = [
  { value: 'grant',      label: 'Grants & awards',           desc: 'Non-repayable cash funding' },
  { value: 'programme',  label: 'Programmes & accelerators', desc: 'Structured support + cash' },
  { value: 'investment', label: 'Social investment',         desc: 'Loans & repayable finance' },
  { value: 'in_kind',    label: 'In-kind support',           desc: 'Software, space, pro bono' },
]

/* ═══════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════ */

/**
 * Columns the wizard writes but never asks about.
 *
 * These are applied ONLY when creating a brand new organisation, where they
 * simply restate the database defaults. They are deliberately absent from the
 * update path: the wizard collects no input for any of them and does not read
 * them back when it prefills, so including them on an update silently wiped
 * whatever the user had set elsewhere. Two are user-entered in the profile
 * editor (funder_type_preferences, years_trading) and all of them feed
 * ranking, so the symptom was "my matches changed and nothing said why".
 *
 * If the wizard ever starts collecting one of these, move it into `payload`
 * proper rather than adding it back here.
 */
const UNCOLLECTED_ON_CREATE = {
  // Both number columns default to null on CREATE only. The payload spreads
  // after this and overrides whichever one the entered number belongs in, so
  // an update never nulls the column it did not detect — a dual-registered org
  // keeps both.
  charity_number:              null,
  cic_number:                  null,
  years_trading:               null,
  funder_type_preferences:     [],
  funding_subtype_preferences: [],
  people_per_year:             null,
  volunteers:                  null,
  projects_running:            null,
  key_outcomes:                [],
}

type WizardStep = 'entry' | 'review' | 'manual' | 'sectors' | 'beneficiaries' | 'location' | 'reveal'

const STEP_DOT_POS: Record<WizardStep, number> = {
  entry: 1, review: 2, manual: 2, sectors: 3, beneficiaries: 4, location: 5, reveal: 6,
}

type FieldConfidence = 'confident' | 'uncertain' | 'missing'

/**
 * The fields the review step actually renders, and therefore the only fields
 * the user can confirm.
 *
 * `ExtractedData.confidence` carries a seventh key, `mission`, which is
 * extracted and saved but never shown. The Continue gate used to iterate every
 * key in that object, so a mission score between 0.4 and 0.8 counted as
 * "uncertain" and had to be confirmed — except nothing on screen could confirm
 * it, and auto-confirm only covers 0.8 and above. Continue went permanently
 * dead with all six visible fields green and the banner cheerfully reporting
 * "6 of 6 fields found".
 *
 * Gate on what the user can see and act on. If a field is ever added here,
 * render it too.
 */
const REVIEW_FIELD_KEYS = [
  'name',
  'registeredNumber',
  'legalStructure',
  'primaryLocation',
  'annualIncomeBand',
] as const

function fieldConf(c: number | undefined | null, hasValue = false): FieldConfidence {
  if (c == null || c < 0.4) return hasValue ? 'uncertain' : 'missing'
  if (c < 0.8)              return 'uncertain'
  return 'confident'
}

interface ExtractedData {
  url:               string
  name:              string | null
  /**
   * The extractor has always returned this and the wizard has always thrown it
   * away, then written null over whatever was in the profile. Same shape as the
   * seven uncollected fields, and it is the one identifier that makes the
   * eligibility gate checkable rather than self-declared.
   */
  registeredNumber:  string | null
  legalStructure:    string | null
  primaryLocation:   string | null
  annualIncomeBand:  string | null
  mission:           string | null
  impactSectors:     ImpactSector[]
  beneficiaryGroups: BeneficiaryGroup[]
  confidence: {
    name?:              number
    registeredNumber?:  number
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
  /** Charity, company or mutuals-register number. See detectRegister(). */
  registeredNumber: string
  primaryLocation:  string
  annualIncomeBand: string
  geographicReach:  string
  mission:          string
  impactSectors:    ImpactSector[]
  beneficiaryGroups: BeneficiaryGroup[]
  minGrantTarget:   string   // raw digit string, formatted on display
  maxGrantTarget:   string
  fundingTypes:     FundingType[]
  spendRestrictions: SpendNeed[]
  nicheTags:        string[]
  excludedNicheTags: string[]
  /**
   * New-opportunity email alerts. Defaults ON, and is now SHOWN on the last
   * step instead of being written silently.
   *
   * It was hardcoded `alerts_enabled: true` in the submit payload with nothing
   * on screen about it, which is how 34 of 41 organisations ended up subscribed
   * to an email none of them had agreed to. The default is unchanged; what
   * changes is that somebody saw it.
   */
  alertsEnabled:    boolean
}

const EMPTY_STATE: WizardState = {
  name: '',
  registeredNumber: '', legalStructure: '', primaryLocation: '',
  annualIncomeBand: '', geographicReach: '', mission: '',
  impactSectors: [], beneficiaryGroups: [],
  minGrantTarget: '', maxGrantTarget: '',
  fundingTypes: ['grant', 'programme', 'investment', 'in_kind'],
  spendRestrictions: [],
  nicheTags: [],
  excludedNicheTags: [],
  alertsEnabled: true,
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
    case 'scio':
      return { has_asset_lock: true,  social_mission_declared: true,  articles_restrict_profit: true  }
    case 'cic_guarantee':
      return { has_asset_lock: true,  social_mission_declared: true,  articles_restrict_profit: true  }
    case 'cic_shares':
      return { has_asset_lock: true,  social_mission_declared: true,  articles_restrict_profit: false }
    case 'cooperative':
      return { has_asset_lock: true,  social_mission_declared: true,  articles_restrict_profit: true  }
    case 'ltd_guarantee':
      // Ltd-by-guarantee orgs on Shoots are overwhelmingly social
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
  if (s === 'registered_charity' || s === 'cio' || s === 'scio') return 'registered_charity'
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

/* The shared field. This is what the four undrawn steps — manual,
   beneficiaries, location and the inline editors — inherit, so bringing it to
   the spec's section 5 figures is what makes the claim "the rest inherit the
   language" actually true rather than assumed. 1.5px at #7B8A8B is 3.59:1,
   where the old hairline was 1.39:1 and failed. */
const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  height: 50,
  padding: '0 15px',
  border: `1.5px solid ${T.borderInput}`,
  borderRadius: 12,
  fontFamily: 'var(--font-dm-sans)',
  fontSize: 15,
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

/**
 * Progress: a text counter with the dots beside it.
 *
 * The dots alone were the only progress signal on this page, and they are
 * purely visual — a screen reader got nothing from them and six of them are
 * hard to count at a glance. The text carries the state and the dots become
 * decorative, which is where they belong, so they are aria-hidden.
 */
function StepDots({ active, total = 6 }: { active: number; total?: number }) {
  return (
    <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
      <span style={{
        fontFamily: 'var(--font-space-grotesk)',
        fontSize: 11.5,
        fontWeight: 600,
        color: T.textSecondary,
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
      }}>
        Step {active} of {total}
      </span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} aria-hidden="true">
        {Array.from({ length: total }, (_, i) => {
          const pos = i + 1
          return (
            <div key={i} style={{
              height: 6,
              width: pos === active ? 20 : 6,
              borderRadius: 999,
              background: pos < active ? T.greenSoft : pos === active ? T.greenDeep : 'rgba(29,60,62,0.15)',
              transition: 'all 250ms ease',
            }} />
          )
        })}
      </div>
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
        // Three treatments, loudest = most important: primary is the deep
        // fill, also-selected is the sage tint, unselected is a ghost outline.
        // The star is the extra mark that says "primary is a different KIND of
        // thing from also-selected", which is the spec's actual point.
        //
        // An earlier pass had this the other way round, following the mockup
        // literally: primary sage-tinted, selected deep-filled. Two problems.
        // The loudest chip on screen was the less important one; and inside a
        // confident review field, whose own background is sage tint, the
        // primary chip became fill-on-fill and vanished entirely.
        border: `1.5px solid ${isPrimary || isSecondary || showHover ? T.greenDeep : 'var(--border-ghost)'}`,
        borderRadius: 999,
        background: isPrimary ? T.greenDeep : isSecondary || showHover ? T.greenCream : 'transparent',
        color: isPrimary ? T.onDeep : T.greenTextDeep,
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
      {isPrimary && <span aria-label="primary" style={{ color: T.onDeep, fontSize: 11 }}>★</span>}
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
    /* my-auto rather than items-center: auto margins centre the card when there
       is room and collapse when there is not, so `sectors` at 19 chips stays
       scrollable instead of having its top clipped. items-start left the short
       steps floating high, which showed up as soon as `entry` became a card. */
    <div className="flex-1 flex justify-center px-4 py-8 md:py-12">
      <div className="w-full max-w-[720px] my-auto">
        <div style={{
          background: '#fff',
          border: `1px solid ${T.borderLight}`,
          borderRadius: 20,
          overflow: 'hidden',
          // Same lift as the auth cards, so the wizard reads as part of one
          // flow rather than a different surface.
          boxShadow: '0 1px 2px rgba(29,60,62,0.04), 0 14px 36px rgba(29,60,62,0.06)',
        }}>
          {/* Card header */}
          <div style={{ padding: isMobile ? '16px 20px 0' : '20px 32px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <LogoMark size={26} />
              <span style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 20, color: T.greenDeep, letterSpacing: '-0.01em', textTransform: 'lowercase' }}>
                Shoots
              </span>
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
  /** The match preview failed. Distinct from "there are none" — see the catch below. */
  const [revealFailed, setRevealFailed]   = useState(false)
  /**
   * Set only for a not-yet-registered organisation: how much of the catalogue
   * is open to them now, and how much becoming constituted would open. Both
   * counted live, because the catalogue grows and a hardcoded figure would
   * quietly rot.
   */
  const [structureBlock, setStructureBlock] = useState<{ openNow: number; ifConstituted: number } | null>(null)
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
          // Read back whichever column holds it, so a second pass through the
          // wizard cannot wipe a number the user already gave us.
          registeredNumber: (org.charity_number ?? org.cic_number ?? '') as string,
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
          spendRestrictions: (org.spend_restriction_preferences as SpendNeed[]) ?? [],
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
          // Read back rather than defaulted, so a second pass through the
          // wizard cannot silently re-subscribe somebody who turned alerts off.
          alertsEnabled:    org.alerts_enabled ?? true,
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

      // Legal structure is eligibility-critical (a wrong value silently caps the
      // applicant's matches). Only pre-fill it when the extractor is genuinely
      // confident there's ONE clear legal form; otherwise leave it blank so the
      // user completes it manually (the structure field is required to finish).
      // The extractor is calibrated to score orgType low when the structure is
      // ambiguous/dual/inferred (see api/org-autocomplete prompt).
      const structureConfident = (conf.orgType ?? 0) >= 0.8

      let derivedLegal: LegalStructure | '' = ''
      if (data.orgType === 'registered_charity')   derivedLegal = 'registered_charity'
      else if (data.orgType === 'cic')              derivedLegal = 'cic_guarantee'
      else if (data.orgType === 'social_enterprise') derivedLegal = 'ltd_guarantee'
      else if (data.orgType === 'community_group')  derivedLegal = 'unincorporated'

      const ext: ExtractedData = {
        url: raw,
        name:              data.name ?? null,
        // The API has always returned this; the wizard just never read it.
        registeredNumber:  typeof data.charityNumber === 'string' && data.charityNumber.trim() ? data.charityNumber.trim() : null,
        legalStructure:    structureConfident ? (derivedLegal || null) : null,
        primaryLocation:   data.primaryLocation ?? null,
        annualIncomeBand:  data.annualIncome ?? null,
        mission:           data.mission ?? null,
        impactSectors:     Array.isArray(data.impactSectors) ? data.impactSectors.slice(0, 4) : [],
        beneficiaryGroups: Array.isArray(data.beneficiaryGroups) ? data.beneficiaryGroups.slice(0, 5) : [],
        confidence: {
          name:              conf.name,
          registeredNumber:  conf.charityNumber,
          // undefined (not the low score) when unconfident → review renders the
          // structure as a "please add" field rather than a guess to rubber-stamp.
          legalStructure:    structureConfident ? conf.orgType : undefined,
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
        ext.name, ext.registeredNumber, ext.legalStructure, ext.primaryLocation,
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
        registeredNumber:  ext.registeredNumber ?? prev.registeredNumber,
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
    return REVIEW_FIELD_KEYS
      .filter(k => fieldConf(extracted.confidence[k]) === 'uncertain')
      .every(f => confirmed.has(f))
  }

  /** Which visible fields are still holding Continue back, for the hint below it. */
  const numberExpectationForBlockers = expectedRegisterFor(state.legalStructure)
  function reviewBlockers(): string[] {
    if (!extracted) return []
    // Must cover exactly REVIEW_FIELD_KEYS. It still listed impactSectors and
    // beneficiaryGroups after those rows moved to steps 3 and 4, and had no
    // entry for registeredNumber — so a blocked Continue would have told the
    // user to confirm "registeredNumber", the raw key.
    const LABELS: Record<string, string> = {
      name:             'Organisation name',
      registeredNumber: numberExpectationForBlockers.label,
      legalStructure:   'Legal structure',
      primaryLocation:  'Primary location',
      annualIncomeBand: 'Annual income',
    }
    return REVIEW_FIELD_KEYS
      .filter(k => fieldConf(extracted.confidence[k]) === 'uncertain' && !confirmed.has(k))
      .map(k => LABELS[k] ?? k)
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
  function toggleSpendNeed(r: SpendNeed) {
    setState(prev => ({
      ...prev,
      spendRestrictions: prev.spendRestrictions.includes(r)
        ? prev.spendRestrictions.filter(x => x !== r)
        : [...prev.spendRestrictions, r],
    }))
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
        // Was `null, null`, which discarded a number the extractor had already
        // found and wiped whatever was on the profile from a previous pass —
        // the same shape as the seven uncollected fields removed above.
        // columnFor() routes by the number's own format, falling back to the
        // declared structure only to break the OSCR / Scottish-company tie.
        ...(() => {
          const num = state.registeredNumber.trim()
          if (!num) return {}
          const col = columnFor(num, state.legalStructure)
          return col ? { [col]: normaliseNumber(num) } : {}
        })(),
        org_type:                     legalStructureToOrgType(state.legalStructure) as 'cic' | 'registered_charity' | 'social_enterprise' | 'community_group' | 'other',
        legal_structure:              state.legalStructure || null,
        org_stage:                    null,
        social_mission_declared:      eligibilityFlags.social_mission_declared,
        articles_restrict_profit:     eligibilityFlags.articles_restrict_profit,
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
        // NOTHING THE WIZARD DOES NOT ASK ABOUT BELONGS IN THIS PAYLOAD.
        //
        // people_per_year, volunteers, projects_running, key_outcomes,
        // funder_type_preferences, funding_subtype_preferences and
        // years_trading used to be written here as `null` / `[]` literals.
        // The wizard collects no input for any of them and does not read them
        // back when it prefills from an existing org, so on the update branch
        // they were silently overwritten every time someone re-ran the wizard.
        //
        // Two of them are user-entered in the profile editor
        // (funder_type_preferences, years_trading) and all of them are read by
        // ranking — matching.ts scores +15 on a preferred funder type — so a
        // user who set their preferences, then walked the wizard again from the
        // dashboard prompt, lost them and got different matches with nothing on
        // screen to say why.
        //
        // Removing them rather than adding them to the prefill is deliberate:
        // it removes the class of bug instead of one instance. Checked against
        // the schema first — every one of the seven either defaults to '{}' or
        // is nullable, so create-branch behaviour is byte-identical and the
        // update branch now leaves existing values alone.
        //
        // Note the near-miss: funding_TYPE_preferences below IS collected and
        // prefilled. funding_SUBTYPE_preferences was not. One character apart.
        min_grant_target:             state.minGrantTarget ? parseInt(state.minGrantTarget.replace(/[^\d]/g, '')) : null,
        max_grant_target:             state.maxGrantTarget ? parseInt(state.maxGrantTarget.replace(/[^\d]/g, '')) : null,
        funding_type_preferences:     state.fundingTypes,
        spend_restriction_preferences: state.spendRestrictions,
        has_asset_lock:               eligibilityFlags.has_asset_lock,
        owner_id:                     userId,
        // Was hardcoded `true`. Now carries whatever the person left the
        // checkbox on the last step set to — which is still true unless they
        // untick it, so the default has not moved.
        alerts_enabled:               state.alertsEnabled,
        alert_frequency:              'weekly',
        alert_min_score:              70,
        website_url:                  url.trim() ? (url.trim().startsWith('http') ? url.trim() : 'https://' + url.trim()) : null,
      }

      let currentOrgId = orgId
      if (orgId) {
        // Update: only the fields the wizard actually collected. Anything it
        // does not ask about is left exactly as the user left it.
        await updateOrganisation(orgId, payload)
      } else {
        const created = await createOrganisation({ ...UNCOLLECTED_ON_CREATE, ...payload } as Parameters<typeof createOrganisation>[0])
        currentOrgId = created.id
        setOrgId(created.id)
      }
      // Make the org we just onboarded the ACTIVE org, so Find Funding /
      // dashboard match against it — not the previously-selected or oldest org.
      // Mirrors the profile switcher (cookie + localStorage) so the choice also
      // survives a later profile-page load.
      if (currentOrgId) {
        writeActiveOrgCookie(currentOrgId)
        if (typeof window !== 'undefined') localStorage.setItem('gt_active_org_id', currentOrgId)
      }
      // Build org for matching directly — avoids read-after-write race condition
      // Preview only. Carries the same defaults the payload used to inline, so
      // the reveal step's numbers are unchanged by the fix above. On the update
      // branch this still ignores the seven uncollected fields, exactly as it
      // did before — worth revisiting if the reveal count ever needs to match
      // the dashboard exactly.
      const orgForMatching = { ...UNCOLLECTED_ON_CREATE, ...payload, id: currentOrgId ?? '', created_at: new Date().toISOString() }

      matchFetchRef.current = (async () => {
        try {
          const { data: scraped } = await supabase
            .from('grants_with_funder')
            .select('*')
            .eq('is_active', true)
            .neq('url_status', 'dead')
            .or(`is_rolling.eq.true,deadline.is.null,deadline.gte.${today}`)
            .limit(1500)

          // A failed query returns null. Returning here left revealCount at
          // null forever, so the user sat on "Finding your matches…" until they
          // navigated away.
          if (!scraped) throw new Error('grants_with_funder returned no rows')



          const rows = scraped.map(row => normaliseScrapedGrant(row as Record<string, unknown>))

          /**
           * A not-yet-registered organisation is not a matching failure, it is
           * a fact about eligibility: most UK funders require a constituted
           * body. Measured against the live catalogue, `not_registered` is
           * named by 8 rows and `unincorporated` by 319, so the gap between
           * "nothing for me here" and "half the catalogue" is one step the
           * user can actually take.
           *
           * The second number is produced by the SAME matcher with one field
           * changed, rather than a separate query, so it cannot drift from
           * what they would really see afterwards.
           */
          if ((payload.legal_structure ?? '') === 'not_registered') {
            const asConstituted = { ...orgForMatching, legal_structure: 'unincorporated' }
            // Counted by ELIGIBILITY, not by match score. The question this
            // screen answers is "what am I allowed to apply to", which is a
            // different question from "what scores well for me". Counting by
            // score read 0 -> 7 for the first org this was built for, which is
            // true but useless; by eligibility it reads 25 -> 296, which is
            // the fact that actually changes what they do next.
            let openNow = 0, ifConstituted = 0
            for (const grant of rows) {
              try {
                if (computeMatchScore(grant, orgForMatching as Parameters<typeof computeMatchScore>[1]).eligibilityStatus !== 'ineligible') openNow++
                if (computeMatchScore(grant, asConstituted as Parameters<typeof computeMatchScore>[1]).eligibilityStatus !== 'ineligible') ifConstituted++
              } catch { /* a row the matcher cannot read should not skew the count */ }
            }
            setStructureBlock({ openNow, ifConstituted })
          }

          const scored = rows
            .map(grant => {
              const result = computeMatchScore(grant, orgForMatching as Parameters<typeof computeMatchScore>[1])
              return { grant, score: result.score }
            })
            // All four funding types, not grants only. Hiding programmes,
            // investment and in-kind here meant onboarding concealed the
            // non-grant breadth at the exact moment the product is meant to
            // prove itself. 113 of the 639 live rows are non-grant.
            .filter(x => x.score >= MATCH_FLOOR)
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
        } catch (err) {
          // THIS REPORTED EVERY FAILURE AS "you have no matches".
          //
          // It swallowed the error and set the count to zero, so a crash inside
          // computeMatchScore, a network blip, or a Supabase error all rendered
          // the same screen: "Nothing in the catalogue fits it closely enough
          // yet." That is a different claim from "we could not work it out",
          // and it was being made on the last screen of onboarding.
          //
          // It really happened. One funder_brief field shaped as an array threw
          // "matchAll is not a function" inside the matcher (fixed in
          // extract-income-gate), and Lewisham Donation Hub was told nothing
          // fitted while Find Funding had 45 matches for the same organisation.
          //
          // Log it, and say we do not know rather than asserting zero.
          console.error('[wizard] match preview failed', err)
          setRevealFailed(true)
          setRevealMatches([])
        }
      })()

      track('profile_completed')
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

  /* ── Step 1: the card, same shell as every other step ──
     This was a full-page hero. The onboarding mockup draws entry inside the
     standard card at "Step 1 of 6", and /onboarding/welcome is already a
     full-page hero immediately before it, so two heroes back to back was the
     odd part. The copy is unchanged: the mockups are the source of truth for
     layout and spacing, section 7 for content, and section 7 does not restate
     this step's words. */
  if (step === 'entry') {
    return (
      <CardShell step={1}>
        <StepEntry
          url={url}
          setUrl={setUrl}
          fetching={fetching}
          error={fetchError}
          onAutoFill={handleAutoFill}
          onManual={() => { setExtracted(null); setStep('manual') }}
        />
      </CardShell>
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
          blockers={reviewBlockers()}
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
          toggleSpendNeed={toggleSpendNeed}
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
          failed={revealFailed}
          structureBlock={structureBlock}
          topMatches={revealMatches}
          hasMission={!!state.mission.trim()}
          onExplore={() => router.push('/dashboard/search')}
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
            style={{ ...INPUT_STYLE, padding: '0 14px 0 34px', boxSizing: 'border-box' }}
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
            textDecorationColor: 'rgba(29,60,62,0.35)',
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

function StepReview({ extracted, confirmed, editingField, setEditingField, confirmField, canContinue, blockers, onBack, onSkip, onContinue, wizardState, toggleSector, makePrimarySector, toggleBeneficiary, makePrimaryBeneficiary }: {
  extracted: ExtractedData
  confirmed: Set<string>
  editingField: string | null
  setEditingField: (f: string | null) => void
  confirmField: (field: string, value?: string) => void
  canContinue: boolean
  blockers: string[]
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

  // Structure may still be unconfirmed at this point, so fall back to the
  // extracted value and then to generic wording.
  const numberExpectation = expectedRegisterFor(
    (wizardState.legalStructure || extracted.legalStructure || '') as LegalStructure | '',
  )

  const fields: Array<{
    key: keyof typeof extracted.confidence
    label: string; value: string | null; hint?: string | null; emptyText?: string | null
    stateKey?: string; type?: 'text' | 'select' | 'chips'
    options?: { value: string; label: string }[]
    chipOptions?: { value: string; label: string }[]
    selectedChips?: string[]
    maxChips?: number
    onToggleChip?: (val: string) => void
    onMakePrimaryChip?: (val: string) => void
  }> = [
{ key: 'name',              label: 'Organisation name', value: extracted.name,            stateKey: 'name',              type: 'text' },
    // Label, hint and empty state all follow the DECLARED STRUCTURE, because
    // "no company number" is the normal state for much of this audience rather
    // than a gap. A CIO has no Companies House number at all, by design; asking
    // one for a company number and then saying "we couldn't find this" tells
    // them something is wrong when nothing is. Never blocks either way.
    { key: 'registeredNumber',  label: numberExpectation.label, value: extracted.registeredNumber, stateKey: 'registeredNumber',  type: 'text',
      emptyText: numberExpectation.emptyText,
      hint: extracted.registeredNumber
        ? (isRecognisedNumber(extracted.registeredNumber)
            ? `Recognised as ${registerLabel(detectRegister(extracted.registeredNumber))}. We use it to check eligibility, so your matches are right.`
            : 'We don\u2019t recognise that format. Leave it if it\u2019s right, or correct it.')
        : numberExpectation.hint },
    { key: 'legalStructure',    label: 'Legal structure',   value: LEGAL_STRUCTURE_OPTIONS.find(o => o.value === extracted.legalStructure)?.label ?? extracted.legalStructure, stateKey: 'legalStructure', type: 'select', options: LEGAL_STRUCTURE_OPTIONS },
    { key: 'primaryLocation',   label: 'Primary location',  value: extracted.primaryLocation,  stateKey: 'primaryLocation',   type: 'text' },
    { key: 'annualIncomeBand',  label: 'Annual income',     value: extracted.annualIncomeBand, stateKey: 'annualIncomeBand',  type: 'select', options: INCOME_BANDS.map(b => ({ value: b, label: b })) },
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
            hint={field.hint}
            emptyText={field.emptyText}
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <Button variant="primary" onClick={onContinue} disabled={!canContinue}>
            Continue <ArrowRight size={14} />
          </Button>
          {/* A greyed-out Continue with nothing saying why is exactly how this
              page trapped people. If it is disabled, name what it wants. */}
          {!canContinue && blockers.length > 0 && (
            <p style={{ fontSize: 11.5, color: T.amberMid, margin: 0, fontFamily: 'var(--font-dm-sans)', textAlign: 'right' as const }}>
              Confirm {blockers.join(', ')} to carry on
            </p>
          )}
        </div>
      </div>
    </>
  )
}

function ReviewField({ label, value, hint, emptyText, fieldState: fState, isConfirmed, isEditing, type, options, chipOptions, selectedChips, maxChips, onToggleChip, onMakePrimaryChip, onEdit, onConfirm, onCancel }: {
  label: string; value: string | null; hint?: string | null; emptyText?: string | null
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

  /* Each confidence state carries a SHAPE as well as a colour, so it survives
     greyscale and colour blindness: tick, warning, plus. The dashed border on
     `missing` was already doing that job; confident and uncertain were
     separated only by green versus amber, which is exactly the pair that does
     not survive. fieldConf() is untouched — this is presentation only. */
  const bg = effective === 'confident' ? T.greenCream
           : effective === 'uncertain' ? T.amberBgSoft : T.pageBg
  const borderColor = effective === 'confident' ? 'var(--border-hair)'
                    : effective === 'uncertain' ? 'rgba(133,79,11,0.22)' : 'rgba(29,60,62,0.30)'
  const borderStyle = fState === 'missing' && !isConfirmed ? 'dashed' : 'solid'

  const iconBg  = effective === 'confident' ? T.greenDeep
                : effective === 'uncertain' ? T.amberMid : 'transparent'
  const iconChar = effective === 'confident' ? '✓' : effective === 'uncertain' ? '!' : '+'
  const iconColor = (fState === 'missing' && !isConfirmed) ? T.textTertiary : T.onDeep

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13, padding: '14px 16px', background: bg, borderRadius: 13, border: `1px ${borderStyle} ${borderColor}`, transition: 'background 120ms ease' }}>
      {/* State icon */}
      <div style={{
        width: 26, height: 26, borderRadius: 8, flexShrink: 0, marginTop: 1,
        background: iconBg,
        border: fState === 'missing' && !isConfirmed ? '1px dashed rgba(29,60,62,0.35)' : 'none',
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
            {/* The hollow star is the only way to change which pick is primary
                and nothing else on screen says so. The sectors step carries the
                same sentence; this editor had no hint at all. */}
            <p style={{ fontSize: 11.5, lineHeight: 1.45, color: T.textSecondary, margin: '0 0 8px', fontFamily: 'var(--font-dm-sans)' }}>
              The filled chip is your primary. Tap <span style={{ fontFamily: 'var(--font-space-grotesk)' }}>☆</span> on another to move it.
            </p>
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
                      background: isPrimary ? T.greenDeep : sel ? T.greenCream : 'transparent',
                      color: isPrimary ? T.onDeep : T.greenTextDeep,
                      border: `1px solid ${isPrimary || sel ? T.greenDeep : 'var(--border-ghost)'}`,
                      fontWeight: isPrimary ? 600 : sel ? 500 : 400,
                    }}
                  >
                    {isPrimary && <span style={{ marginRight: 4, fontSize: 10 }}>★</span>}
                    {opt.label}
                    {sel && !isPrimary && (
                      <span
                        role="button"
                        aria-label={`Make ${opt.label} the primary sector`}
                        onClick={e => { e.stopPropagation(); onMakePrimaryChip?.(opt.value) }}
                        title="Make this the primary"
                        style={{ marginLeft: 6, fontSize: 11, cursor: 'pointer', color: T.greenTextDeep }}
                      >☆</span>
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
                  ...INPUT_STYLE, flex: 1, height: 34, fontSize: 13, padding: '0 32px 0 10px',
                  appearance: 'none' as const,
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235F5E5A' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
                }}
              >
                <option value="">Select…</option>
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input type="text" value={draft} onChange={e => setDraft(e.target.value)} autoFocus style={{ ...INPUT_STYLE, flex: 1, height: 34, fontSize: 13, padding: '0 10px' }} />
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
            {value ?? emptyText ?? "We couldn't find this — add manually"}
          </div>
        )}
        {!isEditing && hint && (
          <div style={{ fontSize: 11.5, lineHeight: 1.45, color: T.textSecondary, marginTop: 4, fontFamily: 'var(--font-dm-sans)' }}>{hint}</div>
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
    { value: 'digital_arts',    label: 'Digital Arts & Creative Technology' },
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
            background: T.greenDeep, color: T.onDeep,
            padding: '2px 8px', borderRadius: 99,
            fontSize: 11, fontWeight: 500,
            fontFamily: 'var(--font-space-grotesk)',
            lineHeight: 1.2,
          }}>
            {/* Cream, not T.lime. lime now resolves to --deep and this pill's
                background is --deep, so the star was deep on deep and simply
                could not be seen. It has to match the star on the chip it is
                describing. */}
            <span style={{ color: T.onDeep, fontSize: 10 }}>★</span>
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
          border: `1px solid rgba(133,79,11,0.22)`,
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
          background: T.cream1,
          borderLeft: `3px solid ${T.greenDeep}`,
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
            borderLeft: `3px solid ${T.greenDeep}`,
            borderRadius: 4,
            lineHeight: 1.5,
          }}>
            <strong style={{ color: T.greenTextDeep, fontWeight: 700, letterSpacing: '0.01em' }}>Tip</strong>
            <span style={{ color: T.greenTextDeep }}> · </span>
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
                    const borderCol = isIncluded ? T.greenDeep : isExcluded ? T.coralText : 'var(--border-ghost)'
                    const bgCol     = isIncluded ? T.greenCream : isExcluded ? T.coralBg : 'transparent'
                    const txtCol    = isIncluded ? T.greenTextDeep : isExcluded ? T.coralText : T.textSecondary
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
            background: T.greenDeep, color: T.onDeep,
            padding: '2px 8px', borderRadius: 99,
            fontSize: 11, fontWeight: 500,
            fontFamily: 'var(--font-space-grotesk)',
            lineHeight: 1.2,
          }}>
            {/* Cream, not T.lime. lime now resolves to --deep and this pill's
                background is --deep, so the star was deep on deep and simply
                could not be seen. It has to match the star on the chip it is
                describing. */}
            <span style={{ color: T.onDeep, fontSize: 10 }}>★</span>
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

function StepLocation({ state, update, toggleFundingType, toggleSpendNeed, saving, saveError, canContinue, onBack, onFinish }: {
  state: WizardState
  update: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void
  toggleFundingType: (t: FundingType) => void
  toggleSpendNeed: (r: SpendNeed) => void
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

        {/* What the money can be spent on — a different question from the type
            of funding, and the one small charities most often get caught by.
            Optional: leaving it blank means no preference, not "wants nothing". */}
        <Field label="What do you need the money for?" help="Optional. Leave blank if you're open to any of these.">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
            {SPEND_RESTRICTIONS.map(r => {
              const active = state.spendRestrictions.includes(r.value)
              return <FundingTypeChip key={r.value} label={r.label} desc={r.desc} active={active} onClick={() => toggleSpendNeed(r.value)} />
            })}
          </div>
        </Field>
      </div>

      {/* Email alerts, stated rather than assumed.
          Ticked by default, which is the same behaviour as before. The point
          of putting it here is that it is now a line somebody read on their
          way past, so nobody arrives at their first alert email wondering how
          they were signed up. */}
      <label
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 11, marginTop: 22,
          padding: '14px 16px', background: T.cream1, borderRadius: 12,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={state.alertsEnabled}
          onChange={e => update('alertsEnabled', e.target.checked)}
          style={{ marginTop: 2, width: 16, height: 16, accentColor: T.greenDeep, cursor: 'pointer', flexShrink: 0 }}
        />
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 13.5, lineHeight: 1.55, color: T.textSecondary }}>
          Email me when new funding opens that matches us. At most once a week,
          and you can turn it off any time from your profile.
        </span>
      </label>

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
          <Check size={9} color={T.onDeep} strokeWidth={3} />
        </div>
      )}
    </button>
  )
}

/* ═══════════════════════════════════════════════
   Step 5 — The reveal
   ═══════════════════════════════════════════════ */

function StepReveal({ matchCount, failed, structureBlock, topMatches, hasMission, onExplore, onAddMission }: {
  matchCount: number | null; failed: boolean
  structureBlock: { openNow: number; ifConstituted: number } | null
  topMatches: RevealMatch[] | null
  hasMission: boolean; onExplore: () => void; onAddMission: () => void
}) {
  /**
   * Not yet registered.
   *
   * This used to render as an empty screen, which read as "the product has
   * nothing for you" when the truth is narrower and fixable: most UK funders
   * require a constituted body, and becoming one is a single step that opens
   * most of the catalogue. Naming the reason and both numbers turns a dead end
   * into a next action.
   *
   * Shown ahead of the count branches on purpose — a small number here needs
   * this explanation more than it needs a list.
   */
  if (structureBlock) {
    const { openNow, ifConstituted } = structureBlock
    return (
      <>
        <div style={{ textAlign: 'center', padding: '20px 0 4px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🌱</div>
          <h1 style={{ ...H1_STYLE, fontSize: 22 }}>Your profile is saved</h1>
          <p style={{ ...SUBTITLE_STYLE, marginBottom: 20, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
            You told us you&rsquo;re not registered yet. Most funders will only take applications from a
            constituted organisation, so most of the catalogue is closed to you for now.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 22, flexWrap: 'wrap' as const }}>
          <div style={{ background: T.greenCream, border: `1px solid ${T.borderLight}`, borderRadius: 13, padding: '14px 20px', minWidth: 150, textAlign: 'center' as const }}>
            <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 28, fontWeight: 600, color: T.greenDeep, lineHeight: 1.1 }}>{openNow}</div>
            <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 12.5, color: T.textSecondary, marginTop: 3 }}>you can apply to now</div>
          </div>
          <div style={{ background: T.amberBgSoft, border: '1px solid rgba(133,79,11,0.22)', borderRadius: 13, padding: '14px 20px', minWidth: 150, textAlign: 'center' as const }}>
            <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 28, fontWeight: 600, color: T.amberMid, lineHeight: 1.1 }}>{ifConstituted}</div>
            <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 12.5, color: T.textSecondary, marginTop: 3 }}>if you constitute</div>
          </div>
        </div>

        <p style={{ ...SUBTITLE_STYLE, fontSize: 13.5, textAlign: 'center' as const, maxWidth: 460, margin: '0 auto 22px' }}>
          Becoming a constituted community group means adopting a written constitution and opening a
          bank account in the group&rsquo;s name. It does not mean registering as a charity. When
          you&rsquo;ve done it, change your legal structure in your profile and these open up.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Button variant="primary" size="lg" onClick={onExplore}>
            {openNow > 0 ? `See the ${openNow} you can apply to` : 'Browse the catalogue'} <ArrowRight size={15} />
          </Button>
        </div>
      </>
    )
  }

  // We could not work the matches out. Say that, rather than claiming there
  // are none — the profile IS saved, and the matches are computed again on
  // Find Funding, so this is a delay and not a dead end.
  if (failed) {
    return (
      <>
        <div style={{ textAlign: 'center', padding: '24px 0 16px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🌱</div>
          <h1 style={{ ...H1_STYLE, fontSize: 22 }}>Your profile is saved</h1>
          <p style={{ ...SUBTITLE_STYLE, marginBottom: 0 }}>
            We couldn&rsquo;t work out your matches just now. They&rsquo;re calculated again on Find Funding, so have a look there.
          </p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
          <Button variant="primary" size="lg" onClick={onExplore}>Go to Find Funding <ArrowRight size={15} /></Button>
        </div>
      </>
    )
  }

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
          {/* This is the ZERO-match branch, so it cannot offer to show matches.
              It also used to promise "we'll email you when matching grants
              appear", which nothing currently does: /api/cron/send-alerts
              exists but is not scheduled in vercel.json, only classify-alerts
              is. Put the promise back when the alert cron is actually armed. */}
          <p style={{ ...SUBTITLE_STYLE, marginBottom: 0 }}>
            Nothing in the catalogue fits it closely enough yet. Have a look through everything and save anything worth watching.
          </p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
          <Button variant="primary" size="lg" onClick={onExplore}>Browse all funding <ArrowRight size={15} /></Button>
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
      <div style={{ flexShrink: 0, width: 24, height: 24, background: T.greenDeep, color: T.onDeep, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>+</div>
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

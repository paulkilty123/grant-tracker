'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getOrganisationsByOwner, updateOrganisation, deleteOrganisation } from '@/lib/organisations'
import { Pencil, Plus, ChevronDown, RotateCcw, Globe, Check, X, Star, Trash2, AlertTriangle } from 'lucide-react'
import type { Organisation, LegalStructure, OrgStage, ImpactSector, FundingType, BeneficiaryGroup } from '@/types'
import { useIsMobile } from '@/hooks/useIsMobile'

/* ═══════════════════════════════════════════════
   Design tokens
   ═══════════════════════════════════════════════ */
const T = {
  lime:          '#8ECB3C',
  greenDeep:     '#173404',
  greenMid:      '#639922',
  pageBg:        '#FAFAF7',
  cream:         '#F5F1E8',
  white:         '#FFFFFF',
  textPrimary:   '#2C2C2A',
  textSecondary: '#5F5E5A',
  textTertiary:  '#8A8986',
  border:        'rgba(23, 52, 4, 0.08)',
  borderStrong:  'rgba(23, 52, 4, 0.14)',
  // Completion tier palette (mirrors opportunity card match tiers)
  strongBorder:  '#639922',
  strongPanel:   '#F4F9ED',
  partialBorder: '#5A9080',
  partialPanel:  '#F0F5F3',
  weakBorder:    '#808580',
  weakPanel:     '#F4F6F4',
  // Pill families
  greenBg:       '#E8F2D8',
  greenText:     '#3F6018',
  coralBg:       '#FAECE7',
  coralText:     '#993C1D',
  creamText:     '#3A3000',
}

const UI  = 'var(--font-space-grotesk)'
const BODY = 'var(--font-dm-sans)'

/* ═══════════════════════════════════════════════
   Field → card mapping for jump-to-edit
   ═══════════════════════════════════════════════ */
type CardId = 'about' | 'focus' | 'location' | 'funding' | 'story'

const FIELD_TO_CARD: Record<string, CardId> = {
  'Impact sector':     'focus',
  'Who you serve':     'focus',
  'Location':          'location',
  'Legal structure':   'about',
  'Annual income':     'about',
  'Grant size range':  'funding',
  'Mission statement': 'story',
}

/* ═══════════════════════════════════════════════
   Option data
   ═══════════════════════════════════════════════ */
const LEGAL_STRUCTURE_OPTIONS: { value: LegalStructure; label: string }[] = [
  { value: 'cic_guarantee',      label: 'CIC — Limited by Guarantee' },
  { value: 'cic_shares',         label: 'CIC — Limited by Shares' },
  { value: 'cio',                label: 'Charitable Incorporated Organisation (CIO)' },
  { value: 'registered_charity', label: 'Registered Charity (Ltd by Guarantee)' },
  { value: 'ltd_guarantee',      label: 'Ltd by Guarantee (non-charity, non-CIC)' },
  { value: 'ltd_shares',         label: 'Ltd by Shares (trading social enterprise)' },
  { value: 'llp',                label: 'Limited Liability Partnership (LLP)' },
  { value: 'cooperative',        label: 'Co-operative / Community Benefit Society' },
  { value: 'unincorporated',     label: 'Unincorporated Association / Community Group' },
  { value: 'sole_trader',        label: 'Sole Trader / Individual Practitioner' },
  { value: 'not_registered',     label: 'Not yet registered' },
]

const ORG_STAGE_OPTIONS: { value: OrgStage; label: string }[] = [
  { value: 'idea',        label: 'Idea Stage' },
  { value: 'pre_revenue', label: 'Pre-Revenue' },
  { value: 'early',       label: 'Early Stage (under 3 yrs / under £100k)' },
  { value: 'growth',      label: 'Growth (3–10 yrs)' },
  { value: 'established', label: 'Established (5+ yrs)' },
]

const INCOME_BANDS = [
  'Under £10,000', '£10,000–£50,000', '£50,000–£100,000',
  '£100,000–£250,000', '£250,000–£500,000', '£500,000–£1 million',
  '£1 million–£5 million', 'Over £5 million',
]

const GEOGRAPHIC_REACH_OPTIONS = [
  { value: 'local',         label: 'Local only',             hint: 'One town, borough, or district' },
  { value: 'regional',      label: 'Regional / county-wide', hint: 'County, region, or multi-borough' },
  { value: 'national',      label: 'National (UK-wide)',      hint: 'UK-wide programmes' },
  { value: 'international', label: 'UK + international',      hint: 'Includes overseas work' },
]

const IMPACT_SECTOR_OPTIONS: { value: ImpactSector; label: string }[] = [
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
  { value: 'social_innovation', label: 'Innovation & Systems Change' },
]

const NICHE_TAGS_BY_SECTOR: Partial<Record<ImpactSector, { value: string; label: string }[]>> = {
  creative:         [
    { value: 'music',           label: 'Music' }, { value: 'theatre',       label: 'Theatre & Drama' },
    { value: 'dance',           label: 'Dance' }, { value: 'visual_arts',   label: 'Visual Arts' },
    { value: 'film_media',      label: 'Film & Media' }, { value: 'literature', label: 'Literature & Writing' },
    { value: 'crafts',          label: 'Crafts & Making' }, { value: 'circus_street', label: 'Circus & Street Arts' },
  ],
  sport:            [
    { value: 'football',        label: 'Football' }, { value: 'cricket',       label: 'Cricket' },
    { value: 'rugby',           label: 'Rugby' },   { value: 'basketball',    label: 'Basketball' },
    { value: 'swimming',        label: 'Swimming' }, { value: 'athletics',    label: 'Athletics' },
    { value: 'tennis',          label: 'Tennis' },  { value: 'cycling',       label: 'Cycling' },
    { value: 'martial_arts',    label: 'Martial Arts & Boxing' },
    { value: 'disability_sport',label: 'Disability Sport' }, { value: 'women_in_sport', label: 'Women in Sport' },
  ],
  heritage:         [
    { value: 'built_heritage',      label: 'Historic Buildings' },
    { value: 'industrial_heritage', label: 'Industrial Heritage' },
    { value: 'natural_heritage',    label: 'Natural Heritage' },
    { value: 'museums_archives',    label: 'Museums & Archives' },
  ],
  environment:      [
    { value: 'climate',          label: 'Climate & Net Zero' },
    { value: 'biodiversity',     label: 'Biodiversity & Wildlife' },
    { value: 'urban_greening',   label: 'Urban Greening' },
    { value: 'marine',           label: 'Marine & Coastal' },
    { value: 'energy',           label: 'Renewable Energy' },
    { value: 'circular_economy', label: 'Circular Economy & Zero Waste' },
  ],
  social_economy:   [
    { value: 'worker_cooperative',  label: 'Worker Co-operative' },
    { value: 'community_shares',    label: 'Community Shares' },
    { value: 'social_franchise',    label: 'Social Franchise' },
    { value: 'community_ownership', label: 'Community Ownership' },
  ],
  social_innovation:[
    { value: 'tech_for_good',      label: 'Tech for Good' },
    { value: 'impact_measurement', label: 'Impact Measurement' },
    { value: 'systems_change',     label: 'Systems Change' },
  ],
  education:        [
    { value: 'early_years',       label: 'Early Years' },
    { value: 'stem',              label: 'STEM' },
    { value: 'literacy_numeracy', label: 'Literacy & Numeracy' },
    { value: 'higher_education',  label: 'Higher Education' },
    { value: 'vocational',        label: 'Vocational & Apprenticeships' },
    { value: 'digital_literacy',  label: 'Digital Literacy' },
  ],
}

function validNicheTagsFor(sectors: ImpactSector[]): Set<string> {
  return new Set(sectors.flatMap(s => (NICHE_TAGS_BY_SECTOR[s] ?? []).map(t => t.value)))
}

const BENEFICIARY_OPTIONS: { value: BeneficiaryGroup; label: string }[] = [
  { value: 'children',          label: 'Children (under 16)' },
  { value: 'young_people',      label: 'Young people (16–25)' },
  { value: 'older_people',      label: 'Older people (65+)' },
  { value: 'families',          label: 'Families & parents' },
  { value: 'women_girls',       label: 'Women & girls' },
  { value: 'men_boys',          label: 'Men & boys' },
  { value: 'lgbtq',             label: 'LGBTQ+ communities' },
  { value: 'ethnic_minorities', label: 'Ethnic minorities & BAME' },
  { value: 'refugees_migrants', label: 'Refugees & migrants' },
  { value: 'disabled_people',   label: 'Disabled people' },
  { value: 'mental_health',     label: 'People with mental health needs' },
  { value: 'carers',            label: 'Carers & care leavers' },
  { value: 'veterans',          label: 'Veterans & armed forces' },
  { value: 'ex_offenders',      label: 'Ex-offenders' },
  { value: 'homeless',          label: 'Homeless & rough sleepers' },
  { value: 'people_in_poverty', label: 'People in poverty' },
  { value: 'rural_communities', label: 'Rural & isolated communities' },
  { value: 'general_public',    label: 'General public' },
]

const FUNDING_TYPE_OPTIONS: { value: FundingType; label: string }[] = [
  { value: 'grant',      label: 'Grants & Awards' },
  { value: 'programme',  label: 'Programmes' },
  { value: 'investment', label: 'Social Investment' },
  { value: 'in_kind',    label: 'In-Kind Support' },
]

/* ═══════════════════════════════════════════════
   Completeness logic
   ═══════════════════════════════════════════════ */
interface CompletenessResult {
  pct: number
  missing: { label: string; impact: 'high' | 'medium' }[]
}

function computeCompleteness(org: Organisation): CompletenessResult {
  const fields: { label: string; filled: boolean; impact: 'high' | 'medium' }[] = [
    { label: 'Impact sector',    filled: (org.impact_sectors?.length ?? 0) > 0,              impact: 'high'   },
    { label: 'Who you serve',    filled: (org.beneficiary_groups?.length ?? 0) > 0,           impact: 'high'   },
    { label: 'Location',         filled: !!org.primary_location,                              impact: 'high'   },
    { label: 'Legal structure',  filled: !!org.legal_structure,                               impact: 'high'   },
    { label: 'Annual income',    filled: !!org.annual_income_band,                            impact: 'medium' },
    { label: 'Grant size range', filled: !!(org.min_grant_target || org.max_grant_target),    impact: 'medium' },
    { label: 'Mission statement',filled: !!org.mission,                                       impact: 'medium' },
  ]
  const filledCount = fields.filter(f => f.filled).length
  const pct = Math.round((filledCount / fields.length) * 100)
  const missing = fields.filter(f => !f.filled)
  return { pct, missing }
}

function fmtThousands(v: string | number | null | undefined): string {
  if (!v && v !== 0) return ''
  const n = typeof v === 'string' ? parseInt(v.replace(/[^0-9]/g, '')) : v
  if (isNaN(n)) return ''
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}m`
  if (n >= 1_000)     return `£${Math.round(n / 1000)}k`
  return `£${n}`
}

/* ═══════════════════════════════════════════════
   Reusable small components
   ═══════════════════════════════════════════════ */

function AddLink({ label, onClick }: { label: string; onClick?: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <span
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        fontFamily: UI, fontWeight: 500, fontSize: 13,
        color: hov ? T.greenDeep : T.textTertiary,
        cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 4,
        borderBottom: hov ? `1px solid ${T.greenDeep}` : '1px dashed transparent',
        paddingBottom: 1, transition: 'all 0.15s',
      }}
    >
      + {label}
    </span>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  const isMobile = useIsMobile()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '180px 1fr', gap: isMobile ? 8 : 24, alignItems: 'start', padding: '4px 0' }}>
      <div style={{ fontFamily: UI, fontWeight: 500, fontSize: 13, color: T.textSecondary, paddingTop: 2 }}>
        {label}
      </div>
      <div style={{ fontFamily: BODY, fontSize: 15, color: T.textPrimary }}>
        {children}
      </div>
    </div>
  )
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <div
      onClick={onToggle}
      style={{
        width: 36, height: 20, borderRadius: 10, position: 'relative', cursor: 'pointer',
        background: enabled ? T.lime : '#E0DFD9', transition: 'background 0.2s ease', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', width: 16, height: 16, background: T.white, borderRadius: '50%',
        top: 2, left: enabled ? 18 : 2, transition: 'left 0.2s ease',
        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
      }} />
    </div>
  )
}

type ChipState = 'unselected' | 'secondary' | 'primary'

function PickerChip({ label, chipState, dimmed, onClick, showMakePrimary, onMakePrimary }: {
  label: string; chipState: ChipState; dimmed?: boolean
  onClick: () => void; showMakePrimary?: boolean; onMakePrimary?: () => void
}) {
  const [hov, setHov] = useState(false)
  const isPrimary   = chipState === 'primary'
  const isSecondary = chipState === 'secondary'
  const isSelected  = isPrimary || isSecondary

  const bg = isPrimary ? T.greenDeep : isSecondary ? T.greenBg : hov ? '#F0EFEB' : T.white
  const color = isPrimary ? T.white : isSecondary ? T.greenText : dimmed ? T.textTertiary : T.textSecondary
  const border = isPrimary ? T.greenDeep : isSecondary ? T.greenMid : T.borderStrong

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onClick}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          width: '100%', padding: '7px 10px', borderRadius: 8,
          border: `1.5px solid ${border}`,
          background: bg, color, cursor: 'pointer',
          fontFamily: UI, fontSize: 12.5, fontWeight: isSelected ? 600 : 400,
          display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.12s',
          opacity: dimmed ? 0.4 : 1,
        }}
      >
        {isPrimary && (
          <Star size={9} fill="currentColor" color="currentColor" style={{ flexShrink: 0 }} />
        )}
        {isSecondary && (
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.greenText, flexShrink: 0 }} />
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </button>
      {showMakePrimary && (
        <button
          onClick={e => { e.stopPropagation(); onMakePrimary?.() }}
          style={{
            position: 'absolute', top: -6, right: -6,
            background: T.greenDeep, color: T.white,
            border: 'none', borderRadius: 4, padding: '2px 6px',
            fontSize: 10, fontFamily: UI, fontWeight: 600, cursor: 'pointer',
            zIndex: 2, whiteSpace: 'nowrap',
          }}
        >
          Set as primary
        </button>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Org Switcher
   ═══════════════════════════════════════════════ */
function OrgSwitcher({ orgs, activeOrgId, onSwitch }: {
  orgs: Organisation[]
  activeOrgId: string
  onSwitch: (id: string) => void
}) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const active = orgs.find(o => o.id === activeOrgId) ?? orgs[0]
  const isMulti = orgs.length > 1

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const initials = (name: string) =>
    name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')

  return (
    <div style={{
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      alignItems: isMobile ? 'stretch' : 'center',
      justifyContent: 'space-between',
      gap: isMobile ? 12 : 16,
      marginBottom: 24, padding: '14px 18px',
      background: T.white, border: `1px solid ${T.border}`, borderRadius: 12,
    }}>
      <div ref={ref} style={{ position: 'relative', minWidth: 0, flex: isMobile ? 'unset' : 1 }}>
        <div
          onClick={() => isMulti && setOpen(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            cursor: isMulti ? 'pointer' : 'default',
            padding: '4px 8px', borderRadius: 8, margin: '-4px -8px',
            minWidth: 0,
          }}
        >
          {/* Avatar */}
          <div style={{
            width: 36, height: 36, background: T.cream, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: UI, fontWeight: 600, fontSize: 14, color: T.greenDeep, flexShrink: 0,
          }}>
            {initials(active?.name ?? 'O')}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: UI, fontWeight: 500, fontSize: 11, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: T.textTertiary, marginBottom: 2 }}>
              Viewing profile for
            </div>
            <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 15.5, color: T.textPrimary, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active?.name ?? 'Your organisation'}</span>
              {isMulti && <ChevronDown size={14} color={T.textTertiary} style={{ flexShrink: 0 }} />}
            </div>
          </div>
          {isMulti && !isMobile && (
            <span style={{ fontFamily: UI, fontSize: 12.5, color: T.textTertiary, padding: '3px 8px', background: T.pageBg, borderRadius: 10, marginLeft: 4, flexShrink: 0 }}>
              {orgs.length} organisations
            </span>
          )}
        </div>

        {/* Dropdown */}
        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', left: 0, minWidth: 280,
            background: T.white, border: `1px solid ${T.borderStrong}`, borderRadius: 10,
            boxShadow: '0 6px 20px rgba(23,52,4,0.08)', padding: 6, zIndex: 20,
          }}>
            {orgs.map(o => (
              <div
                key={o.id}
                onClick={() => { onSwitch(o.id); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6,
                  cursor: 'pointer', background: o.id === activeOrgId ? T.cream : 'transparent',
                }}
              >
                <div style={{
                  width: 28, height: 28, background: T.pageBg, border: `1px solid ${T.border}`, borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: UI, fontWeight: 600, fontSize: 12, color: T.greenDeep,
                }}>
                  {initials(o.name ?? 'O')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: UI, fontWeight: 500, fontSize: 14, color: T.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.name}
                  </div>
                  <div style={{ fontFamily: BODY, fontSize: 12, color: T.textTertiary }}>
                    {LEGAL_STRUCTURE_OPTIONS.find(x => x.value === o.legal_structure)?.label?.split('(')[0].trim() ?? o.legal_structure ?? 'Unknown structure'}
                    {o.primary_location ? ` · ${o.primary_location}` : ''}
                  </div>
                </div>
                {o.id === activeOrgId && <Check size={14} color={T.greenDeep} />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add organisation button — full-width on mobile, inline on desktop */}
      <a
        href="/onboarding/wizard?new=1"
        style={{
          fontFamily: UI, fontWeight: 500, fontSize: 13,
          color: T.textSecondary, textDecoration: 'none',
          border: `0.5px solid ${T.borderStrong}`,
          padding: '7px 14px', borderRadius: 8,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          flexShrink: 0,
          alignSelf: isMobile ? 'stretch' : 'auto',
          justifyContent: 'center',
        }}
      >
        <Plus size={13} />
        Add organisation
        {isMobile && isMulti && (
          <span style={{ fontSize: 12, color: T.textTertiary, marginLeft: 4 }}>· {orgs.length} active</span>
        )}
      </a>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Completion Meter
   ═══════════════════════════════════════════════ */
function CompletionMeter({ org, onJumpToCard }: { org: Organisation; onJumpToCard: (card: CardId) => void }) {
  const { pct, missing } = computeCompleteness(org)
  const variant = pct >= 80
    ? { border: T.strongBorder,  bg: T.strongPanel,  label: T.strongBorder  }
    : pct >= 60
    ? { border: T.partialBorder, bg: T.partialPanel, label: T.partialBorder }
    : { border: T.weakBorder,    bg: T.weakPanel,    label: T.weakBorder    }

  return (
    <div style={{
      background: variant.bg, border: `1px solid ${variant.border}`,
      borderRadius: 12, padding: '16px 22px', marginBottom: 24,
    }}>
      <div style={{ fontFamily: UI, fontWeight: 500, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: variant.label, marginBottom: 8 }}>
        Profile completeness
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 24, color: T.textPrimary, letterSpacing: '-0.01em' }}>{pct}%</span>
        <span style={{ fontFamily: BODY, fontSize: 14, color: T.textSecondary }}>
          {missing.length === 0
            ? 'Your profile is complete. Matches are fully optimised.'
            : 'Click a missing field to complete it.'}
        </span>
      </div>
      <div style={{ height: 6, background: 'rgba(23,52,4,0.06)', borderRadius: 3, overflow: 'hidden', marginBottom: missing.length > 0 ? 14 : 0 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: variant.border, borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
      {missing.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {missing.map(m => {
            const card = FIELD_TO_CARD[m.label]
            return (
              <button
                key={m.label}
                onClick={() => card && onJumpToCard(card)}
                style={{
                  fontFamily: UI, fontWeight: 500, fontSize: 12,
                  padding: '4px 10px', borderRadius: 8, cursor: card ? 'pointer' : 'default',
                  border: `1px solid ${m.impact === 'high' ? '#C97B1A' : T.borderStrong}`,
                  background: m.impact === 'high' ? '#FEF3E2' : T.pageBg,
                  color: m.impact === 'high' ? '#854F0B' : T.textSecondary,
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  transition: 'all 0.12s',
                }}
              >
                {m.impact === 'high' && <AlertTriangle size={10} />}
                + {m.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Scan Bar
   ═══════════════════════════════════════════════ */
function ScanBar({ orgId, website, onSaved }: { orgId: string; website?: string | null; onSaved: () => void }) {
  const isMobile = useIsMobile()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const supabase = createClient()

  async function runScan() {
    if (!website) return
    setScanning(true)
    setScanMsg(null)
    try {
      const res = await fetch('/api/org-autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: website }),
      })
      const data = await res.json()
      if (!res.ok) { setScanMsg({ type: 'error', text: data.error ?? 'Scan failed' }); return }

      // Map response to profile fields — only update fields that have data
      const updates: Record<string, unknown> = {}
      const fieldNames: string[] = []
      const labels: Record<string, string> = { name: 'name', mission: 'mission', impact_sectors: 'sectors', beneficiary_groups: 'beneficiaries', primary_location: 'location', annual_income_band: 'income', legal_structure: 'legal structure' }

      if (data.name) { updates.name = String(data.name).slice(0, 150); fieldNames.push(labels.name) }
      if (data.mission) { updates.mission = String(data.mission).slice(0, 200); fieldNames.push(labels.mission) }
      if (Array.isArray(data.impactSectors) && data.impactSectors.length > 0) { updates.impact_sectors = data.impactSectors.slice(0, 5); fieldNames.push(labels.impact_sectors) }
      if (Array.isArray(data.beneficiaryGroups) && data.beneficiaryGroups.length > 0) { updates.beneficiary_groups = data.beneficiaryGroups.slice(0, 5); fieldNames.push(labels.beneficiary_groups) }
      if (data.primaryLocation) { updates.primary_location = String(data.primaryLocation).slice(0, 100); fieldNames.push(labels.primary_location) }
      if (data.annualIncome) { updates.annual_income_band = data.annualIncome; fieldNames.push(labels.annual_income_band) }
      const structureMap: Record<string, string> = { registered_charity: 'registered_charity', cic: 'cic_guarantee', social_enterprise: 'ltd_guarantee', community_group: 'unincorporated' }
      if (data.orgType && structureMap[data.orgType]) { updates.legal_structure = structureMap[data.orgType]; fieldNames.push(labels.legal_structure) }

      if (Object.keys(updates).length === 0) { setScanMsg({ type: 'error', text: 'Could not extract any profile data from your website' }); return }

      await updateOrganisation(orgId, updates)
      onSaved()
      setScanMsg({ type: 'success', text: `Updated ${fieldNames.join(', ')} — review below and edit anything that needs adjusting` })
      setTimeout(() => setScanMsg(null), 8000)
    } catch { setScanMsg({ type: 'error', text: 'Network error — please try again' }) }
    finally { setScanning(false) }
  }

  function startEdit() { setDraft(website ?? ''); setEditing(true) }
  function cancel() { setEditing(false) }

  async function save() {
    setSaving(true)
    try {
      const url = draft.trim()
      const normalized = url && !url.startsWith('http') ? 'https://' + url : url
      await updateOrganisation(orgId, { website_url: normalized || null })
      onSaved()
      setEditing(false)
    } finally { setSaving(false) }
  }

  const display = website ? website.replace(/^https?:\/\//, '').replace(/\/$/, '') : null

  return (
    <div style={{
      background: T.white, border: `1px solid ${T.border}`, borderRadius: 12,
      padding: '14px 18px', marginBottom: 16,
      display: 'flex',
      flexWrap: 'wrap' as const,
      alignItems: 'center',
      gap: isMobile ? 10 : 14,
    }}>
      <div style={{
        flexShrink: 0, width: 32, height: 32, background: T.cream, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.greenDeep,
      }}>
        <Globe size={16} />
      </div>

      {editing ? (
        <>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: UI, fontWeight: 500, fontSize: 12, color: T.textSecondary, marginBottom: 6 }}>
              {display ? 'Change website URL' : 'Add your website'}
            </div>
            <input
              type="url"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()}
              placeholder="https://yourorg.org.uk"
              autoFocus
              style={{
                fontFamily: BODY, fontSize: 14, color: T.textPrimary,
                width: '100%', padding: '7px 10px',
                border: `1px solid ${T.borderStrong}`, borderRadius: 7,
                background: T.pageBg, outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexBasis: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'flex-end' : 'flex-start' }}>
            <button onClick={cancel} style={{ fontFamily: UI, fontWeight: 500, fontSize: 13, color: T.textSecondary, background: T.white, border: `0.5px solid ${T.borderStrong}`, padding: '7px 12px', borderRadius: 7, cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={save} disabled={saving} style={{ fontFamily: UI, fontWeight: 500, fontSize: 13, background: T.lime, color: T.greenDeep, border: 'none', padding: '7px 14px', borderRadius: 7, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving\u2026' : 'Save'}
            </button>
          </div>
        </>
      ) : display ? (
        <>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: UI, fontWeight: 500, fontSize: 13, color: T.textSecondary, marginBottom: 2 }}>Website on file</div>
            <div style={{ fontFamily: UI, fontWeight: 500, fontSize: 14.5, color: T.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {display}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexBasis: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'flex-end' : 'flex-start' }}>
            <button onClick={startEdit} style={{ fontFamily: UI, fontWeight: 500, fontSize: 13, background: 'transparent', color: T.textSecondary, border: 'none', padding: '7px 10px', borderRadius: 7, cursor: 'pointer' }}>
              Change URL
            </button>
            <button
              onClick={runScan}
              disabled={scanning}
              style={{ fontFamily: UI, fontWeight: 500, fontSize: 13, background: scanning ? T.lime : 'transparent', color: scanning ? T.greenDeep : T.textPrimary, border: `0.5px solid ${scanning ? T.greenDeep : T.borderStrong}`, padding: '7px 14px', borderRadius: 8, cursor: scanning ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.2s ease', opacity: scanning ? 0.8 : 1 }}
            >
              <RotateCcw size={13} style={scanning ? { animation: 'spin 1s linear infinite' } : undefined} />
              {scanning ? 'Scanning...' : 'Re-scan & refresh'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: UI, fontWeight: 500, fontSize: 13, color: T.textSecondary, marginBottom: 2 }}>No website on file</div>
            <div style={{ fontFamily: BODY, fontSize: 13, color: T.textTertiary }}>Add your website so we can keep your profile up to date automatically</div>
          </div>
          <button onClick={startEdit} style={{ fontFamily: UI, fontWeight: 500, fontSize: 13, background: T.lime, color: T.greenDeep, border: 'none', padding: '7px 16px', borderRadius: 8, cursor: 'pointer', flexShrink: 0, flexBasis: isMobile ? '100%' : 'auto' }}>
            Add website
          </button>
        </>
      )}
      {/* Scan feedback message */}
      {scanMsg && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: scanMsg.type === 'success' ? '#F0FAE5' : '#FEF2F2', border: `1px solid ${scanMsg.type === 'success' ? '#8ECB3C' : '#FECACA'}`, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: BODY, fontSize: 13, color: scanMsg.type === 'success' ? T.greenDeep : '#991B1B' }}>{scanMsg.text}</span>
          <button onClick={() => setScanMsg(null)} style={{ fontFamily: UI, fontSize: 12, color: scanMsg.type === 'success' ? T.greenDeep : '#991B1B', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, flexShrink: 0, marginLeft: 12 }}>Dismiss</button>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Card shell (shared wrapper)
   ═══════════════════════════════════════════════ */
function CardShell({ title, badge, isEditing, onEdit, editDisabled, children, footer, hasIncomplete, cardId }: {
  title: string
  badge?: React.ReactNode
  isEditing: boolean
  onEdit: () => void
  editDisabled?: boolean
  children: React.ReactNode
  footer?: React.ReactNode
  hasIncomplete?: boolean
  cardId?: string
}) {
  const borderColor = isEditing ? T.greenDeep : hasIncomplete ? '#C97B1A' : T.border
  return (
    <section id={cardId} style={{
      background: T.white, border: `1px solid ${borderColor}`,
      borderRadius: 12, overflow: 'hidden',
      boxShadow: isEditing ? '0 0 0 3px rgba(23,52,4,0.05)' : hasIncomplete ? '0 0 0 3px rgba(201,123,26,0.06)' : 'none',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }}>
      {/* Header */}
      <div style={{ padding: '18px 24px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontFamily: UI, fontWeight: 600, fontSize: 17, color: T.textPrimary, letterSpacing: '-0.01em' }}>
            {title}
          </h2>
          {badge}
        </div>
        {!isEditing && (
          <button
            onClick={onEdit}
            disabled={editDisabled}
            style={{
              fontFamily: UI, fontWeight: 500, fontSize: 13,
              color: editDisabled ? T.textTertiary : T.textSecondary,
              background: 'transparent', border: 'none', cursor: editDisabled ? 'not-allowed' : 'pointer',
              padding: '6px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6,
              opacity: editDisabled ? 0.5 : 1,
            }}
          >
            <Pencil size={14} />
            Edit
          </button>
        )}
        {isEditing && (
          <span style={{ fontFamily: UI, fontWeight: 500, fontSize: 12, color: T.greenDeep, padding: '3px 10px', background: T.cream, borderRadius: 10 }}>
            Editing
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '0 24px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>

      {/* Footer (edit mode) */}
      {footer && (
        <div style={{ padding: '14px 24px', background: T.pageBg, borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {footer}
        </div>
      )}
    </section>
  )
}

function SaveBtn({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      style={{
        fontFamily: UI, fontWeight: 500, fontSize: 13.5,
        background: saving ? '#C5E08A' : T.lime, color: T.greenDeep,
        border: 'none', padding: '8px 18px', borderRadius: 8,
        cursor: saving ? 'not-allowed' : 'pointer',
      }}
    >
      {saving ? 'Saving…' : 'Save changes'}
    </button>
  )
}
function CancelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: UI, fontWeight: 500, fontSize: 13.5,
        background: T.white, color: T.textPrimary,
        border: `0.5px solid ${T.borderStrong}`, padding: '8px 16px', borderRadius: 8,
        cursor: 'pointer',
      }}
    >
      Cancel
    </button>
  )
}

function inputStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    fontFamily: BODY, fontSize: 15, color: T.textPrimary,
    width: '100%', padding: '8px 12px',
    border: `1px solid ${T.borderStrong}`, borderRadius: 8,
    background: T.pageBg, outline: 'none',
    ...extra,
  }
}

/* ═══════════════════════════════════════════════
   Card 1 — About your organisation
   ═══════════════════════════════════════════════ */
interface AboutDraft {
  name: string; legalStructure: LegalStructure | ''
  annualIncomeBand: string; yearsTrading: string
  orgStage: OrgStage | ''; charityNumber: string
  alsoIndividualPractitioner: boolean
}

function AboutCard({ org, orgId, onSaved, isEditingOther, onEditStart, onEditEnd, triggerOpen, onTriggered, hasIncomplete }: {
  org: Organisation; orgId: string
  onSaved: () => void; isEditingOther: boolean
  onEditStart: () => void; onEditEnd: () => void
  triggerOpen?: boolean; onTriggered?: () => void; hasIncomplete?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<AboutDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (triggerOpen && !editing) { startEdit(); onTriggered?.() }
  }, [triggerOpen])

  function startEdit() {
    setDraft({
      name:                       org.name ?? '',
      legalStructure:             (org.legal_structure as LegalStructure) ?? '',
      annualIncomeBand:           org.annual_income_band ?? INCOME_BANDS[0],
      yearsTrading:               org.years_trading != null ? String(org.years_trading) : '',
      orgStage:                   (org.org_stage as OrgStage) ?? '',
      charityNumber:              org.charity_number ?? org.cic_number ?? '',
      alsoIndividualPractitioner: org.also_individual_practitioner ?? false,
    })
    setEditing(true)
    onEditStart()
  }

  function cancel() { setEditing(false); setDraft(null); setSaveError(null); onEditEnd() }

  async function save() {
    if (!draft) return
    setSaving(true); setSaveError(null)
    try {
      await updateOrganisation(orgId, {
        name:                       draft.name.trim() || undefined,
        legal_structure:            draft.legalStructure || undefined,
        annual_income_band:         draft.annualIncomeBand || undefined,
        years_trading:              draft.yearsTrading ? parseInt(draft.yearsTrading) : null,
        org_stage:                  draft.orgStage || undefined,
        charity_number:             draft.charityNumber.trim() || null,
        also_individual_practitioner: draft.alsoIndividualPractitioner,
      })
      setEditing(false); setDraft(null); onEditEnd(); onSaved()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally { setSaving(false) }
  }

  const lsLabel = LEGAL_STRUCTURE_OPTIONS.find(o => o.value === org.legal_structure)?.label
  const stageLabel = ORG_STAGE_OPTIONS.find(o => o.value === org.org_stage)?.label

  return (
    <CardShell
      title="About your organisation"
      cardId="card-about"
      isEditing={editing}
      onEdit={startEdit}
      editDisabled={isEditingOther}
      hasIncomplete={!editing && hasIncomplete}
      footer={editing ? <><CancelBtn onClick={cancel} /><SaveBtn saving={saving} onClick={save} /></> : undefined}
    >
      {editing && draft ? (
        <>
          <FieldRow label="Organisation name">
            <input
              value={draft.name}
              onChange={e => setDraft(p => ({ ...p!, name: e.target.value }))}
              style={inputStyle()}
              placeholder="Your organisation name"
            />
          </FieldRow>
          <FieldRow label="Legal structure">
            <select
              value={draft.legalStructure}
              onChange={e => setDraft(p => ({ ...p!, legalStructure: e.target.value as LegalStructure }))}
              style={{ ...inputStyle(), appearance: 'none' as const }}
            >
              <option value="">Select structure…</option>
              {LEGAL_STRUCTURE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </FieldRow>
          <FieldRow label="Annual income">
            <select
              value={draft.annualIncomeBand}
              onChange={e => setDraft(p => ({ ...p!, annualIncomeBand: e.target.value }))}
              style={{ ...inputStyle(), appearance: 'none' as const }}
            >
              {INCOME_BANDS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Years operating">
            <input
              type="number" min="0" max="200"
              value={draft.yearsTrading}
              onChange={e => setDraft(p => ({ ...p!, yearsTrading: e.target.value }))}
              style={inputStyle({ width: 120 })}
              placeholder="e.g. 7"
            />
          </FieldRow>
          <FieldRow label="Organisation stage">
            <select
              value={draft.orgStage}
              onChange={e => setDraft(p => ({ ...p!, orgStage: e.target.value as OrgStage }))}
              style={{ ...inputStyle(), appearance: 'none' as const }}
            >
              <option value="">Select stage…</option>
              {ORG_STAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Charity / CIC number">
            <input
              value={draft.charityNumber}
              onChange={e => setDraft(p => ({ ...p!, charityNumber: e.target.value }))}
              style={inputStyle({ width: 200 })}
              placeholder="Optional"
            />
          </FieldRow>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: `1px solid ${T.border}`, marginTop: 4 }}>
            <span style={{ fontFamily: UI, fontSize: 13.5, color: T.textSecondary, fontWeight: 500 }}>
              I&apos;m an individual practitioner (not an organisation)
            </span>
            <Toggle enabled={draft.alsoIndividualPractitioner} onToggle={() => setDraft(p => ({ ...p!, alsoIndividualPractitioner: !p!.alsoIndividualPractitioner }))} />
          </div>
          {saveError && <p style={{ fontFamily: BODY, fontSize: 13, color: '#B91C1C', marginTop: 4 }}>{saveError}</p>}
        </>
      ) : (
        <>
          <FieldRow label="Organisation name">
            <span>{org.name || <AddLink label="Add name" onClick={startEdit} />}</span>
          </FieldRow>
          <FieldRow label="Legal structure">
            <span>{lsLabel || <AddLink label="Add legal structure" onClick={startEdit} />}</span>
          </FieldRow>
          <FieldRow label="Annual income">
            <span>{org.annual_income_band || <AddLink label="Add annual income" onClick={startEdit} />}</span>
          </FieldRow>
          <FieldRow label="Years operating">
            <span>{org.years_trading != null ? `${org.years_trading} year${org.years_trading === 1 ? '' : 's'}` : <AddLink label="Add years operating" onClick={startEdit} />}</span>
          </FieldRow>
          <FieldRow label="Organisation stage">
            <span>{stageLabel || <AddLink label="Add stage" onClick={startEdit} />}</span>
          </FieldRow>
          {(org.charity_number || org.cic_number) && (
            <FieldRow label="Registration number">
              <span style={{ fontSize: 13, color: T.textTertiary }}>{org.charity_number ?? org.cic_number}</span>
            </FieldRow>
          )}
          {org.also_individual_practitioner && (
            <FieldRow label="">
              <span style={{ fontFamily: UI, fontSize: 13, color: T.textSecondary, background: T.cream, padding: '3px 10px', borderRadius: 10 }}>
                Individual practitioner
              </span>
            </FieldRow>
          )}
        </>
      )}
    </CardShell>
  )
}

/* ═══════════════════════════════════════════════
   Card 2 — Your focus (sectors + beneficiaries)
   ═══════════════════════════════════════════════ */
interface FocusDraft {
  impactSectors: ImpactSector[]
  nicheTags: string[]
  beneficiaryGroups: BeneficiaryGroup[]
}

function FocusCard({ org, orgId, onSaved, isEditingOther, onEditStart, onEditEnd, triggerOpen, onTriggered, hasIncomplete }: {
  org: Organisation; orgId: string
  onSaved: () => void; isEditingOther: boolean
  onEditStart: () => void; onEditEnd: () => void
  triggerOpen?: boolean; onTriggered?: () => void; hasIncomplete?: boolean
}) {
  const isMobile = useIsMobile()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<FocusDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (triggerOpen && !editing) { startEdit(); onTriggered?.() }
  }, [triggerOpen])

  function startEdit() {
    const sectors = (org.impact_sectors as ImpactSector[]) ?? []
    const valid = validNicheTagsFor(sectors)
    setDraft({
      impactSectors:    sectors,
      nicheTags:        ((org.niche_tags as string[]) ?? []).filter(t => valid.has(t)),
      beneficiaryGroups:(org.beneficiary_groups as BeneficiaryGroup[]) ?? [],
    })
    setEditing(true); onEditStart()
  }
  function cancel() { setEditing(false); setDraft(null); setSaveError(null); onEditEnd() }

  async function save() {
    if (!draft) return
    setSaving(true); setSaveError(null)
    try {
      const valid = validNicheTagsFor(draft.impactSectors)
      await updateOrganisation(orgId, {
        impact_sectors:    draft.impactSectors,
        niche_tags:        draft.nicheTags.filter(t => valid.has(t)),
        beneficiary_groups:draft.beneficiaryGroups,
      })
      setEditing(false); setDraft(null); onEditEnd(); onSaved()
    } catch (e) { setSaveError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  function chipState(arr: string[], val: string): ChipState {
    const i = arr.indexOf(val)
    return i === 0 ? 'primary' : i > 0 ? 'secondary' : 'unselected'
  }

  function toggleSector(s: ImpactSector) {
    setDraft(prev => {
      if (!prev) return prev
      const cur = [...prev.impactSectors]
      const i = cur.indexOf(s)
      if (i === -1) {
        if (cur.length >= 4) return prev
        return { ...prev, impactSectors: [...cur, s] }
      }
      // removing a sector — clear its niche tags too
      const removedTags = (NICHE_TAGS_BY_SECTOR[s] ?? []).map(t => t.value)
      return { ...prev, impactSectors: cur.filter(x => x !== s), nicheTags: prev.nicheTags.filter(t => !removedTags.includes(t)) }
    })
  }
  function makePrimarySector(s: ImpactSector) {
    setDraft(prev => prev ? { ...prev, impactSectors: [s, ...prev.impactSectors.filter(x => x !== s)] } : prev)
  }
  function toggleNicheTag(tag: string) {
    setDraft(prev => {
      if (!prev) return prev
      return prev.nicheTags.includes(tag)
        ? { ...prev, nicheTags: prev.nicheTags.filter(t => t !== tag) }
        : { ...prev, nicheTags: [...prev.nicheTags, tag] }
    })
  }
  function toggleBeneficiary(b: BeneficiaryGroup) {
    setDraft(prev => {
      if (!prev) return prev
      const cur = [...prev.beneficiaryGroups]
      const i = cur.indexOf(b)
      if (i === -1) {
        if (cur.length >= 4) return prev
        return { ...prev, beneficiaryGroups: [...cur, b] }
      }
      return { ...prev, beneficiaryGroups: cur.filter(x => x !== b) }
    })
  }
  function makePrimaryBeneficiary(b: BeneficiaryGroup) {
    setDraft(prev => prev ? { ...prev, beneficiaryGroups: [b, ...prev.beneficiaryGroups.filter(x => x !== b)] } : prev)
  }

  // Read-mode display
  const sectors   = (org.impact_sectors as ImpactSector[]) ?? []
  const validRead = validNicheTagsFor(sectors)
  const nicheTags = ((org.niche_tags as string[]) ?? []).filter(t => validRead.has(t))
  const beneficiaries = (org.beneficiary_groups as BeneficiaryGroup[]) ?? []
  const primarySector = IMPACT_SECTOR_OPTIONS.find(o => o.value === sectors[0])
  const secondarySectors = sectors.slice(1).map(s => IMPACT_SECTOR_OPTIONS.find(o => o.value === s)).filter(Boolean)
  const primaryBeneficiary = BENEFICIARY_OPTIONS.find(o => o.value === beneficiaries[0])
  const secondaryBeneficiaries = beneficiaries.slice(1).map(b => BENEFICIARY_OPTIONS.find(o => o.value === b)).filter(Boolean)

  const pillStyle = (kind: 'sector' | 'beneficiary', isPrimary: boolean): React.CSSProperties => ({
    fontFamily: UI, fontWeight: 500, fontSize: 12.5, padding: '4px 10px', borderRadius: 20,
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: kind === 'sector' ? T.greenBg : T.coralBg,
    color: kind === 'sector' ? T.greenText : T.coralText,
  })

  return (
    <CardShell
      title="Your focus"
      cardId="card-focus"
      isEditing={editing}
      onEdit={startEdit}
      editDisabled={isEditingOther}
      hasIncomplete={!editing && hasIncomplete}
      footer={editing ? <><CancelBtn onClick={cancel} /><SaveBtn saving={saving} onClick={save} /></> : undefined}
    >
      {editing && draft ? (
        <>
          {/* Sector picker */}
          <div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontFamily: UI, fontWeight: 500, fontSize: 13, color: T.textPrimary }}>Impact sectors</span>
              <span style={{ fontFamily: BODY, fontSize: 13, color: T.textTertiary, marginLeft: 6 }}>
                · pick 1 primary + up to 3 others
              </span>
              {draft.impactSectors.length >= 4 && (
                <span style={{ fontFamily: UI, fontSize: 11, color: T.textTertiary, marginLeft: 8 }}>Max reached</span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 6 }}>
              {IMPACT_SECTOR_OPTIONS.map(opt => {
                const cs = chipState(draft.impactSectors, opt.value)
                return (
                  <PickerChip
                    key={opt.value}
                    label={opt.label}
                    chipState={cs}
                    dimmed={draft.impactSectors.length >= 4 && cs === 'unselected'}
                    onClick={() => toggleSector(opt.value)}
                    showMakePrimary={cs === 'secondary'}
                    onMakePrimary={() => makePrimarySector(opt.value)}
                  />
                )
              })}
            </div>
          </div>

          {/* Sub-tag panel */}
          {draft.impactSectors.filter(s => NICHE_TAGS_BY_SECTOR[s]).length > 0 && (
            <div style={{ background: '#F5F1E8', borderLeft: '3px solid #8ECB3C', borderRadius: 8, padding: '12px 14px' }}>
              {draft.impactSectors.filter(s => NICHE_TAGS_BY_SECTOR[s]).map(sector => {
                const opts = NICHE_TAGS_BY_SECTOR[sector]!
                const sLabel = IMPACT_SECTOR_OPTIONS.find(o => o.value === sector)?.label ?? sector
                return (
                  <div key={sector} style={{ marginBottom: 12 }}>
                    <div style={{ fontFamily: UI, fontSize: 11, fontWeight: 600, color: T.textSecondary, marginBottom: 8, letterSpacing: '0.03em' }}>
                      Specialisms in {sLabel} <span style={{ fontWeight: 400, color: T.textTertiary }}>(optional)</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 5 }}>
                      {opts.map(opt => {
                        const selected = draft.nicheTags.includes(opt.value)
                        return (
                          <button
                            key={opt.value}
                            onClick={() => toggleNicheTag(opt.value)}
                            style={{
                              fontSize: 11, fontFamily: BODY, padding: '5px 8px', borderRadius: 6,
                              border: `1.5px solid ${selected ? '#8ECB3C' : '#D9D4C7'}`,
                              background: selected ? '#EEF8D8' : '#FEFCF8',
                              color: selected ? '#3A6B0E' : T.textSecondary,
                              cursor: 'pointer', fontWeight: selected ? 600 : 400,
                              textAlign: 'left' as const, lineHeight: 1.3,
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

          {/* Beneficiary picker */}
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontFamily: UI, fontWeight: 500, fontSize: 13, color: T.textPrimary }}>Who you serve</span>
              <span style={{ fontFamily: BODY, fontSize: 13, color: T.textTertiary, marginLeft: 6 }}>
                · pick 1 primary + up to 3 others
              </span>
              {draft.beneficiaryGroups.length >= 4 && (
                <span style={{ fontFamily: UI, fontSize: 11, color: T.textTertiary, marginLeft: 8 }}>Max reached</span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 6 }}>
              {BENEFICIARY_OPTIONS.map(opt => {
                const cs = chipState(draft.beneficiaryGroups, opt.value)
                return (
                  <PickerChip
                    key={opt.value}
                    label={opt.label}
                    chipState={cs}
                    dimmed={draft.beneficiaryGroups.length >= 4 && cs === 'unselected'}
                    onClick={() => toggleBeneficiary(opt.value)}
                    showMakePrimary={cs === 'secondary'}
                    onMakePrimary={() => makePrimaryBeneficiary(opt.value)}
                  />
                )
              })}
            </div>
          </div>

          {saveError && <p style={{ fontFamily: BODY, fontSize: 13, color: '#B91C1C' }}>{saveError}</p>}
        </>
      ) : (
        <>
          {/* Sectors read mode */}
          <FieldRow label="Primary sector">
            {primarySector ? (
              <div>
                <span style={pillStyle('sector', true)}>
                  <Star size={8} fill="currentColor" color="currentColor" />
                  {primarySector.label}
                </span>
                {/* Sub-tags */}
                {nicheTags.length > 0 && (
                  <div style={{ marginTop: 8, paddingLeft: 14, borderLeft: `2px solid ${T.border}` }}>
                    <div style={{ fontFamily: UI, fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: T.textTertiary, marginBottom: 6 }}>
                      Sub-tags
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {nicheTags.map(tag => {
                        const label = Object.values(NICHE_TAGS_BY_SECTOR).flat().find(t => t.value === tag)?.label ?? tag
                        return (
                          <span key={tag} style={{ fontFamily: UI, fontSize: 12, fontWeight: 500, padding: '3px 9px', borderRadius: 12, background: T.greenBg, color: T.greenText }}>
                            {label}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : <AddLink label="Add primary sector" onClick={startEdit} />}
          </FieldRow>
          {secondarySectors.length > 0 && (
            <FieldRow label="Secondary sectors">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {secondarySectors.map(s => s && (
                  <span key={s.value} style={pillStyle('sector', false)}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.greenText }} />
                    {s.label}
                  </span>
                ))}
              </div>
            </FieldRow>
          )}
          <FieldRow label="Primary beneficiaries">
            {primaryBeneficiary ? (
              <span style={pillStyle('beneficiary', true)}>
                <Star size={8} fill="currentColor" color="currentColor" />
                {primaryBeneficiary.label}
              </span>
            ) : <AddLink label="Add beneficiary group" onClick={startEdit} />}
          </FieldRow>
          {secondaryBeneficiaries.length > 0 && (
            <FieldRow label="Secondary beneficiaries">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {secondaryBeneficiaries.map(b => b && (
                  <span key={b.value} style={pillStyle('beneficiary', false)}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.coralText }} />
                    {b.label}
                  </span>
                ))}
              </div>
            </FieldRow>
          )}
        </>
      )}
    </CardShell>
  )
}

/* ═══════════════════════════════════════════════
   Card 3 — Location and reach
   ═══════════════════════════════════════════════ */
interface LocationDraft { primaryLocation: string; geographicReach: string }

function LocationCard({ org, orgId, onSaved, isEditingOther, onEditStart, onEditEnd, triggerOpen, onTriggered, hasIncomplete }: {
  org: Organisation; orgId: string; onSaved: () => void
  isEditingOther: boolean; onEditStart: () => void; onEditEnd: () => void
  triggerOpen?: boolean; onTriggered?: () => void; hasIncomplete?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<LocationDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (triggerOpen && !editing) { startEdit(); onTriggered?.() }
  }, [triggerOpen])

  function startEdit() {
    setDraft({ primaryLocation: org.primary_location ?? '', geographicReach: org.geographic_reach ?? '' })
    setEditing(true); onEditStart()
  }
  function cancel() { setEditing(false); setDraft(null); setSaveError(null); onEditEnd() }

  async function save() {
    if (!draft) return
    setSaving(true); setSaveError(null)
    try {
      await updateOrganisation(orgId, {
        primary_location: draft.primaryLocation.trim() || null,
        geographic_reach: draft.geographicReach.trim() || null,
      })
      setEditing(false); setDraft(null); onEditEnd(); onSaved()
    } catch (e) { setSaveError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  const locationPill = (text: string) => (
    <span style={{ fontFamily: UI, fontWeight: 500, fontSize: 12.5, padding: '4px 10px', borderRadius: 12, background: '#F0EFEB', color: T.textSecondary, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      📍 {text}
    </span>
  )

  return (
    <CardShell
      title="Location and reach"
      cardId="card-location"
      isEditing={editing}
      onEdit={startEdit}
      editDisabled={isEditingOther}
      hasIncomplete={!editing && hasIncomplete}
      footer={editing ? <><CancelBtn onClick={cancel} /><SaveBtn saving={saving} onClick={save} /></> : undefined}
    >
      {editing && draft ? (
        <>
          <FieldRow label="Primary location">
            <input
              value={draft.primaryLocation}
              onChange={e => setDraft(p => ({ ...p!, primaryLocation: e.target.value }))}
              style={inputStyle()}
              placeholder="e.g. Brighton & Hove, London, Manchester"
            />
          </FieldRow>
          <FieldRow label="Geographic reach">
            <select
              value={draft.geographicReach}
              onChange={e => setDraft(p => ({ ...p!, geographicReach: e.target.value }))}
              style={inputStyle({ appearance: 'auto' as const })}
            >
              <option value="">Select reach…</option>
              {GEOGRAPHIC_REACH_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label} — {o.hint}</option>
              ))}
            </select>
          </FieldRow>
          {saveError && <p style={{ fontFamily: BODY, fontSize: 13, color: '#B91C1C' }}>{saveError}</p>}
        </>
      ) : (
        <>
          <FieldRow label="Primary location">
            {org.primary_location ? locationPill(org.primary_location) : <AddLink label="Add primary location" onClick={startEdit} />}
          </FieldRow>
          <FieldRow label="Geographic reach">
            {org.geographic_reach ? (
              locationPill(GEOGRAPHIC_REACH_OPTIONS.find(o => o.value === org.geographic_reach)?.label ?? String(org.geographic_reach))
            ) : <AddLink label="Add geographic reach" onClick={startEdit} />}
          </FieldRow>
        </>
      )}
    </CardShell>
  )
}

/* ═══════════════════════════════════════════════
   Card 4 — Funding preferences
   ═══════════════════════════════════════════════ */
interface FundingDraft {
  minGrantTarget: string; maxGrantTarget: string
  fundingTypePreferences: FundingType[]
}

function FundingCard({ org, orgId, onSaved, isEditingOther, onEditStart, onEditEnd, triggerOpen, onTriggered, hasIncomplete }: {
  org: Organisation; orgId: string; onSaved: () => void
  isEditingOther: boolean; onEditStart: () => void; onEditEnd: () => void
  triggerOpen?: boolean; onTriggered?: () => void; hasIncomplete?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<FundingDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (triggerOpen && !editing) { startEdit(); onTriggered?.() }
  }, [triggerOpen])

  function startEdit() {
    setDraft({
      minGrantTarget:        org.min_grant_target != null ? String(org.min_grant_target) : '',
      maxGrantTarget:        org.max_grant_target != null ? String(org.max_grant_target) : '',
      fundingTypePreferences:(org.funding_type_preferences as FundingType[]) ?? ['grant', 'programme', 'investment', 'in_kind'],
    })
    setEditing(true); onEditStart()
  }
  function cancel() { setEditing(false); setDraft(null); setSaveError(null); onEditEnd() }

  async function save() {
    if (!draft) return
    setSaving(true); setSaveError(null)
    try {
      await updateOrganisation(orgId, {
        min_grant_target:          draft.minGrantTarget ? parseInt(draft.minGrantTarget.replace(/[^0-9]/g, '')) : null,
        max_grant_target:          draft.maxGrantTarget ? parseInt(draft.maxGrantTarget.replace(/[^0-9]/g, '')) : null,
        funding_type_preferences:  draft.fundingTypePreferences,
      })
      setEditing(false); setDraft(null); onEditEnd(); onSaved()
    } catch (e) { setSaveError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  function toggleFundingType(t: FundingType) {
    setDraft(prev => {
      if (!prev) return prev
      return {
        ...prev,
        fundingTypePreferences: prev.fundingTypePreferences.includes(t)
          ? prev.fundingTypePreferences.filter(x => x !== t)
          : [...prev.fundingTypePreferences, t],
      }
    })
  }

  const minFmt = fmtThousands(org.min_grant_target)
  const maxFmt = fmtThousands(org.max_grant_target)
  const sizeLabel = minFmt && maxFmt ? `${minFmt} – ${maxFmt}` : minFmt || maxFmt || null

  const ftLabels = ((org.funding_type_preferences as FundingType[]) ?? [])
    .map(t => FUNDING_TYPE_OPTIONS.find(o => o.value === t)?.label).filter(Boolean)

  return (
    <CardShell
      title="Funding preferences"
      cardId="card-funding"
      isEditing={editing}
      onEdit={startEdit}
      editDisabled={isEditingOther}
      hasIncomplete={!editing && hasIncomplete}
      footer={editing ? <><CancelBtn onClick={cancel} /><SaveBtn saving={saving} onClick={save} /></> : undefined}
    >
      {editing && draft ? (
        <>
          <FieldRow label="Grant size range">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontFamily: BODY, fontSize: 15, color: T.textTertiary }}>£</span>
                <input
                  type="text" inputMode="numeric"
                  value={draft.minGrantTarget}
                  onChange={e => setDraft(p => ({ ...p!, minGrantTarget: e.target.value.replace(/[^0-9]/g, '') }))}
                  style={{ ...inputStyle(), paddingLeft: 22 }}
                  placeholder="Min"
                />
              </div>
              <span style={{ color: T.textTertiary, flexShrink: 0 }}>–</span>
              <div style={{ position: 'relative', flex: 1 }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontFamily: BODY, fontSize: 15, color: T.textTertiary }}>£</span>
                <input
                  type="text" inputMode="numeric"
                  value={draft.maxGrantTarget}
                  onChange={e => setDraft(p => ({ ...p!, maxGrantTarget: e.target.value.replace(/[^0-9]/g, '') }))}
                  style={{ ...inputStyle(), paddingLeft: 22 }}
                  placeholder="Max"
                />
              </div>
            </div>
          </FieldRow>
          <FieldRow label="Funding types">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
              {FUNDING_TYPE_OPTIONS.map(opt => {
                const selected = draft.fundingTypePreferences.includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    onClick={() => toggleFundingType(opt.value)}
                    style={{
                      fontFamily: UI, fontWeight: selected ? 600 : 400, fontSize: 13,
                      padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                      border: `1.5px solid ${selected ? T.greenMid : T.borderStrong}`,
                      background: selected ? T.greenBg : T.white, color: selected ? T.greenText : T.textSecondary,
                      textAlign: 'left' as const, transition: 'all 0.12s',
                    }}
                  >
                    {selected && <Check size={12} style={{ display: 'inline', marginRight: 6 }} />}
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </FieldRow>
          {saveError && <p style={{ fontFamily: BODY, fontSize: 13, color: '#B91C1C' }}>{saveError}</p>}
        </>
      ) : (
        <>
          <FieldRow label="Grant size range">
            <span>{sizeLabel || <AddLink label="Add grant size range" onClick={startEdit} />}</span>
          </FieldRow>
          <FieldRow label="Funding types">
            {ftLabels.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ftLabels.map(label => (
                  <span key={label} style={{ fontFamily: UI, fontWeight: 500, fontSize: 12.5, padding: '4px 10px', borderRadius: 12, background: T.cream, color: T.creamText }}>
                    {label}
                  </span>
                ))}
              </div>
            ) : <AddLink label="Add funding types" onClick={startEdit} />}
          </FieldRow>
        </>
      )}
    </CardShell>
  )
}

/* ═══════════════════════════════════════════════
   Card 5 — Your story (mission)
   ═══════════════════════════════════════════════ */
function StoryCard({ org, orgId, onSaved, isEditingOther, onEditStart, onEditEnd, triggerOpen, onTriggered, hasIncomplete }: {
  org: Organisation; orgId: string; onSaved: () => void
  isEditingOther: boolean; onEditStart: () => void; onEditEnd: () => void
  triggerOpen?: boolean; onTriggered?: () => void; hasIncomplete?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [mission, setMission] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const hasMission = !!org.mission?.trim()

  useEffect(() => {
    if (triggerOpen && !editing) { startEdit(); onTriggered?.() }
  }, [triggerOpen])

  function startEdit() {
    setMission(org.mission ?? '')
    setEditing(true); onEditStart()
  }
  function cancel() { setEditing(false); setSaveError(null); onEditEnd() }

  async function save() {
    setSaving(true); setSaveError(null)
    try {
      await updateOrganisation(orgId, { mission: mission.trim() || null })
      setEditing(false); onEditEnd(); onSaved()
    } catch (e) { setSaveError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  const quickWinBadge = !hasMission && !editing ? (
    <span style={{ fontFamily: UI, fontWeight: 500, fontSize: 12, color: '#854F0B', padding: '3px 10px', background: '#FAEEDA', borderRadius: 10 }}>
      Quick win
    </span>
  ) : null

  const storyBorder = editing ? T.greenDeep : (!hasMission && hasIncomplete) ? '#C97B1A' : hasMission ? T.border : 'rgba(142,203,60,0.2)'
  return (
    <section id="card-story" style={{
      background: hasMission ? T.white : 'linear-gradient(135deg, #FDFCF7 0%, #F8F5EC 100%)',
      border: `1px solid ${storyBorder}`,
      borderRadius: 12, overflow: 'hidden',
      boxShadow: editing ? '0 0 0 3px rgba(23,52,4,0.05)' : (!hasMission && hasIncomplete) ? '0 0 0 3px rgba(201,123,26,0.06)' : 'none',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }}>
      {/* Header */}
      <div style={{ padding: '18px 24px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontFamily: UI, fontWeight: 600, fontSize: 17, color: T.textPrimary, letterSpacing: '-0.01em' }}>Your story</h2>
          {quickWinBadge}
          {editing && <span style={{ fontFamily: UI, fontWeight: 500, fontSize: 12, color: T.greenDeep, padding: '3px 10px', background: T.cream, borderRadius: 10 }}>Editing</span>}
        </div>
        {!editing && (
          <button
            onClick={startEdit}
            disabled={isEditingOther}
            style={{
              fontFamily: UI, fontWeight: 500, fontSize: 13,
              color: isEditingOther ? T.textTertiary : T.textSecondary,
              background: 'transparent', border: 'none', cursor: isEditingOther ? 'not-allowed' : 'pointer',
              padding: '6px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Pencil size={14} />
            Edit
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '0 24px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {editing ? (
          <>
            <textarea
              value={mission}
              onChange={e => setMission(e.target.value)}
              rows={5}
              style={{ ...inputStyle(), resize: 'vertical', lineHeight: 1.6 }}
              placeholder="Describe what your organisation does, who you serve, and the change you want to see…"
            />
            {saveError && <p style={{ fontFamily: BODY, fontSize: 13, color: '#B91C1C' }}>{saveError}</p>}
          </>
        ) : hasMission ? (
          <p style={{ fontFamily: BODY, fontSize: 15, color: T.textPrimary, lineHeight: 1.65, margin: 0 }}>
            {org.mission}
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '4px 0 8px' }}>
            <div style={{
              flexShrink: 0, width: 36, height: 36, background: T.lime, borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.greenDeep,
            }}>
              <Star size={18} fill="currentColor" />
            </div>
            <div>
              <p style={{ fontFamily: BODY, fontSize: 14, color: T.textSecondary, marginBottom: 12, lineHeight: 1.55 }}>
                A short mission statement helps us match you to funders whose language and values align with yours.
                Funders increasingly look for this signal.
              </p>
              <button
                onClick={startEdit}
                style={{
                  fontFamily: UI, fontWeight: 500, fontSize: 13.5,
                  background: T.lime, color: T.greenDeep, border: 'none',
                  padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                }}
              >
                Add mission statement
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {editing && (
        <div style={{ padding: '14px 24px', background: T.pageBg, borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <CancelBtn onClick={cancel} />
          <SaveBtn saving={saving} onClick={save} />
        </div>
      )}
    </section>
  )
}

/* ═══════════════════════════════════════════════
   Main component
   ═══════════════════════════════════════════════ */
export default function ProfilePage() {
  const isMobile = useIsMobile()
  const [orgs, setOrgs] = useState<Organisation[]>([])
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingCard, setEditingCard] = useState<CardId | null>(null)
  const [jumpTarget, setJumpTarget] = useState<CardId | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const activeOrg = orgs.find(o => o.id === activeOrgId) ?? orgs[0] ?? null

  async function loadOrgs(keepActiveId?: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const allOrgs = await getOrganisationsByOwner(user.id)
    setOrgs(allOrgs)

    // Restore active org from localStorage, fall back to first
    const stored = typeof window !== 'undefined' ? localStorage.getItem('gt_active_org_id') : null
    const activeId = keepActiveId ?? stored ?? allOrgs[0]?.id ?? null
    if (activeId && allOrgs.find(o => o.id === activeId)) {
      setActiveOrgId(activeId)
    } else if (allOrgs[0]) {
      setActiveOrgId(allOrgs[0].id)
    }
  }

  useEffect(() => {
    loadOrgs().finally(() => setLoading(false))
  }, [])

  function switchOrg(id: string) {
    setActiveOrgId(id)
    if (typeof window !== 'undefined') localStorage.setItem('gt_active_org_id', id)
    setEditingCard(null)
  }

  function startEditing(card: CardId) {
    setEditingCard(card)
  }
  function stopEditing() {
    setEditingCard(null)
  }
  function onJumpToCard(card: CardId) {
    setJumpTarget(card)
    setEditingCard(card)
    setTimeout(() => {
      const el = document.getElementById(`card-${card}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
  }
  async function handleDeleteOrg() {
    if (!activeOrg) return
    setDeleting(true)
    try {
      await deleteOrganisation(activeOrg.id)
      const remaining = orgs.filter(o => o.id !== activeOrg.id)
      setOrgs(remaining)
      const nextId = remaining[0]?.id ?? null
      setActiveOrgId(nextId)
      if (typeof window !== 'undefined') {
        if (nextId) localStorage.setItem('gt_active_org_id', nextId)
        else localStorage.removeItem('gt_active_org_id')
      }
      setShowDeleteConfirm(false)
      setEditingCard(null)
      if (!nextId) window.location.href = '/onboarding/wizard'
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    } finally { setDeleting(false) }
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFAF7' }}>
        <p style={{ fontFamily: UI, fontSize: 14, color: '#8A8986' }}>Loading…</p>
      </div>
    )
  }

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault()
    if (!newOrgName.trim()) return
    setCreating(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: created } = await supabase
      .from('organisations')
      .insert({ name: newOrgName.trim(), owner_id: user.id })
      .select()
      .single()
    if (created) {
      await loadOrgs(created.id)
      setEditingCard('about')
    }
    setCreating(false)
  }

  if (!activeOrg) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFAF7', padding: 24 }}>
        <div style={{ maxWidth: 440, width: '100%' }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 28, letterSpacing: '-0.02em', color: '#2C2C2A', marginBottom: 8 }}>
            {"Let's set up your profile"}
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: '#5F5E5A', marginBottom: 32 }}>
            {"Start with your organisation name and we'll walk you through the rest."}
          </p>
          <form onSubmit={handleCreateOrg}>
            <label style={{ display: 'block', fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: 13, color: '#2C2C2A', marginBottom: 6 }}>
              Organisation name
            </label>
            <input
              type="text"
              value={newOrgName}
              onChange={e => setNewOrgName(e.target.value)}
              placeholder="e.g. AudioActive"
              required
              style={{ display: 'block', width: '100%', padding: '10px 14px', border: '1.5px solid rgba(23,52,4,0.14)', borderRadius: 10, fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: '#2C2C2A', background: '#fff', marginBottom: 16, boxSizing: 'border-box' as const }}
            />
            <button
              type="submit"
              disabled={creating || !newOrgName.trim()}
              style={{ width: '100%', padding: '11px 0', background: '#8ECB3C', color: '#173404', border: 'none', borderRadius: 10, fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: (creating || !newOrgName.trim()) ? 0.6 : 1 }}
            >
              {creating ? 'Creating\u2026' : 'Continue \u2192'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  const { missing: missingFields } = computeCompleteness(activeOrg)
  const incompleteCards = new Set(missingFields.map(m => FIELD_TO_CARD[m.label]).filter(Boolean) as CardId[])

  const cardProps = (id: CardId) => ({
    org: activeOrg,
    orgId: activeOrg.id,
    onSaved: () => loadOrgs(activeOrg.id),
    isEditingOther: editingCard !== null && editingCard !== id,
    onEditStart: () => startEditing(id),
    onEditEnd: stopEditing,
    triggerOpen: jumpTarget === id,
    onTriggered: () => setJumpTarget(null),
    hasIncomplete: incompleteCards.has(id),
  })

  return (
    <div style={{ flex: 1, background: T.pageBg, overflowY: 'auto' }}>
      <div style={{ padding: isMobile ? '24px 16px 60px' : '40px 48px 80px', maxWidth: 920, margin: '0 auto' }}>

        {/* Page header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: isMobile ? 28 : 36, letterSpacing: '-0.02em', color: '#2C2C2A', lineHeight: 1.1, margin: '0 0 6px' }}>
            Your profile
          </h1>
          <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: isMobile ? 10 : 16, flexDirection: isMobile ? 'column' : 'row' }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: '#5F5E5A', margin: 0 }}>
              Refine the details that drive your funding matches.
            </p>
            {/* Org eyebrow pill — context for single-org users */}
            {orgs.length <= 1 && activeOrg && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0,
                fontFamily: UI, fontWeight: 500, fontSize: 13, color: T.textSecondary,
                padding: '5px 10px 5px 5px',
                background: T.white, border: `1px solid ${T.border}`, borderRadius: 20,
              }}>
                <span style={{
                  width: 22, height: 22, background: T.cream, borderRadius: '50%',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: UI, fontWeight: 600, fontSize: 10, color: T.greenDeep,
                }}>
                  {(activeOrg.name ?? 'O').split(' ').filter(Boolean).slice(0,2).map((w: string) => w[0].toUpperCase()).join('')}
                </span>
                {activeOrg.name}
              </div>
            )}
          </div>
        </div>

        {/* Org switcher — admin only */}
        {orgs.length > 1 && (
          <OrgSwitcher
            orgs={orgs}
            activeOrgId={activeOrg.id}
            onSwitch={switchOrg}
          />
        )}

        {/* Completion meter */}
        <CompletionMeter org={activeOrg} onJumpToCard={onJumpToCard} />

        <ScanBar orgId={activeOrg.id} website={activeOrg.website_url} onSaved={() => loadOrgs(activeOrg.id)} />

        {/* Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <AboutCard   {...cardProps('about')} />
          <FocusCard   {...cardProps('focus')} />
          <LocationCard {...cardProps('location')} />
          <FundingCard  {...cardProps('funding')} />
          <StoryCard    {...cardProps('story')} />
        </div>

        {/* Delete org danger zone */}
        <div style={{ marginTop: 40, paddingTop: 24, borderTop: `1px solid ${T.border}` }}>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                fontFamily: UI, fontWeight: 500, fontSize: 13,
                color: '#B94040', background: 'transparent',
                border: '1px solid rgba(185,64,64,0.25)', borderRadius: 8,
                padding: '8px 16px', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <Trash2 size={14} />
              Delete this organisation
            </button>
          ) : (
            <div style={{
              background: '#FEF2F2', border: '1px solid rgba(185,64,64,0.3)',
              borderRadius: 10, padding: '18px 20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
                <AlertTriangle size={16} style={{ color: '#B94040', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 14, color: '#7A2020', marginBottom: 4 }}>
                    Delete &ldquo;{activeOrg.name}&rdquo;?
                  </div>
                  <div style={{ fontFamily: BODY, fontSize: 13, color: '#9A4040', lineHeight: 1.5 }}>
                    This will permanently remove the organisation, its profile, and all pipeline records. This cannot be undone.
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleDeleteOrg}
                  disabled={deleting}
                  style={{
                    fontFamily: UI, fontWeight: 600, fontSize: 13,
                    background: '#B94040', color: '#fff',
                    border: 'none', borderRadius: 8,
                    padding: '8px 18px', cursor: deleting ? 'not-allowed' : 'pointer',
                    opacity: deleting ? 0.7 : 1,
                  }}
                >
                  {deleting ? 'Deleting…' : 'Yes, delete it'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  style={{
                    fontFamily: UI, fontWeight: 500, fontSize: 13,
                    background: 'transparent', color: '#7A2020',
                    border: '1px solid rgba(185,64,64,0.25)', borderRadius: 8,
                    padding: '8px 16px', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

{/* Footer */}
        <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${T.border}`, display: 'flex', gap: 20, fontFamily: UI, fontSize: 13, color: T.textTertiary }}>
          <a href="/dashboard/settings" style={{ color: T.textSecondary, textDecoration: 'none' }}>
            Account &amp; notifications →
          </a>
        </div>

      </div>
    </div>
  )
}

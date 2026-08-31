'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getOrganisationsByOwner, updateOrganisation, deleteOrganisation, writeActiveOrgCookie } from '@/lib/organisations'
import { Pencil, Plus, ChevronDown, RotateCcw, Globe, Check, X, Star, Trash2, AlertTriangle, MapPin } from 'lucide-react'
import type { Organisation, LegalStructure, OrgStage, ImpactSector, FundingType, FunderType, BeneficiaryGroup } from '@/types'
import { useIsMobile } from '@/hooks/useIsMobile'
import { trimMission, formatCurrency } from '@/lib/utils'
import ClearProfileButton from '@/app/dashboard/admin/ClearProfileButton'
import CoreContentSection from '@/components/builder/CoreContentSection'
import { typeColour } from '@/lib/funding-type-colours'
import { computeCompleteness, FIELD_TO_CARD, type ProfileCardId } from '@/lib/profile-completeness'

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

/* ═══════════════════════════════════════════════
   Design tokens
   ═══════════════════════════════════════════════ */
/**
 * This page's own token set. It is the sixth in the app — the dashboard, Find
 * Funding, pipeline, deadlines and builder/tokens.ts all have their own. Worth
 * consolidating one day; the rule for now is simply not to add a seventh.
 *
 * NOTHING HERE IS SHARED. builder/tokens.ts, which the "Your material" section
 * reads from, is shared with the application workspace and is deliberately
 * untouched by this pass.
 */
const T = {
  deep:          '#1D3C3E',
  creamLabel:    '#F6F1E7',   // label on a deep fill
  cream:         '#F5F1E8',
  warmNeutral:   '#F1EDE3',
  white:         '#FFFFFF',
  textPrimary:   '#2C2C2A',
  textSecondary: '#5F5E5A',
  // Was #8A8986: 3.50 on white and 3.35 on the old page ground, both failing.
  textTertiary:  '#74736E',   // 4.75
  border:        'rgba(29, 60, 62, 0.10)',
  borderStrong:  'rgba(29, 60, 62, 0.24)',
  /** Bar tracks. Identical to the Projects bar so the two agree. */
  track:         'rgba(29, 60, 62, 0.15)',
  /** High-impact marker. --deep on it measures 7.71. */
  gold:          '#EBCE78',
  // Pill families
  greenBg:       '#E8F2D8',
  greenText:     '#3F6018',
  coralBg:       '#FAECE7',
  coralText:     '#993C1D',
}

/*
 * The completion tier palette that used to live here is GONE, not re-stepped.
 * It was a single-hue-per-tier sequential ramp keyed to the percentage, and
 * all three tiers failed: #639922 on #F4F9ED measured 3.21, #5A9080 on #F0F5F3
 * 3.32, #808580 on #F4F6F4 3.46, with an 11px uppercase label that is normal
 * text in every case. There is no rescue by re-stepping — three tints that
 * pale cannot each carry a passing foreground.
 *
 * The number already says how complete the profile is. Colouring the container
 * three ways to say it again is what made it the least legible element on the
 * page. Colour moves to the missing-field chips instead, where it is
 * actionable and where high-vs-normal is a two-value CATEGORY rather than a
 * ramp, which is a job colour can actually do.
 */

const UI  = 'var(--font-space-grotesk)'
const BODY = 'var(--font-dm-sans)'

/* ═══════════════════════════════════════════════
   Field → card mapping for jump-to-edit
   ───────────────────────────────────────────────
   Both the mapping and computeCompleteness() now live in
   src/lib/profile-completeness.ts. They moved out on 2026-08-31 because the
   weekly digest needs the same ranking, and a page file cannot export one — so
   the choice was a shared module or a second ranking that would drift.
   ═══════════════════════════════════════════════ */
type CardId = ProfileCardId

/* ═══════════════════════════════════════════════
   Option data
   ═══════════════════════════════════════════════ */
const LEGAL_STRUCTURE_OPTIONS: { value: LegalStructure; label: string }[] = [
  { value: 'cic_guarantee',      label: 'CIC — Limited by Guarantee' },
  { value: 'cic_shares',         label: 'CIC — Limited by Shares' },
  { value: 'cio',                label: 'Charitable Incorporated Organisation (CIO)' },
  { value: 'scio',               label: 'Scottish Charitable Incorporated Organisation (SCIO)' },
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
  { value: 'justice',           label: 'Human Rights, Justice & Democracy' },
  { value: 'tech',              label: 'Tech for Good' },
  { value: 'financial',         label: 'Financial Inclusion' },
  { value: 'food',              label: 'Food & Agriculture' },
  { value: 'international',     label: 'International & Fair Trade' },
  { value: 'social_economy',    label: 'Co-ops & Community Ownership' },
  { value: 'social_innovation', label: 'Social Innovation & Systems Change' },
]

const NICHE_TAGS_BY_SECTOR: Partial<Record<ImpactSector, { value: string; label: string }[]>> = {
  creative:         [
    { value: 'music',           label: 'Music' }, { value: 'theatre',       label: 'Theatre & Drama' },
    { value: 'dance',           label: 'Dance' }, { value: 'visual_arts',   label: 'Visual Arts' },
    { value: 'film_media',      label: 'Film & Media' }, { value: 'literature', label: 'Literature & Writing' },
    { value: 'crafts',          label: 'Crafts & Making' }, { value: 'circus_street', label: 'Circus & Street Arts' },
    { value: 'digital_arts',    label: 'Digital Arts & Creative Technology' },
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
  community:        [
    { value: 'place_based',         label: 'Place-Based' },
    { value: 'bame_community',      label: 'BAME / Global Majority Communities' },
    { value: 'faith_community',     label: 'Faith Communities' },
    { value: 'lgbtq_community',     label: 'LGBTQ+ Communities' },
    { value: 'intergenerational',   label: 'Intergenerational' },
    { value: 'neighbourhood',       label: 'Neighbourhood & Hyperlocal' },
  ],
  health:           [
    { value: 'chronic_illness',     label: 'Chronic Illness' },
    { value: 'preventive_health',   label: 'Preventive Health' },
    { value: 'public_health',       label: 'Public Health' },
    { value: 'end_of_life',         label: 'End-of-Life Care' },
    { value: 'health_research',     label: 'Health Research' },
    { value: 'patient_advocacy',    label: 'Patient Advocacy' },
  ],
  mental_health:    [
    { value: 'youth_mh',            label: 'Youth Mental Health' },
    { value: 'adult_mh',            label: 'Adult Mental Health' },
    { value: 'crisis_response',     label: 'Crisis Response' },
    { value: 'peer_support',        label: 'Peer Support' },
    { value: 'suicide_prevention',  label: 'Suicide Prevention' },
    { value: 'trauma_recovery',     label: 'Trauma Recovery' },
  ],
  housing:          [
    { value: 'rough_sleeping',          label: 'Rough Sleeping' },
    { value: 'supported_housing',       label: 'Supported Housing' },
    { value: 'social_housing',          label: 'Social Housing' },
    { value: 'homelessness_prevention', label: 'Homelessness Prevention' },
    { value: 'housing_advice',          label: 'Housing Advice' },
    { value: 'refugee_housing',         label: 'Refugee & Migrant Housing' },
  ],
  employment:       [
    { value: 'skills_training',         label: 'Skills Training' },
    { value: 'careers_advice',          label: 'Careers Advice' },
    { value: 'supported_employment',    label: 'Supported Employment' },
    { value: 'returning_to_work',       label: 'Returning to Work' },
    { value: 'entrepreneurship',        label: 'Entrepreneurship' },
    { value: 'workplace_inclusion',     label: 'Workplace Inclusion' },
  ],
  disability:       [
    { value: 'learning_disability',     label: 'Learning Disability' },
    { value: 'physical_disability',     label: 'Physical Disability' },
    { value: 'sensory_impairment',      label: 'Sensory Impairment' },
    { value: 'autism',                  label: 'Autism' },
    { value: 'neurodiversity',          label: 'Neurodiversity' },
    { value: 'accessibility',           label: 'Accessibility & Inclusion' },
  ],
  older_people:     [
    { value: 'social_isolation',        label: 'Social Isolation' },
    { value: 'dementia',                label: 'Dementia' },
    { value: 'end_of_life_care',        label: 'End-of-Life Care' },
    { value: 'age_friendly',            label: 'Age-Friendly Communities' },
    { value: 'intergenerational',       label: 'Intergenerational' },
    { value: 'falls_prevention',        label: 'Falls Prevention' },
  ],
  women:            [
    { value: 'vawg',                    label: 'Violence Against Women & Girls' },
    { value: 'women_in_leadership',     label: 'Women in Leadership' },
    { value: 'reproductive_health',     label: 'Reproductive Health' },
    { value: 'girls_empowerment',       label: 'Girls Empowerment' },
    { value: 'women_at_work',           label: 'Women in the Workplace' },
  ],
  justice:          [
    { value: 'criminal_justice',        label: 'Criminal Justice Reform' },
    { value: 'civil_liberties',         label: 'Civil Liberties' },
    { value: 'refugee_rights',          label: 'Refugee Rights' },
    { value: 'prisoner_support',        label: 'Prisoner & Family Support' },
    { value: 'voter_engagement',        label: 'Voter Engagement' },
    { value: 'advocacy',                label: 'Advocacy & Legal Aid' },
  ],
  tech:             [
    { value: 'digital_inclusion',       label: 'Digital Inclusion' },
    { value: 'civic_tech',              label: 'Civic Tech' },
    { value: 'ai_responsibility',       label: 'AI & Responsibility' },
    { value: 'data_for_good',           label: 'Data for Good' },
    { value: 'edtech',                  label: 'EdTech' },
    { value: 'healthtech',              label: 'HealthTech' },
  ],
  financial:        [
    { value: 'debt_advice',             label: 'Debt Advice' },
    { value: 'financial_education',     label: 'Financial Education' },
    { value: 'credit_unions',           label: 'Credit Unions' },
    { value: 'fuel_poverty',            label: 'Fuel Poverty' },
    { value: 'savings_promotion',       label: 'Savings Promotion' },
  ],
  food:             [
    { value: 'food_poverty',            label: 'Food Poverty' },
    { value: 'sustainable_food',        label: 'Sustainable Food' },
    { value: 'community_kitchens',      label: 'Community Kitchens' },
    { value: 'food_growing',            label: 'Community Food Growing' },
    { value: 'food_systems',            label: 'Food Systems' },
  ],
  international:    [
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
  { value: 'social_impact_orgs', label: 'Social impact organisations' },
  { value: 'general_public',    label: 'General public' },
]

const FUNDING_TYPE_OPTIONS: { value: FundingType; label: string }[] = [
  { value: 'grant',      label: 'Grants & Awards' },
  { value: 'programme',  label: 'Programmes' },
  { value: 'investment', label: 'Social Investment' },
  { value: 'in_kind',    label: 'In-Kind Support' },
]

// Funder type preferences — multi-select picker on the profile editor.
// Used by the matcher's funder type dimension (max 8). Org-level preference;
// each grant carries its own single funder_type. Descriptions surface as
// native tooltips on hover.
const FUNDER_TYPE_OPTIONS: { value: FunderType; label: string; description: string }[] = [
  { value: 'trust_foundation',     label: 'Trust / Foundation',
    description: 'Independent grant-making trusts and foundations (e.g. Esmée Fairbairn, Lloyds Bank Foundation, Garfield Weston). The bulk of UK charitable funding sits here.' },
  { value: 'community_foundation', label: 'Community Foundation',
    description: 'Place-based funders that pool donations from local donors and grant within a specific geography (e.g. London Community Foundation, Foundation Scotland, Quartet Community Foundation).' },
  { value: 'corporate_foundation', label: 'Corporate Foundation',
    description: 'Charitable foundations established by a company but legally separate from it (e.g. Aviva Foundation, Co-op Foundation, Lloyds Bank Foundation).' },
  { value: 'corporate',            label: 'Corporate Direct',
    description: 'Funding given directly by a company itself rather than through its foundation — e.g. employee-volunteering grants, community partnership funds, sponsorship.' },
  { value: 'lottery',              label: 'Lottery',
    description: 'National Lottery distributors: National Lottery Community Fund, Heritage Fund, Arts Council, Sport England (lottery-funded streams).' },
  { value: 'government',           label: 'Government',
    description: 'Central UK government departments and arms-length bodies — DCMS, DLUHC, UKRI, devolved nations governments.' },
  { value: 'local_authority',      label: 'Local Authority',
    description: 'Councils — borough, county, city or unitary — distributing grants from their own budgets or passing through national funding streams.' },
  { value: 'housing_association',  label: 'Housing Association',
    description: 'Registered providers of social housing that fund community initiatives in or around their estates (e.g. Peabody, Clarion Futures, Notting Hill Genesis).' },
  { value: 'capacity_builder',     label: 'Capacity Builder',
    description: 'Infrastructure charities that provide pro-bono or in-kind support — strategy advice, marketing, tech, leadership development — instead of cash (e.g. Pilotlight, Superhighways, CAST, NPC).' },
  { value: 'competition',          label: 'Competition / Award',
    description: 'Prize-based funding, pitch competitions, innovation challenges, awards (e.g. Nesta challenges, AccelerateHer, The Hub Award).' },
  { value: 'loan',                 label: 'Social Loan',
    description: 'Repayable social finance — interest-free or low-interest loans aimed at social-purpose orgs (e.g. Key Fund, Social Investment Business).' },
  { value: 'crowdfund_match',      label: 'Crowdfund Match',
    description: 'Funders that match money you raise via crowdfunding platforms — typically pound-for-pound up to a cap (e.g. Crowdfunder match funds, council match programmes).' },
  { value: 'other',                label: 'Other',
    description: 'Any funder type that doesn’t fit the categories above.' },
]

/** Derive the three eligibility flags from a legal structure. Mirrors the
 *  onboarding wizard helper so the profile editor uses the same logic when
 *  the user clicks "Auto-fill from structure" on the About card. */
function deriveEligibilityFlagsFromStructure(s: LegalStructure | ''): {
  has_asset_lock:           boolean | null
  social_mission_declared:  boolean
  articles_restrict_profit: boolean
} {
  switch (s) {
    case 'registered_charity':
    case 'cio':
    case 'scio':
    case 'cic_guarantee':
    case 'cooperative':
      return { has_asset_lock: true,  social_mission_declared: true,  articles_restrict_profit: true  }
    case 'cic_shares':
      return { has_asset_lock: true,  social_mission_declared: true,  articles_restrict_profit: false }
    case 'ltd_guarantee':
      // Ltd-by-guarantee orgs on Grant Tracker are overwhelmingly social
      // enterprises with mission-locked articles. Default to all three true
      // so they're not silently excluded from non-charity funding; user
      // can untick if their articles don't include these locks.
      return { has_asset_lock: true,  social_mission_declared: true,  articles_restrict_profit: true  }
    default:
      return { has_asset_lock: null,  social_mission_declared: false, articles_restrict_profit: false }
  }
}

/* Completeness logic now lives in src/lib/profile-completeness.ts — imported
   at the top of this file. See the note beside CardId above. */

function fmtThousands(v: string | number | null | undefined): string {
  if (!v && v !== 0) return ''
  const n = typeof v === 'string' ? parseInt(v.replace(/[^0-9]/g, '')) : v
  if (isNaN(n)) return ''
  // `Math.round(n / 1000)` rounded £2,500 up to "£3k". One implementation now —
  // see the note on formatCurrency.
  return formatCurrency(n)
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
        color: hov ? T.deep : T.textTertiary,
        cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 4,
        borderBottom: hov ? `1px solid ${T.deep}` : '1px dashed transparent',
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
        background: enabled ? T.deep : '#E0DFD9', transition: 'background 0.2s ease', flexShrink: 0,
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

  /**
   * DIMMED NO LONGER MEANS FADED, and that was the serious bug here.
   *
   * `opacity: 0.4` was applied to every unselected option once the four-item
   * max was reached. On top of the tertiary grey that composited to #D0D0CF —
   * 1.54 — and the border to 1.11. Ten of the fourteen sectors became
   * unreadable at exactly the moment the user needed to read them: you hit the
   * max, and the only way to change your mind is to compare what you picked
   * against what you did not. The dimming hid the comparison.
   *
   * Locked options now stay fully legible — white fill, hairline, placeholder
   * label at 4.75 — and "you cannot add another" is carried by the cursor and
   * by the count beside the section heading. Unavailable is a fact about the
   * click, not a reason to hide the word.
   *
   * The unselected chip also gets a FILL. Its border was rgba(23,52,4,.14),
   * which measures 1.30 against white, so the grid was a field of invisible
   * outlines.
   */
  const bg = isPrimary ? T.deep
    : isSecondary ? T.greenBg
    : dimmed ? T.white
    : hov ? '#EAE6DA' : T.warmNeutral
  const color = isPrimary ? T.creamLabel
    : isSecondary ? T.greenText
    : dimmed ? T.textTertiary : T.deep
  const border = isPrimary ? T.deep
    : isSecondary ? T.greenText
    : dimmed ? T.borderStrong : 'transparent'

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onClick}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          width: '100%', padding: '8px 12px', borderRadius: 999,
          border: `1px solid ${border}`,
          background: bg, color, cursor: dimmed ? 'not-allowed' : 'pointer',
          fontFamily: UI, fontSize: 12.5, fontWeight: isSelected ? 600 : 500,
          display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.12s',
        }}
      >
        {/* The star is the only thing separating primary from secondary for a
            colourblind user, since the two differ mainly in lightness. */}
        {isPrimary && (
          <Star size={10} fill="currentColor" color="currentColor" style={{ flexShrink: 0 }} />
        )}
        {isSecondary && (
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.greenText, flexShrink: 0 }} />
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {/* "Set as primary" lives INSIDE the chip, at its right edge.
            It used to be an always-rendered absolutely-positioned button at
            top:-6 right:-6, so with three secondary chips there were three of
            them on screen, each covering the chip in the row above, and the
            right-hand column's was clipped by the card edge. No overlap, no
            clipping, no z-index. The tooltip carries the meaning, the star
            carries the affordance. */}
        {showMakePrimary && (
          <span
            role="button"
            tabIndex={0}
            title="Set as primary"
            onClick={e => { e.stopPropagation(); onMakePrimary?.() }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onMakePrimary?.() } }}
            style={{
              marginLeft: 'auto', width: 24, height: 24, borderRadius: 999, flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.7)', color: T.deep, cursor: 'pointer',
            }}
          >
            <Star size={11} />
          </span>
        )}
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Org Switcher
   ═══════════════════════════════════════════════ */
function OrgSwitcher({ orgs, activeOrgId, onSwitch, canAddOrganisation }: {
  canAddOrganisation: boolean
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
            fontFamily: UI, fontWeight: 600, fontSize: 14, color: T.deep, flexShrink: 0,
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
            <span style={{ fontFamily: UI, fontSize: 12.5, color: T.textTertiary, padding: '3px 8px', background: T.warmNeutral, borderRadius: 10, marginLeft: 4, flexShrink: 0 }}>
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
                  width: 28, height: 28, background: T.warmNeutral, border: `1px solid ${T.border}`, borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: UI, fontWeight: 600, fontSize: 12, color: T.deep,
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
                {o.id === activeOrgId && <Check size={14} color={T.deep} />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add organisation — admin only from 2026-08-30. Creating an
          organisation is gated in the database by trg_enforce_single_organisation
          (migration 070); this only stops offering a button that would fail.
          Rendered as nothing rather than as a disabled control, because a
          disabled button invites the question and there is no answer to give. */}
      {canAddOrganisation && (
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
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Completion Meter
   ═══════════════════════════════════════════════ */
function CompletionMeter({ org, onJumpToCard }: { org: Organisation; onJumpToCard: (card: CardId) => void }) {
  const { pct, missing } = computeCompleteness(org)

  return (
    /* A white card like every other card on the page. No tier ramp — see the
       note under T for why the three tiers could not be rescued by
       re-stepping. */
    <div style={{
      background: T.white, border: `1px solid ${T.border}`,
      borderRadius: 16, padding: '20px 22px', marginBottom: 24,
      boxShadow: '0 1px 2px rgba(29,60,62,0.04)',
    }}>
      <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 9.5, letterSpacing: '0.13em', textTransform: 'uppercase' as const, color: T.textTertiary, marginBottom: 8 }}>
        Profile complete
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: UI, fontWeight: 700, fontSize: 34, color: T.deep, letterSpacing: '-0.03em', lineHeight: 1 }}>{pct}%</span>
        <span style={{ fontFamily: BODY, fontSize: 13.5, color: T.textSecondary }}>
          {missing.length === 0
            ? 'Your profile is complete. Matches are fully optimised.'
            : 'Click a missing field to complete it.'}
        </span>
      </div>
      {/* --deep on a visible track: 9.1:1, and the same pair the Projects bar
          uses so the two agree. The old track was ΔE 2.67 from its panel, so
          the fill read as a floating stub rather than as a proportion. */}
      <div style={{ height: 6, background: T.track, borderRadius: 999, overflow: 'hidden', marginBottom: missing.length > 0 ? 16 : 0 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: T.deep, borderRadius: 999, transition: 'width 0.4s ease' }} />
      </div>
      {missing.length > 0 && (
        /* The chips are the point of this card, not a footnote under it. High
           impact takes a solid gold fill with a --deep label (7.71); the rest
           are outlined neutral. High-vs-normal is a two-value category rather
           than a ramp, which is the one job colour reliably does here. */
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {missing.map(m => {
            const card = FIELD_TO_CARD[m.label]
            const high = m.impact === 'high'
            return (
              <button
                key={m.label}
                onClick={() => card && onJumpToCard(card)}
                style={{
                  fontFamily: UI, fontWeight: 600, fontSize: 12,
                  padding: '6px 12px', borderRadius: 999, cursor: card ? 'pointer' : 'default',
                  border: high ? '1px solid transparent' : `1px solid ${T.borderStrong}`,
                  background: high ? T.gold : T.white,
                  color: high ? T.deep : T.textSecondary,
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  transition: 'all 0.12s',
                }}
              >
                {high && <AlertTriangle size={11} />}
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
      if (data.mission) { updates.mission = trimMission(String(data.mission)); fieldNames.push(labels.mission) }
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
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.deep,
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
                background: T.warmNeutral, outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexBasis: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'flex-end' : 'flex-start' }}>
            <button onClick={cancel} style={{ fontFamily: UI, fontWeight: 500, fontSize: 13, color: T.textSecondary, background: T.white, border: `0.5px solid ${T.borderStrong}`, padding: '7px 12px', borderRadius: 999, cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={save} disabled={saving} style={{ fontFamily: UI, fontWeight: 500, fontSize: 13, background: T.deep, color: T.creamLabel, border: 'none', padding: '7px 14px', borderRadius: 999, cursor: saving ? 'not-allowed' : 'pointer' }}>
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
            <button onClick={startEdit} style={{ fontFamily: UI, fontWeight: 500, fontSize: 13, background: 'transparent', color: T.textSecondary, border: 'none', padding: '7px 10px', borderRadius: 999, cursor: 'pointer' }}>
              Change URL
            </button>
            <button
              onClick={runScan}
              disabled={scanning}
              style={{ fontFamily: UI, fontWeight: 500, fontSize: 13, background: scanning ? T.deep : 'transparent', color: scanning ? T.creamLabel : T.textPrimary, border: `0.5px solid ${scanning ? T.deep : T.borderStrong}`, padding: '7px 14px', borderRadius: 8, cursor: scanning ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.2s ease', opacity: scanning ? 0.8 : 1 }}
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
          <button onClick={startEdit} style={{ fontFamily: UI, fontWeight: 500, fontSize: 13, background: T.deep, color: T.creamLabel, border: 'none', padding: '8px 18px', borderRadius: 999, cursor: 'pointer', flexShrink: 0, flexBasis: isMobile ? '100%' : 'auto' }}>
            Add website
          </button>
        </>
      )}
      {/* Scan feedback message */}
      {scanMsg && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: scanMsg.type === 'success' ? '#F0FAE5' : '#FEF2F2', border: `1px solid ${scanMsg.type === 'success' ? '#1B6B3D' : '#FECACA'}`, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: BODY, fontSize: 13, color: scanMsg.type === 'success' ? T.deep : '#991B1B' }}>{scanMsg.text}</span>
          <button onClick={() => setScanMsg(null)} style={{ fontFamily: UI, fontSize: 12, color: scanMsg.type === 'success' ? T.deep : '#991B1B', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, flexShrink: 0, marginLeft: 12 }}>Dismiss</button>
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
  /* Optional. A card whose controls save on the spot has nothing to "edit",
     and rendering a dead Edit button on it is worse than rendering none. */
  onEdit?: () => void
  editDisabled?: boolean
  children: React.ReactNode
  footer?: React.ReactNode
  hasIncomplete?: boolean
  cardId?: string
}) {
  /* The incomplete state no longer paints the card EDGE. #C97B1A measured
     3.32 on white and 2.95 on cream — it passed on one ground and failed on
     the other, and it sits on cream now that the local page background is
     gone. A bare coloured border also never said WHAT was missing. The gold
     badge in the header does, and it matches the meter's high-impact chip so
     the two agree. */
  const borderColor = isEditing ? T.deep : T.border
  return (
    <section id={cardId} style={{
      background: T.white, border: `1px solid ${borderColor}`,
      borderRadius: 16, overflow: 'hidden',
      boxShadow: isEditing ? '0 0 0 3px rgba(29,60,62,0.06)' : '0 1px 2px rgba(29,60,62,0.04)',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }}>
      {/* Header */}
      <div style={{ padding: '18px 24px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontFamily: UI, fontWeight: 600, fontSize: 17, color: T.deep, letterSpacing: '-0.01em' }}>
            {title}
          </h2>
          {hasIncomplete && !isEditing && (
            <span style={{ fontFamily: UI, fontWeight: 600, fontSize: 11, letterSpacing: '0.02em',
              background: T.gold, color: T.deep, padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>
              {title === 'Your focus' ? 'Specialisms missing' : 'Details missing'}
            </span>
          )}
          {badge}
        </div>
        {!isEditing && onEdit && (
          <button
            onClick={onEdit}
            disabled={editDisabled}
            style={{
              fontFamily: UI, fontWeight: 500, fontSize: 13,
              // No opacity on the disabled state. T.textTertiary is #74736E at
              // 4.75:1, but halved it composites to roughly #BAB9B6 — about
              // 2:1 — so the word "Edit" became unreadable at exactly the
              // moment the user wants to know why they cannot click it. The
              // tertiary colour alone says "not now" and stays legible.
              color: editDisabled ? T.textTertiary : T.textSecondary,
              background: 'transparent', border: 'none', cursor: editDisabled ? 'not-allowed' : 'pointer',
              padding: '7px 12px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Pencil size={14} />
            Edit
          </button>
        )}
        {isEditing && (
          <span style={{ fontFamily: UI, fontWeight: 500, fontSize: 12, color: T.deep, padding: '3px 10px', background: T.cream, borderRadius: 10 }}>
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
        <div style={{ padding: '14px 24px', background: T.warmNeutral, borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
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
        background: saving ? T.warmNeutral : T.deep, color: saving ? T.textTertiary : T.creamLabel,
        border: 'none', padding: '9px 20px', borderRadius: 999,
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
        background: T.white, color: T.deep,
        border: `1.5px solid ${T.borderStrong}`, padding: '9px 18px', borderRadius: 999,
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
    background: T.warmNeutral, outline: 'none',
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
        name:                         draft.name.trim() || undefined,
        legal_structure:              draft.legalStructure || undefined,
        annual_income_band:           draft.annualIncomeBand || undefined,
        years_trading:                draft.yearsTrading ? parseInt(draft.yearsTrading) : null,
        org_stage:                    draft.orgStage || undefined,
        charity_number:               draft.charityNumber.trim() || null,
        // Eligibility flags (asset_lock / social_mission / profit_restrict)
        // are silently derived from legal_structure — the eligibility engine
        // doesn't meaningfully consume them yet, so there's no value in
        // asking the user. cic_shares correctly keeps profit-distributable;
        // most other social structures get all three true.
        ...deriveEligibilityFlagsFromStructure(draft.legalStructure),
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
  excludedNicheTags: string[]
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
      excludedNicheTags:((org.excluded_niche_tags as string[]) ?? []).filter(t => valid.has(t)),
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
        impact_sectors:      draft.impactSectors,
        niche_tags:          draft.nicheTags.filter(t => valid.has(t)),
        excluded_niche_tags: draft.excludedNicheTags.filter(t => valid.has(t)),
        beneficiary_groups:  draft.beneficiaryGroups,
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
      // removing a sector — clear both its included and excluded niche tags too
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
    setDraft(prev => prev ? { ...prev, impactSectors: [s, ...prev.impactSectors.filter(x => x !== s)] } : prev)
  }
  // Tri-state cycle on click: neutral → include → exclude → neutral.
  // include & exclude are mutually exclusive (one tag can't be both).
  function cycleNicheTag(tag: string) {
    setDraft(prev => {
      if (!prev) return prev
      const isIncluded = prev.nicheTags.includes(tag)
      const isExcluded = prev.excludedNicheTags.includes(tag)
      if (!isIncluded && !isExcluded) {
        // neutral → include
        return { ...prev, nicheTags: [...prev.nicheTags, tag] }
      }
      if (isIncluded) {
        // include → exclude
        return {
          ...prev,
          nicheTags:         prev.nicheTags.filter(t => t !== tag),
          excludedNicheTags: [...prev.excludedNicheTags, tag],
        }
      }
      // exclude → neutral
      return { ...prev, excludedNicheTags: prev.excludedNicheTags.filter(t => t !== tag) }
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

  // Same green family across sectors AND beneficiaries — weight variation
  // (forest fill for primary, pale-green for secondary) carries the rank.
  // Sector-vs-beneficiary is identified by the section heading above each
  // group; coral was reading as an error state, not a category.
  const pillStyle = (_kind: 'sector' | 'beneficiary', isPrimary: boolean): React.CSSProperties => ({
    fontFamily: UI, fontWeight: 500, fontSize: 12.5, padding: '4px 10px', borderRadius: 20,
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: isPrimary ? T.deep : T.greenBg,
    color:      isPrimary ? '#F1F7E4'   : T.greenText,
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

          {/* Sub-tag panel — tri-state chips. Click cycles:
              neutral (off-white) → include (green) → exclude (red strikethrough) → neutral */}
          {draft.impactSectors.filter(s => NICHE_TAGS_BY_SECTOR[s]).length > 0 && (
            /* A plain block, no rails. This had borderLeft 3px lime with a
               3px mid-green rail on the tip INSIDE it — a coloured rail within
               a coloured rail, and the lime measured 1.73 against the panel it
               sat on. */
            <div style={{ background: T.warmNeutral, borderRadius: 14, padding: '16px 18px' }}>
              {/* A white card inside the block, rather than a second rail. */}
              <div style={{
                fontFamily: UI,
                fontSize: 12.5,
                fontWeight: 500,
                color: T.textPrimary,
                marginBottom: 16,
                padding: '11px 14px',
                background: T.white,
                border: `1px solid ${T.border}`,
                borderRadius: 12,
                lineHeight: 1.5,
              }}>
                <strong style={{ color: T.greenText, fontWeight: 700, letterSpacing: '0.01em' }}>Tip</strong>
                <span style={{ color: T.greenText }}> · </span>
                Click once to mark as a specialism. Click again to <strong>exclude</strong> (we won&apos;t show grants targeting it). Click a third time to reset.
              </div>
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
                        const isIncluded = draft.nicheTags.includes(opt.value)
                        const isExcluded = draft.excludedNicheTags.includes(opt.value)
                        /* INVERTED, deliberately. The three borders measured
                           1.31 neutral, 1.73 specialism and 3.43 excluded — so
                           the only state you could actually see was the rare,
                           destructive one, and the state you use daily was
                           invisible. Specialism is now a 1.5px --deep outline
                           with a check and a bold label at 11.88:1; excluded
                           keeps its coral but becomes the quietest of the
                           three, which is the right order.

                           Deliberately NOT a filled --deep chip: that is
                           already the primary-sector treatment in the grid
                           above, and one fill must not mean two things inside
                           a single card. */
                        const borderCol = isIncluded ? T.deep : isExcluded ? 'transparent' : T.border
                        const bgCol     = isIncluded ? T.white : isExcluded ? T.coralBg : T.white
                        const txtCol    = isIncluded ? T.deep : isExcluded ? T.coralText : T.textSecondary
                        return (
                          <button
                            key={opt.value}
                            onClick={() => cycleNicheTag(opt.value)}
                            title={isIncluded ? 'Specialism — click to exclude' : isExcluded ? 'Excluded — click to reset' : 'Click to mark as specialism'}
                            style={{
                              fontSize: 11.5, fontFamily: BODY, padding: '6px 11px', borderRadius: 999,
                              border: `1.5px solid ${borderCol}`,
                              background: bgCol,
                              color: txtCol,
                              cursor: 'pointer', fontWeight: isIncluded ? 700 : isExcluded ? 500 : 400,
                              textAlign: 'left' as const, lineHeight: 1.3,
                              textDecoration: isExcluded ? 'line-through' : 'none',
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                            }}
                          >
                            {isIncluded && <Check size={11} strokeWidth={3} style={{ flexShrink: 0 }} />}
                            {isExcluded && <span style={{ marginRight: 1 }}>✕</span>}
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
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.greenText }} />
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
    /* lucide, not an emoji: emoji render differently on every platform, cannot
       be recoloured, and do not sit on a text baseline. */
    <span style={{ fontFamily: UI, fontWeight: 500, fontSize: 12.5, padding: '5px 12px', borderRadius: 999, background: T.warmNeutral, color: T.deep, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <MapPin size={11} style={{ flexShrink: 0 }} /> {text}
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
  funderTypePreferences:  FunderType[]
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
      funderTypePreferences: (org.funder_type_preferences as FunderType[]) ?? [],
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
        funder_type_preferences:   draft.funderTypePreferences,
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

  function toggleFunderType(t: FunderType) {
    setDraft(prev => {
      if (!prev) return prev
      return {
        ...prev,
        funderTypePreferences: prev.funderTypePreferences.includes(t)
          ? prev.funderTypePreferences.filter(x => x !== t)
          : [...prev.funderTypePreferences, t],
      }
    })
  }

  const minFmt = fmtThousands(org.min_grant_target)
  const maxFmt = fmtThousands(org.max_grant_target)
  const sizeLabel = minFmt && maxFmt ? `${minFmt} – ${maxFmt}` : minFmt || maxFmt || null

  // Kept as (value, label) rather than label-only so the chip can look up its
  // colour. The value is what the shared palette is keyed on.
  const ftChips = ((org.funding_type_preferences as FundingType[]) ?? [])
    .map(t => ({ value: t, label: FUNDING_TYPE_OPTIONS.find(o => o.value === t)?.label }))
    .filter(x => !!x.label)
  const funderLabels = ((org.funder_type_preferences as FunderType[]) ?? [])
    .map(t => FUNDER_TYPE_OPTIONS.find(o => o.value === t)?.label).filter(Boolean)

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
                      padding: '9px 14px', borderRadius: 999, cursor: 'pointer',
                      border: `1.5px solid ${selected ? (typeColour(opt.value)?.fg ?? T.deep) : T.borderStrong}`,
                      background: selected ? (typeColour(opt.value)?.tint ?? T.warmNeutral) : T.white,
                      color: selected ? (typeColour(opt.value)?.fg ?? T.deep) : T.textSecondary,
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
          <FieldRow label="Funder types">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                {FUNDER_TYPE_OPTIONS.map(opt => {
                  const selected = draft.funderTypePreferences.includes(opt.value)
                  return (
                    <button
                      key={opt.value}
                      onClick={() => toggleFunderType(opt.value)}
                      title={opt.description}
                      style={{
                        fontFamily: UI, fontWeight: selected ? 600 : 400, fontSize: 13,
                        padding: '8px 13px', borderRadius: 999, cursor: 'pointer',
                        border: `1.5px solid ${selected ? T.deep : T.borderStrong}`,
                        background: selected ? T.warmNeutral : T.white, color: selected ? T.deep : T.textSecondary,
                        textAlign: 'left' as const, transition: 'all 0.12s',
                      }}
                    >
                      {selected && <Check size={12} style={{ display: 'inline', marginRight: 6 }} />}
                      {opt.label}
                    </button>
                  )
                })}
              </div>
              <p style={{ fontFamily: BODY, fontSize: 12, color: T.textTertiary, marginTop: 4, marginBottom: 0, lineHeight: 1.5 }}>
                Leave empty for no preference. Hover any option for a definition.
              </p>
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
            {ftChips.length > 0 ? (
              /* The validated four-hue set — the same one the dashboard, Find
                 Funding and Deadlines use, so a funding type is finally one
                 colour everywhere. These four sat in a row wearing a single
                 tan chip on a page whose whole job is showing what you chose. */
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ftChips.map(({ value, label }) => {
                  const c = typeColour(value)
                  return (
                    <span key={label} style={{ fontFamily: UI, fontWeight: 600, fontSize: 12.5, padding: '5px 12px', borderRadius: 999,
                      background: c?.tint ?? T.warmNeutral, color: c?.fg ?? T.textSecondary }}>
                      {label}
                    </span>
                  )
                })}
              </div>
            ) : <AddLink label="Add funding types" onClick={startEdit} />}
          </FieldRow>
          <FieldRow label="Funder types">
            {funderLabels.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {funderLabels.map(label => (
                  <span key={label} style={{ fontFamily: UI, fontWeight: 500, fontSize: 12.5, padding: '5px 12px', borderRadius: 999, background: T.warmNeutral, color: T.textSecondary }}>
                    {label}
                  </span>
                ))}
              </div>
            ) : (
              <span style={{ fontFamily: BODY, fontSize: 13, color: T.textTertiary }}>
                No preference (showing all funder types)
              </span>
            )}
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
  const [themesText, setThemesText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const hasMission = !!org.mission?.trim()
  const hasThemes  = (org.themes?.length ?? 0) > 0

  useEffect(() => {
    if (triggerOpen && !editing) { startEdit(); onTriggered?.() }
  }, [triggerOpen])

  function startEdit() {
    setMission(org.mission ?? '')
    setThemesText((org.themes ?? []).join(', '))
    setEditing(true); onEditStart()
  }
  function cancel() { setEditing(false); setSaveError(null); onEditEnd() }

  async function save() {
    setSaving(true); setSaveError(null)
    try {
      const themesArr = themesText.split(',').map(s => s.trim()).filter(Boolean)
      await updateOrganisation(orgId, {
        mission: mission.trim() || null,
        themes:  themesArr,
      })
      setEditing(false); onEditEnd(); onSaved()
    } catch (e) { setSaveError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  const quickWinBadge = !hasMission && !editing ? (
    <span style={{ fontFamily: UI, fontWeight: 500, fontSize: 12, color: '#854F0B', padding: '3px 10px', background: '#FAEEDA', borderRadius: 10 }}>
      Quick win
    </span>
  ) : null

  const storyBorder = editing ? T.deep : (!hasMission && hasIncomplete) ? '#C97B1A' : hasMission ? T.border : 'rgba(142,203,60,0.2)'
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
          {editing && <span style={{ fontFamily: UI, fontWeight: 500, fontSize: 12, color: T.deep, padding: '3px 10px', background: T.cream, borderRadius: 10 }}>Editing</span>}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontFamily: UI, fontSize: 12.5, fontWeight: 600, color: T.textSecondary, letterSpacing: '0.01em' }}>
                Mission
              </label>
              <textarea
                value={mission}
                onChange={e => setMission(e.target.value)}
                rows={5}
                style={{ ...inputStyle(), resize: 'vertical', lineHeight: 1.6 }}
                placeholder="Describe what your organisation does, who you serve, and the change you want to see…"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontFamily: UI, fontSize: 12.5, fontWeight: 600, color: T.textSecondary, letterSpacing: '0.01em' }}>
                Themes (free-text keywords)
              </label>
              <textarea
                value={themesText}
                onChange={e => setThemesText(e.target.value)}
                rows={2}
                style={{ ...inputStyle(), resize: 'vertical', lineHeight: 1.6, minHeight: 56 }}
                placeholder="e.g. makerspace, fabrication, intergenerational learning, place-based"
              />
              <p style={{ fontFamily: BODY, fontSize: 12, color: T.textTertiary, margin: 0, lineHeight: 1.5 }}>
                Comma-separated keywords that describe your work in your own words. Useful when your sectors don&apos;t fully capture what you do (e.g. a specific method, audience, or angle).
              </p>
            </div>
            {saveError && <p style={{ fontFamily: BODY, fontSize: 13, color: '#B91C1C' }}>{saveError}</p>}
          </>
        ) : hasMission ? (
          <>
            <p style={{ fontFamily: BODY, fontSize: 15, color: T.textPrimary, lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>
              {org.mission}
            </p>
            {hasThemes && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {(org.themes ?? []).map(t => (
                  <span key={t} style={{ fontFamily: UI, fontWeight: 500, fontSize: 12.5, padding: '3px 10px', borderRadius: 12, background: T.cream, color: T.textSecondary }}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '4px 0 8px' }}>
            <div style={{
              flexShrink: 0, width: 36, height: 36, background: T.warmNeutral, borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.deep,
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
                  background: T.deep, color: T.creamLabel, border: 'none',
                  padding: '9px 20px', borderRadius: 999, cursor: 'pointer',
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
        <div style={{ padding: '14px 24px', background: T.warmNeutral, borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <CancelBtn onClick={cancel} />
          <SaveBtn saving={saving} onClick={save} />
        </div>
      )}
    </section>
  )
}

/* ═══════════════════════════════════════════════
   Alerts card
   ───────────────────────────────────────────────
   The off-switch. Until 2026-08-30 there was no alerts control anywhere in the
   product: the column existed, the onboarding wizard wrote TRUE to it for every
   new organisation, and the email's "Email preferences" link pointed
   at this page, which had nothing on it to manage. 34 of 41 organisations had
   alerts on and not one of them had been asked.

   Saves on the spot rather than behind an Edit/Save cycle. Every other card
   here describes the organisation, where a draft you can abandon is right. This
   one is consent, and a person switching it off is done at the moment they
   switch it off — not after they also find and press Save.
   ═══════════════════════════════════════════════ */
function AlertsCard({ org, orgId, onSaved }: {
  org: Organisation
  orgId: string
  onSaved: () => void
}) {
  const enabled = org.alerts_enabled ?? false
  const minScore = org.alert_min_score ?? 70
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function set(updates: { alerts_enabled?: boolean; alert_min_score?: number }) {
    setSaving(true); setError(null)
    try {
      await updateOrganisation(orgId, updates)
      onSaved()
    } catch (e) {
      // Surfaced, never swallowed. A toggle that silently fails to turn off is
      // the same as one that does not exist.
      setError(e instanceof Error ? e.message : 'Could not save that. Please try again.')
    } finally { setSaving(false) }
  }

  return (
    <CardShell title="Weekly Funding Update" cardId="card-alerts" isEditing={false}>
      <div style={{ padding: '4px 24px 20px' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: '0 0 4px', fontFamily: UI, fontWeight: 600, fontSize: 14, color: T.textPrimary }}>
              Weekly Funding Update
            </p>
            <p style={{ margin: 0, fontFamily: BODY, fontSize: 13.5, lineHeight: 1.55, color: T.textSecondary }}>
              One email a week: what is closing, what is moving, and new funding that matches {org.name}. Nothing else.
            </p>
          </div>

          <button
            role="switch"
            aria-checked={enabled}
            aria-label="Weekly Funding Update"
            disabled={saving}
            onClick={() => set({ alerts_enabled: !enabled })}
            style={{
              flexShrink: 0, width: 46, height: 27, borderRadius: 999,
              background: enabled ? T.deep : T.track,
              border: 'none', cursor: saving ? 'wait' : 'pointer',
              padding: 3, display: 'flex', alignItems: 'center',
              justifyContent: enabled ? 'flex-end' : 'flex-start',
              transition: 'background 0.15s',
            }}
          >
            <span style={{
              display: 'block', width: 21, height: 21, borderRadius: 999,
              background: T.white, boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
            }} />
          </button>
        </div>

        {enabled && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
            <p style={{ margin: '0 0 10px', fontFamily: UI, fontWeight: 500, fontSize: 13, color: T.textPrimary }}>
              Only tell me about strong matches
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { v: 60, label: 'Anything relevant' },
                { v: 70, label: 'Good matches' },
                { v: 80, label: 'Strong matches only' },
              ].map(o => {
                const on = minScore === o.v
                return (
                  <button
                    key={o.v}
                    disabled={saving}
                    onClick={() => set({ alert_min_score: o.v })}
                    style={{
                      fontFamily: UI, fontWeight: 500, fontSize: 12.5,
                      padding: '7px 14px', borderRadius: 999, cursor: saving ? 'wait' : 'pointer',
                      background: on ? T.greenBg : T.white,
                      color: on ? T.greenText : T.textSecondary,
                      border: `1px solid ${on ? T.greenText : T.borderStrong}`,
                    }}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {!enabled && (
          <p style={{ margin: '14px 0 0', fontFamily: BODY, fontSize: 13, color: T.textTertiary }}>
            The Weekly Funding Update is off. You can still find everything on Find Funding.
          </p>
        )}

        {error && (
          <p style={{ margin: '12px 0 0', fontFamily: BODY, fontSize: 13, color: '#991B1B' }}>
            {error}
          </p>
        )}
      </div>
    </CardShell>
  )
}

/* ═══════════════════════════════════════════════
   Main component
   ═══════════════════════════════════════════════ */
export default function ProfilePage() {
  const isMobile = useIsMobile()
  const [orgs, setOrgs] = useState<Organisation[]>([])
  // Admin-only from 2026-08-30. Defaults FALSE so a failed or slow request
  // hides the button rather than offering one the database will refuse: the
  // honest failure here is a missing affordance, not a rejected action.
  const [canAddOrganisation, setCanAddOrganisation] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/me/capabilities')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d) setCanAddOrganisation(!!d.canAddOrganisation) })
      .catch(() => { /* stays false, which is the safe direction */ })
    return () => { cancelled = true }
  }, [])
  const [loading, setLoading] = useState(true)
  const [editingCard, setEditingCard] = useState<CardId | null>(null)
  const [jumpTarget, setJumpTarget] = useState<CardId | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  // Application builder access (cohort allowlist, checked server-side).
  const [builderAllowed, setBuilderAllowed] = useState(false)
  const activeOrg = orgs.find(o => o.id === activeOrgId) ?? orgs[0] ?? null

  useEffect(() => {
    fetch('/api/builder/access')
      .then(r => r.json())
      .then(d => setBuilderAllowed(!!d?.allowed))
      .catch(() => {})
  }, [])

  const router = useRouter()

  async function loadOrgs(keepActiveId?: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserEmail(user.email ?? null)
    const allOrgs = await getOrganisationsByOwner(user.id)
    setOrgs(allOrgs)

    // Restore active org from localStorage, fall back to first
    const stored = typeof window !== 'undefined' ? localStorage.getItem('gt_active_org_id') : null
    const activeId = keepActiveId ?? stored ?? allOrgs[0]?.id ?? null
    if (activeId && allOrgs.find(o => o.id === activeId)) {
      setActiveOrgId(activeId)
      writeActiveOrgCookie(activeId) // sync the server-readable cookie
    } else if (allOrgs[0]) {
      setActiveOrgId(allOrgs[0].id)
      writeActiveOrgCookie(allOrgs[0].id)
    }
  }

  useEffect(() => {
    loadOrgs().finally(() => setLoading(false))
  }, [])

  function switchOrg(id: string) {
    setActiveOrgId(id)
    if (typeof window !== 'undefined') localStorage.setItem('gt_active_org_id', id)
    writeActiveOrgCookie(id) // so the dashboard + other server surfaces follow
    router.refresh()         // re-render the server layout so the sidebar follows the switch
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
      if (!nextId) {
        window.location.href = '/onboarding/wizard'
      } else {
        // Sync the server-readable cookie + re-render the layout, else the
        // sidebar/dashboard keep pointing at the just-deleted org.
        writeActiveOrgCookie(nextId)
        router.refresh()
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    } finally { setDeleting(false) }
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFAF7' }}>
        <p style={{ fontFamily: UI, fontSize: 14, color: T.textTertiary }}>Loading…</p>
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
              style={{ width: '100%', padding: '11px 0', background: '#1D3C3E', color: '#F6F1E7', border: 'none', borderRadius: 999, fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: (creating || !newOrgName.trim()) ? 0.6 : 1 }}
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
    /* No local page ground. #FAFAF7 is ΔE 2.36 from white, so the page was
       painting white behind white cards and they had nothing to sit on. The
       shell's cream shows through now. */
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {/* No maxWidth. Every other page sits in the layout's own container;
          this one was in a 920px column, which with a charcoal heading and a
          near-white ground was most of why it read as a different product. */}
      <div style={{ padding: isMobile ? '24px 16px 60px' : '40px 48px 80px' }}>

        {/* Page header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 600, fontSize: isMobile ? 26 : 31, letterSpacing: '-0.025em', color: '#1D3C3E', lineHeight: 1.1, margin: '0 0 6px' }}>
            Your profile
          </h1>
          <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: isMobile ? 10 : 16, flexDirection: isMobile ? 'column' : 'row' }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: '#5F5E5A', margin: 0 }}>
              Refine the details that drive your funding matches.
            </p>
          </div>
        </div>

        {/* Org switcher + Add organisation — always shown (OrgSwitcher renders
            cleanly for a single org). The "Add organisation" button inside it
            is admin-only from 2026-08-30; everyone else gets one organisation
            and additional ones are arranged with Paul. Enforced in the database
            by migration 070, not by this prop. */}
        {activeOrg && (
          <OrgSwitcher
            orgs={orgs}
            activeOrgId={activeOrg.id}
            onSwitch={switchOrg}
            canAddOrganisation={canAddOrganisation}
          />
        )}

        {/* Completion meter */}
        <CompletionMeter org={activeOrg} onJumpToCard={onJumpToCard} />

        <ScanBar orgId={activeOrg.id} website={activeOrg.website_url} onSaved={() => loadOrgs(activeOrg.id)} />

        {/* Admin: clear profile (mirrors a fresh "Set up later" user) */}
        {userEmail === ADMIN_EMAIL && <ClearProfileButton />}

        {/* Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <AboutCard   {...cardProps('about')} />
          <FocusCard   {...cardProps('focus')} />
          <LocationCard {...cardProps('location')} />
          <FundingCard  {...cardProps('funding')} />
          <StoryCard    {...cardProps('story')} />
          {builderAllowed && <CoreContentSection orgId={activeOrg.id} />}
          {/* Last, and deliberately not part of the completion meter: alerts
              are a preference, not a gap in the profile. Nothing should nag
              anyone toward switching email on. The id on this card is what
              the alert email's footer link targets. */}
          <AlertsCard
            org={activeOrg}
            orgId={activeOrg.id}
            onSaved={() => loadOrgs(activeOrg.id)}
          />
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
          <a href="/dashboard/account" style={{ color: T.textSecondary, textDecoration: 'none' }}>
            Account →
          </a>
          <a href="/dashboard/notifications" style={{ color: T.textSecondary, textDecoration: 'none' }}>
            Notifications →
          </a>
        </div>

      </div>
    </div>
  )
}

/**
 * Branched eligibility engine.
 *
 * Pure, self-contained module — no UI / Supabase dependencies, so the future
 * MCP wrapper (and any other transport) can call it directly without dragging
 * the matching engine along.
 *
 * Returns an EligibilityVerdict with stable issue codes so callers can render
 * structured explanations and filter by severity.
 */

import type {
  GrantOpportunity,
  Organisation,
  LegalStructure,
  OrgStage,
  BeneficiaryGroup,
} from '@/types'

export type EligibilityStatus =
  | 'eligible'
  | 'likely_eligible'
  | 'check_required'
  | 'ineligible'

export type IssueSeverity = 'blocker' | 'warning' | 'info'

export interface EligibilityIssue {
  code: string
  severity: IssueSeverity
  message: string
}

export interface EligibilityVerdict {
  status: EligibilityStatus
  issues: EligibilityIssue[]
  reason: string | null
}

// ─────────────────────────────────────────────
// Income-band midpoints (mirrors matching.ts table — kept local so this module
// has no internal coupling)
// ─────────────────────────────────────────────
const INCOME_MIDPOINTS: Record<string, number> = {
  'Under £10,000':             5_000,
  '£10,000–£50,000':          30_000,
  '£50,000–£100,000':         75_000,
  '£100,000–£250,000':       175_000,
  '£250,000–£500,000':       375_000,
  '£500,000–£1 million':     750_000,
  '£1 million–£5 million': 2_500_000,
  'Over £5 million':      10_000_000,
  '£100,000–£500,000':       300_000,
  'Over £500,000':           750_000,
}

function incomeMidpoint(band: string | null | undefined): number | null {
  if (!band) return null
  return INCOME_MIDPOINTS[band] ?? null
}

// ─────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────
export function runEligibilityChecks(
  opp: GrantOpportunity,
  org: Organisation,
): EligibilityVerdict {
  const issues: EligibilityIssue[] = []
  pushAll(issues, sharedChecks(opp, org))

  switch (opp.fundingType) {
    case 'investment':
      pushAll(issues, investmentChecks(opp, org))
      break
    case 'programme':
      pushAll(issues, programmeChecks(opp, org))
      break
    case 'in_kind':
      pushAll(issues, inKindChecks(opp, org))
      break
    case 'grant':
    default:
      pushAll(issues, grantChecks(opp, org))
      break
  }

  issues.sort((a, b) => severityRank(a.severity) - severityRank(b.severity))

  const hasBlocker = issues.some(i => i.severity === 'blocker')
  const hasWarning = issues.some(i => i.severity === 'warning')

  const status: EligibilityStatus =
    hasBlocker ? 'ineligible'
    : hasWarning ? 'check_required'
    : 'likely_eligible'

  const reason = issues[0]?.message ?? null

  return { status, issues, reason }
}

function severityRank(s: IssueSeverity): number {
  return s === 'blocker' ? 0 : s === 'warning' ? 1 : 2
}

function pushAll<T>(target: T[], items: T[]): void {
  for (const it of items) target.push(it)
}

// ─────────────────────────────────────────────
// Shared checks — applied to every opportunity type
// ─────────────────────────────────────────────
function sharedChecks(opp: GrantOpportunity, org: Organisation): EligibilityIssue[] {
  const out: EligibilityIssue[] = []

  if (opp.isInviteOnly) {
    out.push({
      code: 'invite_only',
      severity: 'warning',
      message: 'Invitation-only — open applications are not accepted.',
    })
  }

  // Hard structure gate — only fires when the opportunity has an explicit
  // eligibleStructures list AND the org has set its legal structure
  if (
    opp.eligibleStructures && opp.eligibleStructures.length > 0 &&
    org.legal_structure &&
    !structureMatches(org.legal_structure, opp.eligibleStructures)
  ) {
    out.push({
      code: 'structure_mismatch',
      severity: 'blocker',
      message: `${labelStructure(org.legal_structure)} is not in the eligible structures list (${opp.eligibleStructures.map(labelStructure).join(', ')}).`,
    })
  }

  // Income cap (data-driven via min_org_income / max_org_income)
  const mid = incomeMidpoint(org.annual_income_band)
  if (mid !== null) {
    if (opp.maxOrgIncome != null && mid > opp.maxOrgIncome * 1.1) {
      out.push({
        code: 'org_income_above_cap',
        severity: 'warning',
        message: `Your income band (${org.annual_income_band}) likely exceeds this funder's cap of £${opp.maxOrgIncome.toLocaleString()}.`,
      })
    }
    if (opp.minOrgIncome != null && mid < opp.minOrgIncome * 0.9) {
      out.push({
        code: 'org_income_below_floor',
        severity: 'warning',
        message: `Your income band (${org.annual_income_band}) is below this funder's minimum of £${opp.minOrgIncome.toLocaleString()}.`,
      })
    }
  }

  // UK-nation restriction (only fires on strong, restrictive phrasing)
  const restrictedNation = detectNationRestriction(opp)
  if (restrictedNation && org.primary_location) {
    const here = orgNation(org.primary_location)
    if (here !== restrictedNation) {
      out.push({
        code: 'nation_mismatch',
        severity: 'blocker',
        message: `Restricted to ${capitalise(restrictedNation)} — your org is in ${capitalise(here)}.`,
      })
    }
  }

  // Local-area mismatch
  if (opp.isLocal && opp.locationTag && org.primary_location) {
    if (!cityMatch(opp.locationTag, org.primary_location)) {
      out.push({
        code: 'local_area_mismatch',
        severity: 'warning',
        message: `Local funder for ${opp.locationTag} — verify your delivery area qualifies.`,
      })
    }
  }

  // Beneficiary mismatch (only when the opp has explicit targetBeneficiaries
  // and the org has set its beneficiary_groups)
  if (
    opp.targetBeneficiaries && opp.targetBeneficiaries.length > 0 &&
    org.beneficiary_groups && org.beneficiary_groups.length > 0
  ) {
    const overlap = opp.targetBeneficiaries.some((b: BeneficiaryGroup) =>
      org.beneficiary_groups.includes(b),
    )
    const generic = opp.targetBeneficiaries.includes('general_public' as BeneficiaryGroup)
    if (!overlap && !generic) {
      out.push({
        code: 'beneficiary_mismatch',
        severity: 'warning',
        message: `Funder targets ${opp.targetBeneficiaries.join(', ')} — verify your beneficiaries align.`,
      })
    }
  }

  return out
}

// ─────────────────────────────────────────────
// Grant-specific
// ─────────────────────────────────────────────
function grantChecks(opp: GrantOpportunity, org: Organisation): EligibilityIssue[] {
  const out: EligibilityIssue[] = []
  const text = (opp.eligibilityCriteria ?? []).join(' ').toLowerCase()
  if (!text) return out

  // Faith-building requirement
  const faithKw = [
    'church building', 'place of worship', 'for worship', 'open for worship',
    'mosque', 'synagogue', 'temple', 'gurdwara', 'chapel',
  ]
  if (faithKw.some(k => text.includes(k))) {
    const orgHasFaith =
      (org.themes ?? []).some(t => /(faith|religion|church|worship)/i.test(t)) ||
      /\b(church|faith|worship|mosque|synagogue|chapel)\b/i.test(org.mission ?? '')
    if (!orgHasFaith) {
      out.push({
        code: 'requires_faith_building',
        severity: 'blocker',
        message: 'Restricted to faith buildings (places of worship).',
      })
    }
  }

  // Years of accounts requirement
  if (org.years_operating != null) {
    const m = text.match(
      /(?:minimum\s+)?(\d+)\s+(?:full\s+)?years?\s+(?:of\s+)?(?:published\s+)?accounts|(\d+)\s+years?\s+(?:trading|operating|established)/i,
    )
    if (m) {
      const required = parseInt(m[1] ?? m[2])
      if (!isNaN(required) && org.years_operating < required) {
        out.push({
          code: 'insufficient_trading_years',
          severity: 'warning',
          message: `Funder may require ${required}+ years of accounts; your org has ${org.years_operating}.`,
        })
      }
    }
  }

  return out
}

// ─────────────────────────────────────────────
// Investment-specific — repayment capacity & asset-lock conflicts
// ─────────────────────────────────────────────
function investmentChecks(opp: GrantOpportunity, org: Organisation): EligibilityIssue[] {
  const out: EligibilityIssue[] = []
  const mid = incomeMidpoint(org.annual_income_band)

  // Minimum investment relative to income — too-large debt service risk
  if (opp.siMinInvestment != null && mid != null && opp.siMinInvestment > mid * 0.5) {
    out.push({
      code: 'si_min_investment_too_large',
      severity: 'warning',
      message: `Minimum investment (£${opp.siMinInvestment.toLocaleString()}) is large relative to your income (~£${mid.toLocaleString()}). Repayment may be challenging.`,
    })
  }

  // Short repayment term + small income → cashflow risk
  if (
    opp.siRepaymentTermMonths != null &&
    mid != null &&
    mid < 100_000 &&
    opp.siRepaymentTermMonths < 24
  ) {
    out.push({
      code: 'si_term_too_short',
      severity: 'warning',
      message: `Short repayment term (${opp.siRepaymentTermMonths} months) may be challenging at your income level.`,
    })
  }

  // Security required vs asset-locked structure
  const securityRequired =
    opp.siSecurityRequired != null && /\b(required|secured|charge|mortgage)\b/i.test(opp.siSecurityRequired)
  const assetLocked =
    org.has_asset_lock === true ||
    (org.legal_structure != null &&
      ['cic_guarantee', 'cio', 'registered_charity'].includes(org.legal_structure))
  if (securityRequired && assetLocked) {
    out.push({
      code: 'si_security_vs_asset_lock',
      severity: 'warning',
      message: 'Security required — your org has an asset lock that may prevent pledging assets.',
    })
  }

  // Charity / CIO + interest > 0 → trustee approval flag
  const isCharityLike =
    org.legal_structure === 'registered_charity' || org.legal_structure === 'cio'
  if (isCharityLike && opp.siInterestRatePercent != null && opp.siInterestRatePercent > 0) {
    out.push({
      code: 'charity_repayable_finance',
      severity: 'info',
      message: `Repayable finance with ${opp.siInterestRatePercent}% interest — registered charities typically need trustee approval and a clear repayment plan.`,
    })
  }

  return out
}

// ─────────────────────────────────────────────
// Programme-specific — cohort timing & stage fit
// ─────────────────────────────────────────────
function programmeChecks(opp: GrantOpportunity, org: Organisation): EligibilityIssue[] {
  const out: EligibilityIssue[] = []

  // Cohort already started → blocker (next intake required)
  if (opp.progNextCohortStart) {
    const start = new Date(opp.progNextCohortStart)
    if (!isNaN(start.getTime()) && start.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
      out.push({
        code: 'cohort_already_started',
        severity: 'blocker',
        message: `Cohort started on ${opp.progNextCohortStart}. Wait for the next intake.`,
      })
    }
  }

  // Stage mismatch — only fires when the programme has explicit stage targeting
  if (opp.progStageTarget && opp.progStageTarget.length > 0 && org.org_stage) {
    if (!opp.progStageTarget.includes(org.org_stage as OrgStage)) {
      out.push({
        code: 'org_stage_mismatch',
        severity: 'warning',
        message: `Programme targets ${opp.progStageTarget.join(', ')} stage organisations — your org is at ${org.org_stage}.`,
      })
    }
  }

  // In-person commute mismatch
  if (opp.progLocationMode === 'in_person' && opp.progLocationCity && org.primary_location) {
    if (!cityMatch(opp.progLocationCity, org.primary_location)) {
      out.push({
        code: 'in_person_commute_mismatch',
        severity: 'warning',
        message: `In-person delivery in ${opp.progLocationCity} — verify travel from your location is feasible.`,
      })
    }
  }

  return out
}

// ─────────────────────────────────────────────
// In-kind-specific — capacity availability
// ─────────────────────────────────────────────
function inKindChecks(opp: GrantOpportunity, _org: Organisation): EligibilityIssue[] {
  const out: EligibilityIssue[] = []

  if (opp.ikCapacityAvailable) {
    if (/\b(booked|paused|closed|full|waitlist|wait\s*list|not\s+accepting)\b/i.test(opp.ikCapacityAvailable)) {
      out.push({
        code: 'ik_capacity_unavailable',
        severity: 'blocker',
        message: `Provider currently ${opp.ikCapacityAvailable}.`,
      })
    }
  }

  return out
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const STRUCTURE_TOKEN_MAP: Record<string, string[]> = {
  cic_guarantee:      ['cic', 'cic_guarantee', 'community_interest_company'],
  cic_shares:         ['cic', 'cic_shares', 'community_interest_company'],
  cio:                ['cio', 'charity', 'registered_charity', 'charitable_incorporated_organisation'],
  registered_charity: ['charity', 'registered_charity'],
  ltd_guarantee:      ['ltd', 'company_limited_by_guarantee', 'social_enterprise'],
  ltd_shares:         ['ltd', 'social_enterprise', 'company_limited_by_shares'],
  llp:                ['llp', 'partnership'],
  cooperative:        ['coop', 'cooperative', 'community_benefit_society'],
  unincorporated:     ['unincorporated', 'community_group', 'voluntary_group'],
  sole_trader:        ['sole_trader', 'individual'],
  not_registered:     ['not_registered', 'idea_stage'],
}

function structureTokens(s: string): string[] {
  const lc = s.toLowerCase()
  return STRUCTURE_TOKEN_MAP[lc] ?? [lc]
}

function structureMatches(orgStructure: LegalStructure, allowed: LegalStructure[]): boolean {
  const orgTokens = new Set(structureTokens(orgStructure))
  return allowed.some(s => structureTokens(s).some(t => orgTokens.has(t)))
}

function labelStructure(s: LegalStructure): string {
  const labels: Record<LegalStructure, string> = {
    cic_guarantee:      'CIC (limited by guarantee)',
    cic_shares:         'CIC (limited by shares)',
    cio:                'Charitable Incorporated Organisation',
    registered_charity: 'Registered charity',
    ltd_guarantee:      'Limited by guarantee',
    ltd_shares:         'Limited by shares',
    llp:                'LLP',
    cooperative:        'Co-operative',
    unincorporated:     'Unincorporated',
    sole_trader:        'Sole trader',
    not_registered:     'Not registered',
  }
  return labels[s]
}

function detectNationRestriction(
  opp: GrantOpportunity,
): 'scotland' | 'wales' | 'northern ireland' | 'england' | null {
  const text = (opp.title + ' ' + (opp.eligibilityCriteria ?? []).join(' ')).toLowerCase()
  const tag = (opp.locationTag ?? '').toLowerCase()
  const haystack = text + ' ' + tag

  for (const n of ['scotland', 'wales', 'northern ireland'] as const) {
    if (
      haystack.includes(`${n} only`) ||
      haystack.includes(`${n}-based`) ||
      haystack.includes(`based in ${n}`) ||
      haystack.includes(`for ${n}`) ||
      haystack.includes(`registered in ${n}`) ||
      tag === n
    ) return n
  }
  if (haystack.includes('england only') || haystack.includes('england-based')) return 'england'
  return null
}

function orgNation(loc: string): 'scotland' | 'wales' | 'northern ireland' | 'england' {
  const lc = loc.toLowerCase()
  if (lc.includes('scotland'))         return 'scotland'
  if (lc.includes('wales'))            return 'wales'
  if (lc.includes('northern ireland')) return 'northern ireland'
  return 'england'
}

function cityMatch(tag: string, orgLoc: string): boolean {
  const tagLc = tag.toLowerCase().trim()
  const locLc = orgLoc.toLowerCase()
  if (locLc.includes(tagLc)) return true
  return tagLc.split(/[,/]/).some(p => p.trim() && locLc.includes(p.trim()))
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

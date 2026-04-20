import type { Organisation } from '@/types'

/**
 * An organisation has completed the minimum onboarding bar if:
 * - name, legal structure, and primary location are present
 * - ≥1 impact sector and ≥1 beneficiary group are present
 *
 * Mission is no longer required -- it's captured from auto-fill where available
 * and can be added later from the profile page.
 */
export function isOnboardingComplete(org: Organisation | null): boolean {
  if (!org) return false
  return !!(
    org.name?.trim() &&
    org.legal_structure &&
    org.primary_location?.trim() &&
    (org.impact_sectors?.length ?? 0) > 0 &&
    (org.beneficiary_groups?.length ?? 0) > 0
  )
}

export function computePostLoginPath(opts: {
  onboardingComplete: boolean
  hasPipelineActivity: boolean
}): string {
  if (!opts.onboardingComplete) return '/onboarding/welcome'
  if (opts.hasPipelineActivity) return '/dashboard'
  return '/dashboard/search'
}

/** sessionStorage key for pre-fill data handed off between onboarding steps */
export const ONBOARDING_PREFILL_KEY = 'gt:onboarding:prefill:v2'

/** Per-field confidence score from the auto-fill extraction (0.0-1.0) */
export interface FieldConfidence {
  name?: number
  legalStructure?: number
  primaryLocation?: number
  annualIncomeBand?: number
  mission?: number
  impactSectors?: number
  beneficiaryGroups?: number
}

export interface OnboardingPrefill {
  name?: string
  charityNumber?: string
  orgType?: string
  legalStructure?: string
  primaryLocation?: string
  annualIncomeBand?: string
  mission?: string
  themes?: string[]
  areasOfWork?: string[]
  beneficiaries?: string[]
  impactSectors?: string[]
  beneficiaryGroups?: string[]
  /** Confidence scores per extracted field -- drives visual states in review step */
  confidence?: FieldConfidence
}

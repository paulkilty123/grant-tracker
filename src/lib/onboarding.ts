import type { Organisation } from '@/types'

/**
 * An organisation has completed the minimum onboarding bar if:
 * - name, legal structure, primary location are present (step 1)
 * - mission, ≥1 impact sector, ≥1 beneficiary group are present (step 2)
 *
 * Step 3 fields (grant size, funding types, alerts) are not required to
 * pass the gate — funding types default to all 4, grant size is optional.
 */
export function isOnboardingComplete(org: Organisation | null): boolean {
  if (!org) return false
  return !!(
    org.name?.trim() &&
    org.legal_structure &&
    org.primary_location?.trim() &&
    org.mission?.trim() &&
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

/** sessionStorage key for pre-fill data handed off from /onboarding/start to /onboarding/wizard */
export const ONBOARDING_PREFILL_KEY = 'gt:onboarding:prefill:v1'

export interface OnboardingPrefill {
  name?: string
  charityNumber?: string
  orgType?: string
  legalStructure?: string
  primaryLocation?: string
  mission?: string
  themes?: string[]
  areasOfWork?: string[]
  beneficiaries?: string[]
  impactSectors?: string[]
  beneficiaryGroups?: string[]
  /** Which fields came from auto-fill — used to render the "Pre-filled" badge */
  prefilledFields?: string[]
}

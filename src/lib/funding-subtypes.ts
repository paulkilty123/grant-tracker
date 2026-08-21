/**
 * Funding sub-type taxonomy and labels.
 *
 * Each funding_type (grant / programme / investment / in_kind) has its own set
 * of optional sub-classifications. Use `SUBTYPES_BY_FUNDING_TYPE` to get the
 * list of valid options for a given funding type, and `SUBTYPE_LABELS` /
 * `SUBTYPE_STYLE` for rendering.
 */

import type { FundingSubtype, FundingType } from '@/types'

export const SUBTYPES_BY_FUNDING_TYPE: Record<FundingType, FundingSubtype[]> = {
  grant: ['unrestricted', 'restricted', 'capital', 'emergency', 'small_grant'],
  programme: ['accelerator', 'incubator', 'fellowship', 'cohort_grant', 'award'],
  investment: ['loan', 'social_investment', 'equity', 'quasi_equity', 'convertible', 'blended', 'revenue_share', 'community_shares'],
  in_kind: ['pro_bono_legal', 'pro_bono_consulting', 'tech_product', 'volunteering', 'office_space', 'training'],
}

export const SUBTYPE_LABELS: Record<FundingSubtype, string> = {
  // grant
  unrestricted: 'Unrestricted',
  restricted: 'Restricted',
  capital: 'Capital',
  emergency: 'Emergency',
  small_grant: 'Small grant',
  // programme
  accelerator: 'Accelerator',
  incubator: 'Incubator',
  fellowship: 'Fellowship',
  cohort_grant: 'Cohort programme',
  award: 'Award / prize',
  // investment
  loan: 'Loan',
  social_investment: 'Social investment',
  equity: 'Equity',
  quasi_equity: 'Quasi-equity',
  convertible: 'Convertible',
  blended: 'Blended finance',
  revenue_share: 'Revenue share',
  community_shares: 'Community shares',
  // in-kind
  pro_bono_legal: 'Pro bono legal',
  pro_bono_consulting: 'Pro bono consulting',
  tech_product: 'Tech / software',
  volunteering: 'Volunteering',
  office_space: 'Office space',
  training: 'Training',
}

/** All valid subtype values (useful for validation) */
export const ALL_FUNDING_SUBTYPES: FundingSubtype[] = Object.keys(SUBTYPE_LABELS) as FundingSubtype[]

export function isValidSubtypeForFundingType(
  subtype: string | null | undefined,
  fundingType: FundingType | null | undefined,
): boolean {
  if (!subtype || !fundingType) return false
  const valid = SUBTYPES_BY_FUNDING_TYPE[fundingType]
  return valid?.includes(subtype as FundingSubtype) ?? false
}

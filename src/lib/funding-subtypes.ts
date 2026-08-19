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
  programme: ['accelerator', 'incubator', 'support_programme', 'training', 'match_funding', 'fellowship', 'cohort_grant', 'award', 'includes_grant'],
  investment: ['loan', 'blended', 'social_investment', 'equity', 'quasi_equity', 'convertible', 'revenue_share', 'community_shares'],
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
  support_programme: 'Support programme',
  match_funding: 'Match funding',
  includes_grant: 'Includes a grant',
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

/**
 * One line per sub-type, written for a fundraiser rather than for us.
 *
 * Shown in the filter menu, where the label alone is not enough: "blended
 * finance" and "quasi-equity" are terms of art, and someone who does not already
 * know them is exactly the person the filter is for.
 */
export const SUBTYPE_HINTS: Partial<Record<FundingSubtype, string>> = {
  loan: 'Borrowed and repaid with interest.',
  blended: 'Part grant, part loan. Only the loan part is repaid.',
  social_investment: 'Priced for social purpose rather than commercial return, so softer terms than a bank.',
  equity: 'A share of your organisation in return for the money. A registered charity cannot issue shares.',
  quasi_equity: 'Behaves like equity but without shares, usually repaid from a share of income.',
  convertible: 'A loan that can turn into a shareholding later.',
  revenue_share: 'Repaid as a percentage of income, so repayments fall when income does.',
  community_shares: 'Raised from the public as withdrawable shares, usually by a society or co-operative.',
  accelerator: 'A fixed-length cohort programme to grow something that already exists.',
  incubator: 'Help to get an early idea or venture off the ground.',
  support_programme: 'Ongoing advice, mentoring or workspace, without a fixed cohort.',
  training: 'Courses and workshops that teach a specific skill.',
  match_funding: 'Money that matches what you raise yourself, often through crowdfunding.',
  includes_grant: 'Cash comes with the programme, not just support in kind.',
  fellowship: 'Funded time and a peer network, usually for one named person.',
  cohort_grant: 'A grant given to a group of organisations going through it together.',
  award: 'Won rather than applied for in the usual sense, often by nomination.',
}

/**
 * Sub-types that mean paying the money back or giving up ownership.
 *
 * A charity's first question about investment is "do I have to repay this",
 * and its second is "can my legal form even accept it". Both are answered from
 * the tags rather than stored separately, so they cannot drift from them.
 */
const REPAYABLE: ReadonlySet<string> = new Set<FundingSubtype>([
  'loan', 'blended', 'equity', 'quasi_equity', 'convertible', 'revenue_share', 'community_shares',
])

/**
 * Does taking this money mean repaying it or giving up ownership?
 *
 * `blended` counts: the loan half is still a loan. Returns null when nothing is
 * tagged, which is NOT the same as false — "we do not know" must never render as
 * "you keep it".
 */
export function isRepayable(subtypes: readonly string[]): boolean | null {
  const known = subtypes.filter(s => s in SUBTYPE_LABELS)
  if (known.length === 0) return null
  return known.some(s => REPAYABLE.has(s))
}

/** Drop unknown or wrong-tab values, de-duplicate, and return in display order. */
export function normaliseSubtypes(raw: unknown, fundingType: FundingType | null | undefined): FundingSubtype[] {
  if (!Array.isArray(raw) || !fundingType) return []
  const valid = SUBTYPES_BY_FUNDING_TYPE[fundingType] ?? []
  return valid.filter(code => raw.includes(code))
}

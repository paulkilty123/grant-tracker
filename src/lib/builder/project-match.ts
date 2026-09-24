import type { Organisation, SpendNeed } from '@/types'
import type { Project } from './projects'

/**
 * The profile a PROJECT is matched with: the organisation for eligibility, the
 * project for what the money is for.
 *
 * Ben Rossi (Portland Charity), 24 Sept 2026: a £22m disability college with a
 * capital build. The project match swapped in the project's sectors and
 * beneficiaries and nothing else, so his build matched the same 89 funds his
 * profile did, Wolfson and Bernard Sunley among them but not above the revenue
 * funders. Three things the project now decides:
 *
 *   spend need    a capital project asks for capital funds and nothing else;
 *                 a revenue project asks for project funding. When the project
 *                 has not said, the organisation's own preferences stand.
 *   size floor    as before: the org's minimum, else a tenth of the budget, so
 *                 a partial-funding grant is not wrongly dropped. (The matcher
 *                 reads no maximum, so the profile's £250k cap never bit.)
 */
export type SpendNeedValue = Project['spend_need']

/** Is this pill on? 'both' lights both pills. */
export function spendNeedHas(current: SpendNeedValue, value: 'capital' | 'revenue'): boolean {
  return current === value || current === 'both'
}

/** The value after clicking one pill: two pills that can both be on, stored as one word. */
export function toggleSpendNeed(current: SpendNeedValue, value: 'capital' | 'revenue'): SpendNeedValue {
  const other = value === 'capital' ? 'revenue' : 'capital'
  const hasValue = spendNeedHas(current, value)
  const hasOther = spendNeedHas(current, other)
  if (hasValue) return hasOther ? other : null
  return hasOther ? 'both' : value
}

export function projectMatchProfile(org: Organisation, project: Project): Organisation {
  // 'both' (a building and the staff to run it) asks for either kind: the
  // matcher lifts a fund that meets ANY stated need, so a capital fund and a
  // project-revenue fund both rise and only funds meeting neither sit flat.
  const spend: SpendNeed[] | undefined =
    project.spend_need === 'capital' ? ['capital']
    : project.spend_need === 'revenue' ? ['restricted']
    : project.spend_need === 'both' ? ['capital', 'restricted']
    : undefined
  const budget = project.budget_amount && project.budget_amount > 0 ? project.budget_amount : null
  return {
    ...org,
    impact_sectors: project.sectors,
    beneficiary_groups: project.beneficiary_groups,
    min_grant_target: org.min_grant_target ?? (budget ? Math.round(budget * 0.1) : null),
    ...(spend ? { spend_restriction_preferences: spend } : {}),
  } as Organisation
}

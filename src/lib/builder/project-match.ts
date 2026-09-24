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
export function projectMatchProfile(org: Organisation, project: Project): Organisation {
  const spend: SpendNeed[] | undefined =
    project.spend_need === 'capital' ? ['capital']
    : project.spend_need === 'revenue' ? ['restricted']
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

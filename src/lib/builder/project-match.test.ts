import { describe, it, expect } from 'vitest'
import { projectMatchProfile, spendNeedHas, toggleSpendNeed } from './project-match'
import { computeMatchScore } from '@/lib/matching'
import type { GrantOpportunity, Organisation } from '@/types'
import type { Project } from './projects'

/**
 * Ben Rossi's case, 24 Sept 2026: Portland Charity (disability college,
 * Mansfield, income over £5m, profile capped at £250k, no spend preference)
 * with a capital build project. Predictions before the run:
 *   capital project   Wolfson (capital) scores ABOVE a revenue-only youth
 *                     fund with the same sectors; the reason names capital
 *   revenue project   the order flips
 *   no spend need     the two score the same on spend, as the profile does
 *   size floor        the org's own minimum stands; with none, a tenth of
 *                     the budget, so a £50k grant survives a £2m build
 */
const org = (over: Partial<Organisation> = {}): Organisation => ({
  id: 'o', created_at: '', name: 'Portland Charity', charity_number: '1', cic_number: null,
  org_type: 'registered_charity', legal_structure: 'registered_charity', social_mission_declared: true, articles_restrict_profit: true,
  impact_sectors: ['disability', 'education', 'employment', 'mental_health'], niche_tags: [], excluded_niche_tags: [], has_asset_lock: true, years_trading: 30, org_stage: null,
  annual_income_band: 'Over £5 million', primary_location: 'Mansfield, Nottinghamshire', areas_of_work: [], beneficiaries: [],
  beneficiary_groups: ['disabled_people', 'young_people'], themes: [],
  mission: 'Supports people with disabilities to live more independent lives through education, day services and employment support.',
  min_grant_target: null, max_grant_target: 250000, funder_type_preferences: [], funding_type_preferences: ['grant'],
  funding_subtype_preferences: [], spend_restriction_preferences: [], people_per_year: null, volunteers: null,
  years_operating: null, projects_running: null, key_outcomes: [], owner_id: 'u', geographic_reach: 'regional', website_url: null,
  ...over,
} as unknown as Organisation)

const project = (over: Partial<Project> = {}): Project => ({
  id: 'p', org_id: 'o', name: 'New skills centre', type_label: 'project', status: 'active', description_raw: null,
  what_it_will_do: 'Build a new skills and independence centre on the Mansfield campus.', who_benefits: 'Young disabled adults.',
  difference_it_makes: null, duration: null, outreach: null, learning: null,
  budget_amount: 2000000, spend_need: 'capital', sectors: ['disability', 'education'], beneficiary_groups: ['disabled_people', 'young_people'],
  created_at: '', updated_at: '', ...over,
})

const grant = (title: string, spendTypes: string[], spendRestriction: string | null): GrantOpportunity => ({
  id: title, title, funder: title, funderType: 'trust_foundation', fundingType: 'grant',
  description: `${title} grants for disability and education.`, amountMin: 50000, amountMax: 500000, deadline: null, isRolling: true, isLocal: false, locationTag: 'UK',
  sectors: ['disability', 'education'], impactSectors: ['disability', 'education'], eligibilityCriteria: [],
  eligibleStructures: ['registered_charity', 'cio'], beneficiaryGroups: ['disabled_people', 'young_people', 'general_public'], nicheTags: [],
  spendTypes, spendRestriction,
} as unknown as GrantOpportunity)

const wolfson = grant('Wolfson Foundation — Capital Grants', ['capital'], null)
const youth   = grant('Youth Skills Revenue Fund', ['revenue'], 'restricted')

describe('projectMatchProfile', () => {
  it('a capital project asks for capital funds and nothing else', () => {
    const p = projectMatchProfile(org(), project())
    expect(p.spend_restriction_preferences).toEqual(['capital'])
    expect(p.impact_sectors).toEqual(['disability', 'education'])
  })
  it('a revenue project asks for project funding', () => {
    expect(projectMatchProfile(org(), project({ spend_need: 'revenue' })).spend_restriction_preferences).toEqual(['restricted'])
  })
  it('an unsaid need leaves the organisation preferences alone', () => {
    expect(projectMatchProfile(org({ spend_restriction_preferences: ['unrestricted'] }), project({ spend_need: null })).spend_restriction_preferences).toEqual(['unrestricted'])
  })
  it('the size floor is the org minimum, else a tenth of the budget', () => {
    expect(projectMatchProfile(org({ min_grant_target: 1000 }), project()).min_grant_target).toBe(1000)
    expect(projectMatchProfile(org(), project()).min_grant_target).toBe(200000)
    expect(projectMatchProfile(org(), project({ budget_amount: null })).min_grant_target).toBeNull()
  })
})

describe('a capital build scored through its project', () => {
  it('puts Wolfson above a revenue-only fund, and says why', () => {
    const p = projectMatchProfile(org(), project())
    const w = computeMatchScore(wolfson, p)
    const y = computeMatchScore(youth, p)
    expect(w.score).toBeGreaterThan(y.score)
    expect(w.reason).toMatch(/capital/i)
  })
  it('flips for a revenue project', () => {
    const p = projectMatchProfile(org(), project({ spend_need: 'revenue' }))
    expect(computeMatchScore(youth, p).score).toBeGreaterThan(computeMatchScore(wolfson, p).score)
  })
  it('precondition: with no need stated the two score the same', () => {
    const p = projectMatchProfile(org(), project({ spend_need: null }))
    expect(computeMatchScore(wolfson, p).score).toBe(computeMatchScore(youth, p).score)
  })
})

describe('both: a building and the staff to run it', () => {
  it('two pills that can both be on, stored as one word', () => {
    expect(toggleSpendNeed(null, 'capital')).toBe('capital')
    expect(toggleSpendNeed('capital', 'revenue')).toBe('both')
    expect(toggleSpendNeed('both', 'capital')).toBe('revenue')
    expect(toggleSpendNeed('revenue', 'revenue')).toBeNull()
    expect(spendNeedHas('both', 'capital')).toBe(true)
    expect(spendNeedHas('revenue', 'capital')).toBe(false)
  })
  it('asks for either kind: Wolfson and the revenue fund both rise above a fund meeting neither', () => {
    const p = projectMatchProfile(org(), project({ spend_need: 'both' }))
    expect(p.spend_restriction_preferences).toEqual(['capital', 'restricted'])
    const neither = grant('Unrestricted Core Fund', ['revenue'], 'unrestricted')
    expect(computeMatchScore(wolfson, p).score).toBeGreaterThan(computeMatchScore(neither, p).score)
    expect(computeMatchScore(youth, p).score).toBeGreaterThan(computeMatchScore(neither, p).score)
  })
})

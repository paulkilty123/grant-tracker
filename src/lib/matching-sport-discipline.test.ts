import { describe, it, expect } from 'vitest'
import { computeMatchScore } from './matching'
import type { GrantOpportunity, Organisation } from '@/types'

// A sport is a gate, not a theme: the Football Foundation for a cricket club.
const grant = (nicheTags: string[]): GrantOpportunity => ({
  id: 'g', title: 'Grassroots Football Grants', funder: 'The Football Foundation', funderType: 'trust_foundation',
  description: 'Football facilities and infrastructure for grassroots community use.',
  amountMin: 1000, amountMax: 25000, deadline: null, isRolling: true, isLocal: false, locationTag: 'UK',
  sectors: ['sport'], impactSectors: ['sport', 'community'], eligibilityCriteria: [],
  eligibleStructures: ['registered_charity', 'cio', 'unincorporated'], beneficiaryGroups: ['general_public', 'women_girls', 'disabled_people'],
  nicheTags,
} as unknown as GrantOpportunity)

const org = (nicheTags: string[]): Organisation => ({
  id: 'o', created_at: '', name: 'Bridlington Cricket Foundation', charity_number: null, cic_number: null,
  org_type: 'registered_charity', legal_structure: 'cio', social_mission_declared: true, articles_restrict_profit: true,
  impact_sectors: ['sport', 'community'], niche_tags: nicheTags, excluded_niche_tags: [], has_asset_lock: true, years_trading: 3, org_stage: null,
  annual_income_band: '£10,000–£50,000', primary_location: 'Bridlington', areas_of_work: [], beneficiaries: [],
  beneficiary_groups: ['children', 'young_people', 'women_girls', 'general_public'], themes: [],
  mission: 'Connection, confidence and belonging for people of all ages in Bridlington through cricket.',
  min_grant_target: null, max_grant_target: null, funder_type_preferences: [], funding_type_preferences: ['grant'],
  funding_subtype_preferences: [], spend_restriction_preferences: [], people_per_year: null, volunteers: null,
  years_operating: null, projects_running: null, key_outcomes: [], owner_id: 'u', geographic_reach: 'local', website_url: null,
} as unknown as Organisation)

describe('sport discipline gate', () => {
  it('a football-only funder is capped for a cricket organisation, even with cross-cutting overlap', () => {
    const r = computeMatchScore(grant(['football', 'disability_sport', 'women_in_sport']), org(['cricket', 'disability_sport', 'women_in_sport']))
    expect(r.score).toBeLessThanOrEqual(30)
    expect(r.positiveReasons.concat(r.warnReasons).join(' ')).toMatch(/football, not cricket/)
  })
  it('the same funder is not capped for a football organisation', () => {
    expect(computeMatchScore(grant(['football']), org(['football'])).score).toBeGreaterThan(30)
  })
  it('a funder with no discipline tag is not capped', () => {
    expect(computeMatchScore(grant(['disability_sport']), org(['cricket'])).score).toBeGreaterThan(30)
  })
})

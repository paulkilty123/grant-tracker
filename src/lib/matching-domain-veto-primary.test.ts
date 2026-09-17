import { describe, it, expect } from 'vitest'
import { computeMatchScore } from './matching'
import type { GrantOpportunity, Organisation } from '@/types'

// Boundary Pictures (documentary production house, creative first) against
// Doc Society's fund as tagged on 16 Sept 2026: creative, justice,
// environment, health. Prediction before the run: with the fix the fund
// clears the 55 floor; a football grant for the same organisation is still
// vetoed; an environment-first grant for a creative-first org is still vetoed.
const org: Organisation = {
  id: 'o', created_at: '', name: 'Boundary Pictures', charity_number: null, cic_number: null,
  org_type: 'social_enterprise', legal_structure: 'ltd_shares', social_mission_declared: true, articles_restrict_profit: false,
  impact_sectors: ['creative', 'education', 'mental_health', 'social_innovation'], niche_tags: ['film_media', 'digital_arts'], excluded_niche_tags: [],
  has_asset_lock: false, years_trading: 12, org_stage: null, annual_income_band: '£250,000–£500,000', primary_location: 'London',
  areas_of_work: [], beneficiaries: [], beneficiary_groups: ['social_impact_orgs', 'young_people', 'general_public'], themes: [],
  mission: 'A production house that creates social and humanitarian documentaries and films with charities and innovators on mental health, education and the environment.',
  min_grant_target: null, max_grant_target: null, funder_type_preferences: [], funding_type_preferences: ['grant'],
  funding_subtype_preferences: [], spend_restriction_preferences: [], people_per_year: null, volunteers: null,
  years_operating: null, projects_running: null, key_outcomes: [], owner_id: 'u', geographic_reach: 'international', website_url: null,
} as unknown as Organisation

const grant = (title: string, sectors: string[], niche: string[] = []): GrantOpportunity => ({
  id: title, title, funder: title, funderType: 'trust_foundation', fundingType: 'grant',
  description: `${title}.`, amountMin: 30000, amountMax: 150000, deadline: null, isRolling: true, isLocal: false, locationTag: 'UK',
  sectors, impactSectors: sectors, eligibilityCriteria: [],
  eligibleStructures: ['cic_guarantee', 'cic_shares', 'ltd_guarantee', 'ltd_shares'], beneficiaryGroups: ['general_public'], nicheTags: niche,
} as unknown as GrantOpportunity)

describe('the domain veto does not fire when the grant leads with the org\'s own primary sector', () => {
  it('Doc Society for a documentary house clears the floor', () => {
    const r = computeMatchScore(grant('Doc Society — Documentary Film Funds', ['creative', 'justice', 'environment', 'health'], ['film_media']), org)
    expect(r.score).toBeGreaterThanOrEqual(55)
    expect(r.warnReasons.join(' ')).not.toMatch(/specialist domain/)
  })
  it('an environment-first grant is still vetoed for a creative-first org', () => {
    const r = computeMatchScore(grant('Rewilding Challenge Fund', ['environment', 'creative']), org)
    expect(r.warnReasons.join(' ')).toMatch(/specialist domain/)
  })
  it('a sport grant is still vetoed', () => {
    const r = computeMatchScore(grant('Grassroots Football', ['sport', 'community']), org)
    expect(r.warnReasons.join(' ')).toMatch(/specialist domain/)
  })
})

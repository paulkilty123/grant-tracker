import { describe, it, expect } from 'vitest'
import { placeParents } from './place-parents'
import { computeMatchScore } from './matching'
import type { GrantOpportunity, Organisation } from '@/types'

/**
 * Paws and Pause, 21 Sept 2026: the profile said "LONDON" then "Brixton and
 * Peckham"; Funding Differently is tagged "Southwark" and scored 15 both times.
 * Predictions before the run: Brixton and Peckham -> lambeth, southwark,
 * london; the Southwark fund scores location 20 for that org and 2 for a
 * Croydon org; Ratcliffe-on-Soar meets a Rushcliffe tag; an unknown place
 * changes nothing.
 */
const org = (loc: string): Organisation => ({
  id: 'o', created_at: '', name: 'Test CIC', charity_number: null, cic_number: null, org_type: 'cic', legal_structure: 'cic_guarantee',
  social_mission_declared: true, articles_restrict_profit: true, impact_sectors: ['mental_health', 'employment'], niche_tags: [], excluded_niche_tags: [],
  has_asset_lock: true, years_trading: 3, org_stage: null, annual_income_band: 'Under £10,000', primary_location: loc, areas_of_work: [], beneficiaries: [],
  beneficiary_groups: ['mental_health'], themes: [], mission: 'Supported employment for people recovering from mental ill-health.', min_grant_target: null, max_grant_target: null,
  funder_type_preferences: [], funding_type_preferences: ['grant'], funding_subtype_preferences: [], spend_restriction_preferences: [], people_per_year: null, volunteers: null,
  years_operating: null, projects_running: null, key_outcomes: [], owner_id: 'u', geographic_reach: 'local', website_url: null,
} as unknown as Organisation)
const grant = (locationTag: string, isLocal = true): GrantOpportunity => ({
  id: 'g', title: 'Funding Differently', funder: 'Southwark Council', funderType: 'local_authority', fundingType: 'grant',
  description: 'Grants for organisations in Southwark improving mental health.', amountMin: 5000, amountMax: 10000, deadline: null, isRolling: true, isLocal, locationTag,
  sectors: ['mental_health'], impactSectors: ['mental_health'], eligibilityCriteria: [], eligibleStructures: ['registered_charity', 'cic_guarantee'], beneficiaryGroups: ['mental_health'], nicheTags: [],
} as unknown as GrantOpportunity)
const loc = (r: ReturnType<typeof computeMatchScore>) => (r as unknown as { breakdown: { location: { score: number } } }).breakdown.location.score

describe('placeParents', () => {
  it('reads neighbourhoods as their borough and London, and villages as their district and county', () => {
    expect(placeParents('Brixton and Peckham')).toEqual(expect.arrayContaining(['lambeth', 'southwark', 'london']))
    expect(placeParents('Ratcliffe-on-Soar')).toEqual(expect.arrayContaining(['rushcliffe', 'nottinghamshire', 'east midlands']))
    expect(placeParents('Bridlington')).toContain('east riding')
    expect(placeParents('Atlantis')).toEqual([])
    expect(placeParents(null)).toEqual([])
  })
})

describe('the matcher meets a borough fund from a typed neighbourhood', () => {
  // The location dimension is reported out of 15 (DEFAULT_MATCH_WEIGHTS.location).
  it('Southwark fund: full marks for Brixton and Peckham and for Southwark, a mismatch for Croydon', () => {
    expect(loc(computeMatchScore(grant('Southwark'), org('Brixton and Peckham, London')))).toBe(15)
    expect(loc(computeMatchScore(grant('Southwark'), org('Southwark, London')))).toBe(15)
    expect(loc(computeMatchScore(grant('Southwark'), org('Croydon, London')))).toBeLessThan(5)
  })
  it('a Rushcliffe fund meets Ratcliffe-on-Soar; a Bassetlaw fund does not', () => {
    expect(loc(computeMatchScore(grant('Rushcliffe'), org('Ratcliffe-on-Soar, Nottinghamshire')))).toBe(15)
    expect(loc(computeMatchScore(grant('Bassetlaw'), org('Ratcliffe-on-Soar, Nottinghamshire')))).toBeLessThan(5)
  })
  it('a London-wide fund that names Southwark in its text no longer dials back for a Peckham org', () => {
    const r = computeMatchScore(grant('London'), org('Peckham, London'))
    expect(loc(r)).toBe(15)
  })
})

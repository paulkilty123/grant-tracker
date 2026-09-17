import { describe, it, expect } from 'vitest'
import { computeMatchScore, isUnrestrictedOffer, UNRESTRICTED_IN_KIND_SCORE_CAP, MATCH_TIER_GOOD } from './matching'
import { normaliseScrapedGrant } from './grants-normalise'
import type { Organisation } from '../types'

// Fixture in the real shape: a Yorkshire cricket CIO (Bridlington Cricket
// Foundation's profile on 11 Sept 2026) and a row shaped like NCVO's training
// listing, which scored 91 for it and sat above every sport grant.
const org = {
  id: 'org-1', name: 'Bridlington Cricket Foundation', legal_structure: 'cio',
  primary_location: 'Bridlington, East Riding of Yorkshire', geographic_reach: 'local',
  annual_income_band: '£10,000–£50,000',
  impact_sectors: ['sport', 'community', 'education', 'health'],
  beneficiary_groups: ['children', 'young_people', 'women_girls', 'general_public'],
  niche_tags: ['cricket', 'disability_sport', 'women_in_sport'],
  funding_type_preferences: ['grant', 'programme', 'investment', 'in_kind'],
  mission: 'Connection, confidence and belonging for people of all ages in Bridlington through cricket.',
} as unknown as Organisation

function row(overrides: Record<string, unknown>) {
  return normaliseScrapedGrant({
    id: '00000000-0000-4000-8000-000000000001', title: 'Learning and development courses', funder: 'A national body',
    funding_type: 'in_kind', funding_subtypes: ['training'], is_active: true,
    location_tag: 'UK', is_local: false, is_rolling: true, deadline: null,
    amount_min: null, amount_max: null,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['community', 'education', 'health', 'sport'], target_beneficiaries: ['general_public'],
    description: 'Training courses for anyone working in a charity or community organisation, on governance, fundraising and leadership.',
    ...overrides,
  } as Record<string, unknown>)
}

describe('unrestricted in-kind offers never outrank a scored grant', () => {
  it('the cap sits just under Good', () => {
    expect(UNRESTRICTED_IN_KIND_SCORE_CAP).toBe(MATCH_TIER_GOOD - 5)
  })

  it('the fixture would clear Good if it were a grant (precondition, or this test is void)', () => {
    const asGrant = computeMatchScore(row({ funding_type: 'grant' }), org).score
    expect(asGrant).toBeGreaterThan(UNRESTRICTED_IN_KIND_SCORE_CAP)
  })

  it('an unrestricted in-kind row is capped', () => {
    const g = row({})
    expect(isUnrestrictedOffer(g)).toBe(true)
    expect(computeMatchScore(g, org).score).toBe(UNRESTRICTED_IN_KIND_SCORE_CAP)
  })

  it('a beneficiary tag does NOT lift the cap (it describes, it does not bar)', () => {
    // StreetGames membership escaped the first cut at 90 on a young_people tag.
    const g = row({ target_beneficiaries: ['young_people', 'people_in_poverty', 'general_public'] })
    expect(isUnrestrictedOffer(g)).toBe(true)
    expect(computeMatchScore(g, org).score).toBe(UNRESTRICTED_IN_KIND_SCORE_CAP)
  })

  it('an income band lifts the cap', () => {
    const g = row({ max_org_income: 500000 })
    expect(isUnrestrictedOffer(g)).toBe(false)
    expect(computeMatchScore(g, org).score).toBeGreaterThan(UNRESTRICTED_IN_KIND_SCORE_CAP)
  })

  it('a local restriction lifts the cap', () => {
    expect(isUnrestrictedOffer(row({ is_local: true, location_tag: 'East Riding of Yorkshire' }))).toBe(false)
  })

  it('a narrow structure list lifts the cap', () => {
    expect(isUnrestrictedOffer(row({ eligible_structures: ['registered_charity'] }))).toBe(false)
  })

  it('the cap is for in-kind only; a grant with the same shape is untouched', () => {
    const g = row({ funding_type: 'grant' })
    expect(isUnrestrictedOffer(g)).toBe(true)
    expect(computeMatchScore(g, org).score).toBeGreaterThan(UNRESTRICTED_IN_KIND_SCORE_CAP)
  })
})

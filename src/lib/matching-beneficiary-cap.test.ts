import { describe, it, expect } from 'vitest'
import { computeMatchScore, beneficiaryPrimaryGate } from './matching'
import type { GrantOpportunity, Organisation } from '@/types'

/**
 * The 16 Sept 2026 case, in the real data's shape: a Bournemouth
 * fertility-support CIC and six live rows exactly as tagged in the catalogue
 * that day. Predictions before the run:
 *   Army Benevolent (veterans, families)            capped: two groups, a veterans' fund
 *   7Stars (children, young_people, carers, ...)   capped: nothing shared
 *   Cash for Kids (children, families, poverty, mh) NOT capped: four groups, families shared;
 *                                                  the tag is loose but the rule holds
 *   Youth Endowment (young_people, ..., women_girls) NOT capped: the org's primary is listed
 *   Awards for All (general_public, ...)           NOT capped
 *   Dorset CF (general_public)                     NOT capped
 * and the same Army row is not capped for a veterans' organisation.
 */
const org = (groups: string[]): Organisation => ({
  id: 'o', created_at: '', name: 'The Fertility Nurture Hub CIC', charity_number: null, cic_number: null,
  org_type: 'cic', legal_structure: 'cic_guarantee', social_mission_declared: true, articles_restrict_profit: true,
  impact_sectors: ['mental_health', 'health', 'community'], niche_tags: [], excluded_niche_tags: [], has_asset_lock: true, years_trading: 2, org_stage: null,
  annual_income_band: 'Under £10,000', primary_location: 'Bournemouth', areas_of_work: [], beneficiaries: [],
  beneficiary_groups: groups, themes: [],
  mission: 'Supports women and couples navigating infertility through a private community, coaching, creative events and in-person meetups.',
  min_grant_target: null, max_grant_target: null, funder_type_preferences: [], funding_type_preferences: ['grant'],
  funding_subtype_preferences: [], spend_restriction_preferences: [], people_per_year: null, volunteers: null,
  years_operating: null, projects_running: null, key_outcomes: [], owner_id: 'u', geographic_reach: 'local', website_url: null,
} as unknown as Organisation)

const grant = (title: string, sectors: string[], groups: string[], locationTag = 'UK', fundingType = 'grant'): GrantOpportunity => ({
  id: title, title, funder: title, funderType: 'trust_foundation', fundingType,
  description: `${title} grants.`, amountMin: 1000, amountMax: 10000, deadline: null, isRolling: true, isLocal: false, locationTag,
  sectors, impactSectors: sectors, eligibilityCriteria: [],
  eligibleStructures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares'], beneficiaryGroups: groups, nicheTags: [],
} as unknown as GrantOpportunity)

const sam = org(['women_girls', 'families'])
const army   = grant('Army Benevolent Fund', ['community', 'health'], ['veterans', 'families'])
const stars  = grant('7Stars Foundation', ['young_people', 'housing', 'health', 'mental_health'], ['children', 'young_people', 'carers', 'lgbtq', 'homeless'], 'England')
const cfk    = grant('Cash for Kids', ['health', 'mental_health', 'financial'], ['children', 'families', 'people_in_poverty', 'mental_health'])
const yef    = grant('Youth Endowment Fund', ['young_people', 'justice', 'health', 'education'], ['young_people', 'children', 'people_in_poverty', 'women_girls'], 'England & Wales')
const afa    = grant('Awards for All England', ['community', 'education', 'health', 'financial'], ['general_public', 'people_in_poverty', 'families'], 'England')
const dorset = grant('Dorset Community Foundation', ['community', 'health', 'mental_health'], ['general_public'], 'Dorset')

describe('primary beneficiary gate', () => {
  it('catches the veterans fund and the children\'s fund; the broad four-group fund sharing one tag is left', () => {
    for (const g of [army, stars]) expect(beneficiaryPrimaryGate(g.beneficiaryGroups, sam.beneficiary_groups, 'grant').capped, g.title).toBe(true)
    expect(beneficiaryPrimaryGate(cfk.beneficiaryGroups, sam.beneficiary_groups, 'grant').capped).toBe(false)
  })
  it('caps the score below the shown floor and says why, as a warning', () => {
    for (const g of [army, stars]) {
      const r = computeMatchScore(g, sam)
      expect(r.score, g.title).toBeLessThanOrEqual(49)
      expect(r.warnReasons.join(' '), g.title).toMatch(/This fund is for .*; your profile does not match that group/)
    }
  })
  it('leaves a fund that lists the organisation\'s own primary group, and general-public funds, alone', () => {
    for (const g of [yef, afa, dorset, cfk]) {
      expect(beneficiaryPrimaryGate(g.beneficiaryGroups, sam.beneficiary_groups, 'grant').capped, g.title).toBe(false)
      expect(computeMatchScore(g, sam).score, g.title).toBeGreaterThan(49)
    }
  })
  it('the same Army row is not capped for a veterans organisation, and children and young people count as each other', () => {
    expect(computeMatchScore(army, org(['veterans'])).score).toBeGreaterThan(49)
    expect(beneficiaryPrimaryGate(['children', 'families'], ['young_people'], 'grant').capped).toBe(false)
  })
  it('a broad funder naming several groups stays when one is shared; a two-group fund sharing nothing goes', () => {
    // Rayne for a homelessness charity that serves refugees: stays.
    expect(beneficiaryPrimaryGate(['young_people', 'refugees_migrants', 'older_people', 'carers'], ['homeless', 'refugees_migrants', 'people_in_poverty'], 'grant').capped).toBe(false)
    // An ex-offender fund for a parents' charity: goes.
    expect(beneficiaryPrimaryGate(['ex_offenders', 'ethnic_minorities'], ['families', 'children'], 'grant').capped).toBe(true)
    // A five-group fund sharing nothing with the org: goes.
    expect(beneficiaryPrimaryGate(['children', 'young_people', 'carers', 'lgbtq', 'homeless'], ['women_girls', 'families'], 'grant').capped).toBe(true)
  })
  it('fires on a programme for one group (Barclays veteran founders, 21 Sept 2026), never on investment or in-kind, nor on a general-public organisation or an untagged side', () => {
    expect(beneficiaryPrimaryGate(['veterans'], ['young_people', 'people_in_poverty'], 'programme').capped).toBe(true)
    expect(beneficiaryPrimaryGate(['veterans'], ['women_girls'], 'investment').capped).toBe(false)
    expect(beneficiaryPrimaryGate(['veterans'], ['women_girls'], 'in_kind').capped).toBe(false)
    expect(beneficiaryPrimaryGate(['veterans'], ['general_public', 'women_girls'], 'grant').capped).toBe(false)
    expect(beneficiaryPrimaryGate([], ['women_girls'], 'grant').capped).toBe(false)
    expect(beneficiaryPrimaryGate(['veterans'], [], 'grant').capped).toBe(false)
  })
})

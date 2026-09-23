import { describe, it, expect } from 'vitest'
import { computeMatchScore, deliversOverseas, excludesOverseasWork } from './matching'
import type { GrantOpportunity, Organisation } from '@/types'

/**
 * The 23 Sept 2026 case in the real data's shape: Our Sansar, a Brighton
 * charity delivering in Nepal, and six live rows with their exclusions as
 * stored that morning. Predictions before the run:
 *   Ford Britain ("overseas projects or travel")          capped at 44
 *   JJ Charitable ("Literacy work outside the UK")       capped at 44
 *   Sir Halley Stewart ("Non-UK-based applicants ...
 *     though projects may be international")             NOT capped: applicant clause only
 *   Ferguson (no overseas exclusion, international tag)  NOT capped
 *   Comic Relief, tagged Global                          location reads International,
 *                                                        scores above 44, reason names it
 *   Awards for All England                               NOT capped by this rule
 * and for The Paper Birds (Essex theatre, reach "UK + international", no
 * international sector) Ford Britain is NOT capped: they tour, their work is here.
 */
const org = (over: Partial<Organisation>): Organisation => ({
  id: 'o', created_at: '', name: 'Our Sansar', charity_number: null, cic_number: null,
  org_type: 'registered_charity', legal_structure: 'registered_charity', social_mission_declared: true, articles_restrict_profit: true,
  impact_sectors: ['international', 'education', 'women', 'young_people'], niche_tags: [], excluded_niche_tags: [], has_asset_lock: true, years_trading: 10, org_stage: null,
  annual_income_band: '£250,000–£500,000', primary_location: 'Brighton', areas_of_work: [], beneficiaries: [],
  beneficiary_groups: ['children', 'women_girls', 'people_in_poverty'], themes: [],
  mission: 'A Brighton-based charity working in Nepal to free children from child labour, trafficking and abuse.',
  min_grant_target: 10000, max_grant_target: 70000, funder_type_preferences: [], funding_type_preferences: ['grant'],
  funding_subtype_preferences: [], spend_restriction_preferences: [], people_per_year: null, volunteers: null,
  years_operating: null, projects_running: null, key_outcomes: [], owner_id: 'u', geographic_reach: 'international', website_url: null,
  ...over,
} as unknown as Organisation)

const grant = (title: string, sectors: string[], exclusions: string | null, locationTag = 'UK'): GrantOpportunity => ({
  id: title, title, funder: title, funderType: 'trust_foundation', fundingType: 'grant',
  description: `${title} grants for charities.`, amountMin: 5000, amountMax: 50000, deadline: null, isRolling: true, isLocal: false, locationTag,
  sectors, impactSectors: sectors, eligibilityCriteria: [],
  eligibleStructures: ['registered_charity', 'cio', 'cic_guarantee'], beneficiaryGroups: ['children', 'young_people', 'general_public'], nicheTags: [],
  funderBrief: { what_they_fund: `${title} funds education and community projects.`, who_can_apply: 'Registered charities.', exclusions },
} as unknown as GrantOpportunity)

const sansar = org({})
const paperBirds = org({ name: 'The Paper Birds', primary_location: 'Maldon, Essex', impact_sectors: ['creative', 'education', 'mental_health'], beneficiary_groups: ['young_people'] })

const FORD_X = 'Everyday running costs such as salaries, venue hire and bills; training; major construction; sponsorship or advertising; research; overseas projects or travel; religious or political projects; second-hand vehicles.'
const ford    = grant('Ford Britain Trust', ['community', 'education', 'young_people'], FORD_X)
const JJ_X = 'Individuals. Capital costs. Literacy work outside the UK. Organisations registered outside the UK. Schools (unless funding additional provision outside timetabled lessons).'
const jj      = grant('The JJ Charitable Trust', ['education'], JJ_X)
const HALLEY_X = 'Non-UK-based applicants (organisations must be UK-based, though projects may be international). Projects without strong dissemination, evaluation, or safeguarding plans.'
const halley  = grant('Sir Halley Stewart Trust', ['education', 'health'], HALLEY_X)
const FERGUSON_X = 'Retrospective funding is not available. Applications must be from registered charities only. Payments cannot be made to individuals.'
const ferguson = grant('Allan & Nesta Ferguson Charitable Trust', ['education', 'international'], FERGUSON_X)
const comic   = grant('Comic Relief', ['international', 'health', 'education'],
  'The source does not explicitly list exclusions or ineligible activities.', 'Global')
const awards  = grant('National Lottery Awards for All England', ['community', 'education'],
  'No explicit exclusions stated.', 'England')

describe('excludesOverseasWork', () => {
  it('fires on work, projects or travel outside the UK', () => {
    expect(excludesOverseasWork(FORD_X)).toBe(true)
    expect(excludesOverseasWork(JJ_X)).toBe(true)
    expect(excludesOverseasWork('Overseas.')).toBe(true)
    expect(excludesOverseasWork('Projects abroad; international travel.')).toBe(true)
  })
  it('does not fire on applicant residence alone', () => {
    expect(excludesOverseasWork(HALLEY_X)).toBe(false)
    expect(excludesOverseasWork('Organisations registered outside the UK.')).toBe(false)
    expect(excludesOverseasWork('Non-UK-based applicants.')).toBe(false)
    expect(excludesOverseasWork(FERGUSON_X)).toBe(false)
    expect(excludesOverseasWork(null)).toBe(false)
  })
})

describe('deliversOverseas', () => {
  it('needs the reach AND the sector', () => {
    expect(deliversOverseas(sansar)).toBe(true)
    expect(deliversOverseas(paperBirds)).toBe(false)
    expect(deliversOverseas(org({ geographic_reach: 'national' }))).toBe(false)
  })
})

describe('overseas delivery cap', () => {
  it('caps UK-only funds at 44 for Our Sansar, with a reason', () => {
    for (const g of [ford, jj]) {
      const r = computeMatchScore(g, sansar)
      expect(r.score, g.title).toBeLessThanOrEqual(44)
      expect(r.reason, g.title).toMatch(/does not fund projects outside the uk/i)
    }
  })
  it('leaves Sir Halley Stewart, Ferguson and Awards for All alone', () => {
    for (const g of [halley, ferguson, awards]) {
      const r = computeMatchScore(g, sansar)
      expect(r.reason, g.title).not.toMatch(/does not fund projects outside the uk/i)
    }
    // Precondition for the test above to mean anything: the uncapped rows
    // score above the cap, so the cap is doing the work, not the sectors.
    expect(computeMatchScore(ferguson, sansar).score).toBeGreaterThan(44)
  })
  it('reads a Global tag as international and lifts it for an international org', () => {
    const r = computeMatchScore(comic, sansar)
    expect(r.score).toBeGreaterThan(44)
    expect(r.reason).toMatch(/funds work outside the uk/i)
    expect(r.reason).not.toMatch(/Geographic focus/)
  })
  it('does not cap Ford Britain for a touring theatre company', () => {
    const r = computeMatchScore(ford, paperBirds)
    expect(r.reason).not.toMatch(/does not fund projects outside the uk/i)
  })
  it('caps a fund for one UK region or nation, however close to the office', () => {
    // Southover Manor Trust (Sussex young people) sat first for Our Sansar on
    // 23 Sept at 77; Youth Endowment Fund (England & Wales) sat third at 75.
    const southover = grant('Southover Manor Trust', ['young_people', 'education'], 'No explicit exclusions stated.', 'Sussex')
    const yef       = grant('Youth Endowment Fund', ['young_people', 'justice', 'education'], 'The source does not explicitly state exclusions.', 'England & Wales')
    for (const g of [southover, yef]) {
      expect(computeMatchScore(g, sansar).score, g.title).toBeLessThanOrEqual(44)
      expect(computeMatchScore(g, sansar).reason, g.title).toMatch(/for work in the UK/i)
      // precondition: the same rows are NOT capped for a Sussex theatre company
      expect(computeMatchScore(g, org({ name: 'Brighton Youth Theatre', impact_sectors: ['creative', 'young_people'], geographic_reach: 'regional' })).score, g.title).toBeGreaterThan(44)
    }
  })
})

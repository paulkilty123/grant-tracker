import { describe, it, expect } from 'vitest'
import { checkProfile, topFinding } from './profile-check'
import type { Organisation } from '@/types'

// The four launch-week shapes, in the real data's shape. Each fixture is built
// to produce a known finding, and the "good" one to produce none of the fix
// kind, so a rule that stops firing fails loudly.
const base: Organisation = {
  id: 'o', created_at: '2026-09-10', name: 'Test', charity_number: null, cic_number: null,
  org_type: 'registered_charity', legal_structure: 'registered_charity',
  social_mission_declared: true, articles_restrict_profit: true,
  impact_sectors: ['creative', 'education'], niche_tags: ['theatre', 'literacy_numeracy'], excluded_niche_tags: [],
  has_asset_lock: true, years_trading: 5, org_stage: null,
  annual_income_band: '£100,000–£250,000', primary_location: 'Dorset', areas_of_work: [], beneficiaries: [],
  beneficiary_groups: ['children', 'young_people'], themes: [],
  mission: 'Every child has something to say. We work with children and young people aged 7 to 19 across Dorset through theatre and creative writing to build literacy and confidence.',
  min_grant_target: 1000, max_grant_target: 20000,
  funder_type_preferences: [], funding_type_preferences: ['grant'], funding_subtype_preferences: [], spend_restriction_preferences: [],
  people_per_year: null, volunteers: null, years_operating: null, projects_running: null, key_outcomes: [],
  owner_id: 'u', geographic_reach: 'local', website_url: null,
}
const LABELS = { theatre: 'Theatre', literacy_numeracy: 'Literacy & Numeracy', film_media: 'Film & Media', youth_mh: 'Youth Mental Health', supported_employment: 'Supported Employment' }

describe('checkProfile', () => {
  it('a well set up profile has no fix findings', () => {
    const f = checkProfile(base, { nicheLabels: LABELS })
    expect(f.filter(x => x.severity === 'fix')).toEqual([])
  })

  it('Paws and Pause: beneficiaries the mission never mentions', () => {
    const org = { ...base, legal_structure: 'cic_guarantee' as const, annual_income_band: 'Under £10,000',
      mission: 'South London doggy daycare providing care and activities for dogs.',
      impact_sectors: ['health', 'mental_health', 'employment'] as Organisation['impact_sectors'],
      niche_tags: ['youth_mh', 'supported_employment'],
      beneficiary_groups: ['mental_health', 'young_people', 'homeless', 'people_in_poverty'] as Organisation['beneficiary_groups'] }
    const f = checkProfile(org, { nicheLabels: LABELS })
    const b = f.find(x => x.id === 'beneficiaries_too_many')
    expect(b).toBeTruthy()
    expect(b!.action).toMatchObject({ kind: 'remove_beneficiaries' })
    expect((b!.action as { values: string[] }).values).toEqual(['mental_health', 'young_people', 'homeless', 'people_in_poverty'])
    expect(b!.severity).toBe('fix')
  })

  it('Redhill: no income band, and international reach on a local mission', () => {
    const org = { ...base, annual_income_band: null, geographic_reach: 'international', primary_location: 'Ratcliffe-on-Soar, Nottinghamshire',
      mission: 'Redhill Fields Open Air Events is a new cultural platform bringing together music, culture and community in a unique open-air setting in Ratcliffe-on-Soar for the local area.' }
    const f = checkProfile(org, { nicheLabels: LABELS, incomeGatedFunders: 37 })
    expect(f.find(x => x.id === 'income_missing')?.title).toBe('37 funders need to know your annual income')
    const r = f.find(x => x.id === 'reach_too_wide')
    expect(r?.severity).toBe('fix')
    expect(r?.action).toEqual({ kind: 'set_reach', suggest: 'regional' })
  })

  it('national reach with a mission that says nothing local is left alone', () => {
    const org = { ...base, geographic_reach: 'national', primary_location: 'London',
      mission: 'We run a national helpline and training programme for schools on literacy, reaching teachers everywhere.' }
    expect(checkProfile(org, { nicheLabels: LABELS }).find(x => x.id === 'reach_too_wide')).toBeUndefined()
  })

  it('Bank of Dreams: a niche tag the mission does not mention', () => {
    const org = { ...base, niche_tags: ['theatre', 'literacy_numeracy', 'film_media'] }
    const n = checkProfile(org, { nicheLabels: LABELS }).find(x => x.id === 'niche_unmentioned')
    expect(n).toBeTruthy()
    expect((n!.action as { values: string[] }).values).toEqual(['film_media'])
    expect(n!.severity).toBe('consider')
  })

  it('a mission that mentions none of the tags is a thin mission, not a tag problem', () => {
    const org = { ...base, mission: 'Short.', niche_tags: ['theatre', 'film_media'] }
    const f = checkProfile(org, { nicheLabels: LABELS })
    expect(f.find(x => x.id === 'mission_thin')).toBeTruthy()
    expect(f.find(x => x.id === 'niche_unmentioned')).toBeUndefined()
  })

  it('four groups with two of them in the mission is a consider, not a fix', () => {
    const org = { ...base, beneficiary_groups: ['children', 'young_people', 'women_girls', 'general_public'] as Organisation['beneficiary_groups'] }
    const b = checkProfile(org).find(x => x.id === 'beneficiaries_too_many')
    expect(b?.severity).toBe('consider')
    expect((b!.action as { values: string[] }).values).toEqual(['women_girls'])
  })

  it('skip drops a finding the caller has no use for', () => {
    const org = { ...base, min_grant_target: null, max_grant_target: null }
    expect(checkProfile(org).some(x => x.id === 'grant_range_missing')).toBe(true)
    expect(checkProfile(org, { skip: ['grant_range_missing'] }).some(x => x.id === 'grant_range_missing')).toBe(false)
  })

  it('sole trader is told plainly', () => {
    const org = { ...base, legal_structure: 'sole_trader' as Organisation['legal_structure'] }
    const s = checkProfile(org).find(x => x.id === 'structure_individual')
    expect(s?.severity).toBe('fix')
  })

  it('general public alone is a consider, and a missing mission is a fix', () => {
    const org = { ...base, mission: null, beneficiary_groups: ['general_public'] as Organisation['beneficiary_groups'] }
    const f = checkProfile(org)
    expect(f.find(x => x.id === 'mission_missing')?.severity).toBe('fix')
    expect(f.find(x => x.id === 'beneficiaries_general_only')?.severity).toBe('consider')
  })

  it('topFinding prefers a fix over an earlier consider', () => {
    const org = { ...base, mission: 'Short.', annual_income_band: null }
    expect(topFinding(checkProfile(org))?.id).toBe('income_missing')
    expect(topFinding([])).toBeNull()
  })
})

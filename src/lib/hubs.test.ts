import { describe, it, expect } from 'vitest'
import {
  pickForHub, roundedCount, roundedCountShort, regionHubForRow, REGION_HUBS, relatedRows,
  type HubRow,
} from './hubs'

// Synthetic fixture in the real shape: a mix of dated, rolling and undated
// rows with staggered check times, the way a sector bucket actually looks.
// The prediction is written before the run: with cap 15, eight slots go to
// the soonest deadlines and seven to the most recently checked of the rest,
// so rolling rows MUST appear. Under a pure deadline sort they would not.

function row(over: Partial<HubRow> & { id: string }): HubRow {
  return {
    external_id: null, title: over.id, funder: 'F', funding_type: 'grant',
    amount_min: null, amount_max: null, amount_undisclosed: false,
    deadline: null, is_rolling: false, location_tag: 'UK', is_local: false, impact_sectors: ['community'],
    first_seen_at: '2026-01-01', url_last_checked: '2026-01-01',
    ...over,
  }
}

const TODAY = '2026-09-15'

describe('pickForHub', () => {
  const dated = Array.from({ length: 20 }, (_, i) =>
    row({ id: `dated-${i}`, deadline: `2026-10-${String(i + 1).padStart(2, '0')}`, url_last_checked: '2026-02-01' }))
  const rolling = Array.from({ length: 20 }, (_, i) =>
    row({ id: `rolling-${i}`, is_rolling: true, url_last_checked: `2026-09-${String(i + 1).padStart(2, '0')}` }))
  const expired = [row({ id: 'expired', deadline: '2026-01-01', url_last_checked: '2026-09-30' })]
  const all = [...rolling, ...dated, ...expired]

  // Precondition: the fixture has more rolling rows than slots, or the test is void.
  expect(rolling.length).toBeGreaterThan(15)

  it('gives half the slots to the soonest deadlines and half to the most recently checked', () => {
    const picked = pickForHub(all, 15, TODAY)
    expect(picked).toHaveLength(15)
    const ids = picked.map(r => r.id)
    expect(ids.slice(0, 8)).toEqual(['dated-0', 'dated-1', 'dated-2', 'dated-3', 'dated-4', 'dated-5', 'dated-6', 'dated-7'])
    // The rest by freshness: the expired-but-recently-checked row first, then the newest rolling rows.
    expect(ids[8]).toBe('expired')
    expect(ids.slice(9)).toEqual(['rolling-19', 'rolling-18', 'rolling-17', 'rolling-16', 'rolling-15', 'rolling-14'])
    expect(new Set(ids).size).toBe(15)
  })

  it('never picks a row twice and fills from freshness when few deadlines exist', () => {
    const picked = pickForHub([...rolling, dated[0]], 15, TODAY)
    expect(picked[0].id).toBe('dated-0')
    expect(picked).toHaveLength(15)
    expect(new Set(picked.map(r => r.id)).size).toBe(15)
  })

  it('returns everything when the bucket is under the cap', () => {
    expect(pickForHub(dated.slice(0, 4), 15, TODAY)).toHaveLength(4)
  })
})

describe('roundedCount boundaries', () => {
  it.each([
    [9, '9', '9'],
    [14, 'over 10', '10+'],
    [50, 'over 40', '40+'],
    [52, 'over 50', '50+'],
    [113, 'over 100', '100+'],
    [460, 'over 450', '450+'],
    [537, 'over 500', '500+'],
    [660, 'over 600', '600+'],
  ])('%i', (n, long, short) => {
    expect(roundedCount(n)).toBe(long)
    expect(roundedCountShort(n)).toBe(short)
  })
})

describe('region bucketing', () => {
  const hub = (slug: string) => REGION_HUBS.find(h => h.slug === slug)!
  it.each([
    ['Belfast', 'northern-ireland'],
    ['Causeway Coast and Glens', 'northern-ireland'],
    ['Glasgow', 'scotland'],
    ['Halkirk, Highland', 'scotland'],
    ['Pembrokeshire', 'wales'],
    ['North Wales', 'wales'],
    ['Leeds', 'england'],
    ['Camden', 'london'],
    ['England & Wales', 'england'],
    ['UK', 'uk'],
    ['UK (15 designated places)', 'uk'],
    ['UK & Global', 'uk'],
    ['Global', 'international'],
    [null, 'uk'],
  ])('%s -> %s', (tag, slug) => {
    expect(regionHubForRow({ location_tag: tag })?.slug).toBe(slug)
  })
  it('keeps Scottish places off the England page and nation lists on every nation they name', () => {
    expect(hub('england').matches('Glasgow')).toBe(false)
    expect(hub('england').matches('England & Wales')).toBe(true)
    expect(hub('wales').matches('England & Wales')).toBe(true)
    expect(hub('scotland').matches('England & Wales')).toBe(false)
  })
})

describe('relatedRows', () => {
  it('ranks shared sectors above region above type, and never returns itself', () => {
    const self = row({ id: 'self', impact_sectors: ['creative', 'young_people'], location_tag: 'Scotland', funding_type: 'grant' })
    const c = [
      self,
      row({ id: 'two-sectors', impact_sectors: ['creative', 'young_people'], location_tag: 'Leeds' }),
      row({ id: 'one-sector-scotland', impact_sectors: ['creative'], location_tag: 'Scotland' }),
      row({ id: 'type-only', impact_sectors: ['health'], location_tag: 'Leeds' }),
      row({ id: 'nothing', impact_sectors: ['health'], location_tag: 'Leeds', funding_type: 'in_kind' }),
    ]
    expect(relatedRows(self, c).map(r => r.id)).toEqual(['two-sectors', 'one-sector-scotland', 'type-only'])
  })
})

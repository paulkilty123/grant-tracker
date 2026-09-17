import { describe, it, expect } from 'vitest'
import { countLaunchInvariants, probeReachability, publicGrantUrl, type ProbeRow } from './launch-bar'

const hidden = (id: string, extra: Partial<ProbeRow> = {}): ProbeRow =>
  ({ id, external_id: null, title: `Hidden ${id}`, is_active: false, pipeline_state: 'rejected', ...extra })
const live: ProbeRow = { id: 'live-1', external_id: null, title: 'Live canary', is_active: true, pipeline_state: 'published' }

/** A fake site: a map from URL to status, or to 'throw' for a network failure. */
function site(map: Record<string, number | 'throw'>) {
  const asked: string[] = []
  const fetchImpl = async (url: string) => {
    asked.push(url)
    const s = map[url]
    if (s === undefined) throw new Error(`unexpected url ${url}`)
    if (s === 'throw') throw new Error('network')
    return { status: s }
  }
  return { fetchImpl, asked }
}

const ORIGIN = 'https://example.test'
const url = (r: ProbeRow) => publicGrantUrl(ORIGIN, r)

describe('countLaunchInvariants', () => {
  it('counts rows, not reasons: a row carrying both unsupported codes is one row', () => {
    const c = countLaunchInvariants([
      [{ code: 'deadline_passed' }],
      [{ code: 'amount_unsupported' }, { code: 'amount_ungrounded' }],
      [{ code: 'amount_ungrounded' }],
      [{ code: 'deadline_passed' }, { code: 'amount_unsupported' }],
      [{ code: 'amount_pot_suspected' }],   // wrong in another way, not this number
      [],
    ] as never)
    expect(c).toEqual({ pastDeadline: 2, unsupportedFigure: 3 })
  })
})

describe('probeReachability', () => {
  // THE ALARM HAS TO FIRE FIRST. A hidden page that answers 200 is exactly the
  // state this exists to catch, so the first test is the one where it does.
  it('a hidden page answering 200 is counted reachable, by name', async () => {
    const rows = [hidden('a'), hidden('b'), hidden('c', { pipeline_state: 'tagged_awaiting_review' })]
    const s = site({ [url(live)]: 200, [url(rows[0])]: 410, [url(rows[1])]: 200, [url(rows[2])]: 404 })
    const r = await probeReachability({ hidden: rows, canary: live, origin: ORIGIN, fetchImpl: s.fetchImpl })
    expect(r.canaryOk).toBe(true)
    expect(r.checked).toBe(3)
    expect(r.reachable.map(h => h.key)).toEqual(['b'])
    expect(r.reachable[0].title).toBe('Hidden b')
    expect(r.unexpected).toEqual([])
    expect(r.unchecked).toBe(0)
  })

  it('410 and 404 are both "not reachable"; anything else is shown as unexpected, not counted', async () => {
    const rows = [hidden('a'), hidden('b'), hidden('c')]
    const s = site({ [url(live)]: 200, [url(rows[0])]: 410, [url(rows[1])]: 404, [url(rows[2])]: 307 })
    const r = await probeReachability({ hidden: rows, canary: live, origin: ORIGIN, fetchImpl: s.fetchImpl })
    expect(r.reachable).toEqual([])
    expect(r.unexpected.map(h => [h.key, h.status])).toEqual([['c', 307]])
    expect(r.checked).toBe(3)
  })

  it('a fetch that fails is UNCHECKED, never a zero', async () => {
    const rows = [hidden('a'), hidden('b')]
    const s = site({ [url(live)]: 200, [url(rows[0])]: 'throw', [url(rows[1])]: 410 })
    const r = await probeReachability({ hidden: rows, canary: live, origin: ORIGIN, fetchImpl: s.fetchImpl })
    expect(r.unchecked).toBe(1)
    expect(r.checked).toBe(1)
    expect(r.reachable).toEqual([])
  })

  it('a canary that does not answer 200 voids the run: the zero is not evidence', async () => {
    const rows = [hidden('a')]
    const s = site({ [url(live)]: 'throw', [url(rows[0])]: 410 })
    const r = await probeReachability({ hidden: rows, canary: live, origin: ORIGIN, fetchImpl: s.fetchImpl })
    expect(r.canaryOk).toBe(false)
    expect(r.canary?.status).toBe(0)
  })

  it('refuses a sample containing a visible row rather than reporting a false leak', async () => {
    const rows = [hidden('a'), hidden('b', { is_active: true })]
    const s = site({})
    await expect(probeReachability({ hidden: rows, canary: live, origin: ORIGIN, fetchImpl: s.fetchImpl }))
      .rejects.toThrow(/publicly visible/)
    expect(s.asked).toEqual([])
  })

  it('refuses a canary that is itself hidden', async () => {
    const s = site({})
    await expect(probeReachability({ hidden: [hidden('a')], canary: hidden('z'), origin: ORIGIN, fetchImpl: s.fetchImpl }))
      .rejects.toThrow(/canary/)
  })

  it('asks at the URL a user would reach: external_id when there is one, uuid otherwise', () => {
    expect(publicGrantUrl(`${ORIGIN}/`, { id: 'uuid-1', external_id: 'ext one' })).toBe(`${ORIGIN}/grants/ext%20one`)
    expect(publicGrantUrl(ORIGIN, { id: 'uuid-1', external_id: null })).toBe(`${ORIGIN}/grants/uuid-1`)
  })
})

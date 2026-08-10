import { describe, it, expect } from 'vitest'
import { resolveFlagGrant, candidateFilterForFlagIds, isUuid, type GrantKey } from './resolve-grant'

/**
 * The two rows below are real, and they are the reason this module exists.
 * Both are live, both are titled "Stronger Communities Fund", and they belong to
 * different funders in different places. Charlotte's flag
 * ("Max income cap of £750,000 p.a - we exceed this") was against the Manchester
 * one. Accepting that correction against the Somerset row would write a
 * Manchester funder's income cap onto a Somerset fund.
 *
 * Note the Manchester row has NO external_id, so it is reachable only by uuid.
 */
const MCR: GrantKey = {
  id: '853a4569-c998-4f24-8450-5830a891efc6',
  external_id: null,
  title: 'Stronger Communities Fund',
}
const SOMERSET: GrantKey = {
  id: 'e2aeafe1-baac-457f-8b41-79e03614b9f8',
  external_id: 'cf_fund:https-www-somersetcf-org-uk-grants-funding-details-stronger-communities-fund',
  title: 'Stronger Communities Fund',
}
const BOTH = [MCR, SOMERSET]

describe('resolveFlagGrant — the two Stronger Communities Fund rows', () => {
  it('resolves Charlotte\'s flag to the Manchester row, not the Somerset one', () => {
    const result = resolveFlagGrant(MCR.id, BOTH)
    expect(result).toEqual({ ok: true, grant: MCR, via: 'id' })
  })

  it('resolves the Somerset row to Somerset, not Manchester', () => {
    const result = resolveFlagGrant(SOMERSET.id, BOTH)
    expect(result).toEqual({ ok: true, grant: SOMERSET, via: 'id' })
  })

  it('resolves the Somerset row by its external_id too', () => {
    const result = resolveFlagGrant(SOMERSET.external_id!, BOTH)
    expect(result).toEqual({ ok: true, grant: SOMERSET, via: 'external_id' })
  })

  // The rule, stated as a test: a shared title must never resolve anything.
  it('never resolves on title, even when the title is unique to the candidates', () => {
    expect(resolveFlagGrant('Stronger Communities Fund', BOTH)).toEqual({
      ok: false, reason: 'not_found',
    })
  })

  it('does not match a null external_id against an empty or null-ish key', () => {
    expect(resolveFlagGrant('', BOTH)).toEqual({ ok: false, reason: 'not_found' })
    expect(resolveFlagGrant('   ', BOTH)).toEqual({ ok: false, reason: 'not_found' })
    expect(resolveFlagGrant('null', BOTH)).toEqual({ ok: false, reason: 'not_found' })
  })
})

describe('resolveFlagGrant — general behaviour', () => {
  it('reports not_found for an unknown id rather than guessing', () => {
    expect(resolveFlagGrant('00000000-0000-0000-0000-000000000000', BOTH)).toEqual({
      ok: false, reason: 'not_found',
    })
  })

  it('reports ambiguous rather than picking one', () => {
    const dupe = [{ ...MCR }, { ...MCR }]
    expect(resolveFlagGrant(MCR.id, dupe)).toEqual({ ok: false, reason: 'ambiguous' })
  })

  it('prefers an id match over an external_id match', () => {
    // A row whose external_id happens to equal another row's uuid.
    const collide: GrantKey = { id: 'aaaaaaaa-0000-0000-0000-000000000000', external_id: MCR.id, title: 'x' }
    const result = resolveFlagGrant(MCR.id, [collide, MCR])
    expect(result).toEqual({ ok: true, grant: MCR, via: 'id' })
  })
})

describe('candidateFilterForFlagIds', () => {
  it('queries both key forms so neither is silently dropped', () => {
    const filter = candidateFilterForFlagIds([MCR.id, SOMERSET.external_id!])
    expect(filter).toContain(`id.in.(${MCR.id})`)
    expect(filter).toContain(`external_id.in.(${SOMERSET.external_id})`)
  })

  it('drops values that would break the PostgREST or-filter grammar', () => {
    const filter = candidateFilterForFlagIds(['legit_id', 'bad,id', 'bad(id)', 'bad"id'])
    expect(filter).toContain('legit_id')
    expect(filter).not.toContain('bad')
  })

  it('returns an empty filter for no usable ids', () => {
    expect(candidateFilterForFlagIds([])).toBe('')
    expect(candidateFilterForFlagIds(['  '])).toBe('')
  })
})

describe('isUuid', () => {
  it('distinguishes the two key forms', () => {
    expect(isUuid(MCR.id)).toBe(true)
    expect(isUuid(SOMERSET.external_id!)).toBe(false)
  })
})

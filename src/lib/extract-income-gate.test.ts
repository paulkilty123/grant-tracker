import { describe, it, expect } from 'vitest'
import { extractIncomeGate } from './extract-income-gate'

/**
 * These guard the shape of what arrives, not the extraction logic.
 *
 * `funder_brief` is jsonb and nothing enforces its shape. The matcher reads it
 * through a structural cast that TypeScript takes on trust, so a field the
 * types call `string | null` can be an array at runtime — 90 of the active
 * rows store `exclusions` that way. That threw "matchAll is not a function"
 * and took the whole of Find Funding down with a client-side exception,
 * because the page maps every row it loads and one bad row kills the map.
 *
 * The casts below are deliberate: they reproduce exactly what the runtime
 * hands this function, which is the thing the type system cannot see.
 */
describe('extractIncomeGate: unenforced funder_brief shapes', () => {
  it('survives exclusions arriving as an array', () => {
    expect(() =>
      extractIncomeGate({ exclusions: ['No individuals', 'No religious activity'] as unknown as string }),
    ).not.toThrow()
  })

  it('still reads a gate out of an array-shaped exclusions field', () => {
    const r = extractIncomeGate({
      exclusions: ['We do not fund organisations with an annual income over £500,000'] as unknown as string,
    })
    expect(r.gateLanguagePresent).toBe(true)
  })

  it('survives every field arriving as the wrong type', () => {
    expect(() =>
      extractIncomeGate({
        description:         42 as unknown as string,
        eligibilityCriteria: 'not an array' as unknown as string[],
        whoCanApply:         { nested: 'object' } as unknown as string,
        exclusions:          ['a', 1, null] as unknown as string,
      }),
    ).not.toThrow()
  })

  it('still works normally on well-formed strings', () => {
    const r = extractIncomeGate({
      description: 'Open to charities with an annual income under £250,000.',
    })
    expect(r.gateLanguagePresent).toBe(true)
  })

  it('reports no gate when nothing mentions income', () => {
    const r = extractIncomeGate({ description: 'Grants for community gardens in Lewisham.' })
    expect(r.gateLanguagePresent).toBe(false)
  })
})

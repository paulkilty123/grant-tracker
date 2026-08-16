import { describe, it, expect } from 'vitest'
import { asStructures, asExclusions, compareStructures, newExclusions, namesJurisdiction, quoteNamesAForm } from './eligibility'
import type { LegalStructure } from '@/types'

describe('asStructures', () => {
  it('accepts taxonomy slugs and sorts them', () => {
    expect(asStructures(['cio', 'registered_charity'])).toEqual(['cio', 'registered_charity'])
  })

  it('expands a bare CIC into both Companies House forms', () => {
    // A funder writing "CICs are eligible" has accepted both and is under no
    // obligation to enumerate sub-forms. Same derivation as the SCIO/CIO rule.
    expect(asStructures(['cic'])).toEqual(['cic_guarantee', 'cic_shares'])
    expect(asStructures(['Community Interest Company'])).toEqual(['cic_guarantee', 'cic_shares'])
  })

  it('tolerates spacing, case and punctuation', () => {
    expect(asStructures(['Registered Charity', 'community group'])).toEqual(['registered_charity', 'unincorporated'])
  })

  it('drops what it does not recognise rather than guessing', () => {
    // A structure gate is a HARD FILTER: a wrong slug does not misinform, it
    // removes the fund from a search silently. Dropping loses information
    // visibly; guessing loses it invisibly.
    expect(asStructures(['charitable_trust_thing', 'cio'])).toEqual(['cio'])
    expect(asStructures(['nonsense'])).toBeNull()
    expect(asStructures([])).toBeNull()
    expect(asStructures('cio')).toBeNull()
    expect(asStructures(null)).toBeNull()
  })

  it('deduplicates across aliases', () => {
    expect(asStructures(['charity', 'registered_charity', 'Registered Charities']))
      .toEqual(['registered_charity'])
  })
})

describe('asExclusions', () => {
  it('trims, collapses whitespace and deduplicates case-insensitively', () => {
    expect(asExclusions(['  No individuals ', 'no individuals', 'No\n\nretrospective  funding']))
      .toEqual(['No individuals', 'No retrospective funding'])
  })

  it('drops fragments and non-strings', () => {
    expect(asExclusions(['ok', 42, null, 'individuals not funded'])).toEqual(['individuals not funded'])
    expect(asExclusions([])).toBeNull()
  })
})

describe('compareStructures', () => {
  const base = { excludedForms: [] as LegalStructure[], geoText: 'UK wide', eligText: null }

  it('confirms when the page names what we hold', () => {
    expect(compareStructures({
      ...base,
      pageStructures: ['registered_charity', 'cio', 'scio'],
      rowStructures:  ['registered_charity', 'cio', 'scio'],
    })).toEqual({ kind: 'confirmed' })
  })

  it('derives equivalents on the PAGE side before comparing', () => {
    // Without this, every UK-wide fund whose page says "registered charities"
    // reads as contradicting a row correctly tagged with all three charity
    // forms, and the engine spends its output proposing we delete correct data.
    expect(compareStructures({
      ...base,
      pageStructures: ['registered_charity'],
      rowStructures:  ['registered_charity', 'cio', 'scio'],
    })).toEqual({ kind: 'confirmed' })
  })

  // The rule the whole module turns on.
  it('NEVER removes a structure the page merely failed to mention', () => {
    // Wee Grants lost its `scio` tag exactly this way and became invisible to
    // its own core audience.
    const v = compareStructures({
      ...base,
      geoText: 'Scotland',
      pageStructures: ['registered_charity'],
      rowStructures:  ['registered_charity', 'scio', 'unincorporated'],
    })
    expect(v.kind).toBe('confirmed')
  })

  it('proposes adding a form the page names that we lack, and calls it widening', () => {
    const v = compareStructures({
      ...base,
      pageStructures: ['registered_charity', 'cic_guarantee', 'cic_shares'],
      rowStructures:  ['registered_charity'],
    })
    expect(v.kind).toBe('widens')
    if (v.kind !== 'widens') throw new Error('narrowed unexpectedly')
    expect(v.add).toEqual(['cic_guarantee', 'cic_shares'])
    expect(v.proposed).toContain('registered_charity')
  })

  it('removes only what the page positively rules out', () => {
    const v = compareStructures({
      ...base,
      pageStructures: ['registered_charity'],
      rowStructures:  ['registered_charity', 'sole_trader'],
      excludedForms:  ['sole_trader'],
    })
    expect(v.kind).toBe('narrows')
    if (v.kind !== 'narrows') throw new Error('widened unexpectedly')
    expect(v.remove).toEqual(['sole_trader'])
    expect(v.proposed).toEqual(['registered_charity'])
  })

  it('reports a simultaneous add and remove as one whole set', () => {
    const v = compareStructures({
      ...base,
      pageStructures: ['registered_charity', 'cooperative'],
      rowStructures:  ['registered_charity', 'individual'],
      excludedForms:  ['individual'],
    })
    expect(v.kind).toBe('both')
    if (v.kind !== 'both') throw new Error('not both')
    expect(v.proposed).toEqual(['cooperative', 'registered_charity'])
    expect(v.proposed).not.toContain('individual')
  })

  it('handles a row with no structures at all', () => {
    const v = compareStructures({ ...base, pageStructures: ['cio'], rowStructures: null })
    expect(v.kind).toBe('widens')
  })

  // Found as a live false confirmation, 2026-08-16, on the Joseph Rank Trust.
  describe('an exhaustive list is the second route to a removal', () => {
    const RANK_QUOTE_GEO = 'Charity Commission of England and Wales'

    it('confirmed a scio tag it should have questioned, before this existed', () => {
      // The regression, kept as a test. Our location_tag says UK, so the
      // derivation added `scio` to the PAGE's side and the two matched — a
      // citation under an error, which is worse than no citation.
      const v = compareStructures({
        ...base,
        geoText: 'UK',
        pageStructures: ['registered_charity'],
        rowStructures:  ['registered_charity', 'cio', 'scio'],
      })
      expect(v.kind).toBe('confirmed')
    })

    it('proposes dropping the Scottish form once the page names its regulator', () => {
      const v = compareStructures({
        ...base,
        geoText: RANK_QUOTE_GEO,          // the page's own words, not our tag
        pageStructures: ['registered_charity'],
        rowStructures:  ['registered_charity', 'cio', 'scio'],
        exhaustive: true,
      })
      expect(v.kind).toBe('narrows')
      if (v.kind !== 'narrows') throw new Error('did not narrow')
      expect(v.remove).toEqual(['scio'])
      expect(v.proposed).toEqual(['cio', 'registered_charity'])
    })

    it('still will not narrow on a list the page did not call complete', () => {
      // The silence rule is the default and stays the default. If the model is
      // unsure it answers false, and nothing is removed.
      const v = compareStructures({
        ...base,
        geoText: RANK_QUOTE_GEO,
        pageStructures: ['registered_charity'],
        rowStructures:  ['registered_charity', 'cio', 'scio'],
        exhaustive: false,
      })
      expect(v.kind).toBe('confirmed')
    })
  })
})

describe('quoteNamesAForm', () => {
  // The live case, 2026-08-16: Berkshire Community Foundation's Grassroots
  // Grants CONFIRMED a nine-form structure gate on this sentence, which was
  // lifted from the page's exclusions list and says nothing about who may apply.
  it('rejects the sentence that produced a false confirmation', () => {
    expect(quoteNamesAForm('You do not meet our general eligibility criteria')).toBe(false)
  })

  it('rejects other real sentences that carry no form', () => {
    for (const q of [
      'Applications must be submitted by 5pm on 12 August.',
      'We award grants of between £500 and £5,000.',
      'Your project must take place within the county.',
    ]) expect(quoteNamesAForm(q)).toBe(false)
  })

  it('accepts a sentence that names one', () => {
    for (const q of [
      'The Trustees can only consider applications from registered charities',
      'Open to CICs and social enterprises',
      'constituted community groups may apply',
      'We fund not-for-profit organisations',
    ]) expect(quoteNamesAForm(q)).toBe(true)
  })

  it('is false for nothing at all', () => {
    expect(quoteNamesAForm(null)).toBe(false)
    expect(quoteNamesAForm('')).toBe(false)
  })
})

describe('namesJurisdiction', () => {
  it('is true when the page names a nation or a regulator', () => {
    for (const q of [
      'registered with the Charity Commission of England and Wales',
      'Scottish charities registered with OSCR',
      'open to organisations across the UK',
    ]) expect(namesJurisdiction(q)).toBe(true)
  })

  it('is false for a list of forms with no geography', () => {
    // Reading this as "not Scotland" would strip `scio` off every UK-wide fund
    // in the catalogue, so it must fall back to our own tag.
    expect(namesJurisdiction('charities, community organisations and social enterprises')).toBe(false)
    expect(namesJurisdiction(null)).toBe(false)
  })
})

describe('newExclusions', () => {
  it('recognises a restatement of something we already hold', () => {
    expect(newExclusions(
      ['We do not fund individuals'],
      'Does not fund individual applicants or retrospective costs.',
    )).toEqual([])
  })

  it('reports a genuinely new one', () => {
    const out = newExclusions(
      ['No support for religious proselytising'],
      'Does not fund individuals or retrospective costs.',
    )
    expect(out).toEqual(['No support for religious proselytising'])
  })

  it('does not match on boilerplate alone', () => {
    // "applications", "organisations", "funding" appear in nearly every
    // exclusion. Matching on them would mark everything as already known and the
    // engine would report nothing, ever.
    const out = newExclusions(
      ['Applications from organisations outside Greater Manchester'],
      'We do not accept applications from organisations working overseas.',
    )
    expect(out).toHaveLength(1)
  })

  it('reports everything when we hold no exclusion text at all', () => {
    expect(newExclusions(['a', 'no individuals'], null)).toEqual(['a', 'no individuals'])
    expect(newExclusions(['no individuals'], '')).toEqual(['no individuals'])
  })
})

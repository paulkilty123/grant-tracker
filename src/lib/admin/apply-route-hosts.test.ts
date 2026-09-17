// A link can resolve, return 200, and name the right funder, and still be
// nowhere you can apply.
//
// Four LIVE rows pointed at Charity Commission register entries and every check
// the catalogue had passed them. Harford Charitable Trust was not in the review
// queue at all. The negative cases matter as much as the positive ones: a
// funder's own site that happens to mention the Charity Commission in its
// footer, or links to its register entry from an About page, must not be caught.

import { describe, it, expect } from 'vitest'
import { badApplyRoute } from './apply-route-hosts'

describe('registers are records, not routes', () => {
  const cases = [
    ['https://register-of-charities.charitycommission.gov.uk/en/charity-search/-/charity-details/277293/charity-overview', 'DCR Allen'],
    ['https://register-of-charities.charitycommission.gov.uk/en/about-the-register-of-charities/-/charity-details/280500', 'Djanogly'],
    ['https://register-of-charities.charitycommission.gov.uk/en/charity-search/-/charity-details/327751', 'Mackintosh'],
  ]
  for (const [url, who] of cases) {
    it(`catches the ${who} row`, () => {
      expect(badApplyRoute(url)?.kind).toBe('registry')
    })
  }

  it('catches the Scottish and Northern Irish registers too', () => {
    expect(badApplyRoute('https://www.oscr.org.uk/about-charities/search-the-register/charity-details?number=SC012345')?.kind).toBe('registry')
    expect(badApplyRoute('https://www.charitycommissionni.org.uk/charity-details/?regid=100123')?.kind).toBe('registry')
  })

  it('catches a GrantNav record, which describes grants already given', () => {
    expect(badApplyRoute('https://grantnav.threesixtygiving.org/grant/360G-example-1')?.kind).toBe('registry')
  })
})

describe('third-party directories are not the funder', () => {
  it('catches the GrantFinder article the Barclays COVID row was catalogued from', () => {
    expect(badApplyRoute('https://www.grantfinder.co.uk/barclays-100x100-uk-covid-19-community-relief-programme-opens-for-applications/')?.kind)
      .toBe('directory')
  })
})

describe('the shapes that are not a page', () => {
  it('flags a social profile', () => {
    expect(badApplyRoute('https://www.linkedin.com/company/some-foundation/')?.kind).toBe('social')
  })

  it('flags a PDF, which nothing can track for changes', () => {
    expect(badApplyRoute('https://example.org/guidance/grants-2026.pdf')?.kind).toBe('document')
  })

  it('reports a mailto as non_web and lets the caller rule on it', () => {
    // The Paley Trust takes applications by email and that IS the route. This
    // must be distinguishable from a defect, not merged with one.
    expect(badApplyRoute('mailto:PaleyTrust@outlook.com')?.kind).toBe('non_web')
  })
})

describe('a funder\'s own site is never caught', () => {
  const fine = [
    'https://www.foundationscotland.org.uk/apply-for-funding/',
    'https://sussexcommunityfoundation.org/grants/how-to-apply/main-grants/',
    'https://www.artscouncil.org.uk/our-open-funds/creative-foundations-fund-cff-round-2',
    // The sharp ones: a funder's own page that TALKS ABOUT the register.
    'https://example-trust.org.uk/about/charity-commission-registration',
    'https://example-trust.org.uk/apply?ref=charitycommission',
    // A page whose path contains "linkedin" but is on the funder's domain.
    'https://example-trust.org.uk/news/find-us-on-linkedin',
    // A grants page listing a PDF, rather than being one.
    'https://example-trust.org.uk/grants/guidance-and-pdf-downloads',
  ]
  for (const url of fine) {
    it(url.replace(/^https?:\/\//, '').slice(0, 52), () => {
      expect(badApplyRoute(url)).toBeNull()
    })
  }

  it('returns null for an empty or missing url rather than inventing a defect', () => {
    expect(badApplyRoute(null)).toBeNull()
    expect(badApplyRoute('')).toBeNull()
    expect(badApplyRoute('   ')).toBeNull()
  })
})

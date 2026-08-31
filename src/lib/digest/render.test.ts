import { describe, it, expect } from 'vitest'
import { renderDigest } from './render'
import type { DigestModel } from './build'
import type { Organisation } from '@/types'

const org = { id: 'org-1', name: 'Asian Community Concern' } as unknown as Organisation

const model: DigestModel = {
  org,
  mode: 'full',
  subject: 'Projects for Young People Grants closes in 10 days',
  preheader: '3 matches worth a look.',
  lead: 'Two close in the next 6 weeks.',
  closing: [
    { kind: 'pipeline', name: 'Projects for Young People Grants', funder: 'Heathrow Community Trust',
      deadline: '2026-09-10', days: 10, status: 'In Identified since 25 August.',
      url: 'https://www.shootsfunding.co.uk/dashboard/grants/pfyp', key: 'p1' },
    { kind: 'saved', name: 'A Saved Fund', funder: 'Someone & Co',
      deadline: '2026-09-17', days: 17, status: 'Saved 3 August, never added to your pipeline.',
      url: 'https://www.shootsfunding.co.uk/dashboard/grants/saved-1', key: 's1' },
  ],
  closingOverflow: 0,
  inProgress: [
    { name: 'Church and Communities Programme', funder: null, stage: 'Submitted',
      status: 'In Submitted.', stalled: false, url: 'https://www.shootsfunding.co.uk/dashboard/grants/ccp', key: 'ip1' },
  ],
  inProgressOverflow: 0,
  matches: [
    { title: 'NCVO Learning & Development', funder: 'NCVO', blurb: 'Training programmes.',
      meta: 'NCVO · rolling', url: 'https://www.shootsfunding.co.uk/dashboard/grants/ncvo', key: 'm1' },
  ],
  matchesOverflow: 0,
  matchTotal: 1,
  matchLabel: 'worth_a_look',
  nearMisses: [
    { title: 'Community Grants Fund', funder: 'X', verdict: 'Ruled out on area.',
      rule: 'Restricted to Scotland — your org is in England.',
      condition: 'We read that from their page on 12 June.',
      url: 'https://www.shootsfunding.co.uk/dashboard/grants/cgf', key: 'nm1' },
  ],
  prompt: { title: 'Get more specific', body: 'Because.', cta: 'Add your specialisms',
            href: 'https://www.shootsfunding.co.uk/dashboard/profile#card-focus' },
  reassurance: 'Nothing else closes before 14 October.',
  catalogue: { live: 581, addedRecently: 20 },
  shown: [],
}

const html = renderDigest(model, {
  origin: 'https://www.shootsfunding.co.uk',
  unsubscribeUrl: 'https://www.shootsfunding.co.uk/api/alerts/unsubscribe?t=tok',
  now: new Date('2026-09-01T09:00:00Z'),
})

describe('every named opportunity is reachable, and lands INSIDE the app', () => {
  // The first version rendered titles as plain text with a single "See all your
  // matches" link at the foot. A reader could see ten funds and click none.
  it.each([
    ['closing pipeline row', 'https://www.shootsfunding.co.uk/dashboard/grants/pfyp'],
    ['closing saved row',    'https://www.shootsfunding.co.uk/dashboard/grants/saved-1'],
    ['in-progress row',      'https://www.shootsfunding.co.uk/dashboard/grants/ccp'],
    ['match row',            'https://www.shootsfunding.co.uk/dashboard/grants/ncvo'],
    ['near-miss row',        'https://www.shootsfunding.co.uk/dashboard/grants/cgf'],
  ])('%s links to its page', (_label, href) => {
    expect(html).toContain(`href="${href}"`)
  })

  it('wraps the title text itself in the anchor, not just a button below it', () => {
    expect(html).toMatch(/<a href="[^"]*\/dashboard\/grants\/ncvo"[^>]*>NCVO Learning &amp; Development<\/a>/)
  })
})

describe('email client constraints', () => {
  it('uses no flexbox, grid or SVG', () => {
    expect(html).not.toMatch(/display:\s*flex/)
    expect(html).not.toMatch(/display:\s*grid/)
    expect(html).not.toContain('<svg')
  })
  it('carries the MSO font conditional', () => {
    expect(html).toContain('if mso')
  })
  it('references the logo as a hosted png, never a data uri', () => {
    expect(html).toContain('/email/shoots-mark@2x.png')
    expect(html).not.toContain('data:image')
  })
  it('keeps "shoots" as live text so the brand survives images being blocked', () => {
    expect(html).toMatch(/>shoots</)
  })
  it('escapes an ampersand in a funder name', () => {
    expect(html).toContain('Someone &amp; Co')
  })
  it('stays far below the Gmail clipping threshold', () => {
    expect(html.length).toBeLessThan(102_000)
  })
})

describe('honesty rules', () => {
  it('carries no match percentage', () => {
    expect(html).not.toMatch(/\d+%\s*match/i)
  })
  it('labels a non-fresh set "Matches worth a look", not "New matches"', () => {
    expect(html).toContain('Matches worth a look')
    expect(html).not.toContain('New matches')
  })
  it('ships the reassurance line', () => {
    expect(html).toContain('Nothing else closes before 14 October.')
  })
})

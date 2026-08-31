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
      deadline: '2026-09-10', deadlineLabel: '10 Sep', days: 10,
      statusPrefix: 'Added 25 Aug · ', statusStrong: 'Identified',
      url: 'https://www.shootsfunding.co.uk/dashboard/search?grant=pfyp', key: 'p1' },
    { kind: 'saved', name: 'A Saved Fund', funder: 'Someone & Co',
      deadline: '2026-09-17', deadlineLabel: '17 Sep', days: 17,
      statusPrefix: 'Saved 3 August, never added to your pipeline.', statusStrong: null,
      url: 'https://www.shootsfunding.co.uk/dashboard/search?grant=saved-1', key: 's1' },
  ],
  closingOverflow: 0,
  inProgress: [
    { name: 'Church and Communities Programme', funder: null, stageLabel: 'Submitted',
      stalled: false, url: 'https://www.shootsfunding.co.uk/dashboard/search?grant=ccp', key: 'ip1' },
  ],
  inProgressOverflow: 0,
  matches: [
    { title: 'NCVO Learning & Development', funder: 'NCVO', blurb: 'Training programmes.',
      type: 'in_kind', meta: 'NCVO · rolling', days: null,
      url: 'https://www.shootsfunding.co.uk/dashboard/search?grant=ncvo', key: 'm1' },
  ],
  matchesOverflow: 0,
  matchTotal: 1,
  matchLabel: 'worth_a_look',
  newThisWeek: [],
  nearMisses: [
    { title: 'Network for Social Change — Grants', funder: 'Network for Social Change',
      type: 'grant', meta: 'Network for Social Change · £25k – £100k',
      verdict: 'Ruled out on legal structure.',
      rule: 'They fund companies limited by guarantee, but not CICs. You are both — a CIC limited by guarantee.',
      condition: 'We read that from their page on 25 June. Funders who write the rule this way have often not considered CICs at all, so it is worth asking.',
      url: 'https://www.shootsfunding.co.uk/dashboard/search?grant=cgf', key: 'nm1' },
  ],
  prompt: { title: 'Get more specific', body: 'Because.', cta: 'Add your specialisms',
            href: 'https://www.shootsfunding.co.uk/dashboard/profile#card-focus' },
  reassurance: 'Nothing else closes before 14 October.',
  catalogue: { live: 581, addedRecently: 20 },
  shown: [],
  debug: { nearMissCandidates: [], nearMissCandidateCount: 0 },
}

const html = renderDigest(model, {
  origin: 'https://www.shootsfunding.co.uk',
  unsubscribeUrl: 'https://www.shootsfunding.co.uk/api/alerts/unsubscribe?t=tok',
  now: new Date('2026-09-01T09:00:00Z'),
})

describe('every named opportunity is reachable, and lands on its card in Find Funding', () => {
  // The first version rendered titles as plain text with a single "See all your
  // matches" link at the foot. A reader could see ten funds and click none.
  it.each([
    ['closing pipeline row', 'https://www.shootsfunding.co.uk/dashboard/search?grant=pfyp'],
    ['closing saved row',    'https://www.shootsfunding.co.uk/dashboard/search?grant=saved-1'],
    ['in-progress row',      'https://www.shootsfunding.co.uk/dashboard/search?grant=ccp'],
    ['match row',            'https://www.shootsfunding.co.uk/dashboard/search?grant=ncvo'],
    ['near-miss row',        'https://www.shootsfunding.co.uk/dashboard/search?grant=cgf'],
  ])('%s links to its page', (_label, href) => {
    expect(html).toContain(`href="${href}"`)
  })

  it('wraps the title text itself in the anchor, not just a button below it', () => {
    expect(html).toMatch(/<a href="[^"]*\/dashboard\/search\?grant=ncvo"[^>]*>NCVO Learning &amp; Development<\/a>/)
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
    expect(html).toContain('/email/shoots-logo@2x.png')
    expect(html).not.toContain('data:image')
  })
  it('carries alt text so the brand still reads with images blocked', () => {
    // The wordmark is part of the image because Space Grotesk cannot load in
    // Outlook or the Gmail app, so "live text" rendered Helvetica rather than
    // the logo. alt is what carries the brand when images are off.
    expect(html).toMatch(/<img[^>]*shoots-logo@2x\.png[^>]*alt="Shoots"/)
  })
  it('gives the logo explicit width and height', () => {
    expect(html).toMatch(/<img[^>]*shoots-logo@2x\.png[^>]*width="146"[^>]*height="43"/)
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

describe('"New this week" is present only when it has rows', () => {
  it('is absent entirely when empty — it never says there is nothing new', () => {
    // The catalogue publishes nothing at all in a normal week more often than
    // not (0 rows in the 7 days before this was built). A section that says
    // "no new funding this week" every week teaches the reader to skip it.
    expect(html).not.toContain('New this week')
    expect(html).not.toMatch(/no new (funding|opportunities)/i)
  })

  it('renders with its qualifying line when it has rows', () => {
    const withNew = renderDigest({
      ...model,
      newThisWeek: [{
        title: 'A Brand New Fund', funder: 'New Funder', blurb: 'Funds community work.',
        type: 'grant', meta: 'New Funder · closes 30 Sep', days: 30,
        url: 'https://www.shootsfunding.co.uk/dashboard/search?grant=new-1', key: 'n1',
      }],
    }, {
      origin: 'https://www.shootsfunding.co.uk',
      unsubscribeUrl: 'https://www.shootsfunding.co.uk/api/alerts/unsubscribe?t=tok',
      now: new Date('2026-09-01T09:00:00Z'),
    })
    expect(withNew).toContain('New this week')
    // The qualifying half matters: these are new AND theirs, not new full stop.
    expect(withNew).toContain('Added to the catalogue in the last seven days, and open to you.')
    expect(withNew).toContain('href="https://www.shootsfunding.co.uk/dashboard/search?grant=new-1"')
  })
})

describe('the catalogue count is a way in', () => {
  it('links the live count to the Latest Grants view', () => {
    expect(html).toContain('href="https://www.shootsfunding.co.uk/dashboard/search?entry=live"')
    expect(html).toContain('581 opportunities live')
  })
})

describe('mobile', () => {
  it('is fluid, not a fixed 600px canvas', () => {
    // A hard width="600" makes a 375px phone zoom out to fit, which shrinks
    // every size in the email by a third. This is the whole bug.
    expect(html).not.toContain('width="600"')
    // Deliberately a lookbehind: max-width:600px is exactly what we DO want,
    // and it contains "width:600px" as a substring, so toContain would fail on
    // the correct markup.
    expect(html).not.toMatch(/(?<!max-)width:600px/)
    expect(html).toContain('max-width:600px')
  })

  it('ships mobile rules that can actually override the inline styles', () => {
    expect(html).toContain('@media only screen and (max-width: 600px)')
    // Inline styles beat a stylesheet unless the rule is !important.
    expect(html).toMatch(/\.gutter\s*\{[^}]*!important/)
  })

  it('carries the viewport meta', () => {
    expect(html).toContain('name="viewport"')
  })
})

describe('the feedback ask is not footer boilerplate', () => {
  it('sits on the card ground with its own button', () => {
    // As plain grey text at the foot it read as the small print every email
    // ends with. It asks for the two cheapest sources of improvement there are.
    const i = html.indexOf('Seen a funder we are missing')
    expect(i).toBeGreaterThan(-1)
    // Generous forward window: inline styles make each element long, and a
    // short slice lands in the profile prompt's button instead.
    const block = html.slice(i - 400, i + 1600)
    expect(block).toContain('#EDF6F1')
    expect(block).toContain('>Tell us</a>')
  })
})

describe('section labels are structure, not furniture', () => {
  it('uses one definition for every label', () => {
    // Three copies of the same declaration is how three labels drift apart.
    const decls = html.match(/letter-spacing:1\.6px/g) ?? []
    const deep = html.match(/letter-spacing:1\.6px;text-transform:uppercase;color:#1D3C3E/g) ?? []
    expect(decls.length).toBeGreaterThan(0)
    expect(deep.length).toBe(decls.length)
  })

  it('never renders a label in the muted caption colour', () => {
    expect(html).not.toMatch(/letter-spacing:1\.6px;text-transform:uppercase;color:#73726F/)
  })
})

describe('funding type is a pill, in the app’s own colours', () => {
  it('draws the tint and foreground for the row’s type', () => {
    // in_kind on the fixture's match row.
    expect(html).toContain('background:#F6EFD9')
    expect(html).toContain('color:#7A5E11')
    expect(html).toMatch(/>In-kind<\/span>/)
  })

  it('never uses the saturated rail colours', () => {
    // Rails belong to the countdown tiles, which are the one signal that has
    // to shout. Four more competing with them would flatten the urgency.
    for (const rail of ['#22874C', '#94402A', '#3C79AC', '#B08A20']) {
      expect(html).not.toContain(rail)
    }
  })

  it('labels every opportunity row, grants included', () => {
    const titles = (html.match(/text-decoration:underline;">[^<]+<\/a>/g) ?? []).length
    const pills = (html.match(/border-radius:999px;background:#(E4F1EA|F2E8E5|E8EFF5|F6EFD9)/g) ?? []).length
    expect(pills).toBeGreaterThan(0)
    expect(titles).toBeGreaterThanOrEqual(pills)
  })
})

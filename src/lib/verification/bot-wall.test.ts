// A bot wall must never be read as the funder's page.
//
// Every fixture here is a real response captured from production's egress on
// 2026-09-01, with its real character count. The lengths are the point: each one
// cleared verify-row.ts's old 200-character floor, which is how 21 rows came to
// carry "the page does not describe this fund" about pages nobody had read.

import { describe, it, expect } from 'vitest'
import { looksLikeAWall, readBlockedByAWall, MIN_USEFUL_CHARS } from './bot-wall'

/** Cloudflare's managed challenge, as served to artscouncil.org.uk. 268 chars. */
const CLOUDFLARE = 'www.artscouncil.org.uk Performing security verification This website uses a '
  + 'security service to protect against malicious bots. This page is displayed while the website '
  + 'verifies you are not a bot. Ray ID: a344af307f778aaa Performance and Security by Cloudflare Privacy'

/** Imperva/Distil, as served to coop.co.uk. 678 chars — above every floor. */
const IMPERVA = 'Pardon Our Interruption As you were browsing something about your browser made us '
  + 'think you were a bot. There are a few reasons this might happen: You are a power user moving '
  + 'through this website with super-human speed. You have disabled cookies in your web browser. A '
  + 'third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running. '
  + 'Additional information is available in this support article. To regain access, please make sure '
  + 'that cookies and JavaScript are enabled before reloading the page. Please stand by We are getting '
  + 'everything ready for you. The page is loading, and you will be on your way in just a few moments. '
  + 'Thanks for your patience!'

describe('looksLikeAWall', () => {
  it('catches the Cloudflare interstitial that cleared the old 200-char floor', () => {
    // The precondition IS the finding. If this ever drops below 200 the fixture
    // has been edited and the regression it guards is no longer being tested.
    expect(CLOUDFLARE.length).toBeGreaterThan(200)
    expect(looksLikeAWall(CLOUDFLARE).walled).toBe(true)
  })

  it('catches Imperva, which clears the 400-char backstop too', () => {
    expect(IMPERVA.length).toBeGreaterThan(MIN_USEFUL_CHARS)
    expect(looksLikeAWall(IMPERVA).walled).toBe(true)
    // Proof the signature did the work, not the length.
    expect(looksLikeAWall(IMPERVA).why).toContain('signature')
  })

  it('catches an empty response and says which floor it failed', () => {
    expect(looksLikeAWall('').walled).toBe(true)
    expect(looksLikeAWall('short page').why).toContain(String(MIN_USEFUL_CHARS))
  })

  it('passes a real funder page', () => {
    const page = 'Community Grants. We offer grants of up to £5,000 to charities and community '
      + 'groups across the county. Who can apply: registered charities, CIOs, CICs and constituted '
      + 'community groups with a bank account in the organisation name. How to apply: complete our '
      + 'online form. The next deadline is 30 November 2026. Applications are assessed by our grants '
      + 'panel, which meets quarterly. We do not fund individuals, statutory bodies, or retrospective '
      + 'costs already incurred before the date of the award.'
    expect(page.length).toBeGreaterThan(MIN_USEFUL_CHARS)
    expect(looksLikeAWall(page).walled).toBe(false)
  })

  // The scan is bounded to the first 1,200 characters, and that bound is the
  // whole reason a signature list is safe to use. A wall says what it is at the
  // top, because saying so is the entire content of the page; a funder page that
  // happens to mention a captcha does so somewhere in the middle of its own
  // prose. The bound is asserted from both sides so a future widening of the
  // window cannot silently start flagging real pages.
  it('does not flag a real page that mentions a captcha beyond the scan window', () => {
    const filler = 'Small grants of up to five thousand pounds for local groups. '.repeat(40)
    expect(filler.length).toBeGreaterThan(1200)
    expect(looksLikeAWall(filler + 'Our form uses a captcha to prevent spam.').walled).toBe(false)
  })

  it('DOES flag the same phrase inside the window — the bound is the only guard', () => {
    const page = 'Please complete the captcha to continue. ' + 'Filler text. '.repeat(60)
    expect(page.length).toBeGreaterThan(MIN_USEFUL_CHARS)
    expect(looksLikeAWall(page).walled).toBe(true)
  })
})

describe('readBlockedByAWall', () => {
  it('is true for the reasons that mean nobody read the page', () => {
    for (const reason of ['bot_wall', 'empty_page', 'both_paths_failed']) {
      expect(readBlockedByAWall({ _read_exhausted: { reason } })).toBe(true)
    }
  })

  it('is FALSE for not_a_web_url — that is a defect in the link, not in our reading', () => {
    expect(readBlockedByAWall({ _read_exhausted: { reason: 'not_a_web_url' } })).toBe(false)
  })

  it('is false when nothing is recorded', () => {
    expect(readBlockedByAWall(null)).toBe(false)
    expect(readBlockedByAWall({})).toBe(false)
    expect(readBlockedByAWall({ _page_read: { note: 'fixable_link: wrong_fund' } })).toBe(false)
  })
})

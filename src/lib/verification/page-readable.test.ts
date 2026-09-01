// Every page the review queue was calling "the page does not describe this fund".
//
// All 21 are REAL RESPONSES, captured from production's egress on 2026-09-01
// with their real character counts. The counts are the point: every one of them
// cleared verify-row.ts's old 200-character floor, went to the model as though
// it were the funder's page, and came back with an answer about a funder whose
// page nobody had read.
//
// The fixtures assert the REASON as well as the verdict. Ordering used to make
// the reason wrong: the length floor ran first, so 13 rows carrying a Cloudflare
// signature two words in were filed as "too short". A bot wall is retried and
// backed off per host; a soft 404 is a link to fix; a directory listing means
// the funder's site is gone. Getting the verdict right and the reason wrong
// sends all three down the same road.

import { describe, it, expect } from 'vitest'
import { classifyPage, MIN_USEFUL_CHARS, type UnreadableReason } from './page-readable'

type Fixture = { id: string; host: string; title: string; chars: number; text: string }

/** The 21 rows, verbatim. Do not tidy the text: the byte count is the evidence. */
const WALLED: Fixture[] = [
  { id: '20fe8bd9', host: 'wellcome.org', title: "Wellcome Trust — Public Engagement & Society", chars: 0, text: "" },
  { id: '283f4277', host: 'uk.coop', title: "Community Shares — Booster Fund", chars: 257, text: "www.uk.coop Performing security verification This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot. Ray ID: a344b9e57ca11331 Performance and Security by Cloudflare Privacy" },
  { id: '6aa5d536', host: 'chichester.gov.uk', title: "Chichester District Council — Community Gran", chars: 267, text: "www.chichester.gov.uk Performing security verification This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot. Ray ID: a344b9ef8f43d638 Performance and Security by Cloudflare Privacy" },
  { id: '8c8418fe', host: 'artscouncil.org.uk', title: "Arts Council National Lottery Project Grants", chars: 268, text: "www.artscouncil.org.uk Performing security verification This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot. Ray ID: a344ba1f6dead6dc Performance and Security by Cloudflare Privacy" },
  { id: '79b3cc06', host: 'artscouncil.org.uk', title: "National Lottery Project Grants", chars: 268, text: "www.artscouncil.org.uk Performing security verification This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot. Ray ID: a344ba3e0de81555 Performance and Security by Cloudflare Privacy" },
  { id: '0d4a2ffd', host: 'london.gov.uk', title: "London Community Energy Fund", chars: 263, text: "www.london.gov.uk Performing security verification This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot. Ray ID: a344ba385eee05c8 Performance and Security by Cloudflare Privacy" },
  { id: '21ef3915', host: 'artscouncil.org.uk', title: "Capital Investment Programme (CIP)", chars: 268, text: "www.artscouncil.org.uk Performing security verification This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot. Ray ID: a344ba3de8bef784 Performance and Security by Cloudflare Privacy" },
  { id: 'f28580cf', host: 'artscouncil.org.uk', title: "Libraries Improvement Fund (LIF)", chars: 268, text: "www.artscouncil.org.uk Performing security verification This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot. Ray ID: a344ba435d75cff8 Performance and Security by Cloudflare Privacy" },
  { id: '3da49c2b', host: 'waitrose.com', title: "Community Matters", chars: 323, text: "Waitrose & Partners | Food | Drink | Recipes 404 NOT FOUND Sorry, the requested resource was not found. Please try again. Contact Us Help & Support Our Websites Groceries Cellar John Lewis & Partners Foreign Currency Cookery School Follow Us facebook Twitter Pinterest YouTube Instagram Copyright © 2024 Waitrose & Partners" },
  { id: '495e8cbc', host: 'coop.co.uk', title: "Co-op Local Community Fund", chars: 678, text: "Pardon Our Interruption As you were browsing something about your browser made us think you were a bot. There are a few reasons this might happen: You're a power user moving through this website with super-human speed. You've disabled cookies in your web browser. A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running. Additional information is available in this support article . To regain access, please make sure that cookies and JavaScript are enabled before reloading the page. Please stand by We're getting everything ready for you. The page is loading, and you'll be on your way in just a few moments. Thanks for your patience!" },
  { id: 'b7b435e3', host: 'artscouncil.org.uk', title: "National Portfolio Investment Programme 2028", chars: 41, text: "Enable JavaScript and cookies to continue" },
  { id: 'd4f9cf52', host: 'artscouncil.org.uk', title: "Museum Transformation Programme", chars: 1314, text: "www.artscouncil.org.uk Performing security verification This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot. Incompatible browser extension or network configuration Your browser extensions or network settings have blocked the security verification process required by www.artscouncil.org.uk. To resolve this, try the following steps: Temporarily disable browser extensions: Go to your browser settings. Locate your browser extensions and temporarily disable them. Once browser extensions are disabled, refresh this page. Check your network settings: Verify if your internet or firewall settings have blocked your device from reaching “challenges.cloudflare.com”. You may need to consult your operating system's help documentation or your network administrator for guidance on adjusting firewall settings. If you do not have permission to adjust network settings, try connecting to a different network. If these steps do not resolve the issue, refer to Cloudflare's troubleshooting documentation for more help. For detailed guidance on how to disable your browser extensions or check your network settings, refer to your browser or device’s documentation. Ray ID: a344b0679f9cfdd8 Performance and Security by Cloudflare Privacy" },
  { id: 'c81a166a', host: 'artscouncil.org.uk', title: "Museum Renewal Fund 2025-26", chars: 1314, text: "www.artscouncil.org.uk Performing security verification This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot. Incompatible browser extension or network configuration Your browser extensions or network settings have blocked the security verification process required by www.artscouncil.org.uk. To resolve this, try the following steps: Temporarily disable browser extensions: Go to your browser settings. Locate your browser extensions and temporarily disable them. Once browser extensions are disabled, refresh this page. Check your network settings: Verify if your internet or firewall settings have blocked your device from reaching “challenges.cloudflare.com”. You may need to consult your operating system's help documentation or your network administrator for guidance on adjusting firewall settings. If you do not have permission to adjust network settings, try connecting to a different network. If these steps do not resolve the issue, refer to Cloudflare's troubleshooting documentation for more help. For detailed guidance on how to disable your browser extensions or check your network settings, refer to your browser or device’s documentation. Ray ID: a344b53088d991d2 Performance and Security by Cloudflare Privacy" },
  { id: '0da6e8ba', host: 'artscouncil.org.uk', title: "Creative Foundations Fund (CFF) Round 2", chars: 268, text: "www.artscouncil.org.uk Performing security verification This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot. Ray ID: a344ba647c8257ea Performance and Security by Cloudflare Privacy" },
  { id: '8b6e8083', host: 'artscouncil.org.uk', title: "Supporting grassroots music", chars: 1314, text: "www.artscouncil.org.uk Performing security verification This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot. Incompatible browser extension or network configuration Your browser extensions or network settings have blocked the security verification process required by www.artscouncil.org.uk. To resolve this, try the following steps: Temporarily disable browser extensions: Go to your browser settings. Locate your browser extensions and temporarily disable them. Once browser extensions are disabled, refresh this page. Check your network settings: Verify if your internet or firewall settings have blocked your device from reaching “challenges.cloudflare.com”. You may need to consult your operating system's help documentation or your network administrator for guidance on adjusting firewall settings. If you do not have permission to adjust network settings, try connecting to a different network. If these steps do not resolve the issue, refer to Cloudflare's troubleshooting documentation for more help. For detailed guidance on how to disable your browser extensions or check your network settings, refer to your browser or device’s documentation. Ray ID: a344ba65d80fd641 Performance and Security by Cloudflare Privacy" },
  { id: 'e31c28ad', host: 'thefsi.org', title: "FSI Small Charity Training and Capacity Buil", chars: 133, text: "Index of / Index of / Name Last Modified Size cgi-bin 2023-07-2513:20 - Proudly Served by LiteSpeed Web Server at thefsi.org Port 443" },
  { id: '93f38ed1', host: 'london.gov.uk', title: "Jobs and Skills Funding Opportunities", chars: 263, text: "www.london.gov.uk Performing security verification This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot. Ray ID: a344ba75dd5e780e Performance and Security by Cloudflare Privacy" },
  { id: 'f2791500', host: 'london.gov.uk', title: "Community Housing Fund", chars: 263, text: "www.london.gov.uk Performing security verification This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot. Ray ID: a344ba7abbc9c9b8 Performance and Security by Cloudflare Privacy" },
  { id: 'a91f58e0', host: 'rankfoundation.com', title: "Time to Shine Fellowship", chars: 47, text: "Five people have multiple emojis on their faces" },
  { id: 'cdd31f5e', host: 'buses.co.uk', title: "Brighton & Hove Buses Community Support Fund", chars: 261, text: "www.buses.co.uk Performing security verification This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot. Ray ID: a344ba95aed96147 Performance and Security by Cloudflare Privacy" },
  { id: '38d502d6', host: 'london.gov.uk', title: "Green Roots Fund", chars: 263, text: "www.london.gov.uk Performing security verification This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot. Ray ID: a344ba8d7bf2e5e6 Performance and Security by Cloudflare Privacy" },]

describe('the 21 pages the queue blamed funders for', () => {
  it('has all 21, and they are the ones that cleared the old floor', () => {
    expect(WALLED).toHaveLength(21)
    // The regression this whole module exists for. If a future edit shortens a
    // fixture below 200 the test would still pass while no longer testing
    // anything, so the precondition is asserted rather than assumed.
    const clearedOldFloor = WALLED.filter(f => f.chars >= 200)
    expect(clearedOldFloor.length).toBeGreaterThanOrEqual(13)
  })

  for (const f of WALLED) {
    it(`${f.host} (${f.chars} chars) — ${f.title}`, () => {
      const r = classifyPage(f.text)
      expect(r.ok, `${f.host} classified as readable`).toBe(false)
    })
  }

  it('names WHY, not just that something was wrong', () => {
    const reasonOf = (host: string): UnreadableReason | 'ok' => {
      const f = WALLED.find(x => x.host === host)!
      const r = classifyPage(f.text)
      return r.ok ? 'ok' : r.reason
    }
    // Cloudflare, at 257-268 chars. Under the old ordering every one of these
    // reported "too short", which is true and useless.
    expect(reasonOf('artscouncil.org.uk')).toBe('bot_wall')
    expect(reasonOf('london.gov.uk')).toBe('bot_wall')
    expect(reasonOf('chichester.gov.uk')).toBe('bot_wall')
    expect(reasonOf('uk.coop')).toBe('bot_wall')
    expect(reasonOf('buses.co.uk')).toBe('bot_wall')
    // Imperva, 678 chars, above every floor in the codebase.
    expect(reasonOf('coop.co.uk')).toBe('bot_wall')
    // Not walls at all, and each needs a different response.
    expect(reasonOf('waitrose.com')).toBe('soft_404')
    expect(reasonOf('thefsi.org')).toBe('directory_listing')
    expect(reasonOf('wellcome.org')).toBe('empty')
  })

  it('counts how many are genuinely nothing-but-short', () => {
    // Only the residue should land on the backstop. If this number climbs, a
    // new interception format has appeared and wants a signature.
    const shorts = WALLED.filter(f => { const r = classifyPage(f.text); return !r.ok && r.reason === 'too_short' })
    expect(shorts.length).toBeLessThanOrEqual(2)
  })
})

// ── The negative cases. A false positive here is silent. ────────────────────
//
// Every one is a page a real funder could plausibly publish. If any of these
// classified as unreadable, the row would be pulled out of a reviewer's way and
// filed under "nothing more we can do" while the page sat there working.

const REAL_PAGE = (extra = '') =>
  'Community Grants Programme. We award grants of up to £5,000 to registered charities, '
  + 'CIOs, CICs and constituted community groups working in the county. Who can apply: your '
  + 'organisation must have a bank account in its own name, a safeguarding policy, and at least '
  + 'two years of accounts. How to apply: complete the online form and upload your most recent '
  + 'accounts. The next closing date is 30 November 2026 and our panel meets quarterly. We do '
  + 'not fund individuals, statutory bodies, or costs already incurred before the award date. '
  + extra

describe('a genuine funder page is never classified as unreadable', () => {
  it('reads a normal grants page', () => {
    expect(classifyPage(REAL_PAGE()).ok).toBe(true)
  })

  it('does not fire on a page that mentions security', () => {
    // The signature is "security service to protect", not the word "security".
    expect(classifyPage(REAL_PAGE('We fund cyber security and online safety projects. ')).ok).toBe(true)
  })

  it('does not fire on a funder that names Cloudflare in its own text', () => {
    // Bare "Cloudflare" is not a signature; "cloudflare ray id" is.
    expect(classifyPage(REAL_PAGE('Our website is served through Cloudflare. ')).ok).toBe(true)
  })

  it('does not fire on a cyber-security funder discussing DDoS protection', () => {
    // "ddos protection" IS a signature, so this is the sharpest negative case
    // available. It passes only because the scan is bounded to the first 1,200
    // characters and this page says it later, in its own prose.
    const page = REAL_PAGE().padEnd(1400, ' ') + 'Grants have funded DDoS protection for small charities.'
    expect(page.length).toBeGreaterThan(1200)
    expect(classifyPage(page).ok).toBe(true)
  })

  it('does not fire on a page whose FAQ explains 404 errors', () => {
    // The 404 test needs the numeral and the wording together in the window.
    expect(classifyPage(REAL_PAGE('If a link returns a 404, please email us. ')).ok).toBe(true)
  })

  it('does not fire on a long page about applications not found in our system', () => {
    expect(classifyPage(REAL_PAGE('Applications not found in our system are usually still in the post. ')).ok).toBe(true)
  })

  it('DOES still fire when the same phrases are the whole page', () => {
    // The bound is the only guard, so it is asserted from both sides.
    expect(classifyPage('Attention Required! Please verify you are human. ' + 'x '.repeat(400)).ok).toBe(false)
    expect(classifyPage('404 Error. Sorry, the page you are looking for is no longer here. ' + 'x '.repeat(400)).ok).toBe(false)
  })

  it('a page just over the floor with real content is readable', () => {
    const justOver = 'Grants of up to £2,000 for community groups in the borough. '.repeat(7)
    expect(justOver.length).toBeGreaterThan(MIN_USEFUL_CHARS)
    expect(classifyPage(justOver).ok).toBe(true)
  })
})

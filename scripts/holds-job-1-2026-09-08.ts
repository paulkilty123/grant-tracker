// Holds handoff (2026-09-08) — job 1: six review rows whose page could not be
// read from a script on 7 Sept. Read today with node's fetch first, the Chrome
// browser tools where fetch was blocked. One reject, five holds — no writes at
// all, since nothing here cleared the bar for publish/park and reject/hold both
// write nothing on the row (verdicts brief rule 1).
//
// Ashoka: still 403 direct (same as 7 Sept), read in the browser instead. The
// nominate link redirects to a "Recommend an Ashoka Fellow" page, confirming the
// row's own brief — Ashoka Fellows are recommended by a third party, not
// applicants themselves; there is no route for an organisation to apply.
// reject/out_of_scope.
//
// Corrected 2026-09-08 after grant-tracker-be's check: the first read used the
// reader proxy for the Cloudflare-blocked page, and its returned text did not
// match what the browser renders at that URL. The brief's own rule (fetch, then
// browser, never a third party) is followed from here on for every row, this one
// included.
//
// Horsham: readable in the browser (bot wall on fetch). Two problems, so hold:
// the round the pinned 30 June deadline belonged to has passed and the page
// instead lists four recurring rounds a year; and the page shows two unlabelled
// grant sizes (up to £5,000 and up to £15,000) against a pinned £2,500-£5,000,
// which the notes said should be a hold if the page disagrees.
//
// Macmillan Q Lab: readable in the browser once the cookie modal was dismissed
// (a permission error on first read turned out to be the modal, not the site).
// Deadline confirmed (14 Sept, matches). Amount doesn't confirm: the page states
// one figure, "£75,000 to support teams through the process" — read across the
// whole cohort, not a per-team ceiling — and never mentions £200,000. Hold, not
// publish, per the brief's own conditional ("if both hold... give publish").
//
// Peter Kershaw Trust: read cleanly via direct fetch this time (7 Sept called it
// a 1MB unreadable page; today's fetch returned 1.6KB of clean text, so whatever
// broke the read before isn't reproducing). Real, open to organisations, one
// window a year closing 30 September — three weeks off. But the brief the page
// can support is thin: no maximum stated (defers to Annual Accounts, not
// fetchable), no exclusions on the page, and who_can_apply beyond "organisations
// working in social welfare" is not detailed. Hold, flagged as time-sensitive.
//
// EY Foundation and Screwfix Foundation: both hosts are down across every path
// tried — direct fetch, reader proxy, and the Chrome browser (error page, no
// response). Not a per-origin fetch problem this time; genuinely unreachable
// today. Hold, unreadable.
//
//   npx tsx --env-file=.env.local scripts/holds-job-1-2026-09-08.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runJob, type Row } from './holds-lib-2026-09-08'

const APPLY = process.argv.includes('--apply')

const ROWS: Row[] = [
  {
    id: '324d3776-917a-4498-9537-27888f142f2d', re: /Ashoka Fellowship/, job: 1,
    verdict: 'reject', code: 'out_of_scope', read_via: 'browser',
    quote: 'If you are interested in recommending a social entrepreneur to the Ashoka Fellowship, we welcome any information about a candidate and their work that you can provide.',
    url: 'https://www.ashoka.org/en-gb/recommend-ashoka-fellow',
    for_paul: 'Still 403 direct; read in the browser today (the /en-gb/nominate link redirects here). Ashoka Fellows are recommended by a third party, not applicants themselves — this page is the nomination form, and the five selection criteria sit behind a collapsed accordion rather than as visible page text. No route for an organisation to apply, confirming the row\'s own stored brief.',
  },
  {
    id: '9e3b71a8-1f2c-40ea-8d03-31bcb0c82e99', re: /Horsham District Council.*Community Grant/, job: 1,
    verdict: 'hold', read_via: 'browser',
    quote: 'Our next round opens on 1st September 2026. Our grant rounds are: 1 - 30 April, 1 - 30 June, 1 - 30 September, 2 - 31 January. Grants are available of up to: £5,000 although most are around £3,000. £15,000 although most are around £8,000.',
    url: 'https://www.horsham.gov.uk/community/grants-for-community-projects/horsham-district-council-community-grant',
    for_paul: 'The round the pinned 30 June 2026 deadline belonged to has passed; the page runs four recurring rounds a year instead (next opens 1 Sept, closes 30 Sept, awarded by 31 Oct) — rolling, not a single date. The amount is pinned at £2,500-£5,000; the page shows two unlabelled grant sizes, up to £5,000 (most ~£3,000) and up to £15,000 (most ~£8,000), with nothing distinguishing which is which or whether they are two tiers of the same scheme. Worth a relook at both the pin and whether this should be rolling.',
  },
  {
    id: '96c68ed0-0147-4aa1-9b4f-098a80bb7523', re: /Macmillan Q Lab/, job: 1,
    verdict: 'hold', read_via: 'browser',
    quote: 'Application deadline: 14 September 2026. ... as well as getting access to expertise from Q and Macmillan with £75,000 to support teams through the process.',
    url: 'https://www.macmillan.org.uk/about-us/what-we-do/macmillan-funding-grants/q-lab',
    for_paul: 'Deadline confirmed for the Team role: 14 September 2026, matching the row. The amount does not confirm: the page states one figure, £75,000 "to support teams through the process" across the whole cohort of teams in the lab, not a per-team ceiling, and never mentions £200,000 (the row\'s pinned range, unpinned in the DB, from an Idox feed). It is also part fellowship: individuals can take part as paid contributors (deadline 7 Oct) alongside organisation teams. Needs the guidance pack read, or your call, before it can carry a figure.',
  },
  {
    id: '08a08c30-453d-469f-9ce2-65a2dafbe0d8', re: /Peter Kershaw Trust/, job: 1,
    verdict: 'hold', read_via: 'fetch',
    quote: 'Whilst the Trust has no maximum amount of funding that it gives to individual organisations, applicants may want to view our latest Annual Accounts to see the average amount of funding. There is only one grant window for the receipt and determination of applications which is November. All grant applications must be received by 30 September preceding the November meeting.',
    url: 'https://peterkershawtrust.org/ordinary-grants',
    for_paul: 'Read cleanly today (7 Sept called this a 1MB unreadable page; today\'s direct fetch got 1.6KB of clean text — whatever broke it before isn\'t reproducing). Real, open to organisations, one window a year and applications close 30 September — three weeks off. But the brief the page supports is thin: no maximum award stated (defers to Annual Accounts, not fetchable), no exclusions on the page, and who_can_apply beyond "organisations working in social welfare" isn\'t detailed enough for the seven-field bar. Time-sensitive if you want this year\'s window.',
  },
  {
    id: '985b3216-a7bb-43ca-b086-3e81c1e69126', re: /EY Foundation/, job: 1,
    verdict: 'hold', read_via: 'unreadable',
    quote: '',
    url: 'https://ey.foundation/',
    for_paul: 'Host does not answer on any path tried today: direct fetch, the reader proxy, and the Chrome browser all return an error page for both ey.foundation and www.ey.foundation — no TLS/DNS response, not a bot wall. Confirms the 7 Sept finding rather than resolving it; may need a different domain for this foundation.',
  },
  {
    id: '7948612a-70f9-4cce-82a0-c14d9a53e2bd', re: /Screwfix Foundation/, job: 1,
    verdict: 'hold', read_via: 'unreadable',
    quote: '',
    url: 'https://www.screwfixfoundation.com/',
    for_paul: 'Same TLS refusal as 7 Sept, now also confirmed in the browser (error page, no load). Not a transient outage: unreachable on every path tried today, twice a week apart.',
  },
]

async function main() {
  await runJob({ job: 1, rows: ROWS, apply: APPLY, db: getAdminDb() })
}
main().catch(e => { console.error(e); process.exit(1) })

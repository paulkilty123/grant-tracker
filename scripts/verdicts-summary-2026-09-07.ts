// The closing summary for the verdicts job, written into the results file.
//
// Pile A is complete: 67 of 67. Pile B's 195 rows are untouched and are being
// handed to another session, which is why this summary says so rather than
// leaving a reader to infer it from a count that stops at 67.
//
//   npx tsx --env-file=.env.local scripts/verdicts-summary-2026-09-07.ts [--apply]

import { readFileSync } from 'fs'
import { join } from 'path'
import { RESULTS, recordSummary, type Verdict } from './verdicts-lib-2026-09-07'

const LIST = join(__dirname, '..', 'docs', 'handoffs', 'verdict-rows-2026-09-07.json')

const APPLY = process.argv.includes('--apply')

// Re-derived from the results file rather than typed in, so the summary cannot
// drift from the verdicts. CLAUDE.md: a headline number gets a second
// derivation, and this is the file's own arithmetic against the checker's.
function tally() {
  const file = JSON.parse(readFileSync(RESULTS, 'utf8')) as { batches: { verdicts: Verdict[] }[] }
  const all = file.batches.flatMap(b => b.verdicts)
  const piles = JSON.parse(readFileSync(LIST, 'utf8')) as { pile_b_hidden: unknown[] }
  const a = all.filter(v => v.pile === 'A')
  const count = (xs: Verdict[], k: string) => xs.filter(v => v.verdict === k).length
  const codes: Record<string, number> = {}
  for (const v of a) if (v.verdict === 'reject' && v.code) codes[v.code] = (codes[v.code] ?? 0) + 1
  return {
    pile_a: {
      rows: a.length,
      publish: count(a, 'publish'), park: count(a, 'park'),
      reject: count(a, 'reject'), hold: count(a, 'hold'),
      reject_codes: codes,
      rows_tidied: a.filter(v => v.tidied.length).length,
    },
    // The SIZE of pile B, from the row list. Deriving it from the verdicts
    // instead would report 0 rows rather than 0 of 195 done, which reads as
    // "there is no pile B" — the wrong kind of zero.
    pile_b: { rows: piles.pile_b_hidden.length, verdicts: all.length - a.length, note: 'not started; handed to another session' },
  }
}

const t = tally()

const SUMMARY = {
  job: 'verdicts on the rows that are not live',
  brief: 'docs/handoffs/verdicts-2026-09-07.md',
  finished: '2026-09-07',
  state_changes_made: 0,
  state_changes_by_others: [
    '29d000d3 Foundation East — rejected by grant-tracker-be after batch 2 reported the domain takeover',
    'e31c28ad FSI — rejected by grant-tracker-be after batch 2 reported the dead host',
    '583f0378 Social Investment Business Resilience Fund — rejected closed_for_good by grant-tracker-be; live when the baseline was taken, so outside both piles',
  ],
  ...t,
  what_the_holds_are: {
    unreadable_page: 'a 403 behind Cloudflare, a body that is all tracking attributes, a URL that serves a PNG, a refused TLS handshake. Every one needs a browser look, not another script.',
    index_over_programmes: 'apply_url points at a funder home page or a fund index covering several calls on different timetables. A single date or figure cannot be right for it. The fix is a relink or a split, both of which are Paul\'s.',
    admin_pin_the_page_contradicts: 'rule 5. Simon Gibson holds cic_guarantee and cic_shares while the trust lists Community Interest Companies under what it does not fund; Step Change holds a deadline that has passed; Ufi holds £30,000 to £150,000, which matches none of its four calls.',
    audience_at_the_edge: 'Bethnal Green Ventures invests only in for-profit companies limited by shares, which rules out charities, CIOs and companies limited by guarantee.',
    charity_commission_register_rows: 'apply_url is a register entry, which states no eligibility and no route. Held as a class.',
  },
  patterns_worth_acting_on: [
    'The dominant reject is duplicate, 15 of 27, and almost all of them are the same shape: a provider with several products gets one row per page somebody happened to scrape, and the hidden copy points at the provider home page or a fund index while the named products are separate live rows. Key Fund has eleven rows, LawWorks three, Microsoft four, Triodos four, Severn Trent six.',
    'Several of those duplicates point at the BETTER page. LawWorks, Salesforce and Microsoft live rows all sit on a home page while the hidden copy sits on the page that states the offer and the route. Those are relinks before they are rejections.',
    'Two hosts serve a 200 that is not the funder: foundationeast.org now serves casino content under the charity\'s name, and techsoup.uk/partners returns an empty 205-byte shell. Both look like health to a URL checker.',
    'Community foundation funds are carried one row per named fund, not one per foundation. Three CFNE wind-farm funds are already live, which is why batch 4 published two more rather than rejecting them as duplicates.',
  ],
}

console.log(JSON.stringify(SUMMARY, null, 1))
if (!APPLY) { console.log('\npass --apply to write it into the results file') } else { recordSummary(SUMMARY) }

// The closing summary for the verdicts job, now that pile B's 195 rows are
// done (pile A's 67 finished in the prior session). Re-derives pile B's tally
// from the results file rather than typing it in, merges it into the
// existing summary object rather than replacing it, and folds in the state
// moves acknowledged since pile A closed.
//
//   npx tsx --env-file=.env.local scripts/verdicts-summary-2026-09-07.ts [--apply]

import { readFileSync } from 'fs'
import { RESULTS, recordSummary } from './verdicts-lib-2026-09-07'

const APPLY = process.argv.includes('--apply')

type V = { verdict: string; code?: string; tidied?: string[] }
type Batch = { batch: number; pile: 'A' | 'B'; verdicts: V[] }

function tally(verdicts: V[]) {
  const counts: Record<string, number> = { publish: 0, park: 0, reject: 0, hold: 0 }
  const reject_codes: Record<string, number> = {}
  let rows_tidied = 0
  for (const v of verdicts) {
    counts[v.verdict] = (counts[v.verdict] ?? 0) + 1
    if (v.verdict === 'reject' && v.code) reject_codes[v.code] = (reject_codes[v.code] ?? 0) + 1
    if (v.tidied?.length) rows_tidied++
  }
  return { rows: verdicts.length, ...counts, reject_codes, rows_tidied }
}

const file = JSON.parse(readFileSync(RESULTS, 'utf8')) as { batches: Batch[]; summary: Record<string, unknown> }
const pileB = file.batches.filter(b => b.pile === 'B').flatMap(b => b.verdicts)
if (pileB.length !== 195) throw new Error(`pile B has ${pileB.length} verdicts, expected 195`)

const existing = file.summary as Record<string, any>

const SUMMARY = {
  ...existing,
  finished: '2026-09-07',
  state_changes_made: 0,
  state_changes_by_others: [
    ...existing.state_changes_by_others,
    '30 pile A rows actioned by Paul from the review queue on 7 Sept, each rejection_reason stamped "applied at Paul\'s word" by the review UI itself',
    'Alec Dickson Trust Grant, Andrew Wainwright Reform Trust — reopened and published at Paul\'s word on 7 Sept, new deadlines written over their pins at admin source',
    'Severn Trent Community Fund New Project Funding (f4225849) — rejected duplicate by grant-tracker-be on 7 Sept, of the row this job published in batch 6 (1ef69197)',
    'Souter Charitable Trust, sportscotland Facilities Investment, The Awesome Foundation Glasgow Chapter, The Homity Trust, The Maypole Fund — five batch 7 publishes taken live on Paul\'s explicit word the same day, per the 7 Sept launch freeze; sportscotland\'s brief was completed from its guidelines PDF by grant-tracker-be before publishing',
  ],
  pile_b: tally(pileB),
  pile_b_patterns_worth_acting_on: [
    'Corrected mid-job: park is for a fund closed now with a stated reopening (written to next_open_date), never a bare deadline. Five batch 7 rows were first drafted as park with a deadline field — Souter, sportscotland, Awesome Foundation Glasgow, Homity and Maypole — all funds that were actually open now for a current round, the publish shape. Four had enough page material for a full brief and were republished; sportscotland stayed held (later completed from its guidelines PDF by grant-tracker-be).',
    'Two duplicate near-misses caught by dedupCandidates() before writing rather than after: Lloyds Bank Foundation\'s generic "Funding Programmes" row (batch 5) and a second Severn Trent "New Project Funding" row (batch 6, resolved afterwards by grant-tracker-be as a duplicate of the published row).',
    'Audience mismatches recur as a class this job\'s codes don\'t cover: UnLtd, Ignite, SEGA, TiE Women (individual founders/entrepreneurs), Variety Club Equipment Grants (disabled children and families apply directly), Vivensa Academy (individual ageing researchers) — all held with the mismatch named rather than force-fit into out_of_scope or another reject code.',
    'A "hidden despite matching" class recurs across community-foundation and masonic/charitable-trust sites: Henry Smith\'s Christian Grants (Clergy), Freemasons/Masonic\'s Large and Small Grants for Charities all already read is_rolling/no-deadline exactly matching the live page, yet stay hidden with nothing in the row explaining why — flagged together for Paul rather than guessed at individually.',
    'Sibling-fund quotes on shared-template sites remained the most common near-miss: Young Camden Foundation (ten trusts), Somerset CF, Cambridgeshire CF and Cornwall CF all show one trust\'s sentence sitting in another trust\'s "other grants to consider" sidebar on the same page — caught every time by reading the specific fund\'s own named section before writing, not the first matching sentence on the page.',
    'A pin on the literal field a park/publish would write (deadline, most often) was routed around by writing the same information to next_open_date instead — The Charity Service, The Elephant Trust and Theatres Trust Small Grants Programme all reopened for real but the specific field was admin-held.',
    'One live opportunity a pin is actively hiding: SSE\'s Social Investment Gateway Programme reopened for round 2 (deadline 6 November 2026) but eighteen of its roughly nineteen fields are admin-held, so nothing could be written — flagged for Paul rather than left silent.',
  ],
}

console.log(JSON.stringify(SUMMARY, null, 1))
if (!APPLY) { console.log('\npass --apply to write it into the results file') } else { recordSummary(SUMMARY) }

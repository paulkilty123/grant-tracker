// Closing summary for the holds job (2026-09-08), all three jobs done.
//
//   npx tsx --env-file=.env.local scripts/holds-summary-2026-09-08.ts [--apply]

import { readFileSync } from 'fs'
import { RESULTS, recordSummary, paulList, type Verdict } from './holds-lib-2026-09-08'

const APPLY = process.argv.includes('--apply')

type Job1or2 = { job: number; verdicts: Verdict[]; paul_list: string[] }
type Job3 = { job: 3; written: { id: string; min: number | null; max: number | null; prose_only: boolean }[]; report: unknown[] }

const file = JSON.parse(readFileSync(RESULTS, 'utf8')) as { jobs: (Job1or2 | Job3)[] }

const job1 = file.jobs.find(j => j.job === 1) as Job1or2 | undefined
const job2 = file.jobs.find(j => j.job === 2) as Job1or2 | undefined
const job3 = file.jobs.find(j => j.job === 3) as Job3 | undefined
if (!job1 || job1.verdicts.length !== 6) throw new Error(`job 1 has ${job1?.verdicts.length ?? 0} verdicts, expected 6`)
if (!job2 || job2.verdicts.length !== 7) throw new Error(`job 2 has ${job2?.verdicts.length ?? 0} verdicts, expected 7`)
if (!job3 || job3.written.length !== 3) throw new Error(`job 3 has ${job3?.written.length ?? 0} written, expected 3`)

function tally(verdicts: Verdict[]) {
  const counts: Record<string, number> = { publish: 0, park: 0, reject: 0, hold: 0 }
  const reject_codes: Record<string, number> = {}
  const read_via: Record<string, number> = { fetch: 0, browser: 0, unreadable: 0 }
  for (const v of verdicts) {
    counts[v.verdict] = (counts[v.verdict] ?? 0) + 1
    if (v.verdict === 'reject' && v.code) reject_codes[v.code] = (reject_codes[v.code] ?? 0) + 1
    read_via[v.read_via] = (read_via[v.read_via] ?? 0) + 1
  }
  return { rows: verdicts.length, ...counts, reject_codes, read_via }
}

const allVerdicts = [...job1.verdicts, ...job2.verdicts]

const SUMMARY = {
  finished: '2026-09-08',
  jobs: { job1: tally(job1.verdicts), job2: tally(job2.verdicts), job3: { written: job3.written.length, reported: job3.report.length } },
  no_amount_count: { before: 157, after: 154, fell_by: 3 },
  state_changes_made: 0,
  reader_proxy_dropped_after_job1: 'A third-party reader proxy was used for one job 1 read (Ashoka) and its text did not match what the page actually renders — caught by grant-tracker-be on check and fixed same day. Fetch then browser only, no proxy, for the rest of job 1 and all of jobs 2-3.',
  bot_walls_hit_today: [
    'rocbf.co.uk — entire domain, "please wait while your request is being verified" never clears (job 2, ROCB CDFI Loans)',
    'www.london.gov.uk — two specific fund pages 403, though the homepage loads fine (job 2, both GLA rows)',
    'www.communityfoundation.org.uk — entire domain, same interstitial as rocbf.co.uk (job 2, Mayor\'s Opportunity Fund)',
  ],
  job3_pattern: 'All three job 3 rows had already been correctly nulled by an earlier null-sweep reading the apply page alone (a programme pool, not a per-applicant figure). All three funders also publish a SEPARATE guidance page — a different URL from the apply page — with a real per-applicant band under a "size and type of funding we support" heading. Worth checking for on any future no-amount row before concluding a page states no figure.',
  paul_list: paulList(allVerdicts),
}

console.log(JSON.stringify(SUMMARY, null, 1))
if (!APPLY) { console.log('\npass --apply to write it into the results file') } else { recordSummary(SUMMARY) }

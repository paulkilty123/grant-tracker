// The closing summary for the spend-restriction job, written into the
// results file. All 116 rows are done.
//
//   npx tsx --env-file=.env.local scripts/spend-summary-2026-09-07.ts [--apply]

import { readFileSync } from 'fs'
import { RESULTS, recordSummary } from './spend-lib-2026-09-07'

const APPLY = process.argv.includes('--apply')

type Written = { id: string; restriction?: string; spendTypes?: string[]; subtypes: string[] }
type Report = { id: string; title: string; why: string }

// Re-derived from the results file rather than typed in, so the summary
// cannot drift from the batches. CLAUDE.md: a headline number gets a second
// derivation.
function tally() {
  const file = JSON.parse(readFileSync(RESULTS, 'utf8')) as { batches: { written: Written[]; report: Report[] }[] }
  const written = file.batches.flatMap(b => b.written)
  const report = file.batches.flatMap(b => b.report)

  const restrictionCounts: Record<string, number> = {}
  const spendTypeCounts: Record<string, number> = {}
  for (const w of written) {
    const r = w.restriction ?? 'unset'
    restrictionCounts[r] = (restrictionCounts[r] ?? 0) + 1
    for (const t of w.spendTypes ?? []) spendTypeCounts[t] = (spendTypeCounts[t] ?? 0) + 1
  }
  const reportCounts: Record<string, number> = {}
  for (const r of report) reportCounts[r.why] = (reportCounts[r.why] ?? 0) + 1

  return {
    rows: written.length + report.length,
    written: written.length,
    reported: report.length,
    restriction_counts: restrictionCounts,
    spend_type_counts: spendTypeCounts,
    report_reasons: reportCounts,
  }
}

const t = tally()

const SUMMARY = {
  job: 'how the money may be spent, on 116 live grants',
  brief: 'docs/handoffs/sonnet-2026-09-07.md, job 1',
  finished: '2026-09-07',
  api_spend: 'zero — read with node fetch, no @anthropic-ai/sdk, no /api/admin/enrich-grant',
  ...t,
  patterns_worth_acting_on: [
    'Two funder pages listed as the funder\'s own site were actually directory listings with a structured "Type of cost" field rather than prose (funding.scot, twice) — read at confidence med rather than high, since it is the directory\'s categorisation rather than the funder\'s own words.',
    'The sibling-quote trap from the amounts and verdicts jobs recurred on shared-template trust-directory sites: Young Camden Foundation hosts ten trusts on near-identical pages, each with an "Other grants to consider" sidebar naming siblings; Somerset Community Foundation\'s Oake Sunshine Fund page carries a sentence that belongs to two funds further down the same page. Both caught before writing by reading the specific trust\'s own named section rather than the first matching sentence on the page.',
    'A phrase can read as an inclusion or an exclusion purely from its heading: Tesco\'s "Running costs and organisation overheads" sits under "Projects which are ineligible", the opposite of what the phrase suggests alone. Every citation in this job was checked against its section heading before being written.',
    '"Restricted" and "unrestricted" have a second, unrelated meaning on charity pages — the APPLICANT\'s own restricted/unrestricted reserves or net assets, an eligibility or financial-health check rather than a statement about this grant\'s spend rules. Hit twice (Magdalen Hospital Trust, Toy Trust).',
    'homepage_only and index_over_programmes were split out from not_stated during the job: nine apply_urls turned out to be foundation homepages or multi-fund indexes with no single answer to give, rather than a specific fund\'s page that happened to say nothing.',
    'Several rows exclude one specific cost line (a named role\'s salary, capital costs, professional fees) without a general core-costs or project-costs statement either way; these were left without a restriction call rather than generalised from a single line item, matching the Grocers\' Charity and JJ Charitable Trust pattern.',
  ],
}

console.log(JSON.stringify(SUMMARY, null, 1))
if (!APPLY) { console.log('\npass --apply to write it into the results file') } else { recordSummary(SUMMARY) }

// Automated verification/approval pass for scraped_grants rows the CF fund
// extraction pipeline (cf-fund-extract.ts) has inserted into Needs Review.
//
// Built directly from what Paul reported he actually ends up manually
// checking/fixing on this pipeline's output, not a generic QA checklist:
//   - eligibility: "ensuring the right orgs are tagged"
//   - amounts: "sometimes the whole fund is used in the amount you can apply
//     for and there is a disparity in the from-to amounts"
//   - deadlines: "sometimes the deadline doesn't tag properly or its
//     multiround and that's not picked up"
//
// A row that clears every check is published automatically (is_active:true,
// which flips pipeline_state to 'published' — see transitionPipelineState in
// grant-merge.ts). A row that trips any check is left in Needs Review with
// the reasons written to raw_data.verify, so the manual review that still
// happens is "why did this get held back" rather than "check everything from
// scratch". Nothing is ever deleted or rejected outright by this pass.
//
// Deliberately excluded from these checks: semantic duplicates (two rows
// describing the same real fund under different titles, e.g. the Tyne & Wear
// case found this session) — no field-level check catches that, it needs a
// cross-referencing sweep, which stays a periodic manual exercise.

import { SupabaseClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '@/lib/grant-merge'
import { checkUrl } from '@/lib/url-validator'
import { PROVENANCE_SOURCE, adminClient } from '@/lib/cf-fund-extract'

export const VERIFY_PROVENANCE_SOURCE = 'system:cf_fund_verify'

// Real per-grant ranges from this pipeline's CFs run roughly 2-10x
// (min-to-max). The total-pool-vs-per-grant confusion bugs found this
// session (Devon CF, Youth Jobs Grant, Advanced Connectivity Technologies)
// ran 100x-8000x — this threshold sits well clear of legitimate ranges.
export const AMOUNT_RATIO_THRESHOLD = 25

// A single grant from one CF-run fund above this is rare enough on its own
// (independent of the ratio check, which needs both min and max stated) to
// warrant a human look before publishing — CF funds this pipeline targets
// are micro/mid-tier local grants, not national-scale programmes.
export const AMOUNT_IMPLAUSIBLE_MAX = 150_000

// Safety net for funds whose deadline text implies more than one round but
// where deadline_cycle wasn't captured (either because this run predates the
// extraction prompt's cycle-detection addition, or because the model didn't
// find explicit day+month for every round). Not a proof of multi-round —
// just enough signal to defer to a human rather than publish a deadline
// that's likely to go stale the moment this one round closes.
const MULTI_ROUND_PATTERN = /\bround\s*(one|two|three|four|1|2|3|4|i|ii|iii|iv)\b|\b(twice|two|three|four)\s+(times\s+)?(a|per)\s*year\b|\bmulti-?round\b|\bseveral\s+rounds?\b/i

export interface VerifyFlag {
  code:   'eligibility_empty' | 'amount_ratio_disparity' | 'amount_implausible_large'
        | 'missing_amount_citation' | 'deadline_missing' | 'deadline_stale'
        | 'missing_deadline_citation' | 'possible_multi_round_uncaptured'
        | 'uniform_snippet_suspected' | 'url_dead' | 'url_unverified'
  detail: string
}

export interface VerifyRowResult {
  id:      string
  title:   string
  funder:  string
  outcome: 'published' | 'flagged' | 'pending_classification'
  flags:   VerifyFlag[]
}

export interface VerifyRunResult {
  checked:    number
  published:  number
  flagged:    number
  pending:    number
  errors:     string[]
  rows:       VerifyRowResult[]
}

interface CandidateRow {
  id:                   string
  title:                string
  funder:               string
  amount_min:           number | null
  amount_max:           number | null
  deadline:             string | null
  is_rolling:           boolean
  next_open_date:       string | null
  deadline_cycle:       unknown[] | null
  eligible_structures:  string[] | null
  target_beneficiaries: string[] | null
  pipeline_state:       string
  raw_data:             Record<string, unknown> | null
  apply_url:            string | null
}

export async function verifyPendingCFFunds(
  db: SupabaseClient = adminClient(),
  opts: { dryRun?: boolean } = {},
): Promise<VerifyRunResult> {
  const dryRun = opts.dryRun ?? false
  const result: VerifyRunResult = { checked: 0, published: 0, flagged: 0, pending: 0, errors: [], rows: [] }

  // Scoped to the same Needs Review states the admin UI itself uses
  // (urls/page.tsx) — 'archived'/'rejected' rows are terminal (e.g. a human
  // already hid one of this pipeline's own rows) and must never be silently
  // reconsidered for auto-publish just because is_active is also false there.
  const { data, error } = await db
    .from('scraped_grants')
    .select('id, title, funder, amount_min, amount_max, deadline, is_rolling, next_open_date, deadline_cycle, eligible_structures, target_beneficiaries, pipeline_state, raw_data, apply_url')
    .eq('source', PROVENANCE_SOURCE)
    .eq('is_active', false)
    .in('pipeline_state', ['captured', 'enriched', 'tagged', 'tagged_awaiting_review'])

  if (error) { result.errors.push(`candidate query failed: ${error.message}`); return result }
  const candidates = (data ?? []) as unknown as CandidateRow[]
  if (candidates.length === 0) return result
  result.checked = candidates.length

  // Cross-fund uniform-snippet check needs every candidate's amount_snippet
  // grouped by funder BEFORE per-row evaluation — the same page-wide
  // disclaimer bug (Bedfordshire & Luton, found this session) shows up as one
  // verbatim snippet reused across many funds, which only a row-in-isolation
  // check would never catch.
  //
  // Found live 2026-07-24: this check over-fired on Suffolk/Oxfordshire/
  // Merseyside/Lincolnshire CF — 19 rows flagged, all false positives.
  // Verified against the real source pages: every one of those funds has its
  // OWN distinct apply_url (a dedicated per-fund page), and each page
  // genuinely, independently states the same round-number cap (e.g. five
  // separate Suffolk funds each really do say "Maximum grant: £5,000" on
  // their own page — a common default small-grant ceiling, not a disclaimer
  // copy-pasted from one page). The ORIGINAL Bedfordshire & Luton bug this
  // check was built for had multiple funds falling back to the SAME shared
  // listing-page URL (no distinct per-fund link found — see cf-fund-
  // extract.ts's `fund.apply_url || config.listingUrl` fallback), so the
  // snippet AND the URL were both identical. A shared snippet across
  // genuinely distinct apply_urls is not evidence of that bug — track URL
  // alongside snippet so the check only fires on the real pattern.
  const snippetGroups = new Map<string, { id: string; applyUrl: string | null }[]>() // `${funder}|${snippet}` -> rows
  for (const row of candidates) {
    const snippet = row.raw_data?.amount_snippet as string | null | undefined
    if (!snippet) continue
    const key = `${row.funder}|${snippet}`
    snippetGroups.set(key, [...(snippetGroups.get(key) ?? []), { id: row.id, applyUrl: row.apply_url }])
  }

  const today = new Date().toISOString().slice(0, 10)

  for (const row of candidates) {
    // Gate: the eligibility/sector classifier (classifyUnclassified(), runs
    // as part of the crawl-grants cron) hasn't reached this row yet. Not a
    // failure — just not ready to judge yet, since "are the right orgs
    // tagged" isn't a meaningful question until that pass has run.
    if (row.pipeline_state !== 'tagged') {
      result.pending++
      result.rows.push({ id: row.id, title: row.title, funder: row.funder, outcome: 'pending_classification', flags: [] })
      continue
    }

    const flags: VerifyFlag[] = []
    const rawData         = row.raw_data ?? {}
    const amountSnippet   = rawData.amount_snippet as string | null | undefined
    const deadlineSnippet = rawData.deadline_snippet as string | null | undefined

    // Eligibility — "ensuring the right orgs are tagged".
    if ((row.eligible_structures?.length ?? 0) === 0 && (row.target_beneficiaries?.length ?? 0) === 0) {
      flags.push({ code: 'eligibility_empty', detail: 'Classifier ran but left eligible_structures and target_beneficiaries both empty' })
    }

    // Amounts — the two sub-cases named directly: whole-fund-as-cap, and a
    // from-to spread that doesn't hang together.
    const { amount_min: min, amount_max: max } = row
    if (min != null && max != null && min > 0 && max / min >= AMOUNT_RATIO_THRESHOLD) {
      flags.push({ code: 'amount_ratio_disparity', detail: `£${min} to £${max} is a ${(max / min).toFixed(0)}x spread — check amount_max isn't the whole fund's pot rather than one grant's cap` })
    }
    if (max != null && max > AMOUNT_IMPLAUSIBLE_MAX) {
      flags.push({ code: 'amount_implausible_large', detail: `amount_max £${max} is unusually large for a single grant from this pipeline's CF funds` })
    }
    if (max != null && !amountSnippet) {
      flags.push({ code: 'missing_amount_citation', detail: 'amount_max is set but no backing snippet was captured' })
    }

    // Deadlines — general sanity, plus the multi-round gap named directly.
    if (!row.is_rolling && !row.deadline && !row.next_open_date) {
      flags.push({ code: 'deadline_missing', detail: 'Not rolling, but no deadline or next_open_date is set' })
    }
    if (row.deadline && row.deadline < today) {
      flags.push({ code: 'deadline_stale', detail: `deadline ${row.deadline} has already passed` })
    }
    if (!row.is_rolling && row.deadline && !deadlineSnippet) {
      flags.push({ code: 'missing_deadline_citation', detail: 'deadline is set but no backing snippet was captured' })
    }
    if (deadlineSnippet && MULTI_ROUND_PATTERN.test(deadlineSnippet) && (row.deadline_cycle?.length ?? 0) === 0) {
      flags.push({ code: 'possible_multi_round_uncaptured', detail: `deadline text suggests multiple rounds ("${deadlineSnippet.slice(0, 120)}") but no deadline_cycle was captured — likely to go stale once this one date passes` })
    }

    // Uniform snippet — cross-fund check computed above. Only suspicious when
    // the shared snippet ALSO comes with a shared apply_url; distinct
    // per-fund URLs mean each was independently sourced from its own page,
    // not one shared disclaimer duplicated across funds (see comment above).
    if (amountSnippet) {
      const siblings = snippetGroups.get(`${row.funder}|${amountSnippet}`) ?? []
      const distinctUrls = new Set(siblings.map(s => s.applyUrl)).size
      if (siblings.length >= 3 && distinctUrls === 1) {
        flags.push({ code: 'uniform_snippet_suspected', detail: `Same amount snippet AND same apply_url reused across ${siblings.length} funds from ${row.funder} — likely a page-wide disclaimer misattributed to each fund individually` })
      }
    }

    if (flags.length > 0) {
      if (!dryRun) {
        try {
          await mergeGrantUpdate({
            id: row.id,
            fields: { raw_data: { ...rawData, verify: { checked_at: new Date().toISOString(), flags } } },
            source: VERIFY_PROVENANCE_SOURCE,
            pinned: false,
            db,
          })
        } catch (e) {
          result.errors.push(`flag-write failed for "${row.title}": ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      result.flagged++
      result.rows.push({ id: row.id, title: row.title, funder: row.funder, outcome: 'flagged', flags })
      continue
    }

    // Clean on every field check — confirm the apply_url is actually live
    // before going public. An auto-published grant with a dead link is worse
    // than one that waited a few extra days in Needs Review.
    let urlStatus: 'ok' | 'dead' | 'unchecked' = 'unchecked'
    try {
      urlStatus = row.apply_url ? await checkUrl(row.apply_url, row.funder) : 'unchecked'
    } catch (e) {
      result.errors.push(`url check failed for "${row.title}": ${e instanceof Error ? e.message : String(e)}`)
    }

    // Only a positively-verified URL may auto-publish.
    //
    // 2026-07-25: this gate used to be `urlStatus === 'dead'`, so anything else
    // published — including 'unchecked', which is the value urlStatus keeps when
    // the row has no apply_url at all, or when checkUrl THROWS (the catch above
    // only records an error string and leaves the initialiser in place). The row
    // then went live via line ~264 stamping url_last_checked, so it looked
    // freshly verified while never having been checked.
    //
    // This also matters more after the url-validator repair in the same commit:
    // transient network failures now correctly return 'unchecked' instead of a
    // false 'ok', which would otherwise have widened this hole rather than
    // closing it.
    //
    // The comment above ("An auto-published grant with a dead link is worse than
    // one that waited a few extra days in Needs Review") is the stated intent;
    // this now implements it. Held rows stay in Needs Review and are retried on
    // the next run, so nothing is lost — only delayed.
    if (urlStatus !== 'ok') {
      const urlFlag: VerifyFlag = urlStatus === 'dead'
        ? { code: 'url_dead',       detail: 'apply_url did not resolve to a live page' }
        : { code: 'url_unverified', detail: row.apply_url
            ? 'apply_url could not be positively verified (network error, TLS failure, 5xx, or blocked request) — holding rather than publishing unverified'
            : 'row has no apply_url to verify' }
      if (!dryRun) {
        try {
          await mergeGrantUpdate({
            id: row.id,
            fields: { raw_data: { ...rawData, verify: { checked_at: new Date().toISOString(), flags: [urlFlag] } } },
            source: VERIFY_PROVENANCE_SOURCE,
            pinned: false,
            db,
          })
        } catch (e) {
          result.errors.push(`flag-write failed for "${row.title}": ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      result.flagged++
      result.rows.push({ id: row.id, title: row.title, funder: row.funder, outcome: 'flagged', flags: [urlFlag] })
      continue
    }

    if (dryRun) {
      result.published++
      result.rows.push({ id: row.id, title: row.title, funder: row.funder, outcome: 'published', flags: [] })
      continue
    }

    try {
      await mergeGrantUpdate({
        id: row.id,
        fields: { is_active: true, url_status: urlStatus, url_last_checked: new Date().toISOString() },
        source: VERIFY_PROVENANCE_SOURCE,
        pinned: false,
        db,
      })
      result.published++
      result.rows.push({ id: row.id, title: row.title, funder: row.funder, outcome: 'published', flags: [] })
    } catch (e) {
      result.errors.push(`publish failed for "${row.title}": ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return result
}

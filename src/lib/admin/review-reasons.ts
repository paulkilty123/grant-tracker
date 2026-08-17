// Why is this row waiting for a human?
//
// ─────────────────────────────────────────────────────────────────────────────
// This is deliberately a shared, pure module rather than logic inside the review
// page, because three separate things need the same answer:
//
//   1. the Inbox list — one reason chip per row, and the sort order
//   2. the grant detail view — the same reasons, expanded
//   3. the auto-publish gate (not built yet) — a row with NO reasons is exactly
//      a row that can publish itself
//
// That third consumer is the whole point. If the gate derived its own criteria
// separately, the queue and the gate would drift apart, and this session has
// been almost entirely about repairing that exact class of drift: the amount
// extractor that lived in the admin page, the structures backstop that ran on
// one of two classify paths, the multi-round check that ran only for community
// foundations. One implementation, three callers.
//
// Every signal read here already exists in the database today. None of it is
// newly computed — it was all being calculated, persisted, and then never shown.
// ─────────────────────────────────────────────────────────────────────────────

import { readGrantFlags, type GrantFlag } from '@/lib/grant-flags'
import { readStamp, PAGE_READ_KEY, type FieldEvidence } from '@/lib/field-evidence'
import { abstainReason } from '@/lib/verification/abstain'
import { FEEDBACK_QUEUE_SOURCE } from '@/lib/feedback/triage'

/** Matches cron/reenrich-stale's STALE_AFTER_DAYS. Keep in step. */
const STALE_AFTER_DAYS = 90

/** Below this, url-validator's quality score means "probably the wrong page". */
const URL_QUALITY_SUSPECT = 60

/**
 * Past this, a stored `deadline` is a programme end date, not a closing date.
 *
 * Calibrated against the live catalogue rather than picked: every row in the
 * active-or-queued population with a deadline beyond 12 months was a programme
 * lifetime — four BFI UK Global Screen Fund rows running to 2029, the DWP Youth
 * Jobs Grant scheme end in 2028, Hackney's Crisis and Resilience Fund at
 * 2029-03-31, and HS2's community fund at 2035-03-31. Eight candidates, eight
 * genuinely wrong, no false positives. Showing one of these as "apply by" tells
 * a user they have years when the current round may already have closed, which
 * is wrong rather than merely incomplete, so it blocks.
 */
const DEADLINE_HORIZON_MONTHS = 12

/** `today` plus n months, as YYYY-MM-DD. Pure, so todayISO stays injectable. */
function horizonISO(todayISO: string, months: number): string {
  const d = new Date(`${todayISO}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

// ── Who is this fund actually for? ───────────────────────────────────────────
//
// GOV.UK and UKRI publish alongside genuine community funding a large volume of
// business R&D, academic research and industry calls. Measured 2026-07-26: of
// UKRI's 198 rows, 148 read as research and 7 as community; its three live rows
// were automotive R&D, connectivity tech and MRC medical research. UKRI was
// retired on that evidence. gov_uk is roughly half and half and worth keeping,
// so the irrelevant half needs catching.
//
// TWO SIGNALS THAT LOOK RIGHT AND ARE NOT:
//
//   eligible_structures — DRIVE35 (automotive R&D) and the MRC awards both carry
//     the FULL charity set: registered_charity, cio, both CIC forms, cooperative,
//     unincorporated. Government pages state broad eligibility, so the classifier
//     tags them as charity-eligible. A "for-profit structures only" rule catches
//     2 of the 9 irrelevant rows and misses precisely the worst ones.
//
//   impact_sectors — the MRC award is tagged health + tech + social_innovation
//     with a tech_for_good niche. It reads MORE relevant than Youth Matters Fund.
//
// The signal that does discriminate is the funder's own words about who may
// apply: "Researchers based at MRC eligible research organisations" against
// "Charitable, benevolent or philanthropic organisations". Tested against all 22
// live gov_uk/ukri rows: 9 of 9 irrelevant flagged, 13 of 13 relevant passed,
// no false positives.

/** Applicant is explicitly a business, producer, employer or academic researcher. */
const COMMERCIAL_ONLY_RE = /\b(businesses?|companies|producers|employers|distributors|sales agents|traders)\b[^.]{0,60}\bonly\b|\bonly\b[^.]{0,60}\b(businesses?|companies|producers|employers|distributors)\b|must be a[^.]{0,40}\bbusiness\b|\bresearchers based at\b|\bscreen content businesses\b|\b(film )?distributors and production companies\b|\bindependent uk producers\b/i

/** Any mention that the social sector is welcome. Checked FIRST — a fund open to
 *  businesses AND charities is a fund our audience can win. */
const SOCIAL_SECTOR_RE = /not[- ]for[- ]profit|non[- ]?profit|charit(y|ies|able)|voluntary|community group|community interest|social enterprise|civil society|philanthropic|benevolent|third sector|\bcio\b|\bcics?\b/i

/** "Any organisation of any size" — open, therefore not exclusionary. */
const OPEN_TO_ALL_RE = /any organisation of any size|organisations of any size or type|all organisation types|any size or type/i

export type ReviewSeverity =
  /** Wrong or unusable data that is likely misleading a user right now. */
  | 'critical'
  /** Needs a look, but plausibly fine. */
  | 'check'
  /** The machine changed something and wants confirmation. */
  | 'changed'

export type ReviewReasonCode =
  | 'tags_changed'
  | 'page_unreadable'
  | 'no_brief'
  | 'link_unverified'
  | 'link_dead'
  | 'no_amount'
  | 'amount_zero'
  | 'amount_pot_suspected'
  | 'amount_under_stated'
  | 'amount_ungrounded'
  | 'amount_inverted'
  | 'no_deadline'
  | 'deadline_passed'
  | 'multi_round_uncaptured'
  | 'stale_dates'
  | 'no_current_timing'
  | 'eligibility_missing'
  | 'sectors_missing'
  | 'beneficiaries_generic_only'
  | 'stale_enrichment'
  | 'quarantined'
  | 'applicant_not_social_sector'
  | 'applicant_individual_only'
  | 'deadline_implausible'
  | 'user_flagged'
  // The verification engine read the funder's own page and found the fund gone,
  // not funding, or its round shut. Written to field_evidence since 13 August
  // and, until now, read by nothing that guards publishing.
  | 'page_says_delisted'
  | 'page_says_not_funding'
  | 'page_says_round_closed'
  | 'page_describes_different_fund'
  | 'no_funder'
  | 'never_verified'

export type ReviewReason = {
  code:     ReviewReasonCode
  severity: ReviewSeverity
  /** Short, bold, scannable. Sentence case, no trailing punctuation. */
  label:    string
  /** The explanatory clause that follows the label. */
  detail:   string
}

/** One changed field from the re-classify diff. */
export type FieldDiff = {
  field:   string
  before:  string[]
  after:   string[]
  added:   string[]
  removed: string[]
}

/**
 * The row shape this module needs. Structural on purpose so any query that
 * selects these columns satisfies it, without importing a generated DB type.
 */
export type ReviewRow = {
  id:                        string
  title?:                    string | null
  /** Who is giving the money. A row without one is not publishable — see
   *  `no_funder`. */
  funder?:                   string | null
  is_active?:                boolean | null
  url_status?:               string | null
  url_quality_score?:        number | null
  amount_min?:               number | null
  amount_max?:               number | null
  deadline?:                 string | null
  is_rolling?:               boolean | null
  next_open_date?:           string | null
  deadline_cycle?:           unknown[] | null
  eligible_structures?:      string[] | null
  impact_sectors?:           string[] | null
  target_beneficiaries?:     string[] | null
  funder_brief?:             Record<string, unknown> | null
  field_provenance?:         Record<string, unknown> | null
  raw_data?:                 unknown
  needs_intervention_reason?: string | null
  location_tag?: string | null
  /** Which Find Funding tab the row lands in. Not used to derive a reason; the
   *  review queue reads it so a reviewer can correct a misclassification. */
  funding_type?: string | null
  /** What the funder's own page said when the engine last read it. */
  field_evidence?: FieldEvidence | null
}

/**
 * Has the verification engine read this page SUCCESSFULLY since the enrichment
 * that gave up and wrote from memory?
 *
 * `funder_brief.source = 'knowledge_fallback'` is a permanent mark. Nothing
 * clears it but a later enrichment run that succeeds, so a row that failed once
 * carries "the funder's page could not be read" for ever — including after the
 * engine has demonstrably read that exact URL.
 *
 * Westminster Foundation's Community Grants Programme was the case: enrichment
 * fell back on 2026-07-29, the engine read the same `apply_url` and returned
 * `verified` on 2026-08-16, and the card showed "page confirms us" and "Page
 * unreadable" side by side. Two answers to one question, nineteen days apart.
 *
 * THE COMPARISON IS ON TIME, NOT ON PRESENCE. A verified stamp that PREDATES the
 * failed enrichment proves nothing about the page today, so it must not clear
 * the warning. Anything unparseable keeps the warning: on bad data the safe
 * direction is to show the flag, not to hide it.
 *
 * Measured 2026-08-17: of 72 rows carrying the fallback mark, 50 had never been
 * read by the engine and 17 had been read and also failed — both honest. Five
 * were stale, two of them live.
 */
function readSinceFallback(row: ReviewRow): boolean {
  const stamp = readStamp(row.field_evidence, PAGE_READ_KEY)
  if (stamp?.note !== 'verified') return false
  const read = Date.parse(String(stamp.checked_at ?? ''))
  const brief = row.funder_brief as { last_enriched?: unknown } | null
  const wrote = Date.parse(String(brief?.last_enriched ?? ''))
  if (Number.isNaN(read) || Number.isNaN(wrote)) return false
  return read > wrote
}

/**
 * Paul's condition, 2026-08-16: a removal may not act on a deadline the page did
 * not state in full. `round_closed` is a deterministic function of the proposed
 * deadline falling in the past (23 rows of 23), so a year-less date resolved to
 * a wrong past year turns an open fund into a closed one. Greggs' Community
 * Action Fund is the proof: its page says "until 28th August", the verifier read
 * 2024, and the fund is open. Six of those 23 rest on an inferred year.
 *
 * The regex moved to `src/lib/verification/abstain.ts` on 2026-08-17, when the
 * removal actuator became its second caller. The gate and the actuator MUST
 * abstain on exactly the same rows: two copies would drift the first time
 * either was edited, and the gate would then block rows the actuator had
 * already acted on, or worse, wave through rows it had refused.
 */

const SEVERITY_ORDER: Record<ReviewSeverity, number> = { critical: 0, check: 1, changed: 2 }

/** Sort key: most severe first, then most reasons first. */
export function compareBySeverity(a: ReviewReason[], b: ReviewReason[]): number {
  const worst = (rs: ReviewReason[]) =>
    rs.length === 0 ? 99 : Math.min(...rs.map(r => SEVERITY_ORDER[r.severity]))
  const d = worst(a) - worst(b)
  return d !== 0 ? d : b.length - a.length
}

/**
 * How close is this row to being publishable?  Lower = closer.
 *
 * This replaced severity as the queue's sort key, and the reason is worth
 * recording. Sorting by severity puts the MOST BROKEN rows first — which are
 * exactly the rows a human can do least about, and which are worth least. The
 * first thing Paul saw at the top of the queue was a fund whose page could not
 * be read, with no deadline, no eligibility and no amount: neither Publish nor
 * Reject is a sane answer there, and the row buried the 29 rows that were one
 * click from done.
 *
 * A review queue should open with the work that pays, not the work that hurts.
 *
 *   0  Only "tags changed" — the machine improved something and wants a nod.
 *      One click and it is finished.
 *   1  Small stuff: a couple of soft checks, nothing structural.
 *   2  Fixable: missing eligibility/sectors/amount/deadline, or an unverified
 *      link. A re-read or a re-classify probably resolves it.
 *   3  Cannot be judged at all until the page is read: the brief was written
 *      from the model's memory, or there is no brief. These need a link fix or
 *      a bulk re-read, and some are simply not real funds.
 */
export function publishReadiness(reasons: ReviewReason[]): number {
  if (reasons.length === 0) return 0

  const codes = new Set(reasons.map(r => r.code))

  // Nothing can be trusted on a row whose source page was never read.
  if (codes.has('page_unreadable') || codes.has('no_brief') || codes.has('quarantined')) return 3

  const onlyChanged = reasons.every(r => r.severity === 'changed')
  if (onlyChanged) return 0

  const needsWork =
    codes.has('eligibility_missing') || codes.has('sectors_missing') ||
    codes.has('no_amount') || codes.has('no_deadline') ||
    codes.has('link_unverified') || codes.has('link_dead') ||
    codes.has('deadline_passed') || codes.has('deadline_implausible') ||
    codes.has('amount_zero')
  if (needsWork) return 2

  return 1
}

/**
 * Queue order: closest-to-publishable first, then fewest reasons, so the
 * quickest wins float to the top of each band.
 */
export function compareByReadiness(a: ReviewReason[], b: ReviewReason[]): number {
  const d = publishReadiness(a) - publishReadiness(b)
  if (d !== 0) return d
  return a.length - b.length
}

/**
 * Pull the re-classify diff out of field_provenance.
 *
 * reenrich-stale stores it at field_provenance.pipeline_state.diff as
 * { field: { before: [...], after: [...] } }. It is written on every material
 * tag change and has never been rendered anywhere — which is why 145 of the 174
 * rows currently in the queue cost a full re-review instead of a glance.
 */
export function extractTagsDiff(fieldProvenance: Record<string, unknown> | null | undefined): FieldDiff[] {
  const ps = fieldProvenance?.pipeline_state
  if (!ps || typeof ps !== 'object') return []
  const diff = (ps as Record<string, unknown>).diff
  if (!diff || typeof diff !== 'object') return []

  const out: FieldDiff[] = []
  for (const [field, raw] of Object.entries(diff as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const before = Array.isArray(r.before) ? r.before.map(String) : []
    const after  = Array.isArray(r.after)  ? r.after.map(String)  : []
    out.push({
      field,
      before,
      after,
      added:   after.filter(v => !before.includes(v)),
      removed: before.filter(v => !after.includes(v)),
    })
  }
  return out
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return Math.floor((Date.now() - t) / 86_400_000)
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

/**
 * Derive every reason this row is waiting on a human.
 *
 * An empty array means nothing is wrong with the row that we know how to detect
 * — i.e. the row is a candidate for auto-publish.
 */
export function deriveReviewReasons(row: ReviewRow, todayISO?: string): ReviewReason[] {
  const today   = todayISO ?? new Date().toISOString().slice(0, 10)
  const reasons: ReviewReason[] = []
  const brief   = row.funder_brief ?? null
  const flags   = readGrantFlags(row.raw_data)

  // ── What the funder's own page said ──────────────────────────────────────
  // The strongest evidence we hold about a row, and until now the only signal
  // the engine produced that nothing downstream consumed. The review queue was
  // free to offer "Looks right, publish it" on a fund whose page says it is
  // closed, because a tagging diff outranked the funder's own words. 20 rows
  // carrying one of these verdicts were visible to users when this was found.
  const pageRead = readStamp(row.field_evidence, PAGE_READ_KEY)

  // A GATE FAILURE IS STORED AS A COMPOSITE AND THE SWITCH BELOW COULD NOT SEE IT.
  //
  // The route writes `"fixable_link: wrong_fund"` into the same `note` the
  // switch reads, so none of its bare-outcome cases ever matched, no reason was
  // emitted, and the gate published the row. Found 2026-08-17 in the pre-arming
  // dry run: **30 of the 51 rows the gate would newly publish carried a
  // `fixable_link:` verdict, 29 of them `wrong_fund`** — rows where the engine
  // had already read the page and reported that our fund is not on it.
  //
  // That is the A2 defect arriving through the front door. Publishing them sends
  // a fundraiser to a page that does not describe the fund they clicked, which is
  // the same harm as a dead link and harder to spot, because the page loads.
  //
  // ONLY `wrong_fund` RAISES ANYTHING HERE. The other three gate failures are
  // about our ability to READ the page, not about the page contradicting the
  // row: `fetch_failed` and `no_content` are usually transient or a bot wall,
  // and `no_funding_detail` means the right page carried no detail, which is
  // thinness rather than wrongness. Blocking on those would freeze the queue on
  // a WAF outage, which is the mistake `link_unverified` already documents one
  // section down — absence of evidence is not evidence of a dead link.
  //
  // A first draft raised a `check` for them and that was worse than nothing: the
  // Asda Foundation row came back carrying `link_unverified` TWICE, because the
  // url_status path already raises it. The existing link and page reasons cover
  // this ground; a second voice saying the same thing only makes the queue look
  // busier than it is.
  if (pageRead?.note === 'fixable_link: wrong_fund') {
    reasons.push({
      code: 'page_describes_different_fund', severity: 'critical',
      label: 'The page does not describe this fund',
      detail: 'the link loads, but the engine could not find this fund on it',
    })
  }

  // A row with no funder cannot be published, whatever else is right about it.
  // Three of the rows the gate would have published on 17 August were press
  // releases scraped as funds — "Bentley opens new national grants programme…",
  // "LNER … grants now open for applications" — and a null funder is the single
  // signal all three share. A card that cannot say who is giving the money is
  // not a funding opportunity a user can act on.
  if (!row.funder || String(row.funder).trim().length === 0) {
    reasons.push({
      code: 'no_funder', severity: 'critical',
      label: 'No funder on the row',
      detail: 'nothing says who is giving the money, so this cannot go in front of a user',
    })
  }

  // NOTHING PUBLISHES THAT THE ENGINE HAS NEVER READ.
  //
  // This is what makes the verification engine load-bearing rather than
  // advisory. It has read 637 of 670 live rows and produced verdicts for six
  // days; until now a row could go in front of a user without the engine ever
  // having looked at its page, and several of the defects Paul found by hand on
  // 17 August were exactly that.
  //
  // It is NOT the same test as `no_brief`, which is why that one did not catch
  // it. `no_brief` asks whether an AI brief was written; this asks whether the
  // funder's own page was ever fetched and compared against the row. The City
  // Bridge Climate row proved the gap on the day it was staged: it carried a
  // hand-written brief, so `no_brief` stayed silent, and it would have published
  // itself the next morning with nobody having checked the URL resolved to the
  // fund it claimed.
  //
  // Cost of the rule, measured before adding it: it blocks ONE not-yet-live row
  // today — the one just staged. Every already-live row it touches becomes
  // `attention`, never a retraction, so nothing disappears. A staged row waits
  // only until the engine's next run reaches it, and never-checked rows are at
  // the front of that queue.
  if (!pageRead) {
    reasons.push({
      code: 'never_verified', severity: 'critical',
      label: 'The funder’s page has never been read',
      detail: 'no verification run has compared this row against the page it points at',
    })
  }

  switch (pageRead?.note) {
    case 'no_longer_listed': {
      const q = readStamp(row.field_evidence, 'still_listed')?.quote
      reasons.push({
        code: 'page_says_delisted', severity: 'critical',
        label: 'Page no longer lists this fund',
        detail: q ? `the funder's page says "${q}"` : 'the funder\'s page no longer describes this fund',
      })
      break
    }
    case 'not_a_grant': {
      const q = readStamp(row.field_evidence, 'is_grant')?.quote
      reasons.push({
        code: 'page_says_not_funding', severity: 'critical',
        label: 'Page does not describe funding',
        detail: q ? `the funder's page says "${q}"` : 'the page the link goes to is not a funding opportunity',
      })
      break
    }
    case 'round_closed': {
      // ABSTAIN where the year was inferred, or where the sentence describes the
      // fund opening rather than closing. Acting on a date the funder never
      // wrote is how an open fund gets taken down, and this gate must hold the
      // same rows as the removal actuator — same function, one definition.
      const quote = readStamp(row.field_evidence, 'deadline')?.quote
      if (quote && !abstainReason({ quote, requireYear: true })) {
        reasons.push({
          code: 'page_says_round_closed', severity: 'critical',
          label: 'Page says this round has closed',
          detail: `the funder's page says "${quote}"`,
        })
      }
      break
    }
  }

  // ── The chain gave up on this row ────────────────────────────────────────
  // Terminal today: process-pipeline-queue excludes these forever and no admin
  // tab surfaces them, so they are invisible until something like this renders.
  if (row.needs_intervention_reason) {
    reasons.push({
      code: 'quarantined', severity: 'critical',
      label: 'Processing failed',
      detail: `the automated chain stopped on this row (${row.needs_intervention_reason}) and will not retry it`,
    })
  }

  // ── Enrichment quality ───────────────────────────────────────────────────
  if (!brief) {
    reasons.push({
      code: 'no_brief', severity: 'critical',
      label: 'Never enriched',
      detail: 'nothing has been read from the funder’s page yet',
    })
  } else if (brief.source === 'knowledge_fallback' && !readSinceFallback(row)) {
    reasons.push({
      code: 'page_unreadable', severity: 'critical',
      label: 'Page unreadable',
      detail: 'the funder’s page could not be read, so this was written from memory with amounts and dates dropped',
    })
  }

  // ── Who the fund is for ──────────────────────────────────────────────────
  // Ordered so that any mention of the social sector wins: a fund open to
  // businesses AND charities is one our audience can win, and a false positive
  // here hides a real fund from everyone, which is the more expensive error.
  const whoCanApply = typeof brief?.who_can_apply === 'string' ? brief.who_can_apply : ''
  if (
    whoCanApply &&
    !SOCIAL_SECTOR_RE.test(whoCanApply) &&
    !OPEN_TO_ALL_RE.test(whoCanApply) &&
    COMMERCIAL_ONLY_RE.test(whoCanApply)
  ) {
    reasons.push({
      code: 'applicant_not_social_sector', severity: 'critical',
      label: 'Not for charities or social enterprises',
      detail: 'the funder states the applicant must be a business, producer, employer or academic researcher',
    })
  }

  // The structured answer to the same question, and a far better one than the
  // prose above. `eligible_structures = ['individual']` says outright that no
  // organisation can apply, and it was sitting unread next to a regex guessing
  // at who_can_apply. Seven such rows cleared the gate on the 01 Aug dry run —
  // six Arts Council of Wales artist bursaries and one community foundation
  // row — because their wording ("Individual artists and creative
  // professionals") contains no commercial noun and no charity noun, so
  // COMMERCIAL_ONLY_RE could not fire and SOCIAL_SECTOR_RE could not save them.
  //
  // Only an exclusively-individual list blocks. ['individual','registered_charity']
  // is a fund an organisation can win, and hiding it would be the expensive error.
  if (row.eligible_structures?.length === 1 && row.eligible_structures[0] === 'individual') {
    reasons.push({
      code: 'applicant_individual_only', severity: 'critical',
      label: 'Only individuals can apply',
      detail: 'the only eligible structure recorded is “individual”, so no organisation using this can apply',
    })
  }

  // ── Link health ──────────────────────────────────────────────────────────
  if (row.url_status === 'dead') {
    reasons.push({
      code: 'link_dead', severity: 'critical',
      label: 'Link dead',
      detail: 'the application link did not resolve to a live page',
    })
  } else if (row.url_status && row.url_status !== 'ok') {
    reasons.push({
      code: 'link_unverified', severity: 'check',
      label: 'Link not verified',
      detail: typeof row.url_quality_score === 'number'
        ? `page quality scored ${row.url_quality_score}/100`
        : 'the application link has not been confirmed',
    })
  } else if (typeof row.url_quality_score === 'number' && row.url_quality_score < URL_QUALITY_SUSPECT) {
    reasons.push({
      code: 'link_unverified', severity: 'check',
      label: 'Link looks wrong',
      detail: `page quality scored ${row.url_quality_score}/100 — it may not be the application page`,
    })
  }

  // ── Amounts ──────────────────────────────────────────────────────────────
  const min = row.amount_min, max = row.amount_max
  if (min !== null && min !== undefined && max !== null && max !== undefined && min > max) {
    reasons.push({
      code: 'amount_inverted', severity: 'critical',
      label: 'Amounts inverted',
      detail: `minimum £${min.toLocaleString('en-GB')} is above the maximum £${max.toLocaleString('en-GB')}`,
    })
  } else if (min === 0 && max === 0) {
    reasons.push({
      code: 'amount_zero', severity: 'check',
      label: 'Amount reads £0 to £0',
      detail: 'no usable figure was found on the page',
    })
  } else if (max === null || max === undefined) {
    reasons.push({
      code: 'no_amount', severity: 'check',
      label: 'No amount',
      detail: 'nothing states what an applicant can ask for',
    })
  }

  // Flags raised by enrich-grant's shared checkers (grant-flags.ts).
  for (const f of flags) {
    const mapped = mapFlagToReason(f)
    if (mapped) reasons.push(mapped)
  }

  // Brief-level guards that enrich-grant computes and nothing has ever rendered.
  if (asArray(brief?._ungrounded_amounts).length > 0) {
    const n = asArray(brief?._ungrounded_amounts).length
    reasons.push({
      code: 'amount_ungrounded', severity: 'check',
      label: 'Amount not in what we quoted',
      // "no matching wording on the page" sent a reviewer to the funder's site
      // to check a figure that was there. The guard never looks at the page: it
      // compares the write-up against the citation snippet and the stored
      // description. So the finding is about OUR text, not the funder's, and
      // saying otherwise costs a site visit per row.
      detail: `${n} ${plural(n, 'figure', 'figures')} in the write-up ${plural(n, 'is', 'are')} not supported by the quote or description we hold — often a figure the model worked out rather than read`,
    })
  }
  // A past date in the write-up means one of two very different things, and
  // treating them alike is what let the queue say "Nothing looks wrong" beside a
  // "Date already past" chip.
  //
  //   With a valid future deadline, the key fact on the card is right and one
  //   sentence in the prose is untidy. Informational.
  //
  //   With no current deadline, the card has NOTHING true about when to apply:
  //   the deadline slot renders empty or "Rolling, apply any time" while the
  //   write-up underneath describes a round that closed. The surface says open
  //   and the prose says shut, both from us, on the same card. That is wrong
  //   rather than incomplete, so it blocks.
  //
  // A stored deadline already in the past is not caught here: `deadline_passed`
  // above already blocks it, and raising both would double-count one fault.
  if (asArray(brief?._stale_dates).length > 0) {
    const hasCurrentDeadline = !!row.deadline && row.deadline >= today
    if (hasCurrentDeadline) {
      reasons.push({
        code: 'stale_dates', severity: 'check',
        label: 'Date already past',
        detail: 'the write-up quotes a date that has gone, so the page may not have been updated',
      })
    } else if (!row.deadline) {
      reasons.push({
        code: 'no_current_timing', severity: 'critical',
        label: 'Only date we hold has gone',
        detail: row.is_rolling
          ? 'the card says "Rolling, apply any time" while the write-up describes a round that has closed'
          : 'the write-up quotes a date that has passed and no current deadline is recorded, so nothing on the card is true about when to apply',
      })
    }
  }

  // ── Deadlines ────────────────────────────────────────────────────────────
  if (row.deadline && row.deadline < today) {
    reasons.push({
      code: 'deadline_passed', severity: 'critical',
      label: 'Deadline passed',
      detail: `closed on ${row.deadline} and no next round is recorded`,
    })
  } else if (row.deadline && row.deadline > horizonISO(today, DEADLINE_HORIZON_MONTHS)) {
    reasons.push({
      code: 'deadline_implausible', severity: 'critical',
      label: 'Date is not an application deadline',
      detail: `${row.deadline} is more than ${DEADLINE_HORIZON_MONTHS} months away, which is a programme end date rather than a closing date`,
    })
  } else if (!row.is_rolling && !row.deadline && !row.next_open_date) {
    reasons.push({
      code: 'no_deadline', severity: 'check',
      label: 'No deadline',
      detail: 'not marked rolling, but no closing date or next opening is recorded',
    })
  }

  // ── Tagging ──────────────────────────────────────────────────────────────
  if (!row.eligible_structures || row.eligible_structures.length === 0) {
    reasons.push({
      code: 'eligibility_missing', severity: 'critical',
      label: 'No eligibility',
      detail: 'no legal structures are tagged, so this cannot match anyone correctly',
    })
  }
  if (!row.impact_sectors || row.impact_sectors.length === 0) {
    reasons.push({
      code: 'sectors_missing', severity: 'check',
      label: 'No sectors',
      detail: 'nothing records what this fund is for',
    })
  }
  if (row.target_beneficiaries?.length === 1 && row.target_beneficiaries[0] === 'general_public') {
    reasons.push({
      code: 'beneficiaries_generic_only', severity: 'check',
      label: 'Beneficiaries unspecific',
      detail: 'only “general public” is tagged, which is often what gets recorded when nothing could be determined',
    })
  }

  // ── Reported by a user ───────────────────────────────────────────────────
  // A fundraiser rejected this grant against their own organisation and said
  // why. Higher signal than anything derived from the row alone, because it is
  // someone checking our record against the funder's actual policy. `check`
  // rather than `critical`: a flag means "wrong for me", which is not always
  // "this row is wrong", so it wants a human read before anything is edited.
  const queueProv = (row.field_provenance as Record<string, { source?: string; outstanding_flags?: number }> | null)
    ?.pipeline_state
  if (queueProv?.source === FEEDBACK_QUEUE_SOURCE) {
    const n = typeof queueProv.outstanding_flags === 'number' ? queueProv.outstanding_flags : 1
    reasons.push({
      code: 'user_flagged', severity: 'check',
      label: n > 1 ? `Reported by ${n} users` : 'Reported by a user',
      detail: 'someone rejected this in their matches and said why — triage it in Feedback triage',
    })
  }

  // ── Freshness ────────────────────────────────────────────────────────────
  const age = daysSince(typeof brief?.last_enriched === 'string' ? brief.last_enriched : null)
  if (age !== null && age > STALE_AFTER_DAYS) {
    const months = Math.floor(age / 30)
    reasons.push({
      code: 'stale_enrichment', severity: 'check',
      label: `Not re-read for ${months} ${plural(months, 'month', 'months')}`,
      detail: `last read on ${String(brief?.last_enriched).slice(0, 10)}`,
    })
  }

  // ── Tags changed ─────────────────────────────────────────────────────────
  // Last, because it is the most common and the least alarming: it means the
  // machine improved something and wants a nod. Severity rises to critical when
  // the change REMOVED eligibility, because that silently hides the fund from
  // organisations that can actually apply.
  const diffs = extractTagsDiff(row.field_provenance)
  if (diffs.length > 0) {
    const structuresLost = diffs.find(d => d.field === 'eligible_structures' && d.removed.length > 0)
    if (structuresLost) {
      reasons.push({
        code: 'tags_changed', severity: 'critical',
        label: 'Eligibility narrowed',
        detail: `a re-read removed ${structuresLost.removed.join(', ')} — confirm the funder really excludes ${plural(structuresLost.removed.length, 'it', 'them')}`,
      })
    } else {
      const n = diffs.length
      reasons.push({
        code: 'tags_changed', severity: 'changed',
        label: 'Tags changed',
        detail: `a re-read changed ${n} ${plural(n, 'field', 'fields')}`,
      })
    }
  }

  return reasons
}

function mapFlagToReason(f: GrantFlag): ReviewReason | null {
  switch (f.code) {
    case 'amount_pot_suspected':
      return { code: 'amount_pot_suspected', severity: 'critical', label: 'Amount may be the whole fund', detail: f.detail }
    case 'amount_under_stated':
      return { code: 'amount_under_stated', severity: 'check', label: 'Amount may be too low', detail: f.detail }
    case 'possible_multi_round_uncaptured':
      return { code: 'multi_round_uncaptured', severity: 'check', label: 'Looks multi-round', detail: f.detail }
    default:
      // Unknown code from an older or newer deploy — ignore rather than throw.
      return null
  }
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

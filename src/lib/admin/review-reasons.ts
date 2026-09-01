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
import { readStamp, PAGE_READ_KEY, AMOUNT_UNSUPPORTED_NOTE, DEADLINE_UNSUPPORTED_NOTE, type FieldEvidence } from '@/lib/field-evidence'
import { abstainReason } from '@/lib/verification/abstain'
import { readBlockedByAWall } from '@/lib/verification/page-readable'
import { badApplyRoute } from './apply-route-hosts'
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
  | 'amount_ungrounded_in_prose'
  | 'amount_unsupported'
  | 'deadline_unsupported'
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
  | 'apply_route_not_applyable'
  | 'never_verified'
  // Both fetch paths have failed twice running, or the link is not a web page.
  // Deliberately NON-BLOCKING: these rows are already blocked by whatever could
  // not be verified, and this only decides where the work is filed.
  | 'read_exhausted'

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
  niche_tags?:               string[] | null
  funder_brief?:             Record<string, unknown> | null
  field_provenance?:         Record<string, unknown> | null
  raw_data?:                 unknown
  needs_intervention_reason?: string | null
  location_tag?: string | null
  /** Which Find Funding tab the row lands in. Read by `describesADiscreteFund`
   *  below, and by the review queue so a reviewer can correct a
   *  misclassification. */
  funding_type?: string | null
  /** Where the row sends an applicant. */
  apply_url?: string | null
  /** The funder's own index of its funds, banked by the URL-correction pass
   *  (migration 061). When `apply_url` equals it, the row IS the front door. */
  funding_index_url?: string | null
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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE STORED BLOB IS A RECORD OF A PAST EVENT, NOT THE ROW'S CURRENT STATE.
 *
 * Nothing clears it. Pressing "Put it back" writes the field and leaves the blob
 * exactly as it was, so the card kept offering to undo a change that had already
 * been undone — three times on Football Foundation's Grass Pitch Maintenance
 * Fund on 2026-08-17, each press landing correctly in the database and changing
 * nothing on screen. A button that works and looks broken is worse than one that
 * is missing: it invites the reviewer to press it again.
 *
 * So `current` decides whether a diff is still live. A diff is SETTLED once the
 * classifier's `after` is no longer what the row holds — whether the reviewer
 * reverted to `before` or edited to a third value. Either way there is nothing
 * left to accept or undo.
 *
 * Derived from the row, never stored: it survives a refresh, and it is right for
 * a row changed somewhere else entirely.
 *
 * ONLY WHEN THE FIELD WAS ACTUALLY SELECTED. A caller whose query omits the
 * column would otherwise read `undefined`, conclude "no longer equal to after",
 * and silently drop every diff for that field. On an absent column the diff is
 * kept — on missing data the safe direction is to show the change, not to hide
 * it.
 */
export function extractTagsDiff(
  fieldProvenance: Record<string, unknown> | null | undefined,
  current?: Record<string, unknown> | null,
): FieldDiff[] {
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
    if (isSettled(current, field, after)) continue
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

/** Order-insensitive, because nothing guarantees the classifier and a hand edit
 *  write the same sequence, and a reordered list is not a change. */
function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const s = new Set(a)
  return b.every(v => s.has(v))
}

/** True when the field is present on the row AND no longer holds `after`. */
function isSettled(current: Record<string, unknown> | null | undefined, field: string, after: string[]): boolean {
  if (!current) return false
  const value = current[field]
  if (!Array.isArray(value)) return false   // absent, or not a tag list — keep it
  return !sameSet(value.map(String), after)
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
/**
 * Does this row claim a DISCRETE, NAMED fund that ought to be findable on the
 * page it links to?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY `page_describes_different_fund` NEEDED A GUARD
 *
 * The engine writes `fixable_link: wrong_fund` when it reads a page and cannot
 * find the row's fund on it. That is a real defect for a row naming a specific
 * fund — Sported was carrying an "Organisational Development Grant" that appears
 * nowhere on Sported's site, and Ffilm Cymru a "Production Fund" that appears
 * nowhere on theirs. Both were withdrawn on the strength of this code.
 *
 * But for a FRONT DOOR the question has no answer, because there is no discrete
 * fund to look for. Worked through the review queue on 2026-08-18, the code
 * fired on LawWorks, Tesco Stronger Starts, Google.org, Suffolk Community
 * Foundation, Westminster City Council and Ashoka, every one of which points at a
 * page that describes it correctly. About a third of "Live and wrong" was rows
 * where the row was right and the check was wrong, which is worse than a missed
 * defect: it spends a reviewer's attention to conclude nothing.
 *
 * TWO GUARDS, BOTH EVIDENCE-BASED RATHER THAN A BLANKET SUPPRESSION:
 *
 *   in_kind        There is no "fund" in a donated-products or free-advice
 *                  offer. Google.org gives Workspace licences and ad credits,
 *                  LawWorks brokers pro bono advice, The Hygiene Bank ships
 *                  products. Asking whether a fund appears on the page is a
 *                  category error, not a finding. 26 rows carry the note.
 *
 *   the landing    A homepage, or the funder's own index of its funds (banked by
 *   is a front     migration 061). Neither page is ABOUT one fund, so "this page
 *   door           does not describe this fund" is what pointing at a front door
 *                  looks like, not a defect. Paul's ruling of 2026-08-17,
 *                  reaffirmed 2026-09-01: "a homepage landing is not a defect
 *                  unless the funder runs separately paged funds we're hiding
 *                  behind one row." 27 live rows on 1 September.
 *
 * WHAT THIS DELIBERATELY DOES NOT CATCH. A funder that renames or sub-brands a
 * fund still trips the code: Tesco Stronger Starts links to a page headed "Tesco
 * Fruit & Veg Grant", and no structural signal distinguishes that from a genuinely
 * wrong link. Narrowing the check further would need the engine to compare fund
 * identity rather than fund name, which is a change to the verification prompt
 * and not to this file.
 *
 * THE COST OF BEING WRONG HERE IS ASYMMETRIC AND POINTS THIS WAY. A suppressed
 * true positive is a row whose link is subtly wrong and which still faces every
 * other check plus the reviewer. A false positive is a correct row held out of
 * the catalogue indefinitely, because nobody can fix what is not broken.
 */
/**
 * Does the row's link land on a front door: the site's homepage, or the funding
 * index we banked for the funder?
 *
 * HISTORY, because this guard has moved twice and the reasons matter.
 *
 * 2026-08-18: suppressed only when apply_url equalled the banked index.
 *
 * 2026-08-27: narrowed so a row whose TITLE named a fund beyond the funder kept
 * the finding even at the index. Made on "Change We Seek grants" (Tudor Trust),
 * a row Paul spot-checked and found wrong: £5k to £150k against Tudor's stated
 * £100k to £1m, on a link that redirected. The narrowing let the code fire on it.
 *
 * 2026-09-01: widened back, and to homepages. Paul, splitting "Live and wrong"
 * by cause: "the page is a front door that doesn't describe this fund" is its
 * own group and is NOT launch work; "if front doors are still counting as live
 * and wrong, the section is disagreeing with a rule already made. Fix the
 * counter, not the rows." So a named fund pointing at its funder's index is a
 * weak LINK, not a wrong ROW: a fundraiser landing there can find the fund.
 * The Tudor row was wrong on its AMOUNT, and the amount check is what should
 * have held it. The 73 bare-homepage index values cleared that same day had
 * exposed 13 rows whose apply_url is the homepage itself, and with no index
 * left to compare against the old guard could not see them as front doors.
 *
 * The "unless" in Paul's ruling — a funder with several separately paged funds
 * that we carry as one row — has no detector: it needs the funder's index read
 * and compared with what we hold, which is a verification change and not a
 * review-reasons one. Noted for after 11 September.
 *
 * WHAT A FRONT DOOR IS HERE, AND IS NOT. The site root, or the banked index. It
 * is NOT any page whose path merely looks like an index ("/grants" with no index
 * recorded): the 2026-08-17 lesson is that a URL which looks right can be a
 * grants-awarded list, so shape alone does not clear a row. Those rows stay in
 * the queue until an index is banked for the funder.
 *
 * Trailing slashes and case are ignored; "https://funder.example/funding/" is
 * the same page as "https://funder.example/funding".
 */
function landsOnAFrontDoor(row: ReviewRow): boolean {
  const normalise = (u: string) => u.trim().toLowerCase().replace(/\/+$/, '')
  const apply = row.apply_url ? normalise(String(row.apply_url)) : ''
  if (!apply) return false

  // The site root: scheme, host, optional port, nothing after it.
  if (/^https?:\/\/[^/?#]+$/.test(apply)) return true

  const index = row.funding_index_url ? normalise(String(row.funding_index_url)) : ''
  return Boolean(index) && apply === index
}

function describesADiscreteFund(row: ReviewRow): boolean {
  if ((row.funding_type ?? '').toLowerCase() === 'in_kind') return false
  if (landsOnAFrontDoor(row)) return false
  return true
}

/**
 * Does this figure appear anywhere in the evidence we hold for the row?
 *
 * The point of the question is to separate "we assert a number nobody supports"
 * from "our write-up is untidy about a number the page states". Only the first
 * misleads anybody, and only the first should block publication.
 *
 * Matches the forms a funder actually writes: £25,000, £25000, 25,000, £25k and
 * £2.5m. Deliberately generous — a false MATCH demotes a finding to info and
 * leaves it in the queue, while a false MISS blocks a correct row indefinitely,
 * and the second is the more expensive error.
 */
export function figureAppearsInEvidence(figure: number, evidence: unknown): boolean {
  if (!evidence || typeof evidence !== 'object') return false
  const quotes: string[] = []
  for (const stamp of Object.values(evidence as Record<string, unknown>)) {
    const q = (stamp as { quote?: unknown } | null)?.quote
    if (typeof q === 'string' && q) quotes.push(q)
  }
  if (quotes.length === 0) return false
  const hay = quotes.join('  ').toLowerCase().replace(/\s+/g, '')

  const forms = new Set<string>([
    String(figure),
    figure.toLocaleString('en-GB'),
  ])
  if (figure >= 1000 && figure % 1000 === 0) forms.add(`${figure / 1000}k`)
  if (figure >= 1_000_000 && figure % 100_000 === 0) forms.add(`${figure / 1_000_000}m`)
  for (const f of Array.from(forms)) forms.add(`£${f}`)

  return Array.from(forms).some(f => hay.includes(f.toLowerCase().replace(/\s+/g, '')))
}

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
  //
  // A THIRD GUARD, ADDED 2026-09-01: NOT WHEN NOBODY READ THE PAGE.
  //
  // "The page does not describe this fund" is a claim about the FUNDER. It is
  // only sayable if somebody read the funder's page, and for a row behind a bot
  // wall nobody has. `verify-row.ts` judged Cloudflare's 268-character
  // interstitial as page content (its floor was 200 characters, and no
  // interstitial measured since has been below it), so the model was shown an
  // interception notice and answered, correctly, that the fund was not on it.
  //
  // Measured across the queue on 2026-09-01: 21 of the 87 rows carrying this
  // reason pointed at a bot wall, and 13 of those already had
  // `_read_exhausted.reason = 'bot_wall'` recorded against them. The system had
  // written down that it could not read the page and was blaming the funder in
  // the same breath.
  //
  // The reader is fixed in `verification/bot-wall.ts` so no NEW verdict can be
  // written this way. This clears the ones already stored, and it withdraws only
  // the claim about the page: `read_exhausted` still fires, so the row stays
  // visible under "Nothing more we can do", which is what is actually true
  // about it.
  if (pageRead?.note === 'fixable_link: wrong_fund'
      && describesADiscreteFund(row)
      && !readBlockedByAWall(row.field_evidence)) {
    reasons.push({
      code: 'page_describes_different_fund', severity: 'critical',
      label: 'The page does not describe this fund',
      detail: 'the link loads, but the engine could not find this fund on it',
    })
  }

  // ── Nothing more we can do ─────────────────────────────────────────────────
  // Written by scripts/probe-read-exhausted.ts, which attempts the direct fetch
  // AND the reader proxy and records the outcome. It is recorded rather than
  // derived because `_page_read` holds the last attempt and not a count, so
  // "would trying again help" is not answerable from the row.
  //
  // Two failures are required before this fires. The Hygiene Bank returned zero
  // characters on one probe and a full page four minutes later; a single failure
  // would have filed a working funder as hopeless and then stopped re-probing it.
  const exhausted = (row.field_evidence as Record<string, unknown> | null | undefined)?.['_read_exhausted'] as
    { reason?: string; consecutive?: number; detail?: string } | undefined
  // A DELIBERATE EMAIL-ONLY APPLICATION ROUTE IS NOT AN UNREADABLE PAGE.
  //
  // The Paley Trust has no website and takes applications by email. Settled by
  // Paul on 2026-08-31 as CORRECT, and it kept surfacing anyway: `not_a_web_url`
  // fires on any `mailto:` apply_url, so a ruling made in conversation was
  // re-litigated by the queue every day afterwards.
  //
  // The ruling is recorded where the code can see it — `raw_data.checks` carries
  // an `apply_route_accepted` flag — so this is not a special case for one trust
  // but the general shape: a reviewer decides a non-web route is the real route,
  // and the queue stops asking. Clearing the flag brings the row back.
  //
  // It suppresses only `read_exhausted`. Everything else about the row is still
  // checked, and a `mailto:` on a row NOBODY has ruled on still surfaces.
  const routeAccepted = flags.some(f => f.code === 'apply_route_accepted')
  if (exhausted && exhausted.reason === 'not_a_web_url' && routeAccepted) {
    // Ruled on. Nothing to say.
  } else if (exhausted && (exhausted.reason === 'not_a_web_url' || Number(exhausted.consecutive ?? 0) >= 2)) {
    reasons.push({
      code: 'read_exhausted', severity: 'check',
      label: 'Nothing more we can do',
      detail: exhausted.reason === 'not_a_web_url'
        ? 'the link is not a web page, so no fetch can ever read it'
        : 'both the direct fetch and the reader proxy have failed twice running',
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
  //
  // NARROWED 2026-08-28. This fired on ANY text in the column, and 18 live rows
  // were carrying notes rather than failures: "Gap audit 2026-07-01 (Claude):
  // verified vs funder site. Open/rolling. Review & activate." A previous
  // session left its working notes in the field the pipeline uses as a
  // tombstone, and every one of those rows has been reported as "the chain gave
  // up" ever since, at readiness 3, unpublishable.
  //
  // Worse than the label: `process-pipeline-queue` and `reenrich-stale` both
  // skip rows where this column is not null, so a note also froze the row out of
  // enrichment and re-reading for two months.
  //
  // The machine writes two shapes, `<step>_failed: <error>` and `reenrich: ...`.
  // Anything else is a human leaving a note, which is not a quarantine.
  const quarantineText = String(row.needs_intervention_reason ?? '')
  const isMachineQuarantine = /_failed:/.test(quarantineText) || /^reenrich:/.test(quarantineText)
  if (row.needs_intervention_reason && isMachineQuarantine) {
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

  // ── Can a fundraiser apply from this link at all? ────────────────────────
  //
  // Four LIVE rows pointed at Charity Commission register entries. Every check
  // the catalogue had said they were fine: the URL was healthy, the page loaded,
  // the funder was named. A register entry is a public record OF a charity and
  // never the route TO it, so a fundraiser landing there could do nothing.
  //
  // Harford Charitable Trust was not in the review queue at all — no blocking
  // reason, invisible to this screen — and was found only by sweeping all 961
  // rows by hand on 2026-09-01. That is the argument for a check rather than a
  // one-off correction: a defect nothing can detect regrows silently.
  //
  // The `mailto:` case is `non_web` and is deliberately NOT raised here. It is
  // already covered by `read_exhausted`, and the Paley ruling above settles when
  // it is a real route.
  const badRoute = badApplyRoute(row.apply_url as string | null)
  if (badRoute && badRoute.kind !== 'non_web') {
    reasons.push({
      code: 'apply_route_not_applyable', severity: 'critical',
      label: 'Nowhere to apply from this link',
      detail: badRoute.why,
    })
  }

  // ── Amounts ──────────────────────────────────────────────────────────────
  //
  // AN IN-KIND OFFER HAS NO AMOUNT, AND ASKING FOR ONE IS A CATEGORY ERROR.
  //
  // Same shape as the `in_kind` guard on `page_describes_different_fund` twenty
  // lines up, and found the same way. Pro bono legal advice, a donated laptop,
  // a discounted Microsoft 365 tenancy and a desk in someone's office do not
  // have a per-applicant pound figure, so `no_amount` fires on every one of
  // them, files the row under "needs reading", and nothing a reader could ever
  // find on the page will clear it. The row sits in the queue for ever.
  //
  // Measured 2026-09-01: 18 of the 46 rows under "Needs reading" were in-kind,
  // 16 of them carrying `no_amount`, and 17 carrying nothing else that a re-read
  // could resolve. That is a third of the section, permanently.
  //
  // `amount_zero` is suppressed for the same reason and one step worse: £0 to £0
  // is what a seeder writes when the answer is "there is no figure", and it then
  // reads back as a defect. TrustLaw and the National Digital Inclusion Network
  // both carry it.
  //
  // Everything that asserts a WRONG figure still fires. An in-kind row claiming
  // £5,000 the page does not state is misleading in exactly the way a grant row
  // would be, and none of the amount_* checks below are touched.
  const isInKind = String(row.funding_type ?? '').toLowerCase() === 'in_kind'
  const min = row.amount_min, max = row.amount_max
  if (isInKind && (max === null || max === undefined || (min === 0 && max === 0))) {
    // No reason at all: there is nothing missing.
  } else if (min !== null && min !== undefined && max !== null && max !== undefined && min > max) {
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

  // The page was read and it states no per-applicant figure, while the card
  // shows one.
  //
  // Distinct from `amount_ungrounded`, which is about OUR write-up: that guard
  // compares the brief's prose against the quote and description we already
  // hold, and never looks at the funder's page. This one is the page's verdict
  // on the figure a user actually sees, and it is the gap that let three of four
  // material errors through a random sample on 2026-08-19 — every one of those
  // rows had been read within three days and reported clean, because until then
  // the verifier never asked about amounts at all.
  //
  // Absence of a figure is NOT this code. `no_amount` already covers a row with
  // nothing to show, and an absent amount renders as absent and misleads nobody.
  // This fires only where we assert a number the funder's page does not.
  //
  // Read across BOTH fields, and never over a confirmation. A row is read across
  // up to three pages, so the first page can stamp "unsupported" and a later hop
  // can then confirm the figure — which is exactly what happened on the Allan &
  // Nesta Ferguson row: the apply_url is a login wall stating nothing, and the
  // funder's guidance page one hop on says "Requests up to £50,000 are reviewed
  // monthly." A confirmation anywhere in the read outranks silence elsewhere in
  // it, or the check would report a figure as invented on the strength of the
  // one page that happened to be a login form.
  const amountStamps = (['amount_min', 'amount_max'] as const).map(f => readStamp(row.field_evidence, f))
  const amountConfirmed = amountStamps.some(st => st?.agrees === true)
  const amountUnsupported = amountStamps.some(st => st?.note === AMOUNT_UNSUPPORTED_NOTE)
  // AND WE MUST STILL BE SHOWING A FIGURE.
  //
  // The note means "we state a figure this page does not", so a row holding no
  // figure cannot be guilty of it. Sixteen rows had their unsourced amounts
  // cleared on 2026-08-28 — the honest outcome, absence rendering as absence —
  // and every one stayed flagged, because the condition tested the stamp and
  // never the card. A queue that does not clear when you fix the thing is a
  // queue nobody finishes.
  const showsAnAmount = row.amount_min !== null && row.amount_min !== undefined
    || row.amount_max !== null && row.amount_max !== undefined
  if (amountUnsupported && !amountConfirmed && showsAnAmount) {
    const shown = [row.amount_min ?? null, row.amount_max ?? null]
      .filter((n): n is number => n !== null)
      .map(n => `£${n.toLocaleString('en-GB')}`)
      .join(' to ')
    reasons.push({
      code: 'amount_unsupported', severity: 'check',
      label: 'Amount is not on the funder\u2019s page',
      detail: `the card offers ${shown || 'an amount'} and the page we read states no figure for one applicant, so the number came from somewhere other than the funder`,
    })
  }

  // The page was read and it states no closing date, while the card shows one.
  //
  // INFORMATIONAL, unlike its amount twin, and the difference is the evidence.
  // Amounts that no page supported turned out to be scraper-written at 65%, so
  // blocking them mostly blocked invented numbers. Deadlines do not follow that
  // pattern: of the 71 live rows in this shape on 2026-08-20, 20 came from
  // scrapers but 16 were Paul's own admin values and 10 were verified by a
  // person. A funder publishing its deadline in a newsletter or a PDF while the
  // page we read says nothing is ordinary, so this is a prompt to look, not a
  // finding.
  if (row.deadline && readStamp(row.field_evidence, 'deadline')?.note === DEADLINE_UNSUPPORTED_NOTE) {
    reasons.push({
      code: 'deadline_unsupported', severity: 'check',
      label: 'Closing date is not on the funder\u2019s page',
      detail: `the card shows ${row.deadline} and the page we read states no closing date, so the date came from somewhere other than the funder`,
    })
  }

  // Flags raised by enrich-grant's shared checkers (grant-flags.ts).
  for (const f of flags) {
    const mapped = mapFlagToReason(f)
    if (mapped) reasons.push(mapped)
  }

  // Brief-level guards that enrich-grant computes and nothing has ever rendered.
  //
  // NARROWED 2026-09-01, and kept BLOCKING. Paul's rule: an unsourced figure is
  // an unquoted fact, which is the standard the whole catalogue is held to. But
  // the detector never looks at the funder's page — it compares the write-up
  // against the citation snippet and the stored description only — so it was
  // firing on figures that ARE in our evidence, just not in the two strings it
  // happened to read. Checked against the queue on 2026-09-01: of the rows
  // blocked on it, the page states the figure on seven.
  //
  // So the code now splits on the question that decides whether anybody is
  // misled. Does the figure appear ANYWHERE in the evidence we hold?
  //
  //   nowhere        the write-up asserts a number nothing supports. Blocks.
  //   somewhere      the write-up is untidy and the number is real. Info.
  //
  // The split is on the CODE, not the severity, because the gate reads POLICY by
  // code and severity has no vote there — a severity branch would let the table
  // and the gate disagree silently, which publish-gate.ts documents as a bug it
  // has already had once.
  const ungroundedFigures = asArray(brief?._ungrounded_amounts)
    .filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  if (ungroundedFigures.length > 0) {
    const unsupported = ungroundedFigures.filter(n => !figureAppearsInEvidence(n, row.field_evidence))
    const n = unsupported.length > 0 ? unsupported.length : ungroundedFigures.length
    reasons.push(unsupported.length > 0
      ? {
          code: 'amount_ungrounded', severity: 'critical',
          label: 'Amount appears nowhere in our evidence',
          detail: `${n} ${plural(n, 'figure', 'figures')} in the write-up ${plural(n, 'is', 'are')} not in the quote, the description, or anything the page told us — a figure the model worked out rather than read`,
        }
      : {
          code: 'amount_ungrounded_in_prose', severity: 'check',
          label: 'Amount is real but not in what we quoted',
          detail: `${n} ${plural(n, 'figure', 'figures')} in the write-up ${plural(n, 'is', 'are')} not supported by the quote we stored, but ${plural(n, 'does', 'do')} appear in what the funder's page told us. The write-up needs tidying, not the figure`,
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
    // A RECORDED NEXT OPENING IS TIMING, and this test used to ignore it.
    //
    // The critical branch below says "nothing on the card is true about when to
    // apply". That is exactly wrong for a row carrying next_open_date
    // "Applications open in September 2026": the card says when to come back,
    // which is the most useful thing a closed fund can say. Three live rows were
    // flagged critical on 2026-08-28 while holding precisely that — Cash4Clubs,
    // Haringey Healthy Neighbourhoods and Ufi VocTech Activate.
    //
    // A stale sentence in the prose is still worth tidying, so they keep the
    // informational `stale_dates`, the same as a row with a future deadline.
    const hasCurrentDeadline = !!row.deadline && row.deadline >= today
    const hasNextOpening     = !!String(row.next_open_date ?? '').trim()
    if (hasCurrentDeadline || hasNextOpening) {
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
  const diffs = extractTagsDiff(row.field_provenance, row as unknown as Record<string, unknown>)
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

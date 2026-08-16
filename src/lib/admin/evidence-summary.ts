/**
 * Turn a row's `field_evidence` into something a person can read in the Review
 * Inbox.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * The review screen has always shown DERIVED reasons: `no_deadline`,
 * `eligibility_missing`, `link_unverified`. Every one of them is computed from
 * what the row already holds. None of them is a fact about the funder's page,
 * so a reviewer accepting a row has been agreeing with our own bookkeeping
 * rather than with the funder.
 *
 * `field_evidence` is the first thing on the screen that comes from outside. It
 * carries the funder's own sentence, the page it came from and the date it was
 * read, so "publish this" can mean "I have seen what the page says" instead of
 * "nothing in our data objected".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ORDER IS THE ARGUMENT
 *
 * Contradictions first, then silences, then confirmations. That inverts the
 * obvious ordering and it is deliberate: a confirmation needs no decision, a
 * silence might, and a contradiction always does. Sorting confirmations to the
 * top would bury the one line that should stop somebody clicking publish.
 *
 * A SILENCE IS NOT A GAP WHEN THE SURFACE FILLS IT IN. `deadline` and
 * `is_rolling` are marked `asserted`, because an unanswered timing question does
 * not render as blank, it renders as the word "Rolling". An unanswered amount
 * renders as absent and misleads nobody. The panel says which is which rather
 * than listing them all as "not stated".
 */

import { readStamp, PAGE_READ_KEY, type FieldEvidence, type EvidenceStamp } from '@/lib/field-evidence'

/** Fields the panel reports on, in the order it reports them. */
const FIELDS: { key: string; label: string; asserted: boolean }[] = [
  // Asserted: the surface turns our silence into a claim.
  { key: 'is_rolling',     label: 'Rolling',        asserted: true  },
  { key: 'deadline',       label: 'Deadline',       asserted: true  },
  { key: 'deadline_cycle', label: 'Rounds',         asserted: true  },
  // Not asserted: absent renders as absent.
  { key: 'is_invite_only', label: 'Invitation only', asserted: false },
  { key: 'max_org_income', label: 'Income cap',      asserted: false },
  { key: 'still_listed',   label: 'Still listed',    asserted: false },
  { key: 'is_grant',       label: 'In scope',        asserted: false },
]

export type EvidenceVerdict = 'contradicted' | 'silent' | 'confirmed'

export type EvidenceLine = {
  field:     string
  label:     string
  verdict:   EvidenceVerdict
  /** True when the surface asserts this field, so a silence is a claim. */
  asserted:  boolean
  quote:     string | null
  sourceUrl: string | null
  /** What the page supports, on a contradiction. */
  proposed:  unknown
}

export type EvidenceSummary = {
  /** Null when nothing has ever read this row's page. */
  checkedAt:  string | null
  /** The page actually read, which is not always `apply_url`. */
  readUrl:    string | null
  /** The verification outcome, e.g. 'verified' or 'fixable_link: wrong_fund'. */
  outcome:    string | null
  lines:      EvidenceLine[]
  counts:     Record<EvidenceVerdict, number>
  /** Asserted fields with no confirmation behind them. The headline number. */
  unbacked:   number
}

const RANK: Record<EvidenceVerdict, number> = { contradicted: 0, silent: 1, confirmed: 2 }

function verdictOf(stamp: EvidenceStamp): EvidenceVerdict {
  if (stamp.agrees === false) return 'contradicted'
  if (stamp.agrees === true && stamp.quote && stamp.quote.trim()) return 'confirmed'
  return 'silent'
}

export function summariseEvidence(evidence: FieldEvidence | null | undefined): EvidenceSummary | null {
  if (!evidence || typeof evidence !== 'object' || Object.keys(evidence).length === 0) return null

  const pageRead = readStamp(evidence, PAGE_READ_KEY)
  const lines: EvidenceLine[] = []

  for (const { key, label, asserted } of FIELDS) {
    const stamp = readStamp(evidence, key)
    if (!stamp) continue
    lines.push({
      field: key, label, asserted,
      verdict:   verdictOf(stamp),
      quote:     stamp.quote,
      sourceUrl: stamp.source_url,
      proposed:  stamp.proposed,
    })
  }

  lines.sort((a, b) =>
    RANK[a.verdict] - RANK[b.verdict] ||
    Number(b.asserted) - Number(a.asserted) ||
    a.label.localeCompare(b.label))

  const counts: Record<EvidenceVerdict, number> = { contradicted: 0, silent: 0, confirmed: 0 }
  for (const l of lines) counts[l.verdict]++

  // `_page_read` is the reliable source of "when", but rows stamped before that
  // key existed carry only per-field timestamps, so fall back to the newest of
  // those rather than showing a row as never checked when it plainly was.
  const anyCheckedAt = Object.values(evidence)
    .map(s => (s && typeof s === 'object' ? (s as EvidenceStamp).checked_at : null))
    .filter((v): v is string => typeof v === 'string')
    .sort()
    .pop() ?? null

  return {
    checkedAt: pageRead?.checked_at ?? anyCheckedAt,
    readUrl:   pageRead?.source_url ?? null,
    outcome:   pageRead?.note ?? null,
    lines,
    counts,
    // A confirmed asserted field is backed. A silent or contradicted one is not,
    // and neither is one nobody asked about — but only fields we DID ask about
    // appear here, so this counts what we looked for and did not find.
    unbacked: lines.filter(l => l.asserted && l.verdict !== 'confirmed').length,
  }
}

/** One line for the collapsed row, or null when there is nothing to say. */
export function evidenceHeadline(s: EvidenceSummary | null): string | null {
  if (!s) return null
  if (s.counts.contradicted > 0) {
    return `${s.counts.contradicted} field${s.counts.contradicted === 1 ? '' : 's'} the page contradicts`
  }
  if (s.unbacked > 0) {
    return `${s.unbacked} claim${s.unbacked === 1 ? '' : 's'} the page does not back`
  }
  if (s.counts.confirmed > 0) return `${s.counts.confirmed} confirmed against the page`
  return 'read, nothing stated'
}

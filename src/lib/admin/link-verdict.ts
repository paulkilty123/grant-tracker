// What kind of thing is a link flag?
//
// WHY THIS EXISTS
//
// The verifier writes one `note` per row — `verified`, `fixable_link: wrong_fund`,
// `multiple_funds`, `fixable_link: no_funding_detail`, `fixable_link: no_content`,
// `fixable_link: fetch_failed` — and everything downstream has treated that note
// as a flat outcome. Totalled, it reads as a defect count.
//
// On 2026-08-30 those totals were 74 + 59 + 41 = 174 live rows, and that number
// was set as the thing to fix before launch. All 174 were then read from
// production. Seventy-eight were pages a fundraiser could apply from, ninety-three
// were the funder's own site showing an index rather than the fund's page, and
// the two that survived as "genuinely wrong" were both artefacts of the checker.
// Zero broken links. See docs/link-flags-2026-08-30.md.
//
// It was the third investigation of the same pile. On 2026-08-21, 51 wrong_fund
// rows gave 10 where the flag was wrong, 26 acceptable funder indexes, 11
// unreadable and 4 real. The pile does not shrink because rows get fixed. It is
// not a defect pile, and the totals said it was.
//
// So the kinds below are the point. An index page is a QUALITY of a link, not a
// fault, and must never be added to a count of faults. A count that mixes them
// describes a crisis that is not there, and has now cost three investigations.

/**
 * Three kinds, and they must be counted separately.
 *
 *   fault        The link does not serve the row. A user's first click is wasted
 *                and we should fix or withdraw the row.
 *   quality      The link works and belongs to the right funder, but points at
 *                an index or a thin page rather than this fund's own page.
 *                Worth improving. Not a fault. Paul, 2026-08-17: "A link landing
 *                on a funder's homepage is fine and shouldn't appear as a
 *                problem."
 *   unknown      We could not read the page well enough to say. Absence of
 *                evidence, and never to be totalled with either of the above —
 *                a WAF outage would otherwise read as a wave of defects.
 */
export type LinkFlagKind = 'fault' | 'quality' | 'unknown'

export type LinkFlag = {
  kind: LinkFlagKind
  /** The raw verifier note this came from. */
  note: string
  label: string
  /** Why this kind and not another, in one line, for a UI that shows counts. */
  because: string
}

/**
 * `multiple_funds` is a QUALITY flag and this is the load-bearing decision here.
 *
 * It fires when the page describes several funds. That is a normal, healthy
 * shape for a community foundation or a large trust, and the link is correct —
 * the fundraiser simply has to find their fund on the page. 41 of the 78 rows
 * that a fundraiser could plainly apply from carried this note.
 *
 * `no_funding_detail` is likewise a quality flag: the right page carried little
 * detail. `review-reasons.ts` already refuses to raise anything for it, calling
 * it "thinness rather than wrongness"; this puts the same judgement in the
 * counting layer so the two cannot drift.
 */
const KINDS: Record<string, Omit<LinkFlag, 'note'>> = {
  'verified': {
    kind: 'quality', label: 'Verified against the page',
    because: 'the engine read the page and it supports the row',
  },
  'fixable_link: wrong_fund': {
    kind: 'fault', label: 'This fund is not on the page',
    because: 'the page loads but the engine could not find this fund on it',
  },
  'multiple_funds': {
    kind: 'quality', label: 'Page covers several funds',
    because: 'the link is right and points at an index; the fundraiser has to find their fund on it',
  },
  'fixable_link: no_funding_detail': {
    kind: 'quality', label: 'Right page, little detail',
    because: 'thinness rather than wrongness — the page belongs to this funder',
  },
  'fixable_link: no_content': {
    kind: 'unknown', label: 'Page returned nothing',
    because: 'usually transient or a bot wall, so it says nothing about the link',
  },
  'fixable_link: fetch_failed': {
    kind: 'unknown', label: 'Could not fetch the page',
    because: 'usually transient or a bot wall, so it says nothing about the link',
  },
  'round_closed': {
    kind: 'quality', label: 'Round closed',
    because: 'a fact about the fund, not about the link',
  },
  'no_longer_listed': {
    kind: 'fault', label: 'Fund no longer listed',
    because: 'the funder has removed it from the page it lived on',
  },
}

export function classifyLinkFlag(note: string | null | undefined): LinkFlag | null {
  if (!note) return null
  const known = KINDS[note]
  if (known) return { note, ...known }
  // An unrecognised note is UNKNOWN, never a fault. A new verifier outcome must
  // not silently start inflating a defect count the day it ships.
  return {
    note, kind: 'unknown', label: note,
    because: 'this outcome has no classification yet, so it is not counted as a fault',
  }
}

export type LinkFlagCounts = Record<LinkFlagKind, number>

/**
 * Count by kind. There is deliberately no total: the whole failure this fixes
 * was a single number that added an index page to a broken link.
 */
export function countLinkFlags(notes: (string | null | undefined)[]): LinkFlagCounts {
  const counts: LinkFlagCounts = { fault: 0, quality: 0, unknown: 0 }
  for (const n of notes) {
    const flag = classifyLinkFlag(n)
    if (flag) counts[flag.kind]++
  }
  return counts
}

/** One line a human can act on, which is never "174 problems". */
export function describeLinkFlags(counts: LinkFlagCounts): string {
  const parts: string[] = []
  if (counts.fault > 0)   parts.push(`${counts.fault} to fix`)
  if (counts.quality > 0) parts.push(`${counts.quality} could point deeper`)
  if (counts.unknown > 0) parts.push(`${counts.unknown} unread`)
  return parts.length ? parts.join(', ') : 'nothing flagged'
}

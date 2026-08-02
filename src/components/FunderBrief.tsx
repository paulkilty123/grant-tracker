// The enriched funder brief, as a USER sees it.
//
// One component, rendered by both the grant detail page and GrantDetailModal,
// because they had already drifted: the modal's "About this grant" showed a
// 44-character scraped stub ("Grant from Armed Forces Covenant Fund Trust.")
// while the row held 12 populated fields and 3,142 characters describing who
// can apply, what is excluded, and how decisions are made. Across the live
// catalogue that was 267 characters shown against 2,164 held, on 98% of rows.
//
// Nothing here is admin-facing. Confidence pills, citation snippets, provenance
// and the internal quality flags (_stale_dates, _ungrounded_amounts) stay in the
// admin surfaces: a citation is evidence for a reviewer deciding whether to
// trust a value, and an ungrounded-amount flag is precisely the thing that must
// NOT be shown to a user as though it were fact.

import type { CSSProperties } from 'react'

/**
 * The public field allowlist, in the order a user needs them.
 *
 * ORDERED BY THE QUESTION BEING ASKED, not by how the enricher happens to emit
 * them: can I apply, will I be ruled out, is it for my kind of work, how much,
 * where, what do they care about, when will I hear, and only then how to make it
 * land. Eligibility and exclusions lead because they are the two that let
 * someone stop reading and move on, which is the most valuable thing this page
 * can do for a small charity with limited time.
 *
 * ALLOWLIST, NEVER A DENYLIST. Everything absent from this array is invisible to
 * users by construction, so a new internal key added to funder_brief later
 * cannot leak by default. The same reasoning as the publish gate's exhaustive
 * POLICY record: omission must fail closed.
 */
export const PUBLIC_BRIEF_FIELDS = [
  ['who_can_apply',      'Who can apply'],
  ['exclusions',         'What they will not fund'],
  ['what_they_fund',     'What they fund'],
  ['typical_award',      'Typical award'],
  ['geographic_focus',   'Where'],
  ['priorities',         'Current priorities'],
  ['decision_timeline',  'Decision timeline'],
  ['strong_application', 'What makes a strong application'],
  ['funder_tips',        'Tips'],
] as const

export type PublicBriefField = (typeof PUBLIC_BRIEF_FIELDS)[number][0]

/** A value is worth rendering only if it is a non-empty string. A key holding ""
 *  is not a populated field — counting keys instead of values is how 16 rows
 *  shipped with a "complete" brief whose every field was an empty string. */
function usable(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

export function briefHasContent(brief: Record<string, unknown> | null | undefined): boolean {
  if (!brief) return false
  return PUBLIC_BRIEF_FIELDS.some(([key]) => usable(brief[key]))
}

/**
 * What leads the "About this grant" slot.
 *
 * The brief wins whenever it has anything to say. The scraped description is a
 * FALLBACK, not the headline — it is where the funder-name-only stubs live
 * ("Grant from X.") and the scraper artefacts ("Small grant of £10k available
 * via The Card Factory - deadline soon"). Making the ordering structural fixes
 * those without a stub-detector chasing string patterns, which would be brittle
 * for the handful of rows that have them and wrong for everyone else.
 */
export function leadParagraph(
  brief: Record<string, unknown> | null | undefined,
  description: string | null | undefined,
): string | null {
  if (brief && usable(brief.what_they_fund)) return brief.what_they_fund.trim()
  if (usable(description)) return description.trim()
  return null
}

type Variant = 'page' | 'modal'

export function FunderBrief({
  brief,
  variant = 'page',
}: {
  brief: Record<string, unknown> | null | undefined
  variant?: Variant
}) {
  if (!brief) return null

  // what_they_fund is deliberately skipped here when it has already been used as
  // the lead, so the same paragraph never appears twice on one screen.
  const shown = PUBLIC_BRIEF_FIELDS
    .filter(([key]) => usable(brief[key]))
    .filter(([key]) => !(key === 'what_they_fund' && usable(brief.what_they_fund)))

  if (shown.length === 0) return null

  const compact = variant === 'modal'

  const labelStyle: CSSProperties = {
    fontFamily: 'var(--font-space-grotesk)',
    fontSize: compact ? 10 : 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)',
    margin: '0 0 6px',
  }

  const bodyStyle: CSSProperties = {
    fontSize: compact ? 13 : 14,
    lineHeight: 1.55,
    color: 'var(--color-text-secondary)',
    margin: 0,
    whiteSpace: 'pre-line',
  }

  return (
    <div style={{ display: 'grid', gap: compact ? 14 : 18 }}>
      {shown.map(([key, label]) => (
        <div key={key}>
          <p style={labelStyle}>{label}</p>
          <p style={bodyStyle}>{(brief[key] as string).trim()}</p>
        </div>
      ))}
    </div>
  )
}

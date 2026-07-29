/**
 * Helpers for processing the LLM-generated funder brief and syncing
 * derived structured fields (location_tag, is_local) to the row's
 * top-level columns alongside the funder_brief jsonb.
 *
 * Closes the wiring gap that previously left location_tag stale on the
 * row even when funder_brief.geographic_focus correctly described a
 * sub-national scope.
 */

/**
 * Reads structured location fields from the brief and writes them into
 * the update payload if the LLM produced valid values. Tolerates both
 * boolean and string-form ("true"/"false") is_local values from older
 * LLM outputs.
 */
export function syncLocationFields(
  brief: Record<string, unknown>,
  updatePayload: Record<string, unknown>,
): void {
  // location_tag — short pill text. Trim and cap at 60 chars to protect
  // the UI from runaway LLM output.
  if (typeof brief.location_tag === 'string') {
    const tag = brief.location_tag.trim().slice(0, 60)
    if (tag.length > 0) updatePayload.location_tag = tag
  }

  // is_local — accept boolean, or the string forms 'true' / 'false'
  // (some Haiku outputs stringify booleans inside JSON when surrounding
  // fields are strings).
  const raw = brief.is_local
  if (typeof raw === 'boolean') {
    updatePayload.is_local = raw
  } else if (typeof raw === 'string') {
    const v = raw.toLowerCase().trim()
    if (v === 'true')  updatePayload.is_local = true
    if (v === 'false') updatePayload.is_local = false
  }
}

// ── Is a brief a real enrichment, or a stub standing in for one? ──────────────
//
// WHY THIS IS ONE PREDICATE AND NOT FOUR INLINE CHECKS
// "Has content but isn't really enriched" was tested in four places — the bulk
// enrich filter on the URLs page, hasAiContent on the Intelligence page, and the
// warning badges on GrantDetail and ReviewQueue — each with its own
// `source === 'knowledge_fallback'` comparison. Adding a second stub kind meant
// editing all four, and missing one meant a row that reads enriched on one
// screen and unenriched on another. That is the drift this codebase keeps paying
// for, so the rule lives here once.

/** Brief sources that carry content but are NOT a completed enrichment. */
export const STUB_BRIEF_SOURCES = ['knowledge_fallback', 'desk_research'] as const

/**
 * True when the row still needs a real enrichment pass.
 *
 * `knowledge_fallback` — the live page could not be fetched, so the model wrote
 *   the brief from training memory. Content, but not evidence.
 * `desk_research` — hand-written who_can_apply and what_they_fund taken from the
 *   funder's page. Accurate as far as it goes, but three fields where a real
 *   enrichment produces fourteen: no priorities, no typical award, no exclusions,
 *   no decision timeline. The "Grant insights" panel reads those.
 *
 * Found 2026-07-29: 27 desk-researched rows were invisible to the bulk enrich
 * queue, because its test for "unenriched" is `!brief.who_can_apply` — and
 * who_can_apply is exactly the field desk research fills. Populating it to feed
 * the eligibility backstop had the side effect of hiding the row from the thing
 * that would have completed it.
 */
export function needsEnrichment(brief: Record<string, unknown> | null | undefined): boolean {
  if (!brief) return true
  if (typeof brief.source === 'string' && (STUB_BRIEF_SOURCES as readonly string[]).includes(brief.source)) return true
  return !brief.who_can_apply
}

/** True when the brief exists but is a stub — for the UI warning badges. */
export function isStubBrief(brief: Record<string, unknown> | null | undefined): boolean {
  if (!brief) return false
  return typeof brief.source === 'string' && (STUB_BRIEF_SOURCES as readonly string[]).includes(brief.source)
}

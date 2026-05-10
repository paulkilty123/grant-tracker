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

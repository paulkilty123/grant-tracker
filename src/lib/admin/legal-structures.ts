/**
 * The legal structures a reviewer may set, and what to call them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A MODULE AND NOT ANOTHER LOCAL MAP
 *
 * `GrantDetailModal` already carries a label map, and it is a display map: it
 * includes legacy aliases (`charity`, `cic`, `company_ltd_guarantee`) so old rows
 * render, which is right for reading and wrong for writing. Offering `cic`
 * alongside `cic_guarantee` and `cic_shares` in an editor would let a reviewer
 * create the ambiguity the split exists to remove.
 *
 * So there are two lists and they are different on purpose:
 *
 *   EDITABLE   what a human may choose. Twelve values, no aliases.
 *   LABEL      how to render anything, including values nobody should pick now.
 *
 * Counted from the catalogue on 2026-08-17 rather than invented: the twelve
 * below are every structure with real volume plus `not_registered`, which the
 * verification engine proposes and which had only 13 rows because nothing
 * offered it.
 */

export type StructureOption = { code: string; label: string; hint?: string }

/** Offered in the editor. Ordered by how often a reviewer will want them. */
export const EDITABLE_STRUCTURES: StructureOption[] = [
  { code: 'registered_charity', label: 'Registered charity' },
  { code: 'cio',                label: 'CIO' },
  { code: 'scio',               label: 'SCIO', hint: 'Scottish CIO' },
  { code: 'cic_guarantee',      label: 'CIC (by guarantee)' },
  { code: 'cic_shares',         label: 'CIC (by shares)', hint: 'can pay capped dividends' },
  { code: 'ltd_guarantee',      label: 'Ltd by guarantee' },
  { code: 'ltd_shares',         label: 'Ltd by shares', hint: 'an ordinary trading company' },
  { code: 'cooperative',        label: 'Co-op / community benefit society' },
  { code: 'unincorporated',     label: 'Unincorporated association', hint: 'constituted, not registered' },
  { code: 'not_registered',     label: 'Unregistered group', hint: 'no constitution or registration' },
  { code: 'sole_trader',        label: 'Sole trader' },
  { code: 'individual',         label: 'Individual' },
]

/** Legacy values still present on old rows. Rendered, never offered. */
const LEGACY_LABELS: Record<string, string> = {
  charity:               'Charity (legacy)',
  cic:                   'CIC (unspecified, legacy)',
  social_enterprise:     'Social enterprise (legacy)',
  llp:                   'LLP',
  community_group:       'Community group (legacy)',
  community_land_trust:  'Community land trust',
}

const EDITABLE_LABELS: Record<string, string> =
  Object.fromEntries(EDITABLE_STRUCTURES.map(s => [s.code, s.label]))

/** Render any structure code, current or legacy, without inventing a label. */
export function structureLabel(code: string): string {
  return EDITABLE_LABELS[code]
    ?? LEGACY_LABELS[code]
    ?? code.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
}

/** True for a value no longer offered — worth showing a reviewer so they can
 *  replace it with a current one rather than leaving it to drift. */
export function isLegacyStructure(code: string): boolean {
  return !(code in EDITABLE_LABELS)
}

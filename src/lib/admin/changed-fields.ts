/**
 * Has an admin actually changed this value?
 *
 * Grant Manager's edit modal used to send all seventeen of its form fields on
 * every save. `update-grant` stamps an admin session at trust 100 with
 * `pinned: true`, so a save to correct one typo froze the other sixteen against
 * every automated source permanently. Measured 2026-07-26: 54% of active rows
 * carry at least one pin, and 53 have `deadline` pinned to NULL — frozen empty
 * because the date box happened to be blank when something unrelated was saved.
 *
 * The comparison has to treat an empty form input and a NULL column as the same
 * thing, or every row with a blank optional field would look "changed" on open
 * and pin itself on save — which is the bug wearing a different hat.
 *
 * Deliberately NOT a deep equality check. The modal's fields are scalars and
 * one comma-joined string; a value that arrives as an array is normalised to
 * that string before it gets here.
 */
export function isUnchanged(formValue: unknown, storedValue: unknown): boolean {
  return normalise(formValue) === normalise(storedValue)
}

/** Empty string, null and undefined are all "no value". */
function normalise(v: unknown): unknown {
  if (v === '' || v === undefined || v === null) return null
  if (typeof v === 'string') {
    const t = v.trim()
    return t === '' ? null : t
  }
  return v
}

/**
 * Build the set of fields to write, given the form, the stored row, and how
 * each form value maps to its database value.
 *
 * `dbValue` is separate from `formValue` because the form holds strings the
 * column does not — "50000" against 50000, "" against null.
 */
export function changedFields(
  specs: Array<{ key: string; formValue: unknown; storedValue: unknown; dbValue: unknown }>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const s of specs) {
    if (isUnchanged(s.formValue, s.storedValue)) continue
    out[s.key] = s.dbValue
  }
  return out
}

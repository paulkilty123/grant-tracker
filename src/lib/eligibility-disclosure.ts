// What we say when we have not established which organisation types can apply.
//
// ─────────────────────────────────────────────────────────────────────────────
// EMPTY IS NOT PERMISSIVE, AND THE APP USED TO SAY IT WAS.
//
// `eligible_structures = []` means nobody has established the funder's rule. It
// does not mean "open to all". Every consumer treated the two as the same thing,
// because the check everywhere is `length > 0`:
//
//   - matching.ts skipped the hard structure gate, so no score cap applied and
//     the verdict fell through to `eligibilityStatus = 'eligible'`
//   - eligibility.ts could not emit a structure_mismatch blocker
//   - all three list filters read "no restriction = all qualify"
//   - mcp-search.ts scored it 0.7 "unrestricted" and pushed a positive
//     `structure_eligible` signal into the response
//   - the search card rendered the cell as `Eligible  —  ✓`, a green tick beside
//     an em dash, on 20 live rows
//
// So the row honestly held nothing and the app turned nothing into "yes". A
// registered charity was told, affirmatively, that it was eligible for a grant
// whose eligibility nobody had ever read.
//
// That is why `eligibility_missing` blocked the publish gate: not because the
// row was bad, but because the surface lied about it. The gate was compensating
// for a rendering bug one layer down. With the surface telling the truth, an
// empty array becomes an honest gap and the gate can let it through, which is
// the trade this module exists to make.
//
// KEEP THE COPY AND THE PREDICATE TOGETHER. Seven surfaces render this. When it
// lived as an inline `length > 0` in each of them they drifted, which is how the
// tick and the em dash survived as long as they did.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Long form. Detail pages and anywhere with room for a sentence.
 *
 * Follows the house pattern for an honest gap: name the gap, then the action.
 * Compare `No funder brief for this one yet. Check the funder's own page before
 * applying.` No dashes, sentence case, British spelling (CLAUDE.md house copy).
 */
export const ELIGIBILITY_NOT_STATED =
  "Eligibility not fully stated on the funder's site. Check directly before applying."

/** Short form for meta cells and pills, where a sentence will not fit. */
export const ELIGIBILITY_NOT_STATED_SHORT = 'Not fully stated'

/**
 * Has anyone established which organisation types can apply?
 *
 * False means unknown, never "open to all". Callers must not infer eligibility
 * from a false return: render the gap, do not assert a match.
 */
export function eligibilityStated(structures?: readonly string[] | null): boolean {
  return Array.isArray(structures) && structures.length > 0
}

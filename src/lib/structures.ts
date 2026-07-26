// Runtime facts about the legal-structure taxonomy.
//
// ─────────────────────────────────────────────────────────────────────────────
// Why this is not in types/index.ts, where LegalStructure lives.
//
// `src/types/index.js` exists, is tracked, and contains nothing but
// `export {};`. It is a stale build artefact from April, and at runtime it
// SHADOWS `index.ts` for any resolver that prefers .js. Type-only imports are
// erased at compile time, so nothing noticed for months. The moment a runtime
// VALUE was exported from types/index.ts it resolved to undefined, while
// `npx tsc --noEmit` stayed perfectly clean — the matcher threw "Cannot read
// properties of undefined (reading 'has')" on every scored grant.
//
// So: types/index.ts holds types, this file holds values. There is no
// structures.js to shadow it.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structures that are a PERSON rather than an organisation.
 *
 * Shared by the classifier (which tags funds) and the matcher (which caps them
 * out of organisational results), so the two cannot disagree about what counts
 * as a person.
 *
 * `sole_trader` is deliberately NOT a member. A sole trader is a person trading
 * as a business and routinely holds organisational eligibility. Conflating the
 * two is what produced a single "Sole Trader / Individual" admin chip and left
 * a research fund for clinicians and midwives tagged as though every charity in
 * the catalogue could win it.
 */
export const INDIVIDUAL_APPLICANT_STRUCTURES: ReadonlySet<string> = new Set(['individual'])

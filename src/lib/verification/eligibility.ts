/**
 * Reading who a funder says can apply, and comparing it with what we claim.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE GAP IS NOT COVERAGE, IT IS EVIDENCE
 *
 * "We do not know who can apply" is not literally what the catalogue does.
 * `funder_brief.who_can_apply` is populated on 917 of 963 eligible rows and only
 * 14 live rows lack it. The problem is one level down and worse:
 *
 *   eligible_structures  the field the MATCHER HARD-GATES ON — a structure
 *                        mismatch caps the score at 44 — is set by
 *                        `ai_classifier` on 490 rows, 370 of them live. That
 *                        classifier reads OUR OWN stored description, not the
 *                        funder's page. So the gate that decides whether a fund
 *                        is visible to a CIC is, for most rows, a model's
 *                        reading of a model's summary.
 *
 *   income gates         561 of 642 live rows carry neither a floor nor a
 *                        ceiling. Mustard Tree's file records three funds that
 *                        excluded them on income alone (A B Charitable Trust
 *                        £1.5m, The Fore £500k, The Charity Service £1m) and one
 *                        that needs a FLOOR to be right (Fishmongers', £250k to
 *                        £5m). `min_org_income` was never extracted at all, so a
 *                        fund with a floor shows to organisations too small for
 *                        it and nothing in the system can tell.
 *
 * A wrong structure tag is the quietest failure the product has: the fund simply
 * never appears, and nobody can see the absence to complain about it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SILENCE IS NOT EXCLUSION. THIS IS THE WHOLE RULE.
 *
 * A page saying "open to registered charities and CICs" has said nothing
 * whatsoever about unincorporated community groups. Treating the absence of a
 * word as a decision is exactly how Wee Grants — a Scotland-only fund for small
 * Scottish charities — lost its `scio` tag on a re-read and became invisible to
 * its own core audience.
 *
 * So this module NEVER removes a structure because the page did not mention it.
 * A removal needs an explicit exclusion, which is what the exclusions fact is
 * for. Absence stays absence.
 */

import type { LegalStructure } from '@/types'
import { deriveEquivalentStructures } from '@/lib/structure-equivalents'

/** The closed set the model is given, and the only values accepted back. */
export const STRUCTURE_SLUGS: LegalStructure[] = [
  'registered_charity', 'cio', 'scio',
  'cic_guarantee', 'cic_shares',
  'ltd_guarantee', 'ltd_shares', 'llp',
  'cooperative', 'unincorporated', 'sole_trader', 'not_registered', 'individual',
]

const SLUG_SET = new Set<string>(STRUCTURE_SLUGS)

/**
 * Near-misses worth accepting, and the one that expands.
 *
 * `cic` on its own is the interesting entry. Our taxonomy splits CICs by whether
 * they are limited by guarantee or by shares; a funder writing "CICs are
 * eligible" has accepted both and is under no obligation to enumerate Companies
 * House sub-forms. Expanding it is the same DERIVATION as
 * `deriveEquivalentStructures` — taking a form the funder has already accepted
 * and naming the variants it covers — and not an inference about what they might
 * accept.
 */
const ALIASES: Record<string, LegalStructure[]> = {
  charity:               ['registered_charity'],
  registered_charities:  ['registered_charity'],
  charitable_company:    ['registered_charity'],
  cic:                   ['cic_guarantee', 'cic_shares'],
  community_interest_company: ['cic_guarantee', 'cic_shares'],
  charitable_incorporated_organisation: ['cio'],
  company_limited_by_guarantee: ['ltd_guarantee'],
  company_limited_by_shares:    ['ltd_shares'],
  community_benefit_society:    ['cooperative'],
  co_operative:                 ['cooperative'],
  society:                      ['cooperative'],
  unincorporated_association:   ['unincorporated'],
  community_group:              ['unincorporated'],
  constituted_group:            ['unincorporated'],
  individuals:                  ['individual'],
}

/**
 * Coerce whatever the model returned into taxonomy slugs.
 *
 * Unrecognised entries are DROPPED, never guessed at. A structure gate is a hard
 * filter in the matcher, so a wrong slug does not merely misinform — it removes
 * the fund from a search silently. Dropping loses information visibly; guessing
 * loses it invisibly.
 */
export function asStructures(v: unknown): LegalStructure[] | null {
  if (!Array.isArray(v) || v.length === 0) return null
  const out = new Set<LegalStructure>()
  for (const raw of v) {
    if (typeof raw !== 'string') continue
    const key = raw.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z_]/g, '')
    if (SLUG_SET.has(key)) { out.add(key as LegalStructure); continue }
    for (const s of ALIASES[key] ?? []) out.add(s)
  }
  return out.size > 0 ? Array.from(out).sort() : null
}

/** Free-text exclusions, trimmed and deduplicated. Order preserved. */
/**
 * Does this quote name a jurisdiction or a regulator?
 *
 * `deriveEquivalentStructures` decides whether "registered charities" also
 * covers CIOs and SCIOs by reading a geography string, and the only geography
 * the engine had to hand was OUR OWN `location_tag`. That is how a page saying
 * "the Charity Commission of England and Wales" confirmed a row tagged `scio`:
 * our tag said UK, so the derivation added the Scottish form to the page's side
 * and the two matched.
 *
 * When the page names a jurisdiction, the page wins. When it does not, our tag
 * is the only signal there is and the fallback is correct — a quote listing
 * "charities, community organisations and social enterprises" says nothing about
 * geography, and reading it as "not Scotland" would strip `scio` off every
 * UK-wide fund in the catalogue.
 */
export function namesJurisdiction(quote: string | null | undefined): boolean {
  return typeof quote === 'string' && JURISDICTION.test(quote)
}

const JURISDICTION =
  /\b(england|wales|welsh|scotland|scottish|northern ireland|oscr|charity commission|ccni|uk|united kingdom|britain)\b/i

/**
 * Does this quote actually talk about organisational form?
 *
 * The same bar `max_org_income` applies to its own quotes, and for a sharper
 * reason. Berkshire Community Foundation's Grassroots Grants CONFIRMED a
 * nine-form structure gate quoting "You do not meet our general eligibility
 * criteria" — a fragment lifted from the page's exclusions list that says
 * nothing at all about who may apply. A confirmation resting on an unrelated
 * sentence is more dangerous than no evidence, because it survives review: the
 * quote is real, it is on the page, and it is beside the point.
 */
export function quoteNamesAForm(quote: string | null | undefined): boolean {
  return typeof quote === 'string' && FORM_CONCEPT.test(quote)
}

const FORM_CONCEPT =
  /\b(charit(y|ies|able)|cics?|community interest|community (group|organisation)s?|compan(y|ies)|societ(y|ies)|co-?operatives?|incorporated|unincorporated|social enterprises?|not[- ]for[- ]profit|non[- ]profit|voluntary|constituted|partnerships?|sole trader|individuals?|cios?|scios?|organisations?|groups?|trusts?)\b/i

export function asExclusions(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length === 0) return null
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of v) {
    if (typeof raw !== 'string') continue
    const s = raw.trim().replace(/\s+/g, ' ').slice(0, 300)
    if (s.length < 4) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out.length > 0 ? out : null
}

// ── Comparison ───────────────────────────────────────────────────────────────

export type StructureVerdict =
  /** The page names exactly what we hold, once equivalents are derived. */
  | { kind: 'confirmed' }
  /** The page names forms we do not hold. Accepting this WIDENS eligibility. */
  | { kind: 'widens';   add: LegalStructure[]; proposed: LegalStructure[] }
  /** The page explicitly rules out forms we hold. This NARROWS eligibility. */
  | { kind: 'narrows';  remove: LegalStructure[]; proposed: LegalStructure[] }
  /** Both at once. Reported as one verdict so the proposal is a whole set. */
  | { kind: 'both'; add: LegalStructure[]; remove: LegalStructure[]; proposed: LegalStructure[] }

/**
 * Compare the page's structures with the row's.
 *
 * `deriveEquivalentStructures` is applied to BOTH SIDES before comparing, and
 * that symmetry is load-bearing in both directions:
 *
 *   only the page   every UK-wide fund whose page says "registered charities"
 *                   would read as contradicting a row correctly tagged with all
 *                   three charity forms, and the engine would spend its output
 *                   proposing we delete correct data.
 *   only the row    the same fund would generate an endless "add cio and scio"
 *                   proposal on every single read, for a difference the write
 *                   boundary already resolves on its own — `mergeGrantUpdate`
 *                   runs the same derivation before it writes.
 *
 * So derivation decides whether a difference is REAL. The proposal is then built
 * from the RAW row, so it stays minimal and the write boundary re-derives.
 *
 * `excludedForms` are structures the page positively rules out.
 *
 * `exhaustive` is the second and narrower route to a removal, and it exists
 * because of a false confirmation found on a live row. The Joseph Rank Trust
 * page says the trustees "can only consider applications from registered
 * charities as registered with the Charity Commission of England and Wales";
 * our row carries `scio`, which a Scottish charity holds and which that
 * regulator does not register. The engine CONFIRMED it, because "the page did
 * not mention SCIOs" is silence under the default rule — and a confirmation
 * under an error is worse than no evidence at all, which is the whole reason
 * this tranche was reordered.
 *
 * So when the page presents its list as the complete set of who may apply, forms
 * we hold that are not in it become removal candidates. `exhaustive` defaults to
 * false: the silence rule still governs everything else.
 */
export function compareStructures(opts: {
  pageStructures: LegalStructure[]
  rowStructures:  readonly string[] | null | undefined
  excludedForms:  LegalStructure[]
  geoText:        string | null
  eligText:       string | null
  /** Does the page present its list as the COMPLETE set of who may apply? */
  exhaustive?:    boolean
}): StructureVerdict {
  const { pageStructures, rowStructures, excludedForms, geoText, eligText } = opts

  const rawRow = Array.from(new Set((rowStructures ?? []) as LegalStructure[]))

  const page = new Set(deriveEquivalentStructures(pageStructures, geoText, eligText) as LegalStructure[])
  const row  = new Set(deriveEquivalentStructures(rawRow, geoText, eligText) as LegalStructure[])

  const add = Array.from(page).filter(s => !row.has(s)).sort()

  // Two routes to a removal, and no third. An explicit exclusion, or a page that
  // says its list is the whole list. A form the page simply did not mention is
  // silence, and silence is not exclusion.
  const remove = Array.from(new Set([
    ...excludedForms.filter(s => row.has(s)),
    ...(opts.exhaustive ? rawRow.filter(s => !page.has(s)) : []),
  ])).sort()

  if (add.length === 0 && remove.length === 0) return { kind: 'confirmed' }

  // Built from the RAW row, not the derived one: the write boundary derives
  // again, and a proposal that pre-expands would look like a bigger change than
  // it is on the review screen.
  const proposed = Array.from(new Set([...rawRow, ...add])).filter(s => !remove.includes(s)).sort()

  if (add.length > 0 && remove.length > 0) return { kind: 'both', add, remove, proposed }
  if (add.length > 0)                      return { kind: 'widens', add, proposed }
  return { kind: 'narrows', remove, proposed }
}

/**
 * Exclusions the page states that we do not already carry.
 *
 * Matching is loose on purpose — a funder writing "we do not fund individuals"
 * and a brief saying "does not fund individual applicants" are the same fact —
 * and a false "already known" is the cheap error here. The expensive one is
 * reporting a duplicate as new, over and over, on every read.
 *
 * Nothing is ever proposed for REMOVAL. Rule 6: exclusions stay complete on
 * every tier and every surface, because sending somebody to apply where they are
 * explicitly barred is a worse outcome than any other error this system makes.
 */
export function newExclusions(pageExclusions: string[], knownText: string | null): string[] {
  const known = (knownText ?? '').toLowerCase()
  if (!known) return pageExclusions

  return pageExclusions.filter(e => {
    // Content words only: "we do not fund" appears in almost every exclusion and
    // matching on it would mark everything as already known.
    const words = e.toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 4 && !STOP.has(w))
    if (words.length === 0) return true
    // Compared on a crude stem, because "we do not fund individuals" and "does
    // not fund individual applicants" are the same exclusion and an exact match
    // would report the second as new on every read forever.
    const hits = words.filter(w => known.includes(stem(w))).length
    return hits / words.length < 0.6
  })
}

/** Enough of a stem to survive a plural. Not linguistics, just plurals. */
function stem(w: string): string {
  return w.replace(/ies$/, 'y').replace(/(?<=.{4})e?s$/, '')
}

const STOP = new Set([
  'applications', 'application', 'applicants', 'applicant', 'organisation',
  'organisations', 'organization', 'organizations', 'funding', 'funded',
  'support', 'supported', 'projects', 'project', 'grants', 'grant', 'accept',
  'accepted', 'consider', 'considered', 'unable', 'cannot', 'normally',
  'generally', 'usually', 'towards', 'include', 'includes', 'including',
])

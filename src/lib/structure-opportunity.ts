import { computeMatchScore } from './matching'
import type { GrantOpportunity, Organisation, LegalStructure } from '@/types'

/**
 * What is this organisation's legal structure costing it?
 *
 * Legal structure is the single hardest gate in the catalogue. Most UK funders
 * will only take applications from a constituted body, and plenty go further
 * and name a specific form. An organisation on the wrong side of that gate does
 * not see a slightly shorter list, it sees almost nothing: ASP Belong, a real
 * cohort member at idea stage, came back ineligible on 614 of 639 live rows
 * while scoring BETTER than a comparable registered charity on theme fit.
 *
 * Counting is by ELIGIBILITY, not by match score. The question here is "what am
 * I allowed to apply to", which is a different question from "what suits me",
 * and mixing them produced a useless answer the first time round: by score, the
 * gap for ASP Belong read 0 against 7, and by eligibility it reads 25 against
 * 296. The second is the one that tells them what to do.
 *
 * Every count comes from the real matcher with one field changed, never from a
 * separate query, so a projection cannot drift from what the user actually sees
 * after they update their profile.
 */

/**
 * The structures an ORGANISATION can hold, with their labels.
 *
 * Mirrors the options offered on the profile and in the onboarding wizard.
 * `individual` is deliberately absent: it is grant-side only, describing a fund
 * whose applicant is a private person, and offering it here would invite an
 * organisation to describe itself as something it cannot be.
 */
export const ORG_LEGAL_STRUCTURES: { value: LegalStructure; label: string }[] = [
  { value: 'cic_guarantee',      label: 'CIC, limited by guarantee' },
  { value: 'cic_shares',         label: 'CIC, limited by shares' },
  { value: 'cio',                label: 'Charitable Incorporated Organisation' },
  { value: 'scio',               label: 'Scottish CIO' },
  { value: 'registered_charity', label: 'Registered charity' },
  { value: 'ltd_guarantee',      label: 'Ltd by guarantee' },
  { value: 'ltd_shares',         label: 'Ltd by shares' },
  { value: 'llp',                label: 'Limited Liability Partnership' },
  { value: 'cooperative',        label: 'Co-operative or Community Benefit Society' },
  { value: 'unincorporated',     label: 'Unincorporated association or community group' },
  { value: 'sole_trader',        label: 'Sole trader' },
  { value: 'not_registered',     label: 'Not yet registered' },
]

export const ORG_LEGAL_STRUCTURE_VALUES: LegalStructure[] = ORG_LEGAL_STRUCTURES.map(o => o.value)

export function structureLabel(v: LegalStructure | null | undefined): string {
  return ORG_LEGAL_STRUCTURES.find(o => o.value === v)?.label ?? String(v ?? 'Unknown')
}

export interface StructureCount {
  structure: LegalStructure
  /** Rows this structure could apply to, ignoring how well they score. */
  eligible: number
  /** True for the org's current structure. */
  current: boolean
}

/** Counts rows the org is not barred from, for one hypothetical structure. */
function countEligible(grants: GrantOpportunity[], org: Organisation): number {
  let n = 0
  for (const g of grants) {
    try {
      if (computeMatchScore(g, org).eligibilityStatus !== 'ineligible') n++
    } catch {
      // A row the matcher cannot read should not silently inflate or deflate
      // the comparison. Skipping keeps every structure counted over the same
      // rows, which is what makes them comparable.
    }
  }
  return n
}

/**
 * Eligible-row counts for the org as it is, and as it would be under each of
 * the given structures. Sorted most-open first, with the current structure
 * flagged rather than removed so the comparison has a baseline.
 */
export function countEligibleByStructure(
  grants: GrantOpportunity[],
  org: Organisation,
  structures: LegalStructure[],
): StructureCount[] {
  const current = (org.legal_structure ?? null) as LegalStructure | null
  return structures
    .map(structure => ({
      structure,
      eligible: countEligible(grants, { ...org, legal_structure: structure } as Organisation),
      current: structure === current,
    }))
    .sort((a, b) => b.eligible - a.eligible)
}

/**
 * Is this org's structure worth telling them about?
 *
 * Only when another structure would open MATERIALLY more — a couple of extra
 * rows is noise, and nagging a registered charity about becoming a CIO would be
 * worse than saying nothing. The threshold is deliberately high: this notice
 * asks somebody to change their legal form, so it should only appear when the
 * gap is large enough to be worth the trouble.
 */
export function structureIsLimiting(counts: StructureCount[]): boolean {
  const current = counts.find(c => c.current)
  if (!current) return false
  const best = counts[0]
  if (!best || best.current) return false
  return best.eligible >= current.eligible * 2 && best.eligible - current.eligible >= 25
}

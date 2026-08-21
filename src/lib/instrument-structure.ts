// Can this organisation legally accept this financial instrument?
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS IS NOT THE eligible_structures GATE
//
// `matching.ts` already has a structure gate, and it is deliberately soft: it
// caps the score at 4 with a floor of 1 and leaves the row visible, because the
// standing rule in that file is that a row is de-ranked rather than made to
// disappear. That is right for a grant whose eligibility list is a classifier's
// best reading of a vague page. A fundraiser who can see a capped row can
// disagree with us; one who cannot see it has no way to know we were wrong.
//
// Equity is a different question, and softness is the wrong answer to it. A
// company limited by guarantee has no share capital. A CIO has no share
// capital. Neither can issue equity to an investor, however well the sector,
// geography and mission line up, and no amount of funder goodwill changes it.
// The failure here is not a wasted application, it is a fundraiser being shown
// something structured as advice that is legally impossible for them, which is
// the category CLAUDE.md rule 6 exists to keep out of the product.
//
// So this file answers a narrower question than the structures gate and answers
// it harder. The structures list says who the FUNDER will consider. This says
// what the LAW permits. They are independent, and the second one is knowable
// without reading the funder's page at all, which is exactly why it can be
// deterministic code rather than model judgement.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT IT DELIBERATELY DOES NOT COVER
//
// The temptation is to encode every instrument-to-structure rule in UK social
// finance. Most of them are not clean, and a false block is its own harm: it
// hides funding from someone who could have taken it, and it hides it silently,
// which is the failure mode `feedback_filter_vs_rank_silent_exclusion` names.
//
// Three exclusions are load-bearing:
//
//   quasi_equity   NOT blocked. Revenue participation agreements were invented
//                  precisely so that asset-locked organisations who cannot issue
//                  shares can still take risk capital. Blocking it would remove
//                  the one repayable instrument built for our core audience.
//   community_shares  WARNING, not blocker. Withdrawable share capital can only
//                  be issued by a co-operative or community benefit society, so
//                  the rule is real, but our live rows in this space are
//                  platforms and support funds rather than single offers, and
//                  the subtype is not yet reliable enough to block on. Warn,
//                  and revisit when the data is worth trusting.
//   llp            NOT in the barred set. An LLP has no share capital, but
//                  investors routinely take equity-equivalent positions as
//                  members. The clean legal answer does not match the practice,
//                  so this stays out until someone has a real case.
//
// The floor rule from CLAUDE.md applies: if the instrument is not one we are
// certain about, this returns null and the row is judged on everything else.

import type { LegalStructure } from '@/types'

/**
 * Instruments that can only be issued by an entity with share capital.
 *
 * `convertible` is here because a conversion right is void against an entity
 * that can never issue the shares it would convert into. The instrument is not
 * merely unattractive to a CIO, it cannot complete.
 */
const SHARE_CAPITAL_INSTRUMENTS: ReadonlySet<string> = new Set([
  'equity',
  'convertible',
])

/**
 * Structures with no share capital, and so no ability to issue equity.
 *
 * Companies limited by guarantee (`ltd_guarantee`, `cic_guarantee`, and the
 * `registered_charity` form, which is a company limited by guarantee) have
 * members rather than shareholders. CIOs and SCIOs are their own incorporated
 * form with no shares at all. The remainder are either not a body corporate
 * (`unincorporated`, `sole_trader`, `individual`) or not yet an entity
 * (`not_registered`), so there is nothing to issue shares in.
 *
 * `cooperative` is absent on purpose: co-operative and community benefit
 * societies issue withdrawable share capital, which is the whole basis of
 * community shares.
 */
const STRUCTURES_WITHOUT_SHARE_CAPITAL: ReadonlySet<LegalStructure> = new Set<LegalStructure>([
  'ltd_guarantee',
  'cic_guarantee',
  'registered_charity',
  'cio',
  'scio',
  'unincorporated',
  'sole_trader',
  'not_registered',
  'individual',
])

/** Instruments only a co-operative or community benefit society can issue. */
const SOCIETY_ONLY_INSTRUMENTS: ReadonlySet<string> = new Set(['community_shares'])

/** The one structure that can issue withdrawable share capital. */
const SOCIETY_STRUCTURES: ReadonlySet<LegalStructure> = new Set<LegalStructure>(['cooperative'])

export type InstrumentIssueCode =
  | 'instrument_requires_share_capital'
  | 'instrument_requires_society'

export type InstrumentIssue = {
  code: InstrumentIssueCode
  severity: 'blocker' | 'warning'
  message: string
}

function normalise(v: string | null | undefined): string {
  return (v ?? '').toLowerCase().trim()
}

/** Does this instrument require the applicant to be able to issue shares? */
export function instrumentRequiresShareCapital(instrument: string | null | undefined): boolean {
  return SHARE_CAPITAL_INSTRUMENTS.has(normalise(instrument))
}

/** Can this legal structure hold share capital at all? */
export function structureCanHoldShareCapital(structure: string | null | undefined): boolean {
  const s = normalise(structure)
  if (!s) return true  // unknown structure is not a finding, see the floor rule
  return !STRUCTURES_WITHOUT_SHARE_CAPITAL.has(s as LegalStructure)
}

/**
 * Which of these structures are barred from this instrument.
 *
 * Used by the row-level data check as well as the per-org gate: an opportunity
 * whose own `eligible_structures` list contains a structure that cannot hold
 * the instrument is stating something impossible, regardless of who is looking
 * at it. Returns an empty array when the instrument is not one we gate on, so
 * callers can treat a non-empty result as a finding without checking twice.
 */
export function barredStructuresFor(
  instrument: string | null | undefined,
  structures: readonly string[] | null | undefined,
): string[] {
  if (!instrumentRequiresShareCapital(instrument)) return []
  if (!Array.isArray(structures)) return []
  return structures.filter(s => !structureCanHoldShareCapital(s))
}

/**
 * The per-organisation gate.
 *
 * Returns null when there is nothing to say, which is the common case. The
 * caller decides what a blocker means on its surface; this function decides
 * only whether the combination is possible.
 *
 * `instrument` accepts either `funding_subtype` or `si_instrument_type` because
 * both columns carry an instrument today and they do not agree with each other.
 * Callers should pass both, in that order of preference.
 */
export function checkInstrumentAgainstStructure(
  instrument: string | null | undefined,
  structure: string | null | undefined,
): InstrumentIssue | null {
  const s = normalise(structure)
  if (!s) return null  // no structure on the profile, nothing to decide

  if (instrumentRequiresShareCapital(instrument) && !structureCanHoldShareCapital(s)) {
    return {
      code: 'instrument_requires_share_capital',
      severity: 'blocker',
      message: `${labelFor(s)} has no share capital, so it cannot issue equity. This investment is not open to your organisation whatever the funder's eligibility list says.`,
    }
  }

  if (SOCIETY_ONLY_INSTRUMENTS.has(normalise(instrument)) && !SOCIETY_STRUCTURES.has(s as LegalStructure)) {
    return {
      code: 'instrument_requires_society',
      severity: 'warning',
      message: `Community shares can normally only be issued by a co-operative or community benefit society. Check whether ${labelFor(s)} qualifies before spending time on this.`,
    }
  }

  return null
}

/** Structure labels for the messages above. Kept local so this module stays
 *  free of imports that would drag the matcher in. */
function labelFor(structure: string): string {
  const labels: Record<string, string> = {
    cic_guarantee:      'A CIC limited by guarantee',
    cic_shares:         'A CIC limited by shares',
    cio:                'A CIO',
    scio:               'A SCIO',
    registered_charity: 'A registered charity',
    ltd_guarantee:      'A company limited by guarantee',
    ltd_shares:         'A company limited by shares',
    llp:                'An LLP',
    cooperative:        'A co-operative or community benefit society',
    unincorporated:     'An unincorporated association',
    sole_trader:        'A sole trader',
    not_registered:     'An unregistered organisation',
    individual:         'An individual',
  }
  return labels[structure] ?? 'Your organisation'
}

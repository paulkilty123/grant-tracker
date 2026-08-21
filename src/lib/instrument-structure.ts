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
//   community_shares  WARNING, not blocker, and only when it is the row's whole
//                  offer. Withdrawable share capital can only be issued by a
//                  co-operative or community benefit society, so the rule is
//                  real, but our live rows in this space are platforms and
//                  support funds rather than single offers, and the subtype is
//                  not yet reliable enough to block on.
//   llp            NOT in the barred set. An LLP has no share capital, but
//                  investors routinely take equity-equivalent positions as
//                  members. The clean legal answer does not match the practice,
//                  so this stays out until someone has a real case.
//
// The floor rule from CLAUDE.md applies: if the instrument is not one we are
// certain about, this returns null and the row is judged on everything else.
//
// ─────────────────────────────────────────────────────────────────────────────
// A ROW CAN OFFER MORE THAN ONE INSTRUMENT, AND THAT CHANGES THE ANSWER
//
// Migration 065 made `funding_subtypes` (plural) the source of truth and left
// `funding_subtype` as a trigger-maintained copy of its FIRST element. Reading
// the singular therefore reads one instrument off a row that may offer four,
// and the first slot is arbitrary.
//
// That is not a tidiness point. Trust for London's Social Investment Programme
// is ['loan','equity','social_investment'] and the Growth Impact Fund is
// ['loan','equity','revenue_share','social_investment']. Both are live, both
// list charities and CIOs as eligible, and both are RIGHT to: a charity cannot
// take the equity and can absolutely take the loan. A gate reading only the
// first element would have missed them entirely; a gate reading the array and
// blocking on any equity would have hidden two perfectly good loan funds from
// every charity in the catalogue.
//
// So the rule is all-or-nothing, the same shape as the individual-applicant cap
// in matching.ts: only a row where EVERY instrument needs share capital is
// closed to a body that has none. A row with one reachable instrument stays
// open, and the unreachable part is surfaced as information rather than acted
// on.

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
  | 'instrument_partly_out_of_reach'

export type InstrumentIssue = {
  code: InstrumentIssueCode
  severity: 'blocker' | 'warning' | 'info'
  message: string
}

function normalise(v: string | null | undefined): string {
  return (v ?? '').toLowerCase().trim()
}

/**
 * Every instrument a row offers, lowercased and deduped.
 *
 * Takes the plural column first and the singular only as a fallback, which is
 * the precedence migration 065 established. Callers pass both because the
 * fallback matters: 462 rows of 1,924 have the array populated, so the singular
 * is still the only instrument most of the catalogue states.
 */
export function instrumentsOf(
  instruments: readonly string[] | null | undefined,
  fallback?: string | null,
): string[] {
  const fromArray = Array.isArray(instruments)
    ? instruments.map(normalise).filter(Boolean)
    : []
  if (fromArray.length > 0) return Array.from(new Set(fromArray))
  const single = normalise(fallback)
  return single ? [single] : []
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
 * Which of these structures the row's own eligibility list should not contain.
 *
 * A row-level data check rather than a per-org one: an opportunity offering
 * NOTHING BUT equity while listing a CIO as eligible is stating something
 * impossible, and it is wrong for every reader, not just the one looking now.
 *
 * Mirrors the gate's all-or-nothing rule deliberately. Trust for London lists
 * charities and offers loans alongside its equity, and that row is correct;
 * flagging it would send a reviewer to "fix" accurate data, which is how a
 * check earns its way into being ignored.
 */
export function barredStructuresFor(
  instruments: readonly string[] | null | undefined,
  structures: readonly string[] | null | undefined,
  fallbackInstrument?: string | null,
): string[] {
  const list = instrumentsOf(instruments, fallbackInstrument)
  if (list.length === 0 || !list.every(instrumentRequiresShareCapital)) return []
  if (!Array.isArray(structures)) return []
  return structures.filter(s => !structureCanHoldShareCapital(s))
}

/**
 * The per-organisation gate.
 *
 * Returns null when there is nothing to say, which is the common case. The
 * caller decides what a blocker means on its surface; this function decides
 * only whether the combination is possible.
 */
export function checkInstrumentAgainstStructure(
  instruments: readonly string[] | null | undefined,
  structure: string | null | undefined,
  fallbackInstrument?: string | null,
): InstrumentIssue | null {
  const s = normalise(structure)
  if (!s) return null  // no structure on the profile, nothing to decide

  const list = instrumentsOf(instruments, fallbackInstrument)
  if (list.length === 0) return null

  // -- Share capital ---------------------------------------------------------
  if (!structureCanHoldShareCapital(s)) {
    const needShares = list.filter(instrumentRequiresShareCapital)
    if (needShares.length > 0 && needShares.length === list.length) {
      return {
        code: 'instrument_requires_share_capital',
        severity: 'blocker',
        message: `${labelFor(s)} has no share capital, so it cannot issue equity. This investment is not open to your organisation whatever the funder's eligibility list says.`,
      }
    }
    if (needShares.length > 0) {
      // Partly reachable, so it must not change the verdict. The fund is
      // genuinely open via its other instruments and burying it would cost the
      // fundraiser a real option; naming the part they cannot reach costs them
      // nothing and saves a conversation.
      const reachable = list.filter(i => !instrumentRequiresShareCapital(i))
      return {
        code: 'instrument_partly_out_of_reach',
        severity: 'info',
        message: `This funder also offers equity, which ${lowerLabelFor(s)} cannot issue. The ${humanList(reachable)} side is still open to you.`,
      }
    }
  }

  // -- Withdrawable share capital --------------------------------------------
  // Only when community shares are the WHOLE offer. Our live rows in this space
  // are platforms and support funds rather than single offers, so this stays a
  // warning even at full strength.
  if (list.every(i => SOCIETY_ONLY_INSTRUMENTS.has(i)) && !SOCIETY_STRUCTURES.has(s as LegalStructure)) {
    return {
      code: 'instrument_requires_society',
      severity: 'warning',
      message: `Community shares can normally only be issued by a co-operative or community benefit society. Check whether ${lowerLabelFor(s)} qualifies before spending time on this.`,
    }
  }

  return null
}

/** Structure labels for the messages above. Kept local so this module stays
 *  free of imports that would drag the matcher in. */
const STRUCTURE_LABELS: Record<string, string> = {
  cic_guarantee:      'a CIC limited by guarantee',
  cic_shares:         'a CIC limited by shares',
  cio:                'a CIO',
  scio:               'a SCIO',
  registered_charity: 'a registered charity',
  ltd_guarantee:      'a company limited by guarantee',
  ltd_shares:         'a company limited by shares',
  llp:                'an LLP',
  cooperative:        'a co-operative or community benefit society',
  unincorporated:     'an unincorporated association',
  sole_trader:        'a sole trader',
  not_registered:     'an unregistered organisation',
  individual:         'an individual',
}

function lowerLabelFor(structure: string): string {
  return STRUCTURE_LABELS[structure] ?? 'your organisation'
}

function labelFor(structure: string): string {
  const l = lowerLabelFor(structure)
  return l.charAt(0).toUpperCase() + l.slice(1)
}

/** "loan and social investment", "loan, revenue share and social investment". */
function humanList(items: string[]): string {
  const words = items.map(i => i.replace(/_/g, ' '))
  if (words.length <= 1) return words[0] ?? ''
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

import type { Organisation, GrantOpportunity, LegalStructure } from '@/types'
import { INCOME_MIDPOINTS } from '@/lib/matching'

/* ═══════════════════════════════════════════════════════════════════════════
   "Just outside your profile" — the two tests a row must pass.

   The section shipped once with a Scotland-only fund and a Northern Ireland
   fund offered to an organisation in Ealing. Both were correctly ruled out,
   both named their reason, both invited the reader to check, and both were
   useless: no amount of checking makes Ealing be in Scotland.

   "We ruled it out and here is why" is NOT the same claim as "this is nearly
   relevant". Every rejected opportunity has a reason; only a few are near.

   So a row must pass BOTH:
     1. PROXIMITY    — a computable sense in which the org is close to
                       qualifying.
     2. ACTIONABILITY — something the reader knows, or could change, could move
                       them across the line.

   A row failing either is dropped. Not softened, not caveated — dropped. Zero
   near misses is a normal outcome and the section simply does not appear.
   ═══════════════════════════════════════════════════════════════════════════ */

export type NearMissDimension = 'structure' | 'amount' | 'income'

export interface NearMiss {
  dimension: NearMissDimension
  /** "Ruled out on legal structure." */
  verdict: string
  /** The funder's rule and where the reader sits against it. */
  rule: string
  /** What would move them across the line. Never a hedge. */
  condition: string
}

/**
 * Adjacent legal structures.
 *
 * The vocabulary is clean and closed, so this is a lookup and not a heuristic.
 * Adjacency means "the same underlying form, differing in a way a funder may
 * not have thought about" — not "similar sounding".
 *
 * `individual` and `sole_trader` are adjacent to NOTHING organisational. A
 * person cannot become an organisation to satisfy a funder, so there is
 * nothing to check and nothing to hand back.
 */
const ADJACENT: Partial<Record<LegalStructure, LegalStructure[]>> = {
  // cic_guarantee → ltd_guarantee is NOT here any more, and its absence is the
  // point: a CIC limited by guarantee IS a company limited by guarantee, so
  // eligibility.ts now matches it outright. It was appearing as a near miss
  // for funds that simply accept it.
  //
  // The reverse stays, because containment runs one way. A plain company
  // limited by guarantee is genuinely one step from a CIC-only fund — the step
  // being CIC registration.
  cic_guarantee:      ['cic_shares'],
  cic_shares:         ['cic_guarantee'],
  ltd_guarantee:      ['cic_guarantee'],
  ltd_shares:         ['cic_shares'],
  unincorporated:     ['cio'],
  cio:                ['unincorporated', 'registered_charity', 'scio'],
  registered_charity: ['cio'],
  scio:               ['cio'],
}

function isAdjacent(a: LegalStructure, b: LegalStructure): boolean {
  return (ADJACENT[a] ?? []).includes(b)
}

/** Reader-facing structure names. Plural, because they describe a category. */
const PLURAL: Partial<Record<LegalStructure, string>> = {
  cic_guarantee:      'CICs limited by guarantee',
  cic_shares:         'CICs limited by shares',
  cio:                'CIOs',
  scio:               'Scottish CIOs',
  registered_charity: 'registered charities',
  ltd_guarantee:      'companies limited by guarantee',
  ltd_shares:         'companies limited by shares',
  llp:                'LLPs',
  cooperative:        'co-operatives',
  unincorporated:     'unincorporated groups',
}
const SINGULAR: Partial<Record<LegalStructure, string>> = {
  cic_guarantee:      'a CIC limited by guarantee',
  cic_shares:         'a CIC limited by shares',
  cio:                'a CIO',
  scio:               'a Scottish CIO',
  registered_charity: 'a registered charity',
  ltd_guarantee:      'a company limited by guarantee',
  ltd_shares:         'a company limited by shares',
  llp:                'an LLP',
  cooperative:        'a co-operative',
  unincorporated:     'an unincorporated group',
}

const list = (items: string[]): string =>
  items.length <= 1 ? (items[0] ?? '')
  : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

const money = (n: number): string =>
  n >= 1000 && n % 1000 === 0 ? `£${(n / 1000).toLocaleString()}k` : `£${n.toLocaleString()}`

/**
 * The meta line: "Network for Social Change · £25k – £100k" or
 * "Trading for Good · £1k – £4k · England".
 */
export function nearMissMeta(grant: GrantOpportunity, locationTag: string | null): string {
  const parts: string[] = [grant.funder]
  const min = grant.amountMin || null
  const max = grant.amountMax || null
  if (min && max) parts.push(`${money(min)} – ${money(max)}`)
  else if (max)   parts.push(`up to ${money(max)}`)
  else if (min)   parts.push(`from ${money(min)}`)
  // "Global" is a scope, not a place, and reads as noise beside a funder name.
  if (locationTag && locationTag.toLowerCase() !== 'global') parts.push(locationTag)
  return parts.join(' · ')
}

export interface NearMissInput {
  grant: GrantOpportunity
  org: Organisation
  /** Where our record of the eligibility rule was last read. */
  readOn: string | null
  /** True when nothing except this dimension stands in the way. */
  otherwiseFits: boolean
}

/**
 * The one dimension on which this row is near, or null.
 *
 * Ordered by how much the reader can do about it. Area is ABSENT and stays
 * absent — see the note at the foot of this file.
 */
export function findNearMiss({ grant, org, readOn, otherwiseFits }: NearMissInput): NearMiss | null {
  const provenance = readOn
    ? `We read that from their page on ${readOn}.`
    : 'That is our reading of their page.'

  /* ── 1. Legal structure ────────────────────────────────────────────────
     Near when the org's form is ADJACENT to one the funder accepts. A CIC
     limited by guarantee against a fund open to companies limited by
     guarantee is the same company form with CIC status on top — a funder who
     wrote the rule that way has very often not considered CICs at all, which
     is exactly the thing the reader can raise and we cannot. */
  const allowed = grant.eligibleStructures ?? []
  const mine = org.legal_structure
  if (mine && allowed.length && !allowed.includes(mine)) {
    const near = allowed.filter(a => isAdjacent(mine, a))
    if (near.length) {
      const theyFund = list(near.map(a => PLURAL[a] ?? a))
      const youAre = SINGULAR[mine] ?? mine
      return {
        dimension: 'structure',
        verdict: 'Ruled out on legal structure.',
        rule: `They fund ${theyFund}. You are ${youAre}, which is one step away.`,
        condition: `${provenance} If they would count a form this close, it is worth asking.`,
      }
    }
  }

  /* ── 2. Amount ─────────────────────────────────────────────────────────
     Near when the funder's range sits JUST outside the range the org said it
     needs. A project can often be scaled, and the reader is the only one who
     knows whether a smaller grant would still be useful. */
  const wantMin = org.min_grant_target ?? null
  const wantMax = org.max_grant_target ?? null
  const givesMax = grant.amountMax || null
  const givesMin = grant.amountMin || null

  if (wantMin && givesMax && givesMax < wantMin) {
    // Half is the floor for "near". Below that it is not a smaller grant, it
    // is a different kind of thing.
    if (givesMax >= wantMin * 0.5) {
      return {
        dimension: 'amount',
        verdict: 'Ruled out on amount.',
        rule: `They give up to £${givesMax.toLocaleString()}. You told us you are looking for £${wantMin.toLocaleString()} or more.`,
        condition: otherwiseFits
          ? 'Everything else fits. If a smaller grant would still be useful, this one is open to you.'
          : 'If a smaller grant would still be useful, it is worth a look.',
      }
    }
  }

  if (wantMax && givesMin && givesMin > wantMax) {
    if (givesMin <= wantMax * 2) {
      return {
        dimension: 'amount',
        verdict: 'Ruled out on amount.',
        rule: `They start at £${givesMin.toLocaleString()}. You told us you are looking for up to £${wantMax.toLocaleString()}.`,
        condition: otherwiseFits
          ? 'Everything else fits. If the project could be scaled up, this one is open to you.'
          : 'If the project could be scaled up, it is worth a look.',
      }
    }
  }

  /* ── 3. Organisation income ────────────────────────────────────────────
     Near when the org sits within one band of the funder's ceiling or floor.
     Income bands are self-reported and approximate, and a funder's cap is
     usually a guide rather than an audit. */
  const mid = org.annual_income_band ? INCOME_MIDPOINTS[org.annual_income_band] ?? null : null
  const g = grant as unknown as Record<string, unknown>
  const cap   = typeof g.maxOrgIncome === 'number' ? g.maxOrgIncome : null
  const floor = typeof g.minOrgIncome === 'number' ? g.minOrgIncome : null

  if (mid && cap && mid > cap && mid <= cap * 2) {
    return {
      dimension: 'income',
      verdict: 'Ruled out on size.',
      rule: `They fund organisations under £${cap.toLocaleString()}. You told us you are in the ${org.annual_income_band} band.`,
      condition: otherwiseFits
        ? 'Everything else fits, and income bands are approximate. If yours is nearer the cap than the band suggests, it is worth asking.'
        : 'Income bands are approximate. If yours is nearer the cap than the band suggests, it is worth asking.',
    }
  }
  if (mid && floor && mid < floor && mid >= floor * 0.5) {
    return {
      dimension: 'income',
      verdict: 'Ruled out on size.',
      rule: `They fund organisations over £${floor.toLocaleString()}. You told us you are in the ${org.annual_income_band} band.`,
      condition: otherwiseFits
        ? 'Everything else fits, and income bands are approximate. If yours is nearer the floor than the band suggests, it is worth asking.'
        : 'Income bands are approximate. If yours is nearer the floor than the band suggests, it is worth asking.',
    }
  }

  return null
}

/* ═══════════════════════════════════════════════════════════════════════════
   AREA IS DELIBERATELY ABSENT, and must stay absent until the data changes.

   `geographic_scope` has seven values — uk, regional, england, scotland,
   london, northern_ireland, wales — and every sub-national fund lands in
   `regional` with a free-text `location_tag` ("Hackney", "Tyne & Wear,
   Northumberland", "Tyne & Wear and Northumberland"). `primary_location` on
   the org is free text too: ACC's is "Ealing, London".

   So the only area comparison the data supports is nation and region level,
   which is exactly the comparison that produced "a Scotland-only fund is
   nearly relevant to Ealing". The one comparison worth making — is this an
   adjacent borough — is the one that cannot be computed.

   To switch it back on, all three of these must exist:
     - a normalised local-authority or borough code on BOTH sides, with
       location_tag deduplicated (the same place is spelled several ways)
     - an adjacency map for London boroughs and a containment rule for regions
     - the rule: same borough → match; adjacent borough, or a region containing
       the org with a stated sub-preference → near; everything else → excluded,
       including every other UK nation.

   A near-miss section that is sometimes empty is fine. One that says a
   Scottish fund is nearly relevant to Ealing is not.
   ═══════════════════════════════════════════════════════════════════════════ */

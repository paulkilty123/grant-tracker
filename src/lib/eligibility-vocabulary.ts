/**
 * The everyday words funders use for who may apply, mapped to legal forms.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Funders almost never write "company limited by guarantee". They write
 * "not-for-profit organisations", "community groups", "VCSOs", "the third
 * sector". Our reader only credited a legal form when the form was NAMED, so
 * every one of those pages read as "silent on structure" and the model's tight
 * default stripped the row back to charity-only.
 *
 * Measured 2026-07-26 across the 22 rows a re-read had narrowed and nobody
 * could settle: 10 of them DO state who can apply, in exactly this everyday
 * register. Only 1 needed a second page. The bottleneck was never page depth,
 * it was vocabulary.
 *
 * A wrongly charity-only row is the damaging direction: it silently hides the
 * fund from the CIC or co-op that could have won it, and the user just sees
 * fewer matches with nothing to appeal.
 *
 * ONE TABLE, TWO CONSUMERS
 * ------------------------
 * classify.ts has been bitten repeatedly by the same shape of bug — a mapping
 * written into the CLASSIFIER PROMPT (which steers the model) and never
 * promoted to the deterministic backstop (which guarantees the floor), so when
 * the model drifted nothing caught it. Its own comments record three separate
 * instances. So this table is the single source: `vocabularyPromptTable()`
 * renders it into the prompt, `structuresFromVocabulary()` applies it as the
 * backstop. They cannot disagree, because adding a row changes both.
 *
 * DELIBERATELY NOT HERE
 * ---------------------
 * - `cio` / `scio` are decided by geography, never by vocabulary. A CIO is an
 *   England-and-Wales form and a SCIO is Scottish; tagging either outside its
 *   jurisdiction surfaces a fund to organisations that cannot legally apply.
 *   charityFormJurisdiction() in classify.ts owns that call.
 * - "charitable organisation" does NOT appear below. It reads as a synonym for
 *   "registered charity" at least as often as it reads as "an organisation with
 *   charitable purpose", and guessing wide on an ambiguous phrase is the
 *   over-crediting failure this whole change is supposed to avoid.
 * - Exclusions ("CICs cannot apply", "registered charities only") are not this
 *   table's job. classify.ts checks its negative cues BEFORE consulting the
 *   vocabulary and returns early, so a phrase here can never override a funder
 *   who has said no.
 */

export interface VocabularyEntry {
  /** How a funder would actually write it — the label shown in the prompt. */
  readonly phrase: string
  /** Matched against lower-cased source text. */
  readonly pattern: RegExp
  /** Legal forms this phrase admits. Never `cio`/`scio` (see file header). */
  readonly adds: readonly string[]
  /** The reasoning, so the model applies the rule rather than memorising it. */
  readonly because: string
}

/** Forms that are always a not-for-profit sector organisation's likely shape. */
const NON_PROFIT_BODIES = ['ltd_guarantee', 'cic_guarantee', 'cooperative'] as const

export const ELIGIBILITY_VOCABULARY: readonly VocabularyEntry[] = [
  {
    phrase: 'CICs / community interest companies',
    pattern: /\bcics?\b|community interest compan/,
    adds: ['cic_guarantee', 'cic_shares'],
    because: 'A CIC may be limited by guarantee or by shares and the funder rarely says which, so naming CICs admits both.',
  },
  {
    phrase: 'social enterprises',
    pattern: /social enterprise/,
    adds: ['cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative'],
    because: 'Social enterprise is a purpose, not a legal form. It is carried by CICs, companies limited by guarantee and co-operatives alike.',
  },
  {
    // GAP FOUND 2026-07-26: the backstop reached `cooperative` only through the
    // "social enterprise" rule, so a fund naming co-ops outright and never using
    // that phrase got nothing. `cooperative` was already the most-removed value
    // in the catalogue.
    phrase: 'co-operatives / community benefit societies',
    pattern: /co-?operatives?\b|community benefit societ|\bbencom\b|industrial and provident/,
    adds: ['cooperative'],
    because: 'Named outright, and not always alongside the phrase "social enterprise".',
  },
  {
    // WIDENED 2026-07-26: previously added `ltd_guarantee` alone. A CIC limited
    // by guarantee is the textbook modern not-for-profit, and a community
    // benefit society is one of the oldest. Excluding them made "not-for-profit"
    // narrower than "social enterprise", which is backwards.
    phrase: 'not-for-profit / non-profit / third sector',
    pattern: /\bnot[- ]for[- ]profit\b|\bnon[- ]?profit\b|\bthird sector\b/,
    adds: [...NON_PROFIT_BODIES],
    because: 'These name the sector, not a form. Every standard non-profit body sits inside them.',
  },
  {
    // GAP FOUND 2026-07-26: `\bvcse?\b` missed VCSO and VCFSE, and the
    // spelt-out "voluntary and community sector" never matched at all because
    // the pattern required "voluntary" to be followed immediately by the noun.
    // Camden Giving's page says "constituted voluntary and community sector
    // organisations (VCSOs)" and we read nothing from it.
    phrase: 'voluntary and community sector / VCS / VCSE / VCSO',
    pattern: /\bvc[fs]?se?o?s?\b|voluntary(?:,| and|\/)? (?:and )?community(?:,? and social enterprise)? sector|\bvoluntary (?:organisation|sector|group|body|association)s?\b/,
    adds: [...NON_PROFIT_BODIES],
    because: 'The sector\'s own collective name for itself. It spans every non-profit form.',
  },
  {
    // WIDENED 2026-07-26: previously added `unincorporated` alone. Funders write
    // "community groups and organisations" as one phrase meaning the local
    // community sector, which is mostly small CLGs and CICs, not only
    // unconstituted groups.
    phrase: 'community groups and organisations',
    pattern: /\bcommunity (?:group|organisation|association|club|body|enterprise)s?\b/,
    adds: ['unincorporated', ...NON_PROFIT_BODIES],
    because: 'A catch-all for the local community sector. It covers unincorporated groups and small incorporated ones equally.',
  },
  {
    // The negative lookbehind is load-bearing. Groundwork's own applicant list
    // reads "Registered UK Charities, Charitable Incorporated Organisations,
    // Companies Limited by Guarantee, Not-for-Profit Registered Community
    // Interest Companies, Constituted Community Groups, or Voluntary Sector
    // Organisations", and its ONLY exclusion is "Unconstituted organisations".
    // Those two words differ by one prefix and mean opposite things; the
    // classifier had been reading the exclusion of UNconstituted groups as a
    // reason to drop `unincorporated` from CONSTITUTED ones.
    //
    // Noun list widened 2026-07-26 to reach "constituted non-profit", which is
    // how Camden Giving words its own requirement.
    phrase: 'constituted groups (NOT unconstituted)',
    pattern: /(?<!un)constituted\s+(?:community\s+|voluntary\s+|local\s+|non-?profit\s+|not-for-profit\s+)*(?:group|organisation|association|body|club|society|non-?profit)/,
    adds: ['unincorporated'],
    because: 'A governing document without incorporation. Note "unconstituted" means the reverse and is often the one exclusion a funder states.',
  },
  {
    phrase: 'limited companies',
    pattern: /\blimited compan|\bltd\b compan/,
    adds: ['ltd_guarantee', 'ltd_shares'],
    because: 'Said without qualification it covers both share and guarantee companies.',
  },
  {
    phrase: 'sole traders / freelancers / self-employed',
    pattern: /\bsole trader|\bfreelance|\bself-?employed/,
    adds: ['sole_trader'],
    because: 'A trading individual, distinct from an organisation.',
  },
]

/** Render the table for the classifier prompt so the model reasons as we do. */
export function vocabularyPromptTable(): string {
  return ELIGIBILITY_VOCABULARY
    .map(e => `"${e.phrase}"\n    -> [${e.adds.map(a => `"${a}"`).join(', ')}]\n    ${e.because}`)
    .join('\n')
}

/**
 * Everyday phrasing found in `text` -> the legal forms it admits.
 *
 * Pure and caller-agnostic: it neither knows about jurisdiction nor about
 * exclusions. classify.ts applies both around it.
 */
export function structuresFromVocabulary(text: string): { adds: string[]; matched: string[] } {
  const lower = text.toLowerCase()
  const adds: string[] = []
  const matched: string[] = []
  for (const entry of ELIGIBILITY_VOCABULARY) {
    if (!entry.pattern.test(lower)) continue
    matched.push(entry.phrase)
    for (const s of entry.adds) if (!adds.includes(s)) adds.push(s)
  }
  return { adds, matched }
}

import type { GrantOpportunity, Organisation, LegalStructure } from '@/types'

export interface MatchBreakdown {
  location:    { score: number; max: number; label: string }
  themes:      { score: number; max: number; label: string }
  grantSize:   { score: number; max: number; label: string }
  funderType:  { score: number; max: number; label: string }
  eligibility: { score: number; max: number; label: string }
}

export interface MatchResult {
  score:     number
  reason:    string
  breakdown: MatchBreakdown
}

// Map income bands to approximate midpoints
const INCOME_MIDPOINTS: Record<string, number> = {
  'Under £10,000':         5_000,
  '£10,000–£50,000':      30_000,
  '£50,000–£100,000':     75_000,
  '£100,000–£500,000':   300_000,
  'Over £500,000':        750_000,
}

// Ordered income bands lowest→highest for cap comparison
const INCOME_BAND_ORDER = [
  'Under £10,000',
  '£10,000–£50,000',
  '£50,000–£100,000',
  '£100,000–£500,000',
  'Over £500,000',
] as const

/**
 * Inverse-document-frequency weights per impact sector, derived from the live
 * grant catalogue (~300 grants).  Sectors that appear in fewer grants carry
 * more discriminative power — a match on "heritage" is far more meaningful
 * than a match on "community".
 *
 * Formula: normalised log(N / df) scaled to [0.2, 2.5].
 * Update these weights periodically as the catalogue grows.
 */
const SECTOR_IDF: Record<string, number> = {
  community:    0.2,   // 193 grants — nearly ubiquitous
  young_people: 0.5,   // 117 grants
  creative:     0.9,   //  64 grants
  health:       0.9,   //  62 grants
  education:    0.9,   //  61 grants
  employment:   1.0,   //  53 grants
  environment:  1.1,   //  43 grants
  tech:         1.1,   //  40 grants
  justice:      1.3,   //  28 grants
  mental_health: 1.4,  //  27 grants
  financial:    1.4,   //  26 grants
  disability:   1.5,   //  22 grants
  older_people: 1.6,   //  19 grants
  housing:      1.7,   //  16 grants
  sport:        1.8,   //  14 grants
  heritage:     2.0,   //   9 grants
  international: 2.2,  //   7 grants
  food:         2.3,   //   6 grants
  women:        2.5,   //   4 grants
}

/** IDF weight for a sector — falls back to 1.0 for unknown tags */
function idfWeight(sector: string): number {
  return SECTOR_IDF[sector] ?? 1.0
}

/**
 * Title-level domain keyword map.  Grant titles are very high-confidence
 * signals — "FA Foundation Grassroots Football Grants" is obviously sport
 * regardless of how its impact_sectors are tagged.  Used to fire
 * primaryDomainMismatch on the free-text path (where impact_sectors may
 * be absent) or as a cross-check on the structured path.
 */
const TITLE_DOMAIN_KEYWORDS: Array<{
  words: string[]
  sector: string
  orgTerms: string[]
}> = [
  {
    words: ['football', 'cricket', 'tennis', 'rugby', 'athletics', 'swimming',
            'cycling', 'basketball', 'netball', 'grassroots sport', 'physical activity'],
    sector: 'sport',
    orgTerms: ['sport'],
  },
  {
    words: ['environmental', 'conservation', 'climate', 'wildlife', 'biodiversity',
            'ecological', 'green spaces', 'rewilding', 'nature'],
    sector: 'environment',
    orgTerms: ['environment', 'environmental', 'conservation'],
  },
  {
    words: ['heritage', 'historic', 'archaeological', 'listed building'],
    sector: 'heritage',
    orgTerms: ['heritage', 'historic', 'museum'],
  },
  {
    words: ['overseas', 'international development', 'global south', 'developing world'],
    sector: 'international',
    orgTerms: ['international', 'overseas', 'global'],
  },
  {
    words: ['food bank', 'food poverty', 'food growing', 'agriculture', 'horticulture'],
    sector: 'food',
    orgTerms: ['food', 'agriculture', 'farming'],
  },
]

/**
 * English regions and counties used to detect regional grant restrictions from
 * grant titles even when is_local = false. E.g. "Fund (North)", "Yorkshire Grant".
 * Maps keyword → canonical region label shown in warning messages.
 */
const REGIONAL_KEYWORDS: Record<string, string> = {
  // Broad compass regions (bracket notation common in grant titles)
  '(north)': 'North of England', '(south)': 'South of England',
  '(east)': 'East of England',   '(west)': 'West of England',
  // Named regions
  'north east': 'North East England', 'north west': 'North West England',
  'yorkshire': 'Yorkshire', 'east midlands': 'East Midlands',
  'west midlands': 'West Midlands', 'east of england': 'East of England',
  'south east': 'South East England', 'south west': 'South West England',
  // Counties most likely to appear in grant titles
  'cornwall': 'Cornwall', 'devon': 'Devon', 'somerset': 'Somerset',
  'dorset': 'Dorset', 'kent': 'Kent', 'sussex': 'Sussex', 'surrey': 'Surrey',
  'suffolk': 'Suffolk', 'norfolk': 'Norfolk', 'essex': 'Essex',
  'oxfordshire': 'Oxfordshire', 'gloucestershire': 'Gloucestershire',
  'shropshire': 'Shropshire', 'lancashire': 'Lancashire',
  'cumbria': 'Cumbria', 'durham': 'Durham', 'northumberland': 'Northumberland',
  'merseyside': 'Merseyside', 'greater manchester': 'Greater Manchester',
  'tyne and wear': 'Tyne & Wear', 'cheshire': 'Cheshire',
  // Devolved nations — already handled elsewhere but belt-and-braces
  'scotland': 'Scotland', 'wales': 'Wales', 'northern ireland': 'Northern Ireland',
}

/**
 * London borough names used for borough-level geographic restriction detection.
 * When a grant text or eligibility criteria mentions one of these and it does NOT
 * match the org's city, the grant is likely restricted to that specific borough.
 */
const LONDON_BOROUGHS = [
  'lambeth', 'southwark', 'lewisham', 'greenwich', 'bexley', 'bromley',
  'croydon', 'merton', 'sutton', 'kingston', 'richmond', 'wandsworth',
  'hammersmith', 'fulham', 'kensington', 'chelsea', 'westminster', 'camden',
  'islington', 'hackney', 'tower hamlets', 'newham', 'barking', 'dagenham',
  'havering', 'redbridge', 'waltham forest', 'haringey', 'enfield', 'barnet',
  'harrow', 'brent', 'ealing', 'hounslow', 'hillingdon',
]

/**
 * Parse a pound amount from text (handles £10k, £50,000, £100 000 etc.)
 * Returns the numeric value, or null if not parseable.
 */
function parsePoundAmount(raw: string): number | null {
  const s = raw.replace(/[,\s]/g, '').toLowerCase()
  const m = s.match(/£?([\d.]+)(k|m)?/)
  if (!m) return null
  let val = parseFloat(m[1])
  if (m[2] === 'k') val *= 1_000
  if (m[2] === 'm') val *= 1_000_000
  return isNaN(val) ? null : val
}

/**
 * Extract income cap from grant eligibility text.
 * Returns the cap as a number, or null if no cap found.
 * E.g. "organisations with annual income under £50,000" → 50000
 */
function parseIncomeCapFromText(text: string): number | null {
  const patterns = [
    /(?:annual\s+)?(?:income|turnover|budget)\s+(?:of\s+)?(?:under|below|less\s+than|not\s+exceeding|no\s+more\s+than)\s+(£[\d,.km]+)/i,
    /(?:under|below|less\s+than|not\s+exceeding)\s+(£[\d,.km]+)\s+(?:annual\s+)?(?:income|turnover)/i,
    /income\s+cap[:\s]+(£[\d,.km]+)/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m) {
      const val = parsePoundAmount(m[1])
      if (val !== null) return val
    }
  }
  return null
}

/**
 * Return true if the org's income band is within the given cap.
 * If band is unknown, assume within cap (don't penalise).
 */
function orgIncomeWithinCap(band: string | null, cap: number): boolean {
  if (!band) return true
  const midpoint = INCOME_MIDPOINTS[band]
  if (midpoint === undefined) return true
  return midpoint <= cap * 1.1
}

/** Fuzzy word overlap — returns true if any 4+ letter word from a appears in b */
function fuzzyOverlap(a: string, b: string): boolean {
  const bLower = b.toLowerCase()
  return a.toLowerCase().split(/\W+/).some(w => w.length >= 4 && bLower.includes(w))
}

/**
 * Count how many 4+ letter words from term appear in text.
 * Returns a normalised hit ratio (0–1).
 */
function phraseHitRatio(term: string, text: string): number {
  const words = term.toLowerCase().split(/\W+/).filter(w => w.length >= 4)
  if (words.length === 0) return 0
  const hits = words.filter(w => text.toLowerCase().includes(w)).length
  return hits / words.length
}

/**
 * Normalize a structure string to a canonical set of tokens.
 * Bridges the gap between the DB's scraped vocabulary (e.g. 'cic', 'charity',
 * 'coop') and the code's LegalStructure enum (e.g. 'cic_guarantee', 'cic_shares',
 * 'registered_charity', 'cooperative').  Both sides are expanded then compared
 * via intersection, so 'cic_guarantee' ↔ 'cic' correctly resolves to eligible.
 */
function normalizeStructureTokens(s: string): string[] {
  const sl = s.toLowerCase().trim()
  switch (sl) {
    case 'cic_guarantee':
    case 'cic_shares':
    case 'cic':
      return ['cic', 'cic_guarantee', 'cic_shares']
    case 'registered_charity':
    case 'charity':
      return ['registered_charity', 'charity']
    case 'cio':
      return ['cio', 'charity', 'registered_charity']
    case 'social_enterprise':
      return ['social_enterprise', 'cic', 'cic_guarantee', 'cic_shares',
              'ltd_guarantee', 'ltd_shares', 'company_ltd_guarantee', 'ltd_company', 'cooperative', 'coop']
    case 'ltd_guarantee':
    case 'company_ltd_guarantee':
      return ['ltd_guarantee', 'company_ltd_guarantee', 'ltd_company', 'ltd']
    case 'ltd_shares':
      return ['ltd_shares', 'ltd_company', 'ltd']
    case 'ltd_company':
    case 'ltd':
      return ['ltd_company', 'ltd', 'ltd_guarantee', 'ltd_shares', 'company_ltd_guarantee']
    case 'cooperative':
    case 'coop':
    case 'community_benefit_society':
      return ['cooperative', 'coop', 'community_benefit_society']
    case 'unincorporated':
    case 'voluntary_organisation':
    case 'voluntary_org':
    case 'unregistered_group':
    case 'not_registered':
      return ['unincorporated', 'voluntary_organisation', 'voluntary_org',
              'not_registered', 'unregistered_group']
    case 'sole_trader':
      return ['sole_trader']
    case 'llp':
    case 'partnership':
      return ['llp', 'partnership']
    default:
      return [sl]
  }
}

/**
 * Map legacy org_type to a list of LegalStructure values for eligibility matching.
 * Used as fallback when org.legal_structure is not set.
 */
function orgStructuresToCheck(org: Organisation): LegalStructure[] {
  if (org.legal_structure) return [org.legal_structure]
  switch (org.org_type) {
    case 'registered_charity': return ['registered_charity', 'cio']
    case 'cic':                return ['cic_guarantee', 'cic_shares']
    case 'social_enterprise':  return ['ltd_guarantee', 'ltd_shares', 'cooperative', 'cic_guarantee', 'cic_shares']
    case 'community_group':    return ['unincorporated', 'not_registered']
    default:                   return []
  }
}

/**
 * Human-readable label for a legal structure value.
 */
function structureLabel(s: LegalStructure): string {
  const labels: Record<LegalStructure, string> = {
    cic_guarantee:      'CIC',
    cic_shares:         'CIC',
    cio:                'CIO',
    registered_charity: 'registered charity',
    ltd_guarantee:      'Ltd company',
    ltd_shares:         'Ltd company',
    llp:                'LLP',
    cooperative:        'cooperative',
    unincorporated:     'unincorporated association',
    sole_trader:        'sole trader',
    not_registered:     'unregistered org',
  }
  return labels[s] ?? s
}

/**
 * Optional feedback signals derived from the user's interaction history.
 * sectorBoosts: map of sector → positive boost (1–10) based on liked grants
 * sectorPenalties: map of sector → negative penalty based on disliked grants
 */
export interface FeedbackSignals {
  sectorBoosts:    Map<string, number>
  sectorPenalties: Map<string, number>
}

export function computeMatchScore(
  grant: GrantOpportunity,
  org: Organisation,
  feedback?: FeedbackSignals,
): MatchResult {
  const reasons: string[] = []

  // Full grant text used for keyword matching
  const grantText = [
    grant.title,
    grant.description,
    grant.sectors.join(' '),
    grant.eligibilityCriteria.join(' '),
  ].join(' ').toLowerCase()

  // ── 1. Location (max 25) ───────────────────────────────────────────────
  let locationScore = 10 // base for national grants
  let locationMismatch = false
  if (org.primary_location) {
    const city    = org.primary_location.split(',')[0].trim().toLowerCase()
    const region  = org.primary_location.split(',')[1]?.trim().toLowerCase() ?? ''
    const country = org.primary_location.split(',').pop()?.trim().toLowerCase() ?? ''

    if (grant.isLocal) {
      const cityMatch    = !!(city   && grantText.includes(city))
      const regionMatch  = !!(region && grantText.includes(region))
      const countryMatch = !!(country && ['scotland', 'wales', 'northern ireland'].includes(country) && grantText.includes(country))
      const locationMatch = cityMatch || regionMatch || countryMatch

      if (locationMatch) {
        locationScore = 25
        reasons.push(`Local match for ${org.primary_location.split(',')[0]}`)

        // Borough mismatch check: applies to ALL London orgs — whether matched via
        // city ("london") or region. If the grant names a specific borough and the
        // org's location is just "london" (no specific borough) or a different borough,
        // revert to national base score. This prevents Bromley-only funds from scoring
        // 25/25 against a generic "London" org profile.
        if (city === 'london' || region.includes('london')) {
          const mentionedBoroughs = LONDON_BOROUGHS.filter(b => grantText.includes(b))
          if (mentionedBoroughs.length > 0) {
            // Only considered a match if org has a specific borough in their city field
            const orgBoroughMentioned = city !== 'london' && mentionedBoroughs.some(
              b => b === city || b.includes(city) || city.includes(b)
            )
            if (!orgBoroughMentioned) {
              locationScore = 10 // revert to national base — borough mismatch
              reasons.pop()
              reasons.push('London grant — check borough eligibility')
            }
          }
        }
      } else {
        // Local grant but no location text match — likely for a different area.
        // Use a floor of 2 (well below the 10 base for national grants) so these
        // grants rank significantly lower than anything even partially relevant.
        locationScore = 2
        locationMismatch = true
        reasons.push('Local grant — area may not match yours')
      }
    } else {
      // ── Regional title detection for grants tagged as national ─────────────
      // Many grants have regional scope but is_local = false and no location
      // eligibility text. Catch them by scanning the grant title for regional
      // keywords (e.g. "(North)", "Yorkshire", "South West").
      const grantTitleLower = grant.title.toLowerCase()
      const matchedRegion = Object.entries(REGIONAL_KEYWORDS).find(
        ([keyword]) => grantTitleLower.includes(keyword)
      )
      if (matchedRegion) {
        const [keyword, regionLabel] = matchedRegion
        const orgLocation = [city, region, country].join(' ')
        // Check if the org's location contains the detected region keyword
        const orgInRegion = orgLocation.includes(keyword.replace(/[()]/g, '').trim()) ||
          orgLocation.includes(regionLabel.toLowerCase())
        if (!orgInRegion) {
          locationScore = 2
          locationMismatch = true
          reasons.push(`Likely restricted to ${regionLabel} — check eligibility`)
        }
      }
    }
  }

  // ── 2. Themes / sectors (max 25) ──────────────────────────────────────
  let themesScore = 0
  let primaryDomainMismatch = false

  const orgImpactSectors  = org.impact_sectors  ?? []
  const grantImpactSectors = grant.impactSectors ?? []

  if (orgImpactSectors.length > 0 && grantImpactSectors.length > 0) {
    // ── Structured path: IDF-weighted bidirectional coverage ──────────────
    const intersection = grantImpactSectors.filter(s => orgImpactSectors.includes(s))
    const hits = intersection.length

    // IDF-weighted sums — rarer sectors count for more than ubiquitous ones
    const weightedIntersection = intersection.reduce((s, sec) => s + idfWeight(sec), 0)
    const weightedGrantTotal   = grantImpactSectors.reduce((s, sec) => s + idfWeight(sec), 0)
    const weightedOrgTotal     = orgImpactSectors.reduce((s, sec) => s + idfWeight(sec), 0)

    // Bidirectional coverage:
    //   grantCoverage — what fraction of the grant's weighted focus the org covers (primary signal)
    //   orgCoverage   — what fraction of the org's weighted work the grant covers (secondary signal)
    // Combining both rewards mutual specificity: a focused arts org matching an arts
    // grant scores higher than a broad org matching on generic sectors only.
    const grantCoverage = weightedGrantTotal > 0 ? weightedIntersection / weightedGrantTotal : 0
    const orgCoverage   = weightedOrgTotal   > 0 ? weightedIntersection / weightedOrgTotal   : 0
    const coverage      = 0.7 * grantCoverage + 0.3 * orgCoverage

    themesScore = hits > 0 ? Math.max(3, Math.round(coverage * 25)) : 3

    // ── Primary domain mismatch check ─────────────────────────────────────
    // These sectors strongly characterise what a grant is fundamentally about.
    // If a grant includes any of these but the org does NOT, the match is
    // misleading even when generic cross-cutting sectors (community, health,
    // young_people) produce high coverage — e.g. football grants for a theatre.
    const PRIMARY_DOMAINS = [
      'sport', 'environment', 'heritage', 'international',
      'food', 'animal_welfare', 'faith',
    ]
    const grantPrimaryDomains = grantImpactSectors.filter(s => PRIMARY_DOMAINS.includes(s))
    if (grantPrimaryDomains.length > 0) {
      const orgCoversDomain = grantPrimaryDomains.some(s => orgImpactSectors.includes(s))
      if (!orgCoversDomain) {
        primaryDomainMismatch = true
        themesScore = Math.min(themesScore, 5)
      }
    }

    // ── Opposing beneficiary conflict ─────────────────────────────────────
    // Grants for older people and grants for young people serve mutually
    // exclusive audiences. Penalise when the grant targets one group and the
    // org's profile exclusively targets the other.
    const grantForOlder  = grantImpactSectors.includes('older_people')
    const grantForYoung  = grantImpactSectors.includes('young_people')
    const orgHasOlder    = orgImpactSectors.includes('older_people')
    const orgHasYoung    = orgImpactSectors.includes('young_people')

    if (grantForOlder && !orgHasOlder && orgHasYoung) {
      themesScore = Math.min(themesScore, 8)
      primaryDomainMismatch = true
      reasons.push('Grant targets older people — check if relevant to your beneficiaries')
    } else if (grantForYoung && !orgHasYoung && orgHasOlder) {
      themesScore = Math.min(themesScore, 8)
      primaryDomainMismatch = true
      reasons.push('Grant targets young people — check if relevant to your beneficiaries')
    }

    if (intersection.length > 0 && !primaryDomainMismatch) {
      reasons.push(`Sector match: ${intersection.join(', ')}`)
    }

  } else {
    // ── Free-text fallback when structured tags are absent ────────────────
    const orgTerms: string[] = [
      ...(org.themes        ?? []),
      ...(org.areas_of_work ?? []),
      ...(org.beneficiaries ?? []),
    ]

    const missionTerms: string[] = []
    if (org.mission) {
      const mWords = org.mission.split(/[\s,;.]+/).filter(w => w.length >= 4)
      missionTerms.push(...mWords.slice(0, 10))
    }

    const outcomeTerms: string[] = (org.key_outcomes ?? [])
      .flatMap(o => o.split(/[\s,;.]+/).filter(w => w.length >= 4))
      .slice(0, 15)

    const allOrgTerms = [...orgTerms, ...missionTerms, ...outcomeTerms]

    if (allOrgTerms.length === 0) {
      // Profile is effectively blank — we can't score relevance.
      // Use a below-neutral score (8) so well-matched grants for orgs
      // with complete profiles naturally rank higher, and to encourage
      // profile completion.
      themesScore = 8
    } else {
      let weightedHits = 0
      let totalWeight  = 0

      for (const term of orgTerms) {
        const weight = 1.5
        totalWeight += weight
        if (fuzzyOverlap(term, grantText)) weightedHits += weight
      }
      for (const term of [...missionTerms, ...outcomeTerms]) {
        const weight = 0.8
        totalWeight += weight
        if (fuzzyOverlap(term, grantText)) weightedHits += weight
      }

      const ratio = totalWeight > 0 ? weightedHits / totalWeight : 0
      themesScore = Math.round(ratio * 25)

      if (ratio >= 0.4)       reasons.push('Strong theme match')
      else if (ratio >= 0.15) reasons.push('Partial theme match')
    }

    // Direct sector-to-theme comparison (exact substring match boost)
    const grantSectorsLower = grant.sectors.map(s => s.toLowerCase())
    const orgThemesFlat     = (org.themes ?? []).map(t => t.toLowerCase())
    const sectorHits        = grantSectorsLower.filter(s =>
      orgThemesFlat.some(t => s.includes(t.split(' ')[0]) || t.includes(s.split(' ')[0]))
    ).length
    themesScore = Math.min(25, themesScore + sectorHits * 4)
  }

  // ── Title keyword veto ────────────────────────────────────────────────
  // Grant titles are very high-confidence domain signals — catches mismatches
  // even when impact_sectors is absent or sparsely tagged.  Only fires when
  // the org has some sector/theme data (can't veto a completely blank profile).
  // Supplements the structured primaryDomainMismatch check above.
  const orgHasProfile = orgImpactSectors.length > 0 || (org.themes ?? []).length > 0
  if (orgHasProfile && !primaryDomainMismatch) {
    const orgAllTerms = new Set([
      ...orgImpactSectors,
      ...(org.themes ?? []).map(t => t.toLowerCase()),
    ])
    const titleLower = grant.title.toLowerCase()
    for (const { words, orgTerms } of TITLE_DOMAIN_KEYWORDS) {
      if (words.some(w => titleLower.includes(w))) {
        const orgCovers = orgTerms.some(t => orgAllTerms.has(t))
        if (!orgCovers) {
          primaryDomainMismatch = true
          themesScore = Math.min(themesScore, 5)
        }
        break
      }
    }
  }

  // ── Feedback signal boost on themes ───────────────────────────────────
  // Works on whichever sector list is populated (structured preferred)
  const feedbackSectors = grantImpactSectors.length > 0
    ? grantImpactSectors
    : grant.sectors.map(s => s.toLowerCase())

  if (feedback && feedbackSectors.length > 0) {
    let feedbackDelta = 0
    let boostedSector = false
    for (const sector of feedbackSectors) {
      const boost   = feedback.sectorBoosts.get(sector)   ?? 0
      const penalty = feedback.sectorPenalties.get(sector) ?? 0
      feedbackDelta += boost - penalty
      if (boost > 0) boostedSector = true
    }
    const cappedDelta = Math.max(-5, Math.min(6, feedbackDelta))
    themesScore = Math.max(0, Math.min(25, themesScore + cappedDelta))
    if (boostedSector && cappedDelta >= 3) reasons.push('Matches your liked grant types')
  }

  // ── 3. Grant size fit (max 20) ─────────────────────────────────────────
  let grantSizeScore = 10
  const grantMax = grant.amountMax ?? grant.amountMin ?? 0
  const grantMin = grant.amountMin ?? 0

  if (org.min_grant_target || org.max_grant_target) {
    const targetMin = org.min_grant_target ?? 0
    const targetMax = org.max_grant_target ?? Infinity
    if (grantMax >= targetMin && grantMin <= targetMax) {
      grantSizeScore = 20
      reasons.push('Within your target grant size')
    } else if (grantMax < targetMin) {
      grantSizeScore = 3
    } else {
      grantSizeScore = 8
    }
  } else if (org.annual_income_band && grantMax > 0) {
    const orgIncome = INCOME_MIDPOINTS[org.annual_income_band] ?? 50_000
    const ratio = grantMax / orgIncome
    if (ratio >= 0.05 && ratio <= 0.6)       grantSizeScore = 20
    else if (ratio > 0.6 && ratio <= 1.2)    grantSizeScore = 14
    else if (ratio > 1.2 && ratio <= 3.0)    grantSizeScore = 8
    else if (ratio > 3.0)                    grantSizeScore = 3
    else                                     grantSizeScore = 15
    if (grantSizeScore >= 18) reasons.push('Grant size suits your organisation')
  }

  // ── 4. Funder type preference + funding type affinity (max 15) ────────
  let funderTypeScore = 8 // neutral base

  // Funder type preference (trust vs government vs lottery etc.)
  if (org.funder_type_preferences?.length) {
    if (org.funder_type_preferences.includes(grant.funderType)) {
      funderTypeScore = 15
      reasons.push('Preferred funder type')
    } else {
      funderTypeScore = 3
    }
  }

  // Funding type affinity
  if (grant.fundingType) {
    const ft   = grant.fundingType
    const prefs = org.funding_type_preferences ?? []

    if (prefs.length > 0) {
      // ── Explicit preference (Phase 3): use what the user told us ──────────
      if (prefs.includes(ft)) {
        funderTypeScore = Math.min(15, funderTypeScore + 4)
        reasons.push('Matches your funding type preference')
      } else {
        // Explicitly not preferred — mild penalty
        funderTypeScore = Math.max(0, funderTypeScore - 3)
      }
    } else if (org.org_stage) {
      // ── Stage proxy fallback (used until user sets preferences) ───────────
      const isEarly  = ['idea', 'pre_revenue', 'early'].includes(org.org_stage)
      const isGrowth = ['growth', 'established'].includes(org.org_stage)

      if (isEarly && ft === 'programme') {
        funderTypeScore = Math.min(15, funderTypeScore + 3)
        reasons.push('Programme suits your stage')
      } else if (isGrowth && ft === 'investment') {
        funderTypeScore = Math.min(15, funderTypeScore + 2)
        reasons.push('Investment suits growth stage')
      }
    }
  }

  // ── 5. Eligibility / org type (max 15) ────────────────────────────────
  let eligibilityScore: number =
    org.org_type === 'registered_charity' ? 12 :
    org.org_type === 'cic'               ? 10 :
    org.org_type === 'social_enterprise' ? 9  : 7

  let structureMismatch = false
  const eligibilityText = grant.eligibilityCriteria.join(' ').toLowerCase()

  if (eligibilityText) {
    const charityKeywords  = ['registered charity', 'charity only', 'charitable', 'registered with charity']
    const cicKeywords      = ['cic', 'community interest company']
    const seKeywords       = ['social enterprise', 'cic', 'community benefit society', 'community interest']
    const vcseKeywords     = ['voluntary', 'community group', 'vcse', 'voluntary organisation', 'community organisation']

    const isCharityEligible = charityKeywords.some(k => eligibilityText.includes(k))
    const isCICEligible     = cicKeywords.some(k => eligibilityText.includes(k))
    const isSEEligible      = seKeywords.some(k => eligibilityText.includes(k))

    if (isCharityEligible && org.org_type === 'registered_charity') {
      eligibilityScore = Math.min(15, eligibilityScore + 3)
      reasons.push('Eligible as a registered charity')
    } else if (isCICEligible && org.org_type === 'cic') {
      eligibilityScore = Math.min(15, eligibilityScore + 3)
      reasons.push('Eligible as a CIC')
    } else if (isSEEligible && (org.org_type === 'social_enterprise' || org.org_type === 'cic')) {
      eligibilityScore = Math.min(15, eligibilityScore + 2)
    } else if (isCharityEligible && org.org_type !== 'registered_charity') {
      // Hard penalty — "registered charity" requirement is a strong eligibility gate
      eligibilityScore = Math.max(1, eligibilityScore - 12)
      structureMismatch = true
      reasons.push('Check eligibility — may require registered charity status')
    }

    if (vcseKeywords.some(k => eligibilityText.includes(k))) {
      eligibilityScore = Math.min(15, eligibilityScore + 1)
    }

    // Faith-building veto: if eligibility requires a church/place of worship,
    // orgs with no faith sector should be strongly penalised.
    const faithBuildingKeywords = [
      'church building', 'place of worship', 'for worship', 'open for worship',
      'mosque', 'synagogue', 'temple', 'gurdwara', 'chapel',
    ]
    const requiresFaithBuilding = faithBuildingKeywords.some(k => eligibilityText.includes(k))
    if (requiresFaithBuilding) {
      const orgHasFaith = (org.impact_sectors ?? []).includes('faith') ||
        (org.themes ?? []).some((t: string) => ['faith', 'religion', 'church', 'worship'].some(f => t.includes(f)))
      if (!orgHasFaith) {
        eligibilityScore = Math.max(1, eligibilityScore - 10)
        structureMismatch = true
        reasons.push('Requires a faith building — check eligibility')
      }
    }

    if (org.primary_location) {
      const city    = org.primary_location.split(',')[0].trim().toLowerCase()
      const orgRegion = org.primary_location.split(',')[1]?.trim().toLowerCase() ?? ''
      const country = org.primary_location.split(',').pop()?.trim().toLowerCase() ?? ''

      if (city && eligibilityText.includes(city)) {
        eligibilityScore = Math.min(15, eligibilityScore + 2)
        reasons.push('Your location meets eligibility')
      }
      // UK nation restriction — checks both grant TITLE and eligibility text with
      // expanded patterns. Infers England as default for orgs in London/English cities.
      const grantTitleLower = grant.title.toLowerCase()
      const orgLocation = [city, orgRegion, country].join(' ')
      const isInScotland = orgLocation.includes('scotland')
      const isInWales    = orgLocation.includes('wales')
      const isInNI       = orgLocation.includes('northern ireland')
      const isInEngland  = !isInScotland && !isInWales && !isInNI // default

      const allNations = ['scotland', 'wales', 'northern ireland', 'england'] as const
      const nationRestrictions = allNations.filter(n => {
        // Title is a strong signal (e.g. "Awards for All Wales", "Scotland Fund")
        const inTitle = grantTitleLower.includes(n)
        // Eligibility text — expanded set of phrasing patterns
        const inElig =
          eligibilityText.includes(`based in ${n}`) ||
          eligibilityText.includes(`${n} only`) ||
          eligibilityText.includes(`${n}-based`) ||
          eligibilityText.includes(`in ${n}`) ||
          eligibilityText.includes(`for ${n}`) ||
          eligibilityText.includes(`${n} organisations`) ||
          eligibilityText.includes(`${n} registered`) ||
          eligibilityText.includes(`operating in ${n}`)
        return inTitle || inElig
      })

      if (nationRestrictions.length > 0) {
        const orgMatchesNation = nationRestrictions.some(n =>
          (n === 'scotland'         && isInScotland) ||
          (n === 'wales'            && isInWales)    ||
          (n === 'northern ireland' && isInNI)       ||
          (n === 'england'          && isInEngland)
        )
        if (!orgMatchesNation) {
          // Strong penalty — nation mismatch means the org is almost certainly ineligible
          eligibilityScore = Math.max(1, eligibilityScore - 10)
          const restrictedNation = nationRestrictions.find(n => n !== 'england') ?? nationRestrictions[0]
          reasons.push(`Likely restricted to ${restrictedNation.charAt(0).toUpperCase() + restrictedNation.slice(1)}`)
        }
      }

      // Borough-level restriction: if ANY grant text (description or eligibility) names a
      // specific London borough that is NOT the org's borough, penalise. Uses grantText
      // (description + eligibility) so borough mentions in the description are caught too.
      if (orgRegion.includes('london') || city === 'london') {
        const mentionedBoroughs = LONDON_BOROUGHS.filter(b => grantText.includes(b))
        if (mentionedBoroughs.length > 0) {
          const orgBoroughMentioned = mentionedBoroughs.some(
            b => b === city || b.includes(city) || city.includes(b)
          )
          if (!orgBoroughMentioned) {
            eligibilityScore = Math.max(2, eligibilityScore - 5)
            // Only add the warning reason if the location section didn't already flag it
            if (!reasons.includes('London grant — check borough eligibility')) {
              reasons.push('May be restricted to a different London borough')
            }
          }
        }
      }
    }

    if (org.mission && eligibilityText.length > 20) {
      const missionHitRatio = phraseHitRatio(org.mission, eligibilityText)
      if (missionHitRatio >= 0.15) {
        eligibilityScore = Math.min(15, eligibilityScore + 1)
      }
    }

    const incomeCap = parseIncomeCapFromText(eligibilityText)
    if (incomeCap !== null && org.annual_income_band) {
      if (!orgIncomeWithinCap(org.annual_income_band, incomeCap)) {
        eligibilityScore = Math.max(1, eligibilityScore - 6)
        reasons.push('Your income may exceed this grant\'s cap')
      } else {
        eligibilityScore = Math.min(15, eligibilityScore + 1)
      }
    }
  }

  // ── eligible_structures hard gate ────────────────────────────────────
  // When a grant has explicit structure requirements, override the soft
  // text-based eligibility with a hard structured check.
  if (grant.eligibleStructures && grant.eligibleStructures.length > 0) {
    const orgStructures = orgStructuresToCheck(org)

    if (orgStructures.length > 0) {
      // Normalize both sides before comparing — bridges vocabulary mismatches
      // between the DB's scraped values ('cic', 'charity', 'coop') and the
      // code's LegalStructure enum ('cic_guarantee', 'registered_charity', 'cooperative')
      const orgTokens   = new Set(orgStructures.flatMap(s => normalizeStructureTokens(s)))
      const grantTokens = grant.eligibleStructures!.flatMap(s => normalizeStructureTokens(s))
      const isEligible  = grantTokens.some(t => orgTokens.has(t))

      if (isEligible) {
        // Confirmed eligible — structured data overrides any earlier text-based mismatch flag
        structureMismatch = false
        eligibilityScore = Math.min(15, eligibilityScore + 3)
        const label = structureLabel(org.legal_structure ?? orgStructures[0])
        reasons.push(`Eligible as a ${label}`)
      } else {
        // Hard ineligibility — significant penalty
        // Leave a floor of 1 so it still appears (with low score) rather than disappearing
        eligibilityScore = Math.max(1, Math.min(eligibilityScore, 4))
        structureMismatch = true
        reasons.push('Check eligibility — legal structure may not qualify')
      }
    }
    // If orgStructures is empty (no legal structure data) we can't gate — leave score as-is
  }

  // ── Total ──────────────────────────────────────────────────────────────
  let score = Math.min(100,
    locationScore + themesScore + grantSizeScore + funderTypeScore + eligibilityScore
  )

  // Freshness bonus — recently added or verified grants get a gentle tiebreaker boost
  // so fresh opportunities rise above stale grants with identical base scores.
  // Applied BEFORE mismatch caps so it never inflates a structurally ineligible grant.
  const freshnessDate = grant.lastVerifiedAt ?? grant.dateAdded
  if (freshnessDate) {
    const daysOld = Math.floor((Date.now() - new Date(freshnessDate).getTime()) / (1000 * 60 * 60 * 24))
    const freshnessBonus = daysOld <= 7 ? 4 : daysOld <= 14 ? 2 : daysOld <= 30 ? 1 : 0
    score = Math.min(100, score + freshnessBonus)
  }

  // Cap total score when legal structure is likely ineligible — no matter how
  // strong the location/sector match is, a structure mismatch is a deal-breaker.
  if (structureMismatch) {
    score = Math.min(score, 45)
  }

  // Cap total score for local grants outside the org's area — a strong sector
  // match shouldn't make a Somerset grant look relevant to a London org.
  if (locationMismatch) {
    score = Math.min(score, 44)
  }

  // Cap total score when the grant is in a specialist domain the org doesn't
  // cover.  Generic sector overlaps (community, health, young_people) must not
  // elevate an irrelevant grant — e.g. a football grant should never rank
  // highly for a theatre, even if both work with young people.
  if (primaryDomainMismatch) {
    score = Math.min(score, 44)
  }

  // Build a narrative sentence rather than a flat bullet list
  const warns    = reasons.filter(r => /check|may |likely|not match|exceed|borough|restricted/i.test(r))
  const positives = reasons.filter(r => !warns.includes(r))

  let reason: string
  if (reasons.length === 0) {
    reason = score >= 75 ? 'Good overall match for your organisation.'
           : score >= 55 ? 'Partial match — worth reviewing eligibility.'
           : 'Lower match — check eligibility carefully.'
  } else {
    const parts: string[] = []
    if (positives.length === 1) {
      parts.push(positives[0] + '.')
    } else if (positives.length >= 2) {
      const last = positives[positives.length - 1]
      const rest = positives.slice(0, -1)
      parts.push(rest.join(', ') + ', and ' + last.toLowerCase() + '.')
    }
    if (warns.length === 1) {
      parts.push(warns[0] + '.')
    } else if (warns.length >= 2) {
      parts.push(warns[0] + ' Also: ' + warns[1].toLowerCase() + '.')
    }
    reason = parts.join(' ') || reasons[0] + '.'
  }

  return {
    score,
    reason,
    breakdown: {
      location:    { score: locationScore,    max: 25, label: 'Location' },
      themes:      { score: themesScore,      max: 25, label: 'Themes & work' },
      grantSize:   { score: grantSizeScore,   max: 20, label: 'Grant size' },
      funderType:  { score: funderTypeScore,  max: 15, label: 'Funder type' },
      eligibility: { score: eligibilityScore, max: 15, label: 'Eligibility' },
    },
  }
}

/** Score colour based on value */
export function scoreColour(score: number): { bg: string; text: string; bar: string } {
  if (score >= 80) return { bg: 'bg-sage/15',  text: 'text-sage',  bar: 'bg-sage'  }
  if (score >= 65) return { bg: 'bg-gold/15',  text: 'text-gold',  bar: 'bg-gold'  }
  if (score >= 45) return { bg: 'bg-warm',     text: 'text-mid',   bar: 'bg-mid'   }
  return               { bg: 'bg-red-50',   text: 'text-red-400', bar: 'bg-red-300' }
}

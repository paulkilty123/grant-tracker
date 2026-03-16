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
  if (org.primary_location) {
    const city    = org.primary_location.split(',')[0].trim().toLowerCase()
    const region  = org.primary_location.split(',')[1]?.trim().toLowerCase() ?? ''
    const country = org.primary_location.split(',').pop()?.trim().toLowerCase() ?? ''

    if (grant.isLocal) {
      const locationMatch =
        (city   && grantText.includes(city))   ||
        (region && grantText.includes(region)) ||
        (country && ['scotland', 'wales', 'northern ireland'].includes(country) && grantText.includes(country))

      if (locationMatch) {
        locationScore = 25
        reasons.push(`Local match for ${org.primary_location.split(',')[0]}`)
      } else {
        locationScore = 18
        reasons.push('Local funder')
      }
    }
  }

  // ── 2. Themes / sectors (max 25) ──────────────────────────────────────
  let themesScore = 0

  const orgImpactSectors  = org.impact_sectors  ?? []
  const grantImpactSectors = grant.impactSectors ?? []

  if (orgImpactSectors.length > 0 && grantImpactSectors.length > 0) {
    // ── Structured path: intersection of 12-sector taxonomy ──────────────
    const intersection = grantImpactSectors.filter(s => orgImpactSectors.includes(s))
    const hits = intersection.length

    // Score curve: each matching sector adds significant weight
    //   0 hits → 3  (genuine mismatch, not 0 — avoids filtering out borderline)
    //   1 hit  → 15
    //   2 hits → 21
    //   3+     → 25
    themesScore = hits === 0 ? 3 : hits === 1 ? 15 : hits === 2 ? 21 : 25

    if (intersection.length > 0) {
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
      themesScore = 12 // neutral when profile is incomplete
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

  // Funding type affinity — use org_stage as a proxy until
  // funding_type_preferences is added to org profile in Phase 3
  if (grant.fundingType && org.org_stage) {
    const isEarly    = ['idea', 'pre_revenue', 'early'].includes(org.org_stage)
    const isGrowth   = ['growth', 'established'].includes(org.org_stage)
    const ft         = grant.fundingType

    if (isEarly && (ft === 'accelerator' || ft === 'support_programme')) {
      // Early-stage orgs benefit most from structured programmes
      funderTypeScore = Math.min(15, funderTypeScore + 3)
      reasons.push('Programme suits your stage')
    } else if (isGrowth && ft === 'accelerator') {
      // Accelerators are less useful for established orgs
      funderTypeScore = Math.max(0, funderTypeScore - 2)
    } else if (isGrowth && ft === 'social_investment') {
      // Established orgs can service repayable finance
      funderTypeScore = Math.min(15, funderTypeScore + 2)
      reasons.push('Social investment suits growth stage')
    } else if (ft === 'diversity_fund') {
      // Don't apply affinity to diversity funds — eligibility depends on founder identity, not stage
    }
  }

  // ── 5. Eligibility / org type (max 15) ────────────────────────────────
  let eligibilityScore: number =
    org.org_type === 'registered_charity' ? 12 :
    org.org_type === 'cic'               ? 10 :
    org.org_type === 'social_enterprise' ? 9  : 7

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
      eligibilityScore = Math.max(3, eligibilityScore - 4)
    }

    if (vcseKeywords.some(k => eligibilityText.includes(k))) {
      eligibilityScore = Math.min(15, eligibilityScore + 1)
    }

    if (org.primary_location) {
      const city    = org.primary_location.split(',')[0].trim().toLowerCase()
      const country = org.primary_location.split(',').pop()?.trim().toLowerCase() ?? ''

      if (city && eligibilityText.includes(city)) {
        eligibilityScore = Math.min(15, eligibilityScore + 2)
        reasons.push('Your location meets eligibility')
      }
      const ukNations = ['scotland', 'wales', 'northern ireland', 'england']
      const restrictedTo = ukNations.filter(n => eligibilityText.includes(`based in ${n}`) || eligibilityText.includes(`${n} only`) || eligibilityText.includes(`${n}-based`))
      if (restrictedTo.length > 0 && !restrictedTo.some(n => country.includes(n) || city.includes(n))) {
        eligibilityScore = Math.max(2, eligibilityScore - 5)
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
      const isEligible = orgStructures.some(s => grant.eligibleStructures!.includes(s))

      if (isEligible) {
        // Confirmed eligible — boost to full score
        eligibilityScore = Math.min(15, eligibilityScore + 3)
        const label = structureLabel(org.legal_structure ?? orgStructures[0])
        reasons.push(`Eligible as a ${label}`)
      } else {
        // Hard ineligibility — significant penalty
        // Leave a floor of 1 so it still appears (with low score) rather than disappearing
        eligibilityScore = Math.max(1, Math.min(eligibilityScore, 4))
        reasons.push('Check eligibility — legal structure may not qualify')
      }
    }
    // If orgStructures is empty (no legal structure data) we can't gate — leave score as-is
  }

  // ── Total ──────────────────────────────────────────────────────────────
  const score = Math.min(100,
    locationScore + themesScore + grantSizeScore + funderTypeScore + eligibilityScore
  )

  const reason =
    reasons.length > 0 ? reasons.join(' · ') :
    score >= 75 ? 'Good overall match for your organisation' :
    score >= 55 ? 'Partial match — worth reviewing eligibility' :
    'Lower match — check eligibility carefully'

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

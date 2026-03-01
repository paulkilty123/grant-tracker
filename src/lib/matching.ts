import type { GrantOpportunity, Organisation } from '@/types'

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

export function computeMatchScore(
  grant: GrantOpportunity,
  org: Organisation,
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
      // Check if any part of the org's location appears in the grant text
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
    // national funders stay at 10
  }

  // ── 2. Themes / sectors (max 25) ──────────────────────────────────────
  // Now includes mission + key_outcomes for much richer matching
  let themesScore = 0

  const orgTerms: string[] = [
    ...(org.themes        ?? []),
    ...(org.areas_of_work ?? []),
    ...(org.beneficiaries ?? []),
  ]

  // Extract significant phrases from mission statement
  const missionTerms: string[] = []
  if (org.mission) {
    // Split mission into meaningful chunks (phrases of 2-4 words)
    const mWords = org.mission.split(/[\s,;.]+/).filter(w => w.length >= 4)
    // Add individual words and the full mission as one term
    missionTerms.push(...mWords.slice(0, 10))
  }

  // Add key outcomes as additional matching terms
  const outcomeTerms: string[] = (org.key_outcomes ?? [])
    .flatMap(o => o.split(/[\s,;.]+/).filter(w => w.length >= 4))
    .slice(0, 15)

  const allOrgTerms = [...orgTerms, ...missionTerms, ...outcomeTerms]

  if (allOrgTerms.length === 0) {
    themesScore = 12 // neutral when profile is incomplete
  } else {
    // Weight explicit theme terms more heavily than mission/outcome terms
    let weightedHits = 0
    let totalWeight  = 0

    for (const term of orgTerms) {
      const weight = 1.5  // explicit themes count more
      totalWeight += weight
      if (fuzzyOverlap(term, grantText)) weightedHits += weight
    }
    for (const term of [...missionTerms, ...outcomeTerms]) {
      const weight = 0.8  // mission/outcome terms count less individually
      totalWeight += weight
      if (fuzzyOverlap(term, grantText)) weightedHits += weight
    }

    const ratio = totalWeight > 0 ? weightedHits / totalWeight : 0
    themesScore = Math.round(ratio * 25)

    if (ratio >= 0.4)       reasons.push('Strong theme match')
    else if (ratio >= 0.15) reasons.push('Partial theme match')
  }

  // Direct sector-to-theme comparison (exact substring match boost)
  const grantSectors  = grant.sectors.map(s => s.toLowerCase())
  const orgThemesFlat = (org.themes ?? []).map(t => t.toLowerCase())
  const sectorHits    = grantSectors.filter(s =>
    orgThemesFlat.some(t => s.includes(t.split(' ')[0]) || t.includes(s.split(' ')[0]))
  ).length
  themesScore = Math.min(25, themesScore + sectorHits * 4)

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
      grantSizeScore = 3  // too small
    } else {
      grantSizeScore = 8  // too large
    }
  } else if (org.annual_income_band && grantMax > 0) {
    const orgIncome = INCOME_MIDPOINTS[org.annual_income_band] ?? 50_000
    const ratio = grantMax / orgIncome
    if (ratio >= 0.05 && ratio <= 0.6)       grantSizeScore = 20
    else if (ratio > 0.6 && ratio <= 1.2)    grantSizeScore = 14
    else if (ratio > 1.2 && ratio <= 3.0)    grantSizeScore = 8
    else if (ratio > 3.0)                    grantSizeScore = 3  // much larger than org
    else                                     grantSizeScore = 15 // very small grant — ok
    if (grantSizeScore >= 18) reasons.push('Grant size suits your organisation')
  }

  // ── 4. Funder type preference (max 15) ────────────────────────────────
  let funderTypeScore = 8 // neutral base
  if (org.funder_type_preferences?.length) {
    if (org.funder_type_preferences.includes(grant.funderType)) {
      funderTypeScore = 15
      reasons.push('Preferred funder type')
    } else {
      funderTypeScore = 3
    }
  }

  // ── 5. Eligibility / org type (max 15) ────────────────────────────────
  // Start with org-type base score
  let eligibilityScore: number =
    org.org_type === 'registered_charity' ? 12 :
    org.org_type === 'cic'               ? 10 :
    org.org_type === 'social_enterprise' ? 9  : 7

  // Boost if grant eligibility criteria explicitly favour this org type
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
      // Charity-only grants scored down for non-charities
      eligibilityScore = Math.max(3, eligibilityScore - 4)
    }

    // If eligibility mentions community groups and org is community_group
    if (vcseKeywords.some(k => eligibilityText.includes(k))) {
      eligibilityScore = Math.min(15, eligibilityScore + 1)
    }

    // Location-based eligibility check
    if (org.primary_location) {
      const city    = org.primary_location.split(',')[0].trim().toLowerCase()
      const country = org.primary_location.split(',').pop()?.trim().toLowerCase() ?? ''

      // Bonus if org location explicitly mentioned in eligibility
      if (city && eligibilityText.includes(city)) {
        eligibilityScore = Math.min(15, eligibilityScore + 2)
        reasons.push('Your location meets eligibility')
      }
      // Penalty if eligibility restricts to a specific region that doesn't match
      const ukNations = ['scotland', 'wales', 'northern ireland', 'england']
      const restrictedTo = ukNations.filter(n => eligibilityText.includes(`based in ${n}`) || eligibilityText.includes(`${n} only`) || eligibilityText.includes(`${n}-based`))
      if (restrictedTo.length > 0 && !restrictedTo.some(n => country.includes(n) || city.includes(n))) {
        eligibilityScore = Math.max(2, eligibilityScore - 5)
      }
    }

    // Use mission text in eligibility check — match mission concepts against grant criteria
    if (org.mission && eligibilityText.length > 20) {
      const missionHitRatio = phraseHitRatio(org.mission, eligibilityText)
      if (missionHitRatio >= 0.15) {
        eligibilityScore = Math.min(15, eligibilityScore + 1)
      }
    }
  }

  // ── Total ──────────────────────────────────────────────────────────────
  const score = Math.min(100,
    locationScore + themesScore + grantSizeScore + funderTypeScore + eligibilityScore
  )

  // Build reason string — prioritise specific over generic
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

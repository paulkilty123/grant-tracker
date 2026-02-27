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

export function computeMatchScore(
  grant: GrantOpportunity,
  org: Organisation,
): MatchResult {
  const reasons: string[] = []

  // ── 1. Location (max 25) ───────────────────────────────────────────────
  let locationScore = 10 // base for national grants
  if (org.primary_location) {
    const city = org.primary_location.split(',')[0].trim().toLowerCase()
    const grantText = `${grant.title} ${grant.description}`.toLowerCase()
    if (grant.isLocal && grantText.includes(city)) {
      locationScore = 25
      reasons.push(`Local funder matching ${org.primary_location}`)
    } else if (grant.isLocal) {
      locationScore = 18
      reasons.push('Local funder')
    }
    // national funders stay at 10
  }

  // ── 2. Themes / sectors (max 25) ──────────────────────────────────────
  let themesScore = 0
  const orgTerms = [
    ...(org.themes        ?? []),
    ...(org.areas_of_work ?? []),
    ...(org.beneficiaries ?? []),
  ]
  const grantText = `${grant.title} ${grant.description} ${grant.sectors.join(' ')}`

  if (orgTerms.length === 0) {
    themesScore = 12 // neutral when profile is incomplete
  } else {
    let hits = 0
    for (const term of orgTerms) {
      if (fuzzyOverlap(term, grantText)) hits++
    }
    const ratio = hits / orgTerms.length
    themesScore = Math.round(ratio * 25)
    if (hits >= 3)      reasons.push('Strong theme match')
    else if (hits >= 1) reasons.push('Partial theme match')
  }

  // Also check grant sectors against org themes directly
  const grantSectors = grant.sectors.map(s => s.toLowerCase())
  const orgThemesLower = (org.themes ?? []).map(t => t.toLowerCase())
  const sectorHits = grantSectors.filter(s =>
    orgThemesLower.some(t => s.includes(t.split(' ')[0]) || t.includes(s.split(' ')[0]))
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
  const eligibilityScore =
    org.org_type === 'registered_charity' ? 15 :
    org.org_type === 'cic'               ? 12 :
    org.org_type === 'social_enterprise' ? 10 : 8

  // ── Total ──────────────────────────────────────────────────────────────
  const score = Math.min(100,
    locationScore + themesScore + grantSizeScore + funderTypeScore + eligibilityScore
  )

  // Build reason string
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

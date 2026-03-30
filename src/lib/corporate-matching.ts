import type { Organisation, ImpactSector } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CorporatePartner {
  id: string
  company_name: string
  slug: string
  industry_sector: string | null
  website: string | null
  programme_name: string | null
  programme_url: string | null
  support_types: string[]
  csr_themes: string[]
  impact_sectors: string[]
  geographic_focus: string[]
  amount_min: number | null
  amount_max: number | null
  annual_investment_estimate: number | null
  application_route: string | null
  description: string | null
  contact_role: string | null
  contact_url: string | null
  is_active: boolean
  created_at: string | null
}

export interface CorporateMatchResult {
  partner: CorporatePartner
  score: number
  reason: string
  matchedSectors: string[]
}

// ── Sector mapping: org taxonomy → corporate sector strings ───────────────────
// The org uses ImpactSector enum values; the DB uses free-text strings.
const SECTOR_MAP: Record<ImpactSector, string[]> = {
  young_people:  ['youth', 'young people', 'children', 'children and young people'],
  community:     ['community', 'community development', 'community resilience', 'local communities'],
  health:        ['health', 'healthcare', 'public health'],
  mental_health: ['mental health', 'wellbeing', 'mental wellbeing'],
  housing:       ['housing', 'affordable housing', 'homelessness', 'community-led housing'],
  education:     ['education', 'learning', 'literacy', 'skills'],
  employment:    ['employment', 'employment and training', 'employability', 'enterprise', 'enterprise support'],
  disability:    ['disability', 'disabled people', 'accessibility'],
  older_people:  ['older people', 'elderly', 'age', 'ageing'],
  environment:   ['environment', 'climate', 'climate action', 'sustainability', 'biodiversity', 'green'],
  creative:      ['arts', 'arts and culture', 'creative', 'culture', 'creative industries'],
  heritage:      ['heritage', 'history', 'culture'],
  sport:         ['sport', 'sport and recreation', 'physical activity', 'community sport'],
  women:         ['women', "women and girls", 'gender', 'women in business'],
  justice:       ['justice', 'social justice', 'access to justice', 'human rights', 'racial equity', 'racial equality', 'criminal justice'],
  tech:          ['technology', 'digital', 'tech', 'innovation', 'digital inclusion', 'AI'],
  financial:     ['financial inclusion', 'financial wellbeing', 'debt', 'poverty'],
  food:          ['food', 'food poverty', 'nutrition', 'food bank'],
  international: ['international', 'global', 'international development'],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function locationMatchesFocus(location: string | null, focus: string[]): boolean {
  if (!location) return true
  const focusLower = focus.map(f => f.toLowerCase())
  // UK-wide or international = always matches
  if (focusLower.some(f => ['uk', 'international', 'uk, international', 'uk-wide'].includes(f))) return true
  const city = location.split(',')[0].trim().toLowerCase()
  return focusLower.some(f => f.includes(city) || city.includes(f))
}

function isLocalFocus(location: string | null, focus: string[]): boolean {
  if (!location) return false
  const ukWide = ['uk', 'international', 'uk, international', 'uk-wide']
  const city = location.split(',')[0].trim().toLowerCase()
  return focus.some(f => {
    const fl = f.toLowerCase()
    return !ukWide.includes(fl) && (fl.includes(city) || city.includes(fl))
  })
}

// ── Main matching function ────────────────────────────────────────────────────

export function computeCorporateMatches(
  partners: CorporatePartner[],
  org: Organisation,
): CorporateMatchResult[] {
  const orgSectors = ((org.impact_sectors ?? []) as ImpactSector[])
  const orgThemes  = (org.themes ?? []).map(t => t.toLowerCase())

  // Expand org sectors into all matching corporate-side strings
  const orgSectorTerms = orgSectors.flatMap(s => SECTOR_MAP[s] ?? [])

  const results: CorporateMatchResult[] = []

  for (const partner of partners) {
    if (!partner.is_active) continue

    let score = 0
    const matchedSectors: string[] = []

    // ── 1. Sector match (0–55) ─────────────────────────────────────────────
    const partnerSectors = partner.impact_sectors.map(s => s.toLowerCase())
    const matched = partnerSectors.filter(ps =>
      orgSectorTerms.some(ot => ps.includes(ot) || ot.includes(ps))
    )
    if (partnerSectors.length === 0) {
      score += 20 // no sector data — neutral
    } else {
      const sectorScore = matched.length === 0 ? 5 : matched.length === 1 ? 32 : matched.length === 2 ? 44 : 55
      score += sectorScore
    }
    matchedSectors.push(...matched)

    // ── 2. CSR theme match (0–25) ──────────────────────────────────────────
    const partnerThemes = partner.csr_themes.map(t => t.toLowerCase())
    let themeHits = 0

    // Match org themes directly
    for (const ot of orgThemes) {
      if (partnerThemes.some(pt => pt.includes(ot) || ot.includes(pt))) themeHits++
    }
    // Also match via sector expansion
    if (themeHits === 0) {
      for (const term of orgSectorTerms) {
        if (partnerThemes.some(pt => pt.includes(term) || term.includes(pt))) { themeHits++; break }
      }
    }

    score += themeHits === 0 ? 5 : themeHits === 1 ? 15 : 25

    // ── 3. Geography match (0–20) ──────────────────────────────────────────
    if (!locationMatchesFocus(org.primary_location, partner.geographic_focus)) {
      score += 0
    } else if (isLocalFocus(org.primary_location, partner.geographic_focus)) {
      score += 20
    } else {
      score += 12
    }

    score = Math.min(100, score)

    // ── Build reason ───────────────────────────────────────────────────────
    let reason: string
    if (matched.length > 0) {
      const sectorNames = matched.slice(0, 2).join(' and ')
      reason = `Your work in ${sectorNames} aligns with their CSR priorities.`
    } else if (themeHits > 0) {
      reason = 'Their CSR themes match your focus areas.'
    } else {
      reason = 'Potential partnership based on your organisation type.'
    }

    results.push({ partner, score, reason, matchedSectors })
  }

  return results
    .filter(r => r.score >= 30)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}

// ── Display helpers ───────────────────────────────────────────────────────────

export const SUPPORT_TYPE_LABELS: Record<string, string> = {
  cash_grant:       'Cash grant',
  in_kind:          'In-kind',
  tech_product:     'Free tech',
  volunteering:     'Volunteering',
  matched_giving:   'Matched giving',
  pro_bono:         'Pro bono',
  social_investment:'Social investment',
  accelerator:      'Accelerator',
  sponsorship:      'Sponsorship',
}

export const APPLICATION_ROUTE_LABELS: Record<string, string> = {
  open_application:  'Open applications',
  invitation_only:   'Invitation only',
  relationship_based:'Approach directly',
  formal_programme:  'Formal programme',
  community_fund:    'Community vote',
}

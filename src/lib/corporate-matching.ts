import type { Organisation, ImpactSector } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PartnerBrief {
  category: 'grant_programme' | 'pro_bono' | 'tech_donation' | 'social_investment' | 'corporate_csr'
  when_to_apply?: string
  how_competitive?: string
  what_they_fund?: string
  what_they_dont_fund?: string
  strategic_approach?: string
  typical_timeline?: string
  key_facts?: string[]
}

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
  example_recipients: string[]
  contact_role: string | null
  contact_url: string | null
  is_active: boolean
  partner_brief: PartnerBrief | null
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

    // ── Build reason (specific + actionable) ──────────────────────────────
    const category = partner.partner_brief?.category ?? 'corporate_csr'
    const progName = partner.programme_name ?? partner.company_name
    let reason: string

    if (matched.length > 0) {
      const sectorLabel = matched[0].replace(/_/g, ' ')
      const amountStr = partner.amount_max
        ? ` (up to £${partner.amount_max >= 1_000_000 ? (partner.amount_max / 1_000_000).toFixed(1) + 'm' : (partner.amount_max / 1_000).toFixed(0) + 'k'})`
        : partner.amount_min
          ? ` (from £${(partner.amount_min / 1_000).toFixed(0)}k)`
          : ''

      if (category === 'grant_programme') {
        const route = partner.application_route
        const routeStr = route === 'open_application' ? 'open applications'
          : route === 'community_fund' ? 'a community vote'
          : route === 'formal_programme' ? 'a formal application process'
          : 'an application process'
        reason = `${progName} awards grants${amountStr} via ${routeStr}. Your work in ${sectorLabel} sits within their stated funding priorities.`
      } else if (category === 'pro_bono') {
        reason = `${progName} provides free professional support to organisations working on ${sectorLabel}. A strong fit — lead with your specific capacity need when approaching them.`
      } else if (category === 'tech_donation') {
        const supportStr = (partner.support_types ?? []).includes('tech_product') ? 'free or heavily discounted tools' : 'tech support'
        reason = `${partner.company_name} offers ${supportStr} to charities and non-profits. Your ${sectorLabel} work makes you eligible — this is a quick win worth pursuing first.`
      } else if (category === 'social_investment') {
        reason = `${partner.company_name} provides social investment and loans to organisations like yours. If you need growth capital beyond grants, they understand the sector.`
      } else {
        reason = `${progName}'s CSR focus on ${sectorLabel} aligns with your work${amountStr}. ${partner.application_route === 'relationship_based' ? 'Build a relationship before making a formal approach.' : 'Check their website for current programme timelines.'}`
      }
    } else if (themeHits > 0) {
      if (category === 'tech_donation') {
        reason = `${partner.company_name} offers free tools to eligible charities — straightforward to access and immediately useful for your operations.`
      } else if (category === 'pro_bono') {
        reason = `${progName} may be able to provide free professional support. Check their eligibility criteria and current capacity.`
      } else {
        reason = `${progName}'s broader CSR themes have some overlap with your focus — worth reviewing their current programme priorities before approaching.`
      }
    } else {
      if (category === 'tech_donation') {
        reason = `${partner.company_name} offers free tech tools to registered charities — check your eligibility and apply directly.`
      } else if (category === 'pro_bono') {
        reason = `${progName} offers free professional services — review their eligibility criteria to see if your organisation qualifies.`
      } else {
        reason = `Limited direct sector overlap, but ${partner.company_name}'s programme may still be worth exploring if your work touches their CSR priorities.`
      }
    }

    results.push({ partner, score, reason, matchedSectors })
  }

  return results
    .sort((a, b) => b.score - a.score)
}

// ── Display helpers ───────────────────────────────────────────────────────────

export const APPLICATION_ROUTE_LABELS: Record<string, string> = {
  open_application:  'Open Application',
  invitation_only:   'Invite Only',
  relationship_based:'Relationship-Based',
  community_fund:    'Community Vote',
  formal_programme:  'Formal Programme',
  unknown:           'Unknown',
}

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


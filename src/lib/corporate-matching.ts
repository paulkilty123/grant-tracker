import type { Organisation, ImpactSector } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PartnerBrief {
  // ── Category taxonomy ──────────────────────────────────────────────────────
  // structured_programme  : Formal open grant scheme — defined process, public calls
  // relationship_giving   : Informal / undisclosed giving through relationship cultivation.
  //                         No open calls; funding unlocks once trust is established.
  //                         Includes philanthropic arms of large corporates (JP Morgan,
  //                         Goldman Sachs) and medium-sized companies that give ad hoc.
  // non_cash_support      : Pro bono services, free tech / tools, social investment / loans.
  //                         The primary value is expertise or capital, not a cash grant.
  // innovation_commissioning: Company is actively seeking impact ventures or social enterprises
  //                         that solve a specific business / social problem for them. Also
  //                         covers sponsored accelerator or entrepreneur programmes.
  category: 'structured_programme' | 'relationship_giving' | 'non_cash_support' | 'innovation_commissioning'
  when_to_apply?: string
  how_competitive?: string
  what_they_fund?: string
  what_they_dont_fund?: string
  strategic_approach?: string
  typical_timeline?: string
  key_facts?: string[]
  // relationship_giving extras
  relationship_entry_point?: string   // e.g. "via employee secondment scheme" or "warm intro from board"
  evidence_of_giving?: string         // e.g. "Funded X and Y — both CICs in housing sector"
  // innovation_commissioning extras
  problems_they_solve?: string        // what business/social problem they're trying to crack
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

    // ── Build reason (specific + actionable per category) ─────────────────
    const category = partner.partner_brief?.category ?? 'relationship_giving'
    const progName = partner.programme_name ?? partner.company_name
    const brief    = partner.partner_brief
    let reason: string

    const amountStr = partner.amount_max
      ? ` (up to £${partner.amount_max >= 1_000_000 ? (partner.amount_max / 1_000_000).toFixed(1) + 'm' : (partner.amount_max / 1_000).toFixed(0) + 'k'})`
      : partner.amount_min
        ? ` (from £${(partner.amount_min / 1_000).toFixed(0)}k)`
        : ''

    if (category === 'structured_programme') {
      // Open / formal scheme — treat like a grant: apply directly
      const route = partner.application_route
      const routeStr = route === 'open_application' ? 'via open applications'
        : route === 'community_fund' ? 'through a community vote'
        : route === 'formal_programme' ? 'through a formal application process'
        : 'through an application process'
      if (matched.length > 0) {
        const sectorLabel = matched[0].replace(/_/g, ' ')
        reason = `${progName} awards grants${amountStr} ${routeStr}. Your work in ${sectorLabel} sits within their stated funding priorities.`
      } else if (themeHits > 0) {
        reason = `${progName} funds work in areas that overlap with your themes${amountStr}. Review their current guidelines and apply ${routeStr}.`
      } else {
        reason = `${progName} has an open grants programme${amountStr}. Check their current priorities — eligibility may be broader than sector alone.`
      }

    } else if (category === 'relationship_giving') {
      // Informal / undisclosed giving — no open calls, relationship is the door
      const entryPoint = brief?.relationship_entry_point
      const evidence   = brief?.evidence_of_giving
      if (matched.length > 0) {
        const sectorLabel = matched[0].replace(/_/g, ' ')
        reason = `${partner.company_name} funds informally through relationships — no open calls.${evidence ? ` They've previously supported work in ${sectorLabel}.` : ` Their CSR focus on ${sectorLabel} aligns with your work.`} ${entryPoint ? `Entry point: ${entryPoint}.` : 'Focus on building a relationship before any ask.'}`
      } else if (themeHits > 0) {
        reason = `${partner.company_name}'s giving priorities have some overlap with your themes. There's no formal application — cultivate the relationship first and let alignment do the work.`
      } else {
        reason = `${partner.company_name} gives informally through trusted relationships. Limited direct overlap now, but worth monitoring as your work develops — their priorities shift over time.`
      }

    } else if (category === 'non_cash_support') {
      // Pro bono, tech tools, social investment — value is expertise / capital / tools
      const supportTypes = partner.support_types ?? []
      const hasTech  = supportTypes.includes('tech_product')
      const hasProBono = supportTypes.includes('pro_bono')
      const hasInvestment = supportTypes.includes('social_investment')
      if (hasTech) {
        reason = matched.length > 0
          ? `${partner.company_name} offers free or discounted tools to eligible non-profits. Your ${matched[0].replace(/_/g, ' ')} work makes you a strong candidate — this is often a quick win.`
          : `${partner.company_name} provides free tech tools to registered charities and non-profits. Check your eligibility and apply directly.`
      } else if (hasInvestment) {
        reason = matched.length > 0
          ? `${partner.company_name} provides social investment and loans to mission-driven organisations. If you need growth capital beyond grants, they understand the ${matched[0].replace(/_/g, ' ')} sector.`
          : `${partner.company_name} offers social finance for organisations with trading income. Worth exploring if you need capital beyond grant funding.`
      } else if (hasProBono) {
        reason = matched.length > 0
          ? `${progName} provides free professional support to organisations working on ${matched[0].replace(/_/g, ' ')}. Lead with your specific capacity need when approaching them.`
          : `${progName} offers free professional services — review their eligibility criteria to see if your organisation qualifies.`
      } else {
        reason = matched.length > 0
          ? `${progName} provides non-cash support (${supportTypes.join(', ') || 'in-kind'}) to organisations working on ${matched[0].replace(/_/g, ' ')}.`
          : `${progName} offers in-kind support — check their website for eligibility and current availability.`
      }

    } else {
      // innovation_commissioning — company is seeking solutions, not distributing charity
      const problems = brief?.problems_they_solve
      if (matched.length > 0) {
        const sectorLabel = matched[0].replace(/_/g, ' ')
        reason = `${partner.company_name} is actively seeking impact ventures that address ${problems ?? sectorLabel}. Position yourself as a solution to their challenge, not a charity seeking support. Lead with the problem you solve and your evidence of impact.`
      } else if (themeHits > 0) {
        reason = `${partner.company_name} sponsors innovation and entrepreneur programmes in areas that touch your themes. If your model solves a problem they care about, approach them as a strategic partner.`
      } else {
        reason = `${partner.company_name} commissions or co-invests in ventures solving specific social or business challenges. Monitor their published priorities — a future alignment may make this worth pursuing.`
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


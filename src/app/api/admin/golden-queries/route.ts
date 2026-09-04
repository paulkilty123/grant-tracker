// Golden query test suite — runs ~14 representative user queries against the
// matching engine and reports pass/fail per query.
//
// Purpose: catch regressions in detection / eligibility / sectoring before
// they hit real users. Re-run weekly via Vercel cron. Without this,
// edge-case failures only surface in launch-week post-mortem.
//
// GET /api/admin/golden-queries
// Auth: ADMIN_SECRET bearer token, or admin session, or CRON_SECRET (for the
// weekly cron path).
//
// Each query defines:
//   - org: a minimal Organisation profile that simulates a real user
//   - filters: type (grant/programme/etc), location filter
//   - assertions: what MUST and MUST NOT appear in the top N matches
//
// Returns: per-query results + a summary count.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/admin/admin-db'
import { computeMatchScore } from '@/lib/matching'
import { normaliseScrapedGrant } from '@/lib/grants-normalise'
import type { Organisation, ImpactSector, BeneficiaryGroup, FundingType, LegalStructure } from '@/types'
import { recordRun } from '@/lib/admin/cron-runs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ADMIN_EMAIL = 'paulkilty1@gmail.com'

async function isAuthorised(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get('authorization') ?? ''
  const bearer = auth.replace('Bearer ', '').trim()
  if (bearer && bearer === process.env.ADMIN_SECRET) return true
  if (bearer && bearer === process.env.CRON_SECRET) return true
  // Session auth fallback — admin email check
  try {
    const { createClient: createSrv } = await import('@/lib/supabase/server')
    const sb = await createSrv()
    const { data: { user } } = await sb.auth.getUser()
    return user?.email === ADMIN_EMAIL
  } catch { return false }
}

function getAdminClient() {
  return getAdminDb()
}

// ─────────────────────────────────────────────────────────────────────────────
// Test-org factory — fills sensible defaults for fields the matching engine
// reads. Each query overrides only what's relevant to its scenario.
// ─────────────────────────────────────────────────────────────────────────────
function makeOrg(overrides: Partial<Organisation>): Organisation {
  return {
    id: 'test-org',
    created_at: new Date().toISOString(),
    name: 'Test Org',
    charity_number: null,
    cic_number: null,
    org_type: 'registered_charity',
    legal_structure: 'registered_charity' as LegalStructure,
    social_mission_declared: true,
    articles_restrict_profit: true,
    impact_sectors: [],
    niche_tags: [],
    excluded_niche_tags: [],
    has_asset_lock: true,
    years_trading: 5,
    org_stage: 'early',
    annual_income_band: '50k_to_250k',
    primary_location: 'London',
    areas_of_work: [],
    beneficiaries: [],
    beneficiary_groups: [],
    themes: [],
    mission: null,
    min_grant_target: 5000,
    max_grant_target: 50000,
    funder_type_preferences: [],
    funding_type_preferences: [],
    funding_subtype_preferences: [],
    spend_restriction_preferences: [],
    people_per_year: 200,
    volunteers: 10,
    years_operating: 5,
    projects_running: 2,
    key_outcomes: [],
    owner_id: 'test',
    geographic_reach: 'local',
    website_url: null,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Assertion shape
// ─────────────────────────────────────────────────────────────────────────────
interface QueryAssertions {
  minTopMatches?: number       // at least N grants score >= scoreThreshold in top-50
  scoreThreshold?: number      // default 50
  mustIncludeFunderRegex?: RegExp[]   // each must match at least one funder in top-50
  mustNotIncludeFunderRegex?: RegExp[]// each must match nothing in top-50
  topResultMinScore?: number   // #1 result must score >= this
}

interface GoldenQuery {
  name: string
  description: string
  filterType?: FundingType   // if set, only consider grants of this type
  org: Organisation
  assertions: QueryAssertions
}

// ─────────────────────────────────────────────────────────────────────────────
// 14 representative queries
// ─────────────────────────────────────────────────────────────────────────────
const QUERIES: GoldenQuery[] = [
  {
    name: 'london-youth-charity-small',
    description: 'London registered charity working with young people, £10k–£50k',
    filterType: 'grant',
    org: makeOrg({
      legal_structure: 'registered_charity',
      primary_location: 'London',
      impact_sectors: ['young_people', 'community'] as ImpactSector[],
      beneficiary_groups: ['young_people'] as BeneficiaryGroup[],
      min_grant_target: 10000,
      max_grant_target: 50000,
    }),
    assertions: {
      minTopMatches: 5,
      mustIncludeFunderRegex: [/BBC Children in Need|City Bridge|John Lyon|Mayor of London|London Community|Tower Hamlets|Camden|Lambeth|Hackney|Trust for London|Jack Petchey/i],
      mustNotIncludeFunderRegex: [/^Innovate UK$|UK Research and Innovation|UKRI/i],
      topResultMinScore: 60,
    },
  },
  {
    name: 'sussex-cic-environment',
    description: 'Brighton CIC working on climate / environment, rolling deadlines',
    filterType: 'grant',
    org: makeOrg({
      legal_structure: 'cic_guarantee',
      org_type: 'cic',
      social_mission_declared: true,
      primary_location: 'Brighton',
      impact_sectors: ['environment', 'community'] as ImpactSector[],
      min_grant_target: 5000,
      max_grant_target: 50000,
    }),
    assertions: {
      minTopMatches: 3,
      mustIncludeFunderRegex: [/Sussex|Brighton|Community Foundation|National Lottery/i],
      mustNotIncludeFunderRegex: [/^Innovate UK$/i],
    },
  },
  {
    name: 'national-mental-health-charity',
    description: 'UK-wide registered charity, mental health work, mid-size £25k–£250k',
    filterType: 'grant',
    org: makeOrg({
      legal_structure: 'registered_charity',
      primary_location: 'UK',
      geographic_reach: 'national',
      impact_sectors: ['mental_health', 'health'] as ImpactSector[],
      beneficiary_groups: ['mental_health'] as BeneficiaryGroup[],
      min_grant_target: 25000,
      max_grant_target: 250000,
      annual_income_band: '250k_to_1m',
    }),
    assertions: {
      minTopMatches: 5,
      mustIncludeFunderRegex: [/Henry Smith|Lloyds Bank Foundation|Esmée|Paul Hamlyn|JRCT|Rayne|Tudor|Garfield Weston|Mental Health|MQ/i],
    },
  },
  {
    name: 'small-cic-shares-social-enterprise',
    description: 'Small Ltd-by-shares social enterprise — seed funding stage',
    filterType: 'investment',
    org: makeOrg({
      legal_structure: 'cic_shares',
      org_type: 'cic',
      social_mission_declared: true,
      articles_restrict_profit: false,
      org_stage: 'pre_revenue',
      primary_location: 'UK',
      impact_sectors: ['social_innovation', 'community'] as ImpactSector[],
      annual_income_band: 'under_50k',
    }),
    assertions: {
      minTopMatches: 3,
      mustIncludeFunderRegex: [/Big Issue Invest|Key Fund|Charity Bank|Triodos|Resonance|Bethnal Green Ventures|UnLtd|SSE/i],
    },
  },
  {
    name: 'community-group-unincorporated',
    description: 'Unincorporated community group, micro-grant range £500–£5k',
    filterType: 'grant',
    org: makeOrg({
      legal_structure: 'unincorporated',
      org_type: 'community_group',
      primary_location: 'London',
      impact_sectors: ['community'] as ImpactSector[],
      min_grant_target: 500,
      max_grant_target: 5000,
      annual_income_band: 'under_50k',
      years_trading: 1,
    }),
    assertions: {
      minTopMatches: 5,
      mustIncludeFunderRegex: [/Awards for All|National Lottery|Tesco|Movement for Good|TheGivingMachine|Postcode|Co-op/i],
    },
  },
  {
    name: 'arts-charity-theatre',
    description: 'Theatre / performing-arts registered charity, £10k–£100k',
    filterType: 'grant',
    org: makeOrg({
      legal_structure: 'registered_charity',
      primary_location: 'London',
      impact_sectors: ['creative'] as ImpactSector[],
      niche_tags: ['theatre', 'performing arts'],
      min_grant_target: 10000,
      max_grant_target: 100000,
    }),
    assertions: {
      minTopMatches: 3,
      mustIncludeFunderRegex: [/Arts Council|Andrew Lloyd Webber|Foyle|Wolfson|Garfield Weston|Esmée|Paul Hamlyn|Heritage/i],
    },
  },
  {
    name: 'refugees-migrants-charity',
    description: 'Charity working with refugees / asylum seekers / migrants',
    filterType: 'grant',
    org: makeOrg({
      legal_structure: 'cio',
      primary_location: 'London',
      impact_sectors: ['justice', 'community'] as ImpactSector[],
      beneficiary_groups: ['refugees_migrants'] as BeneficiaryGroup[],
      min_grant_target: 10000,
      max_grant_target: 100000,
    }),
    assertions: {
      minTopMatches: 3,
      mustIncludeFunderRegex: [/Paul Hamlyn|Trust for London|JRCT|Esmée|Rosa|Hilden|Sigrid Rausing|Refugee/i],
    },
  },
  {
    name: 'sport-charity-grassroots',
    description: 'Grassroots sport charity in West Midlands',
    filterType: 'grant',
    org: makeOrg({
      legal_structure: 'registered_charity',
      primary_location: 'Birmingham',
      impact_sectors: ['sport', 'young_people'] as ImpactSector[],
      min_grant_target: 1000,
      max_grant_target: 25000,
    }),
    assertions: {
      minTopMatches: 3,
      mustIncludeFunderRegex: [/Sport England|Football Foundation|Heart of England|Wooden Spoon|Severn Trent/i],
    },
  },
  {
    name: 'disability-charity',
    description: 'Charity supporting disabled people — UK-wide',
    filterType: 'grant',
    org: makeOrg({
      legal_structure: 'registered_charity',
      primary_location: 'UK',
      impact_sectors: ['disability', 'health'] as ImpactSector[],
      beneficiary_groups: ['disabled_people'] as BeneficiaryGroup[],
      min_grant_target: 5000,
      max_grant_target: 100000,
    }),
    assertions: {
      minTopMatches: 5,
      mustIncludeFunderRegex: [/True Colours|Variety|Henry Smith|Paul Hamlyn|Lloyds Bank Foundation|Wolfson|Dunhill/i],
    },
  },
  {
    name: 'food-poverty-emergency',
    description: 'Food bank / food poverty charity, emergency funding',
    filterType: 'grant',
    org: makeOrg({
      legal_structure: 'cio',
      primary_location: 'Manchester',
      impact_sectors: ['food', 'community'] as ImpactSector[],
      beneficiary_groups: ['people_in_poverty', 'families'] as BeneficiaryGroup[],
      min_grant_target: 1000,
      max_grant_target: 25000,
    }),
    assertions: {
      minTopMatches: 3,
      mustIncludeFunderRegex: [/Tesco|Cash for Kids|National Lottery|Forever Manchester|GMCF|Greater Manchester|Trussell/i],
    },
  },
  {
    name: 'in-kind-tech-needed',
    description: 'Charity needs in-kind tech / pro-bono support',
    filterType: 'in_kind',
    org: makeOrg({
      legal_structure: 'registered_charity',
      primary_location: 'UK',
      impact_sectors: ['tech', 'community'] as ImpactSector[],
    }),
    assertions: {
      minTopMatches: 5,
      mustIncludeFunderRegex: [/Microsoft|Salesforce|Google|TechSoup|Pilotlight|Cranfield|LawWorks|Reach Volunteering|Pro Bono|Charity Digital/i],
    },
  },
  {
    name: 'leadership-programme',
    description: 'Charity seeking leadership / capacity-building programme',
    filterType: 'programme',
    org: makeOrg({
      legal_structure: 'registered_charity',
      primary_location: 'UK',
      impact_sectors: ['community'] as ImpactSector[],
      org_stage: 'growth',
    }),
    assertions: {
      minTopMatches: 3,
      mustIncludeFunderRegex: [/Clore|UnLtd|SSE|Acumen|Year Here|On Purpose|Pilotlight|Cause4|Rank Foundation/i],
    },
  },
  {
    name: 'older-people-rural',
    description: 'Charity working with older people in rural Devon',
    filterType: 'grant',
    org: makeOrg({
      legal_structure: 'cio',
      primary_location: 'Devon',
      impact_sectors: ['older_people', 'health'] as ImpactSector[],
      beneficiary_groups: ['older_people'] as BeneficiaryGroup[],
      min_grant_target: 1000,
      max_grant_target: 25000,
    }),
    assertions: {
      minTopMatches: 2,
      mustIncludeFunderRegex: [/Devon|South West|Somerset|Quartet|Community Foundation|Charles Hayward|Older|Age UK/i],
    },
  },
  {
    name: 'lgbtq-rights-charity',
    description: 'LGBTQ+ rights and welfare charity, UK-wide',
    filterType: 'grant',
    org: makeOrg({
      legal_structure: 'registered_charity',
      primary_location: 'UK',
      impact_sectors: ['justice', 'community'] as ImpactSector[],
      beneficiary_groups: ['lgbtq'] as BeneficiaryGroup[],
      min_grant_target: 5000,
      max_grant_target: 50000,
    }),
    assertions: {
      minTopMatches: 2,
      mustIncludeFunderRegex: [/Pride|LGBT|Trust for London|Lloyds Bank Foundation|National Lottery|JRCT|Esmée|Paul Hamlyn/i],
    },
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let httpStatus = 200
  const payload = await recordRun('golden-queries', async () => {
    const supabase = getAdminClient()

    // Load all active grants once
    const { data: rows, error } = await supabase
      .from('grants_with_funder')
      .select('*')
      .eq('is_active', true)
      .limit(2000)

    if (error) { httpStatus = 500; return { error: error.message } }

    const grants = (rows ?? []).map(normaliseScrapedGrant)

    const results = QUERIES.map(q => {
      // Filter by funding_type if specified
      const pool = q.filterType
        ? grants.filter(g => g.fundingType === q.filterType)
        : grants

      // Score every grant in the pool
      const scored = pool
        .map(g => ({ grant: g, result: computeMatchScore(g, q.org) }))
        .sort((a, b) => b.result.score - a.result.score)

      // Inspect top 50 for assertions
      const top = scored.slice(0, 50)
      const a = q.assertions
      const scoreThreshold = a.scoreThreshold ?? 50

      const failures: string[] = []

      if (a.minTopMatches !== undefined) {
        const aboveThreshold = top.filter(t => t.result.score >= scoreThreshold).length
        if (aboveThreshold < a.minTopMatches) {
          failures.push(`Only ${aboveThreshold} grants scored ≥${scoreThreshold} (expected ≥${a.minTopMatches})`)
        }
      }

      if (a.topResultMinScore !== undefined && top.length > 0) {
        if (top[0].result.score < a.topResultMinScore) {
          failures.push(`Top result scored ${top[0].result.score} (expected ≥${a.topResultMinScore}). Top: "${top[0].grant.title}"`)
        }
      }

      if (a.mustIncludeFunderRegex) {
        for (const re of a.mustIncludeFunderRegex) {
          const hit = top.find(t => re.test(t.grant.funder) || re.test(t.grant.title))
          if (!hit) {
            failures.push(`No funder/title in top-50 matches ${re}`)
          }
        }
      }

      if (a.mustNotIncludeFunderRegex) {
        for (const re of a.mustNotIncludeFunderRegex) {
          const hits = top.filter(t => re.test(t.grant.funder))
          if (hits.length > 0) {
            failures.push(`${hits.length} unexpected match(es) for ${re}: ${hits.slice(0, 3).map(h => h.grant.funder).join(', ')}`)
          }
        }
      }

      return {
        name: q.name,
        description: q.description,
        pass: failures.length === 0,
        failures,
        top5: top.slice(0, 5).map(t => ({
          score: t.result.score,
          title: t.grant.title,
          funder: t.grant.funder,
          location: t.grant.locationTag ?? null,
        })),
      }
    })

    const summary = {
      ranAt:    new Date().toISOString(),
      grants:   grants.length,
      queries:  QUERIES.length,
      passed:   results.filter(r => r.pass).length,
      failed:   results.filter(r => !r.pass).length,
    }

    return { summary, results }
  })
  return NextResponse.json(payload, { status: httpStatus })
}

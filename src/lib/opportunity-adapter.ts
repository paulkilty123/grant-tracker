// Grant Tracker MCP v1 — external contract adapter.
//
// Translates raw `scraped_grants` rows (plus optional `funders` enrichment)
// into the v4 external shape consumed by MCP tool handlers. The adapter is
// pure: it takes already-fetched data and projects. DB access lives in the
// MCP route handler, not here.
//
// Spec: docs/mcp-spec-v1.md
// Funder_brief split is enforced at the type level — app-only keys
// (funder_tips, how_to_apply, strong_application, decision_timeline) are
// not in any MCP-side return shape.

// ──────────────────────────────────────────────────────────────────────────
// Raw inputs (DB row shapes)
// ──────────────────────────────────────────────────────────────────────────

export interface ScrapedGrantRow {
  id: string                                 // uuid — used as the public opportunity_id
  external_id: string | null                 // legacy text id (NOT exposed)
  source: string | null
  title: string | null
  funder: string | null
  funder_type: string | null
  funding_type: string | null
  description: string | null
  amount_min: number | null
  amount_max: number | null
  amount_undisclosed: boolean | null         // funder affirmatively discloses no fixed amount
  deadline: string | null                    // YYYY-MM-DD
  is_rolling: boolean | null
  is_active: boolean | null
  url_status: string | null                  // 'ok' | 'unchecked' | 'dead'
  apply_url: string | null
  last_seen_at: string | null
  location_tag: string | null
  eligible_structures: string[] | null
  impact_sectors: string[] | null
  target_beneficiaries: string[] | null
  beneficiary_tags: string[] | null
  eligibility_criteria: string[] | null
  funder_brief: RawFunderBrief | null
  next_open_date: string | null              // free-form text e.g. "Spring 2027"
  next_open_date_parsed: string | null       // YYYY-MM-DD — populated when text resolves to a specific date
}

export interface FunderRow {
  id: string
  name: string
  short_name: string | null
  website: string | null
  funder_type: string | null
  geographic_scope: string[] | null
  sector_tags: string[] | null
  typical_min: number | null
  typical_max: number | null
  is_rolling: boolean | null
  default_funding_type: string | null
}

// Internal — full DB shape of funder_brief. App-only keys live here but
// never appear in any exported MCP type.
interface RawFunderBrief {
  who_can_apply?: string | null
  what_they_fund?: string | null
  priorities?: string | null
  exclusions?: string | null
  geographic_focus?: string | null
  typical_award?: string | null
  funder_tips?: string | null                // APP-ONLY
  how_to_apply?: string | null               // APP-ONLY
  strong_application?: string | null         // APP-ONLY
  decision_timeline?: string | null          // APP-ONLY
  source?: string | null
  last_enriched?: string | null
}

// ──────────────────────────────────────────────────────────────────────────
// External contract (output shapes — see spec §4)
// ──────────────────────────────────────────────────────────────────────────

export type MCPFundingType = 'grant' | 'programme' | 'investment' | 'in_kind'

export type MCPSignal =
  | 'sector_match'
  | 'geographic_match'
  | 'amount_in_range'
  | 'structure_eligible'
  | 'funder_alignment'
  | 'beneficiary_match'

export interface MCPAmount {
  min: number | null
  max: number | null
  currency: 'GBP'
  typical: string | null
  // true  → funder affirmatively discloses no fixed per-grant amount (aggregate
  //         fund only / "not specified"). Surface honestly as "amount not
  //         disclosed — check with funder", NOT as a £0 or fabricated range.
  // false → amount simply not in our catalogue yet (unknown/unextracted).
  // The agent should treat these differently: undisclosed is a property of the
  // funder; the false-but-null case is a gap on our side.
  undisclosed: boolean
}

export interface MCPDeadline {
  // 'fixed'          — a future deadline; surface "closes X" / "X days remaining"
  // 'rolling'        — no fixed deadline, apply any time
  // 'between_rounds' — annual/recurring fund currently closed; date is when the
  //                    NEXT round opens. Set when last cycle's deadline is past
  //                    but next_open_date_parsed is in the future. Surface
  //                    honestly as "Currently closed — next opens [date]".
  // 'closed'         — fund's most-recent cycle closed AND no known next round.
  type: 'fixed' | 'rolling' | 'between_rounds' | 'closed'
  // For fixed:          the deadline date (YYYY-MM-DD)
  // For rolling:        null
  // For between_rounds: the next opening date (YYYY-MM-DD, may be a 1st-of-month estimate)
  // For closed:         the last cycle's deadline date
  date: string | null
  // Days from today.
  // Fixed:          positive (deadline ahead)
  // Rolling:        null
  // Between_rounds: positive (days until next opens)
  // Closed:         negative (days past the last deadline)
  days_until: number | null
  // Only set on type='between_rounds'. The free-form admin-side description of
  // the next opening, e.g. "Spring 2027" or "February 2027". When the parsed
  // date is a placeholder (1st-of-month estimate), this is the source of truth
  // for what the agent should surface to the user.
  next_open_text?: string | null
}

export interface MCPMatchQuality {
  score: number
  signals: MCPSignal[]
}

// Search result tier — match_quality omitted; computed separately by the
// search tool with knowledge of the query context.
//
// apply_url: the funder's own application page. This is the PRIMARY citation
// per result — what users click to apply or independently verify the source.
// Renamed from `url` 2026-05-26 because the generic name caused Claude to
// default to grant_tracker_url (which it could find by name) instead of the
// funder URL (which it couldn't, despite the description telling it to).
export interface MCPOpportunitySummary {
  opportunity_id: string
  title: string
  funder: string
  funding_type: MCPFundingType
  amount: MCPAmount
  deadline: MCPDeadline
  geographic_scope: string
  eligibility_summary: string
  apply_url: string
  grant_tracker_url: string
}

export type MCPOpportunity = MCPOpportunitySummary & { match_quality: MCPMatchQuality }

// Detail tier (spec §4.2)
export interface MCPOpportunityDetail {
  opportunity_id: string
  title: string
  funder: string
  funding_type: MCPFundingType
  amount: MCPAmount & { notes: string | null }
  deadline: MCPDeadline & { notes: string | null }
  eligibility: {
    summary: string
    who_can_apply: string
    eligible_structures: string[]
    geographic_scope: string
    exclusions: string
  }
  scope: {
    what_they_fund: string
    priorities: string
    sectors: string[]
    beneficiary_groups: string[]
  }
  application: {
    process_summary: string
    apply_url: string
  }
  funder_summary: {
    name: string
    type: string
    brief_description: string
  } | null
  metadata: {
    last_updated: string
    data_freshness: 'verified' | 'unverified'
    source: string
  }
  links: {
    funder_url: string
    grant_tracker_url: string
  }
}

// Provider intelligence (spec §4.3)
export interface MCPProviderIntelligence {
  provider: {
    name: string
    type: string
    type_label: string
    website: string | null
    data_richness: 'enriched' | 'basic'
  }
  what_they_fund: string
  who_can_apply: string
  priorities: string
  exclusions: string
  geographic_focus: string
  typical_award: string
  active_opportunities: {
    count: number
    by_type: Record<MCPFundingType, number>
    opportunity_ids: string[]
  }
  enriched_data?: {
    sectors_funded: string[]
    typical_amount_range: { min: number | null; max: number | null; currency: 'GBP' }
    geographic_scope_detail: string
    short_name: string | null
  }
  links: {
    funder_url: string | null
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Context + URL builders
// ──────────────────────────────────────────────────────────────────────────

export interface AdapterContext {
  utm_source: string
  tool: string
  campaign?: string
  base_url?: string
}

const DEFAULT_BASE_URL = 'https://granttracker.co.uk'
const DEFAULT_CAMPAIGN = 'v1_launch'

function utmQuery(ctx: AdapterContext): string {
  const params = new URLSearchParams({
    utm_source: ctx.utm_source,
    utm_medium: 'mcp',
    utm_campaign: ctx.campaign ?? DEFAULT_CAMPAIGN,
    utm_content: ctx.tool,
  })
  return params.toString()
}

export function buildGrantTrackerUrl(opportunity_id: string, ctx: AdapterContext): string {
  const base = ctx.base_url ?? DEFAULT_BASE_URL
  // Public bridge page (src/app/grants/[id]) — renders logged-out, no auth wall.
  // Was /dashboard/grants/{id} (authed app route), which bounced MCP users who
  // weren't signed in to a login screen and broke the conversion bridge.
  return `${base}/grants/${opportunity_id}?${utmQuery(ctx)}`
}

// buildGrantTrackerProviderUrl removed with Q3(b): provider-intelligence no
// longer emits a grant_tracker_url, so the /funders/{slug} builder had no
// remaining caller.

// ──────────────────────────────────────────────────────────────────────────
// Taxonomies and mappings
// ──────────────────────────────────────────────────────────────────────────

// 14 canonical sectors (spec §4.4, updated 2026-05-12)
export const MCP_SECTORS = [
  'sport', 'heritage', 'social_economy', 'creative', 'community',
  'education', 'employment', 'health', 'mental_health', 'housing',
  'environment', 'food', 'tech', 'justice',
] as const
export type MCPSector = typeof MCP_SECTORS[number]

// 12 canonical regions (spec §4.4, defined 2026-05-12; midlands is single — data does not support split)
export const MCP_REGIONS = [
  'uk_wide', 'england', 'scotland', 'wales', 'northern_ireland',
  'london', 'north_west', 'north_east', 'yorkshire_and_humber',
  'midlands', 'south_east', 'south_west',
] as const
export type MCPRegion = typeof MCP_REGIONS[number]

export const MCP_FUNDING_TYPES: MCPFundingType[] = ['grant', 'programme', 'investment', 'in_kind']

// ──────────────────────────────────────────────────────────────────────────
// Filter expansion — spec tokens → DB-side filter values
// Used by search_funding_and_support to translate canonical agent-facing
// tokens into the values that match scraped_grants rows.
// ──────────────────────────────────────────────────────────────────────────

// Region → location_tag substring patterns. The search OR-matches these
// case-insensitively. Mirrors REGION_KEYWORDS used in display direction.
// `uk_wide` is special: when in the user's filter list, the search also
// includes UK-tagged rows for any other region they specified (UK-wide
// opportunities should always surface for a region-specific query unless
// the user explicitly excludes them).
// Each English sub-region's pattern list ALSO includes 'england' so that
// England-wide rows (location_tag = 'England', 'England & ...', etc.) surface
// for sub-region queries — these national funders are the most-expected
// catalogue rows for any English applicant. Wales/Scotland/NI aren't
// subdivided in MCP_REGIONS, so their parent matching is direct.
//
// 'great britain' is in uk_wide because the literal substring 'uk' doesn't
// appear in 'Great Britain'; without it, that row would be invisible to all
// regional queries.
export const REGION_DB_PATTERNS: Record<MCPRegion, string[]> = {
  uk_wide:              ['uk', 'uk-wide', 'uk wide', 'nationwide', 'great britain'],
  england:              ['england'],
  scotland:             ['scotland', 'glasgow', 'edinburgh', 'aberdeen', 'dundee'],
  wales:                ['wales', 'cardiff', 'swansea'],
  northern_ireland:     ['northern ireland', 'belfast', 'n. ireland', 'n ireland'],
  london:               ['london', 'england', 'barking and dagenham', 'barnet', 'bexley', 'brent', 'bromley', 'camden', 'city of london', 'croydon', 'ealing', 'enfield', 'greenwich', 'hackney', 'hammersmith', 'haringey', 'harrow', 'havering', 'hillingdon', 'hounslow', 'islington', 'kensington', 'kingston upon thames', 'lambeth', 'lewisham', 'merton', 'newham', 'redbridge', 'richmond', 'southwark', 'sutton', 'tower hamlets', 'waltham forest', 'wandsworth', 'westminster'],
  north_west:           ['north west', 'north-west', 'england', 'manchester', 'liverpool', 'cumbria', 'lancashire'],
  north_east:           ['north east', 'north-east', 'england', 'newcastle', 'tyne', 'durham', 'northumberland'],
  yorkshire_and_humber: ['yorkshire', 'humber', 'england', 'leeds', 'sheffield', 'bradford'],
  midlands:             ['midlands', 'england', 'birmingham', 'coventry', 'worcestershire', 'warwickshire', 'nottingham', 'leicester'],
  south_east:           ['south east', 'south-east', 'england', 'sussex', 'kent', 'surrey', 'berkshire', 'brighton', 'chichester', 'worthing', 'essex', 'lewes', 'rye', 'crawley', 'gatwick', 'eastbourne', 'hastings', 'horsham'],
  south_west:           ['south west', 'south-west', 'england', 'somerset', 'devon', 'cornwall', 'bristol', 'gloucester', 'dorset', 'wiltshire'],
}

// Parent-country map used by computeMatchQuality (scoring path) so that
// English sub-region queries also credit England-wide rows with a
// geographic_match signal. Mirrors the inheritance baked into
// REGION_DB_PATTERNS — without this, England rows surface (filter passes
// them) but rank low because the scoring check denies the signal.
//
// Scotland/Wales/NI have no sub-regions in MCP_REGIONS — no inheritance.
export const PARENT_REGION_OF_SUB: Partial<Record<MCPRegion, MCPRegion>> = {
  london:               'england',
  north_west:           'england',
  north_east:           'england',
  yorkshire_and_humber: 'england',
  midlands:             'england',
  south_east:           'england',
  south_west:           'england',
}

// Region LABEL patterns — the canonical regional label itself, used by the
// graduated geographic scoring in computeMatchQuality. Distinct from
// REGION_DB_PATTERNS (which also includes sub-places like 'sussex', 'brighton'
// for filter inheritance). A row whose location_tag matches the LABEL pattern
// gets the top geographic score (1.0); a row whose tag is a sub-place inside
// the region gets 0.9; a parent-country tag gets 0.8; uk_wide gets 0.5.
export const REGION_LABEL_PATTERNS: Record<MCPRegion, string[]> = {
  uk_wide:              ['uk', 'uk-wide', 'uk wide', 'nationwide', 'great britain'],
  england:              ['england'],
  scotland:             ['scotland'],
  wales:                ['wales'],
  northern_ireland:     ['northern ireland', 'n. ireland', 'n ireland'],
  london:               ['london'],
  north_west:           ['north west', 'north-west'],
  north_east:           ['north east', 'north-east'],
  yorkshire_and_humber: ['yorkshire', 'humber'],
  midlands:             ['midlands'],
  south_east:           ['south east', 'south-east'],
  south_west:           ['south west', 'south-west'],
}

// User-facing beneficiary token → DB-side tokens that should match.
// Inverse of BENEFICIARY_CANONICALISATION: when the user says
// "people_in_poverty", the search needs to match rows tagged with either
// "people_in_poverty" OR the unmerged "low_income".
export const BENEFICIARY_REVERSE_MAP: Record<string, string[]> = {
  young_people:             ['young_people'],
  children:                 ['children'],
  people_in_poverty:        ['people_in_poverty', 'low_income'],
  mental_health:            ['mental_health', 'mental_health_conditions'],
  disabled_people:          ['disabled_people'],
  older_people:             ['older_people'],
  women_girls:              ['women_girls'],
  families:                 ['families'],
  refugees_migrants:        ['refugees_migrants'],
  homeless:                 ['homeless'],
  rural_communities:        ['rural_communities'],
  lgbtq:                    ['lgbtq'],
  ethnic_minorities:        ['ethnic_minorities'],
  justice_involved:         ['justice_involved', 'ex_offenders'],
  carers:                   ['carers'],
  care_experienced:         ['care_experienced'],
  domestic_abuse_survivors: ['domestic_abuse_survivors'],
  veterans:                 ['veterans'],
}

// User-facing funding_type → DB funding_type values. Mirror of the
// mapFundingType() coercion: programme search should also match DB rows
// tagged accelerator; investment search should also match blended_finance.
export const FUNDING_TYPE_DB_EXPANSIONS: Record<MCPFundingType, string[]> = {
  grant:      ['grant'],
  programme:  ['programme', 'accelerator'],
  investment: ['investment', 'blended_finance'],
  in_kind:    ['in_kind'],
}

// ──────────────────────────────────────────────────────────────────────────
// Taxonomy labels (consumed by get_taxonomy tool — spec §4.4)
// ──────────────────────────────────────────────────────────────────────────

export const SECTOR_LABELS: Record<MCPSector, string> = {
  sport:           'Sport & Physical Activity',
  heritage:        'Heritage & Culture',
  social_economy:  'Co-ops & Community Ownership',
  creative:        'Arts & Creative Industries',
  community:       'Community Development',
  education:       'Education & Skills',
  employment:      'Employment & Livelihoods',
  health:          'Health & Wellbeing',
  mental_health:   'Mental Health',
  housing:         'Housing & Homelessness',
  environment:     'Environment & Climate',
  food:            'Food & Agriculture',
  tech:            'Tech for Good',
  justice:         'Justice & Rights',
}

export const REGION_LABELS: Record<MCPRegion, string> = {
  uk_wide:              'UK-wide',
  england:              'England',
  scotland:             'Scotland',
  wales:                'Wales',
  northern_ireland:     'Northern Ireland',
  london:               'London',
  north_west:           'North West',
  north_east:           'North East',
  yorkshire_and_humber: 'Yorkshire and the Humber',
  midlands:             'Midlands',
  south_east:           'South East',
  south_west:           'South West',
}

// Agent-facing structure tokens — the labels the get_taxonomy tool returns.
// The adapter's expandStructureTokens() maps these to DB-canonical values
// at filter time (cic → cic_guarantee + cic_shares; etc.). Agents work in
// these tokens; the granular DB values are an implementation detail.
export const STRUCTURE_LABELS: Record<string, string> = {
  registered_charity: 'Registered Charity',
  cic:                'Community Interest Company (CIC)',
  scio:               'SCIO (Scottish Charitable Incorporated Organisation)',
  cio:                'Charitable Incorporated Organisation (CIO)',
  social_enterprise:  'Social Enterprise',
  community_group:    'Community Group / Unincorporated',
  ltd_guarantee:      'Company Limited by Guarantee',
  ltd_shares:         'Company Limited by Shares',
  unincorporated:     'Unincorporated Association',
  cooperative:        'Co-operative',
  sole_trader:        'Sole Trader',
  llp:                'Limited Liability Partnership',
  not_registered:     'Not Yet Registered',
}
export const MCP_STRUCTURES = Object.keys(STRUCTURE_LABELS)

export const FUNDING_TYPE_LABELS: Record<MCPFundingType, string> = {
  grant:      'Grant',
  programme:  'Programme',
  investment: 'Social Investment',
  in_kind:    'In-Kind Support',
}

// Scraper-emitted funder taxonomy (16 values, see spec §4.4 notes).
// Used both by get_taxonomy and by funderTypeLabel() in projections.
export const FUNDER_TYPE_LABELS: Record<string, string> = {
  trust_foundation:     'Trust / Foundation',
  community_foundation: 'Community Foundation',
  government:           'Government',
  corporate:            'Corporate',
  corporate_foundation: 'Corporate Foundation',
  lottery:              'Lottery',
  local_authority:      'Local Authority',
  capacity_builder:     'Capacity Builder',
  charity:              'Charity',
  competition:          'Competition',
  crowdfund_match:      'Crowdfund Match',
  foundation:           'Foundation',
  housing_association:  'Housing Association',
  loan:                 'Social Loan',
  other:                'Other',
  trust:                'Trust',
}

export const BENEFICIARY_LABELS: Record<string, string> = {
  young_people:             'Young people',
  children:                 'Children',
  people_in_poverty:        'People in poverty',
  mental_health:            'People with mental health conditions',
  disabled_people:          'Disabled people',
  older_people:             'Older people',
  women_girls:              'Women and girls',
  families:                 'Families',
  refugees_migrants:        'Refugees and migrants',
  homeless:                 'People experiencing homelessness',
  rural_communities:        'Rural communities',
  lgbtq:                    'LGBTQ+ people',
  ethnic_minorities:        'People from ethnic minorities',
  justice_involved:         'Justice-involved people',
  carers:                   'Carers',
  care_experienced:         'Care-experienced people',
  domestic_abuse_survivors: 'Domestic abuse survivors',
  veterans:                 'Veterans',
}

export const MCP_FUNDER_TYPES = Object.keys(FUNDER_TYPE_LABELS)

export interface MCPTaxonomyEntry { id: string; label: string }
export type MCPTaxonomyName =
  | 'sectors' | 'regions' | 'structures'
  | 'funding_types' | 'beneficiary_groups' | 'funder_types'

export function getMCPTaxonomy(name: MCPTaxonomyName): MCPTaxonomyEntry[] {
  switch (name) {
    case 'sectors':
      return MCP_SECTORS.map(id => ({ id, label: SECTOR_LABELS[id] }))
    case 'regions':
      return MCP_REGIONS.map(id => ({ id, label: REGION_LABELS[id] }))
    case 'structures':
      return MCP_STRUCTURES.map(id => ({ id, label: STRUCTURE_LABELS[id] }))
    case 'funding_types':
      return MCP_FUNDING_TYPES.map(id => ({ id, label: FUNDING_TYPE_LABELS[id] }))
    case 'beneficiary_groups':
      return MCP_BENEFICIARIES.map(id => ({ id, label: BENEFICIARY_LABELS[id] ?? id }))
    case 'funder_types':
      return MCP_FUNDER_TYPES.map(id => ({ id, label: FUNDER_TYPE_LABELS[id] }))
  }
}

export function getAllMCPTaxonomies(): Record<MCPTaxonomyName, MCPTaxonomyEntry[]> {
  return {
    sectors:            getMCPTaxonomy('sectors'),
    regions:            getMCPTaxonomy('regions'),
    structures:         getMCPTaxonomy('structures'),
    funding_types:      getMCPTaxonomy('funding_types'),
    beneficiary_groups: getMCPTaxonomy('beneficiary_groups'),
    funder_types:       getMCPTaxonomy('funder_types'),
  }
}

// DB funding_type → MCP enum. accelerator / blended_finance / support_programme
// coerced to nearest cousin. Unknown DB values fall through to 'grant' (the
// most generic canonical type) and emit a console warning — never null, never
// throw. Returning null from this function previously triggered AdapterError
// in toMCPOpportunitySummary, which crashed any unfiltered "find me grants"
// query the moment ONE row in the catalogue had a drift-typed value.
// Defensive coercion + warning is the right shape: keep the system serving,
// surface the drift in logs so it can be cleaned up.
export function mapFundingType(db_type: string | null): MCPFundingType {
  if (!db_type) return 'grant'
  switch (db_type) {
    case 'grant':              return 'grant'
    case 'programme':          return 'programme'
    case 'investment':         return 'investment'
    case 'in_kind':            return 'in_kind'
    case 'accelerator':        return 'programme'    // closest cousin
    case 'blended_finance':    return 'investment'   // closest cousin
    case 'support_programme':  return 'programme'    // non-canonical scraper value (UnLtd row 2026-06-02)
    default:
      // Drift — log and fall back to the most generic canonical type. Keeps
      // the response stream serving while the offending row gets cleaned up.
      console.warn(`[mapFundingType] unmapped funding_type "${db_type}" — coerced to 'grant'. Normalise the row in scraped_grants.`)
      return 'grant'
  }
}

// Structure token expansion — user-facing tokens may correspond to multiple
// DB tokens (see spec §4.1). Used by the search tool to translate filter args.
export const STRUCTURE_EXPANSIONS: Record<string, string[]> = {
  cic:               ['cic_guarantee', 'cic_shares'],
  social_enterprise: ['cic_guarantee', 'cic_shares', 'ltd_guarantee'],
  community_group:   ['unincorporated', 'not_registered'],
  registered_charity:['registered_charity'],
  cio:               ['cio'],
  scio:              ['scio'],
  ltd_guarantee:     ['ltd_guarantee'],
  ltd_shares:        ['ltd_shares'],
  unincorporated:    ['unincorporated'],
  cooperative:       ['cooperative'],
  sole_trader:       ['sole_trader'],
  llp:               ['llp'],
  not_registered:    ['not_registered'],
}

export function expandStructureTokens(spec_tokens: string[]): string[] {
  const expanded = new Set<string>()
  for (const t of spec_tokens) {
    const mapped = STRUCTURE_EXPANSIONS[t.toLowerCase()]
    if (mapped) mapped.forEach(m => expanded.add(m))
    else expanded.add(t)
  }
  return Array.from(expanded)
}

// Sector token expansion — natural-language sector words an agent might pass
// without first calling get_taxonomy. Mirrors expandStructureTokens so a query
// like sector:["arts"] resolves to canonical "creative" instead of silently
// zeroing (the same silent-exclusion class as the youth-tag miss; "arts grants"
// is a top reviewer query). Canonical tokens identity-map; everything else
// points at one or more of the 14 canonical sectors (see MCP_SECTORS /
// SECTOR_LABELS). Multi-target maps fan out — overlap matching means a broader
// hit, never a wrong exclusion. Unknown tokens pass through untouched.
export const SECTOR_EXPANSIONS: Record<string, string[]> = {
  // canonical pass-throughs
  sport: ['sport'], heritage: ['heritage'], social_economy: ['social_economy'],
  creative: ['creative'], community: ['community'], education: ['education'],
  employment: ['employment'], health: ['health'], mental_health: ['mental_health'],
  housing: ['housing'], environment: ['environment'], food: ['food'],
  tech: ['tech'], justice: ['justice'],
  // arts & creative (the reported miss)
  arts: ['creative'], art: ['creative'], arts_culture: ['creative'],
  music: ['creative'], film: ['creative'], theatre: ['creative'],
  theater: ['creative'], dance: ['creative'], creative_arts: ['creative'],
  culture: ['creative', 'heritage'],
  // heritage
  museums: ['heritage'], history: ['heritage'],
  // sport
  sports: ['sport'], physical_activity: ['sport'], recreation: ['sport'],
  // tech
  digital: ['tech'], technology: ['tech'], tech_for_good: ['tech'],
  // environment
  climate: ['environment'], sustainability: ['environment'], green: ['environment'],
  nature: ['environment'], conservation: ['environment'], environmental: ['environment'],
  biodiversity: ['environment'],
  // housing
  homelessness: ['housing'], homeless: ['housing'],
  // employment / education
  jobs: ['employment'], work: ['employment'], livelihoods: ['employment'],
  skills: ['education', 'employment'], training: ['education', 'employment'],
  schools: ['education'], learning: ['education'],
  // health
  wellbeing: ['health'], healthcare: ['health'], public_health: ['health'],
  'mental-health': ['mental_health'], mental_wellbeing: ['mental_health'],
  // food
  hunger: ['food'], food_poverty: ['food'], agriculture: ['food'], farming: ['food'],
  // justice & rights
  crime: ['justice'], criminal_justice: ['justice'], human_rights: ['justice'],
  rights: ['justice'], equality: ['justice'], advocacy: ['justice'],
  // social economy
  enterprise: ['social_economy'], social_enterprise: ['social_economy'],
  cooperative: ['social_economy'], 'co-op': ['social_economy'],
  community_ownership: ['social_economy'],
}

export function expandSectorTokens(spec_tokens: string[]): string[] {
  const expanded = new Set<string>()
  for (const t of spec_tokens) {
    const mapped = SECTOR_EXPANSIONS[t.toLowerCase()]
    if (mapped) mapped.forEach(m => expanded.add(m))
    else expanded.add(t)
  }
  return Array.from(expanded)
}

// Beneficiary canonicalisation — DB has two columns (target_beneficiaries
// and beneficiary_tags) with overlapping vocab. We expose a unified
// 18-value canonical list. See spec §4.4 working hypothesis.
//
// Merge map: DB tokens on the left, canonical MCP token on the right.
// Canonical labels chosen for dignity (people_in_poverty over low_income)
// and current sector language (justice_involved over ex_offenders).
// Canonical pass-throughs come first (defines the get_taxonomy order via
// Set-dedup downstream); merge entries follow at the bottom and dedupe
// to no-ops in MCP_BENEFICIARIES.
export const BENEFICIARY_CANONICALISATION: Record<string, string> = {
  // canonical pass-throughs (order matches BENEFICIARY_LABELS)
  young_people:              'young_people',
  children:                  'children',
  people_in_poverty:         'people_in_poverty',
  mental_health:             'mental_health',
  disabled_people:           'disabled_people',
  older_people:              'older_people',
  women_girls:               'women_girls',
  families:                  'families',
  refugees_migrants:         'refugees_migrants',
  homeless:                  'homeless',
  rural_communities:         'rural_communities',
  lgbtq:                     'lgbtq',
  ethnic_minorities:         'ethnic_minorities',
  justice_involved:          'justice_involved',
  carers:                    'carers',
  care_experienced:          'care_experienced',
  domestic_abuse_survivors:  'domestic_abuse_survivors',
  veterans:                  'veterans',
  // merges (DB token → canonical) — values already in the set above
  low_income:                'people_in_poverty',
  mental_health_conditions:  'mental_health',
  ex_offenders:              'justice_involved',
}

// Excluded from v1 output (per F3 resolution):
//   general_public — too broad to be a useful filter
//   neurodivergent — too sparse (1 row), revisit when catalogue grows
const BENEFICIARY_EXCLUSIONS = new Set<string>(['general_public', 'neurodivergent'])

// Canonical 18-value list in author-declared order (matches BENEFICIARY_LABELS).
// Derived via Set-dedup over Object.values; the BENEFICIARY_CANONICALISATION
// key order above is arranged so canonical pass-throughs come first → they
// land in the Set in canonical order. Merge keys (low_income → people_in_poverty
// etc.) come after and dedupe to no-ops.
export const MCP_BENEFICIARIES = Array.from(new Set(Object.values(BENEFICIARY_CANONICALISATION)))

// Normalise + dedupe a union of target_beneficiaries + beneficiary_tags
// into the canonical MCP vocabulary. Unknown tokens pass through (logged
// for review post-launch); excluded tokens are dropped.
export function canonicaliseBeneficiaries(db_tokens: string[]): string[] {
  const out = new Set<string>()
  for (const raw of db_tokens) {
    const t = raw.toLowerCase()
    if (BENEFICIARY_EXCLUSIONS.has(t)) continue
    const mapped = BENEFICIARY_CANONICALISATION[t]
    out.add(mapped ?? t)
  }
  return Array.from(out)
}

// DB location_tag → array of MCPRegion values it falls into. A row tagged
// "London & Essex" yields ['london']; UK-wide rows yield ['uk_wide'] only
// (search tool can choose to include uk_wide rows in any regional query).
const REGION_KEYWORDS: { region: MCPRegion; patterns: RegExp[] }[] = [
  { region: 'uk_wide',              patterns: [/\buk\b/i, /\buk[- ]wide\b/i, /\bnationwide\b/i, /\ball uk\b/i, /\bgreat britain\b/i] },
  { region: 'england',              patterns: [/\bengland\b/i] },
  { region: 'scotland',             patterns: [/\bscotland\b/i, /\bglasgow\b/i, /\bedinburgh\b/i, /\baberdeen\b/i, /\bdundee\b/i] },
  { region: 'wales',                patterns: [/\bwales\b/i, /\bcardiff\b/i, /\bswansea\b/i] },
  { region: 'northern_ireland',     patterns: [/\bnorthern ireland\b/i, /\bbelfast\b/i, /\bn\.? ?ireland\b/i] },
  { region: 'london',               patterns: [/\blondon\b/i, /\b(barking and dagenham|barnet|bexley|brent|bromley|camden|city of london|croydon|ealing|enfield|greenwich|hackney|hammersmith|haringey|harrow|havering|hillingdon|hounslow|islington|kensington|kingston upon thames|lambeth|lewisham|merton|newham|redbridge|richmond|southwark|sutton|tower hamlets|waltham forest|wandsworth|westminster)\b/i] },
  { region: 'north_west',           patterns: [/\bnorth[- ]west\b/i, /\bmanchester\b/i, /\bliverpool\b/i, /\bcumbria\b/i, /\blancashire\b/i] },
  { region: 'north_east',           patterns: [/\bnorth[- ]east\b/i, /\bnewcastle\b/i, /\btyne\b/i, /\bdurham\b/i, /\bnorthumberland\b/i] },
  { region: 'yorkshire_and_humber', patterns: [/\byorkshire\b/i, /\bhumber\b/i, /\bleeds\b/i, /\bsheffield\b/i, /\bbradford\b/i] },
  { region: 'midlands',             patterns: [/\bmidlands\b/i, /\bbirmingham\b/i, /\bcoventry\b/i, /\bworcestershire\b/i, /\bwarwickshire\b/i, /\bnottingham\b/i, /\bleicester\b/i] },
  { region: 'south_east',           patterns: [/\bsouth[- ]east\b/i, /\bsussex\b/i, /\bkent\b/i, /\bsurrey\b/i, /\bberkshire\b/i, /\bbrighton\b/i, /\bchichester\b/i, /\bworthing\b/i, /\bessex\b/i, /\blewes\b/i, /\brye\b/i, /\bcrawley\b/i, /\bgatwick\b/i, /\beastbourne\b/i, /\bhastings\b/i, /\bhorsham\b/i] },
  { region: 'south_west',           patterns: [/\bsouth[- ]west\b/i, /\bsomerset\b/i, /\bdevon\b/i, /\bcornwall\b/i, /\bbristol\b/i, /\bgloucester\b/i, /\bdorset\b/i, /\bwiltshire\b/i] },
]

export function mapLocationTagToRegions(location_tag: string | null): MCPRegion[] {
  if (!location_tag) return []
  const matched: MCPRegion[] = []
  for (const { region, patterns } of REGION_KEYWORDS) {
    if (patterns.some(p => p.test(location_tag))) matched.push(region)
  }
  return matched
}

// ──────────────────────────────────────────────────────────────────────────
// Funder_brief split — code-level enforcement
// ──────────────────────────────────────────────────────────────────────────

export interface MCPFunderBriefFields {
  who_can_apply: string
  what_they_fund: string
  priorities: string
  exclusions: string
  geographic_focus: string
  typical_award: string
}

export function projectFunderBriefForMCP(
  brief: RawFunderBrief | null | undefined
): MCPFunderBriefFields {
  const b = brief ?? {}
  return {
    who_can_apply:    b.who_can_apply    ?? '',
    what_they_fund:   b.what_they_fund   ?? '',
    priorities:       b.priorities       ?? '',
    exclusions:       b.exclusions       ?? '',
    geographic_focus: b.geographic_focus ?? '',
    typical_award:    b.typical_award    ?? '',
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Parse a YYYY-MM-DD string to a Date object + days-from-today. Returns null
// if not parseable. Today is zeroed to start-of-day so day diffs are stable.
function daysFromToday(yyyymmdd: string | null): { date: Date; days: number } | null {
  if (!yyyymmdd) return null
  const parts = yyyymmdd.split('-').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return null
  const date = new Date(parts[0], parts[1] - 1, parts[2])
  if (isNaN(date.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((date.getTime() - today.getTime()) / 86_400_000)
  return { date, days }
}

function deriveDeadline(row: ScrapedGrantRow): MCPDeadline {
  // Rolling takes precedence per spec §4.1
  if (row.is_rolling) return { type: 'rolling', date: null, days_until: null }

  const deadlineParsed   = daysFromToday(row.deadline)
  const nextOpenParsed   = daysFromToday(row.next_open_date_parsed)
  const nextOpenIsFuture = nextOpenParsed !== null && nextOpenParsed.days >= 0

  // Case 1: future deadline → fund is currently open
  if (deadlineParsed && deadlineParsed.days >= 0) {
    return { type: 'fixed', date: row.deadline, days_until: deadlineParsed.days }
  }

  // Case 2: between rounds — past or null deadline, but next round is known
  //         and in the future. Honest "currently closed, next opens X" framing.
  if (nextOpenIsFuture) {
    return {
      type: 'between_rounds',
      date: row.next_open_date_parsed,
      days_until: nextOpenParsed.days,
      next_open_text: row.next_open_date,
    }
  }

  // Case 3: past deadline, no future next round known → genuinely closed
  if (deadlineParsed && deadlineParsed.days < 0) {
    return { type: 'closed', date: row.deadline, days_until: deadlineParsed.days }
  }

  // Case 4: no deadline, no rolling flag, no next round → treat as rolling.
  // This branch preserves existing behaviour for rows where the catalogue has
  // no deadline information at all. Such rows should ideally be either rolling
  // or have next_open_date_parsed set; until then they surface as rolling.
  return { type: 'rolling', date: null, days_until: null }
}

function deriveGeographicScope(row: ScrapedGrantRow): string {
  if (row.location_tag && row.location_tag.trim()) return row.location_tag
  return 'UK'  // safe default per active-catalogue filter (UK-only opportunities)
}

function deriveEligibilitySummary(row: ScrapedGrantRow): string {
  // Prefer funder_brief.who_can_apply if populated; else first 200 chars of eligibility_criteria
  const brief = row.funder_brief
  if (brief?.who_can_apply && brief.who_can_apply.trim()) {
    return brief.who_can_apply.length > 280
      ? brief.who_can_apply.slice(0, 277) + '...'
      : brief.who_can_apply
  }
  if (row.eligibility_criteria && row.eligibility_criteria.length > 0) {
    const joined = row.eligibility_criteria.join('. ')
    return joined.length > 280 ? joined.slice(0, 277) + '...' : joined
  }
  return 'See funder site for eligibility criteria.'
}

// Per F8: "Apply via {funder}'s site at {apply_url}. {deadline_phrase}.
// Eligibility: {first 200 chars of eligibility_criteria, falling back to who_can_apply}."
function deriveProcessSummary(row: ScrapedGrantRow, deadline: MCPDeadline): string {
  const funder = row.funder ?? 'the funder'
  const url = row.apply_url ?? 'their website'
  let deadline_phrase: string
  if (deadline.type === 'rolling') deadline_phrase = 'Rolling applications accepted'
  else if (deadline.type === 'closed') deadline_phrase = 'Currently closed'
  else deadline_phrase = `Deadline: ${deadline.date}`
  let eligibility_text = ''
  if (row.eligibility_criteria && row.eligibility_criteria.length > 0) {
    const joined = row.eligibility_criteria.join('. ')
    eligibility_text = joined.length > 200 ? joined.slice(0, 197) + '...' : joined
  } else if (row.funder_brief?.who_can_apply) {
    const who = row.funder_brief.who_can_apply
    eligibility_text = who.length > 200 ? who.slice(0, 197) + '...' : who
  }
  const eligibility_clause = eligibility_text ? ` Eligibility: ${eligibility_text}` : ''
  return `Apply via ${funder}'s site at ${url}. ${deadline_phrase}.${eligibility_clause}`
}

function clipBriefDescription(brief: RawFunderBrief | null | undefined): string {
  const text = brief?.what_they_fund ?? brief?.priorities ?? ''
  if (!text) return ''
  return text.length > 280 ? text.slice(0, 277) + '...' : text
}

function funderTypeLabel(funder_type: string | null): string {
  if (!funder_type) return 'Funder'
  return FUNDER_TYPE_LABELS[funder_type] ?? funder_type.replace(/_/g, ' ')
}

// ──────────────────────────────────────────────────────────────────────────
// Main projections
// ──────────────────────────────────────────────────────────────────────────

export class AdapterError extends Error {
  constructor(public reason: string, public row_id?: string) {
    super(`AdapterError: ${reason}${row_id ? ` (row ${row_id})` : ''}`)
  }
}

export function toMCPOpportunitySummary(row: ScrapedGrantRow, ctx: AdapterContext): MCPOpportunitySummary {
  if (!row.id || !UUID_RE.test(row.id)) {
    throw new AdapterError(`opportunity_id is not a valid UUID: "${row.id}"`, row.id ?? undefined)
  }
  // mapFundingType is now defensive — never returns null, falls back to 'grant'
  // with a logged warning on unknown values. Throw removed 2026-06-02 after
  // the support_programme row crashed unfiltered "find me grants" queries.
  const funding_type = mapFundingType(row.funding_type)
  const deadline = deriveDeadline(row)
  return {
    opportunity_id: row.id,
    title: row.title ?? '',
    funder: row.funder ?? '',
    funding_type,
    amount: {
      min: row.amount_min,
      max: row.amount_max,
      currency: 'GBP',
      typical: row.funder_brief?.typical_award ?? null,
      undisclosed: Boolean(row.amount_undisclosed),
    },
    deadline,
    geographic_scope: deriveGeographicScope(row),
    eligibility_summary: deriveEligibilitySummary(row),
    apply_url: row.apply_url ?? '',
    grant_tracker_url: buildGrantTrackerUrl(row.id, ctx),
  }
}

export interface OpportunityDetailOptions {
  include_funder_summary?: boolean
}

export function toMCPOpportunityDetail(
  row: ScrapedGrantRow,
  options: OpportunityDetailOptions,
  ctx: AdapterContext,
): MCPOpportunityDetail {
  const summary = toMCPOpportunitySummary(row, ctx)
  const brief = projectFunderBriefForMCP(row.funder_brief)
  const deadline = deriveDeadline(row)
  const include_funder_summary = options.include_funder_summary ?? true

  return {
    opportunity_id: summary.opportunity_id,
    title: summary.title,
    funder: summary.funder,
    funding_type: summary.funding_type,
    amount: { ...summary.amount, notes: null },
    deadline: { ...deadline, notes: null },
    eligibility: {
      summary: summary.eligibility_summary,
      who_can_apply: brief.who_can_apply,
      eligible_structures: row.eligible_structures ?? [],
      geographic_scope: brief.geographic_focus || summary.geographic_scope,
      exclusions: brief.exclusions,
    },
    scope: {
      what_they_fund: brief.what_they_fund,
      priorities: brief.priorities,
      sectors: row.impact_sectors ?? [],
      beneficiary_groups: canonicaliseBeneficiaries([
        ...(row.target_beneficiaries ?? []),
        ...(row.beneficiary_tags ?? []),
      ]),
    },
    application: {
      process_summary: deriveProcessSummary(row, deadline),
      apply_url: row.apply_url ?? '',
    },
    funder_summary: include_funder_summary ? {
      name: row.funder ?? '',
      type: funderTypeLabel(row.funder_type),
      brief_description: clipBriefDescription(row.funder_brief),
    } : null,
    metadata: {
      last_updated: row.last_seen_at ?? '',
      data_freshness: row.url_status === 'ok' ? 'verified' : 'unverified',
      source: row.source ?? 'Grant Tracker catalogue',
    },
    links: {
      funder_url: row.apply_url ?? '',
      grant_tracker_url: summary.grant_tracker_url,
    },
  }
}

// Caller supplies all active opportunities for the provider (already-filtered
// to is_active=true). The adapter aggregates the by_type counts and IDs.
export interface ProviderIntelligenceInputs {
  provider_name: string
  representative_brief: RawFunderBrief | null
  funder_row: FunderRow | null
  active_opportunities: ScrapedGrantRow[]
}

export function toMCPProviderIntelligence(
  inputs: ProviderIntelligenceInputs,
): MCPProviderIntelligence {
  const { provider_name, representative_brief, funder_row, active_opportunities } = inputs
  const brief = projectFunderBriefForMCP(representative_brief)
  const data_richness: 'enriched' | 'basic' = funder_row ? 'enriched' : 'basic'

  // Provider type — always use the scraper-emitted taxonomy from
  // scraped_grants.funder_type (the 16-value taxonomy returned by
  // get_taxonomy {funder_types}). This is consistent with what agents
  // get when they introspect via get_taxonomy.
  //
  // The funders table has its own 8-value funder_type taxonomy
  // (major_trust, social_investment, crowdfunding, etc.) — that's not
  // exposed here because (a) it's a parallel taxonomy that doesn't appear
  // in get_taxonomy, (b) it would surprise agents who see `provider.type:
  // "major_trust"` but can't find it in the funder_types taxonomy list.
  // The funders-table classification still drives the enriched_data block.
  let provider_type = ''
  if (active_opportunities.length > 0) {
    const typeCounts = new Map<string, number>()
    for (const o of active_opportunities) {
      if (o.funder_type) typeCounts.set(o.funder_type, (typeCounts.get(o.funder_type) ?? 0) + 1)
    }
    let max = 0
    typeCounts.forEach((c, t) => { if (c > max) { max = c; provider_type = t } })
  }

  // by_type aggregation (4-enum)
  const by_type: Record<MCPFundingType, number> = { grant: 0, programme: 0, investment: 0, in_kind: 0 }
  const opportunity_ids: string[] = []
  for (const o of active_opportunities) {
    const mapped = mapFundingType(o.funding_type)
    if (mapped) by_type[mapped]++
    if (UUID_RE.test(o.id)) opportunity_ids.push(o.id)
  }

  const result: MCPProviderIntelligence = {
    provider: {
      name: funder_row?.name ?? provider_name,
      type: provider_type,
      type_label: funderTypeLabel(provider_type || null),
      website: funder_row?.website ?? null,
      data_richness,
    },
    what_they_fund:   brief.what_they_fund,
    who_can_apply:    brief.who_can_apply,
    priorities:       brief.priorities,
    exclusions:       brief.exclusions,
    geographic_focus: brief.geographic_focus,
    typical_award:    brief.typical_award,
    active_opportunities: {
      count: active_opportunities.length,
      by_type,
      opportunity_ids,
    },
    links: {
      // Q3(b): grant_tracker_url dropped from provider-intelligence output.
      // The funder profile page (/funders/{slug}) is thin and the audit-grade
      // pitch wants the funder's own site as the canonical link here.
      funder_url: funder_row?.website ?? null,
    },
  }

  if (data_richness === 'enriched' && funder_row) {
    // NOTE: funder_row.notes is DELIBERATELY NOT projected into enriched_data.
    // The notes column contains curated editorial commentary (e.g. "Sunset
    // 2024: pivoted from grant-making to advocacy") which is closer in
    // character to insider intelligence than to "is this a fit" data. The
    // funder_brief split principle (spec §4.3 + at-a-glance "Funder_brief
    // field split") applies: this content stays app-only. If future
    // maintainers want to expose notes, do it as an explicit spec change,
    // not by extending this projection.
    result.enriched_data = {
      sectors_funded: funder_row.sector_tags ?? [],
      typical_amount_range: {
        min: funder_row.typical_min,
        max: funder_row.typical_max,
        currency: 'GBP',
      },
      geographic_scope_detail: (funder_row.geographic_scope ?? []).join(', '),
      short_name: funder_row.short_name,
    }
  }

  return result
}

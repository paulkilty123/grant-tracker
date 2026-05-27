import type { GrantOpportunity, Organisation, LegalStructure, BeneficiaryGroup } from '@/types'
import { runEligibilityChecks } from './eligibility'
import type { EligibilityStatus as EligibilityStatusFromEngine, EligibilityIssue } from './eligibility'

export interface MatchBreakdown {
  location:      { score: number; max: number; label: string }
  themes:        { score: number; max: number; label: string }
  beneficiaries?: { score: number; max: number; label: string }
  grantSize:     { score: number; max: number; label: string }
  funderType:    { score: number; max: number; label: string }
  eligibility:   { score: number; max: number; label: string }
}

export type EligibilityStatus = EligibilityStatusFromEngine
export type { EligibilityIssue }

export interface MatchResult {
  score:             number
  reason:            string
  breakdown:         MatchBreakdown
  eligibilityStatus: EligibilityStatus
  eligibilityReason: string | null
  positiveReasons:   string[]
  warnReasons:       string[]
  /** Structured issues from the branched eligibility engine */
  eligibilityIssues?: EligibilityIssue[]
}

// Map income bands to approximate midpoints.
// Covers both the current granular bands and legacy coarse bands (kept for
// backward compatibility with profiles saved before the band expansion).
const INCOME_MIDPOINTS: Record<string, number> = {
  'Under £10,000':             5_000,
  '£10,000–£50,000':          30_000,
  '£50,000–£100,000':         75_000,
  '£100,000–£250,000':       175_000,   // granular split
  '£250,000–£500,000':       375_000,   // granular split
  '£500,000–£1 million':     750_000,
  '£1 million–£5 million': 2_500_000,
  'Over £5 million':      10_000_000,
  // Legacy bands — kept so old profiles still resolve correctly
  '£100,000–£500,000':       300_000,
  'Over £500,000':           750_000,
}

/**
 * Inverse-document-frequency weights per impact sector, derived from the live
 * grant catalogue (~413 grants, post-taxonomy-normalisation).
 * Sectors that appear in fewer grants carry more discriminative power —
 * a match on "heritage" is far more meaningful than a match on "community".
 *
 * Formula: normalised log(N / df) scaled to [0.2, 2.5].
 * Update these weights periodically as the catalogue grows.
 */
const SECTOR_IDF: Record<string, number> = {
  community:    0.2,   // 226 grants — nearly ubiquitous
  young_people: 0.5,   //  94 grants
  creative:     0.9,   //  54 grants
  health:       0.9,   //  69 grants
  education:    0.9,   //  65 grants
  employment:   1.0,   //  71 grants
  environment:  1.1,   //  64 grants
  financial:    1.3,   //  39 grants
  tech:         1.3,   //  30 grants
  justice:      1.3,   //  28 grants
  mental_health: 1.4,  //  25 grants
  disability:   1.5,   //  25 grants
  older_people: 1.6,   //  15 grants
  housing:      1.7,   //  14 grants
  sport:        1.8,   //  20 grants
  heritage:     2.0,   //  17 grants
  international: 2.5,  //   8 grants
  food:         2.5,   //   8 grants
  women:        2.5,   //   8 grants
  social_economy:    2.2,   // new sector — very few grants, high discriminative power
  social_innovation: 2.0,   // new sector — very few grants, high discriminative power
}

/** IDF weight for a sector — falls back to 1.0 for unknown tags */
function idfWeight(sector: string): number {
  return SECTOR_IDF[sector] ?? 1.0
}

/**
 * Rank weight for an org's impact sector based on its position in the array.
 * The org profile stores sectors in priority order: [0] = primary, [1] = secondary, etc.
 * Primary sectors dominate matching so grants aligned with the org's core mission
 * rank much higher than grants matching only a peripheral sector.
 */
const RANK_WEIGHTS = [1.0, 0.6, 0.35, 0.15, 0.15] as const
function rankWeight(index: number): number {
  return index < RANK_WEIGHTS.length ? RANK_WEIGHTS[index] : 0.15
}

/**
 * Normalise a sector tag to its canonical form.
 * Defensive layer: catches any non-canonical tags that may exist in grant or
 * org data (e.g. scraped with old taxonomy, user-entered free text, etc.)
 * so that matching works correctly regardless of how tags were originally stored.
 */
function normalizeSector(s: string): string {
  const MAP: Record<string, string> = {
    // Old taxonomy aliases
    digital:                     'tech',
    digital_inclusion:            'tech',
    youth:                        'young_people',
    children_families:            'young_people',
    education_training:           'education',
    community_development:        'community',
    environment_conservation:     'environment',
    health_wellbeing:             'health',
    poverty:                      'financial',
    poverty_financial_inclusion:  'financial',
    financial_inclusion:          'financial',
    homelessness_housing:         'housing',
    housing_homelessness:         'housing',
    social_enterprise_support:    'employment',
    employment_enterprise:        'employment',
    equality:                     'justice',
    human_rights_equality:        'justice',
    criminal_justice:             'justice',
    arts_culture:                 'creative',
    sport_recreation:             'sport',
    research:                     'education',
  }
  return MAP[s] ?? s
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
    words: ['overseas aid', 'international development', 'global south', 'developing world', 'overseas charity', 'overseas project'],
    sector: 'international',
    orgTerms: ['international', 'overseas', 'global'],
  },
  {
    words: ['food bank', 'food poverty', 'food growing', 'food system', 'food security',
            'food insecurity', 'food waste', 'food redistribution', 'surplus food',
            'agriculture', 'horticulture'],
    sector: 'food',
    orgTerms: ['food', 'agriculture', 'farming'],
  },
  {
    words: ['deep tech', 'quantum', 'ai accelerator', 'machine learning grant',
            'innovate uk', 'knowledge transfer partnership', 'r&d tax', 'edge growth',
            'net zero innovation', 'defence innovation', 'catapult'],
    sector: 'tech',
    orgTerms: ['tech', 'technology', 'digital', 'innovation', 'software'],
  },
  {
    words: ['visually impaired', 'sight loss', 'blind', 'blindness', 'visual impairment',
            'deaf', 'deafblind', 'hearing loss', 'disability', 'disabled people',
            'learning disability', 'physical disability', 'wheelchair'],
    sector: 'disability',
    orgTerms: ['disability', 'disabled', 'blind', 'deaf', 'sight loss', 'hearing loss', 'visual impairment', 'visually impaired'],
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
  // Scottish council areas & cities (so e.g. "South Lanarkshire Fund" gets penalised for non-Scottish orgs)
  'south lanarkshire': 'South Lanarkshire', 'north lanarkshire': 'North Lanarkshire',
  'east lanarkshire': 'East Lanarkshire', 'lanarkshire': 'Lanarkshire',
  'highland': 'Highland', 'aberdeenshire': 'Aberdeenshire', 'aberdeen': 'Aberdeen',
  'dundee': 'Dundee', 'fife': 'Fife', 'stirling': 'Stirling',
  'perth': 'Perth & Kinross', 'argyll': 'Argyll & Bute', 'angus': 'Angus',
  'renfrewshire': 'Renfrewshire', 'east renfrewshire': 'East Renfrewshire',
  'east lothian': 'East Lothian', 'west lothian': 'West Lothian', 'midlothian': 'Midlothian',
  'edinburgh': 'Edinburgh', 'glasgow': 'Glasgow', 'inverness': 'Inverness',
  'clackmannanshire': 'Clackmannanshire', 'falkirk': 'Falkirk',
  'dumfries': 'Dumfries & Galloway', 'galloway': 'Dumfries & Galloway',
  'borders': 'Scottish Borders', 'scottish borders': 'Scottish Borders',
  'orkney': 'Orkney', 'shetland': 'Shetland', 'western isles': 'Western Isles',
  // Welsh council areas & cities
  'gwynedd': 'Gwynedd', 'powys': 'Powys', 'ceredigion': 'Ceredigion',
  'pembrokeshire': 'Pembrokeshire', 'carmarthenshire': 'Carmarthenshire',
  'swansea': 'Swansea', 'cardiff': 'Cardiff', 'newport': 'Newport',
  'wrexham': 'Wrexham', 'flintshire': 'Flintshire', 'denbighshire': 'Denbighshire',
  'conwy': 'Conwy', 'anglesey': 'Anglesey', 'rhondda': 'Rhondda Cynon Taf',
  'merthyr': 'Merthyr Tydfil', 'caerphilly': 'Caerphilly', 'blaenau': 'Blaenau Gwent',
  'torfaen': 'Torfaen', 'bridgend': 'Bridgend', 'neath': 'Neath Port Talbot',
  'vale of glamorgan': 'Vale of Glamorgan', 'monmouthshire': 'Monmouthshire',
  // Northern Ireland areas
  'belfast': 'Belfast', 'antrim': 'Antrim', 'armagh': 'Armagh',
  'londonderry': 'Londonderry', 'derry': 'Derry', 'tyrone': 'Tyrone',
  'fermanagh': 'Fermanagh', 'down': 'County Down',
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
 * Classify the structured `location_tag` field set by the scraper.
 * Returns:
 *   'national'   — UK-wide / no geographic restriction
 *   'england'    — England-only
 *   'scotland'   — Scotland-only
 *   'wales'      — Wales-only
 *   'ni'         — Northern Ireland-only
 *   'regional'   — specific region, county, city or borough
 *   'unknown'    — null or unrecognised
 *
 * This is the primary geographic signal used by the location scorer.
 * Takes precedence over the legacy is_local boolean (which is inconsistent
 * in ~16% of the catalogue).
 */
function classifyLocationTag(tag: string | null | undefined): {
  kind: 'national' | 'england' | 'scotland' | 'wales' | 'ni' | 'regional' | 'multi' | 'unknown'
  label: string
} {
  if (!tag) return { kind: 'unknown', label: '' }
  const t = tag.trim().toLowerCase()
  if (t === '' || t === 'uk' || t === 'national' || t === 'united kingdom') {
    return { kind: 'national', label: 'UK' }
  }
  if (t === 'england')                                         return { kind: 'england',  label: 'England' }
  if (t === 'scotland')                                        return { kind: 'scotland', label: 'Scotland' }
  if (t === 'wales')                                           return { kind: 'wales',    label: 'Wales' }
  if (t === 'northern ireland' || t === 'ni')                  return { kind: 'ni',       label: 'Northern Ireland' }
  if (t === 'international')                                   return { kind: 'national', label: 'International' }
  // Sentinel for grants that fund a set of specific, non-contiguous areas
  // (utility networks, infrastructure corridors, pre-set delivery areas).
  // No single region tag is correct — neither penalise nor over-reward.
  if (t === 'selected areas' || t === 'multiple areas')        return { kind: 'multi',     label: 'Selected areas' }
  return { kind: 'regional', label: tag.trim() }
}

/**
 * Check whether an org's primary_location satisfies a regional location_tag.
 * Substring match in either direction — handles both "London" ↔ "London, UK"
 * and "Tyne & Wear" ↔ "Newcastle, Tyne & Wear".
 */
/**
 * County / region → constituent towns and cities. Lets a grant tagged with a
 * county ("Sussex") match an org that entered a town within it ("Brighton and
 * Hove"). Not exhaustive — covers the counties and city-regions that appear as
 * catalogue location tags, with their principal towns. Counties without an
 * entry fall back to string matching only.
 */
const REGION_HIERARCHY: Record<string, string[]> = {
  'sussex':            ['brighton', 'hove', 'lewes', 'eastbourne', 'worthing', 'crawley', 'hastings', 'bexhill', 'chichester', 'horsham', 'rother', 'wealden', 'arun', 'adur', 'mid sussex', 'east sussex', 'west sussex'],
  'east sussex':       ['brighton', 'hove', 'lewes', 'eastbourne', 'hastings', 'bexhill', 'rother', 'wealden'],
  'west sussex':       ['worthing', 'crawley', 'chichester', 'horsham', 'arun', 'adur', 'mid sussex'],
  'kent':              ['canterbury', 'maidstone', 'dover', 'margate', 'ramsgate', 'ashford', 'tunbridge wells', 'tonbridge', 'gravesend', 'dartford', 'folkestone', 'sevenoaks', 'chatham', 'gillingham', 'medway'],
  'surrey':            ['guildford', 'woking', 'epsom', 'reigate', 'redhill', 'camberley', 'staines', 'leatherhead', 'dorking', 'farnham'],
  'essex':             ['chelmsford', 'colchester', 'southend', 'basildon', 'harlow', 'brentwood', 'braintree', 'clacton'],
  'norfolk':           ['norwich', 'great yarmouth', 'kings lynn', "king's lynn", 'thetford', 'dereham'],
  'suffolk':           ['ipswich', 'lowestoft', 'bury st edmunds', 'felixstowe', 'haverhill'],
  'devon':             ['exeter', 'plymouth', 'torquay', 'paignton', 'barnstaple', 'newton abbot', 'tiverton'],
  'cornwall':          ['truro', 'falmouth', 'penzance', 'newquay', 'st austell', 'camborne', 'redruth', 'bodmin'],
  'somerset':          ['taunton', 'bridgwater', 'yeovil', 'wells', 'frome', 'glastonbury'],
  'dorset':            ['bournemouth', 'poole', 'weymouth', 'dorchester', 'bridport'],
  'oxfordshire':       ['oxford', 'banbury', 'bicester', 'witney', 'abingdon', 'didcot'],
  'gloucestershire':   ['gloucester', 'cheltenham', 'stroud', 'cirencester', 'tewkesbury'],
  'lancashire':        ['preston', 'blackpool', 'blackburn', 'burnley', 'lancaster', 'lytham', 'chorley'],
  'cumbria':           ['carlisle', 'kendal', 'barrow', 'workington', 'penrith', 'whitehaven'],
  'yorkshire':         ['leeds', 'sheffield', 'bradford', 'york', 'hull', 'huddersfield', 'wakefield', 'doncaster', 'rotherham', 'barnsley', 'harrogate', 'scarborough', 'halifax', 'north yorkshire', 'south yorkshire', 'west yorkshire', 'east yorkshire'],
  'south yorkshire':   ['sheffield', 'doncaster', 'rotherham', 'barnsley'],
  'west yorkshire':    ['leeds', 'bradford', 'wakefield', 'huddersfield', 'halifax', 'kirklees', 'calderdale'],
  'north yorkshire':   ['york', 'harrogate', 'scarborough', 'ripon', 'northallerton'],
  'east yorkshire':    ['hull', 'beverley', 'bridlington'],
  'greater manchester':['manchester', 'salford', 'bolton', 'stockport', 'oldham', 'rochdale', 'bury', 'wigan', 'tameside', 'trafford'],
  'merseyside':        ['liverpool', 'birkenhead', 'st helens', 'southport', 'bootle', 'wirral'],
  'tyne and wear':     ['newcastle', 'sunderland', 'gateshead', 'south shields', 'north shields', 'washington', 'whitley bay'],
  'west midlands':     ['birmingham', 'coventry', 'wolverhampton', 'dudley', 'walsall', 'solihull', 'west bromwich'],
}

function orgMatchesRegionalTag(tagLabel: string, orgLocation: string): boolean {
  const tagLower = tagLabel.toLowerCase().trim()
  const orgLower = orgLocation.toLowerCase()
  if (!tagLower || !orgLower) return false
  // Direct substring match either way
  if (orgLower.includes(tagLower) || tagLower.includes(orgLower.split(',')[0].trim())) return true
  // Handle compound tags like "Tyne & Wear", "Coventry & Warwickshire" — split and match any part
  const parts = tagLower.split(/\s*&\s*|\s+and\s+/).map(p => p.trim()).filter(p => p.length >= 3)
  if (parts.some(p => orgLower.includes(p))) return true
  // Region hierarchy — the org's town sits within the tagged county/region
  // (e.g. grant tagged "Sussex", org entered "Brighton and Hove").
  const children = REGION_HIERARCHY[tagLower]
  if (children && children.some(town => orgLower.includes(town))) return true
  return false
}

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

/** Human-readable label for an impact sector value */
function sectorDisplayLabel(s: string): string {
  const MAP: Record<string, string> = {
    community:        'Community',
    young_people:     'Young People',
    health:           'Health',
    mental_health:    'Mental Health',
    education:        'Education',
    employment:       'Employment',
    creative:         'Arts & Culture',
    environment:      'Environment',
    housing:          'Housing',
    food:             'Food',
    sport:            'Sport',
    heritage:         'Heritage',
    disability:       'Disability',
    older_people:     'Older People',
    women:            'Women & Gender',
    justice:          'Justice & Rights',
    tech:             'Technology',
    financial:        'Financial Inclusion',
    international:    'International',
    social_economy:   'Social Economy',
    social_innovation:'Social Innovation',
  }
  return MAP[s] ?? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

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

  // Full grant text used for keyword matching (includes funderBrief when available)
  const grantAny = grant as unknown as Record<string, unknown>
  // Only use what_they_fund for keyword matching — other funderBrief fields
  // (who_can_apply, exclusions, etc.) contain incidental keywords that cause
  // false-positive domain vetoes.
  const funderBriefObj = grantAny.funderBrief as Record<string, unknown> | null
  const funderBriefText = funderBriefObj && typeof funderBriefObj === 'object'
    ? String(funderBriefObj.what_they_fund ?? '')
    : ''
  const grantText = [
    grant.title,
    grant.description,
    grant.sectors.join(' '),
    grant.eligibilityCriteria.join(' '),
    funderBriefText,
  ].join(' ').toLowerCase()

  // ── 1. Location (max 25) ───────────────────────────────────────────────
  // Primary signal: the structured `location_tag` field set by the scraper
  // (e.g. "UK", "Scotland", "London", "Tyne & Wear", "Somerset"). This is far
  // more reliable than the legacy `is_local` boolean, which is inconsistent on
  // ~16% of the catalogue. We fall back to is_local + title-regex scanning
  // only when location_tag is missing or generic.
  let locationScore = 12 // base for national/unknown grants (max 20)
  let locationMismatch = false
  if (org.primary_location) {
    const city    = org.primary_location.split(',')[0].trim().toLowerCase()
    const region  = org.primary_location.split(',')[1]?.trim().toLowerCase() ?? ''
    const country = org.primary_location.split(',').pop()?.trim().toLowerCase() ?? ''
    const orgLocationFull = [city, region, country].filter(Boolean).join(' ')
    const orgInScotland = orgLocationFull.includes('scotland')
    const orgInWales    = orgLocationFull.includes('wales')
    const orgInNI       = orgLocationFull.includes('northern ireland')
    const orgInEngland  = !orgInScotland && !orgInWales && !orgInNI // default

    const tagClass = classifyLocationTag(grant.locationTag)

    if (tagClass.kind === 'national') {
      // UK-wide grant — open to all, give a modest positive signal
      locationScore = 12
    } else if (tagClass.kind === 'multi') {
      // Grant funds a set of specific, non-contiguous areas — no single
      // region tag applies. Stay neutral: don't penalise (no mismatch cap)
      // and don't over-reward. Prompt the user to verify eligibility.
      locationScore = 10
      reasons.push('Funds specific areas — check eligibility in Grant insights')
    } else if (tagClass.kind === 'england' || tagClass.kind === 'scotland' ||
               tagClass.kind === 'wales'   || tagClass.kind === 'ni') {
      // Nation-restricted grant. Match against the org's inferred country.
      const nationOk =
        (tagClass.kind === 'england'  && orgInEngland)  ||
        (tagClass.kind === 'scotland' && orgInScotland) ||
        (tagClass.kind === 'wales'    && orgInWales)    ||
        (tagClass.kind === 'ni'       && orgInNI)
      if (nationOk) {
        locationScore = 18
        reasons.push(`${tagClass.label} — open to ${org.primary_location ? org.primary_location.split(',')[0].trim() : 'your area'}`)
      } else {
        locationScore = 2
        locationMismatch = true
        reasons.push(`Restricted to ${tagClass.label}`)
      }
    } else if (tagClass.kind === 'regional') {
      // Specific region, county, city or borough.
      const regionOk = orgMatchesRegionalTag(tagClass.label, orgLocationFull)
      if (regionOk) {
        locationScore = 20
        reasons.push(`Local to ${tagClass.label} — good fit for ${org.name}`)

        // Borough mismatch check: a "London" tag is still a borough-agnostic match,
        // but if the grant description names a specific borough and the org's city
        // isn't that borough, dial back to the national base.
        if (tagClass.label.toLowerCase() === 'london' && (city === 'london' || region.includes('london'))) {
          const mentionedBoroughs = LONDON_BOROUGHS.filter(b => grantText.includes(b))
          if (mentionedBoroughs.length > 0) {
            const orgBoroughMentioned = city !== 'london' && mentionedBoroughs.some(
              b => b === city || b.includes(city) || city.includes(b)
            )
            if (!orgBoroughMentioned) {
              locationScore = 8
              reasons.pop()
              reasons.push('London grant — check borough eligibility')
            }
          }
        }
      } else {
        // Regional grant for a different area — strong penalty so it ranks
        // well below national grants of any quality.
        locationScore = 2
        locationMismatch = true
        reasons.push(`Restricted to ${tagClass.label}`)
      }
    } else {
      // ── Fallback path: location_tag is null/unknown ──────────────────────
      // Use the legacy is_local boolean + title-regex scanning, same as before.
      if (grant.isLocal) {
        const cityMatch    = !!(city   && grantText.includes(city))
        const regionMatch  = !!(region && grantText.includes(region))
        const countryMatch = !!(country && ['scotland', 'wales', 'northern ireland'].includes(country) && grantText.includes(country))
        const locationMatch = cityMatch || regionMatch || countryMatch

        if (locationMatch) {
          locationScore = 20
          reasons.push(`Local to ${org.primary_location.split(',')[0].trim()} — matches ${org.name}'s area`)
          if (city === 'london' || region.includes('london')) {
            const mentionedBoroughs = LONDON_BOROUGHS.filter(b => grantText.includes(b))
            if (mentionedBoroughs.length > 0) {
              const orgBoroughMentioned = city !== 'london' && mentionedBoroughs.some(
                b => b === city || b.includes(city) || city.includes(b)
              )
              if (!orgBoroughMentioned) {
                locationScore = 8
                reasons.pop()
                reasons.push('London grant — check borough eligibility')
              }
            }
          }
        } else {
          locationScore = 2
          locationMismatch = true
          reasons.push('Local grant — area may not match yours')
        }
      } else {
        // Title regex scan — catches mis-flagged regional grants
        const grantTitleLower = grant.title.toLowerCase()
        const matchedRegion = Object.entries(REGIONAL_KEYWORDS).find(
          ([keyword]) => grantTitleLower.includes(keyword)
        )
        if (matchedRegion) {
          const [keyword, regionLabel] = matchedRegion
          const orgInRegion = orgLocationFull.includes(keyword.replace(/[()]/g, '').trim()) ||
            orgLocationFull.includes(regionLabel.toLowerCase())
          if (!orgInRegion) {
            locationScore = 2
            locationMismatch = true
            reasons.push(`Likely restricted to ${regionLabel} — check eligibility`)
          }
        }
      }
    }
  }

  // ── 2. Themes / sectors (max 25) ──────────────────────────────────────
  let themesScore = 0
  let primaryDomainMismatch = false

  // Normalise both sector arrays to canonical form and deduplicate.
  // This makes matching robust to taxonomy drift — old non-canonical tags
  // (e.g. 'digital', 'equality', 'poverty') match against canonical org tags
  // without requiring a data migration every time the taxonomy evolves.
  const orgImpactSectors   = Array.from(new Set((org.impact_sectors  ?? []).map(normalizeSector)))
  const grantImpactSectors = Array.from(new Set((grant.impactSectors ?? []).map(normalizeSector)))

  // Build a rank-weight lookup for the org's sectors based on array position.
  // Position 0 = primary sector (weight 1.0), position 1 = secondary (0.6), etc.
  // This map is used in both the structured IDF path and the depth boost below.
  const orgSectorRank = new Map<string, number>()
  for (let i = 0; i < orgImpactSectors.length; i++) {
    orgSectorRank.set(orgImpactSectors[i], rankWeight(i))
  }

  if (orgImpactSectors.length > 0 && grantImpactSectors.length > 0) {
    // ── Structured path: rank-aware IDF-weighted bidirectional coverage ───
    const intersection = grantImpactSectors.filter(s => orgImpactSectors.includes(s))
    const hits = intersection.length

    // Grant-side weights: pure IDF (grants aren't ranked by the user)
    const weightedGrantTotal = grantImpactSectors.reduce((s, sec) => s + idfWeight(sec), 0)

    // Org-side weights: IDF × rank weight — primary sectors dominate
    const rankedOrgWeight = (sec: string) => idfWeight(sec) * (orgSectorRank.get(sec) ?? 0.15)
    const weightedOrgTotal = orgImpactSectors.reduce((s, sec) => s + rankedOrgWeight(sec), 0)

    // Intersection weights split by perspective:
    //   grantCoverage uses pure IDF (what fraction of the grant does the org cover?)
    //   orgCoverage uses ranked IDF (does the grant match what the org MOST cares about?)
    const grantIntersection = intersection.reduce((s, sec) => s + idfWeight(sec), 0)
    const orgIntersection   = intersection.reduce((s, sec) => s + rankedOrgWeight(sec), 0)

    const grantCoverage = weightedGrantTotal > 0 ? grantIntersection / weightedGrantTotal : 0
    const orgCoverage   = weightedOrgTotal   > 0 ? orgIntersection   / weightedOrgTotal   : 0
    const coverage      = 0.7 * grantCoverage + 0.3 * orgCoverage

    themesScore = hits > 0 ? Math.max(3, Math.round(coverage * 20)) : 3

    // ── Primary domain mismatch check ─────────────────────────────────────
    // These sectors strongly characterise what a grant is fundamentally about.
    // If a grant includes any of these but the org does NOT, the match is
    // misleading even when generic cross-cutting sectors (community,
    // young_people) produce high coverage — e.g. football grants for a theatre,
    // or disability grants for a music charity.
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

    // ── Profile depth boost ─────────────────────────────────────────────
    // When impact_sectors match, also check whether the org's free-text
    // profile fields (themes, areas_of_work, beneficiaries, mission)
    // reinforce those matched sectors.  An org with "sport" in sectors
    // AND "Sport for employment programmes" in areas_of_work AND "sport
    // and physical activity" in themes clearly has sport as a core focus —
    // they should score higher than an org that just lists "sport" as one
    // of six sectors with no supporting detail.
    //
    // For each matched sector, count how many profile fields textually
    // reference it.  Average the depth across matched sectors and add up
    // to +5 points (capped at 25).  This ensures themes/areas_of_work/
    // beneficiaries always contribute to matching, not just as a fallback.
    if (intersection.length > 0 && !primaryDomainMismatch) {
      const profileTexts = [
        ...(org.themes        ?? []).map(t => t.toLowerCase()),
        ...(org.areas_of_work ?? []).map(a => a.toLowerCase()),
        ...(org.beneficiaries ?? []).map(b => b.toLowerCase()),
      ]
      const missionLower = (org.mission ?? '').toLowerCase()

      // Keyword stems that indicate a sector is present in free text.
      // Uses the same sector name plus common related terms so "sport"
      // catches "sport for employment", "sporting", etc.
      const SECTOR_KEYWORDS: Record<string, string[]> = {
        sport:         ['sport', 'athletic', 'fitness', 'physical activity', 'football', 'rugby', 'cricket', 'basketball', 'swimming'],
        employment:    ['employ', 'job', 'work placement', 'career', 'labour', 'workforce', 'vocational', 'apprentice'],
        young_people:  ['young', 'youth', 'adolescent', 'teenager', 'child', 'junior', 'neet'],
        environment:   ['environment', 'climate', 'nature', 'biodiversity', 'conservation', 'green', 'sustainability', 'ecological'],
        food:          ['food', 'hunger', 'nutrition', 'meal', 'feeding', 'nourish', 'food bank', 'food poverty'],
        health:        ['health', 'wellbeing', 'medical', 'nhs', 'clinical', 'patient', 'wellness'],
        mental_health: ['mental health', 'anxiety', 'depression', 'therapy', 'counselling', 'psychological', 'emotional wellbeing'],
        education:     ['education', 'learning', 'school', 'training', 'literacy', 'numeracy', 'curriculum', 'teaching'],
        community:     ['community', 'neighbourhood', 'civic', 'local people', 'resident', 'grassroots', 'place-based'],
        housing:       ['housing', 'homelessness', 'shelter', 'rough sleep', 'tenancy', 'accommodation'],
        creative:      ['creative', 'arts', 'culture', 'music', 'theatre', 'film', 'dance', 'performance', 'gallery'],
        disability:    ['disability', 'disabled', 'accessibility', 'learning disability', 'sensory impairment', 'wheelchair'],
        heritage:      ['heritage', 'museum', 'archive', 'historic', 'preservation', 'tradition', 'monument'],
        financial:     ['financial', 'debt', 'benefit', 'money advice', 'credit union', 'poverty', 'economic inclusion'],
        justice:       ['justice', 'offend', 'prison', 'rehabilitation', 'criminal', 'victim', 'legal aid', 'restorative'],
        international: ['international', 'global', 'overseas', 'developing countr', 'humanitarian', 'refugee', 'migration'],
        older_people:  ['older people', 'elderly', 'pensioner', 'ageing', 'dementia', 'later life', 'retirement'],
        women:         ['women', 'girl', 'gender', 'maternal', 'domestic violence', 'female', 'misogyn'],
        tech:          ['tech', 'digital', 'software', 'coding', 'data', 'cyber', 'internet', 'online inclusion'],
        social_economy:    ['co-op', 'cooperative', 'worker-owned', 'community shares', 'mutual', 'community benefit', 'community ownership', 'democratic enterprise'],
        social_innovation: ['systems change', 'tech for good', 'social innovation', 'impact measurement', 'social r&d', 'new model', 'social venture'],
      }

      let totalDepth = 0
      for (const sector of intersection) {
        const keywords = SECTOR_KEYWORDS[sector] ?? [sector.replace(/_/g, ' ')]
        let hits = 0
        // Check each profile text entry for keyword matches
        for (const text of profileTexts) {
          if (keywords.some(kw => text.includes(kw))) hits++
        }
        // Also check mission statement
        if (keywords.some(kw => missionLower.includes(kw))) hits++
        // Normalise: 0 hits = 0, 1 hit = 0.3, 2 hits = 0.6, 3+ hits = 1.0
        totalDepth += hits >= 3 ? 1.0 : hits >= 2 ? 0.6 : hits >= 1 ? 0.3 : 0
      }

      const avgDepth = intersection.length > 0 ? totalDepth / intersection.length : 0
      const depthBoost = Math.round(avgDepth * 5) // up to +5 points
      themesScore = Math.min(20, themesScore + depthBoost)

      if (depthBoost >= 3) {
        reasons.push(`${intersection.map(sectorDisplayLabel).join(' & ')} — strong match for ${org.name}'s focus`)
      } else {
        reasons.push(`${intersection.map(sectorDisplayLabel).join(' & ')} aligns with ${org.name}'s work`)
      }
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
      themesScore = Math.round(ratio * 20)

      if (ratio >= 0.4)       reasons.push('Strong theme match')
      else if (ratio >= 0.15) reasons.push('Partial theme match')
    }

    // Direct sector-to-theme comparison (exact substring match boost)
    const grantSectorsLower = grant.sectors.map(s => s.toLowerCase())
    const orgThemesFlat     = (org.themes ?? []).map(t => t.toLowerCase())
    const sectorHits        = grantSectorsLower.filter(s =>
      orgThemesFlat.some(t => s.includes(t.split(' ')[0]) || t.includes(s.split(' ')[0]))
    ).length
    themesScore = Math.min(20, themesScore + sectorHits * 4)
  }


  // ── Niche tag sub-sector bonus (max +8) ───────────────────────────────
  // When both the grant and the org carry niche_tags (e.g. "music", "theatre"),
  // a matching tag is a strong signal that this is a highly specific fit.
  // Only fires when sectors already overlap (primaryDomainMismatch = false),
  // so we're always rewarding specificity within a valid sector match.
  // If the org has no niche_tags set yet we silently skip — no penalty.
  const grantNicheTags = (grant.nicheTags ?? []).map(t => t.toLowerCase())
  const orgNicheTags   = (org.niche_tags   ?? []).map(t => t.toLowerCase())

  if (!primaryDomainMismatch && grantNicheTags.length > 0 && orgNicheTags.length > 0) {
    const nicheIntersection = grantNicheTags.filter(t => orgNicheTags.includes(t))
    if (nicheIntersection.length > 0) {
      // Bonus scales with how specific the grant is: a grant tagged with 2 niche
      // tags and you match 1 is weaker than a single-tag grant you perfectly match.
      const nichematch = nicheIntersection.length / Math.max(grantNicheTags.length, 1)
      const nicheBonus = Math.round(nichematch * 8)
      themesScore = Math.min(25, themesScore + nicheBonus)
      if (nicheBonus >= 4) reasons.push(`Specialist ${nicheIntersection[0].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} focus — matches ${org.name}'s specialism`)
    } else {
      // ── Specialism conflict ─────────────────────────────────────────────────
      // Both sides have DECLARED specialisms (niche_tags) AND they don't
      // overlap. The sector match is real but coincidental — e.g. a music
      // grant for a theatre company fully matches "creative" sector but
      // the actual practice is different.
      //
      // Cap raw themes at 25 FIRST (the normal visual max), THEN apply the
      // dampen. Without the pre-cap, raw scores >55 (e.g. perfect 3-sector
      // overlap with high IDF) round back to 25 after multiplication and
      // the dampen silently disappears.
      const cappedThemes = Math.min(25, themesScore)
      const reduced      = Math.round(cappedThemes * 0.45)
      if (reduced < themesScore) {
        themesScore = Math.max(8, reduced)
        const grantNiche = grantNicheTags[0].replace(/_/g, ' ')
        const orgNiche   = orgNicheTags[0].replace(/_/g, ' ')
        reasons.push(`Different specialism (${grantNiche} vs ${orgNiche}) — ranked lower than specialism-aligned matches`)
      }
    }
  }

    // ── Title keyword veto ────────────────────────────────────────────────
  // Grant titles and descriptions are high-confidence domain signals — catches mismatches
  // even when impact_sectors is absent or sparsely tagged.  Only fires when
  // the org has some sector/theme data (can't veto a completely blank profile).
  // Supplements the structured primaryDomainMismatch check above.
  const orgHasProfile = orgImpactSectors.length > 0 || (org.themes ?? []).length > 0
  if (orgHasProfile && !primaryDomainMismatch) {
    const orgSectorSet = new Set(orgImpactSectors)
    const orgThemeStrings = (org.themes ?? []).map(t => t.toLowerCase())
    const orgMissionLower = (org.mission ?? '').toLowerCase()
    const titleLower = grant.title.toLowerCase()
    for (const { words, orgTerms } of TITLE_DOMAIN_KEYWORDS) {
      if (words.some(w => titleLower.includes(w))) {
        // Substring match against themes/mission so multi-word themes like
        // "food poverty" or "environmental education" still register as coverage.
        const orgCovers = orgTerms.some(t =>
          orgSectorSet.has(t) ||
          orgThemeStrings.some(theme => theme.includes(t)) ||
          orgMissionLower.includes(t)
        )
        if (!orgCovers) {
          primaryDomainMismatch = true
          themesScore = Math.min(themesScore, 5)
        }
        break
      }
    }
  }

  // ── FunderBrief specialist domain check ──────────────────────────────
  // When the title-based keyword veto didn't fire, check funderBrief.what_they_fund
  // for strong specialist signals. This catches grants like "Ulverscroft Foundation"
  // where the title is generic but what_they_fund clearly indicates a specialist domain.
  if (!primaryDomainMismatch && funderBriefText.length > 0) {
    const wtfLower = funderBriefText.toLowerCase()
    for (const { words, orgTerms } of TITLE_DOMAIN_KEYWORDS) {
      if (words.some(w => wtfLower.includes(w))) {
        const orgSectorSet2 = new Set(orgImpactSectors)
        const orgThemeStrings2 = (org.themes ?? []).map(t => t.toLowerCase())
        const orgMissionLower2 = (org.mission ?? '').toLowerCase()
        const orgCovers = orgTerms.some(t =>
          orgSectorSet2.has(t) ||
          orgThemeStrings2.some(theme => theme.includes(t)) ||
          orgMissionLower2.includes(t)
        )
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

  // ── 3. Beneficiary match (max 10) ──────────────────────────────────────
  // Structured beneficiary taxonomy: org has a primary (index 0, weight 1.0)
  // plus equal-weight secondaries (0.7 each). Grant-side beneficiary tags
  // have no rank — all treated equally.
  let beneficiaryScore = 5 // neutral base when either side has no data
  const orgBeneficiaries = (org.beneficiary_groups ?? []) as BeneficiaryGroup[]
  const grantBeneficiaries = (grant.beneficiaryGroups ?? []) as BeneficiaryGroup[]

  if (orgBeneficiaries.length > 0 && grantBeneficiaries.length > 0) {
    // Check for opposing group conflicts (children vs older_people, etc.)
    const conflictPairs: [BeneficiaryGroup, BeneficiaryGroup][] = [
      ['children', 'older_people'],
      ['young_people', 'older_people'],
      ['women_girls', 'men_boys'],
    ]
    let hasConflict = false
    for (const [a, b] of conflictPairs) {
      const grantHasA = grantBeneficiaries.includes(a)
      const grantHasB = grantBeneficiaries.includes(b)
      const orgHasA   = orgBeneficiaries.includes(a)
      const orgHasB   = orgBeneficiaries.includes(b)
      // Conflict: grant targets group A exclusively, org only serves group B
      if (grantHasA && !grantHasB && orgHasB && !orgHasA) { hasConflict = true; break }
      if (grantHasB && !grantHasA && orgHasA && !orgHasB) { hasConflict = true; break }
    }

    if (hasConflict) {
      beneficiaryScore = 1
      reasons.push('Grant targets a different beneficiary group — check eligibility')
    } else {
      // general_public is a universal match — skip structured scoring
      const grantIsGeneral = grantBeneficiaries.includes('general_public')
      const orgIsGeneral   = orgBeneficiaries.includes('general_public')

      if (grantIsGeneral || orgIsGeneral) {
        beneficiaryScore = 5 // neutral — no bonus, no penalty
      } else {
        // Weighted intersection: primary org beneficiary = 1.0, secondaries = 0.7
        const intersection = grantBeneficiaries.filter(b => orgBeneficiaries.includes(b))

        if (intersection.length > 0) {
          // Weight the intersection from the org's perspective
          let weightedHits = 0
          let weightedTotal = 0
          for (let i = 0; i < orgBeneficiaries.length; i++) {
            const w = i === 0 ? 1.0 : 0.7 // primary vs secondary
            weightedTotal += w
            if (grantBeneficiaries.includes(orgBeneficiaries[i])) {
              weightedHits += w
            }
          }
          const coverage = weightedTotal > 0 ? weightedHits / weightedTotal : 0
          beneficiaryScore = Math.max(3, Math.round(coverage * 10))

          // Check if the org's PRIMARY beneficiary matched
          if (grantBeneficiaries.includes(orgBeneficiaries[0])) {
            reasons.push(`Targets ${org.name}'s primary beneficiaries`)
          } else {
            reasons.push(`Partial beneficiary match for ${org.name}`)
          }
        } else {
          // No intersection — different beneficiary groups
          beneficiaryScore = 2
          reasons.push('Different target beneficiary group')
        }
      }
    }
  }
  // If either side has no data, score stays at neutral (5)

// ── 4. Grant size (informational only — always neutral) ──────
  // Grant size is not used as a ranking signal: orgs typically want the
  // largest grant available, so penalising large grants distorts relevance.
  // Amounts still appear in the UI breakdown for reference only.
  const grantSizeScore = 10

    // ── 5. Funder type preference + funding type affinity (max 15) ────────
  let funderTypeScore = 8 // neutral base

  // Funder type preference (trust vs government vs lottery etc.)
  if (org.funder_type_preferences?.length) {
    if (org.funder_type_preferences.includes(grant.funderType)) {
      funderTypeScore = 15
      reasons.push(`${grant.funderType.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())} — preferred funder type`)
    } else {
      funderTypeScore = 5  // non-preferred but not catastrophic
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
        reasons.push(`${ft.charAt(0).toUpperCase()+ft.slice(1)} funding matches your preference`)
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
        reasons.push(`Programme funding suits ${org.name}'s stage`)
      } else if (isGrowth && ft === 'investment') {
        funderTypeScore = Math.min(15, funderTypeScore + 2)
        reasons.push(`Social investment suits ${org.name}'s growth stage`)
      }
    }
  }

  // Funding sub-type affinity — mirror of the funding_type logic but finer-grained.
  // This is the payoff for three sessions of sub-type classification work:
  // users who say "I want unrestricted core funding" now get unrestricted grants
  // ranked meaningfully higher than project-restricted ones.
  const subPrefs = org.funding_subtype_preferences ?? []
  if (grant.fundingSubtype && subPrefs.length > 0) {
    if (subPrefs.includes(grant.fundingSubtype)) {
      // Matches a preferred sub-type → strong boost and push toward the ceiling.
      funderTypeScore = Math.min(15, funderTypeScore + 5)
      // Unrestricted is the "holy grail" — give it an extra nudge in the reason
      // so it surfaces clearly in the UI, but keep the numeric bonus capped.
      if (grant.fundingSubtype === 'unrestricted') {
        reasons.push(`Unrestricted core funding — exactly what ${org.name} is looking for`)
      } else {
        const subtypeLabel = grant.fundingSubtype.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        reasons.push(`Matches your ${subtypeLabel} preference`)
      }
    } else {
      // User set preferences but this sub-type isn't one — mild penalty.
      // Keep lighter than the fundingType miss to avoid compounding.
      funderTypeScore = Math.max(0, funderTypeScore - 2)
    }
  }

  // ── 6. Eligibility / org type (max 15) ────────────────────────────────
  // Prefer the modern legal_structure field; fall back to legacy org_type.
  // CIO is a charity structure, so treat it as charity-like for scoring.
  const isCharityLike =
    org.legal_structure === 'registered_charity' ||
    org.legal_structure === 'cio' ||
    (org.legal_structure == null && org.org_type === 'registered_charity')
  const isCICLike =
    org.legal_structure === 'cic_guarantee' ||
    org.legal_structure === 'cic_shares' ||
    (org.legal_structure == null && org.org_type === 'cic')
  const isSELike =
    org.legal_structure === 'ltd_guarantee' ||
    org.legal_structure === 'ltd_shares' ||
    org.legal_structure === 'cooperative' ||
    (org.legal_structure == null && org.org_type === 'social_enterprise')

  let eligibilityScore: number =
    isCharityLike ? 12 :
    isCICLike     ? 10 :
    isSELike      ? 9  : 7

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

    if (isCharityEligible && isCharityLike) {
      eligibilityScore = Math.min(15, eligibilityScore + 3)
      reasons.push(`${org.name} qualifies as a registered charity`)
    } else if (isCICEligible && isCICLike) {
      eligibilityScore = Math.min(15, eligibilityScore + 3)
      reasons.push(`${org.name} qualifies as a CIC`)
    } else if (isSEEligible && (isSELike || isCICLike)) {
      eligibilityScore = Math.min(15, eligibilityScore + 2)
    } else if (isCharityEligible && !isCharityLike) {
      // Hard penalty — "registered charity" requirement is a strong eligibility gate
      eligibilityScore = Math.max(1, eligibilityScore - 12)
      structureMismatch = true
      reasons.push(`May require registered charity status — verify ${org.name}'s eligibility`)
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
      const orgHasFaith =
        (org.themes ?? []).some((t: string) => ['faith', 'religion', 'church', 'worship'].some(f => t.includes(f))) ||
        (org.mission ?? '').toLowerCase().match(/\b(church|faith|worship|mosque|synagogue|chapel)\b/) !== null
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
        reasons.push(`${org.name}'s income may exceed this grant's cap`)
      } else {
        eligibilityScore = Math.min(15, eligibilityScore + 1)
      }
    }

    // ── Trading history / account age check ──────────────────────────────
    // Some grants require a minimum number of years operating or published accounts.
    // If the org's years_operating is set and falls short, apply a soft penalty.
    if (org.years_operating != null && eligibilityText.length > 20) {
      const accountsMatch = eligibilityText.match(
        /(?:minimum\s+)?(\d+)\s+(?:full\s+)?years?\s+(?:of\s+)?(?:published\s+)?accounts|(\d+)\s+years?\s+(?:trading|operating|established)/i
      )
      if (accountsMatch) {
        const required = parseInt(accountsMatch[1] ?? accountsMatch[2])
        if (!isNaN(required)) {
          if (org.years_operating < required) {
            eligibilityScore = Math.max(1, eligibilityScore - 5)
            reasons.push(`May require ${required}+ years of accounts — check eligibility`)
          } else {
            eligibilityScore = Math.min(15, eligibilityScore + 1)
          }
        }
      }
    }
  }

  // ── eligible_structures hard gate ────────────────────────────────────
  // When a grant has explicit structure requirements, override the soft
  // text-based eligibility with a hard structured check.
  if (grant.eligibleStructures && grant.eligibleStructures.length > 0 && org.legal_structure) {
    // Only use explicit legal_structure — org_type fallback is too broad for a hard gate

    {
      // Normalize both sides before comparing — bridges vocabulary mismatches
      // between the DB's scraped values ('cic', 'charity', 'coop') and the
      // code's LegalStructure enum ('cic_guarantee', 'registered_charity', 'cooperative')
      const orgTokens   = new Set(normalizeStructureTokens(org.legal_structure))
      const grantTokens = grant.eligibleStructures!.flatMap(s => normalizeStructureTokens(s))
      const isEligible  = grantTokens.some(t => orgTokens.has(t))

      if (isEligible) {
        // Confirmed eligible — structured data overrides any earlier text-based mismatch flag
        structureMismatch = false
        eligibilityScore = Math.min(15, eligibilityScore + 3)
        const label = structureLabel(org.legal_structure)
        reasons.push(`${org.name} (${label}) is listed as eligible`)
      } else {
        // Hard ineligibility — significant penalty
        // Leave a floor of 1 so it still appears (with low score) rather than disappearing
        eligibilityScore = Math.max(1, Math.min(eligibilityScore, 4))
        structureMismatch = true
        reasons.push(`${org.name}'s structure may not qualify — check before applying`)
      }
    }
    // Hard gate skipped when no legal_structure set — handled by condition above
  }

  // ── Total ──────────────────────────────────────────────────────────────
  // Weights vary by funding type. Grants weight beneficiaries heavily (20pts)
  // because charity grants typically pick on who you serve. In-kind, programme
  // and investment funders pick on what your organisation does (themes) and
  // its viability (eligibility) — they fund the org itself, not its end users.
  // For those, beneficiary signal is mostly noise, so we drop it to 5 and
  // route the freed 15 points to themes.
  const isOrgCentredType = grant.fundingType === 'in_kind'
                        || grant.fundingType === 'investment'
                        || grant.fundingType === 'programme'

  // DIAG: sentinel value 37 (was 35) — if you see T x/37 in cohort audit,
  // matching.ts is live; if still T x/25, the build is stuck on the deleted .js.
  const themesMax       = isOrgCentredType ? 50 : 37
  const beneficiaryMax  = isOrgCentredType ?  5 : 20

  const wLocation     = Math.round(locationScore     * 15 / 20)
  const wThemes       = Math.round(themesScore       * themesMax / 25)
  const wBeneficiary  = Math.round(beneficiaryScore  * beneficiaryMax / 10)
  const wFunderType   = Math.round(funderTypeScore   *  8 / 15)
  const wEligibility  = Math.round(eligibilityScore  * 12 / 15)

  let score = Math.min(100,
    wLocation + wThemes + wBeneficiary + grantSizeScore + wFunderType + wEligibility
  )

  // Freshness bonus — newly added grants get a gentle tiebreaker boost so fresh
  // opportunities surface ahead of stale grants with identical base scores.
  // Uses dateAdded only (NOT lastVerifiedAt) — we want "new to the catalogue",
  // not "recently re-crawled", otherwise every live scraped grant gets the bonus
  // uniformly and legacy seed grants are unfairly demoted.
  // Kept small so it's a tiebreaker, not a ranking lever.
  // Applied BEFORE mismatch caps so it never inflates a structurally ineligible grant.
  if (grant.dateAdded) {
    const daysOld = Math.floor((Date.now() - new Date(grant.dateAdded).getTime()) / (1000 * 60 * 60 * 24))
    const freshnessBonus = daysOld <= 3 ? 3 : daysOld <= 7 ? 2 : daysOld <= 14 ? 1 : 0
    score = Math.min(100, score + freshnessBonus)
  }

  // Cap total score when legal structure is likely ineligible — no matter how
  // strong the location/sector match is, a structure mismatch is a deal-breaker.
  if (structureMismatch) {
    score = Math.min(score, 45)
  }

  // Cap total score for grants restricted to an area outside the org's — a
  // strong sector match shouldn't make a Somerset grant look relevant to a
  // London org. For orgs whose geographic_reach is local or regional, a
  // wrong-area grant is pure noise (they can't deliver there), so bury it
  // hard — well below the Weak-match band — rather than leaving it at ~44%.
  if (locationMismatch) {
    const reach    = (org.geographic_reach ?? '').toLowerCase()
    const localOrg = reach === 'local' || reach === 'regional'
    score = Math.min(score, localOrg ? 15 : 44)
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

  // Hard structural flags always produce a warn
  if (locationMismatch && !warns.some(w => /geograph|location|area|borough|region/i.test(w))) {
    const tag = grant.locationTag ?? 'a specific area'
    warns.push('Geographic focus: ' + grant.funder + ' focuses on ' + tag + ' - your delivery area may not qualify')
  }
  if (primaryDomainMismatch && !warns.some(w => /sector|domain|speciali/i.test(w))) {
    warns.push('Sector depth: this grant sits in a specialist domain that does not align with your primary focus')
  }
  if (structureMismatch && !warns.some(w => /structure|eligib|charity|CIC/i.test(w))) {
    warns.push('Legal structure: your organisation type may not meet this funder eligibility requirements')
  }

  // Guaranteed caveat synthesis for sub-80 matches:
  // rank dimensions by how far they are from their max, always surface the weakest one(s)
  if (score < 80) {
    const dimGaps: Array<{ key: string; gap: number; msg: string }> = [
      { key: 'themes',      gap: 35 - wThemes,       msg: 'Sector alignment: thematic overlap with this funder priority areas is limited' },
      { key: 'beneficiary', gap: 20 - wBeneficiary,  msg: 'Beneficiary group: this funder target group may not fully match your primary beneficiaries' },
      { key: 'location',    gap: 15 - wLocation,     msg: 'Geographic focus: limited location overlap - check whether this funder covers your area' },
      { key: 'eligibility', gap: 12 - wEligibility,  msg: 'Eligibility: some requirements are unclear - review the criteria carefully before applying' },
      { key: 'funderType',  gap: 8  - wFunderType,   msg: 'Funder type: this funder type is outside your stated preferences' },
    ].filter(d => d.gap > 0)
    dimGaps.sort((a, b) => b.gap - a.gap)
    // Always add caveat for the weakest dimension unless already covered
    const dimKeywords: Record<string, RegExp> = {
      themes:      /sector|theme|align/i,
      beneficiary: /beneficiar|group|target/i,
      location:    /geograph|location|area/i,
      eligibility: /eligib|structure|require/i,
      funderType:  /funder type|preference/i,
    }
    const toAdd = dimGaps.filter(d => !warns.some(w => dimKeywords[d.key].test(w)))
    const limit = score < 60 ? 2 : 1
    toAdd.slice(0, limit).forEach(d => warns.push(d.msg))
  }

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

  // ── Ineligibility Shield — compute explicit eligibility status ───────
  // Priority order: hard structure gate > text-based mismatch > soft checks
  let eligibilityStatus: EligibilityStatus
  let eligibilityReason: string | null = null

  if (structureMismatch && grant.eligibleStructures && grant.eligibleStructures.length > 0) {
    // Hard gate: grant has explicit structure list and org is not in it
    const orgStructure = org.legal_structure
    const orgLabel = orgStructure ? structureLabel(orgStructure) : 'your structure'
    const allowedLabels = grant.eligibleStructures
      .map(s => structureLabel(s))
      .filter((v, i, a) => a.indexOf(v) === i)  // dedupe
      .slice(0, 3)
      .join(', ')
    eligibilityStatus = 'ineligible'
    eligibilityReason = `Requires ${allowedLabels}. As a ${orgLabel}, you are not eligible to apply.`
  } else if (structureMismatch) {
    // Text-based mismatch (charity-only language detected but no structured list)
    const orgLabel = org.legal_structure ? structureLabel(org.legal_structure) : 'your structure'
    eligibilityStatus = 'ineligible'
    eligibilityReason = `This funder appears to require registered charity status. As a ${orgLabel}, check carefully before applying.`
  } else if (grant.eligibleStructures && grant.eligibleStructures.length > 0 && !structureMismatch) {
    // Structured list exists and org passed — explicitly eligible
    const orgLabel = org.legal_structure ? structureLabel(org.legal_structure) : 'your organisation'
    eligibilityStatus = 'eligible'
    eligibilityReason = `Your structure (${orgLabel}) is listed as eligible.`
  } else if (eligibilityScore >= 12) {
    eligibilityStatus = 'eligible'
    eligibilityReason = null
  } else if (eligibilityScore >= 8) {
    eligibilityStatus = 'likely_eligible'
    eligibilityReason = null
  } else {
    eligibilityStatus = 'check_required'
    eligibilityReason = 'Eligibility requirements are unclear — verify before applying.'
  }

  // ── Branched eligibility engine ──────────────────────────────────────
  // Type-aware checks (investment / programme / in-kind / grant) layered on
  // top of the legacy verdict above. A blocker from the engine downgrades the
  // verdict to 'ineligible' and tightens the score cap; a warning downgrades
  // 'eligible' → 'check_required'. Engine 'info' issues are surfaced as warns
  // but do not change the verdict.
  const branchedVerdict = runEligibilityChecks(grant, org)
  const hasBranchedBlocker = branchedVerdict.issues.some(i => i.severity === 'blocker')
  const hasBranchedWarning = branchedVerdict.issues.some(i => i.severity === 'warning')

  if (hasBranchedBlocker) {
    eligibilityStatus = 'ineligible'
    eligibilityReason = branchedVerdict.reason
    score = Math.min(score, 30)
  } else if (hasBranchedWarning && eligibilityStatus === 'eligible') {
    eligibilityStatus = 'check_required'
    if (!eligibilityReason) eligibilityReason = branchedVerdict.reason
  }

  // Surface engine messages in the warn list (deduped against existing warns)
  for (const issue of branchedVerdict.issues) {
    if (issue.severity === 'info') continue
    if (!warns.includes(issue.message)) warns.push(issue.message)
  }

  return {
    score,
    reason,
    eligibilityStatus,
    eligibilityReason,
    positiveReasons: positives,
    warnReasons:     warns,
    eligibilityIssues: branchedVerdict.issues,
    breakdown: {
      location:      { score: wLocation,     max: 15,             label: 'Location' },
      themes:        { score: wThemes,       max: themesMax,      label: 'Themes & work' },
      beneficiaries: { score: wBeneficiary,  max: beneficiaryMax, label: 'Beneficiaries' },
      grantSize:     { score: grantSizeScore, max: 10,            label: 'Grant size' },
      funderType:    { score: wFunderType,   max: 8,              label: 'Funder type' },
      eligibility:   { score: wEligibility,  max: 12,             label: 'Eligibility' },
    },
  }
}

/** Score colour based on value */
export function scoreColour(score: number): { bg: string; text: string; bar: string } {
  if (score >= 80) return { bg: 'bg-sage/15',  text: 'text-sage',  bar: 'bg-sage'  }
  if (score >= 65) return { bg: 'bg-gold/15',  text: 'text-gold',  bar: 'bg-gold'  }
  if (score >= 45) return { bg: 'bg-warm',     text: 'text-mid',   bar: 'bg-mid'   }
  return               { bg: 'bg-coral-pale',   text: 'text-coral-saturated', bar: 'bg-coral-mid' }
}

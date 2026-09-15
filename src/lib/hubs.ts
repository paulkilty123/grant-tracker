/**
 * Hub pages: the catalogue browsed by sector, region and funding type.
 *
 * WHY THESE EXIST
 *
 * Measured 2026-09-15: every one of the 660 public grant pages was reachable
 * only through the sitemap. A grant page linked to nothing else in the
 * catalogue and the homepage linked to no grant page at all. A crawler that
 * finds a few hundred unlinked pages treats them as unimportant and stops
 * fetching them, and Umami showed twenty-two visits a week from Google, which
 * is what "indexed but not much" looks like.
 *
 * A hub is a page a person would actually want ("Funding for arts
 * organisations in Scotland") that links to every live row in its bucket, and
 * every grant page links back up to its hubs and sideways to its neighbours.
 * That is the whole mechanism: the links, not the copy.
 *
 * Nothing here reads session or cookies. Hubs are public, the row set is the
 * same one the sitemap advertises (is_active AND published), and the reads go
 * through getAdminDb so a cached fetch cannot freeze a hub at its first render
 * after a deploy (see feedback_raw_service_client_serves_stale_rows).
 */
import { getAdminDb } from '@/lib/admin/admin-db'
import { grantInGeoSelection } from '@/lib/matching'

// ── Row shape ────────────────────────────────────────────────────────────────

export const HUB_ROW_COLUMNS =
  'id, external_id, title, funder, funding_type, amount_min, amount_max, amount_undisclosed, deadline, is_rolling, location_tag, is_local, impact_sectors, first_seen_at, url_last_checked'

export interface HubRow {
  id: string
  external_id: string | null
  title: string
  funder: string | null
  funding_type: string | null
  amount_min: number | null
  amount_max: number | null
  amount_undisclosed: boolean | null
  deadline: string | null
  is_rolling: boolean | null
  location_tag: string | null
  is_local: boolean | null
  impact_sectors: string[] | null
  first_seen_at?: string | null
  url_last_checked?: string | null
}

/** The public URL slug: the same choice the sitemap makes, never two URLs for one row. */
export function grantSlug(row: Pick<HubRow, 'id' | 'external_id'>): string {
  return encodeURIComponent(String(row.external_id ?? row.id))
}

export function grantPath(row: Pick<HubRow, 'id' | 'external_id'>): string {
  return `/grants/${grantSlug(row)}`
}

// ── Sectors ──────────────────────────────────────────────────────────────────

/**
 * Display labels for impact_sectors. This was a private map on the grant page
 * covering sixteen of the twenty-two values in the live catalogue; the other
 * six rendered as their raw keys. One map now, used by the page and the hubs.
 */
export const IMPACT_SECTOR_LABELS: Record<string, string> = {
  creative:          'Arts & Culture',
  environment:       'Environment',
  health:            'Health',
  education:         'Education',
  tech:              'Technology',
  housing:           'Housing',
  food:              'Food',
  employment:        'Employment',
  community:         'Community',
  justice:           'Justice & Equality',
  financial:         'Financial Inclusion',
  international:     'International',
  heritage:          'Heritage',
  sport:             'Sport',
  social_economy:    'Social Economy',
  mental_health:     'Mental Health',
  young_people:      'Young People',
  children:          'Children',
  older_people:      'Older People',
  disability:        'Disability',
  women:             'Women & Girls',
  social_innovation: 'Social Innovation',
}

/** URL slug for a sector key: underscores become hyphens, nothing else changes. */
export function sectorSlug(key: string): string {
  return key.replace(/_/g, '-')
}
export function sectorKeyFromSlug(slug: string): string | null {
  const key = slug.replace(/-/g, '_')
  return IMPACT_SECTOR_LABELS[key] ? key : null
}

/**
 * The phrase that follows "funding for" in titles and intros. Lower case
 * except the proper nouns, and shaped as a kind of work rather than a label:
 * "arts and culture" reads; "Arts & Culture funding" reads like a category
 * heading.
 */
export const SECTOR_PHRASE: Record<string, string> = {
  creative:          'arts and culture',
  environment:       'environmental projects',
  health:            'health and wellbeing',
  education:         'education and learning',
  tech:              'technology and digital projects',
  housing:           'housing and homelessness',
  food:              'food projects',
  employment:        'employment and skills',
  community:         'community projects',
  justice:           'justice and equality',
  financial:         'financial inclusion',
  international:     'international development',
  heritage:          'heritage projects',
  sport:             'sport and physical activity',
  social_economy:    'the social economy',
  mental_health:     'mental health',
  young_people:      'young people',
  children:          'children',
  older_people:      'older people',
  disability:        'disabled people',
  women:             'women and girls',
  social_innovation: 'social innovation',
}

// ── Regions ──────────────────────────────────────────────────────────────────

export interface RegionHub {
  slug: string
  /** Short name, used in chips and lists. */
  label: string
  /** "in Scotland", "across the UK": the phrase that follows a noun. */
  phrase: string
  matches: (tag: string | null) => boolean
}

const INTERNATIONAL_RE = /\b(global|worldwide|international|europe|eu|usa|multi-country|central asia)\b/i

function isInternational(tag: string | null): boolean {
  if (!tag) return false
  // "UK & Global" is a UK funder with an overseas arm; it stays UK-wide.
  if (/\buk\b/i.test(tag)) return false
  return INTERNATIONAL_RE.test(tag)
}

/**
 * Sub-national places outside England. grantInGeoSelection's 'england' branch
 * admits any regional tag that does not say Scotland, Wales or Northern
 * Ireland by name, which is right for a matcher (a Glasgow org has its own
 * nation word in its own profile) and wrong for a hub: the first run of the
 * bucketing check on 2026-09-15 put Belfast, Glasgow, Pembrokeshire and
 * Aberdeenshire on the England page. So a nation hub also claims by place.
 * Matched as whole words on the lower-cased tag.
 */
const SCOTLAND_PLACES = [
  'scotland', 'scottish', 'highland', 'highlands', 'aberdeenshire', 'aberdeen', 'dundee', 'fife', 'stirling',
  'perth', 'kinross', 'argyll', 'bute', 'angus', 'renfrewshire', 'lanarkshire', 'lothian', 'lothians',
  'edinburgh', 'glasgow', 'inverness', 'clackmannanshire', 'falkirk', 'dumfries', 'galloway', 'ayrshire',
  'scottish borders', 'orkney', 'shetland', 'western isles', 'moray', 'dunbartonshire', 'inverclyde', 'halkirk',
  'ballantrae', 'caithness', 'sutherland',
]
const WALES_PLACES = [
  'wales', 'welsh', 'cymru', 'gwynedd', 'powys', 'ceredigion', 'pembrokeshire', 'carmarthenshire', 'swansea',
  'cardiff', 'newport', 'wrexham', 'flintshire', 'denbighshire', 'conwy', 'anglesey', 'rhondda', 'merthyr',
  'caerphilly', 'blaenau', 'torfaen', 'bridgend', 'neath', 'glamorgan', 'monmouthshire',
]
const NI_PLACES = [
  'northern ireland', 'belfast', 'antrim', 'armagh', 'londonderry', 'derry', 'tyrone', 'fermanagh',
  'causeway coast', 'lisburn', 'newry', 'mourne', 'ards', 'craigavon',
]
/**
 * London boroughs. grantInGeoSelection's 'london' branch only tests for the
 * word, so "Camden" (4 rows), "Islington" (3), "Westminster" (3) and twenty
 * more borough-tagged rows missed the London page on the first fixture run.
 * Bare "Richmond", "Kingston" and "Sutton" are left out: each is also a town
 * elsewhere, and the catalogue tags them with "upon Thames" when it means the
 * borough.
 */
const LONDON_PLACES = [
  'london', 'lambeth', 'southwark', 'lewisham', 'greenwich', 'bexley', 'bromley', 'croydon', 'merton',
  'kingston upon thames', 'richmond upon thames', 'wandsworth', 'hammersmith', 'fulham', 'kensington',
  'chelsea', 'westminster', 'camden', 'islington', 'hackney', 'tower hamlets', 'newham', 'barking',
  'dagenham', 'havering', 'redbridge', 'waltham forest', 'haringey', 'enfield', 'barnet', 'harrow', 'brent',
  'ealing', 'hounslow', 'hillingdon', 'city of london',
]
function mentionsAny(tag: string | null, places: string[]): boolean {
  if (!tag) return false
  const t = tag.toLowerCase()
  return places.some(p => new RegExp(`(^|[^a-z])${p}([^a-z]|$)`).test(t))
}
const inScotland = (t: string | null) => mentionsAny(t, SCOTLAND_PLACES)
const inWales    = (t: string | null) => mentionsAny(t, WALES_PLACES)
const inNI       = (t: string | null) => mentionsAny(t, NI_PLACES)
const inLondon   = (t: string | null) => mentionsAny(t, LONDON_PLACES)

/**
 * "UK-wide" here is what the matcher calls national: UK, no tag, or a set of
 * non-contiguous areas. grantInGeoSelection answers true for those on EVERY
 * selection, so the nation hubs subtract them explicitly. A UK-wide fund
 * belongs on the UK page once, not on five pages.
 */
function isUkWide(tag: string | null): boolean {
  if (isInternational(tag)) return false
  // "UK (15 designated places)", "Luton & UK", "UK & Portugal": the matcher
  // reads these as regional and the England fallback took them. A tag that
  // says UK is a UK-wide row for the purpose of a browse page.
  if (tag && /\buk\b/i.test(tag)) return true
  return grantInGeoSelection(tag, 'uk')
}

export const REGION_HUBS: RegionHub[] = [
  { slug: 'uk',               label: 'UK-wide',          phrase: 'across the UK',
    matches: t => isUkWide(t) },
  // A tag that names a nation list ("England & Wales") is admitted to each
  // nation it names; a place tag is admitted to the nation the place is in.
  // England is the remainder: a regional tag that names no non-English
  // nation or place, plus any list that names England.
  { slug: 'england',          label: 'England',          phrase: 'in England',
    matches: t => !isUkWide(t) && !isInternational(t) && grantInGeoSelection(t, 'england')
      && (grantInGeoSelection(t, 'scotland') || grantInGeoSelection(t, 'wales') || grantInGeoSelection(t, 'northern_ireland')
          || !(inScotland(t) || inWales(t) || inNI(t))) },
  { slug: 'london',           label: 'London',           phrase: 'in London',
    matches: t => !isUkWide(t) && !isInternational(t) && (grantInGeoSelection(t, 'london') || inLondon(t)) },
  { slug: 'scotland',         label: 'Scotland',         phrase: 'in Scotland',
    matches: t => !isUkWide(t) && !isInternational(t) && (grantInGeoSelection(t, 'scotland') || inScotland(t)) },
  { slug: 'wales',            label: 'Wales',            phrase: 'in Wales',
    matches: t => !isUkWide(t) && !isInternational(t) && (grantInGeoSelection(t, 'wales') || inWales(t)) },
  { slug: 'northern-ireland', label: 'Northern Ireland', phrase: 'in Northern Ireland',
    matches: t => !isUkWide(t) && !isInternational(t) && (grantInGeoSelection(t, 'northern_ireland') || inNI(t)) },
  { slug: 'international',    label: 'International',    phrase: 'working internationally',
    matches: t => isInternational(t) },
]

export function regionHub(slug: string): RegionHub | null {
  return REGION_HUBS.find(r => r.slug === slug) ?? null
}

/** The most specific region hub a row belongs to, for its breadcrumb. */
export function regionHubForRow(row: Pick<HubRow, 'location_tag'>): RegionHub | null {
  const tag = row.location_tag
  // London before England: a London row matches both, and the narrower page
  // is the one its neighbours are on. A nation list that names England
  // ("England & Wales") crumbs to England rather than to whichever other
  // nation is checked first; it is on both pages either way.
  if (tag && /\bengland\b/i.test(tag) && regionHub('england')!.matches(tag)) return regionHub('england')
  const order = ['london', 'scotland', 'wales', 'northern-ireland', 'international', 'england', 'uk']
  for (const slug of order) {
    const hub = regionHub(slug)!
    if (hub.matches(tag)) return hub
  }
  return null
}

// ── Funding types ────────────────────────────────────────────────────────────

export interface TypeHub {
  slug: 'grants' | 'programmes' | 'investment' | 'in-kind'
  /** The FUNDING_TYPE_COLOUR key, for the chip. */
  typeKey: 'grant' | 'programme' | 'investment' | 'in_kind'
  label: string
  /** Plural noun for titles: "Grants", "Programmes and accelerators". */
  noun: string
  /** Raw funding_type values that land here. Mirrors TYPE_KEY on the grant page. */
  rawTypes: string[]
}

export const TYPE_HUBS: TypeHub[] = [
  { slug: 'grants',     typeKey: 'grant',      label: 'Grants',      noun: 'Grants',
    rawTypes: ['grant'] },
  { slug: 'programmes', typeKey: 'programme',  label: 'Programmes',  noun: 'Programmes and accelerators',
    rawTypes: ['programme', 'support_programme', 'accelerator'] },
  { slug: 'investment', typeKey: 'investment', label: 'Investment',  noun: 'Social investment and loans',
    rawTypes: ['investment', 'social_investment', 'loan', 'equity', 'blended_finance'] },
  { slug: 'in-kind',    typeKey: 'in_kind',    label: 'In-kind',     noun: 'In-kind support',
    rawTypes: ['in_kind', 'in-kind'] },
]

export function typeHub(slug: string): TypeHub | null {
  return TYPE_HUBS.find(t => t.slug === slug) ?? null
}

export function typeHubForRow(row: Pick<HubRow, 'funding_type'>): TypeHub {
  const raw = String(row.funding_type ?? 'grant').toLowerCase()
  return TYPE_HUBS.find(t => t.rawTypes.includes(raw)) ?? TYPE_HUBS[0]
}

// ── Data ─────────────────────────────────────────────────────────────────────

/**
 * Every row a hub may list. The same predicate as the sitemap, on purpose: a
 * hub that listed a row the sitemap did not would invite a crawler to a page
 * that may be about to disappear.
 *
 * One query of ~660 narrow rows per request. A hub is fetched by people a few
 * times a day and by crawlers a few more, and the filtering is in memory.
 */
export async function loadPublicRows(): Promise<HubRow[]> {
  const db = getAdminDb()
  const { data, error } = await db
    .from('scraped_grants')
    .select(HUB_ROW_COLUMNS)
    .eq('is_active', true)
    .eq('pipeline_state', 'published')
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as HubRow[]
}

export function rowsForSector(rows: HubRow[], key: string): HubRow[] {
  return rows.filter(r => Array.isArray(r.impact_sectors) && r.impact_sectors.includes(key))
}
export function rowsForRegion(rows: HubRow[], hub: RegionHub): HubRow[] {
  return rows.filter(r => hub.matches(r.location_tag))
}
export function rowsForType(rows: HubRow[], hub: TypeHub): HubRow[] {
  return rows.filter(r => hub.rawTypes.includes(String(r.funding_type ?? 'grant').toLowerCase()))
}

/** Hubs with fewer rows than this are not worth a page: a thin page is what the hubs exist to cure. */
export const HUB_MIN_ROWS = 3

/**
 * Rows shown on a hub before the list stops and asks for an account. Paul,
 * 2026-09-15: enough for the crawler to follow, not enough for a competitor
 * to lift the table from one page. The grant pages' own related blocks keep
 * the rest of the graph connected.
 */
export const HUB_PAGE_CAP = 15

/**
 * Which rows fill a hub's fifteen slots. Not purely soonest-deadline: 192 of
 * the 655 live rows are rolling, and under a pure deadline sort they would
 * sit last on every hub and never receive an internal link from any of them
 * (Paul, 2026-09-15). So half the slots go to the soonest deadlines and half
 * to the most recently verified or added, which the verify cron rotates as
 * rows come due. Over weeks every row gets a turn; the grant pages' related
 * blocks and the sitemap carry the rest.
 */
export function pickForHub(rows: HubRow[], cap = HUB_PAGE_CAP, todayISO = new Date().toISOString().slice(0, 10)): HubRow[] {
  const dated = rows
    .filter(r => r.deadline && r.deadline >= todayISO)
    .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)) || a.title.localeCompare(b.title))
  const soonest = dated.slice(0, Math.ceil(cap / 2))
  const taken = new Set(soonest.map(r => r.id))
  const freshness = (r: HubRow) => String(r.url_last_checked ?? r.first_seen_at ?? '')
  const recent = rows
    .filter(r => !taken.has(r.id))
    .sort((a, b) => freshness(b).localeCompare(freshness(a)) || a.title.localeCompare(b.title))
  return [...soonest, ...recent.slice(0, cap - soonest.length)]
}

/**
 * "Over 100", never "113". Exact counts go stale and contradict the "over
 * 600" said everywhere else (Paul, 2026-09-15). Below ten the exact number is
 * fine; there is nothing to go stale about "4".
 */
export function roundedCount(n: number): string {
  if (n < 10) return String(n)
  const step = n >= 500 ? 100 : n >= 100 ? 50 : 10
  const floor = Math.floor((n - 1) / step) * step
  return `over ${floor}`
}
/** The chip form: "450+". */
export function roundedCountShort(n: number): string {
  if (n < 10) return String(n)
  const step = n >= 500 ? 100 : n >= 100 ? 50 : 10
  return `${Math.floor((n - 1) / step) * step}+`
}

/**
 * Soonest deadline first, then rolling, then undated. A hub is a list a
 * fundraiser scans for what to do next, and the deadline is what orders that.
 * Past-deadline rows (still active because the funder has not closed the
 * page) sort last, so a stale date never heads the page.
 */
export function sortForHub(rows: HubRow[], todayISO = new Date().toISOString().slice(0, 10)): HubRow[] {
  const rank = (r: HubRow): [number, string] => {
    if (r.deadline && r.deadline >= todayISO) return [0, r.deadline]
    if (r.is_rolling) return [1, r.title]
    if (!r.deadline) return [2, r.title]
    return [3, r.deadline]
  }
  return [...rows].sort((a, b) => {
    const [ra, ka] = rank(a)
    const [rb, kb] = rank(b)
    return ra !== rb ? ra - rb : ka.localeCompare(kb)
  })
}

// ── Counts for the index and the cross-links ─────────────────────────────────

export interface HubCounts {
  sectors: { key: string; slug: string; label: string; count: number }[]
  regions: { slug: string; label: string; count: number }[]
  types:   { slug: string; label: string; count: number }[]
}

export function hubCounts(rows: HubRow[]): HubCounts {
  const sectors = Object.keys(IMPACT_SECTOR_LABELS)
    .map(key => ({ key, slug: sectorSlug(key), label: IMPACT_SECTOR_LABELS[key], count: rowsForSector(rows, key).length }))
    .filter(s => s.count >= HUB_MIN_ROWS)
    .sort((a, b) => b.count - a.count)
  const regions = REGION_HUBS
    .map(h => ({ slug: h.slug, label: h.label, count: rowsForRegion(rows, h).length }))
    .filter(r => r.count >= HUB_MIN_ROWS)
  const types = TYPE_HUBS
    .map(h => ({ slug: h.slug, label: h.label, count: rowsForType(rows, h).length }))
    .filter(t => t.count >= HUB_MIN_ROWS)
  return { sectors, regions, types }
}

// ── Related rows for a grant page ────────────────────────────────────────────

/**
 * Neighbours for the "More funding like this" block. Shared sectors weigh
 * most, same region next, same funding type last, so a Scottish arts grant
 * points at other Scottish arts grants before it points at any grant in
 * Scotland. Ties break on soonest deadline, which is also what the reader
 * wants.
 */
export function relatedRows(self: HubRow, candidates: HubRow[], limit = 6): HubRow[] {
  const mySectors = new Set(self.impact_sectors ?? [])
  const myRegion = regionHubForRow(self)?.slug
  const myType = typeHubForRow(self).slug
  const todayISO = new Date().toISOString().slice(0, 10)
  const scored = candidates
    .filter(c => c.id !== self.id)
    .map(c => {
      const shared = (c.impact_sectors ?? []).filter(s => mySectors.has(s)).length
      let score = shared * 3
      if (myRegion && regionHubForRow(c)?.slug === myRegion) score += 2
      if (typeHubForRow(c).slug === myType) score += 1
      const upcoming = c.deadline && c.deadline >= todayISO ? c.deadline : '9999'
      return { c, score, upcoming }
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.upcoming.localeCompare(b.upcoming))
  return scored.slice(0, limit).map(x => x.c)
}

/**
 * The candidate pool for relatedRows: rows sharing a sector, or failing that
 * the same funding type. Bounded, so a grant page never pulls the whole
 * catalogue for six links.
 */
export async function loadRelatedCandidates(self: HubRow): Promise<HubRow[]> {
  const db = getAdminDb()
  const sectors = (self.impact_sectors ?? []).filter(Boolean)
  let q = db
    .from('scraped_grants')
    .select(HUB_ROW_COLUMNS)
    .eq('is_active', true)
    .eq('pipeline_state', 'published')
    .neq('id', self.id)
    .limit(120)
  if (sectors.length) q = q.overlaps('impact_sectors', sectors)
  else q = q.eq('funding_type', String(self.funding_type ?? 'grant'))
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as HubRow[]
}

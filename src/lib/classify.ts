// Shared AI classification logic for scraped_grants
// Used by: /api/admin/classify-grants (manual) and /api/cron/crawl-grants (post-crawl)

import { SupabaseClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from './grant-merge'

// Stamped by classifyUnclassified (cron path). Keep in sync with the route's
// CLASSIFIER_VERSION in src/app/api/admin/classify-grants/route.ts.
const CLASSIFIER_PROVENANCE_SOURCE = 'ai_classifier:v3'

// ── Taxonomy validation sets ───────────────────────────────────────────────────
export const VALID_SECTORS = new Set([
  // Original 12
  'creative', 'environment', 'health', 'education', 'tech',
  'housing', 'food', 'employment', 'community', 'justice',
  'financial', 'international',
  // Extended to full 19-sector taxonomy (matching ImpactSector type)
  'mental_health', 'disability', 'older_people', 'sport', 'heritage', 'women',
  'young_people', 'social_economy', 'social_innovation',
])

export const VALID_FUNDING_TYPES = new Set([
  'grant', 'programme', 'investment', 'in_kind',
])

export const VALID_STRUCTURES = new Set([
  'cic_guarantee', 'cic_shares', 'cio', 'registered_charity',
  'ltd_guarantee', 'ltd_shares', 'llp', 'cooperative',
  'unincorporated', 'sole_trader', 'not_registered',
])

export const VALID_BENEFICIARIES = new Set([
  'children', 'young_people', 'older_people', 'families',
  'women_girls', 'men_boys', 'lgbtq', 'ethnic_minorities',
  'refugees_migrants', 'disabled_people', 'mental_health',
  'carers', 'veterans', 'ex_offenders', 'homeless',
  'people_in_poverty', 'rural_communities', 'general_public',
])

// ── Types ──────────────────────────────────────────────────────────────────────
export interface GrantInput {
  id: string
  title: string
  funder: string
  description: string
  // Optional enriched fields — pass when available. Higher signal than the
  // raw scraped description for sector breadth, since the brief is curated.
  // The classifier prompt instructs the model to prefer these when present
  // and to fall back to description-only when both are missing.
  what_they_fund?: string
  priorities?: string
}

export interface ClassificationCitation {
  snippet: string
  confidence: 'high' | 'med' | 'low'
  reason?: string
}

export interface ClassificationResult {
  id: string
  impact_sectors: string[]
  funding_type: string
  eligible_structures: string[]
  target_beneficiaries: string[]
  niche_tags: string[]
  // v3 — per-field citations (source phrase + confidence). Optional for
  // backwards compatibility; legacy v2 responses without _citations still parse.
  _citations?: {
    impact_sectors?:       ClassificationCitation
    funding_type?:         ClassificationCitation
    eligible_structures?:  ClassificationCitation
    target_beneficiaries?: ClassificationCitation
  }
}

// ── Claude Haiku classification ────────────────────────────────────────────────
export async function classifyBatch(grants: GrantInput[]): Promise<ClassificationResult[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY!
  // Input shape: title + funder + description are always present. When the
  // grant has been enriched, what_they_fund + priorities carry curated
  // multi-sector signal that the raw description usually doesn't (active
  // catalogue descriptions average 251 chars; briefs are 500-1500+).
  const inputData = grants.map(g => ({
    id: g.id,
    title: g.title ?? '',
    funder: g.funder ?? '',
    description: (g.description ?? '').slice(0, 1500),
    ...(g.what_they_fund && g.what_they_fund.trim().length > 0
      ? { what_they_fund: g.what_they_fund.trim().slice(0, 2000) } : {}),
    ...(g.priorities && g.priorities.trim().length > 0
      ? { priorities: g.priorities.trim().slice(0, 2000) } : {}),
  }))

  const prompt = `You are classifying UK funding opportunities for a grant database.

For each grant in the input array, return a JSON array with one classification object.

OUTPUT FORMAT — return ONLY a JSON array, no markdown, no explanation:
[
  {
    "id": "<copy id field exactly>",
    "impact_sectors": ["<2 to 4 sector values, OR 1 if genuinely single-purpose>"],
    "funding_type": "<exactly one funding type value>",
    "eligible_structures": ["<legal structure values, or empty array []>"],
    "target_beneficiaries": ["<2 to 4 beneficiary group values, OR 1 if genuinely single-audience>"],
    "niche_tags": ["<0 to 4 sub-sector specialism tags, or empty array []>"],
    "_citations": {
      "impact_sectors":       {"snippet": "50-300 chars verbatim from what_they_fund/priorities/description that supports the sector set", "confidence": "high"},
      "funding_type":         {"snippet": "verbatim phrase indicating the funding modality", "confidence": "high"},
      "eligible_structures":  {"snippet": "verbatim phrase naming structures (charity, CIC, etc.) or 'no_source_found'", "confidence": "high"},
      "target_beneficiaries": {"snippet": "verbatim phrase naming beneficiary groups", "confidence": "high"}
    }
  }
]

CITATIONS — required for the four tracked tag fields above. Each citation:
- "snippet": 50-300 chars verbatim from the input fields (what_they_fund / priorities / description). Copy-paste, do not paraphrase.
- "confidence": "high" (snippet explicitly names the tags), "med" (tags implied by phrasing), or "low" (inferred from broader context or training knowledge).
- "reason": REQUIRED when confidence is "low". Brief explanation (e.g. "inferred from funder name", "no source phrase found").

When a tag field is empty (e.g. eligible_structures = []), set the citation to {"snippet": "", "confidence": "low", "reason": "no_source_found"}.

Single citation per field = the STRONGEST source phrase supporting the entire array (not one citation per tag). Pick the snippet that most clearly justifies the breadth and depth of tags chosen.

Do not fabricate snippets. If no source phrase supports the tags, use "low" with reason="no_source_found".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TAGGING DEPTH — CRITICAL

Most UK funders operate across multiple sectors and serve multiple beneficiary
groups. The default expectation is 2 to 4 sector tags and 2 to 4 beneficiary
tags per grant. Return only 1 tag when the grant is genuinely single-purpose.

When in doubt, INCLUDE the sector or beneficiary rather than omit it.
Downstream matching is sensitive to depth, not just precision: a grant tagged
with 4 accurate sectors matches multi-sector organisations correctly; a grant
tagged with only 1 sector misses many obvious-fit organisations.

GENUINELY SINGLE-PURPOSE — return 1 tag only when one of these applies:
- A sport-only grant (e.g. "Sport England — Active Together" → ["sport"])
- A heritage-only grant (e.g. "Historic England — Repair Grants" → ["heritage"])
- A grant explicitly scoped to a single beneficiary group AND a single sector
  (e.g. "Veterans Mental Health Trust — Counselling Bursary"
   → impact_sectors ["mental_health"] + target_beneficiaries ["veterans"])

If the grant fits any of those patterns, single-sector is correct.
Otherwise — and this is the common case — default to 2 to 4 tags.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FUNDER-NAME BIAS WARNING — READ BEFORE TAGGING

A funder's name often contains a sector word that is NOT a complete description
of what they fund. Treat the funder name as one signal among many; rely on
what_they_fund and priorities for actual scope.

PATTERNS THAT TYPICALLY UNDER-TAG IF YOU RELY ON FUNDER NAME ALONE:

- "Community Foundation" / "Community Trust" (Heart of England CF, Quartet CF,
  City Bridge Trust, Northern Ireland CF): fund across many sectors —
  community, education, mental_health, employment, environment, etc. — not
  just \`community\`. Multi-sector by design.

- "Family Trust" / "Family Foundation" / "Family Charitable" (Sainsbury Family,
  Garfield Weston, Kelly Family): usually multi-sector — arts, education,
  environment, social welfare. Don't tag only \`families\` as beneficiary either.

- "Arts Foundation" / "Music Trust" / "Theatre Trust" (Rayne, similar):
  often fund creative + young_people + community + education combined. The
  "arts" name does not make the grant scope arts-only.

- "Children's Trust" / "Childhood Foundation": usually fund education +
  young_people + community + mental_health. Not just \`young_people\`.

PATTERNS WHERE FUNDER NAME IS USUALLY CORRECT — BUT WATCH FOR CROSSOVER:

The primary sector from the funder name is mandatory, but check the brief
for SECONDARY OUTCOMES the funder explicitly names. If present, tag them too.

- "Sport England" / "Sport Wales" / "Football Foundation" / dedicated sport bodies:
  \`["sport"]\` is the primary. Add secondaries when the brief explicitly names
  the outcome they're driving via sport:
    • "sport for young people / youth sport / school sport" → also tag \`young_people\` sector + \`young_people\` beneficiary
    • "sport for health / physical activity for wellbeing" → also tag \`health\` (and \`mental_health\` if named)
    • "community sport / grassroots sport / local clubs" → also tag \`community\`
    • "disability sport / parasport / wheelchair sport" → also tag \`disability\`
  Don't add a crossover sector unless the brief explicitly names it. Sport-only
  briefs (e.g. an elite-athlete bursary) stay \`["sport"]\`.

- "Historic England" / "Heritage Lottery Fund" / dedicated heritage bodies:
  \`["heritage"]\` is the primary. Same crossover rule:
    • "heritage skills / heritage training" → also tag \`education\`
    • "community heritage / local heritage groups" → also tag \`community\`
    • "industrial heritage with regeneration" → also tag \`employment\` / \`community\`

- "Nesta" / "innovation foundations": \`["social_innovation"]\` plus \`["tech"]\`
  whenever the brief mentions technology, digital, AI, R&D, prize competitions,
  or innovation challenges. Nesta's challenges are inherently tech-adjacent.

- Single-cause campaigns: still check the brief for breadth before committing.

SECONDARY-OUTCOME RULE (general): When a brief uses the form
"X for / through / via Y" or "X serving Z" or "X to improve Y", tag both the
primary (X) and the secondary (Y, Z). This is the most common cause of
under-tagging — the model assumes the funder's name caps the scope when the
brief actually describes a wider intent.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPACT SECTOR TAXONOMY — assign every sector that applies to this grant.

Specificity rule: when more than one sector in the same family is relevant,
prefer the more specific. For health: tag \`mental_health\` and/or \`disability\`
when applicable, optionally with \`health\` as a secondary. For arts: prefer
\`creative\`. This applies WITHIN a sector family — it does NOT mean reducing
the overall count of sectors. A grant can be tagged
\`creative, mental_health, young_people\` simultaneously when all three apply.

young_people   children, young people, youth, under-25s, schools, families, early years
community      community development, civic engagement, volunteering, neighbourhoods, local groups
health         physical health, GP services, hospitals, social care, general wellbeing
mental_health  mental health, counselling, therapy, suicide prevention, wellbeing (psychological focus)
housing        housing, homelessness, rough sleeping, property, regeneration
education      schools, learning, skills, training, adult education, literacy, numeracy
employment     jobs, employment, livelihoods, enterprise, economic inclusion, work
disability     disability, accessibility, d/Deaf, neurodiversity, inclusive services
older_people   older people, elderly, ageing, dementia, retirement, over-60s
environment    climate, biodiversity, energy, sustainability, nature, conservation, ecology
creative       arts, culture, music, film, media, theatre, dance, creative industries
heritage       heritage, historic buildings, museums, archives, archaeology, conservation of history
sport          sport, physical activity, grassroots sport, football, cricket, athletics, fitness
social_economy worker co-ops, community ownership, democratic enterprise, mutual structures, community benefit societies, community shares
social_innovation tech-for-good, systems change, social R&D, innovation with social purpose, new social models, social venture studios
women          women, gender equality, girls, female founders, domestic abuse, gender-based violence
justice        social justice, human rights, equality, racial equity, criminal justice, asylum
tech           technology, digital, AI, data, open source, innovation, STEM
financial      financial inclusion, money advice, debt, poverty, benefits
food           food poverty, food banks, agriculture, nutrition, food waste, food growing
international  international development, global south, fair trade, migration, refugees, overseas

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FUNDING TYPE TAXONOMY — choose exactly one:

grant       Non-repayable cash: grants, awards, bursaries, prizes, diversity funds, challenge prizes
programme   Structured support that may include cash: accelerators, fellowships, incubators, support programmes, cohort programmes, capacity building, CPD, mentoring
investment  Repayable finance: loans, patient capital, social investment, blended finance (part-grant part-loan), community shares
in_kind     Non-cash support only: software credits, ad grants, free workspace, pro bono services, tax relief

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ELIGIBLE STRUCTURES — legal structures the source EXPLICITLY lists as eligible.
Return [] when the source does not name specific legal structures.

Valid values: cic_guarantee, cic_shares, cio, registered_charity,
              ltd_guarantee, ltd_shares, llp, cooperative,
              unincorporated, sole_trader, not_registered

DEFAULT BIAS: TIGHT.
When uncertain whether a type is included, EXCLUDE it. Only tag a structure
when the source explicitly names it, names a clear synonym, or uses a phrase
from the mapping table below.

HARD RULES — apply before consulting the mapping table:

1. If the source says "registered" (e.g. "registered charities", "registered
   organisations") and does NOT also say one of {"or unregistered",
   "constituted or unconstituted", "any group", "all organisations",
   "open to all"}, the result MUST NOT include "unincorporated" or
   "not_registered".

2. If the source restricts to charity status ("registered charities only",
   "charity status required", "must have a charity number"), do NOT include
   ltd_shares, llp, cic_shares, sole_trader, not_registered, or unincorporated.

3. The empty array [] is the correct answer when the source does not name
   structures. Do NOT guess from funder type or sector.

4. Cap at 5 structures unless the source EXPLICITLY indicates broader scope
   via wording like "any organisation", "any incorporated organisation",
   "all legal structures", or by listing ≥5 distinct categories itself.

Common mappings (apply only after the hard rules above):
"registered charities only / charities only / charity status required"
                                                    → ["registered_charity", "cio"]
"registered charities and community organisations"  → ["registered_charity","cio","ltd_guarantee"]
"registered charities and social enterprises"       → ["registered_charity","cio","cic_guarantee","ltd_guarantee"]
"CICs / Community Interest Companies"               → ["cic_guarantee", "cic_shares"]
"social enterprises (broad / open to CICs and Ltds)" → ["cic_guarantee","cic_shares","ltd_guarantee","cooperative"]
"any incorporated organisation"                     → ["cic_guarantee","cic_shares","cio","registered_charity","ltd_guarantee","ltd_shares","llp","cooperative"]
"Ltd companies / limited companies"                 → ["ltd_guarantee","ltd_shares"]
"co-operatives / community benefit societies / CBS" → ["cooperative"]
"Innovate UK / UKRI / SBRI / R&D grants"            → ["ltd_guarantee","ltd_shares","cic_guarantee","cic_shares"]
"individuals / sole traders / freelancers"          → ["sole_trader","unincorporated"]
"constituted and unconstituted groups (explicit)"   → ["registered_charity","cio","cic_guarantee","ltd_guarantee","cooperative","unincorporated","not_registered"]
"open to all / organisations / no restriction stated / silent on structure" → []

If the source is silent on legal structure, the correct answer is [], not a
guessed list. An empty array is normal and expected for most grants.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NICHE TAGS — optional sub-sector specialism within the broad impact sector.
Return [] if the grant has no clear specialism, or is genuinely open across a whole sector.
Only assign tags when the grant title or description clearly indicates a specific sub-focus.

For "creative" grants:
music               music education, orchestras, bands, music therapy, music making, songwriting
theatre             theatre, drama, performing arts (stage), musicals, playwriting
dance               dance, ballet, contemporary dance, dance therapy, choreography
visual_arts         visual arts, painting, sculpture, illustration, printmaking, ceramics
film_media          film, cinema, screen, TV, radio, podcast, animation, photography
literature          books, writing, poetry, storytelling, reading, publishing, libraries
crafts              crafts, textiles, making, blacksmithing, ceramics (craft focus)
circus_street       circus, street arts, outdoor arts, puppetry, magic

For "sport" grants:
football            football, soccer
cricket             cricket
rugby               rugby union, rugby league
basketball          basketball
swimming            swimming, aquatics, water polo
athletics           athletics, running, track and field
tennis              tennis, padel
cycling             cycling, mountain biking
martial_arts        martial arts, boxing, judo, karate
disability_sport    disability sport, parasport, wheelchair sport, boccia, goalball
women_in_sport      women in sport, girls in sport, female participation

For "heritage" grants:
built_heritage      historic buildings, listed buildings, churches, castles, archaeology
industrial_heritage industrial heritage, mills, canals, railways, mining
natural_heritage    natural heritage, landscape, woodland heritage, ancient trees
museums_archives    museums, archives, libraries, collections, oral history

For "social_economy" grants:
worker_cooperative   employee-owned, worker-controlled, worker co-op
community_shares     community share offers, co-operative capital raises
social_franchise     replicable social enterprise models, franchise for good
community_ownership  community buyouts, asset transfers, community-owned assets

For "social_innovation" grants:
tech_for_good        technology with explicit social or environmental mission
impact_measurement   social value measurement, theory of change, SROI
systems_change       advocacy combined with enterprise, structural change models

For "environment" grants:
climate             climate change, net zero, carbon reduction, emissions
biodiversity        biodiversity, wildlife, species recovery, pollinator, rewilding
urban_greening      urban greening, parks, community gardens, green spaces
marine              marine, ocean, coastal, rivers, water quality, fisheries
energy              renewable energy, solar, wind, energy efficiency
circular_economy    repair cafes, reuse, zero waste, circular economy, upcycling, waste reduction enterprises

For "education" grants:
early_years         early years, nursery, childcare, under-5s
stem                STEM, science, maths, engineering, coding in schools
literacy_numeracy   literacy, numeracy, reading, writing skills
higher_education    higher education, university, graduates, postgraduate
vocational          vocational, apprenticeships, trade skills, T-levels
digital_literacy    digital skills, online inclusion, basic digital, internet access, digital poverty

Return ONLY tags from the lists above, exactly as written. Return [] if none apply clearly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TARGET BENEFICIARIES — who does this grant primarily serve?
DEFAULT: 2 to 4 groups (most funders serve multiple demographics). Single
group is correct ONLY if the grant is genuinely targeting one demographic
(e.g. a veterans-only mental health fund, a women-only enterprise fund).

Use "general_public" ONLY if the grant genuinely has no specific beneficiary focus.

children            children under 16, early years, nursery, primary school
young_people        young people 16-25, youth, teenagers, young adults, NEETs
older_people        older people 65+, elderly, ageing, dementia, later life
families            families, parents, working families, family support
women_girls         women, girls, female founders, domestic abuse, gender-based violence
men_boys            men and boys, male mental health, men's sheds
lgbtq               LGBTQ+, transgender, queer, sexual orientation
ethnic_minorities   ethnic minorities, BAME, Black and minority ethnic, racial equity
refugees_migrants   refugees, asylum seekers, migrants, displaced people
disabled_people     disabled people, learning disabilities, d/Deaf, neurodiversity, accessibility
mental_health       people with mental health needs, counselling users, suicide prevention
carers              carers, care leavers, looked-after children, foster, kinship
veterans            veterans, armed forces, ex-service personnel, military families
ex_offenders        ex-offenders, people in the justice system, probation, reoffending
homeless            homeless people, rough sleepers, housing first, temporary accommodation
people_in_poverty   people in poverty, deprivation, low-income, food bank users, fuel poverty
rural_communities   rural communities, isolated communities, village halls
general_public      no specific group — open to all / general community benefit

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WORKED EXAMPLES

Example 1 — Community foundation (multi-sector):
  Funder: Heart of England Community Foundation
  Title:  General Grants
  what_they_fund: "Local charities and community groups across Birmingham,
                  Coventry, and Warwickshire working in education, health,
                  mental wellbeing, employment, environment and community
                  development. Annual grants up to £10k."
  priorities:     "Disadvantaged communities; education and skills; mental
                  wellbeing for young people; environmental projects."
  CORRECT:
    impact_sectors:       ["community", "education", "health", "mental_health"]
    target_beneficiaries: ["children", "young_people", "people_in_poverty", "general_public"]
  COMMON ERROR: tagging only ["community"] from the funder name.

Example 2 — Family trust (multi-sector):
  Funder: Sainsbury Family Charitable Trusts
  what_they_fund: "Arts and heritage, the environment, education, science and
                  learning, and social change."
  CORRECT:
    impact_sectors:       ["creative", "environment", "education", "heritage"]
    target_beneficiaries: ["children", "families", "general_public"]
  COMMON ERROR: tagging only ["creative"] or only ["families"].

Example 3 — Arts foundation (multi-sector — counters "Arts" name bias):
  Funder: Rayne Foundation
  what_they_fund: "Independent grant-making trust funding arts, mental health,
                  education and social welfare projects across the UK."
  priorities:     "Vulnerable and disadvantaged people; supporting practice and
                  research in the arts; mental wellbeing of young people."
  CORRECT:
    impact_sectors:       ["creative", "mental_health", "education", "community"]
    target_beneficiaries: ["children", "young_people", "mental_health", "people_in_poverty"]
  COMMON ERROR: tagging only ["creative"] from "Arts Foundation" in the name.

Example 4 — Genuinely single-purpose (single sector IS correct):
  Funder: Sport England
  Title:  Active Together Grant
  what_they_fund: "Grassroots sport projects across England."
  priorities:     "Physical activity participation, particularly among
                  under-represented groups."
  CORRECT:
    impact_sectors:       ["sport"]
    target_beneficiaries: ["young_people", "general_public"]
  NOTE: Sport is genuinely the scope. Don't over-correct by adding sectors that
  aren't in the brief. Single sector + multi-beneficiary is the right shape.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GRANTS TO CLASSIFY:
${JSON.stringify(inputData, null, 2)}

Each grant in the input may have:
- title, funder, description (always present; description may be short or sparse)
- what_they_fund, priorities (when available, from a curated funder brief —
  prefer these as the PRIMARY source of truth for sector breadth)

If what_they_fund and priorities are both absent, fall back to title +
description alone — degraded signal but still classify. Don't refuse.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINAL CHECK BEFORE RETURNING:

Count the sectors you've tagged on each grant.
- If you tagged only 1, ask whether the grant is genuinely single-purpose
  (like Sport England) or whether you missed adjacent sectors that the brief
  mentions. Re-read what_they_fund and priorities for second-order sectors.
- If you tagged 4, ask whether all four are genuinely relevant or whether
  you've stretched the scope.

Same check for beneficiaries — most grants serve 2+ groups.

Return ONLY the JSON array. No markdown fences. No other text.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      // v3: per-field citations roughly double per-grant output (~1100 chars
      // vs ~300). At a 20-grant batch that's ~5500 tokens; 8192 gives headroom.
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(`Anthropic API ${res.status}: ${err.error?.message ?? res.statusText}`)
  }

  const data = await res.json() as { content?: { type: string; text: string }[] }
  let text = (data.content?.[0]?.text ?? '').trim()

  text = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
  if (!text.startsWith('[')) {
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) throw new Error(`No JSON array in response. Got: ${text.slice(0, 200)}`)
    text = match[0]
  }

  return JSON.parse(text) as ClassificationResult[]
}

// ── Validate and sanitise a single classification result ───────────────────────
export function validate(raw: ClassificationResult) {
  const impact_sectors = Array.isArray(raw.impact_sectors)
    ? raw.impact_sectors.filter(s => VALID_SECTORS.has(s)).slice(0, 4)
    : []

  const funding_type = VALID_FUNDING_TYPES.has(raw.funding_type)
    ? raw.funding_type
    : 'grant'

  const eligible_structures = Array.isArray(raw.eligible_structures)
    ? raw.eligible_structures.filter(s => VALID_STRUCTURES.has(s))
    : []

  const target_beneficiaries = Array.isArray(raw.target_beneficiaries)
    ? raw.target_beneficiaries.filter(b => VALID_BENEFICIARIES.has(b)).slice(0, 4)
    : []

  const niche_tags = Array.isArray((raw as ClassificationResult).niche_tags)
    ? ((raw as ClassificationResult).niche_tags as string[]).slice(0, 4)
    : []

  // v3 — preserve citations if present. Optional for backwards compat.
  const _citations = raw._citations ?? undefined

  return { impact_sectors, funding_type, eligible_structures, target_beneficiaries, niche_tags, _citations }
}

// ── Classify up to `limit` unclassified active grants ─────────────────────────
// Returns { classified, failed }. Safe to call with limit=0 (no-op).
export async function classifyUnclassified(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  limit = 60,
): Promise<{ classified: number; failed: number }> {
  if (limit <= 0) return { classified: 0, failed: 0 }

  // Filter for unclassified at the DB layer — older unclassified rows would
  // otherwise be permanently skipped if the newest `limit*3` rows happen to be
  // mostly already-classified. Catches both NULL and empty-array {} cases.
  const { data: grantsRaw, error } = await supabase
    .from('scraped_grants')
    .select('id, title, funder, description, impact_sectors, funder_brief')
    .eq('is_active', true)
    .or('impact_sectors.is.null,impact_sectors.eq.{}')
    .order('first_seen_at', { ascending: false })
    .limit(limit)

  if (error || !grantsRaw) return { classified: 0, failed: 0 }

  const unclassified = grantsRaw

  if (unclassified.length === 0) return { classified: 0, failed: 0 }

  const BATCH_SIZE = 20
  let classified = 0
  let failed = 0

  for (let i = 0; i < unclassified.length; i += BATCH_SIZE) {
    const batch = unclassified.slice(i, i + BATCH_SIZE)
    try {
      // Derive optional enriched fields from funder_brief before classifying.
      // Improves multi-sector signal for enriched grants; falls back to
      // description-only when brief is absent.
      const enrichedBatch = batch.map(g => {
        const fb = g.funder_brief as Record<string, unknown> | null
        return {
          ...g,
          what_they_fund: typeof fb?.what_they_fund === 'string' ? fb.what_they_fund : undefined,
          priorities:     typeof fb?.priorities     === 'string' ? fb.priorities     : undefined,
        }
      })
      const results = await classifyBatch(enrichedBatch as GrantInput[])
      const byId: Record<string, ReturnType<typeof validate>> = {}
      for (const r of results) {
        if (r?.id) byId[r.id] = validate(r)
      }

      const updates = batch
        .filter(g => byId[g.id])
        .map(async g => {
          const r = byId[g.id]
          const effectiveBeneficiaries = r.target_beneficiaries.length > 0
            ? r.target_beneficiaries
            : ['general_public']
          const patch: Record<string, unknown> = {
            impact_sectors:       r.impact_sectors,
            funding_type:         r.funding_type,
            target_beneficiaries: effectiveBeneficiaries,
          }
          if (r.eligible_structures.length > 0) patch.eligible_structures = r.eligible_structures
          if (r.niche_tags.length > 0)          patch.niche_tags          = r.niche_tags

          // v3 — per-field citations through the merger (Phase A miss: this
          // path previously did a direct supabase.update bypassing provenance).
          const citations: Record<string, { snippet: string; confidence: 'high' | 'med' | 'low'; reason?: string }> = {}
          if (r._citations?.impact_sectors)       citations.impact_sectors       = r._citations.impact_sectors
          if (r._citations?.funding_type)         citations.funding_type         = r._citations.funding_type
          if (r._citations?.eligible_structures && r.eligible_structures.length > 0)   citations.eligible_structures  = r._citations.eligible_structures
          if (r._citations?.target_beneficiaries && effectiveBeneficiaries.length > 0) citations.target_beneficiaries = r._citations.target_beneficiaries

          try {
            await mergeGrantUpdate({
              id:        g.id,
              fields:    patch,
              source:    CLASSIFIER_PROVENANCE_SOURCE,
              pinned:    false,
              citations: Object.keys(citations).length > 0 ? citations : undefined,
              db:        supabase,
            })
            return { ok: true as const }
          } catch (err) {
            console.error('[classifyUnclassified] merge failed:', err)
            return { ok: false as const }
          }
        })

      const results2 = await Promise.all(updates)
      const errs = results2.filter(r => !r.ok)
      classified += batch.length - errs.length
      failed     += errs.length
    } catch {
      failed += batch.length
    }
  }

  return { classified, failed }
}

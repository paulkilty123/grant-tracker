// Shared AI classification logic for scraped_grants
// Used by: /api/admin/classify-grants (manual) and /api/cron/crawl-grants (post-crawl)

import { SupabaseClient } from '@supabase/supabase-js'

// ── Taxonomy validation sets ───────────────────────────────────────────────────
export const VALID_SECTORS = new Set([
  // Original 12
  'creative', 'environment', 'health', 'education', 'tech',
  'housing', 'food', 'employment', 'community', 'justice',
  'financial', 'international',
  // Extended to full 19-sector taxonomy (matching ImpactSector type)
  'mental_health', 'disability', 'older_people', 'sport', 'heritage', 'women',
  'young_people',
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
}

export interface ClassificationResult {
  id: string
  impact_sectors: string[]
  funding_type: string
  eligible_structures: string[]
  target_beneficiaries: string[]
  niche_tags: string[]
}

// ── Claude Haiku classification ────────────────────────────────────────────────
export async function classifyBatch(grants: GrantInput[]): Promise<ClassificationResult[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY!
  const inputData = grants.map(g => ({
    id: g.id,
    title: g.title ?? '',
    funder: g.funder ?? '',
    description: (g.description ?? '').slice(0, 500),
  }))

  const prompt = `You are classifying UK funding opportunities for a grant database.

For each grant in the input array, return a JSON array with one classification object.

OUTPUT FORMAT — return ONLY a JSON array, no markdown, no explanation:
[
  {
    "id": "<copy id field exactly>",
    "impact_sectors": ["<1 to 4 sector values>"],
    "funding_type": "<exactly one funding type value>",
    "eligible_structures": ["<legal structure values, or empty array []>"],
    "target_beneficiaries": ["<1 to 4 beneficiary group values>"],
    "niche_tags": ["<0 to 4 sub-sector specialism tags, or empty array []>"]
  }
]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPACT SECTOR TAXONOMY — choose 1 to 4 that best describe this grant.
Use the most specific sector available — do NOT default to 'health' when 'mental_health' or 'disability' is more accurate.

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
ELIGIBLE STRUCTURES — legal structures explicitly stated as eligible.
Return [] if the description does not explicitly restrict or list eligible types.

Valid values: cic_guarantee, cic_shares, cio, registered_charity,
              ltd_guarantee, ltd_shares, llp, cooperative,
              unincorporated, sole_trader, not_registered

Common mappings:
"registered charities only / charities only"  → ["registered_charity", "cio"]
"CICs / Community Interest Companies"         → ["cic_guarantee", "cic_shares"]
"social enterprises (broad)"                  → ["cic_guarantee","cic_shares","cio","registered_charity","ltd_guarantee","ltd_shares","cooperative"]
"any incorporated organisation"               → ["cic_guarantee","cic_shares","cio","registered_charity","ltd_guarantee","ltd_shares","llp","cooperative"]
"individuals / sole traders / freelancers"    → ["sole_trader","unincorporated"]
Not stated / open to all / "organisations"    → []

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

For "environment" grants:
climate             climate change, net zero, carbon reduction, emissions
biodiversity        biodiversity, wildlife, species recovery, pollinator, rewilding
urban_greening      urban greening, parks, community gardens, green spaces
marine              marine, ocean, coastal, rivers, water quality, fisheries
energy              renewable energy, solar, wind, energy efficiency

For "education" grants:
early_years         early years, nursery, childcare, under-5s
stem                STEM, science, maths, engineering, coding in schools
literacy_numeracy   literacy, numeracy, reading, writing skills
higher_education    higher education, university, graduates, postgraduate
vocational          vocational, apprenticeships, trade skills, T-levels

Return ONLY tags from the lists above, exactly as written. Return [] if none apply clearly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TARGET BENEFICIARIES — who does this grant primarily serve? Choose 1 to 4.
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
GRANTS TO CLASSIFY:
${JSON.stringify(inputData, null, 2)}

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
      max_tokens: 4096,
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

  return { impact_sectors, funding_type, eligible_structures, target_beneficiaries, niche_tags }
}

// ── Classify up to `limit` unclassified active grants ─────────────────────────
// Returns { classified, failed }. Safe to call with limit=0 (no-op).
export async function classifyUnclassified(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  limit = 60,
): Promise<{ classified: number; failed: number }> {
  if (limit <= 0) return { classified: 0, failed: 0 }

  const { data: grantsRaw, error } = await supabase
    .from('scraped_grants')
    .select('id, title, funder, description, impact_sectors')
    .eq('is_active', true)
    .order('created_at', { ascending: false })   // newest first — most likely to be unclassified
    .limit(limit * 3)                             // over-fetch so we can filter unclassified

  if (error || !grantsRaw) return { classified: 0, failed: 0 }

  const unclassified = grantsRaw
    .filter(g => !Array.isArray(g.impact_sectors) || g.impact_sectors.length === 0)
    .slice(0, limit)

  if (unclassified.length === 0) return { classified: 0, failed: 0 }

  const BATCH_SIZE = 20
  let classified = 0
  let failed = 0

  for (let i = 0; i < unclassified.length; i += BATCH_SIZE) {
    const batch = unclassified.slice(i, i + BATCH_SIZE)
    try {
      const results = await classifyBatch(batch as GrantInput[])
      const byId: Record<string, ReturnType<typeof validate>> = {}
      for (const r of results) {
        if (r?.id) byId[r.id] = validate(r)
      }

      const updates = batch
        .filter(g => byId[g.id])
        .map(g => {
          const r = byId[g.id]
          const patch: Record<string, unknown> = {
            impact_sectors: r.impact_sectors,
            funding_type:   r.funding_type,
            target_beneficiaries: r.target_beneficiaries.length > 0 ? r.target_beneficiaries : ['general_public'],
          }
          if (r.eligible_structures.length > 0) patch.eligible_structures = r.eligible_structures
          if (r.niche_tags.length > 0) patch.niche_tags = r.niche_tags
          return supabase.from('scraped_grants').update(patch).eq('id', g.id)
        })

      const results2 = await Promise.all(updates)
      const errs = results2.filter(r => r.error)
      classified += batch.length - errs.length
      failed     += errs.length
    } catch {
      failed += batch.length
    }
  }

  return { classified, failed }
}

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
    "eligible_structures": ["<legal structure values, or empty array []>"]
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

  return { impact_sectors, funding_type, eligible_structures }
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
          }
          if (r.eligible_structures.length > 0) patch.eligible_structures = r.eligible_structures
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

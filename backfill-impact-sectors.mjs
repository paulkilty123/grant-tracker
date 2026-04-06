/**
 * Backfill impact_sectors for grants that have an empty array ({}).
 * Reads credentials from .env.local, queries Supabase for untagged grants,
 * calls Claude Haiku to classify them in batches of 20, then writes results back.
 *
 * Usage:  node backfill-impact-sectors.mjs
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// ── Load env vars from .env.local ─────────────────────────────────────────────
const envFile = readFileSync('/sessions/keen-gifted-davinci/mnt/grant-tracker/.env.local', 'utf-8')
const env = Object.fromEntries(
  envFile.split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
    })
)

const SUPABASE_URL    = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY     = env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY   = env.ANTHROPIC_API_KEY

const BATCH_SIZE = 20

// ── Full 19-sector taxonomy (mirrors classify.ts after our fix) ────────────────
const VALID_SECTORS = new Set([
  'creative', 'environment', 'health', 'education', 'tech',
  'housing', 'food', 'employment', 'community', 'justice',
  'financial', 'international',
  'mental_health', 'disability', 'older_people', 'sport', 'heritage', 'women',
  'young_people',
])

const VALID_FUNDING_TYPES = new Set([
  'grant', 'accelerator', 'support_programme', 'social_investment',
  'diversity_fund', 'blended_finance', 'in_kind',
])

const VALID_STRUCTURES = new Set([
  'cic_guarantee', 'cic_shares', 'cio', 'registered_charity',
  'ltd_guarantee', 'ltd_shares', 'llp', 'cooperative',
  'unincorporated', 'sole_trader', 'not_registered',
])

// ── Classify a batch via Claude Haiku ─────────────────────────────────────────
async function classifyBatch(grants) {
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
Use the most specific sector available.

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

grant              One-off or multi-year cash grant, award, bursary, prize money
accelerator        Structured cohort programme — mentoring, workspace, pitch prep, network
support_programme  Fellowship, capacity building, mentoring, incubator, training, CPD
social_investment  Repayable loan, patient capital, investment
diversity_fund     Grant or programme explicitly targeting underrepresented groups
blended_finance    Part grant part loan, matched trading, community shares, crowdfund match
in_kind            Non-cash support: software credits, ad grants, free workspace, pro bono

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ELIGIBLE STRUCTURES — only if explicitly stated.  Return [] if not specified.

Valid values: cic_guarantee, cic_shares, cio, registered_charity,
              ltd_guarantee, ltd_shares, llp, cooperative,
              unincorporated, sole_trader, not_registered

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GRANTS TO CLASSIFY:
${JSON.stringify(inputData, null, 2)}

Return ONLY the JSON array. No markdown fences. No other text.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Anthropic API ${res.status}: ${err.error?.message ?? res.statusText}`)
  }

  const data = await res.json()
  let text = (data.content?.[0]?.text ?? '').trim()
  text = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
  if (!text.startsWith('[')) {
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) throw new Error(`No JSON array in response: ${text.slice(0, 200)}`)
    text = match[0]
  }
  return JSON.parse(text)
}

function validate(raw) {
  const impact_sectors = Array.isArray(raw.impact_sectors)
    ? raw.impact_sectors.filter(s => VALID_SECTORS.has(s)).slice(0, 4)
    : []
  const funding_type = VALID_FUNDING_TYPES.has(raw.funding_type) ? raw.funding_type : 'grant'
  const eligible_structures = Array.isArray(raw.eligible_structures)
    ? raw.eligible_structures.filter(s => VALID_STRUCTURES.has(s))
    : []
  return { impact_sectors, funding_type, eligible_structures }
}

// ── Main ──────────────────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// Fetch all grants with empty impact_sectors
const { data: all, error: fetchErr } = await supabase
  .from('scraped_grants')
  .select('id, title, funder, description')
  .eq('is_active', true)
  .eq('impact_sectors', '{}')
  .order('id')

if (fetchErr) { console.error('Fetch error:', fetchErr.message); process.exit(1) }

console.log(`Found ${all.length} grants to classify`)

let totalClassified = 0
let totalFailed = 0

for (let i = 0; i < all.length; i += BATCH_SIZE) {
  const batch = all.slice(i, i + BATCH_SIZE)
  const batchNum = Math.floor(i / BATCH_SIZE) + 1
  const totalBatches = Math.ceil(all.length / BATCH_SIZE)
  process.stdout.write(`Batch ${batchNum}/${totalBatches} (${batch.length} grants)… `)

  try {
    const results = await classifyBatch(batch)
    const byId = {}
    for (const r of results) {
      if (r?.id) byId[r.id] = validate(r)
    }

    const updates = batch
      .filter(g => byId[g.id])
      .map(g => {
        const r = byId[g.id]
        const patch = { impact_sectors: r.impact_sectors, funding_type: r.funding_type }
        if (r.eligible_structures.length > 0) patch.eligible_structures = r.eligible_structures
        return supabase.from('scraped_grants').update(patch).eq('id', g.id)
      })

    const updateResults = await Promise.all(updates)
    const errs = updateResults.filter(r => r.error)
    const ok = batch.length - errs.length
    totalClassified += ok
    totalFailed += errs.length
    console.log(`✓ ${ok} classified${errs.length ? `, ${errs.length} failed` : ''}`)
  } catch (err) {
    console.log(`✗ batch failed: ${err.message}`)
    totalFailed += batch.length
  }

  // Brief pause to avoid hammering the API
  if (i + BATCH_SIZE < all.length) await new Promise(r => setTimeout(r, 500))
}

console.log(`\nDone. Classified: ${totalClassified}  Failed: ${totalFailed}`)

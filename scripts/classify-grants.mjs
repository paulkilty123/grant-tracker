#!/usr/bin/env node
/**
 * classify-grants.mjs
 *
 * AI classification pass — reads every active scraped_grant and writes back:
 *   • impact_sectors[]      — 1–4 values from the 12-sector taxonomy
 *   • funding_type          — grant | accelerator | support_programme |
 *                             social_investment | diversity_fund |
 *                             blended_finance | in_kind
 *   • eligible_structures[] — explicit legal structure eligibility where stated
 *
 * Usage:
 *   node scripts/classify-grants.mjs              # classify unclassified grants
 *   node scripts/classify-grants.mjs --dry-run    # preview only, no DB writes
 *   node scripts/classify-grants.mjs --limit=50   # process first N grants
 *   node scripts/classify-grants.mjs --force      # re-classify already-classified grants
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

// ── Load .env.local ───────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  try {
    const envPath = path.resolve(__dirname, '../.env.local')
    const lines = readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/)
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim()
      }
    }
  } catch {
    // No .env.local — rely on process.env being set externally
  }
}
loadEnv()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY || !ANTHROPIC_KEY) {
  console.error('❌  Missing env vars. Ensure NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ANTHROPIC_API_KEY are set.')
  process.exit(1)
}

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const DRY_RUN  = args.includes('--dry-run')
const FORCE    = args.includes('--force')
const LIMIT    = (() => {
  const l = args.find(a => a.startsWith('--limit='))
  return l ? parseInt(l.split('=')[1], 10) : Infinity
})()

const BATCH_SIZE = 20   // grants per Claude call
const DELAY_MS   = 800  // ms between batches (rate limit headroom)

// ── Taxonomy validation sets ──────────────────────────────────────────────────
const VALID_SECTORS = new Set([
  'creative', 'environment', 'health', 'education', 'tech',
  'housing', 'food', 'employment', 'community', 'justice',
  'financial', 'international',
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

// ── Supabase client (service role bypasses RLS) ────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
})

// ── Claude Haiku classification call ─────────────────────────────────────────
async function classifyBatch(grants) {
  const inputData = grants.map(g => ({
    id: g.id,
    title: g.title ?? '',
    funder: g.funder ?? '',
    // Truncate description to keep prompt size manageable
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
IMPACT SECTOR TAXONOMY — choose 1 to 4 that best describe this grant:

creative       arts, culture, heritage, music, film, media, creative industries
environment    climate, biodiversity, energy, sustainability, nature, ecology
health         physical health, mental health, wellbeing, disability, social care
education      schools, learning, skills, training, early years, youth education
tech           technology, digital, AI, data, open source, innovation, STEM
housing        housing, homelessness, property, regeneration, rough sleeping
food           food poverty, food banks, agriculture, nutrition, food waste
employment     jobs, employment, livelihoods, enterprise, economic inclusion
community      community development, civic, volunteering, neighbourhoods, local
justice        social justice, human rights, equality, racial equity, criminal justice, asylum
financial      financial inclusion, money advice, debt, poverty, benefits
international  international development, global south, fair trade, migration, refugees

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FUNDING TYPE TAXONOMY — choose exactly one:

grant              One-off or multi-year cash grant, award, bursary, prize money
accelerator        Structured cohort programme — mentoring, workspace, pitch prep, network (even if includes a small cash element)
support_programme  Fellowship, capacity building, mentoring, incubator, training, CPD — no significant cash grant
social_investment  Repayable loan, patient capital, investment — money must be repaid
diversity_fund     Grant or programme explicitly targeting underrepresented groups: women, Black/ethnic minority founders, disabled people, LGBTQ+, rural communities
blended_finance    Part grant part loan, matched trading, community shares, crowdfund match
in_kind            Non-cash support: software credits, tax relief, ad grants, free workspace, pro bono services

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

  // Strip markdown fences if model includes them
  text = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()

  // Extract JSON array even if model adds prose around it
  if (!text.startsWith('[')) {
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) throw new Error(`No JSON array in response. Got: ${text.slice(0, 200)}`)
    text = match[0]
  }

  return JSON.parse(text)
}

// ── Validate and sanitise a classification result ─────────────────────────────
function validate(raw) {
  const impact_sectors = Array.isArray(raw.impact_sectors)
    ? raw.impact_sectors.filter(s => VALID_SECTORS.has(s)).slice(0, 4)
    : []

  const funding_type = VALID_FUNDING_TYPES.has(raw.funding_type)
    ? raw.funding_type
    : 'grant' // safe fallback

  const eligible_structures = Array.isArray(raw.eligible_structures)
    ? raw.eligible_structures.filter(s => VALID_STRUCTURES.has(s))
    : []

  return { impact_sectors, funding_type, eligible_structures }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  Grant Tracker — AI Classification Pass')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  Mode:   ${DRY_RUN ? '🔍 DRY RUN (no DB writes)' : '✏️  LIVE'}`)
  console.log(`  Force:  ${FORCE ? 'yes — re-classifying everything' : 'no — skipping already-classified'}`)
  console.log(`  Limit:  ${LIMIT === Infinity ? 'none' : LIMIT}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // Fetch all active grants (select only what we need)
  const { data: allGrants, error } = await supabase
    .from('scraped_grants')
    .select('id, title, funder, description, funding_type, impact_sectors')
    .eq('is_active', true)
    .order('first_seen_at', { ascending: false })

  if (error) throw new Error(`Supabase fetch failed: ${error.message}`)

  // Filter to unclassified grants unless --force
  const toProcess = (FORCE
    ? allGrants
    : allGrants.filter(g => !g.impact_sectors || g.impact_sectors.length === 0)
  ).slice(0, LIMIT === Infinity ? allGrants.length : LIMIT)

  console.log(`📋  Total active grants in DB: ${allGrants.length}`)
  console.log(`⚙️   Grants to classify:        ${toProcess.length}`)
  if (!FORCE) {
    console.log(`✅  Already classified:         ${allGrants.length - toProcess.length}`)
  }

  if (toProcess.length === 0) {
    console.log('\n✅  Nothing to do — all grants already classified.')
    console.log('    Use --force to re-classify everything.\n')
    return
  }

  console.log('')

  // ── Batch loop ─────────────────────────────────────────────────────────────
  let processed = 0
  let succeeded = 0
  let failed    = 0
  const failedBatches = []

  const totalBatches = Math.ceil(toProcess.length / BATCH_SIZE)

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch     = toProcess.slice(i, i + BATCH_SIZE)
    const batchNum  = Math.floor(i / BATCH_SIZE) + 1
    const pct       = Math.round((processed / toProcess.length) * 100)

    process.stdout.write(
      `  Batch ${String(batchNum).padStart(3)}/${totalBatches} ` +
      `[${String(pct).padStart(3)}%]  ${batch.length} grants ... `
    )

    try {
      const results = await classifyBatch(batch)

      // Map id → validated classification
      const byId = {}
      for (const r of results) {
        if (r?.id) byId[r.id] = validate(r)
      }

      if (DRY_RUN) {
        // Print preview
        console.log('(dry run)')
        for (const grant of batch) {
          const r = byId[grant.id]
          if (r) {
            console.log(`     ↳ ${grant.title?.slice(0, 50).padEnd(52)} | ${r.funding_type.padEnd(20)} | [${r.impact_sectors.join(', ')}]`)
          }
        }
      } else {
        // Write to Supabase — batch of parallel updates
        const updates = batch
          .filter(g => byId[g.id])
          .map(g => {
            const r = byId[g.id]
            const patch = {
              impact_sectors: r.impact_sectors,
              funding_type:   r.funding_type,
            }
            if (r.eligible_structures.length > 0) {
              patch.eligible_structures = r.eligible_structures
            }
            return supabase
              .from('scraped_grants')
              .update(patch)
              .eq('id', g.id)
          })

        const updateResults = await Promise.all(updates)
        const writeErrors = updateResults.filter(r => r.error)
        if (writeErrors.length) {
          console.log(`⚠ (${batch.length - writeErrors.length}/${batch.length} written, ${writeErrors.length} write errors)`)
        } else {
          console.log(`✓`)
        }
      }

      processed += batch.length
      succeeded += batch.length

    } catch (err) {
      console.log(`✗ FAILED — ${err.message}`)
      failed += batch.length
      processed += batch.length
      failedBatches.push({ batch: batchNum, error: err.message })
    }

    // Rate limit pause between batches
    if (i + BATCH_SIZE < toProcess.length) {
      await new Promise(r => setTimeout(r, DELAY_MS))
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  Processed: ${processed}`)
  console.log(`  Succeeded: ${succeeded}`)
  console.log(`  Failed:    ${failed}`)

  if (failedBatches.length) {
    console.log('\n  ⚠️  Failed batches:')
    for (const f of failedBatches) {
      console.log(`     Batch ${f.batch}: ${f.error}`)
    }
  }

  if (DRY_RUN) {
    console.log('\n  💡 Dry run complete. Run without --dry-run to apply changes.')
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

main().catch(err => {
  console.error('\n❌  Fatal error:', err.message)
  process.exit(1)
})

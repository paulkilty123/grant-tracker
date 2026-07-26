#!/usr/bin/env node
// Calls Claude Haiku directly via fetch (bypasses SDK to work with sandbox proxy).
// Writes results to /tmp/review-keepers-enriched.json.

import { readFileSync, writeFileSync } from 'node:fs'
import { ProxyAgent, setGlobalDispatcher } from 'undici'

if (process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new ProxyAgent({
    uri: process.env.HTTPS_PROXY,
    requestTls: { rejectUnauthorized: false },
  }))
}

// Load .env.local
const env = readFileSync('/sessions/gallant-practical-darwin/mnt/grant-tracker/.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const API_KEY = process.env.ANTHROPIC_API_KEY
const GRANTS = JSON.parse(readFileSync('/tmp/review-keepers-input.json', 'utf8'))

const VALID_SECTORS = ['creative','environment','health','education','tech','housing','food','employment','community','justice','financial','international','mental_health','disability','older_people','sport','heritage','women','young_people','social_economy','social_innovation']
const VALID_FUNDING_TYPES = ['grant','programme','investment','in_kind']
const VALID_STRUCTURES = ['cic_guarantee','cic_shares','cio','registered_charity','ltd_guarantee','ltd_shares','llp','cooperative','unincorporated','sole_trader','not_registered']
const VALID_BENEFICIARIES = ['children','young_people','older_people','families','women_girls','men_boys','lgbtq','ethnic_minorities','refugees_migrants','disabled_people','mental_health','carers','veterans','ex_offenders','homeless','people_in_poverty','rural_communities','general_public']

const buildPrompt = (grant) => `You are enriching a UK charity/CIC/social enterprise funding database with a complete record for a well-known UK funder. Use your training knowledge about this organisation to fill every field accurately. Do not reference "the source" or your own uncertainty in field values.

Grant title: ${grant.title}
Funder: ${grant.funder}
Apply URL: ${grant.apply_url ?? ''}
Existing description: ${(grant.description ?? '').slice(0, 600)}

Return ONLY valid JSON (no markdown, no commentary):
{
  "funder_brief": {
    "what_they_fund": "1-3 sentences",
    "who_can_apply": "1-3 sentences — be direct about legal structures, income caps, stage",
    "geographic_focus": "UK-wide | England | Scotland | Wales | Northern Ireland | specific region/city",
    "priorities": "current funding priorities",
    "strong_application": "what makes a strong application",
    "exclusions": "what they will NOT fund",
    "typical_award": "grant size or range (e.g. '£5k–£50k')",
    "decision_timeline": "application windows / decision times",
    "how_to_apply": "key process steps",
    "funder_tips": "insider tips",
    "last_enriched": "${new Date().toISOString().split('T')[0]}",
    "source": "knowledge_fallback"
  },
  "classification": {
    "impact_sectors": ["<1-4 from: ${VALID_SECTORS.join(', ')}>"],
    "funding_type": "<one of: ${VALID_FUNDING_TYPES.join(', ')}>",
    "eligible_structures": ["<0+ from: ${VALID_STRUCTURES.join(', ')}>"],
    "target_beneficiaries": ["<1-4 from: ${VALID_BENEFICIARIES.join(', ')}>"],
    "niche_tags": ["<0-4 short lowercase_snake_case sub-sector tags>"]
  },
  "structured": {
    "amount_min": 0,
    "amount_max": 0,
    "deadline": null,
    "is_rolling": true,
    "location_tag": "UK"
  }
}

Rules:
- amount_min/amount_max in £ (integer, 0 if unclear). deadline YYYY-MM-DD or null.
- location_tag: "UK", "England", "London", "West Midlands", "Scotland", etc.
- Use most specific sector (mental_health > health; young_people over community when appropriate)
- For programmes/accelerators: funding_type="programme"; in-kind support → "in_kind"; social investment/loans → "investment"`

async function callClaude(prompt, retry = 0) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1800,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      if ((res.status === 429 || res.status >= 500) && retry < 3) {
        await new Promise(r => setTimeout(r, (retry + 1) * 1500))
        return callClaude(prompt, retry + 1)
      }
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`)
    }
    const data = await res.json()
    return data.content[0].type === 'text' ? data.content[0].text : ''
  } catch (e) {
    if (retry < 2) {
      await new Promise(r => setTimeout(r, 2000))
      return callClaude(prompt, retry + 1)
    }
    throw e
  }
}

async function processOne(grant) {
  const text = await callClaude(buildPrompt(grant))
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in response')
  const parsed = JSON.parse(jsonMatch[0])

  const sectors = (parsed.classification?.impact_sectors ?? []).filter(s => VALID_SECTORS.includes(s)).slice(0, 4)
  const fundingType = VALID_FUNDING_TYPES.includes(parsed.classification?.funding_type) ? parsed.classification.funding_type : 'grant'
  const structures = (parsed.classification?.eligible_structures ?? []).filter(s => VALID_STRUCTURES.includes(s))
  const beneficiaries = (parsed.classification?.target_beneficiaries ?? []).filter(b => VALID_BENEFICIARIES.includes(b)).slice(0, 4)
  const nicheTags = (parsed.classification?.niche_tags ?? []).slice(0, 4)

  return {
    id: grant.id,
    funder: grant.funder,
    title: grant.title,
    funder_brief: parsed.funder_brief,
    impact_sectors: sectors,
    funding_type: fundingType,
    eligible_structures: structures,
    target_beneficiaries: beneficiaries,
    niche_tags: nicheTags,
    amount_min: parsed.structured?.amount_min || null,
    amount_max: parsed.structured?.amount_max || null,
    deadline: parsed.structured?.deadline || null,
    is_rolling: typeof parsed.structured?.is_rolling === 'boolean' ? parsed.structured.is_rolling : true,
    location_tag: parsed.structured?.location_tag || null,
  }
}

async function main() {
  console.log(`Processing ${GRANTS.length} grants via Claude Haiku…`)
  const results = []
  const failures = []
  const CONCURRENCY = 6
  for (let i = 0; i < GRANTS.length; i += CONCURRENCY) {
    const batch = GRANTS.slice(i, i + CONCURRENCY)
    const settled = await Promise.allSettled(batch.map(processOne))
    settled.forEach((s, idx) => {
      const g = batch[idx]
      if (s.status === 'fulfilled') {
        results.push(s.value)
        console.log(`✓ ${g.funder} — ${g.title} | ${s.value.impact_sectors.join(',')} | ${s.value.funding_type}`)
      } else {
        failures.push({ id: g.id, funder: g.funder, title: g.title, error: String(s.reason?.message ?? s.reason) })
        console.error(`✗ ${g.funder} — ${g.title}: ${s.reason?.message ?? s.reason}`)
      }
    })
    // Flush partial results between batches
    writeFileSync('/tmp/review-keepers-enriched.json', JSON.stringify(results, null, 2))
    writeFileSync('/tmp/review-keepers-failures.json', JSON.stringify(failures, null, 2))
  }
  console.log(`\nOK ${results.length} / FAIL ${failures.length}`)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })

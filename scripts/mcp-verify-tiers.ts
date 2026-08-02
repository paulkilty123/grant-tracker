// End-to-end tier verification — drives tools/list against a real MCP endpoint
// with a real token per tier and asserts the advertised tool list.
//
//   npx tsx scripts/mcp-verify-tiers.ts                       # production
//   npx tsx scripts/mcp-verify-tiers.ts http://localhost:3000  # local
//
// Requires fixtures: npx tsx scripts/mcp-test-fixtures.ts
//
// This is the check that structural reasoning cannot give you. tools/list is
// built from what each handler registers, so asserting it over the wire proves
// the tier ladder as a client actually experiences it — including that a lower
// tier is not merely refused a tool but never shown one.

import { readFileSync } from 'node:fs'
import path from 'path'

const FIXTURES = path.resolve(__dirname, '../.mcp-test-fixtures.json')
const BASE = process.argv[2]?.replace(/\/+$/, '') || 'https://www.granttracker.co.uk'
const ENDPOINT = `${BASE}/api/mcp/v1/mcp`

const CATALOGUE = ['health_check', 'get_taxonomy', 'search_funding_and_support', 'get_opportunity_detail', 'get_provider_intelligence']
const PIPELINE = ['add_to_pipeline', 'update_pipeline_item', 'get_pipeline']
const GOAL = ['get_funding_goal', 'set_funding_goal', 'update_goal_purposes', 'recommend_mix', 'get_plan_state', 'get_briefing', 'assess_opportunity_against_plan']

const EXPECTED: Record<string, string[]> = {
  free: [...CATALOGUE],
  apply: [...CATALOGUE, ...PIPELINE],
  companion: [...CATALOGUE, ...PIPELINE, ...GOAL],
}

async function toolsList(token: string): Promise<string[]> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
  // Streamable HTTP may answer as SSE; take the last data: line if so.
  const payload = text.includes('data:')
    ? text.split('\n').filter(l => l.startsWith('data:')).pop()!.slice(5).trim()
    : text
  const json = JSON.parse(payload)
  if (json.error) throw new Error(`JSON-RPC error: ${JSON.stringify(json.error).slice(0, 200)}`)
  return (json.result?.tools ?? []).map((t: { name: string }) => t.name).sort()
}

async function main() {
  const { fixtures } = JSON.parse(readFileSync(FIXTURES, 'utf8'))
  console.log(`endpoint: ${ENDPOINT}\n`)
  let failures = 0

  for (const [key, fx] of Object.entries(fixtures) as [string, { access_token: string; tier: string }][]) {
    const expected = EXPECTED[fx.tier]
    if (!expected) { console.log(`SKIP ${key}: no expectation for tier ${fx.tier}`); continue }

    let actual: string[]
    try {
      actual = await toolsList(fx.access_token)
    } catch (e) {
      failures++
      console.log(`FAIL ${key} (${fx.tier}): ${(e as Error).message}`)
      continue
    }

    const want = [...expected].sort()
    const missing = want.filter(t => !actual.includes(t))
    const extra = actual.filter(t => !want.includes(t))
    const ok = missing.length === 0 && extra.length === 0
    if (!ok) failures++

    console.log(`${ok ? 'PASS' : 'FAIL'} ${key} (tier=${fx.tier}) — ${actual.length} tools`)
    if (missing.length) console.log(`     missing: ${missing.join(', ')}`)
    if (extra.length) console.log(`     unexpected: ${extra.join(', ')}`)
    // The negative assertion is the one that matters for a paid boundary.
    if (fx.tier === 'free') {
      const leaked = [...PIPELINE, ...GOAL].filter(t => actual.includes(t))
      console.log(`     paid tools visible to free: ${leaked.length === 0 ? 'none (correct)' : leaked.join(', ')}`)
      if (leaked.length) failures++
    }
    if (fx.tier === 'apply') {
      const leaked = GOAL.filter(t => actual.includes(t))
      console.log(`     Adviser tools visible to Apply: ${leaked.length === 0 ? 'none (correct)' : leaked.join(', ')}`)
      if (leaked.length) failures++
    }
  }

  console.log(failures === 0 ? '\nALL TIER ASSERTIONS PASS' : `\n${failures} FAILURE(S)`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(err => { console.error(err); process.exit(1) })

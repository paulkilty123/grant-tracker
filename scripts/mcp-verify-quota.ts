// Drive the free-tier search quota to its boundary and watch it refuse.
//
//   npx tsx scripts/mcp-verify-quota.ts <baseUrl> [expectedLimit]
//
// Requires fixtures (scripts/mcp-test-fixtures.ts) for the free-tier token.
// Set VERCEL_BYPASS to a Vercel protection-bypass secret when pointing at a
// protected preview deployment. Read from the environment, never a flag, so it
// cannot end up in shell history or a process listing.
//
// Why a preview at a lowered limit rather than production at 75: the 50/hour
// free ceiling puts 75 out of reach inside one hour, so the boundary cannot be
// reached in a single sitting at the production value. FREE_SEARCH_QUOTA lets a
// preview run the identical code against a small limit.

import { readFileSync } from 'node:fs'
import path from 'path'

const BASE = process.argv[2]?.replace(/\/+$/, '')
const EXPECTED_LIMIT = Number(process.argv[3] ?? 3)
if (!BASE) { console.error('usage: mcp-verify-quota.ts <baseUrl> [expectedLimit]'); process.exit(1) }

const ENDPOINT = `${BASE}/api/mcp/v1/mcp`
const FIXTURES = path.resolve(__dirname, '../.mcp-test-fixtures.json')

interface SearchBody {
  results?: unknown[]
  total_matching?: number
  search_quota?: { searches_used: number; monthly_limit: number; searches_remaining: number; resets_on: string }
  quota_reached?: { searches_used: number; monthly_limit: number; resets_on: string }
  message?: string
}

async function callSearch(token: string): Promise<SearchBody> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': `Bearer ${token}`,
  }
  const bypass = process.env.VERCEL_BYPASS
  if (bypass) headers['x-vercel-protection-bypass'] = bypass

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'search_funding_and_support', arguments: { query: 'community', limit: 1 } },
    }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
  const payload = text.includes('data:')
    ? text.split('\n').filter(l => l.startsWith('data:')).pop()!.slice(5).trim()
    : text
  const json = JSON.parse(payload)
  if (json.error) throw new Error(`JSON-RPC error: ${JSON.stringify(json.error).slice(0, 200)}`)
  const inner = json.result?.content?.[0]?.text
  return typeof inner === 'string' ? JSON.parse(inner) : {}
}

async function main() {
  const { fixtures } = JSON.parse(readFileSync(FIXTURES, 'utf8'))
  const token: string = fixtures.free.access_token
  console.log(`endpoint       : ${ENDPOINT}`)
  console.log(`expected limit : ${EXPECTED_LIMIT}\n`)

  let firstRefusal = -1
  let lastAllowed = -1
  let resetsOn = ''
  let sawDeclaration = false

  for (let i = 1; i <= EXPECTED_LIMIT + 1; i++) {
    const body = await callSearch(token)
    if (body.quota_reached) {
      if (firstRefusal === -1) firstRefusal = i
      resetsOn = body.quota_reached.resets_on
      console.log(`call ${i}: REFUSED — used ${body.quota_reached.searches_used}/${body.quota_reached.monthly_limit}, resets ${body.quota_reached.resets_on}`)
    } else if (body.search_quota) {
      sawDeclaration = true
      lastAllowed = i
      resetsOn = body.search_quota.resets_on
      console.log(`call ${i}: allowed — used ${body.search_quota.searches_used}/${body.search_quota.monthly_limit}, remaining ${body.search_quota.searches_remaining}, results ${body.results?.length ?? 0}`)
    } else {
      lastAllowed = i
      console.log(`call ${i}: allowed — NO search_quota block (quota unenforced? Upstash missing)`)
    }
  }

  const expectedReset = (() => {
    const n = new Date()
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1)).toISOString().slice(0, 10)
  })()

  const checks: [string, boolean][] = [
    [`allowance declared on allowed calls`, sawDeclaration],
    [`last allowed call is ${EXPECTED_LIMIT}`, lastAllowed === EXPECTED_LIMIT],
    [`first refusal is call ${EXPECTED_LIMIT + 1}`, firstRefusal === EXPECTED_LIMIT + 1],
    [`resets_on is ${expectedReset}`, resetsOn === expectedReset],
  ]
  console.log('')
  for (const [label, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  const allOk = checks.every(([, ok]) => ok)
  console.log(allOk ? '\nQUOTA BOUNDARY CONFIRMED' : '\nBOUNDARY NOT CONFIRMED')
  process.exit(allOk ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })

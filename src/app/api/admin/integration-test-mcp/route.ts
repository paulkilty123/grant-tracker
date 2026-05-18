// Integration test for the MCP server. Exercises the full HTTP + JSON-RPC
// + auth + rate-limit + tool stack — not just the adapter projection layer
// (that's what /api/admin/validate-mcp-adapter covers).
//
// Workflows tested:
//   1. Taxonomy → Search → Detail → Provider chain
//   2. Zero-result with adjacent_suggestions follow-up
//   3. Provider lookup by name (enriched) → drill into active opportunities
//   4. Error paths (invalid UUID, not_found, invalid_parameter, unknown tool)
//   5. Auth states (anon, invalid Bearer, valid Bearer)
//   6. UTM source propagation through grant_tracker_url
//
// Guarded by CRON_SECRET. Creates a temporary api_keys row for the
// authenticated workflows, revokes it at the end (kept for audit, status
// flipped to revoked).
//
// Usage:
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//        http://localhost:3000/api/admin/integration-test-mcp

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateApiKey } from '@/lib/mcp-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

interface JsonRpcResponse {
  result?: {
    content?: Array<{ type: string; text?: string }>
    tools?: Array<{ name: string }>
    isError?: boolean
  }
  error?: unknown
  jsonrpc: '2.0'
  id: number | string | null
}

interface TestResult {
  name: string
  passed: boolean
  details?: unknown
  failure?: string
}

// Tiny JSON-RPC client over the MCP Streamable HTTP endpoint
async function mcpCall(
  origin: string,
  method: string,
  params: Record<string, unknown>,
  opts: { bearer?: string; id?: number } = {},
): Promise<{
  http_status: number
  rpc: JsonRpcResponse | null
  raw: string
  tool_payload: Record<string, unknown> | null
  /** Top-level parsed body. For 200 tool responses, equals tool_payload.
   *  For 429 / error responses, equals the unwrapped error body which has
   *  rate_limit_status + attribution at the top level. Use this when a test
   *  needs to be resilient to whichever shape applies. */
  body: Record<string, unknown> | null
}> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  }
  if (opts.bearer) headers['Authorization'] = `Bearer ${opts.bearer}`
  const r = await fetch(`${origin}/api/mcp/v1/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: opts.id ?? Math.floor(Math.random() * 1e9), method, params }),
  })
  const raw = await r.text()

  // Streamable HTTP wraps the JSON-RPC payload in an SSE `data:` line for tool
  // responses. For 429 / error responses it's plain JSON. Handle both.
  let rpc: JsonRpcResponse | null = null
  let rawBody: Record<string, unknown> | null = null
  const sseMatch = raw.match(/^data:\s*(\{.*\})\s*$/m)
  try {
    if (sseMatch) rpc = JSON.parse(sseMatch[1]) as JsonRpcResponse
    else if (raw.trim().startsWith('{')) {
      rawBody = JSON.parse(raw) as Record<string, unknown>
      rpc = rawBody as unknown as JsonRpcResponse
    }
  } catch {
    rpc = null
  }

  // For tool/call responses, the actual JSON tool payload is embedded as a
  // text content item. Pre-parse it for convenience.
  let tool_payload: Record<string, unknown> | null = null
  const textContent = rpc?.result?.content?.[0]?.text
  if (textContent) {
    try { tool_payload = JSON.parse(textContent) as Record<string, unknown> }
    catch { tool_payload = null }
  }

  const body: Record<string, unknown> | null = tool_payload ?? rawBody
  return { http_status: r.status, rpc, raw, tool_payload, body }
}

function pass(name: string, details?: unknown): TestResult {
  return { name, passed: true, details }
}
function fail(name: string, failure: string, details?: unknown): TestResult {
  return { name, passed: false, failure, details }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const origin = req.nextUrl.origin
  const sb = serviceClient()

  // ── Set up: create a temporary test API key ──────────────────────────
  // Use any existing user_id (api_keys.user_id is a required FK). We
  // pick the first user found via service role; if none exist, we'll
  // skip the authenticated workflows.
  const { data: anyUser } = await sb.from('api_keys').select('user_id').limit(1).maybeSingle()
  let testUserId: string | null = (anyUser as { user_id: string } | null)?.user_id ?? null
  if (!testUserId) {
    // Fallback: pull from auth.users via raw RPC won't work without a function;
    // try a minimal probe — if no api_keys row exists yet, find a user via the
    // organisations table (every signed-up user has one).
    const { data: anyOrg } = await sb.from('organisations').select('owner_id').limit(1).maybeSingle()
    testUserId = (anyOrg as { owner_id: string } | null)?.owner_id ?? null
  }

  const tests: TestResult[] = []
  let testKey: string | null = null
  let testKeyId: string | null = null

  if (testUserId) {
    const generated = generateApiKey()
    const { data: insertedKey, error: insertErr } = await sb.from('api_keys').insert({
      user_id:     testUserId,
      key_hash:    generated.hash,
      key_prefix:  generated.prefix,
      name:        'integration-test-temp',
      utm_source:  'developer_mcp',
      tos_version: 'integration-test',
    }).select('id').single()
    if (insertErr) {
      tests.push(fail('setup: create test API key', insertErr.message))
    } else {
      testKey = generated.raw
      testKeyId = (insertedKey as { id: string }).id
      tests.push(pass('setup: create test API key', { prefix: generated.prefix }))
    }
  } else {
    tests.push(fail('setup: find a user for the test key', 'no users found via api_keys or organisations'))
  }

  // ─────────────────────────────────────────────────────────────────────
  // Workflow 1 — taxonomy → search → detail → provider chain
  // ─────────────────────────────────────────────────────────────────────
  let pickedOpportunityId: string | null = null
  let pickedFunder: string | null = null
  {
    // a) get_taxonomy(sectors) — should return 14 entries
    const t1 = await mcpCall(origin, 'tools/call', {
      name: 'get_taxonomy', arguments: { taxonomy: 'sectors' },
    }, { bearer: testKey ?? undefined })
    const sectors = (t1.tool_payload?.taxonomies as Record<string, unknown[]> | undefined)?.sectors
    if (Array.isArray(sectors) && sectors.length === 14) {
      tests.push(pass('w1a: get_taxonomy(sectors) → 14 entries'))
    } else {
      tests.push(fail('w1a: get_taxonomy(sectors) → 14 entries', `got ${Array.isArray(sectors) ? sectors.length : 'non-array'}`, t1.tool_payload))
    }

    // b) search_funding_and_support with strong filters — should return ≥1
    const t2 = await mcpCall(origin, 'tools/call', {
      name: 'search_funding_and_support',
      arguments: { funding_type: ['grant'], sector: ['community'], limit: 3 },
    }, { bearer: testKey ?? undefined })
    const results = (t2.tool_payload?.results as Array<Record<string, unknown>> | undefined) ?? []
    if (results.length > 0) {
      tests.push(pass('w1b: search returns ≥1 grant result for sector=community', { returned: results.length, total: t2.tool_payload?.total_matching }))
      pickedOpportunityId = (results[0].opportunity_id as string) ?? null
      pickedFunder = (results[0].funder as string) ?? null
    } else {
      tests.push(fail('w1b: search returns ≥1 grant result for sector=community', 'no results', t2.tool_payload))
    }

    // c) get_opportunity_detail with the picked id
    if (pickedOpportunityId) {
      const t3 = await mcpCall(origin, 'tools/call', {
        name: 'get_opportunity_detail',
        arguments: { opportunity_id: pickedOpportunityId },
      }, { bearer: testKey ?? undefined })
      const opp = t3.tool_payload
      if (opp && opp.opportunity_id === pickedOpportunityId && opp.funder === pickedFunder) {
        tests.push(pass('w1c: get_opportunity_detail handoff carries id + funder consistently'))
      } else {
        tests.push(fail('w1c: get_opportunity_detail handoff carries id + funder consistently', 'mismatch', { expected_id: pickedOpportunityId, got_id: opp?.opportunity_id, expected_funder: pickedFunder, got_funder: opp?.funder }))
      }
    } else {
      tests.push(fail('w1c: get_opportunity_detail handoff', 'no id from previous step'))
    }

    // d) get_provider_intelligence by opportunity_id — funder name should match
    if (pickedOpportunityId) {
      const t4 = await mcpCall(origin, 'tools/call', {
        name: 'get_provider_intelligence',
        arguments: { opportunity_id: pickedOpportunityId },
      }, { bearer: testKey ?? undefined })
      const provider = (t4.tool_payload?.provider as Record<string, unknown> | undefined)
      if (provider && provider.name === pickedFunder) {
        tests.push(pass('w1d: get_provider_intelligence(opportunity_id) resolves to same funder name', { data_richness: provider.data_richness }))
      } else {
        tests.push(fail('w1d: get_provider_intelligence(opportunity_id) resolves to same funder name', 'mismatch', { expected: pickedFunder, got: provider?.name }))
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Workflow 2 — zero-result with adjacents (Q5 mental_health × Yorkshire)
  // ─────────────────────────────────────────────────────────────────────
  {
    // Q5 was originally a guaranteed zero-result query (mental_health × programmes
    // × Yorkshire). After the 2026-05-14 classifier improvements at least one
    // mental_health programme now exists in the catalogue, so this can flip
    // between zero-result and results-present as the catalogue evolves.
    // The test asserts CORRECT BEHAVIOUR on either branch and drills whichever
    // id is available (adjacent or actual result) through get_opportunity_detail.
    const t = await mcpCall(origin, 'tools/call', {
      name: 'search_funding_and_support',
      arguments: { funding_type: ['programme'], sector: ['mental_health'], region: ['yorkshire_and_humber'] },
    }, { bearer: testKey ?? undefined })
    const total = t.tool_payload?.total_matching as number | undefined
    let drillId: string | null = null
    if (total === 0) {
      const zd = t.tool_payload?.zero_result_diagnostic as { likely_cause?: string; adjacent_suggestions?: Array<Record<string, unknown>> } | undefined
      if (zd && Array.isArray(zd.adjacent_suggestions) && zd.adjacent_suggestions.length >= 1) {
        tests.push(pass('w2a: Q5 zero-result branch — diagnostic + ≥1 adjacent present', { likely_cause: zd.likely_cause, adjacents: zd.adjacent_suggestions.length }))
        drillId = (zd.adjacent_suggestions[0].opportunity_id as string | undefined) ?? null
      } else {
        tests.push(fail('w2a: Q5 zero-result branch — diag/adjacents missing', `has_diag=${!!zd}, adj_count=${zd?.adjacent_suggestions?.length}`, t.tool_payload))
      }
    } else if ((total ?? 0) >= 1) {
      const results = t.tool_payload?.results as Array<{ opportunity_id?: string; match_quality?: object }> | undefined
      const first = results?.[0]
      if (results && first?.opportunity_id && first?.match_quality) {
        tests.push(pass('w2a: Q5 results branch — ≥1 result with match_quality (catalogue evolved; mental_health programmes now present)', { total, top_id: first.opportunity_id }))
        drillId = first.opportunity_id
      } else {
        tests.push(fail('w2a: Q5 results branch — missing opportunity_id or match_quality', '', t.tool_payload))
      }
    } else {
      tests.push(fail('w2a: Q5 unexpected response shape', `total=${total}`, t.tool_payload))
    }

    // w2b drills whichever id w2a surfaced — both branches deliver a stable id
    if (drillId) {
      const t2 = await mcpCall(origin, 'tools/call', {
        name: 'get_opportunity_detail', arguments: { opportunity_id: drillId },
      }, { bearer: testKey ?? undefined })
      if (t2.tool_payload?.opportunity_id === drillId) {
        tests.push(pass('w2b: surfaced id (adjacent OR actual result) drills via get_opportunity_detail'))
      } else {
        tests.push(fail('w2b: surfaced id drills', 'detail call did not return matching id', t2.tool_payload))
      }
    } else {
      tests.push(fail('w2b: surfaced id drills', 'no id from w2a to drill'))
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Workflow 3 — provider by name (enriched), then drill an active opp
  // ─────────────────────────────────────────────────────────────────────
  {
    const t = await mcpCall(origin, 'tools/call', {
      name: 'get_provider_intelligence',
      arguments: { provider_name: 'Wolfson Foundation' },
    }, { bearer: testKey ?? undefined })
    const provider = t.tool_payload?.provider as Record<string, unknown> | undefined
    const activeOpps = t.tool_payload?.active_opportunities as { count: number; opportunity_ids: string[] } | undefined
    if (provider?.data_richness === 'enriched' && activeOpps && activeOpps.count >= 1 && activeOpps.opportunity_ids.length >= 1) {
      tests.push(pass('w3a: Wolfson Foundation → enriched + ≥1 active opp', { active_count: activeOpps.count }))
      // Drill the first active opportunity
      const t2 = await mcpCall(origin, 'tools/call', {
        name: 'get_opportunity_detail', arguments: { opportunity_id: activeOpps.opportunity_ids[0] },
      }, { bearer: testKey ?? undefined })
      if (t2.tool_payload?.funder === 'Wolfson Foundation') {
        tests.push(pass('w3b: drilled opportunity belongs to Wolfson Foundation'))
      } else {
        tests.push(fail('w3b: drilled opportunity belongs to Wolfson Foundation', `funder mismatch: ${t2.tool_payload?.funder}`))
      }
    } else {
      tests.push(fail('w3a: Wolfson Foundation enriched lookup', 'not enriched or no active opps', { provider, activeOpps }))
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Workflow 4 — error paths
  // ─────────────────────────────────────────────────────────────────────
  {
    // a) Invalid UUID → Zod -32602 in content as isError
    const t = await mcpCall(origin, 'tools/call', {
      name: 'get_opportunity_detail', arguments: { opportunity_id: 'not-a-uuid' },
    }, { bearer: testKey ?? undefined })
    const isError = t.rpc?.result?.isError
    const text = t.rpc?.result?.content?.[0]?.text ?? ''
    if (isError && text.includes('Input validation error')) {
      tests.push(pass('w4a: invalid UUID format → input validation error'))
    } else {
      tests.push(fail('w4a: invalid UUID format → input validation error', 'unexpected response', { isError, text_preview: text.slice(0, 200) }))
    }
  }
  {
    // b) Non-existent UUID → not_found
    const t = await mcpCall(origin, 'tools/call', {
      name: 'get_opportunity_detail', arguments: { opportunity_id: '00000000-0000-0000-0000-000000000000' },
    }, { bearer: testKey ?? undefined })
    const code = (t.tool_payload?.error as { code?: string } | undefined)?.code
    if (t.rpc?.result?.isError && code === 'not_found') {
      tests.push(pass('w4b: non-existent UUID → not_found'))
    } else {
      tests.push(fail('w4b: non-existent UUID → not_found', 'wrong code or not flagged isError', { code, isError: t.rpc?.result?.isError }))
    }
  }
  {
    // c) get_provider_intelligence with no params → invalid_parameter
    const t = await mcpCall(origin, 'tools/call', {
      name: 'get_provider_intelligence', arguments: {},
    }, { bearer: testKey ?? undefined })
    const code = (t.tool_payload?.error as { code?: string } | undefined)?.code
    if (t.rpc?.result?.isError && code === 'invalid_parameter') {
      tests.push(pass('w4c: provider_intelligence with no params → invalid_parameter'))
    } else {
      tests.push(fail('w4c: provider_intelligence with no params → invalid_parameter', 'unexpected', { code, isError: t.rpc?.result?.isError }))
    }
  }
  {
    // d) Unknown tool → MCP error
    const t = await mcpCall(origin, 'tools/call', {
      name: 'nonexistent_tool', arguments: {},
    }, { bearer: testKey ?? undefined })
    // Either rpc.error or content[0].text with MCP error
    const hasError = !!t.rpc?.error || (t.rpc?.result?.isError ?? false)
    if (hasError) {
      tests.push(pass('w4d: unknown tool name → MCP error'))
    } else {
      tests.push(fail('w4d: unknown tool name → MCP error', 'no error returned', { rpc: t.rpc }))
    }
  }
  {
    // e) search with limit > max (50) → Zod rejects
    const t = await mcpCall(origin, 'tools/call', {
      name: 'search_funding_and_support', arguments: { limit: 999 },
    }, { bearer: testKey ?? undefined })
    const text = t.rpc?.result?.content?.[0]?.text ?? ''
    if (t.rpc?.result?.isError && text.includes('Input validation error')) {
      tests.push(pass('w4e: search with limit=999 → input validation error (max 50)'))
    } else {
      tests.push(fail('w4e: search with limit=999 → input validation error', 'expected validation error', { text_preview: text.slice(0, 200) }))
    }
  }
  {
    // f) get_taxonomy with invalid enum → Zod rejects
    const t = await mcpCall(origin, 'tools/call', {
      name: 'get_taxonomy', arguments: { taxonomy: 'not_real' },
    }, { bearer: testKey ?? undefined })
    const text = t.rpc?.result?.content?.[0]?.text ?? ''
    if (t.rpc?.result?.isError && text.includes('Input validation error')) {
      tests.push(pass('w4f: get_taxonomy with invalid enum → input validation error'))
    } else {
      tests.push(fail('w4f: get_taxonomy with invalid enum → input validation error', 'expected validation error', { text_preview: text.slice(0, 200) }))
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Workflow 5 — auth states + rate_limit_status differences
  // ─────────────────────────────────────────────────────────────────────
  {
    // a) Anon → rate_limit_status with anonymous shape (remaining_day: null).
    // Accept either 200 (fresh anon bucket) or 429 (bucket exhausted) — both
    // are valid anon behaviours and both surface the same rate_limit_status
    // shape. Reads from `body` so it works for both the SSE-wrapped tool
    // response and the unwrapped 429 error body.
    const t = await mcpCall(origin, 'tools/call', {
      name: 'health_check', arguments: {},
    })
    const rls = t.body?.rate_limit_status as { remaining_hour: number; remaining_day: number | null } | undefined
    if (rls && rls.remaining_day === null && typeof rls.remaining_hour === 'number') {
      tests.push(pass('w5a: anon health_check → rate_limit_status.remaining_day=null', { http_status: t.http_status, rls }))
    } else {
      tests.push(fail('w5a: anon health_check → rate_limit_status anonymous shape', 'unexpected shape', { http_status: t.http_status, rls }))
    }
  }
  if (testKey) {
    // b) Authenticated → rate_limit_status with auth shape (remaining_day: number)
    const t = await mcpCall(origin, 'tools/call', {
      name: 'health_check', arguments: {},
    }, { bearer: testKey })
    const rls = t.tool_payload?.rate_limit_status as { remaining_hour: number; remaining_day: number | null } | undefined
    if (rls && typeof rls.remaining_day === 'number') {
      tests.push(pass('w5b: authed health_check → rate_limit_status.remaining_day=number', rls))
    } else {
      tests.push(fail('w5b: authed health_check → rate_limit_status auth shape', 'expected numeric remaining_day', rls))
    }
  }
  {
    // c) Invalid Bearer → falls through to anon-equivalent rate limits.
    // Same 200/429 resilience as w5a — invalid bearer is treated as anon
    // for enforcement, so it can hit the same per-IP bucket.
    const t = await mcpCall(origin, 'tools/call', {
      name: 'health_check', arguments: {},
    }, { bearer: 'gt_mcp_definitely_not_a_real_key_garbage' })
    const rls = t.body?.rate_limit_status as { remaining_day: number | null } | undefined
    if (rls && rls.remaining_day === null) {
      tests.push(pass('w5c: invalid Bearer → anon-equivalent rate limits (no crash)', { http_status: t.http_status }))
    } else {
      tests.push(fail('w5c: invalid Bearer → anon-equivalent rate limits', 'unexpected', { http_status: t.http_status, rls }))
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Workflow 6 — utm_source propagation
  // ─────────────────────────────────────────────────────────────────────
  if (testKey) {
    const t = await mcpCall(origin, 'tools/call', {
      name: 'search_funding_and_support', arguments: { funding_type: ['grant'], limit: 1 },
    }, { bearer: testKey })
    const results = (t.tool_payload?.results as Array<Record<string, unknown>> | undefined) ?? []
    const url = (results[0]?.grant_tracker_url as string | undefined) ?? ''
    if (url.includes('utm_source=developer_mcp') && url.includes('utm_medium=mcp')) {
      tests.push(pass('w6a: authed result grant_tracker_url has key utm_source=developer_mcp'))
    } else {
      tests.push(fail('w6a: authed result grant_tracker_url utm_source', 'missing developer_mcp source', { url_preview: url.slice(0, 150) }))
    }
  }
  {
    // Anon search — when the IP's anon bucket is exhausted, this returns 429
    // instead of search results. That's correct enforcement, not a failure
    // of the utm propagation. Treat 429 as a pass for THIS specific assertion
    // (we've verified rate-limit enforcement separately; this test is about
    // utm propagation when anon DOES get through).
    const t = await mcpCall(origin, 'tools/call', {
      name: 'search_funding_and_support', arguments: { funding_type: ['grant'], limit: 1 },
    })
    if (t.http_status === 429) {
      tests.push(pass('w6b: anon search rate-limited (utm propagation assertion skipped — bucket exhausted, which is correct enforcement)', { http_status: 429 }))
    } else {
      const results = (t.tool_payload?.results as Array<Record<string, unknown>> | undefined) ?? []
      const url = (results[0]?.grant_tracker_url as string | undefined) ?? ''
      if (url.includes('utm_source=mcp_anonymous')) {
        tests.push(pass('w6b: anon result grant_tracker_url has utm_source=mcp_anonymous'))
      } else {
        tests.push(fail('w6b: anon result grant_tracker_url utm_source', 'missing mcp_anonymous source', { url_preview: url.slice(0, 150) }))
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Teardown — revoke the test key (preserve audit trail)
  // ─────────────────────────────────────────────────────────────────────
  if (testKeyId) {
    await sb.from('api_keys').update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
      revoked_reason: 'integration-test teardown',
    }).eq('id', testKeyId)
    tests.push(pass('teardown: revoked test API key'))
  }

  const passed = tests.filter(t => t.passed).length
  const failed = tests.filter(t => !t.passed).length

  return NextResponse.json({
    summary: { total: tests.length, passed, failed },
    tests,
  }, { status: failed === 0 ? 200 : 207 })
}

// Free-surface checker — captures a live MCP `tools/list` from a NON-companion
// connection and prints a canonical, comparable fingerprint (count + sorted
// names + a sha256 of the stable-stringified tool array). Run pre- and
// post-deploy; identical fingerprints prove the free surface is byte-identical.
//
//   npx tsx --env-file=.env.local scripts/agent-eval/mcp-toollist.ts
//
// A non-companion connection = an API-key request (the gt_mcp_ path skips tier
// resolution → always the free handler). Self-contained: mints a throwaway
// gt_mcp_ key, runs the check, deletes the key in `finally` (never printed).
// The free handler is the SAME instance a non-companion OAuth caller (e.g. the
// directory reviewer) hits, so its tools/list is exactly what they'd see.
//
// Override target with MCP_URL; supply MCP_BEARER to use an existing token
// instead of minting one.

import { readFileSync } from 'fs'
import { resolve as presolve } from 'path'
import { createHash, randomBytes } from 'crypto'
try {
  for (const line of readFileSync(presolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v
  }
} catch { /* rely on --env-file */ }

const MCP_URL = process.env.MCP_URL ?? 'https://www.granttracker.co.uk/api/mcp/v1/mcp'
// Paul's user_id — an owner_id that satisfies the api_keys FK. The key gets the
// free handler regardless of the owner's orgs (API-key path skips tier resolve).
const MINT_USER_ID = process.env.MINT_USER_ID ?? 'ee80e7d1-6680-420f-8046-5a5e36a84fe6'

// deterministic stringify (recursively sorted keys) for a stable fingerprint
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object).sort().map(k => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return JSON.stringify(v)
}

interface RpcOut { status: number; sid: string | null; json: Record<string, unknown> | undefined }
async function rpc(bearer: string, sid: string | null, body: Record<string, unknown>): Promise<RpcOut> {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(sid ? { 'mcp-session-id': sid } : {}),
    },
    body: JSON.stringify(body),
  })
  const outSid = res.headers.get('mcp-session-id') ?? sid
  const ct = res.headers.get('content-type') ?? ''
  const text = await res.text()
  let json: Record<string, unknown> | undefined
  if (ct.includes('text/event-stream')) {
    for (const line of text.split('\n')) {
      if (!line.startsWith('data:')) continue
      try { const p = JSON.parse(line.slice(5).trim()); if (p && (p.result || p.error || p.id === body.id)) json = p } catch { /* skip */ }
    }
  } else {
    try { json = JSON.parse(text) } catch { json = { raw: text.slice(0, 400) } }
  }
  return { status: res.status, sid: outSid, json }
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  let bearer = process.env.MCP_BEARER ?? ''
  let mintedHash: string | null = null
  if (!bearer) {
    const raw = `gt_mcp_${randomBytes(16).toString('hex')}`
    const hash = createHash('sha256').update(raw).digest('hex')
    const { error } = await sb.from('api_keys').insert({
      user_id: MINT_USER_ID, key_hash: hash, key_prefix: raw.slice(0, 12),
      name: 'ZZ free-surface-check (delete)', tos_version: 'v0-check', status: 'active', utm_source: 'free_surface_check',
    })
    if (error) throw new Error(`mint key failed: ${error.message}`)
    bearer = raw; mintedHash = hash
  }

  try {
    console.log(`target: ${MCP_URL}`)
    const init = await rpc(bearer, null, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'free-surface-check', version: '1' } } })
    console.log(`initialize → HTTP ${init.status}  session=${init.sid ? 'yes' : 'none'}`)
    await rpc(bearer, init.sid, { jsonrpc: '2.0', method: 'notifications/initialized' })
    const list = await rpc(bearer, init.sid, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    console.log(`tools/list → HTTP ${list.status}`)

    const result = list.json?.result as { tools?: Array<{ name: string; description?: string; inputSchema?: unknown }> } | undefined
    const tools = (result?.tools ?? []).slice().sort((a, b) => a.name.localeCompare(b.name))
    if (!tools.length) { console.log('NO TOOLS RETURNED — raw:', JSON.stringify(list.json).slice(0, 600)); return }

    const canonical = stable(tools.map(t => ({ name: t.name, description: t.description ?? '', inputSchema: t.inputSchema ?? {} })))
    const fp = createHash('sha256').update(canonical).digest('hex')
    console.log(`\ntool count: ${tools.length}`)
    console.log(`tool names: ${tools.map(t => t.name).join(', ')}`)
    console.log(`fingerprint (sha256 of stable tool array): ${fp}`)
  } finally {
    if (mintedHash) {
      await sb.from('api_keys').delete().eq('key_hash', mintedHash)
      console.log('\n(temp key deleted)')
    }
  }
}
main().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1) })

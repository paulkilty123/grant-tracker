// Kill-switch verifier (UNTRACKED — mints a prod OAuth token, flips a flag).
// Proves companion_access is a live, no-redeploy switch: with a companion OAuth
// token, tools/list = 12 → flip companion_access=false on IoI → tools/list = 5
// (routed to the free handler) → flip back true → tools/list = 12. Always
// restores companion_access=true and deletes the token in finally.
//   npx tsx --env-file=.env.local scripts/agent-eval/mcp-killswitch-verify.ts

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

const MCP_URL = 'https://www.granttracker.co.uk/api/mcp/v1/mcp'
const PAUL = 'ee80e7d1-6680-420f-8046-5a5e36a84fe6'
const IOI = 'f1f9c904-ef5a-4591-8c6d-e7d9a1535133'
const CLIENT_ID = 'ed93a6b0-166d-4716-a74c-c53d515eaca0'
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

async function toolCount(bearer: string): Promise<number> {
  const post = async (sid: string | null, body: Record<string, unknown>) => {
    const res = await fetch(MCP_URL, { method: 'POST', headers: {
      Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream', ...(sid ? { 'mcp-session-id': sid } : {}),
    }, body: JSON.stringify(body) })
    const outSid = res.headers.get('mcp-session-id') ?? sid
    const text = await res.text()
    let json: Record<string, unknown> | undefined
    if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
      for (const l of text.split('\n')) if (l.startsWith('data:')) { try { const p = JSON.parse(l.slice(5).trim()); if (p && (p.result || p.error || p.id === body.id)) json = p } catch { /**/ } }
    } else { try { json = JSON.parse(text) } catch { json = undefined } }
    return { sid: outSid, json }
  }
  const init = await post(null, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'killswitch', version: '1' } } })
  await post(init.sid, { jsonrpc: '2.0', method: 'notifications/initialized' })
  const list = await post(init.sid, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
  return ((list.json?.result as { tools?: unknown[] } | undefined)?.tools ?? []).length
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const setCompanion = async (v: boolean) => { await sb.from('organisations').update({ companion_access: v }).eq('id', IOI) }

  const raw = `gt_oat_${randomBytes(32).toString('hex')}`
  await sb.from('oauth_tokens').insert({
    access_token_hash: sha(raw), refresh_token_hash: sha(`gt_ort_${randomBytes(32).toString('hex')}`),
    token_prefix: 'gt_oat_', client_id: CLIENT_ID, user_id: PAUL, scope: 'read', resource: MCP_URL,
    access_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    refresh_expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
  })

  try {
    await setCompanion(true)
    const on1 = await toolCount(raw)
    console.log(`companion_access=true  → ${on1} tools  ${on1 === 12 ? '✓ companion handler' : '✗'}`)

    await setCompanion(false)
    const off = await toolCount(raw)
    console.log(`companion_access=false → ${off} tools  ${off === 5 ? '✓ reverted to FREE handler, no redeploy' : '✗'}`)

    await setCompanion(true)
    const on2 = await toolCount(raw)
    console.log(`companion_access=true  → ${on2} tools  ${on2 === 12 ? '✓ flipped back on' : '✗'}`)

    console.log(`\n${on1 === 12 && off === 5 && on2 === 12 ? '✓ KILL SWITCH PROVEN — instant, no redeploy' : '✗ UNEXPECTED — inspect'}`)
  } finally {
    await setCompanion(true) // always leave companion ON for Paul's test
    await sb.from('oauth_tokens').delete().eq('access_token_hash', sha(raw))
    console.log('(restored companion_access=true; temp token deleted)')
  }
}
main().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1) })

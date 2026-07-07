// Post-deploy verifier (UNTRACKED — mints a prod OAuth token, don't commit).
// Mints a throwaway companion OAuth access token for Paul, then polls the live
// MCP tools/list until it returns 12 tools (5 free + 7 companion) — which only
// the NEW code does, so this both detects the deploy going live and smoke-tests
// the companion surface end-to-end over HTTP. Deletes the token in finally.
//   npx tsx --env-file=.env.local scripts/agent-eval/mcp-companion-verify.ts

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
const CLIENT_ID = 'ed93a6b0-166d-4716-a74c-c53d515eaca0'
const COMPANION = ['get_funding_goal', 'set_funding_goal', 'get_plan_state', 'get_briefing', 'assess_opportunity_against_plan', 'add_to_pipeline', 'update_pipeline_item']
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

async function toolsList(bearer: string): Promise<string[] | { err: string }> {
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
    return { status: res.status, sid: outSid, json, text }
  }
  const init = await post(null, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'companion-verify', version: '1' } } })
  if (init.status === 401) return { err: `401 (${init.text.slice(0, 120)})` }
  await post(init.sid, { jsonrpc: '2.0', method: 'notifications/initialized' })
  const list = await post(init.sid, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
  const tools = (list.json?.result as { tools?: Array<{ name: string }> } | undefined)?.tools
  if (!tools) return { err: `no tools (HTTP ${list.status})` }
  return tools.map(t => t.name).sort()
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  const raw = `gt_oat_${randomBytes(32).toString('hex')}`
  const { error } = await sb.from('oauth_tokens').insert({
    access_token_hash: sha(raw), refresh_token_hash: sha(`gt_ort_${randomBytes(32).toString('hex')}`),
    token_prefix: 'gt_oat_', client_id: CLIENT_ID, user_id: PAUL, scope: 'read',
    resource: MCP_URL,
    access_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    refresh_expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
  })
  if (error) throw new Error(`mint oauth token failed: ${error.message}`)

  try {
    const MAX = 20
    for (let i = 1; i <= MAX; i++) {
      const names = await toolsList(raw)
      if ('err' in names) { console.log(`attempt ${i}/${MAX}: ${names.err}`) }
      else {
        const hasCompanion = COMPANION.filter(c => names.includes(c))
        console.log(`attempt ${i}/${MAX}: ${names.length} tools${hasCompanion.length ? ` (companion: ${hasCompanion.length}/7)` : ''}`)
        if (names.length >= 12 && hasCompanion.length === 7) {
          console.log(`\n✓ NEW CODE LIVE — companion surface serving end-to-end`)
          console.log(`  all tools: ${names.join(', ')}`)
          console.log(`  companion 7: ${hasCompanion.join(', ')}`)
          return
        }
      }
      if (i < MAX) await wait(15000)
    }
    console.log(`\n⚠ still not 12 tools after ${MAX} attempts — Vercel may still be building; re-run.`)
  } finally {
    await sb.from('oauth_tokens').delete().eq('access_token_hash', sha(raw))
    console.log('(temp oauth token deleted)')
  }
}
main().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1) })

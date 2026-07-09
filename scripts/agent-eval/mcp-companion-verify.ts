// Post-deploy verifier — mints a throwaway companion OAuth access token for
// Paul, then polls the live MCP tools/list until it returns 14 tools (5 free
// + 9 companion) — which only the NEW code does, so this both detects the
// deploy going live and smoke-tests the companion surface end-to-end over
// HTTP. Once live, also calls get_funding_goal and asserts the envelope's
// connected_org (§13 item 8 whoami) and as_of (MCP date-grounding) fields are
// present and correct — the MCP-side analogue of the CGK date-bug class.
// Deletes the token in finally.
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
const COMPANION = ['get_funding_goal', 'set_funding_goal', 'recommend_mix', 'update_goal_purposes', 'get_plan_state', 'get_briefing', 'assess_opportunity_against_plan', 'add_to_pipeline', 'update_pipeline_item']
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

async function post(bearer: string, sid: string | null, body: Record<string, unknown>) {
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

async function initSession(bearer: string): Promise<{ sid: string | null; err: string | null }> {
  const init = await post(bearer, null, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'companion-verify', version: '1' } } })
  if (init.status === 401) return { sid: null, err: `401 (${init.text.slice(0, 120)})` }
  await post(bearer, init.sid, { jsonrpc: '2.0', method: 'notifications/initialized' })
  return { sid: init.sid, err: null }
}

async function toolsList(bearer: string): Promise<string[] | { err: string }> {
  const session = await initSession(bearer)
  if (session.err) return { err: session.err }
  const list = await post(bearer, session.sid, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
  const tools = (list.json?.result as { tools?: Array<{ name: string }> } | undefined)?.tools
  if (!tools) return { err: `no tools (HTTP ${list.status})` }
  return tools.map(t => t.name).sort()
}

// Calls get_funding_goal and checks the envelope's connected_org + as_of —
// the two fields added by the whoami + date-grounding build (Phase 0).
async function verifyWhoamiAndDateGrounding(bearer: string, expectedOrgName: string) {
  const session = await initSession(bearer)
  if (session.err) { console.log(`✗ whoami/as_of check: session init failed — ${session.err}`); return false }
  const call = await post(bearer, session.sid, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_funding_goal', arguments: {} } })
  const content = (call.json?.result as { content?: Array<{ type: string; text?: string }> } | undefined)?.content
  const rawText = content?.[0]?.text
  if (!rawText) { console.log(`✗ whoami/as_of check: no tool content (HTTP ${call.status})`); return false }
  let payload: Record<string, unknown>
  try { payload = JSON.parse(rawText) } catch { console.log(`✗ whoami/as_of check: tool content not JSON: ${rawText.slice(0, 200)}`); return false }

  const todayIso = new Date().toISOString().slice(0, 10)
  const org = payload.connected_org
  const asOf = payload.as_of
  const orgOk = org === expectedOrgName
  const dateOk = asOf === todayIso
  console.log(`  connected_org: ${JSON.stringify(org)} ${orgOk ? '✓' : `✗ expected ${JSON.stringify(expectedOrgName)}`}`)
  console.log(`  as_of:         ${JSON.stringify(asOf)} ${dateOk ? '✓' : `✗ expected ${JSON.stringify(todayIso)} (real today, not a training-era guess)`}`)
  return orgOk && dateOk
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  const { data: orgRow, error: orgErr } = await sb.from('organisations').select('name').eq('owner_id', PAUL).eq('companion_access', true).order('created_at', { ascending: true }).limit(1).single()
  if (orgErr || !orgRow) throw new Error(`could not resolve Paul's companion org for the whoami check: ${orgErr?.message}`)
  const expectedOrgName = orgRow.name as string

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
    let live = false
    for (let i = 1; i <= MAX; i++) {
      const names = await toolsList(raw)
      if ('err' in names) { console.log(`attempt ${i}/${MAX}: ${names.err}`) }
      else {
        const hasCompanion = COMPANION.filter(c => names.includes(c))
        console.log(`attempt ${i}/${MAX}: ${names.length} tools${hasCompanion.length ? ` (companion: ${hasCompanion.length}/${COMPANION.length})` : ''}`)
        if (names.length >= 14 && hasCompanion.length === COMPANION.length) {
          console.log(`\n✓ NEW CODE LIVE — companion surface serving end-to-end`)
          console.log(`  all tools: ${names.join(', ')}`)
          console.log(`  companion ${COMPANION.length}: ${hasCompanion.join(', ')}`)
          live = true
          break
        }
      }
      if (i < MAX) await wait(15000)
    }
    if (!live) { console.log(`\n⚠ still not 14 tools after ${MAX} attempts — Vercel may still be building; re-run.`); return }

    console.log(`\nWhoami + date-grounding check (expected org: ${JSON.stringify(expectedOrgName)}):`)
    const ok = await verifyWhoamiAndDateGrounding(raw, expectedOrgName)
    console.log(ok ? '\n✓ whoami + date-grounding PASS' : '\n✗ whoami + date-grounding FAIL')
    if (!ok) process.exitCode = 1
  } finally {
    await sb.from('oauth_tokens').delete().eq('access_token_hash', sha(raw))
    console.log('(temp oauth token deleted)')
  }
}
main().then(() => process.exit(process.exitCode ?? 0)).catch(e => { console.error('FATAL', e); process.exit(1) })

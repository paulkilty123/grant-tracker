// Live check of the MCP entitlement boundary against real data.
//   npx tsx --env-file=.env.local scripts/agent-eval/mcp-entitlement-smoke.ts
//
// Proves resolveOrgAndTier maps a real user_id → { orgId, tier } correctly:
//   - unknown user  → { null, free }
//   - Paul (2 orgs, apply but not companion yet) → oldest apply org, 'apply'
// After companion_access is flagged on one of his orgs it will return
// { that org, 'companion' } — the single switch that turns the test on.

import { readFileSync } from 'fs'
import { resolve } from 'path'
try {
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v
  }
} catch { /* rely on --env-file */ }

async function main() {
  const { resolveOrgAndTier } = await import('../../src/lib/mcp-entitlement')
  const PAUL = 'ee80e7d1-6680-420f-8046-5a5e36a84fe6'

  const unknown = await resolveOrgAndTier('00000000-0000-0000-0000-000000000000')
  const none = await resolveOrgAndTier(null)
  const paul = await resolveOrgAndTier(PAUL)

  console.log('unknown user →', unknown, unknown.tier === 'free' && unknown.orgId === null ? '✓' : '✗')
  console.log('null user    →', none, none.tier === 'free' && none.orgId === null ? '✓' : '✗')
  console.log('paul         →', paul, paul.tier === 'apply' && paul.orgId ? '✓ (apply until companion flagged)' : '✗')
  process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })

// Move the Companion entitlement to exactly ONE test org, so the MCP surface
// (which binds to the oldest companion org owned by the connected user) is
// deterministic for one-archetype-at-a-time testing.
//
//   npx tsx scripts/companion-flag.ts --status          # show current flags + what MCP binds to
//   npx tsx scripts/companion-flag.ts <orgId>           # unflag ALL, then flag ONLY <orgId>
//
// Runs as service_role, which is the only role allowed past
// trg_enforce_companion_access_immutable. Guarded to TEST_OWNER + the same
// test-org allowlist as the reset script, so it can only ever move the flag
// among throwaway test orgs.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import path from 'path'

for (const line of readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const TEST_OWNER = 'ee80e7d1-6680-420f-8046-5a5e36a84fe6' // Paul's account
const ALLOWLIST = new Set([
  '61cc84b1-0154-4107-a69f-2f8bb21b5e9d', // ACC
  'f1f9c904-ef5a-4591-8c6d-e7d9a1535133', // IoI
  '4ef429df-19d0-49b0-9c7b-ccb802b70a6d', // Common Ground Kitchen CIC
  'cb66226d-1ec0-47e1-945d-4ef2d7ee7896', // OpenAccess Digital CIC
])

function fail(msg: string): never { console.error(`\n✗ REFUSED: ${msg}\n`); process.exit(1) }

// Mirrors resolveOrgAndTier (src/lib/mcp-entitlement.ts): highest entitlement
// wins, tie-broken OLDEST. So among companion orgs, the oldest is bound.
async function report() {
  const { data } = await sb.from('organisations')
    .select('id, name, companion_access, apply_access, created_at')
    .eq('owner_id', TEST_OWNER).order('created_at', { ascending: true })
  const orgs = data ?? []
  console.log('\nTEST_OWNER orgs (oldest first):')
  for (const o of orgs) {
    console.log(`  ${o.companion_access ? '★ COMPANION' : '          '}  ${o.apply_access ? 'apply' : '     '}  ${o.name.padEnd(30)} ${o.id}  (${o.created_at.slice(0, 10)})`)
  }
  const boundCompanion = orgs.find(o => o.companion_access)
  const companionCount = orgs.filter(o => o.companion_access).length
  console.log(`\n  companion-flagged: ${companionCount}`)
  console.log(`  → MCP binds to: ${boundCompanion ? `${boundCompanion.name} [${boundCompanion.id}]` : '(none companion → falls back to oldest apply/free org)'}`)
  if (companionCount > 1) console.log(`  ⚠ more than one companion org — MCP silently picks the OLDEST; move to a single flag for deterministic one-at-a-time testing.`)
}

async function main() {
  const arg = process.argv[2]
  if (!arg || arg === '--status') { await report(); return }

  const orgId = arg
  if (!ALLOWLIST.has(orgId)) fail(`org id ${orgId} is not on the test-org allowlist. Refusing to move the entitlement.`)
  const { data: org } = await sb.from('organisations').select('id, name, owner_id').eq('id', orgId).maybeSingle()
  if (!org) fail(`no org with id ${orgId}`)
  if (org.owner_id !== TEST_OWNER) fail(`org ${orgId} is not owned by the test account. Refusing.`)

  // 1. Unflag every companion org owned by the test account.
  const { error: offErr } = await sb.from('organisations')
    .update({ companion_access: false }).eq('owner_id', TEST_OWNER).eq('companion_access', true)
  if (offErr) fail(`unflag step failed: ${offErr.message}`)
  // 2. Flag the target.
  const { error: onErr } = await sb.from('organisations')
    .update({ companion_access: true }).eq('id', orgId)
  if (onErr) fail(`flag step failed: ${onErr.message}`)

  console.log(`\n✓ Companion moved to ${org.name} [${orgId}]. All other test orgs unflagged.`)
  await report()
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })

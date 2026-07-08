// Hard-reset a THROWAWAY test org back to a profile-only state: delete all
// goal-agent + capture state (goals, purposes, pipeline, threads/messages,
// org_facts, agent_runs, capture events) while leaving the organisations row
// (the profile) untouched. Hard delete is acceptable HERE AND ONLY HERE.
//
//   npx tsx scripts/reset-test-org.ts <orgId>                 # dry run (counts only)
//   npx tsx scripts/reset-test-org.ts <orgId> --confirm       # actually delete
//   npx tsx scripts/reset-test-org.ts <orgId> --confirm --add-beneficiaries older_people,carers
//   npx tsx scripts/reset-test-org.ts <orgId> --confirm --events agent   # keep search/activity capture
//
// --events: 'all' (default) wipes every capture event for the org; 'agent'
// deletes ONLY goal-agent/Companion event types (agent_tool_called,
// agent_turn_completed, mix_fallback_fired, mcp_tool_called), preserving the
// search / browse / builder / pipeline-CRM activity history.
//
// TWO INDEPENDENT GUARDS, both must pass, so this can never touch a real
// user's data:
//   1. The org id must be on the explicit ALLOWLIST below (id only — NEVER a
//      name: the DB has same-named orgs owned by different real users, e.g.
//      two "Asian Community Concern" and two "Institute of Imagination").
//   2. The org's owner_id must equal TEST_OWNER.
// It also refuses to delete the organisations row itself.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import path from 'path'

for (const line of readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const TEST_OWNER = 'ee80e7d1-6680-420f-8046-5a5e36a84fe6' // Paul's account

// Explicit test-org allowlist — id → label. Add a new throwaway org's id here
// before you can reset it. Nothing outside this set is resettable.
const ALLOWLIST: Record<string, string> = {
  '61cc84b1-0154-4107-a69f-2f8bb21b5e9d': 'Asian Community Concern (companion test)',
  'f1f9c904-ef5a-4591-8c6d-e7d9a1535133': 'Institute of Imagination (companion test)',
  '4ef429df-19d0-49b0-9c7b-ccb802b70a6d': 'Common Ground Kitchen CIC (Manchester trading SE test)',
  'cb66226d-1ec0-47e1-945d-4ef2d7ee7896': 'OpenAccess Digital CIC (Birmingham venture test)',
}

// State tables: child → parent, all scoped by org_id. FKs make order flexible
// (goals→goal_purposes cascade; pipeline_items.purpose_id→SET NULL) but this
// order is safe and explicit regardless. `events` is handled separately so its
// delete can be scoped by event type (--events).
const STATE_TABLES = ['agent_messages', 'agent_threads', 'pipeline_items', 'goal_purposes', 'goals', 'org_facts', 'agent_runs'] as const

// The goal-agent / Companion event types — the only ones deleted under
// `--events agent`. Everything else (search_executed, results_shown,
// opportunity_*, project_*, builder_*, pipeline_*, profile_updated, …) is the
// activity history that mode preserves.
const AGENT_EVENT_TYPES = ['agent_tool_called', 'agent_turn_completed', 'mix_fallback_fired', 'mcp_tool_called'] as const

function fail(msg: string): never { console.error(`\n✗ REFUSED: ${msg}\n`); process.exit(1) }

function eventsQuery(orgId: string, mode: 'all' | 'agent', head: boolean) {
  let q = sb.from('events').select('*', head ? { count: 'exact', head: true } : { count: 'exact' }).eq('org_id', orgId)
  if (mode === 'agent') q = q.in('event_type', AGENT_EVENT_TYPES as unknown as string[])
  return q
}

async function counts(orgId: string, eventsMode: 'all' | 'agent'): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const t of STATE_TABLES) {
    const { count } = await sb.from(t).select('*', { count: 'exact', head: true }).eq('org_id', orgId)
    out[t] = count ?? 0
  }
  const { count: evCount } = await eventsQuery(orgId, eventsMode, true)
  out[`events(${eventsMode})`] = evCount ?? 0
  return out
}

async function main() {
  const [orgId, ...rest] = process.argv.slice(2)
  const confirm = rest.includes('--confirm')
  const benefArg = rest.find(a => a.startsWith('--add-beneficiaries'))
  const addBeneficiaries = benefArg
    ? (benefArg.includes('=') ? benefArg.split('=')[1] : rest[rest.indexOf(benefArg) + 1] ?? '')
        .split(',').map(s => s.trim()).filter(Boolean)
    : []
  const eventsArg = rest.find(a => a.startsWith('--events'))
  const eventsMode: 'all' | 'agent' =
    (eventsArg ? (eventsArg.includes('=') ? eventsArg.split('=')[1] : rest[rest.indexOf(eventsArg) + 1]) : 'all') === 'agent' ? 'agent' : 'all'

  if (!orgId) fail('usage: reset-test-org.ts <orgId> [--confirm] [--add-beneficiaries a,b] [--events all|agent]')

  // GUARD 1 — allowlist (id only).
  if (!ALLOWLIST[orgId]) fail(`org id ${orgId} is not on the test-org allowlist. Refusing. (Add its id to ALLOWLIST only if it is a throwaway test org.)`)

  // Resolve + GUARD 2 — ownership.
  const { data: org, error } = await sb.from('organisations')
    .select('id, name, owner_id, companion_access, apply_access').eq('id', orgId).maybeSingle()
  if (error) fail(`lookup failed: ${error.message}`)
  if (!org) fail(`no org with id ${orgId}`)
  if (org.owner_id !== TEST_OWNER) fail(`org ${orgId} is owned by ${org.owner_id}, not the test account. Refusing.`)

  console.log(`\nTarget: ${org.name}  [${org.id}]`)
  console.log(`  allowlist label: ${ALLOWLIST[orgId]}`)
  console.log(`  owner verified: ${org.owner_id === TEST_OWNER}`)

  const before = await counts(orgId, eventsMode)
  const rowKeys = [...STATE_TABLES, `events(${eventsMode})`]
  console.log(`\nRows that WILL be deleted (events mode: ${eventsMode}${eventsMode === 'agent' ? ' — keeps search/activity history' : ''}; organisations profile row is NEVER touched):`)
  let total = 0
  for (const k of rowKeys) { console.log(`  ${k.padEnd(18)} ${before[k]}`); total += before[k] }
  console.log(`  ${''.padEnd(18)} ── total ${total}`)
  if (addBeneficiaries.length) console.log(`\nWill also append to beneficiary_groups: ${addBeneficiaries.join(', ')}`)

  if (!confirm) {
    console.log('\nDRY RUN — nothing deleted. Re-run with --confirm to execute.\n')
    return
  }

  console.log('\n--confirm set — deleting…')
  for (const t of STATE_TABLES) {
    const { error: delErr, count } = await sb.from(t).delete({ count: 'exact' }).eq('org_id', orgId)
    if (delErr) fail(`delete from ${t} failed: ${delErr.message} (partial reset — inspect before retrying)`)
    console.log(`  ${t.padEnd(18)} deleted ${count ?? 0}`)
  }
  {
    let del = sb.from('events').delete({ count: 'exact' }).eq('org_id', orgId)
    if (eventsMode === 'agent') del = del.in('event_type', AGENT_EVENT_TYPES as unknown as string[])
    const { error: delErr, count } = await del
    if (delErr) fail(`delete from events failed: ${delErr.message} (partial reset — inspect before retrying)`)
    console.log(`  ${`events(${eventsMode})`.padEnd(18)} deleted ${count ?? 0}`)
  }

  if (addBeneficiaries.length) {
    const { data: cur } = await sb.from('organisations').select('beneficiary_groups').eq('id', orgId).single()
    const merged = Array.from(new Set([...(cur?.beneficiary_groups ?? []), ...addBeneficiaries]))
    const { error: upErr } = await sb.from('organisations').update({ beneficiary_groups: merged }).eq('id', orgId)
    if (upErr) fail(`beneficiary update failed: ${upErr.message}`)
    console.log(`\n  beneficiary_groups → ${JSON.stringify(merged)}`)
  }

  const after = await counts(orgId, eventsMode)
  const remaining = rowKeys.reduce((s, k) => s + after[k], 0)
  console.log(`\n✓ reset complete — ${remaining} targeted rows remain (expected 0). Profile row intact${eventsMode === 'agent' ? '; non-agent capture history preserved' : ''}.\n`)
}
main().then(() => process.exit(process.exitCode ?? 0)).catch(e => { console.error(e); process.exit(1) })

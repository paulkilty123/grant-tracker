/**
 * Withdraw three National Lottery Community Fund rows that stand in for funds
 * already catalogued individually.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SPLIT WAS ALREADY DONE. DEDUP FOUND IT; STAGING WOULD NOT HAVE.
 *
 * These three carried a `multiple_funds` verdict and were cleared for splitting.
 * Checking the catalogue before staging anything, all twelve programmes the
 * three nation pages list are ALREADY live rows of their own:
 *
 *   Scotland  Awards for All Scotland · Community Action · Young Start Main
 *             Grants · Strengthening Organisations
 *   Wales     Awards for All Wales · People and Places · Supporting Great Ideas
 *             (Meithrin Natur is closed and absent, correctly)
 *   N Ireland Awards for All NI · Strengthening Communities · Dormant Assets for
 *             All · Climate Action Fund Food Systems
 *
 * NLCF has around twenty live programme rows. So these three are not generic
 * entries awaiting a split — they are duplicates ON TOP of a funder that was
 * split long ago, each spanning £300 to £500,000 and matching almost any query
 * a user could run. Staging the split would have created twelve duplicates.
 *
 * `is_active: false` ALONE, so transitionPipelineState sends them to `captured`
 * — withdrawn for review, not archived. Coverage is unaffected: every fund they
 * stood in for stays live under its own row.
 *
 * Run:  npx tsx scripts/withdraw-nlcf-generics-2026-08-17.ts [--apply]
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const APPLY  = process.argv.includes('--apply')
const SOURCE = 'system:nlcf_generic_withdraw_2026-08-17'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const ROWS = [
  { id: '551d5f3a-6068-41b6-885e-19cf6a58da18', title: 'NLCF — Northern Ireland',
    covered: ['Awards for All NI', 'Strengthening Communities', 'Dormant Assets for All', 'Climate Action Fund Food Systems'] },
  { id: 'c88b0b0d-1a99-43a5-b9bf-e381eaebf824', title: 'NLCF — Scotland',
    covered: ['Awards for All Scotland', 'Community Action', 'Young Start Main Grants', 'Strengthening Organisations'] },
  { id: 'd502db74-61eb-4ae3-84c2-41b3c506dd53', title: 'NLCF — Wales',
    covered: ['Awards for All Wales', 'People and Places', 'Supporting Great Ideas'] },
]

async function main() {
  const record: unknown[] = []
  let ok = 0
  for (const r of ROWS) {
    const { data: before } = await db.from('scraped_grants')
      .select('title, is_active, pipeline_state').eq('id', r.id).single()
    console.log(`\n${r.title}`)
    console.log(`   already live as their own rows: ${r.covered.join(', ')}`)
    console.log(`   now ${JSON.stringify(before)} -> withdrawn for review`)
    if (!APPLY) continue
    const res = await mergeGrantUpdate({ id: r.id, fields: { is_active: false }, source: SOURCE, pinned: false, db })
    const { data: after } = await db.from('scraped_grants')
      .select('is_active, pipeline_state').eq('id', r.id).single()
    const landed = after?.is_active === false
    if (landed) ok++
    record.push({ ...r, before, after, applied: res.applied, ok: landed })
  }
  if (!APPLY) { console.log('\nNothing written. Re-run with --apply.'); return }
  writeFileSync(resolve(HERE, '..', 'reports', 'nlcf-generic-withdraw-2026-08-17.json'),
    JSON.stringify({ ranAt: new Date().toISOString(), source: SOURCE, ok, record }, null, 2))
  console.log(`\nWITHDRAWN ${ok} of ${ROWS.length}`)
}

main().catch(e => { console.error(e); process.exit(1) })

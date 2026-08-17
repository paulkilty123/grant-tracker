/**
 * HCF Grants: a deadline seven days out on a card that says "apply any time".
 *
 * Separate from `timing-fixes-2026-08-17.ts` because this row needed something
 * the others did not — overriding a pin, and then removing it.
 *
 * `is_rolling` on this row was set to true and PINNED by Paul on 2026-07-08.
 * The trust ladder refused the correction, which is the ladder working: it is
 * there to stop a job overwriting a human decision. His instruction of
 * 2026-08-17 supersedes it, because the page has since published dates the July
 * reading did not have:
 *
 *   "Autumn 2026 Round: Now open. Deadline 5pm 24th August 2026.
 *    Winter 2026/27 Round: Opening 25th August 2026. Deadline 5pm 11th January 2027."
 *
 * So the write goes in as `admin:`, which is the only source that clears a pin.
 *
 * THEN THE PIN IS REMOVED AGAIN, and that is the point of the script. An
 * `admin:` write auto-pins whatever it touches, and a round deadline is the one
 * value that must stay correctable — this one is stale on 25 August, when the
 * Winter round opens. Leaving it pinned would trade a wrong date today for a
 * frozen wrong date for ever. Precedent: the same strip was done to the
 * 2026-07-09 Scotland batch so `ai_enrich` could write again.
 *
 * Run:  npx tsx scripts/fix-hcf-deadline-2026-08-17.ts [--apply]
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const APPLY = process.argv.includes('--apply')
const ID    = 'e0a27a78-3cfd-44e3-aebf-59d41d576894'
const db    = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const { data: before } = await db.from('scraped_grants')
    .select('title, is_rolling, deadline, field_provenance').eq('id', ID).single()
  console.log('before:', JSON.stringify({
    title: before?.title, is_rolling: before?.is_rolling, deadline: before?.deadline,
    rolling_prov: (before?.field_provenance as Record<string, unknown>)?.['is_rolling'],
  }, null, 1))
  if (!APPLY) { console.log('\nNothing written. Re-run with --apply.'); return }

  const res = await mergeGrantUpdate({
    id: ID, fields: { deadline: '2026-08-24', is_rolling: false },
    source: 'admin:paulkilty1@gmail.com', db,
  })
  console.log('applied:', res.applied, '| rejected:', JSON.stringify(res.rejected))

  const { data: mid } = await db.from('scraped_grants')
    .select('field_provenance').eq('id', ID).single()
  const fp = (mid?.field_provenance ?? {}) as Record<string, Record<string, unknown>>
  for (const f of ['deadline', 'is_rolling']) if (fp[f]) fp[f].pinned = false
  const { error } = await db.from('scraped_grants').update({ field_provenance: fp }).eq('id', ID)
  if (error) throw new Error(`unpin failed: ${error.message}`)

  const { data: after } = await db.from('scraped_grants')
    .select('title, is_rolling, deadline, field_provenance').eq('id', ID).single()
  console.log('after:', JSON.stringify({
    is_rolling: after?.is_rolling, deadline: after?.deadline,
    rolling_prov: (after?.field_provenance as Record<string, unknown>)?.['is_rolling'],
  }, null, 1))
}

main().catch(e => { console.error(e); process.exit(1) })

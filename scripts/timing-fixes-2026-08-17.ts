/**
 * The five timing rows Paul cleared for immediate fixing, 2026-08-17.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE URGENT, FOUR CONTRADICTORY
 *
 * HCF Grants says "Rolling, apply any time" on a round whose deadline is 5pm on
 * 24 August 2026 — seven days out when this was written. A fundraiser reading
 * that card has no reason to hurry and would miss it.
 *
 * The other four are a different fault than the one I first reported. I called
 * them "not flagged invite-only". They ARE flagged invite-only, all four, and
 * have been. They are ALSO flagged rolling, so the card says apply any time for
 * a funder whose own page says it does not accept applications at all:
 *
 *   "WE DO NOT ACCEPT UNSOLICITED APPLICATIONS"          Sainsbury
 *   "does not accept unsolicited enquires or applications" Linbury
 *   "does not generally accept unsolicited applications"   Aurora
 *   "a proactive grant process"                            Mark Leonard
 *
 * So the fix is unsetting `is_rolling`, not setting `is_invite_only`. Two flags
 * that contradict each other, and the wrong one was the one I proposed to touch.
 *
 * SOURCE is `ai_audit:timing_fix:v1` (trust 60) rather than `admin:`, and that
 * is deliberate even though Paul decided it. An `admin:` source auto-pins, and
 * invite-only status and round dates are exactly the facts that change when a
 * funder reopens. Pinning them would freeze today's reading against every future
 * correction. The decision was human; the value came off the page.
 *
 * Run:  npx tsx scripts/timing-fixes-2026-08-17.ts [--apply]
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
const SOURCE = 'ai_audit:timing_fix:v1'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const FIXES: { id: string; title: string; fields: Record<string, unknown>; quote: string }[] = [
  {
    id: 'e0a27a78-3cfd-44e3-aebf-59d41d576894', title: 'HCF Grants',
    fields: { deadline: '2026-08-24', is_rolling: false },
    quote: 'Autumn 2026 Round: Now open. Deadline 5pm 24th August 2026.',
  },
  {
    id: '05d6dbdf-d370-4d34-9a5b-80540e3b06fa', title: 'The Alan and Babette Sainsbury Charitable Fund',
    fields: { is_rolling: false },
    quote: 'WE DO NOT ACCEPT UNSOLICITED APPLICATIONS',
  },
  {
    id: 'e2b9494b-b4af-4e29-9843-df8a3980aa3c', title: 'Aurora Trust',
    fields: { is_rolling: false },
    quote: 'The Aurora Trust does not generally accept unsolicited applications.',
  },
  {
    id: 'b9dd4a92-ace3-4223-8190-7d8e949537d2', title: 'The Linbury Trust',
    fields: { is_rolling: false },
    quote: 'The Linbury Trust does not accept unsolicited enquires or applications.',
  },
  {
    id: '4317a983-3349-41ac-ade4-367dbec4b59b', title: 'The Mark Leonard Trust',
    fields: { is_rolling: false },
    quote: 'The Trust has a proactive grant process and does not accept unsolicited applications.',
  },
]

async function main() {
  const record: unknown[] = []
  let ok = 0
  const refused: string[] = []

  for (const f of FIXES) {
    const { data: before } = await db.from('scraped_grants')
      .select('title, is_rolling, deadline, is_invite_only').eq('id', f.id).single()
    console.log(`\n${f.title}`)
    console.log(`   page: "${f.quote}"`)
    console.log(`   now:  ${JSON.stringify(before)}`)
    console.log(`   ->    ${JSON.stringify(f.fields)}`)
    if (!APPLY) continue

    let applied: string[] = []
    let rejected: unknown[] = []
    let err: string | null = null
    try {
      const res = await mergeGrantUpdate({ id: f.id, fields: f.fields, source: SOURCE, pinned: false, db })
      applied = res.applied; rejected = res.rejected
    } catch (e) { err = e instanceof Error ? e.message : String(e) }

    // Never assume it landed.
    const missed = Object.keys(f.fields).filter(k => !applied.includes(k))
    const landed = !err && missed.length === 0
    if (landed) ok++; else refused.push(`${f.title}: ${err ?? `refused ${missed.join(', ')}`}`)
    record.push({ ...f, before, applied, rejected, error: err, ok: landed })
  }

  if (!APPLY) { console.log('\nNothing written. Re-run with --apply.'); return }
  writeFileSync(resolve(HERE, '..', 'reports', 'timing-fixes-2026-08-17.json'),
    JSON.stringify({ ranAt: new Date().toISOString(), source: SOURCE, ok, record }, null, 2))
  console.log(`\nFIXED ${ok} of ${FIXES.length}`)
  if (refused.length) for (const r of refused) console.log(`   REFUSED ${r}`)
}

main().catch(e => { console.error(e); process.exit(1) })

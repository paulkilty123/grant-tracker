/**
 * Put back two URLs the hop got wrong, and record why.
 *
 * Both cleared every condition the hop enforces and are still regressions:
 *
 *   Pilotlight 360        moved FROM /charities/apply-for-support — the correct
 *                         apply page — TO /become-a-pilotlighter, which recruits
 *                         VOLUNTEERS. Right funder, right words, wrong audience.
 *
 *   Julia Rausing Trust   moved from the homepage to a NEWS POST about "Julia
 *   — Grants              Rausing Sky Arts Bursaries", a different fund.
 *                         `namesMatch` strips generic words, so our title
 *                         reduces to "julia rausing", which is a substring of
 *                         every fund that funder runs.
 *
 * The second is the more serious: `namesMatch` was written to ask "is the fund
 * we hold described on this page", where the candidate name came from the same
 * page we were already reading. Using it to ACCEPT a page found by link-scoring
 * lets a sibling fund satisfy it, and for any row whose title reduces to the
 * funder's own name that is every page on the site.
 *
 * Run:  npx tsx scripts/revert-url-hop-regressions.ts [--apply]
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

const APPLY = process.argv.includes('--apply')
const SOURCE = 'ai_audit:url_hop_revert:v1'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const REVERTS = [
  { title: 'Pilotlight 360',
    to: 'https://www.pilotlight.org.uk/charities/apply-for-support',
    why: 'the hop replaced the correct apply page with a volunteer recruitment page' },
  { title: 'The Julia Rausing Trust — Grants',
    to: 'https://juliarausingtrust.org/',
    why: 'the hop matched a news post about a different fund, Julia Rausing Sky Arts Bursaries' },
]

async function main() {
  const record: unknown[] = []
  for (const r of REVERTS) {
    const { data } = await db.from('scraped_grants')
      .select('id, title, apply_url').eq('title', r.title).eq('is_active', true).single()
    if (!data) { console.log(`NOT FOUND ${r.title}`); continue }
    console.log(`${r.title}\n   now: ${data.apply_url}\n   ->   ${r.to}\n   ${r.why}\n`)
    if (!APPLY) continue
    const res = await mergeGrantUpdate({ id: data.id, fields: { apply_url: r.to }, source: SOURCE, pinned: false, db })
    const ok = res.applied.includes('apply_url')
    console.log(`   ${ok ? 'reverted' : 'REFUSED'}`)
    record.push({ ...r, id: data.id, wrongUrl: data.apply_url, applied: res.applied, ok })
  }
  if (!APPLY) { console.log('Nothing written. Re-run with --apply.'); return }
  writeFileSync(resolve(HERE, '..', 'reports', 'url-hop-reverts-2026-08-17.json'),
    JSON.stringify({ ranAt: new Date().toISOString(), record }, null, 2))
}

main().catch(e => { console.error(e); process.exit(1) })

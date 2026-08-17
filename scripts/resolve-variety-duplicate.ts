/**
 * Resolve the Variety duplicate before either of its rows is split.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT IS A FUNDER-NAMING PROBLEM, NOT TWO FUNDERS
 *
 * Both rows are variety.org.uk — the same charity — under two funder strings:
 *
 *   "Variety Club"                  /how-can-we-help/equipment-grants-for-children/
 *                                   a SPECIFIC fund. Amount up to £5,000,
 *                                   deadline 2026-09-01.
 *   "Variety, the Children's Charity" /grants/
 *                                   the UMBRELLA index page. £500–£20,000, rolling.
 *
 * Because the funder strings differ, the fund-count pass treated them as two
 * unrelated funders and counted their overlapping programmes twice — 7 against
 * one and 2 against the other, with equipment and wheelchair grants appearing in
 * both. Splitting both would have created that overlap as real rows.
 *
 * The fix is to normalise the funder string so there is one funder with an
 * umbrella row and one fund row beneath it. Nothing is merged or deleted here:
 * the equipment-grants row is a genuine fund and keeps its own page, its amount
 * and its deadline. What changes is that the catalogue now knows they belong to
 * the same funder, so the split can add only what is missing.
 *
 * "Variety, the Children's Charity" is the charity's own registered name and is
 * the surviving string. "Variety Club" is the older informal one.
 *
 * Run:  npx tsx scripts/resolve-variety-duplicate.ts [--apply]
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
const SOURCE = 'system:variety_dedup_2026-08-17'
const CANONICAL = "Variety, the Children's Charity"
const FUND_ROW = 'd7358629-ddba-41f5-b8db-669e5b1dc23e'   // Variety Club - Equipment Grants

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const { data: before } = await db.from('scraped_grants')
    .select('id, title, funder, apply_url, amount_max, deadline').eq('id', FUND_ROW).single()
  console.log('the specific fund row:')
  console.log(' ', JSON.stringify(before, null, 1))
  console.log(`\n  funder "${before?.funder}" -> "${CANONICAL}"`)
  console.log('  the umbrella row (/grants/) is left alone; it is the one to split.')
  if (!APPLY) { console.log('\nNothing written. Re-run with --apply.'); return }

  const res = await mergeGrantUpdate({ id: FUND_ROW, fields: { funder: CANONICAL }, source: SOURCE, pinned: false, db })
  const ok = res.applied.includes('funder')
  const { data: after } = await db.from('scraped_grants')
    .select('id, title, funder').eq('id', FUND_ROW).single()
  console.log(`\n${ok ? 'applied' : 'REFUSED'}:`, JSON.stringify(after))
  if (!ok) console.log('rejected:', JSON.stringify(res.rejected))

  writeFileSync(resolve(HERE, '..', 'reports', 'variety-dedup-2026-08-17.json'),
    JSON.stringify({ ranAt: new Date().toISOString(), source: SOURCE, before, after, applied: res.applied, ok }, null, 2))
}

main().catch(e => { console.error(e); process.exit(1) })

// Re-evaluate every stored amount flag against the CURRENT row and the CURRENT
// extractor.
//
//   npx tsx scripts/rederive-amount-flags-2026-08-18.ts            # dry run
//   npx tsx scripts/rederive-amount-flags-2026-08-18.ts --apply    # write
//
// ── WHY ──
// Two independent faults put warnings on rows that do not deserve them.
//
// 1. NOTHING CLEARS A FLAG WHEN THE VALUE IS FIXED. Football Foundation's Grass
//    Pitch Maintenance Fund warns "the amount may be the whole fund" while
//    disagreeing with itself: stored £3,200, derived £3,200. Lloyds Specialist
//    (£200,000 vs £200,000) and Oxfordshire Thriving in Nature (£500,000 vs
//    £500,000) are the same. Each was corrected by hand and the flag stayed
//    behind, describing a conflict that no longer exists.
//
// 2. `amount_under_stated` READ FUND TOTALS AS PER-APPLICANT CEILINGS. It fired
//    whenever the derived figure was 2x the stored one, and the derived figure
//    is the largest number surviving a deny-list of pool phrasings — so any pot
//    whose wording was not on the list won by being the biggest number present.
//    Access £5,000,000, Co-op Belong £7,000,000, City Bridge £22,000,000, MRC
//    Equip £14,000,000, Asda £1,255,314. `max_cued` now gates that branch.
//
// Both matter beyond tidiness: `amount_pot_suspected` BLOCKS publication in
// publish-gate.ts, and a warning that is usually wrong is a warning a reviewer
// learns to skip — which costs the ones that are right.
//
// ── METHOD ──
// No second implementation. Rebuilds the award text exactly as enrich-grant
// does (typical_award, what_they_fund, description, title) and re-runs
// extractGrantAmounts, then applies the same CONFLICT_RATIO test. A flag
// survives only if the current code would raise it again on the current row.
//
// Purely local: no model call, no page fetch, no API spend.
//
// ── WHAT IT WILL NOT DO ──
// Change a single amount. It only adds, keeps or drops the WARNING, and attaches
// the derived figure so the review card can offer it in one press. Deciding the
// number stays with a human, which is the whole point of the gap-fill policy.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAwardText, extractGrantAmounts } from '../src/lib/grant-amounts'
import type { GrantFlag } from '../src/lib/grant-flags'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const APPLY = process.argv.includes('--apply')
const CONFLICT_RATIO = 2
const AMOUNT_CODES = new Set(['amount_pot_suspected', 'amount_under_stated'])

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

type Row = {
  id: string; title: string; funder: string | null; is_active: boolean
  amount_min: number | null; amount_max: number | null
  description: string | null
  funder_brief: Record<string, unknown> | null
  raw_data: Record<string, unknown> | null
}

const money = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `£${n.toLocaleString('en-GB')}`

async function main() {
  const { data, error } = await db
    .from('scraped_grants')
    .select('id, title, funder, is_active, amount_min, amount_max, description, funder_brief, raw_data')
    .not('raw_data->checks', 'is', null)
  if (error) throw error

  const rows = (data ?? []) as Row[]
  const flagged = rows.filter(r => {
    const checks = (r.raw_data?.checks ?? []) as GrantFlag[]
    return Array.isArray(checks) && checks.some(c => AMOUNT_CODES.has(c.code))
  })

  // A count, echoed, before any conclusion is drawn from the loop. A loop that
  // silently iterated zero times reports "nothing wrong" just as confidently as
  // one that checked everything.
  console.log(`rows carrying an amount flag: ${flagged.length}`)
  if (flagged.length === 0) return

  let kept = 0, dropped = 0, changed = 0
  const lines: string[] = []

  for (const r of flagged) {
    const brief = (r.funder_brief ?? {}) as Record<string, unknown>
    const amounts = extractGrantAmounts(buildAwardText([
      typeof brief.typical_award  === 'string' ? brief.typical_award  : null,
      typeof brief.what_they_fund === 'string' ? brief.what_they_fund : null,
      r.description,
      r.title,
    ]))

    const existingMax = typeof r.amount_max === 'number' ? r.amount_max : null
    const checks = ((r.raw_data?.checks ?? []) as GrantFlag[]).filter(Boolean)
    const others = checks.filter(c => !AMOUNT_CODES.has(c.code))
    const priorAmount = checks.filter(c => AMOUNT_CODES.has(c.code))

    // Re-raise from scratch, with exactly the rule enrich-grant now applies.
    const next: GrantFlag[] = []
    if (amounts.amount_max !== null && existingMax !== null && existingMax > 0) {
      const potRatio = existingMax / amounts.amount_max
      const at = priorAmount[0]?.at ?? new Date().toISOString()
      if (potRatio >= CONFLICT_RATIO) {
        next.push({
          code: 'amount_pot_suspected',
          detail: `stored amount_max ${money(existingMax)} is ${potRatio.toFixed(1)}x the per-applicant figure derived from the text (${money(amounts.amount_max)}) — the stored value may be the whole fund's pot rather than one applicant's cap`,
          source: priorAmount[0]?.source ?? 'admin:rederive-amount-flags-2026-08-18',
          at,
          suggested: { amount_max: amounts.amount_max, amount_min: amounts.amount_min },
        })
      } else if (amounts.max_cued && amounts.amount_max / existingMax >= CONFLICT_RATIO) {
        next.push({
          code: 'amount_under_stated',
          detail: `text suggests a per-applicant ceiling of ${money(amounts.amount_max)}, ${(amounts.amount_max / existingMax).toFixed(1)}x the stored amount_max of ${money(existingMax)}`,
          source: priorAmount[0]?.source ?? 'admin:rederive-amount-flags-2026-08-18',
          at,
          suggested: { amount_max: amounts.amount_max, amount_min: amounts.amount_min },
        })
      }
    }

    const was = priorAmount.map(c => c.code).sort().join(',')
    const now = next.map(c => c.code).sort().join(',')
    const live = r.is_active ? 'LIVE' : '    '

    if (was === now && now !== '') {
      kept++
      // Same verdict, but the figure is now attached where a button can reach it.
      changed++
      lines.push(`${live} KEEP  ${r.funder} — ${r.title}: ${now}, suggests ${money(amounts.amount_max)}`)
    } else if (now === '') {
      dropped++
      const why = amounts.amount_max === null ? 'no figure derivable now'
        : !amounts.max_cued && existingMax !== null && amounts.amount_max > existingMax
          ? `derived ${money(amounts.amount_max)} is uncued — reads as a fund total, not a per-applicant cap`
          : `derived ${money(amounts.amount_max)} no longer disagrees with stored ${money(existingMax)}`
      lines.push(`${live} DROP  ${r.funder} — ${r.title}: was ${was} — ${why}`)
    } else {
      changed++
      lines.push(`${live} SWAP  ${r.funder} — ${r.title}: ${was || 'none'} -> ${now}`)
    }

    if (APPLY) {
      const raw = { ...(r.raw_data ?? {}), checks: [...others, ...next] }
      const { error: upErr } = await db.from('scraped_grants').update({ raw_data: raw }).eq('id', r.id)
      if (upErr) { console.error(`  FAILED ${r.id}: ${upErr.message}`); continue }
    }
  }

  lines.sort()
  for (const l of lines) console.log(l)
  console.log(`\nkept ${kept}, dropped ${dropped}, rewritten-with-figure ${changed}`)
  console.log(APPLY ? 'WRITTEN' : 'dry run — nothing written. Re-run with --apply')
}

main().catch(e => { console.error(e); process.exit(1) })

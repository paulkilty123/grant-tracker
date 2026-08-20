// Read the funder's page for every live row whose amount was written by a
// SCRAPER, and take the figure off where the funder never published it.
//
// WHY THIS SUBSET. The 40-row sample on 20 August fired on 6 rows, and every one
// inspected had its amount written by a third-party directory scraper rather
// than by the funder or a person: `scraper:young_camden_foundation` on three,
// `scraper:community_works_2026-05-06` on the fourth. 151 live rows are in that
// shape. Sweeping them is roughly a third of the cost of sweeping all 498 and
// targets where invented figures actually come from.
//
// WHY NOT WAIT FOR THE CRON. Because it will not get there soon. verify-rows
// reads 60 rows a day, once a day, and only rows that are DUE: 0 are due now, 12
// within a week, 398 within 30 days and 205 later than that. "Free but a month
// away" was the wrong answer for a hundred wrong figures sitting on live cards.
//
// WHAT CLEARING MEANS. `amount_min` and `amount_max` drive the card AND the
// matcher's grant-size dimension. A figure nobody published is not merely
// decoration — it sizes an organisation against a number that does not exist. A
// card with no amount is an honest, already-supported state (`no_amount` is
// informational, not blocking). The old value is not lost: it goes into the
// brief as an unconfirmed third-party figure, with its source named.
//
//   npx tsx --env-file=.env.local scripts/sweep-scraper-amounts-2026-08-20.ts          # measure only
//   npx tsx --env-file=.env.local scripts/sweep-scraper-amounts-2026-08-20.ts --apply  # and clear
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { writeFileSync } from 'fs'
import { verifyRow, type VerifyRow } from '../src/lib/verification/verify-row'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { AMOUNT_UNSUPPORTED_NOTE } from '../src/lib/field-evidence'

const APPLY = process.argv.includes('--apply')
/** Clear from the saved report instead of re-reading 151 pages. The measurement
 *  run already cost the fetches; doing them twice to write the same answer is
 *  money for nothing. */
const FROM_REPORT = process.argv.includes('--from-report')
const CONCURRENCY = 3
const SOURCE = 'user_verified:amount-unsupported-sweep-2026-08-20'
const OUT = 'reports/scraper-amount-sweep-2026-08-20.json'

const COLS = 'id, title, funder, funding_type, apply_url, deadline, deadline_cycle, is_rolling, '
  + 'amount_min, amount_max, max_org_income, min_org_income, is_invite_only, eligible_structures, '
  + 'location_tag, funder_brief, field_provenance'

type Row = VerifyRow & {
  amount_min: number | null; amount_max: number | null
  funder_brief: Record<string, unknown> | null
  field_provenance: Record<string, { source?: string }> | null
}

type Fire = { id: string; title: string; had: [number | null, number | null]; src: string }

/** Clear one row's unsupported amount, keeping the old figure in the brief. */
async function clearAmount(
  // Typed loosely on purpose: supabase-js's generic client type does not unify
  // with the one mergeGrantUpdate expects, and threading the generics through a
  // one-off script buys nothing.
  db: Parameters<typeof mergeGrantUpdate>[0]['db'],
  f: Fire,
  brief: Record<string, unknown>,
): Promise<{ ok: boolean; note: string }> {
  const shown = [f.had[0], f.had[1]].filter((n): n is number => n !== null)
    .map(n => `£${n.toLocaleString('en-GB')}`).join(' to ')
  const note =
    `A scraped listing (${f.src}) gave ${shown || 'an amount'} for this fund. The funder's own page, read on `
    + `2026-08-20, states no figure for a single applicant, so the amount has been removed from the card rather `
    + `than presented as the funder's. It is recorded here so nothing is lost.`
  const r = await mergeGrantUpdate({
    id: f.id,
    fields: { amount_min: null, amount_max: null, funder_brief: { ...brief, amount_note: note } },
    source: SOURCE,
    db,
    citations: {
      amount_min: { snippet: note, confidence: 'high' },
      amount_max: { snippet: note, confidence: 'high' },
      funder_brief: { snippet: note, confidence: 'high' },
    },
  })
  const ok = r.applied.includes('amount_max') || r.applied.includes('amount_min')
  return { ok, note: r.rejected?.length ? r.rejected.map(x => `${x.field} (${x.reason})`).join('; ') : '' }
}

async function applyFromReport() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { readFileSync } = await import('fs')
  const report = JSON.parse(readFileSync(OUT, 'utf8')) as { fires: Fire[] }
  console.log(`clearing ${report.fires.length} rows from ${OUT}\n`)

  let cleared = 0, refused = 0
  for (const f of report.fires) {
    const { data } = await db.from('scraped_grants').select('funder_brief').eq('id', f.id).limit(1)
    if (!data?.length) { console.log(`  NOT FOUND ${f.title}`); continue }
    const res = await clearAmount(db, f, (data[0].funder_brief ?? {}) as Record<string, unknown>)
    if (res.ok) cleared++
    else { refused++; console.log(`  REFUSED ${f.title}: ${res.note || 'no amount field applied'}`) }
  }
  console.log(`\ncleared: ${cleared}   refused: ${refused}`)

  // The floor, after the write.
  const { data: after } = await db.from('scraped_grants')
    .select('title, amount_min, amount_max').in('id', report.fires.map(f => f.id))
  const still = (after ?? []).filter(r => r.amount_min !== null || r.amount_max !== null)
  console.log(`rows still showing an unsupported amount: ${still.length}`)
  for (const r of still) console.log(`  ${r.title}`)
}

async function main() {
  if (FROM_REPORT) { await applyFromReport(); return }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  // Paged, because the 1000-row cap has already caused one silent half-read here.
  const all: Row[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await db.from('scraped_grants').select(COLS)
      .eq('is_active', true).eq('pipeline_state', 'published')
      .not('apply_url', 'is', null)
      .or('amount_min.not.is.null,amount_max.not.is.null')
      .range(from, from + 499)
    if (error) { console.error('query failed:', error.message); process.exit(1) }
    all.push(...((data ?? []) as unknown as Row[]))
    if (!data || data.length < 500) break
  }

  const scraperSourced = all.filter(r => {
    const src = r.field_provenance?.amount_max?.source ?? r.field_provenance?.amount_min?.source ?? ''
    return src.startsWith('scraper:')
  })
  console.log(`live rows asserting an amount : ${all.length}`)
  console.log(`of those, written by a scraper: ${scraperSourced.length}`)
  console.log(`mode: ${APPLY ? 'MEASURE AND CLEAR' : 'measure only'}   concurrency ${CONCURRENCY}\n`)

  type Hit = { id: string; title: string; had: [number | null, number | null]; src: string; outcome: string }
  const fires: Hit[] = []
  const confirmedRows: string[] = []
  const contradicted: { title: string; field: string; from: unknown; to: unknown; quote: string }[] = []
  const unreadable: string[] = []
  let done = 0

  const queue = [...scraperSourced]
  const worker = async () => {
    for (;;) {
      const row = queue.shift()
      if (!row) return
      try {
        const res = await verifyRow(row, anthropic)
        const stamps = res.evidence.filter(e => e.field === 'amount_min' || e.field === 'amount_max')
        const confirmed = stamps.some(e => e.agrees === true)
        const noted = stamps.some(e => e.note === AMOUNT_UNSUPPORTED_NOTE)
        for (const p of res.proposals.filter(x => x.field === 'amount_min' || x.field === 'amount_max')) {
          contradicted.push({ title: row.title, field: p.field, from: p.from, to: p.to, quote: String(p.quote).slice(0, 140) })
        }
        if (res.outcome !== 'verified') unreadable.push(`${row.title} (${res.outcome})`)
        else if (confirmed) confirmedRows.push(row.title)
        else if (noted) {
          fires.push({
            id: row.id, title: row.title, had: [row.amount_min, row.amount_max],
            src: row.field_provenance?.amount_max?.source ?? row.field_provenance?.amount_min?.source ?? '',
            outcome: res.outcome,
          })
        }
      } catch (e) {
        unreadable.push(`${row.title} (ERROR ${(e as Error).message.slice(0, 40)})`)
      }
      done++
      if (done % 20 === 0) console.log(`  ${done}/${scraperSourced.length}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  console.log(`\n── ${scraperSourced.length} scraper-sourced rows read`)
  console.log(`   page confirms our figure   : ${confirmedRows.length}`)
  console.log(`   page states a different one: ${contradicted.length} proposals`)
  console.log(`   page states NO figure      : ${fires.length}`)
  console.log(`   could not be read          : ${unreadable.length}  (untouched)`)

  writeFileSync(OUT, JSON.stringify({ scanned: scraperSourced.length, fires, contradicted, unreadable }, null, 2))
  console.log(`\nwritten: ${OUT}`)

  if (!APPLY) { console.log('\nMEASURE ONLY — nothing written. Re-run with --apply to clear.\n'); return }

  // ── Clear, preserving what was there ──
  let cleared = 0, refused = 0
  for (const f of fires) {
    const row = scraperSourced.find(r => r.id === f.id)!
    const brief = { ...((row.funder_brief ?? {}) as Record<string, unknown>) }
    const shown = [f.had[0], f.had[1]].filter((n): n is number => n !== null)
      .map(n => `£${n.toLocaleString('en-GB')}`).join(' to ')
    brief.amount_note =
      `A third-party listing (${f.src}) gave ${shown || 'an amount'} for this fund. `
      + `The funder's own page, read on 2026-08-20, states no figure for a single applicant, so the amount has been `
      + `removed from the card rather than presented as the funder's. Ask the funder what they typically award.`

    const r = await mergeGrantUpdate({
      id: f.id,
      fields: { amount_min: null, amount_max: null, funder_brief: brief },
      source: SOURCE,
      db,
      citations: {
        amount_min: { snippet: brief.amount_note as string, confidence: 'high' },
        amount_max: { snippet: brief.amount_note as string, confidence: 'high' },
        funder_brief: { snippet: brief.amount_note as string, confidence: 'high' },
      },
    })
    if (r.applied.includes('amount_max') || r.applied.includes('amount_min')) cleared++
    if (r.rejected?.length) { refused++; console.log(`  REFUSED ${f.title}: ${r.rejected.map(x => `${x.field} (${x.reason})`).join('; ')}`) }
  }
  console.log(`\ncleared: ${cleared}   refused: ${refused}`)

  const { data: after } = await db.from('scraped_grants').select('title, amount_min, amount_max').in('id', fires.map(f => f.id))
  const stillShowing = (after ?? []).filter(r => r.amount_min !== null || r.amount_max !== null)
  console.log(`rows still showing an unsupported amount: ${stillShowing.length}`)
  for (const r of stillShowing) console.log(`  ${r.title}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

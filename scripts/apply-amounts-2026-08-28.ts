// Act on the amount verdicts. Three different actions, and the split is the
// whole point: "the page does not say" is not the same as "the number is wrong".
//
// CORRECTS (5). The page states a different per-applicant figure and quotes it.
// Applied, with the funder's sentence as the citation.
//
// CONFIRMS (5). The page states exactly what we show. The flag was the check
// being wrong, so the confirming sentence is stamped as evidence, which is what
// clears it.
//
// SILENT (25). The page states no per-applicant figure at all, and here the
// stored provenance decides:
//
//   7 rows carry a figure from a source that is not this page — six of them
//   Paul's own admin edits, one my own user_verified reading of a funder FAQ
//   yesterday. Silence on the apply page is not evidence against those, and
//   nulling them would delete good work. Left alone. Postcode Society Trust is
//   the case in point: its £50,000 came from the trust's own FAQ on 26 August
//   and its apply page has never carried a figure.
//
//   16 carry a figure with no citation and low trust: admin:legacy backfills,
//   scrapers, a seed, a Gemini discovery row, an amount extractor. Page silent,
//   nothing behind the number, so it goes. Absence renders as absence; an
//   invented ceiling misleads. Resonance REI at £10m and RCD at £40m are the
//   clearest cases — those are the funds' own capital, not what one applicant
//   can ask for.
//
//   The £0 to £0 membership row is left as it is: free is a true statement about
//   an in-kind offer, not a missing number.
//
//   npx tsx --env-file=.env.local scripts/apply-amounts-2026-08-28.ts <amounts.json> [--apply]

import { readFileSync } from 'node:fs'
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate, trustOf } from '../src/lib/grant-merge'
import { recordFieldEvidence } from '../src/lib/field-evidence'

const APPLY = process.argv.includes('--apply')
const FILE  = process.argv[2]
const NOW   = '2026-08-28T00:00:00.000Z'

async function main() {
  if (!FILE) throw new Error('pass the amounts JSON as the first argument')
  const db = getAdminDb()
  const { results } = JSON.parse(readFileSync(FILE, 'utf8')) as { results: any[] }

  const { data: provRows } = await db.from('scraped_grants')
    .select('id, field_provenance').in('id', results.map(r => r.id))
  const provOf = new Map((provRows as any[]).map(r => [r.id, r.field_provenance ?? {}]))

  const hasOwnSource = (id: string) => {
    const p: any = provOf.get(id) ?? {}
    const e = p.amount_max ?? p.amount_min ?? null
    if (!e) return false
    return !!e.citation || trustOf(e.source, e.backfilled) >= 70
  }

  /**
   * Two corrections the model got right about the page and wrong about the row.
   * Read before applying, which is the point of a dry run.
   *
   *   Community Action Fund — the quote is "£20,000 per year, for up to three
   *   years". Taking £20,000 as the maximum would delete the other two years.
   *   Our £20,000 to £60,000 already says both ends of that.
   *
   *   Brighton & Hove Community Catalyst — the quote is past tense, about a
   *   round that has been and gone ("were invited to apply"). The row is the
   *   2027 to 2029 fund. A closed round's terms are not this fund's terms.
   *
   * Left flagged rather than half-corrected, because a wrong number that looks
   * checked is worse than one that still says "look at me".
   */
  const HOLD = new Set(['Community Action Fund', 'Brighton & Hove — Community Catalyst Fund (2027–2029)'])

  let corrected = 0, confirmed = 0, cleared = 0, kept = 0, held = 0

  for (const r of results) {
    const quote = String(r.quote ?? '').slice(0, 300)

    if (r.verdict === 'corrects' && HOLD.has(String(r.title))) {
      console.log(`held      ${String(r.title).slice(0, 46)} — see HOLD above`)
      held++
      continue
    }

    if (r.verdict === 'corrects' && quote) {
      const fields: Record<string, unknown> = {}
      if (r.page_min !== null) fields.amount_min = r.page_min
      if (r.page_max !== null) fields.amount_max = r.page_max
      if (!Object.keys(fields).length) continue
      if (!APPLY) { console.log(`[dry] correct ${r.title}: £${r.min}..£${r.max} -> £${r.page_min}..£${r.page_max}`); corrected++; continue }
      const res = await mergeGrantUpdate({
        id: r.id, db, fields,
        source: 'user_verified:amounts-2026-08-28',
        citations: Object.fromEntries(Object.keys(fields).map(k => [k, { snippet: quote, confidence: 'high' as const }])),
      })
      console.log(`corrected ${String(r.title).slice(0,40)}: applied [${res.applied.join(', ') || 'nothing'}]`)
      if (res.applied.length) {
        await recordFieldEvidence({ id: r.id, db, patch: {
          amount_max: { quote, source_url: r.url, checked_at: NOW, by: 'ai_audit:amounts-2026-08-28', agrees: true },
        } as never })
      }
      corrected++
      continue
    }

    if (r.verdict === 'confirms' && quote) {
      if (!APPLY) { console.log(`[dry] confirm ${r.title}`); confirmed++; continue }
      const e = await recordFieldEvidence({ id: r.id, db, patch: {
        amount_max: { quote, source_url: r.url, checked_at: NOW, by: 'ai_audit:amounts-2026-08-28', agrees: true },
        amount_min: { quote, source_url: r.url, checked_at: NOW, by: 'ai_audit:amounts-2026-08-28', agrees: true },
      } as never })
      console.log(`confirmed ${String(r.title).slice(0,40)}: stamped [${e.stamped.join(', ')}]`)
      confirmed++
      continue
    }

    if (r.verdict === 'silent' && (r.min !== null || r.max !== null)) {
      if (r.min === 0 && r.max === 0) { kept++; continue }
      if (hasOwnSource(r.id)) { kept++; continue }
      if (!APPLY) { console.log(`[dry] clear ${r.title}: £${r.min}..£${r.max} -> null`); cleared++; continue }
      const res = await mergeGrantUpdate({
        id: r.id, db,
        fields: { amount_min: null, amount_max: null },
        source: 'system:amounts-2026-08-28',
        citations: {
          amount_max: { snippet: `The funder's page states no per-applicant figure. ${String(r.why ?? '').slice(0, 200)}`, confidence: 'high' },
          amount_min: { snippet: `The funder's page states no per-applicant figure. ${String(r.why ?? '').slice(0, 200)}`, confidence: 'high' },
        },
      })
      console.log(`cleared   ${String(r.title).slice(0,40)}: applied [${res.applied.join(', ') || 'nothing'}]`
        + `${res.rejected.length ? ` REJECTED ${JSON.stringify(res.rejected.map((x: any) => x.reason))}` : ''}`)
      cleared++
    }
  }

  console.log(`\ncorrected ${corrected}  confirmed ${confirmed}  cleared ${cleared}  kept (sourced elsewhere) ${kept}  held for a human ${held}`)
}

main().catch(e => { console.error(e); process.exit(1) })

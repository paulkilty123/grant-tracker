// Settle the amount flags against the funder's own page. No model call.
//
// Paul, 2026-09-01: "The admin read-page route returns text plus every figure
// with its sentence and makes no model call. Why can't those 7 be settled for
// nothing?" They can. This is that.
//
// WHAT IT DOES. For every row blocked on an amount code, reads the funder's page
// from production and asks whether the stored figure appears on it — normalising
// £25k against £25,000 and £2.5m against 2,500,000, because a funder writes
// whichever suits the sentence.
//
// IT WRITES NOTHING, AND THAT IS A FINDING RATHER THAN CAUTION.
//
// The first draft recorded a match as evidence, which would have cleared the
// flag permanently. Two rounds of dry runs showed it cannot: matching a figure
// on the page gets ABOUT HALF OF THEM RIGHT, and the wrong half is confidently
// wrong. Of ten "confirmations":
//
//   REAL   D'Oyly Carte    "Your request is between £500 and £8,000"
//          SIB Energy      "Value: £25k - £250k (40% grant)"
//          Riverside       "Small Grants Application (under £3,000)"
//          SSE             "Up to £4k in funding"
//          Greggs          "offers grants of £20,000, for up to three years"
//
//   WRONG  CLA             a LIST OF PAST GRANTS: "Nunny's Farm CIC ... £5,000"
//          Oxfordshire     an INCOME CAP: "Group annual income: Under £500,000"
//          Rudbaxton       an INCOME THRESHOLD: "your annual income should be at
//                          least £2,000" — the grant there is £1,000
//          Cambridgeshire  an AVERAGE: "No maximum grant value, but a £4,000
//                          average grant size"
//
// A figure appearing on a page, even inside award-ish wording, is a PROXY for
// the page stating what an applicant may ask for. This is the trap CLAUDE.md
// names, hit twice in one script: the first draft confirmed a case study
// ("Amount invested £60,000"), and tightening it to require the existing
// per-grant cue reader still let an income cap through.
//
// So the output is a REVIEW LIST with the sentence beside each figure. Free,
// and it turns twenty-six page visits into a few minutes of reading. What it is
// not is a settlement.
//
// IT ALSO FOUND A REAL ERROR, worth more than the grounding: Oxfordshire's
// Thriving in Nature Fund stores amount_max 500000 AND max_org_income 500000 —
// the income cap copied into the award ceiling — where the page says up to
// £50,000. A tenfold overstatement, and the pass confirmed it.
//
//   npx tsx --env-file=.env.local scripts/ground-amounts-from-page-2026-09-01.ts

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { deriveReviewReasons, type ReviewRow } from '../src/lib/admin/review-reasons'
import { buildAwardText, extractGrantAmounts } from '../src/lib/grant-amounts'

/**
 * Does the sentence around this figure SUPPORT it as a per-applicant award?
 *
 * A figure appearing on the page is not the same claim as the page stating what
 * an applicant may ask for, and the first dry run of this script proved it. The
 * Social Investment Business row was "confirmed" at £60,000 by the sentence
 * "Duration 5 Years, Cost of capital 7.5%, Turnover £181,000, Amount invested
 * £60,000, Year of investment 2024" — a case study of one past investment, not
 * the fund's minimum. That is the exact trap CLAUDE.md names: an extraction that
 * carries a quote, where the quote does not say the thing.
 *
 * `extractGrantAmounts` already answers this and is already tested: it carries
 * the pool-cue lists and will not return a figure that its context frames as a
 * total, an income, a turnover or a past award. Reusing it rather than writing a
 * second reader is the rule `quote-vs-amount.ts` sets out, for the same reason.
 *
 * Verified on the four candidates from the dry run: it rejects the SIB case
 * study and accepts Greggs ("offers grants of £20,000"), SSE ("Up to £4k in
 * funding") and Suffolk ("Maximum grant available £3,000").
 */
function quoteSupports(context: string, stored: number): boolean {
  const f = extractGrantAmounts(buildAwardText([context]))
  return f.amount_min === stored || f.amount_max === stored
}

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}
const SECRET = process.env.ADMIN_SECRET!

/** £25k, £25,000, £2.5m and 2500000 are the same number written four ways. */
function toNumber(fig: string): number | null {
  const m = fig.replace(/\s/g, '').match(/£?([\d,]+(?:\.\d+)?)(million|m|k|bn)?/i)
  if (!m) return null
  let v = parseFloat(m[1].replace(/,/g, ''))
  const u = (m[2] ?? '').toLowerCase()
  if (u === 'k') v *= 1_000
  if (u === 'm' || u === 'million') v *= 1_000_000
  if (u === 'bn') v *= 1_000_000_000
  return Number.isFinite(v) ? v : null
}

type Fig = { figure: string; context: string }

async function readPages(urls: string[]) {
  const out: Record<string, { ok: boolean; figures: Fig[]; chars: number }> = {}
  for (let i = 0; i < urls.length; i += 10) {
    const res = await fetch('https://www.shootsfunding.co.uk/api/admin/read-page', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: urls.slice(i, i + 10) }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) { console.error(`  batch ${i}: HTTP ${res.status}`); continue }
    for (const r of (await res.json()).results) {
      out[r.url] = { ok: !!r.ok, figures: (r.figures ?? []) as Fig[], chars: r.chars ?? 0 }
    }
  }
  return out
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const rows: Record<string, unknown>[] = []
  for (let f = 0; f < 6000; f += 500) {
    const { data } = await db.from('scraped_grants')
      .select('*').not('pipeline_state', 'in', '("rejected","archived")').order('id').range(f, f + 499)
    rows.push(...(data ?? [])); if ((data ?? []).length < 500) break
  }

  const blocked = rows.filter(r => {
    const codes = deriveReviewReasons(r as ReviewRow).map(c => c.code)
    return codes.some(c => c === 'amount_ungrounded' || c === 'amount_unsupported')
  })
  console.log(`${blocked.length} rows blocked on an amount code\n`)

  const urls = Array.from(new Set(blocked.map(r => String(r.apply_url ?? '')).filter(u => /^https?:/.test(u))))
  console.log(`reading ${urls.length} pages from production (no model call)...\n`)
  const pages = await readPages(urls)

  const confirmed: { row: Record<string, unknown>; field: string; value: number; quote: string }[] = []
  const contradicted: { row: Record<string, unknown>; stored: string; onPage: string[] }[] = []
  const silent: Record<string, unknown>[] = []

  for (const r of blocked) {
    const page = pages[String(r.apply_url ?? '')]
    if (!page?.ok) { silent.push(r); continue }
    const onPage = page.figures.map(f => ({ n: toNumber(f.figure), ctx: f.context })).filter(x => x.n !== null)
    let any = false
    for (const field of ['amount_min', 'amount_max'] as const) {
      const stored = r[field] as number | null
      if (stored === null || stored === undefined) continue
      // BOTH tests. The figure has to be on the page AND its sentence has to
      // frame it as an award. Either alone confirms things that are not true.
      const hit = onPage.find(x => x.n === stored && quoteSupports(x.ctx, stored))
      if (hit) { confirmed.push({ row: r, field, value: stored, quote: hit.ctx.slice(0, 280) }); any = true }
    }
    if (!any) {
      if (onPage.length) contradicted.push({ row: r, stored: `${r.amount_min}/${r.amount_max}`, onPage: onPage.slice(0, 6).map(x => `£${x.n!.toLocaleString('en-GB')}`) })
      else silent.push(r)
    }
  }

  const byRow = new Map<string, typeof confirmed>()
  for (const c of confirmed) {
    const k = String(c.row.id)
    if (!byRow.has(k)) byRow.set(k, [])
    byRow.get(k)!.push(c)
  }

  console.log(`CONFIRMED BY THE FUNDER'S PAGE: ${byRow.size} row(s)`)
  for (const [id, cs] of Array.from(byRow.entries())) {
    const r = cs[0].row
    console.log(`\n  ${String(r.funder ?? '').slice(0, 30)} — ${String(r.title ?? '').slice(0, 40)}`)
    for (const c of cs) console.log(`     ${c.field} = £${c.value.toLocaleString('en-GB')}   "${c.quote.slice(0, 150)}"`)
    console.log(`     ${r.apply_url}`)
  }

  console.log(`\n\nPAGE STATES A DIFFERENT FIGURE — needs a human, nothing written: ${contradicted.length}`)
  for (const c of contradicted.slice(0, 20)) {
    console.log(`  ${String(c.row.funder ?? '').slice(0, 28).padEnd(28)} stored ${c.stored.padEnd(18)} page has ${c.onPage.join(', ')}`)
  }
  console.log(`\nPAGE STATES NO FIGURE AT ALL — the flag is correct: ${silent.length}`)
  for (const s of silent.slice(0, 20)) console.log(`  ${String(s.funder ?? '').slice(0, 28).padEnd(28)} ${String(s.title ?? '').slice(0, 40)}`)
  console.log(`\nNOTHING WRITTEN. ${byRow.size} row(s) above have a matching figure on the page;`)
  console.log('read the sentence before accepting one. On the sample measured, about half')
  console.log('of these matches were an income cap, a past award or an average rather than')
  console.log('the fund ceiling — see the header for the four that were wrong.')
}
main()

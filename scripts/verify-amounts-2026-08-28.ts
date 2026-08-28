// The 35 live rows flagged on money: `amount_unsupported` (the page states no
// per-applicant figure while the card shows one) and `amount_ungrounded` (a
// figure in our write-up that our own quote and description do not support).
//
// Asks the page what ONE APPLICANT can ask for, and requires a sentence. The
// distinction that matters and that a regex cannot make: a fund's total pot, an
// average award, a past grant named in a case study and a per-applicant ceiling
// are four different numbers, and only the last belongs in amount_max. That is
// the exact error behind Clothworkers (£250k pot read as a cap) and CITA
// (£2.4m of value read as an award).
//
// Read only. Writes a report; applying is a separate step.
//
//   npx tsx --env-file=.env.local scripts/verify-amounts-2026-08-28.ts [--limit N] [--out FILE]

import Anthropic from '@anthropic-ai/sdk'
import { writeFileSync } from 'node:fs'
import { getAdminDb } from '../src/lib/admin/admin-db'
import { type ReviewRow } from '../src/lib/admin/review-reasons'
import { gateDecision } from '../src/lib/admin/publish-gate'

const MODEL = 'claude-haiku-4-5-20251001'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const COLS = ['id','external_id','title','funder','apply_url','funding_index_url','is_active','pipeline_state','url_status','url_quality_score','amount_min','amount_max','deadline','is_rolling','next_open_date','deadline_cycle','eligible_structures','impact_sectors','target_beneficiaries','niche_tags','funding_type','funder_type','location_tag','is_local','grant_sources','funder_brief','field_provenance','raw_data','needs_intervention_reason','field_evidence','last_seen_at','first_seen_at','source'].join(', ')

async function readPage(url: string): Promise<{ text: string; via: string; full: number }> {
  const clean = (h: string) => h.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#163;/g,'£').replace(/\s+/g,' ').trim()
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    if (html.length < 500) throw new Error('short')
    return { text: clean(html), via: 'direct', full: clean(html).length }
  } catch (err) {
    const base = process.env.READER_PROXY_URL
    if (!base) throw err
    const res = await fetch(`${base.replace(/\/$/,'')}/${url}`, { signal: AbortSignal.timeout(40000),
      headers: { Accept: 'text/plain', ...(process.env.READER_PROXY_KEY ? { Authorization: `Bearer ${process.env.READER_PROXY_KEY}` } : {}) } })
    if (!res.ok) throw new Error(`direct failed; proxy HTTP ${res.status}`)
    const t = (await res.text()).replace(/\s+/g,' ')
    return { text: t, via: 'proxy', full: t.length }
  }
}

/**
 * Money lives all over a page, so send the parts that mention it rather than the
 * first 12,000 characters. A head-cut is what let an Armed Forces Covenant brief
 * be written off the table of past awards while the offer sat at offset 15,468.
 */
function moneyWindows(text: string, budget = 11000): string {
  const hits: number[] = []
  const re = /£\s?[\d,]+(\.\d+)?(k|m)?/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null && hits.length < 40) hits.push(m.index)
  if (!hits.length) return text.slice(0, budget)
  const per = Math.max(400, Math.floor(budget / Math.min(hits.length, 12)))
  const parts: string[] = []
  let last = -1
  for (const i of hits.slice(0, 12)) {
    const start = Math.max(0, i - Math.floor(per / 3))
    if (start < last) continue
    parts.push(text.slice(start, i + per))
    last = i + per
  }
  return parts.join('\n…\n').slice(0, budget)
}

const PROMPT = (r: any, page: string) => `A UK funding catalogue holds this entry:

  Fund:   ${r.title}
  Funder: ${r.funder}
  It currently shows: minimum ${r.amount_min === null ? 'not set' : '£' + r.amount_min.toLocaleString('en-GB')}, maximum ${r.amount_max === null ? 'not set' : '£' + r.amount_max.toLocaleString('en-GB')}

Below are the parts of ${r.apply_url} that mention money.

What can ONE APPLICANT ask for? Be careful with four different numbers that look alike:
  - the fund's total pot or annual budget          NOT the answer
  - an average or typical award                    NOT the answer, though worth reporting
  - a specific past grant named in a case study    NOT the answer
  - the maximum one organisation may apply for     THIS is the answer

Rules:
- Quote the sentence you take the figure from. No sentence, no figure.
- If the page states no per-applicant figure at all, say so; that is a real and common answer, and null is better than a number nobody wrote.
- "verdict": "confirms" if the page supports what we show, "corrects" if it states something different, "silent" if it states no per-applicant figure.

Reply with JSON only:
{"verdict":"confirms"|"corrects"|"silent","min":number|null,"max":number|null,"quote":string|null,"why":string}

PAGE:
${page}`

async function main() {
  const limitArg = process.argv.indexOf('--limit')
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity
  const outArg = process.argv.indexOf('--out')
  const outFile = outArg > -1 ? process.argv[outArg + 1] : 'amount-verdicts.json'

  const db = getAdminDb()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const rows: any[] = []
  for (let from = 0; from < 5000; from += 500) {
    const { data, error } = await db.from('scraped_grants').select(COLS)
      .eq('is_active', true).not('pipeline_state','in','("rejected","archived")').order('id').range(from, from + 499)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if ((data ?? []).length < 500) break
  }
  const targets = rows.filter(r => gateDecision(r as ReviewRow).blocking
    .some(b => b.code === 'amount_unsupported' || b.code === 'amount_ungrounded')).slice(0, limit)

  console.log(`asking about ${targets.length} rows\n`)
  const results: any[] = []
  let inTok = 0, outTok = 0, done = 0
  const queue = [...targets]
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const r = queue.shift()!
      const base = { id: r.id, title: r.title, funder: r.funder, url: r.apply_url, min: r.amount_min, max: r.amount_max }
      try {
        const page = await readPage(r.apply_url)
        const msg = await anthropic.messages.create({
          model: MODEL, max_tokens: 500,
          messages: [{ role: 'user', content: PROMPT(r, moneyWindows(page.text)) }],
        })
        inTok += msg.usage.input_tokens; outTok += msg.usage.output_tokens
        const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
        const j = raw.match(/\{[\s\S]*\}/)
        const v = j ? JSON.parse(j[0]) : { verdict: 'parse_failed', why: raw.slice(0, 100) }
        // Keep the model's answer in its OWN fields. Spreading it over `base`
        // overwrote the row's stored min and max with the page's nulls, so the
        // report could not say what we currently show — which is half of the
        // comparison the report exists to make.
        results.push({
          ...base, via: page.via, pageChars: page.full,
          verdict: v.verdict, page_min: v.min ?? null, page_max: v.max ?? null,
          quote: v.quote ?? null, why: v.why ?? null,
        })
      } catch (e) {
        results.push({ ...base, verdict: 'unreadable', why: (e as Error).message.slice(0, 100) })
      }
      done++
      if (done % 10 === 0) console.log(`  … ${done}/${targets.length}`)
    }
  }))

  const tally = new Map<string, number>()
  for (const r of results) tally.set(r.verdict, (tally.get(r.verdict) ?? 0) + 1)
  console.log('\nverdicts:')
  for (const [k, n] of Array.from(tally.entries()).sort((a,b)=>b[1]-a[1])) console.log(`  ${String(n).padStart(3)}  ${k}`)
  const usd = (inTok/1e6)*1 + (outTok/1e6)*5
  console.log(`\nspent: $${usd.toFixed(4)} (£${(usd*0.79).toFixed(3)})`)
  writeFileSync(outFile, JSON.stringify({ ranAt: new Date().toISOString(), model: MODEL, results }, null, 2))
  console.log(`report: ${outFile}`)
}

main().catch(e => { console.error(e); process.exit(1) })

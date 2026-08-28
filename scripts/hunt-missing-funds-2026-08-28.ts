// The 24 rows whose fund the verification pass could not find on the page they
// link to. One hop deeper: read the funding-related links ON that page and ask
// each one whether it describes the fund.
//
// The first pass looked at those links and judged from their labels. Reading
// them is different work and the only way to tell the two answers apart that
// matter here: "this funder describes the fund somewhere else on their site" is
// a link to fix, and "this fund is nowhere on their site" is a row to withdraw.
// Guessing between those from a label is how Tudor Trust stayed live.
//
// Skipped deliberately:
//   - the three rows whose link is a Charity Commission register record. Those
//     funders publish no site at all, so there is nothing to hop to, and whether
//     a register record is an acceptable apply route is Paul's call not mine.
//   - the four sitting behind a CAPTCHA. Nothing has ever read those pages, so
//     there is nothing to hop from. The read-exhausted probe owns them.
//
//   npx tsx --env-file=.env.local scripts/hunt-missing-funds-2026-08-28.ts [--out FILE]

import Anthropic from '@anthropic-ai/sdk'
import { writeFileSync, readFileSync } from 'node:fs'
import { getAdminDb } from '../src/lib/admin/admin-db'
import { type ReviewRow } from '../src/lib/admin/review-reasons'
import { gateDecision } from '../src/lib/admin/publish-gate'

const MODEL = 'claude-haiku-4-5-20251001'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const COLS = ['id','external_id','title','funder','apply_url','funding_index_url','is_active','pipeline_state','url_status','url_quality_score','amount_min','amount_max','deadline','is_rolling','next_open_date','deadline_cycle','eligible_structures','impact_sectors','target_beneficiaries','niche_tags','funding_type','funder_type','location_tag','is_local','grant_sources','funder_brief','field_provenance','raw_data','needs_intervention_reason','field_evidence','last_seen_at','first_seen_at','source'].join(', ')

const SKIP_HOST = /register-of-charities\.charitycommission\.gov\.uk/i

const clean = (h: string) => h.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ')
  .replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#163;/g,'£').replace(/\s+/g,' ').trim()

async function fetchRaw(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const h = await res.text()
    if (h.length < 500) throw new Error('short')
    return h
  } catch {
    const base = process.env.READER_PROXY_URL!
    const res = await fetch(`${base.replace(/\/$/, '')}/${url}`, { signal: AbortSignal.timeout(40000),
      headers: { Accept: 'text/plain', ...(process.env.READER_PROXY_KEY ? { Authorization: `Bearer ${process.env.READER_PROXY_KEY}` } : {}) } })
    if (!res.ok) throw new Error(`proxy ${res.status}`)
    return await res.text()
  }
}

/** Funding-ish links on the page, absolute, same host, deduped, best first. */
function candidateLinks(raw: string, base: string): string[] {
  const origin = new URL(base).origin
  const out = new Map<string, number>()
  const push = (href: string, label: string) => {
    let abs: string
    try { abs = new URL(href, base).toString().split('#')[0] } catch { return }
    if (!abs.startsWith(origin)) return
    if (abs.replace(/\/$/, '') === base.replace(/\/$/, '')) return
    if (/\.(pdf|jpg|png|docx?|xlsx?)$/i.test(abs)) return
    const text = `${label} ${abs}`
    let score = 0
    if (/fund|grant|programme|program|award|apply|application|scheme/i.test(text)) score += 2
    if (/apply|how-to|eligib/i.test(text)) score += 1
    if (score > 0) out.set(abs, Math.max(out.get(abs) ?? 0, score))
  }
  for (const m of Array.from(raw.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]{0,90}?)<\/a>/gi))) push(m[1], m[2].replace(/<[^>]+>/g, ' '))
  for (const m of Array.from(raw.matchAll(/\[([^\]]{2,70})\]\((https?:\/\/[^)]+)\)/g)))   push(m[2], m[1])
  return Array.from(out.entries()).sort((a, b) => b[1] - a[1]).map(([u]) => u).slice(0, 4)
}

const PROMPT = (title: string, funder: string, url: string, text: string) =>
`A UK funding catalogue lists a fund called "${title}" from ${funder}.

Below is the text of ${url}.

Does THIS page describe that fund, closely enough that a charity could tell it is the same thing and see how to apply or who to contact? A funder describing the fund under a slightly different name counts; a page merely mentioning it in a menu does not.

Reply with JSON only: {"describes_it": true|false, "quote": string|null, "why": string}

PAGE:
${text.slice(0, 9000)}`

async function main() {
  const outArg = process.argv.indexOf('--out')
  const outFile = outArg > -1 ? process.argv[outArg + 1] : 'missing-funds.json'
  const db = getAdminDb()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const rows: any[] = []
  for (let from = 0; from < 5000; from += 500) {
    const { data, error } = await db.from('scraped_grants').select(COLS)
      .eq('is_active', true).not('pipeline_state', 'in', '("rejected","archived")').order('id').range(from, from + 499)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if ((data ?? []).length < 500) break
  }
  const prior = JSON.parse(readFileSync(process.argv[2], 'utf8')) as { results: any[] }
  const notFound = new Set(prior.results.filter(r => r.verdict === 'not_found').map(r => r.id))
  const targets = rows.filter(r =>
    notFound.has(r.id) &&
    gateDecision(r as ReviewRow).blocking.some(b => b.code === 'page_describes_different_fund') &&
    !SKIP_HOST.test(String(r.apply_url)))

  console.log(`hunting ${targets.length} rows, up to 4 pages each\n`)
  const results: any[] = []
  let inTok = 0, outTok = 0
  const queue = [...targets]

  await Promise.all(Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const r = queue.shift()!
      const rec: any = { id: r.id, title: r.title, funder: r.funder, url: r.apply_url, tried: [], found: null }
      try {
        const raw = await fetchRaw(r.apply_url)
        const links = candidateLinks(raw, r.apply_url)
        for (const link of links) {
          rec.tried.push(link)
          let text = ''
          try { text = clean(await fetchRaw(link)) } catch { continue }
          if (text.length < 300) continue
          const msg = await anthropic.messages.create({
            model: MODEL, max_tokens: 350,
            messages: [{ role: 'user', content: PROMPT(r.title, r.funder, link, text) }],
          })
          inTok += msg.usage.input_tokens; outTok += msg.usage.output_tokens
          const t = msg.content[0].type === 'text' ? msg.content[0].text : ''
          const m = t.match(/\{[\s\S]*\}/)
          const v = m ? JSON.parse(m[0]) : null
          if (v?.describes_it === true && String(v.quote ?? '').trim()) {
            rec.found = { url: link, quote: v.quote, why: v.why }
            break
          }
        }
      } catch (e) { rec.error = (e as Error).message.slice(0, 80) }
      results.push(rec)
      console.log(`${rec.found ? 'FOUND  ' : rec.error ? 'ERROR  ' : 'nowhere'} ${String(r.title).slice(0, 44).padEnd(46)}${rec.found ? ' -> ' + rec.found.url : ''}`)
    }
  }))

  const usd = (inTok / 1e6) * 1 + (outTok / 1e6) * 5
  console.log(`\nfound elsewhere on the site: ${results.filter(r => r.found).length} of ${results.length}`)
  console.log(`spent: $${usd.toFixed(4)} (£${(usd * 0.79).toFixed(3)})`)
  writeFileSync(outFile, JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2))
  console.log(`report: ${outFile}`)
}

main().catch(e => { console.error(e); process.exit(1) })

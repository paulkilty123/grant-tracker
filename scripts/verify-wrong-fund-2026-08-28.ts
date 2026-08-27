// The 83 live rows flagged "the page does not describe this fund", asked the
// question that actually matters.
//
// WHY A SECOND PASS AND NOT JUST THE ENGINE'S VERDICT. The engine answers
// "is our fund on this page". That is right often enough to keep and wrong often
// enough that withdrawing 83 rows on it would be vandalism, and a free string
// match cannot separate them: a funder's nav menu contains every word the funder
// owns, so 47 of the 83 "matched" on menu items and a 403 warning page
// (scripts/triage-wrong-fund-2026-08-27.ts, kept as the record of that).
//
// So this asks the user's question instead, per CLAUDE.md: could an organisation
// APPLY for this fund from this page, and if not, does the site show a page
// where they could. A quote is required for any positive answer, which is the
// difference between a judgement and a guess.
//
// Haiku, one call per row, page text capped at 12k characters. Measured at
// roughly £0.30 for the full 83. Paul approved the spend on 2026-08-28.
//
// READ ONLY: writes a JSON report and changes no rows. Applying is a separate
// step with the report in front of a human.
//
//   npx tsx --env-file=.env.local scripts/verify-wrong-fund-2026-08-28.ts [--limit N] [--out FILE]

import Anthropic from '@anthropic-ai/sdk'
import { writeFileSync } from 'node:fs'
import { getAdminDb } from '../src/lib/admin/admin-db'
import { type ReviewRow } from '../src/lib/admin/review-reasons'
import { gateDecision } from '../src/lib/admin/publish-gate'

const MODEL = 'claude-haiku-4-5-20251001'
const PRICE = { in: 1, out: 5 }   // USD per million

const COLS = [
  'id','external_id','title','funder','apply_url','funding_index_url','is_active','pipeline_state',
  'url_status','url_quality_score','amount_min','amount_max','deadline','is_rolling','next_open_date',
  'deadline_cycle','eligible_structures','impact_sectors','target_beneficiaries','niche_tags','funding_type',
  'funder_type','location_tag','is_local','grant_sources','funder_brief','field_provenance','raw_data',
  'needs_intervention_reason','field_evidence','last_seen_at','first_seen_at','source',
].join(', ')

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

type Page = { text: string; links: string[]; via: string }

async function readPage(url: string): Promise<Page> {
  const fromHtml = (html: string): Page => {
    const links: string[] = []
    for (const m of Array.from(html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]{0,80}?)<\/a>/gi))) {
      const href = m[1], label = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      if (!label) continue
      if (/fund|grant|apply|application|programme|program|award|support|scheme/i.test(`${href} ${label}`)) {
        links.push(`${label} -> ${href}`)
      }
    }
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
    return { text, links: Array.from(new Set(links)).slice(0, 25), via: 'direct' }
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    if (html.length < 500) throw new Error(`only ${html.length} chars`)
    return fromHtml(html)
  } catch (err) {
    const base = process.env.READER_PROXY_URL
    if (!base) throw err
    const res = await fetch(`${base.replace(/\/$/, '')}/${url}`, {
      signal: AbortSignal.timeout(40000),
      headers: { Accept: 'text/plain', ...(process.env.READER_PROXY_KEY ? { Authorization: `Bearer ${process.env.READER_PROXY_KEY}` } : {}) },
    })
    if (!res.ok) throw new Error(`direct failed; proxy HTTP ${res.status}`)
    const md = (await res.text()).replace(/\s+/g, ' ')
    const links = Array.from(new Set(
      Array.from(md.matchAll(/\[([^\]]{2,60})\]\((https?:\/\/[^)]+)\)/g))
        .filter(m => /fund|grant|apply|application|programme|award|scheme/i.test(`${m[1]} ${m[2]}`))
        .map(m => `${m[1].trim()} -> ${m[2]}`),
    )).slice(0, 25)
    return { text: md, links, via: 'proxy' }
  }
}

const PROMPT = (row: { title: string; funder: string; url: string }, page: Page) => `A UK funding catalogue lists this entry:

  Fund:   ${row.title}
  Funder: ${row.funder}
  Link:   ${row.url}

Below is the text of that page, then the funding-related links on it.

Answer ONE question: could a UK charity or social enterprise APPLY for that fund, starting from this page?

Rules:
- "on_page" only if the page itself describes this fund and shows how to apply or who to contact. A fund named only in a navigation menu is NOT this.
- "elsewhere_on_site" if the page does not describe it, but one of the links clearly leads to it. Give that URL.
- "not_found" if neither. This includes a page about the funder in general, a fund that has closed or ended, a page about a different fund, and an error or consent page.
- A quote is required for on_page and elsewhere_on_site: copy the sentence from the page that shows it. No sentence, no positive answer.

Reply with JSON only:
{"verdict":"on_page"|"elsewhere_on_site"|"not_found","quote":string|null,"better_url":string|null,"why":string}

PAGE TEXT:
${page.text.slice(0, 12000)}

LINKS:
${page.links.join('\n') || '(none)'}`

async function main() {
  const limitArg = process.argv.indexOf('--limit')
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity
  const outArg = process.argv.indexOf('--out')
  const outFile = outArg > -1 ? process.argv[outArg + 1] : 'wrong-fund-verdicts.json'

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
  const targets = rows
    .filter(r => {
      const g = gateDecision(r as ReviewRow)
      return g.outcome === 'attention' && g.blocking.some(b => b.code === 'page_describes_different_fund')
    })
    .slice(0, limit)

  console.log(`asking about ${targets.length} rows\n`)

  const results: any[] = []
  let inTok = 0, outTok = 0, done = 0
  const queue = [...targets]

  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const r = queue.shift()!
      const base = { id: r.id, title: r.title, funder: r.funder, url: r.apply_url }
      try {
        const page = await readPage(r.apply_url)
        const msg = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 500,
          messages: [{ role: 'user', content: PROMPT(base as any, page) }],
        })
        inTok += msg.usage.input_tokens
        outTok += msg.usage.output_tokens
        const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
        const json = text.match(/\{[\s\S]*\}/)
        const v = json ? JSON.parse(json[0]) : { verdict: 'parse_failed', why: text.slice(0, 120) }
        results.push({ ...base, via: page.via, ...v })
      } catch (e) {
        results.push({ ...base, verdict: 'unreadable', why: (e as Error).message.slice(0, 120) })
      }
      done++
      if (done % 10 === 0) console.log(`  … ${done}/${targets.length}`)
    }
  }))

  const tally = new Map<string, number>()
  for (const r of results) tally.set(r.verdict, (tally.get(r.verdict) ?? 0) + 1)
  console.log('\nverdicts:')
  for (const [k, n] of Array.from(tally.entries()).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${k}`)

  const usd = (inTok / 1e6) * PRICE.in + (outTok / 1e6) * PRICE.out
  console.log(`\nspent: ${inTok} in / ${outTok} out = $${usd.toFixed(4)} (£${(usd * 0.79).toFixed(3)})`)

  writeFileSync(outFile, JSON.stringify({ ranAt: new Date().toISOString(), model: MODEL, results }, null, 2))
  console.log(`report: ${outFile}`)
}

main().catch(e => { console.error(e); process.exit(1) })

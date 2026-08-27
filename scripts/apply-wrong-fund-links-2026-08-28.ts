// Act on the verdicts from verify-wrong-fund-2026-08-28.ts.
//
// The pass said 40 of the 83 rows point at the wrong page on the right site and
// named a better URL. A model's suggestion is a lead, not a fact, so each one is
// READ AND ASKED THE SAME QUESTION before anything is written: does THIS page
// describe the fund and show how to apply. Only a yes with a quote gets applied.
//
// What it writes, per confirmed row:
//   apply_url          the page that actually carries the fund
//   field_evidence     the quote that says so, and where it came from
// Nothing else. Amounts, locations and briefs are untouched — the parallel
// session is correcting several of those by hand and its values sit above ours
// on the trust ladder.
//
//   npx tsx --env-file=.env.local scripts/apply-wrong-fund-links-2026-08-28.ts <verdicts.json> [--apply]

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, writeFileSync } from 'node:fs'
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { recordFieldEvidence } from '../src/lib/field-evidence'

const MODEL = 'claude-haiku-4-5-20251001'
const APPLY = process.argv.includes('--apply')
const FILE  = process.argv[2]
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function readPage(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    if (html.length < 500) throw new Error(`only ${html.length} chars`)
    return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
  } catch (err) {
    const base = process.env.READER_PROXY_URL
    if (!base) throw err
    const res = await fetch(`${base.replace(/\/$/, '')}/${url}`, {
      signal: AbortSignal.timeout(40000),
      headers: { Accept: 'text/plain', ...(process.env.READER_PROXY_KEY ? { Authorization: `Bearer ${process.env.READER_PROXY_KEY}` } : {}) },
    })
    if (!res.ok) throw new Error(`direct failed; proxy HTTP ${res.status}`)
    return (await res.text()).replace(/\s+/g, ' ')
  }
}

const PROMPT = (title: string, funder: string, url: string, text: string) => `A UK funding catalogue lists a fund called "${title}", from ${funder}.

Below is the text of ${url}.

Does THIS page describe that fund and show how to apply for it, or who to contact?

- "yes" only if the page describes this specific fund. A name in a navigation menu is not enough, and neither is a page about the funder in general.
- Quote the sentence that decides it. No sentence, no yes.

Reply with JSON only: {"describes_it": true|false, "quote": string|null, "why": string}

PAGE TEXT:
${text.slice(0, 12000)}`

async function main() {
  if (!FILE) throw new Error('pass the verdicts JSON as the first argument')
  const db = getAdminDb()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const { results } = JSON.parse(readFileSync(FILE, 'utf8')) as { results: any[] }

  const candidates = results.filter(r => r.verdict === 'elsewhere_on_site' && r.better_url)
  console.log(`${candidates.length} suggested links to check${APPLY ? '' : ' (DRY RUN)'}\n`)

  const checked: any[] = []
  let inTok = 0, outTok = 0
  const queue = [...candidates]
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const c = queue.shift()!
      try {
        const text = await readPage(c.better_url)
        const msg = await anthropic.messages.create({
          model: MODEL, max_tokens: 400,
          messages: [{ role: 'user', content: PROMPT(c.title, c.funder, c.better_url, text) }],
        })
        inTok += msg.usage.input_tokens; outTok += msg.usage.output_tokens
        const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
        const m = raw.match(/\{[\s\S]*\}/)
        const v = m ? JSON.parse(m[0]) : { describes_it: false, why: 'unparseable' }
        checked.push({ ...c, confirmed: v.describes_it === true && !!(v.quote ?? '').trim(), quote: v.quote, why: v.why })
      } catch (e) {
        checked.push({ ...c, confirmed: false, why: (e as Error).message.slice(0, 100) })
      }
    }
  }))

  const good = checked.filter(c => c.confirmed)
  console.log(`confirmed: ${good.length} of ${checked.length}`)
  const usd = (inTok / 1e6) * 1 + (outTok / 1e6) * 5
  console.log(`spent on this step: $${usd.toFixed(4)} (£${(usd * 0.79).toFixed(3)})\n`)

  for (const c of good) {
    console.log(`  ${String(c.title).slice(0, 40).padEnd(42)} -> ${c.better_url}`)
    if (!APPLY) continue
    const r = await mergeGrantUpdate({
      id: c.id, db,
      fields: { apply_url: c.better_url },
      source: 'ai_audit:wrong-fund-links-2026-08-28',
      citations: { apply_url: { snippet: String(c.quote).slice(0, 300), confidence: 'high' } },
    })
    if (r.applied.includes('apply_url')) {
      await recordFieldEvidence({
        id: c.id, db,
        patch: {
          _page_read: {
            quote: String(c.quote).slice(0, 300), source_url: c.better_url,
            checked_at: new Date().toISOString(), by: 'ai_audit:wrong-fund-links-2026-08-28',
            agrees: null, note: 'verified',
          },
        } as never,
      })
      console.log('      applied, and the page-read note cleared')
    } else {
      console.log(`      NOT applied: ${JSON.stringify(r.rejected)}`)
    }
  }

  const out = FILE.replace(/\.json$/, '-links-checked.json')
  writeFileSync(out, JSON.stringify({ checked }, null, 2))
  console.log(`\nreport: ${out}`)
}

main().catch(e => { console.error(e); process.exit(1) })

// A recommendation per row for the 21 funds nothing could find on their funder's
// site.
//
// The last two passes asked "is our fund on this page" and got no for all of
// them. Asking it a third way would get the same answer. This asks the question
// a person would ask next: WHAT DOES THIS FUNDER ACTUALLY RUN, and what should
// the row become?
//
// The distinction that matters, and the reason this is not a bulk withdrawal:
// UK Sport, Sportscotland, Nesta, Film London and Lloyds are all real and all
// still funding. If we are carrying a programme name they do not use, the row
// wants renaming, not deleting. A fund that has genuinely ended is a different
// case and gets a different answer.
//
// Reads the funder's own funding pages (the linked page plus its funding links),
// and returns one of four recommendations with the funder's words attached.
// Writes a decision document. Changes nothing.
//
//   npx tsx --env-file=.env.local scripts/recommend-wrong-fund-2026-08-28.ts <hunt.json> [--out FILE]

import Anthropic from '@anthropic-ai/sdk'
import { writeFileSync, readFileSync } from 'node:fs'
import { getAdminDb } from '../src/lib/admin/admin-db'

const MODEL = 'claude-haiku-4-5-20251001'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const clean = (h: string) => h.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ')
  .replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#163;/g,'£').replace(/\s+/g,' ').trim()

async function fetchText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const h = await res.text()
    if (h.length < 500) throw new Error('short')
    return clean(h)
  } catch {
    const base = process.env.READER_PROXY_URL!
    const res = await fetch(`${base.replace(/\/$/, '')}/${url}`, { signal: AbortSignal.timeout(40000),
      headers: { Accept: 'text/plain', ...(process.env.READER_PROXY_KEY ? { Authorization: `Bearer ${process.env.READER_PROXY_KEY}` } : {}) } })
    if (!res.ok) throw new Error(`proxy ${res.status}`)
    return (await res.text()).replace(/\s+/g, ' ')
  }
}

const PROMPT = (r: any, pages: { url: string; text: string }[]) =>
`A UK funding catalogue for charities, CICs and social enterprises carries this row:

  Title:  ${r.title}
  Funder: ${r.funder}
  Link:   ${r.url}

Our verifier has read the funder's pages and cannot find that fund. Below is what
those pages say. Decide what the row should become.

  "keep"      the fund IS there under this name and the verifier is wrong
  "retitle"   the funder runs this thing under a different name — give the name
  "repoint"   the fund is there and a different page on this site is its home
  "withdraw"  the funder does not run this, or it has ended, or this page is not
              a route to money for an organisation

Rules:
- A quote is required for keep, retitle and repoint. No quote, recommend withdraw.
- Applications from INDIVIDUALS do not count: this catalogue serves organisations.
- A page listing past winners or other people's grants is not a route to money.
- Say plainly if the pages simply do not contain enough to tell.

Reply with JSON only:
{"recommend":"keep"|"retitle"|"repoint"|"withdraw","new_title":string|null,"new_url":string|null,"quote":string|null,"why":string}

FUNDER PAGES:
${pages.map(p => `--- ${p.url}\n${p.text.slice(0, 5000)}`).join('\n\n')}`

async function main() {
  const outArg = process.argv.indexOf('--out')
  const outFile = outArg > -1 ? process.argv[outArg + 1] : 'wrong-fund-recommendations.json'
  const { results: hunted } = JSON.parse(readFileSync(process.argv[2], 'utf8')) as { results: any[] }
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants')
    .select('id, title, funder, apply_url, amount_min, amount_max, funder_brief')
    .in('id', hunted.map(h => h.id))
  const rowById = new Map((data as any[]).map(r => [r.id, r]))

  console.log(`${hunted.length} rows\n`)
  const out: any[] = []
  let inTok = 0, outTok = 0
  const queue = [...hunted]

  await Promise.all(Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const h = queue.shift()!
      const row = rowById.get(h.id) ?? h
      const urls = [h.url, ...(h.tried ?? [])].slice(0, 3)
      const pages: { url: string; text: string }[] = []
      for (const u of urls) {
        try { pages.push({ url: u, text: await fetchText(u) }) } catch { /* skip */ }
      }
      if (!pages.length) {
        out.push({ ...row, recommend: 'unreadable', why: 'no page on this funder could be read' })
        console.log(`unreadable  ${String(row.title).slice(0, 46)}`)
        continue
      }
      try {
        const msg = await anthropic.messages.create({
          model: MODEL, max_tokens: 600,
          messages: [{ role: 'user', content: PROMPT({ ...row, url: row.apply_url }, pages) }],
        })
        inTok += msg.usage.input_tokens; outTok += msg.usage.output_tokens
        const t = msg.content[0].type === 'text' ? msg.content[0].text : ''
        const m = t.match(/\{[\s\S]*\}/)
        const v = m ? JSON.parse(m[0]) : { recommend: 'unreadable', why: 'unparseable' }
        out.push({ id: row.id, title: row.title, funder: row.funder, url: row.apply_url,
                   amount_min: row.amount_min, amount_max: row.amount_max, pagesRead: pages.length, ...v })
        console.log(`${String(v.recommend).padEnd(10)} ${String(row.title).slice(0, 46).padEnd(48)}${v.new_title ? ' -> ' + v.new_title : ''}`)
      } catch (e) {
        out.push({ id: row.id, title: row.title, recommend: 'unreadable', why: (e as Error).message.slice(0, 80) })
      }
    }
  }))

  const tally = new Map<string, number>()
  for (const r of out) tally.set(r.recommend, (tally.get(r.recommend) ?? 0) + 1)
  console.log('\nrecommendations:')
  for (const [k, n] of Array.from(tally.entries()).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${k}`)
  const usd = (inTok / 1e6) * 1 + (outTok / 1e6) * 5
  console.log(`\nspent: $${usd.toFixed(4)} (£${(usd * 0.79).toFixed(3)})`)
  writeFileSync(outFile, JSON.stringify({ ranAt: new Date().toISOString(), results: out }, null, 2))
  console.log(`report: ${outFile}`)
}

main().catch(e => { console.error(e); process.exit(1) })

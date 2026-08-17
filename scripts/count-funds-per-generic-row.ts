/**
 * How many distinct funds does each generic row actually stand in for?
 *
 * The `multiple_funds` verdict says "this page covers several funds" and the
 * count was never persisted — `fundsOnPage` is computed at read time and the
 * route drops it. So the figures quoted from run logs (Waterloo 22, Arts Council
 * NI 18) exist nowhere in the database. This fetches them once, for the group
 * Paul is considering splitting.
 *
 * SCOPE IS THE TRUSTS AND CORPORATES ONLY. The 17 community foundations are
 * excluded by name, because Paul ruled on 2026-08-17 that they are NOT to be
 * split — they get a scheduled per-foundation feed in September instead, with a
 * £5,000 floor for what becomes its own row. Counting them would be paying to
 * inform a decision already taken.
 *
 * Reports only. Writes nothing to any row.
 *
 * Run:  npx tsx scripts/count-funds-per-generic-row.ts [--apply]
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const APPLY = process.argv.includes('--apply')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

/** Not split — see the header. Matched on the funder string. */
const IS_COMMUNITY_FOUNDATION = /community foundation|forever manchester|leeds community|cornwall community|cumbria community|norfolk community|somerset community|suffolk community|kent community|herefordshire community/i

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' },
      signal: AbortSignal.timeout(25_000),
    })
    if (!r.ok) return null
    const html = await r.text()
    return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 18_000)
  } catch { return null }
}

async function countFunds(title: string, funder: string, text: string) {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001', max_tokens: 700,
    messages: [{
      role: 'user',
      content: `This page belongs to ${funder}. Our catalogue holds ONE row for it, called "${title}".\n\n`
        + `List the SEPARATELY NAMED funding programmes on this page that an applicant could apply to, each of which appears to have its own page or its own rules. Do not count: news items, past grants, generic "how to apply" pages, or the funder itself.\n\n`
        + `Reply as JSON only: {"funds":["name","name"],"count":N,"one_fund_only":true|false}. `
        + `Set one_fund_only true if the page really describes a single fund.\n\nPAGE:\n${text}`,
    }],
  })
  const raw = msg.content.map(c => (c.type === 'text' ? c.text : '')).join('')
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) as { funds: string[]; count: number; one_fund_only: boolean } }
  catch { return null }
}

async function main() {
  const { data, error } = await db.from('scraped_grants')
    .select('id, title, funder, apply_url, funding_index_url')
    .eq('is_active', true).eq('field_evidence->_page_read->>note', 'multiple_funds')
    .order('funder')
  if (error) throw new Error(error.message)

  const rows = (data ?? []).filter(r => !IS_COMMUNITY_FOUNDATION.test(String(r.funder ?? '')))
  console.log(`${(data ?? []).length} generic rows, ${rows.length} after excluding community foundations`)
  console.log(`estimated cost: about £${(rows.length * 0.006).toFixed(2)}\n`)
  if (!APPLY) { console.log('DRY RUN — nothing fetched. Re-run with --apply.'); return }

  const out: unknown[] = []
  const PATH = resolve(HERE, '..', 'reports', 'generic-row-fund-counts-2026-08-17.json')
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const url = String(r.apply_url)
    const text = await fetchText(url)
    if (!text || text.length < 400) {
      out.push({ ...r, error: 'could not read page' })
      console.log(`  ?  ${r.funder} — could not read`)
    } else {
      const res = await countFunds(String(r.title), String(r.funder), text)
      out.push({ ...r, ...(res ?? { error: 'no structured answer' }) })
      console.log(`  ${String(res?.count ?? '?').padStart(2)}  ${r.funder} — ${r.title}`)
    }
    writeFileSync(PATH, JSON.stringify({ ranAt: new Date().toISOString(), rows: out }, null, 2))
    await new Promise(res => setTimeout(res, 400))
  }
  console.log(`\nwritten to reports/generic-row-fund-counts-2026-08-17.json`)
}

main().catch(e => { console.error(e); process.exit(1) })

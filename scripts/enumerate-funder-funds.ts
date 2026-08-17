/**
 * Discovery pass: what named funds does each generic row actually stand in for,
 * and which of them clear the £5,000 floor?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REPORTS ONLY. STAGES NOTHING.
 *
 * Paul, 2026-08-17: "Tell me the row count per funder before you apply
 * anything, so I can see the scale before I commit to reviewing it." So this
 * enumerates and prices the job; staging is a separate run against its output.
 *
 * THE £5,000 FLOOR is his, and it is a real threshold rather than a tidy number:
 * one of his cohort charities will not apply for anything smaller, so sub-£5k
 * funds are noise in a match list and would multiply the catalogue with rows
 * that go stale in a month. A fund whose amount cannot be read is NOT dropped —
 * it is reported as `unknown`, because dropping on absent evidence would hide
 * exactly the funds most worth checking.
 *
 * SIZE BANDS ARE NOT SEPARATE FUNDS. Percy Bilton (Large/Small), Forte
 * (Small/Major) and Weavers' (Small/Main) set the rule: same funder, same
 * criteria, different ceiling, no gain to a fundraiser. The model is told this
 * explicitly and asked to collapse them.
 *
 * USES THE READER PROXY, which the previous counting script did not — and that
 * is why Charity Bank, Historic England, Morrisons and TechSoup came back
 * unreadable. Roughly sixteen hosts in this catalogue sit behind a WAF that
 * refuses a plain fetch; `verify-row.ts` has escalated to the proxy for months.
 *
 * Run:  npx tsx scripts/enumerate-funder-funds.ts [--apply] [--only <substring>]
 *       --apply means "actually fetch pages". Nothing is ever written to a row.
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

const argOf = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined }
const APPLY = process.argv.includes('--apply')
const ONLY  = argOf('--only')
const FLOOR = 5000

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

/** The five trusts Paul cleared, by funder string. */
const TRUSTS = /^(Salford CVS|Allen Lane Foundation|Dulverton Trust|Charles Hayward Foundation|W F Southall Trust)$/i
/** Community foundations — split with the floor. */
const IS_CF = /community foundation|forever manchester|leeds community|cornwall community|cumbria community|norfolk community|somerset community|suffolk community|kent community|herefordshire community/i
/** The four the direct-fetch counter could not read. */
const PROXY_NEEDED = /^(Charity Bank|Historic England|Morrisons Foundation|TechSoup UK)$/i

function strip(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 20_000)
}

async function fetchDirect(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' },
      signal: AbortSignal.timeout(25_000),
    })
    if (!r.ok) return null
    return strip(await r.text())
  } catch { return null }
}

/** Same escalation the engine uses: direct, then the proxy. */
async function fetchViaProxy(url: string): Promise<string | null> {
  const base = process.env.READER_PROXY_URL
  if (!base) return null
  try {
    const r = await fetch(`${base.replace(/\/$/, '')}/${url}`, {
      headers: { Accept: 'text/plain' }, signal: AbortSignal.timeout(30_000),
    })
    if (!r.ok) return null
    return (await r.text()).replace(/\s+/g, ' ').slice(0, 20_000)
  } catch { return null }
}

async function readPage(url: string): Promise<{ text: string; via: 'direct' | 'proxy' } | null> {
  const direct = await fetchDirect(url)
  if (direct && direct.length > 400) return { text: direct, via: 'direct' }
  const proxied = await fetchViaProxy(url)
  if (proxied && proxied.length > 400) return { text: proxied, via: 'proxy' }
  return null
}

type Fund = {
  name: string; url: string | null
  amount_min: number | null; amount_max: number | null
  amount_known: boolean
  timing: string | null
}

async function enumerate(title: string, funder: string, text: string) {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001', max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `This page belongs to ${funder}. Our catalogue holds ONE row for it, "${title}", and we are deciding whether to split it into separate funds.\n\n`
        + `List the SEPARATELY NAMED funds an applicant could apply to. For each give: name, its own page URL if linked (absolute), the grant size range if stated, and any deadline or timing wording.\n\n`
        + `RULES:\n`
        + `- Do NOT list size bands of the same fund as separate funds. "Small Grants" and "Large Grants" from the same funder with the same criteria are ONE fund with a range. Collapse them and say so.\n`
        + `- Do NOT list news items, past grants, "how to apply" pages, or the funder itself.\n`
        + `- If a fund's amount is not stated on this page, set amount_min and amount_max to null. Do not guess.\n\n`
        + `Reply as JSON only:\n`
        + `{"funds":[{"name":"","url":null,"amount_min":null,"amount_max":null,"timing":null}],"collapsed_size_bands":true|false,"note":""}\n\nPAGE:\n${text}`,
    }],
  })
  const raw = msg.content.map(c => (c.type === 'text' ? c.text : '')).join('')
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const p = JSON.parse(m[0]) as { funds: Fund[]; collapsed_size_bands: boolean; note: string }
    p.funds = (p.funds ?? []).map(f => ({ ...f, amount_known: f.amount_min != null || f.amount_max != null }))
    return p
  } catch { return null }
}

/** Does this fund clear the floor? Unknown amounts are kept and flagged. */
function verdict(f: Fund): 'own_row' | 'under_floor' | 'unknown_amount' {
  if (!f.amount_known) return 'unknown_amount'
  const top = f.amount_max ?? f.amount_min ?? 0
  return top >= FLOOR ? 'own_row' : 'under_floor'
}

async function main() {
  const { data, error } = await db.from('scraped_grants')
    .select('id, title, funder, apply_url, funding_index_url')
    .eq('is_active', true).eq('field_evidence->_page_read->>note', 'multiple_funds')
    .order('funder')
  if (error) throw new Error(error.message)

  let rows = (data ?? []).filter(r => {
    const f = String(r.funder ?? '')
    return IS_CF.test(f) || TRUSTS.test(f) || PROXY_NEEDED.test(f)
  })
  if (ONLY) rows = rows.filter(r => String(r.funder).toLowerCase().includes(ONLY.toLowerCase()))

  console.log(`${rows.length} funders to enumerate`)
  console.log(`  community foundations: ${rows.filter(r => IS_CF.test(String(r.funder))).length}`)
  console.log(`  trusts Paul cleared:   ${rows.filter(r => TRUSTS.test(String(r.funder))).length}`)
  console.log(`  proxy retries:         ${rows.filter(r => PROXY_NEEDED.test(String(r.funder))).length}`)
  console.log(`estimated cost: about £${(rows.length * 0.008).toFixed(2)}\n`)
  if (!APPLY) { console.log('DRY RUN — nothing fetched. Re-run with --apply.'); return }

  const out: unknown[] = []
  const PATH = resolve(HERE, '..', 'reports', 'funder-fund-enumeration-2026-08-17.json')
  for (const r of rows) {
    const url = String(r.apply_url)
    const page = await readPage(url)
    if (!page) {
      out.push({ ...r, error: 'unreadable direct and via proxy' })
      console.log(`  ??  ${r.funder} — unreadable`)
    } else {
      const res = await enumerate(String(r.title), String(r.funder), page.text)
      const funds = res?.funds ?? []
      const own    = funds.filter(f => verdict(f) === 'own_row').length
      const under  = funds.filter(f => verdict(f) === 'under_floor').length
      const unk    = funds.filter(f => verdict(f) === 'unknown_amount').length
      out.push({ ...r, via: page.via, collapsed_size_bands: res?.collapsed_size_bands ?? false,
                 note: res?.note ?? null, funds, own_row: own, under_floor: under, unknown_amount: unk })
      console.log(`  ${String(own).padStart(2)} rows  (${under} under £5k, ${unk} unknown)  ${r.funder}${page.via === 'proxy' ? '  [proxy]' : ''}`)
    }
    writeFileSync(PATH, JSON.stringify({ ranAt: new Date().toISOString(), floor: FLOOR, funders: out }, null, 2))
    await new Promise(res => setTimeout(res, 500))
  }
  console.log(`\nwritten to reports/funder-fund-enumeration-2026-08-17.json`)
}

main().catch(e => { console.error(e); process.exit(1) })

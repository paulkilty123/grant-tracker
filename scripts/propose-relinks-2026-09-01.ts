// The five 404s: candidate replacement links, PROPOSED and not applied.
//
// Paul, 2026-09-01: "The five 404 relinks are user-visible URL changes. Propose,
// don't apply."
//
// Every candidate below is READ from production before it is offered, and the
// output states what the page actually said. That is the whole point: a model's
// suggested link is a lead, not a fact, and roughly two thirds of them fail when
// opened. Both of my Waitrose candidates 404'd, which is why Waitrose is not in
// this list at all — there is nothing to propose.
//
// A candidate is only offered when the page BOTH names the fund AND carries
// application detail. "The page mentions the fund" admits an FAQ, a news item
// and a grants-awarded list; the question that matters is whether a fundraiser
// landing there could apply.
//
//   npx tsx --env-file=.env.local scripts/propose-relinks-2026-09-01.ts

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { classifyPage } from '../src/lib/verification/page-readable'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}
const SECRET = process.env.ADMIN_SECRET!

/** Words that say a fundraiser can act here, not merely read about it. */
const APPLY_MARKERS = [
  'how to apply', 'apply now', 'application form', 'deadline', 'closing date',
  'who can apply', 'eligibility', 'guidelines', 'application process', 'open for applications',
]

type Candidate = { prefix: string; row: string; needles: string[]; urls: string[] }

const CANDIDATES: Candidate[] = [
  { prefix: 'b5b74039', row: 'Henry Smith Foundation — Christian Grants (Clergy)',
    needles: ['clergy', 'christian'],
    urls: [
      'https://henrysmith.foundation/grants/clergy/',
      'https://henrysmith.foundation/grants/',
      'https://henrysmith.foundation/what-we-fund/clergy-grants/',
    ] },
  { prefix: 'c34e18fb', row: 'Barrow Cadbury Trust — Open Grants',
    needles: ['justice', 'migration'],
    urls: [
      'https://barrowcadbury.org.uk/our-work/applying-for-funding/',
      'https://barrowcadbury.org.uk/what-we-fund/',
      'https://barrowcadbury.org.uk/apply-for-a-grant/',
    ] },
  { prefix: 'ec70ac6e', row: 'Triodos Bank UK — Business Banking and Loans',
    needles: ['charities', 'lending', 'loan'],
    urls: [
      'https://www.triodos.co.uk/business',
      'https://www.triodos.co.uk/business/charities-and-social-enterprises',
      'https://www.triodos.co.uk/lending',
    ] },
  { prefix: '6f3892eb', row: 'Key Fund — Social Investment Loans',
    needles: ['investment', 'loan', 'grant'],
    urls: [
      'https://www.thekeyfund.co.uk/',
      'https://thekeyfund.co.uk/apply/',
      'https://www.thekeyfund.org.uk/apply',
    ] },
]

async function read(urls: string[], contains: string[]) {
  const res = await fetch('https://www.shootsfunding.co.uk/api/admin/read-page', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls, contains }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) return []
  return (await res.json()).results as Array<{
    url: string; ok: boolean; chars?: number; excerpt?: string
    found?: Record<string, boolean>; directError?: string; proxyError?: string
  }>
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const rows: Record<string, unknown>[] = []
  for (let f = 0; f < 6000; f += 500) {
    const { data } = await db.from('scraped_grants')
      .select('id, title, funder, apply_url, is_active').order('id').range(f, f + 499)
    rows.push(...(data ?? [])); if ((data ?? []).length < 500) break
  }

  console.log('PROPOSALS ONLY. Nothing here is written.\n')
  console.log('Waitrose Community Matters is deliberately absent: both candidate')
  console.log('replacements were read and both 404. There is nothing to propose.\n')

  for (const c of CANDIDATES) {
    const row = rows.find(r => String(r.id).startsWith(c.prefix))
    console.log(`\n${'─'.repeat(74)}`)
    console.log(`${c.row}`)
    console.log(`  currently: ${row?.apply_url ?? '(row not found)'}`)
    const results = await read(c.urls, [...c.needles, ...APPLY_MARKERS])
    let best: string | null = null
    for (const r of results) {
      if (!r.ok) { console.log(`  ✗ ${r.url}\n      unreadable: ${r.directError} | ${r.proxyError}`); continue }
      const readable = classifyPage(r.excerpt ?? '')
      if (!readable.ok) { console.log(`  ✗ ${r.url}\n      ${readable.reason}: ${readable.detail}`); continue }
      const named  = c.needles.filter(n => r.found?.[n])
      const canApply = APPLY_MARKERS.filter(m => r.found?.[m])
      const ok = named.length > 0 && canApply.length >= 2
      console.log(`  ${ok ? '✓' : '~'} ${r.url}`)
      console.log(`      ${r.chars} chars · names: ${JSON.stringify(named)} · apply signals: ${canApply.length}`)
      if (ok && !best) best = r.url
    }
    console.log(best
      ? `  PROPOSED -> ${best}`
      : `  NO CANDIDATE CLEARS THE BAR. Leave the row flagged rather than swapping in a page that looks right.`)
  }

  console.log(`\n${'─'.repeat(74)}`)
  console.log('The floor beats the ranking: a homepage you know is wrong beats an FAQ')
  console.log('that looks fixed. Nothing above is applied.')
}
main()

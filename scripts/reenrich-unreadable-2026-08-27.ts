// The three rows whose briefs were written from the model's memory because the
// funder's page would not load, re-read now that the reader proxy is wired in.
//
// All three come back clean through the proxy (probed 2026-08-27), which is the
// whole reason this is worth spending on: the pages exist and are readable, we
// were simply reading them the wrong way when these briefs were written in
// March and April.
//
// Microsoft's link moves first. nonprofit.microsoft.com/getting-started is a
// JavaScript shell that returns 107 characters to any reader, proxy included;
// microsoft.com/en-gb/nonprofits is the same offer as prose.
//
// Runs against PRODUCTION, so the enrichment bills to the production key and
// takes exactly the code path the review queue's "Re-read the page" button
// takes. Roughly a penny a row, measured over 60 rows of nightly re-enrichment.
//
//   npx tsx --env-file=.env.local scripts/reenrich-unreadable-2026-08-27.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const HOST  = 'https://www.shootsfunding.co.uk'   // www directly: a redirect strips the bearer

const MICROSOFT = '3c2c6766-220f-4d54-ad18-4bade01df7a5'
const TECHSOUP  = 'b98c7493-ff5c-42f4-ab1d-b205940e550c'
const FREDERICK = 'd33aa458-0eb8-473a-8b28-547cd8557a71'

const ROWS: [string, string][] = [
  [MICROSOFT, 'Microsoft for Nonprofits'],
  [TECHSOUP,  'TechSoup UK'],
  [FREDERICK, 'Fredericks Foundation'],
]

type Usage = { model: string; input_tokens: number; output_tokens: number }

async function main() {
  const db = getAdminDb()
  const secret = process.env.ADMIN_SECRET
  if (!secret) throw new Error('ADMIN_SECRET missing from the environment')

  if (!APPLY) console.log('DRY RUN — nothing written, nothing spent. Pass --apply.\n')

  // Point Microsoft at a page that answers to a reader before asking one to read it.
  const newUrl = 'https://www.microsoft.com/en-gb/nonprofits'
  if (APPLY) {
    const r = await mergeGrantUpdate({
      id: MICROSOFT,
      fields: { apply_url: newUrl, funding_index_url: newUrl },
      source: 'user_verified:live-and-wrong-2026-08-27',
      db,
      citations: { apply_url: { snippet: 'Microsoft provides grants and discounts for Microsoft Cloud products to eligible nonprofits.', confidence: 'high' } },
    })
    console.log(`Microsoft link: applied [${r.applied.join(', ') || 'nothing'}]`)
  } else {
    console.log(`[dry] Microsoft link -> ${newUrl}`)
  }

  const usage: Usage[] = []
  for (const [id, name] of ROWS) {
    if (!APPLY) { console.log(`[dry] re-read ${name}`); continue }
    const res = await fetch(`${HOST}/api/admin/enrich-grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ grantId: id }),
    })
    const j = await res.json().catch(() => ({})) as {
      error?: string
      brief?: { source?: string }
      applied?: string[]
      rejected?: { field: string; reason: string }[]
      usage?: Usage
      _debug?: { fetchedFromUrl?: boolean; primaryFetch?: string | null }
    }
    if (!res.ok) { console.log(`${name}: FAILED HTTP ${res.status} ${j.error ?? ''}`); continue }
    if (j.usage) usage.push(j.usage)
    console.log(
      `${name}: brief=${j.brief?.source ?? '?'} fetched=${j._debug?.fetchedFromUrl ?? '?'}`
      + ` applied=[${(j.applied ?? []).join(', ') || 'nothing'}]`
      + `${j.rejected?.length ? ` REJECTED ${JSON.stringify(j.rejected)}` : ''}`
      + `${j._debug?.primaryFetch ? ` (${j._debug.primaryFetch})` : ''}`,
    )
  }

  // ── What the fresh reads then said about money ───────────────────────────
  // Run after the reads, with --amounts, because it depends on what they found.
  //
  // TechSoup's catalogue is a price list of ADMIN FEES: the £1,710 the amount
  // extractor picked up is the most expensive Cisco appliance, which is what an
  // organisation PAYS, not what it receives. On a card that renders as "up to
  // £1,710" of funding, which is worse than showing nothing.
  //
  // Fredericks' own page now describes bespoke revenue-share finance and states
  // no per-organisation figure at all, so the seeded £1,000 to £25,000 is a
  // range nothing supports.
  //
  // Microsoft is deliberately NOT here. Its £3,500 is pinned by Paul from
  // 1 June, and the page today offers "$2,000 USD annual service credits" for
  // the Azure Grant. Only he can say whether the £3,500 was a different offer
  // or a currency slip, so the row keeps his figure and he gets told.
  if (APPLY && process.argv.includes('--amounts')) {
    const corrections: [string, string, string][] = [
      [TECHSOUP,  'TechSoup UK',            'Admin fees vary significantly by product, ranging from £0.00 to £1,710.00. These are fees an organisation pays, not funding it receives.'],
      [FREDERICK, 'Fredericks Foundation',  'The funder does not publish per-grant amounts; they offer bespoke, flexible funding tailored to each organisation under a revenue share model.'],
    ]
    for (const [id, name, why] of corrections) {
      const r = await mergeGrantUpdate({
        id, db,
        fields: { amount_min: null, amount_max: null },
        source: 'system:live-and-wrong-2026-08-27',
        citations: { amount_max: { snippet: why, confidence: 'high' }, amount_min: { snippet: why, confidence: 'high' } },
      })
      console.log(`${name} amounts cleared: applied [${r.applied.join(', ') || 'nothing'}]`
        + `${r.rejected.length ? ` REJECTED ${JSON.stringify(r.rejected)}` : ''}`)
    }
  }

  if (usage.length) {
    const usd = usage.reduce((n, u) => n + (u.input_tokens / 1e6) * 1 + (u.output_tokens / 1e6) * 5, 0)
    const inTok  = usage.reduce((n, u) => n + u.input_tokens, 0)
    const outTok = usage.reduce((n, u) => n + u.output_tokens, 0)
    console.log(`\nspent: ${usage.length} reads, ${inTok} in / ${outTok} out, $${usd.toFixed(4)} (£${(usd * 0.79).toFixed(3)})`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })

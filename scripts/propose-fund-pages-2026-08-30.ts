/**
 * For rows whose link lands on a funder's index, find THIS fund's own page.
 *
 * The 93 rows are the `quality` half of the link flags — the link is right and
 * belongs to the right funder, it just points at a page covering several funds,
 * so a fundraiser has to find their fund again after clicking. Not a fault. See
 * docs/link-flags-2026-08-30.md.
 *
 * PROPOSES ONLY, AND THIS IS NOT A PREFERENCE. On 17 August a hop corrected 14
 * URLs automatically, at least 4 were wrong or worthless, and the whole thing
 * was reverted. Same job, same trap. Every proposal here carries the old URL,
 * the new URL, and what the new page actually answered, so it can be accepted or
 * rejected on evidence rather than on a score.
 *
 * THE CANDIDATE MUST NAME THIS FUND. The fifth false-positive class found the
 * same day: a fund-specific row measured against a multi-fund funder page.
 * Manchester Airport's £3,000 fund nearly acquired London Stansted's £50,000
 * Flagship Award because both live on the group's site. A page that is merely
 * "more detailed" is not this fund's page, and proposing it would send a
 * fundraiser somewhere they cannot apply.
 *
 * Reads everything through /api/admin/read-page. NO ANTHROPIC CALL.
 */
export {}

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const ADMIN_SECRET = process.env.ADMIN_SECRET!
const SITE         = process.env.SITE ?? 'https://www.shootsfunding.co.uk'
const LIMIT        = Number(process.env.LIMIT ?? '10')
const OFFSET       = Number(process.env.OFFSET ?? '0')

const SIGNALS: { name: string; re: RegExp }[] = [
  { name: 'eligibility', re: /\b(who can apply|eligib\w+|we fund|we do not fund|we don’t fund|exclusions?|registered charit\w+)\b/i },
  { name: 'amount',      re: /£\s?[\d,]{3,}/ },
  { name: 'apply',       re: /\b(how to apply|application form|apply online|complete the form|application process|apply in writing|start your application)\b/i },
  { name: 'timing',      re: /\b(deadline|closing date|closes on|rolling|year round|trustees? meet|application window|next round)\b/i },
]

const STOP = new Set(['grant', 'grants', 'fund', 'funds', 'funding', 'programme', 'program',
  'the', 'and', 'for', 'of', 'to', 'a', 'an', 'trust', 'foundation', 'charitable', 'charity',
  'community', 'small', 'large', 'main', 'open', 'general', 'uk', 'scheme', 'award', 'awards',
  'via', 'with', 'from'])

function tokens(s: string): string[] {
  return Array.from(new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
     .filter(w => w.length > 3 && !STOP.has(w))))
}

type Flagged = { id: string; funder: string; title: string; apply_url: string; note: string; verdict: string }
type PageResult = {
  url: string; ok: boolean; chars?: number; excerpt?: string
  found?: Record<string, boolean>
  links?: { url: string; label: string }[]
}

async function readPages(body: Record<string, unknown>): Promise<PageResult[]> {
  const r = await fetch(`${SITE}/api/admin/read-page`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`read-page ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return (await r.json() as { results: PageResult[] }).results
}

async function main() {
  const all = JSON.parse(readFileSync(process.env.IN ?? 'link-rows3.json', 'utf8')) as Flagged[]
  const rows = all.filter(r => r.verdict === 'funder_page_thin').slice(OFFSET, OFFSET + LIMIT)
  console.log(`index-page rows in this batch: ${rows.length} (offset ${OFFSET})\n`)

  const proposals: Record<string, unknown>[] = []
  const noCandidate: Record<string, unknown>[] = []

  // 1. Read each current page, asking for its links.
  const current = new Map((await readPages({ urls: rows.map(r => r.apply_url), links: true }))
    .map(p => [p.url, p]))

  for (const row of rows) {
    const page = current.get(row.apply_url)
    const fundToks = tokens(row.title)
    if (!page?.ok) { noCandidate.push({ ...row, why: 'current page unreadable' }); continue }
    if (fundToks.length === 0) {
      // Nothing distinctive to look for — "Community Grants" is every funder's
      // page. Without a name to match, a "better" page cannot be shown to be
      // THIS fund's page, which is the whole requirement.
      noCandidate.push({ ...row, why: 'fund name has no distinctive words to match on' }); continue
    }

    // 2. Candidate links are ones whose ANCHOR TEXT names this fund.
    const cands = (page.links ?? [])
      .map(l => {
        const lt = l.label.toLowerCase()
        const hit = fundToks.filter(t => lt.includes(t)).length
        return { ...l, hit, ratio: hit / fundToks.length }
      })
      .filter(c => c.ratio >= 0.5)
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 3)

    if (cands.length === 0) { noCandidate.push({ ...row, why: 'no link on the page names this fund' }); continue }

    // 3. Read the candidates, and ask the page whether it names the fund —
    //    against the WHOLE text, via `contains`, not the excerpt.
    const read = await readPages({ urls: cands.map(c => c.url), contains: fundToks, links: false })
    const byUrl = new Map(read.map(p => [p.url, p]))

    let best: Record<string, unknown> | null = null
    for (const c of cands) {
      const p = byUrl.get(c.url)
      if (!p?.ok || !p.excerpt) continue
      const namesFund = fundToks.filter(t => p.found?.[t]).length / fundToks.length >= 0.5
      if (!namesFund) continue
      const hit = SIGNALS.filter(s => s.re.test(p.excerpt!)).map(s => s.name)
      if (hit.length < 2) continue
      const better = hit.length > Number((best as { signalCount?: number } | null)?.signalCount ?? 0)
      if (!best || better) {
        best = {
          newUrl: c.url, anchor: c.label, signalCount: hit.length, answers: hit,
          chars: p.chars,
          // What the page answered, in its own words, for each signal found.
          evidence: hit.map(name => {
            const re = SIGNALS.find(s => s.name === name)!.re
            const m = re.exec(p.excerpt!)
            const at = Math.max(0, (m?.index ?? 0) - 90)
            return { answers: name, quote: p.excerpt!.slice(at, at + 200).trim() }
          }),
        }
      }
    }

    if (!best) { noCandidate.push({ ...row, why: 'candidates named the fund or carried detail, but not both' }); continue }
    proposals.push({
      id: row.id, funder: row.funder, title: row.title,
      oldUrl: row.apply_url, note: row.note, ...best,
    })
  }

  console.log(`########## PROPOSALS: ${proposals.length} of ${rows.length}\n`)
  for (const p of proposals) {
    console.log(`  ${p.funder} — ${p.title}`)
    console.log(`    from  ${p.oldUrl}`)
    console.log(`    to    ${p.newUrl}`)
    console.log(`    link text on the index: "${p.anchor}"`)
    console.log(`    the new page answers: ${(p.answers as string[]).join(', ')}  (${p.chars} chars)`)
    for (const e of p.evidence as { answers: string; quote: string }[]) {
      console.log(`      ${e.answers}: "${e.quote}"`)
    }
    console.log()
  }
  console.log(`########## NO PROPOSAL: ${noCandidate.length}\n`)
  for (const n of noCandidate) console.log(`  ${n.funder} — ${n.title}\n      ${n.why}`)

  mkdirSync('reports', { recursive: true })
  const path = process.env.OUT ?? `reports/fund-page-proposals-2026-08-30.json`
  writeFileSync(path, JSON.stringify({ offset: OFFSET, limit: LIMIT, proposals, noCandidate }, null, 1))
  console.log(`\nwritten -> ${path}   (nothing applied)`)
}

main().catch(e => { console.error(e); process.exit(1) })

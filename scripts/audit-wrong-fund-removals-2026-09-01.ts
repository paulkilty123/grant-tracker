// READ ONLY. Did a bot wall ever take a real funder out of the catalogue?
//
// `fixable_link: wrong_fund` is not one of removal.ts's four actuator classes,
// so the engine cannot have hidden a row on it directly. But the verdict renders
// as "The page does not describe this fund" — a flat statement of fact about the
// funder — and that is what a person reads before pressing Reject or Hide. It
// also sat on rows that scripts and sweeps have worked through since 17 August.
//
// So the question is not "did the actuator do it" but "is any row out of the
// catalogue carrying this verdict, where the page was never actually read".
//
//   npx tsx --env-file=.env.local scripts/audit-wrong-fund-removals-2026-09-01.ts
//
// Writes nothing. Re-reads each host once from THIS machine only to group by
// host; the authoritative wall check is made against production's egress via
// /api/admin/read-page, because a page read is a property of the network it is
// made from.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { looksLikeAWall } from '../src/lib/verification/page-readable'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const SECRET = process.env.ADMIN_SECRET!
const hostOf = (u: string | null) =>
  (u ?? '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0] ?? ''

async function readViaProduction(urls: string[]) {
  const out: Record<string, { ok: boolean; chars: number; excerpt: string; err?: string }> = {}
  for (let i = 0; i < urls.length; i += 10) {
    const batch = urls.slice(i, i + 10)
    const res = await fetch('https://www.shootsfunding.co.uk/api/admin/read-page', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: batch }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) { console.error(`  batch ${i} HTTP ${res.status}`); continue }
    const { results } = await res.json()
    for (const r of results) {
      out[r.url] = r.ok
        ? { ok: true, chars: r.chars, excerpt: r.excerpt ?? '' }
        : { ok: false, chars: 0, excerpt: '', err: `${r.directError ?? ''} | ${r.proxyError ?? ''}` }
    }
  }
  return out
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // EVERY state, including rejected and archived — those are the ones the
  // question is about, and every other surface in the codebase filters them out.
  const rows: Record<string, unknown>[] = []
  for (let from = 0; from < 6000; from += 500) {
    const { data, error } = await db.from('scraped_grants')
      .select('id, title, funder, apply_url, is_active, pipeline_state, field_evidence, rejection_reason, needs_intervention_reason')
      .order('id').range(from, from + 499)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if ((data ?? []).length < 500) break
  }
  console.log(`scanned ${rows.length} rows, every pipeline_state\n`)

  const carries = rows.filter(r => {
    const note = (r.field_evidence as Record<string, { note?: string }> | null)?.['_page_read']?.note
    return note === 'fixable_link: wrong_fund'
  })
  const outOfCatalogue = carries.filter(r => r.is_active !== true)

  console.log(`rows carrying "fixable_link: wrong_fund" anywhere: ${carries.length}`)
  console.log(`   of those, NOT live (is_active = false):         ${outOfCatalogue.length}`)
  const byState: Record<string, number> = {}
  for (const r of outOfCatalogue) byState[String(r.pipeline_state)] = (byState[String(r.pipeline_state)] ?? 0) + 1
  console.log(`   by state: ${JSON.stringify(byState)}\n`)

  // One representative URL per host keeps the read count honest: the question is
  // whether the HOST walls us, and 11 Arts Council rows is one wall.
  const byHost = new Map<string, Record<string, unknown>[]>()
  for (const r of outOfCatalogue) {
    const h = hostOf(r.apply_url as string | null)
    if (!h) continue
    if (!byHost.has(h)) byHost.set(h, [])
    byHost.get(h)!.push(r)
  }
  const probes = Array.from(byHost.entries()).map(([h, rs]) => ({ host: h, url: String(rs[0].apply_url), rows: rs }))
  console.log(`re-reading ${probes.length} distinct hosts from production...\n`)
  const reads = await readViaProduction(probes.map(p => p.url))

  const walled: typeof probes = []
  const fine: typeof probes = []
  for (const p of probes) {
    const got = reads[p.url]
    if (!got) continue
    const verdict = got.ok ? looksLikeAWall(got.excerpt) : { walled: true, why: got.err ?? 'fetch failed' }
    ;(verdict.walled ? walled : fine).push(p)
  }

  const affected = walled.flatMap(p => p.rows)

  // "Out of the catalogue" is three different things and only one of them is a
  // decision somebody made. Splitting them is the whole answer: a row rejected
  // for being a search portal did not lose its place because of Cloudflare.
  const DECIDED = new Set(['rejected', 'archived'])
  const decided   = affected.filter(r => DECIDED.has(String(r.pipeline_state)))
  const withheld  = affected.filter(r => !DECIDED.has(String(r.pipeline_state)) && String(r.pipeline_state) !== 'published')
  const desynced  = affected.filter(r => String(r.pipeline_state) === 'published')

  // A rejection that states its own grounds was not made on this verdict. The
  // test is whether the reason says something the verdict does not: a deadline,
  // an audience, a duplicate. A reason that is absent, or that only repeats
  // "the page does not describe this fund", is the case Paul is asking about.
  const ECHOES = /does not describe|different fund|wrong fund|not on (the|that) page|page is about/i
  const unreasoned = decided.filter(r => {
    const why = String(r.rejection_reason ?? r.needs_intervention_reason ?? '').trim()
    return why.length < 25 || ECHOES.test(why)
  })

  console.log('═'.repeat(78))
  console.log('ANSWER')
  console.log('═'.repeat(78))
  console.log(`${affected.length} rows are out of the catalogue on a host that walls us today.`)
  console.log(`They are NOT all removals. Split by what actually happened:\n`)
  console.log(`  rejected / archived  ${String(decided.length).padStart(3)}   a person or script decided`)
  console.log(`  withheld in-queue    ${String(withheld.length).padStart(3)}   never published, still reviewable`)
  console.log(`  published+inactive   ${String(desynced.length).padStart(3)}   the migration-063 desync, not a decision`)
  console.log('')
  console.log(`  OF THE ${decided.length} DECIDED, those whose stated reason does NOT stand on its own: ${unreasoned.length}`)
  console.log('')

  if (unreasoned.length === 0) {
    console.log('  >> Every rejection on a walled host gives its own independent grounds:')
    console.log('     a passed deadline, an out-of-scope audience, a duplicate, a non-funder.')
    console.log('     None rests on "the page does not describe this fund".')
    console.log('')
    console.log('  >> No real funder left the catalogue because of Cloudflare.')
  } else {
    console.log('  >> THESE NEED REVIEW — removed with no grounds beyond the verdict:')
    for (const r of unreasoned) {
      console.log(`     ${String(r.id).slice(0, 8)}  ${String(r.pipeline_state).padEnd(10)} ${String(r.funder ?? '').slice(0, 30).padEnd(30)} ${String(r.title ?? '').slice(0, 38)}`)
      console.log(`               reason on file: ${JSON.stringify(String(r.rejection_reason ?? r.needs_intervention_reason ?? '').slice(0, 160))}`)
    }
  }

  console.log(`\n${'─'.repeat(78)}\nThe ${decided.length} decided rejections, with the grounds each gives:`)
  for (const r of decided) {
    const why = String(r.rejection_reason ?? r.needs_intervention_reason ?? '(none recorded)')
    console.log(`\n  ${String(r.id).slice(0, 8)} ${String(r.pipeline_state)}  ${String(r.funder ?? '').slice(0, 34)} — ${String(r.title ?? '').slice(0, 44)}`)
    console.log(`     ${why.slice(0, 190)}`)
  }

  console.log(`\n${'─'.repeat(78)}`)
  console.log(`Withheld but still in the queue (${withheld.length}) — these ARE the rows the branch frees:`)
  for (const r of withheld) {
    console.log(`  ${String(r.id).slice(0, 8)} ${String(r.pipeline_state).padEnd(26)} ${String(r.funder ?? '').slice(0, 28).padEnd(28)} ${String(r.title ?? '').slice(0, 38)}`)
  }
  console.log(`\nHosts that read fine today: ${fine.length} (${fine.flatMap(p => p.rows).length} rows) — those verdicts stand or fall on their own.`)
}
main()

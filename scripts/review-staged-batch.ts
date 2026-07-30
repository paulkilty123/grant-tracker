// Pre-publication review of a staged research batch.
//
//   npx tsx scripts/review-staged-batch.ts [source]
//
// Checks each staged row for the things that embarrass you AFTER publishing:
// a dead link, a deadline already gone, a fund that is shut, an amount that is
// really a programme pot, an eligibility gate buried in prose, or a row that
// will not surface to anyone because it has no tags.
//
// Re-fetches every URL live. Read-only.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

type Row = {
  id: string; funder: string | null; title: string; apply_url: string | null
  amount_min: number | null; amount_max: number | null
  deadline: string | null; next_open_date: string | null; is_rolling: boolean
  location_tag: string | null; funding_type: string
  impact_sectors: string[] | null; target_beneficiaries: string[] | null
  eligible_structures: string[] | null
  description: string | null
  funder_brief: Record<string, unknown> | null
}

async function probe(url: string): Promise<string> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) })
    return String(r.status)
  } catch (e) {
    const m = (e as Error).message ?? ''
    return /ENOTFOUND|getaddrinfo/i.test(m) ? 'DNS' : /timeout|abort/i.test(m) ? 'timeout' : 'fail'
  }
}

async function main() {
  const source = process.argv[2] ?? 'research_batch'
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  const { data, error } = await db
    .from('scraped_grants')
    .select('id, funder, title, apply_url, amount_min, amount_max, deadline, next_open_date, is_rolling, location_tag, funding_type, impact_sectors, target_beneficiaries, eligible_structures, description, funder_brief')
    .eq('source', source)
    .order('deadline', { nullsFirst: false })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as Row[]

  const today = new Date().toISOString().slice(0, 10)
  const blockers: string[] = []
  const warnings: string[] = []

  console.log(`\nreviewing ${rows.length} rows from source='${source}'\n`)
  console.log(`status  deadline    funder / title`)
  console.log('─'.repeat(92))

  for (const r of rows) {
    const code = r.apply_url ? await probe(r.apply_url) : 'NO URL'
    const issues: string[] = []

    // BLOCKERS — do not publish.
    //
    // 'fail' and 'timeout' MUST be here. They were not, and on 2026-07-29 that
    // let Greater Manchester Mayor's Charity through with a dead domain
    // (gmmayorscharity.org — the real one is .org.uk) while this script
    // reported "zero blockers". A connection failure is not a neutral result:
    // if we cannot reach the page, we cannot publish it. Silence is not success.
    const UNREACHABLE = ['404', '410', 'DNS', 'fail', 'timeout', '0', '500', '502', '503']
    if (!r.apply_url) issues.push('BLOCK: no apply_url')
    else if (UNREACHABLE.includes(code)) issues.push(`BLOCK: cannot reach the page (${code})`)
    if (r.deadline && r.deadline < today) issues.push(`BLOCK: deadline ${r.deadline} already passed`)
    if (!r.funder) issues.push('BLOCK: no funder name')

    // WARNINGS — publish, but knowingly
    if (['403', '406', '429'].includes(code)) issues.push(`warn: ${code} bot-wall, page is probably fine`)
    if (!r.deadline && !r.is_rolling && !r.next_open_date) issues.push('warn: no deadline, not rolling, no reopen date — how does a user know when to apply?')
    if (r.next_open_date) issues.push('watch-list: closed now')
    if ((r.impact_sectors ?? []).length === 0) issues.push('warn: no sectors — will be dropped by the sector gate for every org')
    if ((r.eligible_structures ?? []).length === 0) issues.push('warn: no eligible_structures')
    if (r.amount_min !== null && r.amount_max !== null && r.amount_min > r.amount_max) issues.push('BLOCK: amount_min above amount_max')
    if (r.amount_max !== null && r.amount_max >= 1_000_000) issues.push(`warn: amount_max £${r.amount_max.toLocaleString('en-GB')} — check this is a grant size and not a fund total`)
    // An eligibility gate that only lives in prose is the thing reviewers miss.
    const who = typeof r.funder_brief?.who_can_apply === 'string' ? r.funder_brief.who_can_apply : ''
    if (/nominat|invit|must be (?:a )?(?:member|customer|resident)|50% of|endorsed by|sponsor/i.test(who + ' ' + (r.description ?? ''))) {
      issues.push('warn: conditional gate in the prose — check it survives to the published row')
    }
    if (/income|threshold|expenditure|turnover/i.test(who)) issues.push('info: income cap recorded')

    // BRIEF DEPTH. This check was missing, and its absence is why 27 rows were
    // published with a three-field brief on 2026-07-29: the review confirmed a
    // brief EXISTED and never asked whether it was any good. A real enrichment
    // produces ~14 fields; the "Grant insights" panel reads priorities,
    // typical_award, exclusions and decision_timeline, so a row without them
    // ships with that panel empty.
    // COUNT CONTENT, NOT KEYS. The first version of this counted Object.keys
    // and passed 16 rows whose sixteen fields were every one an empty string —
    // including Edward Holt Trust, whose apply_url pointed at a form-confirmation
    // page so the enricher had nothing to read. A key with "" in it is not a
    // populated brief, and counting keys is how you convince yourself otherwise.
    const brief = r.funder_brief ?? {}
    const populated = Object.values(brief).filter(v => String(v ?? '').trim().length > 0).length
    const core = ['who_can_apply', 'what_they_fund']
      .filter(k => String((brief as Record<string, unknown>)[k] ?? '').trim().length > 0).length
    if (populated === 0) issues.push('BLOCK: funder_brief is empty or absent')
    else if (core < 2) issues.push('BLOCK: brief has no who_can_apply / what_they_fund content — the apply_url is probably the wrong page')
    else if (populated < 8) issues.push(`BLOCK: only ${populated} brief fields have content — enrich before publishing`)

    const hasBlock = issues.some(i => i.startsWith('BLOCK'))
    if (hasBlock) blockers.push(`${r.funder} — ${r.title}`)
    else if (issues.length) warnings.push(`${r.funder} — ${r.title}`)

    const mark = hasBlock ? 'BLOCK ' : issues.length ? 'check ' : '  ok  '
    console.log(`${mark}  ${(r.deadline ?? (r.is_rolling ? 'rolling' : r.next_open_date ? 'closed' : '—')).padEnd(11)} ${(r.funder ?? '?').slice(0, 30).padEnd(30)} ${r.title.slice(0, 40)}`)
    for (const i of issues) console.log(`          ${i}`)
  }

  console.log(`\n${'─'.repeat(92)}`)
  console.log(`clean: ${rows.length - blockers.length - warnings.length}   needs a look: ${warnings.length}   DO NOT PUBLISH: ${blockers.length}`)
  if (blockers.length) { console.log(`\nblockers:`); for (const b of blockers) console.log(`  ${b}`) }
}

main().catch(e => { console.error(e); process.exit(1) })

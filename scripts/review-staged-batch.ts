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
  funder_brief: { who_can_apply?: unknown } | null
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
    .eq('source', source).eq('is_active', false)
    .order('deadline', { nullsFirst: false })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as Row[]

  const today = new Date().toISOString().slice(0, 10)
  const blockers: string[] = []
  const warnings: string[] = []

  console.log(`\nreviewing ${rows.length} staged rows from source='${source}'\n`)
  console.log(`status  deadline    funder / title`)
  console.log('─'.repeat(92))

  for (const r of rows) {
    const code = r.apply_url ? await probe(r.apply_url) : 'NO URL'
    const issues: string[] = []

    // BLOCKERS — do not publish
    if (!r.apply_url) issues.push('BLOCK: no apply_url')
    else if (['404', '410', 'DNS'].includes(code)) issues.push(`BLOCK: link ${code}`)
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

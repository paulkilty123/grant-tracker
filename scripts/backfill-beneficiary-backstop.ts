// Apply the deterministic target_beneficiaries floor to the live catalogue.
//
//   npx tsx scripts/backfill-beneficiary-backstop.ts                  # dry run
//   npx tsx scripts/backfill-beneficiary-backstop.ts --tag homeless   # one tag
//   npx tsx scripts/backfill-beneficiary-backstop.ts --apply
//
// Prints the sentence behind every proposed tag. Counts cannot tell you whether
// an inference is sound, and over-tagging a beneficiary sends an organisation
// to a funder that will reject it — the one cost an applicant cannot recover.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BENEFICIARY_VOCABULARY, ensureExplicitBeneficiaries, stripNonBeneficiarySpans } from '../src/lib/beneficiary-vocabulary'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const SOURCE = 'ai_classifier:beneficiary_backstop:v1'

type Row = {
  id: string
  funder: string | null
  title: string | null
  description: string | null
  target_beneficiaries: string[] | null
  funder_brief: { what_they_fund?: unknown; who_can_apply?: unknown } | null
  field_provenance: Record<string, { pinned?: boolean }> | null
}

/** The sentence a pattern fired on, so a human can judge the inference. */
function evidence(pattern: RegExp, text: string): string {
  for (const s of stripNonBeneficiarySpans(text).split(/(?<=[.!?;])\s+|\n/)) {
    if (pattern.test(s)) return s.trim().replace(/\s+/g, ' ').slice(0, 165)
  }
  return ''
}

async function main() {
  const apply = process.argv.includes('--apply')
  const tagArg = process.argv.indexOf('--tag')
  const onlyTag = tagArg > -1 ? process.argv[tagArg + 1] : null

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  const rows: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('scraped_grants')
      .select('id, funder, title, description, target_beneficiaries, funder_brief, field_provenance')
      .eq('is_active', true)
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []) as unknown as Row[])
    if (!data || data.length < 1000) break
  }

  const changes: { row: Row; before: string[]; after: string[]; added: string[]; why: string[] }[] = []
  const tally = new Map<string, number>()

  for (const r of rows) {
    const brief = r.funder_brief ?? {}
    const src = [
      r.title ?? '',
      r.description ?? '',
      typeof brief.what_they_fund === 'string' ? brief.what_they_fund : '',
      typeof brief.who_can_apply === 'string' ? brief.who_can_apply : '',
    ].join('. ').trim()
    if (!src) continue

    const before = r.target_beneficiaries ?? []
    const after = ensureExplicitBeneficiaries(before, src)
    let added = after.filter(t => !before.includes(t))
    if (onlyTag) added = added.filter(t => t === onlyTag)
    if (!added.length) continue

    const why = added.map(tag => {
      const entry = BENEFICIARY_VOCABULARY.find(e => e.tag === tag)!
      return `${tag}  «${evidence(entry.pattern, src)}»`
    })
    changes.push({ row: r, before, after: onlyTag ? [...before, ...added] : after, added, why })
    for (const t of added) tally.set(t, (tally.get(t) ?? 0) + 1)
  }

  console.log(`\nactive rows scanned: ${rows.length}`)
  console.log(`rows the backstop would widen: ${changes.length}\n`)
  for (const [t, n] of Array.from(tally.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${t}`)
  }

  console.log(`\nevidence (first 25):`)
  for (const c of changes.slice(0, 25)) {
    console.log(`\n${c.row.funder} — ${c.row.title}`)
    console.log(`   ${c.before.join(', ') || '(none)'}  ->  +${c.added.join(', ')}`)
    for (const w of c.why) console.log(`   ${w}`)
  }

  if (!apply) { console.log('\nDRY RUN — nothing written. Re-run with --apply to write.\n'); return }

  let applied = 0, rejected = 0
  for (const c of changes) {
    const result = await mergeGrantUpdate({
      id: c.row.id,
      fields: { target_beneficiaries: c.after },
      source: SOURCE,
      pinned: false,
      db,
    })
    if (result.applied.includes('target_beneficiaries')) applied++
    else rejected++
  }
  console.log(`\napplied ${applied}, rejected ${rejected}\n`)
}

main().catch(e => { console.error(e); process.exit(1) })

// Show the EVIDENCE behind every structure the vocabulary backstop would add.
//
// The backfill dry run reports counts. Counts cannot tell you whether an
// inference is sound — and this change touches 287 of 730 live rows, where
// over-crediting is the worse error: it sends an organisation to a fund that
// will reject it, wasting the one thing an applicant cannot get back.
//
// So this prints, per proposed addition, the vocabulary phrase that fired and
// the sentence it fired on. Read the sentences, not the totals.
//
//   npx tsx scripts/verify-vocabulary-additions.ts                 # all
//   npx tsx scripts/verify-vocabulary-additions.ts cic_guarantee   # one value
//   npx tsx scripts/verify-vocabulary-additions.ts --risk          # over-credit check
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureExplicitStructures, CHARITY_ONLY_RE } from '../src/lib/classify'
import { ELIGIBILITY_VOCABULARY } from '../src/lib/eligibility-vocabulary'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

interface Row {
  id: string
  funder: string | null
  title: string | null
  description: string | null
  location_tag: string | null
  eligible_structures: string[] | null
  funder_brief: { who_can_apply?: unknown } | null
}

/** The sentence a pattern fired on, so the inference can be judged. */
function evidenceFor(pattern: RegExp, text: string): string {
  for (const s of text.split(/(?<=[.!?;])\s+|\n/)) {
    if (pattern.test(s.toLowerCase())) return s.trim().replace(/\s+/g, ' ').slice(0, 170)
  }
  return ''
}

async function main() {
  const only = process.argv.find(a => !a.startsWith('--') && a.includes('_'))
  const riskOnly = process.argv.includes('--risk')

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  const rows: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('scraped_grants')
      .select('id, funder, title, description, location_tag, eligible_structures, funder_brief')
      .eq('is_active', true)
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []) as unknown as Row[])
    if (!data || data.length < 1000) break
  }

  let widened = 0
  let riskCount = 0
  const printed: string[] = []

  for (const r of rows) {
    const current = r.eligible_structures ?? []
    const who = typeof r.funder_brief?.who_can_apply === 'string' ? r.funder_brief.who_can_apply : ''
    const src = `${who} ${r.description ?? ''}`.trim()
    if (!src) continue

    const after = ensureExplicitStructures(current, src, { locationTag: r.location_tag })
    const added = after.filter(s => !current.includes(s))
    if (!added.length) continue
    widened++

    // THE RISK CASE: a fund that restricts to charity status must never gain a
    // non-charity form. classify.ts's negative cues should already return early
    // on these, so a non-zero count here is a real bug, not a judgement call.
    const nonCharityAdded = added.filter(s => !['registered_charity', 'cio', 'scio'].includes(s))
    const isCharityOnly = CHARITY_ONLY_RE.test(src)
    if (isCharityOnly && nonCharityAdded.length) {
      riskCount++
      printed.push(`\n!! OVER-CREDIT  ${r.funder} — ${r.title}\n   adds ${nonCharityAdded.join(', ')} despite: ${evidenceFor(CHARITY_ONLY_RE, src)}`)
      continue
    }
    if (riskOnly) continue
    if (only && !added.includes(only)) continue

    const reasons = ELIGIBILITY_VOCABULARY
      .filter(e => e.pattern.test(src.toLowerCase()) && e.adds.some(a => added.includes(a)))
      .map(e => `${e.phrase}  «${evidenceFor(e.pattern, src)}»`)
    if (!reasons.length) continue // added by a non-vocabulary rule (jurisdiction/breadth)

    printed.push(`\n${r.funder} — ${r.title}\n   + ${added.join(', ')}\n   ${reasons.join('\n   ')}`)
  }

  console.log(printed.slice(0, riskOnly ? 200 : 25).join('\n'))
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`rows widened: ${widened}   shown: ${Math.min(printed.length, riskOnly ? 200 : 25)} of ${printed.length}`)
  console.log(`OVER-CREDIT on charity-only funds: ${riskCount}${riskCount === 0 ? '  (clean)' : '  <-- FIX BEFORE APPLYING'}`)
}

main().catch(e => { console.error(e); process.exit(1) })

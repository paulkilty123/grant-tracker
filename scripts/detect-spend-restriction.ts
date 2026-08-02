// Phase 3 — propose a spend_restriction for every live grant. WRITES NOTHING.
//
//   npx tsx scripts/detect-spend-restriction.ts --limit 25    # sample first
//   npx tsx scripts/detect-spend-restriction.ts               # all live grants
//
// Output: a JSON proposal file + a distribution summary. Paul reviews the
// sample against live funder pages before any of it reaches the database.
//
// ── WHY A MODEL AND NOT A REGEX ──────────────────────────────────────────────
// Measured on the 623 live grants: "capital" appears in what_they_fund on 90
// rows, in exclusions ONLY on 40, and in both on 27. A keyword matcher tags
// those 40 exactly backwards — they are funders explicitly refusing capital —
// and has no answer for the 27. That is 43% of the capital-signalling rows
// wrong or unresolved, which is why this reads the fields separately and asks
// what the funder is CLAIMING rather than which words appear.
//
// Every proposal carries the sentence it came from. A tag whose quote does not
// support it is the thing review is looking for, and it cannot be checked if
// the quote was never captured.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
}

const LIMIT = (() => {
  const i = process.argv.indexOf('--limit')
  return i > -1 ? Number(process.argv[i + 1]) : null
})()

const SCHEMA = {
  type: 'object',
  properties: {
    // "none" rather than a nullable enum: structured outputs reject an enum
    // whose members span a union type, and an explicit sentinel makes "we read
    // it and it does not say" a deliberate answer rather than a missing field.
    spend_types: {
      type: 'array',
      items: { type: 'string', enum: ['capital', 'revenue'] },
      description: 'What KIND of cost. Both when the funder covers both. Empty when it never says.',
    },
    spend_restriction: {
      type: 'string',
      enum: ['restricted', 'unrestricted', 'none'],
      description: 'How tied to a purpose the REVENUE money is. "none" when the funder never says.',
    },
    quote: {
      type: 'string',
      description: 'Verbatim sentence from the supplied fields that supports the value. Empty string when the value is none.',
    },
    confidence: { type: 'string', enum: ['high', 'med', 'low'] },
    reason: { type: 'string', description: 'One short sentence. Required when confidence is low.' },
  },
  required: ['spend_types', 'spend_restriction', 'quote', 'confidence', 'reason'],
  additionalProperties: false,
} as const

const SYSTEM = `You classify UK grant funds on TWO INDEPENDENT questions.

1. spend_types — what KIND of cost does the money cover?
     capital   equipment, building work, vehicles, one-off physical items
     revenue   day-to-day running: staff, delivery, activities, overheads
   Answer BOTH when the funder covers both — 57 of our 623 live grants do,
   and "supports both Capital and Revenue applications" is exactly that.
   Empty array when the funder never says.

2. spend_restriction — how tied to a purpose is the REVENUE money?
     restricted    tied to a specific project or programme
     unrestricted  core costs, salaries, "spend as you see fit"
     none          the funder never says

These are ORTHOGONAL. A capital grant for a named project is
{capital} + restricted. An unrestricted pot usable for anything is
{capital,revenue} + unrestricted. Do not let one answer drive the other.

THE TRAP THIS EXISTS TO AVOID. You are given "what they fund" and "what they do
NOT fund" as separate fields. The word "capital" appearing in the exclusions
means the funder REFUSES capital — the opposite of the capital tag. On the live
catalogue, 40 funds mention capital only in their exclusions. Read what the
funder is claiming, not which words are present.

A fund that covers equipment but excludes building works still has capital in
spend_types — it covers some capital costs, which is what a charity needing
equipment money is filtering for.

AN EMPTY ARRAY AND "none" ARE REAL AND EXPECTED ANSWERS, not a failure. If the text describes who
can apply and how much, but never what the money covers, leave them empty. Do not
default to restricted because it is the common case — a guess is indistinguishable
from a reading, and the whole point of this pass is that the difference is
recoverable later.

The quote must be verbatim from the fields supplied. Never paraphrase, never
invent. If nothing supports a value, the value is none and the quote is empty.`

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  let q = db.from('scraped_grants')
    .select('id, title, funder, description, funder_brief, spend_restriction')
    .eq('is_active', true).neq('url_status', 'dead').eq('funding_type', 'grant')
    .order('funder', { ascending: true })
  if (LIMIT) q = q.limit(LIMIT)

  const { data, error } = await q
  if (error) { console.error('read failed:', error.message); process.exit(1) }
  const rows = data ?? []
  console.log(`${rows.length} live grants to classify\n`)

  const client = new Anthropic()
  const out: Record<string, unknown>[] = []
  let done = 0

  // Small concurrency: this is a proposal run, not a latency-sensitive path,
  // and a modest pool keeps us clear of rate limits without a retry harness.
  const POOL = 4
  const queue = [...rows]

  async function worker() {
    for (;;) {
      const r = queue.shift()
      if (!r) return
      const b = (r.funder_brief ?? {}) as Record<string, string>
      const fields = [
        ['What they fund', b.what_they_fund],
        ['What they do NOT fund', b.exclusions],
        ['Typical award', b.typical_award],
        ['How to apply', b.how_to_apply],
        ['Description', r.description],
      ].filter(([, v]) => v && String(v).trim()).map(([k, v]) => `${k}: ${v}`).join('\n\n')

      if (!fields.trim()) {
        out.push({ id: r.id, funder: r.funder, title: r.title, spend_types: [], spend_restriction: 'none', quote: '', confidence: 'high', reason: 'no text to read' })
        done++; continue
      }

      try {
        const res = await client.messages.create({
          model: 'claude-opus-4-8',
          max_tokens: 1000,
          system: SYSTEM,
          output_config: { format: { type: 'json_schema', schema: SCHEMA }, effort: 'high' },
          messages: [{ role: 'user', content: `Fund: ${r.title}\nFunder: ${r.funder}\n\n${fields}` }],
        })
        const text = res.content.find(c => c.type === 'text')
        // stop_reason is checked because a truncated JSON body parses as a
        // failure here rather than silently becoming a confident-looking tag.
        if (res.stop_reason === 'max_tokens') throw new Error('truncated (max_tokens)')
        const parsed = JSON.parse(text && text.type === 'text' ? text.text : '{}')
        out.push({ id: r.id, funder: r.funder, title: r.title, current: r.spend_restriction, ...parsed })
      } catch (e) {
        out.push({ id: r.id, funder: r.funder, title: r.title,
                   error: e instanceof Error ? e.message : String(e) })
      }
      done++
      if (done % 10 === 0) process.stdout.write(`  ${done}/${rows.length}\r`)
    }
  }

  await Promise.all(Array.from({ length: POOL }, worker))

  const path = resolve(HERE, '..', 'spend-restriction-proposal.json')
  writeFileSync(path, JSON.stringify(out, null, 2))

  const tally = new Map<string, number>()
  for (const o of out) {
    const types = Array.isArray(o.spend_types) && o.spend_types.length ? (o.spend_types as string[]).join('+') : '—'
    const k = o.error ? 'ERROR' : `${types} / ${o.spend_restriction}`
    tally.set(k, (tally.get(k) ?? 0) + 1)
  }
  console.log('\n── proposed distribution ──')
  for (const [k, n] of Array.from(tally.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${k}  (${Math.round(n / out.length * 100)}%)`)
  }
  const low = out.filter(o => o.confidence === 'low').length
  console.log(`\n  ${low} low-confidence`)
  console.log(`\nWROTE NOTHING TO THE DATABASE. Proposal: ${path}`)
}

main().catch(e => { console.error(e); process.exit(1) })

// Publish a reviewed staged batch.
//
//   npx tsx scripts/activate-staged-batch.ts [source]           # dry run
//   npx tsx scripts/activate-staged-batch.ts [source] --apply
//
// Sets is_active=true AND pipeline_state='published' together. Those two must
// move as one: 109 rows in this catalogue already sit published-but-inactive
// because something moved one and not the other, and the admin queues cannot
// see them. transitionPipelineState() derives the state so this script cannot
// invent a different answer from the rest of the app.
//
// Refuses to publish a row that fails the checks review-staged-batch.ts runs,
// so a broken link cannot go live just because someone skipped the review.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transitionPipelineState, type PipelineState } from '../src/lib/grant-merge'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

type Row = {
  id: string; funder: string | null; title: string; apply_url: string | null
  deadline: string | null; pipeline_state: PipelineState
}

async function main() {
  const source = process.argv.find(a => !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1]) ?? 'research_batch'
  const apply = process.argv.includes('--apply')

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  const { data, error } = await db
    .from('scraped_grants')
    .select('id, funder, title, apply_url, deadline, pipeline_state')
    .eq('source', source).eq('is_active', false)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as Row[]

  const today = new Date().toISOString().slice(0, 10)
  const publish: Row[] = []
  const held: string[] = []

  for (const r of rows) {
    // Same bar as the review script — a row that would have been blocked there
    // must not slip through here.
    if (!r.apply_url) { held.push(`${r.funder} — no apply_url`); continue }
    if (!r.funder)    { held.push(`${r.title} — no funder name`); continue }
    if (r.deadline && r.deadline < today) { held.push(`${r.funder} — deadline ${r.deadline} has passed`); continue }
    publish.push(r)
  }

  console.log(`\nsource='${source}'   staged: ${rows.length}   to publish: ${publish.length}   held back: ${held.length}\n`)
  for (const h of held) console.log(`  HELD  ${h}`)
  for (const p of publish) console.log(`  +     ${(p.funder ?? '').slice(0, 34).padEnd(34)} ${p.title.slice(0, 44)}`)

  if (!apply) { console.log('\nDRY RUN — nothing written.\n'); return }

  let ok = 0, failed = 0
  for (const r of publish) {
    const nextState = transitionPipelineState({
      current: r.pipeline_state,
      source: 'admin:activate-research-batch',
      fields: { is_active: true },
      anyTrackedWritten: false,
    })
    const { error: e } = await db
      .from('scraped_grants')
      .update({ is_active: true, pipeline_state: nextState })
      .eq('id', r.id)
    if (e) { failed++; console.error(`  FAILED ${r.funder}: ${e.message}`) }
    else ok++
  }
  console.log(`\npublished ${ok}, failed ${failed}\n`)
}

main().catch(e => { console.error(e); process.exit(1) })

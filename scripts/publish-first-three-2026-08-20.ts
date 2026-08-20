// The first three funds published from the queue, by name, after checking.
//
// 59 queue rows carry no blocking reason and auto-publish has been evaluating
// them in dry-run mode since it shipped. Paul asked for a batch to check rather
// than arming the gate, and checking it was worth doing: the first selection
// offered him a £609,957 police-commissioner service contract that scored 7/7 on
// completeness, and of the ten proposed only three survived a second look.
//
// These three have no field their funder's page disputes, a page the engine read
// successfully, and a brief written this year:
//
//   Arts Council of Wales — International Opportunities Fund   up to £7,500
//   Community Enterprise Fund (Social Investment Business)     up to £25,000
//   KFC Youth Foundation — Community Grants Programme          up to £10,000
//
// Named individually rather than selected by a rule, because this is the first
// time anything has gone live from the queue and the point is that a person
// looked at each one.
//
//   npx tsx --env-file=.env.local scripts/publish-first-three-2026-08-20.ts --dry
//   npx tsx --env-file=.env.local scripts/publish-first-three-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { deriveReviewReasons, type ReviewRow } from '../src/lib/admin/review-reasons'
import { gateDecision } from '../src/lib/admin/publish-gate'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:first-publish-2026-08-20'

const TITLES = [
  'Arts Council of Wales — International Opportunities Fund',
  'Community Enterprise Fund',
  'KFC Youth Foundation - Community Grants Programme',
]

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await db.from('scraped_grants').select('*').in('title', TITLES)
  if (error) { console.error('query failed:', error.message); process.exit(1) }
  const rows = (data ?? []) as unknown as (ReviewRow & { pipeline_state: string; is_active: boolean | null; funder: string | null; apply_url: string | null })[]

  if (rows.length !== TITLES.length) {
    console.error(`ABORT: matched ${rows.length} rows, expected ${TITLES.length}. A zero or a short match is what a wrong title returns.`)
    process.exit(1)
  }

  // Re-run the gate at the moment of publishing rather than trusting the earlier
  // pass. Between the check and the write, other work today touched these rows.
  for (const r of rows) {
    const gate = gateDecision(r, deriveReviewReasons(r, today))
    console.log(`\n${r.title}`)
    console.log(`   ${r.funder ?? '—'}`)
    console.log(`   ${r.apply_url}`)
    console.log(`   now: ${r.pipeline_state}, ${r.is_active ? 'live' : 'not live'}`)
    console.log(`   gate: ${gate.blocking.length ? 'BLOCKING — ' + gate.blocking.map(b => b.code).join(', ') : 'nothing blocking'}`)
    if (gate.blocking.length) { console.error('\nABORT: a row picked up a blocking reason since the check.'); process.exit(1) }
  }

  if (DRY) { console.log('\nDRY RUN — nothing published.\n'); return }

  let published = 0
  for (const r of rows) {
    const res = await mergeGrantUpdate({
      id: r.id, fields: { pipeline_state: 'published', is_active: true }, source: SOURCE, db,
      citations: { pipeline_state: { snippet:
        `First funds published from the review queue, ${today}. Hand-checked: no field the funder's page disputes, `
        + 'page read successfully by the verification engine, brief written this year.', confidence: 'high' } },
    })
    if (res.applied.length) published++
    if (res.rejected?.length) console.log(`   REFUSED ${r.title}: ${res.rejected.map(x => `${x.field} (${x.reason})`).join('; ')}`)
  }

  const { data: after } = await db.from('scraped_grants')
    .select('title, pipeline_state, is_active').in('title', TITLES)
  console.log(`\npublished: ${published}/${rows.length}`)
  for (const a of (after ?? []) as { title: string; pipeline_state: string; is_active: boolean }[]) {
    console.log(`   ${a.title.slice(0, 52).padEnd(54)} ${a.pipeline_state}  ${a.is_active ? 'LIVE' : 'not live'}`)
  }
  const notLive = (after ?? []).filter(a => !(a as { is_active: boolean }).is_active)
  if (notLive.length) console.log(`\n${notLive.length} did not go live — investigate before telling Paul it worked.`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
